"""
Uruchamia migracje SQLite w kolejności po nazwie pliku i seed domyślnego użytkownika.
Wymaga: DATABASE_URL lub plik ./laserme.db (ścieżka do pliku SQLite).
Tworzy tabelę schema_version jeśli nie istnieje.
"""
import os
import sqlite3
import sys
from pathlib import Path

# backend/scripts -> backend
BACKEND = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = BACKEND / "migrations"
sys.path.insert(0, str(BACKEND))


def get_db_path() -> str:
    url = os.environ.get("DATABASE_URL", "sqlite:///./laserme.db")
    path = url.replace("sqlite:///", "").strip()
    if not path or path.startswith("sqlite://"):
        path = "./laserme.db"
    return path


def run_migrations(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute("""
        create table if not exists schema_version (
            migration_name text primary key,
            applied_at text not null default (datetime('now'))
        )
    """)
    conn.commit()

    applied = {row[0] for row in conn.execute("select migration_name from schema_version").fetchall()}
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))

    for path in migrations:
        name = path.name
        if name in applied:
            continue
        sql = path.read_text(encoding="utf-8")
        conn.executescript(sql)
        conn.execute("insert into schema_version (migration_name) values (?)", (name,))
        conn.commit()
        print(f"Applied: {name}")

    conn.close()


def main() -> None:
    db_path = get_db_path()
    run_migrations(db_path)
    # Seed domyślnego użytkownika (user / 123)
    from scripts.seed_default_user import seed_default_user
    seed_default_user(db_path)
    print("Migrations and seed done.")


if __name__ == "__main__":
    main()
