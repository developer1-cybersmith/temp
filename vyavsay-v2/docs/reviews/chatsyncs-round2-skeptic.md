# ChatSyncs round 2: skeptic review

All ChatSyncs facts: "from docs, unverified in practice". Compared: 01-prd, 02-architecture (s4, s5, s6), 06 (s10), ADRs 0003, 0004, 0008, 0012, 0023, 0025, 0027, 0028, HANDOFF, roadmap and stories against the findings file and the round-2 facts.

Verdict: revise. No design-breaking error, but one hard blocker (path-key leakage) and several stale or overstated lines.

## Blockers

| # | Issue | Evidence | Fix |
|---|---|---|---|
| B1 | The path secret is the only inbound auth, and nothing stops it leaking through logs. ALB access logs, uvicorn access logs, tracing and error reports all record the request URL. The redacting logger (FR-25, 03 s Secrets) covers the `Secret` type, not URL paths. | 02 s4 inbound flow step 1; 06 s10 Routing; 0007 (ALB); NFR-12 | Add to 02 s4 and E2.16: no ALB access logs for the webhook rule, or strip the path before logging; log `key_id` only; access-log scrubber test (red test); Sentry/APM URL scrubbing. |
| B2 | Rotation is not possible as designed. ChatSyncs allows one URL per trigger, set by hand in the dashboard (no API found). `endpoint_keys` has `drain`, but only as a provider-switch feature. A leaked key means a manual change by the team plus a gap. | findings Q6, A1; round-2 "Q8 set webhook URL by API: not in spec"; 06 s9 | State a rotation runbook: new key `live`, old key `drain` for 1 h, team edits the URL, then revoke. Note that 4 triggers means 4 URLs: use one key per trigger (message, status, conversation, outgoing) so a leak of one is scoped. Make `drain` valid for same-provider rotation too. |
| B3 | A leaked or guessed key lets anyone forge inbound customer messages (agent runs, LLM cost, injection, fake STOP or opt-out) and fake status events. Only one check is stated: `whatsapp_bot_id` must match the key's number, and that value is not secret. | 02 s4; 06 s10 | Per-key rate limit and body-size cap at the edge; per-tenant inbound budget alarm; fake `failed`/`read` statuses already limited by the monotone state machine (good, say it); forged STOP: confirm opt-out from our own record only. Residual risk needs the owner's signed acceptance (02 A3 says this, but PRD/HANDOFF do not). |
| B4 | Voice notes are in v1 scope (PRD FR-5, tiers count "voice minutes" in FR-18), but the findings show only text inbound is documented and `voice_notes`/`media_download` are false. As written, v1 can ship with voice permanently "unsupported". | findings Q3 (round 2: not answered); 02 s6 fallback | PRD must say: voice acceptance is conditional on the M0 media fixture; define "v1 done" with voice off; drop voice-minute limits from the pilot tier until on. Owner decision, not a doc edit. |

## Claims not supported or overstated

| Where | Claim | Problem |
|---|---|---|
| 02 A1 "Confirmed", A6 "Confirmed" (status webhook) | Inbound and status webhooks exist | Only from round-1 page summaries. Round 2 found the OpenAPI spec has no webhook section and the guessed webhook page 404'd. Never seen a real payload. Mark "Documented (summary), unverified". |
| 02 A8 "Confirmed", 0008 `status_lookup` true | Lookup protects against double send | Lookup is by `wa_message_id`, which we do not have when the response is lost. It cannot look up by our key. 0003 says "check status by key", which ChatSyncs cannot do. The real path is the `get-conversation` text match (02 s4 outbound step 3). Say `status_lookup` helps only with a known id. |
| 02 s4 outbound step 3 | Match "an outbound row with our text sent after the attempt" | Identical short texts ("ok", fixed holding replies), owner-typed rows (coexistence), and `last_message_time`/row times without timezone. Matching can claim a wrong row as ours and hide a lost send, or miss one. Needs a rule: match only with a unique text plus a time window, else `unknown`. Test with duplicates. |
| 02 s4 / findings Q8 | `template_id` is the "short ChatSyncs id" for send | Round 2: `/send/template` takes `template_id`, `/template/status` takes the WhatsApp long id; create returns both. Round 2 does not say which one send wants. Mark unverified; store both ids. |
| 02 s5 Templates | "Created and approved outside the API (undocumented)" | Stale. `/whatsapp/template/create` and `/template/status` exist; manual Sync is for WhatsApp Manager templates only. |
| 02 s5 | "Header-media and carousel templates cannot be sent by API" | Round 2 limit is for MCP tools; the API note (round 1) is a different source. Keep, but cite which. |
| 02 s6 / FR-5 | Voice via `get-conversation` "webhook format" | Unseen shape, no download or expiry facts. Keep as hope, not a plan. |
| 06 s10 `id_space` | "Provisionally wamid" | Fine, but 0003 dedup key uses `id_space` from day one. If it later changes from `chatsyncs` to `wamid`, the same message dedups as new. Fix the value now (`chatsyncs`) and never flip. |
| F2 text (02 s4) | Poll "every 30 to 60 s per number" | `subscriber/list` has no created-date filter and orders by last message; a busy number can push a new contact off page 1. Round 2 gives limit max 100 only; rate limits unknown. Budget and lag alarm exist; also add a call-count cap. |
| 02 s4 health feed | `getMyInfo` per number every 5 min | `myInfo` is per account (one key, many numbers). Call once per account. Also use it: `bot_subscriber_data` limit/count and `message_credit_data` are the plan limits. When the contact limit is full, new contacts are blocked (round 2 troubleshooting), which looks like silent inbound loss. Alert at 80%. Not in any doc now. |

## Stale text to fix (not edited here)

- 0003 line 10: "verify signature". No signature exists; say "verify path key (and signature if the adapter has one)".
- 0004 line 13: "Inbound loss is covered by provider retries". Retries are unknown. The 99.5% target must not lean on it; say F2 plus durable inbox.
- 0008 header "Proposed (blocked on ChatSyncs answers, SKILL.md section 8)": section 8 is answered or superseded.
- 0027 D8: "F2 ... only if ... list-conversations endpoint exists (verify, not among known facts)". It exists now (`subscriber/list` plus `get-conversation`).
- HANDOFF line 27: "send API, multi-tenant model ... still unknown". Send API and tenancy are now documented (unverified).
- PRD line 45: "Webhook in is documented, rest unconfirmed"; PRD line 65 and line 204 list send API, templates, status lookup and tenancy as M0 unknowns. Narrow to the real open list.
- Stories E0.1 ("10 open questions") and E0.2 ("Webhook Workflow send, template send"): the Workflow is not our path; template send is documented. Make them match E0.8.
- 0020 line 12 "ChatSyncs capabilities unknown": partly answered.
- No contradicting capability flags found: `idempotent_send` false, `correlation_echo` false, `media_download` false, `voice_notes` false agree with the findings. `delivery_webhooks` true rests on B-claim above.

## Meta-style assumptions still in the design

- `verify_inbound` is shaped for URL-signed and HMAC providers; ChatSyncs adapter returns "path key only". Fine, but the conformance row "Good signature passes; tampered body fails" (06 s7) is not runnable for ChatSyncs. Say it runs on the fakes only, so ChatSyncs has no tamper test.
- Window clock: 06 s5 says event time clamped to `received_at`. For ChatSyncs inbound there is no event time (findings A2), so the window runs from receipt. After an outage, late delivery extends the window (up to the unknown retry delay). 06 says replay "cannot extend the window"; that claim is false for ChatSyncs. Use the F2 `last_message_time` when available, and keep the 10 min margin.
- Timezone: `status_time`, `last_message_time` have no timezone. "Assume IST" is written as verify; keep it out of window logic until verified.

## Error classification

- The classifier relies on exact English strings (window text, "Subscriber not found" with status `"1"`). Docs list the rule and an alarm at 1% unmapped, good, but there are no committed tests with real strings yet; fixtures need a live key. Until then, the window string is the only recorded one (round 2, verbatim). Add: a unit test with the verbatim window string, and a rule that `status:"1"` with a missing `wa_message_id` is `unknown_send`, not success (round 2 says "Subscriber not found" can arrive with status `"1"`; the same can hold for sends).
- The core keeps its own clock (06 s10) so a drift in the window text is covered. Good. But 02 s5 "Race" converts `OutsideWindow` to a template once; an unknown string means `unknown_send`, which never sends a template. A drifted window string would then park every late send for review. Alarm exists; add a circuit breaker note.
- 302 redirect for a missing token: `redirect=manual` is stated. Good.

## Contradictions with ADRs

| ADR | Point |
|---|---|
| 0003 | "check provider status by key" and "signature": see above. Outbox idempotency key is local only for ChatSyncs. |
| 0012 | `resolve_endpoint_key` returns "verification secret id": null for ChatSyncs. Fine. But the system function sees every webhook with an unknown key: add a rate limit on 404s so key guessing is slow and visible. |
| 0023 | No conflict. |
| 0025 | Owner phone: the whole alert and reply flow depends on owner-phone echo (unknown) and on the owner's window. With coexistence, owner-typed phone messages may appear in history; 0025 treats them as ignored. Flag as a spike question 6 dependency (already listed). |
| 0028 | Capability profile matches findings. "Inbound is push-only" conflicts with F2 polling into the same table. Say "push-primary". |

## Improvements (short)

1. Put B1 to B3 into 02 s4 and E2.16 as stories with red tests (log scrub, rate limit, rotation drill).
2. Add `inbound_auth=path_key` to health alerts: inbound silence per active tenant (already in 02 s9) also catches a wrong URL after rotation.
3. Spike checklist E0.8: add "ask for a signing secret or IP list first". If ChatSyncs says none, record the owner's acceptance.
4. Plan-limit alert from `myInfo`.
5. Fix the stale lines above in one pass, then re-run this check.

## Resolution (editor pass 2026-10-08)

All ChatSyncs facts remain "from docs, unverified in practice".

| Item | Outcome |
|---|---|
| B1 log leakage | Fixed: 02 s4 "Path-key hardening" (no ALB logs or stripped path, `key_id` only, uvicorn and APM scrubbing, red test); E2.16 |
| B2 rotation | Fixed: runbook, one key per trigger, `drain` also for same-provider rotation (02 s4, 0028 amendment, E2.16) |
| B3 forgery | Fixed: per-key rate and body caps, 404 rate limit, STOP not trusted alone, residual risk added to "Needs owner decision" and PRD item 6. Needs owner signature |
| B4 voice | Partly: PRD s2 and item 6 now say v1 done with voice off and voice-minute limits deferred. Owner decision still required |
| A1/A6/A8 "Confirmed" | Fixed: relabelled "Documented, unverified" |
| status_lookup / 0003 | Fixed: lookup by `wa_message_id` only; strict unique-text-plus-window match, else `unknown`; 0003 reworded |
| Window claim | Fixed: 06 s5 and 02 s5 state window runs from receipt for ChatSyncs |
| Stale text (0003, 0004, 0008, 0027, 0020, HANDOFF, PRD, E0.1, E0.2, 02 s5, 0028) | Fixed |
| template_id, id_space, `status:"1"` no id, window-string test, breaker, myInfo, 80% alert, 404 limit, push-primary, E0.8 first item | Fixed |
| Rejected: "keep 02 s5 header-media limit but cite source" | Done as a citation only; no behaviour change |
| Rejected: `get-conversation` voice shape "keep as hope" | Already stated as fallback in 02 s6; no edit |
| Rejected: ADR 0023 and 0025 changes | Review said no conflict or already a listed spike dependency |
| Rejected: timezone verify note | Already "verify" and kept out of window logic; no edit |
