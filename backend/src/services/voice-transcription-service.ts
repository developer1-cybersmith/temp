import OpenAI from 'openai';
import { config } from '../config/environment.js';

/**
 * Prompt hint for Whisper — helps it recognize Indian car brand names,
 * Hinglish words, and automotive vocabulary it might otherwise mishear.
 */
/**
 * Prompt hint for Whisper — vocabulary guidance for Indian automotive context.
 * Includes car brand names, Hinglish, Hindi, and Marathi terms.
 * This dramatically improves accuracy for domain-specific words.
 */
const WHISPER_PROMPT = [
  // Indian car brands & models Whisper commonly mishears
  'Scorpio, Thar, XUV700, XUV300, Bolero, Mahindra, Nexon, Harrier, Safari, Punch, Tata,',
  'Swift, Dzire, Baleno, Brezza, Ertiga, Vitara, WagonR, Alto, Maruti Suzuki,',
  'Creta, Venue, i20, i10, Verna, Tucson, Hyundai, Seltos, Sonet, Carens, Kia,',
  'City, Amaze, Elevate, Honda, Innova, Fortuner, Glanza, Urban Cruiser, Toyota,',
  'Hector, Astor, MG, Kushaq, Slavia, Skoda, Taigun, Virtus, Volkswagen,',
  // Hinglish automotive terms
  'gaadi, car, kitna, price, lakh, EMI, petrol, diesel, CNG, automatic, manual,',
  'test drive, showroom, kilometre, mileage, RC, insurance, photos, bhejo, dikhao,',
  'available, stock, finance, booking, token, delivery,',
  // Hindi terms
  'kya hai, kitne ka hai, dikhao, bhejo, chahiye, available hai, konsi, kaunsi,',
  'haan, nahi, theek hai, achha, sahi, pehle, baad mein, abhi, kal, aaj,',
  // Marathi terms
  'kay aahe, kimat, dakhva, pathva, aahe ka, nahi, hoy, bara, pahije,',
  'gaadi aahe ka, photos pathva, mahag, swasta, kitla, kiti,',
].join(' ');

/**
 * Neutral prompt for general-purpose voice capture (no domain bias).
 * Used by walk-in capture and other multi-vertical flows where car-specific
 * vocabulary would cause Whisper to hallucinate car words.
 */
const NEUTRAL_PROMPT = 'A salesperson in an Indian retail store dictating a customer note. May mix English, Hindi, Hinglish, Marathi.';

export interface TranscribeOptions {
  /** Override the Whisper prompt. Pass empty string to disable prompting. */
  prompt?: string;
}

/** Per-segment metadata returned by Whisper verbose_json. */
export interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  /** Average log-probability of tokens. < -1.0 indicates low confidence. */
  avg_logprob: number;
  /** gzip-style compression ratio. > 2.4 indicates repetition/looping. */
  compression_ratio: number;
  /** Probability that the segment is silence/non-speech. > 0.6 indicates silence. */
  no_speech_prob: number;
}

export interface WhisperVerboseResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
  /** Groq-only diagnostic blob; safe to ignore. */
  x_groq?: unknown;
}

export interface TranscriptionResult {
  text: string;
  provider: 'groq' | 'openai';
  segments?: WhisperSegment[];
  duration?: number;
  language?: string;
  /** Worst (max) no_speech_prob across segments — convenience field. */
  no_speech_prob?: number;
}

export interface QualityAssessment {
  ok: boolean;
  reasons: string[];
}

/**
 * Inspect Whisper segment metadata for hallucination / silence signals.
 *
 * Thresholds match OpenAI's internal decoder fallbacks:
 *  - no_speech_prob > 0.6  → segment is silence (OpenAI skip threshold)
 *  - avg_logprob < -1.0    → low decoder confidence (OpenAI temperature-fallback trigger)
 *  - compression_ratio > 2.4 → repetition loop ("thank you. thank you...")
 *
 * A segment must cover >=30% of total duration to flag the whole transcript —
 * this prevents one noisy second in a 30s clip from killing it. For short
 * single-segment clips (typical WhatsApp voice notes), any failure flags it.
 */
export function assessTranscriptionQuality(
  result: Pick<TranscriptionResult, 'segments' | 'duration' | 'text'>,
): QualityAssessment {
  const reasons: string[] = [];
  const segments = result.segments ?? [];
  const totalDuration = result.duration ?? 0;

  if (!segments.length) {
    // No metadata (e.g. provider returned plain text) — cannot assess; assume ok.
    return { ok: true, reasons: [] };
  }

  if (!result.text || result.text.trim().length === 0) {
    return { ok: false, reasons: ['empty_transcript'] };
  }

  for (const seg of segments) {
    const segDuration = Math.max(0, seg.end - seg.start);
    const coverage = totalDuration > 0 ? segDuration / totalDuration : 1;
    // For short clips, every segment matters. For longer clips, only flag dominant segments.
    const isDominant = totalDuration < 5 || coverage >= 0.3;
    if (!isDominant) continue;

    if (seg.no_speech_prob > 0.6) {
      reasons.push(`silence (no_speech_prob=${seg.no_speech_prob.toFixed(2)} seg#${seg.id})`);
    }
    if (seg.avg_logprob < -1.0) {
      reasons.push(`low_confidence (avg_logprob=${seg.avg_logprob.toFixed(2)} seg#${seg.id})`);
    }
    if (seg.compression_ratio > 2.4) {
      reasons.push(`repetition (compression_ratio=${seg.compression_ratio.toFixed(2)} seg#${seg.id})`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Transcribe an audio buffer using Groq Whisper (primary)
 * with OpenAI Whisper as fallback.
 *
 * Returns verbose metadata (segments, duration, language) when available so
 * callers can run `assessTranscriptionQuality()`. The `text` field remains the
 * primary output for backward compatibility with the WhatsApp voice flow.
 *
 * Default prompt is car-domain-biased (for the WhatsApp flow). Override
 * via `options.prompt` for generic / multi-vertical use cases.
 */
/**
 * Sniff audio container format from the first few bytes of the buffer.
 * Whisper's ffmpeg backend uses the filename extension as a hint, so sending
 * a WebM blob labeled "voice.ogg" can cause silent corruption / hallucinations.
 */
function sniffAudioFormat(buf: Buffer): { ext: string; mime: string } {
  if (buf.length < 12) return { ext: 'webm', mime: 'audio/webm' }; // safe default
  // WebM/Matroska EBML header: 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { ext: 'webm', mime: 'audio/webm' };
  }
  // OGG: "OggS"
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
    return { ext: 'ogg', mime: 'audio/ogg' };
  }
  // MP4 / M4A: bytes 4-7 == "ftyp"
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    return { ext: 'm4a', mime: 'audio/mp4' };
  }
  // WAV: "RIFF" .... "WAVE"
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45) {
    return { ext: 'wav', mime: 'audio/wav' };
  }
  // MP3: "ID3" or 0xFFFB / 0xFFF3 / 0xFFF2 sync header
  if ((buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
      (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
    return { ext: 'mp3', mime: 'audio/mpeg' };
  }
  // Unknown — webm is the safest browser default
  return { ext: 'webm', mime: 'audio/webm' };
}

export async function transcribeVoiceNote(
  audioBuffer: Buffer,
  options: TranscribeOptions = {},
): Promise<TranscriptionResult> {
  const { ext, mime } = sniffAudioFormat(audioBuffer);
  const file = new File([new Uint8Array(audioBuffer)], `voice.${ext}`, { type: mime });
  const prompt = options.prompt !== undefined ? options.prompt : WHISPER_PROMPT;

  // Try Groq first (free, fast)
  if (config.GROQ_API_KEY) {
    try {
      const groq = new OpenAI({
        apiKey: config.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
        timeout: 15_000,
      });

      const raw = await groq.audio.transcriptions.create({
        file,
        model: 'whisper-large-v3',
        response_format: 'verbose_json',
        ...(prompt ? { prompt } : {}),
        temperature: 0,
      }) as unknown as WhisperVerboseResponse;

      const result = buildResult(raw, 'groq');
      console.log(
        `Transcription success [groq]: ${result.text.length} chars, ` +
        `${result.segments?.length ?? 0} segments, ${result.duration?.toFixed(1) ?? '?'}s`,
      );
      return result;
    } catch (err) {
      console.warn('Groq transcription failed, trying OpenAI fallback:', (err as Error).message);
    }
  }

  // Fallback to OpenAI
  if (config.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({
        apiKey: config.OPENAI_API_KEY,
        timeout: 15_000,
      });

      const raw = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        ...(prompt ? { prompt } : {}),
        temperature: 0,
      }) as unknown as WhisperVerboseResponse;

      const result = buildResult(raw, 'openai');
      console.log(
        `Transcription success [openai]: ${result.text.length} chars, ` +
        `${result.segments?.length ?? 0} segments, ${result.duration?.toFixed(1) ?? '?'}s`,
      );
      return result;
    } catch (err) {
      console.error('OpenAI transcription also failed:', (err as Error).message);
      throw new Error(`Transcription failed (OpenAI): ${(err as Error).message}`);
    }
  }

  throw new Error('Transcription failed: no API keys configured (GROQ_API_KEY / OPENAI_API_KEY)');
}

function buildResult(raw: WhisperVerboseResponse, provider: 'groq' | 'openai'): TranscriptionResult {
  const segments = Array.isArray(raw.segments) ? raw.segments : [];
  const worstNoSpeech = segments.length
    ? segments.reduce((m, s) => Math.max(m, s.no_speech_prob ?? 0), 0)
    : undefined;
  return {
    text: (raw.text ?? '').trim(),
    provider,
    segments,
    duration: raw.duration,
    language: raw.language,
    no_speech_prob: worstNoSpeech,
  };
}

export { NEUTRAL_PROMPT };
