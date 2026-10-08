"""T3: no context means no rows and no inserts; worker context A sees only A.

Owner story: E1.T1, turned green by E1.4. Covers: user without membership, JWT without sub,
worker without app.tenant_id (unset, empty, garbage, unknown tenant), anon, worker with A.
"""

from typing import Any
from uuid import uuid4

import pytest
from psycopg import Connection

from tests.db.harness import DbHarness
from tests.db.invariants import tenant_tables
from tests.db.probes import attempt
from tests.db.seed import INSERT_PROBES

pytestmark = pytest.mark.db


def total_visible(c: Connection[Any], tables: list[tuple[str, str]]) -> dict[str, str]:
    """table -> outcome text for any table that shows rows (permission denied is fine)."""
    leaks = {}
    for table, _ in tables:
        out = attempt(c, f"select count(*) from {table}")
        if out.ok and out.rows[0][0] != 0:
            leaks[table] = f"{out.rows[0][0]} rows"
        elif not out.ok and not out.denied:
            leaks[table] = out.describe()
    return leaks


def tables_of(db: DbHarness) -> list[tuple[str, str]]:
    db.seed()
    with db.as_owner_admin() as c:
        return tenant_tables(c)


def test_t3_user_without_membership_sees_nothing(db: DbHarness) -> None:
    tables = tables_of(db)
    with db.as_authenticated(uuid4()) as c:
        assert total_visible(c, tables) == {}


def test_t3_jwt_without_sub_sees_nothing(db: DbHarness) -> None:
    tables = tables_of(db)
    with db.as_authenticated(None) as c:
        assert total_visible(c, tables) == {}


@pytest.mark.parametrize("tenant", [None, "", "not-a-uuid", str(uuid4())], ids=lambda v: repr(v))
def test_t3_worker_without_valid_tenant_sees_nothing(db: DbHarness, tenant: str | None) -> None:
    tables = tables_of(db)
    with db.as_worker(tenant) as c:
        leaks = total_visible(c, tables)
        # A garbage value may raise (22P02): that also fails closed.
        leaks = {t: v for t, v in leaks.items() if not (tenant == "not-a-uuid" and "22P02" in v)}
        assert leaks == {}


@pytest.mark.parametrize("table", sorted(INSERT_PROBES))
def test_t3_inserts_fail_without_context(db: DbHarness, table: str) -> None:
    s = db.seed()
    sql, params = INSERT_PROBES[table](s.a)
    for ctx in (db.as_authenticated(uuid4()), db.as_worker(None), db.as_anon()):
        with ctx as c:
            out = attempt(c, sql, params)
            assert out.denied, f"{table}: {out.describe()}"


def test_t3_anon_has_no_access_to_any_table(db: DbHarness) -> None:
    tables = tables_of(db)
    with db.as_anon() as c:
        for table, _ in tables:
            out = attempt(c, f"select 1 from {table} limit 1")
            assert out.denied, f"{table}: {out.describe()}"


def test_t3_worker_with_tenant_a_sees_only_a(db: DbHarness) -> None:
    s = db.seed()
    tables = [(t, col) for t, col in tables_of(db) if col == "tenant_id"]
    with db.as_worker(s.a.tenant_id) as c:
        for table, col in tables:
            out = attempt(c, f"select count(*) from {table} where {col} <> %s", [s.a.tenant_id])
            assert out.denied or (out.ok and out.rows[0][0] == 0), f"{table}: {out.describe()}"
