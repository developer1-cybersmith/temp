# 010. `customers` is the canonical person record
**Status:** Accepted (inferred; migration 007 header, walk-in plan)
## Context
- Merge WhatsApp leads and walk-ins.
## Decision
- `customers` + `customer_visits`. UNIQUE(user_id, primary_phone). Conversations and leads link by nullable `customer_id`. Migration 007 backfills.
## Consequences
- Single view of a person; room for staff/multi-vertical later.
- `customer_id` FKs on conversations/leads have no ON DELETE; customer delete may fail. Customer detail reads skip `user_id`.
- Customer/visit PATCH use field whitelists, not zod. Hard deletes, no audit trail.
