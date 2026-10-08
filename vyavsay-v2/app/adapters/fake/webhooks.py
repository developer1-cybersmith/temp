"""Scripted webhook sender for the fake: signed deliveries plus duplicate/delay/reorder helpers."""

import hashlib
import hmac
import json
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from typing import Any

from app.ports.whatsapp_models import DeliveryState, SendError

SIGNATURE_HEADER = "x-fake-signature"
DEFAULT_TS = datetime(2026, 10, 8, 10, 0, tzinfo=UTC)


def sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@dataclass(frozen=True)
class Delivery:
    body: bytes
    headers: dict[str, str] = field(default_factory=dict)
    delay_s: float = 0.0  # how long after the previous one it arrives; the test decides what to do


def with_duplicates(deliveries: Sequence[Delivery], at: Iterable[int]) -> list[Delivery]:
    """Repeat the deliveries at these indexes right after themselves."""
    dup = set(at)
    out: list[Delivery] = []
    for i, d in enumerate(deliveries):
        out.append(d)
        if i in dup:
            out.append(d)
    return out


def out_of_order(deliveries: Sequence[Delivery], order: Sequence[int]) -> list[Delivery]:
    return [deliveries[i] for i in order]


def delayed(delivery: Delivery, seconds: float) -> Delivery:
    return replace(delivery, delay_s=seconds)


class FakeWebhookSender:
    def __init__(self, secret: str, number_ref: str = "num1") -> None:
        self.secret = secret
        self.number_ref = number_ref
        self._n = 0

    def _next_id(self) -> str:
        self._n += 1
        return f"in-{self._n}"

    def _delivery(self, payload: dict[str, Any]) -> Delivery:
        body = json.dumps(payload).encode()
        return Delivery(body=body, headers={SIGNATURE_HEADER: sign(self.secret, body)})

    def _base(
        self,
        kind: str,
        sender_ref: str,
        phone: str | None,
        message_id: str | None,
        ts: datetime | None,
    ) -> dict[str, Any]:
        return {
            "type": kind,
            "id": message_id or self._next_id(),
            "number": self.number_ref,
            "from": {"ref": sender_ref, "phone": phone},
            "ts": (ts or DEFAULT_TS).isoformat(),
        }

    def text(
        self,
        text: str = "hello",
        *,
        sender_ref: str = "s1",
        phone: str | None = "919876543210",
        message_id: str | None = None,
        ts: datetime | None = None,
    ) -> Delivery:
        p = self._base("text", sender_ref, phone, message_id, ts)
        p["text"] = text
        return self._delivery(p)

    def _media(
        self,
        kind: str,
        mime: str,
        sender_ref: str,
        phone: str | None,
        message_id: str | None,
        ts: datetime | None,
        media_ref: str | None,
    ) -> Delivery:
        p = self._base(kind, sender_ref, phone, message_id, ts)
        p["media"] = {"mime": mime, "size": 1234, "ref": media_ref or f"media-{p['id']}"}
        return self._delivery(p)

    def voice(
        self,
        *,
        sender_ref: str = "s1",
        phone: str | None = "919876543210",
        message_id: str | None = None,
        ts: datetime | None = None,
        media_ref: str | None = None,
    ) -> Delivery:
        return self._media("voice", "audio/ogg", sender_ref, phone, message_id, ts, media_ref)

    def image(
        self,
        *,
        sender_ref: str = "s1",
        phone: str | None = "919876543210",
        message_id: str | None = None,
        ts: datetime | None = None,
        media_ref: str | None = None,
    ) -> Delivery:
        return self._media("image", "image/jpeg", sender_ref, phone, message_id, ts, media_ref)

    def reaction(
        self,
        emoji: str = "👍",
        reply_to: str = "m0",
        *,
        sender_ref: str = "s1",
        phone: str | None = "919876543210",
        message_id: str | None = None,
        ts: datetime | None = None,
    ) -> Delivery:
        p = self._base("reaction", sender_ref, phone, message_id, ts)
        p.update(text=emoji, reply_to=reply_to)
        return self._delivery(p)

    def status(
        self,
        provider_message_id: str,
        state: DeliveryState,
        *,
        idem_key: str | None = None,
        error: SendError | None = None,
        message_id: str | None = None,
        ts: datetime | None = None,
    ) -> Delivery:
        p = self._base("status", "provider", None, message_id, ts)
        p["status"] = {
            "message_id": provider_message_id,
            "state": state.value,
            "idem_key": idem_key,
            "error": error.model_dump(mode="json") if error else None,
        }
        return self._delivery(p)

    def unknown(self, kind: str = "sticker") -> Delivery:
        return self._delivery(self._base(kind, "s1", "919876543210", None, None))

    def tampered(self, delivery: Delivery) -> Delivery:
        return replace(delivery, body=delivery.body.replace(b"hello", b"HELLO") + b" ")

    def unsigned(self, delivery: Delivery) -> Delivery:
        return replace(delivery, headers={})
