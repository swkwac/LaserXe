"""
Punkt wejścia API – laserme 2.0a (LaserXe).
Uruchomienie: uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.middleware.auth import auth_middleware

app = FastAPI(
    title="LaserXe API",
    description="Backend API: generacja siatki spotów, sekwencja emisji, walidacja, logowanie.",
    version="0.1.0",
)

app.middleware("http")(auth_middleware)
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])


@app.get("/health")
def health():
    """Endpoint do sprawdzenia dostępności API (CI/CD, Docker)."""
    return {"status": "ok"}
