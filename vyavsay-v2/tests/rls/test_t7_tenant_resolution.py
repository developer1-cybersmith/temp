"""T7: tenant comes from the database membership, never from the JWT; pending sees nothing.

Owner story: E1.T1 (DB level), E1.7 (JWT auth), routes in E3. The route probes of T7 (B's id
with A's token, ?userId=B, body with tenant_id) belong to the contract suite (E3.8).

Pending: doc 03 only gates writes with tenant_active(), but ADR 0014 says a pending tenant
has "no access to data". This test follows the ADR for data tables. The tenants row stays
readable (GET /users/{id} needs it). Owner to confirm.
"""

from uuid import uuid4

import pytest

from tests.db.harness import DbHarness
from tests.db.probes import attempt, count_rows

pytestmark = pytest.mark.db

DATA = ["app.contacts", "app.conversations", "app.messages", "app.whatsapp_numbers"]


def test_t7_membership_decides_the_tenant(db: DbHarness) -> None:
    s = db.seed()
    with db.as_authenticated(s.a.user_id) as c:
        assert count_rows(c, "app.contacts") == 1
        assert count_rows(c, "app.contacts", "tenant_id", s.a.tenant_id) == 1


@pytest.mark.parametrize(
    "claims",
    [
        lambda b: {"tenant_id": str(b)},
        lambda b: {"app_metadata": {"tenant_id": str(b)}},
        lambda b: {"user_metadata": {"tenant_id": str(b)}},
        lambda b: {"role": "service_role"},
    ],
    ids=["tenant_id", "app_metadata", "user_metadata", "service_role"],
)
def test_t7_claims_cannot_choose_the_tenant(db: DbHarness, claims) -> None:  # type: ignore[no-untyped-def]
    s = db.seed()
    with db.as_authenticated(s.a.user_id, claims=claims(s.b.tenant_id)) as c:
        assert count_rows(c, "app.contacts", "tenant_id", s.b.tenant_id) == 0
        assert count_rows(c, "app.contacts", "tenant_id", s.a.tenant_id) == 1


def test_t7_unknown_user_gets_nothing(db: DbHarness) -> None:
    db.seed()
    with db.as_authenticated(uuid4()) as c:
        assert count_rows(c, "app.contacts") == 0


def test_t7_malformed_sub_fails_closed(db: DbHarness) -> None:
    db.seed()
    with db.as_authenticated("not-a-uuid") as c:
        out = attempt(c, "select count(*) from app.contacts")
        assert (not out.ok) or out.rows[0][0] == 0, out.describe()


def test_t7_membership_removal_applies_at_once(db: DbHarness) -> None:
    """No stale claim: delete the membership, the next transaction sees nothing."""
    s = db.seed()
    with db.as_owner_admin() as admin:
        admin.execute("delete from app.tenant_members where user_id = %s", [s.a.user_id])
        # Same connection, switch to the API role inside the transaction.
        db.begin_authenticated(admin, s.a.user_id)
        assert count_rows(admin, "app.contacts") == 0


@pytest.mark.parametrize("table", DATA)
def test_t7_pending_tenant_sees_no_data(db: DbHarness, table: str) -> None:
    s = db.seed()
    with db.as_owner_admin() as admin:
        assert count_rows(admin, table, "tenant_id", s.pending.tenant_id) >= 1, "seed has P rows"
    with db.as_authenticated(s.pending.user_id) as c:
        out = attempt(c, f"select count(*) from {table}")
        assert out.denied or (out.ok and out.rows[0][0] == 0), f"{table}: {out.describe()}"


def test_t7_pending_tenant_can_read_its_own_profile_row(db: DbHarness) -> None:
    s = db.seed()
    with db.as_authenticated(s.pending.user_id) as c:
        assert count_rows(c, "app.tenants", "id", s.pending.tenant_id) == 1
        assert count_rows(c, "app.tenants") == 1
