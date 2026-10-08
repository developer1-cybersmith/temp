# 0024. Delivery order: tests first, fake provider, M0 gate

Status: Proposed
Date: 2026-10-07

## Context
ChatSyncs inbound is unconfirmed (0008). Waiting would idle the team, but building the agent on guesses risks rework. PRD sets M0 to M5; this ADR fixes how work proceeds while M0 is open.

## Decision
- Order is risk-first: tenancy and isolation tests, then messaging durability, then agent safety, then integrations.
- Every epic starts with its tests (contract, RLS probe, eval, concurrency) merged red before the code.
- While ChatSyncs is unanswered, all provider-dependent work runs against an in-repo `FakeProvider` implementing the `WhatsAppProvider` port (0008), including a scripted webhook sender. Only the ChatSyncs adapter and its live tests wait for M0.
- M0 has a dated decision: go (the F2 poller is part of v1, D12, not optional). Amended by [0027](0027-langfuse-cloud-backups-chatsyncs-wait.md) and [0029](0029-pilot-chatsyncs-decisions.md): no F3 and no Meta fallback; no support email for now (D14); if the docs and spike still leave key gaps at the end of week 2, ask the owner for a call. Work stays on the fake provider meanwhile.
- Amended by [0028](0028-provider-portability.md): the M2 gate adds the import-lint rule, the conformance suite on three fake profiles and the cutover test.
- Pilot gate (M5 exit) requires: CI gates green, restore drill done, eval bar met, one real number through a live provider.

## Consequences
- Core (1 to 4) is unblocked from day one; only adapter, voice media fetch and template send wait.
- FakeProvider can hide real-provider quirks: M0 results must be turned into recorded fixtures and contract tests for the adapter.
- Slip order follows PRD 2a: Sheets, tiers (keep hard cap), Calendar (visit-as-task), offboarding.

## Amendments
- [0028](0028-provider-portability.md): the fake plus a shared conformance suite are written first and gate M2, with the import-lint rule and a two-fake number cutover test. No change to D8: still no Meta adapter in v1.
