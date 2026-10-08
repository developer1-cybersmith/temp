"""The only place that imports adapters (import-linter forbids core, ports, agent, api from it)."""

from collections.abc import Callable, Mapping
from typing import Any

from app.adapters.fake import FakeProvider
from app.ports.whatsapp import Capabilities, WhatsAppProvider

_ADAPTERS: Mapping[str, Callable[[Mapping[str, Any]], WhatsAppProvider]] = {
    "fake": lambda config: FakeProvider.from_config(dict(config)),
}


class UnknownProvider(KeyError):
    pass


def provider_names() -> list[str]:
    return sorted(_ADAPTERS)


def create_provider(name: str, config: Mapping[str, Any]) -> WhatsAppProvider:
    try:
        factory = _ADAPTERS[name]
    except KeyError:
        raise UnknownProvider(name) from None
    return factory(config)


def capabilities(name: str, config: Mapping[str, Any]) -> Capabilities:
    return create_provider(name, config).capabilities()
