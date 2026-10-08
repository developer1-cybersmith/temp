# 0012. System-access tier and corrected job claim

Status: Proposed
Date: 2026-10-07
Amends: 0002, 0003

## Context
Skeptic review: "all DB access via tenant_tx" cannot hold. Webhook key lookup, job claim, scheduler tick, health and token sweeps run before or across tenants. ADR 0002 only allowed queue-claim tables. The claim SQL in the architecture draft also never reclaimed dead running jobs.

## Decision
- Two tiers. Tenant tier: `tenant_tx(tenant_id)` + RLS. System tier: a fixed list of SECURITY DEFINER functions (`resolve_endpoint_key`, `claim_jobs`, `enqueue_due_followups`, `list_numbers_for_health`, `list_tokens_expiring`, `owner_overview_*`), pinned `search_path`, minimal return columns, EXECUTE granted to the worker/api role only, each call counted in `audit_log` (sampled for high-rate ones like claim).
- Amended by [0028](0028-provider-portability.md): `resolve_endpoint_key` returns provider, scope (number or app), mode (live, drain, revoked) and verification secret id; new function `resolve_number_ref(provider, ref)`; `claim_jobs` skips kinds `send` and `followup_send` for numbers with status `switching`.
- Adding a function needs an ADR note and a probe case. No raw cross-tenant SELECT by any role.
- Job claim: statuses `queued|running|done|dead`; `locked_until NOT NULL`; reclaim branch `running AND locked_until<now()`; partial unique index on `(tenant_id, conversation_id) WHERE status='running'`; per-tenant cap is soft; claim skips candidates that violate the index.
- Reclaimed send jobs reconcile through outbox state, never resend.

## Consequences
+ Cross-tenant surface is small, listed and testable. - Each function is code to review; claim runs per candidate with a savepoint.
## Alternatives
BYPASSRLS worker (rejected: H-01 again). Per-tenant job tables (rejected: ops cost).
