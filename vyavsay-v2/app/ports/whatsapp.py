"""WhatsAppProvider port (docs/06 s1, s2; docs/02 s4). Core sees only this."""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, ConfigDict

from app.ports.whatsapp_models import (
    DeliveryStatus,
    ErrorKind,
    InboundEvent,
    MediaRef,
    SendError,
    SendRequest,
    SendResult,
    TemplateSpec,
)


class Capabilities(BaseModel):
    """What this adapter can do. The adapter is the source of truth (docs/06 s2)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    # read by the v1 core, each with a degrade test
    send_template: bool = False
    list_templates: bool = False
    status_lookup: bool = False
    idempotent_send: bool = False
    correlation_echo: bool = False
    media_download: bool = False
    voice_notes: bool = False
    delivery_webhooks: bool = False
    # documented names only: no consumer in v1
    read_receipts: bool = False
    interactive_buttons: bool = False
    message_edit_delete: bool = False
    window_info: bool = False


@dataclass(frozen=True)
class InboundContext:
    url: str
    method: str
    headers: Mapping[str, str]
    raw_body: bytes


@dataclass(frozen=True)
class HandshakeResponse:
    status_code: int
    body: str


class ProviderError(Exception):
    """A typed provider failure. `error.kind` and `error.reason` are all the core branches on."""

    def __init__(self, error: SendError) -> None:
        super().__init__(f"{error.kind}/{error.reason}: {error.detail}")
        self.error = error


class UnknownOutcome(ProviderError):
    """Send may or may not have happened. Never resend; reconcile (docs/06 s2)."""

    def __init__(self, detail: str = "") -> None:
        super().__init__(SendError(kind=ErrorKind.UNKNOWN_SEND, detail=detail))


class Unsupported(Exception):
    """The call needs a capability this adapter does not declare."""

    def __init__(self, capability: str) -> None:
        super().__init__(f"capability not supported: {capability}")
        self.capability = capability


class MediaExpired(Exception):
    """Inbound media can no longer be fetched (docs/06 s3, media_expired)."""


class ParseError(Exception):
    """Body is not parseable at all (not JSON). Unknown valid payloads become `unsupported`."""


class WhatsAppProvider(Protocol):
    """One instance per number (config bound at construction)."""

    id_space: str

    def capabilities(self) -> Capabilities: ...

    # inbound (pure, sync)
    def handle_handshake(self, ctx: InboundContext) -> HandshakeResponse | None: ...
    def verify_inbound(self, ctx: InboundContext, secret: str) -> bool: ...
    def resolve_number(self, raw_body: bytes) -> list[str]: ...
    def parse_inbound(self, raw_body: bytes) -> list[InboundEvent]: ...

    # outbound (network, async)
    async def send(self, request: SendRequest) -> SendResult: ...
    async def lookup_status(self, provider_message_id: str) -> DeliveryStatus | None: ...
    async def list_templates(self) -> list[TemplateSpec]: ...
    async def fetch_media(self, ref: MediaRef, max_bytes: int) -> bytes: ...
