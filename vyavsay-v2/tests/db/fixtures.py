"""Pytest fixtures. Import them from a conftest.py (tests/db and tests/rls do)."""

from collections.abc import Iterator

import pytest

from tests.db.harness import DbHarness, migrations_path, open_harness


@pytest.fixture(scope="session")
def db() -> Iterator[DbHarness]:
    """Throwaway database with the stub and every file in migrations/ (or MIGRATIONS_DIR).

    Setup never raises SchemaMissing: the helpers raise it inside the test, so it FAILS.
    """
    with open_harness(migrations_path()) as h:
        yield h


@pytest.fixture(scope="module")
def bare_db() -> Iterator[DbHarness]:
    """Stub only, no migrations: for the harness self-tests."""
    with open_harness(None) as h:
        yield h
