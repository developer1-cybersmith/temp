# 008. Supabase JWT auth, service-role DB, isolation in app code
**Status:** Accepted (inferred; PRD flagged "no backend auth" as critical)
## Context
- Browser logs in directly with Supabase. Backend has no login route.
## Decision
- Global hook verifies Bearer JWT. Public: `/api/health`, `/api/vapi/webhook`, `/api/webhook/whatsapp`.
- Identity from token only (`request.userId`). Every query adds `.eq('user_id', ...)`.
- Server uses the service-role key. No RLS in any migration.
- Platform owner = `OWNER_EMAILS` env allow-list, gates `/api/owner/overview` only.
- `wb_users` row created lazily on first GET/PATCH.
## Consequences
- One missed filter leaks data. Known: `/api/analytics` counts messages across tenants; visits POST trusts `customer_id`.
- Anon key is in the browser, so table exposure via PostgREST is unknown (RLS state in live DB unverified).
- No staff roles. Public-route check uses `startsWith`.
