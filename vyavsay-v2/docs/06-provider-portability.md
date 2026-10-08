# Vyavsay Assist v2: Provider Portability

**Summary**
1. Owner requirement: if ChatSyncs stops, moving to another partner or Meta's Cloud API must be a single-adapter job, not a refactor. v1 still waits for ChatSyncs and builds no Meta adapter ([0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md) D8 stands).
2. Rule: the core speaks only our canonical models. WhatsApp policy (24h window, templates, opt-out, quiet hours) lives in the core. Adapters translate and nothing else.
3. Provider is a column per `whatsapp_number`; webhooks route by a key's own provider (per-number or app-level); config is an encrypted blob; one inbox table; two providers coexist on different numbers.
4. Proof is executable: one conformance suite, run end to end on the fake plus a "meta-like" and a "twilio-like" fake profile, an import-lint rule, a cutover test, a switch drill, and a paper spec of `MetaCloudAdapter` (s9) with stories.
5. All third-party API facts (ChatSyncs, Meta, Twilio-style, Cal.com, Google) are **verify**: no docs tools were available. Decision: [0028](adr/0028-provider-portability.md). Review: [portability-skeptic](reviews/portability-skeptic.md).

Inputs: [02-architecture](02-architecture.md) s4, s5, s11; [03-tenancy-data](03-tenancy-data.md) s3.2, s3.3; ADRs [0003](adr/0003-durable-inbox-and-job-claiming.md), [0008](adr/0008-whatsapp-provider-and-inbound-fallback.md), [0012](adr/0012-system-access-tier.md), [0024](adr/0024-delivery-order-and-provider-unblock.md), [0025](adr/0025-hold-and-escalate.md), [0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md).

## 1. Ports-and-adapters rule
| Layer | Knows | Never knows |
|---|---|---|
| Core (`domain`, `agent`, `worker`, `api`) | Canonical models, `WhatsAppProvider` port, capability flags | Provider names, SDKs, URLs, payload shapes, provider error codes |
| `ports/` | Protocols, canonical models (pydantic, frozen), phone normaliser, status state machine | Any adapter |
| `adapters/<provider>/` | Its own API, auth, signatures, payloads, error codes, config schema | Window, template, opt-out, quiet-hours or follow-up rules |
| `bootstrap/registry.py` | The only file mapping provider name to adapter class | Business logic |

**Policy stays in the core.** `choose_send_mode`, 24h window, template fallback, STOP, quiet hours, follow-up timing, outbox and review queue are WhatsApp/Meta rules, the same for every provider. An adapter reports facts (an error kind); it never decides whether to send.

**Canonical models** (`app/ports/whatsapp_models.py`):
| Model | Fields (core view) |
|---|---|
| `InboundEvent` | `kind`: `text`, `voice`, `image`, `status`, `reaction`, `unsupported`; `provider_message_id`, `id_space` (see s3), `number_ref`, `sender_ref` (opaque, stable per provider), `sender_phone_raw?`, `ts` (provider event time), `text?`, `media: MediaRef?`, `reply_to?`, `status: DeliveryStatus?`, `raw` (this event's slice, kept verbatim) |
| `SendRequest` | `kind`: `text`, `template`, `media`; `recipient` (`sender_ref` + optional phone), `idem_key` (attach to the send when the provider can carry it), `status_callback_url?` (core supplies; adapter may ignore), `text?`, `template: TemplateRef?` + ordered `variables`, `media: MediaRef?` + `caption?` |
| `DeliveryStatus` | `provider_message_id`, `state`: `sent`, `delivered`, `read`, `failed`; `error: SendError?`, `correlation: idem_key?` (when the provider echoes it), `ts` |
| `TemplateRef` / `TemplateSpec` | Ref: `purpose`, `language`, `external_ref` (opaque). Spec (returned by `list_templates`): `purpose`, `language`, `variable_count`, `status` (`approved`, `pending`, `rejected`, `paused`, `unknown`), `category` (`utility`, `marketing`, `other`), `external_ref`. Component layout (header, buttons, named vs positional) stays inside the adapter |
| `MediaRef` | Inbound: `mime`, `size?`, `opaque_ref` (only passed back to `fetch_media`). Outbound: `media_key` (our S3 key) + `mime`; the adapter, which gets a `BlobStore` at construction, uploads or links; the core never hands out URLs |
| `SendResult` | `provider_message_id`, `accepted` |

**Sender identity.** Contacts are keyed by a core `contact_key`, produced by `ports/phone.py` (not by adapters): `normalise(sender_phone_raw, default_region=IN)` handles `91...`, `+91...`, leading 0, spaces and address prefixes (`whatsapp:`); result `tel:+E164`. If no phone is given (username-style ids, **verify**), `contact_key = ref:<id_space>:<sender_ref>`. Replies go to `recipient.sender_ref`. Owner-number checks (E2.12) compare phones only when a phone exists. `contacts.phone_e164` becomes nullable; UNIQUE moves to `contact_key`.

An unknown or future payload becomes `unsupported` (stored, flagged, never a crash). The core never reads `raw` (static check in CI).

**Error taxonomy** (adapter maps every provider failure to one `kind` and one typed `reason`; `detail` is free text for logs only):
| Kind | Reasons | Core reaction |
|---|---|---|
| `retryable` | none | Backoff, same `idem_key`, only if the adapter proves nothing was sent (else `unknown_send`) |
| `permanent` | `auth` | Number health flips, team alert |
| `permanent` | `recipient_invalid` | Mark failed, contact flagged `bad_number`, no retry |
| `permanent` | `recipient_blocked` | Counts as an opt-out signal: set `opted_out_at` (`consent_source=provider_block`), team told. Compliance signal is never lost |
| `permanent` | `template_problem` | Template set `needs_attention`, team alert, fall back to hold (no retry) |
| `permanent` | `content_rejected`, `other` | Mark failed; review item if customer-facing |
| `window_closed` | none | Convert to template path once, else `held_window` (02 s5 race rule); provider's word beats our clock |
| `rate_limited` | none | Backoff with `retry_after`; counts toward hold-rate alert |
| `unknown_send` | none | Never resend. Reconcile (s2 order), else status `unknown` plus review item (0008) |
Alert: `unknown_send` over 3% of sends in 15 min raises a team alert and groups new review items under one provider-incident item, so a vendor hiccup does not flood the queue.

## 2. Capability flags
The adapter is the source of truth (`registry.capabilities(number)` calls `adapter.capabilities(config)`); `whatsapp_numbers.capabilities` is an audit snapshot refreshed at onboarding and by the health job, never read by the core for decisions. Inbound is push-only (`inbound_mode=push`); a poll-only provider is out of scope for v1 design (the F2 poller in 02 shows it could feed the same inbox).

Flags the core reads in v1, each with a degrade test:
| Flag | If missing, the core |
|---|---|
| `send_template` | Window closed means `held_window` and owner alert |
| `list_templates` | Team enters templates into `message_templates`; no auto-sync |
| `status_lookup` (by key or id) | `unknown_send` skips lookup; goes on to correlation, else review item |
| `idempotent_send` | Core does lookup before any retry; with no lookup either, no retry at all |
| `correlation_echo` | Provider echoes `idem_key` on status webhooks, so an `unknown_send` or orphan status is matched by key. Missing: only review item |
| `media_download` | Inbound media kept `unsupported`; owner told "customer sent media" |
| `voice_notes` | Voice event stored; customer gets the never-silent text fallback (E6) |
| `delivery_webhooks` | Poll `status_lookup` for `accepted` rows; with neither, `sent` is final |
Reconcile order for an ambiguous send: `status_lookup` -> `correlation_echo` match within 15 min -> review item.
Documented names only (no consumer in v1, no degrade test until a flow needs one): `read_receipts`, `interactive_buttons` (render numbered text), `message_edit_delete` (ignored), `window_info` (core computes the window).
Rule: a flag set true must be exercised by the conformance suite; degrade tests run on the fake with each v1 flag off.

## 3. Data model
Neutral changes to [03-tenancy-data](03-tenancy-data.md) (no provider name in any table, column or enum):
| Table | Rule |
|---|---|
| `whatsapp_numbers` | `provider text` (checked against the registry in code, no DB enum), `provider_number_ref`, `provider_config_secret_id` (encrypted JSON in `tenant_secrets`, kind `provider_config`, validated by the adapter's pydantic schema; used for sends and health), `capabilities` audit snapshot, status adds `switching`. UNIQUE (provider, provider_number_ref). No endpoint key column |
| `endpoint_keys` (new, system tier only) | `id`, `provider`, `scope` (`number`, `app`), `number_id` (scope=number), `app_id` (scope=app), `key_hash` (sha256, UNIQUE), `secret_id` (webhook verification secret for this key), `mode` (`live`, `drain`, `revoked`), `valid_until`. A number may hold several keys (live plus old drain key) |
| `provider_apps` (new, platform-level, system tier only) | `id`, `provider`, `secret_id` (app-level secret and verify token). For providers with one webhook for all numbers (Meta-like). Not tenant data; no RLS grant to `app_user` |
| `inbound_events` | Keep `raw`. Add `provider`, `id_space`. UNIQUE (number_id, id_space, provider_message_id). `received_at` stays; add `event_ts` and canonical order `seq` = (`event_ts`, `received_at`, `id`) |
| `messages`, `outbound_messages` | `provider`, `id_space`, `provider_message_id`. `messages` UNIQUE (tenant_id, id_space, provider_message_id) where not null |
| `message_templates` | `external_ref`, `provider`, status as `TemplateSpec`; UNIQUE (tenant_id, purpose, language, provider). Purposes (one list, reused by the step 6 check): `followup_nudge`, `visit_reminder`, `reengage`, `owner_alert`, `owner_reply`, `team_notice` |
| `contacts` | `contact_key` (s1), `phone_e164` nullable |
| `webhook_dead_letters` (new, platform) | Body of a delivery that could not be assigned to a number or parsed at all (no tenant known): headers redacted, body, reason, time. Team-visible, 14-day retention |
| `tenant_secrets.kind` | `chatsyncs_token` becomes `provider_config` (token, account ids). Webhook secrets live on `endpoint_keys.secret_id` / `provider_apps.secret_id` |

**`id_space`.** A string the adapter declares for its message ids: defaults to the provider name; two adapters that expose the same global ids (for example Meta `wamid`, **verify** whether ChatSyncs does) declare the same `id_space`. Same id arriving through old and new provider then dedupes exactly. If spaces differ, the cross-provider guard (below) only flags.

**Status state machine** (`ports/status.py`, core): order `accepted < sent < delivered < read`; a status never moves backwards (read before delivered raises to read, a later delivered is ignored). `failed` after `sent` or `accepted` wins; `failed` after `delivered` is logged and ignored. A status for an id we do not hold (webhook beat the send response) is parked 10 min on the inbox and retried by ingest (also matched by `correlation`), then stored `orphan_status` and ignored. Same-second ordering uses `seq`.

**Window.** `conversations.last_inbound_at` = provider `event_ts` clamped to at most `received_at` (never from receipt time alone where the provider gives an event time, so a replay after an outage cannot extend the window). ChatSyncs gives no inbound event time, so for it the window runs from receipt and a late delivery after an outage can extend it; use F2 `last_message_time` when known, with the existing 10-minute safety margin (02 s5). A `window_closed` from the provider overrides our clock.

**Media.** Inbound: the `ingest_media` job downloads through `fetch_media` within 5 min of the event into S3 (retry on `retryable`), else marks `media_expired`, which takes the never-silent fallback (E6); the core never stores a provider URL. Outbound: core passes `media_key`; the adapter uploads or links.

**Cutover rules** (number `active` -> `switching` -> `active` with the new provider):
| Item | Behaviour |
|---|---|
| Send jobs for the number | Not claimable while `switching`: 0012 `claim_jobs` gets `NOT EXISTS (number.status='switching')` for kinds `send`, `followup_send`; agent and ingest jobs keep running, so inbound is processed and replies queue in the outbox. Test in E2.17 |
| Outbox `queued` | Held, then sent by the new adapter after the flip; the adapter is resolved from `number.provider` at send time. Same `idem_key`. Rows older than 2 h at release go through the stale-reply re-check (23 post-step) before send (**verify** against 04) |
| Outbox `sending`, `accepted`, `unknown` | Reconciled in step 4 through the old adapter, chosen by the row's own `provider`, while the old connection still works. Leftovers: `unknown` plus review item. Never resent |
| Holding replies (0025) and owner alerts | While `switching`: owner alerts go by email and the in-app flag only; the WhatsApp owner channel is recorded `skipped_switching`. Holding replies queue like any send. During the actual handover gap nothing can be sent on that number, so the gap is kept short and measured |
| Inbound in the gap | Not stored by us: between the old partner disconnect and the new connection nothing reaches us. Redelivery by the new side is unknown (**verify**); the drill measures real loss. After the flip a team task lists contacts active in the 24 h before the gap start, to check by hand |
| Late webhooks from the old provider | Old `endpoint_keys` row set `mode=drain`, `valid_until`=+48 h, verified with its own `secret_id`, routed by the key's own provider, stored with the old `provider`, processed once. After `valid_until`, `revoked` (404) |
| Cross-provider duplicates | Same `id_space` and id: exact dedupe. Otherwise same sender, same minute and body hash within 10 min after the flip sets `dup_suspect` and still processes; it never skips; a team task reviews |
| Templates | Approved in Meta, usually not in the partner (**verify**). After connection `list_templates` or manual entry fills new `external_ref` rows; every purpose enabled for the tenant must be `approved` before the flip |

## 4. Webhook routing
- Route: `POST /webhooks/whatsapp/{provider}/{endpoint_key}` (and `GET` for handshakes). Steps: `resolve_endpoint_key(hash)` returns `provider`, `scope`, `number_id` or `app_id`, `mode`, `valid_until`, `secret_id`. The URL `{provider}` must equal the **key's** provider (not the number's, so drain keys work after a flip); else 404.
- Adapter hooks: `handle_handshake(ctx)`; `verify_inbound(ctx, secret)` where `ctx = InboundContext(url, method, headers, raw_body)` (full URL and method are needed by URL-signed providers, **verify**); `resolve_number(raw_body) -> list[(number_ref, [events])]` and `parse_inbound`.
- Scope `number`: the key fixes the number; any `number_ref` in the payload must match it, else reject. Scope `app`: verify with the app-level secret first, then `resolve_number`; the core looks up the number by (key's provider, `number_ref`) via system function `resolve_number_ref` (new in 0012 list). Unknown number: stored in `webhook_dead_letters`, 200. A forged `number_ref` cannot cross tenants because the body is signed by the app secret and the number row decides the tenant, never the payload.
- Batch: one POST may hold many events; insert per event; a parse failure on one event stores it `parse_error` and continues; return 200 when the raw body is saved (inbox or dead letter), so no loss and no retry storm.
- One `inbound_events` table for all providers; status events enter with `kind=status`.
- Fail closed: unknown key 404, bad signature 401 (nothing stored), adapter exception 200 only after the body is saved.
- Webhook role: EXECUTE `resolve_endpoint_key`, `resolve_number_ref`, INSERT `inbound_events`, `webhook_dead_letters`; secret decrypt for `endpoint_keys.secret_id` only, through the KMS path in 0010 (**verify** with 0010).

## 5. `/sessions` facade
The facade (02 s11) stays provider-neutral through two adapter methods:
| Method | Returns | Used by |
|---|---|---|
| `connection_state(config)` | `connected`, `connecting`, `disconnected`, `auth_failed` + `phone?` | Health job (5 min) writes `connection_status`; `GET /sessions*` maps it as today |
| `begin_connect(config)` | `ConnectPlan(kind: team_task / hosted_signup_url)` | `POST /sessions`; v1 only uses `team_task`; `qrDataUrl` stays unused |
Note: on a Cloud API provider `connection_state` means token and number validity, not a live socket; webhook silence (s7) is the real health signal. Constraint noted, not changed: the QR screen and Settings text mention "Baileys sessions" and scanning, wrong for every Cloud API partner including Meta; already flagged for the owner (02 s11, decision 6). No frontend change proposed.

## 6. Conformance suite and enforcement
`tests/conformance/` runs one parametrised suite over every adapter profile in the registry. Real adapters join on recorded fixtures; live smoke is separate and manual.

**Profiles (all executable, all in E2.14):**
| Profile | Encodes |
|---|---|
| `fake` | The reference: per-number key, one event per POST, idempotent send, lookup, delivery webhooks |
| `fake-meta-like` | App-level webhook and secret, handshake GET, number only in payload, batch of events per POST, no idempotency and no lookup, status by webhook only (out of order), expiring media, positional template params, wa_id without `+`, phone-less sender option, `correlation_echo` on |
| `fake-twilio-like` | URL-signed verify (url and method matter), form-encoded body, separate status callback URL, basic-auth media, address prefix on numbers, indexed template vars |
The core flow tests (route, inbox, ingest, window, outbox, status machine, reconcile, cutover) run end to end on every profile, not only the adapter methods. If a profile forces a core change, that is a portability bug fixed in the core first.

| Group | Checks |
|---|---|
| Inbound fixtures | One payload per canonical kind maps to expected canonical JSON in `fixtures/<provider>/expected/`; unknown payload gives `unsupported`, never an exception; phone formats `91...`, `+91...`, leading 0, missing phone give the right `contact_key` |
| Verification | Good signature passes; tampered body, wrong URL, missing header and replay fail (runs on the fakes only; ChatSyncs has `path_key` auth and no tamper test); payload `number_ref` of another tenant cannot cross tenants |
| Idempotent send | Same `idem_key` twice yields one provider message (flag, lookup or correlation); a timeout yields `unknown_send`, not `retryable` |
| Error mapping | Each provider error fixture lands in exactly one kind and reason; the table is complete (unmapped gives `unknown_send` or `permanent/other`); blocked recipient sets opt-out |
| Status | Out of order, orphan status, failed after delivered, same-second order |
| Media | Fetch after expiry gives `media_expired`; outbound from an S3 key |
| Window | Window computed from event ts after a 2 h outage replay |
| Capability honesty | Declared true works on a fixture; declared false raises `Unsupported`, and degrade tests pass with that flag off |
| Hygiene | No token in `repr`, logs or exceptions; config schema rejects missing fields; invalid `provider_config` fails at onboarding, not first send; core never reads `raw`; adapter never writes core tables |
| Ids | Same message id from two providers on one number does not collide in `messages` unless their `id_space` is equal |
Definition of done for a new adapter: conformance green, fixtures recorded, capability table filled, switch drill passed (s7).

**Import rule** (import-linter, CI):
1. `app.domain`, `app.agent`, `app.worker`, `app.api`, `app.ports`, `app.db` may not import `app.adapters.*`.
2. No `app.adapters.X` imports `app.adapters.Y`; adapters import only `app.ports`.
3. Only `app.bootstrap.registry` imports adapter packages.
4. Provider SDKs and provider-configured HTTP clients (listed in the linter config) importable only under `app/adapters/<provider>/`.
5. Text check `tests/test_no_provider_names.py`: word-boundary, case-insensitive regex for provider names and markers (`\bchatsyncs\b`, `\bwamid\b`, `\bmeta\b`, `graph\.facebook\.com`, `\bX-Hub-Signature`, `\bhub\.(mode|challenge|verify_token)`) in `app/` outside `adapters/` and `bootstrap/`; an allowlist file for justified hits. Planted-case test: `metadata` and `github.com` pass; a bare `Meta` or `wamid` in core fails. Data rows and docs exempt.

## 7. Switch runbook
Only one partner may hold Full access to a WABA at a time (D8 facts), so this is a short handover, not a parallel run on one number. Two providers coexist across different numbers, which is how the canary works.
| # | Step | Owner | Notes |
|---|---|---|---|
| 0 | Prepare (no outage) | Team | New adapter passes conformance; `provider_config` validated in staging; template copy and approval proof in repo; WABA owned in the business's own Meta account (**verify** per partner) |
| 1 | Canary | Team | Move the team's own test number (another WABA) first: conformance, live smoke, 24 h soak |
| 2 | Announce | Owner | Low-traffic window (IST night); tell the tenant; freeze template changes |
| 3 | Set `switching` | Team | Send jobs not claimable; ingest and agent keep running; owner alerts by email and in-app only (s3) |
| 4 | Drain | System | Reconcile `sending`, `accepted`, `unknown` rows via the old adapter; list leftovers |
| 5 | Handover | Team | Old partner disconnects; new partner or Meta connects; new `endpoint_keys` row (live) for the new provider; old row to `drain` 48 h. Gap starts and ends are timestamped |
| 6 | Re-sync | System | `list_templates` or manual; all purposes enabled for the tenant `approved` |
| 7 | Verify | Team | Conformance green in staging; inbound test message; outbound session text and one template to the canary phone; delivery status arrives |
| 8 | Flip | Team | `provider` and `provider_config_secret_id` in one transaction; status `active`; held rows released; gap task created |
| 9 | Watch | Team | 24 h: inbound count vs baseline, send failure rate, `unknown_send` rate, `dup_suspect` count |
| R | Rollback | Team | Free only before step 5 completes. After it, rollback means reconnecting the old partner (needs its cooperation), so steps 1 and 7 are not optional |
Downtime: sends held and inbound possibly lost for the handover gap, target under 60 min (**verify**, depends on partner speed). The claim "customers see a delay, not a lost message" is unproven: the drill records messages sent into the gap and how many arrived. Nothing moves between databases; only the number's rows change.

**Decision checklist (when to trigger).** Anchor dates: spike answers due 2026-10-14; owner call 2026-10-21 (end of week 2, 0027); later checks run from pilot start.
| Date or signal | Check | Action |
|---|---|---|
| 2026-10-14 | Docs and web re-check done for the open tracker rows? | If not, log and re-plan (no support email, D14) |
| 2026-10-21 | Still no answers or access | Owner call; owner decides whether to approve a second-adapter spike (not pre-approved) |
| Webhook silence | No inbound on a number for 2x the usual gap in business hours while health says connected | Alert; team sends a test message; vendor escalation after 1 h |
| Send failure rate | Over 5% permanent or `unknown_send` for 30 min across numbers (**verify** with pilot data) | Vendor ticket; owner informed |
| Vendor notice | Shutdown, price change, WABA access change, or no support reply in 2 business days on an outage | Owner decision meeting within 3 days; start step 0 for the chosen target |
| Quarterly | Switch drill on the fake pair; review the Meta spec for API changes | Update this doc |
A Meta switch has lead time (business verification, app setup, **verify**), so the owner may choose to start step 0 early; that is a decision, not a v1 build.

## 8. Other outside services
| Port | v1 adapter | Plausible second adapter | What would change |
|---|---|---|---|
| `ModelGateway` (LLM) | LiteLLM in-process (0011) | Direct vendor SDK or LiteLLM proxy | One adapter file; task-to-model map is config |
| `ModelGateway.transcribe` (STT) | Whisper-class hosted via gateway (0005) | Another hosted STT or self-hosted Whisper | Adapter plus language hint map; owner re-runs the Hinglish/Marathi sample test |
| `CalendarPort` | Cal.com (0026) | Google Calendar (below) | Adapter, OAuth per tenant, onboarding step; hold, slot and reminder logic untouched |
| `SheetsPort` | Google Sheets | Excel Online or CSV export | Adapter; sync job is generic |
| `Notifier` (email) | SES (verify) | Resend or SMTP | Adapter; templates are our data |
| `BlobStore` | S3 private (0010) | Supabase Storage or R2 | Adapter; core stores keys only, signed URLs minted by the adapter |
| `Tracer` | Langfuse Cloud with masking (0027) | Self-hosted Langfuse or OpenTelemetry sink | Tracer adapter; the mask function stays in the core wrapper so every sink is masked |
Same rules as WhatsApp (port, canonical models, fake, shared conformance test, import-lint), not repeated per port.
**Google Calendar (paper, not built):** free/busy for slots, events insert with a private property carrying our booking id for idempotency, push channels replace the Cal.com webhook (all **verify**); min-notice and buffers stay in our core. About 8 to 10 days.

## 9. MetaCloudAdapter paper spec (not built in v1)
From memory; every row is **verify** against current Meta docs before any story starts.
| Canonical item | Meta Cloud API mapping (verify) |
|---|---|
| Webhook shape | One app-level webhook URL and one app secret: an `endpoint_keys` row with `scope=app`, a `provider_apps` row. Number only in the payload |
| Handshake | `GET` with `hub.mode`, `hub.verify_token`, `hub.challenge`: echo challenge when token matches (`handle_handshake`) |
| `verify_inbound` | `X-Hub-Signature-256` = HMAC-SHA256 of raw body with the app secret, constant-time compare |
| `resolve_number` | `entry[].changes[].value.metadata.phone_number_id` = our `number_ref`; one POST holds several messages and statuses |
| `InboundEvent` text | `messages[].type=text`, `text.body`, `from` (wa_id, no `+`: goes to `sender_phone_raw`), `id` (wamid; `id_space="wamid"`), `timestamp` (unix, 1 s) |
| voice / image | `type=audio` (voice flag) or `image`; media id, mime, sha256; ids expire fast, so ingest downloads at once |
| reaction / other | `type=reaction` with target id; `interactive`, `button`, `location`, `contacts`, `sticker`, `unsupported` give `unsupported` (button replies may become text) |
| `DeliveryStatus` | `statuses[]` sent, delivered, read, failed; `id`; `errors[].code`; optional echo of caller data (`biz_opaque_callback_data`) carries `idem_key` (`correlation_echo`) |
| Send text | `POST /{ver}/{phone_number_id}/messages`, Bearer token, `{messaging_product:"whatsapp", to, type:"text", text:{body}}`; returns `messages[0].id` |
| Send template | `type:"template"`, `template:{name, language:{code}, components:[parameters]}`; `external_ref` = name; adapter builds components from ordered `variables` |
| Send media | `type:"image"`/`"audio"` with `id` or `link`; upload via `POST /{phone_number_id}/media` from our S3 `media_key` |
| `fetch_media` | `GET /{media_id}` returns a short-lived URL; download with Bearer token; size cap |
| `list_templates` | `GET /{waba_id}/message_templates` mapped to `TemplateSpec` (status, category) |
| Error mapping | 131047 -> `window_closed`; 130429 / 131056 / 80007 -> `rate_limited`; 131026 undeliverable or block signals -> `permanent/recipient_blocked` or `recipient_invalid`; 132xxx -> `permanent/template_problem`; 100 -> `permanent/content_rejected`; 190 / 401 -> `permanent/auth`; 5xx, 131000, timeout after send -> `unknown_send`; other 4xx before send -> `retryable`. Complete table in `errors.py` |
| Capabilities (expected) | `send_template` yes; `list_templates` yes; `idempotent_send` no; `status_lookup` no; `correlation_echo` yes; `media_download` yes; `voice_notes` yes; `delivery_webhooks` yes |
| Degrade | No idempotency and no lookup: timeout after send is `unknown_send`; reconcile by correlation echo within 15 min, else review item, never resend. Same path already tested on `fake-meta-like` |
| Config blob | `phone_number_id`, `waba_id`, access token (system user, long-lived); app secret and verify token live in `provider_apps` |
| `connection_state` | `GET /{phone_number_id}` status and quality fields: token and number validity |
| `begin_connect` | `team_task` (Embedded Signup optional later) |
| Outside our code | Business verification, app review, tech-provider status (lead time); Meta per-message pricing; webhook subscription on the app |

**Stories (optional epic E9, not v1; S 1 day, M 2 to 3, L 4 to 5):**
| ID | Story | Size |
|---|---|---|
| E9.1 | Spec refresh against live Meta docs; sandbox fixtures | M |
| E9.2 | Inbound: handshake, signature, `resolve_number`, batch, all kinds | M |
| E9.3 | Send text, template, media; error table; correlation echo | L |
| E9.4 | Media fetch and upload, size caps, expiry | S |
| E9.5 | `list_templates` to `TemplateSpec`; component builder | M |
| E9.6 | `connection_state`, `begin_connect`, config schema, onboarding validation | M |
| E9.7 | Conformance green incl. `fake-meta-like` diff review; canary smoke | M |
| E9.8 | Switch drill on real numbers; runbook update | M |
About 15 to 20 days plus Meta-side lead time. Because the app-level webhook, `resolve_number`, sender ids, error reasons and correlation are already in the core (E2.13 to E2.18), no core file is expected to change; if one must, fix that portability bug first.

## 10. ChatSyncs adapter profile (docs review 2026-10-07; all "from docs, unverified in practice")
| Item | Profile |
|---|---|
| Routing | Scope `number` key in URL path, one key per trigger (message, status, conversation, outgoing); no signature documented, so `inbound_auth=path_key` (accepted pilot risk, owner-signed note, D9; plus IP allow-list or signing when published); log scrubbing, key rotation and forgery limits: 02 s4 "Path-key hardening". `resolve_number` reads `whatsapp_bot_id` and checks it against the key's number |
| Capabilities | `send_template` true, `list_templates` true, `status_lookup` true, `delivery_webhooks` true, `idempotent_send` false, `correlation_echo` false, `media_download` false, `voice_notes` false. The last two stay false for the pilot (D10) and flip on only after a recorded media fixture |
| `id_space` | Fixed to `chatsyncs`, never flipped (a flip would break dedupe). Meta-format ids are handled by a mapping row if ever needed |
| Config blob | Per business (D11, one ChatSyncs account each, no shared token): `apiToken` (account key, full access), `phone_number_id`, optional `whatsapp_business_account_id`. Rotation by key regeneration invalidates all copies of that business's key only: needs a per-number update path and an `auth` health alert |
| Quirks | HTTP 200 with `status:"0"`; string versus boolean status; message can be string or array; redirect on missing token; "Subscriber not found" with status `"1"`; subscriber create accepts garbage phones; `template_id` short vs long WhatsApp id unverified (store both); subscriber update clears omitted fields (read-modify-write); times have no timezone; phone is digits without `+`; every contact counts toward the plan's subscriber limit; send success means accepted only |
| Error classifier | Exact strings are data in `adapters/chatsyncs/errors.py`: window text maps to `window_closed`; 401 or redirect to `permanent/auth`; not-found or invalid-phone texts to `recipient_invalid`; limit texts to `rate_limited` or `permanent/other`; timeout, 5xx, non-JSON or any unrecognised text to `unknown_send`. Substring match, case-insensitive, whitespace-normalised. Alert when unmapped over 1% of sends; circuit breaker on drift (02 s5 Race); `status:"1"` with no `wa_message_id` is `unknown_send`; a unit test holds the verbatim window string. The window text is the most fragile mapping: a drift makes a closed window look unknown, so core also keeps its own clock |
| Catch-up poller (F2) | Part of the adapter in v1 (D12): per account, rate-limited, `subscriber/list` then `get-conversation`, dedupe by `wa_message_id`, into `inbound_events` (02 s4) |
| Reconcile | No idempotency key and no echo: `get-message-status` when we hold the id (lookup is by `wa_message_id` only); else `get-conversation` by contact phone for a unique outbound row matching text inside the time window (duplicates or owner-typed rows mean `unknown`); else `unknown` plus review item |
| Coexistence | Documented: throughput 80 to 20 per second, 6 months of history copied, broadcast lists off. Unknown: whether owner-phone messages reach our webhook. Allowed for pilot numbers (D13); the first spike case tests it. Until answered, phone-typed and unknown outgoing events are stored and ignored, and the owner-phone inbound rule (02 s5a, E2.12) holds and conversation history may contain owner-typed rows we do not know how to classify |
| Conformance fixtures needed | Real recorded: inbound text; inbound voice, image, other (if any); status events (sent, delivered, read, failed with reason); each send error string (window, not found, invalid phone, plan limit, 401, redirect, validation); `get-conversation` page with a media row; `subscriber/list` page; template list and status; `myInfo` |
