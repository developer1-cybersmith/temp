# 001. Use official Meta WhatsApp Cloud API, not Baileys
**Status:** Accepted (inferred)
## Context
- Baileys (QR session) broke WhatsApp ToS, risked number bans, no contract for paid SaaS.
- Rationale in README.md:47 and PROJECT_HANDOFF.md:30-39. Commit cb21b26 gives none.
## Decision
- Inbound via `/api/webhook/whatsapp` (HMAC-checked). Outbound via `whatsapp-cloud-client.ts` (Graph v21).
- Baileys files deleted. Table `wb_waba_accounts` added (migration 009).
## Consequences
- Legal footing; needs Meta verification, dedicated number, 24h window and templates.
- Left behind: frontend `/sessions` + QR screens have no backend; `wb_sessions` stale; import alias `baileysAdapter`; package name still "baileys".
- Many docs (PRD, MASTER_PLAN, AUDIT) still describe Baileys.
