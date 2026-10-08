# Vyavsay Assist v2: Backend Migration Plan

**Summary**
1. Every legacy item has a home: 195 rows (55 routes plus 4 frontend-only `/sessions` calls, 43 services and modules, 6 jobs, 36 integration rows, 23 SQL rules, 28 implicit behaviours), each with a v2 module, an action, a parity test type and a story id. The full ledger is [parity/backend-parity-ledger.md](parity/backend-parity-ledger.md).
2. Parity is proved by tests, never by running legacy. Each L1 fixture is signed by a second reader, cross-checked against frontend types, and the nine riskiest shapes are checked against responses the owner captures from the old app (section 2g). "Green on memory" (Gm) closes a story; M2 and M3 need the Postgres re-run (Gp); section 2e lists what memory cannot prove.
3. Port in 8 sequential slices (one developer, D16): foundation, rules, messaging spine, agent seam (smoke first, completion A3b due at M3), tenant CRUD, automation, integrations, then the DB and infra plug-in. A0 to A6 run on `FakeProvider`, in-memory repos and fakes. The text-only pilot path (E6.5a, unsupported kinds) is in A2; its review-item half (E6.5b) closes in A3.
4. The data layer is a set of repo ports opened through `tenant_tx(ctx)`; memory ships now, Postgres later must pass the same suite. Reading the routes found 8 gaps in the planned schema (section 4f). `SystemGateway` is the ADR 0012 list as amended by 0014, 0017 and 0028; one name is new and goes in ADR 0031 (section 4a.3), which also holds the one consolidated list.
5. 30 intentional changes (15 visible to the frontend, section 5); 50 new stories (47 scheduled, 1 deferred, 2 parked) of about 97 to 124 days, of which 17 are the seam stories P3.5 to P3.18 defined in [09](09-agent-backend-sync-contract.md) (41 to 52 days), plus about 124 to 167 days of existing stories assigned to A0 to A6 (section 6c); 19 amended story rows; 22 owner decisions, each with a default. Where this plan and 09 differ on the seam, 09 wins.

Inputs: [legacy inventory A](reviews/legacy-inventory-backend.md), [B](reviews/legacy-inventory-jobs-integrations.md), [C agent](reviews/legacy-inventory-agent.md), [PRD](01-prd.md), [architecture](02-architecture.md), [tenancy](03-tenancy-data.md), [agent design](04-agent-design.md), [roadmap](05-roadmap.md), [stories](05-roadmap-stories.md), [audit](../../docs/production-plan/01-gap-register.md). Legacy was read statically at commit 72398de; paths are `path:line` under `backend/src/` (in the ledger). Frontend facts are re-read from `frontend/src` where the inventories left a gap. Audit ids (H-, M-, L-, C-) are from the gap register; B-NEW-n from inventory B.

Scope stays as decided: Python/FastAPI rebuild, LangGraph agent replaces both old AI paths, fresh DB (so "migration" means porting behaviour), frontend contract fixed, hold-and-escalate (0025), Cal.com (0026), provider portability (0028), text-only pilot (D10). DB and infra are parked (D17, D18): no slice below depends on them; section 4e names where each plugs in.

## 1. Disposition of every legacy item
Actions: **port as-is**, **port with fix** (audit id), **redesign**, **defer** (named trigger), **drop** (reason). Tests: C contract, L cross-tenant leak, G golden table, B behaviour scenario, F fault or concurrency, K conformance, S typed stub, A absence, E eval (agent plan). Story ids: `E..` exist in [05-roadmap-stories](05-roadmap-stories.md); `P..` are new (section 6); `A0` to `A7` are slices (section 3). Package layout under `app/`:

| Package | Holds | Imports |
|---|---|---|
| `api/` | routers per area, `auth.py`, `errors.py`, `serializers/`, `schemas/`, webhooks | core, ports |
| `core/` | pure rules (`core/rules/`), domain services (messaging, catalog, contacts, booking, followups) | ports |
| `ports/` | Protocols: WhatsApp (exists), ModelGateway, Calendar, Sheets, Blob, Notifier, Auth, AgentRunner, Clock, repos, SystemGateway | none |
| `adapters/` | `fake/` (exists), `memory/` (repos), later `chatsyncs/`, `litellm/`, `calcom/`, `google_sheets/`, `postgres/`, blob | ports |
| `jobs/` | runner, scheduler, handlers by job kind | core, ports (the graph arrives as an injected `AgentRunner`; `jobs` and `core` never import `app.agent`) |
| `agent/` | LangGraph graph (companion plan) | `ports/agent.py`, `ports/agent_reads.py`, `core/rules/` (pure rules only) |
| `bootstrap/` | registry and wiring; the only importer of adapters | everything |

This maps the architecture's seed layout (`domain`, `worker`, `db`) onto the names the code and import-lint already use (`core`, plus `jobs`, plus `adapters/postgres`). OD-13a asks to confirm; ADR 0031 records it.

### 1a. Routes (55 legacy plus 4 frontend-only)
| ID | Legacy item | v2 target (under app/) | Action | Test | Story | Note |
|---|---|---|---|---|---|---|
| R01 | GET /api/health (`routes/health-routes.ts:9`) | api/routes/health.py: GET /api/health {status:'ok'} (exact match), plus /livez /readyz | redesign (H-33, L-01) | C | E8.2, P0.1 | uptime and activeReminders dropped; CHG-29: legacy matched public paths with `startsWith`, so `/api/healthcheck` was public |
| R02 | GET /api/analytics (`routes/health-routes.ts:22`) | api/routes/analytics.py | port with fix (H-02, L-05; BH09) | C+L | E3.7 | CHG-09; add totalMessages |
| R03 | GET /api/webhook/whatsapp (Meta verify) (`routes/webhook-routes.ts:76`) | none; adapter hook handle_handshake returns None for ChatSyncs | drop (Meta handshake; ChatSyncs has none) | A | E2.16 |  |
| R04 | POST /api/webhook/whatsapp (`routes/webhook-routes.ts:92`) | api/webhooks/whatsapp.py POST /webhooks/whatsapp/{provider}/{endpoint_key} then inbound_events then jobs/handlers/ingest.py | redesign (H-05, H-13, H-14, H-22, L-03, M-13, M-14) | B+F | E2.2, E2.4, E2.16 | CHG-20, CHG-26 |
| R05 | GET /api/conversations (`routes/conversation-routes.ts:6`) | api/routes/conversations.py | port with fix (H-24, M-27) | C+L | E3.5, E5.8 | wb_leads stays an array (BH10); customer_jid (BH15); CHG-14 |
| R06 | GET /api/conversations/:id (`routes/conversation-routes.ts:25`) | api/routes/conversations.py | port as-is (no FE caller; thin) | C | E3.5 | OD-7 |
| R07 | GET /api/conversations/:id/messages (`routes/conversation-routes.ts:52`) | api/routes/conversations.py | port with fix (M-27, L-04) | C+L | E3.5, E2.10 | CHG-01, CHG-02, CHG-08; signed media_url |
| R08 | PATCH /api/conversations/:id (`routes/conversation-routes.ts:83`) | api/routes/conversations.py | port with fix (H-24) | C+L | E3.5, E5.8 | ai_paused=false resolves the open review item |
| R09 | POST /api/conversations/:id/messages (`routes/conversation-routes.ts:108`) | api/routes/conversations.py then core/messaging (outbox) | port with fix (H-21, M-27) | C+F | E3.5, E2.5, E5.5 | CHG-11; sender stored as owner, served as business_owner |
| R10 | GET /api/leads (`routes/lead-routes.ts:6`) | api/routes/leads.py | port with fix (L-05, B-NEW-2) | C+L | E3.2, P1.1 | CHG-03; wb_conversations stays an object |
| R11 | PATCH /api/leads/:id (`routes/lead-routes.ts:27`) | api/routes/leads.py | port with fix (L-05) | C | E3.2, P1.1 | stage limited to the board five (400 otherwise) |
| R12 | GET /api/tasks (`routes/task-routes.ts:14`) | api/routes/tasks.py | port with fix (visit-row serializer, tombstone filter) | C+L | E3.2, E5.9 | BH11 |
| R13 | POST /api/tasks (`routes/task-routes.ts:35`) | api/routes/tasks.py | port as-is (201) | C | E3.2 |  |
| R14 | PATCH /api/tasks/:id (`routes/task-routes.ts:60`) | api/routes/tasks.py | port as-is | C | E3.2, E5.9 | completion independent of booking |
| R15 | DELETE /api/tasks/:id (`routes/task-routes.ts:85`) | api/routes/tasks.py | port with fix (tombstone, ADR 0026) | C | E5.9 | 200 success true also when nothing matched (BH03) |
| R16 | GET /api/users/:id (`routes/user-routes.ts:6`) | api/routes/users.py | port with fix (L-11, M-02) | C+L | E3.1, E1.7 | CHG-21; 403 Forbidden on id mismatch; no secrets in row |
| R17 | PATCH /api/users/:id (`routes/user-routes.ts:44`) | api/routes/users.py | port with fix (M-02, M-03) | C | E3.1 | unknown keys dropped silently, no 400 (Onboarding spreads its state: BH13). Legacy upserted a row from the token email, 500 if no email (`routes/user-routes.ts:44-57`); v2: a PATCH for a user with no membership runs `provision_tenant` first (as GET does), then applies the allow-listed fields; unconfirmed email gives 403 (BH23) |
| R18 | GET /api/knowledge (`routes/knowledge-routes.ts:6`) | api/routes/knowledge.py | port with fix (L-04) | C+L | E3.4 | bare array (BH02); no embedding; ?userId= ignored; CHG-08 |
| R19 | POST /api/knowledge (`routes/knowledge-routes.ts:22`) | api/routes/knowledge.py then job embed | port with fix (M-12, M-05, H-29) | C+B | E3.4, E4.3, P1.6 | {success,count}; duplicate gives 400 same text; embed failure retried, never silent |
| R20 | DELETE /api/knowledge/:id (`routes/knowledge-routes.ts:40`) | api/routes/knowledge.py | port as-is | C+L | E3.4 | 200 also when nothing matched |
| R21 | GET /api/catalog (`routes/catalog-routes.ts:21`) | api/routes/catalog.py | port with fix (BH05) | C+L | E3.3, P1.8 | CHG-04; params and totalPages as legacy |
| R22 | GET /api/catalog/stats (`routes/catalog-routes.ts:42`) | api/routes/catalog.py | port with fix (BH05) | C+L | E3.3, P1.8 | SQL counts, no row cap |
| R23 | POST /api/catalog/images/upload (`routes/catalog-routes.ts:53`) | api/routes/catalog.py then BlobStore port | port with fix (H-09) | C | E3.3 | field images, 5 files, 15 MB, content sniff (BH17); CHG-25 |
| R24 | GET /api/catalog/export (`routes/catalog-routes.ts:78`) | api/routes/catalog.py (xlsx writer in core/export.py) | port with fix (BH05, BH18) | C | E3.3 | 404 No items to export mapped by FE (AIBrain.tsx:166-186) |
| R25 | GET /api/catalog/:id (`routes/catalog-routes.ts:194`) | api/routes/catalog.py | port as-is (no FE caller; thin) | C | E3.3 | OD-7 |
| R26 | POST /api/catalog (`routes/catalog-routes.ts:207`) | api/routes/catalog.py then job embed | port with fix (H-30, B-NEW-6) | C+L | E3.3, E4.14 | 201; price 0 is not null |
| R27 | PATCH /api/catalog/:id (`routes/catalog-routes.ts:222`) | api/routes/catalog.py then job embed | port with fix (L-09, H-30) | C+L | E3.3, E4.14 | re-embed on stable-text change only |
| R28 | PATCH /api/catalog/:id/sold (`routes/catalog-routes.ts:238`) | api/routes/catalog.py | port as-is (quantity 0) | C+L | E3.3 |  |
| R29 | DELETE /api/catalog/:id (`routes/catalog-routes.ts:251`) | api/routes/catalog.py | port as-is (soft delete) | C+L | E3.3 |  |
| R30 | POST /api/catalog/batch (`routes/catalog-routes.ts:264`) | api/routes/catalog.py (shared with file import) | port as-is (no FE caller; thin) | C | E3.3, E3.10 | OD-7 |
| R31 | GET /api/schema (`routes/catalog-routes.ts:282`) | api/routes/schema.py | port as-is | C+L | E3.4 |  |
| R32 | PATCH /api/schema (`routes/catalog-routes.ts:299`) | api/routes/schema.py | port as-is | C | E3.4 | field types text/number/dropdown/date/boolean |
| R33 | POST /api/files/upload (`routes/file-routes.ts:24`) | api/routes/files.py then core/file_import.py | port with fix (M-12) | C+G | E3.10, P1.5 | CHG-22 (.xls); field file, 15 MB |
| R34 | POST /api/files/:fileId/process (`routes/file-routes.ts:95`) | api/routes/files.py then CatalogRepo, job embed | port with fix (H-30, F5) | C+G | E3.10, E4.14 | per-row result; status failed on partial |
| R35 | GET /api/files (`routes/file-routes.ts:188`) | none | drop (no FE caller; OD-7 default) | A | - |  |
| R36 | DELETE /api/files/:fileId (`routes/file-routes.ts:207`) | none | drop (no FE caller; OD-7 default) | A | - | L-19 note: soft delete cascade not rebuilt |
| R37 | POST /api/sheets/export-to-sheet (`routes/sheets-routes.ts:8`) | api/routes/sheets.py then job sheets_sync (ADR 0013) | redesign (H-30) | C+B | E7.6, E3.9 | typed not_connected stub until E7.6 |
| R38 | POST /api/sheets/import-from-sheet (`routes/sheets-routes.ts:19`) | api/routes/sheets.py then job sheets_sync | redesign (H-30) | C+B | E7.6, E3.9 | CHG-07 |
| R39 | POST /api/sheets/sync (`routes/sheets-routes.ts:30`) | api/routes/sheets.py then job sheets_sync | redesign (H-30, B-NEW-1) | C+B | E7.6, E3.9 | CHG-07; keys message, added, updated, error (BH19) |
| R40 | GET /api/owner/overview (`routes/owner-routes.ts:57`) | api/routes/owner.py then SystemGateway.owner_overview_* | port with fix (M-02, M-24; BH28) | C+L | E3.8 | CHG-10, CHG-30; platform_admins, audit row. Every key the page reads stays: 11 top-level and 13 per-business, including `total_voice_calls` at both levels, which is kept and returns 0 (no voice tables; legacy counted `wb_calls`, `owner-routes.ts:76-102,118,186`; read at `OwnerDashboard.tsx:20,34,44,235`) |
| R41 | GET /api/customers (`routes/customer-routes.ts:6`) | api/routes/customers.py | port with fix (M-03) | C+L | E3.2 | validated filters; source maps to first_seen_via; search escaped |
| R42 | GET /api/customers/:id (`routes/customer-routes.ts:41`) | api/routes/customers.py | port with fix (M-01, H-12) | C+L | E3.2 | {customer, visits, conversation, lead} |
| R43 | POST /api/customers (`routes/customer-routes.ts:86`) | none | drop (no FE caller; OD-7 default) | A | - | walk-in goes through POST /visits |
| R44 | PATCH /api/customers/:id (`routes/customer-routes.ts:153`) | api/routes/customers.py | port with fix (M-03) | C+L | E3.2, P1.2 | CHG-05; allow-list kept |
| R45 | DELETE /api/customers/:id (`routes/customer-routes.ts:187`) | api/routes/customers.py | port with fix (M-07) | C+L | E3.2 | no 500 on dependent rows |
| R46 | GET /api/visits (`routes/visit-routes.ts:6`) | api/routes/visits.py | port as-is (no FE caller; thin) | C+L | E3.2 | OD-7 |
| R47 | POST /api/visits (`routes/visit-routes.ts:36`) | api/routes/visits.py then core/rules/visits.py | port with fix (M-01, M-03, M-08) | C+L+G | E3.2, P1.2 | 200 with {visit}; atomic customer find-or-create; CHG-05 |
| R48 | PATCH /api/visits/:id (`routes/visit-routes.ts:150`) | api/routes/visits.py | port as-is (no FE caller; thin) | C+L | E3.2 | OD-7 |
| R49 | DELETE /api/visits/:id (`routes/visit-routes.ts:185`) | api/routes/visits.py | port as-is (no FE caller; thin) | C+L | E3.2 | OD-7 |
| R50 | POST /api/voice/extract-walkin (`routes/voice-routes.ts:87`) | api/routes/voice.py | defer (typed stub 501 {error, code:'NOT_AVAILABLE'}; real at E6.4) | S | E3.9, E6.4 | CHG-24; OD-12b (P1.7 deferred) |
| R51 | POST /api/vapi/webhook (`routes/vapi-routes.ts:21`) | none | drop (parked; H-03, H-04) | A | E3.9 |  |
| R52 | GET /api/vapi/calls (`routes/vapi-routes.ts:97`) | api/routes/vapi_stub.py {calls:[]} | defer (stub, ADR 0001) | S | E3.9 |  |
| R53 | GET /api/vapi/calls/:id (`routes/vapi-routes.ts:128`) | none (404 envelope) | drop (no FE caller; parked) | A | E3.9 |  |
| R54 | GET /api/vapi/calls/:id/actions (`routes/vapi-routes.ts:154`) | api/routes/vapi_stub.py {actions:[]} | defer (stub, ADR 0001) | S | E3.9 |  |
| R55 | POST /api/vapi/calls/outbound (`routes/vapi-routes.ts:192`) | api/routes/vapi_stub.py 403 {error} | drop (C-01 closed by removal; stub refuses) | S | E3.9 | FE shows error text (VoiceCalls.tsx:121-135) |
| S01 | GET /sessions (FE only, no legacy route) (`frontend Dashboard.tsx:32,58`) | api/routes/sessions.py facade over numbers + provider connection_state | redesign (H-37, ADR 0001, 0028) | C | E3.6 | CHG-06; userId, connectedAt, phone digits (BH14) |
| S02 | GET /sessions/:userId/status (FE only) (`frontend QRScanner.tsx:32`) | api/routes/sessions.py | redesign (H-37) | C | E3.6 | id must equal JWT user else 404; no qrDataUrl |
| S03 | POST /sessions (FE only) (`frontend QRScanner.tsx:57,103`) | api/routes/sessions.py | redesign (H-37) | C | E3.6 | idempotent; resumes a paused number |
| S04 | DELETE /sessions/:userId (FE only) (`frontend Dashboard.tsx:30, Settings.tsx:81`) | api/routes/sessions.py | redesign (H-37) | C | E3.6 | pauses number, audit row, team notice |

Counts: 55 routes: 41 have an FE caller and are contract; 10 have none (R06, R25, R30, R35, R36, R43, R46, R48, R49, R53) and follow OD-7; 4 are machine hooks (R01, R03, R04, R51). Source of the 41: 59 `client.<verb>(` sites (re-counted for this plan) and 43 distinct patterns (inventory A).

### 1b. Services and modules
| ID | Legacy item | v2 target (under app/) | Action | Test | Story | Note |
|---|---|---|---|---|---|---|
| V01 | server.ts (boot, helmet, 15 route plugins, cron start) (`server.ts:19-93`) | bootstrap/ + api/app.py create_app(container) | redesign (M-18) | C+F | P0.1, E8.2 | no in-process cron; SIGTERM drain in worker |
| V02 | config/environment.ts (env, fail-fast) (`config/environment.ts:6-72`) | bootstrap/settings.py (pydantic-settings) | port with fix (M-20) | C | P0.1 | platform env only; tenant secrets in DB |
| V03 | plugins/auth-plugin.ts (JWT hook, public list, owner flag) (`plugins/auth-plugin.ts:15-66`) | api/auth.py + ports/auth.py AuthVerifier | redesign (L-01, L-02, M-02, H-01) | C+L | P0.5, E1.7 | CHG-29: public paths match exactly on the path without the query string (legacy `PUBLIC_ROUTES.some(startsWith)` on the raw URL, `auth-plugin.ts:15-19,31`, made `/api/healthcheck`, `/api/health/x` and `/api/vapi/webhook*` public); tenant from membership, not JWT claims |
| V04 | plugins/cors-plugin.ts (`plugins/cors-plugin.ts:7-31`) | api/middleware.py | port with fix (config allow-list) | C | P0.1 | CHG-12 |
| V05 | plugins/supabase-plugin.ts and 3 extra service-role clients (`plugins/supabase-plugin.ts:11-13`) | none: repos behind tenant_tx | drop (H-01, H-34) | A | P0.2 | import-lint: no raw client in api/core |
| V06 | Error handling (none; Fastify default shape) (`server.ts (no setErrorHandler)`) | api/errors.py envelope + request id | redesign (L-10, NFR-12) | C | E1.8 | BH01, BH16 |
| V07 | helmet security headers (`server.ts:24-26`) | api/middleware.py | port as-is | C | P0.1 |  |
| V08 | pipeline: demo tenant auto-create (`services/pipeline-service.ts:56-76`) | none | drop (H-05) | A+B | E2.16 | unknown number is 404 plus dead letter |
| V09 | pipeline: conversation find-or-create (`services/pipeline-service.ts:85-120`) | jobs/handlers/ingest.py + ConversationRepo.get_or_create | port with fix (H-12, M-08) | F+K | E2.4, P0.3 | unique (tenant, contact, number) |
| V10 | pipeline: customer link by phone (`services/pipeline-service.ts:1284-1316`) | core/contacts.py + ContactRepo.get_or_create(contact_key) | port with fix (H-12, M-13) | B+G | E2.4, P1.2 | CHG-05 |
| V11 | pipeline: store inbound (voice/image columns) (`services/pipeline-service.ts:136-157`) | jobs/handlers/ingest.py | port with fix (FR-5) | B | E2.4, E6.5a | CHG-13; media_type convention kept for when voice is on (BH07); image caption kept as the message text (BH25) |
| V12 | pipeline: history load and 150-message cap (`services/pipeline-service.ts:158-185`) | agent load_context (12 messages plus summary) | drop the cap (dead branch: historyLoadLimit below 150, domains/used-cars/index.ts:399-405) | A | E4.5 | resolves inventory B vs C: not a review item |
| V13 | pipeline: lead upsert, forward-only score and funnel stage (`services/pipeline-service.ts:736-837`) | core/rules/funnel.py, applied by the post-step | port with fix (B-NEW-2, H-12) | G+B | P1.1, P3.2 | CHG-03 |
| V14 | pipeline: tasks created from AI analysis (`services/pipeline-service.ts:320-328`) | none | drop (not in agent design) | A | - | CHG-15; OD-10 |
| V15 | pipeline: appointment booking and reminders (`services/pipeline-service.ts:336-368`) | CalendarPort + bookings + job visit_reminder | redesign (H-17, M-08, H-19) | B+F | E7.2, E7.3 | CHG-16, CHG-17 |
| V16 | pipeline: buying-signal score (`services/pipeline-service.ts:306-317,839-870`) | none | defer (no FE reader; needs eval) | - | - | revisit after M3 |
| V17 | pipeline: auto-reply gate and deterministic branches (location, negotiation, complaint) (`services/pipeline-service.ts:523-632`) | agent guard plus hold-and-escalate; post-step checks ai_paused and auto_reply_enabled on every outbound path | redesign (M-09, H-24, H-28) | B+E | E4.6, E5.2, P3.2 | BH22; legacy ignored ai_paused on 3 branches |
| V18 | pipeline: analysis, retrieval, reply, photo, image, summary (AI parts) (`services/pipeline-service.ts:186-720`) | app/agent (companion agent plan) | redesign (H-26, H-27, M-04) | E | E4.5-E4.7 | eval set, not diff |
| V19 | pipeline: crash fallback canned text (`services/pipeline-service.ts:724-732`) | job failure then ai_failure review item plus holding reply | drop (H-15, M-25) | B | E4.8 |  |
| V20 | services/ai-router.ts (LLM calls, timeouts) (`services/ai-router.ts:9-555`) | ports/gateway.py ModelGateway; adapters/litellm | redesign (H-15, H-16, L-08, L-20) | K+F | E4.1 | task-to-model config |
| V21 | services/rag-service.ts (chunk, embed, search) (`services/rag-service.ts:9-210`) | core/rules/chunking.py + EmbeddingRepo + job embed | port with fix (M-05, M-12, H-29) | G+B | P1.6, E4.3 | chunk 200/40, hash, typed errors |
| V22 | domains/* (prompts, intents, templates, vertical config) (`domains/types.ts, generic/index.ts, used-cars/index.ts`) | seed data: prompt_versions, intent table, tenant_config | redesign (H-25..H-28, M-10) | E | E4.2, E4.4 | claims and persona dropped; structure kept as data |
| V23 | services/catalog-service.ts (`services/catalog-service.ts:62-520`) | core/catalog.py + CatalogRepo | port with fix (H-29, H-30, H-31, L-09) | C+G | E3.3, E4.3, E4.14, P1.8 |  |
| V24 | services/catalog-image-service.ts (`services/catalog-image-service.ts:52-113`) | ports/blob.py + adapters (blob) | redesign (H-09) | C | E3.3 | CHG-25 |
| V25 | services/file-processor.ts (`services/file-processor.ts`) | core/file_import.py | port with fix (M-12) | G | P1.5, E3.10 | price forms 6.5L, cr, rupee sign; CHG-22 |
| V26 | services/sheets-sync-service.ts (`services/sheets-sync-service.ts:5-235`) | ports/sheets.py + core/sheets_rows.py + job sheets_sync | port with fix (H-30, B-NEW-1, B-NEW-6) | G+B | P1.5, E7.6 | CHG-07 |
| V27 | services/appointment-service.ts (slots, overlap, alternatives) (`services/appointment-service.ts:36-381`) | core/rules/slots.py + ports/calendar.py | redesign (H-19, M-08) | G+B | P1.4, E7.1, E7.2 | keep alternatives rule and title format |
| V28 | services/reminder-service.ts (setTimeout) (`services/reminder-service.ts:21-105`) | jobs/handlers/visit_reminder.py | redesign (H-17, B-NEW-4) | F | E7.3 | see J4 |
| V29 | services/cron-service.ts (`services/cron-service.ts:16-127`) | jobs/scheduler.py | redesign (M-18, H-20, H-23, M-28) | F | E2.11 | see J1 to J3 |
| V30 | services/whatsapp-cloud-client.ts (`services/whatsapp-cloud-client.ts:4-207`) | ports/whatsapp.py (exists) + adapters/chatsyncs | redesign (M-17, H-20, H-21) | K | E2.1, E2.8 | fake first |
| V31 | services/message-media-service.ts (`services/message-media-service.ts:3-77`) | ports/blob.py + jobs/handlers/ingest_media.py | redesign (H-09) | K | E2.10, E6.1 | private; voice off |
| V32 | services/voice-transcription-service.ts (`services/voice-transcription-service.ts:98-237`) | ports/gateway.transcribe + core/rules/stt_gates.py | defer (voice off, D10; gates become golden tests when voice is turned on) | G | E6.2, P1.7 (deferred) | M-30; empty transcript must never be silent (BH26) |
| V33 | services/tts-service.ts (`services/tts-service.ts:55-146`) | none | drop (D10; H-18) | A | - |  |
| V34 | services/voice-service.ts (Vapi) (`services/voice-service.ts`) | none | drop (parked; C-01, H-03, H-04) | A | E3.9 |  |
| V35 | utils/validation.ts (Zod schemas) (`utils/validation.ts:9-144`) | api/schemas/*.py (pydantic) | port with fix (M-03) | C | E3.1-E3.4 | details list format kept (BH01) |
| V36 | utils/webhook-signature.ts (Meta HMAC) (`utils/webhook-signature.ts:8-31`) | adapter.verify_inbound (ChatSyncs: path key) | drop (Meta-specific) | A | E2.2, E0.9 |  |
| V37 | utils/inbound-rate-limiter.ts (dead; the outbound pacer is V41) (`utils/inbound-rate-limiter.ts:15-42`) | UsageRepo + rate-limit counters | redesign (H-16, M-15) | F | E7.5 | intent kept: 5 per 30 s per contact |
| V38 | agent/* LangGraph-JS (11 files, dead) (`agent/graph.ts, nodes/*, tools.ts`) | app/agent (companion agent plan) | drop the code, keep ideas (M-11) | A | E4.5 | tool cap and per-node timeouts already in ADR 0018 |
| V39 | database/migrations 001 to 011 (`database/migrations/*.sql`) | migrations/ (fresh) plus seeds (rules RL01-RL23) | redesign (H-10) | K | E1.2, E1.3 | DB parked; rules ported as pure code now |
| V40 | Dockerfile, docker-compose, nginx.conf (`Dockerfile; docker-compose.yml; frontend/nginx.conf`) | infra (parked) | defer (D17, D18) | - | E8.1 | not part of this plan |
| V41 | utils/rate-limiter.ts outbound pacer, 1 message per 3 s per session (dead: `rateLimiter = new RateLimiter(3000)`, no importer in `src`) (`utils/rate-limiter.ts:5-47`) | send job paces per number: minimum interval from settings (default 3000 ms until ChatSyncs limits are known, CQ-21) | redesign (H-16, M-15) | F | P4.3 | anti-ban intent lives on; legacy never sent paced |
| V42 | pipeline: intent, confidence and negotiation_round written to the conversation each turn (`services/pipeline-service.ts:296,571-574`) | none: intent and confidence go in `agent_runs`; the round count is derived per run by the agent (cap 4 is an NG eval case) | drop (the frontend reads none of them: grep of `frontend/src`) | A | E4.5 | prompt line `NEGOTIATION ROUND` at :1019 is rebuilt by the agent |
| V43 | pipeline: after-reply summary and language update, fire-and-forget (`services/pipeline-service.ts:395-399`) | summary: job `summarize` (agent plan); language: the post-step writes `conversations.language` from the run report on every run | redesign (M-26) | B | P3.2a, E4.5 | legacy ran only with 3 or more history lines and logged failures; language had no owner in earlier drafts |

### 1c. Jobs
| ID | Legacy item | v2 target (under app/) | Action | Test | Story | Note |
|---|---|---|---|---|---|---|
| J1 | Daily owner report 21:00 server TZ (`services/cron-service.ts:16,60-97`) | job daily_report (only if OD-12a says yes) | defer (not in PRD; O1 default drop) | - | - | CHG-19; B-NEW-5 if kept |
| J2 | Stale-lead nudge every 6 h (`services/cron-service.ts:21,104-122`) | followups rows then tick then job followup_send | redesign (H-20, H-23, M-28, B-NEW-2, B-NEW-3) | F+B | E5.6, E5.7, E2.11 | CHG-18 |
| J3 | Sheets auto-sync every 2 min, first user only (`services/cron-service.ts:26,38-50`) | job sheets_sync per tenant (on demand plus slow tick) | redesign (H-30, M-18) | B+F | E7.6, E2.11 | CHG-07; tick default 15 min (OD-4) |
| J4 | Appointment reminders 2 h and 1 h (setTimeout) (`services/reminder-service.ts:45-76`) | job visit_reminder, run_at = visit minus offset, keyed by booking id | redesign (H-17, B-NEW-4) | F | E7.3 | skip offsets already past; template when window closed |
| J5 | Inbound rate-limit cleanup (dead) (`utils/inbound-rate-limiter.ts:42`) | none (DB counters) | drop (dead code) | A | E7.5 |  |
| J6 | Webhook-event purge (promised, never built) (`database/migrations/009-waba-accounts.sql:37`) | job maintenance:inbox_prune | redesign (M-06) | F | E8.6, E2.11 |  |

### 1d. Integrations
| ID | Legacy item | v2 target (under app/) | Action | Test | Story | Note |
|---|---|---|---|---|---|---|
| I01 | Meta verify handshake (`routes/webhook-routes.ts:76-89`) | see R03 | drop | A | E2.16 |  |
| I02 | Meta HMAC inbound auth, bad signature returns 200 (`utils/webhook-signature.ts:8-31; routes/webhook-routes.ts:98-101`) | adapter.verify_inbound; ChatSyncs path key with hardening (D9) | redesign (L-03) | B | E2.2, E2.16, E0.9 | fail closed |
| I03 | Ack then setImmediate work (`routes/webhook-routes.ts:104-152`) | inbound_events insert, 200, ingest job | redesign (H-13, H-14) | F | E2.2, E2.3 |  |
| I04 | Tenant routing by phone_number_id, oldest-user fallback (`routes/webhook-routes.ts:159-178`) | endpoint_keys resolution; unknown key 404 | redesign (H-05) | B | E2.16 |  |
| I05 | Dedup by select then insert, processed=true after failure (`routes/webhook-routes.ts:199-215,266-269`) | UNIQUE (number, id_space, provider_message_id), atomic claim | redesign (H-13) | F | E2.2 |  |
| I06 | Message types: text, audio, image, button, interactive; others dropped (`routes/webhook-routes.ts:221-264`) | ingest: text and button/interactive title as text; every other kind, and any unrecognised event type, is stored `unsupported`, never dropped | port with fix (M-14, FR-5) | B | E2.4, E6.5a | CHG-13; BH25 |
| I07 | Customer name from profile, else the number; written to the conversation on every inbound (`routes/webhook-routes.ts:138-141,197; services/pipeline-service.ts:111-116`) | ingest: name set on create; later inbounds update it only if it is still a fallback label (the number) and the profile name is non-empty; an owner-set name is never overwritten | port with fix | G+B | E2.4, P1.9 | BH24, CHG-28, OD-18 |
| I08 | Mark read (`routes/webhook-routes.ts:218`) | none in v1 (capability read_receipts, no consumer) | defer | - | - |  |
| I09 | Media download via Graph (2 steps, no cap) (`routes/webhook-routes.ts:284-303`) | job ingest_media with caps | defer (voice and images off, D10) | K | E6.1 |  |
| I10 | Send text (bool result, no wamid) (`services/whatsapp-cloud-client.ts:58-125`) | outbox row then provider.send, typed result | redesign (H-21, FR-12) | F | E2.5 |  |
| I11 | Send image by link (catalog photos in replies) (`services/whatsapp-cloud-client.ts:58-125; services/pipeline-service.ts:644-669`) | port has send media; no consumer in agent design | defer (OD-11) | - | - | photo sharing needs an owner decision |
| I12 | Voice reply (TTS then upload then send) (`services/whatsapp-cloud-client.ts:131-183`) | none | drop (D10) | A | - |  |
| I13 | Per-tenant credentials with env fallback, plaintext token (`services/whatsapp-cloud-client.ts:27-50; 009-waba-accounts.sql:19`) | tenant_secrets (envelope encrypted); no env fallback | redesign (H-05, H-07) | A | E1.9 |  |
| I14 | Status webhooks ignored (`routes/webhook-routes.ts:124`) | status events update outbox via monotone state machine | redesign (H-22) | B+F | E2.9, E2.18 |  |
| I15 | Sheets import rules (headers, placeholders, price, 7 attributes, match, inactive skip) (`services/sheets-sync-service.ts:116-211`) | core/sheets_rows.py | port with fix (H-30, B-NEW-1, B-NEW-6) | G | P1.5, E7.6 | keep placeholder and inactive skip |
| I16 | Sheets export (12 columns, Status derived, clear then write) (`services/sheets-sync-service.ts:5-9,61-107`) | core/sheets_rows.py + ports/sheets.py | port with fix (H-30) | G+B | P1.5, E7.6 | layout kept (O6) |
| I17 | Sheets sync order: import then export (`services/sheets-sync-service.ts:224-234`) | job sheets_sync | port with fix (B-NEW-1) | B | E7.6 | sold stays sold after a round trip |
| I18 | Reminder text (en, free form) (`services/reminder-service.ts:50,67`) | message_templates (en, hi, mr) | redesign (H-20) | B | E7.3, E0.5 |  |
| I19 | File import status pending/processing/completed/failed (`routes/file-routes.ts:11-13`) | api/routes/files.py | port with fix (F5) | C | E3.10 |  |
| I20 | Media buckets created public (`services/message-media-service.ts:3,19,59-60; services/catalog-image-service.ts:52-54`) | private store plus signed URL at read; catalog photos non-expiring | redesign (H-09) | C | E2.10, E3.3 | bucket creation itself: I36 |
| I21 | LLM analysis (Groq JSON, 20 s race) (`services/ai-router.ts:9-43,73-147`) | gateway task agent.understand | redesign (H-15) | E | E4.1, E4.5 |  |
| I22 | LLM reply (temp 0.7, 800 tokens) (`services/ai-router.ts:150-254`) | gateway task agent.draft | redesign (H-15, H-27) | E | E4.1, E4.5 |  |
| I23 | Summary (throttle none) and generateFollowUp (dead) (`services/ai-router.ts:257-283`) | gateway task agent.summarize via job; follow-up is a template | redesign (M-26, L-07) | E | E4.5, E5.6 |  |
| I24 | Vision (Gemini) car photo (`services/ai-router.ts:332-397`) | gateway task vision (later) | defer (images unsupported, D10) | - | - |  |
| I25 | Walk-in extraction (Groq temp 0, regex fallback) (`services/ai-router.ts:494-547`) | gateway structured task, with R50 | defer (OD-12b) | G | P1.7 (deferred) |  |
| I26 | Embeddings (Jina, 1536, batch 30) (`services/rag-service.ts:9-18,124-145`) | ModelGateway.embed; model and version stored | redesign (M-05, H-29) | K | E4.1, E4.3 |  |
| I27 | Chunking 200 words, 40 overlap, hash 16 hex (`services/rag-service.ts:19-20,163-210`) | core/rules/chunking.py | port with fix (M-12) | G | P1.6 |  |
| I28 | Retrieval thresholds 0.4 knowledge, 0.35 catalog (`services/rag-service.ts:21; services/catalog-service.ts:390`) | config, calibrated on eval | redesign | E | E4.3, E4.13 | starting values only |
| I29 | Embedding text builder with price baked in (`services/catalog-service.ts:460-520`) | core/rules/chunking.py embed_text (stable fields only) | port with fix (L-09) | G | P1.6, E4.14 |  |
| I30 | Speech to text (Groq Whisper then OpenAI) (`services/voice-transcription-service.ts:188-237`) | ModelGateway.transcribe | defer (voice off; vendor via E0.4) | - | E6.2 |  |
| I31 | TTS (OpenAI tts-1, Orpheus, ffmpeg execSync) (`services/tts-service.ts:55-146`) | none | drop (D10, H-18) | A | - |  |
| I32 | Vapi events, tools, tables, dialer (`routes/vapi-routes.ts; services/voice-service.ts`) | none; stubs per R52, R54, R55 | drop (parked) | A | E3.9 |  |
| I33 | Legacy agent graph and USE_AGENT_GRAPH flag (`routes/webhook-routes.ts:14,22-56; agent/*`) | none | drop (dead, M-11) | A | E4.5 |  |
| I34 | Env keys (names only) (`config/environment.ts:6-56; services/ai-router.ts:19-20; agent/openai-client.ts:16; routes/webhook-routes.ts:14`) | every key has a disposition in section 1f | redesign (M-20) | A+C | P0.1, E1.9 | audit closed in 1f: 26 keys in `config` plus `AI_MODEL`, `AI_VISION_MODEL`, `USE_AGENT_GRAPH`, `AUTH_SESSIONS_DIR` |
| I35 | Hard-coded tuning (Graph v21.0, timeouts, thresholds, body 15 MB, 5 MB audio) (`whatsapp-cloud-client.ts:4; ai-router.ts:25-28; server.ts:19`) | settings and tenant config, no literals in code | redesign | A | P0.1 |  |
| I36 | Storage buckets created on first use, public (lazy `listBuckets`/`createBucket`, not at boot) (`services/catalog-image-service.ts:44-57; services/message-media-service.ts:12-24`) | none in app code: infra provisions private buckets; `/readyz` reports a missing bucket | drop (the app has no service-role key at runtime, H-34; H-09) | A | E2.10, E8.2 | test: no blob adapter method creates a bucket |

### 1e. Rules in SQL and enum-like code (become seeds, enums, pure functions)
| ID | Legacy item | v2 target (under app/) | Action | Test | Story | Note |
|---|---|---|---|---|---|---|
| RL01 | Tenant defaults: auto_reply true, threshold 0.75, followup 48 h, services [], schema {fields:[]} (`database/migrations/001-schema.sql:16-19; 002:82`) | tenants defaults; threshold and follow-up timer: OD-15 | port with fix (B-NEW-6: 0 is a value) | C | E3.1, E1.3 |  |
| RL02 | Working hours Mon-Sat 10:00-19:00, Sun off, 30 min slots (`006-appointment-slots.sql:8-9`) | tenant_config.business_hours seed | port as-is (seed) | G | E4.4, P1.4 |  |
| RL03 | Location reply: 4 variants (address, maps, both, none) (`003-location-fields.sql; services/pipeline-service.ts:538-566`) | deterministic templates from tenant_config (en, hi, mr) | port as-is (as data) | B | E4.4 | agent plan owns wording |
| RL04 | Conversation defaults: status active, language en, funnel inquiry, round 0 (`001:40,43; 004-domain-fields.sql:6-12`) | conversations columns | port as-is | K | E2.4 | ai_paused had no DDL (H-10) |
| RL05 | Sender values customer/ai/user; media_type image/voice/audio (`services/pipeline-service.ts:139-141; 010-message-media.sql:16-18`) | messages.source; serializer maps to business_owner | port with fix (M-27) | C | P2.1 | BH07 |
| RL06 | Lead score high/medium/low, default low, forward-only for AI (`001:64; services/pipeline-service.ts:755-760`) | core/rules/funnel.py | port as-is | G | P1.1 | owner may lower |
| RL07 | CRM stage (board five) vs funnel stage (7 names, forward-only) (`pipeline-service.ts:797-834; frontend Leads.tsx:14`) | two fields plus one mapping (OD-1) | port with fix (B-NEW-2) | G | P1.1 |  |
| RL08 | Intent to funnel map; 23 used-car and 13 generic intents (`services/pipeline-service.ts:813-828; domains/*/index.ts:26-49`) | vertical config data | redesign (data) | E | E4.2 |  |
| RL09 | Auto-reply gate (OR of confidence and intent list) (`services/pipeline-service.ts:525-531`) | guard plus hold (see V17) | redesign (M-09) | B | E4.6, E5.2 |  |
| RL10 | Negotiation: 8 percent default, floor from attrs, 4 rounds, budget parser (`domains/used-cars/index.ts:386-398; pipeline-service.ts:578-592,1239-1262`) | tenant_config.max_discount_pct default 0; parser in core/rules/budget.py | port with fix (H-28) | G | P1.3, E4.6 | parser kept; floor never stated |
| RL11 | Buying-signal weights, close-mode at 0.7 (`services/pipeline-service.ts:843-866`) | none | defer | - | - |  |
| RL12 | Limits: history 50/20, photos 3, items 20, trim 1500 chars (`domains/used-cars/index.ts:399-405`) | settings | redesign (config) | A | P0.1 |  |
| RL13 | Catalog: qty default 1, available = active and qty over 0, sold = qty 0 or inactive (`002-inventory-and-rag-fixes.sql:94-108; services/catalog-service.ts:64-65`) | core/catalog.py | port with fix (BH05) | G | P1.8 | CHG-04 |
| RL14 | Custom field types text/number/dropdown/date/boolean (`utils/validation.ts:90`) | api/schemas/schema.py | port as-is | C | E3.4 |  |
| RL15 | Customers: first_seen_via, hotness, status enums; unique (user, phone) (`007-customers-and-visits.sql:18-30`) | contact_key unique; enums kept | port with fix (M-13) | G+K | P1.2 |  |
| RL16 | Visit outcome to hotness; items_shown merged into tags (`routes/visit-routes.ts:121-134`) | core/rules/visits.py | port as-is | G | P1.2 |  |
| RL17 | Appointment = task titled calendar emoji plus Appointment (`services/appointment-service.ts:308`) | tasks serializer (arch s8) | port as-is (title format) | C | E5.9 | BH11 |
| RL18 | Knowledge content hash dedupe, chunk_index (`002:11-14,71-73`) | core/rules/chunking.py, EmbeddingRepo | port with fix (M-12) | G | P1.6 |  |
| RL19 | Source file status pending/processing/completed/failed (`002:57-62`) | files route | port as-is | C | E3.10 |  |
| RL20 | Number status active/paused/revoked (`009-waba-accounts.sql:20-24`) | numbers.status; paused drives /sessions | port as-is | C | E3.6 |  |
| RL21 | Webhook dedup unique id, processed flag, 7-day retention (`009:37-42`) | inbound_events plus prune job | redesign (M-06) | F | E2.2, E8.6 |  |
| RL22 | updated_at triggers; stale measured by updated_at (`001:110-120; cron-service.ts:110`) | repos set updated_at; activity from message times | port with fix (B-NEW-3) | K+B | P0.3, E5.6 |  |
| RL23 | RPCs take a caller-supplied user id (`002:28-46,136-221`) | tenant filter inside repo method; no tenant argument | port with fix (H-01) | K | P0.3, E4.3 |  |

Action tally (167 items, excluding the 28 behaviours): port as-is 23, port with fix 55, redesign 51, defer 14, drop 24.

### 1f. Environment keys (closes the env audit)
Names only. Platform env stays small (bootstrap/settings.py, fail fast); tenant secrets live encrypted in the DB (ADR 0010), never in env. Test: `test_env_audit_closed` lists every key below and fails if the settings class reads a key not in the v2 column.
| Legacy key(s) | Legacy ref | v2 |
|---|---|---|
| PORT, NODE_ENV | `config/environment.ts:7-9` | platform settings |
| FRONTEND_URL | `config/environment.ts:8; services/cron-service.ts:84` | CORS allow-list setting (CHG-12); the report link goes with J1 |
| SUPABASE_URL, SUPABASE_ANON_KEY | `config/environment.ts:12-13` | platform settings for token verification only |
| SUPABASE_SERVICE_ROLE_KEY | `config/environment.ts:14` | dropped at runtime (H-01, H-34); migrations only |
| SUPABASE_STORAGE_BUCKET (default `catalog-images`) | `config/environment.ts:15; services/catalog-image-service.ts:50,94,104` | blob settings: catalog and media bucket names; buckets provisioned by infra (I36) |
| GROQ_API_KEY | `config/environment.ts:42; services/ai-router.ts:11; services/voice-transcription-service.ts:188; services/tts-service.ts:9` | gateway provider key, platform secret (E4.1); one key serves chat today, STT and TTS (dropped) |
| GEMINI_API_KEY, JINA_API_KEY | `config/environment.ts:23,26` | gateway provider keys; embeddings model changes (I28), vision deferred (D10) |
| AI_MODEL | `services/ai-router.ts:19` (default llama-3.3-70b-versatile); `agent/openai-client.ts:16` (default gpt-4o-mini, dead path) | gateway task-to-model config (`agent.*`); the two defaults disagree and neither is carried |
| AI_VISION_MODEL | `services/ai-router.ts:20` (default gemini-flash-latest) | gateway task `vision`, deferred (D10) |
| OPENAI_API_KEY | `config/environment.ts:43` | dropped (STT and TTS fallback; D10) |
| GOOGLE_SA_EMAIL, GOOGLE_SA_KEY | `config/environment.ts:46-47` | Sheets adapter secret (E7.6, ADR 0013); no env fallback |
| GOOGLE_SHEET_ID | `config/environment.ts:48` | per-tenant integration row (CHG-07) |
| GOOGLE_SHEET_NAME (default `Sheet1`) | `config/environment.ts:49; services/sheets-sync-service.ts:59,114` | per-tenant integration setting `sheet_tab`, default `Sheet1` (R37 to R39 must keep reading the same tab) |
| OWNER_EMAILS | `config/environment.ts:52` | dropped: `platform_admins` (M-02) |
| META_* (5), VAPI_* (4), GITHUB_PAT, USE_AGENT_GRAPH | `config/environment.ts:18,29-39; routes/webhook-routes.ts:14` | dropped (Meta, Vapi, retired GitHub Models, dead agent flag) |
| AUTH_SESSIONS_DIR | `backend/.env.production.example` only; not read in `src` | dropped (Baileys leftover) |

## 2. How parity is proved (no strangler)
There is no live traffic, no data and a fixed contract, so there is no proxy, shadow traffic or run of legacy. v2 is deployed and the frontend base URL points at it. Legacy cannot be run (read only), so it is never the oracle; the oracle is what the frontend reads plus the legacy code's rules, written down before the code, then checked three ways (section 2g). The only later comparison is the same suites on memory and on Postgres (Gm and Gp, section 2c): a test re-run, not a dual run of two backends.

### 2a. Artifacts
| Artifact | Path (proposed) | Built from | Proves |
|---|---|---|---|
| Route inventory | `tests/contract/inventory.json` | grep of `client.<verb>(` in `frontend/src` (E1.11) plus OpenAPI of the v2 app | Every FE pattern has a route, every route has a ledger row (P0.4) |
| FE read-set | `tests/contract/fe_reads/<page>.yaml` | Static reading: keys each page reads from a response and sends in a request (P2.2) | The response has what the page needs, in the shape it needs |
| Golden fixtures | `tests/contract/golden/<id>.yaml` | Legacy code reading; header `legacy_ref` (linter-resolved), `derived_by`, `signed_by` (a different reader, 2g), `trust` L1 read / L1s second-reader signed / L2 FE-checked / L3 owner-seen or capture-matched | Status code, keys, types, order, wrapping, error body |
| FE response types | `tests/contract/fe_types/<page>.yaml` | The TypeScript response types and call sites in `frontend/src` (P2.4), a second source written by other people | Fixture keys cover every key the page's type requires |
| Captured legacy responses | `tests/contract/captured/<route>.json` | Nine responses the owner copies from the old app's browser network tab, names and phones scrubbed (P2.5, OD-16); we run nothing | The only evidence that did not come from reading code |
| Legacy rule seeds | `tests/eval/seeds/legacy/*.yaml` | Rule cases harvested from legacy code with `legacy_ref` (P6.1) | Starting cases for the agent eval set and the golden tables |
| Rule golden tables | `tests/unit/rules/` | Branches of each legacy function (budget, slots, price, Sheets row, STT gates, funnel, hotness) | Pure behaviour, no I/O |
| Behaviour scenarios | `tests/behaviour/` | `FakeProvider`, memory repos, fake clock | Multi-step flows (inbound to reply, hold, reminder) |
| Fault and concurrency | `tests/faults/` | Same fakes | Duplicates, two runners, kill mid-send, burst |
| Repo conformance | `tests/repos/` | Section 4 invariants | Memory now, Postgres later give the same answers |
| Seam suite | `tests/seam/` | Section 3b | Backend and agent agree on who writes what |
| Change register | plan section 5 | `CHG-nn` | Every deviation named, tested, FE impact stated |
| Parity ledger | `docs/parity/backend-parity-ledger.md` | This plan | Status per item |

### 2b. Behaviour checklist (implicit behaviours, one test each)
The 28 rows `BH01` to `BH28` are in the ledger and drive tests. They are inventory section 4 (4.1 to 4.14 as BH01 to BH14), nine found while re-reading the frontend, and five found by the skeptic review of this plan (BH24 to BH28, below): `customer_jid` shape (BH15), 401 meaning (BH16), multipart names and caps (BH17), export blob and 404 mapping (BH18), Sheets keys and no axios timeout (BH19), `?userId=` (BH20), polling load (BH21), `ai_paused` on every outbound path (BH22), pending-tenant path (BH23). BH19 settles the "verify frontend axios timeout" item of ADR 0013 on the FE side: `api/client.ts:10-12` sets no timeout. BH24 customer name overwritten on every inbound (`pipeline-service.ts:111-116`); BH25 image caption processed as text (`webhook-routes.ts:365-381`); BH26 empty transcript skipped silently (`webhook-routes.ts:315-318`); BH27 public paths matched by `startsWith` (`auth-plugin.ts:15-19,31`); BH28 `total_voice_calls` read by the owner dashboard (`OwnerDashboard.tsx:20,34,235`).

Named tests for the new inventory findings: B-NEW-1 `test_chg_07_sheets_roundtrip`; B-NEW-2 `test_bh08_ai_lead_in_board_column`; B-NEW-3 `test_followup_eligibility_uses_message_time`; B-NEW-4 `test_chg_17_reminder_jobs`; B-NEW-5 `absence` unless OD-12a; B-NEW-6 `test_price_zero_and_threshold_zero_are_values`. Named tests for BH24 to BH28: `test_chg_28_name_not_overwritten`, `test_chg_13_image_caption_kept_no_run`, `test_empty_transcript_never_silent` (red until voice is on, E6.T1), `test_chg_29_public_routes_exact`, `test_chg_30_voice_calls_zero`.

### 2c. A row is done when
Two ladders. **Gm**: green on memory repos and fakes; it closes a story. **Gp**: the same suites green on Postgres (P5.2); it closes a milestone. The M2 and M3 gates in [05-roadmap](05-roadmap.md) are not met on Gm alone (OD-17).
1. Fixture or golden table exists with `legacy_ref` (the linter checks it points at a real file and line in `backend/`), `derived_by`, and `signed_by` from a different reader (2g). "Merged red first" only proves the test failed before the code; it is a process check, not evidence that the fixture is true.
2. Gm: green on memory repos and fakes (required check).
3. FE-called route: the read-set check passes for every page that calls it, and the fixture keys cover the FE response type (P2.4).
4. Changed behaviour: a `CHG-nn` row exists, a test named for it, and the FE impact line is accepted. A visible CHG needs L3: the owner saw it, or a capture shows the old shape.
5. The nine capture-listed shapes (2g) match the owner's captured response, or the ledger Notes say "no capture, L1s only" and the owner accepted that risk.
6. Dropped item: an absence test or a typed stub contract.
7. PG column set after the Postgres re-run (Gp).

### 2d. CI gates (extends [05-roadmap](05-roadmap.md) section 6)
Ledger linter (P0.4) blocks from A0 and also fails on a fixture whose `legacy_ref` does not resolve or whose `signed_by` is empty or equals `derived_by`; contract suite blocks per route as built (advisory for unbuilt routes, as in the roadmap); repo conformance blocks from A0; seam suite from A3; behaviour and fault suites from A2. A mutation probe runs with each fixture: renaming one key in the fixture must turn its test red, so tests that assert nothing are caught.

### 2e. What green on memory does not prove
Exit gates below say "green on memory (Gm)", never "done". A cross-tenant probe on memory is called a repo filter probe, not an RLS probe; the `L` column stays `parked` for PG.
| Memory proves | Memory cannot prove | Closed by |
|---|---|---|
| Tenant filter inside each repo method; uniqueness and ownership rules as coded; route shapes; job logic on a fake clock | RLS policies, FORCE RLS, grants (anon has none), SECURITY DEFINER row scoping | RLS suites T1 to T20 (E1.T1, E1.T2) at M2 |
| Atomic operations under asyncio | Real transaction rollback, isolation, `SKIP LOCKED` and lease races between processes | P5.2 with the E2.3 JobRepo suite |
| Composite-key and exclusion rules as coded in Python | Real FK, composite FK and exclusion-constraint behaviour; timestamp and timezone types | P5.2 |
| List methods return joined shapes | Query plans, N+1 under load (BH21), pooler and `SET LOCAL` behaviour | E8.7 latency measure, P5.2 |

### 2f. Frontend read-set: what the parser cannot see
P2.2 is a static parse of TSX. It cannot see spread props, aliased or destructured response objects, keys read in child components through props, computed or dynamic keys, values passed through state or context, or keys read in hooks and utils outside the page file. Defences: P2.4 adds the TypeScript response types as a second source; each page the parser cannot fully resolve is flagged `blind: true` in the manifest and must have a P2.3 checklist line; P2.3 (smoke walk of every FE-called screen against the fake-wired app, needs the owner's OK to run the frontend, never legacy) is a gate before M3, not optional.

### 2g. Making the oracle less circular
The same author reading the same code and writing the fixture proves little. Three added checks:
| Check | Source | Independent? | Rule |
|---|---|---|---|
| Second reader | A fresh session derives the expected response from the cited legacy line without seeing the fixture, diffs, and signs `signed_by` | Partly: still a model, unless the owner spot-checks | No L1 fixture counts as L1s without it |
| FE types | TypeScript response types and call sites in `frontend/src` | Yes, written by other people against real responses | Fixture keys must cover the type (P2.4) |
| Captured responses | Owner copies 9 real responses from the old app: `GET /conversations`, `/conversations/:id/messages`, `/leads`, `/catalog`, `/customers/:id`, `/analytics`, `/owner/overview`, `/users/:id`, `/tasks` (with an appointment row) | Yes, the only external oracle | Fixture shape must match; a diff is a ledger finding (P2.5, OD-16) |
Limit: any route without a capture rests on L1s plus FE types; its ledger Notes say so.

## 3. Order of porting
Order follows the roadmap's risk ranks (lost or double messages, unsafe replies, broken screens, silent automation, integrations) and the dependency graph. Each slice merges its tests red first, then turns them green on fakes. One developer plus Claude (D16): slices are strictly sequential, A0 to A6; no two slices are in flight. Rule stories (A1) are finished just before the first slice that uses them and may interleave. Claude may draft the next slice's red tests and fixtures while the developer reviews the current slice; nothing merges out of order. Fixtures for a slice's routes are signed (2g) before that slice starts, not all 41 up front.

### 3a. Slices
| Slice | Content | Stories | Tests first (red) | Runs on | Plugs in later at | Exit gate (Gm unless stated) |
|---|---|---|---|---|---|---|
| A0 Foundation | Ledger linter first, then app factory, ports, memory repos, auth fake, serializers, envelope, FE read-set, FE types, contract suite (red) | E1.11, P0.4, P0.1, P0.2, P0.5, P0.3a, P0.3b, P2.2, P2.4, P2.1a, E1.8, E3.T1, E2.15, P2.5 (owner intake runs in parallel) | One contract test per FE-called route; repo conformance; envelope; linter checks | Memory container, `FakeAuth` | `adapters/postgres` (P5.1), real JWT (E1.7) | OpenAPI routes = ledger = FE grep; contract suite red only for unbuilt routes; linter checks fixture headers |
| A1 Rules | Pure rule library and legacy seeds | P1.1-P1.6, P1.8, P1.9, P6.1 (P1.7 deferred) | Golden tables from legacy branches | Pure Python | Used by A2 to A6 and the agent eval set | All golden tables green; seeds carry `legacy_ref` |
| A2 Messaging spine | Webhook to inbox to ingest to outbox to send; unsupported kinds; conversations and sessions routes | P4.1, P4.2, P4.3, E6.5a, E2.T1, E2.T2, E2.2-E2.7, E2.9, E2.10, E2.12, E2.16, E2.18, E2.21, E3.5, E3.6 | Duplicate and out-of-order, two runners, kill mid-send, burst of 3, window boundary, STOP, owner-number event, unsupported kind (voice, image with caption, unknown event type) stored and answered, never dropped, no `agent_run`; pacing | `FakeProvider` (3 profiles), memory queue, fake clock | Postgres JobRepo (E2.3), ChatSyncs adapter (E2.8, E2.19-E2.21), blob store | M2 suite green on fakes (Gm); M2 itself needs Gp |
| A3 Agent seam (smoke) | Run contract types, harness, 12 smoke scenarios, post-step, hold atomicity, usage cap, review half of FR-5 | P3.17, P3.1, P3.5, P3.11, P3.6, P3.7a, P3.2a, P3.2b, P3.3, P3.4, P3.9, P3.10, P3.12, P3.13, P3.16, E6.5b, E4.4, E4.8, E4.9, E5.T1 (hold cases), E5.1, E5.2, E7.5 | Tests first: ADR 0034 and renumbering, types, schema snapshots, import-lint, `SeamWorld`, then 12 red smoke scenarios (09 s4.2), then the post-step that turns them green; cap concurrency (T14); unsupported kind opens a review item and enqueues the `notify_owner` job | `ScriptedAgent`, fake gateway | LangGraph graph (E4.5), LiteLLM (E4.1), vector search (E4.3) | 12 smoke scenarios green in mode S, CT4 and CT5 green, adversarial pack green (09 Roadmap impact); swap `ScriptedAgent` for the graph with no backend change; FR-5 text-only path passes end to end on the fake (E6.5a plus E6.5b; alert delivery is E5.3 in A5) |
| A3b Seam completion (due M3) | Batches b and c (36 scenarios), twins, failure suite, summary wiring, ledger rows T01 to T44. Runs beside the agent slices S2 to S7 ([08](08-agent-migration-plan.md)) | P3.7b, P3.7c, P3.8a (gate S2, needs E4.5), P3.8b, P3.14, P3.15, P3.18 | Scenarios red first, then green | `ScriptedAgent` and the real graph with `ScriptedLLM` | Postgres re-run (P5.2) | CT1, CT2, CT6 green, schema snapshots current (the extra M3 gate) |
| A4 Tenant CRUD | All other FE-called routes | E3.1-E3.4, E3.7-E3.11 | Contract plus repo filter probe per route | Memory repos, fake blob and embed | Postgres repos | All 41 FE routes contract-green on memory (Gm, not RLS-proved, 2e) |
| Gate before M3 | Frontend smoke | P2.3 | Checklist of every FE-called screen | Fake-wired app | n/a | Every screen walked once; every `blind: true` page covered; findings are ledger rows |
| A5 Automation | Hold timers, owner alerts, follow-ups, reminders, scheduler, prune | E5.T1 (rest), E5.3-E5.9, E2.11, E7.3, E7.4, E8.6 | State, fake-clock, two-runner tests | Memory queue, fake Notifier, `FakeProvider` | Real email and WhatsApp alert (E5.3), approved templates (E0.5, E5.7) | M4 suite green on fakes (Gm) |
| A6 Integrations | Cal.com, Sheets, embeds, voice stubs and fallback | E7.T1, E7.1, E7.2, E7.8, E7.6, E7.7, E4.14, E6.T1-E6.4 | Fake Cal.com cases, Sheets round-trip pack | Fakes for Cal.com, Sheets, gateway | Real Cal.com (E0.7), Google account, STT vendor | M5 suite green on fakes (Gm) |
| A7 Plug-in (parked) | DB, real adapters, infra | P5.1, P5.2, P6.2 (needs the real embedding model and pgvector; the M3 gate), E1.2-E1.7, E2.3, E2.8, E4.1, E5.3, E8.* | Repo and contract suites re-run | Postgres, real adapters | n/a | The same suites are green on memory and on Postgres (Gp) and the result diff is empty |

### 3b. Backend and agent seam (what keeps the two migrations in sync)
The agent plan owns the graph; this plan owns everything it touches. The graph returns a proposal; the backend applies it. Types live in `ports/agent.py` and `ports/agent_reads.py` (P3.1, P3.3); pure rules both sides call live in `core/rules/` (P3.11). Those are the only shared code. [09](09-agent-backend-sync-contract.md) is the contract: where this table and 09 differ, 09 wins.

| Concern | Backend owns | Agent owns | Contract and test |
|---|---|---|---|
| Trigger | `ingest` enqueues `agent_run` (dedup `agent:{conversation}:{high_water}`), one running job per conversation | n/a | `RunInput(tenant_id, conversation_id, job_id, run_id = uuid5(job_id), inbound_ids, inbound_high_water, started_at, restarts)`; burst test |
| Context | Read ports bound to the tenant (`AgentContextPort`) | `load_context` calls them | Typed models; no SQL or repo write in `app.agent` (import-lint) |
| Config | Resolver for hours, persona, max discount, holding templates (E4.4) | Consumes | Fake-clock tests |
| Tools | `CatalogSearchPort`, `KnowledgePort`, `CalendarPort.get_slots` | `act` loop, allowlist (ADR 0018) | Found/NotFound/Error, never `[]` on error (H-29) |
| Output | Accepts only `RunResult = ProposedReply or ReviewRequest or NoReply(reason)` | Produces | Anything else becomes an `ai_failure` item (E4.8) |
| Guard | Post-step re-runs the guard on the stored proposal | Owns the guard module (E4.6) | Same function in graph and post-step |
| Apply | One transaction: outbox row, lead update (stage and score, forward-only, P1.1), `conversations.language` from `RunReport.language`, booking hold, facts, follow-up rows, review item with holding row and alert and reminder jobs, usage reserve, `agent_runs` row | Nothing (R5: no side effects) | P3.2 atomicity and kill tests |
| Gates | `ai_paused`, `auto_reply_enabled`, opt-out and window checked on every outbound path (BH22) | `pre_flight` reads them | One test per outbound path |
| Races | High-water check, at most 2 restarts, owner message wins (ADR 0023) | Draft discarded on restart | E4.9 scenarios |
| Failure | Typed errors, retry, then `ai_failure` item plus holding reply | Raises or returns typed error | Fault test |
| Cost | `usage.reserve` before the run; ledger from gateway | Task names only | T14 |
| Summary and language | `summarize` job scheduling and throttle; the post-step writes `conversations.language` from the run report on every run (V43) | Prompt, task, and the `language` value in the report | Throttle test; language test in P3.2a |
| Messages | `source` agent/owner/system; serializer emits `ai`, `business_owner` | n/a | BH07 |
| Unsupported kinds | Ingest stores them `unsupported`, enqueues the polite reply through the outbox and (E5.1) the review item and owner alert; no `agent_run` is enqueued; an image caption is kept as the visible text | Never sees them (FR-5) | E6.5a in A2, E6.5b in A3 |

### 3c. Every existing story has a slice
| Epic | Slice |
|---|---|
| E0 spikes | Outside the slices. E0.8 gates the live parts of E2.8, E2.19 to E2.21 (A7) |
| E1 | A0: E1.1, E1.8, E1.11, E1.12, E1.T1/E1.T2 (skeletons already in `tests/rls`, stay red until the schema exists). A7: E1.2 to E1.7, E1.9, E1.10 |
| E2 | A0: E2.1 (built), E2.13, E2.14, E2.15. A2: E2.T1, E2.T2, E2.2 to E2.7, E2.9, E2.10, E2.12, E2.16 to E2.18, E2.21 (on the fake), E2.3 on memory via P4.1. A5: E2.11. A7: E2.3 on Postgres, E2.8, E2.19, E2.20 |
| E3 | A0: E3.T1. A2: E3.5, E3.6. A4: E3.1 to E3.4, E3.7 to E3.11 |
| E4 | A3: E4.4, E4.8, E4.9. A6: E4.14. Agent plan (plugs into the A3 seam): E4.T1, E4.1 to E4.3, E4.5 to E4.7, E4.10 to E4.13 |
| E5 | A3: E5.1, E5.2, hold cases of E5.T1. A5: E5.3 to E5.9, rest of E5.T1 |
| E6 | A2: E6.5a (ingest branch, polite reply through the outbox). A3: E6.5b (review item and owner alert, reuses E5.1). A6: E6.T1 to E6.4 (voice stays off; E6.5a and E6.5b are the pilot path and define FR-5 done) |
| E7 | A3: E7.5. A5: E7.3, E7.4. A6: E7.T1, E7.1, E7.2, E7.6 to E7.8 |
| E8 | A5: E8.6. A7: E8.1 to E8.5, E8.7 to E8.10 |
| E9 | Not v1 |

## 4. Data-layer interface (no infra chosen)
### 4a. Rules
1. Every tenant data access goes through `async with store.tenant_tx(ctx) as tx`; `tx` exposes the repos. No repo method takes a tenant id; the tenant lives only in `ctx`. This mirrors `tenant_tx(tenant_id)` in AGENTS.md.
2. `TenantCtx` is built in exactly three places: `api/auth.py` (from the verified user via the membership lookup, never from the body or query), `jobs/runner.py` (from the job row) and the webhook handler (from `resolve_endpoint_key`). Import-lint forbids constructing it elsewhere.
3. Cross-tenant work uses `SystemGateway`, a separate Protocol. Its list is ADR 0012 as amended, not a list invented here: `resolve_endpoint_key`, `claim_jobs`, `enqueue_due_followups`, `list_numbers_for_health`, `list_tokens_expiring`, `owner_overview_*` (ADR 0012); `resolve_number_ref` (ADR 0028); `provision_tenant` (ADR 0014); `offboard_tenant` and `enqueue_owner_action` ([03-tenancy-data](03-tenancy-data.md), system functions row; ADR 0017). New and in no ADR yet: `resolve_membership(user_id) -> (tenant_id, role, status)`, the app-side form of `private.current_tenant_id()` (ADR 0014), needed because the API builds `TenantCtx` before any transaction. ADR 0031 (P0.2) records it as an amendment to 0012 with a probe case, as 0012 requires for any new function, and carries ONE consolidated SECURITY DEFINER list (0012, 0014, 0017, 0028 and `resolve_membership`) so AGENTS.md can point at a single place instead of "fixed list (ADR 0012)". Minimal return types.
4. Repos return typed domain models, not rows; list methods take explicit `Page` and `Order` enums that reproduce inventory 4.10; a foreign or missing id is `NotFound` (404 for GET and PATCH, 200 for DELETE, BH03).
5. Invariants are single repo methods (names the DB must honour): `inbox.insert_if_new`, `contacts.get_or_create`, `conversations.get_or_create`, `jobs.enqueue(dedup_key)`, `outbox.write_before_send`, `outbox.transition(from, to)`, `usage.reserve`, `bookings.hold`, `leads.advance`, `catalog.upsert_by_sheet_key`, `reviews.open_hold`. Typed errors: `NotFound`, `Conflict`, `LimitReached`, `StaleLease`.
6. Secrets: repos never return plaintext; `SecretStore.open(ctx, kind)` is called only by adapters.

```python
@dataclass(frozen=True, slots=True)
class TenantCtx:            # built only by api.auth, jobs.runner, webhook handler
    tenant_id: UUID
    actor: Actor            # User(user_id) | Worker(job_id) | Endpoint(key_id)
    request_id: str

class Store(Protocol):
    def tenant_tx(self, ctx: TenantCtx) -> AsyncContextManager[Tx]: ...
class Tx(Protocol):         # bound to ctx; one DB transaction later
    ctx: TenantCtx
    tenants: TenantRepo; contacts: ContactRepo; conversations: ConversationRepo
    messages: MessageRepo; leads: LeadRepo; tasks: TaskRepo; visits: VisitRepo
    catalog: CatalogRepo; knowledge: KnowledgeRepo; files: SourceFileRepo
    outbox: OutboxRepo; jobs: JobRepo; followups: FollowupRepo; reviews: ReviewRepo
    bookings: BookingRepo; usage: UsageRepo; integrations: IntegrationRepo
    templates: TemplateRepo; prompts: PromptRepo; audit: AuditRepo
```

### 4b. Repos per aggregate
| Repo | Aggregate and main methods (all tenant-bound) | Serves routes | Invariant or legacy rule it carries |
|---|---|---|---|
| TenantRepo | profile, config snapshot, status, owner phone | R16-R17, V03 | profile allow-list; pending write limits |
| ContactRepo | get_or_create(contact_key), find by phone, list/filter/search, patch, delete | R41-R45, R47 | unique (tenant, contact_key); CHG-05 |
| ConversationRepo | get_or_create, list(order last message), set ai_paused/status, last_inbound_at | R05-R08, S01-S04 | unique (tenant, contact, number) |
| MessageRepo | append, list newest N ascending, status update, unique provider id | R07, R09 | CHG-01, BH07 |
| InboxRepo | insert_if_new(number, id_space, provider_message_id), mark | R04 | dedup, raw kept |
| OutboxRepo | write_before_send(idem_key), transition, reconcile lookup | R09, send job | idem key unique per tenant; monotone status |
| LeadRepo | upsert per contact, list with conversation, advance(stage, score), patch | R10-R11 | forward-only for AI; board vocabulary |
| TaskRepo | list, create, patch, tombstone delete, visit rows by booking | R12-R15 | BH11 |
| VisitRepo | create with customer find-or-create, patch, delete, list | R46-R49 | BH12 side effects, one transaction |
| CatalogRepo (+PricingRepo) | list(filters, page, sort), stats by count, CRUD, mark sold, upsert_by_sheet_key; pricing in a separate repo only the guard reads | R21-R30 | RL13; H-28 structural |
| KnowledgeRepo | documents, chunks replace-on-edit, list (no vectors), typed search | R18-R20 | RL18 |
| SourceFileRepo | create, status, list | R33-R34 | RL19 |
| JobRepo | enqueue(dedup), get, heartbeat, complete, fail (claim is system tier: `SystemGateway.claim_jobs`, which returns job refs; the runner then builds the job's `TenantCtx`) | all jobs | E2.3 contract |
| FollowupRepo | schedule, due, cancel, skip reason | J2 | unique (conversation, step) |
| ReviewRepo | open_hold (with outbox and jobs in one tx), resolve, list open | R05, R08 | ADR 0025 |
| BookingRepo | hold, confirm, cancel, find by metadata id | V15, A6 | exclusion on slot |
| UsageRepo | reserve(metric, n, limit), counters, llm ledger | A3 | atomic check and increment |
| IntegrationRepo, SecretStore | sheet id, calendar ids, status; secrets opened by adapters only | R37-R39, A6 | ADR 0006, 0010 |
| TemplateRepo, PromptRepo | templates by purpose and language; prompt version resolve | A5, agent | immutable versions |
| AuditRepo | append only | R40, takeover, deletes | M-24 |

### 4c. Memory implementation must be as strict as the DB
`adapters/memory/` enforces the same rules the DB will: unique keys raise `Conflict`; a child row whose tenant differs from its parent raises; every list is tenant-filtered inside the method; `claim_jobs` honours lease, dedup, the per-tenant cap and one running job per conversation; `usage.reserve` is atomic under concurrent tasks; time comes from `Clock`. The repo conformance suite (P0.3) runs against any implementation and is the contract Postgres must meet. A lax memory store would hide the very bugs RLS and constraints exist to stop.

### 4d. Auth and tenant resolution without a DB
`AuthVerifier.verify(token) -> VerifiedUser(user_id, email, email_confirmed)`; `FakeAuth` mints tokens in tests. Tenant resolution is `SystemGateway.resolve_membership(user_id)` (new, ADR 0031, see 4a.3) plus `provision_tenant` (ADR 0014) on the first `GET` or `PATCH /users/{id}` of a user with no membership; the fake implements `pending`, `active`, `suspended`. Owner routes check `platform_admins`, not the frontend email list.

### 4e. Where parked work plugs in
| Need | Memory/fake now | Real, later | Story |
|---|---|---|---|
| Repos and transactions | `adapters/memory` | `adapters/postgres` behind `tenant_tx` (RLS, `SET LOCAL`) | P5.1, E1.4, E1.5 |
| Jobs | Memory queue (P4.1) | `claim_jobs` with `SKIP LOCKED` and lease | E2.3 |
| System functions | Memory `SystemGateway` | SECURITY DEFINER list (ADR 0012 as amended, plus `resolve_membership` once ADR 0031 is filed) | E1.6, ADR 0012 |
| JWT | `FakeAuth` | Supabase token verification | E1.7 |
| WhatsApp | `FakeProvider` | ChatSyncs adapter | E2.8 |
| Models | Fake gateway | LiteLLM | E4.1 |
| Blob | Dict store | Object store (host per D18); buckets are provisioned by infra and are private, app code never creates one (I36) | E2.10 |
| Alerts | Fake Notifier | Email and WhatsApp | E5.3 |
| Calendar, Sheets | Fakes | Cal.com, Google | E7.1, E7.6 |

Job kinds (P4.2), dedup key formula in brackets: `ingest` [provider message id], `agent_run` [conversation:high_water], `send` [idem key], `notify_owner` [item], `review_remind_30/120`, `review_customer_notice_240` [item:slot], `followup_send` [followup id:slot], `visit_reminder` [booking:offset], `sheets_sync` [tenant], `embed` [item or doc:content hash], `summarize` [conversation:throttle bucket; throttle owned by the backend, 09 P3.15], `ingest_media`, `transcribe`, `calendar_write` [booking], `maintenance:*` [name:hour].

### 4f. Gaps in the planned schema found while porting routes
Feed these to [03-tenancy-data](03-tenancy-data.md) before the DB work resumes; they are cheap to fix on paper now. (G7 `conversations.facts_known`, G9 `messages.prompt_version_ids` and `config_version`, and G10 `outbound_messages.run_id` are in [09](09-agent-backend-sync-contract.md) s7; G8 is below.)
| # | Gap | Evidence | Needed by |
|---|---|---|---|
| G1 | `catalog_items` has no `category`, `quantity`, delete flag, or image objects `{url, caption, order}` (has `status`, `photo_urls`) | `ItemModal.tsx:104`; PATCH sold sets quantity 0; Sheets column Quantity | R21-R30, I15-I17 |
| G2 | `leads` has no `score` (high/medium/low), `notes` or `intent` | Leads cards and chat list read `score`; `PATCH` takes `notes` | R10-R11 |
| G3 | `conversations` has no `summary`, `language`, `funnel_stage`; list needs last-message time and the contact name | `GET /conversations` order and fields; agent `summarize` | R05, P1.1 |
| G4 | `contacts` "profile fields" must list `alt_phone, email, first_seen_via, hotness, status, tags, internal_notes, predicted_close_days, lifetime_value, custom_fields, last_activity_at` | Customers pages, RL15 | R41-R45 |
| G5 | No table for walk-in `visits` or for `source_files` | FR-20 lists visits; file import status | R46-R49, R33-R34 |
| G6 | `ai_confidence_threshold` and `followup_timer_hours` have no column; FE shows the threshold read-only with fallback 0.75 | `Settings.tsx:110`; RL01 | R16, OD-15 |
| G8 | `contacts` has no `name_source` (profile or owner), so an owner-set name cannot be protected from the next inbound; the conversation list needs the contact name, not a copy | `pipeline-service.ts:111-116`; BH24, CHG-28 | R05, P1.9 |

## 5. Legacy behaviours intentionally changed
Rule: a change that is visible in the frontend must be listed here with its test; none are made silently. 15 of 30 are visible; each visible one needs owner acceptance (L3 trust) before the ledger row is done.
| ID | Legacy behaviour | v2 behaviour | Why | Frontend-visible impact | Test |
|---|---|---|---|---|---|
| CHG-01 | Message list returns the OLDEST N (default 100); chat stops updating after 100 messages | Newest N, shown ascending (default and max 500) | BH04, M-27, OD-2 | none (fix) | test_chg_01_newest_n |
| CHG-02 | Owner messages stored and served as sender user | Served as business_owner | M-27, BH07 | none (removes bubble flip after poll) | test_chg_02_owner_sender |
| CHG-03 | wb_leads.stage mixes funnel names and board names; nudge cron sees almost no leads | API stores and returns the board five; funnel stage is a separate field; PATCH with another stage is 400 | B-NEW-2, L-05, OD-1 | visible: leads that sat in New now show in their true column | test_chg_03_stage_vocab |
| CHG-04 | Deleted items are counted and listed as Sold | Deleted items hidden everywhere | BH05, OD-3 | visible: Sold count drops by the number of deleted items | test_chg_04_deleted_hidden |
| CHG-05 | Phone matched as raw string; +91 98.. and 9198.. make two customers or a 500 | One normaliser (digits with country code); merge on write | BH12, M-13, OD-5 | none (walk-in duplicates disappear) | test_chg_05_phone_merge |
| CHG-06 | /sessions has no backend; Disconnect would call /sessions/undefined | Facade adds userId and connectedAt; phone is digits | BH14, H-37, OD-6 | none (additive) | test_chg_06_sessions_shape |
| CHG-07 | Sheets: one global sheet, first user only, every 2 min; sold becomes available; qty 0 becomes 1 | Per tenant, on demand plus slow tick; DB wins qty and price; Status Sold respected; qty 0 survives | B-NEW-1, B-NEW-6, H-30, OD-4 | visible: sold items stay sold after a sync | test_chg_07_sheets_roundtrip |
| CHG-08 | Payloads carry embedding, reasoning_trace and user-route 500 details, code, hint | Removed | L-04, OD-8 | none (never read; Settings reads details only on 400) | test_chg_08_payload_keys |
| CHG-09 | Analytics counts every tenant's AI messages, omits totalMessages, leadsByStage is raw | Tenant-scoped, IST day, totalMessages added, leadsByStage uses board stages | H-02, BH09 | visible: numbers shrink to own tenant; Analytics total appears | test_chg_09_analytics_scope |
| CHG-10 | Owner overview connected and active counts always 0 | Computed from numbers table | BH09, M-24 | visible: zeros become real counts (platform owner only) | test_chg_10_owner_counts |
| CHG-11 | POST message returns success even when WhatsApp send fails | Non-2xx {error} on real failure; row kept with failed status | H-21 | visible: failed owner message is not drawn as sent (FE only logs, Conversations.tsx:154-175) | test_chg_11_send_failure |
| CHG-12 | Unknown routes and thrown errors use Fastify default shape; wrong CORS origin gives 500 | Envelope everywhere; 401 only for auth; 403 for tenant status; CORS from config | L-10, NFR-12 | none | test_chg_12_envelope |
| CHG-13 | Voice notes transcribed, images analysed, AI replies to both; an image caption was processed as the message text (`webhook-routes.ts:365-381`) | Stored as unsupported; polite text request; review item and owner alert. A caption is kept as the visible message text but is not run through the agent (FR-5 says no agent run on these) | FR-5, D10, OD-19 | visible: owner sees placeholder text (wording OD-13b) or the caption for such messages | test_chg_13_unsupported_kinds, test_chg_13_image_caption_kept_no_run |
| CHG-14 | Complaint, negotiation limit, low confidence: canned text, AI keeps replying | Hold-and-escalate; AI pauses while item open; Needs you shaping on GET /conversations | H-24, ADR 0025 | visible by design: summary prefix and ai_paused true while open | test_chg_14_needs_you |
| CHG-15 | Tasks created from every AI analysis | Dropped (agent design has no task tool) | OD-10 | visible: Tasks page no longer fills with AI tasks | test_chg_15_no_ai_tasks |
| CHG-16 | Booking made on first mention of a time; no customer confirmation | Hold, customer confirms, then Cal.com write | ADR 0022, M-04 | visible: Appointments row appears only after confirmation | test_chg_16_confirm_first |
| CHG-17 | Reminders in memory, free text, only for AI bookings | Persisted jobs keyed by booking id, session or template, cancelled on change; manual tasks still get none | H-17, B-NEW-4 | none | test_chg_17_reminder_jobs |
| CHG-18 | Nudge: fixed English text, stage new/contacted, any hour, ignores timer setting | followups rows, per-tenant timer, quiet hours, window or template, opt-out checked at send | H-20, H-23, M-28, B-NEW-3 | none (customer-visible on WhatsApp) | test_chg_18_followups |
| CHG-19 | Daily 21:00 report to the business's own number | Not built unless owner says yes | O1, B-NEW-5 | none | absence |
| CHG-20 | Unknown number falls back to oldest user; unknown user gets a demo tenant | 404 plus dead letter | H-05 | none | test_chg_20_unknown_number |
| CHG-21 | First GET /users creates a working account | Creates a pending tenant: profile edits work, other writes 403 until the team activates | ADR 0014 | visible: a new signup cannot add stock until activated (OD-14) | test_chg_21_pending_tenant |
| CHG-22 | Upload accepts .xls by extension; parser reads xlsx only | Rejected with 400 Only .xlsx and .csv | OD-9 | visible only if a .xls is chosen (picker still allows it, FileUpload.tsx:127) | test_chg_22_xls |
| CHG-23 | No HTTP rate limits | Per-tenant and per-number limits, 429 {error} | NFR-8, H-16 | none at normal use | test_chg_23_rate_limit |
| CHG-24 | Walk-in voice extraction works (Groq/OpenAI Whisper) | Typed 501 stub until an STT vendor and OD-12b are settled | D10, M-30 | visible: the mic button shows an error message | test_chg_24_walkin_stub |
| CHG-25 | Catalog and chat media in public buckets | Catalog photos non-expiring unguessable URLs; chat media private, signed at read | H-09 | none (URL strings keep their type) | test_chg_25_media_urls |
| CHG-26 | Meta webhook at /api/webhook/whatsapp | Provider-keyed path /webhooks/whatsapp/{provider}/{key} | ADR 0028 | none (not a frontend route) | test_chg_26_webhook_path |
| CHG-27 | ai_confidence_threshold gates replies | Stored for the contract, no effect (guard replaces the gate) | M-09, OD-15 | visible: Settings shows a value that does nothing | test_chg_27_threshold_noop |
| CHG-28 | Conversation `customer_name` overwritten on every inbound, with the number when the profile name is missing (`pipeline-service.ts:111-116`) | Name set on create; later inbounds change it only if it is still the number label and the profile name is non-empty; an owner-set name is never overwritten | BH24, OD-18 | none (a corrected name stops flipping back) | test_chg_28_name_not_overwritten |
| CHG-29 | Public routes matched by `startsWith` on the raw URL (`/api/healthcheck`, `/api/health/x`, `/api/vapi/webhook*` were public) (`auth-plugin.ts:15-19,31`) | Exact match on the path, query string ignored | L-01, BH27 | none | test_chg_29_public_routes_exact |
| CHG-30 | Owner overview `total_voice_calls` counts `wb_calls` rows | Key kept at top level and per business, always 0 (no voice tables) | B1, BH28, ADR 0001 | visible: the Voice Calls card shows 0 (platform owner only) | test_chg_30_voice_calls_zero |

Frontend flaws that would force a frontend change were looked for and none was found beyond those already on record (QR screen wording, privacy page, Disconnect text: owner decisions in [02-architecture](02-architecture.md) and the PRD). Nothing here asks for a frontend edit.

## 6. Stories
### 6a. New stories (`P..`; merge into [05-roadmap-stories](05-roadmap-stories.md) after owner OK)
Pri M except where marked. P0 to P4 and P6 gate the E2 and E3 work; P5 is parked; P1.7 is deferred (voice is off, D10: build it when voice turns on). Sizes follow the roadmap key (S 1, M 2 to 3, L 4 to 5 days) unless a range is given.
| ID | Story | Dep | Pri | Size | Done when |
|---|---|---|---|---|---|
| P0.1 | App factory `create_app(container)`, `/api` prefix, settings that fail fast, memory container for tests; env audit test (1f) | E1.1 | M | S | Existing `/health` test still green; every route mounted under `/api`; no literals for tuning values (I35); `test_env_audit_closed` |
| P0.2 | Data-layer ports and ADR 0031: `TenantCtx`, `tenant_tx`, repo Protocols (section 4), `SystemGateway` with `resolve_membership` as an amendment to 0012, `Clock`, typed errors | P0.1, P3.17 | M | M | Import-lint: api, core, jobs, agent cannot import adapters or a DB driver; ADR 0031 filed with the probe case for `resolve_membership` and the consolidated SECURITY DEFINER list |
| P0.3a | Memory repos plus a DB-agnostic conformance suite for tenancy, uniqueness, composite ownership, order and paging (about 20 repos) | P0.2 | M | L (6 to 8 d) | Suite proves isolation, uniqueness, ownership, order and paging; memory impl passes |
| P0.3b | Conformance for atomic and concurrent operations: `usage.reserve`, job lease and dedup, `outbox.transition`, `insert_if_new` | P0.3a | M | M | Concurrent-task tests pass on memory; same file runs on Postgres in P5.2 |
| P0.4 | Parity ledger linter and `@parity(id)` marker; runs first in A0 so "red first" is checkable | E1.11 | M | S | CI fails when a registered route, an FE call pattern or a marker id is missing from the ledger, or a fixture's `legacy_ref` does not resolve, or `signed_by` is empty or equals `derived_by` |
| P0.5 | `AuthVerifier` port, `FakeAuth`, memory tenant resolution (pending, active, suspended) | P0.2 | M | S | 401 only for auth failure, 403 for tenant status (BH16, BH23); exact public paths (CHG-29) |
| P1.1 | Funnel, stage and score rules (forward-only, intent to funnel, funnel to board) | none | M | S | Golden table; AI-created lead is follow-up eligible (BH08) |
| P1.2 | Customer and visit rules, phone merge, `customer_jid` builder | E2.13 | M | S | Cases: 91, +91, leading 0, spaces, no phone; outcome to hotness; tag union |
| P1.3 | Budget parser and negotiation helpers | none | M | S | lakh/lac/l, crore/cr, plain 5 to 8 digits; round cap helper |
| P1.4 | Slot engine: IST grid, overlap, alternatives | none | M | M | Same day then 3 days, nearest 3; past slots rejected; fake clock |
| P1.5 | Price, file and Sheets parsing | none | M | M | Price forms, column inference, header sanitiser, placeholder skip, qty 0 survives, Status Sold respected |
| P1.6 | Chunking, hashing, stable embed text | none | M | S | 200 words, 40 overlap, drop 20 chars or less, hash; embed text has no price |
| P1.7 | STT quality gates and walk-in regex fallback. Deferred: builds code for a feature D10 turned off | none | S | S | Build when voice is turned on; gate list and boilerplate blacklist as data and golden tests |
| P1.8 | Catalog status, sort and stats rules | none | M | S | available/sold/all, deleted hidden, sort keys, counts |
| P1.9 | Contact-name merge rule (CHG-28) | E2.13 | M | S | Name set on create; number label replaced by a later profile name; owner-set name never overwritten; empty profile name ignored |
| P2.1a | Frontend serializer layer | P0.1, E1.11 | M | M | Embedded relations, bare knowledge array, status table, `customer_jid`, sender map |
| P2.1b | Golden fixtures, one per FE-called route (41), each signed by a second reader and carrying `legacy_ref`, `derived_by`, `signed_by`, trust; a mutation probe per fixture | P2.1a, P2.4 | M | L (8 to 10 d) | 41 fixtures committed slice by slice, each before its slice starts; linter green |
| P2.2 | FE read-set manifest generator, with a `blind: true` flag for pages it cannot fully resolve (2f) | E1.11 | M | S | Per page: keys read and sent; CI diff when `frontend/src` changes; blind pages listed |
| P2.3 | Frontend smoke against the fake-wired app (needs owner OK to run the frontend; legacy is never run). Gate before M3 | A2, A4 | M | M | Every FE-called screen walked once from a checklist; every `blind: true` page covered; findings filed as ledger rows |
| P2.4 | FE response-type cross-check | E1.11 | M | S | Types extracted per page into `fe_types/`; a test fails when a fixture lacks a key the type requires |
| P2.5 | Owner capture intake: 9 scrubbed legacy responses (2g) stored and compared to fixtures | OD-16 | M | S | Shape diff per capture filed in the ledger; L3 set where it matches |
| P3.1 | `AgentRunner` port, `RunInput`, `RunResult` (incl. `NoReply`, `RunReport`, `AgentTasks`, `ItemSearch`, `LeadProposal.score`, `schema_version`), proposals, `ScriptedAgent` (types per 09 s2.2) | P0.2, P3.17 | M | S | Types shared with the agent plan; any other return becomes an `ai_failure` item |
| P3.2a | `agent_run` job and post-step on memory repos (09 step 7: starts only after the red smoke scenarios P3.7a exist) | P3.1, P3.7a, P3.3, E2.5, E5.1 | M | L | One transaction applies proposals; ai_paused, opt-out, window and high-water re-checked; reply key `reply:{run_id}`; hold atomic with holding row, alert and reminder jobs; `agent_runs` row; `conversations.language` written every run (V43) |
| P3.2b | Kill-mid-apply, restart and race tests for the post-step | P3.2a | M | M | Kill at each step leaves no half-applied hold or reply; two restarts cap (ADR 0023) |
| P3.3 | Agent read ports and in-memory implementation; absorbs the read-port half of E4.15 (`ports/agent_reads.py`; catalog search returns `ItemSearch`) | P0.3a | M | M | `AgentContextPort`, `CatalogReadPort`, `KnowledgePort`, `CalendarReadPort`, `PricingPort` (guard only): typed Found/NotFound/Error, tenant-bound, no write methods |
| P3.4 | Seam contract suite (= CT2 plus CT6 in 09 s3.1) | P3.2a, P3.3 | M | S | Scenarios in section 3b pass with `ScriptedAgent`; import-lint: `app.agent` cannot import repo writes, jobs or adapters |
| P3.5 to P3.18 | The 17 seam stories (09 s8, order and days there: P3.17 ADR renumbering and ADR 0034, P3.5 versioning and snapshots, P3.6 `SeamWorld`, P3.7a/b/c scenarios, P3.8a/b twins, P3.9 adversarial pack, P3.10 `RunGate`, P3.11 import-lint and `core/rules`, P3.12 holding resolution, P3.13 proposal validator, P3.14 failure suite, P3.15 summarize wiring, P3.16 `RunReport` persistence, P3.18 ledger rows T01 to T44). 09's "P3.2" is P3.2a plus P3.2b here | see 09 s8 | M | 41 to 52 d | 09 s8 "Done when" per story; defined once, in 09 |
| P4.1 | Memory job queue and runner | P0.3b | M | M | Lease, dedup, per-conversation serialisation, retries, two-runner test; the same JobRepo suite E2.3 must pass on Postgres |
| P4.2 | Job-kind catalogue | P4.1 | M | S | Payload model, dedup-key formula and retry class per kind (section 4e) |
| P4.3 | Per-number send pacing in the send job (V41) | P4.1, E2.5 | M | S | Burst of 5 sends leaves at least the configured interval between sends on the fake clock; interval is a setting, default 3000 ms until CQ-21 is answered |
| P5.1 | Postgres repo adapters (parked) | P0.3a, P0.3b, E1.4, E1.5 | M | L | Implements every repo Protocol; no change to api, core or jobs |
| P5.2 | Postgres re-run of the repo, contract and seam suites (parked); sets Gp | P5.1 | M | S | Same suites green on memory and Postgres; result diff empty; RLS suites T1 to T20 green |
| P6.1 | Harvest legacy rule cases as eval seeds with `legacy_ref`: negotiation (8 percent default, 30 percent cap, 4 rounds, floor and discount attribute keys: `domains/used-cars/index.ts:386-398`; `pipeline-service.ts:571-592`), location (4 variants: `pipeline-service.ts:538-566`), slot alternatives text (`appointment-service.ts:288-297,346-381`), handoff (complaint, sentiment below -0.5: `pipeline-service.ts:617-619`), budget parser inputs (`pipeline-service.ts:1239-1262`). Expected outcomes follow v2 rules (authority 0 by default), not legacy | P1.3, P1.4 | M | M | At least 8 negotiation, 4 location, 4 slot, 6 handoff and 12 budget cases as YAML under `tests/eval/seeds/legacy/`, each with `legacy_ref`; agent plan E4.T1 and E4.13 import them. Marked `provisional` until the Hinglish/Marathi labeller is named |
| P6.2 | Retrieval-threshold calibration: legacy 0.4 for knowledge and 0.35 for catalog (`rag-service.ts:21`, `catalog-service.ts:390`) were tuned for Jina; the embedding model change invalidates them | E4.1, E4.3, E4.T1 | M | M | At least 30 knowledge and 30 catalog queries (hit, miss, near-miss, Hinglish); precision and recall at each candidate threshold recorded; thresholds set in config from the table. Gate for M3 |

### 6b. Existing stories amended
| Story | Change | Added dep | Size effect |
|---|---|---|---|
| All E2.x and E3.x | Done when: Gm (green on memory repos and fakes). The milestone gates M2 and M3 close only on Gp: Postgres re-run (P5.2) plus the RLS suites. Owner line, OD-17 | P0.1, P0.3a | none |
| E1.11 | Also writes the FE read-set and route inventory that P0.4, P2.2 and P2.4 consume | none | none |
| E3.T1 | Each test carries `@parity(Rxx)` and asserts the FE read-set keys plus the golden fixture | P2.1b, P2.2, P0.4 | +S |
| E3.1 | Unknown keys silently dropped, no 400 (Onboarding.tsx:29 PATCHes its whole state); pending-tenant path; PATCH before GET runs `provision_tenant` (BH13, BH23) | P0.5 | none |
| E3.2 | Phone merge (CHG-05), stage enum, visit side effects, 201/200 table; AI tasks per OD-10 | P1.1, P1.2 | none |
| E3.3 | Stats by count, deleted hidden, multipart rules, export 404 (BH05, BH17, BH18) | P1.8 | none |
| E3.5 | Newest N ascending, `customer_jid`, `business_owner`, failure as non-2xx (CHG-01, 02, 11, BH15) | P2.1a | +S |
| E3.6 | Add `userId`, `connectedAt`, digits `phone` (BH14; Dashboard.tsx:320-347) | none | none |
| E3.7 | Tenant scoped, IST day, board-stage keys (CHG-09) | P1.1 | none |
| E3.8 | Owner overview keeps all 11 top-level and 13 per-business keys, `total_voice_calls` returns 0 (CHG-30, BH28) | none | none |
| E3.9 | Also stubs POST /voice/extract-walkin (R50), typed 501 body (CHG-24, OD-12b) | none | none |
| E3.10 | `.xls` per OD-9; per-row result; status failed on partial (F5) | P1.5 | none |
| E2.3 | Contract is the P4.1 JobRepo suite; runs on memory first | P4.1 | none |
| E2.4 | Depends on P0.3a and P4.1, not on a DB; name rule (P1.9, CHG-28); unsupported kinds branch to E6.5a | P0.3a, P4.1, P1.9 | none |
| E2.10 | Buckets are never created by the app; private; `/readyz` reports a missing bucket (I36) | none | none |
| E6.5 | Split. E6.5a (A2): ingest branch, `unsupported` storage incl. unknown event types and image captions, polite reply through the outbox, no `agent_run`. E6.5b (A3): review item and the `notify_owner` job via E5.1 and E5.2 (E6.3, the STT-failure path in A6, later reuses this path; alert delivery is E5.3 in A5). FR-5 is done when both pass | E6.5a: E2.4, E2.5; E6.5b: E5.1, E5.2 | +S |
| E7.6 and E4.14 | Add the B-NEW-1 and B-NEW-6 round-trip pack; sync tick default 15 min (CHG-07); tab name from tenant setting (1f) | P1.5, P1.6 | none |
| E5.9 | Decide AI-created tasks (OD-10) before the serializer test is written | OD-10 | none |
| E8.6 | Includes `maintenance:inbox_prune` (J6, M-06) | none | none |

### 6c. Totals
Roadmap size key (S 1, M 2 to 3, L 4 to 5 days), gross working days, no calendar dates (D16, D19). P0.3a and P2.1b carry explicit ranges because the key was too low for them.
| Group | Stories | Days |
|---|---|---|
| New, scheduled (P0 to P4, P6) | 30: 16 S, 11 M, 3 L (P0.3a, P2.1b, P3.2a) | about 56 to 72 |
| New seam stories P3.5 to P3.18 (09 s8) | 17 (in 09, not in the table above) | about 41 to 52 gross, 38 to 49 net of the E4.15 and E4.28 savings in 08 |
| New, parked or deferred | P5.1 (L), P5.2 (S), P1.7 (S) | not counted |
| Existing stories assigned to A0 to A6 | 65: A0 8, A2 17 (with E6.5a), A3 8 (with E6.5b), A4 9, A5 11, A6 12; E1.T1 and E1.T2 stay red until the DB and are not counted | about 124 to 167 |
| Amended stories | 19 rows in 6b; the extra work (E3.T1 +S, E3.5 +S, E6.5 +S) is inside the line above | n/a |
Sum: about 221 to 291 days gross before overlap (the seam stories add 41 to 52) (P4.1 and E2.3 share one contract; some P1.x rules are also inside E3 stories). The agent-plan stories (E4.1 to E4.3, E4.5 to E4.7, E4.10 to E4.13 and the new E4.15 to E4.38) are sized in [08](08-agent-migration-plan.md), not here. Most of A1 is cheap; P0.3a, P2.1b and P3.2a are the three big ones.

## Needs owner decision
| # | Question | Default if no answer |
|---|---|---|
| OD-1 | Funnel to board stage map (inventory O2): inquiry to new; qualification, test_drive to interested; negotiation to negotiating; booking, documentation, delivery to closed | Use this map; review on pilot data |
| OD-2 | Messages list: newest 500 ascending instead of oldest 100 | Yes |
| OD-3 | Deleted catalog items: hide from Sold list and stats | Hide |
| OD-4 | Sheets conflict rule: DB wins quantity and price, sheet adds new rows; auto-sync tick interval | DB wins; on demand plus every 15 min per tenant with a sheet |
| OD-5 | One phone normaliser: digits with country code, merge on write | Yes |
| OD-6 | `/sessions` adds `userId`, `connectedAt` (additive) | Yes |
| OD-7 | Routes with no FE caller (R06, R25, R30, R35, R36, R43, R46, R48, R49, R53) | Drop R35, R36, R43, R53; keep the rest as thin routes |
| OD-8 | Remove `embedding`, `reasoning_trace` and 500 detail keys from payloads | Remove |
| OD-9 | `.xls` upload | Reject with 400 |
| OD-10 | AI-created tasks (legacy filled the Tasks page): drop, or add a propose-task tool later | Drop for pilot |
| OD-11 | Sharing catalog photos inside replies has no home in the agent design (legacy sent up to 3) | Not in pilot |
| OD-12a | Daily 21:00 owner report (O1, J1) | Off |
| OD-12b | Walk-in voice extraction (O3, R50). D10 turns voice off for customer conversations; the PRD still lists the route in the frontend contract (`01-prd.md:131`) and it is staff capture, a different feature. Without an STT vendor (E0.4) it cannot work, and the mic button shows an error meanwhile | Typed 501 stub until a vendor is chosen; confirm you accept the error on the mic button |
| OD-13a | Package names `core`/`jobs` vs architecture `domain`/`worker`/`db` (ADR 0031) | Keep code names |
| OD-13b | Placeholder text the owner sees for unsupported inbound kinds | "[Voice note: not supported yet]", "[Image: not supported yet]" plus the caption if any |
| OD-14 | New signup gets a `pending` tenant that cannot add stock until the team activates it (visible, ADR 0014) | Accept; team activates at onboarding |
| OD-15 | `ai_confidence_threshold` stays in Settings but does nothing; `followup_timer_hours` is honoured by follow-ups | Accept |
| OD-16 | Copy 9 real responses from the old app's browser network tab (list in 2g), names and phones scrubbed. One time; we run nothing | Yes |
| OD-17 | Accept "done" for E2/E3 stories as Gm (green on memory) while the DB is parked, with M2 and M3 still requiring Gp. This weakens the story-level wording of the roadmap; the milestone gates are unchanged | Yes |
| OD-18 | Customer name: stop overwriting an owner-set name on every inbound (CHG-28) | Fix as in CHG-28 |
| OD-19 | Image with a caption: keep the caption visible to the owner but do not run the agent on it (FR-5), or treat the caption as text and let the agent reply (needs a PRD change) | Keep visible, no agent run |
| OD-20 | Name the Hinglish/Marathi eval labeller (roadmap asks by M2). Until then P6.1 seeds and the eval gate are provisional | Needs a name and a date |

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Fixtures are written from code reading, not recorded legacy output | A wrong fixture blesses a wrong port | Second-reader signature, FE types, 9 captured responses, mutation probe (2g); P2.3 smoke before M3 |
| Memory repos laxer than the DB | Bugs surface only at DB time; leak probes prove the memory filter, not RLS | Conformance suites P0.3a and P0.3b; Gm is not done for M2 and M3 (2e, OD-17); same suites on Postgres (P5.2) |
| Seam drifts between the two migration plans | Double sends, lost holds | `ports/agent.py` is the only shared code; seam suite P3.4; one owner for the types (P3.1) |
| Porting legacy rules literally brings back B-NEW-1 to B-NEW-6 | Same bugs return | Tests named after the finding ids (section 2b) |
| Route list from client grep misses a dynamic path | Missing contract | Re-grep in CI (P0.4); screen walk P2.3 |
| FE read-set parser is static | A page reads a key it cannot see (spread, alias, child component) | Blind pages flagged, FE types as second source, P2.3 gate (2f) |
| Planned schema lacks fields the API needs (G1 to G8) | Late rework when DB resumes | Fix 03-tenancy-data now; repo models already carry the fields |
| Visible changes surprise the pilot user | Trust | CHG register, owner acceptance (L3), demo before pilot |
| A2 is large (messaging spine) | Slips | Split E2.x as listed; M2 suite is the gate, not the story count |
| Agent plan inherits no legacy cases | Behaviour regressions undetectable (negotiation, location, handoff) | P6.1 seeds; P6.2 calibrates retrieval thresholds |
| Eval labeller not named | Seeds and the M3 gate stay provisional | OD-20 |
| Buying-signal score (V16) deferred with no trigger | Never revisited | Revisit after M3 and 4 weeks of pilot data if the owner overrides the AI score on more than 25 percent of leads |
| Estimates were low for the three big stories | Schedule surprise at M2 | Explicit ranges in 6a; headline now includes existing stories (6c) |
| ChatSyncs behaviour unknown | Adapter rework | Fake profiles and recorded fixtures; slices A0 to A6 do not need it; pacing interval is a setting |
