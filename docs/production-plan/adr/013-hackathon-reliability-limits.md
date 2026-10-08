# 013. Hackathon-scoped reliability and abuse limits
**Status:** Accepted (inferred; CHAT-SYSTEM-AUDIT:825-869)
## Context
- Demo reliability over scale.
## Decision
- Top-level try/catch with fallback reply, context caps (memory 2000 chars, 5 items, 3 chunks), 150-message cap, inbound limit 5 msgs/30s per JID. AbortController/circuit breaker deferred.
## Consequences
- Rate-limiter files exist but nothing imports them since Baileys removal. Only the signature check guards inbound.
- Docs mark these DONE; they are partly inactive.
- Silent fallback hides provider outages (seen twice). Add alerting.
