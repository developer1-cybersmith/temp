# Skeptic review: owner answers D1 to D8

Scope: ADRs 0025, 0026, 0027 and the amended docs 01 to 05, HANDOFF. Verdict: revise (5 blockers, all doc-level).

## Blockers

1. **Owner's typed reply may never reach the customer (window).** D3 says the owner types in the composer and that resolves the item. `choose_send_mode` (02 s5) applies to owner replies. If the owner answers after 24 h (likely: 4 h business time can span a closed day), the result is template or `hold`, yet the item is resolved (0025, 04 s7, 03 class B) and the composer looks successful. Fix: resolve only when the reply is accepted for send; if the window is closed, keep the item open as `held_window`, tell the owner (alert plus shaped summary), and add a reply template. Needs a red test in E5.T1/E5.5.
2. **4 h customer notice may be unsendable and there is no end state.** 0025 and 02 s5a skip it when the window is closed, so D4 silently fails in the exact case it exists for. After the notice (or skip) a stuck item stays open forever: the agent drafts nothing (04 s7 "While open"), so later customer messages get no reply, which contradicts D1 "never silent". Fix: a template for the notice (or an explicit owner-accepted "skipped" rule), a final escalation to the team (`team_tasks`) at a cap such as 24 business hours, and a decision on what the AI does for the 2nd to nth customer message while open (at minimum, a rate-limited second holding reply). No story or test covers this.
3. **Appointments page: "no frontend change" is not yet true on paper.** `frontend/src/pages/Appointments.tsx` calls `GET /tasks`, keeps rows with `due_date` (string, `startsWith(YYYY-MM-DD)`), reads `appointment_time` (ISO), and parses the title with regexes (`Appointment: <name> — <service>`, `at 10:30 AM`, the calendar emoji). Dashboard.tsx parses titles too. 03 defines `tasks.due_at` and `kind`, and no doc defines the response mapping or the title format. Fix: specify the `/tasks` serializer (due_date in IST, appointment_time, exact title template) and add a contract test using real frontend regexes. Add: the owner can POST /tasks appointments by hand (not in Cal.com, not subtracted from availability); a deleted visit task must have a tombstone so the next webhook or reconcile does not recreate it; `is_completed` on a visit task should not touch the booking.
4. **Holding replies can make claims.** The templates (04 s7a) promise things: "I will confirm this and let you know" and "Someone will get back to you" are promises; "reply to you soon" (4 h notice) is a time claim; "I have also informed the team" (voice, complaint) is false if all alert channels failed. "No promise" in 0025 is overstated. Fix: tie "informed the team" to a successful alert, or drop it; make the lexicon test reject "soon", "will confirm", "get back" unless the owner signs off those exact phrases; owner approval of wording is needed before M4 (already in open list; make it a gate).
5. **`unknown_send` should not trigger a holding reply.** 04 s7 lists it as a trigger. An unknown outcome means the real reply may have been delivered; a holding reply on top contradicts it. Exclude `unknown_send` (owner alert only). Also state that a failed or unknown send of the holding reply itself does not open a new item.

## Stale or contradictory text

- 0023 lines 7 and 11 still say "approve", "edit", "reject" (status line explains, body not edited). Resolution values: 0023 says `expired(opted_out)`, 03 says status `resolved/expired` with `opted_out`; pick one.
- 0009 body still says review queue "editable", "Approve or edit enqueues the draft" (amendment at the bottom only). 0010 context still lists "Google refresh tokens". 0006 body still describes the Google OAuth callback (flagged by an amendment; fine but easy to misread).
- 0020 and 0021 bodies still read as live decisions under a "Superseded" header; acceptable, but 0020 line 12 ("owner number is a normal contact") is the only place that states the owner-window rule and it is not carried into 0025 (see below).
- 02 line 222 still says "Cal.com or Google 429" (Google is only Sheets now: ok, say Sheets).
- 0027 says the F2 poll stays as a net, but F2 needs a list-conversation endpoint that is not among the known ChatSyncs facts. Mark it "verify".
- A8 and the "ChatSyncs adapter rules from SKILL.md" paragraph (Bearer REST, `template_id`) sit next to the new "Webhook Workflow" send path. Which is current is open; put it first in the ChatSyncs question list so the adapter rules are not read as settled.

## WhatsApp window and owner number

- Owner WhatsApp alert: "session text if the owner's window is open". The owner window only opens if the owner messages the business number, but E2.12 stores and ignores owner-number inbound. State where the owner's `last_inbound_at` is kept (a separate row, not a contact) and test it. Otherwise every alert is a template (cost, approval, variable limits).
- `owner_alert` template carries the draft: Meta template variables have length and newline limits (verify). Plan truncation and "full draft in email". Template category and approval time: verify; weeks of lead time (roadmap already says submit week 1).
- Owner replying to the WhatsApp alert is ignored (E2.12). Alert text must say "reply in the app", otherwise the owner thinks it was answered.
- If `owner_phone` equals the connected business number, the alert sends to itself. Validate at onboarding (E8.5).
- Loop check: one holding reply per item is enforced (`hold:{id}`, partial unique index). Remaining loop risk: owner uses `ai_paused=false` without replying, customer writes again, agent unsure again, new item, new holding reply. Add a cooldown (for example one holding reply per conversation per N minutes) and a test.
- `PATCH ai_paused=false` resolves the item even when the real column is already false; E5.8 should test that exact call (the frontend toggle sends the new value).

## Timers and restarts

Design is mostly sound (jobs table, `UNIQUE (kind, dedup_key)`, send-time re-check, leader scheduler E2.11, fake-clock tests). Gaps:
- Tenant with no or empty `business_hours` or a holiday list that closes every day: the 30 min/2 h/4 h clocks never fire. Add a default and a max wait.
- Hours or holidays edited after the item opens: jobs keep the old `run_at`. State whether they are recomputed.
- `reminder_*_at` columns and job rows can disagree after a crash; say the job row's dedup key is the single source of truth and the column is written in the same transaction as the send acceptance.

## Cal.com

- Per-tenant key in `tenant_secrets` with 0010 envelope encryption: fine. Unmarked claims: AGPL license, webhook event names (real names probably `BOOKING_RESCHEDULED`/`BOOKING_CANCELLED`, ADR abbreviates), metadata on bookings, "rejects a taken slot". Mark all verify.
- One Cal.com account per business: account count, ToS and cost of many free accounts, and the placeholder attendee email domain are all verify. Team must also hide the event type from public booking, or strangers can book it and bypass the agent.
- Double booking: four layers are good. Gaps: owner-typed appointments and Cal.com bookings made directly by the owner (webhook path covers the second, not the first, see blocker 3); exclusion constraint is per `calendar_integration_id`, so two event types on one Cal.com calendar can overlap.
- Webhook per tenant uses `endpoint_key` in the path plus signature (verify). Add a replay and out-of-order test (E7.T1 has duplicates only).

## Tests-first gaps (new behaviour without a red test)

| Behaviour | Gap |
|---|---|
| Owner reply after window closes | no test (blocker 1) |
| 4 h notice when window closed; end state of a stuck item | no test (blocker 2) |
| `/tasks` serializer vs Appointments regexes; delete tombstone; manual task | no test (blocker 3) |
| `unknown_send` gives no holding reply | no test |
| Owner window tracking and `owner_alert` fallback | only E2.12 (ignore) |
| Holding cooldown | no test |
| Cal.com tenant credential isolation | E7.1 isolation test exists; add key never logged or returned |
| Backups (D7): erasure vs backups | no story; DPDP erasure (0017) is silent about the S3 dump retention and which DB role the dump task uses (it reads all tenants). Add retention and role to 0027 and E8.4 |

## Fine as written

- Langfuse Cloud: masking story E4.10 has a seeded-PII test. Weak spot (names in free text, car registrations, transcripts) is admitted; add registration numbers to the mask list.
- No leftover direct-Meta fallback in 0008, 0024, 0027, PRD; no leftover Google Calendar scope; Langfuse self-host text is gone; HANDOFF is consistent.
- ChatSyncs unknowns are marked unknown and carried into the spike (A1 to A10, questions list). 0026 states its facts are from memory.

## Resolution (editor, 2026-10-07)
Blockers (all fixed):
1. Owner reply after window closed: item resolves only on accepted send; `pending_window` plus template `owner_reply`, else `held_window` and owner told (0025, 02 s5, 04 s7, E5.T1).
2. 4 h notice: session, else template `team_notice`, else `skipped_window` plus immediate team task; 24 business-hour team escalation; message 2..n gets a rate-limited `received` ack (0025, 04 s7/7a, 03, E5.T1).
3. Appointments: serializer, title template, `due_date`/`appointment_time`, manual tasks, soft-delete tombstone, completion independent of booking, contract test on real regexes (02 s8, 03, 0026, new E5.9).
4. Holding wording: receipt/state only, no promise words, no "informed", deny-list test, owner approval recorded as a gate (04 s7a, 0025, 03, roadmap).
5. `unknown_send` is alert-only; failed holding send opens no new item (04 s7, 0025, 03).

Improvements taken: stale text in 0023, 0009, 0010, 0006, 0020, 0021 and 02 (Sheets 429); `opted_out` aligned as status `expired` plus resolution; `owner_last_inbound_at`, truncated `owner_alert` draft, "reply in the app" text, `owner_phone` validation; holding cooldown; default hours and 24 h cap; Cal.com items marked verify (AGPL, events, metadata, slot error, ToS, hidden event type); manual appointments subtracted from availability; exclusion constraint per tenant; F2 needs a list endpoint (verify); REST vs Webhook Workflow as question 0; backup retention 30 days, erasure replay, `backup_role`, registration numbers in the Langfuse mask list.

Rejected or changed:
- "Recompute stored jobs when hours change": changed to recompute at run time in the handler, simpler than rewriting rows.
- Separate `owner_alert` template per language: not added, one template per language is already implied by `message_templates.language`.
