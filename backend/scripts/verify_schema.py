"""Weryfikacja schematu SQLite po migracjach (lista tabel, kolumn, indeksów)."""
import sqlite3
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
DB_PATH = BACKEND.parent / "laserme.db"
if not DB_PATH.exists():
    DB_PATH = BACKEND / "laserme.db"
if len(sys.argv) > 1:
    DB_PATH = Path(sys.argv[1])

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [r[0] for r in cur.fetchall()]
    print("Tabele:", tables)
    for t in tables:
        cur.execute(f"PRAGMA table_info({t})")
        cols = cur.fetchall()
        print(f"\n--- {t} ---")
        for c in cols:
            nn = " NOT NULL" if c[3] else ""
            pk = " PK" if c[5] else ""
            print(f"   {c[1]} {c[2]}{nn}{pk}")
    cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    idxs = [r[0] for r in cur.fetchall()]
    print("\nIndeksy:", idxs)
    cur.execute("SELECT migration_name, applied_at FROM schema_version ORDER BY applied_at")
    print("\nschema_version (zastosowane migracje):")
    for r in cur.fetchall():
        print(" ", r[0], "|", r[1])
    conn.close()
    print("\nSchemat zweryfikowany.")

if __name__ == "__main__":
    main()
