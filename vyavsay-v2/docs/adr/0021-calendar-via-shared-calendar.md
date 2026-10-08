# 0021. Calendar access by sharing with a service account (amends 0006 for Calendar)

Status: Superseded by [0026](0026-calendar-via-calcom.md)
Date: 2026-10-07

## Context
The frontend has no Google connect flow: a search of `../frontend/src` finds no calendar, Google or OAuth code, only the Appointments page (built on `/tasks`) and icons. 0006 chose admin-assisted OAuth with a callback route and refresh tokens. OAuth for user calendars needs a consent screen; apps not yet verified by Google may have short-lived refresh tokens and test-user limits (verify current rules), and sensitive-scope verification takes time.

## Decision (superseded, historical)
- Default: the same pattern as Sheets. The owner shares their Google Calendar with the Vyavsay service account ("Make changes to events"). The team enters the calendar id in `tenant_integrations` (kind `calendar`) and runs an onboarding check: free/busy read, create then delete a test event.
- No refresh tokens stored. Status `ok` or `reauth` (check fails, for example the share was removed); failure notifies the owner and the team.
- Service accounts cannot invite attendees without domain-wide delegation (verify), so the event description carries customer name, car, and phone. Owner-facing only.
- Keep the OAuth callback design from 0006 as the fallback if the share model fails the onboarding check or an owner insists on a personal-account flow.
- No frontend change.

## Consequences
+ No token expiry, no consent verification, simple revoke (unshare). - Manual onboarding step; events show the service account as creator; one shared credential to protect (KMS, rotation).

## Alternatives
OAuth per tenant (0006); a "Connect Google" button in Settings (frontend exception, needs OAuth anyway).
