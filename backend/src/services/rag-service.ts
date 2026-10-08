import { OpenAI } from 'openai';
import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/environment.js';
import crypto from 'crypto';

// Embeddings run on Jina, not Gemini — Gemini's free-tier quota (20 requests/day/model)
// is too tight to carry both chat and embedding traffic; Jina's free tier (1M tokens/month)
// has far more headroom, and this endpoint is OpenAI-compatible too.
const openai = new OpenAI({
  baseURL: 'https://api.jina.ai/v1',
  apiKey: config.JINA_API_KEY,
});

const EMBEDDING_MODEL = 'jina-embeddings-v4';
// wb_knowledge_base/wb_catalog_items columns are VECTOR(1536) (sized for OpenAI's
// text-embedding-3-small). Jina v4's native output is 2048-dim but supports a
// `dimensions` param to truncate to match, so no DB migration is needed.
const EMBEDDING_DIMENSIONS = 1536;
const CHUNK_SIZE = 200;       // words per chunk (was 500 — too large, reduces precision)
const CHUNK_OVERLAP = 40;     // 20% overlap (was 50/500 = 10% — too little context carryover)
const SIMILARITY_THRESHOLD = 0.4;  // was 0.1 — way too low, returned noise
const MAX_RESULTS = 5;

export class RagService {
  constructor(private supabase: SupabaseClient) {}

  /** Search knowledge base for relevant chunks via pgvector */
  async searchKnowledge(userId: string, queryText: string, topK = MAX_RESULTS): Promise<string[]> {
    try {
      const queryEmbedding = await this.embedSingle(queryText);
      if (!queryEmbedding) return [];

      const { data, error } = await this.supabase.rpc('wb_match_knowledge', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: topK,
        p_user_id: userId,
      });

      if (error) {
        console.error('❌ Knowledge search error:', error);
        return [];
      }

      return (data || []).map((row: any) => row.content);
    } catch (err) {
      console.error('❌ RAG search failed:', err);
      return [];
    }
  }

  /** Chunk text, batch embed all chunks, and store in wb_knowledge_base */
  async embedAndStore(
    userId: string,
    text: string,
    sourceFile?: string
  ): Promise<number> {
    const chunks = this.chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);
    if (chunks.length === 0) return 0;

    // Deduplicate: compute hash for each chunk and skip existing ones
    const newChunks = await this.filterDuplicates(userId, chunks);
    if (newChunks.length === 0) {
      console.log('⚠️ All chunks already exist in knowledge base, skipping.');
      return 0;
    }

    // Batch embed all chunks in a single API call (much faster than sequential)
    const embeddings = await this.embedBatch(newChunks);
    if (!embeddings || embeddings.length !== newChunks.length) {
      console.error('❌ Batch embedding failed or returned mismatched count');
      return 0;
    }

    // Batch insert all chunks + embeddings
    const rows = newChunks.map((chunk, i) => ({
      user_id: userId,
      content: chunk,
      embedding: JSON.stringify(embeddings[i]),
      source_file: sourceFile || null,
      content_hash: this.hashContent(chunk),
    }));

    let stored = 0;
    // Insert in batches of 50 to avoid Supabase payload limits
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await this.supabase.from('wb_knowledge_base').insert(batch);
      if (error) {
        console.error(`❌ Failed to insert chunk batch ${i}-${i + batch.length}:`, error);
      } else {
        stored += batch.length;
      }
    }

    console.log(`✅ Stored ${stored}/${newChunks.length} knowledge chunks (${chunks.length - newChunks.length} duplicates skipped)`);
    return stored;
  }

  /** Embed a single text string */
  private async embedSingle(text: string): Promise<number[] | null> {
    try {
      const result = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      });
      return result.data[0].embedding;
    } catch (err) {
      console.error('❌ Single embedding failed:', err);
      return null;
    }
  }

  /** Batch embed multiple texts in a single API call */
  async embedBatch(texts: string[]): Promise<number[][] | null> {
    if (texts.length === 0) return [];

    try {
      // OpenAI supports batch embedding — all texts in one call
      // Max ~8000 tokens per batch. For 200-word chunks (~250 tokens each),
      // we can safely do ~30 per call. Split if needed.
      const allEmbeddings: number[][] = [];
      const BATCH_SIZE = 30;

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const result = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
        });

        // Defends against a missing `index` on any future provider swap (seen on
        // Gemini's compat layer, which omits it for position 0) — NaN from `undefined - n`
        // would otherwise leave sort order unspecified.
        const sorted = result.data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        allEmbeddings.push(...sorted.map(d => d.embedding));
      }

      return allEmbeddings;
    } catch (err) {
      console.error('❌ Batch embedding failed:', err);
      return null;
    }
  }

  /** Filter out chunks that already exist in the knowledge base (by content hash) */
  private async filterDuplicates(userId: string, chunks: string[]): Promise<string[]> {
    const hashes = chunks.map(c => this.hashContent(c));

    const { data: existing } = await this.supabase
      .from('wb_knowledge_base')
      .select('content_hash')
      .eq('user_id', userId)
      .in('content_hash', hashes);

    const existingHashes = new Set((existing || []).map((r: any) => r.content_hash));
    return chunks.filter(c => !existingHashes.has(this.hashContent(c)));
  }

  /** SHA256 hash of content for deduplication */
  private hashContent(text: string): string {
    return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);
  }

  /**
   * Split text into overlapping chunks with sentence awareness.
   * Tries to break at sentence boundaries when possible.
   */
  chunkText(text: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];

    // If text is smaller than one chunk, return as-is
    if (words.length <= chunkSize) {
      const single = words.join(' ').trim();
      return single.length > 20 ? [single] : [];
    }

    const chunks: string[] = [];
    const step = chunkSize - overlap;

    for (let i = 0; i < words.length; i += step) {
      let end = Math.min(i + chunkSize, words.length);
      let chunk = words.slice(i, end).join(' ');

      // Try to end at a sentence boundary (., !, ?) for cleaner chunks
      if (end < words.length) {
        const lastSentenceEnd = chunk.search(/[.!?]\s+\S+$/);
        if (lastSentenceEnd > chunk.length * 0.6) {
          // Found a sentence boundary in the last 40% of the chunk
          const trimmedChunk = chunk.slice(0, chunk.indexOf(' ', lastSentenceEnd + 1)).trim();
          if (trimmedChunk.length > 20) {
            chunk = trimmedChunk;
          }
        }
      }

      chunk = chunk.trim();
      if (chunk.length > 20) {
        chunks.push(chunk);
      }

      // If we've reached the end, stop
      if (end >= words.length) break;
    }

    return chunks;
  }
}
