"""Device control: Pi ↔ Pico serial bridge and unit conversions."""

from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

try:
    import serial  # type: ignore
    from serial.tools import list_ports  # type: ignore
except Exception:  # pragma: no cover - handled at runtime
    serial = None  # type: ignore
    list_ports = None  # type: ignore

from app.schemas.device import DeviceCommandSchema, DeviceConfigSchema, DeviceStatusSchema
from app.services.device_config import compute_device_config


class DeviceConfigError(Exception):
    pass


class DeviceConnectionError(Exception):
    pass


@dataclass
class DeviceStatusState:
    connected: bool = False
    last_error: str | None = None
    linear_pos_units: int | None = None
    rotation_pos_steps: int | None = None
    linear_target_units: int | None = None
    rotation_target_steps: int | None = None
    linear_moving: bool | None = None
    rotation_moving: bool | None = None
    last_update: datetime | None = None
    firmware_version: str | None = None


class PicoSerialClient:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._serial = None
        self._port: str | None = None
        self._baud: int | None = None
        self._reader_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._status = DeviceStatusState()

    def connect(self, port: str, baud: int) -> None:
        if serial is None:
            raise DeviceConnectionError("pyserial not installed")
        with self._lock:
            if (
                self._serial is not None
                and getattr(self._serial, "is_open", False)
                and self._port == port
                and self._baud == baud
            ):
                return
            self._close_locked()
            self._serial = serial.Serial(
                port=port,
                baudrate=baud,
                timeout=0.1,
                write_timeout=0.5,
            )
            self._port = port
            self._baud = baud
            self._stop_event.clear()
            self._reader_thread = threading.Thread(target=self._read_loop, daemon=True)
            self._reader_thread.start()
            self._status.connected = True
            self._status.last_error = None

    def close(self) -> None:
        with self._lock:
            self._close_locked()

    def _close_locked(self) -> None:
        self._stop_event.set()
        if self._serial is not None:
            try:
                self._serial.close()
            except Exception:
                pass
        self._serial = None
        self._status.connected = False

    def send_json(self, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, separators=(",", ":")) + "\n"
        with self._lock:
            if self._serial is None or not getattr(self._serial, "is_open", False):
                raise DeviceConnectionError("Pico not connected")
            self._serial.write(data.encode("utf-8"))

    def status_snapshot(self) -> DeviceStatusState:
        with self._lock:
            return DeviceStatusState(
                connected=self._status.connected,
                last_error=self._status.last_error,
                linear_pos_units=self._status.linear_pos_units,
                rotation_pos_steps=self._status.rotation_pos_steps,
                linear_target_units=self._status.linear_target_units,
                rotation_target_steps=self._status.rotation_target_steps,
                linear_moving=self._status.linear_moving,
                rotation_moving=self._status.rotation_moving,
                last_update=self._status.last_update,
                firmware_version=self._status.firmware_version,
            )

    def _read_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                if self._serial is None:
                    time.sleep(0.05)
                    continue
                line = self._serial.readline()
            except Exception as exc:
                self._status.last_error = str(exc)
                self._status.connected = False
                time.sleep(0.2)
                continue
            if not line:
                continue
            try:
                text = line.decode("utf-8", errors="replace").strip()
                if not text:
                    continue
                msg = json.loads(text)
            except Exception:
                continue
            self._handle_message(msg)

    def _handle_message(self, msg: dict[str, Any]) -> None:
        if msg.get("type") == "status":
            with self._lock:
                self._status.linear_pos_units = _maybe_int(msg.get("linear_pos_units"))
                self._status.rotation_pos_steps = _maybe_int(msg.get("rotation_pos_steps"))
                self._status.linear_target_units = _maybe_int(msg.get("linear_target_units"))
                self._status.rotation_target_steps = _maybe_int(msg.get("rotation_target_steps"))
                self._status.linear_moving = _maybe_bool(msg.get("linear_moving"))
                self._status.rotation_moving = _maybe_bool(msg.get("rotation_moving"))
                fw = msg.get("fw")
                self._status.firmware_version = str(fw) if isinstance(fw, str) else None
                self._status.last_update = datetime.now(timezone.utc)
                self._status.last_error = None
        if msg.get("type") == "error":
            with self._lock:
                self._status.last_error = str(msg.get("message") or "Unknown device error")
                self._status.last_update = datetime.now(timezone.utc)


class GrblSerialClient:
    """Serial client for Arduino running GRBL firmware."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._serial = None
        self._port: str | None = None
        self._baud: int | None = None
        self._reader_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._status = DeviceStatusState()

    def connect(self, port: str, baud: int) -> None:
        if serial is None:
            raise DeviceConnectionError("pyserial not installed")
        with self._lock:
            if (
                self._serial is not None
                and getattr(self._serial, "is_open", False)
                and self._port == port
                and self._baud == baud
            ):
                return
            self._close_locked()
            self._serial = serial.Serial(
                port=port,
                baudrate=baud,
                timeout=0.1,
                write_timeout=0.5,
            )
            self._port = port
            self._baud = baud
            self._stop_event.clear()
            self._reader_thread = threading.Thread(target=self._read_loop, daemon=True)
            self._reader_thread.start()
            self._status.connected = True
            self._status.last_error = None
            self._write_line("\r\n")

    def close(self) -> None:
        with self._lock:
            self._close_locked()

    def _close_locked(self) -> None:
        self._stop_event.set()
        if self._serial is not None:
            try:
                self._serial.close()
            except Exception:
                pass
        self._serial = None
        self._status.connected = False

    def _write_line(self, line: str) -> None:
        if self._serial is None or not getattr(self._serial, "is_open", False):
            raise DeviceConnectionError("Arduino GRBL not connected")
        self._serial.write(line.encode("utf-8"))

    def send_line(self, line: str) -> None:
        with self._lock:
            self._write_line(line if line.endswith("\n") else f"{line}\n")

    def send_realtime(self, byte_value: int) -> None:
        with self._lock:
            if self._serial is None or not getattr(self._serial, "is_open", False):
                raise DeviceConnectionError("Arduino GRBL not connected")
            self._serial.write(bytes([byte_value]))

    def status_snapshot(self) -> DeviceStatusState:
        with self._lock:
            return DeviceStatusState(
                connected=self._status.connected,
                last_error=self._status.last_error,
                linear_pos_units=self._status.linear_pos_units,
                rotation_pos_steps=self._status.rotation_pos_steps,
                linear_target_units=self._status.linear_target_units,
                rotation_target_steps=self._status.rotation_target_steps,
                linear_moving=self._status.linear_moving,
                rotation_moving=self._status.rotation_moving,
                last_update=self._status.last_update,
                firmware_version=self._status.firmware_version,
            )

    def _read_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                if self._serial is None:
                    time.sleep(0.05)
                    continue
                line = self._serial.readline()
            except Exception as exc:
                self._status.last_error = str(exc)
                self._status.connected = False
                time.sleep(0.2)
                continue
            if not line:
                continue
            text = line.decode("utf-8", errors="replace").strip()
            if not text:
                continue
            self._handle_line(text)

    def _handle_line(self, text: str) -> None:
        # Example: <Idle|MPos:12.000,0.000,0.000|FS:0,0>
        if text.startswith("<") and text.endswith(">"):
            body = text[1:-1]
            parts = body.split("|")
            state = parts[0].strip().lower()
            x_pos = None
            for part in parts[1:]:
                if part.startswith("MPos:"):
                    coords = part[5:].split(",")
                    if coords:
                        try:
                            x_pos = float(coords[0])
                        except ValueError:
                            x_pos = None
                    break
            with self._lock:
                if x_pos is not None:
                    self._status.rotation_pos_steps = int(round(x_pos))
                self._status.rotation_moving = state in {"run", "jog", "hold"}
                self._status.last_update = datetime.now(timezone.utc)
                self._status.last_error = None
            return
        if text.lower().startswith("error:"):
            with self._lock:
                self._status.last_error = text
                self._status.last_update = datetime.now(timezone.utc)
            return
        if text.startswith("Grbl "):
            with self._lock:
                self._status.firmware_version = text
                self._status.last_update = datetime.now(timezone.utc)


def _maybe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(round(value))
    return None


def _maybe_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    return None


def _units_per_mm(config: DeviceConfigSchema) -> float:
    computed = compute_device_config(config).computed
    return computed.linear_units_per_mm


def _steps_per_deg(config: DeviceConfigSchema) -> float:
    computed = compute_device_config(config).computed
    return computed.rotation_steps_per_deg


def linear_mm_to_units(mm: float, config: DeviceConfigSchema) -> int:
    return int(round(mm * _units_per_mm(config)))


def linear_units_to_mm(units: int, config: DeviceConfigSchema) -> float:
    return units / _units_per_mm(config)


def rotation_deg_to_steps(deg: float, config: DeviceConfigSchema) -> int:
    return int(round(deg * _steps_per_deg(config)))


def rotation_steps_to_deg(steps: int, config: DeviceConfigSchema) -> float:
    return steps / _steps_per_deg(config)


class DeviceManager:
    def __init__(self) -> None:
        self._pico = PicoSerialClient()
        self._grbl = GrblSerialClient()
        self._last_config_sent: dict[str, Any] | None = None

    def send_command(self, command: DeviceCommandSchema, config: DeviceConfigSchema) -> dict[str, Any]:
        if not config.serial.pico_port:
            raise DeviceConfigError("pico_port not configured")
        backend = self._rotation_backend(config)
        if backend == "arduino_grbl":
            self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
            self._grbl.send_realtime(ord("?"))
            payload = self._build_payload(command, config)
            self._send_grbl_payload(payload, config)
            return payload
        self._pico.connect(config.serial.pico_port, config.serial.pico_baud)
        self._ensure_config_sent(config)
        payload = self._build_payload(command, config)
        self._pico.send_json(payload)
        return payload

    def get_status(self, config: DeviceConfigSchema) -> DeviceStatusSchema:
        backend = self._rotation_backend(config)
        if config.serial.pico_port and backend == "arduino_grbl":
            try:
                self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
                self._grbl.send_realtime(ord("?"))
            except DeviceConnectionError:
                pass
            snapshot = self._grbl.status_snapshot()
            rotation_deg = (
                rotation_steps_to_deg(snapshot.rotation_pos_steps, config)
                if snapshot.rotation_pos_steps is not None
                else None
            )
            return DeviceStatusSchema(
                connected=snapshot.connected,
                last_error=snapshot.last_error,
                linear_position_mm=None,
                rotation_position_deg=rotation_deg,
                linear_moving=False,
                rotation_moving=snapshot.rotation_moving,
                last_update=snapshot.last_update,
                firmware_version=snapshot.firmware_version,
            )
        if config.serial.pico_port:
            try:
                self._pico.connect(config.serial.pico_port, config.serial.pico_baud)
                self._ensure_config_sent(config)
            except DeviceConnectionError:
                pass
        snapshot = self._pico.status_snapshot()
        linear_mm = (
            linear_units_to_mm(snapshot.linear_pos_units, config)
            if snapshot.linear_pos_units is not None
            else None
        )
        rotation_deg = (
            rotation_steps_to_deg(snapshot.rotation_pos_steps, config)
            if snapshot.rotation_pos_steps is not None
            else None
        )
        return DeviceStatusSchema(
            connected=snapshot.connected,
            last_error=snapshot.last_error,
            linear_position_mm=linear_mm,
            rotation_position_deg=rotation_deg,
            linear_moving=snapshot.linear_moving,
            rotation_moving=snapshot.rotation_moving,
            last_update=snapshot.last_update,
            firmware_version=snapshot.firmware_version,
        )

    def _ensure_config_sent(self, config: DeviceConfigSchema) -> None:
        computed = compute_device_config(config).computed
        payload = {
            "type": "config",
            "linear_units_per_mm": computed.linear_units_per_mm,
            "rotation_steps_per_deg": computed.rotation_steps_per_deg,
            "linear_axis": config.linear.xda_axis,
            "stepper_max_speed_steps_per_s": config.rotation.max_speed_steps_per_s,
            "stepper_accel_steps_per_s2": config.rotation.accel_steps_per_s2,
            "linear_tolerance_units": config.linear.in_position_tolerance_units,
            "linear_timeout_ms": config.linear.move_timeout_ms,
            "encoder_correction_threshold": config.rotation.encoder_correction_threshold,
            "linear_max_speed_units": config.linear.max_speed_units or 10000,
            "encoder_cpr": config.rotation.encoder_cpr,
        }
        if self._last_config_sent != payload:
            self._pico.send_json(payload)
            self._last_config_sent = payload

    def _build_payload(self, command: DeviceCommandSchema, config: DeviceConfigSchema) -> dict[str, Any]:
        cmd_type = command.type
        axis = command.axis
        if cmd_type in {"move_abs", "move_rel"}:
            if axis == "linear":
                target_mm = float(command.value)
                if cmd_type == "move_abs":
                    _ensure_range(target_mm, config.linear.travel_min_mm, config.linear.travel_max_mm, "linear")
                payload = {
                    "type": cmd_type,
                    "axis": "linear",
                    "target_units": linear_mm_to_units(target_mm, config),
                }
                return payload
            if axis == "rotation":
                target_deg = float(command.value)
                if cmd_type == "move_abs":
                    _ensure_range(target_deg, config.rotation.travel_min_deg, config.rotation.travel_max_deg, "rotation")
                payload = {
                    "type": cmd_type,
                    "axis": "rotation",
                    "target_steps": rotation_deg_to_steps(target_deg, config),
                }
                return payload
        if cmd_type == "home":
            return {"type": "home", "axis": axis}
        if cmd_type == "stop":
            return {"type": "stop", "axis": axis}
        if cmd_type == "emergency_stop":
            return {"type": "emergency_stop"}
        if cmd_type == "jog":
            return {"type": "jog", "axis": axis, "direction": int(command.value)}
        if cmd_type == "jog_stop":
            return {"type": "jog_stop", "axis": axis}
        if cmd_type == "pattern_cancel":
            return {"type": "pattern_cancel"}
        if cmd_type == "status":
            return {"type": "status"}
        if cmd_type == "pattern_start":
            pattern_payload = []
            if command.pattern:
                for point in command.pattern:
                    _ensure_range(point.linear_mm, config.linear.travel_min_mm, config.linear.travel_max_mm, "linear")
                    _ensure_range(
                        point.rotation_deg, config.rotation.travel_min_deg, config.rotation.travel_max_deg, "rotation"
                    )
                    pattern_payload.append(
                        {
                            "linear_units": linear_mm_to_units(point.linear_mm, config),
                            "rotation_steps": rotation_deg_to_steps(point.rotation_deg, config),
                            "dwell_ms": point.dwell_ms or 0,
                        }
                    )
            return {"type": "pattern_start", "pattern": pattern_payload}
        return {"type": "unknown"}

    def _rotation_backend(self, config: DeviceConfigSchema) -> str:
        # Env var can force backend globally without editing config file.
        override = os.getenv("DEVICE_ROTATION_BACKEND", "").strip().lower()
        if override in {"pico", "arduino_grbl"}:
            return override
        return config.serial.rotation_backend

    def _send_grbl_payload(self, payload: dict[str, Any], config: DeviceConfigSchema) -> None:
        cmd_type = str(payload.get("type") or "")
        axis = payload.get("axis")
        if cmd_type == "status":
            self._grbl.send_realtime(ord("?"))
            return
        if cmd_type in {"stop", "pattern_cancel", "emergency_stop"}:
            self._grbl.send_realtime(0x85)  # jog cancel / feed hold behavior
            return
        if cmd_type == "home":
            if axis != "rotation":
                raise DeviceConfigError("GRBL backend supports rotation axis only")
            self._grbl.send_line("$H")
            return
        if cmd_type == "jog":
            if axis != "rotation":
                raise DeviceConfigError("GRBL backend supports rotation axis only")
            direction = int(payload.get("direction") or 0)
            if direction == 0:
                return
            # Expect X axis to be configured in degrees in GRBL ($100 steps/deg).
            feed_deg_per_min = max(60, int(config.rotation.max_speed_steps_per_s * 60 / _steps_per_deg(config)))
            delta = 1000.0 if direction > 0 else -1000.0
            self._grbl.send_line(f"$J=G91 X{delta:.3f} F{feed_deg_per_min}")
            return
        if cmd_type == "jog_stop":
            self._grbl.send_realtime(0x85)
            return
        if cmd_type in {"move_abs", "move_rel"}:
            if axis != "rotation":
                raise DeviceConfigError("GRBL backend supports rotation axis only")
            steps = int(payload.get("target_steps") or 0)
            deg = rotation_steps_to_deg(steps, config)
            if cmd_type == "move_abs":
                self._grbl.send_line("G90")
                self._grbl.send_line(f"G0 X{deg:.4f}")
            else:
                self._grbl.send_line("G91")
                self._grbl.send_line(f"G0 X{deg:.4f}")
                self._grbl.send_line("G90")
            return
        if cmd_type == "pattern_start":
            pattern = payload.get("pattern")
            if not isinstance(pattern, list):
                return
            self._grbl.send_line("G90")
            for pt in pattern:
                if not isinstance(pt, dict):
                    continue
                steps = int(pt.get("rotation_steps") or 0)
                deg = rotation_steps_to_deg(steps, config)
                self._grbl.send_line(f"G0 X{deg:.4f}")
                dwell_ms = int(pt.get("dwell_ms") or 0)
                if dwell_ms > 0:
                    self._grbl.send_line(f"G4 P{dwell_ms / 1000.0:.3f}")
            return
        raise DeviceConfigError(f"Unsupported command for GRBL backend: {cmd_type}")


def list_serial_ports() -> list[dict[str, str]]:
    """Return list of available serial ports for Pico selection."""
    if list_ports is None:
        return []
    try:
        return [
            {"port": p.device, "description": p.description or "", "hwid": p.hwid or ""}
            for p in list_ports.comports()
        ]
    except Exception:
        return []


def _ensure_range(value: float, min_value: float, max_value: float, axis: str) -> None:
    if value < min_value or value > max_value:
        raise DeviceConfigError(f"{axis} target out of range")


device_manager = DeviceManager()
