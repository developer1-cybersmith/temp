# Skeptic review: docs/04-agent-design.md (and ADRs 0018-0021)

**Summary**
1. Verdict: revise. Strong shape (code-enforced guard, no side effects in nodes), no owner decision reopened.
2. Frontend claims check out (Conversations.tsx sender bubbles, `ai_paused` PATCH at l.146, 3 s poll, no Calendar/OAuth code).
3. 5 blockers: G5 vs G6 conflict, booking governance contradiction plus 15 min hold, inconsistent caps, in-run races not designed, `agent_runs` missing from the data model.
4. Several gaps: summary node absent, G2 number rule too broad, test coverage thin on races and isolation.
5. Earlier docs now disagree with 0018 and 0021 (architecture, 0006, 0009).

## Blockers
1. **G5 contradicts G6.** G6 allows `offer_price >= max(list*(1-d), min_price)`, so an offer exactly at `min_price` is legal. G5 holds at once on any `min_price` figure "in any format". The agent can never close at the floor, and any list price or year that equals a floor digit string also trips it. Define: G5 applies to figures other than the approved `offer_price`, and say how a coincidental match is handled. Add a property test.
2. **Booking governance contradicts the flow.** Section 6 says "Strict for money and bookings (held for owner)". Section 8 confirms and writes to Calendar on the customer's "yes" with no owner step. Pick one. Also `hold_expires_at` is 15 min (03-tenancy-data:72) but WhatsApp replies take hours: "yes" after expiry has no defined path (`confirm_booking` needs a held booking). State: re-check availability and re-hold, or lengthen the TTL (it is a config, not a promise). `confirms_pending_slot` comes from the `understand` LLM on untrusted text; require the pending-slot id in server state and a matching slot echo.
3. **Caps do not add up.** 6 LLM calls vs `understand` 1 + up to 4 tool-loop calls + draft 1 + one regenerate = 7 to 8. 45 s wall time vs NFR-1 15 s p95: say what the 45 s is for. Max output 400 tokens with a JSON draft that also carries `claims[]`, and Devanagari costs many tokens per char; G9 allows 600 chars. Likely truncation, then G1 failure. Size from a Hindi/Marathi sample (**verify**). Define what happens when regenerate would exceed the cap (hold, not ai_failure noise).
4. **Races inside a run are not designed here.** Architecture section 3 says new inbound during a run discards the draft and restarts before send; the agent doc never mentions it, nor the caps on a restart (do counters reset? the thread id is per job). Missing:
   - Owner types in the composer while a run is in flight: AI then replies after the owner. The post-step must re-check "owner message or `ai_paused` since run start" and drop.
   - Two writers on a review item: approve vs composer auto-resolve vs `ai_paused=false`. Need a single guarded `UPDATE ... WHERE status='open'` and a partial UNIQUE index (one open item per conversation); neither is stated.
   - Approve after the customer sent STOP: opt-out must be rechecked at approval (the doc only says `choose_send_mode` and a stale warning).
5. **`agent_runs` is not in 03-tenancy-data.md** (grep: no match) though 0018 says "add to the data model". It also needs RLS class B and a retention rule (it stores tool args and claims, so PII). Add or the doc is not implementable.

## Gaps (non-blocking but should be fixed before M3)
- **Rolling summary is untrusted derived text.** `agent.summarize` exists in the task list but no node or post-step creates it, and A4 does not list the summary as untrusted. A customer can plant instructions that persist through the summary into every later prompt. Put it in a data block, cap it, and run the injection classifier on it. Audit M-26 (summary every message) is not addressed.
- **G2 is too broad.** "Every amount, year, km and count" will also catch visit times, "10 to 7" hours, phone, pincode and "2 alternatives". Specify the allowed non-claim numbers (hours, phone, slots) or false holds will be high.
- **G8 "no data of other customers"** has no mechanism (names? phones?). State it as: no phone, name or message text that is not in this conversation's history.
- **Follow-ups:** the in-window `mode=followup` run is rarely useful (follow-ups go out after the 24 h window), so most steps are templates from tenant-approved copy. Say so and drop the claim of an agent follow-up as the main path. `mode=reminder` is in state but undefined in this doc.
- **Prefetch runs before `route`:** an embedding call is spent on escalate or smalltalk turns and on suspected injections. Either gate on `pre_flight` or accept and count it in the cost estimate.
- **Calendar via shared service account (0021):** one credential reaches every tenant's calendar, so isolation is code only. Require `calendar_id` UNIQUE across tenants and the id from run context only; add a test that tenant A's run cannot call free/busy on B's id. Also the Appointments page reads `/tasks`: say which row the agent writes so owner-created visits and agent bookings do not double up.
- **Eval realism:** "any failure in any of 3 repeats blocks" on a stochastic LLM will flake; define a retry rule or use temperature 0 for safety classes. 150 labelled Hinglish/Marathi cases by M3 depends on an owner-supplied labeller (decision 6): make it a dated dependency. "Injection success: 0" is a bar on a finite sample, not proof; say so.
- **Marked verify:** good coverage, but `Command`+static edge behaviour, `recursion_limit` semantics and checkpoint pruning with job-scoped thread ids (many more threads per conversation) should be in the M3 spike list too.

## Missing tests (add to section 10 layer 1)
- Review item state machine under concurrency (double approve, approve vs owner message, open item blocks run).
- Tenant isolation: tool calls with another tenant's item ref or calendar id; checkpointer thread-id prefix assertion.
- Contract test for option A shaping (`ai_paused=true`, `summary="Needs you: ..."`) against the frontend response types; PATCH `ai_paused=false` resolves the item.
- Hold expiry then "yes"; Calendar write failure releases the hold with no confirmation text.
- Owner message during run; STOP arriving between draft and approve.
- Post-step guard rerun yields a different result than in-graph guard (state changed).

## Contradictions with earlier docs
- 02-architecture.md:147 and ADR 0006 still say Calendar is OAuth per tenant with refresh tokens; 0021 amends this but those docs are unchanged. Update both or the next reader builds OAuth.
- ADR 0009 line 10 still states `thread_id = "{tenant_id}:{conversation_id}"`; 0018 changes it (a "see 0018" note exists at the bottom). Edit line 10.
- Summary point 4 says "Pilot works with zero frontend change" while Option A leaves the owner without an in-app draft view; PRD FR-15 says the owner "approves, edits or rejects". Option A only supports "type your own reply". State that FR-15 is only partly met without the banner.

## Needs owner decision (agree with the doc, plus)
- Confirm bookings: customer yes alone, or owner confirms (blocker 2).
- Hold TTL value.

## Risks
| Risk | Note |
|---|---|
| Doc is optimistic on latency | 3 to 4 sequential LLM calls plus a regenerate rarely fit 15 s p95 with Hindi output; measure in the M3 spike |
| False-hold rate | G2, G4 and G5 together may hold most price talk; set a target before pilot |
| Option A as shipped | Owner may miss drafts; email-only draft is weak for a busy dealer |
