# 0028. Provider portability: canonical WhatsApp models, provider per number

Status: Proposed. Amends [0008](0008-whatsapp-provider-and-inbound-fallback.md), [0024](0024-delivery-order-and-provider-unblock.md), and one-line amendments to [0003](0003-durable-inbox-and-job-claiming.md), [0012](0012-system-access-tier.md), [0023](0023-run-races-and-review-concurrency.md). Design: [06-provider-portability](../06-provider-portability.md).
Date: 2026-10-07

## Context
Owner requirement: if ChatSyncs stops, moving to another partner or to Meta's Cloud API must not be a big refactor. D8 ([0027](0027-langfuse-cloud-backups-chatsyncs-wait.md)) stands: v1 waits for ChatSyncs, builds no Meta adapter, pre-approves no replacement. This ADR makes a later adapter a one-adapter job. A skeptic review found the first draft broke that claim in routing, identity, errors and cutover; fixed here.

## Decision
- Core knows only canonical models: `InboundEvent` (text, voice, image, status, reaction, unsupported), `SendRequest`, `DeliveryStatus`, `TemplateRef`/`TemplateSpec`, `MediaRef`. Window, template, opt-out, quiet-hour and follow-up rules stay in the core.
- Sender identity is opaque `sender_ref` plus optional phone; a core normaliser makes `contact_key` (`tel:+E164` or `ref:...`). Event time (`event_ts`), not receipt time, drives the 24h window.
- Errors: five kinds with typed reasons (`auth`, `recipient_invalid`, `recipient_blocked` feeds opt-out, `template_problem`, `content_rejected`, `other`). Alert on `unknown_send` rate.
- Capability flags read by v1 core: `send_template`, `list_templates`, `status_lookup`, `idempotent_send`, `correlation_echo`, `media_download`, `voice_notes`, `delivery_webhooks`. Four more are documented names only. Adapter is truth; the DB column is an audit snapshot. Replaces the flag list in 0008. Inbound is push-primary (ChatSyncs also gets an F2 poll into the same table).
- Data: `whatsapp_numbers.provider` (checked text) with encrypted `provider_config`; new `endpoint_keys` (provider, scope number or app, mode live/drain/revoked) and `provider_apps` (app-level secret); `id_space` on message ids; one `inbound_events` table; no provider name in core tables or enums.
- Webhooks route by the key's own provider (so drain keys work after a flip). Adapter hooks: `handle_handshake`, `verify_inbound(url, method, headers, body)`, `resolve_number`, `parse_inbound`. Batch: insert per event.
- Cutover: `switching` makes send jobs unclaimable (0012 `claim_jobs` predicate); owner alerts go by email during it; leftovers reconcile through the row's own provider. Loss in the handover gap is possible and measured, not denied.
- Proof: one conformance suite over `fake`, `fake-meta-like`, `fake-twilio-like`, running core flows end to end; import-linter rules; cutover test; switch drill. A Meta adapter is optional epic E9, not v1.
- Amends 0024: M2 gate includes the lint rule, the three profiles and the cutover test. Amends 0003: dedupe key is (number, `id_space`, message id). 0012: new system functions `resolve_endpoint_key` (returns provider, scope, mode) and `resolve_number_ref`. 0023: `switching` pauses sends only.

## ChatSyncs capability profile (docs review 2026-10-07, unverified in practice)
`send_template` true; `list_templates` true; `status_lookup` true (by `wa_message_id` only; helps only when we hold the id); `delivery_webhooks` true (documented, polling backup); `idempotent_send` false; `correlation_echo` false; `media_download` false; `voice_notes` false (until a media payload and download method are recorded). Flags are set to what is proven, and flipped on only with a fixture. Details and error classifier: [06 s10](../06-provider-portability.md).

## Amendment (ChatSyncs round-2 review, 2026-10-08)
- ChatSyncs `id_space` is fixed to `chatsyncs` and never flipped (dedupe key stability).
- `endpoint_keys` gets `trigger` (one key per ChatSyncs trigger) and `drain` is valid for same-provider rotation (runbook in 02 s4 "Path-key hardening"). Unknown-key 404s are rate-limited (0012 `resolve_endpoint_key` caller).
- Conformance: the "tampered body fails" row runs on the fakes only; ChatSyncs has `path_key` auth and no tamper test.

## Consequences
+ A provider change is one adapter plus a runbook, shown by tests, not asserted. + Real fixtures join the same suite.
- Early work: stories E2.13 to E2.18 are about 15 to 20 days gross; roughly 6 to 8 of that (routing, status handling, schema) would be needed anyway, so about 9 to 12 extra.
- Lowest common denominator: nothing the core relies on may exist on only one provider. A real switch still needs vendor handover and, for Meta, Meta approvals, outside our code.

## Alternatives
Build the Meta adapter now (owner declined, D8). DB enum for provider (needs a migration per adapter). Policy inside adapters (leaks rules). Per-number key only (cannot absorb app-level webhooks).

## Amendment (pilot decisions, 2026-10-08, [0029](0029-pilot-chatsyncs-decisions.md))
- Accepted risk: ChatSyncs `inbound_auth=path_key` for the pilot, owner-signed (D9). The adapter profile records it; a signing secret or IP list replaces it when available.
- `provider_config` for ChatSyncs is per business: its own `apiToken`; no shared token (D11).
- `voice_notes` and `media_download` stay false for the pilot (D10). The ChatSyncs poller (F2) is part of the adapter in v1 (D12). Phone-typed and unknown outgoing events are stored and ignored until the coexistence spike answers (D13).
