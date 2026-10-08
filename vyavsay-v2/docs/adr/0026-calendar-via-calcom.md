# 0026. Calendar booking via Cal.com (supersedes 0021 and the calendar part of 0006)

Status: Accepted by owner 2026-10-07 (D5); details marked **verify** until tested. Supersedes [0021](0021-calendar-via-shared-calendar.md); amends [0006](0006-per-tenant-integrations.md) (calendar only).
Date: 2026-10-07

## Context
The owner chose Cal.com (free, open source) over Google Calendar. The frontend has no connect screen and shows visits only through `/tasks` (Appointments page). Cal.com facts below are from memory, not checked (docs tools offline): AGPL licence, webhook event names, booking metadata, slot-rejection error, ToS for many free accounts, hiding the event type from public booking are all **verify**.

## Decision
- `CalendarPort` (`get_slots`, `create_booking`, `reschedule`, `cancel`, `find_booking`) with a `calcom` adapter and a fake. Writes only from the worker (R5).
- **Hosting (verify):** pilot on Cal.com cloud free tier (API, webhooks and rate limits on free plan: verify). Self-host (AGPL, own Postgres, upgrades) only if limits, cost or data residency force it; the port makes the move an adapter config change.
- **Accounts (verify):** one Cal.com account and one event type ("Showroom visit") per business, created by the Vyavsay team at onboarding. The event type is hidden from public booking pages (verify). Team sets availability, duration, buffers, minimum notice. The owner may link their own calendar inside Cal.com; that is their choice, not our integration.
- **Credentials:** API key and webhook secret in `tenant_secrets` (kinds `calcom_api_key`, `calcom_webhook_secret`, envelope-encrypted per [0010](0010-config-secrets-media.md)); `tenant_integrations` kind `calendar`, provider `calcom`, `external_id` = event type id. Onboarding check: read slots, create then cancel a test booking. 401 sets `reauth` and notifies owner and team.
- **Availability** = Cal.com slots intersected with `tenant_config` hours and holidays, minus our DB holds and owner-typed (manual) appointments on the Appointments page. The onboarding check compares the two and flags a mismatch.
- **Double booking, four layers:** (1) DB exclusion constraint per tenant on held and confirmed slots ([0022](0022-booking-confirmation-and-hold-ttl.md) unchanged); (2) Cal.com rejects a taken slot (error shape: verify); (3) our booking id in Cal.com metadata, and on timeout `find_booking` before any retry (never blind retry); (4) Cal.com webhook (`BOOKING_CREATED`, `RESCHEDULED`, `CANCELLED`, signature: verify) at `/webhooks/calcom/{endpoint_key}` updates our row, plus a daily reconcile poll for missed events.
- **Direction:** two-way. We create; Cal.com pushes owner-side changes. A change made in Cal.com updates `bookings` and the `tasks` visit row and, if the customer is affected, opens a notice job (window rules apply).
- **Appointments page:** the worker writes a `tasks` row (kind `visit`, `booking_id`). The `/tasks` serializer emits `due_date` (IST date), `appointment_time` (ISO) and the title `📅 Appointment: {name} — {service} at {h:mm AM|PM}` that `Appointments.tsx` parses; contract test uses its real regexes ([02 s8](../02-architecture.md)). Manual tasks pass through. Delete is a tombstone (no recreate), does not cancel the booking; completing never touches it. Frontend unchanged.
- **Attendee email (verify):** Cal.com likely needs an attendee email and WhatsApp gives none. Use a placeholder address on a domain we own, attendee emails off. Spike item.
- Fallback unchanged: no calendar or `reauth` gives visit-as-task plus owner alert.

## Consequences
+ No Google consent or token expiry; free; open source. - New vendor and webhook surface; per-tenant account upkeep; free-tier limits unknown; placeholder email is a workaround.

## Alternatives
Google Calendar (0021, replaced by owner); one Cal.com platform org with managed users (paid, verify); our own slot table only (no owner-facing calendar).
