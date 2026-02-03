"""Grid Generator API: standalone grid generation (no image)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.schemas.grid_generator import (
    GridGeneratorRequestSchema,
    GridGeneratorResponseSchema,
    GridGeneratorParamsSchema,
    GridSpotSchema,
)
from app.services.grid_generator import generate_grid, GridSpot

router = APIRouter()


def _require_auth(request: Request) -> None:
    """Raise 401 if not authenticated."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )


def _spot_to_schema(s: GridSpot) -> GridSpotSchema:
    return GridSpotSchema(
        sequence_index=s.sequence_index,
        x_mm=s.x_mm,
        y_mm=s.y_mm,
        theta_deg=s.theta_deg,
        t_mm=s.t_mm,
        mask_id=None,
        component_id=None,
    )


@router.post("/generate", response_model=GridGeneratorResponseSchema)
def generate_grid_endpoint(payload: GridGeneratorRequestSchema, request: Request) -> GridGeneratorResponseSchema:
    """
    Generate grid for simple (12×12 mm) or advanced (25 mm diameter) aperture.
    Auth required. No image or masks.
    """
    _require_auth(request)

    result = generate_grid(
        aperture_type=payload.aperture_type,
        spot_diameter_um=payload.spot_diameter_um,
        target_coverage_pct=payload.target_coverage_pct,
        axis_distance_mm=payload.axis_distance_mm,
        angle_step_deg=payload.angle_step_deg,
    )

    return GridGeneratorResponseSchema(
        spots=[_spot_to_schema(s) for s in result.spots],
        spots_count=result.spots_count,
        achieved_coverage_pct=result.achieved_coverage_pct,
        params=GridGeneratorParamsSchema(**result.params),
    )
