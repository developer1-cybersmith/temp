---
name: chatsyncs-api
description: Integrate the ChatSyncs Developer API (WhatsApp messaging) into Vyavsay Assist instead of calling Meta's WhatsApp Cloud API directly. Use whenever the user mentions ChatSyncs, WhatsApp sending, templates, 24-hour window, wa_message_id, phone_number_id, apiToken, WhatsApp provider adapter, or replacing the Meta API integration, even if they don't name ChatSyncs explicitly.
---

# ChatSyncs API Integration (Vyavsay Assist)

Guide for building and maintaining the ChatSyncs integration. Stack: Node.js, Fastify, PostgreSQL, multi-tenant. ChatSyncs has no SDK and no MCP, so we write a small typed client ourselves.

**Rule 0:** Only use endpoints and fields listed here. If something is not listed, it is undocumented. Do not guess; add it to "Open questions" and ask the user.

---

## 1. Basics

- Base URL: `https://platform.chatsyncs.com/api/v1`
- API key: ChatSyncs Developer Console → "Your API key". Treat like a password.
- Auth: `apiToken` param (query on GET, form field on POST) **or** `Authorization: Bearer <key>`. Prefer the Bearer header so the key never lands in URLs or logs.
- Every endpoint accepts GET and POST with the same params, except **Upload Media (POST only, multipart)**. Always use POST for anything that changes data.
- POST bodies are `application/x-www-form-urlencoded` (not JSON).
- Phone numbers: country code first, digits only, no `+` (e.g. `919876543210`).
- Nearly every endpoint needs `phone_number_id` (which connected WhatsApp number acts).

## 2. Response handling (critical)

All responses are JSON with `status`.

- `"1"` (or `true` on a few endpoints) = success. `"0"` (or `false`) = failure, reason in `message`.
- **Failures usually return HTTP 200.** Never trust the HTTP code. Always check `status`.
- Wrong key: HTTP 401 `{"status":"0","message":"Unauthenticated."}`.
- **Missing key: HTTP 302 redirect to an HTML login page.** If you get HTML back, the key is missing. Disable auto-redirect in the HTTP client and treat any 3xx or non-JSON as an auth error.
- Lists come back in `message` as an array (no `data` field, except Custom Fields List).
- Normalize `status` with: `status === "1" || status === 1 || status === true`.
- "Not found" is sometimes `status:"1"` with a string message (Subscriber Get, Delete Subscriber, Catalog Sync). Check that `message` is an array before reading rows.
- These do **not** validate ids and report success anyway: Trigger Bot Flow (unknown flow), Assign Sequences (unknown sequence), Assign Custom Fields (unknown field). Fetch ids from the list endpoints first.

## 3. Endpoint cheat sheet

| Purpose | Method + path | Required params | Notes |
|---|---|---|---|
| Account info | GET `/user/myInfo` | apiToken | Returns `user_id`, plan, `bot_subscriber_data` (limit/count), `message_credit_data`, `whatsapp_bots_details` (each with `phone_number_id`, `whatsapp_business_account_id`) |
| Connect WABA | POST `/whatsapp/account/connect` | apiToken, user_id, whatsapp_business_account_id, access_token | Use a **permanent** Meta system-user token (temporary expires in about 1 hour) |
| Send text | POST `/whatsapp/send` | apiToken, phone_number_id, phone_number, message | Session message, 24h window only |
| Send template | POST `/whatsapp/send/template` | apiToken, phone_number_id, template_id, phone_number | Works outside 24h window. See section 4 |
| Send buttons | POST `/whatsapp/send/interactive-buttons` | apiToken, phone_number_id, phone_number, message, buttons | 1-3 buttons, title max 20 chars, 24h window only |
| Send media | POST `/whatsapp/send/file` | apiToken, phone_number_id, phone_number, plus media_url or media_id | `media_name` required for documents. 24h window |
| Upload media | POST `/whatsapp/upload/media` (multipart) | apiToken, phone_number_id, media_file | Field name must be exactly `media_file`. Returns `media_id`, `media_type`, `media_name` |
| Conversation | GET `/whatsapp/get/conversation` | apiToken, phone_number_id, phone_number, limit | `offset` is a **page number** from 1, not rows to skip. Max limit 50. Page 1 = newest |
| Delivery status | GET `/whatsapp/get/message-status` | apiToken, wa_message_id | Only needs the wamid. Status: sent / delivered / read / failed |
| List templates | GET `/whatsapp/template/list` | apiToken, phone_number_id | Contains secrets in `template_json`. Never log |
| List flows | GET `/whatsapp/get/bot-flow-list` | apiToken, phone_number_id | `unique_id` is what Trigger Bot Flow needs |
| Trigger flow | POST `/whatsapp/trigger-bot` | apiToken, phone_number_id, bot_flow_unique_id, phone_number | Unknown flow id still returns success |
| Postbacks | GET `/whatsapp/get/post-back-list` | apiToken, phone_number_id | Rows are long, mostly internal fields |

Other endpoints exist (labels, sequences, team members, catalog, custom fields, subscribers) but were **not** in the docs provided. Do not implement from memory.

## 4. Sending rules

**24-hour window**
- Text, buttons, and media only work if the customer messaged within the last 24 hours.
- Outside it, the API returns `status:"0"` with "Sending message outside 24 hour window is not allowed...". Fall back to a template.
- Our adapter should track `last_inbound_at` per contact and pick session vs template before calling, and also handle this error as a fallback.

**Templates**
- `template_id` must be the short ChatSyncs **`id`** from the template list, **not** Meta's long `template_id` (that gives "Message template not found").
- Variables are sent as `templateVariable-<name>-<position>` (e.g. `templateVariable-productlist-1`). Contact first name auto-fills.
- **A variable left out is delivered as `-`.** Always send a value for every variable.
- Cannot be sent via API: carousel templates, templates with image/video/document header, templates with unmapped variables (`Not Mapped`). Send those from the ChatSyncs dashboard.
- Easiest way to learn a template's exact fields: Developer Console → Send Text Message → "Generate API End-point: Send Template Message".

**Success is not delivery**
- `status:"1"` means ChatSyncs accepted the message. Later failures appear as `message_status: failed` with `failed_reason` in message-status or conversation. Store `wa_message_id` and reconcile.

## 5. Client wrapper spec (build this first)

Create `src/integrations/chatsyncs/` with:

```
client.ts        // low-level HTTP, auth, status normalization, error mapping
types.ts         // request/response types
errors.ts        // ChatSyncsError classes
provider.ts      // WhatsAppProvider implementation (see section 6)
webhook.ts       // inbound handler (BLOCKED until webhook docs are confirmed)
__tests__/       // unit tests with mocked fetch
```

**client.ts requirements**
- Constructor takes `{ apiToken, baseUrl?, timeoutMs = 10000 }`. One client instance per tenant.
- Use built-in `fetch` with `redirect: "manual"`. 3xx or non-JSON body → throw `ChatSyncsAuthError`.
- Send token via `Authorization: Bearer`.
- POST with `URLSearchParams`.
- After parsing JSON, normalize `status`. If failed, throw `ChatSyncsApiError` with `message` and the endpoint.
- Map known messages to typed errors: outside 24h window → `OutsideWindowError`; "Message template not found." → `TemplateNotFoundError`; "Subscriber limit has been exceeded..." → `SubscriberLimitError`; 401/Unauthenticated → `ChatSyncsAuthError`.
- **Retries:** retry only GETs and network timeouts on safe calls, with backoff. **Do not auto-retry sends**: no idempotency key is documented, so a retry can double-send. On send timeout, check delivery by listing the conversation before resending.
- **Never log** the apiToken, full request URLs with tokens, or `template_json`. Redact in logger config.
- Methods: `getMyInfo`, `sendText`, `sendTemplate`, `sendButtons`, `sendFile`, `uploadMedia`, `getMessageStatus`, `getConversation`, `listTemplates`, `listBotFlows`, `triggerBotFlow`.

## 6. Architecture for Vyavsay

**Provider adapter.** Define a `WhatsAppProvider` interface (`sendText`, `sendTemplate`, `sendButtons`, `sendMedia`, `getStatus`, and an inbound normalizer). Implement `MetaProvider` (existing) and `ChatSyncsProvider`. Business logic and LangGraph flows only talk to the interface. This lets us switch back or run both during migration.

**Multi-tenancy (per tenant DB columns)**
- `chatsyncs_api_token` (encrypted at rest, never returned by any API)
- `chatsyncs_phone_number_id`
- `whatsapp_provider` enum (`meta` | `chatsyncs`) for per-tenant cutover
- `chatsyncs_user_id` (needed for Account Connect)

Token model is unresolved (see Open questions). Until confirmed, assume **one ChatSyncs API key per tenant**.

**Message log table.** Store `wa_message_id`, tenant, contact, direction, type, status, `failed_reason`, timestamps. Update status by polling `get/message-status` (or webhook if available).

**Rate and plan limits.** Read `bot_subscriber_data` and `message_credit_data` from `getMyInfo` and surface warnings, because sends fail once the subscriber limit is exceeded.

**Inbound.** The AI copilot needs incoming customer messages. No inbound webhook is documented. Two possible fallbacks, both worse than a real webhook: polling `get/conversation` per contact, or an Outbound Action in ChatSyncs. Do not build either until the user confirms with ChatSyncs.

## 7. Migration plan

1. Confirm open questions below with ChatSyncs in writing.
2. Build the client + tests against one sandbox/test number.
3. Implement `ChatSyncsProvider` behind the interface.
4. Pilot with one tenant (e.g. internal test tenant first, then Girija Motors) using the `whatsapp_provider` flag.
5. Compare delivery, latency, and failure rates against Meta for a week.
6. Roll out per tenant. Keep `MetaProvider` available for rollback.

## 8. Open questions (ask ChatSyncs, do not assume)

1. **Inbound webhook:** URL config, payload shape, signature verification, retries?
2. **Multi-tenant model:** one account per client, or many numbers under one account? Can we create client accounts via API (Direct Login URL / package_id exist in the docs, details not provided)?
3. **Coexistence** (WhatsApp Business app + API on the same number): supported?
4. **Rate limits** per key and per number.
5. **Pricing:** per message, per subscriber, platform fee, and how Meta conversation charges pass through.
6. **Subscriber cap:** is it per account, and what happens at the limit?
7. **Idempotency:** any way to avoid duplicate sends on retry?
8. **Template creation/approval via API:** not documented, only listing is.
9. **SLA/uptime and data location** (messages are stored on ChatSyncs; check DPDP/privacy implications for client data).
10. **Voice calling agent:** does it need anything WhatsApp-call related that this API doesn't cover?

## 9. Working style for Claude Code

- Before writing code that calls ChatSyncs, re-read sections 2-4.
- Write the unit test first for each client method, mocking responses from the examples in the docs (success, `status:"0"`, 401, 302 HTML).
- When a response shape isn't covered here, log the raw response in dev (token redacted), and update this file with what was learned.
- Update "Open questions" instead of making assumptions.
