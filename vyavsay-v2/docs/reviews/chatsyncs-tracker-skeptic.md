# ChatSyncs tracker and D9-D15: skeptic review (2026-10-08)

Verdict: revise. No blockers in the tracker itself. The poller design has real gaps, and a few D9-D15 leftovers remain.

## 1. Research traceability (tracker)
- Counts check out (21 open, 10 answered-docs, 2 accepted-risk, 33 total). "Meta context only" is labelled on CQ-10 and CQ-14, not passed off as ChatSyncs fact. Good.
- CQ-18 is `answered-docs: absent` but its own source says "last 40k chars unread". Absence is not proven. Keep it open (or "answered-docs, partial") until the rest is read. Same for CQ-31 (a "no" from a summary).
- CQ-12 figures (80 to 20 mps, 6 months history) are Meta coexistence numbers. They are cited to the ChatSyncs page, but mark them "Meta numbers, ChatSyncs page repeats them" and say which.
- CQ-28 and CQ-29 cite our own findings file, not the vendor page. Add the primary URL (template docs, `subscriber/list` page).
- CQ-25 relies on "same token as REST per round 2" for an MCP-section page. That is inference; say so.
- CQ-22/23 conflict: "REST API on all plans" vs "webhooks Starter and up". Fine as an open item, but CQ-22 is marked answered from a summary read. Soften to "answered-docs (summary)".
- CQ-33 is "accepted-risk" but its evidence is "See CQ-10..." (circular) and its strength says "meta" with no meta source. Make it a decision (D13) with its own evidence.
- CQ-05 still says "Voice notes are v1 scope". Stale after D10. Fix.

## 2. D9-D15 consistency
Applied well in PRD FR-5/FR-18, 02 s4, 06, ADR 0028/0029/0027, stories E0.9/E2.T2/E2.21/E6.5/E8.10, AGENTS.md. Leftovers:
- `01-prd.md` risk table (~line 217): "questions list sent early". Contradicts D14 (no support email). Reword.
- `adr/0024` line 13: "go, or go with the F2 safety net". F2 is not optional now (D12). Reword.
- `adr/0024` line 13 also says "nudge them [ChatSyncs]... ask for a call". Same D14 conflict.
- `adr/0008` line 13 calls F2 "safety net (feasible but limited)" and line 18 says "F2 cannot find new contacts". 02 s4 does not say this, and it matters (see 3). Align the two.
- `03-tenancy-data.md` still lists `max_voice_seconds_month` and the `voice_seconds` metric with "voice minutes" in open item 2. D10 says voice limits stay out of the pilot tier. Say "column exists, NULL, not enforced until voice is on".
- `02` s4 inbound flow numbering is 1,2,3,4,6,5 (item 6 sits before 5). Cosmetic.
- No leftover "shared account" or "no coexistence" found.

## 3. Poller risks (02 s4, E2.T2, E2.21)
Not covered by the design or the red tests. Add to E2.T2/E2.21:
1. **First-run backfill.** Coexistence copies 6 months of history. A first poll can ingest old inbound rows and the agent replies to months-old messages. Need a per-number start cursor set at go-live and a max-age rule (ignore or review anything older than N minutes). Biggest risk.
2. **Stale replies after an outage.** Polled messages hours old: reply, hold, or review? Define one rule and test it.
3. **Webhook/poll race.** Unique key stops double inserts, but `ON CONFLICT DO NOTHING` keeps whichever arrived first. A webhook row has `received_at`, a history row has `conversation_time`. Decide which wins and whether the poll can enrich `event_ts`. Dedup only works if history `wa_message_id` equals the webhook id (CQ-17, unverified). If they differ, every message is processed twice and customers get two replies. Needs a fixture test before the pilot, not just a unit test on the fake.
4. **Ordering.** Poll inserts a missed message after later webhook messages. Check `inbound_high_water` and burst coalescing handle an older row arriving late, and that the agent run is re-triggered.
5. **Cursor.** `last_message_time` has second precision and no timezone (CQ-16). A global cursor drops same-second ties. Use a per-contact cursor plus overlap re-read (dedup makes this safe).
6. **Cost and starvation.** Every outbound reply and every owner-typed message changes `last_message_time`, so our own sends trigger `get-conversation`. With a per-hour cap, busy contacts can starve quiet ones. Skip contacts whose newest row is our own send; round-robin under the cap. Alarm on cap hit. Rate limits unknown (CQ-21): add backoff on non-2xx and a kill switch.
7. **Owner-typed rows.** E2.21 says stored and ignored, but nothing tests it with a `sender` value, and the sender enum is unknown (CQ-11). Poll must not create contacts or runs from rows it cannot classify as customer inbound. Add the test.
8. **Window clock.** Doc says use `last_message_time` "when known". Mixing receipt time and history time (no timezone, assumed IST) can shift the 24h window by 5.5 h if the assumption is wrong. Use the earlier-safe value (the smaller) for window checks until CQ-16 is answered.
9. **New contacts.** Say plainly whether `subscriber/list` includes a contact who never reached us by webhook (0008 says no). If not, the poller cannot recover first messages from new customers, which is the most valuable loss to cover.
10. E2.T2 has no test for: backfill guard, stale rule, ordering, owner rows, 429/5xx behaviour. Add them (tests first).

## 4. Accepted-risk wording (D9, 02 s4)
- Mostly honest. Residual-risk text names LLM spend and injection. Add: a forged event can also (a) trigger an AI reply to any phone number the attacker names in the body (outbound spam from the business number, quality-rating damage), (b) pollute a real customer's conversation, (c) fake STOP (handled) or fake status (bounded). Check that the reply goes to the contact derived from the stored contact, never from an attacker-chosen field without the number check.
- Log leaks: mitigation covers ALB, uvicorn, Sentry, with a red test. Missing: CloudWatch/WAF logs, CDN, browser or proxy history on the team side, and the ChatSyncs dashboard itself (the URL is stored in a vendor system and visible to any ChatSyncs team member on that account). State that the key is only as secret as the vendor's UI.
- Rotation is manual (D15) and key leak response time depends on a person at a quiet hour. Add an emergency path: if a leak is suspected, rotate immediately, not at a quiet hour.
- "Accepted by owner" needs an expiry or review date (e.g. re-check at M2 and each monthly docs check), not only an exit condition.

## 5. Stories: dependencies and tests-first
- E2.T2 -> E2.21 is right. E2.21 depends on E2.2 but must also depend on E2.1 (the FakeProvider needs `subscriber/list` and `get-conversation` fixtures; E2.1 lists voice/image/duplicates but not history endpoints). Add them to E2.1.
- E2.21 reads `get-conversation`; E2.20 (reconcile) uses the same call. Share one client and one rate budget, or the two cap each other.
- E0.9 depends on E0.8, and E0.8 needs ChatSyncs access. But D9 says "if ChatSyncs confirms no signing/IPs": the note can be drafted now from docs. Let E0.9 draft before E0.8 and sign after.
- E6.5 (must, defines "done") depends on E6.3 and E0.8. It should depend only on fake-media tests so it is not blocked by the spike. Voice type detection on a real ChatSyncs payload is unknown (CQ-06): the unknown-type path must catch it, which is what makes "never silent" true. Test that an unrecognised event type is treated as unsupported text-request, not dropped.
- E8.10 drill "on the pilot number before go-live" is good; add an emergency rotation drill.

## 6. Tracker usability
- Good: one table, dated, source URLs, maintenance rules, accepted-risk table.
- Too wide: 8 columns of long prose; hard to scan in a terminal. Move the long evidence text under the table and keep ID, question, status, blocks, one-line workaround.
- "Last checked" is only global, and "Next check" has no owner or date per item. Add `next check` and `owner` columns, or at least an owner line.
- Counts line is hand-maintained and can drift. Add a one-line grep check in "How to maintain".
- Block links use story/ADR ids that are renumbered often (A3, A5). Prefer stable story ids.
- Rule 3 (vendor answer overrides docs) is fine. Add rule: a live-key spike result overrides both, and is recorded as `answered-spike`.

## Top fixes before relying on this
1. Poller backfill and stale-message guard (3.1, 3.2).
2. Confirm webhook id equals history id with a real fixture (3.3), else double replies.
3. Fix D14/D10 leftovers (PRD risk row, ADR 0024, ADR 0008 "F2", tenancy voice columns, CQ-05).
4. Re-open or soften CQ-18, CQ-31, CQ-33.

## Resolution (2026-10-08, editor)
Accepted and applied:
- Blockers: backfill guard and stale rule (02 s4 poller, E2.T2, ADR 0029, AGENTS.md); id-equality real-fixture test before the pilot, poller off for live numbers until it passes (02 s4, E2.T2, E2.21, E0.8, CQ-17); D14/D10 leftovers fixed (PRD risk row, ADR 0024, ADR 0008, tenancy voice columns, 06 checklist, roadmap risk row, CQ-05 text).
- Tracker: CQ-18 reopened (partial read); CQ-31 softened to summary-level; CQ-33 now `decided (D13)` with its own evidence; CQ-12 marked Meta-origin; primary URLs added to CQ-28/29 (the openapi spec; no separate vendor page URL was verified); CQ-25 marked inference; table slimmed, owner and next-check columns, count-check command, `answered-spike` status, stable E-ids.
- Poller: per-contact cursor with overlap, skip own sends, round-robin, backoff, kill switch, shared client and budget with E2.20, earlier timestamp for window checks, new-contact coverage stated as unknown; E2.1 gets history endpoints; E2.21 depends on E2.1; E2.T2 gains the listed tests.
- Accepted-risk wording: outbound spam, poisoning, vendor UI and CloudWatch/WAF exposure, emergency rotation (also an E8.10 drill), review date.
- E0.9 can be drafted from E0.1 and signed after E0.8; E6.5 depends on fake-media tests only and tests that unknown event types are never dropped.
- Inbound flow numbering fixed.

Rejected or deferred:
- CQ-22 not reopened: kept `answered-docs` with a "summary-level read" label (a re-read is a normal monthly check, not a defect).
- CQ-23 conflict with CQ-22 left as an open row with a note (different features, no new evidence).
- "Block links use stable ids": done for new links only; ADR numbers are kept where an ADR is the real blocker.
