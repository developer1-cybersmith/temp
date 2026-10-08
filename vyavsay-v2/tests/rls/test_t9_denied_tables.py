"""T9: worker-only tables are closed to the API; webhook_role can only insert into the inbox.

Owner story: E1.T1, turned green by E1.4. Covers tenant_secrets, langgraph.*, jobs,
outbound_messages (doc 03 s9), a stray RESET ROLE, and the webhook_role grant list.
"""

import pytest

from tests.db.expectations import (
    CLASS_C_FOR_API,
    CLASS_C_OPTIONAL,
    WEBHOOK_INSERT_ONLY,
)
from tests.db.harness import DbHarness
from tests.db.invariants import tables
from tests.db.probes import attempt

pytestmark = pytest.mark.db

STATEMENTS = [
    "select * from {t} limit 1",
    "insert into {t} default values",
    "update {t} set tenant_id = tenant_id",
    "delete from {t}",
]


def existing(db: DbHarness, names: list[str]) -> list[str]:
    with db.as_owner_admin() as c:
        have = set(tables(c, ["app", "langgraph"]))
    return [n for n in names if n in have]


def stmts_for(table: str) -> list[str]:
    # langgraph tables are keyed by thread_id, not tenant_id
    out = [s.format(t=table) for s in STATEMENTS]
    return [s for s in out if "tenant_id = tenant_id" not in s or table.startswith("app.")]


@pytest.mark.parametrize("table", CLASS_C_FOR_API)
def test_t9_named_tables_exist(db: DbHarness, table: str) -> None:
    db.require_tables(table)


def test_t9_authenticated_is_denied_on_worker_only_tables(db: DbHarness) -> None:
    s = db.seed()
    db.require_tables(*CLASS_C_FOR_API)
    names = CLASS_C_FOR_API + existing(db, CLASS_C_OPTIONAL)
    with db.as_authenticated(s.a.user_id) as c:
        for t in names:
            for stmt in stmts_for(t):
                out = attempt(c, stmt)
                assert out.denied, f"{stmt}: {out.describe()}"


def test_t9_app_user_alone_is_denied_everywhere(db: DbHarness) -> None:
    db.seed()
    with db.as_owner_admin() as c:
        names = tables(c, ["app", "langgraph"])
    with db.as_app_user() as c:
        for t in names:
            out = attempt(c, f"select 1 from {t} limit 1")
            assert out.denied, f"{t}: {out.describe()}"


def test_t9_stray_reset_role_falls_back_to_nothing(db: DbHarness) -> None:
    s = db.seed()
    with db.as_authenticated(s.a.user_id) as c:
        c.execute("reset role")
        for t in ("app.contacts", "app.tenants", "app.tenant_members"):
            out = attempt(c, f"select 1 from {t} limit 1")
            assert out.denied, f"{t}: {out.describe()}"


def test_t9_worker_user_alone_is_denied(db: DbHarness) -> None:
    db.seed()
    with db.as_worker(None) as c:
        c.execute("reset role")
        out = attempt(c, "select 1 from app.contacts limit 1")
        assert out.denied, out.describe()


def test_t9_webhook_role_may_only_insert_into_the_inbox(db: DbHarness) -> None:
    db.require_tables(*WEBHOOK_INSERT_ONLY)
    db.require_roles("webhook_role")
    with db.as_owner_admin() as c:
        names = tables(c, ["app", "langgraph"])
        for t in names:
            for priv in ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"):
                got = c.execute("select has_table_privilege('webhook_role', %s, %s)", (t, priv))
                allowed = t in WEBHOOK_INSERT_ONLY and priv == "INSERT"
                assert got.fetchone() == (allowed,), f"webhook_role {priv} on {t}: want {allowed}"


def test_t9_webhook_role_statements_are_denied(db: DbHarness) -> None:
    db.require_tables(*WEBHOOK_INSERT_ONLY)
    db.seed()
    with db.as_webhook() as c:
        for t in ("app.contacts", "app.messages", "app.jobs", "app.tenant_secrets"):
            out = attempt(c, f"select 1 from {t} limit 1")
            assert out.denied, f"{t}: {out.describe()}"
        for t in WEBHOOK_INSERT_ONLY:
            for stmt in (f"select 1 from {t} limit 1", f"delete from {t}"):
                out = attempt(c, stmt)
                assert out.denied, f"{stmt}: {out.describe()}"
