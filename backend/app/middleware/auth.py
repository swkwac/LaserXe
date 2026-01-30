import logging

from fastapi import Request
from starlette.responses import JSONResponse

from app.auth.session import load_session_settings, verify_session_token

logger = logging.getLogger(__name__)

PUBLIC_PATHS = {"/api/auth/login", "/api/auth/logout"}


async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api") or path in PUBLIC_PATHS:
        return await call_next(request)

    settings = load_session_settings()
    token = request.cookies.get(settings.cookie_name)
    if not token:
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
        )

    try:
        payload = verify_session_token(token, settings.secret_key)
    except ValueError:
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid or expired session"},
        )
    except Exception:
        logger.exception("Failed to verify session token.")
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    request.state.user = {"id": payload.get("sub"), "login": payload.get("login")}
    return await call_next(request)
