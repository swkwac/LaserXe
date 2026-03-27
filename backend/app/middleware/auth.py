import sqlite3
from os import environ
from pathlib import Path

from fastapi import Request

from app.db.connection import get_db_path


def _resolve_local_user() -> dict[str, int | str]:
    """Pick a stable local user without login.

    Priority:
    1) AUTH_BYPASS_USER_LOGIN (if existing in DB)
    2) Most recently created image owner (so images page is not blank)
    3) First user by id
    4) Fallback id=1
    """
    preferred_login = environ.get("AUTH_BYPASS_USER_LOGIN", "").strip()
    configured = Path(get_db_path())
    candidates = [configured]
    # Fallback when process cwd differs (common with uvicorn reload on Windows)
    candidates.append(Path(__file__).resolve().parents[2] / "laserme.db")
    seen: set[str] = set()
    for db_path in candidates:
        key = str(db_path.resolve()) if db_path.exists() else str(db_path)
        if key in seen:
            continue
        seen.add(key)
        if not db_path.exists():
            continue
        conn = sqlite3.connect(str(db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            if preferred_login:
                row = conn.execute(
                    "SELECT id, login FROM users WHERE login = ? LIMIT 1",
                    (preferred_login,),
                ).fetchone()
                if row:
                    return {"id": int(row["id"]), "login": str(row["login"])}
            row = conn.execute(
                "SELECT u.id, u.login FROM users u "
                "INNER JOIN images i ON i.created_by = u.id "
                "ORDER BY i.created_at DESC LIMIT 1"
            ).fetchone()
            if row:
                return {"id": int(row["id"]), "login": str(row["login"])}
            row = conn.execute("SELECT id, login FROM users ORDER BY id ASC LIMIT 1").fetchone()
            if row:
                return {"id": int(row["id"]), "login": str(row["login"])}
        except Exception:
            # Try next candidate DB path.
            continue
        finally:
            conn.close()
    return {"id": 1, "login": "local"}


async def auth_middleware(request: Request, call_next):
    # Auth disabled: inject a default user for all API requests.
    # This keeps existing route-level checks working without requiring login.
    request.state.user = _resolve_local_user()
    return await call_next(request)
