"""Small helpers for probing statements inside a transaction."""

from dataclasses import dataclass, field
from typing import Any

import psycopg
from psycopg import Connection


@dataclass
class Outcome:
    ok: bool
    rowcount: int = -1
    sqlstate: str | None = None
    message: str = ""
    rows: list[Any] = field(default_factory=list)

    @property
    def denied(self) -> bool:
        """Permission denied or row-level security violation (SQLSTATE 42501)."""
        return self.sqlstate == "42501"

    def describe(self) -> str:
        if self.ok:
            return f"ok, rowcount={self.rowcount}"
        return f"error {self.sqlstate}: {self.message}"


def attempt(conn: Connection[Any], query: str, params: Any = None) -> Outcome:
    """Run one statement in a savepoint so the outer transaction survives an error."""
    try:
        with conn.transaction():
            cur = conn.execute(query, params)  # type: ignore[arg-type]
            rows = cur.fetchall() if cur.description else []
            return Outcome(True, cur.rowcount, rows=rows)
    except psycopg.Error as e:
        return Outcome(False, sqlstate=e.sqlstate, message=str(e).splitlines()[0])


def count_rows(
    conn: Connection[Any], table: str, column: str | None = None, value: Any = None
) -> int:
    """count(*) of a table, optionally where column = value. Raises on permission errors."""
    if column is None:
        row = conn.execute(f"select count(*) from {table}").fetchone()  # type: ignore[call-overload]
    else:
        row = conn.execute(
            f"select count(*) from {table} where {column} = %s",  # type: ignore[call-overload]
            (value,),
        ).fetchone()
    assert row is not None
    return int(row[0])
