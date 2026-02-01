"""Pydantic schemas for Iterations API (request/response)."""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class IterationParamsSnapshotSchema(BaseModel):
    """Params snapshot (scale_mm, spot_diameter_um, etc.)."""

    scale_mm: float
    spot_diameter_um: float
    angle_step_deg: float
    coverage_pct: float | None = None
    coverage_per_mask: dict[str, float] | None = None
    algorithm_mode: Literal["simple", "advanced"] | None = None
    grid_spacing_mm: float | None = None


class IterationSchema(BaseModel):
    """Single iteration response (IterationDto)."""

    id: int
    image_id: int
    parent_id: int | None
    created_by: int | None
    status: str
    accepted_at: str | None
    accepted_by: int | None
    is_demo: int
    params_snapshot: IterationParamsSnapshotSchema | None = None
    target_coverage_pct: float | None
    achieved_coverage_pct: float | None
    spots_count: int | None
    spots_outside_mask_count: int | None
    overlap_count: int | None
    plan_valid: int
    created_at: str


class IterationListSchema(BaseModel):
    """Paginated list of iterations (IterationListResponseDto)."""

    items: list[IterationSchema]
    total: int
    page: int
    page_size: int


class IterationCreateSchema(BaseModel):
    """POST body: create iteration (generate plan)."""

    model_config = ConfigDict(extra="forbid")

    target_coverage_pct: float = Field(ge=3.0, le=20.0)
    coverage_per_mask: dict[str, float] | None = None
    is_demo: bool = False
    algorithm_mode: Literal["simple", "advanced"] = "simple"
    grid_spacing_mm: float | None = Field(None, ge=0.3, le=2.0)


class IterationUpdateSchema(BaseModel):
    """PATCH body: update iteration (e.g. status)."""

    model_config = ConfigDict(extra="forbid")

    status: str | None = Field(None, pattern="^(draft|accepted|rejected)$")


class IterationExportJsonSchema(BaseModel):
    """GET export?format=json response (IterationExportJsonDto)."""

    metadata: dict
    masks: list
    points: list
    metrics: dict
    validation: dict
