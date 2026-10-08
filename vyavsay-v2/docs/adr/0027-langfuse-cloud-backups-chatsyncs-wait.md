# 0027. Langfuse Cloud, backups, and waiting for ChatSyncs (D6 to D8)

Status: Accepted by owner 2026-10-07. Amends [0007](0007-aws-deployment-iac-backups.md), [0008](0008-whatsapp-provider-and-inbound-fallback.md), [0011](0011-litellm-in-process.md), [0024](0024-delivery-order-and-provider-unblock.md).
Date: 2026-10-07

## Context
Three open items from the plan were answered by the owner, with new ChatSyncs facts pasted from their docs.

## Decision
**D6 Langfuse Cloud with masking (not self-host).** Tracing goes to Langfuse Cloud. A mask function on SDK input and output removes phone numbers (regex), vehicle registration numbers (regex) and names (the tenant's known contact and persona names from the DB, plus the owner's), tokens and addresses before export. CI tests masking with seeded PII. Region and DPDP cross-border position: verify, owner to confirm. Offboarding deletes traces by tenant tag (API: verify). Names are the weak spot (free text); the eval set includes name-leak cases.

**D7 Backups.** Supabase paid point-in-time recovery (plan, retention, add-on: verify) plus a daily `pg_dump` by a scheduled ECS task to a versioned, KMS-encrypted bucket in the owner's AWS S3. Media bucket versioned. Retention: dumps kept 30 days (owner to confirm). DPDP erasure: an erased tenant stays in backups until they expire; the privacy position says so, and an erasure log is replayed after any restore. The dump task uses its own read-only `backup_role` (can read all tenants, separate credentials, used by nothing else; verify it works with Supabase roles). Restore drill before pilot, RPO 1 h and RTO 4 h measured. Object Lock and a separate backup account stay deferred.

**D8 Wait for ChatSyncs, no direct-Meta fallback.** Build against `WhatsAppProvider` with the in-repo `FakeProvider`; the ChatSyncs adapter waits for the spike. Reversed: fallback F3 (replacement provider) and "no-go means Meta". F1 (Outbound Action) is dropped as primary because the "Incoming Message" webhook is documented. F2 (reconciliation poll) is required in v1 (D12, ADR 0029); the endpoints exist (`subscriber/list` plus `get-conversation`, from docs, unverified in practice). Known facts: Cloud API based (Meta-hosted); "Incoming Message" webhook (Bot Settings > Webhook) fires for every customer message; four triggers on that tab including message and conversation status changes; sending is via a "Webhook Workflow" (page not seen); number, WABA, templates and quality rating live in Meta (portable); only one partner holds Full access to a WABA at a time. Unknowns (first spike and the questions list in 02-architecture section 4): signature and auth, retries, voice and image payloads, bot-per-number and multi-tenant model, exact send API with templates and status lookup, pricing and limits.
- If ChatSyncs says no or stalls, the work stops at the adapter and the owner decides; the plan does not pre-approve an alternative. 0024's "end of week 2 then F3" is replaced by a dated nudge and an owner call.

## Consequences
+ Core work is unblocked on the fake; fewer vendors. - Real schedule risk with no fallback; the fake can hide quirks, so spike output must become recorded fixtures and adapter contract tests.

## Alternatives
Self-host Langfuse (ops); backups by PITR only; keep F3 spike approved (owner declined for now).

## Amendment (2026-10-08, [0029](0029-pilot-chatsyncs-decisions.md))
F2 (reconciliation poll) is no longer a conditional safety net: it is built in v1 (D12). The path-key risk is accepted for the pilot by owner sign-off (D9). Pilot is text only (D10).
