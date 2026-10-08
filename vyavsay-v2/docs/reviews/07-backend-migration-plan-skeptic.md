# Skeptic review: 07-backend-migration-plan

**Summary**
1. Verdict: revise (not reject). Inventory is accurate where I checked it: 55 routes (grep of `server.<verb>(` matches), 3 cron schedules, 163 disposition rows and the action tally recount exactly.
2. 22 legacy citations spot-checked (routes, cron lines, reminder timers, webhook 76/92, health 9/22, 150-cap, historyLoadLimit 50, shouldReply gate, env keys, rate limiters): all hold.
3. Real gaps: items the plan missed (section A), a parity method that cannot catch wrong fixtures (B), contradictions with ADR 0012 and the roadmap (C), and thin AI-behaviour parity (D).
4. Four blockers, listed below. None needs a frontend change.
5. Sizes cover only the 24 new stories (39 to 48 days); the 16 amended and ~60 existing E2/E3/E5/E7 stories are unsized here.

## Blockers
| # | Finding | Evidence | Fix |
|---|---|---|---|
| B1 | Owner dashboard reads `total_voice_calls` (and `total_messages`); plan drops the `wb_calls` table and R40 never says what this key becomes | `OwnerDashboard.tsx:20,34`; `owner-routes.ts:79,102` counts `wb_calls`; plan has no mention (grep) | R40 row: keep key, return 0, add to read-set |
| B2 | Plan 4a.3 / 4d add `provision_tenant` and `resolve_membership` to "the fixed list of ADR 0012". ADR 0012 and AGENTS.md list neither, and omit 0028's `resolve_number_ref` | `adr/0012:11-12`; plan 4a.3, 4d | Either amend ADR 0012 in the same change (new ADR) or say these are new; do not call the list fixed |
| B3 | Parity oracle is circular: fixtures, read-sets and code are all written by the same agent from the same reading; "merged red first" proves only that a test failed, not that the fixture matches legacy. Ledger linter checks ids exist, not truth | plan 2a, 2c, Risks row 1 | Make "second reader signs each L1 fixture against its cited line" a done-criterion (not just a risk mitigation); take FE types as second source; ask owner for 5 to 10 real captured legacy responses (list leads, conversations, catalog, customers/:id, analytics, owner overview) for L3 on the riskiest shapes |
| B4 | Pilot-critical text-only path (E6.5, FR-5 unsupported kinds) is slotted in A6, last; A2 messaging spine and A3 hold logic need it to be "done" per PRD FR-5 | plan 3c E6 row; PRD FR-5 | Move E6.5 into A2 (it is plain ingest branching) |

## A. Legacy items the plan missed or only half covered
| Item | Legacy evidence | Why it matters |
|---|---|---|
| Customer name overwritten on every inbound | `pipeline-service.ts:111-116` updates `customer_name` each message | A manually corrected name flips back; decide keep or fix (no CHG row) |
| Image with caption: caption was processed as text | `webhook-routes.ts:365-381` | v2 FR-5 stores image as unsupported and drops the caption text; add to CHG-13 or keep caption as the text |
| Empty transcript = silent skip (no reply, nothing stored) | `webhook-routes.ts:315-318` | Opposite of ADR 0025 (never silent); fine because voice is off, but add an absence test for when voice is enabled |
| Outbound pacer `rateLimiter(3000)` (1 msg per 3 s per session, anti-ban) is dead but is a distinct file | `utils/rate-limiter.ts:47`, never imported | V37 names only the inbound limiter; intent (send pacing) has no home while ChatSyncs rate limits are unknown |
| Public-route check is `startsWith`, not exact | `auth-plugin.ts:34` | Plan says exact match (good) but should name it a CHG; `/api/healthcheck` etc. were public |
| Storage buckets auto-created at first use (`listBuckets`/`createBucket`) | `catalog-image-service.ts:44-57`, `message-media-service.ts:12-24` | Boot side effect with no v2 equivalent (blob bootstrap); I20 covers "public" only |
| Env keys `AI_MODEL`, `AI_VISION_MODEL`, `GOOGLE_SHEET_NAME`, `SUPABASE_STORAGE_BUCKET`, `GROQ_API_KEY` | `ai-router.ts:19-20`, `agent/openai-client.ts:16`, `environment.ts` | I34 lists dropped keys but not these; add so the env audit is closed |
| PATCH /users upserts (creates a row if missing) | `user-routes.ts:57` | BH13 covers it, but R17's row does not say what pending-tenant PATCH-before-GET does |
| `language` and `summary` written by a fire-and-forget after-reply task | `pipeline-service.ts:396-399` | Agent plan owns summary; nobody owns `language` update (G3 lists the column only) |
| `negotiation_round`, `intent`, `confidence` stored on the conversation each turn | `pipeline-service.ts:296,574` | Not read by the FE (grep), so safe to drop, but absent from the disposition table |

## B. Parity strategy limits
- FE read-set (P2.2) is a static parse of TSX. Spreads, aliasing and destructured props defeat it. Say what it cannot see and require the P2.3 smoke before M3, not "S priority".
- P2.3 is manual and needs owner OK to run the frontend; it is the only L2-to-L3 bridge and it is optional (Pri S). If skipped, nothing detects a wrong key name.
- 41 golden fixtures at size M (P2.1) is optimistic; each is hand-derived from 50 to 250 lines of route code.
- Section 2 says "no dual run", yet A7 exit gate and P5.2 say "Dual-run diff empty". Rename (memory vs Postgres), or readers will think legacy is run.
- Memory-repo leak probes prove the memory store, not RLS. Cross-tenant "L" tests on A4 give false confidence until P5.2; the plan should say the L column stays `parked` for PG (it does), but exit gates ("All 41 FE routes green on memory") read as done.
- Roadmap M2 defines done with Postgres-backed suites; plan 6b amends every E2/E3 story to "green on memory". This quietly weakens roadmap milestones. Needs an explicit owner line, not a table row.

## C. Contradictions and scope
- ADR 0012 / AGENTS.md: see B2.
- Plan renames architecture layout (`domain`, `worker`, `db` to `core`, `jobs`, `adapters/postgres`). It asks OD-13, but OD-13 also bundles unrelated placeholder wording; split it.
- R50 typed 501 stub plus CHG-24 means the walk-in mic button errors where it worked; PRD says voice off for conversations, not for staff walk-in capture. Confirm that was the intent (OD-12 is a bundle of two unrelated asks: daily report and walk-in).
- Scope creep: P1.7 (STT gates, size S, Pri S) and P2.3 smoke are voice-adjacent or optional; fine to keep, but P1.7 builds code for a feature D10 turned off.
- "A4 can run beside A2 or A3" contradicts "slices are sequential" (one developer, D16).

## D. AI behaviour and eval
- Everything model-dependent (V17, V18, V21 thresholds, I21-I23, RL03 to RL10) is marked `E` and sent to the agent plan. This plan harvests no legacy cases. Cheap, concrete fix: extract the legacy rules as eval seeds now (negotiation 8% default and 4-round cap, location 4 variants, slot-alternatives text, complaint/sentiment < -0.5 handoff, budget parser inputs) and list them as P-stories, so "eval set, not diff" has actual starting cases.
- Retrieval thresholds 0.4 and 0.35 are carried as "starting values" with no calibration set, and the Jina to new-embedding-model change invalidates them. Name the story and the minimum cases.
- Roadmap line 50: eval labeller (Hinglish/Marathi) is unnamed; the plan relies on E4.13 but does not mention the blocker.
- V16 buying-signal score and RL11 are deferred "after M3" with no trigger metric.

## E. Order and size
- Tests-first is stated per slice and in 2c; but P0.1 (app factory, size S) must precede the first red contract test, and the existing `/health` test is the only code test today. Fine, but the "red first" claim for A0 is untestable until P0.4 exists; sequence P0.4 first.
- P0.3 (memory repos plus conformance suite, L, 4 to 5 days) must model ~20 repos with RLS-grade strictness; likely 8+ days. P3.2 (atomic post-step, kill tests) likewise.
- Unsized: 16 amended stories plus all E2/E3/E5/E7 stories reassigned to A2 to A6. A "39 to 48 days" headline will be read as the whole backend.

## Needs owner decision
| # | Question | Suggested default |
|---|---|---|
| 1 | Accept weakened "done" (green on memory) for E2/E3 until DB resumes? | Yes, but M2/M3 still require Postgres re-run |
| 2 | Ask owner for captured legacy responses for L3 on 6 to 10 key screens? | Yes, one-time, no code run by us |
| 3 | Walk-in voice (R50): stub until STT, or keep for staff use? | Stub (as plan) but confirm |
| 4 | Customer-name overwrite and image-caption handling: keep or fix? | Keep first name set by owner; keep caption as text |

## Risks
| Risk | Impact |
|---|---|
| Wrong L1 fixture is blessed by green tests | Frontend break found only at pilot |
| Memory store laxer than RLS in subtle ways (cross-tenant joins, composite FKs) | Leak tests pass, Postgres fails later |
| Headline estimate excludes most backend stories | Schedule surprise at M2 |
| Agent plan inherits no legacy cases | Behaviour regressions undetectable (negotiation, location, handoff) |

## Resolution
Author response, 2026-10-08. Plan: [07-backend-migration-plan](../07-backend-migration-plan.md). Ledger: [backend-parity-ledger](../parity/backend-parity-ledger.md).

**Summary**
1. All four blockers fixed.
2. All ten missed items added (ledger now 195 rows: +BH24 to BH28, V41 to V43, I36; CHG-28 to CHG-30).
3. 9 of 10 improvements taken in full; one taken in part (see "Rejected or only partly taken").
4. Two skeptic citations corrected on re-read (bucket creation is lazy, not at boot; the `startsWith` is at `auth-plugin.ts:31`, list at :15-19).
5. Cross-doc issues for the other documents are listed at the end.

### Blockers
| # | Resolution | Where |
|---|---|---|
| B1 | Fixed. `total_voice_calls` kept at top level and per business, returns 0; read-set lists all 11 top-level and 13 per-business keys; CHG-30 (visible, platform owner only), BH28 | R40, 5, E3.8 |
| B2 | Fixed by describing the list truthfully, not by calling it fixed. `provision_tenant` is already in ADR 0014, `offboard_tenant` and `enqueue_owner_action` in 03-tenancy and ADR 0017, `resolve_number_ref` in 0028. Only `resolve_membership` is new; ADR 0031 (P0.2) records it as an amendment to 0012 with a probe case | 4a.3, 4d, 4e |
| B3 | Fixed. Second-reader `signed_by` is a done-criterion checked by the linter; FE types are a second source (P2.4); owner captures 9 responses (P2.5, OD-16); mutation probe per fixture. Stated limit: the second reader is still a model, so captures are the only external oracle and routes without one are marked "L1s only" | 2c, 2g, P0.4, P2.1b |
| B4 | Fixed with a split: E6.5a (ingest branch, `unsupported`, polite reply through the outbox, no agent run) is in A2; E6.5b (review item and alert) needs E5.1 so it lands in A3. FR-5 is done when both pass | 3a, 3c, 6b |

### Missed items (section A) and improvements
| Item | Resolution |
|---|---|
| Name overwrite | CHG-28, BH24, P1.9, gap G8, OD-18. Default: fix |
| Image caption | BH25, CHG-13 amended, OD-19. Default: caption visible to the owner, no agent run, because FR-5 says never an agent run on these. Rejected as written: "keep caption as text" would let the agent reply and contradict FR-5; offered as the alternative in OD-19 |
| Empty transcript | BH26, red test E6.T1 until voice is on |
| `startsWith` public paths | CHG-29, BH27, `test_chg_29_public_routes_exact` |
| Bucket creation | I36, drop; infra provisions private buckets. Correction: legacy creates them lazily at first use (`catalog-image-service.ts:44-57`), not at boot |
| Dead outbound pacer | V41, P4.3, setting default 3000 ms until CQ-21 |
| Missing env keys | Section 1f closes the audit (26 config keys plus `AI_MODEL`, `AI_VISION_MODEL`, `USE_AGENT_GRAPH`, `AUTH_SESSIONS_DIR`) with a `test_env_audit_closed` |
| Language and summary after reply | V43; post-step writes `language` every run (P3.2a); `summarize` job owns summary |
| PATCH /users upsert | R17 note: PATCH before GET runs `provision_tenant` first; unconfirmed email 403 |
| negotiation_round, intent, confidence columns | V42, drop; FE reads none (grep) |
| Weakened "done" | OD-17, ladder Gm and Gp, 6b first row; M2 and M3 close only on Gp |
| "Dual run" wording | Renamed (Gm vs Gp, a test re-run); section 2 intro, A7 gate, P5.2 |
| Memory proves less than RLS | New 2e table; probes renamed "repo filter probe"; exit gates say Gm |
| P2.3 optional | Now Pri M, a gate before M3; blind spots stated in 2f; `blind: true` manifest flag |
| Legacy eval seeds | P6.1 (counts and `legacy_ref`s), P6.2 (threshold calibration, 30 + 30 queries); labeller is OD-20; V16 trigger set (owner overrides the AI score on more than 25 percent of leads over 4 weeks after M3) |
| Estimate covers only new stories | 6c now shows new (about 56 to 72), existing assigned (about 124 to 167) and the sum; P0.3 split (P0.3a 6 to 8 days), P2.1 split (P2.1b 8 to 10 days), P3.2 split |
| Sequencing | P0.4 first in A0; "A4 beside A2/A3" removed, slices strictly sequential (D16) |
| Split OD-12 and OD-13; confirm walk-in 501 | OD-12a/b, OD-13a/b; OD-12b notes the PRD lists the route in the FE contract (`01-prd.md:131`) and D10 covers customer chat, not staff capture. Default stays the stub, now an explicit question |
| P1.7 builds voice code | Deferred, no slice; built when voice is turned on |

### Rejected or only partly taken
| Item | Decision | Reason |
|---|---|---|
| "Keep caption as text" (owner decision 4, default) | Partly | Conflicts with FR-5 (no agent run on unsupported kinds); caption is kept visible instead, alternative in OD-19 |
| "Second reader signs" as independent proof (B3) | Partly | A second model session is not fully independent; captures are added for that reason and the limit is written down |
| V16 buying-signal "needs a trigger" | Taken as a stated trigger, not a story | No FE reader; revisit only after pilot data |

### Cross-doc issues (not edited here)
1. 08 and 09: 09 s0 row 10 already settles ADR numbers (0031 data layer, 0032 prompts, 0033 parity, 0034 contract); 08 still says 0031 for prompt layering (E4.31, s2.2). 08 should follow 09.
2. 08 (E4.T1, E4.13, R5): import the P6.1 legacy seeds instead of re-harvesting, and give the retrieval-threshold calibration (P6.2) a story or point to it.
3. 09: the Apply row and RunReport should list `conversations.language` and the unsupported-kind path (E6.5a in A2, E6.5b in A3, no `agent_run`).
4. ADR 0012, AGENTS.md, 03-tenancy: the SECURITY DEFINER list is spread over four places; one consolidated list should go in ADR 0031's amendment. AGENTS.md still says "fixed list (ADR 0012)".
5. 05-roadmap and 05-roadmap-stories: adopt Gm and Gp wording; split E6.5 into E6.5a and E6.5b; E6.5 depends on E6.3 which depends on E5.1, so as one story it cannot finish in the messaging slice.
6. 01-prd: FR-5 says no agent run on images; OD-19 asks whether a caption changes that. Line 131 lists `/voice/extract-walkin` as a contract route without saying it is a stub in v1 (OD-12b).
7. 03-tenancy-data: add G8 (`contacts.name_source`) beside G1 to G6 here and G7 in 09.
