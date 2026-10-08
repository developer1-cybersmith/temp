import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import {
  transcribeVoiceNote,
  assessTranscriptionQuality,
  NEUTRAL_PROMPT,
} from '../services/voice-transcription-service.js';
import { extractWalkInFromTranscript } from '../services/ai-router.js';

const MIN_AUDIO_BYTES = 4_000;
const MIN_TRANSCRIPT_CHARS = 4;
const MAX_TRANSCRIPT_CHARS = 5_000;

/**
 * Known Whisper hallucination patterns. The model learned these from YouTube
 * subtitle training data and emits them when given silence/noise.
 */
const HALLUCINATION_PHRASES = new Set([
  // English (YouTube subtitle artifacts)
  'thank you', 'thank you.', 'thanks for watching', 'thanks for watching.',
  'thanks for watching!', 'please subscribe', 'please subscribe.',
  'subtitles by the amara.org community', 'subscribe to my channel',
  'bye', 'bye.', 'you', '.', '♪', '[music]', '[applause]', '[silence]',
  // Hindi
  'धन्यवाद।', 'धन्यवाद', 'देखने के लिए धन्यवाद', 'सब्सक्राइब करें',
  'नमस्ते।', 'जय हिंद।',
  // Hinglish romanized
  'dhanyavaad.', 'dhanyavaad', 'shukriya.', 'namaste.', 'subscribe karein.',
]);

function detectTextHallucination(transcript: string, audioBytes: number): {
  isHallucination: boolean;
  reason?: string;
} {
  const t = transcript.trim().toLowerCase();
  if (!t) return { isHallucination: true, reason: 'empty' };

  // 1. Punctuation / symbol-only
  if (/^[.,!?…\s♪♫\-_]*$/.test(t)) {
    return { isHallucination: true, reason: 'punctuation_only' };
  }

  // 2. Exact phrase blacklist
  if (HALLUCINATION_PHRASES.has(t)) {
    return { isHallucination: true, reason: `blacklist:${t.slice(0, 40)}` };
  }

  // 3. Substring of common boilerplate when transcript is short
  if (t.length < 60) {
    for (const p of HALLUCINATION_PHRASES) {
      if (p.length >= 8 && t.includes(p)) {
        return { isHallucination: true, reason: `contains_blacklist:${p}` };
      }
    }
  }

  // 4. Repetition loop: same word repeated ≥ 4x
  if (/(\b\S+\b)(?:\s+\1){3,}/i.test(transcript)) {
    return { isHallucination: true, reason: 'repetition_loop' };
  }

  // 5. Low lexical diversity
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 8) {
    const unique = new Set(words);
    if (unique.size / words.length < 0.35) {
      return { isHallucination: true, reason: 'low_lexical_diversity' };
    }
  }

  // 6. Suspiciously short text from a long recording
  // opus@~32kbps ≈ 4KB/sec; >5s of audio yielding <10 chars = silence
  const approxSec = audioBytes / 4000;
  if (approxSec > 5 && transcript.trim().length < 10) {
    return { isHallucination: true, reason: 'short_text_long_audio' };
  }

  return { isHallucination: false };
}

export const voiceRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  await server.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  // POST /api/voice/extract-walkin
  server.post('/extract-walkin', async (request, reply) => {
    try {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          error: 'No audio uploaded. Tap the mic and speak.',
          code: 'NO_FILE',
        });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      console.log(`[voice/extract-walkin] received ${buffer.length} bytes (${file.mimetype})`);

      if (buffer.length === 0) {
        return reply.status(400).send({
          error: 'No audio recorded. Please tap the mic and speak.',
          code: 'EMPTY_AUDIO',
        });
      }

      if (buffer.length < MIN_AUDIO_BYTES) {
        return reply.status(400).send({
          error: 'Recording too short. Please speak for at least 2 seconds.',
          code: 'TOO_SHORT',
          bytes: buffer.length,
        });
      }

      // Use NEUTRAL prompt so Whisper doesn't hallucinate car words.
      const result = await transcribeVoiceNote(buffer, { prompt: NEUTRAL_PROMPT });
      const cleaned = (result.text || '').trim();

      // ── Defense layer 1: empty / too-short transcript ────────────────
      if (cleaned.length < MIN_TRANSCRIPT_CHARS) {
        return reply.status(200).send({
          transcript: cleaned,
          provider: result.provider,
          extracted: { items_mentioned: [], notes: '' },
          quality: 'too_short',
        });
      }

      if (cleaned.length > MAX_TRANSCRIPT_CHARS) {
        return reply.status(400).send({
          error: 'Recording too long. Please keep it under 30 seconds.',
          code: 'TOO_LONG',
        });
      }

      // ── Defense layer 2: Whisper segment metadata (no_speech_prob etc) ──
      const segmentQuality = assessTranscriptionQuality(result);
      if (!segmentQuality.ok) {
        console.warn('[voice/extract-walkin] segment-quality reject:', segmentQuality.reasons);
        return reply.status(200).send({
          transcript: cleaned,
          provider: result.provider,
          extracted: { items_mentioned: [], notes: '' },
          quality: 'low_confidence',
          debug: segmentQuality.reasons,
        });
      }

      // ── Defense layer 3: text-pattern hallucination blacklist ─────────
      const halluc = detectTextHallucination(cleaned, buffer.length);
      if (halluc.isHallucination) {
        console.warn('[voice/extract-walkin] text-pattern reject:', halluc.reason);
        return reply.status(200).send({
          transcript: cleaned,
          provider: result.provider,
          extracted: { items_mentioned: [], notes: '' },
          quality: 'hallucination',
          debug: halluc.reason,
        });
      }

      // ── Layer 4: GPT extraction ──────────────────────────────────────
      const extracted = await extractWalkInFromTranscript(cleaned);
      const hasUsefulData = !!(
        extracted.customer_name ||
        extracted.customer_phone ||
        extracted.items_mentioned.length > 0 ||
        extracted.outcome ||
        extracted.notes
      );

      return reply.send({
        transcript: cleaned,
        provider: result.provider,
        extracted,
        quality: hasUsefulData ? 'good' : 'unclear',
      });
    } catch (err: any) {
      console.error('POST /voice/extract-walkin error:', err);
      return reply.status(500).send({
        error: err.message || 'Voice processing failed. Please try again.',
        code: 'INTERNAL',
      });
    }
  });
};
