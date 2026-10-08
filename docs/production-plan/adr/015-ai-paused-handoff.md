# 015. AI/human handoff is one boolean, `wb_conversations.ai_paused`
**Status:** Accepted (inferred)
## Context
- Owner toggles by PATCH. Agent sets it via `escalate_to_human`. Checked before any LLM work.
## Decision
- Single flag. Manual owner sends do not set it. Messages: sender `user` (owner), `ai`, `customer`.
## Consequences
- Column is in no migration (schema drift).
- Legacy path does not pause on escalation. No owner notification, no reason stored.
- Manual send reports success even if delivery failed.
