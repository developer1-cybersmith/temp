# 005. Domain layer selected by `wb_users.industry`
**Status:** Accepted (inferred)
## Context
- Prompts, intents and negotiation rules were hardcoded for used cars (ed4d47f, MASTER_PLAN Phases 1-5).
## Decision
- `domains/*` config objects (generic, used_cars) chosen by `getDomain(industry)`. Missing fields fall back to generic.
## Consequences
- New vertical = new config, not new code.
- Only used_cars is specialised. Ingestion ignores domains, and Sheets sync and `generateDescription` hardcode car fields.
- Proposed per-business persona layer (AUDIT section 9) not built: all dealers get "Rahul".
