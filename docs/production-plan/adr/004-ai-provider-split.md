# 004. AI provider split: Groq, Gemini, Jina
**Status:** Accepted (inferred, rationale partly in commit 549575e and code comments)
## Context
- Replace retired GitHub Models (commit 549575e).
- Gemini free tier is 20 req/day, so it is kept for vision only. Groq has no vision model.
## Decision
| Job | Provider |
|---|---|
| Text | Groq llama-3.3-70b-versatile |
| Vision | Gemini |
| Embeddings | Jina v4, truncated to 1536 dims (avoids DB migration) |
| STT | Groq Whisper large-v3, OpenAI whisper-1 fallback |
| TTS | OpenAI first (Hindi), Groq Orpheus fallback (English only) |
- Boot fails without `GROQ_API_KEY`, `GEMINI_API_KEY`, `JINA_API_KEY`.
## Consequences
- Cheap; works with the old VECTOR(1536) columns.
- No re-embed path or model tag per row; old vectors may sit in a different space.
- Gemini quirks patched (handoff gotcha 10). Vapi still uses OpenAI inside Vapi.
- Embedding failure: non-fatal for catalog writes, fatal for knowledge writes.
- Shared keys, no per-tenant cost limit.
