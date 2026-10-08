"""Seam v0 (docs/09, trimmed). The agent proposes, the backend applies."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from app.agent.scripted import ScriptedAgent, ScriptExhausted
from app.ports.agent import (
    AGENT_CONTRACT_VERSION,
    NoReply,
    ProposedReply,
    ReasonCode,
    ReviewRequest,
    RunInput,
    RunResult,
)
from app.ports.agent_reads import Found, NotFound, ReadError


def run_input(**kw: object) -> RunInput:
    base = {
        "tenant_id": uuid4(),
        "conversation_id": uuid4(),
        "job_id": uuid4(),
        "run_id": uuid4(),
        "inbound_ids": (uuid4(),),
        "started_at": datetime(2026, 10, 9, 10, 0, tzinfo=UTC),
    }
    return RunInput(**{**base, **kw})  # type: ignore[arg-type]


def test_models_are_frozen_and_versioned() -> None:
    reply = ProposedReply(text="Namaste", language="hi")
    assert reply.schema_version == AGENT_CONTRACT_VERSION
    with pytest.raises(ValidationError):
        reply.text = "changed"  # type: ignore[misc]


def test_unknown_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        ProposedReply(text="x", language="en", send_now=True)  # type: ignore[call-arg]


def test_review_request_needs_a_reason() -> None:
    with pytest.raises(ValidationError):
        ReviewRequest(item_kind="held_reply", reason_codes=())
    ok = ReviewRequest(item_kind="held_reply", reason_codes=(ReasonCode.AGENT_UNSURE,))
    assert ok.kind == "review"


def test_outcome_union_is_discriminated_on_kind() -> None:
    inp = run_input()
    result = RunResult(run_id=inp.run_id, outcome=NoReply(reason="ai_paused"))
    again = TypeAdapter(RunResult).validate_json(result.model_dump_json())
    assert isinstance(again.outcome, NoReply)


def test_restarts_are_bounded() -> None:
    with pytest.raises(ValidationError):
        run_input(restarts=3)


async def test_scripted_agent_replays_outcomes_in_order_and_records_inputs() -> None:
    agent = ScriptedAgent(
        [
            ProposedReply(text="Hello", language="en"),
            ReviewRequest(item_kind="escalation", reason_codes=(ReasonCode.WANTS_HUMAN,)),
        ]
    )
    first, second = run_input(), run_input()
    r1, r2 = await agent.run(first), await agent.run(second)
    assert isinstance(r1.outcome, ProposedReply) and r1.run_id == first.run_id
    assert isinstance(r2.outcome, ReviewRequest)
    assert agent.inputs == [first, second]


async def test_scripted_agent_accepts_callables_and_fails_loudly_when_empty() -> None:
    agent = ScriptedAgent([lambda inp: NoReply(reason="opted_out")])
    assert isinstance((await agent.run(run_input())).outcome, NoReply)
    with pytest.raises(ScriptExhausted):
        await agent.run(run_input())


def test_read_results_are_typed_values_not_exceptions() -> None:
    assert Found(value=1).value == 1
    assert isinstance(NotFound(), NotFound)
    err = ReadError(kind="timeout", retryable=True)
    assert err.retryable
