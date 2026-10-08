# ADR index - Vyavsay Assist (inferred from code and docs)
Summary:
- 22 decisions, all recovered after the fact. Rationale marked "inferred" unless a doc states it.
- 1 Superseded (003). Rest Accepted (inferred).
- Biggest open conflicts: ChatSyncs vs direct Meta (002), dead agent flag (014), no RLS (008).
- Schema drift: `ai_paused`, `wb_calls`, `wb_call_actions` not in migrations.
- Frontend reused as-is; gaps are fixed in the backend (009).

| # | Decision | Status |
|---|---|---|
| 001 | Meta Cloud API over Baileys | Accepted (inferred) |
| 002 | Direct Meta, no BSP | Accepted (inferred) |
| 003 | GitHub Models GPT-4o | Superseded by 004 |
| 004 | Groq + Gemini + Jina | Accepted (inferred) |
| 005 | Domain layer by industry | Accepted (inferred) |
| 006 | Human-like multilingual replies | Accepted (inferred) |
| 007 | JSONB inventory, hybrid search | Accepted (inferred) |
| 008 | JWT auth, service role, app-level isolation | Accepted (inferred) |
| 009 | Frontend reused as-is | Accepted (inferred) |
| 010 | Customer-centric CRM | Accepted (inferred) |
| 011 | WABA per tenant, env fallback | Accepted (inferred) |
| 012 | Webhook ack-first | Accepted (inferred) |
| 013 | Hackathon reliability limits | Accepted (inferred) |
| 014 | Flagged LangGraph agent | Accepted (inferred) |
| 015 | `ai_paused` handoff | Accepted (inferred) |
| 016 | Appointments in `wb_tasks`, IST | Accepted (inferred) |
| 017 | In-process scheduling | Accepted (inferred) |
| 018 | Sheets sync, global sheet | Accepted (inferred) |
| 019 | Public media buckets | Accepted (inferred) |
| 020 | Vapi voice calls | Accepted (inferred) |
| 021 | Voice notes STT/TTS/ffmpeg | Accepted (inferred) |
| 022 | Pricing and positioning | Accepted (inferred) |

Skipped as trivial: update-validation styles, lazy `wb_users` (in 008), follow-up dedupe by stage, `.xls` parsing quirks.
Secrets and IDs from docs (README password, verify token, Meta/AWS IDs) are [REDACTED] and omitted.
