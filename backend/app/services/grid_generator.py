"""
Standalone grid generator for two handpiece apertures.

No image or masks required. Generates emission points from geometric parameters.
- Simple: 12×12 mm rectangle, regular XY grid, boustrophedon order.
- Advanced: 25 mm diameter circle, diameter lines, candidate-based selection.

Refs: .ai/grid-generator-implementation-plan.md
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from app.services.plan_grid import (
    APERTURE_RADIUS_MM,
    MaskPolygon,
    generate_plan,
)

# Simple aperture: 12×12 mm rectangle
SIMPLE_WIDTH_MM = 12.0
SIMPLE_HEIGHT_MM = 12.0
SIMPLE_AREA_MM2 = SIMPLE_WIDTH_MM * SIMPLE_HEIGHT_MM

# Advanced aperture: 25 mm diameter circle (reuse plan_grid constant)
ADVANCED_AREA_MM2 = math.pi * APERTURE_RADIUS_MM**2


def _spot_area_mm2(spot_diameter_um: int) -> float:
    """Spot area in mm² from diameter in µm."""
    r_mm = (spot_diameter_um / 1000.0) / 2.0
    return math.pi * r_mm * r_mm


def _circle_polygon(cx: float, cy: float, radius_mm: float, n_vertices: int = 360) -> list[tuple[float, float]]:
    """Vertices approximating a circle (center mm, +y up)."""
    verts: list[tuple[float, float]] = []
    for i in range(n_vertices):
        angle = 2 * math.pi * i / n_vertices
        x = cx + radius_mm * math.cos(angle)
        y = cy + radius_mm * math.sin(angle)
        verts.append((x, y))
    return verts


@dataclass
class GridSpot:
    """Single spot for grid generator response."""

    sequence_index: int
    x_mm: float
    y_mm: float
    theta_deg: float
    t_mm: float
    mask_id: None = None
    component_id: None = None


@dataclass
class GridGeneratorResult:
    """Result of grid generation."""

    spots: list[GridSpot]
    spots_count: int
    achieved_coverage_pct: float
    params: dict


def _simple_valid_region(spot_diameter_um: int) -> tuple[float, float, float, float]:
    """
    Return (x_min, x_max, y_min, y_max) for spot centers so entire spot fits inside 12×12.
    Spot radius r = diameter/2; valid center region [r, 12-r] × [r, 12-r].
    """
    r_mm = (spot_diameter_um / 1000.0) / 2.0
    return (r_mm, SIMPLE_WIDTH_MM - r_mm, r_mm, SIMPLE_HEIGHT_MM - r_mm)


def _generate_simple_grid_with_spacing(
    axis_distance_mm: float,
    spot_diameter_um: int,
) -> tuple[list[tuple[float, float]], float]:
    """
    Generate grid points entirely inside aperture (spots fit within 12×12).
    Returns (candidates, achieved_coverage_pct).
    Grid is centered in the valid region [r, 12-r] × [r, 12-r].
    """
    spot_area = _spot_area_mm2(spot_diameter_um)
    x_min, x_max, y_min, y_max = _simple_valid_region(spot_diameter_um)
    d = max(axis_distance_mm, 1e-6)

    candidates: list[tuple[float, float]] = []
    x = x_min
    while x <= x_max + 1e-9:
        y = y_min
        while y <= y_max + 1e-9:
            candidates.append((x, y))
            y += d
        x += d

    if candidates:
        xs = [p[0] for p in candidates]
        ys = [p[1] for p in candidates]
        grid_cx = (min(xs) + max(xs)) / 2.0
        grid_cy = (min(ys) + max(ys)) / 2.0
        target_cx, target_cy = 6.0, 6.0
        offset_x = target_cx - grid_cx
        offset_y = target_cy - grid_cy
        offset_x = max(x_min - min(xs), min(x_max - max(xs), offset_x))
        offset_y = max(y_min - min(ys), min(y_max - max(ys), offset_y))
        candidates = [(px + offset_x, py + offset_y) for px, py in candidates]

    n = len(candidates)
    achieved = (100.0 * n * spot_area / SIMPLE_AREA_MM2) if n > 0 else 0.0
    return candidates, achieved


def generate_grid_simple(
    spot_diameter_um: int,
    *,
    target_coverage_pct: float | None = None,
    axis_distance_mm: float | None = None,
) -> GridGeneratorResult:
    """
    Generate grid for simple aperture (12×12 mm rectangle).

    User provides EITHER target_coverage_pct OR axis_distance_mm.
    - If axis_distance_mm: fill aperture with that spacing, report achieved coverage.
    - If target_coverage_pct: find axis_distance to hit target, report it.

    All treatment points fit entirely inside aperture (spot centers in [r, 12-r]×[r, 12-r]).
    Emission order: boustrophedon.
    """
    if target_coverage_pct is None and axis_distance_mm is None:
        raise ValueError("Provide either target_coverage_pct or axis_distance_mm")
    if target_coverage_pct is not None and axis_distance_mm is not None:
        raise ValueError("Provide only one: target_coverage_pct or axis_distance_mm")

    spot_area = _spot_area_mm2(spot_diameter_um)
    x_min, x_max, y_min, y_max = _simple_valid_region(spot_diameter_um)

    if axis_distance_mm is not None:
        # User provided spacing: use it, fill aperture
        candidates, achieved = _generate_simple_grid_with_spacing(axis_distance_mm, spot_diameter_um)
        used_axis_distance = axis_distance_mm
        used_target = achieved
    else:
        # User provided target coverage: binary search axis_distance
        target_n = max(1, int(round((target_coverage_pct / 100.0) * SIMPLE_AREA_MM2 / spot_area)))
        d_lo, d_hi = 0.3, 5.0
        best_candidates: list[tuple[float, float]] = []
        best_d = 0.8
        for _ in range(25):
            d_mid = (d_lo + d_hi) / 2.0
            cand, _ = _generate_simple_grid_with_spacing(d_mid, spot_diameter_um)
            n = len(cand)
            if not best_candidates or abs(n - target_n) < abs(len(best_candidates) - target_n):
                best_candidates = cand
                best_d = d_mid
            if n > target_n:
                d_lo = d_mid
            else:
                d_hi = d_mid
        candidates = best_candidates
        used_axis_distance = best_d
        used_target = target_coverage_pct
        achieved = (100.0 * len(candidates) * spot_area / SIMPLE_AREA_MM2) if candidates else 0.0

    # Boustrophedon order (use actual grid extent after centering)
    d = used_axis_distance
    cand_ys = [p[1] for p in candidates]
    grid_y_min = min(cand_ys) if candidates else y_min

    def _boustrophedon_key(p: tuple[float, float]) -> tuple[float, float]:
        x, y = p
        row_idx = round((y - grid_y_min) / d) if d > 0 else 0
        x_sort = x if row_idx % 2 == 0 else -x
        return (y, x_sort)

    candidates.sort(key=_boustrophedon_key)

    cx_tl, cy_tl = 6.0, 6.0
    spots: list[GridSpot] = []
    for seq_idx, (x_tl, y_tl) in enumerate(candidates):
        dx = x_tl - cx_tl
        dy = y_tl - cy_tl
        t_mm = math.hypot(dx, dy)
        theta_deg = math.degrees(math.atan2(dy, dx))
        spots.append(
            GridSpot(
                sequence_index=seq_idx,
                x_mm=x_tl,
                y_mm=y_tl,
                theta_deg=theta_deg,
                t_mm=t_mm,
            )
        )

    return GridGeneratorResult(
        spots=spots,
        spots_count=len(spots),
        achieved_coverage_pct=round(achieved, 2),
        params={
            "aperture_type": "simple",
            "spot_diameter_um": spot_diameter_um,
            "target_coverage_pct": round(achieved, 2),
            "axis_distance_mm": round(used_axis_distance, 4),
            "angle_step_deg": None,
        },
    )


def generate_grid_advanced(
    angle_step_deg: int,
    spot_diameter_um: int,
    target_coverage_pct: float,
) -> GridGeneratorResult:
    """
    Generate grid for advanced aperture (25 mm diameter circle).

    - Origin: center (0, 0); radius 12.5 mm.
    - Diameter lines at 0°, angle_step°, 2×angle_step°, … up to 175°.
    - Candidate-based selection with target_coverage_pct.
    - Reuses plan_grid logic with full-aperture circle mask.
    """
    spot_diameter_mm = spot_diameter_um / 1000.0
    circle_verts = _circle_polygon(0.0, 0.0, APERTURE_RADIUS_MM)
    full_aperture_mask = MaskPolygon(mask_id=0, vertices=circle_verts, mask_label=None)

    plan = generate_plan(
        masks=[full_aperture_mask],
        target_coverage_pct=target_coverage_pct,
        coverage_per_mask=None,
        image_width_mm=25.0,
        angle_step_deg=angle_step_deg,
        spot_diameter_mm=spot_diameter_mm,
        use_unison_grid=True,
    )

    spots: list[GridSpot] = []
    for seq_idx, s in enumerate(plan.spots):
        spots.append(
            GridSpot(
                sequence_index=seq_idx,
                x_mm=s.x_mm,
                y_mm=s.y_mm,
                theta_deg=s.theta_deg,
                t_mm=s.t_mm,
            )
        )

    achieved = plan.achieved_coverage_pct or 0.0

    return GridGeneratorResult(
        spots=spots,
        spots_count=plan.spots_count,
        achieved_coverage_pct=round(achieved, 2),
        params={
            "aperture_type": "advanced",
            "spot_diameter_um": spot_diameter_um,
            "target_coverage_pct": target_coverage_pct,
            "axis_distance_mm": None,
            "angle_step_deg": angle_step_deg,
        },
    )


def generate_grid(
    aperture_type: Literal["simple", "advanced"],
    spot_diameter_um: int,
    target_coverage_pct: float | None = None,
    axis_distance_mm: float | None = None,
    angle_step_deg: int | None = None,
) -> GridGeneratorResult:
    """Dispatch to simple or advanced grid generator."""
    if aperture_type == "simple":
        if target_coverage_pct is None and axis_distance_mm is None:
            raise ValueError("Provide either target_coverage_pct or axis_distance_mm for simple aperture")
        if target_coverage_pct is not None and axis_distance_mm is not None:
            raise ValueError("Provide only one: target_coverage_pct or axis_distance_mm")
        return generate_grid_simple(
            spot_diameter_um,
            target_coverage_pct=target_coverage_pct,
            axis_distance_mm=axis_distance_mm,
        )
    if aperture_type == "advanced":
        if angle_step_deg is None:
            raise ValueError("angle_step_deg required for advanced aperture")
        return generate_grid_advanced(angle_step_deg, spot_diameter_um, target_coverage_pct)
    raise ValueError(f"Unknown aperture_type: {aperture_type}")
