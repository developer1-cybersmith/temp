"""Each T1 invariant query must flag a deliberate violation (and stay quiet on a clean table)."""

import pytest

from tests.db import invariants as inv
from tests.db.harness import DbHarness

pytestmark = pytest.mark.db

VIOLATORS = """
create schema app; create schema private;
create table app.parent (tenant_id uuid not null, id uuid not null, unique (tenant_id, id));
create table app.no_rls (tenant_id uuid not null, id uuid primary key);
create table app.not_forced (tenant_id uuid not null, id uuid primary key);
alter table app.not_forced enable row level security;
create table app.no_policy (tenant_id uuid not null);
alter table app.no_policy enable row level security;
alter table app.no_policy force row level security;
create table app.no_tenant (id uuid primary key);
create table app.child (tenant_id uuid not null, id uuid primary key, parent_id uuid not null,
  foreign key (parent_id) references app.parent_simple (id));
create table app.pub_policy (tenant_id uuid not null);
alter table app.pub_policy enable row level security;
create policy p on app.pub_policy for update using (true);
create table public.leaky (id int);
create function private.sneaky() returns int language sql security definer as $$ select 1 $$;
create view app.plain_view as select * from app.no_rls;
"""

FIXED_PARENT = "create table app.parent_simple (id uuid primary key);"


def violations(h: DbHarness, fn: str) -> list[str]:
    with h.as_owner_admin() as c:
        c.execute(FIXED_PARENT.replace("create", "create schema if not exists app;\ncreate", 1))
        c.execute(VIOLATORS.replace("create schema app;", ""))
        return getattr(inv, fn)(c)  # type: ignore[no-any-return]


@pytest.mark.parametrize(
    ("fn", "expected"),
    [
        ("rls_not_enabled_or_forced", ["app.no_rls: RLS not enabled", "app.not_forced: RLS not"]),
        ("policy_problems", ["app.no_policy: no policy", "pub_policy.p: policy applies to PUBLIC"]),
        ("missing_tenant_id", ["app.no_tenant: no tenant_id"]),
        ("tenant_id_not_first_in_an_index", ["app.no_policy: tenant_id is not"]),
        ("non_composite_foreign_keys", ["app.child.child_parent_id_fkey: references"]),
        ("anon_or_public_grants", ["public.leaky: anon"]),
        ("public_schema_objects", ["public.leaky"]),
        (
            "definer_function_problems",
            ["private.sneaky: SECURITY DEFINER but not", "private.sneaky: search_path not pinned"],
        ),
        ("view_problems", ["app.plain_view: view is not security_invoker"]),
    ],
)
def test_invariant_flags_violation(bare_db: DbHarness, fn: str, expected: list[str]) -> None:
    found = violations(bare_db, fn)
    for want in expected:
        assert any(want in f for f in found), (want, found)


def test_clean_table_is_not_flagged(bare_db: DbHarness) -> None:
    with bare_db.as_owner_admin() as c:
        c.execute("create schema app")
        c.execute("create table app.ok (tenant_id uuid not null, id uuid primary key)")
        c.execute("create index on app.ok (tenant_id, id)")
        c.execute("alter table app.ok enable row level security")
        c.execute("alter table app.ok force row level security")
        c.execute("create policy t on app.ok for all to authenticated using (true)")
        fns = ("rls_not_enabled_or_forced", "policy_problems", "tenant_id_not_first_in_an_index")
        for fn in fns:
            assert getattr(inv, fn)(c) == [], fn
