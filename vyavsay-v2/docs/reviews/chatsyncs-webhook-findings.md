# ChatSyncs webhook and API docs: findings

All facts below are "from docs, unverified in practice". Source: docs.chatsyncs.com (read 2026-10-07 via page summaries, not raw text, so "not documented" means "not seen in the summary").

## Summary
- All 40 pages tried were reachable. No inbound webhook auth, signature, retry or timeout is documented anywhere.
- The inbound webhook is documented for text only (`user_message`). Voice, image and media shapes are not documented.
- A REST send API exists (text, template, file, interactive buttons, media upload, status lookup, conversation history). It is not only the Webhook Workflow (that is a trigger-to-send feature and not our send path). A8 is mostly answered.
- IDs: `wa_message_id` is a Meta `wamid` in every example. No client id or idempotency key anywhere. Status is looked up by `wa_message_id`.
- Biggest risks: unauthenticated webhook, unknown retries, unknown voice payload, no list-conversations endpoint (F2 weak), errors returned as HTTP 200 with `status:"0"`.

## 1. Pages read (all reachable)

| Group | Pages |
|---|---|
| Webhooks | webhooks/introduction; webhook-for-messages-status-changes; webhook-on-keyword-trigger; webhook-on-button-click; webhook-for-input-flow; webhook-for-whatsapp-flows; bot-settings/turn-on-webhook-triggers |
| Webhook Workflow | introduction; create; automation-settings; reporting |
| Developer API | explained; introduction; finding-ids; send-text-message; send-template-message; send-interactive-buttons; send-file; upload-media; get-conversation; get-message-status; get-template-list; create-template; template-status; trigger-bot-flow; account-connect; user/direct-login-url; user/direct-login-url-new-users |
| Other learn pages | integrations/http-api-integration (no facts); automation/connect-a-bot-flow-to-external-systems; automation/audio-message; overview/who-charges-you; overview/what-whatsapp-api-pricing-really-means; overview/whatsapp-rules-how-to-never-get-banned; templates/introduction (no facts); understanding-conversations; understanding-quality-rating; creating-a-template; guidelines-utility-marketing; team-management/security-in-chatsyncs (no facts) |

Base URL for REST: `https://platform.chatsyncs.com/api/v1`.

## 2. Questions Q1 to Q11

| Q | Topic | Status | Facts (source) |
|---|---|---|---|
| Q1 | Webhook auth or signature | Still unknown | None on any webhook page. Workflow callback URL (`platform.chatsyncs.com/webhook/whatsapp-workflow/xxxxxxx`) is unique per workflow, the only secret-like element. REST API auth is separate: `apiToken` param or `Authorization: Bearer`, wrong key gives HTTP 401 `{"status":"0","message":"Unauthenticated."}`; send `Accept: application/json` or you get a redirect (developer-api/introduction, create-template) |
| Q2 | Retries, timeout, expected response | Still unknown | Absent on all pages (webhooks/introduction, status-changes, bot-settings) |
| Q3 | Inbound payload shapes, media | Partly | Text only: `user_message`, `custom_fields`, `first_name`, `chat_id`, ids (webhook-for-messages-status-changes). Nothing for voice, image, document, location, button reply, reaction, media URL or expiry. `get-conversation` says stored `message_content` for received messages is "webhook format" and has `reaction_data` and `sender` of user/bot/ai_agent/sequence/system, so a media shape exists but is not shown. Outbound audio: AAC/MP3/AMR/OGG up to 16 MB (audio-message, send-file). Outgoing-message webhook has no text |
| Q4 | Delivery status | Answered (webhook and lookup); error codes open | Status webhook: `webhook_type=message_status_change`, `message_status` sent/delivered/read/failed, `status_time` ("YYYY-MM-DD HH:MM:SS", no timezone stated), `failed_reason` (null example). Lookup: `GET /whatsapp/get/message-status` by `wa_message_id`, returns status, times, `failed_reason`. Error codes: only 131049 mentioned (guidelines page). No ordering guarantee documented |
| Q5 | Message ids, idempotency | Partly | `wa_message_id` is a Meta wamid in all examples (inbound, outbound, status, send responses). Empty in conversation-status events. Own ids: `subscriber_id` = `<phone>-<bot_id>`, `chat_id` = phone digits without plus, `whatsapp_bot_id` int. Conversation history also has integer `id`. No client id or idempotency key on any send page |
| Q6 | Multi-tenant model | Partly | Bot-centric: every payload has `whatsapp_bot_id/name/username` (username = display phone). Webhook URLs set per bot in Bot Settings > Webhook (4 triggers, one URL each, "Publish Changes"). REST scopes by `phone_number_id` plus one account `apiToken`. `account-connect` takes ChatSyncs `user_id`, WABA id and a permanent system-user token. `direct-login-url` endpoints create customer accounts with `package_id` and `expired_date` (reseller style). Whether keys are per tenant is not stated |
| Q7 | Send API, 24h window | Answered (shape); idempotency and rate limits open | `POST /whatsapp/send` (apiToken, phone_number_id, phone_number, message); `/whatsapp/send/template`; `/whatsapp/send/file`; `/whatsapp/send/interactive-buttons` (1 to 3 buttons, no audio header); `/whatsapp/upload/media` returns reusable `media_id`; `/whatsapp/trigger-bot`. Success `{"status":"1","wa_message_id":...}`. Outside window: `{"status":"0","message":"Sending message outside 24 hour window is not allowed. You can only send template message to this user."}` (HTTP 200). A success means accepted only. Webhook Workflow is the reverse direction (external POST triggers an approved template send, phone number mapping required) and is not our general send path |
| Q8 | Templates | Answered | Send by ChatSyncs short `id`; vars `templateVariable-<name>-<position>`; omitted vars become "-"; quick-reply postbacks via `template_quick_reply_button_values`. Not sendable: carousel, media-header without attachment. List: `GET /whatsapp/get/template/list` (`status`, `template_json`, `variable_map`; response contains a token, treat as secret). Create: `POST /whatsapp/template/create` (starts Submitted). Status: `/whatsapp/template/status` live from Meta (PENDING, APPROVED, REJECTED, PAUSED, DISABLED, FLAGGED, IN_APPEAL, PENDING_DELETION, DELETED; needs Meta long id). Approved can show "Not Mapped" in ChatSyncs if variables unset |
| Q9 | Owner own-number or coexistence messages | Still unknown | Outgoing-message webhook fires on "the bot sends a reply"; nothing about messages typed on the owner's phone. `get-conversation` has no owner-phone sender type. Page `connect-your-whatsapp-business-app-to-chatsyncs` not read |
| Q10 | Pricing, rate limits | Partly | Meta bills usage to the customer's portfolio; ChatSyncs charges a flat subscription (who-charges-you). India marketing Rs 0.85 pass-through. Service replies free in window. Suggested pace (guidance only): service replies under about 30/min, utility under 200/hour. No API or webhook rate limit, plan prices or media size limits documented |
| Q11 | Handover, opt-out, other | Partly | Conversation-status webhook: `event` conversation.resolved etc., `action` resolved/reopen/archived/unarchived/blocked/unblocked, `action_status` "1", `agent_name`, `changed_at`. `mark-conversation-status` and `assign-chat-to-team-member` APIs exist (not read). Opt-out: docs advise a `Do Not Contact` label on STOP, no automatic handling or event. Only WhatsApp Flow webhooks take multiple URLs; others need Zapier or Make to fan out. Errors are HTTP 200 with `status:"0"` (except 401), so adapters must check the body |

## 3. Impact on the adapter and inbound flow

Compared with `docs/02-architecture.md` s4 (A1 to A10) and `docs/06-provider-portability.md`.

| Item | Verdict | Note |
|---|---|---|
| A1 URL we set; per bot or number | Confirmed (mostly) | Per-bot URL in Bot Settings, one URL per trigger. Who sets it: the account holder in the dashboard. No API to set it seen, so onboarding is manual (team enters our URL) |
| A2 id, sender, number, type, text/media, timestamp | Partly | Text: id, sender (`chat_id`, `subscriber_id`), number (`whatsapp_bot_id`, `whatsapp_bot_username`) present. No event timestamp and no type field on inbound text (status and conversation events have times). Media unknown. Window rule "event_ts clamped to received_at" needs a fallback to `received_at` for inbound |
| A3 shared secret or HMAC | Open, leaning contradicted | Nothing documented. Fall back already planned: secret in URL path (`endpoint_keys`) plus IP allow-list if ChatSyncs publishes IPs. `verify_inbound` must accept "path key only" |
| A4 non-2xx retried | Open | F2 safety net remains needed until answered. F2 is weaker than assumed: `get-conversation` needs `phone_number` per contact (no list-conversations endpoint seen), so it cannot find new contacts |
| A5 media downloadable | Open | No inbound media docs. Keep `media_download` and `voice_notes` flags off by default and the text-only pilot fallback (FR-5) |
| A6 delivery status | Confirmed | Webhook and `get-message-status` lookup by `wa_message_id`; `status_lookup` and `delivery_webhooks` capabilities both true. `status_time` has no timezone, treat as IST only after verification |
| A7 multi-tenant model | Partly | One bot per number, per-number webhook URL, `phone_number_id` plus one account key. `whatsapp_numbers` per-row key ref works for both cases. `provider_config` must carry `phone_number_id` and `apiToken` |
| A8 send API | Mostly confirmed | REST send API exists (SKILL.md path appears current; confirm with live key). Capabilities: `send_template` yes, `list_templates` yes, `status_lookup` yes, `idempotent_send` no, `correlation_echo` no. Per 06 rules: lookup before any retry, never resend on `unknown_send` |
| A9 pricing, limits | Open | No limits documented |
| A10 onboarding, one Full-access partner | Open | Coexistence page not read |
| id_space | Likely `wamid` | Examples are wamid format. Cross-provider dedup with a Meta adapter then works; confirm with a real payload |
| Error mapping | New work | HTTP 200 plus `status:"0"` plus free-text message. `window_closed` must be matched by message text (fragile), unmapped goes to `unknown_send` or `permanent/other`. Send success is only "accepted" |
| `recipient_blocked` to opt-out | Partly | Failed status `failed_reason` is free text and the conversation `blocked` event exists; neither is confirmed as a block signal. Keep STOP handling in our core, not in a ChatSyncs label |
| Phone normalisation | Confirmed need | `chat_id` is digits without plus; send needs country code plus digits only |
| Webhook Workflow | Not used | Our send path is REST, so the Workflow feature is out of scope |

## 4. Questions to send to ChatSyncs support
1. Is there any way to authenticate inbound webhooks (secret header, HMAC, static token, fixed source IPs)?
2. Retry policy for non-2xx or timeout: how many, how long, what timeout, what response do you expect?
3. Sample payloads for inbound voice note, image, document, location, button reply and reaction. How do we download media, with what auth, and when does it expire?
4. Does the inbound payload carry an event timestamp and a message type field?
5. Is `wa_message_id` always the Meta wamid, for inbound and outbound?
6. Is there an idempotency key or client reference on the send endpoints? Can status webhooks echo one?
7. Do messages sent from the owner's phone (coexistence) fire the Outgoing Message webhook? With what flag or sender?
8. Can webhook URLs be set by API per bot? Do reseller accounts get an API key per tenant, and how do partner accounts work?
9. Are webhook events ordered? What are the `failed_reason` values and error codes? Is `status_time` IST or UTC?
10. API and webhook rate limits, media size limits, plan limits for 5 tenants and 20 inbound per minute?
11. Is there a list-conversations or list-subscribers endpoint to reconcile missed inbound messages?
12. Which signal means the customer blocked or opted out (a status failure, the `blocked` conversation event)?
13. Is there a stable machine-readable error code for "outside 24 hour window" instead of message text?

## 5. Relevant pages not read
| Page | Why |
|---|---|
| docs.chatsyncs.com/llms.txt, developer-api/openapi.json | Full index and machine-readable schema; may answer Q3, Q5, Q7 |
| learn/chatsyncs-overview/connect-your-whatsapp-business-app-to-chatsyncs | Coexistence, Q9, A10 |
| learn/chatsyncs-overview/what-is-a-bsp-and-can-you-move-to-chatsyncs-from-one | Partner handover, A10 |
| developer-api/subscriber/mark-conversation-status, assign-chat-to-team-member | Handover signals, Q11 |
| developer-api/user/get-my-info, list-team-members | Tenancy, Q6 |
| meta-api/messaging/24-hour-customer-service-window, meta-api/messaging/audio-messages | Window and voice details |
| meta-api/concepts/messaging-limits-and-quality-rating, conversation-categories-and-pricing | Q10 |
| learn/chatsyncs-setup-and-configuration/add-payment-method-for-whatsapp-api-billing | Billing setup |
| mcp/tools | Possible additional tools (for example get_template_status) |
| developer-api/whatsapp/get-postback-list | Quick-reply template buttons |
| learn/chatsyncs-message-templates/why-templates-get-rejected, create-templates-in-whatsapp-manager-and-sync | Template onboarding |
| learn/chatsyncs-bot-settings/introduction; learn/chatsyncs-automation/user-input-flow, whatsapp-flows | Low priority context |

## Round 2 (2026-10-07)

All facts "from docs, unverified in practice". Sources were summaries of fetched pages, so "not stated" means "not seen". Guessed page `/bot-settings/webhook-triggers` returned 404 (not a real page).

### Pages read
- `llms.txt` (index only) and `developer-api/openapi.json` (about 240k chars, read in three chunks, lossy).
- Developer API: mark-conversation-status, assign-chat-to-team-member, list-subscribers, get-my-info, list-team-members, list-team-roles, get-postback-list. MCP: api-key, tools, troubleshooting.
- Learn: connect-your-whatsapp-business-app (coexistence), what-is-a-bsp, which-connection-method, migrate-from-whatsapp-app, disconnect-another-partner, add-payment-method, templates (rejections, sync, restart-after-hours), webhook-workflow-reporting, roles and permissions, account-bans, AI agent actions.
- Pages with no extractable facts: transactions, reconnect, template-variables, team-overview, shared-inbox.
- Result: the OpenAPI spec has no webhook section at all. Inbound webhook facts still come only from round 1.

### Answered or changed
| Q | Round 2 result |
|---|---|
| Q7 send API | Answered. `POST /whatsapp/send/template` exists (needs `template_id`, `phone_number_id`, `phone_number`, variables `templateVariable-{name}-{position}`). Round 1 doubts about a template send path are closed |
| Q5 idempotency | Confirmed absent: no client id or idempotency key on any send endpoint. Status lookup by `wa_message_id` only |
| Q13 window error code | Answered: no code. Only the fixed text "Sending message outside 24 hour window is not allowed. You can only send template message to this user." (HTTP 200, `status:"0"`). The adapter must match text |
| Q11 list endpoint | Answered: `GET /whatsapp/subscriber/list` (limit max 100, `offset` is a page number from 1, `orderBy=1` most recent message first, returns `last_message_time` (no timezone), `unseen_count`, `nextOffset`). F2 discovery is possible by polling. No created-date filter |
| Q6 tenancy | Partly more: one `apiToken` per ChatSyncs account, full access, no read-only key, rotation invalidates all copies. One account holds many numbers (`/user/myInfo` lists `phone_number_id`s). Team members belong to the account, not a number. Whether each business gets its own account is still a business choice for us, not documented |
| Q9 coexistence | Linking in coexistence drops throughput from 80 to 20 messages per second, copies 6 months of history, disables broadcast lists, disappearing and view-once messages. Whether owner-phone messages reach us (echo) is still not stated |
| Q10 limits | Partly: coexistence 20 mps; Tier 1 is 1,000 unique recipients per day (Meta). No API or webhook rate limit, no ChatSyncs plan prices. Plan usage visible through `/user/myInfo` (subscriber limit and count, credits used) |
| Errors | New: HTTP 401 only for a wrong key; missing key gives a 302 to the login page; failures are HTTP 200 with string `status:"0"`; some endpoints use boolean status; "Subscriber not found" can come back with status `"1"`; `message` holds data (a string or an array, `data` on custom fields) |
| Templates | `/whatsapp/template/status` returns live status and quality; `/get/template/list` is cached and lags. Templates made in WhatsApp Manager need a manual "Sync Templates" click (no sync API seen). Rejected templates cannot be edited, only duplicated under a new name. A new WABA can wait 24 h or more for first review. Only text templates (with or without variables) are safely sendable |
| Q11 handover hook | `POST /whatsapp/subscriber/chat/mark-conversation` (resolved, reopen, archived, ...) and assign-to-team-member exist. Optional later; our review queue stays provider-neutral |
| Q8 set webhook URL by API | Not in the OpenAPI spec, so assume the URL is set by hand in Bot Settings (onboarding task) |
| Q3 voice | Not answered. `get-conversation` rows may carry the media shape but it is not shown. Outbound audio is documented, inbound is not |

### Still unknown (no page answered these)
Webhook auth, retries and timeout, inbound voice and image payloads, event timestamp and type field on inbound text, owner-phone echo, event ordering, `failed_reason` values and block signal, API rate limits, whether `wa_message_id` is always the Meta wamid.

### Questions for ChatSyncs support (answered ones dropped)
1. Can inbound webhooks be authenticated (secret header, HMAC, static token, fixed source IPs)?
2. Retry policy for non-2xx or timeout (count, timing, timeout, expected response)?
3. Sample payloads for inbound voice note, image, document, location, button reply, reaction. How do we download media, with what auth, and when does it expire? Does `get-conversation` return the same media shape?
4. Does the inbound text payload carry an event timestamp and a type field?
5. Is `wa_message_id` always the Meta wamid, inbound and outbound?
6. Do messages typed on the owner's phone (coexistence) fire the Outgoing Message webhook? With what sender or flag?
7. Are webhook events ordered? What are the `failed_reason` values? Which signal means the customer blocked us? Is `status_time` IST or UTC (same for `last_message_time`)?
8. API and webhook rate limits, media size limits, plan limits for 5 tenants and 20 inbound per minute?
9. Can the webhook URL be set by API per number? Can a reseller account hold one API key per business, or is it one key with many numbers?
10. Is there a delivery guarantee or replay for events missed while we are down?
