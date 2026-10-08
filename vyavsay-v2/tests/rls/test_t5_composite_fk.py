"""T5: composite FKs block cross-tenant references (M-01). Owner story: E1.T1, green by E1.3.

Run as the owner (RLS out of the picture), so only the foreign keys can stop the insert.
"""

from uuid import uuid4

import psycopg
import pytest

from tests.db.harness import DbHarness
from tests.db.probes import attempt

pytestmark = pytest.mark.db

MSG = (
    "insert into app.messages (id, tenant_id, conversation_id, direction, type, body, source)"
    " values (%s, %s, %s, 'in', 'text', 'x', 'customer')"
)
CONV = "insert into app.conversations (id, tenant_id, contact_id, number_id) values (%s,%s,%s,%s)"


def test_t5_message_in_a_pointing_at_bs_conversation_is_rejected(db: DbHarness) -> None:
    s = db.seed()
    with db.as_owner_admin() as c:
        out = attempt(c, MSG, [uuid4(), s.a.tenant_id, s.b.conversation_id])
        assert out.sqlstate == "23503", out.describe()


def test_t5_conversation_in_a_pointing_at_bs_contact_is_rejected(db: DbHarness) -> None:
    s = db.seed()
    with db.as_owner_admin() as c:
        out = attempt(c, CONV, [uuid4(), s.a.tenant_id, s.b.contact_id, s.a.number_id])
        assert out.sqlstate == "23503", out.describe()


def test_t5_conversation_in_a_pointing_at_bs_number_is_rejected(db: DbHarness) -> None:
    s = db.seed()
    with db.as_owner_admin() as c:
        out = attempt(c, CONV, [uuid4(), s.a.tenant_id, s.a.contact_id, s.b.number_id])
        assert out.sqlstate == "23503", out.describe()


def test_t5_same_tenant_references_still_work(db: DbHarness) -> None:
    """Control: the probes above fail because of tenant, not because the SQL is wrong."""
    s = db.seed()
    with db.as_owner_admin() as c:
        c.execute(MSG, [uuid4(), s.a.tenant_id, s.a.conversation_id])
        assert c.execute(
            "select count(*) from app.messages where tenant_id = %s", [s.a.tenant_id]
        ).fetchone() == (2,)


def test_t5_error_class_is_foreign_key_violation(db: DbHarness) -> None:
    s = db.seed()
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        with db.as_owner_admin() as c:
            c.execute(MSG, [uuid4(), s.a.tenant_id, s.b.conversation_id])
