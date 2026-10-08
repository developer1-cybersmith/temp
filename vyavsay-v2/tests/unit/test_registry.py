import ast
from pathlib import Path

import pytest

from app.bootstrap.registry import UnknownProvider, capabilities, create_provider, provider_names
from app.ports.whatsapp import Capabilities

APP = Path(__file__).resolve().parents[2] / "app"


def test_fake_is_registered() -> None:
    assert "fake" in provider_names()
    p = create_provider("fake", {})
    assert p.id_space == "fake"


def test_capabilities_by_name_and_config() -> None:
    assert capabilities("fake", {}).idempotent_send is True
    off = capabilities("fake", {"capabilities": {"idempotent_send": False}})
    assert isinstance(off, Capabilities) and off.idempotent_send is False


def test_unknown_provider_name() -> None:
    with pytest.raises(UnknownProvider):
        create_provider("nope", {})


def test_bad_config_is_rejected_at_creation() -> None:
    with pytest.raises(ValueError):
        create_provider("fake", {"surprise": 1})


def test_only_the_registry_imports_adapters() -> None:
    offenders = []
    for path in APP.rglob("*.py"):
        rel = path.relative_to(APP).as_posix()
        if rel.startswith("adapters/") or rel == "bootstrap/registry.py":
            continue
        for node in ast.walk(ast.parse(path.read_text())):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            if any(n == "app.adapters" or n.startswith("app.adapters.") for n in names):
                offenders.append(rel)
    assert offenders == []
