# 0011. LiteLLM as in-process SDK behind ModelGateway

Status: Proposed
Date: 2026-10-07

## Context
Owner chose a model gateway with task-to-model config (0005). Choice remains: LiteLLM proxy server or SDK in-process.

## Decision
- Use the LiteLLM Python SDK (Router for fallbacks and retries) inside the worker, behind our `ModelGateway` port. No separate proxy service in v1.
- Task-to-model map and fallback order in config. One `llm_usage` row per call (tenant, task, model, tokens, cost, latency) feeds limits (FR-18).
- Langfuse tracing via our own wrapper (masked inputs); version of integration is verify. Langfuse Cloud with name and phone masking, not self-host ([0027](0027-langfuse-cloud-backups-chatsyncs-wait.md)).
- Pin versions with hash-locked requirements; watch security advisories before every upgrade (verify current supply-chain status).

## Consequences
+ One less service, simple deploy, easy tests. - Gateway keys live in worker tasks; swapping to a proxy or another library only touches the adapter.

## Alternatives
LiteLLM proxy (extra service and DB, central key control; revisit when many apps share it); direct vendor SDKs (no fallback routing).
