"""Canonical WhatsApp models (docs/06 s1). Frozen. Adapters translate into these."""

from enum import StrEnum
from typing import Any, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class _Model(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ErrorKind(StrEnum):
    RETRYABLE = "retryable"
    PERMANENT = "permanent"
    WINDOW_CLOSED = "window_closed"
    RATE_LIMITED = "rate_limited"
    UNKNOWN_SEND = "unknown_send"


class ErrorReason(StrEnum):
    AUTH = "auth"
    RECIPIENT_INVALID = "recipient_invalid"
    RECIPIENT_BLOCKED = "recipient_blocked"
    TEMPLATE_PROBLEM = "template_problem"
    CONTENT_REJECTED = "content_rejected"
    OTHER = "other"


class SendError(_Model):
    kind: ErrorKind
    reason: ErrorReason | None = None
    detail: str = ""  # free text for logs only; the core never branches on it
    retry_after: float | None = Field(default=None, ge=0)  # seconds

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.kind is ErrorKind.PERMANENT and self.reason is None:
            raise ValueError("permanent error needs a reason")
        if self.kind is not ErrorKind.PERMANENT and self.reason is not None:
            raise ValueError("only permanent errors carry a reason")
        if self.retry_after is not None and self.kind is not ErrorKind.RATE_LIMITED:
            raise ValueError("retry_after is only for rate_limited")
        return self


class MediaRef(_Model):
    """Inbound: `opaque_ref` (given back to fetch_media). Outbound: `media_key` (our S3 key)."""

    mime: str
    size: int | None = Field(default=None, ge=0)
    opaque_ref: str | None = None
    media_key: str | None = None

    @model_validator(mode="after")
    def _one_side(self) -> Self:
        if (self.opaque_ref is None) == (self.media_key is None):
            raise ValueError("set exactly one of opaque_ref (inbound) or media_key (outbound)")
        return self


class DeliveryState(StrEnum):
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class DeliveryStatus(_Model):
    provider_message_id: str
    state: DeliveryState
    error: SendError | None = None
    correlation: str | None = None  # our idem_key, when the provider echoes it
    ts: AwareDatetime

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.error is not None and self.state is not DeliveryState.FAILED:
            raise ValueError("only a failed status carries an error")
        return self


class EventKind(StrEnum):
    TEXT = "text"
    VOICE = "voice"
    IMAGE = "image"
    STATUS = "status"
    REACTION = "reaction"
    UNSUPPORTED = "unsupported"


class InboundEvent(_Model):
    kind: EventKind
    provider_message_id: str
    id_space: str
    number_ref: str
    sender_ref: str  # opaque, stable per provider
    sender_phone_raw: str | None = None
    ts: AwareDatetime  # provider event time
    text: str | None = None
    media: MediaRef | None = None
    reply_to: str | None = None
    status: DeliveryStatus | None = None
    raw: dict[str, Any] = Field(default_factory=dict)  # this event's slice; the core never reads it

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.kind is EventKind.TEXT and not self.text:
            raise ValueError("text event needs text")
        if self.kind in (EventKind.VOICE, EventKind.IMAGE) and self.media is None:
            raise ValueError(f"{self.kind} event needs media")
        if self.kind is EventKind.STATUS and self.status is None:
            raise ValueError("status event needs status")
        return self


class Recipient(_Model):
    sender_ref: str
    phone: str | None = None


class TemplatePurpose(StrEnum):
    FOLLOWUP_NUDGE = "followup_nudge"
    VISIT_REMINDER = "visit_reminder"
    REENGAGE = "reengage"
    OWNER_ALERT = "owner_alert"
    OWNER_REPLY = "owner_reply"
    TEAM_NOTICE = "team_notice"


class TemplateStatus(StrEnum):
    APPROVED = "approved"
    PENDING = "pending"
    REJECTED = "rejected"
    PAUSED = "paused"
    UNKNOWN = "unknown"


class TemplateCategory(StrEnum):
    UTILITY = "utility"
    MARKETING = "marketing"
    OTHER = "other"


class TemplateRef(_Model):
    purpose: TemplatePurpose
    language: str
    external_ref: str  # opaque


class TemplateSpec(_Model):
    purpose: TemplatePurpose
    language: str
    variable_count: int = Field(ge=0)
    status: TemplateStatus
    category: TemplateCategory
    external_ref: str


class SendKind(StrEnum):
    TEXT = "text"
    TEMPLATE = "template"
    MEDIA = "media"


class SendRequest(_Model):
    kind: SendKind
    recipient: Recipient
    idem_key: str = Field(min_length=1)
    status_callback_url: str | None = None  # adapter may ignore
    text: str | None = None
    template: TemplateRef | None = None
    variables: tuple[str, ...] = ()  # ordered
    media: MediaRef | None = None
    caption: str | None = None

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.kind is SendKind.TEXT and not self.text:
            raise ValueError("text send needs text")
        if self.kind is SendKind.TEMPLATE and self.template is None:
            raise ValueError("template send needs a template")
        if self.kind is SendKind.MEDIA and (self.media is None or self.media.media_key is None):
            raise ValueError("media send needs outbound media (media_key)")
        return self


class SendResult(_Model):
    provider_message_id: str
    accepted: bool


__all__ = [
    "DeliveryState", "DeliveryStatus", "ErrorKind", "ErrorReason", "EventKind", "InboundEvent",
    "MediaRef", "Recipient", "SendError", "SendKind", "SendRequest", "SendResult",
    "TemplateCategory", "TemplatePurpose", "TemplateRef", "TemplateSpec", "TemplateStatus",
]
