# 012. Webhook returns 200 first, processes async, dedupes by wamid
**Status:** Accepted (inferred; code comments)
## Context
- Meta retries 36h on non-200 and allows about 5s.
## Decision
- One app-level endpoint, one `META_APP_SECRET` HMAC. Bad signature also returns 200. `setImmediate` processing. Dedupe in `wb_webhook_events`.
## Consequences
- No queue: errors after ack are lost; failed voice notes are never retried.
- Dedupe is select-then-insert (race). 7-day purge not implemented.
