"""Device control: Pico JSON bridge, or split USB (GRBL + XD-OEM XDA) with unit conversions."""

from __future__ import annotations

import asyncio
from collections import deque
import json
import logging
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

from starlette.background import BackgroundTasks

from app.schemas.device import DeviceCommandSchema, DeviceConfigSchema, DeviceStatusSchema
from app.services.device_config import compute_device_config
from app.services.device_error_detail import (
    missing_linear_port_detail,
    missing_pico_port_detail,
    pattern_rotation_zero_required_detail,
)


class DeviceConfigError(Exception):
    def __init__(self, message: str, *, http_detail: dict[str, Any] | None = None):
        super().__init__(message)
        self.http_detail = http_detail


class DeviceConnectionError(Exception):
    def __init__(self, message: str, *, http_detail: dict[str, Any] | None = None):
        super().__init__(message)
        self.http_detail = http_detail


def _open_serial(port: str, baud: int, **kwargs: Any) -> Any:
    """Open pyserial; map open failures to DeviceConnectionError so the API returns 503, not 500."""
    if serial is None:
        raise DeviceConnectionError("pyserial not installed")
    try:
        return serial.Serial(port=port, baudrate=baud, **kwargs)
    except Exception as exc:
        raise DeviceConnectionError(f"Could not open serial port {port!r}: {exc}") from exc


def _is_serial_io_error(exc: Exception) -> bool:
    """True for pyserial write/read I/O failures that should surface as connection errors."""
    error_types: tuple[type[BaseException], ...] = (OSError, TimeoutError)
    if serial is not None:
        serial_exc = getattr(serial, "SerialException", None)
        serial_timeout_exc = getattr(serial, "SerialTimeoutException", None)
        dynamic_types: list[type[BaseException]] = []
        if isinstance(serial_exc, type):
            dynamic_types.append(serial_exc)
        if isinstance(serial_timeout_exc, type):
            dynamic_types.append(serial_timeout_exc)
        if dynamic_types:
            error_types = (*error_types, *dynamic_types)
    return isinstance(exc, error_types)


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
    grbl_state: str | None = None  # lower-case cycle from "<State|...>" (GRBL only)


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
            self._serial = _open_serial(port, baud, timeout=0.1, write_timeout=0.5)
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
            try:
                self._serial.write(data.encode("utf-8"))
            except Exception as exc:
                if not _is_serial_io_error(exc):
                    raise
                self._status.last_error = f"Pico write failed: {exc}"
                self._close_locked()
                raise DeviceConnectionError(f"Pico write failed: {exc}") from exc

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
                grbl_state=self._status.grbl_state,
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
        self._protocol: str = "unknown"  # "unknown" | "grbl" | "step_dir_text"
        self._opened_monotonic_s: float | None = None
        self._diag_lines: deque[str] = deque(maxlen=1000)
        self._step_dir_ack_lock = threading.Lock()
        self._step_dir_ack_event: threading.Event | None = None
        self._step_dir_ack_err: str | None = None

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
            self._serial = _open_serial(port, baud, timeout=0.1, write_timeout=0.5)
            self._port = port
            self._baud = baud
            self._stop_event.clear()
            self._reader_thread = threading.Thread(target=self._read_loop, daemon=True)
            self._reader_thread.start()
            self._status.connected = True
            self._status.last_error = None
            self._opened_monotonic_s = time.monotonic()
            self._write_line("\r\n")

    def close(self) -> None:
        with self._lock:
            self._close_locked()

    def _close_locked(self) -> None:
        ev: threading.Event | None = None
        with self._step_dir_ack_lock:
            if self._step_dir_ack_event is not None:
                self._step_dir_ack_err = "Arduino connection closed"
                ev = self._step_dir_ack_event
        if ev is not None:
            ev.set()
        self._stop_event.set()
        if self._serial is not None:
            try:
                self._serial.close()
            except Exception:
                pass
        self._serial = None
        self._status.connected = False
        self._opened_monotonic_s = None

    def _write_line(self, line: str) -> None:
        if self._serial is None or not getattr(self._serial, "is_open", False):
            raise DeviceConnectionError("Arduino GRBL not connected")
        try:
            self._serial.write(line.encode("utf-8"))
        except Exception as exc:
            if not _is_serial_io_error(exc):
                raise
            msg = f"Arduino write failed: {exc}"
            self._status.last_error = msg
            self._close_locked()
            raise DeviceConnectionError(msg) from exc
        self._record_diag(f">> {line.rstrip()}")

    def send_line(self, line: str) -> None:
        with self._lock:
            self._write_line(line if line.endswith("\n") else f"{line}\n")

    def _signal_step_dir_ack_if_pending(self, *, ok: bool, err_msg: str | None = None) -> None:
        with self._step_dir_ack_lock:
            pending = self._step_dir_ack_event
            if pending is None:
                return
            self._step_dir_ack_err = None if ok else (err_msg or "ERR")
        pending.set()

    def send_step_dir_command_wait_ack(self, line: str, *, timeout_s: float) -> None:
        """Block until the Arduino step-dir sketch finishes the move and sends OK (sketch is synchronous per line)."""
        evt = threading.Event()
        with self._step_dir_ack_lock:
            self._step_dir_ack_event = evt
            self._step_dir_ack_err = None
        try:
            self.send_line(line)
        except Exception:
            with self._step_dir_ack_lock:
                self._step_dir_ack_event = None
                self._step_dir_ack_err = None
            raise
        if not evt.wait(timeout=max(0.5, float(timeout_s))):
            with self._step_dir_ack_lock:
                self._step_dir_ack_event = None
                self._step_dir_ack_err = None
            raise DeviceConnectionError(
                f"Timed out after {timeout_s:g}s waiting for Arduino OK after: {line.strip()[:48]!r}"
            )
        with self._step_dir_ack_lock:
            err = self._step_dir_ack_err
            self._step_dir_ack_event = None
            self._step_dir_ack_err = None
        if err:
            raise DeviceConnectionError(err)

    def send_realtime(self, byte_value: int) -> None:
        with self._lock:
            if self._serial is None or not getattr(self._serial, "is_open", False):
                raise DeviceConnectionError("Arduino GRBL not connected")
            try:
                self._serial.write(bytes([byte_value]))
            except Exception as exc:
                if not _is_serial_io_error(exc):
                    raise
                msg = f"Arduino realtime write failed: {exc}"
                self._status.last_error = msg
                self._close_locked()
                raise DeviceConnectionError(msg) from exc
            self._record_diag(f">> [rt:{byte_value}]")

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
                grbl_state=self._status.grbl_state,
            )

    def protocol_name(self) -> str:
        with self._lock:
            return self._protocol

    def is_grbl_protocol(self) -> bool:
        with self._lock:
            return self._protocol == "grbl"

    def set_rotation_steps_estimate(self, steps: int, *, moving: bool | None = None) -> None:
        with self._lock:
            self._status.rotation_pos_steps = int(steps)
            if moving is not None:
                self._status.rotation_moving = bool(moving)
            self._status.last_update = datetime.now(timezone.utc)

    def ensure_step_dir_ready(self, minimum_uptime_s: float = 1.8) -> None:
        """UNO/Nano often auto-reset on serial open; wait before first text command."""
        with self._lock:
            opened = self._opened_monotonic_s
        if opened is None:
            return
        remaining = float(minimum_uptime_s) - (time.monotonic() - opened)
        if remaining > 0:
            time.sleep(min(remaining, 3.0))

    def _record_diag(self, line: str) -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]
        self._diag_lines.append(f"{ts} {line}")

    def get_diag_lines(self) -> list[str]:
        with self._lock:
            return list(self._diag_lines)

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
            self._record_diag(f"<< {text}")
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
                self._protocol = "grbl"
                self._status.grbl_state = state
                if x_pos is not None:
                    self._status.rotation_pos_steps = int(round(x_pos))
                self._status.rotation_moving = state in {"run", "jog", "hold"}
                self._status.last_update = datetime.now(timezone.utc)
                self._status.last_error = None
            return
        if text.lower().startswith("error:"):
            with self._lock:
                self._protocol = "grbl"
                self._status.last_error = text
                self._status.last_update = datetime.now(timezone.utc)
            return
        if text.startswith("Grbl "):
            with self._lock:
                self._protocol = "grbl"
                self._status.firmware_version = text
                self._status.last_update = datetime.now(timezone.utc)
            return
        up = text.strip().upper()
        with self._lock:
            proto = self._protocol
        is_step_dir_ok = up == "OK" or (len(up) > 2 and up.startswith("OK "))
        if is_step_dir_ok:
            if proto == "grbl":
                return
            with self._lock:
                self._protocol = "step_dir_text"
                self._status.rotation_moving = False
                self._status.last_error = None
                self._status.last_update = datetime.now(timezone.utc)
            self._signal_step_dir_ack_if_pending(ok=True)
            return
        if up == "ERR":
            if proto == "grbl":
                return
            with self._lock:
                self._protocol = "step_dir_text"
                self._status.rotation_moving = False
                self._status.last_error = "Arduino step-dir command rejected (ERR)"
                self._status.last_update = datetime.now(timezone.utc)
            self._signal_step_dir_ack_if_pending(
                ok=False,
                err_msg="Arduino step-dir command rejected (ERR)",
            )
            return
        if up.startswith("READY"):
            with self._lock:
                self._protocol = "step_dir_text"
                self._status.connected = True
                self._status.firmware_version = text
                self._status.last_error = None
                self._status.last_update = datetime.now(timezone.utc)
            return


class XdaSerialClient:
    """Xeryon XD-OEM / XLA-1 stage: USB/UART **ASCII** protocol.

    References (repo + vendor):
    - ``.manuals/XD-OEM_AI_Interface_Summary.txt`` — line format, commands, ``INDX`` then ``SSPD`` then moves.
    - ``firmware/pico/src/xda.cpp`` — same strings on the wire (``X:DPOS=…``, ``X:EPOS=?``, global ``INDX``).
    - Xeryon Python/C++ docs — ``findIndex()`` → ``INDX``; ``setSpeed()`` → ``SSPD``; ``startScan(±1)`` → ``SCAN=±1``;
      ``stopScan()`` → axis ``STOP`` (``X:STOP``).

    Rules from the summary:
    - Terminator: **LF (ASCII 10)**. Optional ``XDA_USE_CRLF=1`` if a specific USB bridge expects CR+LF.
    - Indexed motion: **``INDX``** (global, no axis prefix) before relying on **``EPOS``** / ``DPOS`` / closed-loop moves.
    - Motion commands may be accepted either as ``AXIS:CCCC=value`` or plain ``CCCC=value`` depending on firmware/setup.
      We support both via ``XDA_USE_AXIS_PREFIX`` / runtime UI toggle.
    - Query: manual shows **``EPOS=?``**; multi-axis setups also use **``X:EPOS=?``** (see Pico). We try both.

    Limitation: we do **not** implement Xeryon’s high-level ``controller.start()`` (settings file / full init). If a unit
    needs that handshake, use the vendor stack or capture what ``start()`` sends and extend here.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._serial = None
        self._port: str | None = None
        self._baud: int | None = None
        self._diag_lines: deque[str] = deque(maxlen=1000)
        self._use_axis_prefix = os.environ.get("XDA_USE_AXIS_PREFIX", "").strip().lower() in ("1", "true", "yes")
        # After a fresh serial open, run INDX once (see .manuals/XD-OEM_AI_Interface_Summary.txt).
        self._needs_encoder_index = False

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
            self._serial = _open_serial(port, baud, timeout=0.25, write_timeout=0.5)
            self._port = port
            self._baud = baud
            self._needs_encoder_index = True

    def consume_encoder_index_pending(self) -> bool:
        """True once right after a new USB session; cleared here."""
        with self._lock:
            if self._needs_encoder_index:
                self._needs_encoder_index = False
                return True
            return False

    def close(self) -> None:
        with self._lock:
            self._close_locked()

    def _close_locked(self) -> None:
        if self._serial is not None:
            try:
                self._serial.close()
            except Exception:
                pass
        self._serial = None
        self._port = None
        self._baud = None

    @staticmethod
    def _norm_axis(axis: str) -> str:
        a = (axis or "X").strip().upper()
        return a[:1] if a else "X"

    @staticmethod
    def _line_terminator() -> str:
        """XD-OEM summary: newline = ASCII 10 (LF). Set XDA_USE_CRLF=1 only if hardware requires CR+LF."""
        if os.environ.get("XDA_USE_CRLF", "").strip().lower() in ("1", "true", "yes"):
            return "\r\n"
        return "\n"

    @staticmethod
    def _debug_enabled() -> bool:
        return os.environ.get("XDA_LOG_IO", "").strip().lower() in ("1", "true", "yes")

    def _debug(self, msg: str) -> None:
        if self._debug_enabled():
            logging.getLogger(__name__).info("XDA %s", msg)

    def _record_diag(self, line: str) -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]
        self._diag_lines.append(f"{ts} {line}")

    def add_diag_note(self, note: str) -> None:
        self._record_diag(f"!! {note}")

    def get_diag_lines(self) -> list[str]:
        with self._lock:
            return list(self._diag_lines)

    def _write_line_unlocked(self, text: str) -> None:
        if self._serial is None or not getattr(self._serial, "is_open", False):
            raise DeviceConnectionError("XDA not connected")
        term = self._line_terminator()
        text = text.rstrip("\r\n") + term
        try:
            self._serial.write(text.encode("ascii", errors="replace"))
        except Exception as exc:
            if not _is_serial_io_error(exc):
                raise
            self._close_locked()
            raise DeviceConnectionError(f"XDA write failed: {exc}") from exc
        try:
            self._serial.flush()
        except Exception:
            pass
        self._record_diag(f">> {text.rstrip()}")
        self._debug(f">> {text.rstrip()}")

    def send_raw(self, text: str) -> None:
        """Send a raw global command line (e.g. INFO=0, ENBL=1, INDX=1)."""
        with self._lock:
            self._write_line_unlocked(text)

    def send_axis_raw(self, axis: str, body: str) -> None:
        ax = self._norm_axis(axis)
        with self._lock:
            text = f"{ax}:{body}" if self._use_axis_prefix else body
            self._write_line_unlocked(text)

    def set_use_axis_prefix(self, enabled: bool) -> None:
        with self._lock:
            self._use_axis_prefix = bool(enabled)

    def get_use_axis_prefix(self) -> bool:
        with self._lock:
            return self._use_axis_prefix

    def configure_speed(self, axis: str, speed_units: int) -> None:
        self.send_axis_raw(axis, f"SSPD={max(1, int(speed_units))}")

    def move_abs_units(self, axis: str, units: int) -> None:
        self.send_axis_raw(axis, f"DPOS={int(units)}")

    def move_rel_units(self, axis: str, units: int) -> None:
        self.send_axis_raw(axis, f"STEP={int(units)}")

    def send_home(self, axis: str) -> None:
        self.send_axis_raw(axis, "HOME")

    def send_stop(self, axis: str) -> None:
        self.send_axis_raw(axis, "STOP")

    def send_scan(self, axis: str, value: int) -> None:
        self.send_axis_raw(axis, f"SCAN={int(value)}")

    def send_move_open_loop(self, axis: str, value: int) -> None:
        """Open-loop continuous motion (manual command MOVE=-1/0/1)."""
        self.send_axis_raw(axis, f"MOVE={int(value)}")

    def run_encoder_index(self, settle_s: float = 2.5) -> None:
        """Run INDX after connect so EPOS/closed-loop positioning become absolute.

        Manual §4.2: INDX accepts 0/1 to set initial search direction.
        """
        index_dir = os.environ.get("XDA_INDEX_DIR", "0").strip()
        if index_dir not in {"0", "1"}:
            index_dir = "0"
        with self._lock:
            if self._serial is None or not getattr(self._serial, "is_open", False):
                raise DeviceConnectionError("XDA not connected")
            try:
                self._serial.reset_input_buffer()
            except Exception:
                pass
            # Some firmware revisions accept only one INDX form.
            # Try bare INDX first (vendor UI "Find index"), then explicit direction form.
            self._write_line_unlocked("INDX")
            self._write_line_unlocked(f"INDX={index_dir}")
        time.sleep(max(0.0, settle_s))
        with self._lock:
            if self._serial is None or not getattr(self._serial, "is_open", False):
                return
            drain_until = time.monotonic() + 0.75
            while time.monotonic() < drain_until:
                try:
                    waiting = int(getattr(self._serial, "in_waiting", 0) or 0)
                except Exception:
                    waiting = 0
                if waiting > 0:
                    try:
                        self._serial.read(min(waiting, 512))
                    except Exception:
                        break
                else:
                    time.sleep(0.03)

    def _parse_epos_line(self, text: str) -> int | None:
        if "EPOS=" not in text:
            return None
        idx = text.find("EPOS=")
        tail = text[idx + 5 :].strip()
        try:
            return int(tail.split()[0])
        except (ValueError, IndexError):
            return None

    def _parse_tag_line(self, text: str, tag: str) -> int | None:
        key = f"{tag.upper()}="
        up = text.upper()
        if key not in up:
            return None
        idx = up.find(key)
        tail = text[idx + len(key) :].strip()
        try:
            return int(tail.split()[0])
        except (ValueError, IndexError):
            return None

    def query_value(self, tag: str, timeout_s: float = 0.5) -> int | None:
        q = tag.strip().upper()
        if not q or len(q) > 4:
            return None
        term = self._line_terminator().encode("ascii")
        line_out = f"{q}=?".encode("ascii") + term
        with self._lock:
            if self._serial is None or not getattr(self._serial, "is_open", False):
                raise DeviceConnectionError("XDA not connected")
            try:
                self._serial.reset_input_buffer()
            except Exception:
                pass
            self._serial.write(line_out)
            try:
                self._serial.flush()
            except Exception:
                pass
            self._record_diag(f">> {q}=?")
            deadline = time.monotonic() + max(0.1, timeout_s)
            while time.monotonic() < deadline:
                raw = self._serial.readline()
                if not raw:
                    continue
                text = raw.decode("utf-8", errors="replace").strip()
                self._record_diag(f"<< {text}")
                val = self._parse_tag_line(text, q)
                if val is not None:
                    return val
            return None

    def query_stat(self, timeout_s: float = 0.5) -> int | None:
        return self.query_value("STAT", timeout_s=timeout_s)

    def query_epos(self, axis: str, timeout_s: float = 0.6) -> int | None:
        ax = self._norm_axis(axis)
        # Manual §5 example: EPOS=? (global). Axis form matches Pico multi-axis usage: X:EPOS=?
        term = self._line_terminator().encode("ascii")
        queries: list[bytes] = [b"EPOS=?" + term, f"{ax}:EPOS=?".encode("ascii") + term]
        per_query = max(0.15, timeout_s / len(queries))
        with self._lock:
            if self._serial is None or not getattr(self._serial, "is_open", False):
                raise DeviceConnectionError("XDA not connected")
            for line_out in queries:
                try:
                    self._serial.reset_input_buffer()
                except Exception:
                    pass
                self._serial.write(line_out)
                try:
                    self._serial.flush()
                except Exception:
                    pass
                deadline = time.monotonic() + per_query
                while time.monotonic() < deadline:
                    raw = self._serial.readline()
                    if not raw:
                        continue
                    text = raw.decode("utf-8", errors="replace").strip()
                    self._record_diag(f"<< {text}")
                    self._debug(f"<< {text}")
                    val = self._parse_epos_line(text)
                    if val is not None:
                        return val
            return None

    def wait_in_position(
        self,
        axis: str,
        target_units: int,
        tolerance_units: int,
        timeout_ms: int,
    ) -> None:
        tol = max(1, int(tolerance_units))
        deadline = time.monotonic() + max(0.1, timeout_ms / 1000.0)
        while time.monotonic() < deadline:
            pos = self.query_epos(axis, timeout_s=0.55)
            if pos is not None and abs(pos - target_units) <= tol:
                return
            time.sleep(0.03)
        raise DeviceConnectionError("XDA move timeout (in-position not reached)")


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
        self._xda = XdaSerialClient()
        self._last_config_sent: dict[str, Any] | None = None
        self._xda_speed_key: tuple[str, int] | None = None
        self._xda_speed_lock = threading.Lock()
        self._pattern_bg_lock = threading.Lock()
        self._pattern_bg_error: str | None = None
        self._pattern_bg_running = False
        self._xda_jog_open_loop_override: bool | None = None
        self._xda_use_axis_prefix_override: bool | None = None
        self._split_linear_probe_lock = threading.Lock()
        self._split_linear_next_probe_ts = 0.0
        self._split_linear_last_mm: float | None = None
        self._split_linear_last_error: str | None = None
        self._step_dir_idle_timer_lock = threading.Lock()
        self._step_dir_idle_timer: threading.Timer | None = None
        self._step_dir_idle_disable_seconds_override: float | None = None

    def _rotation_backend(self, config: DeviceConfigSchema) -> str:
        override = os.getenv("DEVICE_ROTATION_BACKEND", "").strip().lower()
        if override in {"pico", "arduino_grbl", "arduino_step_dir"}:
            return override
        return config.serial.rotation_backend

    def _should_use_step_dir_protocol(self, configured_backend: str) -> bool:
        """Auto-fallback to text protocol when Arduino announces non-GRBL firmware."""
        if configured_backend == "arduino_step_dir":
            return True
        # If configured as GRBL but serial stream proves text protocol, switch command path.
        return self._grbl.protocol_name() == "step_dir_text"

    def _is_split_usb(self, config: DeviceConfigSchema) -> bool:
        if self._rotation_backend(config) == "pico":
            return False
        return bool((config.serial.linear_port or "").strip())

    def is_split_usb(self, config: DeviceConfigSchema) -> bool:
        """True when GRBL rotation and a separate XDA linear port are configured."""
        return self._is_split_usb(config)

    def get_xda_diag(self) -> list[str]:
        """Recent XDA TX/RX lines (newest last), for UI troubleshooting."""
        return self._xda.get_diag_lines()

    def get_rotation_diag(self) -> list[str]:
        """Recent Arduino rotation TX/RX lines (newest last), for UI troubleshooting."""
        return self._grbl.get_diag_lines()

    def rotation_send_raw_now(self, config: DeviceConfigSchema, command: str) -> dict[str, Any]:
        """Send a raw command to the rotation Arduino when using the CW/CCW text firmware."""
        cmd = (command or "").strip()
        if not cmd:
            raise DeviceConfigError("Rotation raw command is empty.")
        backend = self._rotation_backend(config)
        if backend != "arduino_step_dir":
            raise DeviceConfigError(
                f"rotation-tools/raw is supported only for arduino_step_dir; current backend is {backend!r}"
            )
        if not (config.serial.pico_port or "").strip():
            raise DeviceConfigError(
                "serial.pico_port is not configured",
                http_detail=missing_pico_port_detail(
                    config,
                    command_type="rotation_raw",
                    in_split_path=True,
                ),
            )
        self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
        self._grbl.ensure_step_dir_ready()
        up = cmd.upper()
        # Motion commands can take long; config/query commands should fail fast so UI does not look frozen.
        is_motion = up.startswith("CW") or up.startswith("CCW") or up.startswith("MOVE=") or up == "HOME"
        timeout_key = "STEP_DIR_ACK_TIMEOUT_S" if is_motion else "STEP_DIR_CFG_ACK_TIMEOUT_S"
        timeout_default = "120" if is_motion else "5"
        timeout_s = float(os.environ.get(timeout_key, timeout_default))
        self._grbl.send_step_dir_command_wait_ack(cmd, timeout_s=timeout_s)
        if up.startswith("EN="):
            if up == "EN=1":
                self._step_dir_schedule_idle_disable(config, source="rotation_raw")
            if up == "EN=0":
                self._step_dir_cancel_idle_disable()
        return {"ok": True, "sent": cmd}

    def _step_dir_idle_disable_seconds(self) -> float:
        """Idle hold-off before sending EN=0 to reduce motor heating while stationary.

        Set STEP_DIR_AUTO_DISABLE_IDLE_S<=0 to disable auto power-down.
        """
        if self._step_dir_idle_disable_seconds_override is not None:
            return self._step_dir_idle_disable_seconds_override
        try:
            return float(os.environ.get("STEP_DIR_AUTO_DISABLE_IDLE_S", "20"))
        except Exception:
            return 20.0

    def get_step_dir_idle_disable_seconds(self) -> dict[str, Any]:
        env_val = os.environ.get("STEP_DIR_AUTO_DISABLE_IDLE_S", "20")
        try:
            env_seconds = float(env_val)
        except Exception:
            env_seconds = 20.0
        effective = self._step_dir_idle_disable_seconds()
        source = "runtime_override" if self._step_dir_idle_disable_seconds_override is not None else "env"
        return {
            "seconds": effective,
            "source": source,
            "env_seconds": env_seconds,
            "enabled": effective > 0,
        }

    def set_step_dir_idle_disable_seconds(self, seconds: float) -> dict[str, Any]:
        secs = float(seconds)
        if not (secs >= 0):
            raise DeviceConfigError("Idle auto-disable seconds must be >= 0.")
        self._step_dir_idle_disable_seconds_override = secs
        if secs <= 0:
            self._step_dir_cancel_idle_disable()
        return self.get_step_dir_idle_disable_seconds()

    def _step_dir_cancel_idle_disable(self) -> None:
        with self._step_dir_idle_timer_lock:
            timer = self._step_dir_idle_timer
            self._step_dir_idle_timer = None
        if timer is not None:
            timer.cancel()

    def _step_dir_enable_before_motion(self, config: DeviceConfigSchema) -> None:
        self._step_dir_cancel_idle_disable()
        self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
        self._grbl.ensure_step_dir_ready()
        timeout_s = float(os.environ.get("STEP_DIR_ACK_TIMEOUT_S", "120"))
        self._grbl.send_step_dir_command_wait_ack("EN=1", timeout_s=timeout_s)

    def _step_dir_schedule_idle_disable(self, config: DeviceConfigSchema, *, source: str) -> None:
        idle_s = self._step_dir_idle_disable_seconds()
        if idle_s <= 0:
            return
        self._step_dir_cancel_idle_disable()

        def _disable_worker() -> None:
            try:
                self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
                self._grbl.ensure_step_dir_ready()
                timeout_s = float(os.environ.get("STEP_DIR_ACK_TIMEOUT_S", "120"))
                self._grbl.send_step_dir_command_wait_ack("EN=0", timeout_s=timeout_s)
                logging.getLogger(__name__).info(
                    "step-dir idle timeout reached (%ss) -> EN=0 [%s]",
                    idle_s,
                    source,
                )
            except Exception as exc:
                logging.getLogger(__name__).warning("step-dir auto EN=0 failed: %s", exc)

        timer = threading.Timer(idle_s, _disable_worker)
        timer.daemon = True
        with self._step_dir_idle_timer_lock:
            self._step_dir_idle_timer = timer
        timer.start()

    def _env_xda_jog_open_loop(self) -> bool:
        return os.environ.get("XDA_JOG_OPEN_LOOP", "").strip().lower() in ("1", "true", "yes")

    def _env_xda_use_axis_prefix(self) -> bool:
        return os.environ.get("XDA_USE_AXIS_PREFIX", "").strip().lower() in ("1", "true", "yes")

    def is_xda_jog_open_loop(self) -> bool:
        if self._xda_jog_open_loop_override is not None:
            return self._xda_jog_open_loop_override
        return self._env_xda_jog_open_loop()

    def is_xda_use_axis_prefix(self) -> bool:
        if self._xda_use_axis_prefix_override is not None:
            return self._xda_use_axis_prefix_override
        return self._env_xda_use_axis_prefix()

    def get_xda_tools_state(self) -> dict[str, Any]:
        env_jog = self._env_xda_jog_open_loop()
        jog_open_loop = self.is_xda_jog_open_loop()
        jog_source = "runtime_override" if self._xda_jog_open_loop_override is not None else "env"
        env_axis_prefix = self._env_xda_use_axis_prefix()
        axis_prefix_enabled = self.is_xda_use_axis_prefix()
        axis_prefix_source = "runtime_override" if self._xda_use_axis_prefix_override is not None else "env"
        return {
            "jog_open_loop": jog_open_loop,
            "source": jog_source,
            "env_jog_open_loop": env_jog,
            "axis_prefix_enabled": axis_prefix_enabled,
            "axis_prefix_source": axis_prefix_source,
            "env_axis_prefix_enabled": env_axis_prefix,
        }

    def set_xda_jog_open_loop(self, enabled: bool) -> dict[str, Any]:
        self._xda_jog_open_loop_override = bool(enabled)
        self._xda.add_diag_note(f"jog open-loop override set to {self._xda_jog_open_loop_override}")
        return self.get_xda_tools_state()

    def set_xda_use_axis_prefix(self, enabled: bool) -> dict[str, Any]:
        self._xda_use_axis_prefix_override = bool(enabled)
        self._xda.set_use_axis_prefix(self._xda_use_axis_prefix_override)
        self._xda.add_diag_note(f"axis-prefix override set to {self._xda_use_axis_prefix_override}")
        return self.get_xda_tools_state()

    def xda_connect_now(self, config: DeviceConfigSchema) -> dict[str, Any]:
        axis = self._ensure_xda(config, for_command="xda_connect")
        stat = self._xda.query_stat(timeout_s=0.8)
        epos = self._xda.query_epos(axis, timeout_s=0.8)
        self._xda.add_diag_note(
            f"manual connect axis={axis}; STAT={stat if stat is not None else 'timeout'} "
            f"EPOS={epos if epos is not None else 'timeout'}"
        )
        return {"ok": True, "axis": axis, "stat": stat, "epos": epos}

    def xda_disconnect_now(self) -> dict[str, Any]:
        self._xda.close()
        self._xda_speed_key = None
        self._xda.add_diag_note("manual disconnect")
        return {"ok": True}

    def xda_stop_now(self, config: DeviceConfigSchema) -> dict[str, Any]:
        axis = self._ensure_xda(config, for_command="xda_stop")
        if self.is_xda_jog_open_loop():
            self._xda.send_move_open_loop(axis, 0)
        self._xda.send_stop(axis)
        self._xda.add_diag_note(f"manual stop axis={axis}")
        return {"ok": True, "axis": axis}

    def xda_reset_now(self, config: DeviceConfigSchema) -> dict[str, Any]:
        self._ensure_xda(config, for_command="xda_reset")
        self._xda.send_raw("RESET")
        self._xda.add_diag_note("manual RESET sent")
        return {"ok": True}

    def xda_set_speed_now(self, config: DeviceConfigSchema, speed_units: int) -> dict[str, Any]:
        axis = self._ensure_xda(config, for_command="xda_set_speed")
        speed = max(1, int(speed_units))
        self._xda.send_axis_raw(axis, f"SSPD={speed}")
        self._xda.add_diag_note(f"manual set speed {axis}:SSPD={speed}")
        return {"ok": True, "axis": axis, "speed_units": speed}

    def xda_step_counts_now(self, config: DeviceConfigSchema, step_counts: int) -> dict[str, Any]:
        axis = self._ensure_xda(config, for_command="xda_step_counts")
        step = int(step_counts)
        self._xda.send_axis_raw(axis, f"STEP={step}")
        self._xda.add_diag_note(f"manual step counts {axis}:STEP={step}")
        return {"ok": True, "axis": axis, "step_counts": step}

    def xda_move_abs_counts_now(self, config: DeviceConfigSchema, target_counts: int) -> dict[str, Any]:
        axis = self._ensure_xda(config, for_command="xda_move_abs_counts")
        target = int(target_counts)
        self._xda.send_axis_raw(axis, f"DPOS={target}")
        self._xda.add_diag_note(f"manual abs counts {axis}:DPOS={target}")
        return {"ok": True, "axis": axis, "target_counts": target}

    @staticmethod
    def _mm_to_counts(mm: float, counts_per_mm: float, invert_direction: bool) -> int:
        cpm = max(1e-9, float(counts_per_mm))
        signed_mm = -float(mm) if invert_direction else float(mm)
        return int(round(signed_mm * cpm))

    def xda_step_mm_now(
        self, config: DeviceConfigSchema, delta_mm: float, counts_per_mm: float, invert_direction: bool
    ) -> dict[str, Any]:
        step_counts = self._mm_to_counts(delta_mm, counts_per_mm, invert_direction)
        result = self.xda_step_counts_now(config, step_counts)
        result.update(
            {
                "delta_mm": float(delta_mm),
                "counts_per_mm": float(counts_per_mm),
                "invert_direction": bool(invert_direction),
            }
        )
        return result

    def xda_move_abs_mm_now(
        self, config: DeviceConfigSchema, target_mm: float, counts_per_mm: float, invert_direction: bool
    ) -> dict[str, Any]:
        target_counts = self._mm_to_counts(target_mm, counts_per_mm, invert_direction)
        result = self.xda_move_abs_counts_now(config, target_counts)
        result.update(
            {
                "target_mm": float(target_mm),
                "counts_per_mm": float(counts_per_mm),
                "invert_direction": bool(invert_direction),
            }
        )
        return result

    def xda_set_info_mode_now(self, config: DeviceConfigSchema, mode: int) -> dict[str, Any]:
        self._ensure_xda(config, for_command="xda_set_info_mode")
        info_mode = max(0, min(7, int(mode)))
        self._xda.send_raw(f"INFO={info_mode}")
        self._xda.add_diag_note(f"manual INFO={info_mode}")
        return {"ok": True, "info_mode": info_mode}

    def xda_send_raw_now(self, config: DeviceConfigSchema, command_line: str) -> dict[str, Any]:
        self._ensure_xda(config, for_command="xda_send_raw")
        text = (command_line or "").strip()
        if not text:
            raise DeviceConfigError("raw command is empty")
        self._xda.send_raw(text)
        return {"ok": True, "sent": text}

    def xda_query_now(self, config: DeviceConfigSchema, tag: str) -> dict[str, Any]:
        axis = self._ensure_xda(config, for_command="xda_query")
        q = (tag or "").strip().upper()
        if not q:
            raise DeviceConfigError("query tag is empty")
        if q == "EPOS":
            value = self._xda.query_epos(axis, timeout_s=0.8)
            return {"ok": True, "tag": q, "value": value, "axis": axis}
        value = self._xda.query_value(q, timeout_s=0.8)
        return {"ok": True, "tag": q, "value": value}

    @staticmethod
    def _normalize_enbl_value(value: int | str | None) -> str:
        if value is None:
            enbl = os.environ.get("XDA_ENBL_VALUE", "3").strip()
            return enbl if enbl in {"0", "1", "2", "3"} else "3"
        enbl = str(value).strip()
        return enbl if enbl in {"0", "1", "2", "3"} else "3"

    def xda_enable_drive_now(self, config: DeviceConfigSchema, value: int | None = None) -> dict[str, Any]:
        self._ensure_xda(config, for_command="xda_enable_drive")
        enbl = self._normalize_enbl_value(value)
        self._xda.send_raw(f"ENBL={enbl}")
        stat = self._xda.query_stat(timeout_s=0.8)
        self._xda.add_diag_note(f"manual ENBL={enbl} sent; STAT={stat if stat is not None else 'timeout'}")
        return {"ok": True, "stat": stat, "enbl": int(enbl)}

    def xda_run_index_now(self, config: DeviceConfigSchema) -> dict[str, Any]:
        self._ensure_xda(config, for_command="xda_run_index")
        try:
            settle = float(os.environ.get("XDA_INDEX_SETTLE_S", "2.5"))
        except (TypeError, ValueError):
            settle = 2.5
            self._xda.add_diag_note("invalid XDA_INDEX_SETTLE_S; using fallback 2.5s")
        self._xda.run_encoder_index(settle_s=settle)
        stat = self._xda.query_stat(timeout_s=0.8)
        epos = self._xda.query_epos(XdaSerialClient._norm_axis(config.linear.xda_axis), timeout_s=0.8)
        self._xda.add_diag_note(
            f"manual INDX done; STAT={stat if stat is not None else 'timeout'} EPOS={epos if epos is not None else 'timeout'}"
        )
        return {"ok": True, "stat": stat, "epos": epos}

    def xda_run_demo_now(self, config: DeviceConfigSchema) -> dict[str, Any]:
        """Run a vendor-like XDA demo adapted to short travel stages (e.g. 25 mm rod)."""
        axis = self._ensure_xda(config, for_command="xda_run_demo")
        enbl = self._normalize_enbl_value(None)
        self._xda.send_raw(f"ENBL={enbl}")
        computed = compute_device_config(config).computed
        units_per_mm = max(1.0, float(computed.linear_units_per_mm))
        fast_mm_s = 100.0
        scan_mm_s = 10.0
        fast_units = max(1, int(round(units_per_mm * fast_mm_s)))
        scan_units = max(1, int(round(units_per_mm * scan_mm_s)))
        min_mm = float(config.linear.travel_min_mm)
        max_mm = float(config.linear.travel_max_mm)
        target_mm = min(max_mm, max(min_mm, 10.0))
        if abs(target_mm - min_mm) < 1e-9 and (max_mm - min_mm) > 1.0:
            target_mm = min_mm + min(10.0, (max_mm - min_mm) * 0.5)
        center_mm = min(max_mm, max(min_mm, 0.0))
        center_u = linear_mm_to_units(center_mm, config)
        target_u = linear_mm_to_units(target_mm, config)
        tol = int(config.linear.in_position_tolerance_units or 200)
        timeout_ms = int(config.linear.move_timeout_ms or 60000)

        self._xda.add_diag_note(
            f"demo start axis={axis} travel=[{min_mm:.3f},{max_mm:.3f}] center={center_mm:.3f} target={target_mm:.3f}"
        )

        # DPOS=0 / WAIT
        self._xda.configure_speed(axis, fast_units)
        self._xda.move_abs_units(axis, center_u)
        self._xda.wait_in_position(axis, center_u, tol, timeout_ms)
        time.sleep(0.1)

        # Repeat block (adapted from vendor demo) three times.
        repeats = 3
        effective_scan_dir = 1
        effective_scan_time_s = 0.2
        for _ in range(repeats):
            self._xda.move_abs_units(axis, target_u)
            self._xda.wait_in_position(axis, target_u, tol, timeout_ms)
            time.sleep(0.1)

            # Choose safe scan direction/time based on remaining travel room.
            margin_mm = 0.5
            room_pos = max(0.0, max_mm - target_mm - margin_mm)
            room_neg = max(0.0, target_mm - min_mm - margin_mm)
            if room_pos >= room_neg:
                effective_scan_dir = 1
                room_mm = room_pos
            else:
                effective_scan_dir = -1
                room_mm = room_neg
            effective_scan_time_s = min(2.0, room_mm / max(0.1, scan_mm_s))
            effective_scan_time_s = max(0.2, effective_scan_time_s)

            self._xda.configure_speed(axis, scan_units)
            self._xda.send_scan(axis, effective_scan_dir)
            time.sleep(effective_scan_time_s)
            self._xda.send_stop(axis)
            self._xda.configure_speed(axis, fast_units)

        # Finish in center (DPOS=0)
        self._xda.move_abs_units(axis, center_u)
        self._xda.wait_in_position(axis, center_u, tol, timeout_ms)
        stat = self._xda.query_stat(timeout_s=0.8)
        epos = self._xda.query_epos(axis, timeout_s=0.8)
        self._xda.add_diag_note(
            f"demo done STAT={stat if stat is not None else 'timeout'} EPOS={epos if epos is not None else 'timeout'} "
            f"scan_dir={effective_scan_dir} scan_t={effective_scan_time_s:.2f}s"
        )
        return {
            "ok": True,
            "axis": axis,
            "enbl": int(enbl),
            "center_mm": center_mm,
            "target_mm": target_mm,
            "repeats": repeats,
            "scan_mm_s": scan_mm_s,
            "scan_dir": effective_scan_dir,
            "scan_time_s": round(effective_scan_time_s, 3),
            "stat": stat,
            "epos": epos,
        }

    def xda_run_step_test_now(self, config: DeviceConfigSchema) -> dict[str, Any]:
        """Send a deterministic vendor-like test sequence for quick motion verification."""
        # Your logs show motion appears only after vendor-init.
        # Run the same preamble automatically, then send the exact test sequence.
        self.xda_run_vendor_init_now(config)
        axis = self._ensure_xda(config, for_command="xda_run_step_test")
        test_speed = int(os.environ.get("XDA_TEST_SSPD", "5000"))
        test_step = int(os.environ.get("XDA_TEST_STEP_UNITS", "128200"))
        include_indx = os.environ.get("XDA_TEST_INCLUDE_INDX", "").strip().lower() in ("1", "true", "yes")
        self._xda.send_axis_raw(axis, "ENBL=1")
        if include_indx:
            self._xda.send_axis_raw(axis, "INDX=1")
            time.sleep(float(os.environ.get("XDA_INDEX_SETTLE_S", "2.5")))
        self._xda.send_axis_raw(axis, f"SSPD={test_speed}")
        self._xda.send_axis_raw(axis, f"STEP={test_step}")
        stat = self._xda.query_stat(timeout_s=0.8)
        epos = self._xda.query_epos(axis, timeout_s=0.8)
        self._xda.add_diag_note(
            "TEST sent: "
            f"{axis}:ENBL=1, "
            f"{f'{axis}:INDX=1, ' if include_indx else ''}"
            f"{axis}:SSPD={test_speed}, {axis}:STEP={test_step}; "
            f"STAT={stat if stat is not None else 'timeout'} EPOS={epos if epos is not None else 'timeout'}"
        )
        return {
            "ok": True,
            "axis": axis,
            "stat": stat,
            "epos": epos,
            "test_sspd": test_speed,
            "test_step": test_step,
            "test_include_indx": include_indx,
        }

    def xda_run_vendor_init_now(self, config: DeviceConfigSchema) -> dict[str, Any]:
        """Run a vendor-like baseline init sequence to stabilize controller state."""
        axis = self._ensure_xda(config, for_command="xda_vendor_init")
        enbl = "1"
        info_mode = os.environ.get("XDA_INFO_MODE", "0").strip()
        if not info_mode.isdigit():
            info_mode = "0"
        settle = float(os.environ.get("XDA_INDEX_SETTLE_S", "2.5"))

        # Global/controller-level setup (closest to vendor app startup behavior).
        self._xda.send_raw("LOAD")
        self._xda.send_raw(f"INFO={info_mode}")
        self._xda.send_raw(f"ENBL={enbl}")
        self._xda.send_raw("INDX")
        self._xda.send_raw("INDX=1")
        time.sleep(max(0.3, settle))
        self._xda.send_raw("INDA=1")

        # Axis-local safety: also enable selected channel.
        self._xda.send_axis_raw(axis, f"ENBL={enbl}")
        stat = self._xda.query_stat(timeout_s=0.8)
        epos = self._xda.query_epos(axis, timeout_s=0.8)
        self._xda.add_diag_note(
            "VENDOR-INIT sent: "
            f"LOAD, INFO={info_mode}, ENBL={enbl}, INDX, INDX=1, INDA=1, {axis}:ENBL={enbl}; "
            f"STAT={stat if stat is not None else 'timeout'} EPOS={epos if epos is not None else 'timeout'}"
        )
        return {"ok": True, "axis": axis, "stat": stat, "epos": epos, "info_mode": int(info_mode), "enbl": int(enbl)}

    def _wait_grbl_idle(self, timeout_s: float = 180.0) -> None:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            self._grbl.send_realtime(ord("?"))
            time.sleep(0.08)
            snap = self._grbl.status_snapshot()
            if snap.grbl_state == "idle":
                return
        raise DeviceConnectionError("Timed out waiting for GRBL idle")

    def _ensure_xda(self, config: DeviceConfigSchema, *, for_command: str | None = None) -> str:
        port = (config.serial.linear_port or "").strip()
        if not port:
            raise DeviceConfigError(
                "linear_port is not set",
                http_detail=missing_linear_port_detail(config, command_type=for_command),
            )
        self._xda.connect(port, config.serial.linear_baud)
        self._xda.set_use_axis_prefix(self.is_xda_use_axis_prefix())
        if self._xda.consume_encoder_index_pending():
            # Manual §4.3: INFO may continuously stream telemetry. Disable it so request/response reads are deterministic.
            # Manual §4.2: ENBL=1 recovers from disabled/error state.
            try:
                send_load = os.environ.get("XDA_SEND_LOAD_ON_CONNECT", "1").strip().lower() in ("1", "true", "yes")
                if send_load:
                    self._xda.send_raw("LOAD")
                info_mode = os.environ.get("XDA_INFO_MODE", "0").strip()
                if not info_mode.isdigit():
                    info_mode = "0"
                self._xda.send_raw(f"INFO={info_mode}")
                enbl = os.environ.get("XDA_ENBL_VALUE", "3").strip()
                if enbl not in {"0", "1", "2", "3"}:
                    enbl = "3"
                self._xda.send_raw(f"ENBL={enbl}")
            except Exception as exc:
                logging.getLogger(__name__).warning("XDA pre-init (INFO/ENBL) failed: %s", exc)
            skip = os.environ.get("XDA_SKIP_ENCODER_INDEX", "").strip().lower() in ("1", "true", "yes")
            if not skip:
                try:
                    settle = float(os.environ.get("XDA_INDEX_SETTLE_S", "2.5"))
                    self._xda.run_encoder_index(settle_s=settle)
                except Exception as exc:
                    logging.getLogger(__name__).warning("XDA encoder index (INDX) failed: %s", exc)
            try:
                self._xda.send_raw("INDA=1")
            except Exception as exc:
                logging.getLogger(__name__).warning("XDA INDA=1 failed: %s", exc)
            try:
                stat = self._xda.query_stat(timeout_s=0.6)
                if stat is None:
                    self._xda.add_diag_note("STAT read timeout")
                else:
                    bit = lambda n: 1 if ((stat >> n) & 1) else 0
                    self._xda.add_diag_note(
                        "STAT="
                        f"{stat} enc_valid={bit(8)} searching_index={bit(9)} pos_reached={bit(10)} "
                        f"scanning={bit(13)} error_limit={bit(16)} safety_timeout={bit(18)} pos_fail={bit(21)}"
                    )
            except Exception as exc:
                logging.getLogger(__name__).warning("XDA STAT read failed: %s", exc)
        axis = XdaSerialClient._norm_axis(config.linear.xda_axis)
        speed = int(config.linear.max_speed_units or 10000)
        key = (port, speed)
        with self._xda_speed_lock:
            if self._xda_speed_key != key:
                self._xda.configure_speed(axis, speed)
                self._xda_speed_key = key
        return axis

    def _grbl_unlock_if_alarm(self) -> None:
        """GRBL ignores motion in alarm; ``$X`` clears it when homing is not required."""
        if not self._grbl.is_grbl_protocol():
            return
        try:
            self._grbl.send_realtime(ord("?"))
            time.sleep(0.08)
            st = (self._grbl.status_snapshot().grbl_state or "").lower()
            if "alarm" in st:
                self._grbl.send_line("$X")
                time.sleep(0.2)
        except Exception:
            pass

    def _send_step_dir_relative_steps(self, delta_steps: int, config: DeviceConfigSchema) -> None:
        """Send Arduino text commands (CW/CCW with integer degrees)."""
        if delta_steps == 0:
            self._step_dir_schedule_idle_disable(config, source="relative_noop")
            return
        self._step_dir_enable_before_motion(config)
        current_steps = self._grbl.status_snapshot().rotation_pos_steps or 0
        steps_per_deg = max(1e-9, _steps_per_deg(config))
        signed_deg = rotation_steps_to_deg(delta_steps, config)
        total_deg = int(round(abs(signed_deg)))
        if total_deg <= 0:
            return
        direction = "CW" if signed_deg > 0 else "CCW"
        remaining = total_deg
        ack_timeout = float(os.environ.get("STEP_DIR_ACK_TIMEOUT_S", "120"))
        while remaining > 0:
            chunk = min(360, remaining)
            # Sketch blocks until steps finish, then prints OK — wait so linear never starts mid-rotation.
            self._grbl.send_step_dir_command_wait_ack(f"{direction}{chunk}", timeout_s=ack_timeout)
            remaining -= chunk
        # Keep software estimate coherent even without encoder feedback.
        estimated_delta_steps = int(round((total_deg if signed_deg > 0 else -total_deg) * steps_per_deg))
        self._grbl.set_rotation_steps_estimate(current_steps + estimated_delta_steps, moving=False)
        self._step_dir_schedule_idle_disable(config, source="relative_move")

    def _send_step_dir_payload(self, payload: dict[str, Any], config: DeviceConfigSchema) -> None:
        cmd_type = str(payload.get("type") or "")
        axis = payload.get("axis")
        if cmd_type == "status":
            return
        if cmd_type in {"stop", "pattern_cancel", "emergency_stop", "jog_stop"}:
            # Sketch runs each move as a blocking loop, so there is no asynchronous stop command.
            self._grbl.set_rotation_steps_estimate(self._grbl.status_snapshot().rotation_pos_steps or 0, moving=False)
            self._step_dir_cancel_idle_disable()
            try:
                self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
                self._grbl.ensure_step_dir_ready()
                timeout_s = float(os.environ.get("STEP_DIR_ACK_TIMEOUT_S", "120"))
                self._grbl.send_step_dir_command_wait_ack("EN=0", timeout_s=timeout_s)
            except Exception:
                pass
            return
        if cmd_type == "home":
            if axis != "rotation":
                raise DeviceConfigError("Arduino step-dir backend supports rotation axis only")
            current_steps = self._grbl.status_snapshot().rotation_pos_steps or 0
            self._send_step_dir_relative_steps(-current_steps, config)
            return
        if cmd_type == "set_home":
            if axis != "rotation":
                raise DeviceConfigError("Arduino step-dir backend supports rotation axis only")
            self._grbl.set_rotation_steps_estimate(0, moving=False)
            return
        if cmd_type == "jog":
            if axis != "rotation":
                raise DeviceConfigError("Arduino step-dir backend supports rotation axis only")
            direction = int(payload.get("direction") or 0)
            if direction == 0:
                return
            nudge_steps = rotation_deg_to_steps(1.0, config)
            self._send_step_dir_relative_steps(nudge_steps if direction > 0 else -nudge_steps, config)
            return
        if cmd_type == "move_abs":
            if axis != "rotation":
                raise DeviceConfigError("Arduino step-dir backend supports rotation axis only")
            target_steps = int(payload.get("target_steps") or 0)
            current_steps = self._grbl.status_snapshot().rotation_pos_steps or 0
            self._send_step_dir_relative_steps(target_steps - current_steps, config)
            return
        if cmd_type == "move_rel":
            if axis != "rotation":
                raise DeviceConfigError("Arduino step-dir backend supports rotation axis only")
            delta_steps = int(payload.get("target_steps") or 0)
            self._send_step_dir_relative_steps(delta_steps, config)
            return
        if cmd_type == "pattern_start":
            pattern = payload.get("pattern")
            if not isinstance(pattern, list):
                return
            for pt in pattern:
                if not isinstance(pt, dict):
                    continue
                target_steps = int(pt.get("rotation_steps") or 0)
                current_steps = self._grbl.status_snapshot().rotation_pos_steps or 0
                self._send_step_dir_relative_steps(target_steps - current_steps, config)
                dwell_ms = int(pt.get("dwell_ms") or 0)
                if dwell_ms > 0:
                    time.sleep(dwell_ms / 1000.0)
            return
        raise DeviceConfigError(f"Unsupported command for Arduino step-dir backend: {cmd_type}")

    def _move_linear_abs_split(self, lin_axis: str, target_units: int, config: DeviceConfigSchema) -> None:
        self._xda.move_abs_units(lin_axis, target_units)
        self._xda.wait_in_position(
            lin_axis,
            target_units,
            config.linear.in_position_tolerance_units,
            config.linear.move_timeout_ms,
        )

    def _move_rotation_abs_split(self, target_steps: int, config: DeviceConfigSchema) -> None:
        rotation_backend = self._rotation_backend(config)
        use_grbl = rotation_backend == "arduino_grbl" and not self._should_use_step_dir_protocol(rotation_backend)
        payload = {"type": "move_abs", "axis": "rotation", "target_steps": int(target_steps)}
        if use_grbl:
            self._send_grbl_payload(payload, config)
            return
        self._send_step_dir_payload(payload, config)

    def _wait_rotation_settled_split(self, config: DeviceConfigSchema) -> None:
        """Ensure rotation motion finished before starting linear segment (split USB).

        Step-dir sketch is synchronous per CW/CCW line; the backend waits for OK after each chunk, so this poll is a
        fallback if ``rotation_moving`` is ever wired from STAT telemetry.
        """
        rotation_backend = self._rotation_backend(config)
        use_grbl = rotation_backend == "arduino_grbl" and not self._should_use_step_dir_protocol(rotation_backend)
        if use_grbl:
            self._wait_grbl_idle(timeout_s=180.0)
            return
        timeout_s = float(os.environ.get("PATTERN_ROTATION_SETTLE_TIMEOUT_S", "120"))
        deadline = time.monotonic() + max(1.0, timeout_s)
        while time.monotonic() < deadline:
            if not self._grbl.status_snapshot().rotation_moving:
                return
            time.sleep(0.04)
        raise DeviceConnectionError("Timed out waiting for rotation to finish (step-dir)")

    def _pattern_require_rotation_zero(self) -> bool:
        return os.environ.get("PATTERN_REQUIRE_ROTATION_ZERO", "1").strip().lower() not in (
            "0",
            "false",
            "no",
            "off",
        )

    def _assert_split_pattern_starts_at_rotation_zero(self, config: DeviceConfigSchema) -> None:
        if not self._pattern_require_rotation_zero():
            return
        tol_deg = float(os.environ.get("PATTERN_ROTATION_ZERO_TOL_DEG", "0.75"))
        self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
        rotation_backend = self._rotation_backend(config)
        use_grbl = rotation_backend == "arduino_grbl" and not self._should_use_step_dir_protocol(rotation_backend)
        if use_grbl and self._grbl.is_grbl_protocol():
            self._grbl.send_realtime(ord("?"))
            time.sleep(0.06)
        snap = self._grbl.status_snapshot()
        if snap.rotation_pos_steps is None:
            raise DeviceConfigError(
                "Cannot read rotation position; connect rotation USB and retry before pattern_start.",
                http_detail=pattern_rotation_zero_required_detail(
                    config,
                    current_deg=None,
                    tol_deg=tol_deg,
                    command_type="pattern_start",
                ),
            )
        deg = rotation_steps_to_deg(int(snap.rotation_pos_steps), config)
        if abs(deg) > tol_deg:
            raise DeviceConfigError(
                f"pattern_start requires rotation at software 0° (±{tol_deg:g}°); current ≈ {deg:.2f}°. "
                "Use Set HOME at mechanical zero, then run the program.",
                http_detail=pattern_rotation_zero_required_detail(
                    config,
                    current_deg=deg,
                    tol_deg=tol_deg,
                    command_type="pattern_start",
                ),
            )

    def _pattern_bookend_home_enabled(self) -> bool:
        return os.environ.get("PATTERN_BOOKEND_HOME", "1").strip().lower() not in (
            "0",
            "false",
            "no",
            "off",
        )

    def _go_home_both_split(self, lin_axis: str, config: DeviceConfigSchema) -> None:
        """Linear HOME then rotation home (same order as split `home` axis=both)."""
        rotation_backend = self._rotation_backend(config)
        use_grbl = rotation_backend == "arduino_grbl" and not self._should_use_step_dir_protocol(rotation_backend)
        try:
            self._xda.send_home(lin_axis)
        except Exception as exc:
            logging.getLogger(__name__).warning("pattern bookend: linear HOME failed: %s", exc)
        settle = float(os.environ.get("PATTERN_LINEAR_HOME_SETTLE_S", "2.0"))
        if settle > 0:
            time.sleep(settle)
        if use_grbl:
            self._grbl.send_line("$H")
            self._wait_grbl_idle(timeout_s=600.0)
        else:
            self._send_step_dir_payload({"type": "home", "axis": "rotation"}, config)
            self._wait_rotation_settled_split(config)

    def _pattern_apply_one_split_point(
        self, lin_axis: str, config: DeviceConfigSchema, pt: dict[str, Any]
    ) -> None:
        lu = int(pt.get("linear_units") or 0)
        steps = int(pt.get("rotation_steps") or 0)
        self._move_rotation_abs_split(steps, config)
        self._wait_rotation_settled_split(config)
        self._move_linear_abs_split(lin_axis, lu, config)
        dwell_ms = int(pt.get("dwell_ms") or 0)
        if dwell_ms > 0:
            time.sleep(dwell_ms / 1000.0)

    def _pattern_start_split_loop(
        self, lin_axis: str, config: DeviceConfigSchema, pattern: list[Any]
    ) -> None:
        points = [p for p in pattern if isinstance(p, dict)]
        if not points:
            return

        bookend = self._pattern_bookend_home_enabled()
        if bookend:
            log = logging.getLogger(__name__)
            log.info("pattern_start (split): bookend HOME (linear + rotation)")
            self._go_home_both_split(lin_axis, config)
            first = points[0]
            log.info("pattern_start (split): approach first waypoint")
            self._pattern_apply_one_split_point(lin_axis, config, first)
            to_run = points[1:]
        else:
            self._assert_split_pattern_starts_at_rotation_zero(config)
            to_run = points

        for pt in to_run:
            self._pattern_apply_one_split_point(lin_axis, config, pt)

        if bookend:
            logging.getLogger(__name__).info("pattern_start (split): return HOME (linear + rotation)")
            self._go_home_both_split(lin_axis, config)

    def _try_linear_stop_non_blocking(self, config: DeviceConfigSchema, *, source: str) -> None:
        """Best-effort linear stop; never block rotation command completion."""
        try:
            port = (config.serial.linear_port or "").strip()
            if not port:
                return
            lin_axis = self._ensure_xda(config, for_command=source)
            self._xda.send_stop(lin_axis)
        except Exception as exc:
            logging.getLogger(__name__).warning(
                "Non-blocking linear stop skipped (%s): %s", source, exc
            )

    def send_command(self, command: DeviceCommandSchema, config: DeviceConfigSchema) -> dict[str, Any]:
        try:
            if self._is_split_usb(config):
                return self._send_split_command(command, config)
            if not config.serial.pico_port:
                raise DeviceConfigError(
                    "serial.pico_port is not configured",
                    http_detail=missing_pico_port_detail(
                        config,
                        command_type=str(command.type),
                        in_split_path=False,
                    ),
                )
            backend = self._rotation_backend(config)
            if backend == "arduino_grbl":
                self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
                payload = self._build_payload(command, config)
                if self._should_use_step_dir_protocol(backend):
                    self._grbl.ensure_step_dir_ready()
                    self._send_step_dir_payload(payload, config)
                else:
                    # Poll only when device is confirmed GRBL. Sending '?' to text firmware pollutes input buffer.
                    if self._grbl.is_grbl_protocol():
                        self._grbl.send_realtime(ord("?"))
                    self._send_grbl_payload(payload, config)
                return payload
            if backend == "arduino_step_dir":
                self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
                self._grbl.ensure_step_dir_ready()
                payload = self._build_payload(command, config)
                self._send_step_dir_payload(payload, config)
                return payload
            self._pico.connect(config.serial.pico_port, config.serial.pico_baud)
            self._ensure_config_sent(config)
            payload = self._build_payload(command, config)
            self._pico.send_json(payload)
            return payload
        except DeviceConnectionError as exc:
            configured_backend = self._rotation_backend(config)
            active_rotation_path = configured_backend
            if configured_backend == "arduino_grbl" and self._should_use_step_dir_protocol(configured_backend):
                active_rotation_path = "arduino_step_dir_text_fallback"
            usb_mode = "split_usb" if self._is_split_usb(config) else "single_usb"
            axis = command.axis if command.axis is not None else "none"
            raise DeviceConnectionError(
                f"command={command.type} axis={axis} mode={usb_mode} rotation_path={active_rotation_path}: {exc}",
                http_detail=exc.http_detail,
            ) from exc

    def _send_split_command(self, command: DeviceCommandSchema, config: DeviceConfigSchema) -> dict[str, Any]:
        payload = self._build_payload(command, config)
        ct = command.type
        axis = command.axis
        lin_axis: str | None = None
        rotation_backend = self._rotation_backend(config)
        
        def use_grbl_now() -> bool:
            return rotation_backend == "arduino_grbl" and not self._should_use_step_dir_protocol(rotation_backend)

        needs_rotation = False
        if ct in {"status", "pattern_cancel", "emergency_stop", "pattern_start"}:
            needs_rotation = True
        elif ct in {"move_abs", "move_rel", "jog", "home", "set_home"}:
            needs_rotation = axis == "rotation" or axis == "both"
        elif ct in {"jog_stop", "stop"}:
            needs_rotation = axis in (None, "rotation", "both")

        def ensure_rotation() -> None:
            if not needs_rotation:
                return
            if not config.serial.pico_port:
                raise DeviceConfigError(
                    "serial.pico_port is not configured",
                    http_detail=missing_pico_port_detail(
                        config,
                        command_type=str(command.type),
                        in_split_path=True,
                    ),
                )
            self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
            if use_grbl_now():
                if self._grbl.is_grbl_protocol():
                    self._grbl.send_realtime(ord("?"))
                self._grbl_unlock_if_alarm()
            else:
                self._grbl.ensure_step_dir_ready()

        def ensure_xda() -> str:
            nonlocal lin_axis
            if lin_axis is None:
                lin_axis = self._ensure_xda(config, for_command=str(command.type))
            return lin_axis

        if ct == "status":
            ensure_rotation()
            if use_grbl_now():
                if self._grbl.is_grbl_protocol():
                    self._grbl.send_realtime(ord("?"))
            return payload

        if ct in {"pattern_cancel", "emergency_stop"}:
            ensure_rotation()
            self._try_linear_stop_non_blocking(config, source=str(ct))
            if use_grbl_now():
                self._grbl.send_realtime(0x85)
            else:
                self._send_step_dir_payload({"type": "stop", "axis": "rotation"}, config)
            return payload

        if ct == "stop":
            ax = command.axis
            if ax in (None, "both"):
                ensure_rotation()
                self._try_linear_stop_non_blocking(config, source="stop")
                if use_grbl_now():
                    self._grbl.send_realtime(0x85)
                else:
                    self._send_step_dir_payload({"type": "stop", "axis": "rotation"}, config)
            elif ax == "linear":
                self._xda.send_stop(ensure_xda())
            elif ax == "rotation":
                ensure_rotation()
                if use_grbl_now():
                    self._grbl.send_realtime(0x85)
                else:
                    self._send_step_dir_payload({"type": "stop", "axis": "rotation"}, config)
            return payload

        if ct == "home":
            ax = command.axis
            if ax == "linear":
                self._xda.send_home(ensure_xda())
                return payload
            if ax == "rotation":
                ensure_rotation()
                if use_grbl_now():
                    self._grbl.send_line("$H")
                    self._wait_grbl_idle(timeout_s=600.0)
                else:
                    self._send_step_dir_payload(payload, config)
                return payload
            if ax == "both":
                ensure_rotation()
                try:
                    self._xda.send_home(ensure_xda())
                except Exception as exc:
                    logging.getLogger(__name__).warning("Non-blocking linear home skipped: %s", exc)
                if use_grbl_now():
                    self._grbl.send_line("$H")
                    self._wait_grbl_idle(timeout_s=600.0)
                else:
                    self._send_step_dir_payload({"type": "home", "axis": "rotation"}, config)
                return payload
            raise DeviceConfigError("home requires axis")

        if ct == "set_home":
            ax = command.axis
            if ax == "rotation":
                ensure_rotation()
                if use_grbl_now():
                    self._grbl.send_line("G92 X0")
                else:
                    self._send_step_dir_payload(payload, config)
                return payload
            if ax == "both":
                ensure_rotation()
                if use_grbl_now():
                    self._grbl.send_line("G92 X0")
                else:
                    self._send_step_dir_payload({"type": "set_home", "axis": "rotation"}, config)
                # For split mode, linear set-home is not supported; keep it rotation-only.
                return payload
            if ax == "linear":
                raise DeviceConfigError("set_home for linear axis is not supported in split USB mode")
            raise DeviceConfigError("set_home requires axis")

        if ct == "move_abs":
            if command.axis == "linear":
                tu = int(payload["target_units"])
                linear_axis = ensure_xda()
                self._move_linear_abs_split(linear_axis, tu, config)
                return payload
            if command.axis == "rotation":
                ensure_rotation()
                self._move_rotation_abs_split(int(payload["target_steps"]), config)
                return payload
            raise DeviceConfigError("move_abs requires axis linear or rotation")

        if ct == "move_rel":
            if command.axis == "linear":
                du = int(payload["target_units"])
                # One-click nudge should match vendor "Step ±X" behavior: use STEP, not MOVE pulse.
                self._xda.move_rel_units(ensure_xda(), du)
                time.sleep(0.15)
                return payload
            if command.axis == "rotation":
                ensure_rotation()
                if use_grbl_now():
                    self._send_grbl_payload(payload, config)
                else:
                    self._send_step_dir_payload(payload, config)
                return payload
            raise DeviceConfigError("move_rel requires axis linear or rotation")

        if ct == "jog":
            if command.axis == "rotation":
                ensure_rotation()
                if use_grbl_now():
                    self._send_grbl_payload(payload, config)
                else:
                    self._send_step_dir_payload(payload, config)
                return payload
            if command.axis == "linear":
                direction = int(payload.get("direction") or 0)
                if direction == 0:
                    return payload
                linear_axis = ensure_xda()
                open_loop = self.is_xda_jog_open_loop()
                if open_loop:
                    self._xda.send_move_open_loop(linear_axis, 1 if direction > 0 else -1)
                    return payload
                # Xeryon Python API: startScan(±1) — direction only; speed is SSPD (see Xeryon docs).
                # Sending SCAN=±10000 was wrong and produces no motion on many firmware builds.
                use_step = os.environ.get("XDA_JOG_USE_STEP", "").strip().lower() in ("1", "true", "yes")
                if use_step:
                    step_u = int(os.environ.get("XDA_JOG_STEP_UNITS", "800"))
                    self._xda.move_rel_units(linear_axis, step_u if direction > 0 else -step_u)
                else:
                    legacy_mag = os.environ.get("XDA_SCAN_JOG_MAGNITUDE", "").strip()
                    if legacy_mag:
                        self._xda.send_scan(linear_axis, int(legacy_mag) if direction > 0 else -int(legacy_mag))
                    else:
                        self._xda.send_scan(linear_axis, 1 if direction > 0 else -1)
                return payload
            raise DeviceConfigError("jog requires axis linear or rotation")

        if ct == "jog_stop":
            ax = command.axis
            open_loop = self.is_xda_jog_open_loop()
            if ax in (None, "both"):
                ensure_rotation()
                try:
                    linear_axis = ensure_xda()
                    if open_loop:
                        self._xda.send_move_open_loop(linear_axis, 0)
                    self._xda.send_stop(linear_axis)
                except Exception as exc:
                    logging.getLogger(__name__).warning("Non-blocking linear jog_stop skipped: %s", exc)
                if use_grbl_now():
                    self._grbl.send_realtime(0x85)
                else:
                    self._send_step_dir_payload({"type": "stop", "axis": "rotation"}, config)
            elif ax == "linear":
                linear_axis = ensure_xda()
                if open_loop:
                    self._xda.send_move_open_loop(linear_axis, 0)
                self._xda.send_stop(linear_axis)
            else:
                ensure_rotation()
                if use_grbl_now():
                    self._grbl.send_realtime(0x85)
                else:
                    self._send_step_dir_payload({"type": "stop", "axis": "rotation"}, config)
            return payload

        if ct == "pattern_start":
            ensure_rotation()
            linear_axis = ensure_xda()
            pattern = payload.get("pattern")
            if not isinstance(pattern, list):
                return payload
            self._pattern_start_split_loop(linear_axis, config, pattern)
            return payload

        raise DeviceConfigError(f"Unsupported command for split USB backend: {ct}")

    def enqueue_pattern_start_split(
        self,
        command: DeviceCommandSchema,
        config: DeviceConfigSchema,
        background_tasks: BackgroundTasks,
    ) -> dict[str, Any]:
        """Connect, validate, then run the sweep in a background task so HTTP returns immediately.

        Long-running ``pattern_start`` otherwise holds the response open; proxies or the browser
        can surface that as ``TypeError: Failed to fetch`` with no HTTP status.
        """
        if not config.serial.pico_port:
            raise DeviceConfigError(
                "serial.pico_port is not configured",
                http_detail=missing_pico_port_detail(
                    config,
                    command_type="pattern_start",
                    in_split_path=True,
                ),
            )
        lin_axis = self._ensure_xda(config, for_command="pattern_start")
        self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
        rotation_backend = self._rotation_backend(config)
        use_grbl = rotation_backend == "arduino_grbl" and not self._should_use_step_dir_protocol(rotation_backend)
        if use_grbl:
            if self._grbl.is_grbl_protocol():
                self._grbl.send_realtime(ord("?"))
            self._grbl_unlock_if_alarm()
        else:
            self._grbl.ensure_step_dir_ready()
        payload = self._build_payload(command, config)
        pattern = payload.get("pattern")
        if not isinstance(pattern, list):
            return payload
        if len(pattern) == 0:
            if use_grbl:
                self._grbl.send_line("G90")
            return payload

        async def _run() -> None:
            log = logging.getLogger(__name__)
            try:
                log.info("pattern_start (split USB): background sweep started (%d points)", len(pattern))
                await asyncio.to_thread(self._pattern_start_split_loop, lin_axis, config, pattern)
                log.info("pattern_start (split USB): background sweep finished OK")
            except Exception as exc:
                log.exception("pattern_start (split USB) failed")
                with self._pattern_bg_lock:
                    self._pattern_bg_error = f"pattern_start failed: {exc}"
            finally:
                with self._pattern_bg_lock:
                    self._pattern_bg_running = False

        background_tasks.add_task(_run)
        with self._pattern_bg_lock:
            self._pattern_bg_error = None
            self._pattern_bg_running = True
        out = dict(payload)
        out["accepted"] = True
        out["running_async"] = True
        out["bookend_home"] = self._pattern_bookend_home_enabled()
        return out

    def get_status(self, config: DeviceConfigSchema) -> DeviceStatusSchema:
        backend = self._rotation_backend(config)
        if self._is_split_usb(config):
            return self._get_status_split(config)
        if config.serial.pico_port and backend in {"arduino_grbl", "arduino_step_dir"}:
            try:
                self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
                if backend == "arduino_grbl" and self._grbl.is_grbl_protocol():
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

    def _get_status_split(self, config: DeviceConfigSchema) -> DeviceStatusSchema:
        last_err: str | None = None
        linear_mm: float | None = None

        if config.serial.pico_port:
            try:
                self._grbl.connect(config.serial.pico_port, config.serial.pico_baud)
                if self._rotation_backend(config) == "arduino_grbl" and self._grbl.is_grbl_protocol():
                    self._grbl.send_realtime(ord("?"))
            except DeviceConnectionError as exc:
                last_err = str(exc)
        grbl_snap = self._grbl.status_snapshot()

        port = (config.serial.linear_port or "").strip()
        if port:
            now = time.monotonic()
            should_probe = True
            with self._split_linear_probe_lock:
                if now < self._split_linear_next_probe_ts:
                    should_probe = False
                    linear_mm = self._split_linear_last_mm
                    if self._split_linear_last_error:
                        last_err = self._split_linear_last_error
            if should_probe:
                try:
                    # Same path as motion commands: INDX + SSPD on first USB session (see XD-OEM manual).
                    lin_axis = self._ensure_xda(config, for_command="status")
                    units = self._xda.query_epos(lin_axis)
                    if units is not None and units >= 0:
                        linear_mm = linear_units_to_mm(units, config)
                        with self._split_linear_probe_lock:
                            self._split_linear_last_mm = linear_mm
                            self._split_linear_last_error = None
                            self._split_linear_next_probe_ts = now + 0.5
                    elif units == -1:
                        last_err = "XDA encoder not valid (EPOS=-1): run index (INDX) and check encoder wiring/status."
                        with self._split_linear_probe_lock:
                            self._split_linear_last_error = last_err
                            self._split_linear_next_probe_ts = now + 3.0
                    else:
                        with self._split_linear_probe_lock:
                            self._split_linear_next_probe_ts = now + 1.0
                except (DeviceConfigError, DeviceConnectionError, OSError, ValueError) as exc:
                    last_err = str(exc)
                    with self._split_linear_probe_lock:
                        self._split_linear_last_error = last_err
                        self._split_linear_next_probe_ts = now + 3.0

        rotation_deg = (
            rotation_steps_to_deg(grbl_snap.rotation_pos_steps, config)
            if grbl_snap.rotation_pos_steps is not None
            else None
        )
        merged_err = grbl_snap.last_error
        if last_err:
            merged_err = f"{merged_err}; linear: {last_err}" if merged_err else f"linear: {last_err}"
        with self._pattern_bg_lock:
            bg_err = self._pattern_bg_error
            bg_run = self._pattern_bg_running
        if bg_err:
            merged_err = f"{merged_err}; {bg_err}" if merged_err else bg_err
        # Rotation link is primary for Arduino split setups; linear may be unplugged during rotary-only work.
        connected = bool(grbl_snap.connected and config.serial.pico_port)
        return DeviceStatusSchema(
            connected=connected,
            last_error=merged_err if merged_err else None,
            linear_position_mm=linear_mm,
            rotation_position_deg=rotation_deg,
            linear_moving=None,
            rotation_moving=grbl_snap.rotation_moving,
            last_update=grbl_snap.last_update,
            firmware_version=grbl_snap.firmware_version,
            sweep_program_running=bg_run,
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
        if cmd_type == "set_home":
            return {"type": "set_home", "axis": axis}
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
            self._wait_grbl_idle(timeout_s=600.0)
            return
        if cmd_type == "set_home":
            if axis != "rotation":
                raise DeviceConfigError("GRBL backend supports rotation axis only")
            self._grbl.send_line("G92 X0")
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
            self._wait_grbl_idle()
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
                self._wait_grbl_idle()
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
