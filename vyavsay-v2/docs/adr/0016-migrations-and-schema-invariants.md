# 0016. Migrations as code with CI-enforced schema invariants

Status: Proposed
Date: 2026-10-07

## Context
Old schema was not reproducible: no migration 005, hand-run SQL, buckets by hand, no rollback (H-10). RLS must never be forgotten on a new table.

## Decision
- Plain SQL, timestamped, in `supabase/migrations/` (Supabase CLI), forward-only, expand-then-contract for live changes. Created with `supabase migration new`. Run only by the CI migrate job (the one credential allowed to bypass RLS), never at app start.
- Roles (`app_user`, `worker_role`, login roles) are created in migrations without passwords; passwords come from Secrets Manager at provisioning.
- CI builds a fresh Postgres (pgvector image or `supabase start`) from zero, applies all migrations, then runs an invariant test over the catalog: every `app` table has RLS enabled and forced, at least one policy, a `tenant_id` first in an index, no grants to `anon`/`PUBLIC`, every SECURITY DEFINER function is on the allow-list with pinned `search_path`, views use `security_invoker`. Also `supabase db advisors` (verify CLI version) and a drift check (`db diff` empty).
- Seed data (plan tiers, global prompt versions) is a migration, not a script.

## Consequences
+ Any new table that skips RLS fails CI. - Fresh-database build adds CI minutes.
## Alternatives
Declarative `supabase/schemas/` (nicer diffs, but generated migrations hide role and RLS review; revisit). ORM autogenerate (misses policies).
