"""T4: tenant context must not leak between transactions on one pooled connection.

Owner story: E1.T1, turned green by E1.5. The pool has one backend, so every transaction
reuses it, as under a pooler. SET LOCAL role/claims/app.tenant_id must vanish at commit,
rollback and after an error. (Transaction-pooler behaviour on Supabase itself: verify.)
"""

from typing import Any

import psycopg
import pytest
from psycopg import Connection

from tests.db.expectations import CORE_TABLES
from tests.db.harness import DbHarness
from tests.db.probes import attempt, count_rows

pytestmark = pytest.mark.db


def assert_sees_nothing(c: Connection[Any]) -> None:
    out = attempt(c, "select count(*) from app.contacts")
    assert out.denied or (out.ok and out.rows[0][0] == 0), out.describe()


def assert_clean(c: Connection[Any]) -> None:
    row = c.execute(
        "select current_user, session_user,"
        " nullif(current_setting('request.jwt.claims', true), ''),"
        " nullif(current_setting('app.tenant_id', true), '')"
    ).fetchone()
    assert row is not None
    cur, sess, claims, tenant = row
    assert cur == sess, f"role leaked: current_user={cur}, session_user={sess}"
    assert claims is None, "JWT claims leaked"
    assert tenant is None, "app.tenant_id leaked"


def test_t4_api_context_does_not_survive_commit(db: DbHarness) -> None:
    s = db.seed()
    with db.pool("app_user") as pool:
        with pool.connection() as c:
            db.begin_authenticated(c, s.a.user_id)
            pid = c.info.backend_pid
            assert count_rows(c, "app.contacts", "tenant_id", s.a.tenant_id) == 1
        with pool.connection() as c:
            assert c.info.backend_pid == pid
            assert_clean(c)
            db.begin_authenticated(c, s.b.user_id)
            assert count_rows(c, "app.contacts", "tenant_id", s.a.tenant_id) == 0
            assert count_rows(c, "app.contacts", "tenant_id", s.b.tenant_id) == 1


def test_t4_worker_context_does_not_survive_commit(db: DbHarness) -> None:
    s = db.seed()
    with db.pool("worker_user") as pool:
        with pool.connection() as c:
            db.begin_worker(c, s.a.tenant_id)
            pid = c.info.backend_pid
            assert count_rows(c, "app.contacts", "tenant_id", s.a.tenant_id) == 1
        with pool.connection() as c:
            assert c.info.backend_pid == pid
            assert_clean(c)
            assert_sees_nothing(c)  # no context, no rows
            db.begin_worker(c, s.b.tenant_id)
            assert count_rows(c, "app.contacts", "tenant_id", s.a.tenant_id) == 0


def test_t4_context_does_not_survive_rollback(db: DbHarness) -> None:
    s = db.seed()
    with db.pool("worker_user") as pool:
        with pytest.raises(RuntimeError, match="boom"):
            with pool.connection() as c:
                db.begin_worker(c, s.a.tenant_id)
                raise RuntimeError("boom")
        with pool.connection() as c:
            assert_clean(c)


def test_t4_context_does_not_survive_a_failed_transaction(db: DbHarness) -> None:
    s = db.seed()
    with db.pool("app_user") as pool:
        with pytest.raises(psycopg.errors.DivisionByZero):
            with pool.connection() as c:
                db.begin_authenticated(c, s.a.user_id)
                c.execute("select 1/0")
        with pool.connection() as c:
            assert_clean(c)
            assert_sees_nothing(c)  # app_user alone has no grants


def test_t4_sequential_tenants_on_one_connection_never_mix(db: DbHarness) -> None:
    db.require_tables(*CORE_TABLES)
    s = db.seed()
    with db.pool("worker_user") as pool:
        for t, other in ((s.a, s.b), (s.b, s.a), (s.a, s.b)):
            with pool.connection() as c:
                db.begin_worker(c, t.tenant_id)
                assert count_rows(c, "app.messages", "tenant_id", other.tenant_id) == 0
                assert count_rows(c, "app.messages", "tenant_id", t.tenant_id) == 1
