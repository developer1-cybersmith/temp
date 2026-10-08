# 016. Appointments reuse `wb_tasks`; IST hardcoded
**Status:** Accepted (inferred; migration 006)
## Context
- Frontend Appointments page reads `/tasks` and parses emoji titles.
## Decision
- Appointment = task with `appointment_time`. Availability check only in AI booking. Times use +05:30; no tenant timezone.
## Consequences
- Manual task API can double-book. Title-parsing is fragile.
- Hours text "Mon-Sat 10-7" hardcoded in prompt.
