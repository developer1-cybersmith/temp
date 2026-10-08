# 0002. Tenancy: RLS plus a restricted worker role

Status: Proposed (policy and role lines superseded by 0014 and doc 03: two separate policy sets, not an OR)
Date: 2026-10-07

## Context
Service-role keys bypass RLS. Workers, cron, webhooks and the owner overview all run server-side, so using service role there re-creates H-01/H-02.

## Decision
- Every tenant table has `tenant_id`, RLS on, deny by default. Identity of contacts is `(tenant_id, contact_id)`; all uniques and FKs are composite.
- API requests: DB connection runs as login role `app_user` (zero base grants) then `SET LOCAL ROLE authenticated` with `request.jwt.claims` (tenant resolved from `tenant_members` by `auth.uid()`, see 0014).
- Webhooks, workers, cron: role `worker_role` (NOLOGIN-derived, no BYPASSRLS). The job row carries `tenant_id`; each unit of work opens a transaction and `SET LOCAL app.tenant_id`; separate RLS policies per role: `authenticated` uses the tenant from `tenant_members`, `worker_role` uses `app.tenant_id` (never one policy with an OR). Webhooks use `webhook_role` (inbox insert only). Cross-tenant access exists only as the fixed SECURITY DEFINER system functions listed in ADR 0012 (claim, endpoint-key lookup, scheduler tick, health and token sweeps), never as raw table reads.
- Owner overview: a few SECURITY DEFINER aggregate functions (counts only), allow-listed to owner role, each call written to `audit_log`.
- Service role key is used only by migrations/admin scripts, never by the running app.
- Vector search filters `tenant_id` inside the query (and partial index), not after.
- CI: cross-tenant probe runs against API routes, worker code paths and the owner functions.

## Consequences
+ Bug in app code cannot cross tenants; testable. - More SQL and a per-job `SET LOCAL`; verify pooler (transaction mode) supports it.
## Alternatives
Service role plus app-level filters (rejected: H-01 again). Schema-per-tenant (rejected: ops cost).
