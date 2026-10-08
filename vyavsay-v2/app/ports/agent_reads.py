"""Read-only ports the agent uses. Each is bound to one run, so no method takes a tenant id.

Failures are typed values, never exceptions, and never look like "not found" (audit H-29).
"""

from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict


@dataclass(frozen=True)
class Found[T]:
    value: T


@dataclass(frozen=True)
class NotFound:
    pass


ToolErrorKind = Literal["invalid_args", "timeout", "unavailable", "internal"]


@dataclass(frozen=True)
class ReadError:
    kind: ToolErrorKind
    retryable: bool


class _View(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ItemView(_View):
    """Public view only. Cost and floor price are never in it (ADR 0019)."""

    item_id: UUID
    title: str
    price_paise: int | None = None
    availability: Literal["available", "sold", "reserved"] = "available"


class ItemFilters(_View):
    category: str | None = None
    max_price_paise: int | None = None


class ItemSearch(_View):
    available: tuple[ItemView, ...] = ()
    sold: tuple[ItemView, ...] = ()
    alternatives: tuple[ItemView, ...] = ()


class KnowledgeChunk(_View):
    text: str
    source_id: str | None = None


class CatalogReadPort(Protocol):
    async def search(
        self, filters: ItemFilters, query: str | None
    ) -> Found[ItemSearch] | NotFound | ReadError: ...

    async def get(self, item_id: UUID) -> Found[ItemView] | NotFound | ReadError: ...


class KnowledgePort(Protocol):
    async def search(
        self, query: str
    ) -> Found[tuple[KnowledgeChunk, ...]] | NotFound | ReadError: ...
