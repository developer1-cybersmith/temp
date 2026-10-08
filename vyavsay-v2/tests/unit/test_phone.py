import pytest

from app.ports.phone import contact_key, normalise


@pytest.mark.parametrize(
    "raw",
    [
        "919876543210",
        "+919876543210",
        "+91 98765 43210",
        "09876543210",
        "9876543210",
        "whatsapp:+919876543210",
        "919876543210@c.us",
        "919876543210@s.whatsapp.net",
        "0091 98765 43210",
        "(+91) 98765-43210",
        "  +91-9876543210  ",
    ],
)
def test_indian_formats_normalise(raw: str) -> None:
    assert normalise(raw) == "+919876543210"


@pytest.mark.parametrize(
    "raw", [None, "", "   ", "abc", "12345", "5551234567", "915555555555", "+0123456"]
)
def test_bad_or_missing_phone_gives_none(raw: str | None) -> None:
    assert normalise(raw) is None


def test_other_country_needs_plus() -> None:
    assert normalise("+1 415 555 2671") == "+14155552671"


def test_unsupported_region_is_an_error() -> None:
    with pytest.raises(ValueError):
        normalise("9876543210", default_region="US")


def test_contact_key_from_phone_formats_all_equal() -> None:
    keys = {
        contact_key(raw, id_space="fake", sender_ref="r1")
        for raw in ["919876543210", "+919876543210", "09876543210"]
    }
    assert keys == {"tel:+919876543210"}


def test_contact_key_without_phone_uses_id_space_and_ref() -> None:
    assert contact_key(None, id_space="fake", sender_ref="user_abc") == "ref:fake:user_abc"


def test_contact_key_with_unusable_phone_falls_back_to_ref() -> None:
    assert contact_key("garbage", id_space="fake", sender_ref="r9") == "ref:fake:r9"
