"""What the provider-agnostic suite needs from each provider's test side."""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from app.ports.whatsapp import InboundContext, WhatsAppProvider
from app.ports.whatsapp_models import DeliveryState, SendError


@dataclass(frozen=True)
class Payload:
    """One inbound HTTP delivery as the provider would send it."""

    body: bytes
    headers: Mapping[str, str]
    url: str = "https://example.test/webhooks/whatsapp/p/key"
    method: str = "POST"

    def ctx(self) -> InboundContext:
        return InboundContext(
            url=self.url, method=self.method, headers=dict(self.headers), raw_body=self.body
        )


class Harness(Protocol):
    provider: WhatsAppProvider
    secret: str
    text_send_allowed: bool  # False when the provider only accepts templates (window closed)
    sent_count: int  # distinct provider messages created so far

    def inbound(self, kind: str, **kw: Any) -> Payload: ...
    def status(
        self,
        provider_message_id: str,
        state: DeliveryState,
        idem_key: str | None = None,
        error: SendError | None = None,
    ) -> Payload: ...
    def unknown_payload(self) -> Payload: ...
    def tamper(self, payload: Payload) -> Payload: ...
    def without_signature(self, payload: Payload) -> Payload: ...
    def fail_next_send(self, error: SendError) -> None: ...
    def unknown_next_send(self, delivered: bool) -> None: ...
    def advance(self, provider_message_id: str, state: DeliveryState) -> None: ...
    def put_media(self, opaque_ref: str, data: bytes) -> None: ...
    def expire_media(self, opaque_ref: str) -> None: ...
