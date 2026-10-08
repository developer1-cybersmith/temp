# 0006. Per-tenant integration config (Sheets, Calendar)

Status: Proposed (calendar part superseded by [0026](0026-calendar-via-calcom.md); Sheets part stands)
Date: 2026-10-07

## Context
Frontend `POST /sheets/{action}` (sync, export-to-sheet, import-from-sheet) sends no sheet id; no UI sets one. Old code used one global sheet (H-30). Calendar has no connect screen.

## Decision
- Table `tenant_integrations(tenant_id, kind, external_id, encrypted_credentials, status, last_sync_at)`.
- Set by the Vyavsay team at onboarding (admin script/endpoint, not tenant-callable). Sheets: sheet id plus access via a shared Google service account the business shares the sheet with (no tenant OAuth). Calendar (SUPERSEDED by 0026, do not implement; was: default amended by 0021 to a shared calendar and service account; OAuth below is the fallback): admin-assisted OAuth through a backend callback route `/integrations/google/callback` (state signed, tenant-bound); refresh token encrypted; refresh failures mark `status=reauth` and notify owner.
- `/sheets/{action}` resolves the sheet from the JWT tenant. No config: return 409 with a clear message (frontend shows `error`).
- Credentials never returned by any API.

## Consequences
No frontend change. Self-serve connect screens are a later enhancement.

## Amendments
- Calendar access: see [0021](0021-calendar-via-shared-calendar.md), itself superseded by [0026](0026-calendar-via-calcom.md) (Cal.com, API key per tenant). The Google OAuth callback is no longer planned.
