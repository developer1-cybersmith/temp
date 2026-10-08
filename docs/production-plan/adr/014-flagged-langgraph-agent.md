# 014. Parallel flag-gated LangGraph agent with deterministic guardrails
**Status:** Accepted (inferred; spec GENAI_POC_PRD.md is not in repo)
## Context
- PoC rule: do not modify legacy `pipeline-service.ts` / `ai-router.ts`. Commits 4eb8fc7 to 0e5cfec.
## Decision
- `USE_AGENT_GRAPH` (default off). Guards: `confirmed_slot` gate, `ai_paused` edge, 3-tool cap, 6s round budget, fail-open on timeout.
## Consequences
- Flag is dead: `dispatchToPipeline` has no callers.
- Agent client still points at retired GitHub endpoint.
- Duplicated LLM code. Two engines differ on handoff.
- Decide: wire in and fix, or delete.
