# 01 Gap Register

1. This register merges ~280 verified findings from all audit dimensions into 92 gaps.
2. Counts: 2 critical, 37 high, 31 medium, 22 low.
3. Biggest themes: tenant isolation (no RLS, fallbacks), lost messages (ack then in-memory work), shared AI quota with silent failure, no tests/CI/backups, WhatsApp window and consent rules.
4. The frontend is reused as-is. Only 5 gaps need a frontend change (marked "Yes").
5. Secrets are redacted as [REDACTED]. Some live-DB facts (RLS, backups, Supabase plan) could not be verified from the repo.

## Counts by severity

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 37 |
| Medium | 31 |
| Low | 22 |
| Total | 92 |

## Top 10 critical/high (one line each)

1. C-01 Outbound Vapi call endpoint dials any number with no validation, cap or consent.
2. C-02 (resolved by owner: AWS account is theirs). Remaining: no IaC, no rebuild plan, now Medium.
3. H-01 No RLS anywhere; isolation is only app-level filters with the service-role key.
4. H-13 Messages are acked then processed in memory; dedup row blocks retries; crashes lose messages.
5. H-03 Vapi webhook accepts everyone when its secret is unset.
6. H-04 Vapi tenant falls back to the first user or trusts payload userId.
7. H-15 LLM failure becomes canned replies and fake analysis; no alert, no owner notice.
8. H-16 One shared free-tier Groq key for all tenants; no quota, rate limit or cost tracking.
9. H-11 No verified backup/PITR; storage buckets are not backed up.
10. H-34 Zero tests, no CI, so a one-week silent AI outage can recur.

## Critical

| ID | Title | Evidence | Why it matters | Fix direction | Frontend change? |
|---|---|---|---|---|---|
| C-01 | Outbound Vapi dial is open to any signed-in user | vapi-routes.ts:192-211, ~314 (no E.164 check), ~321 shared Vapi key; not in PUBLIC_ROUTES so any JWT works; also no consent/DNC check | Fresh account can script unlimited or premium calls; toll fraud, spam, number blocking for all tenants; prompt injection via customerName | E.164 + country allowlist, paid-plan gate, per-user and global daily caps, call ledger, consent/DNC, sanitise prompt fields | No |
| C-02 | RESOLVED (owner confirmed AWS account is theirs; remaining no-IaC risk is Medium). Was: production compute in a third party's AWS account | PROJECT_HANDOFF.md:65-68, 128, 203, 238; single t3.micro; no IaC/AMI/runbook; registrar/DNS owner undocumented | Access loss or suspension takes the WhatsApp webhook down with no rebuild path | Move/rebuild in owner-held account, Elastic IP, bootstrap script, DNS ownership doc, one-page rebuild runbook with RTO | No |

## High

### Security and tenancy

| ID | Title | Evidence | Why it matters | Fix direction | Frontend change? |
|---|---|---|---|---|---|
| H-01 | No RLS; isolation is app-level only | No RLS/POLICY/GRANT in migrations; service-role client (supabase-plugin.ts:11-12); anon key shipped in frontend; RPCs take caller p_user_id | If live DB has no RLS, the public anon key reads/writes all tenants; one missed `.eq('user_id')` leaks. Live state unverified | RLS deny-by-default on all tables, revoke anon grants, user-scoped client, cross-tenant CI probe | No |
| H-02 | Analytics leaks across tenants; wb_messages has no user_id | health-routes.ts:26-31 counts all messages; no user_id column; Analytics.tsx:58 reads `totalMessages` which API omits | Tenants see platform volume; Chat Volume tile always 0; row-cap miscounts | Add user_id (backfill), SQL count/RPC scoped by tenant, return `totalMessages`, keep keys | No |
| H-03 | Vapi webhook fails open | vapi-routes.ts:11-13 returns true if secret unset, plain `===`; placeholder secret voice-service.ts:459; public route | Anyone can POST tool-calls as a tenant (inventory, bookings, WhatsApp sends) | Fail closed at boot, timingSafeEqual, per-env secret, rotate | No |
| H-04 | Vapi tenant resolution trusts payload / first user | voice-service.ts:466-489 uses metadata.userId, else first wb_users row; outbound sets assistant.metadata but reader checks assistantOverrides.metadata (unverified) | Calls act on wrong tenant; forged webhook picks any tenant | Resolve from server-side wb_calls row by vapi_call_id or signed token; reject unknown | No |
| H-05 | Single-tenant env fallbacks | webhook-routes.ts:170-177 oldest user for platform number; whatsapp-cloud-client.ts:27-52 env token fallback | With 2+ tenants, inbound routes to wrong tenant, sends use platform identity | Remove fallbacks in prod; require active wb_waba_accounts row; fail closed | No |
| H-06 | Credentials and infra IDs in docs | README.md:6-8 test login and password [REDACTED]; PROJECT_HANDOFF.md lists Meta/WABA IDs, verify token, Supabase URL, AWS IDs; repo visibility unknown | Demo login works against live data; history keeps it | Rotate password and verify token, scrub docs/history, CI secret scan, fake demo tenant | No |
| H-07 | WABA tokens stored in plaintext | 009-waba-accounts.sql:19 "plaintext for now"; used directly (webhook-routes.ts:272-282); no revoke on offboarding | DB/backup leak or RLS gap hands out send credentials for every tenant | Vault/KMS encryption, rename column, rotate, revoke on exit | No |
| H-08 | Prod secrets only in untracked host .env | PROJECT_HANDOFF.md:131-134; keys listed (values not shown); one local copy | Instance loss means reissue of Meta token and service key; downtime | Owner-held secret manager, key inventory, reissue runbook | No |
| H-09 | Customer voice/images in public buckets | message-media-service.ts:19,71 public:true; catalog bucket public; migration 010; never deleted; client-supplied mimetype trusted | Anyone with URL reads customer media; cannot revoke; DPDP safeguard gap | Private bucket + signed URLs via tenant-checked endpoint, magic-byte checks, expiry | Yes |

### Data

| ID | Title | Evidence | Why it matters | Fix direction | Frontend change? |
|---|---|---|---|---|---|
| H-10 | Schema not reproducible; no migration process | Migrations 001-004, 006-011 (no 005); no DDL for wb_calls, wb_call_actions, ai_paused; manual SQL editor; no rollback; buckets by hand | Staging/DR build breaks; prod is only truth; upserts on vapi_call_id fail | pg_dump baseline, idempotent migrations, CLI runner in CI, clean-DB CI job, buckets as code | No |
| H-11 | Backups/PITR unverified; storage not covered | No backup/restore doc or script; PRD.md:1025 free-tier risk; catalog-image-service auto-recreates empty bucket | Possible unrecoverable data; unknown RPO/RTO | Confirm plan, enable PITR/daily backups, bucket copy off-account, restore drill | No |
| H-12 | Duplicate conversations/leads | 001-schema.sql:97 non-unique index; pipeline-service.ts:88-107 select `.single()` then insert; each webhook runs in parallel | Two quick messages split history; `.single()` then breaks that customer for good | UNIQUE(user_id, customer_jid) after dedupe, upsert, per-conversation lock, unique lead per conversation | No |
| H-13 | Messages lost: ack first, in-memory work, bad dedup | webhook-routes.ts:104-111 ack then setImmediate; dedup select-then-insert :199-216 with unchecked error; processed=true set even on pipeline failure; nothing retries processed=false; no unanswered view | Crash/deploy drops customer message and redelivery is skipped; concurrent retries double-reply | Durable inbox table/queue before ack, atomic insert-on-conflict claim, worker retry, sweeper, unanswered-chat query, replay tool | No |

### Reliability and cost

| ID | Title | Evidence | Why it matters | Fix direction | Frontend change? |
|---|---|---|---|---|---|
| H-14 | No backpressure or concurrency cap | webhook-routes.ts:104-111; no p-limit/queue anywhere; retry floods start N pipelines | 429s, OOM, event-loop lag after any downtime | Bounded queue and worker pool, per-tenant limits | No |
| H-15 | AI failure is silent and misleading | ai-router.ts:129-146 fake analysis (conf 0.3, reply allowed); aiFailure canned text; Promise.race timeouts do not abort; SDK default retries; no fallback provider; only console.error; week-long outage in 549575e | Customers get non-answers, lead data poisoned, owner never told | Typed degraded result, AbortController, bounded retry, breaker, fallback model, pause and notify owner, fallback-rate alert | No |
| H-16 | One shared free-tier key; no quotas or cost accounting | ai-router.ts:9-20 single Groq key; no @fastify/rate-limit; no usage table; rate limiters have no importers; embeddings/knowledge/catalog endpoints unmetered | One tenant exhausts quota for all; unbounded spend; plans cannot be priced. Token caps are assumptions | Paid tier, per-tenant quotas and usage table, userId-keyed rate limits, token budget, load test | No |
| H-17 | Reminders are in-memory timers | reminder-service.ts:21,45-73; server.ts starts only cron; setTimeout overflow >24.8d | Any restart drops reminders (no-show protection) | Persist reminder_due_at, poll worker with lock | No |
| H-18 | execSync ffmpeg blocks event loop | tts-service.ts:135-146, 8s timeout, temp file by Date.now | Stalls every tenant, webhook acks, health | Async spawn with timeout, concurrency 1-2, worker | No |
| H-19 | Prompt date/time uses server timezone | ai-router.ts:83-85, classify.ts:20-24 vs Asia/Kolkata in appointment-service | On UTC host, 00:00-05:30 IST gets wrong "aaj/kal"; wrong-day bookings | Compute in tenant timezone everywhere | No |

### WhatsApp channel

| ID | Title | Evidence | Why it matters | Fix direction | Frontend change? |
|---|---|---|---|---|---|
| H-20 | No templates or 24h-window tracking | whatsapp-cloud-client.ts:58-125 text/image/audio only; cron nudges leads 48h+ idle; reminders free-form; failures retry every 6h | Meta rejects most follow-ups/reminders (131047); feature looks fine in logs, delivers nothing | last_customer_message_at, template send and registry, typed window_closed, attempt cap | No |
| H-21 | Send results are bare booleans | client returns false; callers ignore; conversation-routes.ts:129-138 returns success:true after failure; no wamid saved | Owner sees success for undelivered replies; no retry logic | Typed result, outbox with status, non-2xx on failure (not 401) | No |
| H-22 | Delivery status webhooks ignored | webhook-routes.ts:126-142 reads only `messages`; no status column | Async failures invisible; no delivered/read | Store wamid, handle statuses idempotently, alert | No |
| H-23 | No consent or opt-out (STOP) | No consent code; cron nudges all stale leads; Vapi dials without DNC | Meta quality/ban risk, DPDP and TRAI exposure | Consent ledger, STOP detection, central send-policy gate | No |
| H-24 | Escalation/handoff is thin | tools.ts:176-184 reason unused, errors ignored; complaints do not pause AI (pipeline-service.ts:617-632); no owner alert, unread, resume or SLA; UI cannot tell escalated from paused | Customer told a human is coming; bot keeps replying; nobody notified | needs_human/reason/at fields, owner notification, resume timer, expose in GET /conversations | No |

### AI quality

| ID | Title | Evidence | Why it matters | Fix direction | Frontend change? |
|---|---|---|---|---|---|
| H-25 | Persona hardcoded, no per-tenant config | used-cars/index.ts "Rahul"; voice-service.ts "Priya ... Pune"; only 2 domains | Second business needs a code deploy; false persona | Per-tenant config table, versioned templates | No |
| H-26 | Prompt invents business claims | used-cars/index.ts: fake social proof, 150-point inspection, 6-month warranty, loan terms | Unverifiable claims on behalf of dealers; liability | Allow only tenant-supplied facts, remove fabricated tactics | No |
| H-27 | No post-generation grounding check | ai-router.ts:~249 returns raw output; temp 0.7; only top 5 items | Wrong price/stock stated as commitment | Verify prices/names vs retrieved rows, regenerate or handoff, lower temp | No |
| H-28 | Negotiation reveals floor; internal attributes in prompt | pipeline-service.ts:1152,1184,1193-1213 default 8% floor stated; ai-router.ts:169-190 only SKIP_KEYS filter so min_price/cost enter prompt | Floor learned on first lowball; cost columns can leak | Discount authority default zero, never state floor, allow-list public attributes | No |
| H-29 | Retrieval failures look like "no match" | rag-service.ts:30-49, catalog-service.ts:386-404 return [] on any error | Jina outage means ungrounded answers, no signal | Typed result, metrics, retry/breaker, degrade explicitly | No |
| H-30 | Sheets sync skips embeddings; sheet is global | sheets-sync-service.ts:193-211 no embedding; replaces attributes; one GOOGLE_SHEET_ID, cron syncs arbitrary user | Items invisible to semantic search; cross-tenant import/overwrite | One catalog upsert path, content-hash re-embed, per-tenant sheets | No |
| H-31 | Ordinary queries use name ilike only | catalog-service.ts:419-439; semantic only for sold alternatives | "cheap diesel SUV" and Hinglish misses | Hybrid retrieval (filters + vector + lexical), rerank, scores | No |

### Ops, testing, privacy, frontend contract

| ID | Title | Evidence | Why it matters | Fix direction | Frontend change? |
|---|---|---|---|---|---|
| H-32 | Manual deploy, no CI/CD or rollback | No .github; compose `build:` only; git pull and rebuild on host | No tests, tags or rollback; --force-recreate incident | CI, tagged images, health-gated deploy, staging | No |
| H-33 | Health stub; no metrics or alerts | health-routes.ts:10-20 static ok; no HEALTHCHECK; no OTel/Sentry; errors after ack lost | Dead DB or AI still reports ok | /livez /readyz, metrics, Sentry, alert on fallback and signature failures | No |
| H-34 | Zero tests, no CI, untestable singletons | No test files/script; module-level clients; config calls process.exit; no contract tests | Every past regression had no guard; rewrite parity unprovable | vitest + CI first, DI ports, webhook fixtures, contract and two-tenant tests, eval set | No |
| H-35 | Privacy policy misstates processors | PrivacyPage.tsx:17,45,56,64 lists OpenAI/GitHub Models; real: Groq, Gemini, Jina, Vapi; placeholder Udyam | Inaccurate DPDP/Meta disclosure | Sub-processor register, correct page | Yes |
| H-36 | No retention, offboarding or erasure | No tenant-delete/export route; purge job absent; policy promises 30-day delete; wb_users has no FK to auth.users; storage and tokens survive | Cannot honour exit/erasure; policy broken | Offboarding job, export, retention worker, auth link | No |
| H-37 | `/sessions` contract has no backend | Dashboard.tsx:30-58, QRScanner.tsx:32-103, Settings.tsx:81 vs no route | Dashboard shows 0 connected; QR page spins; reset errors | Backend facade over wb_waba_accounts, never return qr_pending | No |

## Medium

| ID | Title | Evidence | Why it matters | Fix direction | Frontend change? |
|---|---|---|---|---|---|
| M-01 | Cross-tenant references (visits IDOR, sub-queries) | visit-routes.ts:94,133,141; customer-routes.ts:56-72; single-col FKs | Tenant with another's customer UUID can alter it | Ownership check, composite (user_id, id) FKs | No |
| M-02 | Auth gaps | auth-plugin.ts:31-60 no email_confirmed check; owner by email allow-list; lazy wb_users, no plan/status | No suspend/trial; depends on Supabase settings | Check confirmed, status column, platform_admins | No |
| M-03 | Input validation and unvalidated LLM JSON | customer-routes.ts:26 filter string; catalog-service.ts:367 key interpolation; ai-router.ts:120 bare JSON.parse | Filter tampering, TypeErrors, wrong gating | zod everywhere, enums, whitelist keys | No |
| M-04 | Prompt injection defence is prompt-only | Customer text in system prompts; tools driven by LLM output | Steers intent/bookings | Static system prompts, schema-validate output, server-held confirmation | No |
| M-05 | Embedding hygiene | No model/version column; HNSW commented out for KB; NULL embeddings unrepaired; fixed thresholds 0.4/0.35; no Jina task type | Stale or invisible vectors, silent misses | Model columns, backfill, HNSW, calibrate | No |
| M-06 | Unbounded message/event growth | No purge for wb_webhook_events; reasoning_trace JSONB; duplicate index | Cost and slow queries | Retention, partition, drop dup index | No |
| M-07 | Hard deletes and FK gaps | customer_id FKs no ON DELETE (007:75,82); hard deletes | 500 on customer delete; no recovery | Soft delete/policy, explicit actions | No |
| M-08 | Non-transactional multi-step writes | Unchecked inserts pipeline-service.ts; visit then customer update; booking no slot constraint; reply stored only after send (persist/pipeline) | Partial state, double-booking, unrecorded replies | RPC transactions, slot constraint, outbox | No |
| M-09 | Auto-reply gate weak | pipeline-service.ts:524-531 OR with autoReplyIntents | Confidence decorative; no human/refund/legal triggers | Explicit escalation triggers, review queue | No |
| M-10 | Thin Marathi/Hindi handling | Only `hi` branch; Marathi falls to English templates | Target users get English | Language set and templates, script check | No |
| M-11 | Dead duplicate agent path | dispatchToPipeline no callers; agent client on retired GitHub endpoint; skips owner/confidence gates; confirmed_slot never set; no checkpointing | False assurance; latent break | Pick one engine, delete or port with parity eval | No |
| M-12 | RAG ingestion and routing | Word-count chunks, edits leave stale chunks, duplicate vs failure conflated, one source per query, raw query embed | Outdated quotes, holes | Documents table, replace-on-update, parallel retrieval, query rewrite | No |
| M-13 | Legacy JID as identity | webhook-routes.ts:195 `@s.whatsapp.net`; no E.164 normalisation | Couples DB to transport | Neutral contact identity | No |
| M-14 | Media handling weak | Unsupported types silent; no size caps or fetch timeouts (webhook-routes.ts:284-303); multi-copy base64 | OOM/hang risk; silence to customers | Caps, timeouts, replies for unsupported | No |
| M-15 | No outbound throttling | Limiters unused; no 130429 handling | Burst failures | Outbound queue, token bucket | No |
| M-16 | WABA onboarding manual | No subscribe/register code; daily report goes to sending number | New tenant needs manual SQL | Account service, owner notify number | No |
| M-17 | No provider abstraction | Concrete cloudClient and Groq clients imported everywhere | Cannot add ChatSyncs or fallback | Provider interfaces, model gateway | No |
| M-18 | No graceful shutdown; cron unlocked | server.ts only unhandledRejection; no cron lock, per-user try/catch or timezone; no mem limit | Deploys kill work; duplicates if scaled | SIGTERM drain, job table/lock, memory limits | No |
| M-19 | PII in logs | 215 console calls; phones, transcripts logged; no redact | Erasure/privacy breach | One pino logger, redact, rotation | No |
| M-20 | Env validation partial | environment.ts:68-73; secrets default '' | Misconfig surfaces at runtime | zod per-env schema | No |
| M-21 | Docker/nginx hardening | Root user, unpinned images, port 3005 exposed, no TLS/limits in repo | Weak edge | Non-root, pins, edge as code | No |
| M-22 | Stale deps and docs | Baileys and unused packages; docs claim limiter DONE | Misleading ops | Remove, one README plus runbook | No |
| M-23 | PII to LLMs without DPAs | Groq, Gemini free tier, Jina, Vapi; no minimisation | Cross-border/training risk | Paid zero-retention, DPAs, AI disclosure | No |
| M-24 | No audit log | No audit table; owner overview unlogged | Cannot answer who accessed/deleted | Append-only audit_log | No |
| M-25 | Repeated canned replies | Fallback texts promise follow-up; stored as sender 'ai' | Spammy; owner transcript misleading | One degraded ack per window, tag system | No |
| M-26 | Slow serial pipeline | ~3 LLM calls plus ~10 DB calls; summary every message | Hard to hit 5s target | Parallelise, cache, throttle summary | No |
| M-27 | Owner sender mismatch | Backend stores 'user'; UI expects 'business_owner' (Conversations.tsx:165,234) | Bubble flips after refetch | Map to 'business_owner' in API | No |
| M-28 | Cron sends at any hour | cron-service.ts:16,21 no timezone, no quiet hours | Midnight nudges, quality risk | Timezone and quiet window | No |
| M-29 | Hours text hardcoded; no away mode | pipeline-service.ts:358 fixed hours, 'closed' for any empty slots; bot offers test drives at 2 AM | Wrong info to customers | Hours resolver, away message | No |
| M-30 | Walk-in transcription unmetered | voice-routes.ts:82-87; paid OpenAI fallback | Spend and 429s for all | Per-user caps | No |
| M-31 | Test and eval gaps | No eval dataset, tracing, fault injection, concurrency or time tests | Regressions unseen | Eval set, golden replay, fake clocks | No |

## Low

| ID | Title | Evidence | Why it matters | Fix direction | Frontend change? |
|---|---|---|---|---|---|
| L-01 | Public routes by startsWith | auth-plugin.ts:30 | Future prefix routes unauthenticated | Exact match | No |
| L-02 | Auth client falls back to service key | auth-plugin.ts:22; per-request getUser | Silent over-privilege | Require anon key, local JWT verify | No |
| L-03 | Bad signature returns 200 silently | webhook-routes.ts:98-101 | Misconfig invisible | Metric and alert | No |
| L-04 | Knowledge list returns embeddings | knowledge-routes.ts:10 select('*') | ~30KB per chunk | Explicit columns, return ids/scores | No |
| L-05 | Stage vocabularies conflict | cron sets followed_up; Leads.tsx maps unknown to New | Cosmetic mis-bucketing | Canonical enum | No |
| L-06 | Unused schema objects | wb_search_catalog_structured, wb_sessions, dup indexes | Write cost, stale device counts | Cleanup migration | No |
| L-07 | Cron nudge hardcoded English | cron-service.ts:118; generateFollowUp unused | Language/persona mismatch | Use reply builder and templates | No |
| L-08 | LLM params per domain | frequency_penalty etc. in domain files | Provider swap breaks quietly | Provider adapter | No |
| L-09 | Price baked into embedded text | catalog-service.ts:514-520 | Stale vectors on price edits | Embed stable text only | No |
| L-10 | Error envelope must be {error} | Frontend reads data.error | Rebuild risk only | Global handler | No |
| L-11 | GET /users must create-on-read | user-routes.ts:22-33 | Onboarding contract | Keep contract | No |
| L-12 | Frontend polls, no push | Conversations.tsx:96 | Freshness | Keep REST stable | No |
| L-13 | No Node/container resource limits | Dockerfile heap only at build | OOM takes all tenants | Limits, heap flag | No |
| L-14 | Terms mix controller/processor, no DPA | PrivacyPage.tsx:53, TermsPage.tsx | DPDP contract gap | Publish DPA, record acceptance | Yes |
| L-15 | Walk-in capture has no notice | AddWalkInModal; unverified | DPDP notice | Consent checkbox and flag | Yes |
| L-16 | Residency and breach runbook missing | No region/incident docs | DPDP intimation | Document regions, runbook | No |
| L-17 | No unified operating-hours resolver | Only appointment-service reads hours; no holidays/timezone | Inconsistent behaviour | Single resolver | No |
| L-18 | Dead baileys_sessions volume | docker-compose.yml:12-13,21-22 | Misleads DR | Remove, state host is stateless | No |
| L-19 | Soft deletes, provider copies, no deletion audit/export | catalog-service.ts:246-253; Vapi data; no export route | Erasure incomplete | Purge, provider delete, deletion log | No |
| L-20 | No circuit breaker | ai-router.ts timeouts 20s/25s | Slow in outage | Breaker | No |
| L-21 | Events not linked to messages | 009:38-44 no conversation_id/status | Reconciliation blocked | Add link columns | No |
| L-22 | Agent tool schema issues | tools.ts:104-110 drops brand; dealership wording | Inert filters | Generate from domain | No |
