# Legacy inventory A: backend API and services (non-AI)

## Summary
- Static read of `../backend/src` (about 7.8k lines in routes and services; nothing run). Agent and AI parts (`agent/`, `ai-router.ts`, prompt files in `domains/`) are left to Inventory B.
- 55 HTTP routes (51 behind a JWT and 4 public). The frontend calls 41 of them. 14 have no frontend caller (4 are provider hooks or health). 4 frontend `/sessions` calls have no backend route at all.
- Auth is one `onRequest` hook (Supabase `getUser` per request). Tenant id comes only from the JWT. All data access uses the service-role client with `.eq('user_id')` filters.
- 14 implicit behaviours the frontend depends on are listed in section 4. Four are defects the rebuild must decide on (message truncation, sender value, lead stages, sold vs deleted). One is new (Sheets sync reverts sold items).
- Dead or parked: `dispatchToPipeline` and `USE_AGENT_GRAPH` (no callers), both rate limiters (no importers), Vapi calls and outbound dialer (parked, no nav link), `wb_sessions` (no writer), Baileys remnants.

Conventions: legacy cites are `path:line` relative to `backend/src/` (backend) or `frontend/src/` (frontend). Finding ids are from `../../../docs/production-plan/01-gap-register.md`. "New" means not in that register. DB tables are named only to show where the DB layer plugs in later; nothing here depends on it.

## 1. HTTP routes

Auth key: **JWT** = Bearer Supabase token, user id from token. **Public** = in `PUBLIC_ROUTES` (`plugins/auth-plugin.ts:15-19`). **Owner** = JWT plus `isOwner` (email in `OWNER_EMAILS`).
Prefixes come from `server.ts:34-72`. Error bodies are `{error: string}` unless stated (see section 4.1).

### 1.1 Platform, webhook, analytics

| # | Method and path | Auth | Request keys | Response | Module (service) | Data touched | Frontend caller | Findings |
|---|---|---|---|---|---|---|---|---|
| 1 | GET `/api/health` | Public | none | `{status:'ok', uptime:'Xh Ym', activeReminders:n}` | `routes/health-routes.ts:9` (reminder-service) | none | none (no Dockerfile HEALTHCHECK) | H-33 |
| 2 | GET `/api/analytics` | JWT | none | `{totalConversations, totalLeads, leadsByScore{high,medium,low}, leadsByStage{}, totalTasks, completedTasks, aiMessagesCount}`; 500 `{error}` if any query fails | `health-routes.ts:22` | wb_conversations, wb_messages, wb_leads, wb_tasks | `Dashboard.tsx:57`, `Analytics.tsx:32` | H-02, L-05 |
| 3 | GET `/api/webhook/whatsapp` | Public (verify token) | query `hub.mode`, `hub.verify_token`, `hub.challenge` | 200 raw challenge text; 403 `{error:'Verification failed'}` | `routes/webhook-routes.ts:76` | none | none (Meta) | none |
| 4 | POST `/api/webhook/whatsapp` | Public (HMAC `x-hub-signature-256`) | Meta payload `entry[].changes[].value{metadata.phone_number_id, contacts[], messages[]}` | Always 200: `{status:'ignored'}` (bad signature) or `{status:'ok'}`; work runs after the reply in `setImmediate` | `webhook-routes.ts:92` (pipeline-service, whatsapp-cloud-client, voice-transcription, message-media) | wb_waba_accounts, wb_webhook_events, plus everything the pipeline writes | none (Meta) | H-05, H-13, H-14, H-21, H-22, L-03, M-13, M-14 |

Route 4 detail: handles types `text`, `audio`, `image`, `button`, `interactive`; others are logged and dropped (`:262-264`). Dedup is select-then-insert on `wb_webhook_events.wh_message_id` (`:200-215`). `processed=true` is set even after a failed pipeline (`:266-269`).

### 1.2 Conversations, leads, tasks, users

| # | Method and path | Auth | Request keys | Response | Module | Data touched | Frontend caller | Findings |
|---|---|---|---|---|---|---|---|---|
| 5 | GET `/api/conversations` | JWT | query `status` (optional) | `{conversations:[row + wb_leads:[{score,stage,intent}]]}`, order `last_message_at` desc, limit 50 | `routes/conversation-routes.ts:6` | wb_conversations, wb_leads | `Conversations.tsx:126` | H-24, M-27 |
| 6 | GET `/api/conversations/:id` | JWT | none | `{conversation, messages}`; 404 `Conversation not found` | `conversation-routes.ts:25` | wb_conversations, wb_messages | none | none |
| 7 | GET `/api/conversations/:id/messages` | JWT | query `limit` (default 100, clamp 1..500) | `{messages:[...]}` order `created_at` **asc**, so the oldest N | `conversation-routes.ts:52` | wb_conversations (ownership), wb_messages | `Conversations.tsx:137` (polled every 3 s, no limit) | M-27, new (4.4) |
| 8 | PATCH `/api/conversations/:id` | JWT | `{status?, ai_paused?}` (nullish, other keys stripped) | `{conversation}`; 404 `Conversation not found` | `conversation-routes.ts:83` | wb_conversations | `Conversations.tsx:146` | H-24 |
| 9 | POST `/api/conversations/:id/messages` | JWT | `{content}` (1..5000) | `{success:true}` even if the WhatsApp send fails (failure only logged) | `conversation-routes.ts:108` (whatsapp-cloud-client) | wb_conversations, wb_messages (sender `'user'`) | `Conversations.tsx:159` | H-21, M-27 |
| 10 | GET `/api/leads` | JWT | query `stage`, `score` | `{leads:[row + wb_conversations:{customer_jid,customer_name,customer_phone,last_message_at}]}`, order `updated_at` desc, limit 100 | `routes/lead-routes.ts:6` | wb_leads, wb_conversations | `Leads.tsx:46` | L-05 |
| 11 | PATCH `/api/leads/:id` | JWT | `{stage?(<=50 chars), notes?(<=5000), score?('high'\|'medium'\|'low')}` | `{lead}`; 404 `Lead not found` | `lead-routes.ts:27` | wb_leads | `Leads.tsx:60` (`{stage}`) | L-05 |
| 12 | GET `/api/tasks` | JWT | query `completed` ('true'/'false') | `{tasks:[row]}`, order `created_at` desc, limit 200 | `routes/task-routes.ts:14` | wb_tasks | `Tasks.tsx:17`, `Dashboard.tsx:59`, `Appointments.tsx:80` | none |
| 13 | POST `/api/tasks` | JWT | `{title(1..500), due_date?, is_completed?=false, appointment_time?}` | **201** `{task}` | `task-routes.ts:35` | wb_tasks | `Appointments.tsx:128` | none |
| 14 | PATCH `/api/tasks/:id` | JWT | `{is_completed?, title?, due_date?, appointment_time?}` | `{task}`; 404 `Task not found` | `task-routes.ts:60` | wb_tasks | `Tasks.tsx:28`, `Appointments.tsx:105` | none |
| 15 | DELETE `/api/tasks/:id` | JWT | none | `{success:true}` (also when no row matched) | `task-routes.ts:85` | wb_tasks | `Appointments.tsx:110` | none |
| 16 | GET `/api/users/:id` | JWT | none | `{user: wb_users row (select *)}`; creates the row on first read; 403 `Forbidden` if `:id` is not the JWT user; 500 includes `details` and `code` | `routes/user-routes.ts:6` | wb_users | `Settings.tsx:52`, `Dashboard.tsx:48` | L-11, M-02 |
| 17 | PATCH `/api/users/:id` | JWT | allow-list `business_name, industry, services[], business_address, google_maps_link, auto_reply_enabled, ai_confidence_threshold(0..1), followup_timer_hours(1..720), inventory_schema{fields[]}` (all nullish) | `{user}` (upsert with JWT email); 500 includes `message, hint, code` | `user-routes.ts:44` | wb_users | `Settings.tsx:69,208`, `Onboarding.tsx:29` | M-02, M-03 |

### 1.3 Knowledge, catalog, schema, files, sheets

| # | Method and path | Auth | Request keys | Response | Module (service) | Data touched | Frontend caller | Findings |
|---|---|---|---|---|---|---|---|---|
| 18 | GET `/api/knowledge` | JWT | none (`?userId=` is ignored) | **bare array** of rows (select `*`, includes `embedding`), `created_at` desc, no limit | `routes/knowledge-routes.ts:6` | wb_knowledge_base | `KnowledgeBase.tsx:27`, `AIBrain.tsx:109` | L-04 |
| 19 | POST `/api/knowledge` | JWT | `{content (1..50000)}` (`userId` stripped) | `{success:true, count}`; **400** `Content already exists or failed to generate embeddings` when 0 stored | `knowledge-routes.ts:22` (pipeline-service.getRagService, rag-service) | wb_knowledge_base | `KnowledgeBase.tsx:47`, `AIBrain.tsx:125` | M-12, M-05 |
| 20 | DELETE `/api/knowledge/:id` | JWT | none | `{success:true}` (also when no row matched) | `knowledge-routes.ts:40` | wb_knowledge_base | `KnowledgeBase.tsx:62`, `AIBrain.tsx:137` | none |
| 21 | GET `/api/catalog` | JWT | query `search, category, priceMin, priceMax, status('available'\|'sold'\|'all', default available), page, limit(1..100, default 25), sort('name'\|'price_asc'\|'price_desc'\|'newest'\|'oldest')` | `{items, total, page, limit, totalPages}`; 400 `{error:'Validation failed', details[]}` | `routes/catalog-routes.ts:21` (catalog-service) | wb_catalog_items | `InventoryTable.tsx:64` | H-31 |
| 22 | GET `/api/catalog/stats` | JWT | none | `{total, available, sold, categories{name:count}}` | `catalog-routes.ts:42` | wb_catalog_items | `AIBrain.tsx:98` | new (4.5) |
| 23 | POST `/api/catalog/images/upload` | JWT | multipart, any field name (frontend uses `images`), `image/*` only, max 5 files, 15 MB each | `{images:[{url, caption, order, storagePath}]}`; every failure is **400** `{error}` | `catalog-routes.ts:53` (catalog-image-service) | Storage bucket `SUPABASE_STORAGE_BUCKET` (default `catalog-images`, public) | `ItemModal.tsx:67` | H-09 |
| 24 | GET `/api/catalog/export` | JWT | query `type` ('all'\|'available'\|'sold') | xlsx blob (`Content-Disposition`); 404 `No items to export` | `catalog-routes.ts:78` (exceljs) | wb_catalog_items, wb_users (schema, name) | `AIBrain.tsx:167` | new (4.5) |
| 25 | GET `/api/catalog/:id` | JWT | none | `{item}`; 404 `Item not found` | `catalog-routes.ts:194` | wb_catalog_items | none | none |
| 26 | POST `/api/catalog` | JWT | `{item_name(1..500), category?, price?>=0, quantity?(int>=0, default 1), images?[<=5 {url,caption?,order}], attributes?{}}` | **201** `{item}`; 500 `Failed to add item` | `catalog-routes.ts:207` (catalog-service.addItem, embeds) | wb_catalog_items | `ItemModal.tsx:104` | H-30 |
| 27 | PATCH `/api/catalog/:id` | JWT | same keys, all optional, plus `is_active` | `{item}`; 404 `Item not found or update failed` | `catalog-routes.ts:222` | wb_catalog_items | `ItemModal.tsx:102` | L-09 |
| 28 | PATCH `/api/catalog/:id/sold` | JWT | none | `{item}` with `quantity:0`; 404 `Item not found` | `catalog-routes.ts:238` | wb_catalog_items | `InventoryTable.tsx:78` | none |
| 29 | DELETE `/api/catalog/:id` | JWT | none | `{success:true}` (soft delete, `is_active=false`); 500 on error | `catalog-routes.ts:251` | wb_catalog_items | `InventoryTable.tsx:89` | L-19 |
| 30 | POST `/api/catalog/batch` | JWT | `{items[1..1000], sourceFileId?}` | `{added, failed}` | `catalog-routes.ts:264` | wb_catalog_items | none | none |
| 31 | GET `/api/schema` | JWT | none | `{schema:{fields[]}}` (default `{fields:[]}`) | `catalog-routes.ts:282` (`schemaRoutes`) | wb_users.inventory_schema | `AIBrain.tsx:88` | none |
| 32 | PATCH `/api/schema` | JWT | `{schema:{fields:[{key,label,type('text'\|'number'\|'dropdown'\|'date'\|'boolean'),required?,options?}]}}` | `{schema}` | `catalog-routes.ts:299` | wb_users | `AIBrain.tsx:148` | none |
| 33 | POST `/api/files/upload` | JWT | multipart field `file`, ext `.xlsx/.xls/.csv`, 15 MB | `{fileId, filename, fileType('csv'\|'excel'), totalRows, columns[{key,label,sampleValues,inferredType}], preview(first 5), rows(all)}`; 400 `{error}` | `routes/file-routes.ts:24` (file-processor) | wb_source_files | `FileUpload.tsx:43` | M-12 |
| 34 | POST `/api/files/:fileId/process` | JWT | `{columnMapping{col:target}, rows[1..5000]}`; targets `item_name, category, price, quantity, ignore, attributes.<key>` | `{success, added, failed, total}`; 404 `File not found`; 400 `No valid items found after mapping...`; 500 `Processing failed: <msg>` | `file-routes.ts:95` (catalog-service.batchAddItems) | wb_source_files, wb_catalog_items, wb_users (auto-saves schema if empty, `:141-164`) | `FileUpload.tsx:78` | H-30 |
| 35 | GET `/api/files` | JWT | none | `{files:[row]}` by `uploaded_at` desc | `file-routes.ts:188` | wb_source_files | none | none |
| 36 | DELETE `/api/files/:fileId` | JWT | none | `{success:true}`; soft-deletes the file's catalog items | `file-routes.ts:207` | wb_catalog_items, wb_source_files | none | L-19 |
| 37 | POST `/api/sheets/export-to-sheet` | JWT | none | `{success, message:'Exported N items to Google Sheet'}`; 500 `{error: err.message}` | `routes/sheets-routes.ts:8` (sheets-sync-service) | wb_catalog_items, Google Sheet (env `GOOGLE_SHEET_ID`) | `AIBrain.tsx:190` | H-30 |
| 38 | POST `/api/sheets/import-from-sheet` | JWT | none | `{success, added, updated}` | `sheets-routes.ts:19` | same | `AIBrain.tsx:190` | H-30 |
| 39 | POST `/api/sheets/sync` | JWT | none | `{success, message, added, updated, exported}` | `sheets-routes.ts:30` | same | `AIBrain.tsx:190` | H-30, new (4.6) |

### 1.4 Owner, customers, visits, voice, Vapi

| # | Method and path | Auth | Request keys | Response | Module (service) | Data touched | Frontend caller | Findings |
|---|---|---|---|---|---|---|---|---|
| 40 | GET `/api/owner/overview` | Owner (403 `Forbidden`) | none | `{overview:{total_businesses, active_businesses, connected_devices, disconnected_devices, total_conversations, total_messages, total_leads, total_tasks, total_voice_calls, businesses_added_today, businesses[{id, business_name, industry, created_at, connected_sessions, disconnected_sessions, total_conversations, total_messages, total_leads, total_tasks, total_voice_calls, last_activity_at, setup_complete}]}}` | `routes/owner-routes.ts:57` | all tables, full scans | `OwnerDashboard.tsx:61` | M-02, M-24, new (4.9) |
| 41 | GET `/api/customers` | JWT | query `hotness, status, source (maps to first_seen_via), search (name or phone ilike)` | `{customers:[row]}`, order `last_activity_at` desc, limit 200 | `routes/customer-routes.ts:6` | customers | `Customers.tsx:71` | M-03 |
| 42 | GET `/api/customers/:id` | JWT | none | `{customer, visits[], conversation|null, lead|null}`; 404 `Customer not found` | `customer-routes.ts:41` | customers, customer_visits, wb_conversations, wb_leads | `CustomerDetail.tsx:176` | M-01, H-12 |
| 43 | POST `/api/customers` | JWT | `{full_name?, primary_phone?, alt_phone?, email?, first_seen_via?='walk_in', tags?[], internal_notes?}`; one of name or phone required (400 `Name or phone required`) | `{customer, merged:boolean}` (200 both ways) | `customer-routes.ts:86` | customers | none | M-03 |
| 44 | PATCH `/api/customers/:id` | JWT | allow-list `full_name, primary_phone, alt_phone, email, hotness, status, tags, internal_notes, predicted_close_days, lifetime_value, custom_fields` (no validation) | `{customer}`; 404 `Customer not found` | `customer-routes.ts:153` | customers | `CustomerDetail.tsx:204` | M-03 |
| 45 | DELETE `/api/customers/:id` | JWT | none | `{success:true}`; FK errors give 500 `Failed to delete customer` | `customer-routes.ts:187` | customers | `CustomerDetail.tsx:223` | M-07 |
| 46 | GET `/api/visits` | JWT | query `customer_id, from, to` | `{visits:[row + customers:{full_name,primary_phone,hotness}]}`, `visited_at` desc, limit 200 | `routes/visit-routes.ts:6` | customer_visits, customers | none | M-01 |
| 47 | POST `/api/visits` | JWT | `{customer_id?, customer_name?, customer_phone?, visited_at?, duration_minutes?, staff_name?, items_shown?[], trial_taken?, trial_item_id?, quoted_amount?, outcome?='interested', next_action?, follow_up_at?, manual_notes?, ai_summary?}` (no schema validation); 400 `Either customer_id or (customer_name or customer_phone) required` | `{visit}` (200; frontend reads `visit.customer_id`) | `visit-routes.ts:36` | customers (find or create by exact phone), customer_visits | `AddWalkInModal.tsx:175,219`, `CustomerDetail.tsx:303` | M-01, M-08, M-03 |
| 48 | PATCH `/api/visits/:id` | JWT | allow-list `visited_at, duration_minutes, staff_name, items_shown, trial_taken, trial_item_id, quoted_amount, outcome, next_action, follow_up_at, manual_notes, ai_summary, custom_data` | `{visit}`; 404 `Visit not found` | `visit-routes.ts:150` | customer_visits | none | M-03 |
| 49 | DELETE `/api/visits/:id` | JWT | none | `{success:true}` | `visit-routes.ts:185` | customer_visits | none | none |
| 50 | POST `/api/voice/extract-walkin` | JWT | multipart field `file`, 5 MB | 200 `{transcript, provider, extracted{customer_name, customer_phone, staff_name, outcome, notes, items_mentioned[], follow_up_hint}, quality}`; `quality` in `good, unclear, too_short, low_confidence, hallucination`; 400/500 `{error, code}` with code `NO_FILE, EMPTY_AUDIO, TOO_SHORT, TOO_LONG, INTERNAL` | `routes/voice-routes.ts:87` (voice-transcription-service; ai-router extraction is Inventory B) | none | `AddWalkInModal.tsx:120`, `CustomerDetail.tsx:271` | M-30 |
| 51 | POST `/api/vapi/webhook` | Public (header `x-vapi-secret`, fails open when unset) | Vapi event `message{type,...}`; types `tool-calls, status-update, end-of-call-report, assistant-request, transcript, hang, speech-update, conversation-update` | `tool-calls` -> `{results}`; `assistant-request` -> assistant config; others 200 empty; errors still 200 | `routes/vapi-routes.ts:21` (voice-service) | wb_calls, wb_call_actions, wb_tasks, wb_users | none (Vapi) | H-03, H-04 |
| 52 | GET `/api/vapi/calls` | JWT | query `status, limit (default 50, max 200)` | `{calls:[row]}` by `created_at` desc | `vapi-routes.ts:97` | wb_calls | `VoiceCalls.tsx:140` | none |
| 53 | GET `/api/vapi/calls/:id` | JWT | none | `{call}`; 404 `Voice call not found` | `vapi-routes.ts:128` | wb_calls | none | none |
| 54 | GET `/api/vapi/calls/:id/actions` | JWT | none | `{actions:[row]}` by `created_at` asc; 404 `Voice call not found` | `vapi-routes.ts:154` | wb_calls, wb_call_actions | `VoiceCalls.tsx:156` | none |
| 55 | POST `/api/vapi/calls/outbound` | JWT (any user) | `{phoneNumber, customerName?}` | `{callId, status}`; 400 `phoneNumber is required`; 500 `VAPI is not configured...` | `vapi-routes.ts:192` | wb_users, Vapi API | `VoiceCalls.tsx:121` | C-01, M-23 |

### 1.5 Frontend calls with no backend route

| Frontend call | Caller | What the page does on 404 | Finding |
|---|---|---|---|
| GET `/sessions` | `Dashboard.tsx:32,58` | `.catch` returns empty list, so "not connected" | H-37 |
| GET `/sessions/:userId/status` | `QRScanner.tsx:32` | polling error is only logged; page keeps spinning | H-37 |
| POST `/sessions` `{}` | `QRScanner.tsx:57,103` | start fails: error state "Failed to start session" | H-37 |
| DELETE `/sessions/:userId` | `Dashboard.tsx:30`, `Settings.tsx:81` | alert "Failed to disconnect" / "Failed to reset sessions" | H-37 |

Counts: 59 `client.<verb>(` sites, 43 distinct method+path patterns (matches `docs/01-prd.md` section 5). 39 patterns map to backend routes (41 routes, since `/sheets/{action}` is 3 routes), 4 patterns are `/sessions`.

## 2. Services and modules

| Module (lines) | What it does | Called by | Status | Notes and findings |
|---|---|---|---|---|
| `server.ts` (95) | Builds Fastify, registers helmet, CORS, supabase, auth, 15 route plugins, starts cron | boot | live | Body limit 15 MB (`:19`). Only `unhandledRejection` handler; no SIGTERM drain (M-18) |
| `config/environment.ts` (65) | Reads env, exits if `SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, GEMINI_API_KEY, JINA_API_KEY` missing (`:65-72`) | everywhere | live | M-20. Meta, Vapi, Google, OpenAI keys default to `''` |
| `services/pipeline-service.ts` (1328) | Reply orchestrator. Non-AI duties: auto-creates `wb_users` row with `@demo.com` email and 'Demo Business' if missing (`:56-76`); finds or creates conversation (`:85-120`); links `customers` (`:1284-1316`); stores inbound message with voice/image columns (`:136-157`); 150-message cap with canned handoff (`:170-185`); lead upsert and forward-only funnel stage (`:736-837`); tasks from analysis (`:320-328`); appointment booking and reminders (`:336-368`); buying-signal score (`:306-312`, `:839-870`); auto-reply gate (`:523-532`); summary update (`:399`) | webhook-routes, knowledge-routes (`getRagService`) | live | AI calls inside are Inventory B. H-12, H-24, M-08, M-09 |
| `services/ai-router.ts` (555), `rag-service.ts` (211), `domains/*` (1,000+) | Prompts, LLM calls, embeddings, intent rules | pipeline, routes | live | Inventory B. Non-AI facts used by routes: knowledge chunking is 200 words, overlap 40, drop chunks <=20 chars, dedupe by SHA-256 prefix per tenant (`rag-service.ts:13-22,149-165`); industry string maps to a domain by alias table (`domains/domain-router.ts:18-47`), fallback `generic` |
| `services/catalog-service.ts` (593) | Catalog CRUD, stats, description builder for embeddings, batch insert (50 per batch), hybrid and semantic search | catalog-routes, file-routes, pipeline, voice-service, agent | live | Embedding failure is non-fatal (item saved without vector, `:139-148`). Price 0 stored as null (`:157`). H-29, H-31, L-09 |
| `services/catalog-image-service.ts` (113) | Ensures public bucket exists, uploads images, returns public URLs | catalog-routes | live | Bucket auto-created `public:true` (`:52-54`). H-09 |
| `services/file-processor.ts` (224) | Parses xlsx (ExcelJS) and csv, infers column types, maps rows to catalog items, parses prices (`6.5L`, `cr`, rupee sign) | file-routes | live | Header sanitiser, `fileHash` 16 hex chars. `.xls` accepted by extension but ExcelJS reads xlsx only (verify) |
| `services/sheets-sync-service.ts` (235) | One global Google Sheet via service account; fixed 12 columns; import then export | sheets-routes, cron | live | Env `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_NAME`. No embeddings on import (`:201-211`). H-30, new (4.6) |
| `services/appointment-service.ts` (385) | Working hours (IST), slot grid, overlap check, books by inserting a `wb_tasks` row, suggests alternatives for 3 days | pipeline, voice-service, agent tools | live | Bookings are tasks with title `📅 Appointment: {name} — {service} at {h:mm AM/PM}` (`:308`). Default hours Mon-Sat 10:00-19:00, 30-minute slots (`:36-46`). No slot uniqueness constraint (M-08) |
| `services/reminder-service.ts` (105) | `setTimeout` reminders 2 h and 1 h before a booking | pipeline (`:367`), health | live but fragile | In memory, lost on restart. H-17 |
| `services/cron-service.ts` (127) | 3 jobs: daily report 21:00 server time, stale-lead nudge every 6 h, Sheets sync every 2 min for the first user with a business name | `server.ts:75-76` | live | H-20, H-23, H-30, M-18, M-28, L-07 |
| `services/whatsapp-cloud-client.ts` (207) | Meta Graph v21 send text, image, voice (upload then send), mark read; per-tenant creds with env fallback | pipeline, routes, cron, reminders, voice-service | live | Returns booleans only (H-21). Env fallback H-05. Replaced by the provider port (ADR 0028) |
| `services/message-media-service.ts` (77) | Uploads inbound media to public bucket `whatsapp-media`, returns public URL | webhook-routes | live | H-09 |
| `services/voice-transcription-service.ts` (261) | Whisper via Groq (15 s timeout) then OpenAI fallback; format sniffing; segment quality check | webhook audio path, voice-routes | live, parked by D10 for WhatsApp | Walk-in route keeps it |
| `services/tts-service.ts` (157) | Text to voice reply: OpenAI tts-1 first, Groq Orpheus fallback, `execSync` ffmpeg WAV to Opus | webhook audio path only (`webhook-routes.ts:338`) | live, parked by D10 | H-18 |
| `services/voice-service.ts` (607) | Vapi tool-calls (search, book, share location, escalate), call lifecycle, hardcoded persona "Priya ... Pune" | vapi-routes | parked | H-03, H-04, H-25 |
| `utils/validation.ts` (144) | Zod schemas and `validate()` helper | most routes | live | Customers, visits, voice and sheets routes do not use it (M-03) |
| `utils/webhook-signature.ts` (31) | Meta HMAC check with `timingSafeEqual` | webhook-routes | live | Meta-specific; replaced by ChatSyncs path key |
| `utils/rate-limiter.ts` (47), `utils/inbound-rate-limiter.ts` (42) | Outbound token bucket; inbound 5 msgs per 30 s per JID | nobody | dead | See section 5 |
| `plugins/*` (113) | helmet, CORS, service-role client, auth hook | server | live | Section 3 |

## 3. Middleware, auth and public routes

| Item | Behaviour | Evidence | Findings |
|---|---|---|---|
| Security headers | `@fastify/helmet`, CSP off | `server.ts:24-26` | none |
| CORS | No Origin allowed; any `localhost` only when `NODE_ENV=development`; otherwise Origin must equal `FRONTEND_URL`; other origins raise an error (500). Methods GET, POST, PUT, PATCH, DELETE, OPTIONS; headers `Content-Type, Authorization`; credentials on | `plugins/cors-plugin.ts:7-31` | verify: a wrong `FRONTEND_URL` breaks writes even same-origin, because browsers send `Origin` on POST |
| Auth hook | `onRequest`: skip public prefixes and OPTIONS; need `Authorization: Bearer`; verify with `auth.getUser(token)` (remote call every request, anon-key client with service-key fallback); set `userId, userEmail, isOwner` | `plugins/auth-plugin.ts:28-66` | L-01, L-02, M-02 |
| Public list | `/api/health`, `/api/vapi/webhook`, `/api/webhook/whatsapp` matched by `startsWith`, so `/api/health*` and `/api/webhook/whatsapp*` are also public | `auth-plugin.ts:15-19,31` | L-01 |
| 401 bodies | `Missing or invalid authorization header`, `Invalid or expired token`, `Authentication failed` (all `{error}`) | `auth-plugin.ts:42,52,64` | none |
| Owner check | Inside the handler: `request.isOwner` from env `OWNER_EMAILS`; frontend hides the link with `VITE_OWNER_EMAILS` | `owner-routes.ts:58`, `auth-plugin.ts:58`, `DesktopSidebar.tsx:42-46` | M-02 |
| Tenant scoping | Handlers use `request.userId` only; client `userId` in query or body is ignored | all routes | H-01 |
| Supabase client | One service-role client decorated on the server, plus extra clients in `pipeline-service.ts:1327`, `whatsapp-cloud-client.ts:24`, `agent/supabase-client.ts:9` | `plugins/supabase-plugin.ts:11-13` | H-01, H-34 |
| Raw body | Webhook scope replaces the JSON parser to keep `rawBody` for HMAC; bad JSON gives 400 | `webhook-routes.ts:65-73` | none |
| Multipart | Registered per scope: catalog (15 MB, 5 files), files (15 MB), voice (5 MB). nginx caps 20 MB | `catalog-routes.ts:10`, `file-routes.ts:10`, `voice-routes.ts:82`, `frontend/nginx.conf:8` | M-14 |
| Rate limits | None on HTTP. No `@fastify/rate-limit`. Both limiter classes are unused | grep, section 5 | H-16, M-15 |
| Error handler | None custom. Unmatched routes and thrown errors use Fastify default `{statusCode, error, message}` | no `setErrorHandler` or `setNotFoundHandler` in `src/` | L-10 |
| Request id, audit log | None | none | M-24 |

## 4. Implicit behaviours the frontend relies on

Each row says what the rebuild must reproduce (R) or decide (D).

| # | Behaviour | Evidence | R/D |
|---|---|---|---|
| 4.1 | **Error envelope.** Handled errors are `{error: string}`. Validation is `{error:'Validation failed', details:['path: message',...]}`; `Settings.tsx:218-222` joins `details`, else `message`, else `error`. User routes add `details, message, hint, code` on 500. `apiClient` sends every 401 to `/login` (`api/client.ts:30-36`), so a non-auth 401 logs the user out. | `utils/validation.ts:9`, `user-routes.ts:30,35,63-68`, `Settings.tsx:218-222` | R |
| 4.2 | **Response wrapping.** Lists use named keys (`conversations, leads, tasks, customers, visits, files, calls, actions, messages`); single rows use `conversation, lead, task, customer, visit, item, user, call`. Exceptions: `GET /knowledge` is a **bare array** (`AIBrain.tsx:110` checks `Array.isArray`), `GET /customers/:id` is `{customer, visits, conversation, lead}`, `GET /conversations/:id` is `{conversation, messages}`. | route files | R |
| 4.3 | **Status codes.** 201 only for `POST /tasks` and `POST /catalog`. Every other create is 200 (customers, visits, knowledge, files). DELETE returns 200 `{success:true}` even when nothing matched. 404 messages differ per route (table in 1.x). `GET /users/:id` 403 on id mismatch. Webhook always 200. | `task-routes.ts:53`, `catalog-routes.ts:214`, `task-routes.ts:94` | R |
| 4.4 | **Message list truncation (defect).** `GET /conversations/:id/messages` sorts ascending and limits to 100 (max 500), so a chat with more than 100 messages returns the oldest 100. The page polls every 3 s with no `limit`, so new messages stop appearing after message 100. The pipeline caps at 150 (`pipeline-service.ts:170`) and then only sends the handoff text. | `conversation-routes.ts:65-73`, `Conversations.tsx:96-98,137` | D (fix: newest N, ascending) |
| 4.5 | **Catalog semantics.** `status=available` is `is_active AND quantity>0`; `status=sold` is `is_active=false OR quantity=0`, so **soft-deleted items show as "Sold"** in the list and stats (`catalog-service.ts:62-66,274-278`), while export `type=sold` excludes deleted ones (`catalog-routes.ts:91-98`). `sort=newest` sorts by `updated_at` desc, `oldest` by `created_at` asc. Stats and export read all rows with no pagination; a PostgREST row cap (often 1000, verify) would truncate. Delete is soft. Mark-sold sets `quantity=0`. | cited | D |
| 4.6 | **Sheets sync reverts dashboard changes (new).** `sync` imports first, then exports. Import overwrites `price, quantity, category, attributes` of every matching row from the sheet (`sheets-sync-service.ts:191-194`), so a dashboard "mark sold" is lost on the next run; the 2-minute cron repeats this for the first user (`cron-service.ts:26,38-48`). Also `parseInt(quantity)\|\|1` turns a sheet value of 0 into 1 (`:143`). Response keys `message, added, updated` are what the page shows (`AIBrain.tsx:191`). | cited | D |
| 4.7 | **Sender and media conventions.** Stored senders are `customer`, `ai`, `user` (owner, `conversation-routes.ts:124`); the page expects `customer`, `ai`, `business_owner` (`Conversations.tsx:232-234`, optimistic message at `:165`), so owner bubbles flip after the next poll. Voice notes are stored as `🎤 [Voice Note]: <text>` plus `media_type='voice'`; images as `[Customer sent an image]` plus `media_type='image'`; the page detects both content and column (`Conversations.tsx:61-70,265,295`). Message rows also carry `intent, confidence, reasoning_trace` (select `*`), unused by the page. | cited | R (emit `business_owner`); D (drop `reasoning_trace`) |
| 4.8 | **Lead stage vocabulary (defect).** Board columns are `new, interested, quoted, negotiating, closed` (`Leads.tsx:14`); unknown stages show as `new` (`:108-111`). The pipeline writes funnel names `inquiry, qualification, test_drive, negotiation, booking, documentation, delivery` (`pipeline-service.ts:773-790`, stage map `:795-835`); `PATCH` writes board names; the cron nudge looks for `new, contacted` (`cron-service.ts:109`) and sets `followed_up`, so with the funnel names it appears to match only cards an owner dragged to `new`. Score values `high, medium, low`; the chat list shows `score \|\| 'new'`. Analytics `leadsByStage` returns raw DB values. | cited | D |
| 4.9 | **Owner overview and analytics numbers.** `connected_devices` and `active_businesses` come from `wb_sessions`, which nothing writes, so they are always 0 (`owner-routes.ts:78,105-113`). `businesses_added_today` uses the server time zone (`:119-125`). Analytics `aiMessagesCount` counts every tenant's AI messages (`health-routes.ts:31`) and the API omits `totalMessages`, which the page reads (`Analytics.tsx:58`). | cited | R (keys), D (values) |
| 4.10 | **Ordering and limits (no pagination except catalog).** Conversations 50 by `last_message_at` desc; leads 100 by `updated_at` desc; tasks 200 by `created_at` desc; customers 200 by `last_activity_at` desc; visits 200 by `visited_at` desc; calls default 50 max 200; knowledge unlimited by `created_at` desc; catalog `page, limit<=100, totalPages=ceil(total/limit)` (`catalog-routes.ts:28-34`). Embedded relations: conversations carry `wb_leads` as an **array** (`Conversations.tsx:428` uses `[0]`); leads carry `wb_conversations` as an **object** (`Leads.tsx:174`). Dates are ISO strings; `due_date` is `YYYY-MM-DD`. | cited | R |
| 4.11 | **Appointments live in tasks.** The Appointments page and Dashboard detect bookings by title regex and the `📅` emoji, and by `due_date` (`Appointments.tsx:45-56`, `Dashboard.tsx:67-75`); `appointment-service.ts:308` and `Appointments.tsx:127` both write `📅 Appointment: {name} — {service} at hh:mm AM/PM`; voice bookings use `📅 Voice Booking:`. Manual task create sends `appointment_time` as ISO or null. | cited | R (already in `docs/02-architecture.md` s9) |
| 4.12 | **Customer phone matching.** WhatsApp path stores the raw `from` digits (country code, no `+`) as `primary_phone` (`pipeline-service.ts:1284-1311`); `CustomerDetail` saves digits only (`:206`); walk-in create and `POST /customers` match by exact string (`visit-routes.ts:70`, `customer-routes.ts:107`) and the table is unique on `(user_id, primary_phone)` (`007-customers-and-visits.sql`), so `+91 98...` and `9198...` become two customers or a 500. `source` query param maps to `first_seen_via`; `hotness` and `status` filters exist but the page does not send them. Visit create side effects: hotness from outcome (`interested, purchased` hot; `will_decide, follow_up` warm; `not_interested` cold), tags are the union of `items_shown`, name backfill, `last_activity_at` (`visit-routes.ts:120-141`). | cited | D (one phone normaliser) |
| 4.13 | **User profile lifecycle.** `GET /users/:id` creates the row on first read and returns the full row (`working_hours, slot_duration_minutes, inventory_schema, ai_confidence_threshold, followup_timer_hours, business_address, google_maps_link` included). The Dashboard redirects to `/onboarding` when `business_name` is empty (`Dashboard.tsx:51-54`). `PATCH` is an upsert and silently drops unknown keys, no 400. `industry` is free text that selects the vertical by alias (`used cars, car dealer, ...`), unknown becomes `generic`. If the pipeline sees an unknown tenant it creates a demo row (`pipeline-service.ts:63-72`). | cited | R |
| 4.14 | **Sessions contract the frontend really reads (doc correction).** `Dashboard.tsx:320-347` reads `session.userId`, `session.phone`, `session.connectedAt`, `session.status` and calls `DELETE /sessions/${session.userId}`; `QRScanner.tsx:32-60` reads `status, phone, qrDataUrl, message`. `docs/02-architecture.md` s11 and PRD s5 list `{id, status, phone}`; with no `userId` the disconnect button would call `/sessions/undefined`. Add `userId` and `connectedAt` (additive). | cited | R |

## 5. Dead or parked code

| Item | Evidence | Verdict |
|---|---|---|
| `dispatchToPipeline` and `USE_AGENT_GRAPH` | Defined at `webhook-routes.ts:14,22`; no call sites. The four message branches call `pipelineService.processIncomingMessage` directly (`:225,257,331,371,380`). `runAgentGraph` is only referenced from that function. | Dead: the legacy agent graph is unreachable (matches F2 in `03-flows.md`). Details in Inventory B |
| `utils/rate-limiter.ts`, `utils/inbound-rate-limiter.ts` | `grep` finds no importers outside `utils/`. The `setInterval` cleanup in the inbound limiter never starts because the module is never loaded. | Dead. Behaviour to port is the intent only: 5 messages per 30 s per contact, 1 send per 3 s per session |
| Vapi voice calls | Five routes `vapi-routes.ts:21-356`, `voice-service.ts` (607 lines), `VAPI_*` env. Frontend page `/voice-calls` exists (`App.tsx:81`) but no nav link points to it (grep of `voice-calls` finds only `App.tsx`). Tables `wb_calls` and `wb_call_actions` have no DDL in `backend/database/migrations` (H-10). Webhook secret placeholder at `voice-service.ts:459`. | Parked by owner decision. Keep as typed stubs (E3.9); do not port |
| Outbound dialer | `vapi-routes.ts:192-356`, caller `VoiceCalls.tsx:121`. Not public, so any signed-in user can dial. No number validation, caps or consent (C-01). | Parked and unsafe. Stub returns 403/501 |
| `/sessions` (frontend only) | Zero backend routes; only reader of `wb_sessions` is `owner-routes.ts:78` and nothing writes it; migration `009-waba-accounts.sql:4` says it replaced Baileys sessions. | Missing backend (H-37). Facade per ADR 0001 |
| Baileys remnants | `package.json` dependency `@whiskeysockets/baileys`; `docker-compose.yml:13,22` volume `baileys_sessions`; alias `baileysAdapter` in `reminder-service.ts:1`, `voice-service.ts:5`. No Baileys import in `src/`. | Dead (L-18, M-22) |
| TTS voice replies and WhatsApp audio transcription | Live code on the inbound audio branch (`webhook-routes.ts:305-350`); text-only pilot (D10) keeps voice off. | Parked for v1 pilot; `execSync` ffmpeg (H-18) must not be ported as is |
| `generateFollowUp` (`ai-router.ts:283`) | No callers; cron nudge is a hardcoded English string (`cron-service.ts:118`). | Dead (L-07). Inventory B |
| Routes with no frontend caller | `GET /conversations/:id`, `GET /catalog/:id`, `POST /catalog/batch`, `GET /files`, `DELETE /files/:fileId`, `POST /customers`, `GET /visits`, `PATCH /visits/:id`, `DELETE /visits/:id`, `GET /vapi/calls/:id`. Plus machine hooks: `GET /health`, both `/webhook/whatsapp`, `/vapi/webhook`. | Not required by the fixed contract. Port only if the owner wants them (see Needs owner decision) |

## Needs owner decision

| # | Question | Default if no answer |
|---|---|---|
| 1 | Lead stages (4.8): which vocabulary does the API return and accept? The board expects `new, interested, quoted, negotiating, closed`. | Backend maps funnel names to the board names on read and stores board names; cron/follow-up uses board names |
| 2 | Message list (4.4): return the newest N messages in ascending order instead of the oldest N? This changes behaviour for chats over 100 messages but needs no frontend change. | Yes, newest 500 ascending |
| 3 | Catalog "Sold" list and stats (4.5): keep deleted items counted as sold, or hide them? | Hide deleted items everywhere |
| 4 | Sheets sync (4.6): which side wins on conflict, and should quantity 0 survive import? | DB wins for quantity and price; per-tenant sheet; keep import for new rows only |
| 5 | Phone normaliser (4.12): one canonical form (digits with country code) used by WhatsApp, walk-in and customer edits? | Yes, E.164 digits without `+`, merge on write |
| 6 | `/sessions` shape (4.14): approve adding `userId` and `connectedAt` beside `id`? Additive, no frontend edit. | Yes |
| 7 | Routes with no frontend caller (section 5): drop, or keep for API parity? | Drop `POST /customers` and `/files` list and delete, keep the rest as thin routes |
| 8 | `GET /knowledge` and message rows include `embedding` and `reasoning_trace` today: remove them (the page never reads them)? | Remove |
| 9 | `.xls` upload: accept (needs a different parser) or reject with a clear 400? | Reject with 400 `Only .xlsx and .csv`; verify ExcelJS behaviour first |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Contract tests built from the PRD list miss shapes recorded here (embedded relation arrays, bare knowledge array, 201 vs 200, `userId` in sessions) | Screens break silently | Generate tests from section 1 and 4 at E1.11; assert `Array.isArray` for knowledge and `wb_leads[0]` for conversations |
| Fixing 4.4, 4.5 or 4.8 changes visible behaviour | A pilot user sees different counts or ordering | Decide first (table above); record each as an ADR line; test with fixtures |
| Legacy file reads were static; `ai_paused`, `wb_calls`, `wb_call_actions` have no DDL in the repo | Column types and defaults unverified | Treat as unknown; verify against the live schema when the DB work resumes |
| Pipeline (1328 lines) and `ai-router.ts` were read only for DB writes and frontend-visible fields | Hidden side effects in AI paths (Inventory B) | Cross-check section 2 pipeline row against Inventory B before writing the agent plan |
| Error text and 404 wording are matched by nothing in the frontend, but `error` is shown to users | Cosmetic drift | Keep the key; keep wording where cheap |
| PostgREST row cap and CORS origin behaviour are assumptions | Wrong sizing of stats and export; surprise 500 | Mark as verify; not needed in v2 if stats use SQL counts and CORS is same-origin |
