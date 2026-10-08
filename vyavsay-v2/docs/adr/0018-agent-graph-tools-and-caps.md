# 0018. Agent graph shape, tool allowlist, caps and thread id

Status: Proposed
Date: 2026-10-07

## Context
The old agent (`../backend/src/agent/`) was a 5-node graph with LLM-driven tools, no checkpointing, no tool allowlist per state and a cap only on count (M-04, M-11). v2 must be crash-safe (0009), side-effect free inside nodes (R5) and bounded in latency (NFR-1).

## Decision
- One `StateGraph` per run: `load_context`, `pre_flight`, parallel `understand` + `prefetch`, `route`, bounded `act` loop, `draft`, pure `guard`, then `build_review` or `finalize`. Full table in `../04-agent-design.md`.
- Tools are plain async functions run by our own loop node (no LangChain `ToolNode`). The loop checks an allowlist computed per run (global policy, plan, integration status, injection flag) before every call. Tools never take tenant, contact or booking ids from the model; ids come from the run context.
- Tools are read-only or propose-only. Writes (booking hold, lead stage, outbox) happen in the deterministic post-step.
- Caps are enforced by code, not prompt: 4 tool calls in at most 2 act rounds, 6 LLM calls (understand 1, act 2, draft 1, regenerate 1, 1 retry spare), 25 s hard wall time (typical p95 under 15 s per NFR-1), draft output 1200 tokens, `recursion_limit` 12 (verify name and default), 2 restarts per turn. Breach gives a `ReviewRequest(ai_failure)`, never a partial reply.
- Thread id becomes `"{tenant_id}:{conversation_id}:{job_id}"` (amends 0009). Reason: with one thread per conversation, per-turn state (tool counter, draft) carries into the next turn. A retry of the same job reuses its thread; the tenant-prefix assertion stays.
- History comes from `messages` each run (last 12 plus rolling summary), not from checkpoints.
- Restart on new inbound (architecture section 3) creates a new job id and thread id; see 0023. Each run writes one `agent_runs` row (trace id, prompt version ids, config version, tool calls, guard result, outcome, tokens). Add to the data model.

## Consequences
+ Bounded cost and latency, auditable tool use, retry-safe. - Checkpoints no longer give cross-turn memory (intended). More rows pruned.

## Alternatives
LLM-driven ReAct loop with `ToolNode` (less code, weaker allowlist control); thread per conversation with state resets (easy to forget one field).
