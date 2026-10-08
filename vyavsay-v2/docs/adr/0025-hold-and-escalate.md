# 0025. Hold and escalate: the AI never goes silent (supersedes 0020)

Status: Accepted by owner 2026-10-07 (D1 to D4). Supersedes [0020](0020-review-queue-approval-ux.md).
Date: 2026-10-07

## Context
0020 kept the agent silent while a review item was open and proposed an Approve banner. The owner reversed both: a customer must never be left without a reply, the owner is alerted on three channels, and the owner answers by typing in the existing Conversations composer. No frontend change.

## Decision
- **Holding reply.** When the agent is unsure (route `escalate`, guard `hold`, retrieval or LLM failure, discount above authority, voice failure), the post-step sends one short, fixed holding reply and opens a `review_item`, in one transaction. The text is a versioned template per language (en, hi, mr, Hinglish), chosen by code, never written by the LLM, and states receipt or current state only: no price, stock, time, promise, or claim about team action ("will", "let you know", "informed", "soon" are banned by a deny-list test); each wording version needs owner approval, unapproved is never sent. It goes through the outbox and `choose_send_mode`. Idem key `hold:{review_item_id}`.
- **Window.** Holding replies are session text, sent only when the 24h window is open (normal case: the customer just wrote). Closed window: no send, the item is flagged `held_window` and the owner alert says so. `unknown_send` never triggers a holding reply. Cooldown: one holding reply per conversation per 30 min. Opt-out (STOP) and `ai_paused` never get a holding reply.
- **One holding reply per item**, plus the timeout notice below. Later inbound on an open item is stored and appended; the agent drafts nothing, but the customer gets a fixed `received` acknowledgement (at most 1 per 2 h, 3 per item, window permitting) so the chat is not silent.
- **Owner alerts (D2), all three.** Email (SES, verify), WhatsApp to `tenants.owner_phone` (session text if the owner's window is open (tracked in `tenants.owner_last_inbound_at`), else template `owner_alert` with a truncated draft, verify limits; text says reply in the app), and a "Needs you: <reason>" flag in `GET /conversations` (summary prefix and `ai_paused=true` in the response only; the DB column is untouched). Email and WhatsApp carry the AI's draft so the owner can copy it.
- **Owner answers (D3).** The owner types the reply in the Conversations page. A `business_owner` message resolves the item (`owner_replied`) only when the send is accepted. If the window is closed it goes via template `owner_reply` (typed text waits as `pending_window`) or the item stays `held_window` and the owner is told; `PATCH ai_paused=false` resolves it (`owner_resumed`). The AI resumes on the customer's next message. No Approve, Edit or Reject, no `/review-items` routes. The draft is never auto-sent.
- **Reminders and timeout (D4).** Jobs at 30 min and 2 h re-alert the owner (all channels). At 4 h the AI sends the customer a fixed polite notice ("the team will reply soon", no claims) once (session, else template `team_notice`, else recorded `skipped_window` plus an immediate team task); the chat stays open. At 24 business hours still open: team task and a final owner alert. All three clocks count business hours via the one hours resolver (starting at next opening if the item opens outside hours); the first alert is immediate. Send-time check: still open, no owner message, not opted out.
- **Races** stay as in [0023](0023-run-races-and-review-concurrency.md): guarded `UPDATE ... WHERE status='open'`, one open item per conversation. A restart on new inbound sends no holding reply; the new run decides.

## Consequences
+ No silent customer; zero frontend change; fewer states (no approve flow). - Owner copies the draft by hand; a holding reply is visible to the customer, so wording and eval cases matter; owner WhatsApp number must be kept out of the customer flow (inbound from it is a spike item); 4 h in business hours can be a long wait across a closed day.

## Alternatives
Silent until resolved (0020, rejected by owner); approve banner (frontend change, not needed); approve by WhatsApp reply (parsing, window cost).
