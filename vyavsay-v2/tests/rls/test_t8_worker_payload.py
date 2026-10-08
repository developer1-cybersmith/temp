"""T8: a job for A whose payload names B's ids must not read or write B.

Owner story: E1.T1 (DB level), E2.2 (handlers). No handlers exist yet, so this drives the
worker role directly with B's ids, as a handler fed a hostile payload would.
"""

from uuid import uuid4

import pytest

from tests.db.harness import DbHarness
from tests.db.probes import attempt, count_rows

pytestmark = pytest.mark.db


def b_state(db: DbHarness, s) -> tuple[int, int, int]:  # type: ignore[no-untyped-def]
    with db.as_owner_admin() as c:
        return (
            count_rows(c, "app.messages", "tenant_id", s.b.tenant_id),
            count_rows(c, "app.conversations", "tenant_id", s.b.tenant_id),
            count_rows(c, "app.contacts", "tenant_id", s.b.tenant_id),
        )


def test_t8_worker_a_cannot_load_bs_rows_by_id(db: DbHarness) -> None:
    s = db.seed()
    with db.as_worker(s.a.tenant_id) as c:
        for table, key in (
            ("app.messages", s.b.message_id),
            ("app.conversations", s.b.conversation_id),
            ("app.contacts", s.b.contact_id),
        ):
            out = attempt(c, f"select id from {table} where id = %s", [key])
            assert out.ok and out.rows == [], f"{table}: {out.describe()}"


def test_t8_worker_a_cannot_write_bs_rows_by_id(db: DbHarness) -> None:
    s = db.seed()
    before = b_state(db, s)
    with db.as_worker(s.a.tenant_id) as c:
        for sql, key in (
            ("update app.messages set body = 'pwned' where id = %s", s.b.message_id),
            ("delete from app.messages where id = %s", s.b.message_id),
            ("delete from app.conversations where id = %s", s.b.conversation_id),
            ("update app.contacts set name = 'pwned' where id = %s", s.b.contact_id),
        ):
            out = attempt(c, sql, [key])
            assert out.denied or (out.ok and out.rowcount == 0), f"{sql}: {out.describe()}"
    assert b_state(db, s) == before
    with db.as_owner_admin() as c:
        row = c.execute("select body from app.messages where id = %s", [s.b.message_id])
        assert row.fetchone() == ("Is the Swift still available?",)


def test_t8_worker_a_cannot_attach_a_message_to_bs_conversation(db: DbHarness) -> None:
    s = db.seed()
    insert = (
        "insert into app.messages (id, tenant_id, conversation_id, direction, type, body, source)"
        " values (%s, %s, %s, 'out', 'text', 'x', 'agent')"
    )
    with db.as_worker(s.a.tenant_id) as c:
        as_a = attempt(c, insert, [uuid4(), s.a.tenant_id, s.b.conversation_id])
        assert as_a.sqlstate in ("23503", "42501"), as_a.describe()  # FK (T5) or RLS
        as_b = attempt(c, insert, [uuid4(), s.b.tenant_id, s.b.conversation_id])
        assert as_b.denied, as_b.describe()  # RLS: row is for B
    assert b_state(db, s)[0] == 1


def test_t8_worker_a_context_ignores_a_payload_tenant(db: DbHarness) -> None:
    """The tenant is the job row's, set once. A payload value is just data."""
    s = db.seed()
    with db.as_worker(s.a.tenant_id) as c:
        out = attempt(c, "select count(*) from app.contacts where tenant_id = %s", [s.b.tenant_id])
        assert out.ok and out.rows[0][0] == 0
