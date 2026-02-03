"""Pydantic schemas for Grid Generator API (request/response)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GridGeneratorRequestSchema(BaseModel):
    """POST body: generate grid (standalone, no image)."""

    model_config = ConfigDict(extra="forbid")

    aperture_type: Literal["simple", "advanced"]
    spot_diameter_um: Literal[300, 150] = 300
    target_coverage_pct: float | None = Field(None, ge=0.1, le=100.0)
    axis_distance_mm: float | None = Field(None, ge=0.3, le=5.0)
    angle_step_deg: int | None = Field(None, ge=3, le=20)

    @model_validator(mode="after")
    def simple_requires_one_of_coverage_or_spacing(self) -> "GridGeneratorRequestSchema":
        if self.aperture_type == "simple":
            has_coverage = self.target_coverage_pct is not None
            has_spacing = self.axis_distance_mm is not None
            if has_coverage and has_spacing:
                raise ValueError("Provide only one: target_coverage_pct or axis_distance_mm")
            if not has_coverage and not has_spacing:
                raise ValueError("Provide either target_coverage_pct or axis_distance_mm")
        return self

    @model_validator(mode="after")
    def advanced_requires_coverage_and_angle(self) -> "GridGeneratorRequestSchema":
        if self.aperture_type == "advanced":
            if self.target_coverage_pct is None:
                raise ValueError("target_coverage_pct required for advanced aperture")
            if self.angle_step_deg is None:
                raise ValueError("angle_step_deg required for advanced aperture")
        return self


class GridSpotSchema(BaseModel):
    """Single spot in grid generator response."""

    sequence_index: int
    x_mm: float
    y_mm: float
    theta_deg: float
    t_mm: float
    mask_id: None = None
    component_id: None = None


class GridGeneratorParamsSchema(BaseModel):
    """Echo of params used for generation."""

    aperture_type: Literal["simple", "advanced"]
    spot_diameter_um: int
    target_coverage_pct: float
    axis_distance_mm: float | None
    angle_step_deg: int | None


class GridGeneratorResponseSchema(BaseModel):
    """Response: spots, count, achieved coverage, params."""

    spots: list[GridSpotSchema]
    spots_count: int
    achieved_coverage_pct: float
    params: GridGeneratorParamsSchema
