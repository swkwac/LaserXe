"""Pydantic schemas for device control (Pi ↔ Pico)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DeviceSerialConfigSchema(BaseModel):
    """Serial connection to the Pico."""

    model_config = ConfigDict(extra="forbid")

    pico_port: str | None = None
    pico_baud: int = Field(115200, ge=1200, le=1_000_000)
    rotation_backend: Literal["pico", "arduino_grbl"] = "pico"


class DeviceLinearAxisSchema(BaseModel):
    """Linear axis (XLA-1 via XD-OEM)."""

    model_config = ConfigDict(extra="forbid")

    travel_min_mm: float = Field(-12.5)
    travel_max_mm: float = Field(12.5)
    encoder_resolution_nm: int = Field(1250, ge=1)
    xda_axis: str = Field("X", min_length=1, max_length=1)
    max_speed_units: int | None = Field(None, ge=1)
    in_position_tolerance_units: int = Field(50, ge=1)
    move_timeout_ms: int = Field(5000, ge=100)

    @model_validator(mode="after")
    def validate_range(self) -> "DeviceLinearAxisSchema":
        if self.travel_min_mm >= self.travel_max_mm:
            raise ValueError("travel_min_mm must be smaller than travel_max_mm")
        return self


class DeviceRotationAxisSchema(BaseModel):
    """Rotational axis (stepper + encoder)."""

    model_config = ConfigDict(extra="forbid")

    travel_min_deg: float = Field(-90)
    travel_max_deg: float = Field(90)
    motor_steps_per_rev: int = Field(200, ge=1)
    microsteps: int = Field(16, ge=1)
    gear_ratio: float = Field(1.0, gt=0)
    encoder_cpr: int = Field(4096, ge=1)
    max_speed_steps_per_s: float = Field(2000.0, ge=1)
    accel_steps_per_s2: float = Field(8000.0, ge=1)
    encoder_correction_threshold: int = Field(0, ge=0)

    @model_validator(mode="after")
    def validate_range(self) -> "DeviceRotationAxisSchema":
        if self.travel_min_deg >= self.travel_max_deg:
            raise ValueError("travel_min_deg must be smaller than travel_max_deg")
        return self


class DeviceConfigSchema(BaseModel):
    """Full device configuration."""

    model_config = ConfigDict(extra="forbid")

    serial: DeviceSerialConfigSchema
    linear: DeviceLinearAxisSchema
    rotation: DeviceRotationAxisSchema


class DeviceConfigComputedSchema(BaseModel):
    """Derived values based on device config."""

    linear_units_per_mm: float
    rotation_steps_per_deg: float
    rotation_encoder_counts_per_deg: float


class DeviceConfigResponseSchema(BaseModel):
    """Config + computed values for UI."""

    config: DeviceConfigSchema
    computed: DeviceConfigComputedSchema


class DeviceWaypointSchema(BaseModel):
    """Single waypoint for a pattern run."""

    model_config = ConfigDict(extra="forbid")

    linear_mm: float
    rotation_deg: float
    dwell_ms: int | None = Field(0, ge=0)


class DeviceCommandSchema(BaseModel):
    """Command from UI to device."""

    model_config = ConfigDict(extra="forbid")

    type: Literal[
        "home",
        "move_abs",
        "move_rel",
        "stop",
        "emergency_stop",
        "jog",
        "jog_stop",
        "pattern_start",
        "pattern_cancel",
        "status",
    ]
    axis: Literal["linear", "rotation", "both"] | None = None
    value: float | None = None
    unit: Literal["mm", "deg"] | None = None
    speed: float | None = None
    pattern: list[DeviceWaypointSchema] | None = None

    @model_validator(mode="after")
    def validate_command(self) -> "DeviceCommandSchema":
        if self.type in {"move_abs", "move_rel"}:
            if self.axis not in {"linear", "rotation"}:
                raise ValueError("axis must be 'linear' or 'rotation' for move commands")
            if self.value is None:
                raise ValueError("value is required for move commands")
        if self.type == "home":
            if self.axis is None:
                raise ValueError("axis is required for home")
        if self.type == "jog":
            if self.axis not in {"linear", "rotation"}:
                raise ValueError("axis must be 'linear' or 'rotation' for jog")
            if self.value is None:
                raise ValueError("value (direction: +1 or -1) is required for jog")
        if self.type == "pattern_start":
            if not self.pattern:
                raise ValueError("pattern is required for pattern_start")
        return self


class DeviceCommandResponseSchema(BaseModel):
    """Ack to the UI."""

    ok: bool
    sent: dict
    message: str | None = None


class DevicePositionPresetSchema(BaseModel):
    """Saved position preset."""

    model_config = ConfigDict(extra="forbid")

    name: str
    linear_mm: float
    rotation_deg: float


class DevicePatternSchema(BaseModel):
    """Saved pattern for recall."""

    model_config = ConfigDict(extra="forbid")

    name: str
    waypoints: list[DeviceWaypointSchema]


class DeviceStatusSchema(BaseModel):
    """Current device status (converted to mm/deg)."""

    connected: bool
    last_error: str | None = None
    linear_position_mm: float | None = None
    rotation_position_deg: float | None = None
    linear_moving: bool | None = None
    rotation_moving: bool | None = None
    last_update: datetime | None = None
    firmware_version: str | None = None
