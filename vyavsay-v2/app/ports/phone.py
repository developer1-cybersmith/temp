"""Phone normaliser and contact_key (docs/06 s1). Core-owned; adapters never build keys."""

import re

_ADDRESS_PREFIX = re.compile(r"^[a-z]+:", re.IGNORECASE)
_ADDRESS_SUFFIX = re.compile(r"@.*$")
_NON_DIGITS = re.compile(r"[\s\-().]")
_IN_MOBILE = re.compile(r"^[6-9]\d{9}$")
_E164 = re.compile(r"^[1-9]\d{7,14}$")


def normalise(raw: str | None, default_region: str = "IN") -> str | None:
    """Return `+E164`, or None when the input is missing or not a usable number."""
    if default_region != "IN":
        raise ValueError(f"unsupported default_region: {default_region}")
    if raw is None:
        return None
    text = _ADDRESS_SUFFIX.sub("", _ADDRESS_PREFIX.sub("", raw.strip()))
    text = _NON_DIGITS.sub("", text)
    explicit = text.startswith("+")
    digits = text.lstrip("+")
    if not digits.isdigit():
        return None
    if not explicit and digits.startswith("00"):
        explicit, digits = True, digits[2:]
    if explicit:
        return f"+{digits}" if _E164.match(digits) else None
    if digits.startswith("0"):
        digits = digits[1:]
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    return f"+91{digits}" if _IN_MOBILE.match(digits) else None


def contact_key(phone_raw: str | None, id_space: str, sender_ref: str) -> str:
    """`tel:+E164` when a usable phone exists, else `ref:<id_space>:<sender_ref>`."""
    phone = normalise(phone_raw)
    if phone is not None:
        return f"tel:{phone}"
    return f"ref:{id_space}:{sender_ref}"
