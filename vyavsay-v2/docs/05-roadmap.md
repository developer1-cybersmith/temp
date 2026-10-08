# Vyavsay Assist v2: Roadmap

**Summary**
1. Nine epics, about 90 thin stories plus 71 from the migration plans (24 agent, 47 backend and seam) ([full list](05-roadmap-stories.md)), ordered by risk: tenancy, then message durability, then agent safety, then integrations, then ops.
2. Tests come first in every epic: RLS probes, frontend contract tests and the eval set are merged red before the code that turns them green.
3. Waiting on ChatSyncs (no fallback provider, [ADR 0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md)): adapter (E2.8), status callbacks (E2.9), live check (E3.6), voice fetch and STT (E6.1, E6.2; off in the pilot, D10), live template and owner WhatsApp alert send (E5.3, E5.7, E7.3 live). Everything else, including hold-and-escalate ([ADR 0025](adr/0025-hold-and-escalate.md)), runs on the `FakeProvider` first ([ADR 0024](adr/0024-delivery-order-and-provider-unblock.md)).
4. Milestones M0 to M5 follow the PRD ([01-prd](01-prd.md) 2a). New block M1c (parity and sync on fakes) runs before any DB or infra work (D20). Pilot gate: CI gates green, restore drill, eval bar met, one real number live.
5. Slip order if time runs out: Sheets, plan tiers beyond the cap, Cal.com booking (visit-as-task E7.4 stays), offboarding. The hard cap and rate limits (E7.5) are Must and never slip.

Inputs: [PRD](01-prd.md), [architecture](02-architecture.md), [tenancy](03-tenancy-data.md), [agent design](04-agent-design.md), [owner decisions](../../docs/production-plan/04-owner-decisions.md). No dates are fixed: sizes are S about 1 day, M 2 to 3, L 4 to 5 days; the owner sets team size.

## 1. Epics in dependency order
| Epic | Milestone | Goal | Stories | Needs first | Risk rank |
|---|---|---|---|---|---|
| E0 Spike and unblock | M0 | ChatSyncs spike E0.8 (remaining unknowns after the docs review, A1 to A10), Cal.com spike, STT choice, templates submitted, AWS and domain known | 7 | owner answers, ChatSyncs access | 1 (blocks live messaging) |
| E1 Foundations and tenancy | M1 | Schema, RLS, worker role, auth, envelope, contract harness, CI gates (M1 is overloaded: split at planning into M1a schema/RLS/auth and M1b harness/CI/IaC) | 14 | none | 2 (leak) |
| E2 Messaging core | M2 | Fake provider first, canonical models, conformance suite (3 fake profiles), import-lint, provider per number (0028), status machine, durable inbox, jobs, outbox, 24h window, opt-out, adapter (after spike), leader scheduler | 13 | E1.4 | 3 (lost or double messages) |
| E3 Frontend API surface | M1 to M4 | All about 43 routes pass contract tests | 12 | E1.11 | 4 (screens break) |
| E4 Agent and grounding | M3 | Gateway, retrieval, graph, guard, injection defence, catalog embeds, eval at 150 cases | 15 + 24 (E4.15 to E4.38) | E1, E2.1 | 5 (wrong or unsafe replies) |
| E5 Hold-and-escalate and follow-ups | M3 (E5.1 only) and M4 | Holding reply, owner alerts on three channels, reminders and 4 h notice, resolve and resume, persistent follow-ups | 9 | E2, E4.9 | 6 |
| E6 Voice notes | M4 | Fetch, transcribe, never-silent failure | 6 (E6.5 split) | E0.4, E2.10 | 7 |
| E7 Hard cap, Cal.com, Sheets, tiers | M3 to M5 | Hard cap and rate limits (Must), visit fallback (Must), Cal.com booking, tiers, Sheets (S) | 10 | E4.9 | 8 (slip candidates) |
| E8 Ops and pilot readiness | M5 (IaC from M1) | AWS IaC, alerts, PITR plus S3 backups, restore drill, onboarding script (incl. Cal.com), dry run | 8 | E0.6 | 9 (but start early: long lead) |

E3 and E2 run in parallel after E1. E8.1 (IaC) starts in M1 so staging exists for CI and the M0 webhook.

## 2. Milestones
| M | Exit gate (all required) | Stories |
|---|---|---|
| M0 spike, about 1 week once ChatSyncs gives access | A1 to A10 table filled from the spike (recorded payload fixtures); go note and signed path-key risk note (E0.9, D9); coexistence spike case recorded (D13); the F2 poller is already in v1 (no fallback provider: a no-go is an owner conversation); Cal.com spike answers; STT vendor chosen; templates submitted (incl. `owner_alert`); AWS and domain confirmed | E0.1 to E0.7 |
| M1c Parity and sync, before infra (D20); steps and stories in [05-roadmap-stories](05-roadmap-stories.md) M1c-1 | Steps 1 to 11 of M1c-1 green on fakes in CI (Gm): ledger linter, repo conformance, 41 FE routes contract-green on memory with second-reader-signed fixtures, owner captures compared, messaging spine suite, seam suite (12 smoke scenarios at A3; CT1, CT2, CT6 and schema snapshots at M3), agent slices S0 to S6 scripted, hold and follow-up suites, integrations on fakes, frontend smoke P2.3 walked; step 12 (S7 quality gate) needs E4.1 and the labeller. Gm is not RLS proof: M2 and M3 below still close on Gp | A0 to A6 and A3b ([07](07-backend-migration-plan.md) s3a), S0 to S7 ([08](08-agent-migration-plan.md) s4), P0 to P6, P3.5 to P3.18 |
| M1 (a then b) | RLS suite T1 to T9 green in CI, T10 to T20 skeletons red with owners (E1.T2); migrations from empty DB; JWT auth; contract harness lists all routes; CI required checks | E1.\*, E3.T1, E8.1 (not yet scheduled: set M1a/M1b order at planning). Parked until M1c exit (D20): E1.2 to E1.7, E1.9, E1.10, E8.1; the rest is done inside M1c |
| M2 | Concurrency and fault suite green (duplicates, two workers, kill mid-send); window and STOP tests green; catch-up poller tests green (E2.T2, E2.21); ChatSyncs adapter passes fixtures (if go) | E2.\* (incl. E2.11 two-instance scheduler test; E2.13 to E2.18 portability; E2.8 only if go) |
| M3 | Smoke eval green on PR; full eval passes PRD bars (ungrounded under 1%, floor leak and invented claim 0 on the set); traces visible; catalog embed test (E4.14) green; E5.1 done; latency p95 on reply path measured; the 60-case set is smoke only, the 150-case set (NFR-9) is the gate; seam suite CT1, CT2, CT6 green and schema snapshots current (09); retrieval thresholds calibrated (P6.2); owner has seen every visible CHG; the Gp re-run is green (P5.2) | E4.\*, E5.1, E7.5 |
| M4 | Hold-and-escalate (holding reply, three-channel alerts, 30 min / 2 h / 4 h reminders, resolve and resume) and follow-ups pass state, fake-clock and two-runner tests; text-only voice fallback works (E6.5a stores and answers in A2, E6.5b opens the item and alert job in A3; voice itself stays off, D10); webhook rotation runbook rehearsed (E8.10); contract tests green for all routes except live-only ones: `/sheets` and `/vapi/*` are typed stubs (E3.9) until E7.6 | E5.\*, E6.\* (E6.5a and E6.5b), E3.\* |
| M5 | Cal.com booking if not slipped (visit-as-task E7.4 otherwise); Sheets sync and tiers if not slipped (cut line per PRD 2a; hard cap already met at M3); `/sheets` live only if E7.6 done; restore drill done (PITR and S3 dump) with measured RPO/RTO; alerts fire in a drill; onboarding script run; dry run signed | E7.\*, E8.\* |

Reading after D20: M1c delivers the Gm result for the work of M1 to M5 that can run on fakes. Parked until M1c exit (owner, D17, D18, D20): the DB and infra stories, listed in M1c-6 of the story list. When they resume, the same suites run on Postgres (P5.2) and the gates M2 to M5 close on Gp. Exit gates still say "green on memory (Gm)" or "green on Postgres (Gp)", never "done" for a DB-dependent behaviour.

## 3. First two weeks (proposed order)
| Track | Work |
|---|---|
| Owner and spike | E0.1 ChatSyncs questions out on day 1 (list in architecture section 4); E0.7 Cal.com account; E0.5 template copy; E0.6 account and domain; E0.9 risk note |
| Tests first | E1.T1 RLS suite, E1.11 contract harness, E2.T1 concurrency tests (all red) |
| Build (updated D20) | M1c step 1 (A0 Foundation): P3.17, P0.4, E1.11, P0.1, P0.2, then conformance and contract harness. E1.2 to E1.5 and E8.1 IaC skeleton wait for M1c exit; E2.1 fake provider is built |

## 4. Blocked items and how to proceed meanwhile
| Blocker | Blocks | Proceed meanwhile | Decision point |
|---|---|---|---|
| ChatSyncs unknowns left after the docs review (inbound auth, retries, voice and image payload, owner-phone echo, rate limits; send API and tenancy now documented but unverified) | E2.8 adapter, E2.19 and E2.20 classifier and reconcile (the F2 poller E2.21 is built on the fake now), E2.9 status, E3.6 live check, E5.3 owner WhatsApp alert live, E5.7 and E7.3 live send, E6.2 STT | Build all on `FakeProvider`; adapter written against recorded fixtures after the spike; keep the port ([0008](adr/0008-whatsapp-provider-and-inbound-fallback.md)) | No fallback provider ([0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md)). End of week 2 without an answer: nudge ChatSyncs and ask the owner for a call; work continues on the fake |
| Voice media not fetchable (A5; inbound media undocumented) | E6.1, E6.2 | Settled D10: pilot is text only; E6.5 fallback (unsupported, polite text request, owner alert) ships; pipeline built on fake media and stays off | Turn on only after a real media fixture |
| Templates not approved | E5.7, E7.3 live send | Fake template send; items wait as `held_window`; lead time is weeks, so submit in week 1 | Before M4 |
| Eval labeller not named | E4.T1, E4.13 | 60-case set is smoke only; M3 gate and pilot need 150 cases (NFR-9); no provisional pass | Name by M2 |
| Holding and notice wording (gate: approval recorded before any live holding send), `owner_alert`, `owner_reply` and `team_notice` template copy | E5.2, E5.3 live | Draft templates in the repo; fake send; owner approves wording | Before M4 |
| Cal.com unknowns (cloud vs self-host, attendee email, free-tier API, webhook signature) | E7.1, E7.8 | Fake Cal.com client; E0.7 spike answers ([0026](adr/0026-calendar-via-calcom.md)) | Before M5 |
| Plan prices and limits | E7.7 | E7.5 hard cap uses config values; tiers wait | Before pilot |
| Pilot name and onboarding date | E8.5, E8.7 | Use demo dealer fixture | M3 |
| STT vendor | E6.2 | Gateway task `transcribe` configurable; default candidate until sample test | M0 |
| Domain and DNS owner | E8.1 cert, webhook host | Staging on ALB default hostname; webhook URL changes later (cheap) | M1 |
| Supabase and LangGraph version facts | E1.5, E4.12 | MCP docs offline: treat as "verify"; short spikes with pinned versions | At the story |

## 5. Definition of done
Story done when all hold:
| Check | Rule |
|---|---|
| Test first | The named test was merged red before code, now green in CI |
| Green ladder (D20) | A story closes on Gm (green on memory repos and fakes). A milestone that depends on the DB (M2, M3) closes only on Gp (same suites green on Postgres, plus RLS suites). A cross-tenant probe on memory is a repo filter probe, not an RLS probe |
| Isolation | New table has RLS, forced, and appears in the T1 invariant and T2 probes; new route has a cross-tenant probe |
| Contract | Route shapes unchanged; new fields additive only; frontend files untouched |
| Failure paths | Typed errors; no silent drop or canned reply; fault test where an external call exists |
| Safety | No secrets or message text in logs or traces (redaction test); no secret in repo (scan) |
| Docs | ADR for any new significant decision; story links the FR/NFR it satisfies |
| Review | Reviewed by someone other than the author (or the BMAD code-review skill) |

Epic done: all stories done, milestone gate met, short retro note (what broke, what test would have caught it).

## 6. Quality gates (CI, from NFR-9)
| Gate | When it starts blocking |
|---|---|
| Lint, types, secret scan, migrations from empty DB | M1 |
| RLS probes and invariant query | M1 |
| Contract tests (per route, as built) | M1 (advisory per unbuilt route) |
| Concurrency and fault tests | M2 |
| Eval scripted run on PR; real-model full run nightly and on release | M3 |
| Fake-clock IST tests | M2 |
| Ledger linter, repo conformance suite | M1c step 1 |
| Seam suite (smoke at A3; CT1, CT2, CT6 and schema snapshots at M3) | M1c step 4 (smoke), step 9 |

## 6a. Coverage appendix (T-id to owning story)
| Test | Story | Test | Story |
|---|---|---|---|
| T1 to T9 | E1.T1, turned green by E1.2 to E1.6, E2.2 | T14 | E7.5 |
| T10 | E4.3 | T15 | E8.8 |
| T11 | E3.8 | T16 | E8.6 |
| T12 | E1.12 | T17 | E1.4 |
| T13 | E2.2 | T18, T20 | E1.7 |
| T19 | E4.5 (drift check E4.12) | SC01 to SC48 (seam) | P3.7a (smoke 12), P3.7b, P3.7c |

## 7. Sprint tracking
BMAD sprint planning (`sprint-status.yaml`) is not generated yet: it needs an epics file in BMAD format and a readiness check, which wait for owner answers on the open items. Scheduler, retention and SLA jobs all run through E2.11. Generate it from [05-roadmap-stories.md](05-roadmap-stories.md) once the owner approves this roadmap.

## Needs owner decision
1. Team size and target pilot date (sizes are relative; no dates set).
2. (Settled D8) Build on `FakeProvider` while ChatSyncs is open; no fallback provider. (D14) Questions are clarified from public docs first; no support email for now. Open: who contacts support later if docs stay silent.
   - D9: owner signs the path-key risk note (E0.9). D15: team rotates webhook keys by hand (E8.10). D11: one ChatSyncs plan per business in budget.
3. Name the Hinglish/Marathi labeller by M2 (eval set). Voice clips for E0.4 only when voice is turned on (D10).
4. Template copy for nudge, reminder, reengage and `owner_alert`, to submit in week 1.
5. Holding-reply and 4 h notice wording (en, hi, mr), `owner_alert` template copy, and Cal.com cloud vs self-host, needed by M4 and M5.
6. Accept the slip order (Sheets, tiers, Calendar, offboarding) if M5 is at risk.
7. Pilot customer and onboarding date; plan prices; domain owner; confirm assumed pilot load (5 tenants, 20 inbound/min peak, 2k messages/day).
8. H-35: who publishes the privacy page and policy text before pilot (legal copy is not engineering).
9. L-15: customer consent wording for AI replies and voice-note transcription, to go in onboarding.
10. Migration plans ([07](07-backend-migration-plan.md) 22 decisions, [08](08-agent-migration-plan.md) 9, [09](09-agent-backend-sync-contract.md) 10), each with a default. The ones that change the schedule: OD-17 (accept Gm for stories while the DB is parked), OD-16 (owner copies 9 real responses from the old app), OD-S8 (gate A3 on 12 smoke scenarios, rest at M3; the alternative adds about 18 days), OD-S9 (no checkpointer on the reply graph), OD-S5 (what "synced" means), OD-19 (image caption), OD-20 (name the labeller).
11. Is the real LiteLLM gateway (E4.1, a model key, no DB) part of "before infra"? Default: yes, at M1c step 12, so the real-model eval gate can run.

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Green on memory read as done (M1c) | RLS, constraints and pooling bugs surface late | Gm/Gp ladder; M2 and M3 close on Gp; repo conformance suite re-run on Postgres (P5.2) |
| Seam and parity work added about 97 to 124 days of new stories (221 to 291 with existing, gross) | First end-to-end reply and M3 later than the old plan | Smoke first (OD-S8), cut order P3.8b then P3.7c then P3.14; Gp and infra start only after M1c exit |
| Parity fixtures come from code reading, not recorded legacy output | A wrong fixture blesses a wrong port | Second-reader signature, FE types, 9 owner captures (P2.5) |
| ChatSyncs slow or unable, no fallback | Live messaging blocked; pilot slips | Port plus fake; tracker re-checked from public docs; recorded fixtures; owner call at week 2 |
| Owner alerts missed or Cal.com limits | Customer waits for the 4 h notice; booking falls back to visit-as-task | Three channels and reminders; E0.7 spike; fallback built regardless |
| Template approval takes weeks | Follow-ups and reminders unusable at pilot | Submit in week 1; held_window fallback |
| E4 is the largest block and eval labelling is a human bottleneck | M3 slips or gate is provisional | Start E4.T1 in M1; 60-case smoke set early, 150 required |
| Worker tenant context under pooling fails | Leak or outage | E1.5 early, test at M1 |
| Contract list from client code misses shapes | Screens break | Re-grep at E1.11; record shapes per route |
| Scope wide for v1 | Late pilot | Cut line and slip order above |
| Sizes are estimates without velocity data | Plan drift | Re-estimate after M1; sprint tracking once approved |
| Version-sensitive facts unverified (MCP offline) | Wrong assumptions | "verify" spikes at E1.5, E4.12, E8.4 |
| M1 overloaded and unscheduled | M1 slips and delays everything | Split M1a/M1b at planning; E8.1 can trail |
| ffmpeg or media tooling missing in the image | Voice slips only | Non-blocking: text-only pilot is an option; E6.1 spikes it |
| Reply latency p95 too high on the pooler | Poor chat feel | Measure at M3 and E8.7 against PRD target |
| BMAD skills were not run in their interactive mode | No `sprint-status.yaml` yet | Run sprint planning after owner approval |

## Review log
| Feedback | Action |
|---|---|
| M3 needs review_items | Fixed: E5.1 pulled into M3 |
| T10 to T19 unowned | Fixed: E1.T2 and coverage appendix (T20 added) |
| /sheets and /vapi actions break the M4 contract gate | Fixed: typed stubs in E3.9; gate excludes live-only |
| Catalog embeds missing | Fixed: E4.14, wired into E7.6 |
| Calendar Pri, hard cap Must, scheduler, eval 60 vs 150, summary item 3, appendix, pilot scale, M1, H-35, L-15, p95, ffmpeg | Taken |
| Owner Q&A 2026-10-07 (D1 to D8) | Applied: E0, E2.1, E2.12, E4.8, E4.10, E5, E7, E8.4, E8.5; ADRs 0025 to 0027 |
| Migration plans 07, 08, 09 and skeptic fixes (2026-10-08, D20) | Applied: M1c block, E4.15 to E4.38, P0 to P6, P3.5 to P3.18, E6.5 split (E6.3 now reuses E6.5b), ADR numbers 0031 to 0034, schema gap numbers G7 to G10, Gm/Gp wording |
| Anything rejected | None |

Provider portability ([0028](adr/0028-provider-portability.md)): E2.13 to E2.18 gate M2 (canonical models, conformance suite on three fake profiles, import-lint, provider per number with `endpoint_keys`, cutover test, status machine); about 15 to 20 days gross, 9 to 12 net of work needed anyway; E8.9 switch drill before pilot; optional epic E9 (Meta adapter E9.1 to E9.8, about 15 to 20 days) only on owner approval, not v1.
