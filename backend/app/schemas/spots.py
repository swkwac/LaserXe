"""Pydantic schemas for Spots API (response)."""

from __future__ import annotations

from pydantic import BaseModel


class SpotSchema(BaseModel):
    """Single spot (SpotDto)."""

    id: int
    iteration_id: int
    sequence_index: int
    x_mm: float
    y_mm: float
    theta_deg: float
    t_mm: float
    mask_id: int | None
    component_id: int | None
    created_at: str


class SpotsListSchema(BaseModel):
    """List of spots (IterationSpotsResponseDto)."""

    items: list[SpotSchema]
