# 021. WhatsApp voice notes: transcribe in, optional TTS out
**Status:** Accepted (inferred)
## Context
- Port of Baileys behaviour. Whisper hallucinated on silence.
## Decision
- Voice note stored, transcribed, sent to pipeline as text. TTS voice note added after the text reply. ffmpeg only for Groq WAV to OGG.
- Walk-in dictation uses a neutral Whisper prompt and 4 hallucination checks; WhatsApp path has none.
## Consequences
- `execSync` blocks event loop up to 8s. `require('ffmpeg-static')` fails in ESM; falls to system ffmpeg (Docker has it).
- Empty transcript gives silence to customer.
