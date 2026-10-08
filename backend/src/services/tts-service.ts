import OpenAI from 'openai';
import { config } from '../config/environment.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Groq TTS (free, English only) — primary
const groqTts = config.GROQ_API_KEY
  ? new OpenAI({ apiKey: config.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })
  : null;

// OpenAI TTS (paid, multilingual) — fallback
const openaiTts = config.OPENAI_API_KEY
  ? new OpenAI({ apiKey: config.OPENAI_API_KEY })
  : null;

/**
 * Check whether voice reply generation is available.
 */
export function isVoiceReplyEnabled(): boolean {
  return !!config.GROQ_API_KEY || !!config.OPENAI_API_KEY;
}

/**
 * Detect if text is primarily Hindi/Marathi (Devanagari script) or Hinglish.
 */
function isIndicLanguage(text: string): boolean {
  const devanagariChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  const hinglishWords = /\b(hai|kya|nahi|haan|aur|ka|ki|ke|se|ko|bhai|ji|bhi|toh|mein|hum|aap|ye|wo|kaise|kahan|kitna|kitne|bol|bata|dena|lena|chahiye|achha|theek)\b/i;
  return devanagariChars > text.length * 0.15 || hinglishWords.test(text);
}

/**
 * Generate a voice note audio buffer from text.
 * Uses Groq TTS (free, English) as primary, OpenAI TTS (paid, multilingual) as fallback.
 * Returns OGG/Opus audio suitable for WhatsApp voice messages, or null.
 */
export async function generateVoiceReply(text: string): Promise<Buffer | null> {
  if (!groqTts && !openaiTts) {
    console.log('[TTS] No TTS API keys configured, skipping voice reply');
    return null;
  }

  const isIndic = isIndicLanguage(text);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    // Try OpenAI FIRST if available (supports all languages)
    if (openaiTts) {
      try {
        const response = await openaiTts.audio.speech.create(
          {
            model: 'tts-1',
            voice: 'nova',
            input: text,
            response_format: 'opus',
          },
          { signal: controller.signal as any },
        );

        const buf = Buffer.from(await response.arrayBuffer());
        console.log(`[TTS] Generated voice reply via OpenAI — ${text.length} chars, ${buf.length} bytes`);
        return buf;
      } catch (openaiErr: any) {
        console.warn(`[TTS] OpenAI TTS failed: ${openaiErr.message}, falling back to Groq...`);
      }
    }

    // Fallback: Groq (English only, but works for Hinglish too with some mispronunciation)
    if (groqTts) {
      try {
        // For non-English text, transliterate common Hindi words to approximation
        const ttsText = isIndic ? transliterateForGroq(text) : text;
        const response = await groqTts.audio.speech.create(
          {
            model: 'canopylabs/orpheus-v1-english' as any,
            voice: 'hannah' as any,
            input: ttsText,
            response_format: 'wav',
          },
          { signal: controller.signal as any },
        );

        const wavBuf = Buffer.from(await response.arrayBuffer());
        const opusBuf = convertWavToOpus(wavBuf);
        if (opusBuf) {
          console.log(`[TTS] Generated voice reply via Groq — ${ttsText.length} chars, ${opusBuf.length} bytes`);
          return opusBuf;
        }
        console.warn('[TTS] WAV→Opus conversion failed');
      } catch (groqErr: any) {
        console.warn(`[TTS] Groq TTS failed: ${groqErr.message}`);
      }
    }

    console.warn('[TTS] All TTS providers failed');
    return null;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[TTS] Request timed out after 10 seconds');
    } else {
      console.error('[TTS] Failed to generate voice reply:', err.message ?? err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Simple transliteration of common Devanagari words for Groq English TTS fallback.
 * Not perfect, but better than nothing when OpenAI is unavailable.
 */
function transliterateForGroq(text: string): string {
  // Strip Devanagari characters - replace with space
  return text.replace(/[\u0900-\u097F]+/g, ' ').replace(/\s+/g, ' ').trim() || text;
}

/**
 * Convert WAV audio buffer to OGG/Opus format using ffmpeg.
 * Required because Groq TTS only outputs WAV, but WhatsApp needs OGG/Opus.
 */
// Resolve ffmpeg binary path at module load
let ffmpegBin = 'ffmpeg';
try {
  // @ts-ignore — ffmpeg-static exports the binary path as default
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic) ffmpegBin = ffmpegStatic;
} catch {
  // Use system ffmpeg
}

function convertWavToOpus(wavBuffer: Buffer): Buffer | null {
  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const wavPath = path.join(tmpDir, `tts-${ts}.wav`);
  const opusPath = path.join(tmpDir, `tts-${ts}.ogg`);

  try {
    fs.writeFileSync(wavPath, wavBuffer);
    execSync(`"${ffmpegBin}" -i "${wavPath}" -c:a libopus -b:a 32k -ar 48000 -ac 1 "${opusPath}" -y`, {
      stdio: 'pipe',
      timeout: 8000,
    });

    const opusBuffer = fs.readFileSync(opusPath);
    return opusBuffer;
  } catch (err: any) {
    console.error('[TTS] WAV→Opus ffmpeg conversion error:', err.message);
    return null;
  } finally {
    try { fs.unlinkSync(wavPath); } catch {}
    try { fs.unlinkSync(opusPath); } catch {}
  }
}
