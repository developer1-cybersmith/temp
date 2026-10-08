# ChatSyncs open questions (single tracker)

Last checked: 2026-10-08. All ChatSyncs facts are "from public docs, unverified in practice". Docs were read via summaries, so "not found" means "not seen". "Meta context only" means not ChatSyncs evidence.

## Summary
- 33 questions. Count check: `grep -c '^| CQ-' docs/chatsyncs-open-questions.md` must print 33; per status: `grep '^| CQ-' docs/chatsyncs-open-questions.md | cut -d'|' -f4 | awk '{print $1}' | sort | uniq -c`.
- Biggest gaps: webhook auth, retries and timeout, inbound voice and media payloads, owner-phone echo, rate limits, history id equals webhook id (CQ-17).
- No vendor contact for now (D14). Pilot runs on workarounds: secret in URL path, text only, guarded catch-up poller, one account per business.
- Source notes: `docs/reviews/chatsyncs-webhook-findings.md` plus the 2026-10-08 research pass.

## How to maintain
1. One row per question. Never delete a row; mark it answered.
2. Every status change gets a date and a source URL in the evidence list.
3. Status order of authority: `answered-vendor` (written) over `answered-spike` (live key, recorded fixture) over `answered-docs`. Note any conflict.
4. Re-check docs monthly and before each milestone; update "Last checked" and each row's next check.
5. Link rows to stable story ids (E-ids) or ADR numbers.
6. Statuses: open, answered-docs, answered-spike, answered-vendor, accepted-risk, decided. Re-run the count check after edits.

## Tracker
All rows last checked 2026-10-08. "team" is the Vyavsay team. Evidence is in the list below the table.

| ID | Question | Status | Blocks | Owner | Next check | Workaround |
|---|---|---|---|---|---|---|
| CQ-01 | Inbound webhook auth (secret header, HMAC, token)? | accepted-risk | E0.9, E2.2, ADR 0008 | owner | 2026-11-08 docs; M2 review | Secret in URL path (`endpoint_keys`) |
| CQ-02 | Fixed source IPs for webhooks? | open | E2.2, ADR 0008 | team | 2026-11-08 docs | None; no IP allow-list from docs |
| CQ-03 | Retry count, timeout, expected response (inbound, status)? | open | E2.2, ADR 0003 | team | spike E0.8 | Ack fast, durable inbox, poller |
| CQ-04 | Delivery log or failure report for inbound and status webhooks? | open | E2.2 | team | 2026-11-08 docs | Own receipt log, poller |
| CQ-05 | Inbound voice note payload? | open | E6.5, FR-5, ADR 0005 | team | spike E0.8 | Text-only pilot (D10); `voice_notes` off |
| CQ-06 | Inbound image, document, location, reaction, button payloads? | open | E6.5, ADR 0010 | team | spike E0.8 | Unknown types stored raw, never dropped, to review |
| CQ-07 | How to download inbound media (auth, expiry)? | open | E6.5, ADR 0005 | team | spike E0.8 | `media_download` off |
| CQ-08 | Inbound event timestamp and type field? | open | E2.2, ADR 0024 | team | spike E0.8 | `received_at` as event time |
| CQ-09 | Media shape inside `get-conversation` `message_content`? | open | E2.21 | team | spike E0.8 | Live-key test in spike |
| CQ-10 | Owner-phone (coexistence) messages on the Outgoing webhook, with what sender flag? | open | E0.8, ADR 0008 | team | spike E0.8 (first case) | Drop or tag unknown outgoing; never auto-reply |
| CQ-11 | Owner-phone messages in `get-conversation`, under which `sender`? | open | E0.8, E2.21 | team | spike E0.8 | Same as CQ-10 |
| CQ-12 | Limits under coexistence? | answered-docs | ADR 0008 | team | 2026-11-08 docs | 20 mps is far above our load |
| CQ-13 | Are webhook events ordered? | open | ADR 0024 | team | spike E0.8 | Treat as unordered; status rank |
| CQ-14 | `failed_reason` values and error codes? | open | E2.19, ADR 0028 | team | spike E0.8 | Unmapped to `unknown_send`; no auto retry |
| CQ-15 | Signal for customer blocked or opted out? | open | ADR 0024 | team | spike E0.8 | STOP handled in our core |
| CQ-16 | Is `status_time` / `last_message_time` IST or UTC? | open | E2.21, ADR 0024 | team | spike E0.8 | Store raw; earlier of receipt and history time for the window |
| CQ-17 | Is `wa_message_id` always the Meta wamid, and does history equal webhook id? | open | E2.T2, E2.21, ADR 0028 | team | spike E0.8 (blocks live poller) | Poller off for live numbers until fixture test passes |
| CQ-18 | Idempotency key or client reference on send, echoed in status? | open (partial: openapi last 40k chars unread) | E2.19, E2.20, ADR 0028 | team | 2026-10-15 read rest of spec | `idempotent_send`, `correlation_echo` = false; lookup before retry |
| CQ-19 | Exact text of the 24h window error? | answered-docs | E2.19 | team | 2026-11-08 docs | Match text; contract test; fall back to template |
| CQ-20 | Error format of the API? | answered-docs | E2.19, ADR 0028 | team | 2026-11-08 docs | Always parse body |
| CQ-21 | API and webhook rate limits? | open | E2.21, ADR 0004 | team | spike E0.8 | Own send cap per number; poller budget |
| CQ-22 | Plans, prices, limits? | answered-docs (pricing page via summary) | PRD tiers, ADR 0006 | owner | 2026-11-08 docs | One plan per business |
| CQ-23 | Does Lite include webhooks? | open | ADR 0006 | owner | 2026-11-08 pricing | Assume Starter or higher |
| CQ-24 | Media size limits (inbound, upload)? | open | ADR 0010 | team | spike E0.8 | Own cap |
| CQ-25 | API token scope and rotation? | answered-docs (inference noted) | ADR 0006, ADR 0014 | team | spike E0.8 | One token per business account; rotation runbook |
| CQ-26 | Reseller / sub-account program, key per business? | open | ADR 0006, ADR 0014 | owner | 2026-11-08 docs | One account per business |
| CQ-27 | Webhook URL set or changed by API? | open | E8.10, onboarding | team | 2026-10-15 MCP list | Team enters URL by hand |
| CQ-28 | Template id forms (short vs long), variables, sync? | answered-docs | E2.8, templates | team | spike E0.8 | Store both ids |
| CQ-29 | Way to find missed inbound (catch-up), incl. never-seen contacts? | answered-docs (new-contact coverage unknown) | E2.21 | team | spike E0.8 | Poller with guards (02 s4) |
| CQ-30 | Plan usage visible through API? | answered-docs | PRD tiers | team | 2026-11-08 docs | Poll `myInfo` |
| CQ-31 | Does IP Manager protect our webhook? | answered-docs (summary read, reads as no) | ADR 0008 | team | 2026-11-08 security page full read | Not used for webhook auth |
| CQ-32 | Delivery guarantee or replay for events missed while down? | open | ADR 0003, ADR 0004 | team | 2026-10-15 MCP list | Poller only |
| CQ-33 | Use coexistence in production? | decided (D13) | E0.8, ADR 0008 | owner | spike E0.8 (first case) | Allowed; phone-typed and unknown outgoing stored and ignored |

Counts: accepted-risk 1, answered-docs 9, decided 1, open 22. Total 33. `answered-spike` and `answered-vendor`: 0 so far.

## Evidence
- **CQ-01**: Not found on webhook, bot-settings or features pages; only a URL field and a toggle per trigger. D9 accepted-risk with signed note (E0.9), review at M2 and monthly. [bot-settings](https://docs.chatsyncs.com/learn/chatsyncs-bot-settings/turn-on-webhook-triggers-for-my-bot-with-chatsyncs.md)
- **CQ-02**: Integrations page is a coming-soon placeholder for IPs. [page](https://docs.chatsyncs.com/learn/chatsyncs-integrations/introduction.md)
- **CQ-03**: No retry, backoff, timeout or status text on pages read. [bot-settings](https://docs.chatsyncs.com/learn/chatsyncs-bot-settings/turn-on-webhook-triggers-for-my-bot-with-chatsyncs.md)
- **CQ-04**: Only Webhook Workflow (reverse direction) has reporting. [reporting](https://docs.chatsyncs.com/learn/chatsyncs-webhook-workflow/webhook-workflow-reporting-in-chatsyncs.md)
- **CQ-05**: Audio page covers outbound only (AAC, MP3, AMR, OGG, 16 MB). [audio](https://docs.chatsyncs.com/learn/chatsyncs-automation/audio-message-in-chatsyncs.md)
- **CQ-06**: No page or example. Changelog 2025-10-14 says location is posted, shape unseen. [llms.txt](https://docs.chatsyncs.com/llms.txt), [changelog](https://chatsyncs.com/changelog)
- **CQ-07**: Only outbound send-file and upload-media exist. [upload-media](https://docs.chatsyncs.com/developer-api/whatsapp/upload-media.md)
- **CQ-08**: Text payload has `user_message`, ids; no timestamp or type seen. [webhooks intro](https://docs.chatsyncs.com/learn/chatsyncs-webhooks/introduction.md)
- **CQ-09**: `message_content` is a JSON string holding the received WhatsApp webhook; only a text example. Timestamp field is `conversation_time`. [get-conversation](https://docs.chatsyncs.com/developer-api/whatsapp/get-conversation.md)
- **CQ-10**: Outgoing payload has no text and no sender field. [status-changes](https://docs.chatsyncs.com/learn/chatsyncs-webhooks/webhook-for-messages-status-changes-in-chatsyncs.md). Meta context only (not ChatSyncs): BSPs expose `smb_message_echoes` as a distinct non-billable echo event.
- **CQ-11**: Inbox mirrors both ways per the coexistence page; no `sender` enum for phone/app seen in the first 200k chars of the spec. [coexistence](https://docs.chatsyncs.com/learn/chatsyncs-overview/connect-your-whatsapp-business-app-to-chatsyncs.md)
- **CQ-12**: Meta-origin numbers repeated on the ChatSyncs page: 80 to 20 messages per second while both active; 6 months history synced; broadcast lists, disappearing and view-once disabled; Business App only. [coexistence](https://docs.chatsyncs.com/learn/chatsyncs-overview/connect-your-whatsapp-business-app-to-chatsyncs.md)
- **CQ-13**: Not addressed on the status page. [status-changes](https://docs.chatsyncs.com/learn/chatsyncs-webhooks/webhook-for-messages-status-changes-in-chatsyncs.md)
- **CQ-14**: Free text, no enum; success means accepted, later failure shows `failed` with `failed_reason`. [get-message-status](https://docs.chatsyncs.com/developer-api/whatsapp/get-message-status.md). Meta context only (not ChatSyncs): 131049 do not retry now, 131026 undeliverable, per [360dialog](https://docs.360dialog.com/api/api-error-message-list).
- **CQ-15**: Conversation-status `blocked` action exists (meaning unconfirmed); none in the status webhook. [openapi](https://docs.chatsyncs.com/developer-api/openapi.json)
- **CQ-16**: Format "YYYY-MM-DD HH:MM:SS", no timezone stated. [status-changes](https://docs.chatsyncs.com/learn/chatsyncs-webhooks/webhook-for-messages-status-changes-in-chatsyncs.md)
- **CQ-17**: Every example is a wamid; no page says always, and none says history ids equal webhook ids. If they differ, dedup fails and customers get double replies. [status-changes](https://docs.chatsyncs.com/learn/chatsyncs-webhooks/webhook-for-messages-status-changes-in-chatsyncs.md)
- **CQ-18**: No idempotency or reference field seen on send endpoints or the status webhook, but only the first 200k of 240k chars of the spec were read. Absence not proven. [openapi](https://docs.chatsyncs.com/developer-api/openapi.json)
- **CQ-19**: "Sending message outside 24 hour window is not allowed. You can only send template message to this user." HTTP 200, no code. [openapi](https://docs.chatsyncs.com/developer-api/openapi.json)
- **CQ-20**: `status` "1" ok / "0" fail with `message`; 401 only for bad key; missing key gives 302; some endpoints use boolean status; "Subscriber not found" may return "1". [openapi](https://docs.chatsyncs.com/developer-api/openapi.json)
- **CQ-21**: None on introduction, get-my-info, api-key pages; only pacing guidance (service replies about 30/min, utility about 200/hour). [introduction](https://docs.chatsyncs.com/developer-api/introduction.md)
- **CQ-22**: Lite Rs 999 (2,000 contacts, 1 number, 1 member); Starter Rs 1,699 (5,000, 1, 2); Pro Rs 3,299 (20,000, 1, 5); Business Rs 5,999 (50,000, 2, 10). Extra number Rs 2,299, member Rs 499 one-time. 7-day trial; REST API on all plans. Summary-level read. [pricing](https://chatsyncs.com/pricing)
- **CQ-23**: Summary lists webhooks from Starter up; Pro "includes incoming and outgoing webhooks". Conflicts with CQ-22 "REST API on all plans" (different feature). [pricing](https://chatsyncs.com/pricing)
- **CQ-24**: upload-media states no size; outbound audio 16 MB only. [upload-media](https://docs.chatsyncs.com/developer-api/whatsapp/upload-media.md)
- **CQ-25**: One account-level key, full permissions, no read-only key, no expiry; regenerating invalidates all copies. Page is in the MCP section; "same token as REST" is an inference from round 2, not stated there. [api-key](https://docs.chatsyncs.com/mcp/api-key.md)
- **CQ-26**: `direct-login-url` creates end-user accounts under an agent account (`package_id`, `expired_date`); how to become an agent, pricing and per-account token undocumented. [direct-login-url](https://docs.chatsyncs.com/developer-api/user/direct-login-url.md)
- **CQ-27**: Not in OpenAPI or llms.txt; UI only (Bot Settings > Webhook > Publish Changes). Absence is not proof; MCP tool list unread. [bot-settings](https://docs.chatsyncs.com/learn/chatsyncs-bot-settings/turn-on-webhook-triggers-for-my-bot-with-chatsyncs.md)
- **CQ-28**: Send uses short `id`; status lookup needs Meta long id; vars `templateVariable-<name>-<position>`; list cached, status live; Manager-made templates need manual Sync Templates; only text templates safely sendable. Primary: [openapi](https://docs.chatsyncs.com/developer-api/openapi.json) (template paths); our notes: [findings round 2](reviews/chatsyncs-webhook-findings.md)
- **CQ-29**: `GET /whatsapp/subscriber/list` (limit max 100, `offset` from 1, `orderBy=1` latest first, `last_message_time`, `unseen_count`); `get-conversation` needs `phone_number`. No created-date filter. Unknown whether it lists contacts who never reached us by webhook. Primary: [openapi](https://docs.chatsyncs.com/developer-api/openapi.json) (`subscriber/list`), [get-conversation](https://docs.chatsyncs.com/developer-api/whatsapp/get-conversation.md); notes: [findings round 2](reviews/chatsyncs-webhook-findings.md)
- **CQ-30**: `GET /user/myInfo`: package, expiry, `bot_subscriber_data`, `message_credit_data`, `whatsapp_bots_details[]`. [get-my-info](https://docs.chatsyncs.com/developer-api/user/get-my-info.md)
- **CQ-31**: IP Manager (2026-04-20) restricts who can log in or call the ChatSyncs API, not who calls our webhook. Read through a summary; reads as no. [security](https://docs.chatsyncs.com/learn/chatsyncs-team-management/security-in-chatsyncs.md)
- **CQ-32**: Nothing documented; ChatSyncs MCP (36 tools, 2026-10-04) tool list not read for replay. [changelog](https://chatsyncs.com/changelog)
- **CQ-33**: Decision D13 (ADR 0029): coexistence allowed for pilot numbers because owners keep the phone app. Own evidence: owner decision, and the risk it carries is the unknown echo behaviour (CQ-10, CQ-11) and 20 mps (CQ-12). Spike first case decides how phone-typed rows are classified.

## Accepted risks and workarounds
| Risk | Workaround | Exit condition |
|---|---|---|
| Unauthenticated webhook (CQ-01, CQ-02), D9. Leak impact: injected text, polluted conversation, outbound spam, quality-rating damage; key also visible in the vendor dashboard and possible log sinks | Secret in URL path per trigger, owner-signed note, manual rotation (D15) with an emergency path, reply target from stored contact only, body ids validated. Review date: M2 and each monthly check (first 2026-11-08) | Vendor header, HMAC or published IPs |
| Voice and media unknown (CQ-05 to CQ-07) | Text-only pilot; flags off; unknown types to review | Real payloads and a working download |
| One token per account (CQ-25, CQ-26) | One account per business | Vendor reseller or per-number key |
| Retries and replay unknown (CQ-03, CQ-32) | Ack fast, durable inbox, guarded poller | Vendor states retry policy; poller kept |
| Coexistence echo unknown (CQ-10, CQ-11), decision D13 | Spike first case; unknown outgoing stored and ignored | Spike result in an ADR |
| Window error is text only (CQ-19) | Exact text match, contract test, template fallback | Vendor error code |

## Next check
1. Per D14 no support email. By 2026-10-15: read the last 40k chars of `openapi.json` (CQ-18) and the MCP tool list (CQ-27, CQ-32). Then re-read docs for CQ-03, 05 to 08, 10, 13 to 17, 21, 23, 26.
2. Live-key spike (E0.8), first case D13: type on the owner phone and watch webhook and `get-conversation`; capture inbound text, voice, image, button payloads; compare webhook id with history id (CQ-17); record as `answered-spike`.
3. Re-check docs and changelog monthly and before each milestone (next: 2026-11-08).
