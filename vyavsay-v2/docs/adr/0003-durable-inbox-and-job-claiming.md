# 0003. Durable inbox and DB job claiming

Status: Proposed
Date: 2026-10-07

## Context
Old code acked then worked in memory (H-13/H-14, H-17). v2 runs many instances and needs no lost message and no double send.

## Decision
- Webhook: verify the path key (and a signature if the adapter has one; ChatSyncs has none documented), `INSERT inbound_events` with UNIQUE `(number_id, id_space, provider_message_id)` (amended by [0028](0028-provider-portability.md); `id_space` defaults to the provider name), return 200. Nothing else inline.
- Workers claim rows with `SELECT ... FOR UPDATE SKIP LOCKED` plus a lease (`locked_until`); expired leases are reclaimed. Same mechanism for follow-ups, reminders, outbound sends and Sheets jobs (one `jobs` table, kinds).
- Per-conversation ordering: one in-flight job per `(tenant_id, conversation_id)` (partial unique index on running status; see ADR 0012 for claim SQL and reclaim rules).
- Outbound idempotency: `outbound_messages` row is written first with an idempotency key (`conversation, purpose, ref`); send moves `queued -> sending -> accepted`. A crash in `sending` is resolved by checking provider status before resend: by key only if the provider supports it; ChatSyncs looks up by `wa_message_id` only, so with no id it uses a strict `get-conversation` match (02 s4); if neither works, mark `unknown` and send to review, never blind retry).
- Follow-up send re-checks window, opt-out, quiet hours at send time.
- Usage ledger: `INSERT` of ledger row and limit check in one transaction (`UPDATE usage SET n=n+1 WHERE n<limit RETURNING`).
- Retries: capped with backoff; then dead-letter plus alert.

## Consequences
+ No extra infra (no Redis/queue). - Postgres load; fine at pilot scale. Revisit pgmq/queue if volume grows.
