import json
from datetime import UTC, datetime

import pytest

from app.adapters.fake import FakeConfig, FakeProvider, FakeWebhookSender
from app.adapters.fake.webhooks import Delivery, delayed, out_of_order, with_duplicates
from app.ports.whatsapp import Capabilities, InboundContext, ProviderError, UnknownOutcome
from app.ports.whatsapp_models import (
    ErrorKind,
    Recipient,
    SendError,
    SendKind,
    SendRequest,
)

SECRET = "s3cret"
RCPT = Recipient(sender_ref="s1")


def req(key: str) -> SendRequest:
    return SendRequest(kind=SendKind.TEXT, recipient=RCPT, idem_key=key, text="x")


def test_sender_ids_are_unique_and_deliveries_signed() -> None:
    s = FakeWebhookSender(SECRET)
    a, b = s.text("a"), s.text("b")
    assert json.loads(a.body)["id"] != json.loads(b.body)["id"]
    p = FakeProvider()
    ctx = InboundContext(url="u", method="POST", headers=a.headers, raw_body=a.body)
    assert p.verify_inbound(ctx, SECRET)


def test_duplicates_reorder_and_delay_helpers() -> None:
    s = FakeWebhookSender(SECRET)
    d = [s.text("1"), s.text("2"), s.text("3")]
    assert [x.body for x in with_duplicates(d, at=[1])] == [
        d[0].body,
        d[1].body,
        d[1].body,
        d[2].body,
    ]
    assert [x.body for x in out_of_order(d, [2, 0, 1])] == [d[2].body, d[0].body, d[1].body]
    assert delayed(d[0], 2.5).delay_s == 2.5
    assert isinstance(d[0], Delivery)


async def test_scripted_failures_are_consumed_in_order() -> None:
    p = FakeProvider()
    p.fail_next(SendError(kind=ErrorKind.RETRYABLE))
    p.unknown_next(delivered=False)
    with pytest.raises(ProviderError):
        await p.send(req("a"))
    with pytest.raises(UnknownOutcome):
        await p.send(req("b"))
    assert (await p.send(req("c"))).accepted
    assert len(p.sent) == 1  # "a" failed outright; "b" never delivered; only "c" exists


async def test_no_idempotency_sends_twice() -> None:
    p = FakeProvider(FakeConfig(capabilities=Capabilities(idempotent_send=False)))
    await p.send(req("same"))
    await p.send(req("same"))
    assert len(p.sent) == 2


async def test_clock_is_injectable() -> None:
    fixed = datetime(2026, 1, 1, tzinfo=UTC)
    p = FakeProvider(FakeConfig(), clock=lambda: fixed)
    r = await p.send(req("k"))
    st = await p.lookup_status(r.provider_message_id)
    assert st is not None and st.ts == fixed
