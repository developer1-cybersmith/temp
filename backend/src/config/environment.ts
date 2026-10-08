import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export const config = {
  PORT: parseInt(process.env.PORT || '3005', 10),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3004',
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET || 'catalog-images',

  // AI — GitHub Models (RETIRED July 30, 2026 — GITHUB_PAT kept only so old .env files don't break boot)
  GITHUB_PAT: process.env.GITHUB_PAT || '',

  // AI — Gemini, vision only (car-photo identification) — Groq has no vision model.
  // Text generation runs on Groq instead: Gemini's free tier (20 requests/day/model) is
  // too tight to also carry chat volume.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',

  // AI — Jina, embeddings only (RAG/catalog search) — same reasoning as above.
  JINA_API_KEY: process.env.JINA_API_KEY || '',

  // WhatsApp Cloud API (Meta)
  META_APP_SECRET: process.env.META_APP_SECRET || '',
  META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
  META_PHONE_NUMBER_ID: process.env.META_PHONE_NUMBER_ID || '',
  META_SYSTEM_USER_TOKEN: process.env.META_SYSTEM_USER_TOKEN || '',
  META_WABA_ID: process.env.META_WABA_ID || '',

  // Vapi Voice Agent
  VAPI_API_KEY: process.env.VAPI_API_KEY || '',
  VAPI_PHONE_NUMBER_ID: process.env.VAPI_PHONE_NUMBER_ID || '',
  VAPI_ASSISTANT_ID: process.env.VAPI_ASSISTANT_ID || '',
  VAPI_WEBHOOK_SECRET: process.env.VAPI_WEBHOOK_SECRET || '',

  // Voice Transcription (Groq primary, OpenAI fallback)
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // Google Sheets sync (service account)
  GOOGLE_SA_EMAIL: process.env.GOOGLE_SA_EMAIL || '',
  GOOGLE_SA_KEY: (process.env.GOOGLE_SA_KEY || '').replace(/\\n/g, '\n'),
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID || '',
  GOOGLE_SHEET_NAME: process.env.GOOGLE_SHEET_NAME || 'Sheet1',

  // Owner/Admin access allowlist
  OWNER_EMAILS: (process.env.OWNER_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean),
};

// Validate critical env vars
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'JINA_API_KEY'];
for (const key of required) {
  if (!config[key as keyof typeof config]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}
