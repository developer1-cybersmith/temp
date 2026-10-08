# 03 User-Facing Flows

## Summary
- 12 flows traced from code and docs. Nothing was run.
- Working: inbound WhatsApp reply, catalog upload, walk-in capture, voice notes, CRM views.
- Broken or missing: WhatsApp connect screens (`/sessions` 404), agent graph, WABA self-signup, follow-ups outside the 24h window.
- Weak: reminders, Vapi security, tenant isolation, analytics.
- Frontend is fixed. Every fix below is backend-side.

Status key: OK = matches intent. PARTIAL = works with gaps. BROKEN = does not work.

## Overview

| # | Flow | Status |
|---|---|---|
| F1 | Customer message to AI reply | OK |
| F2 | Agent graph path | BROKEN (unreachable) |
| F3 | Signup, login, onboarding | PARTIAL |
| F4 | Connect WhatsApp | BROKEN |
| F5 | Catalog and knowledge ingestion | PARTIAL |
| F6 | Owner reads chats, takeover, manual send | PARTIAL |
| F7 | Leads, tasks, appointments | PARTIAL |
| F8 | Walk-in voice capture | OK |
| F9 | Customers CRM | PARTIAL |
| F10 | Vapi voice calls | PARTIAL |
| F11 | Follow-ups, reminders, daily report | PARTIAL |
| F12 | Platform owner dashboard and analytics | PARTIAL |

## F1 Customer message to AI reply
Steps
1. Customer writes. Meta POSTs `/api/webhook/whatsapp`.
2. HMAC check with META_APP_SECRET. Bad signature still gets 200, ignored.
3. 200 returned at once. Work runs in `setImmediate`.
4. Tenant found by `phone_number_id`. Fallback: oldest user.
5. Dedup by message id. Mark read.
6. Text, button, audio (Storage + Whisper), image (base64).
7. Pipeline: store, analyze, lead, tasks, inventory or knowledge, reply, send.
8. Voice-note input can also get a TTS voice note.

| Intended | Actual |
|---|---|
| Short, grounded, multilingual reply, under 5s | Matches broadly |
| Safe multi-tenant routing | Fallback to oldest user is a cross-tenant risk at 2+ tenants |
| Abuse limits | Limiter files not imported. Only HMAC protects |
| Hybrid search (structured + vector) | Default path uses name-only `ilike`. Hybrid only in dead agent path |
| Knowledge plus inventory | Knowledge used only if inventory is empty |
| Voice note quality gates | Skipped on WhatsApp audio. Empty transcript gets no reply |
| Retry on failure | Dedup row saved first, failures swallowed, no retry |

## F2 Agent graph path
Steps: flag `USE_AGENT_GRAPH`, `dispatchToPipeline`, `runAgentGraph` (5 nodes), persist with reasoning trace.

| Intended | Actual |
|---|---|
| Flag switches traffic to graph | `dispatchToPipeline` has zero call sites. Flag is dead |
| Graph works on new providers | `agent/openai-client.ts` still on retired GitHub endpoint |
| Spec in GENAI_POC_PRD.md | File not in repo |
| Complaint pauses AI | Only graph pauses properly. Legacy path does not set `ai_paused` |

## F3 Signup, login, onboarding
Steps
1. Browser signs up or logs in directly with Supabase. Email confirmation assumed.
2. Axios adds Bearer JWT. 401 redirects to login.
3. First `GET /users/:id` creates the `wb_users` row.
4. No business name sends user to onboarding (2 steps), saved by `PATCH /users/:id`.

| Intended | Actual |
|---|---|
| Onboarding ends with WhatsApp connected | Profile only. No connect step |
| Plans and 14-day trial (pricing page) | Marketing copy only. No plan, quota or billing in backend |

## F4 Connect WhatsApp
Steps today
1. Operator sets up Meta WABA and number outside the app.
2. Operator inserts a `wb_waba_accounts` row by SQL, with token [REDACTED].
3. One app-level webhook is set in Meta.
4. Messages start flowing.

| Intended | Actual |
|---|---|
| Frontend QR screen shows connection (`/sessions`, `/sessions/:id/status`, DELETE) | No such routes. QR page spins forever, POST fails, dashboard says "no WhatsApp connected", Settings reset 404s |
| Self-serve Embedded Signup (handoff Phase 3) | No code: no OAuth exchange, token endpoint, phone register, or app subscribe |
| Status for owner dashboard | Reads legacy `wb_sessions`, so counts are stale or zero |

Backend-side fix idea: a `/api/sessions` shim mapping `wb_waba_accounts` to the old session shape.

## F5 Catalog and knowledge ingestion
Steps
1. Excel/CSV: `POST /files/upload` (15MB, first sheet), map columns, `POST /files/:id/process`.
2. Rows become items with description and Jina embedding. Embedding failure is non-fatal (NULL).
3. Manual add, edit, sold, soft delete, up to 5 images, export to xlsx.
4. Knowledge: paste text (max 50000 chars), chunk 200 words, dedupe by hash, embed.
5. Optional Google Sheets sync (one global sheet).

| Intended | Actual |
|---|---|
| Re-upload diff and soft-delete missing rows | Not found |
| Every item searchable by meaning | Sheet-imported items have no embedding |
| Per-tenant sheet | One global sheet for all tenants. Exports can overwrite each other |
| Clear errors | Dedupe and provider failure give the same 400. File marked "completed" even with failures |
| Knowledge from PDF, docs | Pasted text only |
| Knowledge update | Delete and re-add. Stale chunks stay |
| Model switch safe | No re-embed path. Old vectors mix with Jina vectors |

## F6 Owner reads chats, takeover, manual send
Steps
1. List conversations, open messages (polled).
2. Toggle AI on/off: `PATCH /conversations/:id {ai_paused}`.
3. Manual send: `POST /conversations/:id/messages`.

| Intended | Actual |
|---|---|
| Owner bubble shows for owner replies | Backend stores `sender='user'`, frontend expects `business_owner` |
| Owner told if send failed | Always `{success:true}`, failure only logged |
| Sending pauses AI | Does not pause. Owner must toggle |
| Owner notified on escalation | No notification, reason not stored |
| `ai_paused` column exists | Not in any migration (drift) |

## F7 Leads, tasks, appointments
Steps
1. AI creates leads (score and stage only move up). Owner can only PATCH stage, notes, score.
2. Tasks CRUD. Appointments are `wb_tasks` rows with `appointment_time`.
3. AI booking checks slots (IST, working hours).

| Intended | Actual |
|---|---|
| One stage vocabulary | Three in docs. Backend accepts any string up to 50 chars |
| No double booking | Manual create/edit skips the check |
| Google Calendar test-drive booking (tracker) | No code |

## F8 Walk-in voice capture
Steps: record in browser, `POST /voice/extract-walkin` (5MB, min 4000 bytes), Whisper (Groq, OpenAI fallback), 4 quality layers, extract fields, owner confirms, `POST /visits`.

| Intended | Actual |
|---|---|
| Creates or finds customer, sets hotness | Works. But `customer_id` in `POST /visits` is not checked against the tenant |

## F9 Customers CRM
Steps: list with filters, detail with visits, conversation and lead, create (merge by phone), PATCH, DELETE.

| Intended | Actual |
|---|---|
| Tenant-safe reads | Visit, conversation and lead lookups filter by `customer_id` only |
| Safe delete | Hard delete. FK behavior for conversations and leads unverified |
| Typed input | No zod on customer body |

## F10 Vapi voice calls
Steps
1. Dashboard `POST /vapi/calls/outbound`.
2. Vapi calls `/api/vapi/webhook` (status, tool calls, end report).
3. Results in `wb_calls`, `wb_call_actions`. Dashboard reads history.

| Intended | Actual |
|---|---|
| Authenticated webhook | Open if `VAPI_WEBHOOK_SECRET` unset. Placeholder secret in code |
| Tenant from call | Falls back to first user |
| Human escalation | Says "callback in 30 min", but no notification or transfer |
| Tables in repo | `wb_calls` and `wb_call_actions` not in any migration |
| Same language and model | Prompts duplicated and drifted. Still OpenAI models |
| Inbound missed-call capture, call-sync app | Designed, not built |
| Call guardrails | None: any user can dial any number, no rate or consent check |
| Page in nav | Hidden for the demo. Route still live |

## F11 Follow-ups, reminders, daily report
Steps
1. Cron 21:00 daily report. Cron every 6h stale-lead nudge (48h). Cron every 2 min sheets sync.
2. Reminders at T-2h and T-1h by `setTimeout`.

| Intended | Actual |
|---|---|
| Reliable reminders | In memory. Lost on restart. Bookings over about 24.8 days fire at once |
| Report to owner | Sent to the business's own number |
| Per-tenant timing | Server TZ, fixed 48h. `followup_timer_hours` ignored |
| Works after 24h | Free-form text outside the window needs a template. Not handled. Failed nudges retry every 6h forever |
| One run per event | No lock. Multiple instances would duplicate everything |
| Sheets sync per tenant | Syncs one arbitrary user |

## F12 Platform owner dashboard and analytics
Steps: `GET /analytics` for each business, `GET /owner/overview` for the operator (OWNER_EMAILS only).

| Intended | Actual |
|---|---|
| Per-business numbers | Message counts are global across tenants |
| `totalMessages` for Analytics page | Not returned |
| Fast overview | Full table scans, row cap about 1000 likely |
| Reliable | Query errors silently become zero |
| Operator controls | Read-only, no suspend or edit |

## Planned, not started
- ChatSyncs provider (root SKILL.md). Conflicts with the "stay direct with Meta" decision. No inbound webhook documented.
- docs/SKILLS.md hints at a FastAPI/LiteLLM rewrite. Scope unconfirmed.

## Open questions
1. Final transport: Meta direct, or ChatSyncs too?
2. Rewrite or harden the current TypeScript backend?
3. Add a `/sessions` shim?
4. Agent graph: wire in or delete?
5. Where were `wb_calls` and `ai_paused` created? Can prod schema be exported?
6. Which lead stage list is canonical?
7. Real pilot tenant, and how many tenants are live?
8. Is the 24h window and template handling needed now?
9. Has the exposed README password been rotated?
