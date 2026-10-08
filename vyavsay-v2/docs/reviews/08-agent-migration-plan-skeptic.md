# Skeptic review: 08 agent migration plan

Verdict: **revise** (no code-level blockers; 3 design blockers in the parity/eval strategy and 2 contradictions).

Spot-checked 18 cited legacy items against code; all matched: pipeline-service gate :525-531, complaint no-pause :618-630, 150 cap :170-183, negotiation rounds :569-592, floor text :1151-1153, budget parser :1239-1258, signal weights :843-858, `slice(0,-1)` ai-router:226, params `used-cars:408-411`, maxRounds/default 8% :387-388, `confirmed_slot` tools:136, `USE_AGENT_GRAPH` webhook:14, cron 48 h :104, summary writes language :399, `cloudClient as baileysAdapter` alias, scarcity/social-proof lines :252-257, regex patterns :70-93, `customerFacts` regexes. Minor: T9 says the legacy parser handles "k"; it does not (only lakh/lac/l, crore/cr, plain 5-8 digits). The "91 elements" count includes 2 rows marked new (T12, X11).

## Blockers

1. **Hard checks are graded by the code under test.** H2, H3, H4 use G2, G5, G6, G4, G3 on the final text. The final text already passed the guard, so floor leak and invented claim read 0 by construction in real mode. A guard bug passes both the product and the grader. Fix: independent grader (fixture-known floor, cost and claim strings scanned by a separate simple implementation), and also measure the pre-guard draft violation rate per class.
2. **Flake rule contradicts the "0" bars (3.6 vs 3.6 last para).** Safety classes run x3, yet a case blocks only if 2 of 4 reruns fail, so a floor leak seen in 1 of 4 passes. Also, rerun "at temperature 0" adds no information. Fix: any safety-class failure in any repeat blocks; flake rule only for soft/helpfulness cases.
3. **Sample sizes cannot demonstrate the NFR bars.** "Ungrounded price under 1%" (PRD s6) needs about 300 independent statements (rule of three); GR has 30 cases. 170 cases are about 35 scenarios x up to 5 language variants, so independent n is lower still; IJ "0 of 25" is about 5 scenarios, upper 95% bound near 10%. Intent 85% over 23 intents with about 1 to 7 cases each is noise. State the bars as smoke thresholds (not NFR evidence) or size the set; say how many distinct scenarios there are.

## Contradictions with other docs

4. **Rounds counted from history vs history window.** P12/E4.32 count negotiation rounds "from message history"; A6 loads only the last 12 messages plus a summary, and A11 drops per-message intent storage (intent lives on `agent_runs`). Rounds older than the window vanish, so the over-authority escalation can never fire in a long chat, and a "round" cannot be identified without joining `agent_runs`. 09 T24/SC45 assume it works ("history shows 4 earlier rounds"). Needs a defined source (e.g. `facts_known.price_pushbacks` proposed by `understand`, applied by the backend) or a window rule.
5. **S2 exit test needs things built later.** S2 requires "10 smoke twins in mode R" and "smoke passes", but prompts are authored in E4.30 (S5), the gateway plugs in at S7 (E4.1), and the `understand` fallback tests need schemas from prompts. S3 GR cases run on a lexical fake, but R5 threshold gate (P6.2) needs real embeddings, and A17/R6 "diesel SUV under 8 lakh" is semantic. Reorder: author minimal prompts with S2, or label S2 twins as scripted only. Say that retrieval quality is unmeasured until pgvector/Jina.
6. **AI disclosure (PRD FR-25, 04 item 8) is missing.** Legacy prompt says "You are Rahul ... You are NOT a bot" (`used-cars:207`), "NEVER say I'm an AI" (:237, rule 1), and `Never say you are AI` in the voice agent. Doc 08 2.2 does not list these as deleted, and no BEC row, template or eval case covers the disclosure line. Add to 2.2 (delete), plus a case and lint rule.

## Missed legacy elements

7. **Phone voice agent** (`routes/vapi-routes.ts:216-340`, `services/voice-service.ts:364-450`): two more prompts with "Priya ... in Pune" persona, hard-coded city, gpt-4o / gpt-4o-mini, own tools (search, book, escalate). Doc 07 handles the routes; doc 08 has no row. Add a drop row (PRD: no phone calls) and add "Priya", "Pune", "Rahul", "OpenAI" to the lint ban list.
8. **Lead `summary` from `analysis.summary_update`** (`pipeline-service.ts:766,780`) is what the Leads page shows (`Leads.tsx:170`). v2 `understand` has no such field and `summarize` is conversation-level. No row, no decision.
9. **Conversation `language` persisted with the summary** (:399). X1 covers detection, not storing it; C2/C10 have no language field for the next turn's reply language and templates.
10. **Two scores.** `lead_score` (model) vs `buying_signal_score` (additive, persisted, never decreases; sentiment > 0.5 adds 0.05; 0.4/0.7 tiers feed "BUYING INTENT" in memory :1016-1017). A13 and LS eval class collapse them without saying which is kept. LS expectation "signals map to high/medium/low" has no defined thresholds, so it is not testable.
11. **Negotiation extras** (:1140-1190): "gap <= 0 or at floor: final approval, I confirm" is a promise; invented counter "listed x 0.96 rounded to 10k" with no floor; both missing from the NG seeds list. Add as `dropped` negative cases.
12. **`escalation_reason`, `should_auto_reply` and `autoReplyIntents` override** (:525-531) are dropped under A18 with the confidence gate but no mapping says what v2 does for intents flagged `escalate`/`autoReply:false` in P10.
13. **Reply rule 10** "main team se check karke batata hoon" (`used-cars:~245`) and examples :311-318 teach promise and claim phrasing ("single owner, full service history"). They must not enter draft few-shots; lint bans only listed words.

## Eval and parity strategy

14. **Oracle.** Legacy is rightly not an oracle, but almost every row is `fixed`/`redesigned`, so "parity" is really "v2 meets its own spec". Say so in the Summary; the title and parity matrix suggest more. Regression against legacy sales effectiveness (conversion tone) is unmeasured.
15. **Circular expectations.** "Expected outcomes follow v2 rules (authority 0)" and mode-S twins are written by the same team as the code. Labeller is unnamed, and Marathi has no reference; the gate stays provisional (honest), but NFR-9 "CI blocks release on eval set" is then not enforceable at M3. State the fallback explicitly.
16. **Judge bias.** Soft scores are computed only on cases that passed all hard checks: a change that adds holds raises average S1 to S4 (survivorship). Soft metrics are only compared with a baseline created by the first v2 run, so a weak first run becomes the standard; 3.6 has no absolute floor for S1 to S4. The judge's family is "different from the generator" but nothing enforces it when gateway config changes. Calibration of "30 to 50 labels" has no agreement threshold or per-language minimum (Marathi would be about 10).
17. **NFR ties.** Latency bar measured with "fixture tools" cannot verify NFR-1 (receipt to send, includes queue, DB, provider). "Holding reply within 15 s: 100%" on a fake clock is trivially true. Outcome 90%, false-hold 10%, language 95%, intent 85% are marked proposals and not tied to a PRD line; PRD section 6 bars are the only sourced ones.
18. **Per-PR gate on a real cheap model** (about 40 cases) is non-deterministic and needs a secret in CI; contradicts "no key in CI" for slices and the flake rule. Decide: PR = scripted only, real model = nightly.

## Sizes and ordering

19. E4.30 (M): 4 prompts, about 40 few-shots, 20 templates in 4 languages with owner approval, Marathi written new. Realistic L plus an external dependency. E4.17 (M) maps about 90 rows to cases that do not exist until E4.13 (L, labeller). Authoring 170 cases x variants is carried by E4.T1/E4.13 only, not by any S0 to S7 slice; it gates S2/S7 but sits outside the order notes.
20. Tests-first is claimed but E4.17 (BEC, red tests) comes in S1 after S0 while E4.T1 "layer-1 guard tests (red)" is not scheduled before E4.6. Put the red guard tests and 10 cases at the start of S1.

## Fine as is

Disposition actions for A1 to A24, B-path "ideas only", RAG R1 to R11, hold-and-escalate alignment with ADR 0025 and D1 to D4, caps with ADR 0018 (4 tools, 2 rounds, 6 calls), P12 now consistent with 09 T24, D10 (voice/image deferred), D20 (fakes first).

## Resolution (author, 2026-10-08, revision 2)

Verdict addressed: all 6 blockers fixed, all listed improvements and missed items taken, no finding rejected outright. Where a fix is partial, the reason is stated.

| # | Finding | Result | Where |
|---|---|---|---|
| 1 | Grader is the guard | Fixed: independent grader (E4.39), fixture-known strings in all written forms, guard-mutation self-test, pre-guard draft violation rate | 08 s3.1 #6, s3.5 |
| 2 | Flake rule vs zero bars | Fixed: any failure in any of 3 repeats blocks safety checks; repeats at production temperature; allowance only for soft cases | 08 s3.6 |
| 3 | Sample size | Fixed in part: bars relabelled smoke; n, distinct scenarios and 95% bound printed; paraphrase expansion; weekly sampled review for the PRD rate. Set not enlarged to 300 statements (needs pilot data); intent bar moved to routing groups | 08 s3.3, s3.6 |
| 4 | Rounds vs 12-message window | Fixed: `facts_known.price_pushbacks` fed by an `understand` flag, reset on item change; long-chat case; 09 T24, SC45, OD-S10 aligned | 08 A19b, P12; 09 |
| 5 | S2/S3 exit tests | Fixed: S2 exit scripted only on stub prompts, mode R twins moved to S7, S3 labelled plumbing only, retrieval quality via P6.2 set | 08 s4 |
| 6 | AI disclosure | Fixed: P19, 2.2 rows, C17, E4.40, H11, CL cases, lint, owner decision 11; 09 gets `ai_disclosed` and G11 | 08 |
| 7 | Phone voice agent | Added P21 (drop); lint bans Priya, Pune, OpenAI | 08 P21, s2.1 |
| 8, 9 | Lead summary, conversation language | Added A16b (`lead_note` via `LeadProposal.note`) and X1b (`conv.language`) | 08; 09 `LeadProposal` |
| 10 | Two scores | One score kept (09 T43); rubric with thresholds defined for LS | 08 A13, s3.3 |
| 11 | Negotiation extras | Added A19d and negative cases N-PROMISE, N-INVENT | 08 |
| 12 | Dropped gate fields | Added A18b mapping | 08 |
| 13 | Rule 10, claim examples | Added P20; lint covers examples and few-shots | 08 s2.1 |
| 14 | Oracle wording | Stated in Summary and principle 7 | 08 |
| 15 | Circular expectations, NFR-9 | Fallback stated: until the labeller is named only layer 1, scripted and hard safety checks block | 08 s3.6 |
| 16 | Judge bias | Fixed: soft scores over all reply-expected cases, absolute floor, baseline after owner review, family config test, kappa per language, at least 60 labels | 08 s3.5, E4.37 |
| 17 | NFR ties | Fixed: latency and holding bars relabelled; fault-injection timing; sources column | 08 s3.6 |
| 18 | Per-PR real model | Fixed: PR scripted only; real model nightly or label-triggered where the secret lives | 08 s3.8; 05-roadmap |
| 19, 20 | Sizes and order | E4.30 to L; SG golden-set track; red guard tests and 10 cases first in S1; BEC `pending` state | 08 s4, s6 |
| Minor | T9 "k", 91 count | T9 corrected (no "k" in legacy); count now 98 rows, 2 new (T12, X11) | 08 |
| Extra | `followup_timer_hours` | Added to X6 and C2 | 08 |

Rejected or partial: (a) 300-statement set size not built into the golden set, because it needs real transcripts that do not exist (owner decision 6); (b) judge floor numbers (3.5, kappa 0.6) are proposals pending the labeller.

Minimal edits outside 08: 09 (T24, SC45, OD-S10, `LeadProposal.note`, `facts` comment, `ai_disclosed`, G11, line 159); 05-roadmap-stories (E4.11 wording, E4.30 size L, E4.32 wording, class total 180); 05-roadmap (eval cadence line). Not edited, flag for owner of 04: `04-agent-design.md` s10 still says "30 to 50 human labels" and "smoke on PR".
