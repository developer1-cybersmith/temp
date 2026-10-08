# Skeptic review: docs/03-tenancy-data.md

**Summary**
1. Verdict: revise. Strong isolation design, no owner decision reopened, but 6 blockers.
2. Main holes: API write grants contradict worker-only tables, append-only vs cascade offboarding, missing profile columns the frontend sends, `langgraph` schema outside RLS and CI, provision race, status enforced only in middleware.
3. Several smaller SQL and ADR inconsistencies (usage upsert, polymorphic FK, ADR 0002/0003 drift).
4. Test plan is good but misses the cases below.
5. Gap register: H-36 and M-06 only half closed.

## Blockers
1. **API write grants contradict themselves.** Section 4 "API enqueue" lets `authenticated` INSERT into `jobs` and `outbound_messages`; class C and T9 say `jobs` writes by `app_user` are "permission denied". Pick one. If kept, a client-shaped row skips the deterministic post-step ([0009](../adr/0009-agent-durability-and-review-queue.md): opt-out, window, floor price, quota) and relies on "handlers revalidate". Prefer: API calls a narrow function or the worker only; never raw INSERT into the outbox.
2. **Offboarding cannot work as written.** `audit_log` and `llm_usage` are append-only (trigger blocks DELETE) yet T15 expects "zero rows left in any `app` table" and FKs are `ON DELETE CASCADE`. Either the cascade fails or rows survive (DPDP erasure, H-36, L-19). Decide: no FK plus anonymised tenant ref in audit, or trigger exception for `offboard_tenant`. Also T15 ignores `langgraph.*`, S3, Langfuse, provider copies.
3. **`tenants` lacks the columns the frontend writes.** Verified: `Onboarding.tsx:29` and `Settings.tsx:208` PATCH `business_name, industry, services, business_address, google_maps_link`; `Settings.tsx:69` PATCHes `auto_reply_enabled`. None exist in 3.1 (only `ai_paused` on conversations; `vertical` is in team-set config). FR-20 allow-list and the "profile columns" grant cannot be defined. Add them (or `tenant_profile`) and map `auto_reply_enabled` to a tenant-level flag the worker honours. Check GET `/users/{id}` response shape too.
4. **`langgraph` schema is outside the isolation story.** No RLS, no `tenant_id` column (only a `thread_id` prefix asserted by a wrapper), the library opens its own connections so `app.tenant_id` is never set, T1 only scans `app`, T9 only tests `app_user`. Also `setup()` creates tables outside migrations, breaking H-10/ADR 0016 and the drift check. Add: tables created by a migration, a policy or a view on the `thread_id` prefix (or a dedicated checkpointer per-tenant context), and a test that worker context A cannot load B's thread.
5. **`provision_tenant` race and abuse.** Frontend can fire parallel first `GET /users/{id}`; `tenant_members.user_id UNIQUE` alone gives an error, not idempotence. Specify `ON CONFLICT` and derive the user from `auth.uid()`, never an argument. After offboarding, the same Auth user logs in and silently gets a new pending tenant: block via tombstone or delete the Auth user in `offboard_tenant`. No test for either.
6. **Tenant status is enforced only in API middleware.** "Blocks writes when not `active`" is app code; the doc's own principle is DB-level backstop. A `pending` or `suspended` user can write catalog and enqueue via any route that forgets the check. Put `tenant_active()` in the WITH CHECK of write policies for class A and the API enqueue path, and add a test.

## Wrong or inconsistent claims
- **Usage upsert (3.1):** `INSERT ... ON CONFLICT ... WHERE used+$n<=$limit` does not apply the WHERE on the first insert, so the first call of a period may exceed the limit (voice seconds 90 vs 60). Add a `CHECK (used <= limit)` or a pre-check in the same statement; T14 must include the empty-row case. `llm_cost_paise` is known only after the call: say it is post-hoc plus a pre-flight estimate.
- **ADR 0002 vs doc:** 0002 says policies "accept either JWT tenant or `app.tenant_id`" (an OR) and names `app_user` as the DB role; doc says two separate policy sets. 0014 amends 0002 but does not say this part is superseded. Mark 0002 superseded on those lines.
- **ADR 0003 vs doc:** inbound unique is `(provider, provider_message_id)` in 0003, `(number_id, provider_message_id)` in the doc and T13. Fix 0003.
- **ADR 0015 "composite FK to the owner row":** one `embeddings` table with `source_kind`/`source_id` cannot carry one FK to two parents. Orphan vectors after delete are then possible. Use two nullable FKs with a CHECK, or delete triggers plus a repair job and test.
- **"Every table has `tenant_id`" and T1 "tenant_id first in an index"** conflict with `plan_tiers`, `platform_admins`, global `prompt_versions`, nullable `jobs/team_tasks/audit_log`. State the exempt list in T1, otherwise CI fails on day one.
- **SECURITY DEFINER and FORCE RLS:** definer functions owned by `migrator` see no rows under FORCE RLS unless `migrator` has BYPASSRLS. Doc says "bypass" but not that custom roles with BYPASSRLS may not be creatable on hosted Supabase (**verify**). Also state function owner, and that a bug in a definer function is a cross-tenant leak (T6 covers columns, not row scoping).
- `app_user` base grants and `RESET ROLE`: state `app_user` has zero table grants so a stray `RESET ROLE` yields nothing. Same for `worker_user` and a stray `SET app.tenant_id` (agent tools get no SQL, say so).
- `public` schema: Supabase exposes it by default. State it is empty and extend T1 to `public`, `private`, `extensions`.
- pg_trgm (hybrid search) not in the extension list; `search_path=''` helpers must schema-qualify `extensions.vector` (**verify**).
- `bookings.held` has no expiry: slots stay blocked forever. Add hold TTL job.

## Races and leaks checked
| Check | Result |
|---|---|
| Cross-tenant FK | Covered (composite FK, T5) |
| Pooled connection GUC leak | Covered (E2, E7, T4) |
| Webhook in `api` task uses `worker_user` | api then holds worker DB creds, contradicting "api and worker get different sets" ([0010](../adr/0010-config-secrets-media.md)). Clarify: separate `webhook_role` limited to `resolve_endpoint_key` + `inbound_events` insert |
| Catalog limit `FOR UPDATE` on tenant row | Blocks profile edits during Sheets import; define partial-import behaviour at limit |
| Worker decrypts all tenants | Context binding does not stop a compromised worker; honest in Risks, fine |
| Checkpoints 7 day vs `messages` source of truth | OK |

## Gap register
- **H-36/M-06/L-19:** retention periods proposed, but no purge job kinds, no partitioning, no export route, not in tests. Add purge job rows and a T16.
- **M-02:** email-confirmed check and suspend are only partly addressed (status yes; confirmed-email check not stated). Add to API auth rule.
- Others in section 10 are credibly closed.

## Scope and realism
- Per-secret KMS call on every send is latency and cost; cache decrypted tokens (doc mentions in Risks only). OK for pilot.
- `max_numbers`, `team_tasks`, `platform_admins` are small scope creep but defensible.
- Doc is 215 lines, within limit.

## Missing tests
Parallel `provision_tenant`; offboarded user re-login; column-grant mass assignment at DB level (not only via API, T7); `pending`/`suspended` DB-level write denial; usage first-insert overshoot; append-only trigger and offboarding path; `langgraph` isolation; `public` schema empty; embeddings orphan cleanup; migration up on fresh DB with `setup()` tables included; T12 "10 hottest queries" unnamed.

## Contradictions with earlier docs
- ADR 0002 and 0003 (above). ADR 0012 list lacks `provision_tenant`/`offboard_tenant` text (doc adds them; update 0012 or 0014 note, 0014 does add provision only).
- No contradiction with `04-owner-decisions.md`. Frontend change only in owner item 1, with evidence (`Login.tsx:26` verified).

## Verdict
revise. Fix blockers 1-6, then the listed inconsistencies and tests.
