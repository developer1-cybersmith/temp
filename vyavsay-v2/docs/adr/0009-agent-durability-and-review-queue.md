# 0009. Agent durability and review queue

Status: Proposed
Date: 2026-10-07

## Context
Agent runs take several LLM calls (NFR-1). Workers can die mid-run. Held items must wait hours for an owner.

## Decision
- LangGraph `AsyncPostgresSaver`, `thread_id = "{tenant_id}:{conversation_id}:{job_id}"` (amended by 0018; was `{tenant_id}:{conversation_id}`), separate schema, granted to worker role only, never reachable from API routes. `setup()` runs at deploy (verify API).
- Checkpoints are for crash recovery and short working memory. `messages` stays the source of truth. Checkpoints pruned after 7 days.
- No side effects inside graph nodes. The graph returns `ProposedReply` or `ReviewRequest`; a deterministic post-step runs grounding and floor-price checks, then writes an outbox row (0003).
- Review queue is a table (`review_items`: reason, draft, status; amendment below), not `interrupt()`. (Superseded by 0025: the owner types the reply, the draft is never auto-sent.) This survives pruning.
- Job retry resumes via `invoke(None, config)`; nodes must be idempotent.

## Consequences
+ Crash-safe, no double send, audit-friendly. - Checkpoint tables hold cross-tenant text: grants and an assertion on thread id prefix are mandatory; extra storage.

## Alternatives
No checkpointer (reruns from start; simpler but repeats cost); `interrupt()` for approvals (couples to checkpoint retention).

## Amendments
- Thread id now includes the job id, and history comes from `messages`: see [0018](0018-agent-graph-tools-and-caps.md). Approval UX: [0020](0020-review-queue-approval-ux.md) is superseded by [0025](0025-hold-and-escalate.md): no approve flow; the owner replies in the Conversations composer, the item stays a table row.
