"""Device position presets and pattern storage."""

from __future__ import annotations

import json
from pathlib import Path

from app.schemas.device import DevicePatternSchema, DevicePositionPresetSchema

PRESETS_PATH = Path(__file__).resolve().parents[2] / "device_presets.json"
PATTERNS_PATH = Path(__file__).resolve().parents[2] / "device_patterns.json"


def _load_json(path: Path, default: list) -> list:
    if not path.exists():
        return default
    try:
        raw = path.read_text(encoding="utf-8")
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError, TypeError):
        return default


def _save_json(path: Path, data: list) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_presets() -> list[DevicePositionPresetSchema]:
    data = _load_json(PRESETS_PATH, [])
    result = []
    for item in data:
        if isinstance(item, dict) and "name" in item and "linear_mm" in item and "rotation_deg" in item:
            result.append(DevicePositionPresetSchema(**item))
    return result


def save_presets(presets: list[DevicePositionPresetSchema]) -> list[DevicePositionPresetSchema]:
    data = [p.model_dump() for p in presets]
    _save_json(PRESETS_PATH, data)
    return presets


def load_patterns() -> list[DevicePatternSchema]:
    data = _load_json(PATTERNS_PATH, [])
    result = []
    for item in data:
        if isinstance(item, dict) and "name" in item and "waypoints" in item:
            result.append(DevicePatternSchema(**item))
    return result


def save_patterns(patterns: list[DevicePatternSchema]) -> list[DevicePatternSchema]:
    data = [p.model_dump() for p in patterns]
    _save_json(PATTERNS_PATH, data)
    return patterns
