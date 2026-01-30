import os
import sqlite3
from collections.abc import Generator


def get_db_path() -> str:
    """Resolve SQLite DB path from DATABASE_URL or default file."""
    url = os.environ.get("DATABASE_URL", "sqlite:///./laserme.db")
    path = url.replace("sqlite:///", "").strip()
    if not path or path.startswith("sqlite://"):
        path = "./laserme.db"
    return path


def get_db() -> Generator[sqlite3.Connection, None, None]:
    """FastAPI dependency that yields a SQLite connection."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
