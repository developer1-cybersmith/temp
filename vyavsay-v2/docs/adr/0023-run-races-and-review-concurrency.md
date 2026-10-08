# 0023. Run races and review-item concurrency

Status: Proposed (still holds under [0025](0025-hold-and-escalate.md); read "approve, edit, reject" below as: owner message accepted for send, `ai_paused=false`, opt-out)
Date: 2026-10-07

## Context
Runs take seconds; inbound messages, owner actions, STOP and toggles can land mid-run or at the same moment as an approve.

## Decision
- The run stores `inbound_high_water` and `started_at`. The post-step locks the conversation row and discards the draft if a newer inbound exists (enqueue a new run with a new job id, max 2 restarts), the owner sent a message after start, `ai_paused` is set, or an open review item exists.
- Review items: partial unique index on `(conversation_id) WHERE status='open'`; every resolve (approve, edit, reject, auto-resolve on owner message, `ai_paused=false`) is `UPDATE ... WHERE id=$1 AND status='open' RETURNING`; no row means the loser does nothing.
- STOP or opt-out is checked at outbox send time; an open item is closed as status `expired`, resolution `opted_out`.
- In-graph and post-step guard share one function; disagreement is logged and the post-step wins.
- Number status `switching` ([0028](0028-provider-portability.md)) pauses send jobs only; runs and ingest continue, drafts wait in the outbox; the post-step still applies the race rules on release.
- Data: `agent_runs` table added to 03-tenancy-data (class C, worker-only).

## Consequences
+ No double sends or lost approvals, testable. - Wasted LLM work on restarts (capped).

## Alternatives
Advisory locks per conversation across the whole run (holds a connection for seconds); ignoring races (duplicate or stale replies).
