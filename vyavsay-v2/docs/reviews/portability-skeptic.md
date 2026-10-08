# Portability skeptic review (06-provider-portability, ADR 0028)

**Verdict: revise.** Direction is right (ports, canonical models, provider per number, shared suite). But the claim "a switch is one adapter" is false in 5 places, 2 of them in the webhook and cutover design, and the proof is only a paper spec. Facts about Meta, Twilio-style and other partners are from memory (verify).

## Blockers (the claim breaks)
1. **Drain mode contradicts the routing rule.** 06 s4 says `number.provider` must equal `{provider}` in the URL, else 404. 06 s3 says the old key stays valid 48 h after the flip. After the flip the old URL carries the old provider, so it 404s; late webhooks are lost. Also 03 has one `endpoint_key_hash` column per number (UNIQUE), so there is nowhere to hold the old key. Fix: an `endpoint_keys` table (number_id, provider, key_hash, valid_until, mode) and route by the key's own provider, not `number.provider`. Also 0012 `resolve_endpoint_key` must return provider and mode; add that to the system-tier function spec.
2. **Per-number webhook URL is not provider-neutral.** Meta (verify) has one webhook URL per app; the number is only known from the payload (`phone_number_id`), and the signature uses an app-level secret. 06 s4 resolves the number from the URL key first, then verifies with that number's config. For Meta the secret is needed before the number is known. Also `verify_inbound(headers, raw_body, config)` has no URL or method; Twilio-style signatures cover the full URL (verify). Fix: add `resolve_number(raw) -> number_ref` as an adapter hook, an app-level (not per-number) provider config row, and pass `url`/`method` to verify. Without this, E9.2 touches core routing, which the doc says must not happen.
3. **Sender identity is hard-wired to a phone number.** `InboundEvent.from_e164` is mandatory. Meta is moving toward usernames and scoped ids (verify), and gives `wa_id` without `+`. Contacts, conversations (UNIQUE tenant, contact, number) and owner-phone checks (E2.12) all assume E.164. Fix: `sender_ref` (opaque, stable per provider) plus optional `phone_e164`, and a normaliser in the port layer, not each adapter. Cheaper now than after the schema is live.
4. **Error taxonomy is too thin and has a hidden channel.** 06 s1 says `subcode` is "free text for logs", but the core flips number health on `subcode=auth`. That is a typed field pretending to be free text. Missing kinds: `recipient_blocked/opted_out` (Meta-style 131050/131026, verify; losing it as `permanent` hides a compliance signal that must feed our opt-out), `invalid_recipient`, `template_rejected`. Fix: make `auth`, `recipient_invalid`, `recipient_blocked`, `template_problem` real enum members under `permanent`.
5. **Unknown-send reconcile has no path on a Meta-like provider.** Without idempotency key and lookup, every ambiguous 5xx or timeout becomes a human review item. Meta can echo caller data on status webhooks (verify `biz_opaque_callback_data`), which would let the core match by `idem_key`. No capability flag covers it (`correlation_echo`). Add it, and define `SendRequest.idem_key` as "attach to the send if the provider can carry it". Add an alert for unknown_send rate, or review queues fill during a provider hiccup.
6. **Cutover claims are not true as written.**
   - 06 s7 step 3 "inbound still stored": between partner disconnect and new connect, nothing reaches us. Whether the new side redelivers is unknown (verify). "Customers see a delay, not a lost message" is unproven; say so and put a number in the drill.
   - Held outbox also holds 0025 holding replies and owner alerts for up to 60 min. That breaks "the AI never goes silent" and the owner alert path. Fix: owner alerts use email and the in-app flag while `switching`; holding replies need an explicit decision.
   - "Agent runs paused" has no mechanism: 0012 `claim_jobs` has no number-status predicate; 0023 does not cover pause. Add it to claim SQL and a test.
   - Window timing: `last_inbound_at` must come from the provider event timestamp, not receipt time, or late-delivered events after an outage skew the 24h window. Not stated. Add a safety margin (treat the window as closed a few minutes early) and a rule that `window_closed` from the provider beats our clock.
7. **The proof is paper only.** The conformance suite and fixtures are written by us against our own fake, so it can only confirm the shape we imagined. Fix: ship two adversarial fake profiles in E2.14 that encode the paper specs as executable tests: "meta-like" (app-level webhook, batch of several events per POST, no idempotency, no lookup, status via webhook only, out-of-order statuses, expiring media, positional template params) and "twilio-like" (URL-signed, separate status callback URL, form-encoded, basic-auth media, address prefix). If the core passes with those, the claim is evidence; otherwise it is hope.

## Leaky or lowest-common-denominator spots
| Spot | Leak or trap | Fix |
|---|---|---|
| `TemplateRef.external_ref` plus `variables` | Meta has named/positional params, header, button and media components, category (marketing vs utility, pricing); others use content ids or indexed vars. No canonical `TemplateStatus` or `list_templates` return type | Define `TemplateSpec` (purpose, language, body vars schema, status, category) and keep the component layout in the adapter |
| Outbound media | `MediaRef.opaque_ref` is adapter-defined, but our media lives in S3. How does bytes or a signed URL reach the adapter? | `SendRequest.media` carries our `media_key` + mime; adapter uploads or links |
| Inbound media expiry | Meta ids and URLs expire fast (verify); other partners may require auth. 06 has no "download on ingest within N min into S3" rule | Core rule: fetch at ingest job, retry on `retryable`, then mark `media_expired`; test it |
| Status events | No rule for out-of-order (read before delivered), failed after delivered, or status for an id we have not stored yet (webhook beats the send response) | Monotone state machine in the core; park orphan statuses 10 min then reconcile; tests |
| Ordering | Provider timestamps are 1 s; same-second messages | Canonical `seq` = (provider ts, received_at, id); say it in 06 |
| Poll-only providers | Port is push-only; a provider with no webhooks cannot be absorbed | Declare out of scope in 06, or add `inbound_mode: push/poll` flag |
| Batch webhooks | One POST has many events; partial parse failure behaviour undefined (200 or not) | Insert per event, mark failures `parse_error`, 200 |
| Capabilities | `capabilities` jsonb snapshot on the number and adapter-declared flags: two sources of truth, stale after an adapter upgrade | Adapter is truth; snapshot refreshed at health job and onboarding only |
| Lint rule 5 | Substring `meta` matches `metadata`, `Meta` inner classes, `hub.` matches `github.` | Word-boundary regex plus an allowlist file; test it on a planted case |
| Dedupe key | UNIQUE (number_id, provider, provider_message_id) means the same wamid arriving via old and new provider is two rows; the fallback `dup_suspect` (same minute, same body hash) drops a genuine "ok" sent twice from the agent | If both sides expose Meta ids, dedupe on id regardless of provider for the cutover window; otherwise still process and only flag, never skip |
| Stale docs | 03 H-13 row still shows the old UNIQUE; ADR 0003 text names ChatSyncs and was not amended; `messages` UNIQUE per tenant ignores `provider` (id collision across providers possible) | Make UNIQUE (tenant, provider, provider_message_id); fix the rows |
| 0025 templates | `owner_reply`, `team_notice` are used in 0025 but missing from 03 template purposes; step 6 "all required purposes approved" has no list | List purposes once, reuse in the step 6 check |
| Health | `connection_state` for Meta is token validity, not "connected"; webhook silence is the real signal, which 06 s7 already lists | Note the difference in 06 s5 |
| Facade | Good, but `begin_connect` returns QR plans that no provider offers in v1; fine as a stub, keep it to the 3 kinds | none |

## Over-engineering (YAGNI vs owner requirement)
- Keep: ports, canonical models, provider column, generic routing, conformance suite, import-lint, runbook, Meta paper spec. The owner asked for these.
- Trim: 11 capability flags each needing a degrade test with the flag off. `read_receipts`, `interactive_buttons`, `message_edit_delete`, `window_info` have no consumer in any flow; keep them as documented names, build only flags the core reads in v1 (send_template, list_templates, status_lookup, idempotent_send, media_download, voice_notes, delivery_webhooks, plus the new correlation_echo).
- Trim: Google Calendar spec and the 7-port table are padding for item 9; keep the table, cut the Google paragraph to 3 lines.
- Per-number provider coexistence is cheap and used by the canary; keep.
- Effort mismatch: ADR 0028 says 6 to 8 days; E2.13 to E2.17 are M,M,S,M,M, about 10 to 13 days. 06 lists E9.1 to E9.8 (15 to 20 days), roadmap lists E9.1 to E9.6 with different splits. Align all three.

## Walkthroughs
**ChatSyncs to Meta Cloud** (change list): adapter (all), app-level webhook config and route (blocker 2), contact identity (3), error table (4), unknown_send correlation (5), template component mapping, media expiry rule, owner-alert path during `switching`. Core files touched if blockers are not fixed first: routing, contacts, error handling, outbox. With them fixed: adapter plus config only.
**ChatSyncs to a third provider (Twilio-like)**: URL-signed verify (2), status callback URL per send (needs `SendRequest.status_callback` supplied by the core, adapter ignores if unused), address prefix in phone normaliser (3), indexed template vars, auth'd media fetch. Poll-only partner: not absorbable.

## Missing tests (add to E2.14 / E2.16 / E2.17)
- Meta-like and Twilio-like fake profiles (blocker 7).
- Late webhook on the old key after flip is stored and processed once (blocker 1).
- Number resolved from payload, tampered number cannot cross tenants (blocker 2).
- Phone formats: `91...`, `+91...`, leading 0, missing phone (blocker 3).
- Status out of order, orphan status, failed after delivered.
- Media fetch after expiry; outbound media from S3 key.
- Window computed from event ts after a 2 h outage replay.
- Core never reads `raw` (static check) and adapter never writes core tables.
- Same message id across two providers on one number does not collide in `messages`.
- Switching with an open review item: owner alert still reaches the owner.

## Consistency with other ADRs
- 0003: dedupe key and ChatSyncs wording stale (see above). Lookup-before-resend matches 06.
- 0012: system functions need provider and key mode; claim needs a switching predicate; health job reads provider config across tenants, so decryption must go through the listed system tier, not a raw read.
- 0023: no pause rule for `switching`; add.
- 0025: held sends vs holding replies and owner alerts (blocker 6); template purposes list.
- 0027 D8: respected; no Meta adapter in v1, paper spec only. The doc also does not pre-approve a spike; good.

## Resolution (architect, 2026-10-07)
Applied in [06](../06-provider-portability.md), [0028](../adr/0028-provider-portability.md), 02, 03, 0003, 0008, 0012, 0023, 0024, roadmap and stories.
| Item | Outcome |
|---|---|
| B1 drain vs routing | Fixed: `endpoint_keys` table, routing by the key's own provider, per-key secret, drain mode (06 s3, s4) |
| B2 app-level webhook | Fixed: `scope=app`, `provider_apps`, `resolve_number`, `verify_inbound(url, method, ...)`, number from signed payload (06 s4) |
| B3 sender identity | Fixed: `sender_ref`, optional phone, core normaliser, `contact_key`; `phone_e164` nullable (06 s1, 03) |
| B4 error taxonomy | Fixed: typed reasons incl. `recipient_blocked` feeding opt-out and `template_problem` (06 s1) |
| B5 unknown_send | Fixed: `correlation_echo` flag, reconcile order, rate alert with grouped review item (06 s1, s2) |
| B6 cutover | Fixed: claim predicate and 0012/0023 amendments, owner alerts by email, event-ts window; "no lost message" claim withdrawn, drill measures gap loss (06 s3, s7) |
| B7 proof | Fixed: executable `fake-meta-like` and `fake-twilio-like` profiles, core flows end to end (06 s6, E2.14) |
| Templates, media, status machine, seq, batch, dedupe, lint, stale rows, estimates, tests | Applied (06 s1, s3, s6; E2.13 to E2.18; 03 H-13 and purposes; 0003) |
| Poll-only providers | Out of scope for v1 design, stated in 06 s2 (no `inbound_mode` flag built) |
| Trim flags, Google paragraph | Four flags documented-only; Google cut to 2 lines |
| Capability snapshot two sources | Adapter is truth; column is audit snapshot |
| Rejected: `begin_connect` QR kind | Dropped to two kinds (stub); no QR in any plan |
| Rejected: separate poll-fed inbound table | Same inbox if ever needed (F2 pattern); no work now |
| Rejected: keep 11 flags with degrade tests | YAGNI, per review's own trim item |
