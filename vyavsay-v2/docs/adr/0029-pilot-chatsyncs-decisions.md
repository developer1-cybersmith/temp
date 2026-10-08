# 0029. Pilot ChatSyncs decisions (D9 to D15)

Status: Accepted by owner 2026-10-08. Amends [0008](0008-whatsapp-provider-and-inbound-fallback.md), [0027](0027-langfuse-cloud-backups-chatsyncs-wait.md), [0028](0028-provider-portability.md). All ChatSyncs facts are "from public docs, unverified in practice".
Date: 2026-10-08

## Context
A docs and web research pass found: no webhook signing or secret, IP list is a "coming soon" page, no retry or replay text, no inbound voice or media payload or download, owner-phone echo unknown, one account-wide full-access API key, webhook URL set by hand in the UI. The owner decided the pilot workarounds below.

## Decision
- **D9 Path-secret auth, accepted risk.** Inbound auth is the per-trigger secret in the URL path (`endpoint_keys`, `inbound_auth=path_key`), allowed for the pilot only if ChatSyncs confirms no signing secret and no fixed IPs. The owner signs a short risk note (leaked key lets someone inject customer text, pollute a conversation or trigger outbound spam from the business number; the key also lives in the vendor dashboard and may leak via logs). Acceptance is reviewed at M2 and at each monthly docs check (first 2026-11-08), and ends when signing or IPs exist. Suspected leak: rotate at once. Keep asking the docs; add signing or an IP allow-list as soon as one exists. Hardening stays as in 02 s4.
- **D10 Text-only pilot.** `voice_notes` and `media_download` stay false. Inbound voice and images are stored `unsupported`, the customer gets a polite "please type" reply, a review item and owner alert open (never silent). v1 "done" is defined with voice off. Voice-minute limits stay out of the pilot tier until a real media fixture exists. The voice pipeline is built on fake media only.
- **D11 One account and key per business.** `provider_config` (encrypted, per number) holds that business's own `apiToken`, `phone_number_id`. No shared token anywhere. Key regeneration affects one business only. Budget one ChatSyncs plan per business.
- **D12 Catch-up poller now (F2).** Built in v1, tests first. Per account (so per business), rate-limited with a per-account hourly call cap: `subscriber/list` (`orderBy=1`) then `get-conversation` for changed contacts, insert into `inbound_events`, dedupe by (number, `id_space`, `wa_message_id`). Lag alarm. Guards in 02 s4: go-live cursor, stale-message rule, per-contact cursor, round-robin, backoff, kill switch; live numbers stay off the poller until the webhook-id equals history-id test passes (CQ-17). Kept even if ChatSyncs later documents retries.
- **D13 Coexistence allowed.** Pilot numbers may keep the phone app. First spike case: send from the phone and see whether it reaches the webhook or `get-conversation`, and with what sender flag. Until answered, phone-typed and unknown outgoing events are stored and ignored (never replied to, never opt-out-handled, never create a contact). Throughput under coexistence is 20 messages per second.
- **D14 Questions tracker, no support email yet.** Open questions are tracked in `docs/chatsyncs-open-questions.md` and clarified from public docs and web search. Contacting support is an optional later step.
- **D15 Manual rotation by the team.** The team rotates webhook URLs and secrets by hand at a quiet hour with the rotation runbook and checklist (02 s4). No rotation API is known.

## Consequences
+ Pilot can run without vendor answers; no shared secret across businesses; message loss is bounded by the poller.
- Forged inbound text is possible if a path key leaks; extra ChatSyncs cost per business; rotation is manual and needs a person (emergency path: rotate at once); poller adds API calls (budgeted).

## Alternatives
Wait for a signing secret before pilot (blocks); shared account for all businesses (one key exposes all); poller only if retries are missing (owner chose now); voice in pilot (no payload known).
