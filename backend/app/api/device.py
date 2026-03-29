"""Device control API (Pi ↔ Pico)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel
from app.schemas.device import (
    DeviceCommandResponseSchema,
    DeviceCommandSchema,
    DeviceConfigResponseSchema,
    DevicePatternSchema,
    DevicePositionPresetSchema,
    DeviceStatusSchema,
)
from app.services.device_config import compute_device_config, load_device_config
from app.services.device_config_http import save_device_config_from_http_request
from app.services.device_control import DeviceConfigError, DeviceConnectionError, device_manager, list_serial_ports
from app.services.device_error_detail import connection_error_http_detail, legacy_config_error_detail
from app.services.device_presets import (
    load_patterns,
    load_presets,
    save_patterns,
    save_presets,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class XdaJogOpenLoopPayload(BaseModel):
    enabled: bool


class XdaEnableDrivePayload(BaseModel):
    value: int


class XdaAxisPrefixPayload(BaseModel):
    enabled: bool


class XdaConnectPayload(BaseModel):
    port: str | None = None
    baud: int | None = None
    axis: str | None = None


class XdaSpeedPayload(BaseModel):
    speed_units: int


class XdaStepCountsPayload(BaseModel):
    step_counts: int


class XdaAbsCountsPayload(BaseModel):
    target_counts: int


class XdaStepMmPayload(BaseModel):
    delta_mm: float
    counts_per_mm: float
    invert_direction: bool = False


class XdaAbsMmPayload(BaseModel):
    target_mm: float
    counts_per_mm: float
    invert_direction: bool = False


class XdaInfoModePayload(BaseModel):
    mode: int


class XdaRawPayload(BaseModel):
    command: str


class XdaQueryPayload(BaseModel):
    tag: str


def _with_xda_overrides(base_config: Any, payload: XdaConnectPayload | None) -> Any:
    """Clone config and optionally override runtime XDA port/baud/axis (without saving to file)."""
    if payload is None:
        return base_config
    cfg = base_config.model_copy(deep=True)
    if payload.port is not None:
        cfg.serial.linear_port = payload.port
    if payload.baud is not None:
        cfg.serial.linear_baud = int(payload.baud)
    if payload.axis is not None:
        axis = payload.axis.strip().upper()
        if axis:
            cfg.linear.xda_axis = axis[:1]
    return cfg


def _raise_xda_http_error(exc: Exception, config: Any, command_type: str) -> None:
    if isinstance(exc, DeviceConfigError):
        detail: dict[str, Any] = (
            exc.http_detail if exc.http_detail is not None else legacy_config_error_detail(str(exc), config, command_type=command_type)
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc
    if isinstance(exc, DeviceConnectionError):
        detail503: dict[str, Any] = (
            exc.http_detail
            if exc.http_detail is not None
            else connection_error_http_detail(str(exc), config, command_type=command_type)
        )
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail503) from exc
    raise exc


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


@router.put("/save-device-config", response_model=DeviceConfigResponseSchema)
async def save_device_config_put_dedicated(request: Request) -> DeviceConfigResponseSchema:
    """Merge JSON into device_config.json. **Primary save URL** — unique path avoids stale ``PUT /config`` validators."""
    return await save_device_config_from_http_request(request)


@router.post("/config", response_model=DeviceConfigResponseSchema)
async def save_device_config_post(request: Request) -> DeviceConfigResponseSchema:
    """Same as PUT /save-device-config; POST for clients that mishandle PUT body parsing."""
    return await save_device_config_from_http_request(request)


@router.put("/config", response_model=DeviceConfigResponseSchema)
async def update_device_config(request: Request) -> DeviceConfigResponseSchema:
    """Apply JSON patch to device_config.json (legacy; UI prefers ``PUT /save-device-config``)."""
    return await save_device_config_from_http_request(request)


@router.put("/config-file", response_model=DeviceConfigResponseSchema)
async def update_device_config_file(request: Request) -> DeviceConfigResponseSchema:
    """Save merged device config (alternate path)."""
    return await save_device_config_from_http_request(request)


@router.get("/status", response_model=DeviceStatusSchema)
def get_device_status(request: Request) -> DeviceStatusSchema:
    _require_auth(request)
    return device_manager.get_status(load_device_config())


@router.post("/command", response_model=DeviceCommandResponseSchema)
async def send_device_command(
    payload: DeviceCommandSchema, request: Request, background_tasks: BackgroundTasks
) -> DeviceCommandResponseSchema:
    _require_auth(request)
    config = load_device_config()
    try:
        if payload.type == "pattern_start" and device_manager.is_split_usb(config):
            sent = device_manager.enqueue_pattern_start_split(payload, config, background_tasks)
        else:
            sent = await asyncio.to_thread(device_manager.send_command, payload, config)
    except DeviceConfigError as exc:
        detail: dict[str, Any] = (
            exc.http_detail
            if exc.http_detail is not None
            else legacy_config_error_detail(str(exc), config, command_type=payload.type)
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc
    except DeviceConnectionError as exc:
        detail503: dict[str, Any] = (
            exc.http_detail
            if exc.http_detail is not None
            else connection_error_http_detail(str(exc), config, command_type=payload.type)
        )
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail503) from exc
    except Exception as exc:
        logger.exception("Unhandled device command error", extra={"command_type": payload.type})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "device_internal",
                "code": "DEVICE_INTERNAL",
                "title": "Internal device command failure",
                "summary": "Unexpected backend error while processing device command.",
                "command_attempted": payload.type,
                "remediation": [
                    "Check backend terminal logs for traceback details.",
                    "Restart backend and retry the command.",
                    "If this repeats, share the traceback with support/developers.",
                ],
                "exception_type": type(exc).__name__,
            },
        ) from exc
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


@router.get("/xda-diag")
def get_xda_diag(request: Request) -> dict[str, list[str]]:
    """Recent XDA serial lines for troubleshooting (TX/RX)."""
    _require_auth(request)
    return {"lines": device_manager.get_xda_diag()}


@router.get("/xda-tools")
def get_xda_tools(request: Request) -> dict[str, Any]:
    _require_auth(request)
    return device_manager.get_xda_tools_state()


@router.post("/xda-tools/open-loop")
def set_xda_open_loop(payload: XdaJogOpenLoopPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    return device_manager.set_xda_jog_open_loop(payload.enabled)


@router.post("/xda-tools/axis-prefix")
def set_xda_axis_prefix(payload: XdaAxisPrefixPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    return device_manager.set_xda_use_axis_prefix(payload.enabled)


@router.post("/xda-tools/connect")
def xda_connect(payload: XdaConnectPayload | None, request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = _with_xda_overrides(load_device_config(), payload)
    try:
        return device_manager.xda_connect_now(config)
    except Exception as exc:
        _raise_xda_http_error(exc, config, "xda_connect")
        raise


@router.post("/xda-tools/disconnect")
def xda_disconnect(request: Request) -> dict[str, Any]:
    _require_auth(request)
    return device_manager.xda_disconnect_now()


@router.post("/xda-tools/stop")
def xda_stop(request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_stop_now(config)
    except Exception as exc:
        _raise_xda_http_error(exc, config, "xda_stop")
        raise


@router.post("/xda-tools/reset")
def xda_reset(request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_reset_now(config)
    except Exception as exc:
        _raise_xda_http_error(exc, config, "xda_reset")
        raise


@router.post("/xda-tools/set-speed")
def xda_set_speed(payload: XdaSpeedPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_set_speed_now(config, payload.speed_units)
    except Exception as exc:
        _raise_xda_http_error(exc, config, "xda_set_speed")
        raise


@router.post("/xda-tools/step-counts")
def xda_step_counts(payload: XdaStepCountsPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_step_counts_now(config, payload.step_counts)
    except Exception as exc:
        _raise_xda_http_error(exc, config, "xda_step_counts")
        raise


@router.post("/xda-tools/move-abs-counts")
def xda_move_abs_counts(payload: XdaAbsCountsPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_move_abs_counts_now(config, payload.target_counts)
    except Exception as exc:
        _raise_xda_http_error(exc, config, "xda_move_abs_counts")
        raise


@router.post("/xda-tools/step-mm")
def xda_step_mm(payload: XdaStepMmPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_step_mm_now(
            config,
            payload.delta_mm,
            payload.counts_per_mm,
            payload.invert_direction,
        )
    except Exception as exc:
        _raise_xda_http_error(exc, config, "xda_step_mm")
        raise


@router.post("/xda-tools/move-abs-mm")
def xda_move_abs_mm(payload: XdaAbsMmPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_move_abs_mm_now(
            config,
            payload.target_mm,
            payload.counts_per_mm,
            payload.invert_direction,
        )
    except Exception as exc:
        _raise_xda_http_error(exc, config, "xda_move_abs_mm")
        raise


@router.post("/xda-tools/set-info")
def xda_set_info(payload: XdaInfoModePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_set_info_mode_now(config, payload.mode)
    except Exception as exc:
        _raise_xda_http_error(exc, config, "xda_set_info")
        raise


@router.post("/xda-tools/query")
def xda_query(payload: XdaQueryPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_query_now(config, payload.tag)
    except Exception as exc:
        _raise_xda_http_error(exc, config, "xda_query")
        raise


@router.post("/xda-tools/raw")
def xda_raw(payload: XdaRawPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_send_raw_now(config, payload.command)
    except Exception as exc:
        _raise_xda_http_error(exc, config, "xda_raw")
        raise


@router.post("/xda-tools/enable-drive")
def xda_enable_drive(request: Request, payload: XdaEnableDrivePayload | None = None) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    requested = payload.value if payload is not None else None
    return device_manager.xda_enable_drive_now(config, value=requested)


@router.post("/xda-tools/run-index")
def xda_run_index(request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    return device_manager.xda_run_index_now(config)


@router.post("/xda-tools/run-demo")
def xda_run_demo(request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_run_demo_now(config)
    except DeviceConfigError as exc:
        detail: dict[str, Any] = (
            exc.http_detail
            if exc.http_detail is not None
            else legacy_config_error_detail(str(exc), config, command_type="xda_run_demo")
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc
    except DeviceConnectionError as exc:
        detail503: dict[str, Any] = (
            exc.http_detail
            if exc.http_detail is not None
            else connection_error_http_detail(str(exc), config, command_type="xda_run_demo")
        )
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail503) from exc


@router.post("/xda-tools/run-test-step")
def xda_run_test_step(request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_run_step_test_now(config)
    except DeviceConfigError as exc:
        detail: dict[str, Any] = (
            exc.http_detail
            if exc.http_detail is not None
            else legacy_config_error_detail(str(exc), config, command_type="xda_run_test_step")
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc
    except DeviceConnectionError as exc:
        detail503: dict[str, Any] = (
            exc.http_detail
            if exc.http_detail is not None
            else connection_error_http_detail(str(exc), config, command_type="xda_run_test_step")
        )
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail503) from exc


@router.post("/xda-tools/vendor-init")
def xda_vendor_init(request: Request) -> dict[str, Any]:
    _require_auth(request)
    config = load_device_config()
    try:
        return device_manager.xda_run_vendor_init_now(config)
    except DeviceConfigError as exc:
        detail: dict[str, Any] = (
            exc.http_detail
            if exc.http_detail is not None
            else legacy_config_error_detail(str(exc), config, command_type="xda_vendor_init")
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc
    except DeviceConnectionError as exc:
        detail503: dict[str, Any] = (
            exc.http_detail
            if exc.http_detail is not None
            else connection_error_http_detail(str(exc), config, command_type="xda_vendor_init")
        )
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail503) from exc


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
