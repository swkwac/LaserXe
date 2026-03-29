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

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.audit_log import router as audit_log_router
from app.api.grid_generator import router as grid_generator_router
from app.api.images import router as images_router
from app.api.iteration_by_id import router as iteration_by_id_router
from app.api.iterations import router as iterations_router
from app.api.masks import router as masks_router
from app.api.device import router as device_router
from app.middleware.auth import auth_middleware
from app.schemas.device import DeviceConfigResponseSchema
from app.services.device_config_http import save_device_config_from_http_request

app = FastAPI(
    title="LaserXe API",
    description="Backend API: generacja siatki spotów, sekwencja emisji, walidacja, logowanie.",
    version="0.1.0",
)

# CORS: frontend (e.g. Astro on :3000) calls this API on another port — browser blocks without Allow-Origin.
# Astro `server.host: true` + LAN URL, IPv6 ::1, or non-default ports must match allow_origins / regex.
# With credentials: "include", the reflected Allow-Origin must match the page origin exactly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://[::1]:3001",
        "http://localhost:4321",
        "http://127.0.0.1:4321",
        "http://[::1]:4321",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=(
        r"^https?://("
        r"localhost|127\.0\.0\.1|\[::1\]"
        r"|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r"|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
        r"):\d+$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(auth_middleware)

# Device config save — register *before* API routers so nothing shadows these paths.
@app.api_route(
    "/api/device/config-merge",
    methods=["PUT", "POST"],
    response_model=DeviceConfigResponseSchema,
    tags=["device"],
)
async def device_config_merge(request: Request) -> DeviceConfigResponseSchema:
    """Merge JSON into device_config.json (raw body). Primary URL for the web UI save."""

    return await save_device_config_from_http_request(request)


@app.put("/api/laserxe/device-config", response_model=DeviceConfigResponseSchema, tags=["device"])
async def laserxe_put_device_config(request: Request) -> DeviceConfigResponseSchema:
    """Alternate save URL (same handler as /api/device/config-merge)."""

    return await save_device_config_from_http_request(request)


@app.post("/api/laserxe/device-config", response_model=DeviceConfigResponseSchema, tags=["device"])
async def laserxe_post_device_config(request: Request) -> DeviceConfigResponseSchema:
    """POST variant of /api/laserxe/device-config."""

    return await save_device_config_from_http_request(request)


app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(images_router, prefix="/api/images", tags=["images"])
app.include_router(masks_router, prefix="/api/images", tags=["masks"])
app.include_router(iterations_router, prefix="/api/images", tags=["iterations"])
app.include_router(iteration_by_id_router, prefix="/api/iterations", tags=["iterations"])
app.include_router(audit_log_router, prefix="/api", tags=["audit-log"])
app.include_router(grid_generator_router, prefix="/api/grid-generator", tags=["grid-generator"])
app.include_router(device_router, prefix="/api/device", tags=["device"])


@app.get("/health")
def health():
    """Endpoint do sprawdzenia dostępności API (CI/CD, Docker).

    ``laserxe_device_config_merge`` is True only for this repo's main.py — use to verify port 8000 is this app.
    """
    return {"status": "ok", "laserxe_device_config_merge": True}
