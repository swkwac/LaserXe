"""Structured HTTP error payloads for device control (human + machine readable)."""

from __future__ import annotations

import os
from typing import Any

from app.schemas.device import DeviceConfigSchema
from app.services.device_config import CONFIG_PATH

__all__ = [
    "config_path_str",
    "config_snapshot",
    "effective_rotation_backend",
    "is_split_usb",
    "missing_linear_port_detail",
    "missing_pico_port_detail",
    "pattern_rotation_zero_required_detail",
    "legacy_config_error_detail",
    "connection_error_http_detail",
]


def config_path_str() -> str:
    return str(CONFIG_PATH.resolve())


def effective_rotation_backend(config: DeviceConfigSchema) -> str:
    override = os.getenv("DEVICE_ROTATION_BACKEND", "").strip().lower()
    if override in {"pico", "arduino_grbl", "arduino_step_dir"}:
        return override
    return config.serial.rotation_backend


def is_split_usb(config: DeviceConfigSchema) -> bool:
    return effective_rotation_backend(config) in {"arduino_grbl", "arduino_step_dir"} and bool(
        (config.serial.linear_port or "").strip()
    )


def motion_mode_description(config: DeviceConfigSchema) -> str:
    rb = effective_rotation_backend(config)
    if rb == "pico":
        return (
            "pico — Single USB device (Raspberry Pi Pico). `serial.pico_port` is that COM/tty. "
            "Pico firmware talks JSON to the PC and drives linear (often XDA over UART) + rotation."
        )
    if rb == "arduino_step_dir":
        if (config.serial.linear_port or "").strip():
            return (
                "split_usb_text_rotation — PC opens two serial ports: `serial.pico_port` → Arduino text protocol "
                "(rotation: CW/CCW), `serial.linear_port` → XD-OEM / XLA-1 (linear). Sweep programs need both."
            )
        return (
            "arduino_text_rotation_only — Only `serial.pico_port` is used for Arduino text protocol "
            "(rotation commands like CW90/CCW45); `linear_port` is empty, so linear USB axis is not used."
        )
    if (config.serial.linear_port or "").strip():
        return (
            "split_usb — PC opens two serial ports: `serial.pico_port` → Arduino/GRBL (rotation), "
            "`serial.linear_port` → XD-OEM / XLA-1 (linear). Sweep programs need both."
        )
    return (
        "grbl_rotation_only — Only `serial.pico_port` is used for GRBL; `linear_port` is empty, "
        "so this app will not drive the XDA linear axis over USB. Linear moves / full sweeps are not supported in this mode."
    )


def config_snapshot(config: DeviceConfigSchema) -> dict[str, Any]:
    rb = effective_rotation_backend(config)
    return {
        "rotation_backend_in_file": config.serial.rotation_backend,
        "rotation_backend_effective": rb,
        "env_DEVICE_ROTATION_BACKEND": os.getenv("DEVICE_ROTATION_BACKEND") or None,
        "serial.pico_port": config.serial.pico_port,
        "serial.pico_baud": config.serial.pico_baud,
        "serial.linear_port": config.serial.linear_port,
        "serial.linear_baud": config.serial.linear_baud,
        "split_usb_active": is_split_usb(config),
        "motion_mode_explanation": motion_mode_description(config),
    }


def missing_pico_port_detail(
    config: DeviceConfigSchema,
    *,
    command_type: str | None,
    in_split_path: bool,
) -> dict[str, Any]:
    summary = (
        "After loading `device_config.json`, the field `serial.pico_port` is missing, null, or empty. "
        "The motion service cannot open a serial port for rotation. "
        "Note: the field is still named `pico_port` for history, but with Arduino/GRBL it must be your **Arduino/CNC shield** COM port, not the XDA port."
    )
    if in_split_path:
        summary += (
            f" You are in split-USB mode because `linear_port` is set ({config.serial.linear_port!r}); "
            "rotation still requires `pico_port` for GRBL."
        )
    remediation = [
        "In the web app: Device Control → Advanced → Serial → set “Rotation USB (Arduino)” / controller port, then Save.",
        f"Or edit `serial.pico_port` in `{config_path_str()}` (path used by the running Python process).",
        "Call `GET /api/device/config` and confirm `config.serial.pico_port` is a non-empty string before `POST /api/device/command`.",
        "If the UI shows the right COM port but the API still sees null, the browser may be talking to a different backend host/port than you think—check `PUBLIC_API_URL` / Network tab.",
        "Partial saves previously could clear ports; use Save after changing serial settings so the merged config is written.",
    ]
    return {
        "error": "device_configuration",
        "code": "MISSING_PICO_PORT",
        "title": "serial.pico_port is not set (rotation / single-controller USB port)",
        "summary": summary,
        "command_attempted": command_type,
        "config_file": config_path_str(),
        "config_snapshot": config_snapshot(config),
        "remediation": remediation,
        "for_developers": (
            "Config is loaded per request via `load_device_config()` from `app.services.device_config.CONFIG_PATH`. "
            "`DEVICE_ROTATION_BACKEND` env overrides `rotation_backend` only; it does not set COM ports. "
            "Split mode is (`arduino_grbl` or `arduino_step_dir`) + non-empty `linear_port`."
        ),
    }


def missing_linear_port_detail(config: DeviceConfigSchema, *, command_type: str | None) -> dict[str, Any]:
    return {
        "error": "device_configuration",
        "code": "MISSING_LINEAR_PORT",
        "title": "serial.linear_port is not set (XDA / XLA-1 USB)",
        "summary": (
            "Split-USB mode is active (Arduino rotation + XDA linear), but `serial.linear_port` is empty. "
            "The backend cannot open the XD-OEM serial port for linear motion. "
            "Sweep / pattern_start requires both rotation (pico_port) and linear (linear_port)."
        ),
        "command_attempted": command_type,
        "config_file": config_path_str(),
        "config_snapshot": config_snapshot(config),
        "remediation": [
            "Set “Linear USB (XDA)” in Device Control and Save, or set `serial.linear_port` in `device_config.json`.",
            "Ensure `rotation_backend` is `arduino_grbl` or `arduino_step_dir` and both COM ports match Windows Device Manager / `GET /api/device/serial-ports`.",
        ],
        "for_developers": "_ensure_xda() requires a non-empty linear_port when _is_split_usb() is true.",
    }


def pattern_rotation_zero_required_detail(
    config: DeviceConfigSchema,
    *,
    current_deg: float | None,
    tol_deg: float,
    command_type: str | None,
) -> dict[str, Any]:
    cur = "unknown" if current_deg is None else f"{current_deg:.3f}"
    return {
        "error": "device_configuration",
        "code": "PATTERN_ROTATION_NOT_AT_ZERO",
        "title": "Program start requires rotation at software 0° (after Set HOME)",
        "summary": (
            f"Split-USB pattern runs use software limits with home = 0°. "
            f"The reported rotation position must be within ±{tol_deg:g}° before starting. "
            f"Current ≈ {cur}°."
        ),
        "command_attempted": command_type,
        "tolerance_deg": tol_deg,
        "current_rotation_deg": current_deg,
        "config_file": config_path_str(),
        "config_snapshot": config_snapshot(config),
        "remediation": [
            "Default split-USB sweeps use bookend homing (`PATTERN_BOOKEND_HOME=1`): no need to be at 0° before Run.",
            "If you disabled bookends (`PATTERN_BOOKEND_HOME=0`), physically align to reference, **Set HOME (here = 0°)**, then confirm status ≈ 0°.",
            "Optional: `PATTERN_REQUIRE_ROTATION_ZERO=0` disables this check (testing only).",
        ],
    }


def legacy_config_error_detail(
    message: str,
    config: DeviceConfigSchema,
    *,
    command_type: str | None,
) -> dict[str, Any]:
    """Wrap older DeviceConfigError raises that only had a string message."""
    return {
        "error": "device_configuration",
        "code": "DEVICE_CONFIG",
        "title": "Device configuration rejected this command",
        "summary": message,
        "command_attempted": command_type,
        "config_file": config_path_str(),
        "config_snapshot": config_snapshot(config),
        "remediation": [
            "Read the summary above; fix the referenced setting in the UI or JSON.",
            "Use GET /api/device/config to inspect the exact values the server will use.",
        ],
    }


def connection_error_http_detail(
    message: str,
    config: DeviceConfigSchema,
    *,
    command_type: str | None,
) -> dict[str, Any]:
    return {
        "error": "device_connection",
        "code": "DEVICE_CONNECTION",
        "title": "Hardware or serial I/O failed",
        "summary": message,
        "command_attempted": command_type,
        "config_file": config_path_str(),
        "config_snapshot": config_snapshot(config),
        "remediation": [
            "Confirm both devices are powered and USB cables seated; only one program may hold a COM port open.",
            "Match baud rates (typically 115200 for GRBL and XDA USB) in config.",
            "Close Arduino IDE serial monitor, other controllers, or duplicate backend instances.",
            "On Windows, check Device Manager for the correct COM numbers; update `device_config.json` if they changed.",
        ],
        "for_developers": (
            "Raised from pyserial open/read/write, GRBL idle wait, or XDA in-position timeout. "
            "See backend logs for stack traces."
        ),
    }
