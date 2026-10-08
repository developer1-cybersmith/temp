"""Harness per registry name, with the config variants to run (one per capability profile)."""

from collections.abc import Callable, Mapping
from typing import Any

from app.ports.whatsapp import Capabilities
from tests.conformance.fake_harness import FakeHarness
from tests.conformance.harness import Harness

V1_FLAGS = [
    "send_template",
    "list_templates",
    "status_lookup",
    "idempotent_send",
    "correlation_echo",
    "media_download",
    "voice_notes",
    "delivery_webhooks",
]


def _fake_variants() -> dict[str, dict[str, Any]]:
    variants: dict[str, dict[str, Any]] = {"full": {}}
    for flag in V1_FLAGS:
        variants[f"off-{flag}"] = {"capabilities": {flag: False}}
    variants["template-only"] = {"template_only": True}
    variants["minimal"] = {"capabilities": dict.fromkeys(Capabilities.model_fields, False)}
    return variants


HARNESSES: Mapping[str, Callable[[Mapping[str, Any]], Harness]] = {"fake": FakeHarness}
VARIANTS: Mapping[str, Mapping[str, dict[str, Any]]] = {"fake": _fake_variants()}
