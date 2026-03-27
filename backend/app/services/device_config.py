"""Device configuration storage and derived values."""

from __future__ import annotations

import json
from pathlib import Path

from app.schemas.device import (
    DeviceConfigComputedSchema,
    DeviceConfigResponseSchema,
    DeviceConfigSchema,
    DeviceLinearAxisSchema,
    DeviceRotationAxisSchema,
    DeviceSerialConfigSchema,
)

CONFIG_PATH = Path(__file__).resolve().parents[2] / "device_config.json"

DEFAULT_CONFIG = DeviceConfigSchema(
    serial=DeviceSerialConfigSchema(
        pico_port=None,
        pico_baud=115200,
        rotation_backend="pico",
    ),
    linear=DeviceLinearAxisSchema(
        travel_min_mm=-12.5,
        travel_max_mm=12.5,
        encoder_resolution_nm=1250,
        xda_axis="X",
        in_position_tolerance_units=50,
        move_timeout_ms=5000,
    ),
    rotation=DeviceRotationAxisSchema(
        travel_min_deg=-90,
        travel_max_deg=90,
        motor_steps_per_rev=200,
        microsteps=16,
        gear_ratio=1.0,
        encoder_cpr=4096,
        max_speed_steps_per_s=2000.0,
        accel_steps_per_s2=8000.0,
        encoder_correction_threshold=0,
    ),
)


def load_device_config() -> DeviceConfigSchema:
    if not CONFIG_PATH.exists():
        return DEFAULT_CONFIG
    try:
        raw = CONFIG_PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
        return DeviceConfigSchema.model_validate(data)
    except (json.JSONDecodeError, ValueError, KeyError, TypeError):
        return DEFAULT_CONFIG


def save_device_config(config: DeviceConfigSchema) -> DeviceConfigSchema:
    CONFIG_PATH.write_text(json.dumps(config.model_dump(), indent=2), encoding="utf-8")
    return config


def compute_device_config(config: DeviceConfigSchema) -> DeviceConfigResponseSchema:
    linear_units_per_mm = 1_000_000 / config.linear.encoder_resolution_nm
    rotation_steps_per_deg = (
        config.rotation.motor_steps_per_rev * config.rotation.microsteps * config.rotation.gear_ratio
    ) / 360.0
    rotation_encoder_counts_per_deg = (config.rotation.encoder_cpr * config.rotation.gear_ratio) / 360.0
    computed = DeviceConfigComputedSchema(
        linear_units_per_mm=linear_units_per_mm,
        rotation_steps_per_deg=rotation_steps_per_deg,
        rotation_encoder_counts_per_deg=rotation_encoder_counts_per_deg,
    )
    return DeviceConfigResponseSchema(config=config, computed=computed)
