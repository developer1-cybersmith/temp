# Vyavsay Assist v2: Story List

**Summary**
1. Full story list behind [05-roadmap](05-roadmap.md). IDs are `E<epic>.<n>` (epics), `P<n>.<n>` (backend and seam plans) and `E4.15` to `E4.38` (agent plan); each is one thin, testable slice (about 1 to 3 days). The M1c block at the end holds the 2026-10-08 additions.
2. Every epic opens with a "T" story: tests merged red first. Code stories name the test they turn green.
3. "Dep" lists blockers. "Blocked" marks stories that need ChatSyncs or an owner answer; the roadmap says how to proceed.
4. Refs point to PRD FR/NFR ids, ADRs and agent/tenancy design sections.
5. Acceptance criteria are one line each: the named test passes in CI plus the stated behaviour.

Legend: Pri M = must for pilot (E0.9, E2.T2, E2.21, E6.5a, E6.5b, E8.10 added 2026-10-08 from D9 to D15), S = slip candidate (Cal.com E7.T1 to E7.3 and E7.8, tiers, Sheets, offboarding per PRD cut line; E7.4 fallback and E7.5 hard cap are Must). Size S/M/L.

## E0. M0 spike and unblock (week 1 to 2)
| ID | Story | Dep | Pri | Size | Done when |
|---|---|---|---|---|---|
| E0.1 | Keep `chatsyncs-open-questions.md` current (D14): clarify open questions from public docs and web search first (signing secret or IP list, retries, voice and image payloads, owner-phone echo, rate limits, pricing), dated row and source URL per change. No support email for now; contacting support is an optional later step | none | M | S | Tracker rows dated; docs re-checked before each milestone |
| E0.2 | Spike harness for E0.8: test number, record real payloads for the A1 to A10 items still open (the Webhook Workflow is not our path; template send is documented, verify live) | E0.1, test number | M | M | Table of A1 to A10 status; recorded payload fixtures |
| E0.8 | ChatSyncs spike, remaining unknowns only (docs review 2026-10-07 answered the rest). First case: coexistence (D13): on a pilot number with the phone app, type a message on the phone and record whether it reaches the webhook or `get-conversation` and with what sender flag. Then re-check the docs for a signing secret or IP list (none found 2026-10-08; E0.9 covers the risk note). Then webhook auth, retries and timeout, inbound voice, image and other payloads with media download and expiry, event timestamp and type on inbound text, owner-phone echo under coexistence, `failed_reason` values and block signal, rate limits, timezone of `status_time` and `last_message_time`, `wa_message_id` format, webhook URL by API, which `template_id` (short or long) send takes, `status:"1"` without `wa_message_id`, and whether history `wa_message_id` equals the webhook id (CQ-17). Record real payloads and error strings as fixtures | E0.1, test number | M | M | Fixtures filed for every item in 06 s10 list; open items marked answered or "no reply" |
| E0.3 | Go note (the F2 poller is already in v1, E2.21); owner signs. No fallback provider: a no-go goes to an owner decision | E0.2 | M | S | ADR updated (0008 status) |
| E0.4 | STT sample test on 30 real Hinglish/Marathi notes via gateway. Not on the pilot path (voice off, D10); runs when a real media fixture exists | owner clips | S | M | Word-accuracy table; vendor chosen (0005) |
| E0.5 | Submit template copy (nudge, reminder, reengage, `owner_alert`) for approval | owner copy | M | S | Templates submitted; status tracked |
| E0.6 | AWS account, domain/DNS owner, region confirmed | owner | M | S | ALB cert and webhook host known |
| E0.9 | Path-key risk note (D9): one-page note (what a leaked key allows incl. outbound spam, vendor-UI and log exposure, the hardening in 02 s4, emergency rotation, exit condition: signing or IP list published, review date); draft now from docs, sign after E0.8 re-confirms no signing or IP list exists | E0.1 (draft); E0.8 (sign) | M | S | Signed note filed; ADR 0029 linked |
| E0.7 | Cal.com spike: free-tier API and webhook availability, attendee email requirement, webhook signature, slot reservation, booking create and cancel by metadata, cloud vs self-host recommendation (0026) | Cal.com test account | S | M | Notes plus recorded payload fixtures; ADR 0026 verify marks resolved |

## E1. Foundations and tenancy (M1)
| ID | Story | Dep | Pri | Size | Done when |
|---|---|---|---|---|---|
| E1.T1 | RLS isolation test suite T1 to T9 against two seeded tenants (red) | none | M | M | Suite runs in CI, fails for missing schema |
| E1.T2 | Test skeletons T10 to T20 merged red, each owned by the story in the roadmap coverage appendix (T10 E4.3, T11 E3.8, T12 E1.12, T13 E2.2, T14 E7.5, T15 E8.8, T16 E8.6, T17 E1.4, T18 E1.7, T19 E4.5, T20 E1.7) | E1.T1 | M | S | Each T-id has an owning story and a red test |
| E1.1 | Repo skeleton: FastAPI, uv, ruff, mypy, pytest, pre-commit, secret scan | none | M | S | CI green on empty app |
| E1.2 | Migrations from empty DB in CI (NFR-4); invariant query (T1) | E1.1 | M | M | T1 green |
| E1.3 | Core schema: tenants, members, config, plans, contacts, conversations, messages (0014, 0016) | E1.2 | M | M | Composite FKs, T5 green |
| E1.4 | RLS policies, roles `app_user`, `worker_role`, `webhook_user` (0002, 0012) | E1.3 | M | L | T2, T3, T9 green |
| E1.5 | Per-job tenant context under pooler; context-leak test | E1.4 | M | M | T4 green (verify `SET LOCAL` with pooling) |
| E1.6 | System functions and owner aggregate-only functions | E1.4 | M | M | T6 green |
| E1.7 | JWT auth, tenant from JWT only, `pending` tenant has no access | E1.4 | M | M | T7 base cases green |
| E1.8 | Error envelope (`error` key), request id, redacting logger (NFR-12, FR-25) | E1.1 | M | S | Envelope tests, log redaction test |
| E1.9 | Secrets: KMS envelope encryption for tokens (FR-23) | E1.4 | M | M | Secret never in API output test |
| E1.10 | `audit_log` append-only (FR-24) | E1.4 | M | S | Update/delete denied test |
| E1.11 | Contract-test harness: re-grep frontend `client.*` sites, generate route list, record shapes | none | M | M | Route inventory file; failing tests per route |
| E1.12 | CI pipeline with gates: lint, types, RLS, contract (NFR-9) | E1.1 | M | M | Required checks on main |

## E2. Messaging core (M2)
| ID | Story | Dep | Pri | Size | Done when |
|---|---|---|---|---|---|
| E2.T1 | Concurrency and fault tests: duplicate/out-of-order webhooks, two workers, kill mid-job, kill mid-send, burst of 3 (red) | E1.4 | M | M | Tests exist, red |
| E2.1 | `WhatsAppProvider` port and `FakeProvider` first, with scripted webhook sender: duplicates, delays, voice and image events, send failures, `UnknownOutcome`, status callbacks, template-only and no-idempotency modes, and history endpoints (`subscriber/list`, `get-conversation`; owner-typed rows, 429/5xx, late arrivals) (0008, 0027). All later provider work builds on it | E1.1 | M | M | Port contract tests run on fake; capability-flag tests |
| E2.2 | Webhook route, signature or key check, `inbound_events` insert, fail closed (FR-3, FR-4, NFR-8) | E1.4, E2.1 | M | M | Unknown key 404; duplicate = one row |
| E2.3 | Jobs table, `SKIP LOCKED` claim with lease, per-conversation serialisation, retries, dead-letter (0003, 0012) | E1.4 | M | L | Two-worker and lease tests green |
| E2.4 | `ingest` job: get-or-create contact and conversation, set `last_inbound_at`, burst coalescing | E2.2, E2.3 | M | M | Burst test green |
| E2.5 | Outbox: write-before-send, idempotency key, status updates, `UnknownOutcome` reconcile (FR-12) | E2.3 | M | L | Kill-mid-send test green |
| E2.6 | `choose_send_mode` with fake-clock IST tests (FR-11) | E2.4 | M | M | Boundary tests green |
| E2.7 | Opt-out: STOP detection before agent, suppression at send time (FR-13) | E2.4 | M | S | STOP test green |
| E2.T2 | Poller tests first (red, D12): missed webhook is inserted once by the poll; duplicate of a webhook row is not inserted twice; per-account hourly call cap holds; one business's poll never reads another account; lag alarm fires; poll failure does not stop webhook intake; first poll after go-live ingests nothing older than `poll_start_at` (backfill guard); a row older than `poll_max_age` goes to review, not the agent (stale rule); a late older row does not move `inbound_high_water` back or cause a second reply (ordering); owner-typed row with an unknown `sender` creates no contact and no run; 429/5xx back off and the kill switch stops polling; contacts whose newest row is our own send are skipped, round-robin under the cap; id-equality fixture test (webhook id equals history id, runs once E0.8 gives real payloads, must pass before the pilot) | E2.1, E1.4 | M | S | Tests exist, red |
| E2.8 | ChatSyncs adapter against recorded fixtures, profile in 06 s10 (Blocked: E0.3, E0.8) | E0.2, E2.1 | M | L | Adapter passes the same port contract as the fake on fixtures; one live smoke |
| E2.19 | ChatSyncs error classifier: strings as data, substring match, unmapped to `unknown_send`. Planted-case tests with real recorded strings (window text, not found with status `"1"`, invalid phone, plan limit, 401, redirect, boolean status, non-JSON 200, timeout); a unit test holds the verbatim window string; `status:"1"` with no `wa_message_id` is `unknown_send`; a changed window string must land in `unknown_send` and raise the unmapped-rate alert, never a resend | E2.1, E2.13, E0.8 | M | M | Each fixture lands in exactly one kind and reason; planted drift test green |
| E2.20 | ChatSyncs reconcile: lookup by `wa_message_id`, else `get-conversation` search by contact phone, else `unknown` plus review; `idempotent_send=false` degrade test | E2.5, E2.8 | M | M | Kill-mid-send and lost-response tests green on fixtures |
| E2.21 | F2 catch-up poller (D12, in v1, not conditional): per ChatSyncs account (one per business), rate-limited with a per-account hourly cap, `subscriber/list` (orderBy 1) then `get-conversation` for changed contacts, into `inbound_events`, dedupe by `wa_message_id`; guards from 02 s4 (go-live cursor, stale rule, per-contact cursor with overlap, skip own sends, round-robin, backoff, kill switch); shares one client and rate budget with E2.20; owner-phone and unknown rows stored and ignored (D13). Runs on the fake first, ChatSyncs rows join with fixtures; off for live numbers until the id-equality test passes | E2.T2, E2.2, E2.1 | M | M | E2.T2 green; lag alarm |
| E2.9 | Provider status callbacks or poll for `accepted` messages (A6) | E2.5 | M | M | Delivered/failed stored |
| E2.11 | Single-leader scheduler (advisory lock) for SLA re-notify, prune, purge, reminders, Sheets; two-instance test runs each tick once | E2.3 | M | M | Two-instance test green |
| E2.10 | Media store (S3 private), signed URL minted into `media_url` on read (0010, FR-21) | E1.7 | M | M | URL expires; cross-tenant 404 |
| E2.12 | Inbound from the tenant's `owner_phone` never creates a customer conversation (stored, ignored, flagged, sets `tenants.owner_last_inbound_at`; `owner_alert` falls back to template when stale) until ChatSyncs answers question 11 | E2.4 | M | S | Test: owner-number event creates no contact or run |
| E2.13 | Canonical models, typed error reasons, phone normaliser and `contact_key`, `TemplateSpec`, capability flags with degrade tests, in `ports/` (0028, 06 s1 s2) | E2.1 | M | M | Degrade tests green with each v1 flag off; phone formats test (`91`, `+91`, leading 0, no phone) |
| E2.14 | Conformance suite `tests/conformance/` over the registry; `fake` first, then executable `fake-meta-like` and `fake-twilio-like` profiles; core flows (route, inbox, ingest, window, outbox, reconcile) run end to end on every profile; fixtures dir per provider (06 s6) | E2.13 | M | L | Three profiles green in CI; ChatSyncs fixtures join at E2.8 |
| E2.15 | Import-lint rules and word-boundary no-provider-name test with allowlist; static check that core never reads `raw` (0028) | E2.1 | M | S | Planted violations fail CI; `metadata` and `github.` pass |
| E2.16 | Provider per number: schema (`provider`, `provider_config`, `switching`, `id_space`), `endpoint_keys` (one key per trigger, `drain` also for same-provider rotation) and `provider_apps`, path-key hardening with red tests (no key in any log, per-key rate and body caps, 404 rate limit, rotation drill; 02 s4), generic routing by the key's provider, adapter hooks (`handle_handshake`, `verify_inbound` with url and method, `resolve_number`), batch insert, dead letters, 0012 functions | E1.4, E2.2 | M | L | Two fakes on two numbers coexist; wrong provider in URL 404; payload number of another tenant cannot cross; app-level key works |
| E2.17 | Cutover test on two fakes: `switching` makes sends unclaimable (claim predicate), agent and ingest keep running, owner alert by email, queued rows go via the new adapter, unknown rows to review, late webhook on the old key stored once, `dup_suspect` flags but processes | E2.5, E2.16 | M | M | Cutover test green; same id on two providers does not collide |
| E2.18 | Core status state machine (monotone, orphan statuses parked 10 min, failed after delivered), canonical `seq`, window from event ts after outage replay, inbound media download-on-ingest with `media_expired`, `unknown_send` rate alert and correlation match (06 s1 s3) | E2.5, E2.13 | M | M | Out-of-order, orphan, expiry and replay tests green |

## E3. Frontend API surface (M1 to M4, parallel with E2)
| ID | Story | Dep | Pri | Size | Done when |
|---|---|---|---|---|---|
| E3.T1 | Contract tests for all about 43 routes with keys from frontend source | E1.11 | M | L | Red suite, one test per route |
| E3.1 | Users GET/PATCH with column allow-list (FR-20) | E1.7 | M | S | Mass-assignment test green |
| E3.2 | Customers, visits, leads, tasks CRUD | E1.7 | M | M | Contract tests green |
| E3.3 | Catalog CRUD, stats, export blob, image upload (CloudFront public photos, owner Q1) | E1.7 | M | L | Contract tests green |
| E3.4 | Schema and knowledge routes; ignore client `userId` | E1.7 | M | S | `?userId=B` ignored |
| E3.5 | Conversations list/messages/PATCH `ai_paused`/POST send with real failure | E2.5 | M | M | Send failure surfaced |
| E3.6 | `/sessions` facade via adapter `connection_state` and `begin_connect`, states incl. `paused`, id mismatch ignored (0001, 0028) | E2.1 | M | M | Sessions contract green |
| E3.7 | `/analytics` incl. `totalMessages`, tenant scoped | E1.7 | M | S | Leak probe green |
| E3.8 | `/owner/overview` via aggregate functions; audit row | E1.6 | M | S | T6 for owner |
| E3.9 | `/vapi/*` stub incl. `/vapi/calls/{id}/actions` (typed empty or 403) and `/sheets` stub returning typed `not_connected` until E7.6 | E1.7 | M | S | Stub contract green; M4 contract gate does not depend on E7.6 |
| E3.10 | Files upload and process (inventory import) | E3.3 | M | M | Import test, limit reporting |
| E3.11 | Final grep: browser direct Supabase table reads vs RLS | E1.4 | M | S | Grep result filed |

## E4. Agent and grounding (M3; the 24 agent-plan stories E4.15 to E4.38 are in the M1c block below)
| ID | Story | Dep | Pri | Size | Done when |
|---|---|---|---|---|---|
| E4.T1 | Eval set v0: 60 cases as smoke set only (labeller named), grows to 150 (E4.13); layer-1 guard tests (red) | owner labeller | M | L | Dataset in repo and Langfuse |
| E4.1 | Model gateway (LiteLLM in-process), task-to-model config, fallback, usage ledger (0005, 0011) | E1.4 | M | M | Fault-injection test green |
| E4.2 | Prompts as versioned data, per-tenant overrides, draft-eval-active flow | E1.3 | M | M | Rollback test green |
| E4.3 | Embeddings and hybrid retrieval, typed success/error, tenant filter in query (0015, FR-9) | E1.4 | M | L | Retrieval error test; isolation test |
| E4.4 | Per-business config resolver (hours, holidays, persona, max discount) (FR-17) | E1.3 | M | M | Fake-clock hours tests |
| E4.5 | LangGraph v0: classify, retrieve, draft, guard, send-or-hold; checkpointer in `langgraph` schema (0018) | E4.1, E4.3 | M | L | Smoke subset green |
| E4.6 | Reply guard: price/availability/name match, floor leak, claims lexicon (0019, FR-7, FR-8) | E4.5 | M | L | Layer-1 guard tests green |
| E4.7 | Injection defence and tool allowlist (agent design 6) | E4.5 | M | M | Injection cases pass |
| E4.8 | LLM failure path: retry, then holding reply plus review item and owner alerts; no canned answer content (FR-10, FR-26) | E4.5, E5.2 | M | S | Fault test green |
| E4.9 | Run races: new inbound during run, owner message, `ai_paused` (0023) | E4.5 | M | M | Race tests green |
| E4.10 | Langfuse Cloud tracing with name and phone masking (known contact, persona and owner names from DB; regex phones); scores; region verify (0027, agent design 11) | E4.5 | M | M | Trace per run; masking test with seeded PII finds none in exported payload |
| E4.11 | Eval CI gate: scripted run on PR, real model nightly and on release (08 s3.8; agent design 10) | E4.T1 | M | M | Gate blocks a seeded regression |
| E4.12 | M3 verify spike: LangGraph pinned APIs, checkpoint prune job | E4.5 | M | S | Notes and prune test |
| E4.14 | Embed catalog rows on every write path: CRUD, import (E3.10), Sheets (E7.6); embed job, re-embed on edit, drift check | E4.3, E3.3 | M | M | Test: new, edited and imported item is retrievable; drift query is zero (H-30) |
| E4.13 | Eval set grown to 150 with Hinglish/Marathi; pass bar met | E4.T1 | M | L | Bars in PRD section 6 met |

## E5. Hold-and-escalate and follow-ups (M4; E5.1 in M3)
| ID | Story | Dep | Pri | Size | Done when |
|---|---|---|---|---|---|
| E5.T1 | Red tests first: holding reply only when allowed (not on opt-out, `ai_paused`, closed window), exactly once under replay, templates pass guard lexicon; item state machine and concurrency; 30 min / 2 h / 4 h jobs on a fake business-hours clock (closed day, holiday); jobs no-op after resolve; owner reply after window closed (item stays open, `pending_window`, template path); 4 h notice with window closed (`team_notice` or `skipped_window` plus team task); 24 business-hour team escalation; message 2..n acknowledgement cap; `unknown_send` gives no holding reply; holding cooldown against `ai_paused=false` loop; deny-list wording test; empty hours default; hours edit recomputed at run time; `GET /conversations` shaping contract; follow-up runner two-runner test (ADR 0025, 0023) | E2.T1 | M | M | Red suite |
| E5.1 | `review_items` table with holding, alert and reminder fields; creation reasons (0009, 0025). Pulled into M3: E4.5 needs it | E1.4 | M | M | State tests green |
| E5.2 | `holding_reply` node and post-step transaction: item, holding outbox row (`hold:{id}`), alert and reminder jobs; versioned holding templates per language; window rules via `choose_send_mode` (0025) | E5.1, E2.6 | M | M | E5.T1 holding cases green |
| E5.3 | Owner alerts: Notifier email (SES) and WhatsApp to the owner's number, template `owner_alert` outside the window, per-channel status and retry, team task if all fail; draft in email and WhatsApp, none in logs. Live WhatsApp send waits for ChatSyncs | E5.2, E0.6 | M | M | Fake-provider and fake-SES tests; one channel failing does not block the others |
| E5.4 | Reminder and timeout jobs: 30 min, 2 h, customer notice at 4 h, all in business hours via the resolver; re-check at run time | E5.2, E2.11 | M | M | Fake-clock tests green |
| E5.5 | Resolve and resume: owner composer message, `ai_paused=false`, opt-out; takeover pauses AI; owner message during a run; AI resumes on next customer message (0023, 0025) | E4.9, E5.2 | M | M | Race tests green |
| E5.6 | Follow-up schedules persisted; DB-lock runner; quiet hours; re-check at send (FR-14) | E2.6, E2.7 | M | L | Two-runner test green |
| E5.7 | Template send path for follow-ups outside window, `held_window` otherwise | E2.8, E0.5 | M | M | Blocked on approved templates; fake until then |
| E5.9 | `/tasks` serializer (title template, `due_date`, `appointment_time`), manual task passthrough, delete tombstone, completion independent of booking; contract test with the real `Appointments.tsx` and `Dashboard.tsx` regexes (red first) | E3.2, E7.2 | M | M | Contract and tombstone tests green |
| E5.8 | "Needs you" response shaping on `GET /conversations` (summary prefix, `ai_paused` true while open, no new fields) and `PATCH ai_paused=false` resolving the item via `private.owner_resolve_review` (0025, 03-tenancy) | E5.1, E3.5 | M | S | Shaping contract test green; no API UPDATE grant on `review_items` |

## E6. Voice notes (M4; pilot ships with voice off, D10: E6.5a and E6.5b are the must, E6.T1 to E6.4 are built on fake media and stay off)
| ID | Story | Dep | Pri | Size | Done when |
|---|---|---|---|---|---|
| E6.T1 | Voice pipeline tests: size cap, timeout, bad type, empty transcript (red) | E2.1 | M | S | Red suite |
| E6.1 | `ingest_media` job: fetch with caps, sniff, S3 | E2.10 | M | M | Caps tests green |
| E6.2 | `transcribe` via gateway, store text and confidence | E4.1, E0.4 | M | M | Stage-idempotency test |
| E6.3 | Failure path for a failed transcription: ask for text (voice-failure holding reply) plus review item and owner alerts (FR-5, 0025); reuses the E6.5b path | E5.1, E6.5b | M | S | Never-silent test |
| E6.5a | Text-only voice fallback, ingest half (pilot default, D10; defines v1 "done" for FR-5 with E6.5b): while `voice_notes` is false, inbound voice, image (caption kept as visible text, no agent run) and any unrecognised event type are stored `unsupported` and answered with the polite text request through the outbox; no `agent_run`. If `get-conversation` or the webhook gives a fetchable media reference, switch the flag on and fetch through REST | E2.4, E2.5 | M | S | Voice event on the ChatSyncs profile never silent; unknown event type is stored and answered, never dropped (test); flag flip covered by a fixture test |
| E6.5b | Text-only voice fallback, review half: the same events open a review item and enqueue the `notify_owner` job (delivery is E5.3) | E5.1, E5.2, E6.5a | M | S | Unsupported kind opens exactly one item and one alert job on the fake; replay adds none |
| E6.4 | `/voice/extract-walkin` multipart route | E6.2 | M | S | Contract green |

## E7. Calendar, Sheets, tiers (M5)
| ID | Story | Dep | Pri | Size | Done when |
|---|---|---|---|---|---|
| E7.T1 | Booking tests: double book, hold expiry then "yes", write failure (then holding reply and item), duplicate, replayed and out-of-order webhook, owner cancel in Cal.com, key never logged or returned (red) | E4.9 | S | M | Red suite |
| E7.1 | `CalendarPort` and Cal.com adapter with fake: per-tenant API key in `tenant_secrets`, event type in `tenant_integrations`, onboarding check (slots, test booking then cancel), availability = slots ∩ hours ∩ holds (0026) | E1.9, E0.7 | S | M | Fake Cal.com tests; isolation test across two tenants |
| E7.2 | Hold, confirm, create/reschedule/cancel via Cal.com; slot exclusion constraint; our booking id in metadata; `find_booking` before any retry; `tasks` visit row written for the Appointments page (0022, 0026) | E7.1 | S | L | T tests green; timeout-on-create test |
| E7.8 | Cal.com webhook inbox (verify signature, dedup), daily reconcile job, owner changes in Cal.com update booking and visit task, customer notice under window rules | E7.2, E2.11 | S | M | Duplicate and lost webhook tests; reconcile test |
| E7.3 | Persisted visit reminders via template or session | E5.6 | S | M | Fake-clock test |
| E7.4 | Visit-as-task fallback if Calendar slips (must, built regardless) | E3.2 | M | S | Fallback path test |
| E7.5 | Per-tenant hard cap (limit check plus ledger atomic) and per-tenant/number rate limits (H-16, NFR-8, FR-18); not on the slip list | E4.1 | M | M | T14 concurrency test; rate-limit test |
| E7.7 | Plan tiers beyond the hard cap: tier table, owner notice | E7.5 | S | S | Tier test |
| E7.6 | Sheets sync, export, import via `tenant_integrations` (0006, 0013); enqueues catalog embeds (E4.14) | E1.9, E3.3, E4.14 | S | L | Contract and import-limit tests |

## E8. Ops and pilot readiness (M5, starts early)
| ID | Story | Dep | Pri | Size | Done when |
|---|---|---|---|---|---|
| E8.1 | IaC for AWS: VPC, ALB, ECS, S3 (media and backup buckets), KMS, SES (0007) | E0.6 | M | L | Staging up from code |
| E8.2 | Deploy pipeline, 2+ api instances, `/livez` `/readyz` | E8.1 | M | M | Rolling deploy test |
| E8.3 | Alerts: LLM/provider errors, queue depth, hold-rate | E4.10 | M | M | Alert fires in drill |
| E8.4 | Backups: Supabase paid PITR (verify plan) plus daily dump to the owner's S3; restore drill from both; dump role and 30-day retention vs DPDP erasure documented (NFR-5, 0027) | E8.1 | M | M | Drill report, RPO/RTO measured |
| E8.5 | Onboarding script with checks (`owner_phone` differs from business number, holding wording approved, persona, hours, holding templates, owner email and phone, number, Cal.com availability and test booking, sheet) | E1.3 | M | M | Script run on demo tenant |
| E8.6 | Retention purge jobs (messages, audio, payloads, checkpoints) | E2.3 | M | S | Purge tests |
| E8.7 | Pilot dry run: demo dealer end to end; load test at pilot scale (assumed: 5 tenants, 20 inbound/min peak, 2k messages/day; owner confirms); latency p95 check on reply path | all M | M | M | Exit checklist signed |
| E8.8 | Offboarding export and erase (FR-22, 0017) | E1.4 | S | M | Erase test |
| E8.10 | Webhook rotation runbook and checklist (D15): runbook in the repo (02 s4 checklist), quiet-hour rule, who does it, rollback; per-business ChatSyncs key regeneration included (D11); rehearsed once on staging with two fake keys, once on the pilot number before go-live; plus an emergency rotation drill (suspected leak, rotate at once, not at a quiet hour) | E2.16, E8.1 | M | S | Runbook filed; drill report signed by owner |
| E8.9 | Provider switch drill on two fakes in staging, runbook (06 s7) rehearsed, quarterly reminder set | E2.17, E8.1 | M | M | Drill report; rollback tested before handover step |

## E9. Optional: Meta Cloud adapter (not v1; only on owner approval, 0028)
About 15 to 20 days plus Meta-side lead time. No core change expected (06 s9).
| ID | Story | Dep | Pri | Size | Done when |
|---|---|---|---|---|---|
| E9.1 | Refresh Meta spec against live docs, capture sandbox fixtures | E2.14 | S | M | Fixtures committed |
| E9.2 | Inbound: handshake, signature, `resolve_number`, batch, all kinds | E9.1 | S | M | Conformance inbound green |
| E9.3 | Send text, template, media; error table; correlation echo | E9.2 | S | L | Conformance send and errors green |
| E9.4 | Media fetch and upload, size caps, expiry | E9.2 | S | S | Conformance media green |
| E9.5 | `list_templates` to `TemplateSpec`, component builder | E9.2 | S | M | Template sync test |
| E9.6 | `connection_state`, `begin_connect`, config schema | E9.2 | S | M | Onboarding validation test |
| E9.7 | Conformance green, `fake-meta-like` diff review, canary smoke | E9.3, E9.4, E9.5, E9.6 | S | M | Canary smoke green |
| E9.8 | Switch drill on real numbers, runbook update | E9.7, E8.9 | S | M | Drill report signed by owner |

## M1c. Parity and sync, before infra (added 2026-10-08, D20)
Owner decision D20: build the migration plans for the agent and the backend and prove that they sync before DB and infra work. Everything here runs on `FakeProvider`, `ScriptedLLM`/`ScriptedAgent`, memory repos and fakes. Story wording lives in the plans (one place each): backend [07](07-backend-migration-plan.md) s6a, agent [08](08-agent-migration-plan.md) s6, seam [09](09-agent-backend-sync-contract.md) s8. Done = Gm (green on memory and fakes); milestones M2 and M3 close only on Gp (Postgres re-run, P5.2; OD-17).

### M1c-1. Order (one developer, strictly in this order; tests first inside each step)
| # | Slice | Stories in order | Tests first (red) | Exit (Gm) |
|---|---|---|---|---|
| 1 | A0 Foundation | P3.17 (docs only: ADR renumbering 0031 to 0034), P0.4 ledger linter, E1.11, P0.1, P0.2, P0.5, P0.3a, P0.3b, P2.2, P2.4, P2.1a, E1.8, E3.T1, E2.15; P2.5 owner captures in parallel; P2.1b fixtures start | One contract test per FE route, repo conformance, envelope, linter checks | OpenAPI routes = ledger = FE grep; linter green |
| 2 | A1 Rules, plus agent S1 pure code | P1.1 to P1.6, P1.8, P1.9, P6.1, E4.18 to E4.21 | Golden tables from legacy branches | All golden tables green; seeds carry `legacy_ref` |
| 3 | A2 Messaging spine | P4.1, P4.2, P4.3, E6.5a, E2.T1, E2.T2, E2.2 to E2.7, E2.9, E2.10, E2.12, E2.16, E2.18, E2.21, E3.5, E3.6 | Duplicates, two runners, kill mid-send, burst, window, STOP, unsupported kinds | M2 suite green on fakes (Gm) |
| 4 | A3 Seam, smoke | P3.1, P3.5 (contract v1.0 frozen), P3.11, P3.6, P3.7a, E5.1, E5.2, P3.2a, P3.2b, P3.3, P3.4, P3.10, P3.12, P3.13, P3.9, P3.16, E6.5b, E4.4, E4.8, E4.9, E5.T1 (hold cases), E7.5 | 12 smoke scenarios red first (09 s4.2) | 12 smoke green in mode S, CT4 and CT5 green, adversarial pack green, FR-5 text-only path end to end |
| 5 | Agent S0 and rest of S1 | E4.15, E4.16, E4.6, E4.7, E4.17 | Layer-1 guard tests, case runner | Sample case runs; guard golden tables green |
| 6 | Agent S2 linear graph | E4.12 spike, E4.22 to E4.24, E4.5, P3.8a | Smoke subset scripted | Smoke subset passes scripted; 10 smoke twins pass in mode R (gate S2) |
| 7 | A4 Tenant CRUD | E3.1 to E3.4, E3.7 to E3.11 (P2.1b fixtures before each route) | Contract plus repo filter probe per route | All 41 FE routes contract-green on memory |
| 8 | Gate before M3 | P2.3 frontend smoke (owner OK to run the frontend) | Checklist of every FE screen | Every screen walked; every `blind: true` page covered |
| 9 | Agent S3 to S6 and A3b | E4.25 to E4.27, E4.28, E4.29 to E4.31, E4.32 to E4.36; P3.7b, P3.7c, P3.8b, P3.14, P3.15, P3.18 | GR, CL, IJ, NG, BK, HO cases scripted; batches b and c red first | CT1, CT2, CT6 green, schema snapshots current; BEC coverage check green |
| 10 | A5 Automation | E5.T1 (rest), E5.3 to E5.9, E2.11, E7.3, E7.4, E8.6 | State, fake-clock, two-runner tests | M4 suite green on fakes (Gm) |
| 11 | A6 Integrations | E7.T1, E7.1, E7.2, E7.8, E7.6, E7.7, E4.14, E6.T1 to E6.4 | Fake Cal.com, Sheets round-trip pack | M5 suite green on fakes (Gm) |
| 12 | Agent S7 quality gate | E4.37, E4.38, E4.11, E4.13 | Judge calibration, latency and cost gate | Baseline stored; gate blocks a seeded regression. Needs the real gateway (E4.1, a model key, no DB) and the named labeller; owner decision below |

M1c exit: steps 1 to 11 green on fakes in CI, ledger rows `done` for Gm, owner captures compared (P2.5), visible CHG rows accepted by the owner (L3). Then the parked work resumes (list below) and the same suites are re-run on Postgres (P5.2).

### M1c-2. Backend plan stories (07 s6a; Pri M unless noted)
| ID | Story | Dep | Size | Step |
|---|---|---|---|---|
| P0.1 | App factory, settings that fail fast, memory container, env audit | E1.1 | S | 1 |
| P0.2 | Data-layer ports, `SystemGateway` with `resolve_membership`, ADR 0031 incl. one consolidated SECURITY DEFINER list | P0.1, P3.17 | M | 1 |
| P0.3a | Memory repos and DB-agnostic conformance (tenancy, uniqueness, ownership, order, paging) | P0.2 | L (6 to 8 d) | 1 |
| P0.3b | Conformance for atomic and concurrent operations | P0.3a | M | 1 |
| P0.4 | Parity ledger linter and `@parity(id)` marker (first in A0) | E1.11 | S | 1 |
| P0.5 | `AuthVerifier`, `FakeAuth`, memory tenant resolution | P0.2 | S | 1 |
| P1.1 | Funnel, stage and score rules (forward-only) | none | S | 2 |
| P1.2 | Customer and visit rules, phone merge, `customer_jid` | E2.13 | S | 2 |
| P1.3 | Budget parser and negotiation helpers | none | S | 2 |
| P1.4 | Slot engine (IST grid, overlap, alternatives) | none | M | 2 |
| P1.5 | Price, file and Sheets parsing | none | M | 2 |
| P1.6 | Chunking, hashing, stable embed text | none | S | 2 |
| P1.7 | STT gates and walk-in regex fallback (Pri S, deferred until voice is on) | none | S | deferred |
| P1.8 | Catalog status, sort and stats rules | none | S | 2 |
| P1.9 | Contact-name merge rule (CHG-28) | E2.13 | S | 2 |
| P2.1a | Frontend serializer layer | P0.1, E1.11 | M | 1 |
| P2.1b | 41 golden fixtures, second-reader signed, mutation probe | P2.1a, P2.4 | L (8 to 10 d) | 1 to 7 |
| P2.2 | FE read-set manifest with `blind` flag | E1.11 | S | 1 |
| P2.3 | Frontend smoke against the fake-wired app (gate before M3) | A2, A4 | M | 8 |
| P2.4 | FE response-type cross-check | E1.11 | S | 1 |
| P2.5 | Owner capture intake (9 scrubbed legacy responses) | OD-16 | S | 1 |
| P3.1 | `AgentRunner` port, run contract types (09 s2.2), `ScriptedAgent` | P0.2, P3.17 | S | 4 |
| P3.2a | `agent_run` job and post-step on memory repos | P3.1, P3.7a, P3.3, E2.5, E5.1 | L | 4 |
| P3.2b | Kill-mid-apply, restart and race tests | P3.2a | M | 4 |
| P3.3 | Agent read ports and memory implementation (`ports/agent_reads.py`) | P0.3a | M | 4 |
| P3.4 | Seam contract suite (CT2 plus CT6) | P3.2a, P3.3 | S | 4 |
| P4.1 | Memory job queue and runner (the JobRepo suite E2.3 must also pass) | P0.3b | M | 3 |
| P4.2 | Job-kind catalogue | P4.1 | S | 3 |
| P4.3 | Per-number send pacing (default 3000 ms until CQ-21) | P4.1, E2.5 | S | 3 |
| P6.1 | Legacy rule cases as eval seeds with `legacy_ref` (provisional) | P1.3, P1.4 | M | 2 |
| P6.2 | Retrieval-threshold calibration (needs real embeddings; gate for M3) | E4.1, E4.3, E4.T1 | M | after plug-in |
| P5.1 | Postgres repo adapters (parked) | P0.3a, P0.3b, E1.4, E1.5 | L | parked |
| P5.2 | Postgres re-run of repo, contract and seam suites; sets Gp (parked) | P5.1 | S | parked |

### M1c-3. Seam stories (09 s8; all Pri M; days are gross working days)
| ID | Story | Dep | Gate | Days | Step |
|---|---|---|---|---|---|
| P3.17 | ADR 0034, ADR renumbering 0031 to 0034 in one commit with link check, ADR 0023 third-run wording, 02 s7 thread id | none | A3 | 1 | 1 |
| P3.5 | Contract version, `schema_version`, JSON Schema snapshots, changelog test | P3.1 | A3 | 2 to 3 | 4 |
| P3.11 | Import-lint (CT5), pure rules in `core/rules/` | P0.2 | A3 | 1 | 4 |
| P3.6 | `SeamWorld` harness (drive, gates, fault injectors, canonical snapshot) | P0.3, P4.1, P3.5 | A3 | 4 to 5 | 4 |
| P3.7a | 12 red smoke scenarios, hand-derived snapshots | P3.6 | A3 | 4 | 4 |
| P3.10 | `RunGate`, stable `run_id`, zombie and replay tests | P3.2a | A3 | 2 to 3 | 4 |
| P3.12 | Holding resolution, `reply` to `held_reply` downgrade, divergence classes | P3.2a, E5.2 | A3 | 2 to 3 | 4 |
| P3.13 | Proposal validator (refs, tenant, slots, forward-only) | P3.2a, P1.1 | A3 | 2 to 3 | 4 |
| P3.9 | Adversarial `ScriptedAgent` pack | P3.6 | A3 | 2 to 3 | 4 |
| P3.16 | `RunReport` persistence, `TraceSink` port, PII-free test | P3.2a | A3 | 1 | 4 |
| P3.8a | Smoke twins in mode R (10) and CT6 plumbing check | E4.5, P3.7a | S2 | 2 to 3 | 6 |
| P3.7b | Scenario batch b (18) | P3.6 | M3 | 4 to 5 | 9 |
| P3.7c | Scenario batch c (18; SC24 after P3.17) | P3.6, P3.17 | M3 | 4 to 5 | 9 |
| P3.8b | Remaining twins (15) | P3.8a, P3.7b, P3.7c | M3 | 4 to 5 | 9 |
| P3.14 | Failure-mode suite F1 to F14 (only what scenarios miss) | P3.9, P3.10 | M3 | 4 to 5 | 9 |
| P3.15 | `AgentTasks.summarize` port and summarize job wiring | P3.1, E4.36 | M3 | 1 | 9 |
| P3.18 | Touchpoint rows T01 to T44 in the parity ledger | P0.4 | M3 | 1 | 9 |
Totals: gate A3 about 21 to 27 days, S2 about 2 to 3, M3 about 18 to 22; gross 41 to 52, net 38 to 49. Cut order if time is short: P3.8b, P3.7c, P3.14. Never cut the 12 smoke scenarios or P3.9.

### M1c-4. Agent plan stories (08 s6)
| ID | Story | Dep | Pri | Size | Step |
|---|---|---|---|---|---|
| E4.15 | Agent-side ports, `ScriptedLLM`, import-lint, port-contract suite pattern (read ports are P3.3; write side is the post-step) | P3.1 | M | S | 5 |
| E4.16 | Case schema, runner (scripted and real), demo-dealer fixture, parity matrix | E4.15 | M | M | 5 |
| E4.17 | BEC (`evals/bec.yaml`), coverage check, divergence ledger | E4.16 | M | M | 5 |
| E4.18 | Money and number parsers | none | M | S | 2 |
| E4.19 | Language and script detector, template selector | none | M | S | 2 |
| E4.20 | IST clock, relative dates, pure hours resolver | none | M | S | 2 |
| E4.21 | Affirmative lexicon and confirm rule (0022) | none | M | S | 2 |
| E4.22 | `pre_flight` (pause, auto-reply, open item, plan limit, caps) | E4.15 | M | S | 6 |
| E4.23 | `understand` node (intents, entities, language, sentiment, lead score) | E4.15, E4.18 | M | M | 6 |
| E4.24 | `route` rules (escalate, smalltalk, act) | E4.23 | M | S | 6 |
| E4.25 | Retrieval port, typed results, public view, run-local refs, photo links | E4.15 | M | M | 9 |
| E4.26 | `act` loop with allowlist and caps | E4.25, E4.5 | M | M | 9 |
| E4.27 | Knowledge chunker, `lookup_knowledge`, query rewrite | E4.25 | M | M | 9 |
| E4.28 | Graph output conforms to the proposal types, twin tests (post-step is P3.2a) | E4.15, E4.6, P3.1 | M | S | 9 |
| E4.29 | Prompt seed loader, resolver, slot overrides, lint | E4.15 | M | M | 9 |
| E4.30 | Author seed prompts, fewshot and templates (owner approves template wording; 08 s6) | E4.29, E4.23 | M | L | 9 |
| E4.31 | ADR 0032 prompt layering, ADR 0033 parity catalogue | P3.17 | M | S | 9 |
| E4.32 | Negotiation flow (`offer_price`, rounds from `facts_known.price_pushbacks`, limit from config) | E4.6, E4.24 | M | M | 9 |
| E4.33 | Lead stage and score proposals | E4.23, P3.1 | M | S | 9 |
| E4.34 | Booking tools on `FakeCalendarPort`, visit-request fallback | E4.21, E4.26 | M | M | 9 |
| E4.35 | `facts_known` and throttled summary | E4.23 | M | S | 9 |
| E4.36 | Walk-in extraction task and regex fallbacks (Pri S) | E4.15 | S | S | 9 |
| E4.37 | Judge rubric and calibration set | labeller, E4.16 | M | M | 12 |
| E4.38 | Latency and cost gate | E4.1, E4.16 | M | S | 12 |

### M1c-5. Existing stories amended (full list in 07 s6b; agent and seam amendments from 08 s6 and 09 s8)
| Story | Change |
|---|---|
| All E2.x, E3.x | Done = Gm while the DB is parked; M2 and M3 close on Gp (OD-17) |
| E6.5 | Split into E6.5a (A2) and E6.5b (A3); E6.3 now reuses the E6.5b path |
| E1.11, E3.T1, E3.1 to E3.10, E2.3, E2.4, E2.10, E5.9, E8.6, E7.6, E4.14 | Added acceptance lines and deps per 07 s6b |
| E4.5 | Done when the CT1 smoke passes; depends on P3.1 and P3.5 |
| E4.9, E5.2 | Owned by the backend post-step (P3.2a, P3.12) |
| E4.12 | Shrinks if OD-S9 drops the reply-graph checkpointer |
| E4.T1, E4.13 | Import the P6.1 legacy seeds (provisional until the labeller is named); class LS added, full set 180 (08 s3.3) |
| E4.3 | Threshold calibration is P6.2 |
| E4.1 to E4.4, E4.14 | Plug-in acceptance: the port-contract suite passes on the real implementation |

### M1c-6. Parked by the owner until M1c exit (D20, with D17 and D18)
DB and infra stories keep their wording and ids, and they must not block M1c: E0.6, E1.2 to E1.7, E1.9, E1.10, E1.T1 and E1.T2 (stay red), E2.3 (Postgres JobRepo; the memory queue is P4.1), E2.8, E2.19, E2.20 (live ChatSyncs; need the E0.8 spike), E4.2 (DB prompt store; files first), E4.3 (pgvector; in-memory retrieval first), E4.10 (Langfuse), E5.3 live delivery, E7.1 and E7.6 live adapters, E8.1 to E8.5, E8.7 to E8.10, P5.1, P5.2, P6.2. Where each plugs in: 07 s4e, 08 s4 (Plugs into), 09 s7.
