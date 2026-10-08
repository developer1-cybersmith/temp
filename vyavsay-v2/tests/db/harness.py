"""Throwaway Postgres for the RLS suite.

One database per test session: a Supabase-like stub, then every SQL file in migrations/ in
filename order. Connections mimic production (ADR 0002, ADR 0014): the session user is a
zero-grant login role (`app_user`, `worker_user`, `webhook_user`) and each transaction does
SET LOCAL ROLE plus the JWT claims or `app.tenant_id`.

Connection target: env VYAVSAY_TEST_DATABASE_URL (URL or libpq string, needs a superuser),
else `host=/tmp dbname=postgres`. Migrations dir: env MIGRATIONS_DIR, else ./migrations.
"""

import json
import os
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import psycopg
from psycopg import Connection, sql
from psycopg.conninfo import make_conninfo
from psycopg_pool import ConnectionPool

from tests.db.expectations import ROLES

REPO = Path(__file__).resolve().parents[2]
DEFAULT_ADMIN_CONNINFO = "host=/tmp dbname=postgres"

# Supabase-like pieces the migrations can rely on (verify against the Supabase CLI image).
STUB_SQL = """
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema extensions;
create extension pgcrypto schema extensions;
create extension vector schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences
  to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions
  to anon, authenticated, service_role;
"""


class SchemaMissing(AssertionError):
    """The schema under test is not there yet. An AssertionError so the test FAILS."""


class HarnessError(AssertionError):
    """The schema exists but the roles or grants are not wired as the ADRs say."""


def admin_conninfo() -> str:
    return os.environ.get("VYAVSAY_TEST_DATABASE_URL") or DEFAULT_ADMIN_CONNINFO


def migrations_path() -> Path:
    return Path(os.environ.get("MIGRATIONS_DIR") or REPO / "migrations")


class DbHarness:
    def __init__(self, admin: str, dbname: str) -> None:
        self.admin = admin
        self.dbname = dbname
        self.conninfo = make_conninfo(admin, dbname=dbname)
        self._seed: Any = None

    # --- connections -------------------------------------------------------------

    @contextmanager
    def admin_server(self) -> Iterator[Connection[Any]]:
        """Autocommit superuser connection to the server's maintenance database."""
        with psycopg.connect(self.admin, autocommit=True) as conn:
            yield conn

    def _connect(self, login: str | None) -> Connection[Any]:
        """New connection; with `login`, session authorization is that zero-grant role."""
        if login:
            self.require_roles(login)
        conn = psycopg.connect(self.conninfo)
        if login:
            conn.autocommit = True  # SET SESSION must not be rolled back with a transaction
            conn.execute(sql.SQL("SET SESSION AUTHORIZATION {}").format(sql.Identifier(login)))
            conn.autocommit = False
        return conn

    @contextmanager
    def _session(
        self, login: str | None, begin: Callable[[Connection[Any]], None], commit: bool
    ) -> Iterator[Connection[Any]]:
        conn = self._connect(login)
        try:
            begin(conn)
            yield conn
            if commit:
                conn.commit()
        finally:
            conn.close()  # rolls back anything uncommitted

    def as_owner_admin(self, commit: bool = False) -> Any:
        """Superuser (stands in for the migrator): bypasses RLS. For seeding and inspection."""
        return self._session(None, lambda c: None, commit)

    def as_authenticated(
        self,
        user_id: uuid.UUID | str | None,
        claims: dict[str, Any] | None = None,
        commit: bool = False,
    ) -> Any:
        """API path: login app_user, SET LOCAL ROLE authenticated, JWT claims for this tx."""
        return self._session(
            "app_user", lambda c: self.begin_authenticated(c, user_id, claims), commit
        )

    def as_worker(self, tenant_id: uuid.UUID | str | None, commit: bool = False) -> Any:
        """Worker path: login worker_user, SET LOCAL ROLE worker_role, app.tenant_id."""
        return self._session("worker_user", lambda c: self.begin_worker(c, tenant_id), commit)

    def as_webhook(self, commit: bool = False) -> Any:
        """Webhook path: login webhook_user, SET LOCAL ROLE webhook_role."""
        return self._session(
            "webhook_user", lambda c: self._set_local_role(c, "webhook_role"), commit
        )

    def as_app_user(self) -> Any:
        """The bare login role with no SET ROLE: what a stray RESET ROLE falls back to."""
        return self._session("app_user", lambda c: None, False)

    def as_anon(self) -> Any:
        """The Supabase anon role (not reachable by the app; used for the zero-grant probes)."""
        return self._session(None, lambda c: self._set_local_role(c, "anon"), False)

    @contextmanager
    def pool(self, login: str) -> Iterator[ConnectionPool[Any]]:
        """One-connection pool whose connections log in as `login`: same backend every time."""
        self.require_roles(login)

        def configure(conn: Connection[Any]) -> None:
            conn.autocommit = True
            conn.execute(sql.SQL("SET SESSION AUTHORIZATION {}").format(sql.Identifier(login)))
            conn.autocommit = False

        pool: ConnectionPool[Any] = ConnectionPool(
            self.conninfo, min_size=1, max_size=1, configure=configure, open=True
        )
        try:
            pool.wait(timeout=10)
            yield pool
        finally:
            pool.close()

    # --- per-transaction context (what tenant_tx will do) ------------------------

    def _set_local_role(self, conn: Connection[Any], role: str) -> None:
        try:
            conn.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role)))
        except psycopg.errors.InsufficientPrivilege as e:
            conn.rollback()
            raise HarnessError(
                f"{e.diag.message_primary}: the migrations must GRANT {role} to the login role"
            ) from e

    def begin_authenticated(
        self,
        conn: Connection[Any],
        user_id: uuid.UUID | str | None,
        claims: dict[str, Any] | None = None,
    ) -> None:
        data: dict[str, Any] = {"role": "authenticated", "aud": "authenticated"}
        if user_id is not None:
            data["sub"] = str(user_id)
        data.update(claims or {})
        self._set_local_role(conn, "authenticated")
        conn.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps(data),))

    def begin_worker(self, conn: Connection[Any], tenant_id: uuid.UUID | str | None) -> None:
        self._set_local_role(conn, "worker_role")
        if tenant_id is not None:
            conn.execute("select set_config('app.tenant_id', %s, true)", (str(tenant_id),))

    # --- schema checks that make tests FAIL, with the missing name ---------------

    def _fail_missing(self, missing: list[str]) -> None:
        if missing:
            rest = ", ".join(missing[1:6])
            extra = f" (and {len(missing) - 1} more: {rest})" if missing[1:] else ""
            raise SchemaMissing(
                f"schema missing: {missing[0]}{extra}. Add SQL to migrations/ (story E1.2/E1.3)."
            )

    def require_tables(self, *names: str) -> None:
        with psycopg.connect(self.conninfo) as c:
            missing = [
                n for n in names if c.execute("select to_regclass(%s)", (n,)).fetchone() == (None,)
            ]
        self._fail_missing(missing)

    def require_roles(self, *names: str) -> None:
        with psycopg.connect(self.conninfo) as c:
            have = {r[0] for r in c.execute("select rolname from pg_roles").fetchall()}
        self._fail_missing([f"role {n}" for n in names if n not in have])

    def require_functions(self, *names: str) -> None:
        """Names like 'private.current_tenant_id' (any overload)."""
        with psycopg.connect(self.conninfo) as c:
            missing = []
            for n in names:
                schema, _, fn = n.partition(".")
                found = c.execute(
                    "select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace"
                    " where s.nspname = %s and p.proname = %s limit 1",
                    (schema, fn),
                ).fetchone()
                if not found:
                    missing.append(f"function {n}")
        self._fail_missing(missing)

    def seed(self) -> Any:
        """Two active tenants A and B (plus a pending P). Idempotent; committed once."""
        from tests.db.seed import ensure_seed

        if self._seed is None:
            self._seed = ensure_seed(self)
        return self._seed


def _apply_migrations(conninfo: str, directory: Path) -> None:
    files = sorted(p for p in directory.glob("*.sql") if p.is_file())
    with psycopg.connect(conninfo, autocommit=True) as conn:
        for f in files:
            try:
                conn.execute(f.read_text())  # type: ignore[arg-type]
            except psycopg.Error as e:
                raise RuntimeError(f"migration {f.name} failed: {e}") from e


_open_harnesses = 0


def _drop_project_roles(server: Connection[Any]) -> None:
    """Roles are cluster-wide and outlive the database: the harness owns these names.

    Dropping them keeps stale roles (with old attributes) from hiding a missing or different
    role in the migrations. Best effort: a role still used elsewhere is left alone.
    """
    for role in reversed(ROLES):
        try:
            server.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(role)))
        except psycopg.Error:
            pass


@contextmanager
def open_harness(migrations_dir: Path | None = None) -> Iterator[DbHarness]:
    """Create a unique database, stub Supabase, apply migrations, drop it at the end."""
    global _open_harnesses
    admin = admin_conninfo()
    name = f"vyavsay_test_{os.getpid()}_{uuid.uuid4().hex[:8]}"
    try:
        server = psycopg.connect(admin, autocommit=True)
    except psycopg.OperationalError as e:
        raise RuntimeError(
            f"Postgres not reachable ({e}). Start it or set VYAVSAY_TEST_DATABASE_URL."
        ) from e
    with server:
        if _open_harnesses == 0:
            _drop_project_roles(server)
        _open_harnesses += 1
        server.execute(
            sql.SQL("CREATE DATABASE {} TEMPLATE template0 ENCODING 'UTF8'").format(
                sql.Identifier(name)
            )
        )
        try:
            h = DbHarness(admin, name)
            with psycopg.connect(h.conninfo, autocommit=True) as conn:
                conn.execute(STUB_SQL)  # type: ignore[arg-type]
                conn.execute(
                    sql.SQL(
                        'ALTER DATABASE {} SET search_path = "$user", public, extensions'
                    ).format(sql.Identifier(name))
                )
            if migrations_dir is not None:
                _apply_migrations(h.conninfo, migrations_dir)
            yield h
        finally:
            server.execute(
                sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name))
            )
            _open_harnesses -= 1
            if _open_harnesses == 0:
                _drop_project_roles(server)
