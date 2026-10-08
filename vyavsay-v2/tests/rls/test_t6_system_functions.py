"""T6: system functions are allow-listed, locked down, and scoped to the context tenant.

Owner story: E1.T1, turned green by E1.6 (E2.2 for the queue functions). Only what the docs
fix is tested: helper scoping, the EXECUTE matrix, and an unknown owner action. Per-function
column lists and audit rows need the real signatures (add them in E1.6).
"""

from uuid import uuid4

import pytest

from tests.db.expectations import FUNCTION_EXECUTE
from tests.db.harness import DbHarness
from tests.db.probes import attempt

pytestmark = pytest.mark.db

HELPERS = ["private.current_tenant_id", "private.worker_tenant_id", "private.tenant_active"]


def test_t6_helpers_exist(db: DbHarness) -> None:
    db.require_functions(*HELPERS)


def test_t6_current_tenant_id_resolves_from_membership(db: DbHarness) -> None:
    s = db.seed()
    db.require_functions("private.current_tenant_id")
    for t in (s.a, s.b):
        with db.as_authenticated(t.user_id) as c:
            assert c.execute("select private.current_tenant_id()").fetchone() == (t.tenant_id,)
    with db.as_authenticated(uuid4()) as c:
        assert c.execute("select private.current_tenant_id()").fetchone() == (None,)


def test_t6_worker_tenant_id_reads_the_setting(db: DbHarness) -> None:
    s = db.seed()
    db.require_functions("private.worker_tenant_id")
    with db.as_worker(s.a.tenant_id) as c:
        assert c.execute("select private.worker_tenant_id()").fetchone() == (s.a.tenant_id,)
    with db.as_worker(None) as c:
        assert c.execute("select private.worker_tenant_id()").fetchone() == (None,)


@pytest.mark.parametrize("name", sorted(FUNCTION_EXECUTE))
def test_t6_execute_matrix(db: DbHarness, name: str) -> None:
    db.require_functions(f"private.{name}")
    with db.as_owner_admin() as c:
        oids = [
            r[0]
            for r in c.execute(
                "select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
                " where n.nspname = 'private' and p.proname = %s",
                (name,),
            ).fetchall()
        ]
        for oid in oids:
            for role in ("anon", *FUNCTION_EXECUTE[name]):
                want = FUNCTION_EXECUTE[name].get(role, False)
                got = c.execute("select has_function_privilege(%s, %s, 'EXECUTE')", (role, oid))
                assert got.fetchone() == (want,), f"{name}: EXECUTE for {role} should be {want}"


def test_t6_unknown_owner_action_is_rejected_and_writes_nothing(db: DbHarness) -> None:
    s = db.seed()
    db.require_functions("private.enqueue_owner_action")
    with db.as_authenticated(s.a.user_id) as c:
        out = attempt(c, "select private.enqueue_owner_action('no_such_kind', '{}'::jsonb)")
        assert not out.ok, "unknown kind must be refused (allow-listed kinds only)"
    with db.as_owner_admin() as c:
        n = c.execute("select count(*) from app.jobs where kind = 'no_such_kind'").fetchone()
        assert n == (0,)


def test_t6_no_cross_tenant_raw_access_for_worker(db: DbHarness) -> None:
    """ADR 0012: no raw cross-tenant SELECT by any role, even with a valid worker context."""
    s = db.seed()
    with db.as_worker(s.a.tenant_id) as c:
        out = attempt(c, "select count(*) from app.messages where tenant_id = %s", [s.b.tenant_id])
        assert out.ok and out.rows[0][0] == 0, out.describe()
