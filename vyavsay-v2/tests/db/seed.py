"""Seed data: tenants A and B with identical shapes, plus a pending tenant P.

Uses only the columns named in docs/03 s3. If the real schema needs more (a NOT NULL column
without a default), change it here. Ids are fixed (uuid5) so failures are easy to read.

Same on purpose in A and B: contact phone, contact name, message text. Different where the
schema forces it: business number, tenant name.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from psycopg import Connection

from tests.db.expectations import CORE_TABLES, CUSTOMER_NAME, CUSTOMER_PHONE, MESSAGE_BODY

if TYPE_CHECKING:
    from tests.db.harness import DbHarness


@dataclass(frozen=True)
class TenantSeed:
    key: str
    status: str
    tenant_id: UUID
    user_id: UUID
    number_id: UUID
    number_phone: str
    contact_id: UUID
    conversation_id: UUID
    message_id: UUID


@dataclass(frozen=True)
class Seed:
    a: TenantSeed
    b: TenantSeed
    pending: TenantSeed


def _id(key: str, kind: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"vyavsay-test/{key}/{kind}")


def _tenant(key: str, status: str, phone: str) -> TenantSeed:
    return TenantSeed(
        key=key,
        status=status,
        tenant_id=_id(key, "tenant"),
        user_id=_id(key, "user"),
        number_id=_id(key, "number"),
        number_phone=phone,
        contact_id=_id(key, "contact"),
        conversation_id=_id(key, "conversation"),
        message_id=_id(key, "message"),
    )


def build_seed() -> Seed:
    return Seed(
        a=_tenant("a", "active", "+919900000001"),
        b=_tenant("b", "active", "+919900000002"),
        pending=_tenant("p", "pending", "+919900000003"),
    )


def _plan_code(c: Connection[Any]) -> str | None:
    """tenants.plan_code is a FK to plan_tiers (doc 03 s3.1): reuse the first seeded plan."""
    has = c.execute(
        "select 1 from information_schema.columns"
        " where table_schema='app' and table_name='tenants' and column_name='plan_code'"
    ).fetchone()
    if not has:
        return None
    row = c.execute("select code from app.plan_tiers order by code limit 1").fetchone()
    if row is None:
        from tests.db.harness import SchemaMissing

        raise SchemaMissing("schema missing: rows in app.plan_tiers (the plan seed migration)")
    return str(row[0])


def ensure_seed(h: "DbHarness") -> Seed:
    h.require_tables(*CORE_TABLES)
    s = build_seed()
    with h.as_owner_admin(commit=True) as c:
        if c.execute("select 1 from app.tenants where id = %s", (s.a.tenant_id,)).fetchone():
            return s
        plan = _plan_code(c)
        for t in (s.a, s.b, s.pending):
            name = f"Dealer {t.key.upper()}"
            c.execute(
                "insert into auth.users (id, email, email_confirmed_at) values (%s, %s, now())",
                (t.user_id, f"owner-{t.key}@example.test"),
            )
            if plan is None:
                c.execute(
                    "insert into app.tenants (id, name, business_name, status)"
                    " values (%s, %s, %s, %s)",
                    (t.tenant_id, name, name, t.status),
                )
            else:
                c.execute(
                    "insert into app.tenants (id, name, business_name, status, plan_code)"
                    " values (%s, %s, %s, %s, %s)",
                    (t.tenant_id, name, name, t.status, plan),
                )
            c.execute(
                "insert into app.tenant_members (user_id, tenant_id, role)"
                " values (%s, %s, 'owner')",
                (t.user_id, t.tenant_id),
            )
            c.execute(
                "insert into app.whatsapp_numbers"
                " (id, tenant_id, provider, provider_number_ref, phone_e164, status)"
                " values (%s, %s, 'chatsyncs', %s, %s, 'active')",
                (t.number_id, t.tenant_id, f"ref-{t.key}", t.number_phone),
            )
            c.execute(
                "insert into app.contacts (id, tenant_id, contact_key, phone_e164, name)"
                " values (%s, %s, %s, %s, %s)",
                (t.contact_id, t.tenant_id, f"tel:{CUSTOMER_PHONE}", CUSTOMER_PHONE, CUSTOMER_NAME),
            )
            c.execute(
                "insert into app.conversations (id, tenant_id, contact_id, number_id)"
                " values (%s, %s, %s, %s)",
                (t.conversation_id, t.tenant_id, t.contact_id, t.number_id),
            )
            c.execute(
                "insert into app.messages"
                " (id, tenant_id, conversation_id, direction, type, body, source)"
                " values (%s, %s, %s, 'in', 'text', %s, 'customer')",
                (t.message_id, t.tenant_id, t.conversation_id, MESSAGE_BODY),
            )
    return s


# One INSERT per tenant table, for the T2 cross-tenant write probe. Each takes the tenant the
# row is written FOR (with that tenant's real parent ids, so only RLS can stop it) and returns
# (sql, params). Add one when a new tenant table lands: T2 fails until you do (doc 05 s5).
def _insert_number(t: TenantSeed) -> tuple[str, list[Any]]:
    return (
        "insert into app.whatsapp_numbers"
        " (id, tenant_id, provider, provider_number_ref, phone_e164, status)"
        " values (%s, %s, 'chatsyncs', %s, %s, 'active')",
        [uuid4(), t.tenant_id, f"probe-{uuid4()}", f"+9199{uuid4().int % 10**8:08d}"],
    )


INSERT_PROBES: dict[str, Any] = {
    "app.tenant_members": lambda t: (
        "insert into app.tenant_members (user_id, tenant_id, role) values (%s, %s, 'owner')",
        [uuid4(), t.tenant_id],
    ),
    "app.tenant_config": lambda t: (
        "insert into app.tenant_config (tenant_id) values (%s)",
        [t.tenant_id],
    ),
    "app.whatsapp_numbers": _insert_number,
    "app.contacts": lambda t: (
        "insert into app.contacts (id, tenant_id, contact_key, phone_e164, name)"
        " values (%s, %s, %s, '+919822222222', 'Probe')",
        [uuid4(), t.tenant_id, f"tel:+919822222222-{uuid4()}"],
    ),
    "app.conversations": lambda t: (
        "insert into app.conversations (id, tenant_id, contact_id, number_id)"
        " values (%s, %s, %s, %s)",
        [uuid4(), t.tenant_id, t.contact_id, t.number_id],
    ),
    "app.messages": lambda t: (
        "insert into app.messages (id, tenant_id, conversation_id, direction, type, body, source)"
        " values (%s, %s, %s, 'in', 'text', 'probe', 'customer')",
        [uuid4(), t.tenant_id, t.conversation_id],
    ),
}

# Tenant tables that need no insert probe: not tenant-writable by design.
NO_INSERT_PROBE = {"app.tenants", "app.plan_tiers"}
