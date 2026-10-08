# Vyavsay Assist v2: Tenancy and Data Design

**Summary**
1. Tenant = one business. User to tenant link is a DB table (`tenant_members`), resolved in SQL on every query, never from JWT claims ([0014](adr/0014-tenant-model-and-resolution.md)).
2. All tables sit in schema `app` (plus a migration-created `langgraph`), not exposed by the Data API, `anon` has no grants. DB roles: `authenticated` (API, RLS by user), `worker_role` (jobs, RLS by `app.tenant_id`), `webhook_role` (inbound insert only), `migrator` for bypass ([0002](adr/0002-tenancy-rls-and-worker-role.md), [0012](adr/0012-system-access-tier.md)). Tenant status is enforced in policies, not only middleware.
3. Every table has `tenant_id`, RLS enabled and forced, composite FKs `(tenant_id, id)`. Backend only opens connections through `tenant_tx`; CI fails any table that skips RLS ([0016](adr/0016-migrations-and-schema-invariants.md)).
4. Per-tenant secrets are envelope-encrypted (KMS + AES-GCM) in a table the API role cannot read. Vectors live in one `embeddings` table with the tenant filter inside the query ([0015](adr/0015-embeddings-storage.md)). Offboarding and audit retention: [0017](adr/0017-offboarding-audit-and-api-writes.md).
5. Version-sensitive claims are marked **verify** (Supabase and context7 MCP were not authenticated). Nothing here reopens `04-owner-decisions.md`.

Inputs: [PRD](01-prd.md), [architecture](02-architecture.md), ADRs [0002](adr/0002-tenancy-rls-and-worker-role.md), [0003](adr/0003-durable-inbox-and-job-claiming.md), [0006](adr/0006-per-tenant-integrations.md), [0009](adr/0009-agent-durability-and-review-queue.md), [0010](adr/0010-config-secrets-media.md), [0012](adr/0012-system-access-tier.md), [0025](adr/0025-hold-and-escalate.md), [0026](adr/0026-calendar-via-calcom.md). New ADRs: [0014](adr/0014-tenant-model-and-resolution.md), [0015](adr/0015-embeddings-storage.md), [0016](adr/0016-migrations-and-schema-invariants.md), [0017](adr/0017-offboarding-audit-and-api-writes.md).

## 1. Tenant model
| Item | Design |
|---|---|
| Tenant | `tenants`: one business. v1 one owner user per tenant (`tenant_members.user_id` UNIQUE), so `/users/{id}` (id = JWT user) maps to the tenant through membership. |
| Signup | Frontend self-signs-up to Supabase Auth. First `GET /users/{id}` with no membership runs `provision_tenant()`. It takes **no user argument**: user is `auth.uid()`. It requires a confirmed email (M-02), refuses users in `offboarded_users` (tombstone), takes `pg_advisory_xact_lock(hashtext(uid))`, and does `INSERT ... ON CONFLICT (user_id) DO NOTHING` then returns the existing tenant, so parallel calls are idempotent. Result: `pending` tenant, smallest plan, default config, no number. Team activates at onboarding. |
| Status | `pending`, `active`, `suspended`, `offboarding`. Enforced in the DB: `private.tenant_active()` is in the WITH CHECK of every class A write policy and in the enqueue function; `pending`/`suspended` can only update profile columns. Middleware also checks (friendly 403), but is not the control. Worker skips jobs for non-active tenants. |
| Platform owner | `platform_admins(user_id)`. Owner overview uses aggregate-only functions that check this table and write `audit_log`. |
| Time | All instants `timestamptz` (UTC). `tenants.timezone` (default `Asia/Kolkata`, CHECK equals that value in v1; relax later by migration). Hours, quiet hours, "today", and usage periods are computed in the tenant timezone by one resolver (H-19, M-28, L-17). |

## 2. Access paths
| Path | DB role and context | Reaches |
|---|---|---|
| Browser to Supabase | `anon` / `authenticated` JWT via Data API | Auth only. Schema `app` is not exposed; `anon` has zero grants |
| API routes (JWT) | login role `app_user` with **zero table grants** (so a stray `RESET ROLE` yields nothing), `SET LOCAL ROLE authenticated`, `request.jwt.claims` set per transaction (**verify** on transaction pooler) | Tenant CRUD tables via RLS. No grants on secrets, checkpointer, usage writes, `jobs`, `outbound_messages` |
| Webhooks (in `api` task) | login role `webhook_user` to `webhook_role`: EXECUTE `resolve_endpoint_key`, `resolve_number_ref` and INSERT on `inbound_events` and `webhook_dead_letters` only. The api task holds no `worker_user` credentials ([0010](adr/0010-config-secrets-media.md)) | Inbox insert |
| Workers, scheduler | login role `worker_user` (zero base grants) to `worker_role` (no BYPASSRLS), `SET LOCAL app.tenant_id` per unit of work | Own tenant only. Cross-tenant only via allow-listed system functions |
| System functions | SECURITY DEFINER in schema `private`, pinned `search_path`, EXECUTE revoked from PUBLIC (list in [0012](adr/0012-system-access-tier.md) plus `provision_tenant`, `offboard_tenant`, `enqueue_owner_action`). Owner is `migrator`. Under FORCE RLS a definer function sees no rows unless its owner bypasses RLS: BYPASSRLS may not be grantable on hosted Supabase (**verify**); fallback is the `postgres` owner. Either way each function carries explicit tenant predicates, because a definer bug is a cross-tenant leak (T6 tests row scoping) | Minimal columns, audited |
| Migrations, admin scripts | `migrator` (owner of tables). CI migrate job only | Everything |
| Service-role key | Never in a running task | n/a |

## 3. Schema outline
Conventions: `id uuid` (v7 where available, else `gen_random_uuid()`), `tenant_id uuid NOT NULL` first in every index, `created_at/updated_at timestamptz`, `UNIQUE (tenant_id, id)` on every parent so children use composite FKs `(tenant_id, parent_id)` (M-01), tenant FKs `ON DELETE CASCADE` (except `audit_log`, `llm_usage`: no FK, see [0017](adr/0017-offboarding-audit-and-api-writes.md)). Exempt from "tenant_id on every table": `plan_tiers`, `platform_admins`, `offboarded_users`, global `prompt_versions`, and nullable `jobs`/`team_tasks`/`audit_log`; this list is the T1 allow-list. Extensions: `btree_gist`, `vector`, `pg_trgm` in `extensions`; `public` is empty. Enums are CHECK-constrained text (easy to extend). Money in integer paise or `numeric`, never float.

### 3.1 Tenant, config, plans
| Table | Key columns |
|---|---|
| `tenants` | id, name, business_name, **`industry`, `services` (text[]), `business_address`, `google_maps_link`, `auto_reply_enabled bool default true`** (the profile fields the frontend PATCHes: `Onboarding.tsx:29`, `Settings.tsx:69,208`), owner_phone (must differ from the connected business number), `owner_last_inbound_at` (worker-written, owner alert window), **`owner_email`** (copied from the confirmed Auth email at provisioning; used for owner alerts, team-set, not API-updatable), `timezone`, `status`, `plan_code` FK, `limit_overrides jsonb`, onboarded_at. API UPDATE grant covers only the bold profile columns plus `business_name`, `owner_phone`. Worker honours `auto_reply_enabled` before any AI reply. GET `/users/{id}` response shape is checked against the frontend types in the contract tests |
| `tenant_members` | user_id (FK `auth.users`, UNIQUE), tenant_id, role (`owner`) |
| `platform_admins` | user_id |
| `tenant_config` (team-set, read-only to API) | tenant_id PK, `persona_name`, `persona_style`, `tone`, `languages text[]` (en, hi, mr), `business_hours jsonb` (weekday to list of open/close in local time; also the clock for booking holds and for escalation reminders, one resolver `add_business_time`), `holidays jsonb`, `holding_templates jsonb` (per language: holding reply, `received` ack and 4 h notice, version id, `approved_by`, `approved_at`; team-set, fixed wording, no LLM, unapproved never sent), `escalation_policy jsonb` (reminder offsets default 30 min, 2 h; customer notice 4 h; team escalation 24 business hours; holding cooldown 30 min), `away_message`, `max_discount_pct numeric(5,2)` CHECK 0..100, `quiet_hours jsonb`, `followup_policy jsonb` (steps, gaps, max), `catalog_schema jsonb` (the frontend `/schema`), `vertical` (`used_cars`), `config_version` |
| `plan_tiers` (global, read-all) | code PK, name, `max_messages_month`, `max_voice_seconds_month` (NULL, not enforced until voice is on, D10), `max_catalog_items`, `max_numbers`, `llm_cost_cap_paise_month`, `price_paise` NULL (no billing in v1) |
| `usage_counters` | (tenant_id, metric, period_start date in tenant tz) PK, `used bigint`. Metrics: `messages`, `voice_seconds` (recorded, not enforced until voice is on), `llm_cost_paise` |
| `llm_usage` | tenant_id (plain uuid, **no FK**), task, model, tokens_in/out, cost_paise, latency_ms, trace_id, created_at. Append-only; erased only by `offboard_tenant` ([0017](adr/0017-offboarding-audit-and-api-writes.md)) |

Limit check and increment are one statement. The `ON CONFLICT ... WHERE` filter does not run on a first insert, so the first insert is guarded too: `INSERT ... SELECT $tenant,$metric,$period,$n WHERE $n <= $limit ON CONFLICT (tenant_id,metric,period_start) DO UPDATE SET used = usage_counters.used + $n WHERE usage_counters.used + $n <= $limit RETURNING used`; no row returned means limit reached ([0003](adr/0003-durable-inbox-and-job-claiming.md)). `CHECK (used >= 0)` only; the limit lives in the statement. `messages` and `voice_seconds` are reserved before the work. `llm_cost_paise` is a pre-flight estimate (reserve) then a post-hoc true-up from `llm_usage`. Catalog count is checked under `SELECT ... FOR UPDATE` on a per-tenant `usage_counters` row (metric `catalog_items`), not the `tenants` row, so profile edits never block. A Sheets import at the limit inserts up to the limit, skips the rest, and reports `skipped_over_limit` in the sync result (no all-or-nothing failure).

### 3.2 Channels, secrets, integrations
Provider portability rules (neutral names, cutover handling): [06-provider-portability](06-provider-portability.md) s3, [0028](adr/0028-provider-portability.md).
| Table | Key columns |
|---|---|
| `whatsapp_numbers` | id, tenant_id, provider (text, checked in code, not a DB enum; v1 value `chatsyncs` is data), `provider_config_secret_id` (per business; a ChatSyncs token is never shared across tenants), `capabilities` jsonb, `provider_number_ref`, phone_e164, **UNIQUE (provider, provider_number_ref)** and UNIQUE phone (one tenant per number, FR-4), `capabilities` is an audit snapshot only; webhook keys live in `endpoint_keys` (below), status (`active`,`paused`,`provisioning`,`switching`), `connection_status`, `last_health_at` |
| `endpoint_keys` (system tier only; [0028](adr/0028-provider-portability.md)) | id, `provider`, `scope` (`number`,`app`), `number_id` or `app_id`, `key_hash` (sha256, UNIQUE; raw key shown once), `secret_id` (webhook verification secret), `mode` (`live`,`drain`,`revoked`), `valid_until`. Several per number (live plus old drain key). Routing uses the key's own provider |
| `provider_apps` (platform, system tier only) | id, `provider`, `secret_id` (app-level secret and verify token for providers with one webhook for all numbers). No `app_user` grant |
| `webhook_dead_letters` (platform) | Deliveries not assignable to a number or unparseable: redacted headers, body, reason, time; 14-day retention |
| `tenant_secrets` (no grant to `app_user`) | id, tenant_id, kind (`provider_config` (WhatsApp provider blob, was `chatsyncs_token`; for ChatSyncs it holds that business's own account `apiToken` and `phone_number_id`, one account per business, never a shared token: D11), `calcom_api_key`, `calcom_webhook_secret`; WhatsApp webhook secrets live on `endpoint_keys.secret_id`), `ciphertext`, `nonce`, `wrapped_dek`, `kms_key_id`, `version`, `rotated_at` |
| `tenant_integrations` | tenant_id, kind (`sheets`,`calendar`), `provider` (`google_sheets`, `calcom`), external_id (sheet id, or Cal.com event type id), `secret_id` (API key; webhook secret in a second `tenant_secrets` row), `endpoint_key_hash` for the Cal.com webhook (UNIQUE), status (`ok`,`reauth`,`unset`; `reauth` = Cal.com 401), last_sync_at. UNIQUE (provider, external_id) so one event type cannot serve two tenants ([0006](adr/0006-per-tenant-integrations.md) for Sheets, [0026](adr/0026-calendar-via-calcom.md) for calendar) |
| `message_templates` | tenant_id, purpose (`followup_nudge`, `visit_reminder`, `reengage`, `owner_alert`, `owner_reply`, `team_notice`), `external_ref` (was provider_template_id), `provider`, language, variables_schema, status; UNIQUE (tenant_id, purpose, language, provider) |

### 3.3 Conversations and messaging
| Table | Key columns |
|---|---|
| `contacts` (frontend "customers") | tenant_id, `contact_key` (`tel:+E164` or `ref:<id_space>:<sender_ref>`), `phone_e164` nullable, **UNIQUE (tenant_id, contact_key)**, name, language, `opted_out_at`, `consent_source`, notes, profile fields |
| `leads` | tenant_id, contact_id, stage (new, interested, quoted, negotiating, closed), interest refs; UNIQUE (tenant_id, contact_id) |
| `conversations` | tenant_id, contact_id, number_id, **UNIQUE (tenant_id, contact_id, number_id)** (H-12), `last_inbound_at`, `last_outbound_at`, `ai_paused`, `unread`, status |
| `inbound_events` (durable inbox) | tenant_id, number_id, provider, `id_space`, `provider_message_id`, `event_ts`, `received_at`, payload jsonb (redacted per retention), status; **UNIQUE (number_id, id_space, provider_message_id)**, `raw` kept (same message id on another number is a different row; ADR 0003 aligned) |
| `messages` | tenant_id, conversation_id, direction, `provider_message_id` (**UNIQUE (tenant_id, id_space, provider_message_id)** where not null), `provider`, `id_space`, type, body, `media_key` (S3 key, never a URL), transcript, transcript_confidence, `source` (`customer`,`agent`,`owner`,`system`), `prompt_version_id`, `trace_id`, delivery status, created_at |
| `outbound_messages` (outbox, **worker-written only**) | tenant_id, conversation_id, **`idem_key` UNIQUE per tenant**, purpose, mode (`session`,`template`), template_id, body, status (`queued`,`sending`,`accepted`,`sent`,`delivered`,`read`,`failed`,`unknown`), provider_message_id, `provider`, error_code, attempts |

### 3.4 Work, review, follow-ups
| Table | Key columns |
|---|---|
| `jobs` | tenant_id (NULL only for maintenance), conversation_id NULL, kind, payload, status, `run_at`, `locked_by`, `locked_until NOT NULL`, attempt, **UNIQUE (kind, dedup_key)** ([0012](adr/0012-system-access-tier.md) for claim and index) |
| `followups` | tenant_id, conversation_id, contact_id, step, `due_at`, status (`pending`,`sent`,`skipped`,`cancelled`), skip_reason, template_purpose, job_id; UNIQUE (tenant_id, conversation_id, step) |
| `review_items` (escalations, [0025](adr/0025-hold-and-escalate.md)) | tenant_id, conversation_id, kind (`held_reply`,`escalation`,`held_window`,`unknown_send` (alert-only),`ai_failure`), reason, `draft_body` (shown in email and WhatsApp alerts only; compared with the owner's reply for eval edit distance), source_message_id, status (`open`,`resolved`,`expired`), `resolution` (`owner_replied` on accepted send only,`owner_resumed`,`opted_out` with status `expired`,`superseded`), resolved_at; **holding reply:** `holding_outbound_id` (NULL if not sent: opt-out, `ai_paused`, window closed), `holding_sent_at`; **alerts:** `opened_at`, `clock_started_at` (opened_at, or next opening if outside hours), `notify_status jsonb` (per channel `email`, `whatsapp`: `pending`,`sent`,`failed`, with attempts and last error code, no body), `owner_notified_at`; **reminders:** `reminder_30_at`, `reminder_120_at`, `customer_notice_at`, `customer_notice_status` (`sent`,`skipped_window`), `escalated_to_team_at`, `held_window bool` (timestamps set when sent; due times live in the jobs, dedup `review:{id}:{r30,r120,t240}`); index (tenant_id, status, created_at); **UNIQUE (conversation_id) WHERE status='open'** ([0023](adr/0023-run-races-and-review-concurrency.md)). Approve, edited_sent and rejected are gone |
| `agent_runs` | tenant_id, conversation_id, job_id, run_id, trace_id, prompt_version_ids, config_version, tool_calls jsonb (names and outcomes, no raw PII), guard_result, outcome, restarts, tokens, started_at, finished_at. Class C (worker-only, no `authenticated` grant); no FK to `messages`; cascade-deleted on offboarding; retention 90 days proposed ([0018](adr/0018-agent-graph-tools-and-caps.md), [0023](adr/0023-run-races-and-review-concurrency.md)) |
| `bookings` | tenant_id, contact_id, `slot tstzrange`, status (`held`,`confirmed`,`cancelled`,`expired`), `hold_expires_at` (default 2 h in business hours, see [0022](adr/0022-booking-confirmation-and-hold-ttl.md); `awaiting_confirmation` flag; job `expire_holds` frees stale holds), calendar_integration_id, `client_event_id` (our booking id stored in Cal.com metadata), external_event_id (Cal.com booking uid), `source` (`agent`,`calcom_webhook`), **EXCLUDE USING gist (tenant_id WITH =, calendar_integration_id WITH =, slot WITH &&) WHERE status IN ('held','confirmed')** (needs `btree_gist`) |
| `tasks` | frontend tasks and appointments: tenant_id, contact_id, title, `due_at`, is_completed, kind (`visit`,`manual`), booking_id NULL (UNIQUE when set), `deleted_at` tombstone. The `/tasks` serializer derives `due_date` (IST) and `appointment_time` and the title template ([02 s8](02-architecture.md)). Visit rows are written and kept in sync by the worker from Cal.com bookings, so the Appointments page needs no change ([0026](adr/0026-calendar-via-calcom.md)) |
| `calendar_inbox` | tenant_id, integration_id, provider event id, payload (redacted), received_at, status; UNIQUE (integration_id, provider event id). Cal.com webhook inbox, same pattern as `inbound_events`; class C |
| `team_tasks` | tenant_id NULL ok, kind, payload, status (Vyavsay-team onboarding and alerts; no tenant grants) |
| `audit_log` | tenant_id NULL ok (plain uuid, **no FK**), actor_kind/actor_id, action, target, meta jsonb (no PII), at. Append-only: INSERT only, trigger blocks UPDATE/DELETE unless the transaction is inside `offboard_tenant` (M-24, [0017](adr/0017-offboarding-audit-and-api-writes.md)) |
| `offboarded_users` | user_id PK, at. Tombstone so a deleted Auth user cannot be re-provisioned; no grants to API |

### 3.5 Catalog, knowledge, prompts
| Table | Key columns |
|---|---|
| `catalog_items` | tenant_id, name, status (`available`,`sold`,`reserved`), `attributes jsonb` (per `catalog_schema`), list_price, photo_urls, source (`manual`,`sheet`,`file`), `sheet_row_key` (UNIQUE per tenant where not null, upsert key for H-30), content_hash |
| `catalog_pricing` | tenant_id, item_id, `min_price`, `cost_price`. Separate table so retrieval and prompt-building queries structurally cannot select it; only the deterministic floor-price check reads it (H-28) |
| `knowledge_docs` | tenant_id, title, content, content_hash, status |
| `embeddings` | tenant_id, `catalog_item_id` NULL, `knowledge_doc_id` NULL (composite FKs, `ON DELETE CASCADE`, CHECK exactly one set), chunk_ix, content_hash, `model`, `model_version`, `embedding extensions.vector(N)` ([0015](adr/0015-embeddings-storage.md)) |
| `prompt_versions` | id, `key` (e.g. `agent.system`), `tenant_id` NULL = global, version int, body, status (`draft`,`active`,`retired`), created_by, created_at. UNIQUE (key, coalesce(tenant_id, zero-uuid), version); partial UNIQUE on one `active` per (key, tenant). Immutable: no UPDATE grant on `body`. Resolution: tenant override else global; the chosen id is stored on `messages.prompt_version_id` |

### 3.6 Separate schema: `langgraph`
Checkpoint tables are created by a **migration** (pinned `langgraph-checkpoint-postgres` schema, **verify**); `setup()` is never run in staging or prod, and CI compares the migrated tables with what `setup()` would create (drift check). Tables get RLS forced with a `worker_role` policy on the thread prefix: `thread_id LIKE (select private.worker_tenant_id())::text || ':%'`; `thread_id` is `{tenant_id}:{conversation_id}`. The checkpointer is given the connection from `tenant_tx`, so `app.tenant_id` is set (session-mode pooler, architecture section 9). No grants to `authenticated`, `webhook_role` or `anon`. `langgraph` is in the T1 scan and in T9 and T19. Agent tools get no SQL access (E5).

## 4. RLS approach
Principles from the Supabase guidance: RLS on, forced, in every table; `TO authenticated` plus an ownership predicate (never role alone); UPDATE has `USING` and `WITH CHECK`; no `user_metadata`; no `auth.role()`; views `security_invoker`; SECURITY DEFINER only in `private` and listed.

```sql
-- helpers (private schema, not exposed)
create function private.current_tenant_id() returns uuid
  language sql stable security definer set search_path = '' as
$$ select tenant_id from app.tenant_members where user_id = (select auth.uid()) $$;
create function private.worker_tenant_id() returns uuid
  language sql stable set search_path = '' as
$$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

alter table app.catalog_items enable row level security;
alter table app.catalog_items force row level security;
create policy t_all on app.catalog_items for all to authenticated
  using (tenant_id = (select private.current_tenant_id()))
  with check (tenant_id = (select private.current_tenant_id()));
create policy w_all on app.catalog_items for all to worker_role
  using (tenant_id = (select private.worker_tenant_id()))
  with check (tenant_id = (select private.worker_tenant_id()));
```
| Rule | Detail |
|---|---|
| Fail closed | No membership or no `app.tenant_id` yields NULL, so no rows and no inserts. |
| Two policy sets | One per role, never one policy with an OR (supersedes the OR wording in ADR 0002), so a worker GUC can never open an API path and a JWT never opens a worker table. |
| Table classes | **A** tenant CRUD (catalog, contacts, leads, tasks, knowledge, bookings): both policies; write policies add `AND private.tenant_active()` to WITH CHECK. **B** read for API, write for worker (conversations, messages, `review_items`): `authenticated` SELECT, worker full. `review_items` has no `authenticated` UPDATE: the owner's composer message is stored by the worker, which resolves the item in the same transaction; `PATCH ai_paused=false` calls a narrow definer `private.owner_resolve_review(conversation_id)` (tenant from `current_tenant_id()`, guarded UPDATE, audit row). `ai_paused` itself keeps its narrow column grant. **C** worker-only (`jobs`, `agent_runs`, `outbound_messages`, `inbound_events` read, secrets, usage writes, `llm_usage`, `langgraph`): no `authenticated` policy and no grant. **D** global read (`plan_tiers`, global `prompt_versions`): `SELECT USING (tenant_id IS NULL)` style, no writes. **E** append-only (`audit_log`, `llm_usage`). |
| API enqueue | **No INSERT grant** on `jobs` or `outbound_messages`. Owner actions (send a manual reply, sync Sheets, pause AI) call `private.enqueue_owner_action(kind, args)`: definer, tenant from `current_tenant_id()`, `tenant_active()` required, `kind` allow-listed, args validated. It writes one `jobs` row. The worker alone writes the outbox, after the deterministic post-step (opt-out, window, floor price, quota; [0009](adr/0009-agent-durability-and-review-queue.md)) ([0017](adr/0017-offboarding-audit-and-api-writes.md)). |
| Mass assignment | Column-level GRANT UPDATE: on `tenants` only the profile columns listed in 3.1; `plan_code`, `status`, `limit_overrides`, `tenant_config` are not updatable by the API (FR-20). Tested at DB level (T17), not only via routes. |
| Performance | `(select ...)` wrapper makes the lookup a once-per-statement initplan; index `tenant_members(user_id)`; every tenant index leads with `tenant_id`. Check with `EXPLAIN` in tests. |
| Views | `WITH (security_invoker = true)` always. Analytics are queries over base tables, not owner-run views (H-02). |
| Pooler | `SET LOCAL` only inside a transaction, safe on transaction pooling (**verify**, incl. prepared statements: asyncpg `statement_cache_size=0` or psycopg `prepare_threshold=None`). Session-mode pooler for worker and checkpointer (architecture section 9). |

## 5. Backend enforcement on every query
| # | Rule | Enforced by |
|---|---|---|
| E1 | One door: `tenant_tx(ctx)` is the only function that returns a connection. `ctx` is a frozen `TenantCtx(tenant_id, user_id, mode)` built from the verified JWT (api) or the job row (worker). | import-linter forbids the DB driver outside `app/db`; code review rule |
| E2 | `tenant_tx` begins a transaction, sets role and claims or `app.tenant_id` with `set_config(..., true)`, and verifies by reading back `private.current_tenant_id()` or `worker_tenant_id()` equals ctx, else abort. | unit and integration tests |
| E3 | Repositories take `ctx` and also write `WHERE tenant_id = $ctx` (index use, readable intent). RLS is the backstop, not the only filter. | repo template, probes |
| E4 | Client-supplied user or tenant ids are ignored; path ids are looked up inside the tenant, cross-tenant id gives 404. | contract tests, probes |
| E5 | Agent tools get `ctx` bound at graph build time. No tool argument carries a tenant id. Retrieval functions read the tenant from the session context. | agent tests |
| E6 | System functions are called only from `app/db/system.py`, one wrapper per function, each with a probe. | [0012](adr/0012-system-access-tier.md) |
| E7 | Pool-level guard: connection reset (`RESET ALL`, role reset) when returned; a transaction that finds a stale `app.tenant_id` outside `tenant_tx` is a failure. | leak test (section 9) |

## 6. Secrets and token encryption
| Item | Design |
|---|---|
| Scheme | Envelope: per-secret random 256-bit DEK, AES-256-GCM, AAD = `tenant_id|kind|version`; DEK wrapped by an AWS KMS CMK with encryption context `{tenant_id, kind}`; row stores `ciphertext`, `nonce`, `wrapped_dek`, `kms_key_id`, `version`. |
| Access | Table `tenant_secrets` has no grant to `app_user`. Decrypt runs in worker adapters (and the admin onboarding script). KMS IAM: `Decrypt` for the worker task role only; the api task role has `Encrypt` for the admin endpoint if any. |
| Never | Returned by an API, logged, put in a job payload, or stored in checkpoints. Python type `Secret` with redacting repr; the redacting logger (FR-25) covers it. |
| Webhook keys | Only `sha256(endpoint_key)` stored (`endpoint_keys`), compared in constant time. Signing secrets are encrypted rows referenced by `endpoint_keys.secret_id`. |
| Rotation | New `version` row, atomic swap, old row purged after grace. Re-wrap job on CMK rotation. A Cal.com 401 sets the integration `reauth`. |
| Offboarding | `offboard_tenant` deletes secrets first, revokes at provider where an API exists (H-36); full steps in [0017](adr/0017-offboarding-audit-and-api-writes.md). |
| Why not Supabase Vault | Vault/pgsodium is in-DB; a DB dump plus key access would expose both. KMS keeps the key outside the database (Vault status and deprecations: **verify**). |

## 7. pgvector for RAG
See [0015](adr/0015-embeddings-storage.md). Summary: extension in `extensions`; one `embeddings` table; model and version stored per row; stable text only; tenant filter inside `search_embeddings`; exact per-tenant search first, HNSW later when a tenant is large (**verify** pgvector version for iterative scan); hybrid ranking (filters, vector, `pg_trgm` or full-text on `catalog_items`) is specified in the agent design doc. Retrieval errors raise typed errors (H-29).

## 8. Migrations as code
See [0016](adr/0016-migrations-and-schema-invariants.md).
| Step | Detail |
|---|---|
| Layout | `supabase/migrations/NNNN_*.sql`; seed (plan tiers, global prompts) as migration |
| Order | 1 extensions, roles, schemas; 2 core tables; 3 RLS helpers and policies together with each table (same file); 4 system functions; 5 seed |
| Safety | Forward-only; expand then contract; no data migration (fresh DB); migrations run only in CI migrate job |
| Local | `supabase start`, `supabase db reset`, tests run against it |
| Gate | Catalog invariant test, drift check, advisors, and the RLS suite must pass before staging migrate |

## 9. RLS and isolation test plan
Seed two tenants A and B with identical shapes (same item names, same embedding vectors, same phone numbers where allowed). Tests written before the schema (TDD).
| # | Test | Expect |
|---|---|---|
| T1 | Catalog invariant query over `app`, `langgraph`, `public`, `private`, `extensions`: RLS enabled and forced (exempt list in section 3), at least one policy, no `anon`/PUBLIC grants, SECURITY DEFINER allow-listed with pinned `search_path`, views `security_invoker`, `public` has no tables, `app_user` and `worker_user` have zero base grants | CI fails on any violation |
| T2 | Per table, per role (`authenticated` A, `worker_role` A): SELECT, INSERT with B's tenant_id, UPDATE setting tenant_id to B, DELETE of B's row | B rows invisible; writes rejected or 0 rows |
| T3 | No context (no membership, `app.tenant_id` unset, `anon`) | 0 rows, inserts fail |
| T4 | Context leak: tx for A, commit, same pooled connection tx for B; also failed and rolled-back tx | B never sees A; GUC cleared |
| T5 | Composite FK: message in A pointing at B's contact or conversation | FK error |
| T6 | Every system function: callable only by its roles, returns only listed columns and only the context tenant's rows, EXECUTE denied to `authenticated` where worker-only, one `audit_log` row | pass |
| T7 | API routes: for each route and id param, use B's id from A's token; `?userId=B`; body with `tenant_id`, `plan_code`, `status` | 404 or ignored; no change in B; no plan change |
| T8 | Worker handlers: job for A with payload containing B's ids; handler run | no read or write of B |
| T9 | `tenant_secrets`, `langgraph.*`, `jobs`, `outbound_messages` read or write as `app_user`; stray `RESET ROLE`; `webhook_user` anything beyond inbox insert | permission denied |
| T10 | Vector search with identical vectors in A and B | only A rows |
| T11 | Owner overview as non-admin; as admin | denied; counts only, audited |
| T12 | `EXPLAIN` of the 10 hottest queries (named in the repo: inbound claim, history load, catalog filter, vector search, usage upsert, review list, conversations list, contact lookup, followup due, booking overlap) | tenant index used; initplan for the helper |
| T13 | Webhook for unknown `endpoint_key`; replayed message id; same id on another number | 404; one row; separate rows |
| T14 | Usage limit at the boundary under 20 parallel calls, including the empty-row first insert (90 seconds against a 60 limit) | never exceeds limit; first insert rejected |
| T15 | Tenant offboarding | zero rows for the tenant in `app` and `langgraph`; `audit_log` rows keep only action, time and an anonymised ref; `llm_usage` rows gone; secrets gone; S3 prefix, Langfuse traces and provider token revoked per checklist; Auth user deleted and tombstoned |
| T16 | Retention: purge jobs `purge_messages`, `purge_audio`, `purge_inbound_payload`, `purge_checkpoints` on aged seed rows | only aged rows purged, tenant-scoped |
| T17 | Direct SQL as `authenticated` updating `plan_code`, `status`, `limit_overrides` | permission denied |
| T18 | `pending` and `suspended` tenant: write to catalog, call `enqueue_owner_action`, via SQL and via routes | denied at the DB |
| T19 | Worker context A loads thread of B from the checkpointer; migrated tables equal `setup()` output | not found; no drift |
| T20 | Parallel `provision_tenant` (10 calls, same user); unconfirmed email; tombstoned user re-login; argument spoof | one tenant; refused; refused; no argument exists |
| T21 | Append-only trigger: UPDATE or DELETE on `audit_log` outside `offboard_tenant` | rejected |
| T22 | Embeddings: delete a catalog item or doc | its vectors are gone (FK cascade); no orphans |
| T23 | Booking hold older than TTL | `expire_holds` frees the slot |
| T24 | Sheets import beyond catalog limit | inserts up to limit, reports `skipped_over_limit`, profile edit not blocked |
| T25 | Fresh DB: migrations only, no `setup()` call, then app boots | passes |

## 10. How audit findings on tenancy are closed
| Finding | Closed by |
|---|---|
| H-01 No RLS, service role everywhere | RLS forced on all tables, two role policy sets, schema `app` unexposed, `anon` no grants, service role migrations only (sections 2, 4) |
| H-02 Analytics leak, `wb_messages` has no user id | `tenant_id` on every table including `messages`; analytics are RLS queries; owner overview aggregates via audited functions; T7, T11 |
| H-04 / H-05 Tenant fallbacks (first user, oldest user, env token) | No fallback code path: tenant from membership or from number key; unknown key 404 (T13); `whatsapp_numbers` UNIQUE |
| H-07 Plaintext tokens | Envelope encryption, no API grant (section 6) |
| H-09 Public media buckets | `media_key` stored, signed URLs at read ([0010](adr/0010-config-secrets-media.md)) |
| H-10 Schema not reproducible | Migrations as code, fresh build in CI ([0016](adr/0016-migrations-and-schema-invariants.md)) |
| H-12 Duplicate conversations and leads | UNIQUE (tenant_id, contact_id[, number_id]); inserts use ON CONFLICT |
| H-13 Message dedupe and loss | `inbound_events` UNIQUE (number_id, id_space, provider_message_id), idempotent outbox key ([0003](adr/0003-durable-inbox-and-job-claiming.md)) |
| H-16 No quota or cost accounting | `plan_tiers`, `usage_counters`, `llm_usage`, atomic limit check |
| H-17 / M-28 In-memory reminders, any-hour sends | `jobs`, `followups`, `bookings` rows; quiet hours and timezone in `tenant_config` |
| H-19 Server timezone in prompts | `tenants.timezone`, one resolver, timestamptz everywhere |
| H-23 No opt-out | `contacts.opted_out_at`, consent source, send-time check |
| H-25 Persona hardcoded | `tenant_config` and versioned `prompt_versions` with tenant override |
| H-28 Floor price in prompt, cost columns leak | `catalog_pricing` separate table, `max_discount_pct` in config |
| H-30 Global sheet, cross-tenant import | `tenant_integrations` per tenant, `sheet_row_key` upsert key, embeddings on import |
| H-36 / M-06 / L-19 No offboarding, no retention | `ON DELETE CASCADE`, `offboard_tenant` (data, `langgraph`, audit scrub, Auth user delete, tombstone, provider revoke, S3 and Langfuse checklist), purge job kinds, T15, T16 ([0017](adr/0017-offboarding-audit-and-api-writes.md)) |
| M-02 Email not confirmed, no suspend | `provision_tenant` needs confirmed email; `suspended` enforced in policies (T18, T20) |
| M-01 Cross-tenant references | Composite FKs, T5 |
| M-05 / L-09 Embedding hygiene | `embeddings` with model, version, content hash, stable text ([0015](adr/0015-embeddings-storage.md)) |
| M-24 No audit trail | Append-only `audit_log` |

## Needs owner decision
1. **Open self-signup.** The frontend lets anyone sign up (`Login.tsx:26`). This design makes that safe (a `pending` tenant has no access to data, AI or sends) but it still creates empty rows and consumes Auth quota. Options: keep it with email confirmation and rate limits (no frontend change), or invite-only (needs a text-and-button change in `Login.tsx`: flag with this evidence).
2. **Plan tier limits and prices.** Columns exist; the numbers (messages, items, LLM cost cap; voice minutes later, column stays NULL until voice is on) are still unset (decision 12).
3. **Data retention periods** per table (messages, audio, inbound payloads, checkpoints): proposal is 12 months messages, 30 days audio, 30 days payload bodies, 7 days checkpoints. Confirm for DPDP.
4. (Settled D3) No approval: the owner replies in the composer; `review_items` has no API UPDATE grant. Open: should deleting a visit task cancel the Cal.com booking (default no, [0026](adr/0026-calendar-via-calcom.md))?
5. **Offboarding erasure scope**: audit rows are kept anonymised (action, time, hashed tenant ref) and `llm_usage` is deleted. Confirm for DPDP ([0017](adr/0017-offboarding-audit-and-api-writes.md)).
6. **Embedding model and dimension** (affects `vector(N)`): confirm Jina model from decision to keep Jina.

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| `SET LOCAL` and role switching on the Supabase transaction pooler (and prepared statements) | Lost tenant context or errors | Read-back check in `tenant_tx` (E2); test T4 in M1; fall back to session pooler for API (**verify**) |
| System functions widen the trust surface | Cross-tenant read | Allow-list, T6, audit, review for each addition |
| Membership lookup in every policy | Latency | Initplan wrapper, index, T12; cache not needed at pilot scale |
| Open signup abuse | Row spam, Auth quota | Rate limit, email confirmation, pending tenants do nothing |
| Exact vector search at large tenant size | Slow retrieval | Named HNSW trigger; metrics on search latency |
| Escalation clock uses business hours from config; wrong hours stretch or shrink reminders | Late or early alerts | Onboarding check on hours; fake-clock tests; alerts themselves are immediate |
| Version-sensitive: Supabase Data API exposure defaults, Vault, `auth.uid()` GUC format, pgvector iterative scan, uuidv7 | Wrong assumption | **Verify** once MCP docs are authenticated, before M1 |
| Worker holds decrypt rights for all tenants | Worker compromise leaks all tokens | Encryption context per tenant, KMS audit alarms, short-lived in-memory cache |
| FK cascade delete is powerful | Accidental tenant wipe | No DELETE grant to app roles; `offboard_tenant` requires status `offboarding` and an audit row |
| Definer function owner may not bypass RLS on hosted Supabase | Functions return nothing, or wrong owner choice | Decide at M1 (**verify**); explicit tenant predicates in every function; T6 |
| `langgraph` table shape changes with library versions | Drift, checkpointer errors | Pin version, migration plus drift test (T19, T25) |

## Review log
| Feedback | Result |
|---|---|
| Blocker 1 API grants | Fixed: no INSERT grant; `enqueue_owner_action`; ADR 0017 |
| Blocker 2 append-only vs cascade | Fixed: no FK on `audit_log`/`llm_usage`, scoped trigger exemption, T15, T21; ADR 0017 |
| Blocker 3 tenants columns | Fixed: profile columns and `auto_reply_enabled` added (3.1); GET shape checked in contract tests |
| Blocker 4 `langgraph` | Fixed: migration-created, RLS on thread prefix, T1, T9, T19, T25 |
| Blocker 5 `provision_tenant` | Fixed: `auth.uid()`, advisory lock, ON CONFLICT, tombstone, confirmed email, T20 |
| Blocker 6 status in DB | Fixed: `tenant_active()` in write policies, T18 |
| Usage upsert, ADR 0015, ADR 0002/0003, T1 exempt list, definer owner, webhook role, purge jobs, hold TTL, pg_trgm, catalog partial import, missing tests | Taken (sections 2, 3, 9; ADRs 0002, 0003, 0015 edited) |
| Owner answers D1 to D8 (2026-10-07) | Applied in 3.1, 3.2, 3.4, 4 and ADRs 0025 to 0027 |
| Per-secret KMS call latency | Rejected for now: already in Risks, cache is a pilot-scale optimisation |
| Partitioning and an export route for retention | Rejected for v1: purge jobs suffice at pilot scale; revisit with owner decision 3 |
