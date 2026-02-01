"""
Punkt wejścia API – laserme 2.0a (LaserXe).
Uruchomienie: uvicorn main:app --reload --port 8000
"""
from pathlib import Path

from dotenv import load_dotenv

# Ładuj .env z backend/, katalogu głównego lub cwd — żeby AUTH_SECRET_KEY itd. były ustawione
_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.audit_log import router as audit_log_router
from app.api.images import router as images_router
from app.api.iteration_by_id import router as iteration_by_id_router
from app.api.iterations import router as iterations_router
from app.api.masks import router as masks_router
from app.middleware.auth import auth_middleware

app = FastAPI(
    title="LaserXe API",
    description="Backend API: generacja siatki spotów, sekwencja emisji, walidacja, logowanie.",
    version="0.1.0",
)

# CORS: frontend (e.g. Astro on :4321) calls this API on :8000 — browser blocks without Allow-Origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:4321", "http://127.0.0.1:4321"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(auth_middleware)
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(images_router, prefix="/api/images", tags=["images"])
app.include_router(masks_router, prefix="/api/images", tags=["masks"])
app.include_router(iterations_router, prefix="/api/images", tags=["iterations"])
app.include_router(iteration_by_id_router, prefix="/api/iterations", tags=["iterations"])
app.include_router(audit_log_router, prefix="/api", tags=["audit-log"])


@app.get("/health")
def health():
    """Endpoint do sprawdzenia dostępności API (CI/CD, Docker)."""
    return {"status": "ok"}
