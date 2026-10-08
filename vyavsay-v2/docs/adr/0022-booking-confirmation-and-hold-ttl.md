# 0022. Booking confirmation and hold TTL

Status: Proposed (needs owner decision)
Date: 2026-10-07

## Context
The agent doc said bookings were held for the owner (section 6) and also confirmed on a customer "yes" (section 8). A 15 min hold (03-tenancy-data) is unrealistic on WhatsApp, and `confirms_pending_slot` was LLM-derived from untrusted text.

## Decision
- Bookings need customer confirmation only; no owner approval. Money (discounts above authority) is what goes to the owner.
- Hold TTL is 2 h counted in business hours (config, owner decision), created when the customer picks a slot; offered slots are not held.
- `confirm_booking` is allowed only if: an unexpired `held` booking in `awaiting_confirmation` exists, the last outbound AI message was its confirm prompt, the inbound is at most 60 chars and matches an affirmative lexicon (en, hi, mr), and no injection flag. The LLM flag is a hint only.
- A "yes" after expiry never confirms: re-check availability, re-hold if free, else offer new slots.
- Calendar write failure after confirm: release the hold, send no confirmation, open a review item (and send the holding reply, [0025](0025-hold-and-escalate.md)). Calendar provider is Cal.com ([0026](0026-calendar-via-calcom.md)); these rules are unchanged.

## Consequences
+ Deterministic, testable confirm. - Lexicon needs Hinglish and Marathi upkeep; terse or odd confirmations cost one extra turn.

## Alternatives
Owner approves every booking (slow, defeats automation); LLM-only confirmation (injectable).
