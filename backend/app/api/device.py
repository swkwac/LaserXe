"""Device control API (Pi ↔ Pico)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect, status

from app.schemas.device import (
    DeviceCommandResponseSchema,
    DeviceCommandSchema,
    DeviceConfigResponseSchema,
    DeviceConfigSchema,
    DevicePatternSchema,
    DevicePositionPresetSchema,
    DeviceStatusSchema,
)
from app.services.device_config import compute_device_config, load_device_config, save_device_config
from app.services.device_control import DeviceConfigError, DeviceConnectionError, device_manager, list_serial_ports
from app.services.device_presets import (
    load_patterns,
    load_presets,
    save_patterns,
    save_presets,
)

router = APIRouter()


def _ws_require_auth(websocket: WebSocket) -> bool:
    """Auth disabled for local use."""
    return True


def _require_auth(request: Request) -> None:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")


@router.get("/config", response_model=DeviceConfigResponseSchema)
def get_device_config(request: Request) -> DeviceConfigResponseSchema:
    _require_auth(request)
    return compute_device_config(load_device_config())


@router.put("/config", response_model=DeviceConfigResponseSchema)
def update_device_config(payload: DeviceConfigSchema, request: Request) -> DeviceConfigResponseSchema:
    _require_auth(request)
    saved = save_device_config(payload)
    return compute_device_config(saved)


@router.get("/status", response_model=DeviceStatusSchema)
def get_device_status(request: Request) -> DeviceStatusSchema:
    _require_auth(request)
    return device_manager.get_status(load_device_config())


@router.post("/command", response_model=DeviceCommandResponseSchema)
def send_device_command(payload: DeviceCommandSchema, request: Request) -> DeviceCommandResponseSchema:
    _require_auth(request)
    config = load_device_config()
    try:
        sent = device_manager.send_command(payload, config)
    except DeviceConfigError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except DeviceConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return DeviceCommandResponseSchema(ok=True, sent=sent)


@router.get("/presets")
def get_presets(request: Request) -> list[DevicePositionPresetSchema]:
    _require_auth(request)
    return load_presets()


@router.put("/presets")
def update_presets(
    payload: list[DevicePositionPresetSchema], request: Request
) -> list[DevicePositionPresetSchema]:
    _require_auth(request)
    return save_presets(payload)


@router.get("/patterns")
def get_patterns(request: Request) -> list[DevicePatternSchema]:
    _require_auth(request)
    return load_patterns()


@router.put("/patterns")
def update_patterns(
    payload: list[DevicePatternSchema], request: Request
) -> list[DevicePatternSchema]:
    _require_auth(request)
    return save_patterns(payload)


@router.get("/serial-ports")
def get_serial_ports(request: Request) -> list[dict]:
    _require_auth(request)
    return list_serial_ports()


@router.websocket("/stream")
async def device_stream(websocket: WebSocket) -> None:
    if not _ws_require_auth(websocket):
        await websocket.close(code=4008, reason="Authentication required")
        return
    await websocket.accept()
    try:
        while True:
            config = load_device_config()
            status_payload = device_manager.get_status(config).model_dump()
            await websocket.send_json(status_payload)
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        return
