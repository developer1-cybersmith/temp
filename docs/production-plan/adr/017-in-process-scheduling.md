# 017. All scheduling in-process (node-cron, setTimeout)
**Status:** Accepted (inferred)
## Context
- No queue, pg_cron or lock found. Jobs: daily report 21:00, follow-up every 6h (48h hardcoded), sheets sync every 2 min.
## Decision
- Run inside the API server.
## Consequences
- 2+ instances duplicate every job. Restart skips runs.
- Reminders live only in memory; lost on restart; no rehydrate; over 24.8 days overflows.
- Nudges and reports ignore the 24h window (templates needed). Daily report may send to the business's own number.
- `followup_timer_hours` ignored.
