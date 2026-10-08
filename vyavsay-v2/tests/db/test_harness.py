"""Self-tests for the DB harness. Green with an empty migrations/ folder.

They use a stub-only database ("bare_db") or a tiny inline schema in a tmp migrations dir,
never the real schema, so they prove the harness itself.
"""

from pathlib import Path
from uuid import uuid4

import psycopg
import pytest

from tests.db.harness import DbHarness, SchemaMissing, open_harness
from tests.db.probes import attempt, count_rows

pytestmark = pytest.mark.db

# A tiny stand-in schema: membership table plus one tenant table with the two policy sets
# from doc 03 s4. {auth_pred} is swapped for a broken predicate in the red test.
MINI = """
create schema app;
create schema private;
do $$ begin
  if not exists (select from pg_roles where rolname = 'app_user') then
    create role app_user login noinherit; end if;
  if not exists (select from pg_roles where rolname = 'worker_user') then
    create role worker_user login noinherit; end if;
  if not exists (select from pg_roles where rolname = 'worker_role') then
    create role worker_role nologin; end if;
end $$;
grant authenticated to app_user;
grant worker_role to worker_user;
create table app.tenant_members (user_id uuid primary key, tenant_id uuid not null);
create function private.current_tenant_id() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select tenant_id from app.tenant_members where user_id = (select auth.uid()) $$;
create function private.worker_tenant_id() returns uuid
  language sql stable set search_path = ''
  as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;
grant usage on schema app, private to authenticated, worker_role;
grant execute on function private.current_tenant_id() to authenticated;
grant execute on function private.worker_tenant_id() to worker_role;
create table app.notes (id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, body text);
alter table app.notes enable row level security;
alter table app.notes force row level security;
grant select, insert, update, delete on app.notes to authenticated, worker_role;
create policy t_all on app.notes for all to authenticated
  using ({auth_pred}) with check (tenant_id = (select private.current_tenant_id()));
create policy w_all on app.notes for all to worker_role
  using (tenant_id = (select private.worker_tenant_id()))
  with check (tenant_id = (select private.worker_tenant_id()));
"""

GOOD_PRED = "tenant_id = (select private.current_tenant_id())"
A, B = uuid4(), uuid4()
USER_A, USER_B = uuid4(), uuid4()


def mini_dir(tmp_path: Path, auth_pred: str) -> Path:
    d = tmp_path / "mini"
    d.mkdir()
    (d / "0001_mini.sql").write_text(MINI.format(auth_pred=auth_pred))
    return d


def seed_mini(h: DbHarness) -> None:
    with h.as_owner_admin(commit=True) as c:
        for u in (USER_A, USER_B):
            c.execute("insert into auth.users (id, email) values (%s, %s)", (u, f"{u}@x.test"))
        c.execute(
            "insert into app.tenant_members values (%s, %s), (%s, %s)", (USER_A, A, USER_B, B)
        )
        c.execute(
            "insert into app.notes (tenant_id, body) values (%s,'a'),(%s,'b'),(%s,'b2')",
            (A, B, B),
        )


def test_stub_has_supabase_roles_and_extensions(bare_db: DbHarness) -> None:
    with bare_db.as_owner_admin() as c:
        roles = dict(
            c.execute(
                "select rolname, rolbypassrls from pg_roles"
                " where rolname in ('anon','authenticated','service_role')"
            ).fetchall()
        )
        exts = {r[0] for r in c.execute("select extname from pg_extension").fetchall()}
    assert roles == {"anon": False, "authenticated": False, "service_role": True}
    assert {"vector", "pgcrypto"} <= exts


def test_auth_uid_reads_jwt_claims_sub(bare_db: DbHarness) -> None:
    uid = uuid4()
    with bare_db.as_owner_admin() as c:
        assert c.execute("select auth.uid()").fetchone() == (None,)
        c.execute("select set_config('request.jwt.claims', %s, true)", (f'{{"sub": "{uid}"}}',))
        assert c.execute("select auth.uid()").fetchone() == (uid,)


def test_schema_missing_fails_with_the_table_name(bare_db: DbHarness) -> None:
    with pytest.raises(SchemaMissing, match=r"schema missing: app\.tenants"):
        bare_db.seed()
    assert issubclass(SchemaMissing, AssertionError)  # a test failure, not a setup error


def test_schema_missing_for_roles_names_the_role(bare_db: DbHarness) -> None:
    with pytest.raises(SchemaMissing, match="schema missing: role no_such_role"):
        bare_db.require_roles("no_such_role")
    with pytest.raises(SchemaMissing, match=r"schema missing: function private\.nope"):
        bare_db.require_functions("private.nope")


def test_migrations_apply_in_filename_order_and_skip_non_sql(tmp_path: Path) -> None:
    (tmp_path / "0002_second.sql").write_text("insert into t values (2);")
    (tmp_path / "0001_first.sql").write_text("create table t (n int); insert into t values (1);")
    (tmp_path / "0010_tenth.sql").write_text("insert into t values (10);")
    (tmp_path / "README.md").write_text("not sql")
    with open_harness(tmp_path) as h, h.as_owner_admin() as c:
        assert c.execute("select array_agg(n) from t").fetchone() == ([1, 2, 10],)


def test_empty_migrations_dir_is_fine(tmp_path: Path) -> None:
    with open_harness(tmp_path) as h, h.as_owner_admin() as c:
        assert c.execute("select 1").fetchone() == (1,)


def test_throwaway_database_is_dropped(tmp_path: Path) -> None:
    with open_harness(tmp_path) as h:
        name = h.dbname
        assert name.startswith("vyavsay_test_")
    with open_harness(tmp_path) as other, other.admin_server() as c:
        gone = c.execute("select count(*) from pg_database where datname = %s", (name,))
        assert gone.fetchone() == (0,)


def test_helpers_isolate_tenants_on_the_mini_schema(tmp_path: Path) -> None:
    with open_harness(mini_dir(tmp_path, GOOD_PRED)) as h:
        seed_mini(h)
        with h.as_authenticated(USER_A) as c:
            assert count_rows(c, "app.notes") == 1
            assert count_rows(c, "app.notes", "tenant_id", B) == 0
        with h.as_authenticated(USER_B) as c:
            assert count_rows(c, "app.notes") == 2
        with h.as_worker(A) as c:
            assert count_rows(c, "app.notes") == 1
        with h.as_worker(B) as c:
            assert count_rows(c, "app.notes") == 2
        with h.as_authenticated(uuid4()) as c:  # no membership
            assert count_rows(c, "app.notes") == 0
        with h.as_worker(None) as c:  # no app.tenant_id
            assert count_rows(c, "app.notes") == 0


def test_helpers_set_role_and_claims_per_transaction(tmp_path: Path) -> None:
    with open_harness(mini_dir(tmp_path, GOOD_PRED)) as h:
        with h.as_authenticated(USER_A) as c:
            row = c.execute("select current_user, session_user, auth.uid()").fetchone()
            assert row == ("authenticated", "app_user", USER_A)
        with h.as_worker(A) as c:
            row = c.execute(
                "select current_user, session_user, current_setting('app.tenant_id')"
            ).fetchone()
            assert row == ("worker_role", "worker_user", str(A))


def test_stray_reset_role_yields_nothing(tmp_path: Path) -> None:
    with open_harness(mini_dir(tmp_path, GOOD_PRED)) as h:
        seed_mini(h)
        with h.as_authenticated(USER_A) as c:
            c.execute("reset role")
            out = attempt(c, "select count(*) from app.notes")
            assert out.sqlstate == "42501"  # permission denied: app_user has no grants


def test_set_local_does_not_survive_the_transaction(tmp_path: Path) -> None:
    with open_harness(mini_dir(tmp_path, GOOD_PRED)) as h, h.pool("app_user") as pool:
        with pool.connection() as c:
            h.begin_authenticated(c, USER_A)
            pid = c.info.backend_pid
        with pool.connection() as c:
            assert c.info.backend_pid == pid  # same backend, as under pooling
            row = c.execute(
                "select current_user, nullif(current_setting('request.jwt.claims', true), '')"
            ).fetchone()
            assert row == ("app_user", None)


def test_broken_policy_is_detected(tmp_path: Path) -> None:
    """A policy that forgets the tenant check shows other tenants' rows to the probe."""
    with open_harness(mini_dir(tmp_path, "true")) as h:
        seed_mini(h)
        with h.as_authenticated(USER_A) as c:
            assert count_rows(c, "app.notes", "tenant_id", B) == 2  # the leak the suite catches


def test_attempt_reports_sqlstate_and_keeps_the_transaction_usable(bare_db: DbHarness) -> None:
    with bare_db.as_owner_admin() as c:
        out = attempt(c, "select 1/0")
        assert out.sqlstate == "22012"
        assert c.execute("select 1").fetchone() == (1,)
    with pytest.raises(psycopg.errors.UndefinedTable):
        with bare_db.as_owner_admin() as c:
            c.execute("select * from nope")
