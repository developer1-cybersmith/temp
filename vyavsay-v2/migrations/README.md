# Migrations

SQL migrations live here, plain `.sql` files, applied in filename order
(`0001_...sql`, `0002_...sql`). Forward-only. See `docs/adr/0016-migrations-and-schema-invariants.md`.

This folder is empty on purpose until story E1.2/E1.3: the RLS suite in `tests/rls/` is red
("schema missing: ...") until the schema lands here. The test harness applies every `*.sql`
file here to a throwaway database (set `MIGRATIONS_DIR` to point it somewhere else).
