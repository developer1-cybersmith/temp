# 020. Vapi (plus Plivo SIP) for phone calls
**Status:** Accepted (inferred; voice design spec says rejected options "Do Not Revisit")
## Context
- WhatsApp cannot see PSTN calls; Indian KYC blocks Vapi numbers; Plivo cheapest.
## Decision
- Vapi hosts the conversation; backend is webhook and tool server. Calls in `wb_calls` / `wb_call_actions`.
## Consequences
- Webhook is public; secret check passes if env unset; placeholder secret in code.
- Tenant from `metadata.userId`, else first user (likely hit on every outbound call).
- Tables absent from migrations (005 missing). Prompts duplicated and drifted. Voice page hidden in nav.
- Inbound capture and Android app unbuilt. Scope unconfirmed.
