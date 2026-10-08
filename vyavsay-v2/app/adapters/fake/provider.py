"""In-repo fake WhatsApp provider (docs/02 s4). Modes come from config; failures are scripted."""

import hashlib
import hmac
import json
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, ValidationError

from app.adapters.fake.webhooks import SIGNATURE_HEADER, sign
from app.ports.whatsapp import (
    Capabilities,
    HandshakeResponse,
    InboundContext,
    MediaExpired,
    ParseError,
    ProviderError,
    UnknownOutcome,
    Unsupported,
)
from app.ports.whatsapp_models import (
    DeliveryState,
    DeliveryStatus,
    ErrorKind,
    ErrorReason,
    EventKind,
    InboundEvent,
    MediaRef,
    SendError,
    SendKind,
    SendRequest,
    SendResult,
    TemplateCategory,
    TemplatePurpose,
    TemplateSpec,
    TemplateStatus,
)

_FULL = Capabilities(
    send_template=True,
    list_templates=True,
    status_lookup=True,
    idempotent_send=True,
    correlation_echo=True,
    media_download=True,
    voice_notes=True,
    delivery_webhooks=True,
)


class FakeConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id_space: str = "fake"
    capabilities: Capabilities = _FULL
    template_only: bool = False  # window closed for every recipient: text and media are refused


@dataclass
class SentMessage:
    request: SendRequest
    provider_message_id: str
    state: DeliveryState = DeliveryState.SENT
    error: SendError | None = None


class FakeProvider:
    def __init__(
        self,
        config: FakeConfig | None = None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.config = config or FakeConfig()
        self.id_space = self.config.id_space
        self._clock = clock
        self.sent: list[SentMessage] = []
        self._by_idem: dict[str, SentMessage] = {}
        self._script: deque[tuple[str, Any]] = deque()
        self._media: dict[str, bytes] = {}
        self._expired: set[str] = set()
        self.templates: list[TemplateSpec] = [
            TemplateSpec(
                purpose=p,
                language="en",
                variable_count=1,
                status=TemplateStatus.APPROVED,
                category=TemplateCategory.UTILITY,
                external_ref=f"tpl-{p.value}",
            )
            for p in (TemplatePurpose.FOLLOWUP_NUDGE, TemplatePurpose.OWNER_ALERT)
        ]

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> "FakeProvider":
        try:
            return cls(FakeConfig.model_validate(config))
        except ValidationError as e:
            raise ValueError(f"invalid fake provider config: {e}") from e

    def capabilities(self) -> Capabilities:
        return self.config.capabilities

    # scripting (test side) ----------------------------------------------------------------------

    def fail_next(self, error: SendError) -> None:
        self._script.append(("fail", error))

    def unknown_next(self, delivered: bool) -> None:
        """Next send ends in UnknownOutcome; `delivered` says whether the message really went."""
        self._script.append(("unknown", delivered))

    def advance(self, provider_message_id: str, state: DeliveryState) -> None:
        for m in self.sent:
            if m.provider_message_id == provider_message_id:
                m.state = state

    def put_media(self, opaque_ref: str, data: bytes) -> None:
        self._media[opaque_ref] = data
        self._expired.discard(opaque_ref)

    def expire_media(self, opaque_ref: str) -> None:
        self._expired.add(opaque_ref)

    # inbound ------------------------------------------------------------------------------------

    def handle_handshake(self, ctx: InboundContext) -> HandshakeResponse | None:
        return None  # per-number key: no handshake

    def verify_inbound(self, ctx: InboundContext, secret: str) -> bool:
        got = {k.lower(): v for k, v in ctx.headers.items()}.get(SIGNATURE_HEADER)
        return got is not None and hmac.compare_digest(got, sign(secret, ctx.raw_body))

    def _load(self, raw_body: bytes) -> Any:
        try:
            return json.loads(raw_body)
        except ValueError as e:
            raise ParseError("body is not JSON") from e

    def resolve_number(self, raw_body: bytes) -> list[str]:
        p = self._load(raw_body)
        if isinstance(p, dict) and isinstance(p.get("number"), str):
            return [p["number"]]
        return []

    def parse_inbound(self, raw_body: bytes) -> list[InboundEvent]:
        p = self._load(raw_body)
        try:
            return [self._event(p)]
        except (KeyError, TypeError, ValueError, AttributeError):
            return [self._unsupported(p, raw_body)]

    def _unsupported(self, p: Any, raw_body: bytes) -> InboundEvent:
        d = p if isinstance(p, dict) else {"value": p}
        mid = d.get("id")
        number = d.get("number")
        return InboundEvent(
            kind=EventKind.UNSUPPORTED,
            provider_message_id=(
                mid if isinstance(mid, str) else hashlib.sha256(raw_body).hexdigest()
            ),
            id_space=self.id_space,
            number_ref=number if isinstance(number, str) else "unknown",
            sender_ref="unknown",
            ts=self._clock(),
            raw=d,
        )

    def _event(self, p: dict[str, Any]) -> InboundEvent:
        caps = self.capabilities()
        kind_name = p["type"]
        sender = p["from"]
        base: dict[str, Any] = {
            "provider_message_id": p["id"],
            "id_space": self.id_space,
            "number_ref": p["number"],
            "sender_ref": sender["ref"],
            "sender_phone_raw": sender.get("phone"),
            "ts": datetime.fromisoformat(p["ts"]),
            "raw": p,
        }
        id_keys = ("provider_message_id", "number_ref", "sender_ref")
        if not all(isinstance(base[k], str) for k in id_keys):
            raise TypeError("bad ids")
        if kind_name == "text":
            return InboundEvent(kind=EventKind.TEXT, text=p["text"], **base)
        if kind_name == "reaction":
            return InboundEvent(
                kind=EventKind.REACTION, text=p.get("text"), reply_to=p.get("reply_to"), **base
            )
        if kind_name in ("voice", "image"):
            usable = caps.media_download and (kind_name == "image" or caps.voice_notes)
            if not usable:
                return InboundEvent(kind=EventKind.UNSUPPORTED, **base)
            m = p["media"]
            media = MediaRef(mime=m["mime"], size=m.get("size"), opaque_ref=m["ref"])
            return InboundEvent(kind=EventKind(kind_name), media=media, **base)
        if kind_name == "status" and caps.delivery_webhooks:
            s = p["status"]
            error = SendError.model_validate(s["error"]) if s.get("error") else None
            status = DeliveryStatus(
                provider_message_id=s["message_id"],
                state=DeliveryState(s["state"]),
                error=error,
                correlation=s.get("idem_key") if caps.correlation_echo else None,
                ts=base["ts"],
            )
            return InboundEvent(kind=EventKind.STATUS, status=status, **base)
        return InboundEvent(kind=EventKind.UNSUPPORTED, **base)

    # outbound -----------------------------------------------------------------------------------

    async def send(self, request: SendRequest) -> SendResult:
        caps = self.capabilities()
        if request.kind is SendKind.TEMPLATE and not caps.send_template:
            raise Unsupported("send_template")
        step = self._script.popleft() if self._script else None
        if step is not None and step[0] == "fail":
            raise ProviderError(step[1])
        if request.kind is not SendKind.TEMPLATE and self.config.template_only:
            raise ProviderError(SendError(kind=ErrorKind.WINDOW_CLOSED, detail="window closed"))
        if caps.idempotent_send and request.idem_key in self._by_idem:
            msg = self._by_idem[request.idem_key]
        elif step is not None and step[0] == "unknown" and not step[1]:
            raise UnknownOutcome("timeout, not delivered")
        else:
            msg = SentMessage(request, f"fake-{len(self.sent) + 1}")
            self.sent.append(msg)
            self._by_idem[request.idem_key] = msg
        if step is not None and step[0] == "unknown":
            raise UnknownOutcome("timeout")
        return SendResult(provider_message_id=msg.provider_message_id, accepted=True)

    async def lookup_status(self, provider_message_id: str) -> DeliveryStatus | None:
        caps = self.capabilities()
        if not caps.status_lookup:
            raise Unsupported("status_lookup")
        for m in self.sent:
            if m.provider_message_id == provider_message_id:
                return DeliveryStatus(
                    provider_message_id=provider_message_id,
                    state=m.state,
                    error=m.error,
                    correlation=m.request.idem_key if caps.correlation_echo else None,
                    ts=self._clock(),
                )
        return None

    async def list_templates(self) -> list[TemplateSpec]:
        if not self.capabilities().list_templates:
            raise Unsupported("list_templates")
        return list(self.templates)

    async def fetch_media(self, ref: MediaRef, max_bytes: int) -> bytes:
        if not self.capabilities().media_download:
            raise Unsupported("media_download")
        key = ref.opaque_ref or ""
        if key in self._expired or key not in self._media:
            raise MediaExpired(key)
        data = self._media[key]
        if len(data) > max_bytes:
            raise ProviderError(
                SendError(
                    kind=ErrorKind.PERMANENT, reason=ErrorReason.CONTENT_REJECTED, detail="too big"
                )
            )
        return data

