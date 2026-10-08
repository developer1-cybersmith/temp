import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/environment.js';

export interface UploadedCatalogImage {
  url: string;
  caption?: string;
  order: number;
  storagePath: string;
}

const IMAGE_MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

let bucketReady = false;
let bucketCheckPromise: Promise<void> | null = null;

function sanitizeCaption(filename: string): string | undefined {
  const label = filename.replace(/\.[^.]+$/, '').replace(/[\s_-]+/g, ' ').trim();
  return label || undefined;
}

function resolveExtension(filename: string, mimetype: string): string {
  const fromName = extname(filename);
  if (fromName) return fromName;
  return IMAGE_MIME_EXTENSION[mimetype.toLowerCase()] || '';
}

export async function ensureCatalogImageBucket(supabase: SupabaseClient): Promise<void> {
  if (bucketReady) return;

  if (!bucketCheckPromise) {
    bucketCheckPromise = (async () => {
      try {
        const { data, error } = await supabase.storage.listBuckets();
        if (error) {
          console.warn('⚠️ Unable to inspect Supabase storage buckets:', error.message);
          return;
        }

        const bucketExists = (data || []).some(bucket => bucket.name === config.SUPABASE_STORAGE_BUCKET);
        if (!bucketExists) {
          const { error: createError } = await supabase.storage.createBucket(config.SUPABASE_STORAGE_BUCKET, {
            public: true,
          });

          if (createError) {
            console.warn(`⚠️ Could not create storage bucket ${config.SUPABASE_STORAGE_BUCKET}:`, createError.message);
            return;
          }
        }

        bucketReady = true;
      } catch (err: any) {
        console.warn('⚠️ Failed to prepare catalog image bucket:', err?.message || err);
      }
    })().finally(() => {
      bucketCheckPromise = null;
    });
  }

  await bucketCheckPromise;
}

export async function uploadCatalogImages(
  supabase: SupabaseClient,
  userId: string,
  files: AsyncIterable<MultipartFile>
): Promise<UploadedCatalogImage[]> {
  await ensureCatalogImageBucket(supabase);

  const uploadedImages: UploadedCatalogImage[] = [];
  let order = 0;

  for await (const file of files) {
    if (!file.mimetype?.startsWith('image/')) {
      throw new Error(`Unsupported file type for ${file.filename}`);
    }

    const buffer = await file.toBuffer();
    const extension = resolveExtension(file.filename, file.mimetype);
    const storagePath = `${userId}/${Date.now()}-${randomUUID()}${extension}`;

    const { error } = await supabase.storage
      .from(config.SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload ${file.filename}: ${error.message}`);
    }

    const { data } = supabase.storage.from(config.SUPABASE_STORAGE_BUCKET).getPublicUrl(storagePath);
    uploadedImages.push({
      url: data.publicUrl,
      caption: sanitizeCaption(file.filename),
      order: order++,
      storagePath,
    });
  }

  return uploadedImages;
}