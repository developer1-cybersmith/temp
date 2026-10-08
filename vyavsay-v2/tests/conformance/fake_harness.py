from collections.abc import Mapping
from typing import Any

from app.adapters.fake import FakeProvider, FakeWebhookSender
from app.adapters.fake.webhooks import Delivery
from app.bootstrap.registry import create_provider
from app.ports.whatsapp_models import DeliveryState, SendError
from tests.conformance.harness import Payload


def _payload(d: Delivery) -> Payload:
    return Payload(body=d.body, headers=d.headers)


class FakeHarness:
    secret = "fake-secret"

    def __init__(self, config: Mapping[str, Any]) -> None:
        provider = create_provider("fake", config)
        assert isinstance(provider, FakeProvider)
        self.provider = provider
        self._fake = provider
        self.sender = FakeWebhookSender(self.secret)
        self.text_send_allowed = not provider.config.template_only

    @property
    def sent_count(self) -> int:
        return len(self._fake.sent)

    def inbound(self, kind: str, **kw: Any) -> Payload:
        build = {
            "text": self.sender.text,
            "voice": self.sender.voice,
            "image": self.sender.image,
            "reaction": self.sender.reaction,
        }[kind]
        return _payload(build(**kw))

    def status(
        self,
        provider_message_id: str,
        state: DeliveryState,
        idem_key: str | None = None,
        error: SendError | None = None,
    ) -> Payload:
        return _payload(
            self.sender.status(provider_message_id, state, idem_key=idem_key, error=error)
        )

    def unknown_payload(self) -> Payload:
        return _payload(self.sender.unknown())

    def tamper(self, payload: Payload) -> Payload:
        d = self.sender.tampered(Delivery(payload.body, dict(payload.headers)))
        return Payload(body=d.body, headers=d.headers)

    def without_signature(self, payload: Payload) -> Payload:
        return Payload(body=payload.body, headers={})

    def fail_next_send(self, error: SendError) -> None:
        self._fake.fail_next(error)

    def unknown_next_send(self, delivered: bool) -> None:
        self._fake.unknown_next(delivered)

    def advance(self, provider_message_id: str, state: DeliveryState) -> None:
        self._fake.advance(provider_message_id, state)

    def put_media(self, opaque_ref: str, data: bytes) -> None:
        self._fake.put_media(opaque_ref, data)

    def expire_media(self, opaque_ref: str) -> None:
        self._fake.expire_media(opaque_ref)
