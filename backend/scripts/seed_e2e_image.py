"""
Seed jednego obrazu do E2E (CI): user ma co najmniej jeden obraz, żeby testy nie skipowały.

- Tworzy backend/uploads/ i zapisuje minimalny plik PNG (1×1 px).
- Wstawia wiersz do images: storage_path=uploads/e2e-seed.png, width_mm=10, created_by=1 (user).

Uruchomienie: python backend/scripts/seed_e2e_image.py (z katalogu projektu)
             DATABASE_URL=sqlite:///./backend/laserme.db
"""
from pathlib import Path
import sqlite3
import sys

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))


def get_db_path() -> str:
    import os

    url = os.environ.get("DATABASE_URL", "sqlite:///./laserme.db")
    path = url.replace("sqlite:///", "").strip()
    if not path or path.startswith("sqlite://"):
        path = str(BACKEND / "laserme.db")
    # Ścieżka względna (np. ./backend/laserme.db) – względem cwd; bezwzględna gdy z backend/
    if not Path(path).is_absolute():
        path = str(Path.cwd() / path)
    return path


def seed_e2e_image(db_path: str) -> None:
    upload_dir = BACKEND / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = "e2e-seed.png"
    storage_path = f"uploads/{filename}"
    file_path = upload_dir / filename

    # Minimalny PNG 10×10 (Pillow w requirements)
    try:
        from PIL import Image

        img = Image.new("RGB", (10, 10), color=(240, 240, 240))
        img.save(file_path, format="PNG")
    except ImportError:
        # Fallback: minimalny raw PNG (1x1 grey) – 68 bajtów
        raw_png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
            b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        file_path.write_bytes(raw_png)

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.execute("SELECT id FROM users WHERE login = ?", ("user",))
        row = cur.fetchone()
        if not row:
            print("Seed E2E: brak użytkownika 'user', pomijam seed obrazu.")
            return
        user_id = row[0]
        cur = conn.execute(
            "SELECT 1 FROM images WHERE storage_path = ?",
            (storage_path,),
        )
        if cur.fetchone():
            print("Seed E2E: obraz już istnieje, pomijam.")
            return
        conn.execute(
            "INSERT INTO images (storage_path, width_mm, created_by, created_at) VALUES (?, ?, ?, datetime('now'))",
            (storage_path, 10.0, user_id),
        )
        conn.commit()
        print("Seed E2E: dodano obraz uploads/e2e-seed.png dla user id", user_id)
    finally:
        conn.close()


if __name__ == "__main__":
    db_path = get_db_path()
    seed_e2e_image(db_path)
