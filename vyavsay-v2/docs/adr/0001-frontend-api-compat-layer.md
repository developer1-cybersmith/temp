# 0001. Keep the frontend API contract via a compatibility layer

Status: Proposed
Date: 2026-10-07

## Context
The frontend is reused as-is (owner decision). It calls about 45 REST routes under `/api` with a Supabase JWT, plus Supabase Auth directly. Some routes have no real backend today (`/sessions`), and some belong to parked features (`/vapi/*`, `/voice-calls` page). Fixing the audit gaps (RLS, per-tenant analytics) must not change response shapes.

## Decision
- v2 serves the exact routes, methods and JSON keys the frontend calls (inventory in `01-prd.md`). New capability is added as new routes or extra optional fields only.
- Contract tests (recorded request/response shapes per route) gate every release.
- `/sessions`, `/sessions/{id}/status`, `DELETE /sessions/{id}` are a facade over the ChatSyncs connection state, returning the old status values.
- `/vapi/*` returns an empty, well-formed list/disabled response (no dialing). Phone calls stay parked.
- Anything that needs a visible frontend change (Calendar connect, review-queue approval, hiding the voice-calls page) is NOT done silently: it goes to the owner as a named exception.

## Consequences
+ No frontend work; shape drift is caught by tests.
+ Audit fixes (H-02, H-37) land without UI change.
- Legacy quirks (lead stage vocabulary, `?userId=` query params) must be tolerated, and the server must ignore client-supplied user ids and use the JWT.
- Facade values for `/sessions` are semantic stand-ins, not real QR sessions.

## Alternatives
- Change the frontend to a cleaner API: rejected (owner rule).
- Drop `/vapi/*` routes: rejected, page would show errors.
