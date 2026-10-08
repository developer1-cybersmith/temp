import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'whatsapp-media';
let bucketReady = false;
let bucketCheckPromise: Promise<void> | null = null;

async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  if (bucketReady) return;
  if (!bucketCheckPromise) {
    bucketCheckPromise = (async () => {
      try {
        const { data, error } = await supabase.storage.listBuckets();
        if (error) {
          console.warn('⚠️ [media] Unable to inspect storage buckets:', error.message);
          return;
        }
        const exists = (data || []).some(b => b.name === BUCKET);
        if (!exists) {
          const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
          if (createErr) {
            console.warn(`⚠️ [media] Could not create bucket ${BUCKET}:`, createErr.message);
            return;
          }
          console.log(`✅ [media] Created storage bucket: ${BUCKET}`);
        }
        bucketReady = true;
      } catch (err: any) {
        console.warn('⚠️ [media] Failed to prepare bucket:', err?.message || err);
      }
    })().finally(() => {
      bucketCheckPromise = null;
    });
  }
  await bucketCheckPromise;
}

function extFromMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp3') || mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('m4a') || mime.includes('mp4')) return 'm4a';
  return 'bin';
}

export async function uploadIncomingMedia(
  supabase: SupabaseClient,
  userId: string,
  buffer: Buffer,
  mimetype: string,
  kind: 'image' | 'voice' | 'audio',
): Promise<string | null> {
  try {
    await ensureBucket(supabase);
    const ext = extFromMime(mimetype);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const path = `${userId}/${kind}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mimetype, upsert: false });

    if (uploadError) {
      console.warn(`⚠️ [media] Upload failed (${kind}):`, uploadError.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (err: any) {
    console.warn(`⚠️ [media] Unexpected upload error:`, err?.message || err);
    return null;
  }
}
