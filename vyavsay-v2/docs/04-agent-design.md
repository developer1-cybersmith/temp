# Vyavsay Assist v2: Agent Design

**Summary**
1. The model proposes, deterministic code disposes: the graph returns a `ProposedReply` or `ReviewRequest`; a pure `guard` and the outbox decide what is sent. No node has side effects (R5).
2. One bounded graph per inbound turn: parallel understand and prefetch, a read-only tool loop (max 4 tool calls in at most 2 LLM rounds), one draft, guard, then send or hold. Caps are enforced in code. In-run races are handled in section 2.3.
3. Safety does not rely on the model obeying: grounding, floor price, max discount, forbidden claims and injection handling are all checked in code and tested without an LLM.
4. When unsure or when the guard holds a draft the agent sends a fixed, claim-free holding reply and escalates: owner alerts on email, WhatsApp and a "Needs you" flag; the owner answers in the Conversations composer; the AI never goes silent ([0025](adr/0025-hold-and-escalate.md)). Zero frontend change. Bookings need customer confirmation, not owner approval; calendar is Cal.com ([0026](adr/0026-calendar-via-calcom.md)).
5. A 150+ case eval set gates CI; every run is a Langfuse trace with versioned prompts. Version-sensitive claims are marked **verify** (docs MCP offline).

Inputs: [PRD](01-prd.md) FR-5 to FR-17, [architecture](02-architecture.md) sections 5 to 8, [data](03-tenancy-data.md), [owner decisions](../../docs/production-plan/04-owner-decisions.md). New ADRs: [0018](adr/0018-agent-graph-tools-and-caps.md) graph, tools, caps, thread id; [0019](adr/0019-reply-guard-and-injection-defence.md) guard and injection; [0025](adr/0025-hold-and-escalate.md) hold and escalate (supersedes 0020); [0026](adr/0026-calendar-via-calcom.md) Cal.com (supersedes 0021); [0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md) Langfuse Cloud, backups, ChatSyncs wait; [0022](adr/0022-booking-confirmation-and-hold-ttl.md) booking confirmation and hold TTL; [0023](adr/0023-run-races-and-review-concurrency.md) run races and review concurrency. Related: [0005](adr/0005-stt-vendor-and-model-gateway.md), [0009](adr/0009-agent-durability-and-review-queue.md), [0011](adr/0011-litellm-in-process.md), [0015](adr/0015-embeddings-storage.md).

## 1. Principles
| # | Rule | Why (audit) |
|---|---|---|
| A1 | The model never sends, books, discounts or writes. It returns structured proposals. | H-21, M-04 |
| A2 | Facts in a reply come from retrieved rows or tenant config, each with a source ref. | H-26, H-27 |
| A3 | Anything the guard cannot verify is held for the owner, never sent. The customer gets only the fixed holding reply (A6), never improvised or canned answer content. | H-15, FR-10 |
| A4 | Untrusted input: customer text, transcripts, the rolling summary (derived from them), and owner-imported catalog, knowledge and sheet text. | M-04 |
| A5 | Caps, allowlists and confirmations are code, not prompt. | M-04, M-11 |
| A6 | The customer is never left without a reply: every hold or escalation sends the holding reply (when allowed) and alerts the owner. Holding text is a versioned template chosen by code, with no claims. | FR-26 |

## 2. Graph
State is a `TypedDict`, nodes return partial updates, lists use reducers (`operator.add` for tool log and violations), everything else last-write-wins. Compiled once per worker with the Postgres checkpointer ([0009](adr/0009-agent-durability-and-review-queue.md)). Thread id is `{tenant}:{conversation}:{job_id}` ([0018](adr/0018-agent-graph-tools-and-caps.md)); history is read from `messages`, not from checkpoints.

| Node | Kind | Does | Fails to |
|---|---|---|---|
| `load_context` | data | Reads tenant config, persona, hours, last 12 messages and summary (data block, see `summarize` below), lead, held booking, active prompt versions, integration status. Resets per-turn fields. | retry (transient), else `ai_failure` item |
| `pre_flight` | rules | Checks `ai_paused`, open review item (an open item means the owner owns the chat: no draft, the message is appended to the item), plan limit, input caps (2000 chars, strip control and zero-width chars), injection signals, language. STOP words already handled before the graph (FR-13). | END (no reply) with reason |
| `understand` | LLM, small model | Structured: intent, entities (item, budget, dates), language, sentiment, `wants_human`, `confirms_pending_slot`. | one retry, then `route=act` with defaults |
| `prefetch` | data, parallel with `understand` | Cheap lexical and filter retrieval on the raw message (no embedding call). The vector leg runs only after `route=act`, inside `search_inventory`. Saves a round trip without paying for escalate, smalltalk or injection turns. | typed error in state |
| `route` | rules | `escalate` (wants human, complaint, legal, refund), `smalltalk` (skip tools), `act`. | `escalate` |
| `act` | LLM + tool loop | Up to 4 read or propose tool calls (section 2.2). | `ReviewRequest(ai_failure)` on cap or error |
| `draft` | LLM | Schema output: `text`, `claims[]`, `language`, `next_step`, optional `offer_price`. Persona and prompt version applied. | hold |
| `guard` | pure code | Section 5. Result `pass`, `regenerate` (once, violation codes only), `hold`. | hold (fail closed) |
| `build_review` | pure | Builds `ReviewRequest` (kind, reason codes, draft for the alert, proposed send mode). | n/a |
| `holding_reply` | pure | Picks the holding template for the customer's language from `tenant_config.holding_templates` (section 7a); no LLM, no model text. Output is part of `ReviewRequest`, written by the post-step. | `ReviewRequest` without a holding reply, flagged |
| `finalize` | pure | Builds `ProposedReply` (text, claims, proposals: booking, lead stage, follow-up). | n/a |
| `summarize` | async job after the post-step, not in the graph | Task `agent.summarize` (small model). Throttled: only every N messages or when history exceeds the window (M-26). Input is wrapped as data; output is stored as untrusted text, length-capped, never placed in the system prompt, and rebuilt from `messages`, not from the old summary, so an injected line cannot persist forever. | skip, keep old summary |

Edges: `START -> load_context -> pre_flight -> (END | [understand, prefetch]) -> route -> (build_review | draft | act) ; act -> draft -> guard -> (finalize | draft | build_review) ; build_review -> holding_reply -> END ; finalize -> END`. Use `Command(goto=...)` only where a node both updates and routes, and avoid mixing it with static edges from the same node (both would run; M3 spike verifies).

Post-step (worker, outside the graph): re-run `guard` on the stored proposal, apply proposals (booking hold, lead stage, follow-up rows), `choose_send_mode`, write outbox row, or, on a hold, one transaction with `review_items`, the holding-reply outbox row and the alert and reminder jobs (section 7a). Retry: `RetryPolicy` on LLM nodes for transient errors (import path **verify**); tool errors return a typed `ToolResult(ok=False, error)` to the loop, never raise.

### 2.1 State (key fields)
`run_id, tenant_id, conversation_id, inbound_ids, inbound_high_water, started_at, restarts, mode (reply), source (text|voice), tenant_cfg, persona, history, summary, intent, entities, language, injection_suspected, retrieved (typed result), tool_log (reducer), tool_calls, llm_calls, draft, violations (reducer), regenerated, outcome`.

### 2.2 Tools and allowlist
| Tool | Type | Allowed when | Notes |
|---|---|---|---|
| `search_inventory(filters, query)` | read | always | Returns the public view only (allow-listed attributes from `catalog_schema`); `catalog_pricing` is unreachable. `Found`, `NotFound` or `Error`. Top 5. |
| `get_item(ref)` | read | always | ref from this run's results only |
| `lookup_knowledge(query)` | read | always | Documents (FR-9) |
| `check_availability(day_range)` | read | calendar `ok` and not `injection_suspected` | Free/busy within business hours and holidays, minus DB holds, IST |
| `propose_booking(slot_ref, item_ref)` | propose | availability result exists | Post-step creates the `held` booking |
| `confirm_booking()` | propose | a held booking exists, `confirms_pending_slot` true, no injection flag | booking id injected by server, not model |
| `propose_lead_update(stage, item_ref)` | propose | always | forward moves only; owner can move back |
| `escalate(reason_code)` | propose | always | reason is an enum; the post-step turns it into a hold with holding reply |
Not exposed: send message, discount grant, Sheets, SQL, URL fetch, any id argument. Policy file is YAML in the repo; plan and tenant flags can only remove tools (most restrictive wins, per the agent-governance pattern).

**Caps** (one budget, [0018](adr/0018-agent-graph-tools-and-caps.md)):
| Cap | Value | Count |
|---|---|---|
| Tool calls | 4 | within at most 2 `act` LLM rounds (calls may be batched in parallel) |
| LLM calls | 6 | understand 1 + act up to 2 + draft 1 + regenerate up to 1 + 1 spare for a transient retry |
| Wall time | typical p95 under 15 s (NFR-1); hard stop 25 s, then `ai_failure` item | |
| Tokens out | understand 300, act 300 per round, draft 1200 (JSON with `claims[]`, Devanagari; reply text itself at most 600 chars, G9) | |
| Other | per-tool timeout 5 s, `recursion_limit` 12 (**verify**), at most 2 restarts per turn (2.3) | |
Latency plan: `understand` about 1 s, retrieval about 0.5 s in parallel, 0 to 1 loop rounds, draft 2 to 3 s, guard under 50 ms. Task names for the gateway: `agent.understand`, `agent.act`, `agent.draft`, `agent.summarize`, `transcribe`, `embed`, `eval.judge`. Model per task is config ([0011](adr/0011-litellm-in-process.md)).

### 2.3 In-run races ([0023](adr/0023-run-races-and-review-concurrency.md))
The run records `inbound_high_water` (newest inbound id) and `started_at` in `load_context`. The post-step runs in one transaction that locks the conversation row and checks, in order:
| Event during or after the run | Rule |
|---|---|
| New inbound after high water (architecture section 3 bursts) | Discard draft, enqueue a new run (new job id, so a new thread id). At most 2 restarts per turn; the third run is not restarted, and any later inbound waits for its own job. Caps and token budget are per run, not shared. |
| Owner composer message after `started_at` | Discard draft, no send; owner has taken over (same as auto-resolve). |
| `ai_paused` set, or open review item exists | Discard draft, no send, no holding reply (the owner already owns the chat). |
| A restart (new inbound) or a discarded draft | No holding reply: the new run decides. A holding reply is written only by the post-step that also inserts the review item. |
| STOP or opt-out before send | Outbox send-time check blocks it (holding reply included); an open item is closed as `expired(opted_out)`. |
| Owner message, `ai_paused=false`, opt-out or a reminder job at the same time | One guarded `UPDATE review_items SET status=... WHERE id=$1 AND status='open' RETURNING`; the loser sees no row and does nothing (a reminder job then no-ops). A partial unique index allows one open item per conversation. |
In-graph guard and post-step guard run the same code against fresh rows; if they disagree, the post-step wins and a `guard_divergence` score is logged.

## 3. Grounding in inventory
| Step | Rule |
|---|---|
| Retrieval | Structured filters from entities (budget, brand, year, fuel) plus vector plus trigram text, tenant filter inside the query ([0015](adr/0015-embeddings-storage.md)). Hinglish query rewrite in `understand`. Stable text only is embedded, so price and stock come from the row at run time. |
| Typed result | `Found(items)`, `NotFound`, `Error`. `Error` never becomes "no match": it holds the reply and alerts (H-29). |
| Refs | Each item gets a run-local ref (`I1`). The draft cites refs in `claims`; the guard resolves them to rows. |
| Allowed facts | `list_price`, `status`, public attributes, tenant address and hours, knowledge text. Anything else (warranty, inspection, finance, accident history, delivery) needs a knowledge or attribute source. |
| Not found | Say it is not in stock, offer up to 2 close alternatives from results, or offer owner follow-up. Never invent. |
| Sold or reserved | Not offered as available; guard rechecks status at send time. |
| Imported text | Item descriptions and knowledge are wrapped as data blocks; instructions inside them are ignored by prompt and by the allowlist. |

## 4. Per-business persona and config
| Config (in `tenant_config`) | Use in the agent |
|---|---|
| `persona_name`, `persona_style`, `tone` | Rendered into the persona block of the prompt: validated length and charset, escaped. Set by the team ([owner decision 10](../../docs/production-plan/04-owner-decisions.md)). |
| `languages` (en, hi, mr) | Reply in the customer's language and script if allowed; romanised Hinglish replies in Latin script. Script check in guard. |
| `business_hours`, `holidays`, `quiet_hours`, `away_message` | One hours resolver. Prompt gets "now (IST)" and open or closed. Visits only inside hours. When closed: still answers, and uses `away_message` for visit requests. |
| `max_discount_pct` | Discount authority. Default 0. The prompt says "you may move in steps; never state a limit"; the guard enforces the number (section 5). |
| `followup_policy` | Section 9 |
| `config_version` | Stored on each reply and trace |
Prompt layers: global `agent.system` (versioned, [03 data](03-tenancy-data.md) `prompt_versions`), persona template, optional per-tenant override; the resolved version ids are saved on the message and in `agent_runs`. No fabricated persona facts: if a field is empty the prompt omits it (H-25, H-26). AI disclosure line in the first customer message (FR-25), wording set by the owner.

## 5. Reply guard ([0019](adr/0019-reply-guard-and-injection-defence.md))
Pure function `guard(draft, retrieved, cfg, now) -> Pass | Regenerate(codes) | Hold(codes)`. Runs in the graph and again in the post-step.

| Code | Check | On fail |
|---|---|---|
| G1 | Draft parses against the schema | regenerate, then hold |
| G2 | Every price, year, km and item count in the text appears in a claim backed by a retrieved row. Normalises Indian formats ("3,50,000", "3.5 lakh", "3.5L", Devanagari digits). Out of scope: business hours, the business phone, slot times (checked by G7, G8) | regenerate, then hold |
| G3 | Every item named maps to a row in this run's results with `status=available` | regenerate, then hold |
| G4 | Forbidden-claim lexicon (warranty, guarantee, inspection, loan, EMI, accident, "only 1 left", "sold today", testimonials; en and romanised hi, mr) needs a claim with a knowledge or attribute source containing it | regenerate, then hold |
| G5 | Floor and cost: only amount-like tokens are compared (4+ digits, or with lakh, k, rupee sign), so years and km never match. Any amount equal to `cost_price`, or to `min_price` that is not the declared `offer_price` or a backed `list_price`, holds. No words "floor", "cost price", "margin" | hold at once (no regenerate) |
| G6 | `offer_price >= max(list_price*(1 - max_discount_pct/100), min_price)`; default authority 0. An offer exactly at `min_price` is allowed only when `max_discount_pct` already reaches it, and is flagged in the trace. G5 exempts the declared `offer_price`, so closing at the floor is possible without leaking it elsewhere | hold with owner hint ("customer asked for X") |
| G7 | Visit times come from `check_availability` and sit inside hours and outside holidays | regenerate, then hold |
| G8 | Only the business's phone and map link, allow-listed domains, no canary string from the system prompt, no other customer's phone or name (guard gets the tenant's contact names and numbers for a deny-match; the real barrier is that tools and history only return this conversation's data) | hold |
| G9 | Length at most 600 chars, no markdown tables, language and script match | regenerate |
| G10 | `choose_send_mode` gives `session` or an approved template, otherwise `hold` | hold (`held_window`) |
Violation codes (not the text) go back to the model on regeneration and to Langfuse as scores. Hold rate and false-hold rate are tracked in evals (section 10). Known limit: lexicon plus number checks will miss paraphrased claims; mitigated by the eval set, and an LLM verifier is an option after measurement.

## 6. Prompt injection defence and tool governance
| Layer | Control |
|---|---|
| Prompt | Static system prompt. Untrusted text only in the user turn inside data blocks with a random per-run boundary; labelled as data. |
| Input | Cap length, strip control and zero-width characters, normalise Unicode. |
| Detection | Signal classifier (patterns for "ignore previous", role changes, "system prompt", requests for prices below list, in en and romanised hi), weights per the agent-governance skill. It does not block the customer; it sets `injection_suspected`. |
| Effect of flag | Confirm and propose tools removed for the turn, stricter guard (no regenerate, hold on any violation), owner sees the flag in the review reason. |
| Tools | Allowlist per run (2.2), schema-validated args, no id arguments, per-run caps, read-only DB role through `tenant_tx`, no network tools. Fail closed. |
| Confirmation | Booking and discount need server-held state (held booking, config). Words from the customer alone never create one; confirm rules are in section 8. |
| Output | Guard (section 5) and canary check. |
| Audit | Every tool call, denial and guard result in `agent_runs` and the Langfuse trace. |
| Not used | Trust scoring (multi-agent only; single agent here). |
Governance level: **Strict** for money (discounts above authority go to the owner) and for bookings (server-held state plus deterministic customer confirmation, no owner approval needed), **Standard** elsewhere.

## 7. Hold and escalate ([0025](adr/0025-hold-and-escalate.md), [0009](adr/0009-agent-durability-and-review-queue.md))
Triggers (`review_items.kind`): `held_reply` (guard hold), `escalation` (human wanted, complaint, discount above limit), `held_window` (no approved template, or window closed), `ai_failure` (LLM or retrieval down, cap hit, voice failure), `unknown_send` (alert-only: an unknown send outcome may have been delivered, so it never triggers a holding reply; the failed or unknown send of a holding reply itself opens no new item).

Flow: guard or route says hold -> post-step, one transaction: insert `review_items(open, draft, reason codes)`, insert the holding-reply outbox row (if allowed), insert `notify_owner` and the three timed jobs -> customer sees the holding reply -> owner alerted on email, WhatsApp and the "Needs you" flag -> owner types the reply in the Conversations composer -> item resolves, AI resumes on the next customer message.

| Rule | Detail |
|---|---|
| While open | New inbound is stored and appended to the item; the agent drafts nothing. Customer message 2 to n: a fixed `received` acknowledgement (no claim), at most once per 2 h and 3 per item, window permitting; beyond that the message is stored and the owner is re-alerted (cap against spam; owner to confirm). Other system sends: the holding reply (once) and the 4 h notice (once). |
| Holding cooldown | At most one holding reply per conversation per 30 min across items, so `ai_paused=false` without a reply cannot loop (item and alerts still happen). |
| Stuck item | At 24 business hours still open: `team_tasks` entry `stuck_review` plus a final all-channel owner alert (`escalated_to_team_at`). The item stays open. |
| Resolve | `owner_replied` only when the owner's reply is accepted for send by the provider (session text or approved template). If the window is closed and no template path exists, the reply is stored as `pending_window`, the item stays open as `held_window`, and the owner is told (alert and "Needs you: reply could not be sent, customer window closed"). Also `ai_paused=false` (`owner_resumed`) and opt-out (status `expired`, resolution `opted_out`). No approve, edit-and-send or reject. |
| Never | Auto-send a held draft, on timeout or otherwise. |
| One open item | Partial unique index `(conversation_id) WHERE status='open'`; a second trigger appends to the open item. All resolves use the guarded UPDATE in 2.3. |
| Idempotency | Holding reply idem key `hold:{item_id}`; alert and reminder jobs have dedup keys; a replayed post-step cannot send twice. |
| Audit | Item open, alerts sent or failed, reminders, resolve and who resolved go to `audit_log` (FR-24). Edit distance between draft and the owner's reply is stored for evals. |
| Why not `interrupt()` | Items must outlive checkpoint pruning; the owner does not resume a graph, the next customer message starts a fresh run. |

### 7a. Holding reply and reminders
**Holding templates** (per language en, hi, mr and romanised Hinglish; versioned in `tenant_config.holding_templates`; wording is an owner decision and a gate: each version carries `approved_by` and `approved_at`, and an unapproved version is never sent, onboarding check E8.5 fails without it). Rules: statements of receipt or of the current state only. No price, availability, discount, time, warranty, promise ("will", "let you know", "get back", "confirm", "soon", "within"), no claim about what the team did ("informed"), digits. Draft wording, owner to approve:
| Case | Text (en) |
|---|---|
| Hold or escalate | "Thank you for your message. We have received it." |
| Complaint or wants a person | "Thank you. Your message is with the team." |
| Voice note not understood | "I could not hear that clearly. Could you please type your message?" |
| Later message while open (2 to n) | "Thank you. Your message has been received." |
| 4 h notice | "Thank you for your patience. Your message is still with the team." |
"Is with the team" is sent only when the item exists (always true at send time). The `holding_reply` node picks by `kind` and language (customer's language, else tenant default); it never calls the LLM. A test asserts each template passes the guard lexicon (G4 words, digits, amounts) and a second deny-list test rejects the promise words above in any language version, so a wording change cannot reintroduce a claim.

**24h window rules.** The holding reply is session text only. `choose_send_mode(purpose=holding)` returns `session` when the window is open (normal: the customer just wrote) and `hold` otherwise: then no message is sent, the item gets `held_window`, and the owner alert states "no reply could be sent". No template is used for holding replies. The 4 h notice follows session text when the window is open; when closed it uses the approved template `team_notice` (static text, no variables beyond the business name; verify approval). If no `team_notice` template is approved, the notice is recorded `skipped_window` (never sent as session text) and a `team_tasks` entry is opened at once; the owner accepts this residual case. The owner WhatsApp alert is a different send (to the owner's number): session text if the owner's window is open (tracked in `tenants.owner_last_inbound_at`, written when inbound from `owner_phone` is stored and ignored, never a contact), else template `owner_alert`. Template variables have length and newline limits (verify): the alert carries the draft truncated, the full draft is in the email. Alert text ends "Reply in the Vyavsay app (replying here is not read)."

**Alert content.** Customer name and number, the customer's last message (or transcript), the reason, the AI's draft and the instruction "reply in Conversations". Email and WhatsApp carry the draft so the owner can copy it. Contents go only to the owner's own channels, never to logs or traces.

**Reminders** (jobs, business hours via the one resolver, [architecture 3](02-architecture.md)): the first alert is immediate; reminders at 30 min and 2 h repeat all channels with the elapsed time; at 4 h the customer notice goes once and the chat stays open for the owner. Each job re-checks: item `open`, no owner message, not opted out, tenant active. If the owner replied or resumed, jobs no-op. If the item opened outside hours, the clocks start at the next opening. Empty `business_hours` defaults to Mon to Sat 10:00 to 19:00 IST (onboarding check warns); the 4 h notice never waits more than 24 h wall-clock. A job handler recomputes its due time with the resolver at run time and requeues if early, so edits to hours or holidays take effect; the job row's dedup key is the single source of truth and the `reminder_*_at` column is written in the same transaction as send acceptance.

**Resume.** After resolve the AI answers the customer's next message normally with the owner's reply in history. If the customer wrote while the item was open and the owner replied, no extra AI turn runs for those messages (the owner answered). If the owner only used `ai_paused=false`, the next customer message starts a run; an `ai_paused=false` with unanswered inbound enqueues one run for the pending messages.

**Cases.**
| Case | Holding reply | Item and alerts |
|---|---|---|
| Guard hold, escalate route, AI or retrieval failure, discount above limit | yes (window open) | yes |
| Window closed (for example reminder or follow-up run) | no | yes, `held_window` |
| Opt-out (STOP) | no | no item (item closed `opted_out`) |
| `ai_paused` or owner already replied | no | no new item |
| `unknown_send` | no | yes, alert-only |
| Holding cooldown (another holding sent in the last 30 min) | no | yes |
| Plan limit reached | the existing limit message (FR-18), not a hold | owner notice per FR-18 |
| Injection suspected | yes (fixed text is safe) | yes, flag in reason |

## 8. Calendar booking ([0026](adr/0026-calendar-via-calcom.md), Cal.com)
```
customer wants visit -> check_availability (Cal.com slots ∩ hours ∩ DB holds, IST)
 -> agent offers 2-3 slots (no DB hold yet) -> customer picks -> post-step: bookings.held (TTL 2 h, exclusion constraint)
 -> agent asks "confirm Sat 11:00, <car>, <address>?" (booking marked awaiting_confirmation)
 -> customer says yes -> confirm_booking (id from server) -> job calendar_write (Cal.com booking, our booking id in metadata)
 -> confirmed + `tasks` row type visit (what the Appointments page lists; written by the worker) + reminder job + confirmation message
 failure -> hold released, holding reply, review item, no false confirmation
```
**Confirm rule (code, [0022](adr/0022-booking-confirmation-and-hold-ttl.md)).** `confirm_booking` is allowed only when all hold: a `held` booking in `awaiting_confirmation` exists and is unexpired; the last outbound AI message was that confirm prompt; the inbound is at most 60 chars and matches an affirmative lexicon (yes, haan, ho, ok, pakka, and so on, en/hi/mr); no injection flag. `confirms_pending_slot` from `understand` is only a hint and cannot open the tool alone. A voice reply goes through the same check on its transcript.
**Hold expiry.** The 2 h TTL (business hours only, owner decision) replaces 15 min, which is unrealistic on WhatsApp. A "yes" after expiry does nothing by itself: the run re-checks availability; if the slot is still free it re-holds and asks again, else offers new slots. **Calendar write failure** after confirm: hold released, no confirmation message, holding reply and review item (section 7).
Reschedule and cancel use the same path (new hold, then update or cancel in Cal.com). A change made by the owner in Cal.com arrives by webhook and updates the booking and the visit task; if the customer must know, a notice job runs under the window rules. Reminders go as session text if the window is open, else a template (architecture section 8).

**Connect UX.** No calendar connect screen exists in `../frontend/src` and none is built: the team creates the Cal.com account, event type, availability and API key at onboarding ([0026](adr/0026-calendar-via-calcom.md)). Cloud vs self-host, attendee email, and free-tier limits are **verify** items for the spike.
**Isolation.** The event type id is `UNIQUE` across tenants in `tenant_integrations`; credentials and event type come only from run context, never from a tool argument; an isolation test creates two tenants and proves tenant A's run cannot read or write B's bookings. Cal.com calls are made by the worker, never by the graph.
No calendar connected or `reauth`: `check_availability` is removed from the allowlist; the agent collects a preferred time and opens a `visit request` task plus review item (PRD cut-line fallback; the customer gets the holding reply). Visits never offered outside hours (G7).

## 9. Voice notes and follow-ups
**Voice** (pipeline in architecture section 6). Agent side:
- The transcript is untrusted user text, `source=voice`. Stored with its confidence.
- Low confidence or empty: reply asking for text, plus a review item (FR-5). Threshold comes from the STT sample test ([0005](adr/0005-stt-vendor-and-model-gateway.md)).
- Amounts, dates and phone numbers heard in voice are read back for confirmation before a booking is held.
- Text replies only. The frontend `POST /voice/extract-walkin` uses the same `transcribe` port plus a structured extraction task, outside the conversation graph.

**Follow-ups** (FR-14). The LLM does not schedule freely.
| Rule | Detail |
|---|---|
| Creation | Post-step creates `followups` rows from `followup_policy` (steps, gaps, max, default 3) when a lead goes quiet; the model only suggests a reason (interest, item). |
| Content | v1: follow-ups are templates only (approved, variables name and item), with a deterministic send-time check that the item is still available. A `mode=followup` agent run inside the window is rare and cut from v1 (can return after pilot data); `mode=reminder` is not a graph run at all, it is a `visit_reminder` job with a template or session text (architecture section 8). So `mode` is `reply` only in v1; remove the other values from state if unused. |
| Cancel | On any inbound message, stage closed, opt-out, `ai_paused`, open review item, item sold (skip or alternative). |
| Send-time check | Window and mode via `choose_send_mode`, opt-out, quiet hours (IST), caps, as in architecture section 4. |
| Review | A guard hold on a follow-up creates a review item like any other. |

## 10. Eval plan
| Item | Plan |
|---|---|
| Dataset | `evals/*.jsonl` in repo, mirrored as a Langfuse dataset. Demo dealer fixture (about 40 items, knowledge docs, config, floor prices). Minimum 150 cases at M3, grown from pilot. |
| Mix (minimum) | grounding and not-found 30; negotiation, floor and max discount 25; invented claims bait (warranty, finance, accident) 20; prompt injection (customer, voice transcript, poisoned catalog and knowledge text) 25; Hinglish and Marathi intent and language 25; booking flows and confirmation 15; out-of-window and opt-out 10; handoff and complaint 10. |
| Case fields | input turns, fixture ref, expected outcome class (reply, hold, escalate), hard assertions (must or must not state), notes. Labels by a Hinglish and Marathi speaker: owner names the labeller by M2 (dated), otherwise M3 ships with a 60-case set and the gate is marked provisional. |
| Layer 1 (no LLM) | Guard unit and property tests (number parsing, lexicon, floor leak, close at floor, year or km digit collisions), allowlist tests, hours and IST fake-clock tests. Also: review state machine concurrency (owner message vs `ai_paused=false` vs opt-out vs reminder job, one open item), holding reply never sent with opt-out, `ai_paused` or closed window, holding templates pass the guard lexicon, holding reply exactly once under replay, reminders at 30 min, 2 h and 4 h on a fake business-hours clock (closed day, holiday), reminders no-op after owner reply, tenant isolation of tools and checkpointer prefix, `GET /conversations` shaping contract test (`summary` prefix "Needs you", `ai_paused` true while open, no new fields), hold expiry then "yes", calendar write failure, owner message during a run, new inbound during a run (restart cap), STOP while an item is open, in-graph vs post-step guard divergence, confirm rule (lexicon, last-message check). Every PR. |
| Layer 2 (LLM) | End-to-end graph runs with real gateway and fixture tools. Code graders for hard rules; LLM judge for tone, helpfulness, language, calibrated against 30 to 50 human labels (Langfuse judge-calibration method) before it is trusted. |
| Metrics | Ungrounded price or availability under 1% (PRD); floor leak, invented claim, injection success, unauthorised tool call: 0; correct hold or escalate rate; false hold rate; intent accuracy; booking confirmation precision; p95 latency; cost per conversation. Targets for soft metrics are owner decisions. |
| CI gate | PR touching agent, prompts or config: layer 1 plus smoke subset (about 40 cases incl. all hard classes, cheap model). Merge to main, nightly and release: full set, 3 repeats for the safety classes. Flakiness rule: a failing case is re-run 3 more times at temperature 0 and blocks only if it fails 2 of the 4; every flake is logged and triaged within a sprint. Injection and floor-leak "0" is a sample bar on this set, not a proof. Soft metrics may not drop more than an agreed margin against the stored baseline. Cost cap per run. |
| Mechanism | pytest harness, results posted as Langfuse dataset runs (SDK experiments or `langfuse/experiment-action`, **verify** current version). Forked PRs cannot read secrets: gate on internal branches or `workflow_dispatch`. |
| Feedback loop | Each hold and each owner reply to a held item is a candidate case (PII scrubbed, labelled) added through review. Edit distance between the AI draft and the owner's reply, and the false-hold rate (owner sends the draft almost unchanged), are online scores. |
| M3 verify spike | Pinned LangGraph: `RetryPolicy` path, checkpointer `setup()`, `recursion_limit`, `Command` plus static edge behaviour, and a job-scoped thread-id prune job (7 days, delete by prefix, tenant offboarding included). |
| Prompt change | New `prompt_versions` row as `draft` -> eval -> `active`; rollback is reactivating the previous. Tenant overrides run the smoke subset with that tenant's config at activation. |

## 11. Langfuse tracing and prompts ([0011](adr/0011-litellm-in-process.md), [0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md))
| Topic | Design |
|---|---|
| Trace | One trace per agent run: span per node, generation per LLM call (from our gateway wrapper, since LiteLLM not LangChain makes the calls), span per tool call, guard result as scores. Trace id stored in `agent_runs` and `llm_usage`. Use the current Langfuse Python SDK (OpenTelemetry based; **verify** version and LangGraph handler fit). |
| Metadata | tenant id, conversation id, run id, mode, source, prompt version ids, config version, model per task, outcome. |
| Masking | A mask function on SDK input and output removes phone numbers (regex) and names (known contact, persona and owner names from the DB), addresses, tokens before export; masking test in CI with seeded PII (**verify** SDK `mask` option). Never trace raw audio or secrets. |
| Scores | `guard_violations`, `held`, `owner_edit_distance`, `owner_resumed_without_reply`, latency, cost. Alerts on hold rate or error spikes (NFR-6). |
| Hosting | Langfuse Cloud with masking of names and phone numbers (owner decision D6, [0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md)). Region and DPDP cross-border position: verify, owner confirms. |
| Prompt source of truth | The DB `prompt_versions` table (immutable, per-tenant overrides, available when Langfuse is down). Langfuse Prompt Management is not used at runtime in v1; optionally mirror the active global prompt on activation for diffing and experiment links. |
| Prompt discipline | One change per version, each version evaluated before activation, id saved on every reply. |

## Needs owner decision
0. Booking hold TTL: 2 h business-hours default proposed ([0022](adr/0022-booking-confirmation-and-hold-ttl.md)); confirm, and confirm that bookings need only customer confirmation.
1. (Settled D3) No banner or approve button: owner replies in the composer.
2. (Settled D5) Calendar is Cal.com; open: cloud vs self-host and the attendee-email workaround ([0026](adr/0026-calendar-via-calcom.md)).
3. (Settled D2, D4) Alerts on three channels; reminders 30 min and 2 h; customer notice at 4 h business hours. Open: holding-reply wording in en, hi, mr and the 4 h notice wording; `owner_alert` template copy.
4. Discounts: default authority 0 with `max_discount_pct` from the team; may the agent name a discounted price, or only say "owner will confirm"?
5. Follow-up defaults: steps, gaps, quiet hours, max 3; submit template copy early.
6. Eval bars for soft metrics, and who labels 150+ Hinglish and Marathi cases (pilot dealer help).
7. (Settled D6) Langfuse Cloud with masking. Open: region.
8. AI disclosure wording for the first customer message.
9. Voice low-confidence threshold (after the STT sample test, PRD item 13).

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Guard lexicon and number parsing miss paraphrased claims or Marathi forms | Invented claim sent | Eval set with adversarial cases, optional LLM verifier after measurement |
| Too many false holds | Customers see holding replies, owner overload | Track false-hold rate, tune lexicon, reminders |
| Owner copies the draft by hand | Slow answers | Draft in email and WhatsApp; reminders at 30 min and 2 h; customer notice at 4 h |
| Holding reply wording implies a promise or a claim | Trust and legal risk | Fixed owner-approved templates, no LLM, guard-lexicon test |
| Alerts missed (spam, closed WhatsApp window) | Owner answers late | Three channels, `owner_alert` template, reminders, alarm on open items over 2 h |
| Latency above 15 s with 3 to 4 LLM calls | NFR-1 miss | Parallel prefetch, small model for `understand`, skip loop for simple turns, caps |
| Cal.com cloud free tier limits, attendee-email rule, webhook gaps | Booking blocked or out of sync | Spike, daily reconcile, visit-request fallback, self-host option (verify) |
| Prompt injection through imported sheets or catalog text | Steered replies | Data blocks, no side-effect tools, guard, poisoned-data eval cases |
| LangGraph APIs differ from assumptions (RetryPolicy path, checkpointer setup, recursion limit) | Rework | Pin versions, spike in M3, marked **verify** |
| Langfuse masking misses names or phone numbers | Privacy exposure on Langfuse Cloud | Mask tests with seeded PII in CI, name deny-list from DB, region choice |
| Eval LLM judge drift or bias | False confidence | Calibrate against human labels, keep code graders for hard rules |
| Per-tenant prompt overrides bypass the suite | Unsafe prompts | Smoke subset required at activation, guard stays in code |
| Restart loops on chatty customers | Cost, latency | Restart cap 2, debounce, caps per run |
| Affirmative lexicon misses or over-matches ("haan but...") | Missed or false confirm | Short-message rule, readback of slot, eval cases |
| Cal.com key or event type mix-up across tenants | Cross-tenant booking access | Per-tenant key in `tenant_secrets`, UNIQUE event type, id from run context only, isolation test |

## Review log
| Skeptic point | Outcome |
|---|---|
| G5 vs G6 | Fixed: amount-like tokens only, offer_price exempt (G5, G6) |
| Booking governance, hold TTL, LLM-derived confirm | Fixed: ADR 0022, section 8 |
| Caps inconsistent | Fixed: one budget table, ADR 0018 amended |
| In-run races, unique index | Fixed: section 2.3, ADR 0023, 03-tenancy-data |
| `agent_runs` missing | Added to 03-tenancy-data (class C, 90-day retention proposal) |
| Summary node, M-26 | Fixed: `summarize` job, A4 |
| G2 breadth, G8 mechanism | Fixed: G2 scoped; G8 relies on tool scoping plus deny-match |
| `mode=reminder`, followup run | Fixed: cut from v1 |
| Prefetch embed cost | Fixed: vector leg after route |
| 0021 isolation | Fixed: unique id, test |
| Eval flakiness, labeller | Fixed: rule and date |
| Layer-1 tests, FR-15 note, M3 spike | Added |
| Earlier docs (02:147, 0006, 0009) | Updated with amendment notes |
| Owner Q&A 2026-10-07 (D1 to D8) | Applied: A6, `holding_reply` node, sections 2.3, 7, 7a, 8, 10, 11; ADRs 0025 to 0027 |
| Cut "Needs owner decision" for the labeller as separate item | Rejected: already item 6 |
