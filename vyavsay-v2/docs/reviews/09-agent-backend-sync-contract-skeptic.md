# Skeptic review: 09 agent-backend sync contract

**Summary**
1. Verdict: revise. The contract design is strong, but it has 4 blockers: a hidden frontend dependency (lead score), a parity strategy that cannot detect behaviour regressions, scenarios written after the code they test, and sizes that do not fit.
2. Legacy citations are accurate: 24 spot-checked (T01 to T03, T07 to T09, T11 to T16, T17 to T23, T29, T30, T37, T39, T40), all land on the stated code. No false cite found.
3. Inventory misses found in legacy (below): lead `score` ladder, `buying_signal_score`, `negotiation_round` counter, sold-item replies, conversation `language` and `customer_name` writes, fail-open classify fallback.
4. The seam itself (laws L1 to L7, post-step, race rules) is sound and consistent with ADRs 0023, 0025, 0028. No DB or infra dependency is unstubbed.
5. Findings below are ordered by severity. B = blocker, I = improvement.

## Blockers
| # | Finding | Evidence | Fix |
|---|---|---|---|
| B1 | **Lead `score` has no home in the contract.** Frontend renders `lead.score` (high/medium/low, star on high). Legacy upgrades score only upward (`pipeline-service.ts:736-760`, `scorePriority`), and the graph path hard-codes it (`persist.ts:75`). `LeadProposal` carries only a funnel stage. 08 A13 says buying signals "feed lead score", so 09 contradicts 08. | `frontend/src/pages/Leads.tsx:142-160, :364`; 09 s2.2 `Proposals.lead`; 08 A13 | Add `score: Literal[high,medium,low]` to `LeadProposal`, forward-only rule in `core/rules/funnel.py`, add SC38 variant. State who computes it (understand node) |
| B2 | **Parity cannot detect behaviour regressions.** Twins (CT6) compare a hand-written `scripted` result with a hand-written `llm_script` chosen "so the graph produces the same result". That tests plumbing, not agent behaviour; both sides are authored by the same team to match. "A mismatch means ... whichever is right" is circular. Legacy was never run, so there is no golden legacy output. The real-LLM check is pushed to "nightly, outcome classes" in 08 with no pass threshold stated in 09. | 09 s3.1 CT6, s4.2 twin rule, Risks row 2 | State plainly that 09 proves seam correctness only, not behaviour parity. Add: legacy behaviours as eval cases with a named threshold (08 owns), and an explicit "behaviour parity = eval gate" line in the Summary so nobody reads green CT6 as parity |
| B3 | **Tests-first is inverted.** P3.7 (scenarios SC01 to SC42) depends on P3.2 (post-step implementation); P3.6 harness also follows P3.2. Scenarios are written after the code. P3.17 (ADR 0034) has no deps yet the roadmap section says v1.0 freezes before S2. | 09 s8 rows P3.6, P3.7, P3.17; AGENTS.md write-tests-first rule | Reorder: P3.17 -> P3.1 -> P3.5 -> P3.6 -> P3.7 (red) -> P3.2 and P3.10, P3.12, P3.13 (green). Split P3.7 into red-first batches per slice |
| B4 | **Sizes unrealistic.** P3.7 = 42 scenarios with expected snapshots in "M, 2 to 3 days" (about 5 min per scenario); P3.6 world harness (fake clock, gates, fault injection, canonical snapshot, loader) is also M; P3.14 builds 14 failure modes incl. watchdog and retry budget in M; P3.8 twins 20+ scripts in M. "Priority" column is "M" on every row, so it carries no information. Net 17 to 23 days is likely 2x. | 09 s8, Roadmap impact | Re-size: P3.6 L, P3.7 L or split in 3, P3.14 L, P3.8 L. Give total range 30 to 40 days or cut scenarios to a smoke set for A3 and run the rest later. Drop or define Pri |

## Missed legacy behaviours (not in T01 to T40 or the ledger)
| # | Legacy item | Where | Why it matters | Suggested disposition |
|---|---|---|---|---|
| M1 | `buying_signal_score` accumulation and "close-mode" prompt note at >= 0.7 | `pipeline-service.ts:306-317` | Only RL11 (deferred) covers it. B1 depends on it | Name in 09: signals are `understand` outputs, no steering note; add to ledger |
| M2 | `negotiation_round` counter persisted per conversation, escalate when round > maxRounds (4) | `pipeline-service.ts:570-592` | T24 lists guard G5/G6 only. v2 has no round counter, so "pushy haggler" behaviour changes silently | State as dropped with reason (ADR 0025 over-authority holds), or add `facts_known.negotiation_rounds` |
| M3 | Sold items and alternatives shown to the customer (3 sold + 3 alternatives) | `pipeline-service.ts:487-491, :596` | `CatalogReadPort.search` returns Found/NotFound top 5; sold items are not offered, so a customer asking about a sold car gets "not in stock" and no alternatives path is in 09. 08 R8 half-covers it | Add `status` and `alternatives` to `ItemView`/`Found`, or state the change |
| M4 | Conversation writes `language` (with summary) and `customer_name` overwritten each inbound | `pipeline-service.ts:112, :398-400` | 09 has `ConversationView.language` but no writer. `summarize` job writes summary only | Name the owner of `conversations.language` (post-step from `RunReport.language`) |
| M5 | Classify fail-open: on analysis failure the graph assumes `general_question`, confidence 0.3, `should_auto_reply=true` | `agent/nodes/classify.ts:55-70` | Opposite of v2 fail-closed. Intentional, but not recorded as a disposition | Add to T26 row: "fail-open dropped; fail-closed by L6" |
| M6 | Sentiment handoff: `sentiment.polarity < -0.5` triggers handoff, not only `complaint` intent | `pipeline-service.ts:617-619` | T25 mentions complaint only. If `understand` lacks sentiment the trigger is lost | Confirm `understand` schema has a frustration field; add to T25 |
| M7 | Low-confidence silence: gate fails with an `escalation_reason` -> no reply, no pause, no alert | `pipeline-service.ts:709` | T19 says "confidence gate dropped" but not what replaces silence. ADR 0025 hold covers it only if the model sets a reason code | State the replacement (hold with `wants_human`/`over_authority`, or draft anyway) |
| M8 | Customer upsert into customers table from every inbound | `pipeline-service.ts:129-139` | Belongs to ingest, but 09 s1.1 lists "contacts" without a row for it. 07 R43 drops customer POST | Add one row to T-table pointing to ingest |
| M9 | Lead stage `followed_up` set by the 6 h nudge cron | `cron-service.ts:103-126` | T30 maps the cron but not its side effect on lead stage | Note: follow-ups no longer change lead stage |
| M10 | Graph `escalate_to_human` pauses AI (`ai_paused=true`); path A never did | `agent/tools.ts:184-189` | T15 maps the tool; not the pause semantic. v2 equals "pause while item open" (OK) but say it | One clause in T15 |

## Other findings
| # | Sev | Finding |
|---|---|---|
| I1 | Med | SC12 and FR-5: voice/image never reach the agent. Good. But the touchpoint rows T10, T22, T26, T29, T38 are dropped or deferred, and the ledger rule says the linter "fails if one has no test". Dropped rows need an absence test or an `n/a` class, otherwise the linter blocks on rows that have nothing to test. Define it |
| I2 | Med | Roadmap impact says "No slip-list change" while adding 17 to 23 days to weeks 2 to 6 and gating M3. 05-roadmap's own slip order is Sheets/tiers/Cal.com. Either the gate adds time (say so) or name what slips |
| I3 | Med | Scope creep: P3.15 (`AgentTasks`, summarize wiring, walk-in) overlaps 07/08 stories (E4.36) and walk-in is a 501 stub (OD-12). Remove walk-in from this contract until E6.4. `TraceEvent`, `TraceSink`, `llm_usage` ledger semantics are agent-plan/E4.10 scope; keep only the port |
| I4 | Med | Contract has 3 sources of "guard facts": backend builds `GuardFacts`, graph builds the same type. Divergence is then scored, but nothing says what share of divergence is acceptable or which alert fires. Add a threshold or an eval check |
| I5 | Low | s0 #10 proposes renumbering ADRs 0031 to 0034 across two plans; do it in one commit with link fixes or links in 07/08 rot |
| I6 | Low | SC24 reads 04 s2.3 ("third run is not restarted") one way and flags OD-S2; ADR 0023 text says "max 2 restarts". Fix the ADR wording before building |
| I7 | Low | OD-S1 says 35 s to holding reply on crash; the customer-facing target in 04 is not cited. Cross-check against NFR latency |
| I8 | Low | F7/V7: checkpoint resume is marked verify; fine. But V7 "discard checkpoint on version mismatch" plus thread id including `job_id` means resume rarely applies; consider dropping checkpoints for the reply graph entirely (every tool is a read) |

## Checked and fine
| Area | Result |
|---|---|
| Citations T01 to T03, T07 to T09, T11 to T18, T20 to T23, T29, T30, T37, T39, T40 | Exact |
| T39 "dead branch" (150 cap) | Plausible: history load limit is below 150 (value not re-verified) |
| Decisions: LangGraph Python, hold-and-escalate, Cal.com, provider portability, text-only | Consistent; no contradiction found |
| DB and infra | All stubbed with memory impls; plug-in table s7 complete |
| Story arithmetic | 14 stories, 8 S + 6 M, 20 to 26 days: sums correct (sizing is the issue, B4) |

## Needs owner decision
| # | Question | Default |
|---|---|---|
| Q1 | Is "seam proven, behaviour parity by eval gate" an acceptable meaning of "syncs correctly"? (B2) | Yes, with eval thresholds named in 08 |
| Q2 | Is lead score (high/medium/low) kept as shown on the Leads page? (B1) | Keep; agent proposes, backend applies forward-only |
| Q3 | Customer asks about a sold car: show alternatives as before, or "not in stock"? (M3) | Keep alternatives |
| Q4 | Accept 30 to 40 days of seam work or a smaller A3 smoke set first? (B4, I2) | Smoke set first (about 12 scenarios), full set before M3 gate |

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Green seam suite read as behaviour parity | Regressions ship (replies worse than legacy) | B2 wording; eval gate is the parity gate |
| Frontend breaks on missing lead score | Leads page shows "new" for all | B1 |
| Late-written scenarios fit the code | Tests miss real bugs | B3 reorder |
| Underestimated A3 slice | M3 slips | B4, I2 |
| Static reading only; more hidden paths | Missed behaviours | M1 to M10 added to ledger; re-grep before A3 starts |

## Resolution
Author response, applied to [09-agent-backend-sync-contract.md](../09-agent-backend-sync-contract.md), the parity ledger and `prompts/README.md`. Nothing rejected outright; two items are taken in part.

| Item | Status | What changed (09 section) |
|---|---|---|
| B1 lead score | Fixed | `LeadProposal` gains `score`; `understand` computes it; forward-only for stage and score; also carried by `ReviewRequest`; new s0 row 11, T21/T43, SC43, ledger RL06/RL11, prompts README. Also corrected a cite: graph path passes the constant `'medium'` at `persist.ts:150-155` (the upward compare is `:57-66`), not a hard-coded value at `:75` |
| B2 parity | Fixed | Summary line 2, CT6 renamed "plumbing twins", twin rule no longer says "whichever is right", new s4.4 states seam-only proof, no golden legacy output, bars from 08 s3.6, and the eval classes 09 asks 08 to add (`LS` and others). New risk row |
| B3 tests first | Fixed | s8 reordered with a Step column: P3.17, P3.1, P3.5, P3.11, P3.6, P3.7a (red), then P3.2 and the green stories. P3.2 now depends on the red smoke set. `apply_outcome` stub raises until then |
| B4 sizes | Fixed | Day ranges instead of S/M; Pri replaced by a Gate column (A3, S2, M3); P3.7 and P3.8 split (smoke first); total 41 to 52 gross, 38 to 49 net; "does add time" admitted; Q4 default is smoke first |
| I1 absence tests | Fixed | s5 test-reference rule: scenario id, `A:<check>`, or `n/a(reason, revival)`; ledger "How to use" row |
| I2 roadmap | Fixed | Roadmap impact says the gate adds time and names a cut order |
| I3 scope | Fixed | Walk-in removed (T11, T37, `AgentTasks`, P3.15); `TraceEvent` sketch and `llm_usage` semantics removed, port only (s2.5) |
| I4 divergence | Fixed (proposal) | Divergence classes and budget in s2.5, F10, alert in s7 |
| I5 renumbering | Fixed | P3.17 does it in one commit with link fixes and a link check |
| I6 SC24/OD-S2 | Taken in part | SC24 blocked until P3.17 rewords ADR 0023. The ADR is not edited here (other doc): cross-doc issue reported |
| I7 35 s | Taken in part | OD-S1 now cites PRD s6 (hold within 15 s) and NFR-1 (p95 15 s) and states the reading. PRD wording of the clock start is a cross-doc issue |
| I8 checkpoints | Taken in part | V7 proposes no checkpointer for the reply graph, OD-S9 asks the owner; 02 s7, ADR 0018 and E4.12 are other docs: reported |
| M1 | Fixed | T43: signals feed `score`; no accumulator, no steering note |
| M2 | Fixed | T24, s0 row 12, SC45: counted from history, `cfg.negotiation_max_rounds` default 4, OD-S10 |
| M3 | Fixed | `ItemSearch` (5 available, 3 sold, 2 alternatives), `ItemView.availability`, T44, SC44, OD-S7. Alternatives are 2 (08 R8), legacy 3 |
| M4 | Fixed | T42, SC48: ingest writes `customer_name`, post-step writes `language` from `RunReport.language` |
| M5 | Fixed | T26: fail-open dropped on purpose (L6) |
| M6 | Fixed | T25, reason code `negative_sentiment`, SC46; boundary moves from below -0.5 to at or below (08 E4.24) |
| M7 | Fixed | s2.4 "Never silent" row, reason code `agent_unsure`, T19, SC47 |
| M8 | Fixed | T41 |
| M9 | Fixed | T30 note and `A:followup_keeps_stage` |
| M10 | Fixed | T15 clause |
| Rejections | None | Q1 to Q4 answered as defaults in OD-S5 to OD-S8 |
