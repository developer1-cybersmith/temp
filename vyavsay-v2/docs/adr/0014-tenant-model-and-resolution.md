# 0014. Tenant model: membership lookup, unexposed schema, pending-tenant provisioning

Status: Proposed
Date: 2026-10-07
Amends: 0002 (supersedes its OR-policy and JWT-tenant lines)

## Context
Frontend signs up and signs in straight to Supabase Auth with the anon key (`Login.tsx:23-26`) and then calls `/users/{id}` with the JWT. JWT claims go stale until refresh, and `user_metadata` is user-editable. The old app had no user-to-tenant link at all (H-01, H-36: `wb_users` had no FK to `auth.users`).

## Decision
- Tenant = one business. Tables `tenants`, `tenant_members(user_id UNIQUE, tenant_id, role)`, `platform_admins(user_id)`. v1 is one user per tenant (matches `/users/{id}` = JWT user); staff roles later by dropping the UNIQUE.
- Tenant is resolved in the database, not from JWT claims: `private.current_tenant_id()` (SECURITY DEFINER, pinned `search_path`, EXECUTE to `authenticated` only) looks up `tenant_members` by `auth.uid()`. Always fresh, nothing to forge. Owner overview checks `platform_admins`, not the frontend `VITE_OWNER_EMAILS`.
- All app tables live in schema `app`, which is NOT exposed through the Supabase Data API; `anon` has no grants anywhere. The shipped anon key can only reach Auth. Policies are still written `TO authenticated` so they hold if a schema is ever exposed.
- First authenticated `GET /users/{id}` for a user with no membership calls system fn `provision_tenant` (added to the ADR 0012 list; no user argument, user is `auth.uid()`, idempotent via advisory lock and ON CONFLICT, needs confirmed email, refuses tombstoned users, see 0017): creates a `pending` tenant, smallest plan, default config, no WhatsApp number. `pending` runs no AI and no sends until the team activates it.
- Deleting a tenant is one admin function (FK `ON DELETE CASCADE` on `tenant_id`) plus S3 and checkpoint cleanup. No app role has DELETE on `tenants`.

## Consequences
+ No stale-claim or metadata trick; anon key is harmless; offboarding is one operation. - One extra indexed lookup per request (initplan-cached); open signup still creates empty pending rows (rate limit, see doc).
## Alternatives
Tenant id in `app_metadata` via auth hook (stale until refresh, extra moving part). `tenant_id = auth.uid()` (blocks staff and multiple numbers later). Disable signup (needs a frontend change; owner decision).
