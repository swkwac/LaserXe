"""Merge device config from raw JSON HTTP bodies (used by main.py and device routes).

Kept separate from ``app.api.device`` so ``main.py`` can register ``/api/laserxe/device-config`` without
importing the device router module (avoids stale ``.pyc`` / wrong import order registering bad handlers).
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request, status
from pydantic import ValidationError

from app.schemas.device import DeviceConfigResponseSchema
from app.services.device_config import (
    apply_device_config_patch,
    compute_device_config,
    load_device_config,
    save_device_config,
)


def require_request_user(request: Request) -> None:
    if not getattr(request.state, "user", None):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")


async def save_device_config_from_http_request(request: Request) -> DeviceConfigResponseSchema:
    require_request_user(request)
    try:
        body_any = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "device_config_validation",
                "title": "Invalid JSON body",
                "summary": "Device config save must send a JSON object. Parse error: "
                + str(exc).replace("\n", " ")[:200],
            },
        ) from exc
    if not isinstance(body_any, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "device_config_validation",
                "title": "Invalid config shape",
                "summary": 'JSON root must be an object (e.g. {"serial": {...}, "linear": {...}, ...}).',
            },
        )
    body: dict[str, Any] = body_any
    try:
        merged = apply_device_config_patch(load_device_config(), body)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "device_config_validation",
                "title": "Saved configuration failed schema checks",
                "summary": "The merged JSON did not match DeviceConfigSchema.",
                "pydantic_errors": exc.errors(),
            },
        ) from exc
    saved = save_device_config(merged)
    return compute_device_config(saved)
