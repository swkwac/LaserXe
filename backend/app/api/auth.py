import logging
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.db.connection import get_db
from app.schemas.auth import (
    AuthLoginCommandSchema,
    AuthLoginResponseSchema,
    AuthUserSchema,
)
from app.auth.session import load_session_settings
from app.services.auth import create_session_or_token, get_user_by_login, verify_password

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/login",
    response_model=AuthLoginResponseSchema,
    status_code=status.HTTP_200_OK,
)
def login(
    payload: AuthLoginCommandSchema,
    response: Response,
    db: sqlite3.Connection = Depends(get_db),
) -> AuthLoginResponseSchema:
    """
    Authenticate user by login/password.
    Returns user data and optionally token when configured.
    """
    try:
        user = get_user_by_login(db, payload.login)
    except Exception:
        logger.exception("Login failed while querying database.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid login or password",
        )

    try:
        valid = verify_password(payload.password, user["password_hash"])
    except Exception:
        logger.exception("Login failed while verifying password.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )

    if not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid login or password",
        )

    auth_user = AuthUserSchema(id=user["id"], login=user["login"])
    try:
        token = create_session_or_token({"id": user["id"], "login": user["login"]})
        settings = load_session_settings()
        response.set_cookie(
            key=settings.cookie_name,
            value=token,
            httponly=True,
            secure=settings.cookie_secure,
            samesite=settings.cookie_samesite,
            max_age=settings.cookie_max_age_seconds,
            path="/",
        )
    except Exception:
        logger.exception("Login failed while creating session cookie.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )

    return {"user": auth_user}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    """Clear the auth session cookie. Requires valid session (no body on success)."""
    settings = load_session_settings()
    response.delete_cookie(
        key=settings.cookie_name,
        path="/",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", status_code=status.HTTP_200_OK)
def me(request: Request) -> dict[str, AuthUserSchema]:
    """Return the authenticated user from session state."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return {"user": AuthUserSchema(id=user["id"], login=user["login"])}
