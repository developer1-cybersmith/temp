"""T2: cross-tenant read and write probes as `authenticated` (tenant A) and `worker_role` (A).

Owner story: E1.T1, turned green by E1.4. Rule: B's rows are invisible, writes either raise
42501 (permission denied / RLS) or touch 0 rows.
"""

from collections.abc import Iterator
from contextlib import AbstractContextManager
from typing import Any

import pytest
from psycopg import Connection

from tests.db.expectations import CORE_TABLES
from tests.db.harness import DbHarness
from tests.db.invariants import tenant_tables
from tests.db.probes import attempt, count_rows
from tests.db.seed import INSERT_PROBES, NO_INSERT_PROBE, Seed, TenantSeed

pytestmark = pytest.mark.db

PROBED = [
    ("app.tenants", "id"),
    ("app.tenant_members", "tenant_id"),
    ("app.whatsapp_numbers", "tenant_id"),
    ("app.contacts", "tenant_id"),
    ("app.conversations", "tenant_id"),
    ("app.messages", "tenant_id"),
]
CONTROL = ["app.tenants", "app.contacts", "app.conversations", "app.messages"]
ROLE_KINDS = ["authenticated", "worker"]


def session(db: DbHarness, kind: str, t: TenantSeed) -> AbstractContextManager[Connection[Any]]:
    if kind == "authenticated":
        return db.as_authenticated(t.user_id)  # type: ignore[no-any-return]
    return db.as_worker(t.tenant_id)  # type: ignore[no-any-return]


@pytest.fixture
def seed(db: DbHarness) -> Iterator[Seed]:
    yield db.seed()


@pytest.mark.parametrize("kind", ROLE_KINDS)
@pytest.mark.parametrize("table", CONTROL)
def test_t2_positive_control_own_rows_visible(db: DbHarness, kind: str, table: str) -> None:
    s = db.seed()
    col = "id" if table == "app.tenants" else "tenant_id"
    with session(db, kind, s.a) as c:
        assert count_rows(c, table, col, s.a.tenant_id) >= 1, "A must see its own rows"


@pytest.mark.parametrize("kind", ROLE_KINDS)
@pytest.mark.parametrize(("table", "col"), PROBED)
def test_t2_select_other_tenant_is_empty(db: DbHarness, kind: str, table: str, col: str) -> None:
    s = db.seed()
    with session(db, kind, s.a) as c:
        out = attempt(c, f"select count(*) from {table} where {col} = %s", [s.b.tenant_id])
        assert out.denied or (out.ok and out.rows[0][0] == 0), out.describe()


@pytest.mark.parametrize("kind", ROLE_KINDS)
@pytest.mark.parametrize(("table", "col"), PROBED)
def test_t2_update_other_tenant_row_touches_nothing(
    db: DbHarness, kind: str, table: str, col: str
) -> None:
    s = db.seed()
    with session(db, kind, s.a) as c:
        out = attempt(c, f"update {table} set {col} = {col} where {col} = %s", [s.b.tenant_id])
        assert out.denied or (out.ok and out.rowcount == 0), out.describe()


@pytest.mark.parametrize("kind", ROLE_KINDS)
@pytest.mark.parametrize(("table", "col"), PROBED)
def test_t2_move_own_row_to_other_tenant_is_rejected(
    db: DbHarness, kind: str, table: str, col: str
) -> None:
    s = db.seed()
    with session(db, kind, s.a) as c:
        out = attempt(
            c, f"update {table} set {col} = %s where {col} = %s", [s.b.tenant_id, s.a.tenant_id]
        )
        assert out.denied or (out.ok and out.rowcount == 0), out.describe()


@pytest.mark.parametrize("kind", ROLE_KINDS)
@pytest.mark.parametrize(("table", "col"), PROBED)
def test_t2_delete_other_tenant_row_touches_nothing(
    db: DbHarness, kind: str, table: str, col: str
) -> None:
    s = db.seed()
    with session(db, kind, s.a) as c:
        out = attempt(c, f"delete from {table} where {col} = %s", [s.b.tenant_id])
        assert out.denied or (out.ok and out.rowcount == 0), out.describe()


@pytest.mark.parametrize("kind", ROLE_KINDS)
@pytest.mark.parametrize("table", sorted(INSERT_PROBES))
def test_t2_insert_with_other_tenant_id_is_denied(db: DbHarness, kind: str, table: str) -> None:
    s = db.seed()
    sql, params = INSERT_PROBES[table](s.b)
    with session(db, kind, s.a) as c:
        out = attempt(c, sql, params)
        # Only 42501 counts: a NOT NULL or FK error would mean the probe row is wrong.
        assert out.denied, out.describe()


@pytest.mark.parametrize("kind", ROLE_KINDS)
def test_t2_generic_read_probe_over_every_tenant_table(db: DbHarness, kind: str) -> None:
    """Covers tables added later without editing this file."""
    s = db.seed()
    with db.as_owner_admin() as admin:
        found = tenant_tables(admin)
    assert found, "no tenant tables found"
    with session(db, kind, s.a) as c:
        for table, col in found:
            out = attempt(c, f"select count(*) from {table} where {col} = %s", [s.b.tenant_id])
            assert out.denied or (out.ok and out.rows[0][0] == 0), f"{table}: {out.describe()}"


def test_t2_every_tenant_table_has_an_insert_probe(db: DbHarness) -> None:
    """Doc 05 s5: a new table must appear in the T2 probes. Add it to INSERT_PROBES."""
    db.require_tables(*CORE_TABLES)
    with db.as_owner_admin() as admin:
        tables = [t for t, _ in tenant_tables(admin)]
    missing = [t for t in tables if t not in INSERT_PROBES and t not in NO_INSERT_PROBE]
    assert missing == [], f"add an INSERT probe in tests/db/seed.py for: {missing}"
