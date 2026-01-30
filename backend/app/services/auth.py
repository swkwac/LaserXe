from __future__ import annotations

import sqlite3
from typing import Any

try:
    from passlib.hash import bcrypt
except ImportError:
    bcrypt = None

from app.auth.session import create_session_token, load_session_settings


def get_user_by_login(db: sqlite3.Connection, login: str) -> dict[str, Any] | None:
    """Fetch user by login from the users table."""
    row = db.execute(
        "select id, login, password_hash from users where login = ?",
        (login,),
    ).fetchone()
    if not row:
        return None
    return {"id": row["id"], "login": row["login"], "password_hash": row["password_hash"]}


def verify_password(password: str, password_hash: str) -> bool:
    """Verify password using bcrypt hash."""
    if not bcrypt:
        raise RuntimeError("passlib[bcrypt] is required for password verification")
    return bcrypt.verify(password, password_hash)


def create_session_or_token(user: dict[str, Any]) -> str:
    """Create a signed session token for cookie-based auth."""
    settings = load_session_settings()
    return create_session_token(
        user_id=user["id"],
        login=user["login"],
        secret_key=settings.secret_key,
        ttl_seconds=settings.cookie_max_age_seconds,
    )
