# 009. Frontend is fixed; backend honours its API contract
**Status:** Accepted (inferred; REDESIGN_PLAN "zero backend changes", CLAUDE.md:8-9)
## Context
- Frontend redesign was completed on top of the Baileys-era API.
## Decision
- No frontend edits. Backend adapts.
## Consequences
- Gap: `/sessions` (GET, POST, status, DELETE) has no route. Dashboard shows "not connected"; QR page hangs.
- Mismatches: Analytics reads `totalMessages` (not returned); owner bubbles expect sender `business_owner`, backend writes `user`.
- Frontend polls; no realtime. Plan options: `/sessions` shim over `wb_waba_accounts`.
