# 0020. Review-queue approval UX

Status: Superseded by [0025](0025-hold-and-escalate.md)
Date: 2026-10-07

## Context
FR-15 needs the owner to see, edit and approve held replies. Frontend evidence (`../frontend/src/pages/Conversations.tsx`): the only controls are the `ai_paused` toggle (l.146, 496-515) and a send box (l.163); every message whose sender is not `customer` renders as an outgoing bubble, labelled "AI" or "You" (l.232-262), so a held draft cannot be shown as a message without looking sent. The list shows `summary` and a PAUSED badge (l.419-426). The chat polls messages every 3 s (l.96). No notification surface exists in the frontend.

## Decision (superseded, historical; the owner-number rule now lives in 0025)
- Backend, no frontend change (works on day one): an open review item makes `GET /conversations` return `ai_paused=true` and a `summary` prefixed "Needs you: <reason>" (response shaping only). The agent stays silent on that conversation while an item is open. The owner is notified by email with the draft text (SES, verify) and replies in the existing composer; a manual owner message resolves the item. `PATCH ai_paused=false` resolves it as "owner resumed".
- Named frontend exception (needs owner approval): one additive component in the Conversations chat pane, a "Held reply" banner with the draft, Approve, Edit and send, Reject. It reads an additive `review` object on the conversation and calls `POST /review-items/{id}/approve|reject`. No new route, no nav change.
- Not for v1: approval by WhatsApp reply (owner number is a normal contact, 24h and template rules apply, ChatSyncs owner-phone echo still unknown; send and templates documented, unverified).

## Consequences
+ Pilot can start with zero frontend change; the banner removes copy-paste. - Without the banner the owner types the reply by hand (draft only in email).

## Alternatives
New "Review" screen (new route, nav, polling; larger exception); WhatsApp approval (parsing risk, window cost).
