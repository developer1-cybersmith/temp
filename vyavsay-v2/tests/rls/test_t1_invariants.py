"""T1: catalog invariants over the migrated schema (doc 03 s9, ADR 0016). Owner story: E1.2."""

from collections.abc import Callable
from typing import Any

import pytest
from psycopg import Connection

from tests.db import invariants as inv
from tests.db.expectations import CORE_TABLES, ROLES
from tests.db.harness import DbHarness

pytestmark = pytest.mark.db

CHECKS: list[Callable[[Connection[Any]], list[str]]] = [
    inv.rls_not_enabled_or_forced,
    inv.policy_problems,
    inv.missing_tenant_id,
    inv.tenant_id_not_first_in_an_index,
    inv.non_composite_foreign_keys,
    inv.anon_or_public_grants,
    inv.public_schema_objects,
    inv.definer_function_problems,
    inv.view_problems,
    inv.login_role_grants,
    inv.role_attribute_problems,
    inv.extension_schema_problems,
]


@pytest.mark.parametrize("check", CHECKS, ids=lambda f: f.__name__)
def test_t1_invariant(db: DbHarness, check: Callable[[Connection[Any]], list[str]]) -> None:
    db.require_tables(*CORE_TABLES)  # an empty schema must not pass vacuously
    db.require_roles(*ROLES)
    with db.as_owner_admin() as c:
        assert check(c) == []
