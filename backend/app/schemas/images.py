"""Pydantic schemas for Images API (request/response)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ImageSchema(BaseModel):
    """Single image response (ImageDto)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    storage_path: str
    width_mm: float
    created_by: int | None
    created_at: str


class PagedImagesSchema(BaseModel):
    """Paginated list of images (ImageListResponseDto)."""

    items: list[ImageSchema]
    total: int
    page: int
    page_size: int


class ImageUpdateSchema(BaseModel):
    """PATCH body for image (width_mm)."""

    model_config = ConfigDict(extra="forbid")

    width_mm: float | None = Field(default=None, gt=0)
