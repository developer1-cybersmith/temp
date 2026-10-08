import pytest

from app.bootstrap.registry import provider_names
from tests.conformance.harness import Harness
from tests.conformance.harnesses import HARNESSES, VARIANTS

CASES = [(name, variant) for name in provider_names() for variant in VARIANTS.get(name, {})]


@pytest.fixture(params=CASES, ids=[f"{n}-{v}" for n, v in CASES])
def h(request: pytest.FixtureRequest) -> Harness:
    name, variant = request.param
    return HARNESSES[name](VARIANTS[name][variant])
