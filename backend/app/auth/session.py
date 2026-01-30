from __future__ import annotations

import base64
import hmac
import json
import logging
import os
import time
from dataclasses import dataclass
from hashlib import sha256
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AuthSessionSettings:
    secret_key: str
    cookie_name: str
    cookie_secure: bool
    cookie_samesite: str
    cookie_max_age_seconds: int


def load_session_settings() -> AuthSessionSettings:
    secret = os.environ.get("AUTH_SECRET_KEY", "").strip()
    cookie_name = os.environ.get("AUTH_COOKIE_NAME", "laserxe_session").strip()
    cookie_secure = _parse_bool(os.environ.get("AUTH_COOKIE_SECURE", "true"))
    cookie_samesite = os.environ.get("AUTH_COOKIE_SAMESITE", "lax").strip().lower()
    cookie_max_age_seconds = int(os.environ.get("AUTH_COOKIE_MAX_AGE_SECONDS", "3600"))
    if not cookie_samesite:
        cookie_samesite = "lax"
    if cookie_samesite not in {"lax", "strict", "none"}:
        logger.warning("Invalid AUTH_COOKIE_SAMESITE value: %s. Falling back to 'lax'.", cookie_samesite)
        cookie_samesite = "lax"
    return AuthSessionSettings(
        secret_key=secret,
        cookie_name=cookie_name,
        cookie_secure=cookie_secure,
        cookie_samesite=cookie_samesite,
        cookie_max_age_seconds=cookie_max_age_seconds,
    )


def create_session_token(
    *, user_id: int, login: str, secret_key: str, ttl_seconds: int
) -> str:
    if not secret_key:
        raise RuntimeError("AUTH_SECRET_KEY is required for session cookies")
    issued_at = int(time.time())
    payload = {
        "sub": user_id,
        "login": login,
        "iat": issued_at,
        "exp": issued_at + ttl_seconds,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)
    signature = _sign(payload_b64.encode("utf-8"), secret_key)
    return f"{payload_b64}.{signature}"


def verify_session_token(token: str, secret_key: str) -> dict[str, Any]:
    if not secret_key:
        raise RuntimeError("AUTH_SECRET_KEY is required for session cookies")
    try:
        payload_b64, signature = token.split(".", 1)
    except ValueError as exc:
        raise ValueError("Invalid token format") from exc

    expected = _sign(payload_b64.encode("utf-8"), secret_key)
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Invalid token signature")

    payload_json = _b64url_decode(payload_b64).decode("utf-8")
    payload = json.loads(payload_json)
    exp = int(payload.get("exp", 0))
    if exp <= int(time.time()):
        raise ValueError("Token expired")
    return payload


def _sign(message: bytes, secret_key: str) -> str:
    digest = hmac.new(secret_key.encode("utf-8"), message, sha256).digest()
    return _b64url_encode(digest)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}
