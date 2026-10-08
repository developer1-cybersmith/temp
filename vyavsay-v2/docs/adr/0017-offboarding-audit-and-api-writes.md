# 0017. Offboarding, append-only audit, and API writes via function only

Status: Proposed
Date: 2026-10-07
Amends: 0009, 0012, 0014

## Context
Skeptic review of doc 03 found: API INSERT grants on `jobs`/`outbound_messages` bypass the deterministic post-step (opt-out, window, floor price, quota); append-only `audit_log`/`llm_usage` conflict with `ON DELETE CASCADE` offboarding and DPDP erasure; offboarded users could be re-provisioned; tenant status was enforced only in middleware.

## Decision
- `authenticated` and `app_user` have no grant on `jobs` or `outbound_messages`. Owner actions call `private.enqueue_owner_action(kind, args)`: SECURITY DEFINER, tenant from `current_tenant_id()`, requires `tenant_active()`, allow-listed `kind`, validated args, writes one `jobs` row. Only the worker writes the outbox, after the post-step.
- `audit_log.tenant_id` and `llm_usage.tenant_id` are plain uuids with no FK, so cascade never touches them. Their append-only trigger allows DELETE/UPDATE only when `app.erasure = 'on'`, a GUC that only `offboard_tenant` sets (transaction-local, definer).
- `offboard_tenant` (requires status `offboarding`, writes an audit row first): delete secrets and revoke at provider; delete tenant (cascade); delete `langgraph` threads by prefix; delete `llm_usage`; scrub `audit_log` rows of the tenant (clear `meta`, `target`, replace `tenant_id` with a hashed ref); insert `offboarded_users` tombstone; admin script then deletes the Auth user, the S3 prefix and Langfuse traces (checklist, tested for the DB part).
- `provision_tenant` takes no argument (`auth.uid()`), takes an advisory lock, `ON CONFLICT (user_id) DO NOTHING`, needs a confirmed email, refuses tombstoned users.
- Tenant status: `private.tenant_active()` in WITH CHECK of class A write policies and in `enqueue_owner_action`.
- Retention runs as purge job kinds (`purge_messages`, `purge_audio`, `purge_inbound_payload`, `purge_checkpoints`), tenant-scoped.

## Consequences
+ One path to the outbox; erasure is complete and testable (T15, T21). - Audit rows survive offboarding in anonymised form (owner decision on DPDP scope); one more definer function to review.
## Alternatives
Keep INSERT grants with WITH CHECK (rejected: relies on handler revalidation). Cascade audit (rejected: breaks append-only).
