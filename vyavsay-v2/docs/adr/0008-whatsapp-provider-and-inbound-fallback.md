# 0008. WhatsAppProvider port and inbound fallback ladder

Status: Proposed (adapter blocked on the E0.8 spike; SKILL.md section 8 questions are answered or superseded). Amended by [0028](0028-provider-portability.md) and [0027](0027-langfuse-cloud-backups-chatsyncs-wait.md): F3 and any Meta fallback reversed; F1 dropped as primary; F2 is required in v1 (D12, ADR 0029), not optional.
Date: 2026-10-07

## Context
Original context: ChatSyncs seemed to document sending but no inbound webhook. Docs review (2026-10-07, rounds 1 and 2, all "from docs, unverified in practice"): an inbound text webhook is documented; REST send, template send, status lookup and subscriber list exist; no idempotency key, no webhook auth, retry or media payload docs. Core flow still needs inbound.

## Decision
- Async `WhatsAppProvider` Protocol with `capabilities` flags, typed errors incl. `UnknownOutcome`, and `verify_inbound` / `parse_inbound` producing a provider-neutral `InboundEvent` / `StatusEvent`.
- Webhook route `/webhooks/whatsapp/{provider}/{endpoint_key}`; the key resolves to a number or, for app-level providers, an app plus the payload number; tenant comes only from the number row. Amended by [0028](0028-provider-portability.md) (keys table, canonical models, capability list). Handler only verifies and inserts into `inbound_events` (0003).
- Assumptions A1-A7 are listed in 02-architecture section 4 and tested in M0.
- Fallback ladder, all feeding the same dedup table: F1 ChatSyncs Incoming Message webhook to our endpoint (documented for text; auth by secret in URL path because no signature is documented); F2 reconciliation poll through `subscriber/list` (orderBy most recent) plus `get-conversation` per changed contact (built in v1, D12, with the guards in 02 s4; limited: whether it finds contacts that never reached us by webhook is unknown, CQ-29); F3 replacement provider via the same port (owner approval needed).
- Sends are never auto-retried. Timeout leads to `find_recent` lookup, else status `unknown` and a review item.
- Capability flags drive behaviour (e.g. no `idempotency_key` means lookup before resend).

## Consequences
+ Provider swap touches one adapter; M0 outcome decides the path. - F2 may not find new contacts (unknown, CQ-29); F3 needs a new adapter and templates.

## Alternatives
Build on polling only (rejected: latency, discovery); direct Meta now (owner decision says ChatSyncs).

## Amendments
- [0027](0027-langfuse-cloud-backups-chatsyncs-wait.md): owner chose to wait for ChatSyncs with no replacement provider (F3 removed). The "Incoming Message" webhook is documented, so A1 is largely answered; remaining unknowns are in 02-architecture section 4.
- [0028](0028-provider-portability.md): canonical models, five error kinds and the capability list replace the flags and error names above; provider is stored per number; adapter-only imports enforced. F3 stays removed (D8); the Meta adapter is a paper spec only.
- Docs review 2026-10-07: F1 is the primary path with path-secret auth; ack fast then process; text-only inbound until a media payload is recorded; voice stored `unsupported` with the never-silent reply and owner alert; send errors arrive as HTTP 200 with `status:"0"`, so the adapter classifier defaults to `unknown_send`. ChatSyncs capabilities: `send_template` true, `list_templates` true, `status_lookup` true, `delivery_webhooks` true (webhook page; polling as backup), `idempotent_send` false, `correlation_echo` false, `media_download` false, `voice_notes` false (both until verified). Status stays Proposed.
