# 02 Architecture (As Is)

## Summary
- Vyavsay Assist is a multi-tenant WhatsApp AI sales copilot. Backend is Fastify + TypeScript. Database and auth are Supabase.
- WhatsApp runs on the Meta Cloud API only. Baileys is gone from code, but still in many docs and in package.json.
- AI is Groq (text, Whisper), Gemini (vision), Jina (embeddings). The legacy pipeline is the live path.
- The LangGraph agent path is dead code. The `USE_AGENT_GRAPH` flag does nothing, and the agent client still points at a retired provider.
- Biggest gaps: no RLS, no signup path for WhatsApp, no `/sessions` routes the frontend needs, in-memory reminders, schema drift (missing migrations).

Source: code and docs read only. Nothing was run. Secrets shown as [REDACTED].

## Runtime shape

| Part | What it is |
|---|---|
| Frontend | React/Vite SPA, reused as-is. nginx proxies `/api/` to backend:3005 (20M body limit) |
| Backend | One Fastify process (Node, ESM). Docker, deployed manually with `--build` |
| Database | Supabase Postgres + pgvector (1536-dim). Service-role key used everywhere |
| Auth | Supabase Auth in the browser. Backend verifies the Bearer JWT |
| Storage | Supabase Storage (catalog images, incoming WhatsApp media) |
| Scheduler | node-cron inside the same process |
| Hosting | One AWS EC2 box (instance count unverified) |

## Modules (backend/src)

| Module | Job |
|---|---|
| `server.ts` | Boot, registers plugins and routes, starts cron |
| `plugins/auth-plugin` | Global JWT check. Public: `/api/health`, `/api/vapi/webhook`, `/api/webhook/whatsapp` |
| `routes/webhook-routes` | Meta webhook, HMAC check, tenant lookup, dedup, media handling |
| `services/pipeline-service` | Core brain (1328 lines). Analyze, retrieve, reply, leads, tasks |
| `services/ai-router` + `domains/*` | LLM calls and per-industry prompts (generic, used-cars) |
| `services/catalog-service`, `rag-service` | Inventory search, knowledge chunks, Jina embeddings |
| `services/whatsapp-cloud-client` | Graph API v21 send (text, image, voice) |
| `services/voice-*`, `tts-service` | Whisper, TTS, Vapi calls, ffmpeg |
| `services/cron-service`, `reminder-service` | Reports, nudges, sheets sync, reminders |
| `services/appointment-service` | Slot check and booking (IST) |
| `routes/*` | conversations, leads, tasks, customers, visits, catalog, files, knowledge, sheets, vapi, voice, users, owner, health |
| `agent/*` | LangGraph path (5 nodes). Not reachable |
| `database/migrations` | SQL files 001-004, 006-011. No 005. Run by hand |

## Text diagram

```
Customer (WhatsApp)
   |
   v
Meta Cloud API --POST--> /api/webhook/whatsapp
                            | HMAC check, 200 at once
                            v
                    resolve tenant (wb_waba_accounts,
                    else OLDEST wb_users row)
                            | dedup (wb_webhook_events)
                            v
          text / audio / image / button
          audio -> Storage + Groq Whisper
                            v
                  pipeline-service
        analyze (Groq) -> lead/tasks -> inventory or knowledge
        -> generate reply -> send via cloud client
           |                |                 |
           v                v                 v
       Supabase DB      Jina / Gemini      Meta Graph API
                                           (reply, voice, image)

Owner browser -> Supabase Auth (JWT) -> nginx /api -> Fastify -> Supabase
Vapi -> /api/vapi/webhook -> voice-service -> wb_calls
node-cron -> reports, nudges, sheets sync -> Meta send
```

## Data flow in short
1. Inbound: Meta to webhook to pipeline to DB to Meta reply.
2. Owner: browser to JWT to route to Supabase, filtered by `user_id` in code.
3. Knowledge: pasted text, chunked (200 words), embedded, stored. Catalog: Excel/CSV or manual, embedded, stored.
4. Answer: retrieved rows become text blocks in the prompt. No citations.

## Data model (summary)
- Core tables: wb_users, wb_conversations, wb_messages, wb_leads, wb_tasks, wb_catalog_items, wb_knowledge_base, wb_source_files, wb_waba_accounts, wb_webhook_events, customers, customer_visits.
- Legacy: wb_sessions (still read by owner dashboard).
- In code, not in migrations: wb_calls, wb_call_actions, `wb_conversations.ai_paused`, storage buckets. Prod schema is the real truth.
- Appointments are `wb_tasks` rows with `appointment_time`.

## Doc vs code

| Docs say | Code is |
|---|---|
| Baileys, QR, sessions | Cloud API only. Code still aliases `cloudClient` as `baileysAdapter` |
| GPT-4o via GitHub Models | Groq + Gemini + Jina (agent client still on retired GitHub endpoint) |
| Abuse limiters done | Limiter files exist but are not imported |
| 13 tables, 005 voice migration | No 005 file |
| Lead stages: 3 vocabularies | Backend accepts any string |
| Agent flag switches traffic | Flag has no call site |

## As-is problems (facts)

| # | Problem | Where |
|---|---|---|
| 1 | No RLS anywhere. Isolation is app code only | migrations |
| 2 | `/api/analytics` counts messages across all tenants | health-routes.ts:26-31 |
| 3 | Webhook fallback sends unknown numbers to oldest user | webhook-routes.ts:170-177 |
| 4 | Vapi webhook open if secret unset. Placeholder secret in code. First-user fallback for tenant | vapi-routes.ts:11, voice-service.ts:459-490 |
| 5 | WABA token stored plaintext | migration 009 |
| 6 | No `/sessions` routes, frontend calls them | server.ts |
| 7 | No endpoint or Embedded Signup to add a WABA | whole backend |
| 8 | Reminders in memory, lost on restart. Cron has no lock for multi-instance | reminder-service, cron-service |
| 9 | 24h WhatsApp window and templates not handled (nudges, reports, reminders) | cron-service, client |
| 10 | Sheets sync is one global sheet for all tenants. Sheet imports get no embedding | sheets-sync-service |
| 11 | Daily report goes to the business's own number | cron-service.ts:87-96 |
| 12 | No plan, quota, or billing enforcement. Shared AI keys | whole backend |
| 13 | Silent AI failure falls back to canned text. No alerting | history (about 1 week outage) |
| 14 | Exposed test password in README:7 [REDACTED]. Meta/AWS ids in handoff doc | README, PROJECT_HANDOFF |
| 15 | PII (phone, transcripts) in logs | vapi-routes.ts |

## Not verified
- Live DB schema and RLS, instance count, Supabase email-confirm setting.
- Files only grep-checked: pipeline-service, catalog-service, voice-service, agent/*.
