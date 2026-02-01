"""
Seed domyślnych użytkowników MVP.
- user / 123 – jeśli baza jest pusta.
- sylwek / wacnik – jeśli brak użytkownika sylwek (pełny dostęp).
Uruchamiane po migracjach przez run_migrations.py.
"""
from pathlib import Path
import sqlite3
import sys

# backend/scripts -> backend
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
try:
    from passlib.hash import bcrypt
except ImportError:
    bcrypt = None


def seed_default_user(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        if not bcrypt:
            raise RuntimeError("passlib[bcrypt] required for seed. Install: pip install 'passlib[bcrypt]'")

        cur = conn.execute("select count(*) from users")
        if cur.fetchone()[0] == 0:
            password_hash = bcrypt.using(rounds=12).hash("123")
            conn.execute(
                "insert into users (login, password_hash, created_at) values (?, ?, datetime('now'))",
                ("user", password_hash),
            )

        cur = conn.execute("select 1 from users where login = ?", ("sylwek",))
        if cur.fetchone() is None:
            password_hash = bcrypt.using(rounds=12).hash("wacnik")
            conn.execute(
                "insert into users (login, password_hash, created_at) values (?, ?, datetime('now'))",
                ("sylwek", password_hash),
            )

        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    import os
    db = os.environ.get("DATABASE_URL", "sqlite:///./laserme.db").replace("sqlite:///", "")
    if not db or db.startswith("sqlite://"):
        db = "./laserme.db"
    seed_default_user(db)
