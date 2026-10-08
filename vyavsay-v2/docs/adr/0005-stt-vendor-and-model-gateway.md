# 0005. Model gateway and speech-to-text

Status: Proposed
Date: 2026-10-07

## Context
Owner chose one gateway with task-to-model config, versioned prompts, Langfuse. STT vendor is open (Sarvam excluded). M-23: PII goes to LLMs without DPAs.

## Decision
- `ModelGateway` interface: `complete(task, messages, schema)` and `transcribe(audio, lang_hints)`. Task-to-model map, fallback order, timeouts, per-tenant token/minute accounting in config/DB.
- Only paid, zero-retention endpoints with a DPA for production (no free tiers). Minimise PII sent (no phone numbers, mask names where not needed).
- STT: start with a Whisper-class hosted model through the gateway; accept only if the Milestone 0 sample test (20 Hinglish/Marathi notes) meets target word accuracy set by the owner. Vendor swap is config.
- Prompts: static system prompt; customer text only in user turn; model output schema-validated (M-04).
- Eval set: at least 150 cases (grounding, floor price, injection, Hinglish/Marathi, out-of-window) gate CI.

## Consequences
Cost from paid keys. Vendor choice remains a pilot-time owner decision.
