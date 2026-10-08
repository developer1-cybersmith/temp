# Legacy inventory B: jobs, integrations, data-model rules

**Summary**
1. Legacy has 3 cron jobs and 1 in-memory timer family, no locking, server timezone, no retry. v2 replaces all of them with persisted `jobs` rows (ADR 0003, arch s3 "Cron / schedules"). Behaviour to port is the rules, not the code.
2. Integrations are Meta Cloud (webhook, send, media), Google Sheets, Groq, Gemini, Jina, Whisper/OpenAI, TTS and Vapi. v2 keeps the rules, drops Meta, TTS and Vapi (D10, PRD s7), and puts each behind a port.
3. The SQL encodes a few rules the code depends on: defaults, working hours, status vocabularies, `updated_at` triggers, soft "sold" semantics. The DB is fresh, so these become seed config and enums, not data.
4. Six findings are not in the gap register (B-NEW-1 to B-NEW-6, section 5). Worst: Sheets auto-sync turns a sold item back to quantity 1 within 2 minutes (B-NEW-1), and AI-created leads never match the follow-up cron (B-NEW-2).
5. DB and infra are parked: every row below names its plug-in point (job kind, port, ADR) but nothing here needs them to start.

Method: static reading only; nothing was run. Legacy paths are repo-relative, cited `path:line`. Env keys are names only. Audit ids are from `../../docs/production-plan/01-gap-register.md`. "NEW" means not in the register.

## 1. Cron and scheduled jobs

| # | Job | Schedule (code) | What it does | Locking | Failure behaviour | v2 home (plug-in) |
|---|---|---|---|---|---|---|
| J1 | Daily report | `0 21 * * *`, server local TZ, `backend/src/services/cron-service.ts:16` | For every `wb_users` row (`:60`): leads created in last 24 h (`:68`), count `score='high'` (`:76`), count open tasks (`:70-74`); sends English text with dashboard URL (`:80-84`) to the tenant's own `display_phone_number` (`:87-96`) | None. Every process runs it | Send returns bool, ignored; logs "Sent" even on failure (`:96-97`); skipped if no active WABA row (`:94`). Free text outside 24 h window fails (H-20) | Optional `maintenance`-style job per tenant at 21:00 IST, owner number from `tenants.owner_phone`, template when window closed ([0025](../adr/0025-hold-and-escalate.md) alert path). Owner decision O1 |
| J2 | Stale-lead nudge | `0 */6 * * *`, `:21` | Selects `wb_leads` with `stage IN ('new','contacted')` and `updated_at < now-48h` across ALL tenants (`:106-110`); skips if no conversation or `ai_paused` (`:116`); sends fixed English text (`:118-120`); on success sets stage `followed_up` (`:121-122`) | None; no per-tenant try/catch | Failed send leaves stage unchanged, so it retries every 6 h forever (F11). No window, consent, quiet hours, template (H-20, H-23, M-28). `followup_timer_hours` ignored (`:104`, `backend/src/utils/validation.ts:85`) | `followups(due_at, status)` rows + tick that enqueues `followup:{id}:{slot}` ([04-agent-design](../04-agent-design.md) s9, arch s3). Template only in v1 |
| J3 | Sheets auto-sync | `*/2 * * * *`, `:26` | Picks ONE user: first `wb_users` row with non-empty `business_name`, `limit(1)`, no order (`:38-44`); runs import-then-export (section 2, S1) | None | "not configured" swallowed (`:50`); other errors logged only | Job `sheets_sync`, dedup `sheets:{tenant}`, per tenant, on demand and on a slow tick ([0013](../adr/0013-sync-endpoints-as-jobs.md), [0006](../adr/0006-per-tenant-integrations.md)) |
| J4 | Appointment reminders | `setTimeout` at T-2 h and T-1 h, `backend/src/services/reminder-service.ts:45-76` | Free-form text per reminder (`:50`, `:67`); offsets already past are skipped (`:46`, `:63`) | In-memory `Map` (`:21`) | Lost on restart (H-17); delay over about 24.8 days overflows `setTimeout`. Only caller is the AI booking path (`backend/src/services/pipeline-service.ts:367`) | Job `visit_reminder`, `run_at = visit - offset`, session text in window else template (arch s8 "Reminders", [0026](../adr/0026-calendar-via-calcom.md)) |
| J5 | Inbound rate-limit cleanup | `setInterval` 5 min, `backend/src/utils/inbound-rate-limiter.ts:42` | Cleans a 5 msgs / 30 s per-JID window (`:15`) | In-memory | Dead code: no importer (grep of `backend/src`) | Per-tenant and per-contact limits as DB-backed counters (NFR-8, H-14) |
| J6 | Webhook-event purge | Promised "older than 7 days can be purged" (`backend/database/migrations/009-waba-accounts.sql:37`) | Not implemented anywhere (no other `wb_webhook_events` writer than `backend/src/routes/webhook-routes.ts`) | n/a | Table grows forever (M-06) | `maintenance:inbox_prune:{hour}` job (arch s3) |

Process model facts: crons start inside the API process after routes are registered (`backend/src/server.ts:73-76`). No shutdown hook, only an `unhandledRejection` logger (`:91-93`). No leader election, so a second instance doubles J1 to J3 (M-18).

## 2. Integrations

### 2a. WhatsApp (Meta Cloud API)

| Path | Legacy behaviour | Gaps | v2 handling |
|---|---|---|---|
| Verify handshake | GET echoes `hub.challenge` if `hub.verify_token` matches env (`webhook-routes.ts:76-89`) | Token logged on failure (`:87`) | Not needed: ChatSyncs path-key webhook, never log URL ([02-architecture](../02-architecture.md) s4) |
| Inbound auth | HMAC-SHA256 of raw body vs `x-hub-signature-256`, timing-safe (`backend/src/utils/webhook-signature.ts:8-31`); bad signature returns 200 and is ignored (`webhook-routes.ts:98-101`) | L-03 silent | Provider-specific `verify`; ChatSyncs has none documented (D9 risk note) |
| Ack and process | 200 first, then `setImmediate` (`:104-111`); loop entries/changes/messages (`:117-152`) | H-13, H-14 | Insert `inbound_events`, 200, worker `ingest` job (ADR 0003) |
| Tenant routing | `wb_waba_accounts.phone_number_id` + `status='active'` (`:159-165`), else oldest user for env phone id (`:169-178`) | H-05 | `resolve_endpoint_key`, reject unknown (FR-4) |
| Dedup | select then insert on `wh_message_id` (`:199-215`); `processed=true` set even when pipeline failed (`:266-269`) | H-13 | UNIQUE provider message id, atomic claim |
| Message types | text (`:221-227`), audio (`:230-237`), image (`:240-248`), button/interactive title as text (`:251-260`); other types logged only (`:262-264`) | M-14 silent | Pilot: non-text stored `unsupported`, polite reply, review item (FR-5). Keep button/interactive title as text |
| Customer name | `contacts[].profile.name`, else the number (`:138-141`, `:197`) | Number as name | Keep fallback, but show masked/neutral label |
| Mark read | best-effort, never throws (`:218`; `whatsapp-cloud-client.ts:186-204`) | none | Provider capability flag; optional |
| Media download | 2 steps via Graph `v21.0`: media id to URL, then bytes with bearer (`webhook-routes.ts:284-303`) | No size cap, no timeout (M-14) | `ingest_media` job with caps (arch s6), voice off in pilot |
| Send text/image | `POST /{phone_number_id}/messages`, `preview_url:false`, image by link (`whatsapp-cloud-client.ts:58-125`); returns bool | No wamid kept, no templates (H-20, H-21) | Outbox + idempotency key, typed result (FR-12) |
| Voice reply | upload media then send audio (`:131-183`); triggered after voice-note input (`webhook-routes.ts:337-345`) | H-18 ffmpeg | Dropped: text out only |
| Credentials | per-tenant row, env fallback (`whatsapp-cloud-client.ts:27-50`); token plaintext (`009-waba-accounts.sql:19`) | H-05, H-07 | Encrypted `tenant_secrets` (ADR 0010) |
| Status webhooks | read only `messages` (`webhook-routes.ts:124`) | H-22 | Status callbacks update outbox (FR-12) |

### 2b. Sheets, reminders, report, files

| Item | Legacy behaviour | Gaps | v2 handling |
|---|---|---|---|
| S1 Sheets import | Range `A1:Z10000` (`backend/src/services/sheets-sync-service.ts:116`); headers lower-cased, accepts `item name`/`item_name`/`name` (`:122-132`); skips placeholder names `item N`, `example`, `test`, `sample`, `row`, `n/a`, `na`, `-`, `none` (`:135-140`); price strips `₹` and commas (`:142`); attributes limited to 7 fixed keys (`:146-153`); match by exact name then case-insensitive (`:157-180`); inactive match is skipped, so dashboard deletes stay deleted (`:185-189`); insert/update with NO embedding or description (`:191-211`) | H-30; B-NEW-1 quantity bug (`:143`); update replaces `attributes` wholesale | Port: placeholder skip, inactive-skip, price parsing, name matching. Add: content-hash re-embed, tenant sheet id, no wholesale attribute overwrite |
| S2 Sheets export | Paginates 1000 (`:61-79`); throws if no items (`:81`); 12 columns (`:5-9`); `Status` = Available if `quantity>0` else Sold (`:100`); clears `A1:Z{max(1000,rows+100)}` then PUT `USER_ENTERED` (`:105-107`, `:37-46`) | One global sheet (`:30` uses env id); service-account JWT re-authorised on every call (`:15-26`) | Same columns (users' sheets exist); per-tenant config; cache token |
| S3 Sync order | Import first, then export (`:224-234`) | Feeds B-NEW-1 | Keep "sheet edits win, then mirror back", fix quantity parse |
| Sheets routes | `POST /sheets/sync|export-to-sheet|import-from-sheet`, errors as `{error}` 500 (`backend/src/routes/sheets-routes.ts:8-38`) | Unscoped to tenant sheet | Frontend contract; ADR 0013 |
| Reminder text | 2 h: "just a reminder that your {service} appointment is in 2 hours…" (`reminder-service.ts:50`); 1 h (`:67`) | English only, free-form | Templates en/hi/mr ([0025](../adr/0025-hold-and-escalate.md) style) |
| Slot engine | Default hours Mon-Sat 10:00-19:00, Sun off, 30-min slots (`backend/src/services/appointment-service.ts:36-46`); IST helpers (`:58-77`, `:99-105`); open tasks with `appointment_time` block overlapping slots (`:146-152`, `:206-208`); alternatives: same day then up to 3 days, nearest first, top 3 (`:350-381`) | Race: check then insert, no constraint (M-08) | Replaced by Cal.com + exclusion constraint (ADR 0026); keep alternatives rule and the visit task title format (`:308`) for the Appointments page |
| File import | 15 MB multipart (`backend/src/routes/file-routes.ts:11-13`); `processing_status` pending/processing/completed/failed (`002-inventory-and-rag-fixes.sql:62`); marked completed even with partial failures (F5) | F5 | Keep contract; per-row result |
| Media storage | Buckets `whatsapp-media` (`backend/src/services/message-media-service.ts:3`) and env bucket for catalog, both created public (`:19`); path `{userId}/{kind}/{ts}-{rand}.{ext}` (`:59-60`) | H-09 | Private bucket, signed URLs (FR-21, ADR 0010) |

### 2c. AI providers

| Use | Provider / model (default) | Params and limits (code) | Failure today | v2 handling |
|---|---|---|---|---|
| Analysis (intent, score, tasks, appointment, entities, sentiment) | Groq, `llama-3.3-70b-versatile`, env override (`backend/src/services/ai-router.ts:9-20`) | JSON mode; temp 0.3, 500 tokens (`backend/src/domains/used-cars/index.ts:408`); 20 s `Promise.race` that does not abort (`ai-router.ts:25`, `:30-43`) | Fake analysis conf 0.3, `should_auto_reply:true` (`:131-146`) (H-15) | Gateway task `classify`; typed failure |
| Reply | same | temp 0.7, 800 tokens, frequency penalty 0.5 (`used-cars/index.ts:409`); 25 s; inventory capped 5 items, 3 knowledge chunks of 400 chars (`ai-router.ts:162-213`) | Canned `aiFailure` text sent as reply (`:249-253`) | Gateway `reply`; hold-and-escalate (FR-10, FR-26) |
| Summary, follow-up | same, 12 s (`:27-28`) | summary after 3+ messages (`pipeline-service.ts:397`); `generateFollowUp` has no caller (`ai-router.ts:283`) | Logged | Throttled `summarize`; follow-up is a template (04 s9) |
| Vision (customer car photo) | Gemini, `gemini-flash-latest`, `reasoning_effort: low` to stop truncation (`ai-router.ts:20-24`, `:352-353`); 15 s (`:332`) | Fallback "not a car" (`:335-`) | Falls through to caption text (`pipeline-service.ts:266-272`) | Out of pilot (images unsupported, FR-5); later `vision` task |
| Walk-in extraction | Groq, temp 0, 500 tokens (`ai-router.ts:494-503`); regex name and phone fallback (`:543-547`) | Used by `POST /voice/extract-walkin` | Phone-only result | Needed if walk-in capture stays (O3) |
| Embeddings | Jina `jina-embeddings-v4`, `dimensions: 1536` (`backend/src/services/rag-service.ts:9-18`) | Batch 30 per call (`:124`), sort by `index` (`:137`); no task type (M-05) | `null`/`[]` returned on any error (`:31`, `:46-49`, `:143-145`) (H-29) | `ModelGateway.embed`, model+version columns ([0015](../adr/0015-embeddings-storage.md)) |
| Chunking | 200 words, 40 overlap, break at sentence end in last 40 percent, drop chunks of 20 chars or less (`rag-service.ts:19-20`, `:171-210`) | hash = sha256 of trimmed lower-case, first 16 hex (`:163-165`); insert in batches of 50 (`:86`) | Dup and failure both return 0 (F5) | Keep sizes as starting config; replace-on-edit (M-12) |
| Retrieval thresholds | Knowledge 0.4 (`rag-service.ts:21`, `002:30`); catalog 0.35 (`catalog-service.ts:390`, `002:138`); catalog RPC requires `is_active` and `quantity>0` (`002:166-167`) | ILIKE with unescaped `%` filters (`002:168-171`) | `[]` on error | Calibrate on eval set; hybrid (FR-9) |
| Embedding text | `generateDescription`: "{name}, a {category}, with {priority attrs…}, priced at {x} lakhs" (`catalog-service.ts:460-520`) | Price baked in (L-09) | NULL embedding on failure, never repaired (`:140-146`) | Embed stable text only; backfill job |
| Speech to text | Groq `whisper-large-v3` 15 s, then OpenAI `whisper-1` 15 s (`voice-transcription-service.ts:188-237`) | Walk-in path adds gates: 4000 B minimum audio, 4 chars minimum, blacklist of Whisper boilerplate (en/hi/Hinglish), repetition, lexical diversity under 0.35, short text from long audio, segment checks `no_speech_prob>0.6`, `avg_logprob<-1.0`, `compression_ratio>2.4` (`voice-routes.ts:10-77`, `voice-transcription-service.ts:98-134`) | WhatsApp audio path only checks "empty" (`webhook-routes.ts:325-328`) | Gates become the STT eval acceptance list ([0005](../adr/0005-stt-vendor-and-model-gateway.md)); voice off in pilot |
| TTS | OpenAI `tts-1` voice `nova`, or Groq English-only Orpheus then ffmpeg WAV to Opus via blocking `execSync` (`tts-service.ts:55-56`, `:78-79`, `:143`) | H-18 | Voice reply skipped | Dropped (text out) |

### 2d. Vapi (phone calls) and the old agent graph

| Item | Legacy behaviour | v2 |
|---|---|---|
| Vapi webhook | Events: `tool-calls`, `status-update`, `end-of-call-report`, `assistant-request`, `transcript`, `hang`, others ignored; always 200 on error (`backend/src/routes/vapi-routes.ts:21-91`); secret check fails open (`:10-14`) (H-03) | Removed. `/vapi/calls` list returns empty; outbound disabled (PRD s5) |
| Vapi tools | `search_inventory`, `book_appointment`, `share_location`, `escalate_to_human` (`backend/src/services/voice-service.ts:38-47`) | Reference only for a later voice phase |
| Vapi tables | `wb_calls` statuses `in-progress` to `ended` to `completed` (`voice-service.ts:273-327`), `wb_call_actions` (`:515`); no DDL in repo (H-10) | Not created in v1 |
| Outbound dial | `https://api.vapi.ai/call`, any signed-in user, no E.164 or cap (`vapi-routes.ts:333`) (C-01) | Closed by removal |
| Old agent graph | `USE_AGENT_GRAPH` flag (`webhook-routes.ts:14`) but `dispatchToPipeline` has no caller (`:22`); agent client still on retired GitHub Models URL (`backend/src/agent/openai-client.ts:12-15`) (M-11). Tools `search_inventory`, `lookup_knowledge_base`, `check_appointment_availability`, `book_appointment`, `escalate_to_human` (`backend/src/agent/tools.ts:21-82`); hard cap 3 tool calls, 6 s decide, 8 s classify, 10 s generate (`decide-and-retrieve.ts:16-19`, `classify.ts:5`, `generate.ts:5`); `reasoning_trace` JSONB on AI messages (`011-agent-reasoning-trace.sql:16`) | Ideas kept: tool-call cap in code, per-node timeouts with real abort, reasoning trace (now Langfuse + `agent_runs`). Code dropped |

## 3. Business rules in SQL, migrations and enum-like code

Fresh DB: these become schema, seeds or tenant config. "Source" is where the rule lives today.

| Area | Rule (legacy) | Source | v2 treatment |
|---|---|---|---|
| Tenant defaults | `auto_reply_enabled=true`, `ai_confidence_threshold=0.75`, `followup_timer_hours=48`, `services='[]'`, `inventory_schema={"fields":[]}` | `001-schema.sql:17-19`, `:16`; `002:82` | Tenant config defaults. Note: `threshold || default` treats 0 as unset (`pipeline-service.ts:529`) |
| Working hours | Mon-Sat 10:00-19:00, Sun disabled, `slot_duration_minutes=30`, per-day `{start,end,enabled}` | `006-appointment-slots.sql:8-9` | `tenant_hours` seed; one hours resolver (L-17, M-29) |
| Location fields | `business_address`, `google_maps_link` drive the deterministic location reply with 4 variants (full, address, maps, none) | `003`; `pipeline-service.ts:538-566`; `domains/types.ts:67-72` | Tenant config; keep deterministic templates, en/hi/mr |
| Conversation | `status='active'`, `language='en'`, `funnel_stage='inquiry'`, `negotiation_round=0`, `buying_signal_score=0`; `ai_paused` has NO DDL | `001:40,43`; `004:6-12`; H-10 | Columns in `conversations`; `ai_paused` default false; `last_inbound_at` added for window |
| Message sender | Values written: `customer`, `ai`, `user` (owner); frontend wants `business_owner` | `pipeline-service.ts:139-141`, `:230`; `conversation-routes.ts:124`; M-27 | Store canonical, serialize `business_owner` on the API |
| Message media | `media_type` in `image|voice|audio`, `media_url`, `media_mime_type`; `reasoning_trace` | `010-message-media.sql:16-18`; `011:16` | Private object key, not public URL |
| Lead score | `high|medium|low`, default `low`; score only moves up | `001:64`; `validation.ts:127`; `pipeline-service.ts:755-760` | Enum; keep forward-only for AI, owner can lower |
| Lead stage (CRM) | Column default `new`; API accepts any string up to 50; frontend board: `new, interested, quoted, negotiating, closed`, unknown shown as `new` | `001:65`; `validation.ts:125`; `frontend/src/pages/Leads.tsx:14,109-111` | Canonical enum = the frontend five (`03-tenancy-data.md`). See B-NEW-2 |
| Funnel stage (AI) | Order `inquiry(1) qualification(2) test_drive(3) negotiation(4) booking(5) documentation(6) delivery(7)`; generic aliases `new, engaged, negotiating, booked`; forward only | `pipeline-service.ts:797-834` | Keep as `conversations.funnel_stage`, separate from CRM stage; define the mapping (O2) |
| Intent to stage | greeting, general_question to inquiry; inventory_browse/inquiry/compare, pricing_inquiry to qualification; test_drive_request, meeting_request to test_drive; price_negotiation, trade_in, financing to negotiation; ready_to_buy, urgency_signal to booking; document_inquiry to documentation | `pipeline-service.ts:813-828` | Move into domain config data |
| Intents and score | Used-cars: 23 intents, each with lead score, auto-reply flag, escalate flag; generic: 13. `complaint` never auto-replies and escalates; `price_negotiation` auto-replies in used-cars but escalates in generic | `domains/used-cars/index.ts:26-49`; `domains/generic/index.ts:25-37` | Intent table in vertical config; prompts versioned |
| Auto-reply gate | `auto_reply_enabled` AND not `ai_paused` AND `should_auto_reply` AND (confidence at or above threshold OR intent in auto-reply list) AND no `escalation_reason`; else generic acknowledgement unless paused/escalated | `pipeline-service.ts:525-531`, `:709-715` | Replaced by guard + hold (FR-7, FR-26); keep `auto_reply_enabled` and `ai_paused` semantics |
| Negotiation | Used-cars: default discount 8 percent, cap 30, max 4 rounds, floor from item attrs `min_price/minimum_price/floor_price/lowest_price/min_sell_price`, discount from `max_discount_percent/negotiation_percent/discount_percent/max_discount`; generic: 4 percent, 1 round. Budget parser: `lakh|lac|l`, `crore|cr`, plain 5-8 digits. Beyond max rounds: hand to owner message | `used-cars/index.ts:386-398`; `generic/index.ts:313-325`; `pipeline-service.ts:578-592`, `:1239-1262`, `:1193-1215` | Per-tenant `max_discount` (default 0, H-28), never state floor; keep parser and round cap; escalate via hold |
| Buying signal | Weights: financing .2, document .15, test_drive .25, insurance .1, trade_in .2, ready_to_buy .3, urgency .25, negotiation .15, meeting .1; +.05 on polarity above .5; cap 1.0; at 0.7 inject "close-mode" hint | `pipeline-service.ts:843-866`, `:315-317` | Optional scoring config; eval before keeping |
| Limits | History load 50, LLM history 20, photos 3, browse items 20, conversation cap 150 messages, message text trimmed to 1500 chars | `used-cars/index.ts:399-405`; `pipeline-service.ts:170,280` | Config; 150 cap becomes a review item, not a canned message |
| Catalog | `quantity` default 1, `is_active` default true, up to 5 images; sold = `quantity=0` OR inactive; available = active and `quantity>0`; `markSold` sets quantity 0 | `002:94-108`; `validation.ts:31-35`; `catalog-service.ts:64-65,228-231` | Keep semantics; the Sheets "Status" column is derived, never input |
| Custom fields | Tenant `inventory_schema` fields typed `text|number|dropdown|date|boolean` | `validation.ts:90` | Per-tenant schema table |
| Customers | `first_seen_via` `whatsapp|walk_in|phone|referral`; `hotness` `hot|warm|cold` default cold; `status` `new|engaged|qualified|won|lost|dormant` default new (only owner edits it); UNIQUE `(user_id, primary_phone)`; phone falls back to JID | `007-customers-and-visits.sql:18-30`; `customer-routes.ts:157-159`; `pipeline-service.ts:1284-1322` | Keep enums; `contact_key` instead of raw phone (AGENTS) |
| Visits | `outcome` `interested|not_interested|will_decide|purchased|follow_up`, default interested; outcome sets customer hotness: interested/purchased hot, will_decide/follow_up warm, not_interested cold; `items_shown` merged into customer tags; `items_shown` is TEXT[] (voice-captured names) | `007:57`; `visit-routes.ts:121-134`; `008-visits-items-text.sql:10` | Keep mapping as a contract test |
| Tasks and appointments | `due_date` DATE, `is_completed` default false, `appointment_time` TIMESTAMPTZ; an appointment is a task whose title starts with the calendar emoji and "Appointment:" | `001:79-80`; `006:5`; `appointment-service.ts:308` | Cal.com booking row + visit task serializer (arch s8) |
| Knowledge | `content_hash`, `chunk_index`, `source_file_id` cascade; dedupe per tenant by hash | `002:11-14,71-73` | Documents + chunks, replace on edit |
| Source files | `processing_status` `pending|processing|completed|failed`; `file_type` excel/csv/pdf/image/text; `data_type` structured/unstructured | `002:57-62` | Keep for import UI |
| WABA account | `status` `active|paused|revoked`; UNIQUE per user and per phone id | `009:20,23-24` | Connected-number table; `paused` also drives `/sessions` reset (arch s9) |
| Webhook dedup | UNIQUE `wh_message_id`, `processed` default false, 7-day retention intent | `009:37-42` | `inbound_events` (ADR 0003) |
| Triggers | `wb_update_timestamp` sets `updated_at` on every UPDATE of leads, customers, catalog, WABA | `001:110-120`; `007:39`; `002:127`; `009:29` | Keep; but do NOT use `updated_at` as "last customer activity" (B-NEW-3) |
| RPCs | `wb_match_knowledge`, `wb_search_catalog` take caller `p_user_id` (H-01); `wb_search_catalog_structured` unused (L-06) | `002:28-46,136-221` | tenant filter inside query, RLS |

## 4. Config and env keys (names only)

Legacy keys read in `backend/src/config/environment.ts:6-56` plus direct `process.env` reads.

| Key | Use | v2 |
|---|---|---|
| `PORT`, `NODE_ENV`, `FRONTEND_URL` | server, CORS, report link, Vapi webhook URL guess (`vapi-routes.ts:307-309`) | Platform env; CORS allow-list from config |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | DB, auth client, service-role everywhere (H-01) | URL and anon for JWT verify; service role migrations only (AGENTS) |
| `GROQ_API_KEY` | text LLM, Whisper, TTS; required at boot (`environment.ts:59`) | Gateway secret, per-task model map |
| `GEMINI_API_KEY`, `AI_VISION_MODEL` | vision | Gateway; later |
| `JINA_API_KEY` | embeddings | Gateway |
| `AI_MODEL` | text model override; also read by the old agent (`openai-client.ts:16`) | Gateway config, not env |
| `OPENAI_API_KEY` | Whisper fallback, TTS | Per STT decision (O4) |
| `GITHUB_PAT` | retired GitHub Models, kept so boot works (`environment.ts:18`) | Drop |
| `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_PHONE_NUMBER_ID`, `META_SYSTEM_USER_TOKEN`, `META_WABA_ID` | Meta webhook and single-tenant fallback | Drop; ChatSyncs secrets per tenant in DB (FR-23) |
| `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `VAPI_ASSISTANT_ID`, `VAPI_WEBHOOK_SECRET` | voice calls | Drop |
| `GOOGLE_SA_EMAIL`, `GOOGLE_SA_KEY`, `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_NAME` | one global sheet | Service account stays platform-level secret; sheet id and tab name move to `tenant_integrations` (ADR 0006) |
| `OWNER_EMAILS` | platform-owner allow-list (`auth-plugin.ts:58`) | `platform_admins` table; frontend still gates by its own `VITE_OWNER_EMAILS` |
| `USE_AGENT_GRAPH` | dead feature flag | Drop |
| `AUTH_SESSIONS_DIR` | Baileys leftover in `.env.production.example` | Drop |

Hard-coded tuning that must become config or DB (not env): Graph API version `v21.0` (`whatsapp-cloud-client.ts:4`), timeouts (`ai-router.ts:25-28`), thresholds 0.4 and 0.35, chunk sizes, cron expressions, rate-limit 5 per 30 s, body limit 15 MB (`server.ts:19`), 5 MB walk-in audio (`voice-routes.ts:83`).

## 5. Preserve, drop, and new findings

### Behaviours worth preserving

| Behaviour | Where | Why | Audit link |
|---|---|---|---|
| Forward-only lead score and funnel stage | `pipeline-service.ts:755-760`, `:830-834` | Owner trust in the board | H-24 context |
| Deterministic replies for location and photo requests (templates, 4 variants each, en/hi) | `pipeline-service.ts:538-566`, photo reply `:676`; `domains/types.ts:67-80` | No LLM risk on fixed facts | H-26, H-27 |
| Dedicated Hinglish detection (`hinglishHint`) and Hindi branch | `used-cars/index.ts:72`; `pipeline-service.ts:205,541` | Target users | M-10 (add Marathi) |
| Budget parser (lakh, crore, plain digits) and negotiation round cap | `pipeline-service.ts:1239-1262`, `:578` | Works for Indian price talk | H-28 |
| Sold-alternatives flow: exact match even if sold, then up to 3 similar | `catalog-service.ts:416-455` | Good UX | H-31 |
| Slot alternatives rule (same day, then 3 days, nearest 3) and IST handling | `appointment-service.ts:350-381`, `:58-105` | Booking UX | H-19 |
| Sheets: inactive-item skip, placeholder-name skip, price parsing, 12-column layout | `sheets-sync-service.ts:5-9,135-142,185-189` | Existing dealer sheets | H-30 |
| Walk-in STT quality gates and Whisper boilerplate blacklist | `voice-routes.ts:10-77`; `voice-transcription-service.ts:98-134` | Prevents ghost customers | M-30 |
| Image reply: identify car, match stock, share up to 2 photos | `pipeline-service.ts:186-273` | Differentiator (later phase) | scope D10 |
| Visit outcome to hotness map; tags from items shown | `visit-routes.ts:121-134` | CRM contract | contract |
| Skip offsets already in the past for reminders | `reminder-service.ts:46,63` | Avoids instant spam | H-17 |
| Dashboard-delete stays deleted across sync | `sheets-sync-service.ts:185-189` | Trust | H-30 |
| Per-node timeouts and 3-tool cap idea | `decide-and-retrieve.ts:16-19` | Already ADR 0018 | H-15 |

### Bugs and risks to drop

| Item | Evidence | Audit id |
|---|---|---|
| Fake analysis and canned reply on LLM error | `ai-router.ts:131-146,249-253`; `pipeline-service.ts:722-731` | H-15, M-25 |
| Retrieval error returns `[]` | `rag-service.ts:46-49`; `catalog-service.ts:386-404` | H-29 |
| Ack first, in-memory work, dedup then swallow | `webhook-routes.ts:104-111,199-215,266-269` | H-13, H-14 |
| Oldest-user and env-token fallbacks | `webhook-routes.ts:169-178`; `whatsapp-cloud-client.ts:42-47` | H-05 |
| Select-then-insert for conversation, lead, customer | `pipeline-service.ts:87-107,1296-1322` | H-12 |
| Send results as booleans, success reported on failure | `whatsapp-cloud-client.ts:58`; `conversation-routes.ts:129-138` | H-21 |
| Free-form nudges and reminders, no window, consent, quiet hours | `cron-service.ts:118-122`; `reminder-service.ts:50` | H-20, H-23, M-28 |
| Unlocked crons, server timezone, one arbitrary tenant for Sheets | `cron-service.ts:16-44` | M-18, H-30 |
| Public media buckets, plaintext WABA token | `message-media-service.ts:19`; `009:19` | H-09, H-07 |
| Floor price default stated to customer, 8 percent default | `pipeline-service.ts:1147-1152,1193-1215` | H-28 |
| Escalation messages without pause or owner alert ("AI keeps replying for demo reliability") | `pipeline-service.ts:588,628` | H-24 |
| Hours text hardcoded | `pipeline-service.ts:358` | M-29 |
| TTS via blocking `execSync` | `tts-service.ts:143` | H-18 |
| Vapi fail-open webhook, open dialer | `vapi-routes.ts:10-14,192-355` | H-03, H-04, C-01 |
| Duplicate/dead agent path and stale GitHub endpoint | `webhook-routes.ts:22`; `agent/openai-client.ts:12-15` | M-11 |
| Analytics counts all tenants' messages | `health-routes.ts:28,31` | H-02 |

### New findings (not in the gap register)

| ID | Sev | Finding | Evidence | Fix direction |
|---|---|---|---|---|
| B-NEW-1 | High | Sheets auto-sync resurrects sold items. Export writes quantity `0` and Status `Sold`; the next import (runs first, every 2 min) reads `'0'`, `parseInt('0') \|\| 1` gives 1 and updates the row to available. The Status column is never read on import | `sheets-sync-service.ts:100,143,191-194,226`; `cron-service.ts:26` | Parse quantity with explicit NaN check; treat Status "Sold" as quantity 0; contract test: sold stays sold after a sync round-trip. Applies once Sheets is built (FR-19) |
| B-NEW-2 | Medium | `wb_leads.stage` holds AI funnel names (`inquiry`, `qualification`, ...) because the lead is inserted with the funnel stage. The board knows only `new/interested/quoted/negotiating/closed` and shows unknown values as New. The follow-up cron selects only `new`/`contacted`, so AI-created leads never match; only leads the owner drags to New do. This is more than cosmetic L-05 | `pipeline-service.ts:778,797-808`; `Leads.tsx:14,109-111`; `cron-service.ts:109` | Two fields: CRM `stage` (frontend five) and `funnel_stage`; define the mapping once; follow-ups come from `followups` rows, not a stage filter (O2) |
| B-NEW-3 | Medium | "Stale" is measured by `wb_leads.updated_at`, which a trigger bumps on any lead UPDATE. The pipeline updates a lead only when score or stage changes, so an active chat can look stale, and an owner note edit resets the clock. `conversations.last_message_at` is not used | `001-schema.sql:118-120`; `pipeline-service.ts:756-760`; `cron-service.ts:110` | Base follow-up eligibility on last inbound/outbound message time and per-tenant `followup_timer_hours` |
| B-NEW-4 | Medium | Reminders are scheduled only by the AI booking path. Owner-created appointment tasks never get reminders, and nothing cancels reminders when a task is deleted, completed or moved (`cancelReminders` has only an internal caller, keyed by exact ISO time) | `pipeline-service.ts:367`; `task-routes.ts:35-82`; `reminder-service.ts:42,91` | Reminder jobs keyed by booking id; cancel on booking change, task delete, Cal.com cancel webhook |
| B-NEW-5 | Low | Daily report: "new leads" is last 24 h by `created_at` (not calendar day), the word "today" is misleading; logs success even when the send returned false; sent to the sending number itself | `cron-service.ts:68,80-81,96-97` | If kept (O1), compute in IST day, record delivery state |
| B-NEW-6 | Low | `ai_confidence_threshold \|\| default` and `price \|\| null` treat 0 as missing: threshold 0 cannot be set, a price of 0 imports as null | `pipeline-service.ts:529`; `sheets-sync-service.ts:142,193` | Use explicit null checks |

## 6. Plug-in points for parked DB and infra work

| Plan needs | Plug-in | Interface to keep stable |
|---|---|---|
| Durable timers (J1 to J4) | `jobs` table, tick every 15 s, dedup keys (arch s3, ADR 0003) | Job `kind`, `dedup_key`, `payload` shape; handlers are pure functions of tenant context |
| Tenant context for crons | System functions `claim_jobs`, `enqueue_due_followups` (ADR 0012) | A job carries `tenant_id`; handlers call `tenant_tx` |
| Provider calls | `WhatsAppProvider`, `ModelGateway`, `SheetsClient`, `CalendarProvider` ports (ADR 0028, 0011) | Fakes first; no adapter import from core |
| Rules in section 3 | Seed config tables and enums ([03-tenancy-data](../03-tenancy-data.md)) | Names of enums in section 3 stay as the contract |
| Retention (J6) | `maintenance:*` jobs | Retention days per table |

Until the DB exists, port rules as pure Python functions with unit tests (budget parser, slot alternatives, funnel advance, visit-to-hotness map, STT gates, Sheets row parsing). They have no DB dependency.

## Needs owner decision

| # | Question | Default if no answer |
|---|---|---|
| O1 | Keep the 21:00 daily owner report in v1? It is not in the PRD. If yes, to which number and in which template | Drop from v1, revisit after pilot |
| O2 | Lead stage mapping: how funnel stages map to the five board stages (suggest inquiry to new; qualification and test_drive to interested; negotiation to negotiating; booking, documentation, delivery to closed or quoted) | Use the suggested map, owner reviews on pilot data |
| O3 | Walk-in voice capture (`POST /voice/extract-walkin`) stays in the pilot? It needs an STT vendor even though WhatsApp voice is off (D10) | Keep stub that returns a clear "not available" message |
| O4 | STT vendor and fallback (legacy used Groq Whisper then OpenAI Whisper) | Decide in M0 sample test (ADR 0005) |
| O5 | Keep the image-to-stock flow (Gemini vision) after the pilot, or drop | Defer; images are `unsupported` in the pilot |
| O6 | Sheets: do pilot dealers already have a sheet in the legacy 12-column layout? If yes, keep that exact layout | Keep layout (section 2b S2) |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Legacy prod schema differs from migrations (no DDL for `ai_paused`, `wb_calls`; H-10) | Some rules in section 3 may be incomplete | Treat as reference; confirm against the frontend contract tests, not this file |
| Line numbers cite the repo at commit 72398de | Drift if legacy changes | Legacy is read only; re-check before quoting |
| Porting rules without the DB leaves them untested against real data | Subtle mismatches | Pure functions plus golden cases taken from the cited behaviours |
| Threshold and weight values (0.4, 0.35, buying-signal weights) were never evaluated | Tuned for a demo | Treat as starting config; calibrate on the eval set (NFR-9) |
| B-NEW-1 and B-NEW-2 are in code paths v2 may recreate by porting literally | Same bugs return | Contract tests named after the finding ids |
| ChatSyncs behaviour for window, status and media is unverified | Rules in section 2a may not map | Provider capability flags; M0 spike |
