from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.ports.whatsapp_models import (
    DeliveryState,
    DeliveryStatus,
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
    TemplateStatus,
)

NOW = datetime(2026, 10, 8, 10, 0, tzinfo=UTC)


def event(**kw: object) -> InboundEvent:
    base: dict[str, object] = {
        "kind": EventKind.TEXT,
        "provider_message_id": "m1",
        "id_space": "fake",
        "number_ref": "n1",
        "sender_ref": "s1",
        "ts": NOW,
        "text": "hi",
        "raw": {"a": 1},
    }
    base.update(kw)
    return InboundEvent.model_validate(base)


def test_error_taxonomy_is_the_documented_one() -> None:
    assert {k.value for k in ErrorKind} == {
        "retryable",
        "permanent",
        "window_closed",
        "rate_limited",
        "unknown_send",
    }
    assert {r.value for r in ErrorReason} == {
        "auth",
        "recipient_invalid",
        "recipient_blocked",
        "template_problem",
        "content_rejected",
        "other",
    }


def test_permanent_error_needs_a_reason() -> None:
    with pytest.raises(ValidationError):
        SendError(kind=ErrorKind.PERMANENT)
    assert SendError(kind=ErrorKind.PERMANENT, reason=ErrorReason.AUTH).reason is ErrorReason.AUTH


@pytest.mark.parametrize(
    "kind",
    [ErrorKind.RETRYABLE, ErrorKind.WINDOW_CLOSED, ErrorKind.RATE_LIMITED, ErrorKind.UNKNOWN_SEND],
)
def test_non_permanent_error_has_no_reason(kind: ErrorKind) -> None:
    with pytest.raises(ValidationError):
        SendError(kind=kind, reason=ErrorReason.OTHER)
    assert SendError(kind=kind).reason is None


def test_retry_after_only_for_rate_limited() -> None:
    assert SendError(kind=ErrorKind.RATE_LIMITED, retry_after=30).retry_after == 30
    with pytest.raises(ValidationError):
        SendError(kind=ErrorKind.WINDOW_CLOSED, retry_after=30)


def test_models_are_frozen() -> None:
    with pytest.raises(ValidationError):
        event().text = "other"  # type: ignore[misc]


def test_inbound_ts_must_be_timezone_aware() -> None:
    with pytest.raises(ValidationError):
        event(ts=datetime(2026, 10, 8, 10, 0))


def test_inbound_text_needs_text() -> None:
    with pytest.raises(ValidationError):
        event(text=None)


@pytest.mark.parametrize("kind", [EventKind.VOICE, EventKind.IMAGE])
def test_inbound_media_kinds_need_media(kind: EventKind) -> None:
    with pytest.raises(ValidationError):
        event(kind=kind, text=None)
    media = MediaRef(mime="audio/ogg", opaque_ref="o1")
    assert event(kind=kind, text=None, media=media).media == media


def test_inbound_status_needs_status() -> None:
    with pytest.raises(ValidationError):
        event(kind=EventKind.STATUS, text=None)
    st = DeliveryStatus(provider_message_id="m0", state=DeliveryState.DELIVERED, ts=NOW)
    assert event(kind=EventKind.STATUS, text=None, status=st).status == st


def test_inbound_unsupported_and_reaction_need_nothing_else() -> None:
    assert event(kind=EventKind.UNSUPPORTED, text=None).kind is EventKind.UNSUPPORTED
    assert event(kind=EventKind.REACTION, text="👍", reply_to="m0").reply_to == "m0"


def test_phone_is_optional_on_inbound() -> None:
    assert event().sender_phone_raw is None
    assert event(sender_phone_raw="919876543210").sender_phone_raw == "919876543210"


def test_raw_is_not_needed_to_rebuild_the_core_view() -> None:
    e = event()
    core = e.model_dump(exclude={"raw"})
    assert InboundEvent.model_validate({**core, "raw": {}}).text == "hi"


def test_media_ref_is_inbound_or_outbound_not_both() -> None:
    with pytest.raises(ValidationError):
        MediaRef(mime="image/jpeg")
    with pytest.raises(ValidationError):
        MediaRef(mime="image/jpeg", opaque_ref="o", media_key="k")
    assert MediaRef(mime="image/jpeg", media_key="tenant/k").media_key == "tenant/k"


RCPT = Recipient(sender_ref="s1", phone="+919876543210")
TPL = TemplateRef(purpose=TemplatePurpose.FOLLOWUP_NUDGE, language="en", external_ref="t1")


def test_send_text_request() -> None:
    r = SendRequest(kind=SendKind.TEXT, recipient=RCPT, idem_key="k1", text="hello")
    assert r.template is None
    with pytest.raises(ValidationError):
        SendRequest(kind=SendKind.TEXT, recipient=RCPT, idem_key="k1")


def test_send_template_request_needs_template_and_keeps_variable_order() -> None:
    r = SendRequest(
        kind=SendKind.TEMPLATE, recipient=RCPT, idem_key="k", template=TPL, variables=("a", "b")
    )
    assert r.variables == ("a", "b")
    with pytest.raises(ValidationError):
        SendRequest(kind=SendKind.TEMPLATE, recipient=RCPT, idem_key="k")


def test_send_media_request_needs_outbound_media() -> None:
    out = MediaRef(mime="image/jpeg", media_key="k")
    assert (
        SendRequest(
            kind=SendKind.MEDIA, recipient=RCPT, idem_key="k", media=out, caption="c"
        ).caption
        == "c"
    )
    with pytest.raises(ValidationError):
        SendRequest(kind=SendKind.MEDIA, recipient=RCPT, idem_key="k")
    with pytest.raises(ValidationError):
        SendRequest(
            kind=SendKind.MEDIA,
            recipient=RCPT,
            idem_key="k",
            media=MediaRef(mime="image/jpeg", opaque_ref="o"),
        )


def test_send_request_idem_key_is_required() -> None:
    with pytest.raises(ValidationError):
        SendRequest(kind=SendKind.TEXT, recipient=RCPT, idem_key="", text="x")


def test_failed_status_carries_error_others_do_not() -> None:
    err = SendError(kind=ErrorKind.PERMANENT, reason=ErrorReason.RECIPIENT_BLOCKED)
    assert (
        DeliveryStatus(provider_message_id="m", state=DeliveryState.FAILED, error=err, ts=NOW).error
        == err
    )
    with pytest.raises(ValidationError):
        DeliveryStatus(provider_message_id="m", state=DeliveryState.READ, error=err, ts=NOW)


def test_template_spec_enums() -> None:
    spec = TemplateSpec(
        purpose=TemplatePurpose.VISIT_REMINDER,
        language="en",
        variable_count=2,
        status=TemplateStatus.APPROVED,
        category="utility",
        external_ref="t1",
    )
    assert spec.status is TemplateStatus.APPROVED
    assert {s.value for s in TemplateStatus} == {
        "approved",
        "pending",
        "rejected",
        "paused",
        "unknown",
    }
    assert {p.value for p in TemplatePurpose} == {
        "followup_nudge",
        "visit_reminder",
        "reengage",
        "owner_alert",
        "owner_reply",
        "team_notice",
    }
