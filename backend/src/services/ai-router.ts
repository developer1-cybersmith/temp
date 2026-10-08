import OpenAI from 'openai';
import { config } from '../config/environment.js';
import type { BaseDomain } from '../domains/types.js';
import { getDomain } from '../domains/domain-router.js';

// Text (analysis/reply/summary/follow-up/walk-in extraction) runs on Groq — free tier
// has real headroom, unlike Gemini's 20-requests/day/model cap. Groq has no vision model,
// so car-photo identification stays on Gemini specifically (see identifyCarFromImage).
const openai = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: config.GROQ_API_KEY,
});

const geminiClient = new OpenAI({
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: config.GEMINI_API_KEY,
});

const MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
const VISION_MODEL = process.env.AI_VISION_MODEL || 'gemini-flash-latest';
// Gemini's OpenAI-compat layer runs "thinking" by default, which silently eats into
// max_tokens and can truncate JSON responses before any visible content is emitted.
// Groq rejects this field outright, so it's only ever passed to geminiClient calls.
const GEMINI_REASONING_EFFORT = 'low';
const ANALYSIS_TIMEOUT_MS = 20000;
const REPLY_TIMEOUT_MS = 25000;
const SUMMARY_TIMEOUT_MS = 12000;
const FOLLOW_UP_TIMEOUT_MS = 12000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/** Structured analysis result from AI */
export interface AnalysisResult {
  intent: string;
  lead_score: string;
  confidence: number;
  tasks: { description: string; priority: string; due_date: string | null }[];
  appointment: { service: string | null; proposed_time_iso: string | null } | null;
  should_auto_reply: boolean;
  escalation_reason: string | null;
  language_detected: string;
  summary_update: string;
  entities: {
    product_name: string | null;
    category: string | null;
    brand: string | null;
    price_min: number | null;
    price_max: number | null;
    attributes: Record<string, string>;
  } | null;
  query_type: 'structured' | 'semantic' | 'general';
  /** Sentiment analysis — polarity (-1 to 1) and dominant emotion */
  sentiment?: {
    polarity: number;
    emotion: string;
  };
}

/** Analyze a customer message — extract intent, lead score, tasks, entities */
export async function analyzeMessage(
  customerMessage: string,
  conversationHistory: string[],
  businessProfile: { business_name: string; industry: string; services: string[] },
  domain?: BaseDomain
): Promise<AnalysisResult> {
  const d = domain || getDomain(null);

  // Provide current date/time so AI can resolve "kal", "tomorrow", "next week", etc.
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const currentTime = now.toTimeString().split(' ')[0].slice(0, 5);
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
  const tomorrowDate = new Date(now.getTime() + 86400000).toISOString().split('T')[0];

  const prompt = d.analysisPrompt.buildSystemPrompt({
    currentDate,
    currentTime,
    dayOfWeek,
    tomorrowDate,
    businessName: businessProfile.business_name || 'My Business',
    industry: businessProfile.industry || 'General Services',
    services: businessProfile.services?.join(', ') || 'Various services',
    conversationHistory: conversationHistory.length > 0
      ? conversationHistory.slice(-d.limits.historyLlmLimit).join('\n')
      : 'No previous messages.',
    customerMessage,
  });

  try {
    const response = await withTimeout(
      openai.chat.completions.create({
        model: MODEL,
        // Gemini's OpenAI-compat layer rejects a request with no non-system turn
        // ("contents is not specified"), so the customer message is repeated as a user turn.
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: customerMessage },
        ],
        response_format: { type: 'json_object' },
        ...d.llmParams.analysis,
      }),
      ANALYSIS_TIMEOUT_MS,
      'AI analysis'
    );

    const text = response.choices[0].message.content || '{}';
    const result = JSON.parse(text);

    // Ensure entities structure exists
    if (!result.entities) {
      result.entities = null;
    }
    if (!result.query_type) {
      result.query_type = 'general';
    }

    return result;
  } catch (err: any) {
    console.error('❌ AI analysis failed:', err.message);
    return {
      intent: 'general_question',
      lead_score: 'low',
      confidence: 0.3,
      tasks: [],
      appointment: null,
      should_auto_reply: true,
      escalation_reason: null,
      language_detected: 'en',
      summary_update: 'Unable to analyze message',
      entities: null,
      query_type: 'general',
    };
  }
}

/** Generate an auto-reply using business context + inventory/knowledge data + conversation memory */
export async function generateReply(
  customerMessage: string,
  conversationHistory: string[],
  knowledgeContext: string[],
  businessProfile: { business_name: string; industry: string; services: string[] },
  language: string,
  inventoryContext?: { items: any[]; soldItems?: any[]; alternatives?: any[] } | null,
  conversationMemory?: string,
  domain?: BaseDomain
): Promise<string> {
  const d = domain || getDomain(null);

  // HACKATHON: Capped to 5 items + abbreviated attrs to prevent context bloat
  let inventoryInfo = '';
  if (inventoryContext) {
    const { items, soldItems, alternatives } = inventoryContext;

    if (items && items.length > 0) {
      const limitedItems = items.slice(0, 5);
      const SKIP_KEYS = /(image|img|photo|pic|url|link|description)/i;
      const CORE_KEYS = ['item_name', 'category', 'price', 'quantity'];

      inventoryInfo += '\nAVAILABLE PRODUCTS FROM INVENTORY (REAL DATA — use this!):\n';
      limitedItems.forEach((item, i) => {
        const price = item.price ? d.formatInventoryPrice(item.price) : 'Price on request';
        const attrs = item.attributes
          ? Object.entries(item.attributes)
              .filter(([k, v]) => {
                if (v === null || v === undefined) return false;
                if (SKIP_KEYS.test(k)) return false;
                if (CORE_KEYS.includes(k)) return true;
                // Only include non-core attrs if short
                const strVal = String(v);
                if (strVal.length >= 50) return false;
                if (/^https?:\/\//i.test(strVal)) return false;
                return true;
              })
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')
          : '';
        inventoryInfo += `${i + 1}. ${item.item_name}${item.category ? ` (${item.category})` : ''} — ₹${price}, ${item.quantity} in stock${attrs ? `, ${attrs}` : ''}\n`;
      });
    }

    if (soldItems && soldItems.length > 0) {
      const limitedSold = soldItems.slice(0, 3);
      inventoryInfo += '\nSOLD OUT / UNAVAILABLE:\n';
      limitedSold.forEach((item) => {
        inventoryInfo += `- ${item.item_name} — SOLD OUT\n`;
      });
    }

    if (alternatives && alternatives.length > 0) {
      const limitedAlts = alternatives.slice(0, 3);
      inventoryInfo += '\nSIMILAR ALTERNATIVES AVAILABLE:\n';
      limitedAlts.forEach((item, i) => {
        const price = item.price ? d.formatInventoryPrice(item.price) : 'Price on request';
        inventoryInfo += `${i + 1}. ${item.item_name} — ₹${price}\n`;
      });
    }
  }

  // HACKATHON: Limit knowledge chunks to 3, each max 400 chars
  const limitedChunks = (knowledgeContext || []).slice(0, 3).map(c => c.length > 400 ? c.slice(0, 400) + '...' : c);

  const prompt = d.replyPrompt.buildSystemPrompt({
    businessName: businessProfile.business_name || 'our business',
    industry: businessProfile.industry || 'Services',
    services: businessProfile.services?.join(', ') || 'Various',
    conversationMemory: conversationMemory || '',
    inventoryInfo,
    knowledgeContext: limitedChunks.length > 0 ? 'KNOWLEDGE BASE:\n' + limitedChunks.join('\n---\n') : '',
    language,
  });

  // Build message array for GPT — send history for better context
  const historicalMessages = conversationHistory.slice(0, -1);
  const mappedMessages: any[] = [{ role: 'system', content: prompt }];

  historicalMessages.slice(-d.limits.historyLlmLimit).forEach((msgString) => {
    if (msgString.startsWith('ai: ')) {
      mappedMessages.push({ role: 'assistant', content: msgString.replace('ai: ', '') });
    } else {
      mappedMessages.push({ role: 'user', content: msgString.replace(/^.*?: /, '') });
    }
  });

  mappedMessages.push({ role: 'user', content: customerMessage });

  try {
    const response = await withTimeout(
      openai.chat.completions.create({
        model: MODEL,
        messages: mappedMessages as any,
        ...d.llmParams.reply,
      }),
      REPLY_TIMEOUT_MS,
      'AI reply generation'
    );
    return response.choices[0].message.content || d.fallbacks.aiFailure;
  } catch (err: any) {
    console.error('❌ AI reply generation failed:', err.message);
    return d.fallbacks.aiFailure;
  }
}

/** Generate a conversation summary */
export async function generateSummary(messages: string[], domain?: BaseDomain): Promise<string> {
  const d = domain || getDomain(null);
  try {
    const response = await withTimeout(
      openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `Summarize this business conversation in 1-2 sentences. Focus on: what the customer wants, key decisions, pending actions.\n\nMessages:\n${messages.join('\n')}`,
          },
          { role: 'user', content: 'Summary:' },
        ],
        ...d.llmParams.summary,
      }),
      SUMMARY_TIMEOUT_MS,
      'AI summary generation'
    );
    return response.choices[0].message.content || 'Conversation in progress.';
  } catch (err: any) {
    console.error('❌ AI summary generation failed:', err.message);
    return 'Conversation in progress.';
  }
}

/** Generate a follow-up message for an inactive lead */
export async function generateFollowUp(
  customerName: string,
  stage: string,
  conversationHistory: string[],
  businessProfile: { business_name: string; industry: string; services: string[] },
  domain?: BaseDomain
): Promise<string> {
  const d = domain || getDomain(null);

  const prompt = d.followUpPrompt.buildSystemPrompt({
    businessName: businessProfile.business_name || 'our business',
    industry: businessProfile.industry || 'Services',
    services: businessProfile.services?.join(', ') || 'Various',
    customerName,
    stage,
    recentHistory: conversationHistory.length > 0 ? conversationHistory.slice(-5).join('\n') : 'No previous messages.',
  });

  try {
    const response = await withTimeout(
      openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Write the follow-up message.' },
        ],
        ...d.llmParams.followUp,
      }),
      FOLLOW_UP_TIMEOUT_MS,
      'AI follow-up generation'
    );
    return response.choices[0].message.content || d.fallbacks.followUpFallback(customerName);
  } catch (err: any) {
    console.error('❌ AI follow-up generation failed:', err.message);
    return d.fallbacks.followUpFallback(customerName);
  }
}

/** Structured car identification result from AI Vision */
export interface CarIdentification {
  brand: string;
  model: string;
  year_estimate: string;
  color: string;
  body_type: string;
  confidence: 'high' | 'medium' | 'low';
  is_car: boolean;
}

const IMAGE_TIMEOUT_MS = 15000;

/** Identify a car from a base64-encoded image using Gemini Vision (Groq has no vision model) */
export async function identifyCarFromImage(
  base64Image: string,
  mimetype: string
): Promise<CarIdentification> {
  const fallback: CarIdentification = {
    brand: 'unknown',
    model: 'unknown',
    year_estimate: 'unknown',
    color: 'unknown',
    body_type: 'unknown',
    confidence: 'low',
    is_car: false,
  };

  try {
    const response = await withTimeout(
      geminiClient.chat.completions.create({
        model: VISION_MODEL,
        reasoning_effort: GEMINI_REASONING_EFFORT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Identify the car in this image. Common Indian brands: Maruti Suzuki, Tata, Hyundai, Mahindra, Kia, Toyota, Honda, MG, Skoda, Volkswagen, Renault, Nissan, Jeep, Citroen.

Return JSON with these fields:
- brand: manufacturer name
- model: model name
- year_estimate: approximate year or year range (e.g. "2020-2022")
- color: exterior color
- body_type: one of SUV, Sedan, Hatchback, MPV, Pickup, Coupe
- confidence: "high", "medium", or "low"
- is_car: boolean — false if the image does not contain a car`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimetype};base64,${base64Image}`,
                  detail: 'low',
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 400,
        temperature: 0.2,
      }),
      IMAGE_TIMEOUT_MS,
      'Car image identification'
    );

    const text = response.choices[0].message.content || '{}';
    const result: CarIdentification = JSON.parse(text);
    console.log('🚗 Car identification result:', JSON.stringify(result));
    return result;
  } catch (err: any) {
    console.error('❌ Car image identification failed:', err.message);
    return fallback;
  }
}

// ─────────────────────────────────────────
// Walk-In Voice Extraction (Phase 1.2)
// ─────────────────────────────────────────

export interface WalkInExtraction {
  customer_name?: string;
  customer_phone?: string;
  items_mentioned: string[];
  outcome?: 'interested' | 'will_decide' | 'purchased' | 'not_interested' | 'follow_up';
  follow_up_hint?: string;
  staff_name?: string;
  notes: string;
}

const VALID_OUTCOMES = ['interested', 'will_decide', 'purchased', 'not_interested', 'follow_up'] as const;

/**
 * Extract a 10-digit Indian mobile from a transcript. Used as a safety net
 * when GPT misses the phone (digit recognition is sometimes wonky in mixed-
 * language transcripts).
 */
function extractIndianPhoneFromText(text: string): string | undefined {
  const digits = text.replace(/[^\d]/g, '');
  const match10 = digits.match(/[6-9]\d{9}/);
  if (match10) return match10[0];
  const match12 = digits.match(/91([6-9]\d{9})/);
  if (match12) return match12[1];
  return undefined;
}

/**
 * Regex fallback: extract a customer name from the transcript when GPT returns none.
 * Looks for 1-4 proper words BEFORE the phone number (most common Indian voice note pattern:
 * "Rajesh Sharma 9876543210, Fortuner chahiye").
 */
function extractNameFromTranscript(transcript: string): string | undefined {
  const phoneMatch = transcript.match(/\b[6-9]\d{9}\b/);
  if (!phoneMatch || phoneMatch.index === undefined) return undefined;
  const beforePhone = transcript.slice(0, phoneMatch.index).trim();
  if (!beforePhone) return undefined;

  const FILLERS = new Set([
    'customer', 'client', 'aaya', 'aayi', 'ne', 'ka', 'ki', 'ke', 'ko', 'se',
    'bola', 'boli', 'said', 'naam', 'name', 'phone', 'number', 'mobile',
    'contact', 'the', 'a', 'is', 'are', 'ek', 'yeh', 'woh', 'jo', 'aur',
    'toh', 'bhi', 'kuch', 'unka', 'unki', 'inka', 'inki', 'sir', 'madam',
  ]);

  const words = beforePhone
    .split(/[\s,।]+/)
    .map(w => w.replace(/[^a-zA-Z\u0900-\u097F]/g, '').trim())
    .filter(w => w.length >= 2 && !/^\d+$/.test(w) && !FILLERS.has(w.toLowerCase()));

  if (words.length === 0 || words.length > 4) return undefined;
  // Capitalise first letter of each word (voice notes are often all-lowercase from Whisper)
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Extract structured walk-in data from a salesperson's voice transcript.
 * Uses few-shot examples (works far better than abstract rules) plus a
 * regex-based phone fallback for the common case where digits get garbled.
 */
export async function extractWalkInFromTranscript(transcript: string): Promise<WalkInExtraction> {
  // Few-shot examples are folded into the system prompt rather than alternating
  // user/assistant turns — that pattern was causing the API to throw (endpoint limitation).
  const systemPrompt = `You extract structured walk-in customer data from an Indian salesperson's voice note.
The business could be a car showroom, appliance store, jewelry shop, etc.
Transcripts mix English, Hindi, Hinglish, and Marathi.

Return a JSON object with ONLY these keys (skip any field you cannot confidently extract — never invent data):
  "customer_name"   — person's name. NEVER use a product name (e.g. not "Fortuner", "Faber", "Thar")
  "customer_phone"  — exactly 10 digits, strip +91 or 91 prefix if present
  "items_mentioned" — array of product/service names the customer discussed
  "outcome"         — one of: "interested" | "will_decide" | "purchased" | "not_interested" | "follow_up"
  "follow_up_hint"  — time hint the customer mentioned: "Sunday", "kal", "tomorrow", "next week", etc.
  "staff_name"      — salesperson's own name if they said it
  "notes"           — 1-sentence English summary of the visit (always write this if there is real content)

Examples of correct extraction:
INPUT:  "Rajesh Sharma 9876543210, Fortuner chahiye, Sunday tak decide karenge"
OUTPUT: {"customer_name":"Rajesh Sharma","customer_phone":"9876543210","items_mentioned":["Fortuner"],"outcome":"will_decide","follow_up_hint":"Sunday","notes":"Interested in Fortuner; will decide by Sunday."}

INPUT:  "Priya Patel ne Faber 60cm chimney pasand kiya, kal aayegi husband ke saath, phone 8800112233"
OUTPUT: {"customer_name":"Priya Patel","customer_phone":"8800112233","items_mentioned":["Faber 60cm chimney"],"outcome":"will_decide","follow_up_hint":"tomorrow","notes":"Liked Faber 60cm chimney; returning tomorrow with husband."}

INPUT:  "customer ne Thar test drive li, 18 lakh budget, financing chahiye, naam Amit Kumar 8765432190"
OUTPUT: {"customer_name":"Amit Kumar","customer_phone":"8765432190","items_mentioned":["Thar"],"outcome":"interested","notes":"Test-drove Thar, ₹18L budget, needs financing."}

Now extract from the following transcript:
${transcript}`;

  let raw = '{}';
  try {
    console.log('[ai-router] walk-in extraction starting, transcript:', JSON.stringify(transcript));
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Extract the JSON now.' },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 500,
      }),
      15_000,
      'walk-in extraction',
    );

    raw = completion.choices[0]?.message?.content || '{}';
    console.log('[ai-router] walk-in extraction raw response:', raw);
    const parsed = JSON.parse(raw);

    // Phone: prefer GPT's value, fall back to regex on the transcript
    let phone: string | undefined;
    if (parsed.customer_phone) {
      const phoneRaw = String(parsed.customer_phone).replace(/\D/g, '');
      if (phoneRaw.length === 12 && phoneRaw.startsWith('91')) phone = phoneRaw.slice(2);
      else if (phoneRaw.length >= 10) phone = phoneRaw.slice(-10);
    }
    if (!phone) phone = extractIndianPhoneFromText(transcript);

    const outcome = typeof parsed.outcome === 'string' && (VALID_OUTCOMES as readonly string[]).includes(parsed.outcome)
      ? parsed.outcome as WalkInExtraction['outcome']
      : undefined;

    // CRITICAL: notes stays empty if GPT didn't summarise. Do NOT fall back
    // to the raw transcript — that's what caused the "AI dumps everything in
    // notes" bug. The voice route uses notes-emptiness as a signal that
    // extraction was incomplete.
    // Name: prefer GPT value, fall back to regex extraction before the phone number
    const gpName = parsed.customer_name?.toString().trim();
    const customerName = gpName || extractNameFromTranscript(transcript);

    return {
      customer_name: customerName || undefined,
      customer_phone: phone || undefined,
      items_mentioned: Array.isArray(parsed.items_mentioned)
        ? parsed.items_mentioned.map((s: any) => String(s)).filter(Boolean)
        : [],
      outcome,
      follow_up_hint: parsed.follow_up_hint?.toString().trim() || undefined,
      staff_name: parsed.staff_name?.toString().trim() || undefined,
      notes: parsed.notes?.toString().trim() || '',
    };
  } catch (err: any) {
    console.error('[ai-router] extractWalkInFromTranscript failed:', err.message, 'raw:', raw);
    // Phone-only fallback so the form still gets at least one useful value
    const phone = extractIndianPhoneFromText(transcript);
    return {
      items_mentioned: [],
      customer_phone: phone,
      notes: '',
    };
  }
}
