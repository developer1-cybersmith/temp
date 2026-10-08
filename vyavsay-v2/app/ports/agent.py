"""Agent <-> backend seam, version 0 (trimmed from docs/09-agent-backend-sync-contract.md).

The agent is a pure function of context: it PROPOSES (reply, review, no reply) and never
writes state or sends. The backend re-validates and applies. Fields beyond these are additive.
"""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AGENT_CONTRACT_VERSION = "0.1"

Lang = Literal["en", "hi", "mr"]


class Versioned(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    schema_version: str = AGENT_CONTRACT_VERSION


class RunInput(Versioned):
    """Built by the backend only. Ids come from the server, never from the model."""

    tenant_id: UUID
    conversation_id: UUID
    job_id: UUID
    run_id: UUID
    inbound_ids: tuple[UUID, ...]
    started_at: datetime
    restarts: int = Field(default=0, ge=0, le=2)


class HistoryMsg(Versioned):
    role: Literal["customer", "ai", "owner"]
    text: str


class TenantConfig(Versioned):
    persona_name: str | None = None
    tone: str | None = None
    languages: tuple[Lang, ...] = ("en",)
    max_discount_pct: int = Field(default=0, ge=0, le=100)
    config_version: str = "0"


class ConversationView(Versioned):
    ai_paused: bool = False
    open_review_item: bool = False
    opted_out: bool = False
    language: Lang | None = None


class ContextBundle(Versioned):
    """One immutable snapshot, read once per run."""

    cfg: TenantConfig
    conv: ConversationView
    history: tuple[HistoryMsg, ...] = ()
    turn: tuple[HistoryMsg, ...] = ()


class Claim(Versioned):
    kind: Literal["price", "availability", "spec", "hours", "other"]
    value: str
    ref: str | None = None
    source: Literal["item", "config", "knowledge"]


class ProposedReply(Versioned):
    kind: Literal["reply"] = "reply"
    text: str
    language: Lang
    claims: tuple[Claim, ...] = ()
    offer_price_paise: int | None = None


class ReasonCode(StrEnum):
    WANTS_HUMAN = "wants_human"
    COMPLAINT = "complaint"
    OVER_AUTHORITY = "over_authority"
    AGENT_UNSURE = "agent_unsure"
    GUARD_HOLD = "guard_hold"
    RETRIEVAL_ERROR = "retrieval_error"
    LLM_UNAVAILABLE = "llm_unavailable"
    CAP_EXCEEDED = "cap_exceeded"
    TIMEOUT = "timeout"
    INJECTION = "injection"


class HoldingRef(Versioned):
    """A reference to an approved holding template, never free text (ADR 0025)."""

    template_key: str
    language: Lang
    version: str


class ReviewRequest(Versioned):
    kind: Literal["review"] = "review"
    item_kind: Literal["held_reply", "escalation", "held_window", "ai_failure"]
    reason_codes: tuple[ReasonCode, ...] = Field(min_length=1)
    holding: HoldingRef | None = None


class NoReply(Versioned):
    kind: Literal["no_reply"] = "no_reply"
    reason: Literal[
        "ai_paused", "auto_reply_disabled", "open_review_item", "plan_limit", "opted_out"
    ]


class RunReport(Versioned):
    """No free text, no raw args: safe to store."""

    llm_calls: int = 0
    tool_calls: int = 0
    wall_ms: int = 0


Outcome = Annotated[ProposedReply | ReviewRequest | NoReply, Field(discriminator="kind")]


class RunResult(Versioned):
    run_id: UUID
    outcome: Outcome
    report: RunReport = RunReport()


class AgentRunner(Protocol):
    """The real graph or ScriptedAgent. Injected by bootstrap."""

    async def run(self, inp: RunInput) -> RunResult: ...
