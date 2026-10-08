# Vyavsay Assist v2: Product Brief and PRD (v1)

**Summary**
1. Vyavsay Assist is a WhatsApp AI sales copilot for small Indian businesses. First vertical: used-car dealers.
2. v1 is a full Python/FastAPI rebuild with a fresh DB, ChatSyncs for WhatsApp, and the existing frontend with no screen changes.
3. v1 adds tenant isolation (RLS plus restricted worker role), a grounded and checked agent, 24h-window rules, follow-ups, hold-and-escalate (the AI never goes silent), Cal.com booking.
4. The frontend makes 59 client call sites over about 43 distinct routes (section 5); shapes stay fixed. Milestone 0 is a ChatSyncs spike (no Meta fallback; wait for ChatSyncs, work continues on a fake provider).
5. Out: phone calls, payments, Sarvam STT, new screens. Open items are listed under "Needs owner decision".

Decisions source: [04-owner-decisions](../../docs/production-plan/04-owner-decisions.md). Audit: [00-README](../../docs/production-plan/00-README.md), [gap register](../../docs/production-plan/01-gap-register.md). ADRs: [0001](adr/0001-frontend-api-compat-layer.md) contract, [0002](adr/0002-tenancy-rls-and-worker-role.md) tenancy, [0003](adr/0003-durable-inbox-and-job-claiming.md) inbox/jobs, [0004](adr/0004-hosting-and-availability.md) hosting, [0005](adr/0005-stt-vendor-and-model-gateway.md) gateway/STT, [0006](adr/0006-per-tenant-integrations.md) Sheets config, [0025](adr/0025-hold-and-escalate.md) hold and escalate, [0026](adr/0026-calendar-via-calcom.md) Cal.com, [0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md) Langfuse Cloud, backups, ChatSyncs wait. Owner Q&A of 2026-10-07 (D1 to D8) is appended to the decisions file.

## 1. Product brief

**What it is.** A multi-tenant SaaS. Each business connects a WhatsApp number. An AI agent answers customers (text in the pilot; voice notes later, once ChatSyncs media is proven) from that business's inventory and knowledge, qualifies leads, books visits, and hands tricky chats to the owner. The owner runs the business from the existing web dashboard.

**Why now.** Small dealers lose leads on slow replies, late-night enquiries and forgotten follow-ups. The old prototype proved the idea but is unsafe to put real customers on (no RLS, silent AI failures, invented claims, no WhatsApp window rules).

**Stage and stakes.** No live tenants. One pilot to be named (Girija Motors or Giriraj). Pre-revenue; plan tiers exist but no payments.

### Users
| User | Job to be done | Surface |
|---|---|---|
| Business owner / sales staff | See leads, answer chats the AI escalated, take over chats, book visits, edit stock and knowledge | Existing web app |
| End customer (car buyer) | Ask price/availability, negotiate, book a test drive, in Hinglish, by text or voice note | WhatsApp |
| Vyavsay team (admin) | Onboard a business: persona, tone, hours, max discount, WhatsApp connection, Cal.com account and availability | DB / admin-assisted, no new screen |
| Platform owner | Cross-tenant overview, usage and limits | `/owner/overview` page (exists) |

### Problems (with audit evidence)
| Problem | Today | Audit ref |
|---|---|---|
| Customer data can cross tenants | no RLS, service-role everywhere, oldest-user fallbacks | H-01, H-02, H-05 |
| AI says wrong or invented things | invented warranty, floor price leak, no grounding check | H-26, H-27, H-28 |
| AI fails silently | canned replies on LLM error, retrieval errors look like "no match" | H-15, H-29 |
| Messages lost | ack then in-memory work | H-13, H-14 |
| WhatsApp rule breaks | no template or 24h tracking, no opt-out | H-20, H-23 |
| Follow-ups and reminders lost on restart | in-memory timers | H-17 |
| One persona for all | hardcoded "Rahul" | H-25 |
| No tests, no safe deploys | zero tests, manual deploy | H-32, H-34 |

## 2. v1 scope (from owner decisions)
| In | Notes |
|---|---|
| Python/FastAPI backend, LangGraph agent | old Node code is reference only |
| Fresh Supabase/Postgres, RLS from day one | no data migration |
| WhatsApp via ChatSyncs behind a `WhatsAppProvider` interface | Inbound text webhook, send and templates documented (from docs, unverified in practice); auth, retries, media still open; no Meta fallback; spike gates the adapter, FR-3,4,5,11,12,13; everything else runs on the fake |
| Voice notes in (transcribe), text out | no phone calls; STT vendor to choose (not Sarvam in v1). **Off for the pilot (owner D10, 2026-10-08)**: inbound voice is undocumented and `voice_notes`/`media_download` stay false until a real media fixture exists. v1 "done" means voice off: voice and images are stored `unsupported`, the customer is asked politely to type, the owner is alerted (FR-5). Voice-minute limits stay out of the pilot tier. The voice pipeline is built on fake media only |
| 24h window + approved-template fallback | |
| Automatic follow-ups, persistent and multi-instance safe | |
| Hold and escalate: safe holding reply to the customer, alerts to the owner (email, WhatsApp, "Needs you" flag), owner replies in Conversations, reminders at 30 min and 2 h, customer notice at 4 h business hours | [0025](adr/0025-hold-and-escalate.md); no frontend change |
| Cal.com booking (replaces Google Calendar) | API key per tenant set at onboarding, bookings shown on Appointments via `/tasks` ([0026](adr/0026-calendar-via-calcom.md)) |
| Plan tiers and usage limits, no payments | prices open |
| Per-business Sheets sync | sheet id set at onboarding ([0006](adr/0006-per-tenant-integrations.md)) |
| Per-business persona, tone, hours, max discount in DB | set by team |
| IST only, timezone kept in the data model | |
| Model gateway, versioned prompts, Langfuse Cloud tracing with name and phone masking | [0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md) |

## 2a. v1 cut line and milestones
| Tier | Content |
|---|---|
| Core (pilot cannot start without) | FR-1 to FR-15, FR-17, FR-20, FR-21, FR-23, FR-24, FR-25, FR-26, FR-27 |
| Slip candidates, in order | FR-19 Sheets, FR-18 plan tiers (keep a simple per-tenant hard cap), FR-16 Cal.com booking (fallback: visit saved as task, owner confirms), FR-22 offboarding |

| Milestone | Gate |
|---|---|
| M0 spike (about 1 week, starts when ChatSyncs gives access) | ChatSyncs open facts (E0.8): check docs for a signing secret or IP list first (none: owner signs the D9 risk note), then retries, voice and image payloads, owner-phone echo (first spike case, D13), rate limits, pricing (list in [architecture](02-architecture.md) section 4). No fallback provider: if ChatSyncs cannot do it, the owner decides. Cal.com spike (attendee email, free-tier API, webhooks). STT sample test ([0005](adr/0005-stt-vendor-and-model-gateway.md)) |
| M1 | Schema, RLS, worker role, CI probes, auth, contract-test harness ([0002](adr/0002-tenancy-rls-and-worker-role.md)) |
| M2 | Inbox, jobs, outbound, window, opt-out ([0003](adr/0003-durable-inbox-and-job-claiming.md)) |
| M3 | Agent, grounding, eval set |
| M4 | Follow-ups, hold-and-escalate alerts and reminders, remaining routes |
| M5 | Cal.com, Sheets, tiers, restore drill, pilot |

## 3. Functional requirements
Priority: M = must for v1, S = should. Each maps to an audit risk.

| ID | Requirement | Pri | Audit |
|---|---|---|---|
| FR-1 | Auth: Supabase JWT. Every row belongs to a tenant; every API call resolves tenant from the JWT only, never from client-supplied ids. | M | H-01, H-05 |
| FR-2 | RLS on all tables, deny by default. API uses `app_user`; webhooks, workers, cron use a restricted `worker_role` with per-job tenant context; service role only for migrations; owner overview via aggregate-only functions. Cross-tenant probe in CI covers API, worker paths and owner functions ([0002](adr/0002-tenancy-rls-and-worker-role.md)). | M | H-01, H-02 |
| FR-3 | Inbound stored durably first (UNIQUE provider message id), then processed by a worker claimed with `SKIP LOCKED` plus lease; one in-flight job per conversation; contact and conversation unique on `(tenant, contact)` (fixes duplicate rows). Atomic multi-step writes via transactions/RPC. | M | H-13, H-14, H-12, M-08 |
| FR-4 | Routing by the connected number only; UNIQUE on connected number across tenants. Unknown number rejected, never a default tenant. | M | H-05 |
| FR-5 | Pilot (voice off, D10): an inbound voice note, image or other non-text message is stored as `unsupported`, the customer gets a polite reply asking them to type, a review item opens and the owner is alerted; never silence, never an agent run on it. **Done criteria (v1):** this text-only path passes on the ChatSyncs profile and on the fake. When `voice_notes` is later turned on (needs a recorded media fixture): download with size cap and timeout, transcribe, treat as text; failure falls back to the same polite reply plus review item. | M | scope, M-14 |
| FR-6 | Agent answers only from the tenant's inventory, knowledge base and config. No invented warranty, offers or social proof. Static system prompts, customer text only as user input, tool output schema-validated, bookings need server-held confirmation. | M | H-26, M-04 |
| FR-7 | Post-generation check: prices, names, availability in a reply must match retrieved rows; otherwise regenerate or route to review. | M | H-27 |
| FR-8 | Negotiation never reveals floor/cost fields; stays within the business's max discount; deal beyond it goes to review. | M | H-28 |
| FR-9 | Retrieval returns typed success/error. Errors raise an alert and a safe handoff, not "no match". Hybrid retrieval (filters, vector, text) for Hinglish queries, tenant filter inside the vector query. Knowledge as documents: replace chunks on edit, query rewrite. | M | H-29, H-31, M-12 |
| FR-10 | LLM failure never sends canned or fake content as an answer; the customer gets only the fixed holding reply (FR-26), the item is queued for retry or review and the owner is notified (FR-27). | M | H-15 |
| FR-11 | 24h window tracked per conversation. Outside it, only approved templates are sent; otherwise the item waits or is held. | M | H-20 |
| FR-12 | Outbound row written before send with idempotency key; results (accepted, sent, delivered, read, failed) stored with provider id; the API never says success on failure; crash mid-send never double-sends ([0003](adr/0003-durable-inbox-and-job-claiming.md)). | M | H-21, H-22, M-08 |
| FR-13 | Consent and opt-out: STOP detection, per-contact suppression honoured by all automations. | M | H-23 |
| FR-14 | Automatic follow-ups from persisted schedules; one runner wins under many instances (DB lock); respects window, consent, quiet hours, re-checked at send time. | M | H-17 |
| FR-15 | Escalation queue: held replies and escalations are stored as `review_items` with reason and the AI's draft; the owner answers by typing in the Conversations composer (no approve or reject); an owner message or `ai_paused=false` resolves the item and the AI resumes; takeover pauses AI per conversation (`ai_paused`). Draft is never auto-sent ([0025](adr/0025-hold-and-escalate.md)). | M | H-24 |
| FR-26 | Holding reply: when the agent is unsure or the guard holds a draft, the customer gets one short fixed template reply (per language, no claims, no LLM text) and the owner is alerted. Never during opt-out, `ai_paused` or `unknown_send`; session text only inside the 24h window; wording states receipt only and needs owner approval. | M | H-15, H-24 |
| FR-27 | Owner alerts and reminders: on escalation alert by email, WhatsApp to the owner's number and the "Needs you" flag in `GET /conversations` (draft included in email and WhatsApp); remind at 30 min and 2 h; at 4 h (business hours) tell the customer the team will reply soon; chat stays open. Persisted jobs, multi-instance safe. | M | H-17, H-24 |
| FR-16 | Calendar booking via Cal.com: availability check, create/reschedule/cancel on the business's Cal.com event type, Cal.com webhooks and a daily reconcile keep bookings in sync, bookings show on the Appointments page through `/tasks`, reminders persisted; slot uniqueness constraint plus Cal.com and find-before-retry against double booking; per-tenant API key set by the team ([0026](adr/0026-calendar-via-calcom.md)). | M | H-17, H-19, M-08 |
| FR-17 | Per-business config (persona, tone, hours, holidays, away message, max discount, languages incl. Hindi, Marathi, English) read at run time through one hours resolver; prompts are versioned data with per-business overrides. Agent never offers visits outside hours. | M | H-25, M-29, L-17, M-10 |
| FR-18 | Plan tiers and limits (messages, items; voice minutes only once voice is on, not in the pilot tier) enforced per tenant with clear "limit reached" behaviour and owner notice; usage ledger updated atomically with the limit check. | M | H-16 |
| FR-19 | Sheets sync per business for actions `sync`, `export-to-sheet`, `import-from-sheet`. Sheet id and Google access come from `tenant_integrations` set at onboarding ([0006](adr/0006-per-tenant-integrations.md)); missing config returns a clear error. Embeddings updated on import. | S | H-30 |
| FR-20 | Catalog, customers, leads, tasks, knowledge, visits, schema CRUD as the frontend uses them (section 5). `PATCH /users/{id}` accepts an allow-list of columns only (no plan, role, tenant, limits). | M | contract, mass assignment |
| FR-21 | Media (voice, images) in private storage, served by signed URL after tenant check; type validated by content; storage included in backup and restore drill (NFR-5). | M | H-09, H-11 |
| FR-22 | Tenant offboarding: export and erase data, revoke tokens. | S | H-36 |
| FR-23 | Provider secrets (ChatSyncs, Cal.com API keys and webhook secrets, Google Sheets access) encrypted at rest, never returned by APIs. | M | H-07 |
| FR-24 | Append-only `audit_log` for owner-overview access, takeover, approvals, deletes, integration changes, config edits. | M | M-24 |
| FR-25 | One redacting structured logger: no phone numbers, transcripts or message bodies in logs; retention set. LLM calls use paid zero-retention endpoints with DPAs and minimised PII; AI disclosure in first customer message. | M | M-19, M-23 |

## 4. Non-functional requirements
| ID | Requirement | Target (to confirm) |
|---|---|---|
| NFR-1 | Reply latency, text, p95 from receipt to send (single definition; replaces the 5 s audit aim, which a multi-LLM-call pipeline cannot meet) | under 15 s; stretch 8 s |
| NFR-2 | No lost inbound message | zero after ack; replay possible |
| NFR-3 | Availability of webhook endpoint | 99.5%; needs 2+ api instances ([0004](adr/0004-hosting-and-availability.md)) |
| NFR-4 | Reproducible schema | migrations from empty DB in CI |
| NFR-5 | Backups | Supabase paid PITR on plus daily dump to the owner's S3 ([0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md)); storage bucket backup; restore drill before pilot; RPO 1 h, RTO 4 h (verify plan limits) |
| NFR-6 | Observability | /livez, /readyz, structured logs, Langfuse Cloud trace per agent run with names and phone numbers masked, alerts on LLM/provider errors and on escalations unanswered past 2 h |
| NFR-7 | Cost control | per-tenant token and call accounting; gateway task-to-model config; fallback model |
| NFR-8 | Security | no secrets in repo; webhooks fail closed with signature check; rate limits per tenant |
| NFR-9 | Quality gate | CI blocks release on: contract tests, cross-tenant probes, eval set (at least 150 cases incl. prompt injection, Hinglish/Marathi), concurrency tests (duplicate webhooks, parallel messages, two workers), fake-clock IST tests (window, quiet hours, hours), fault injection (LLM, ChatSyncs, DB down), error-envelope tests |
| NFR-10 | Privacy | DPDP-aligned processor list and retention policy; timestamps stored UTC, shown IST. Privacy/Terms text (H-35, L-14) and walk-in consent (L-15) are frontend changes: not in v1 unless the owner approves an exception; DPA published by the owner outside the app |
| NFR-11 | Horizontal safety | N instances OK: no in-memory state for jobs, dedup or locks |
| NFR-12 | Error envelope | One JSON error shape with the `error` key the frontend reads; no stack traces; request id in logs | 

## 5. Frontend API contract (inventory)
Base: `VITE_API_BASE_URL` or `/api`. Header `Authorization: Bearer <Supabase JWT>`. A 401 sends the user to `/login`. Auth itself (signIn, signUp, session, signOut) goes direct to Supabase with the anon key; `VITE_OWNER_EMAILS` gates the owner page. Source: `../frontend/src`. Grep of `client.<verb>(` finds 59 call sites, about 43 distinct method+path patterns, plus direct Supabase Auth. Re-grep at M1 and generate contract tests from the full list.

| Area | Method and path | Used by | Notes |
|---|---|---|---|
| Users | GET, PATCH `/users/{id}` | Settings, Dashboard, Onboarding | `{id}` must equal JWT user; PATCH uses a column allow-list (FR-20) |
| Sessions | GET `/sessions` -> `{sessions}`; GET `/sessions/{id}/status` -> `{status, phone}`; POST `/sessions` `{}`; DELETE `/sessions/{id}` (client sends user id; server uses JWT) | Dashboard, QRScanner, Settings | Facade over ChatSyncs. Status values seen: `connected`, `qr_pending`, `connecting`, `no_session`. Dead in old backend (H-37) |
| Analytics | GET `/analytics` | Dashboard, Analytics | Must include `totalMessages` (page reads it, old API omitted it), tenant-scoped |
| Conversations | GET `/conversations` -> `{conversations}`; GET `/conversations/{id}/messages` -> `{messages}`; PATCH `/conversations/{id}` `{ai_paused}`; POST `/conversations/{id}/messages` `{content}` | Conversations | POST must report real send failure; sender value `business_owner`. While an escalation is open the response is shaped: `summary` starts "Needs you: <reason>" and `ai_paused` reads true (no new fields); an owner message or `ai_paused=false` resolves it ([0025](adr/0025-hold-and-escalate.md)) |
| Customers | GET `/customers` (query params); GET, PATCH, DELETE `/customers/{id}` | Customers, CustomerDetail | |
| Visits | POST `/visits`; POST `/voice/extract-walkin` (multipart) | AddWalkInModal, CustomerDetail | Voice extract returns form fields |
| Leads | GET `/leads` -> `{leads}`; PATCH `/leads/{id}` `{stage}` | Leads | Stages: new, interested, quoted, negotiating, closed. Unknown stage shown as new |
| Tasks | GET `/tasks` -> `{tasks}`; POST `/tasks`; PATCH `/tasks/{id}` `{is_completed}`; DELETE `/tasks/{id}` | Tasks, Appointments, Dashboard | Appointments page is built on tasks; confirmed Cal.com bookings appear here as visit tasks ([0026](adr/0026-calendar-via-calcom.md)) |
| Catalog | GET `/catalog?{params}`; POST `/catalog`; PATCH `/catalog/{id}`; PATCH `/catalog/{id}/sold`; DELETE `/catalog/{id}`; GET `/catalog/stats`; GET `/catalog/export?type=` (blob); POST `/catalog/images/upload` (multipart) | InventoryTable, ItemModal, AIBrain | |
| Schema | GET `/schema`; PATCH `/schema` `{schema}` | AIBrain | Per-tenant custom attributes |
| Knowledge | GET `/knowledge` (also `?userId=`); POST `/knowledge` `{content}`; DELETE `/knowledge/{id}` (also `?userId=`) | KnowledgeBase, AIBrain | Ignore client `userId`, use JWT |
| Files | POST `/files/upload` (multipart); POST `/files/{id}/process` | FileUpload | Inventory file import |
| Sheets | POST `/sheets/{action}`, action in `sync`, `export-to-sheet`, `import-from-sheet`; no body | AIBrain (`AIBrain.tsx:190`) | Reads `message`, `added`, `updated`, `error`. Sheet id comes from tenant config ([0006](adr/0006-per-tenant-integrations.md)) |
| Owner | GET `/owner/overview` | OwnerDashboard | Platform admin only |
| Voice calls | GET `/vapi/calls?limit=`; GET `/vapi/calls/{id}/actions`; POST `/vapi/calls/outbound` | VoiceCalls page (route `/voice-calls`) | Parked feature. Return empty list; outbound disabled (403/501). See flaw below |

**Contract rules**
- Same paths, methods, JSON keys; new fields only additive.
- Server ignores any user id from the client and uses the JWT. Cross-tenant ids return 404.
- Multipart upload field names and blob export copied from the frontend source when writing contract tests (to verify per route).
- RLS must not break the browser's direct Supabase use (auth only, no table reads found in `src`; verify with a final grep before build).

**Frontend gaps that need an owner decision (evidence)**
| Gap | Evidence | Options |
|---|---|---|
| No calendar connect screen | no `calendar`/OAuth route in `src/api` calls or pages | Decided: team sets up Cal.com per business at onboarding, no frontend change ([0026](adr/0026-calendar-via-calcom.md)) |
| No review-queue approval screen | Conversations page only has `ai_paused` toggle and send-message | Decided: owner types the reply in the composer, "Needs you" via response shaping, draft in email and WhatsApp ([0025](adr/0025-hold-and-escalate.md)); no frontend change |
| VoiceCalls page and nav entry exist for a parked feature | `App.tsx:81`, `pages/VoiceCalls.tsx` | Keep stub backend (ADR 0001) or hide the route (frontend change) |

## 6. Success metrics (pilot, first 60 days; targets to confirm)
| Metric | Target |
|---|---|
| Cross-tenant leak probes failing | 0 |
| Inbound messages lost | 0 |
| Replies with ungrounded price/availability (eval set of at least 150 cases) | under 1% |
| Replies that reveal floor price or invent claims (eval set) | 0 |
| First-response time p95 (same as NFR-1) | under 15 s |
| Follow-ups sent inside window or by template | 100% (no window violations) |
| Customers who get a holding reply within 15 s of a hold | 100% |
| Escalations answered by the owner within 1 h in business hours | 80% |
| Leads that reach a booked visit | tracked from pilot start; no target (no baseline) |
| Owner takeover rate | tracked, no target |
| LLM/provider incidents detected by alert before owner reports | 100% |

## 7. Out of scope (v1)
- Phone calls (Vapi, Plivo, Android sync) and the open outbound dialer (C-01 closed by removal).
- Payments and billing integration (tiers and limits only).
- Sarvam STT, other timezones, other verticals.
- Direct Meta Cloud API (also not a fallback: owner chose to wait for ChatSyncs), Baileys/QR sessions, Google Calendar, approve/reject buttons for held drafts.
- New frontend screens, data migration from the old DB.

## 8a. Gap-register items mapped or deferred
| Item | Status |
|---|---|
| M-08, M-12, M-24, M-19, M-23, M-10, M-14, M-29, L-17, M-04, H-12, H-11 | Now FRs (FR-3, 5, 6, 9, 12, 16, 17, 21, 24, 25, NFR-5) |
| L-14, L-15, H-35 | Frontend text/checkbox: deferred, owner decision |
| M-26 | Resolved by NFR-1 (15 s, stretch 8 s); parallelise calls, throttle summaries |
| Other Medium/Low items not named | Deferred by default; architecture doc lists any it picks up |

## 8. Audit risk mapping
| Top risk | Covered by |
|---|---|
| 1 Open dialer | Out of scope; stub in section 5 |
| 3 No RLS | FR-1, FR-2 |
| 4 Analytics leak | FR-2, section 5 |
| 5, 6 Vapi webhook / tenant trust | Removed with Vapi; FR-4 for WhatsApp |
| 7 Webhook fallbacks | FR-4, NFR-8 |
| 8 Secrets in docs | NFR-8 (rotated per owner) |
| 9 Schema, backups | NFR-4, NFR-5, FR-21 |
| 10 Unchecked replies | FR-6 to FR-10 |
| Lost events, no window | FR-3, FR-11 to FR-14 |

## Needs owner decision
1. Pilot customer name and onboarding date.
2. (Settled D3) Review-queue UX: owner replies in the composer.
3. (Settled D5 for Calendar) Sheets connect: admin-assisted ([0006](adr/0006-per-tenant-integrations.md)). Open: Cal.com cloud vs self-host and the attendee-email workaround ([0026](adr/0026-calendar-via-calcom.md)).
4. VoiceCalls page: stub backend or hide the route.
5. Plan tier prices and limit values (messages, items; voice minutes later). Budget one ChatSyncs plan per business (D11).
6. ChatSyncs unknowns, tracked in `chatsyncs-open-questions.md`: signature or IP list (none found: owner signs the D9 path-key risk note, 02 s4), retries, voice and image payloads, owner-phone echo, rate limits, pricing. Settled (D10 to D15, [0029](adr/0029-pilot-chatsyncs-decisions.md)): v1 done with voice off, one ChatSyncs account per business, catch-up poller in v1, coexistence allowed after a spike. Blocks the adapter and live checks of FR-3, 4, 5, 11, 12, 13 (M0 spike); other work runs on the fake.
7. Voice-note transcription vendor (Sarvam excluded for v1).
8. NFR targets (latency, RPO/RTO) and success-metric targets.
9. Domain and DNS owner.
10. Hosting provider and region ([0004](adr/0004-hosting-and-availability.md)).
11. Privacy/Terms text fix (H-35, L-14, L-15) needs a frontend change: approve a named exception, or publish DPA/notice outside the app.
12. (Settled D8) No fallback provider; if ChatSyncs fails the spike the owner decides then.
14. Holding-reply wording (en, hi, mr) and the 4 h customer notice; the owner WhatsApp alert template copy.
13. STT word-accuracy bar and eval pass mark.

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| ChatSyncs unknowns (auth, voice payload, owner-phone echo, rate limits, pricing) or no answer | Blocks live messaging, no fallback | Provider interface and fake provider; track open questions from public docs (D14); owner call if stalled ([0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md)) |
| Contract drift from unseen response shapes | Screens break | Record shapes from frontend source into contract tests before building each route |
| Inventory of routes is from client code only | Missing keys or params | Verify each route's fields while writing tests |
| Template approval lead time | Follow-ups blocked at pilot | Submit templates early |
| Per-tenant cost with free-tier LLM keys | Outages (H-16) | Gateway, paid keys, quotas |
| Scope is wide for v1 | Slips | Cut line and milestones (section 2a) |
| Worker tenant context through the DB pooler | Leak or failure | Test `SET LOCAL` under transaction pooling (verify) |
| Single host or region | Outage | 2+ instances ([0004](adr/0004-hosting-and-availability.md)) |
| Manual onboarding | Slow, error-prone | Onboarding script with checks (incl. Cal.com availability) |
| Customer sees a holding reply too often (false holds) | Looks unhelpful | Track hold rate, tune guard, fixed wording reviewed by owner |
| Owner does not answer | Customer waits | Reminders 30 min and 2 h, customer notice at 4 h, chat stays open |
| Cal.com free-tier limits or attendee-email rule | Booking blocked | Spike, visit-as-task fallback, self-host option (verify) |
| Version-sensitive claims (Supabase PITR limits, LangGraph checkpointer APIs) not checked; MCP docs offline | Wrong assumptions | Mark "verify" in architecture doc |

## Review log
| Feedback | Outcome |
|---|---|
| Sheets config path | Fixed: [0006](adr/0006-per-tenant-integrations.md), FR-19 |
| Dropped gap items | Fixed: FRs plus section 8a |
| Worker DB access | Fixed: FR-2, [0002](adr/0002-tenancy-rls-and-worker-role.md) |
| ChatSyncs unknown | Fixed: M0 spike, wider blocked list |
| Contract not verified | Fixed: 59 sites counted, allow-list, privacy fix moved to owner decision, FR-15 path |
| Latency numbers, eval size | Taken: NFR-1 15 s everywhere, 150 cases |
| Locking, idempotency, ledger, uniques | Taken: [0003](adr/0003-durable-inbox-and-job-claiming.md), FR-3, FR-4 |
| Hosting vs 99.5% | Taken: [0004](adr/0004-hosting-and-availability.md) |
| Cut line, second vertical, +20% metric | Taken |
| Extra tests | Taken: NFR-9 |
| ADRs (tenancy, inbox, hosting, STT, gateway) | Taken: 0002 to 0006 (STT and gateway share 0005) |
| Calendar OAuth callback | Taken: FR-16, 0006 (later replaced by Cal.com, 0026) |
| Owner decisions 2026-10-08 (D9 to D15) | Applied: FR-5 text-only done criteria, FR-18, scope, ADR 0029 |
| Owner Q&A 2026-10-07 (D1 to D8) | Applied: FR-15, FR-16, FR-26, FR-27, scope, NFR-5, NFR-6, ADRs 0025 to 0027 |
