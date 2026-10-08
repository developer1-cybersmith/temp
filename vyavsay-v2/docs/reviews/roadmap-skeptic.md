# Skeptic review: docs/05-roadmap.md and 05-roadmap-stories.md

**Summary**
1. Verdict: revise. Shape is sound (risk order, tests first, FakeProvider), no owner decision reopened. Story count (84) and epic sums check out.
2. 4 blockers: M3 depends on an M4 story, tenancy tests T10 to T19 have no story, Sheets contract tests conflict with the slip order, no story for embedding on catalog writes.
3. Calendar is marked Must in stories but is a slip candidate in the PRD cut line.
4. Several multi-instance and cost-control gaps (shared scheduler, per-tenant rate limits).
5. Frontend claims checked: 46 distinct `client.*` patterns (PRD says about 43), including `/sheets/${action}` and `/vapi/calls/{id}/actions`.

## Blockers
1. **M3 gate needs M4 work.** E4.5 ("send-or-hold") and E4.8 depend on E5.1 (`review_items`), but E5 is M4. M3 gate asserts held replies and the guard bars. Move E5.1 (and E5.T1 state tests) into M3, or define M3 hold as a stub and say so.
2. **Tenancy tests T10 to T19 are unscheduled.** E1.T1 covers T1 to T9 only. 03-tenancy-data lists T16 (retention) and T19 (checkpointer cross-tenant read, migration drift vs `setup()`). Nothing in E4.5, E4.12 or E8.6 names them. Checkpoint tables are created by migration, so they are exactly where an RLS or thread-id leak hides. Map every T-id to a story.
3. **Sheets vs "all contract tests green at M4".** `/sheets/${action}` is a frontend call (grep). Sheets (E7.6) is M5 and the first slip candidate, so the M4 gate is unmeetable or the route stays red. Add a stub (typed "not enabled" error, same envelope) in E3 and state it in the gate. Same for `/vapi/calls/{id}/actions`: E3.9 names only list and outbound.
4. **No story embeds catalog rows.** E4.3 builds retrieval, but nothing triggers embedding on catalog CRUD, import (E3.3, E3.10) or Sheets (H-30 repeated old failure: sync skipped embeddings). Add a job (idempotent, tenant-scoped, failure visible) and a test.

## Contradictions
- Calendar stories E7.1, E7.2, E7.3, E7.T1 are Pri M. PRD 2a makes FR-16 a slip candidate (fallback E7.4, marked S). Mark them S, with E7.4 as the must-have path.
- Summary item 3 says only the adapter, voice fetch and live template send wait on M0. Section 4 also blocks E2.9, E3.6 live check, E5.7, E6.2 (STT choice). Align the wording.
- M3 gate says full eval passes at 150 cases; section 4 allows a 60-case "provisional" set. NFR-9 says at least 150. State clearly: M3 passes on 60 only with owner sign-off, and pilot gate needs 150.
- PRD M5 includes Sheets and tiers; roadmap M5 gate omits them (fine if slipped, but say it).

## Unmet audit or NFR items
| Item | Gap |
|---|---|
| H-16, NFR-8 per-tenant rate limits | No story. Cost accounting is in E4.1, enforcement lives only in E7.5 (marked S, slip). Make the hard cap and an API/webhook rate limit Must and move out of the slip list. |
| H-35 privacy page names wrong processors | A frontend file, so no change allowed. Needs an owner decision (flag, do not edit). Not mentioned anywhere. |
| L-15 walk-in consent, NFR-10 | No story. |
| NFR-1 p95 under 15 s | Only measured in E8.7 load test. Add a latency check to the M3 eval run. |
| H-18 blocking ffmpeg | E6 has no note that transcoding must not block the event loop. |
| Webhook auth | E2.2 has fail-closed tests, but no replay or oversized body test. |

## Multi-instance and tenant risks
- Only E5.6 names a DB-lock runner. Other periodic work (SLA re-notify E5.4, checkpoint prune E4.12, purge E8.6, reminders E7.3, Sheets sync) has no shared scheduler story. Add one "single-leader job scheduler" story with a two-instance test, and make others depend on it.
- E3.5 `POST send` and E5.2 approve both write outbound: confirm they share the E2.5 outbox and the idempotency key (race test in E5.T1, name it).
- E8.2 "rolling deploy test" does not say it tests a mid-job kill during deploy. Add it.

## Realism
- M1 holds E1 (13 stories, about 25 days), E3.T1 (L) and E8.1 (L), and E8.1 needs E0.6 (owner). Without team size this is unscheduled; call M1 a range, not a week count.
- M0 "about 1 week" but E0.4 needs 30 owner clips and E0.5 template approval takes weeks. The gate should require "submitted", which it does; E0.4 should name a fallback if clips are late.
- E4.T1 labelling is a human bottleneck with no named owner; listed as a risk, fine, but the date "name by M2" is after the work should start (risk table says start in M1).

## Improvements
- Add a table T-id to story and FR to story coverage check as a roadmap appendix.
- Define "pilot scale" numbers for E8.7 (tenants, msgs/min).
- E3.T1 is L; split by route group so M1 can go advisory per group.

## Needs owner decision (new)
- H-35 privacy page text (frontend file): approve a named exception or accept the stale text for the pilot.
- Accept 60-case provisional eval only if no external customer sees replies before 150.
