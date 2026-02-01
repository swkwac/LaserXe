"""Pydantic schemas for Masks API (request/response)."""

from __future__ import annotations

import json

from pydantic import BaseModel, ConfigDict, Field


class MaskVertexSchema(BaseModel):
    x: float
    y: float


class MaskSchema(BaseModel):
    """Single mask response (MaskDto)."""

    id: int
    image_id: int
    vertices: list[MaskVertexSchema]
    mask_label: str | None
    created_at: str


class MaskListSchema(BaseModel):
    """List of masks (MaskListResponseDto)."""

    items: list[MaskSchema]


class MaskCreateSchema(BaseModel):
    """POST body: create mask."""

    model_config = ConfigDict(extra="forbid")

    vertices: list[MaskVertexSchema] = Field(min_length=3)
    mask_label: str | None = None


class MaskUpdateSchema(BaseModel):
    """PATCH body: partial update (vertices, mask_label)."""

    model_config = ConfigDict(extra="forbid")

    vertices: list[MaskVertexSchema] | None = None
    mask_label: str | None = None
