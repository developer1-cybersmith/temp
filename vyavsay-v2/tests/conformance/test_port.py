"""Provider-agnostic port contract. Runs on every registry name x capability variant."""

import pytest

from app.bootstrap.registry import provider_names
from app.ports.whatsapp import (
    Capabilities,
    MediaExpired,
    ParseError,
    ProviderError,
    UnknownOutcome,
    Unsupported,
)
from app.ports.whatsapp_models import (
    DeliveryState,
    ErrorKind,
    ErrorReason,
    EventKind,
    InboundEvent,
    MediaRef,
    Recipient,
    SendError,
    SendKind,
    SendRequest,
    TemplatePurpose,
    TemplateRef,
    TemplateSpec,
)
from tests.conformance.harness import Harness
from tests.conformance.harnesses import HARNESSES, VARIANTS

pytestmark = pytest.mark.conformance

RCPT = Recipient(sender_ref="s1", phone="+919876543210")
TPL = TemplateRef(purpose=TemplatePurpose.FOLLOWUP_NUDGE, language="en", external_ref="t1")


def text_req(key: str = "k1") -> SendRequest:
    return SendRequest(kind=SendKind.TEXT, recipient=RCPT, idem_key=key, text="hello")


def tpl_req(key: str = "k1") -> SendRequest:
    return SendRequest(
        kind=SendKind.TEMPLATE, recipient=RCPT, idem_key=key, template=TPL, variables=("a",)
    )


def one(h: Harness, kind: str, **kw: object) -> InboundEvent:
    events = h.provider.parse_inbound(h.inbound(kind, **kw).body)
    assert len(events) == 1
    return events[0]


def test_every_registry_name_has_a_harness_and_variants() -> None:
    for name in provider_names():
        assert name in HARNESSES
        assert VARIANTS[name]


def test_capabilities_are_declared(h: Harness) -> None:
    assert isinstance(h.provider.capabilities(), Capabilities)
    assert h.provider.id_space


# inbound parse -----------------------------------------------------------------------------


def test_text_event(h: Harness) -> None:
    e = one(h, "text", text="namaste", phone="919876543210")
    assert e.kind is EventKind.TEXT
    assert e.text == "namaste"
    assert e.id_space == h.provider.id_space
    assert e.provider_message_id and e.number_ref and e.sender_ref
    assert e.sender_phone_raw == "919876543210"


def test_text_event_without_phone(h: Harness) -> None:
    e = one(h, "text", phone=None)
    assert e.kind is EventKind.TEXT
    assert e.sender_phone_raw is None


def test_voice_event_follows_flags(h: Harness) -> None:
    c = h.provider.capabilities()
    e = one(h, "voice")
    if c.voice_notes and c.media_download:
        assert e.kind is EventKind.VOICE
        assert e.media is not None and e.media.opaque_ref
    else:
        assert e.kind is EventKind.UNSUPPORTED


def test_image_event_follows_flags(h: Harness) -> None:
    e = one(h, "image")
    if h.provider.capabilities().media_download:
        assert e.kind is EventKind.IMAGE
        assert e.media is not None and e.media.mime.startswith("image/")
    else:
        assert e.kind is EventKind.UNSUPPORTED


def test_reaction_event(h: Harness) -> None:
    e = one(h, "reaction", emoji="👍", reply_to="m0")
    assert e.kind is EventKind.REACTION
    assert e.reply_to == "m0"


def test_status_event_follows_flags(h: Harness) -> None:
    c = h.provider.capabilities()
    p = h.status("pm1", DeliveryState.DELIVERED, idem_key="k9")
    (e,) = h.provider.parse_inbound(p.body)
    if c.delivery_webhooks:
        assert e.kind is EventKind.STATUS
        assert e.status is not None
        assert e.status.state is DeliveryState.DELIVERED
        assert e.status.provider_message_id == "pm1"
        assert e.status.correlation == ("k9" if c.correlation_echo else None)
    else:
        assert e.kind is EventKind.UNSUPPORTED


def test_failed_status_carries_typed_error(h: Harness) -> None:
    if not h.provider.capabilities().delivery_webhooks:
        pytest.skip("no delivery webhooks")
    err = SendError(kind=ErrorKind.PERMANENT, reason=ErrorReason.RECIPIENT_BLOCKED)
    (e,) = h.provider.parse_inbound(h.status("pm1", DeliveryState.FAILED, error=err).body)
    assert e.status is not None and e.status.error is not None
    assert e.status.error.kind is ErrorKind.PERMANENT
    assert e.status.error.reason is ErrorReason.RECIPIENT_BLOCKED


@pytest.mark.parametrize("body", [b"[1, 2]", b"{}", b'{"type": 5}', b'"text"', b"null"])
def test_odd_json_is_unsupported_not_an_exception(h: Harness, body: bytes) -> None:
    events = h.provider.parse_inbound(body)
    assert [e.kind for e in events] == [EventKind.UNSUPPORTED]


def test_unknown_type_is_unsupported(h: Harness) -> None:
    (e,) = h.provider.parse_inbound(h.unknown_payload().body)
    assert e.kind is EventKind.UNSUPPORTED
    assert e.raw


def test_non_json_body_is_a_parse_error(h: Harness) -> None:
    with pytest.raises(ParseError):
        h.provider.parse_inbound(b"\xff not json")


def test_resolve_number_matches_event(h: Harness) -> None:
    p = h.inbound("text")
    (e,) = h.provider.parse_inbound(p.body)
    assert h.provider.resolve_number(p.body) == [e.number_ref]
    assert h.provider.resolve_number(b"[]") == []


# verification --------------------------------------------------------------------------------


def test_good_signature_passes(h: Harness) -> None:
    assert h.provider.verify_inbound(h.inbound("text").ctx(), h.secret)


def test_tampered_missing_and_wrong_secret_fail(h: Harness) -> None:
    p = h.inbound("text")
    assert not h.provider.verify_inbound(h.tamper(p).ctx(), h.secret)
    assert not h.provider.verify_inbound(h.without_signature(p).ctx(), h.secret)
    assert not h.provider.verify_inbound(p.ctx(), "wrong-secret")


# duplicate delivery, ordering, raw --------------------------------------------------------------


def test_duplicate_delivery_has_one_dedupe_key(h: Harness) -> None:
    p = h.inbound("text", message_id="dup-1")
    keys = {
        (e.number_ref, e.id_space, e.provider_message_id)
        for body in (p.body, p.body)
        for e in h.provider.parse_inbound(body)
    }
    assert len(keys) == 1


def test_different_messages_have_different_keys(h: Harness) -> None:
    a = one(h, "text", message_id="a")
    b = one(h, "text", message_id="b")
    assert a.provider_message_id != b.provider_message_id


def test_event_time_survives_so_core_can_reorder(h: Harness) -> None:
    from datetime import UTC, datetime

    early = datetime(2026, 10, 8, 9, 0, tzinfo=UTC)
    late = datetime(2026, 10, 8, 9, 5, tzinfo=UTC)
    # delivered late-first
    e_late = one(h, "text", ts=late)
    e_early = one(h, "text", ts=early)
    assert e_early.ts < e_late.ts


def test_raw_is_kept_but_not_needed(h: Harness) -> None:
    e = one(h, "text")
    assert e.raw
    core = e.model_dump(exclude={"raw"})
    assert InboundEvent.model_validate({**core, "raw": {}}).text == e.text


# send --------------------------------------------------------------------------------------------


async def test_text_send(h: Harness) -> None:
    if h.text_send_allowed:
        r = await h.provider.send(text_req())
        assert r.accepted and r.provider_message_id
    else:
        with pytest.raises(ProviderError) as ei:
            await h.provider.send(text_req())
        assert ei.value.error.kind is ErrorKind.WINDOW_CLOSED


async def test_template_send_follows_flag(h: Harness) -> None:
    if h.provider.capabilities().send_template:
        r = await h.provider.send(tpl_req())
        assert r.accepted and r.provider_message_id
    else:
        with pytest.raises(Unsupported) as ei:
            await h.provider.send(tpl_req())
        assert ei.value.capability == "send_template"


async def test_media_send(h: Harness) -> None:
    req = SendRequest(
        kind=SendKind.MEDIA,
        recipient=RCPT,
        idem_key="km",
        media=MediaRef(mime="image/jpeg", media_key="t/1.jpg"),
        caption="car",
    )
    if h.text_send_allowed:
        assert (await h.provider.send(req)).accepted
    else:
        with pytest.raises(ProviderError) as ei:
            await h.provider.send(req)
        assert ei.value.error.kind is ErrorKind.WINDOW_CLOSED


@pytest.mark.parametrize(
    "error",
    [
        SendError(kind=ErrorKind.RETRYABLE),
        SendError(kind=ErrorKind.PERMANENT, reason=ErrorReason.AUTH),
        SendError(kind=ErrorKind.PERMANENT, reason=ErrorReason.RECIPIENT_INVALID),
        SendError(kind=ErrorKind.PERMANENT, reason=ErrorReason.RECIPIENT_BLOCKED),
        SendError(kind=ErrorKind.PERMANENT, reason=ErrorReason.TEMPLATE_PROBLEM),
        SendError(kind=ErrorKind.WINDOW_CLOSED),
        SendError(kind=ErrorKind.RATE_LIMITED, retry_after=12),
    ],
    ids=lambda e: f"{e.kind}-{e.reason}",
)
async def test_send_failure_is_a_typed_error(h: Harness, error: SendError) -> None:
    if not h.text_send_allowed:
        pytest.skip("text not accepted in this mode")
    h.fail_next_send(error)
    with pytest.raises(ProviderError) as ei:
        await h.provider.send(text_req())
    assert ei.value.error.kind is error.kind
    assert ei.value.error.reason is error.reason
    assert ei.value.error.retry_after == error.retry_after
    assert not isinstance(ei.value, UnknownOutcome)


@pytest.mark.parametrize("delivered", [True, False])
async def test_unknown_outcome_is_unknown_send_not_retryable(h: Harness, delivered: bool) -> None:
    if not h.text_send_allowed:
        pytest.skip("text not accepted in this mode")
    h.unknown_next_send(delivered)
    with pytest.raises(UnknownOutcome) as ei:
        await h.provider.send(text_req())
    assert ei.value.error.kind is ErrorKind.UNKNOWN_SEND


async def test_idempotent_send_gives_one_message(h: Harness) -> None:
    if not (h.provider.capabilities().idempotent_send and h.text_send_allowed):
        pytest.skip("provider does not claim idempotent send")
    a = await h.provider.send(text_req("same"))
    b = await h.provider.send(text_req("same"))
    assert a.provider_message_id == b.provider_message_id
    assert h.sent_count == 1


async def test_idempotent_retry_after_unknown_outcome(h: Harness) -> None:
    if not (h.provider.capabilities().idempotent_send and h.text_send_allowed):
        pytest.skip("provider does not claim idempotent send")
    h.unknown_next_send(True)
    with pytest.raises(UnknownOutcome):
        await h.provider.send(text_req("retry"))
    await h.provider.send(text_req("retry"))
    assert h.sent_count == 1


# status lookup, templates, media: honest flags ----------------------------------------------------


async def test_status_lookup_follows_flag(h: Harness) -> None:
    c = h.provider.capabilities()
    if not c.status_lookup:
        with pytest.raises(Unsupported) as ei:
            await h.provider.lookup_status("x")
        assert ei.value.capability == "status_lookup"
        return
    if not h.text_send_allowed:
        pytest.skip("need a text send")
    r = await h.provider.send(text_req("lk"))
    st = await h.provider.lookup_status(r.provider_message_id)
    assert st is not None and st.state is DeliveryState.SENT
    assert st.correlation == ("lk" if c.correlation_echo else None)
    h.advance(r.provider_message_id, DeliveryState.DELIVERED)
    st2 = await h.provider.lookup_status(r.provider_message_id)
    assert st2 is not None and st2.state is DeliveryState.DELIVERED
    assert await h.provider.lookup_status("no-such-id") is None


async def test_list_templates_follows_flag(h: Harness) -> None:
    if h.provider.capabilities().list_templates:
        specs = await h.provider.list_templates()
        assert specs and all(isinstance(s, TemplateSpec) for s in specs)
    else:
        with pytest.raises(Unsupported) as ei:
            await h.provider.list_templates()
        assert ei.value.capability == "list_templates"


async def test_fetch_media_follows_flag(h: Harness) -> None:
    ref = MediaRef(mime="audio/ogg", opaque_ref="media-1")
    if not h.provider.capabilities().media_download:
        with pytest.raises(Unsupported) as ei:
            await h.provider.fetch_media(ref, max_bytes=1000)
        assert ei.value.capability == "media_download"
        return
    h.put_media("media-1", b"abc")
    assert await h.provider.fetch_media(ref, max_bytes=1000) == b"abc"
    with pytest.raises(ProviderError):
        await h.provider.fetch_media(ref, max_bytes=2)
    h.expire_media("media-1")
    with pytest.raises(MediaExpired):
        await h.provider.fetch_media(ref, max_bytes=1000)
