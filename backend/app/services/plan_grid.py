"""
Plan grid and emission sequence algorithm.

Design: linear motor (carriage) + rotational motor. Treatment area = 25 mm diameter circle.
Spots = 300 µm diameter; axes every 5°; carriage moves along diameter, emits then rotates.

Refs: .ai/instrukcje generowania siatki.md, .ai/succesful point and animation algorythm.md.txt

- Units: mm. spot_diameter_mm = 0.3; min_dist_mm = spot_diameter_mm * 1.05.
- Center: centroid of included masks; fallback = (0, 0) image center in mm.
  Vertices and spots are in center mm (+y up); API converts to/from top-left mm at boundaries.
- Axis: P(t) = center + t * dir; t in [-R, +R], R = 12.5 mm.
- Emission order: 36 diameters 0° to 175° (step 5°); each diameter is full line through center (θ and θ+180° joined); t alternates (even: asc, odd: desc).
- Points: diameter-line approach (reference). Uniform spacing along each diameter t ∈ [-R, +R].
  Candidates at 0.2 mm step; greedy select + binary search on min_dist per mask to hit target.
  Per-mask processing with avoid_xy.
- Emission order: (theta_k, t_sort) with t_sort = ± t_mm by line parity.
- Min mask: 0.5% aperture; discard masks < 1% of total mask surface.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

# Aperture 25 mm diameter → radius 12.5 mm
APERTURE_RADIUS_MM = 12.5
APERTURE_AREA_MM2 = math.pi * APERTURE_RADIUS_MM**2
# Min mask area: 0.5% aperture so small drawn masks still get spots
MIN_MASK_PCT_APERTURE = 0.5
# Discard masks smaller than 1% of total mask surface (per user: avoid interference)
MIN_MASK_PCT_OF_TOTAL = 1.0

# Spot 300 µm diameter; min distance for no-overlap (margin 1.05 per doc)
SPOT_DIAMETER_MM = 0.3
SPOT_RADIUS_MM = SPOT_DIAMETER_MM / 2
SPOT_AREA_MM2 = math.pi * SPOT_RADIUS_MM**2
MIN_DIST_MM = SPOT_DIAMETER_MM * 1.05

# Diameters every 5°; order per instrukcje: [0, +Δθ, -Δθ, +2Δθ, -2Δθ, ...]
ANGLE_STEP_DEG = 5

# Advanced mode: candidate sampling along each diameter (reference: working_lesion_spot_planner)
# Dense sampling (0.2 mm) + greedy select_points yields even spacing on the lesion
CANDIDATE_STEP_MM = 0.2

# Simple mode: regular XY grid spacing 800 µm
SIMPLE_GRID_SPACING_MM = 0.8


def _angles_0_to_180(step_deg: int) -> list[float]:
    """Return angles from 0° to 180° (exclusive): 0°, step°, 2*step°, ..., 175° (reference convention)."""
    out: list[float] = []
    a = 0.0
    while a < 180.0 - 1e-9:
        out.append(a)
        a += float(step_deg)
    return out


def _angles_full_circle(step_deg: int) -> list[float]:
    """Return angles from 0° to 360° (exclusive): 0°, step°, ..., 355° for full circle coverage."""
    out: list[float] = []
    a = 0.0
    while a < 360.0 - 1e-9:
        out.append(a)
        a += float(step_deg)
    return out


@dataclass
class MaskPolygon:
    """Mask with vertices in mm and optional label/id."""

    mask_id: int
    vertices: list[tuple[float, float]]
    mask_label: str | None = None


def _polygon_area(vertices: list[tuple[float, float]]) -> float:
    """Shoelace formula; vertices in mm. Returns area in mm² (absolute value)."""
    if len(vertices) < 3:
        return 0.0
    n = len(vertices)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += vertices[i][0] * vertices[j][1]
        area -= vertices[j][0] * vertices[i][1]
    return abs(area) / 2.0


def _point_in_polygon(px: float, py: float, vertices: list[tuple[float, float]]) -> bool:
    """Ray casting: odd number of crossings = inside."""
    n = len(vertices)
    if n < 3:
        return False
    inside = False
    x1, y1 = vertices[0]
    for i in range(1, n + 1):
        x2, y2 = vertices[i % n]
        if min(y1, y2) < py <= max(y1, y2) and px <= max(x1, x2):
            if y1 != y2:
                x_intersect = (py - y1) * (x2 - x1) / (y2 - y1) + x1
            if y1 == y2 or px <= x_intersect:
                inside = not inside
        x1, y1 = x2, y2
    return inside


def _centroid(vertices: list[tuple[float, float]]) -> tuple[float, float]:
    """Centroid of polygon (vertices in mm)."""
    if not vertices:
        return (0.0, 0.0)
    n = len(vertices)
    cx = sum(v[0] for v in vertices) / n
    cy = sum(v[1] for v in vertices) / n
    return (cx, cy)


def _line_intersect_edge(
    cx: float, cy: float, cos_t: float, sin_t: float,
    x1: float, y1: float, x2: float, y2: float,
) -> float | None:
    """Intersection of line (cx + t*cos_t, cy + t*sin_t) with edge (x1,y1)-(x2,y2). Returns t or None."""
    denom = cos_t * (y2 - y1) - sin_t * (x2 - x1)
    if abs(denom) < 1e-12:
        return None
    t = ((cy - y1) * (x2 - x1) - (cx - x1) * (y2 - y1)) / denom
    s = ((cx - x1) + t * cos_t) / (x2 - x1) if abs(x2 - x1) >= 1e-12 else ((cy - y1) + t * sin_t) / (y2 - y1)
    if 0 <= s <= 1:
        return t
    return None


def _clip_line_to_polygon(
    cx: float, cy: float, cos_t: float, sin_t: float,
    vertices: list[tuple[float, float]], r_min: float, r_max: float,
) -> list[tuple[float, float]]:
    """
    Clip line (cx + t*cos, cy + t*sin) to polygon. Return list of (t_start, t_end) segments
    with t in [r_min, r_max]. Segments are disjoint and ordered by t.
    """
    ts: list[float] = []
    n = len(vertices)
    for i in range(n):
        x1, y1 = vertices[i]
        x2, y2 = vertices[(i + 1) % n]
        t = _line_intersect_edge(cx, cy, cos_t, sin_t, x1, y1, x2, y2)
        if t is not None and r_min <= t <= r_max:
            ts.append(t)
    ts = sorted(set(ts))
    segments: list[tuple[float, float]] = []
    for i in range(len(ts) - 1):
        t_a, t_b = ts[i], ts[i + 1]
        mid_t = (t_a + t_b) / 2
        mx = cx + mid_t * cos_t
        my = cy + mid_t * sin_t
        if _point_in_polygon(mx, my, vertices):
            segments.append((t_a, t_b))
    return segments


def _place_points_on_segment(
    t_start: float, t_end: float, spacing_mm: float,
    cx: float, cy: float, cos_t: float, sin_t: float, theta_deg: float,
    mask_id: int,
) -> list[tuple[float, float, float, float, int]]:
    """
    Place points along segment [t_start, t_end] with uniform spacing (linear t).
    Section 6.3: t = -R, -R+spacing, ... , +R. Reference grid (lesion5_theta5deg_motion.csv)
    uses linear t along each diameter segment for correct grid pattern.
    Return (x_mm, y_mm, theta_deg, t_mm, mask_id).
    """
    if spacing_mm <= 0:
        spacing_mm = MIN_DIST_MM
    t_lo, t_hi = min(t_start, t_end), max(t_start, t_end)
    points: list[tuple[float, float, float, float, int]] = []
    t = t_lo
    while t <= t_hi + 1e-9:
        x = cx + t * cos_t
        y = cy + t * sin_t
        points.append((x, y, theta_deg, t, mask_id))
        t += spacing_mm
    if t_start > t_end:
        points.reverse()
    return points


@dataclass
class SpotRecord:
    """Single spot for DB insert."""

    x_mm: float
    y_mm: float
    theta_deg: float
    t_mm: float
    mask_id: int | None


@dataclass
class PlanResult:
    """Result of plan generation."""

    spots: list[SpotRecord] = field(default_factory=list)
    achieved_coverage_pct: float | None = None
    spots_count: int = 0
    spots_outside_mask_count: int = 0
    overlap_count: int = 0
    plan_valid: int = 0
    fallback_used: bool = False


def _mask_area_pct_of_aperture(area_mm2: float) -> float:
    return 100.0 * area_mm2 / APERTURE_AREA_MM2


def _grid_cell(x_mm: float, y_mm: float, cell_size: float) -> tuple[int, int]:
    """Cell index for spatial hash."""
    return (int(math.floor(x_mm / cell_size)), int(math.floor(y_mm / cell_size)))


def _build_candidate_lines_for_mask(
    m: MaskPolygon,
    cx: float,
    cy: float,
    angles_ordered: list[float],
    r_min: float,
    r_max: float,
    candidate_step_mm: float,
) -> list[tuple[int, float, list[tuple[float, float, float]]]]:
    """
    Build candidate lines for one mask (reference: build_candidate_lines).
    Returns list of (k, theta_deg, candidates) where candidates = [(t, x, y), ...].
    For odd k, candidates are reversed so t traverses high-to-low (alternating sweep).
    """
    lines: list[tuple[int, float, list[tuple[float, float, float]]]] = []
    for k, theta_deg in enumerate(angles_ordered):
        rad = math.radians(theta_deg)
        cos_t = math.cos(rad)
        sin_t = math.sin(rad)
        segs = _clip_line_to_polygon(cx, cy, cos_t, sin_t, m.vertices, r_min, r_max)
        cand: list[tuple[float, float, float]] = []
        for (ta, tb) in segs:
            t_lo, t_hi = min(ta, tb), max(ta, tb)
            t_val = t_lo
            while t_val <= t_hi + 1e-9:
                x = cx + t_val * cos_t
                y = cy + t_val * sin_t
                if r_min <= t_val <= r_max and (x - cx) ** 2 + (y - cy) ** 2 <= APERTURE_RADIUS_MM**2 + 1e-9:
                    cand.append((t_val, x, y))
                t_val += candidate_step_mm
        if k % 2 == 1:
            cand = list(reversed(cand))
        lines.append((k, theta_deg, cand))
    return lines


def _build_candidates_polar_uniform(
    m: MaskPolygon,
    cx: float,
    cy: float,
    angles_ordered: list[float],
    spacing_mm: float,
    r_max: float,
) -> list[tuple[float, float, float, float, int]]:
    """
    Build candidates on a polar grid for uniform 2D spacing.

    - Rings at r = 0, spacing_mm, 2*spacing_mm, ... up to r_max.
    - On each ring: arc length between points ≈ spacing_mm, so n = floor(2πr/spacing_mm).
    - Angles aligned with machine diameters (angles_ordered); at small r we use fewer
      diameters to avoid oversampling (angular distance r*Δθ would be < spacing_mm).
    - Returns (x_mm, y_mm, theta_deg, t_mm, mask_id) for emission-order compatibility.
    """
    n_angles = len(angles_ordered)
    if n_angles == 0:
        return []

    candidates: list[tuple[float, float, float, float, int]] = []
    r = 0.0
    while r <= r_max + 1e-9:
        if r < 1e-6:
            # Center: single point
            if _point_in_polygon(cx, cy, m.vertices):
                candidates.append((cx, cy, angles_ordered[0], 0.0, m.mask_id))
        else:
            # Ring at radius r: n points with arc length ≈ spacing_mm
            n_on_ring = max(1, min(n_angles, int(2 * math.pi * r / spacing_mm)))
            # Pick diameter indices evenly: 0, step, 2*step, ... where step = n_angles/n_on_ring
            step = n_angles / n_on_ring if n_on_ring > 0 else 1
            for i in range(n_on_ring):
                idx = min(int(round(i * step)), n_angles - 1)
                theta_deg = angles_ordered[idx]
                rad = math.radians(theta_deg)
                x = cx + r * math.cos(rad)
                y = cy + r * math.sin(rad)
                if (x - cx) ** 2 + (y - cy) ** 2 <= r_max**2 + 1e-9 and _point_in_polygon(
                    x, y, m.vertices
                ):
                    candidates.append((x, y, theta_deg, r, m.mask_id))
        r += spacing_mm
    return candidates


def _select_points_from_lines(
    lines: list[tuple[int, float, list[tuple[float, float, float]]]],
    min_dist_mm: float,
    avoid_xy: list[tuple[float, float]],
    mask_id: int,
) -> list[tuple[float, float, float, float, int]]:
    """
    Greedy selection along each line (reference: select_points).
    Walk candidates in order; take first valid (min_dist from last on line, from avoid, from selected).
    Returns (x, y, theta_deg, t, mask_id).
    """
    min2 = min_dist_mm * min_dist_mm
    selected: list[tuple[float, float, float, float, int]] = []
    for _, th_deg, cand in lines:
        last_t: float | None = None
        for t, x, y in cand:
            if last_t is not None and abs(t - last_t) < min_dist_mm:
                continue
            if any((x - ax) ** 2 + (y - ay) ** 2 < min2 for ax, ay in avoid_xy):
                continue
            if any((x - s[0]) ** 2 + (y - s[1]) ** 2 < min2 for s in selected):
                continue
            selected.append((x, y, th_deg, t, mask_id))
            last_t = t
    return selected


def _select_points_from_polar_candidates(
    candidates: list[tuple[float, float, float, float, int]],
    min_dist_mm: float,
    avoid_xy: list[tuple[float, float]],
) -> list[tuple[float, float, float, float, int]]:
    """
    Greedy selection from polar candidates for uniform spacing.
    Process in (|t|, θ) order (center outward) so selection is spatially balanced.
    Returns (x, y, theta_deg, t_mm, mask_id).
    """
    if not candidates:
        return []
    min2 = min_dist_mm * min_dist_mm
    # Sort by |t| (radius) asc, then theta asc for center-outward processing
    sorted_cand = sorted(candidates, key=lambda c: (abs(c[3]), c[2]))
    selected: list[tuple[float, float, float, float, int]] = []
    for x, y, th_deg, t_mm, mask_id in sorted_cand:
        if any((x - ax) ** 2 + (y - ay) ** 2 < min2 for ax, ay in avoid_xy):
            continue
        if any((x - s[0]) ** 2 + (y - s[1]) ** 2 < min2 for s in selected):
            continue
        selected.append((x, y, th_deg, t_mm, mask_id))
    return selected


def _tune_spacing_polar(
    m: MaskPolygon,
    cx: float,
    cy: float,
    angles_ordered: list[float],
    angle_step_deg: int,
    target_n: int,
    avoid_xy: list[tuple[float, float]],
    r_max: float,
    min_dist_mm: float,
    max_iter: int = 18,
) -> list[tuple[float, float, float, float, int]]:
    """
    Binary search on spacing_mm to hit target_n spots using polar uniform grid
    (chord-based diameter subsampling, same as full-aperture / grid generator).
    """
    lo, hi = min_dist_mm, 5.0
    best: list[tuple[float, float, float, float, int]] = []
    for _ in range(max_iter):
        mid = (lo + hi) / 2.0
        mid = max(mid, min_dist_mm)
        cand = _build_candidates_polar_uniform_constrained(
            cx, cy,
            angles_ordered=angles_ordered,
            spacing_mm=mid,
            r_max=r_max,
            angle_step_deg=angle_step_deg,
            mask_id=m.mask_id,
            mask_vertices=m.vertices,
        )
        sel = _select_points_from_polar_candidates(cand, min_dist_mm, avoid_xy)
        if not best or abs(len(sel) - target_n) < abs(len(best) - target_n):
            best = sel
        if len(sel) > target_n:
            lo = mid
        else:
            hi = mid
    return best


def _tune_min_dist(
    lines: list[tuple[int, float, list[tuple[float, float, float]]]],
    target_n: int,
    avoid_xy: list[tuple[float, float]],
    mask_id: int,
    max_iter: int = 18,
    min_dist_mm: float | None = None,
) -> list[tuple[float, float, float, float, int]]:
    """
    Binary search on min_dist to hit target_n spots (reference: tune_min_dist).
    """
    min_d = min_dist_mm if min_dist_mm is not None else MIN_DIST_MM
    lo, hi = SPOT_DIAMETER_MM, 5.0
    best: list[tuple[float, float, float, float, int]] = []
    for _ in range(max_iter):
        mid = (lo + hi) / 2.0
        mid = max(mid, min_d)
        sel = _select_points_from_lines(lines, mid, avoid_xy, mask_id)
        if not best or abs(len(sel) - target_n) < abs(len(best) - target_n):
            best = sel
        if len(sel) > target_n:
            lo = mid
        else:
            hi = mid
    return best


def _generate_spots_for_one_mask(
    m: MaskPolygon,
    cx: float,
    cy: float,
    spacing_mm: float,
    angles_ordered: list[float],
    r_min: float,
    r_max: float,
) -> list[tuple[float, float, float, float, int | None]]:
    """Generate spot candidates for one mask with given spacing (legacy: uniform spacing)."""
    spots: list[tuple[float, float, float, float, int | None]] = []
    for theta_deg in angles_ordered:
        rad = math.radians(theta_deg)
        cos_t = math.cos(rad)
        sin_t = math.sin(rad)
        segs = _clip_line_to_polygon(cx, cy, cos_t, sin_t, m.vertices, r_min, r_max)
        for (ta, tb) in segs:
            pts = _place_points_on_segment(
                ta, tb, spacing_mm, cx, cy, cos_t, sin_t, theta_deg, m.mask_id,
            )
            for (x, y, th, t, _) in pts:
                spots.append((x, y, th, t, m.mask_id))
    return spots


def _generate_all_spots_with_spacing(
    masks: list[MaskPolygon],
    cx: float,
    cy: float,
    spacing_mm: float,
    angles_ordered: list[float],
    r_min: float,
    r_max: float,
) -> list[tuple[float, float, float, float, int | None]]:
    """Generate spot candidates for all masks with one spacing (unison grid)."""
    all_spots: list[tuple[float, float, float, float, int | None]] = []
    for m in masks:
        spots = _generate_spots_for_one_mask(
            m, cx, cy, spacing_mm, angles_ordered, r_min, r_max
        )
        all_spots.extend(spots)
    return all_spots


def _build_candidates_polar_uniform_constrained(
    cx: float,
    cy: float,
    *,
    angles_ordered: list[float],
    spacing_mm: float,
    r_max: float,
    angle_step_deg: int,
    mask_id: int,
    mask_vertices: list[tuple[float, float]] | None = None,
) -> list[tuple[float, float, float, float, int | None]]:
    """
    Build candidates with improved 2D uniformity (chord-based diameter subsampling).

    Used for both full aperture and lesion masks. When mask_vertices is provided,
    only points inside the mask polygon are included.

    Key idea (constraint-aware):
    - Points must lie on machine diameters (θ in [0,180) at fixed Δθ).
    - With fixed Δθ, tangential spacing shrinks near the center (~ r*Δθ).
      We skip some diameters on small radii so chord distance >= spacing_mm.
    - Rings at r = 0, spacing, 2*spacing, ..., r_max.
    - Emit both sides of each diameter via signed t (t=+r and t=-r).
    """
    if spacing_mm <= 0:
        spacing_mm = MIN_DIST_MM
    if not angles_ordered:
        return []

    n_angles = len(angles_ordered)
    dtheta_rad = math.radians(float(angle_step_deg))
    candidates: list[tuple[float, float, float, float, int | None]] = []

    def inside_mask(x: float, y: float) -> bool:
        if mask_vertices is None:
            return True
        return _point_in_polygon(x, y, mask_vertices)

    ring_idx = 0
    r = 0.0
    while r <= r_max + 1e-9:
        if r < 1e-8:
            if inside_mask(cx, cy):
                candidates.append((cx, cy, angles_ordered[0], 0.0, mask_id))
            ring_idx += 1
            r += spacing_mm
            continue

        ratio = spacing_mm / (2.0 * r)
        if ratio >= 1.0:
            skip = n_angles
        else:
            dphi = 2.0 * math.asin(ratio)
            skip = max(1, int(math.ceil(dphi / max(dtheta_rad, 1e-12))))
            skip = min(skip, n_angles)

        offset = ring_idx % skip

        for idx in range(offset, n_angles, skip):
            theta_deg = angles_ordered[idx]
            rad = math.radians(theta_deg)
            cos_t = math.cos(rad)
            sin_t = math.sin(rad)

            for sign in (1.0, -1.0):
                t = sign * r
                x = cx + t * cos_t
                y = cy + t * sin_t
                if (x - cx) ** 2 + (y - cy) ** 2 <= r_max * r_max + 1e-9 and inside_mask(x, y):
                    candidates.append((x, y, theta_deg, t, mask_id))

        ring_idx += 1
        r += spacing_mm

    return candidates


def _binary_search_global_spacing(
    masks: list[MaskPolygon],
    cx: float,
    cy: float,
    total_target: int,
    angles_ordered: list[float],
    r_min: float,
    r_max: float,
    angle_step: int,
    min_dist_mm: float = MIN_DIST_MM,
    max_iter: int = 25,
) -> float:
    """
    One spacing for the whole plan so treatment points are as uniform as possible.
    Binary search: spacing such that (generate all with spacing, sort, filter) ≈ total_target.
    Produces regular grid: concentric rings + radial lines (reference image pattern).
    """
    if total_target <= 0:
        return 10.0 * min_dist_mm
    low = min_dist_mm
    high = 10.0 * min_dist_mm
    tolerance = max(1, int(0.02 * total_target))
    best_spacing = (low + high) / 2.0

    def emission_order_key(s: tuple) -> tuple:
        theta_deg = s[2]
        theta_k = int(round(theta_deg)) // angle_step
        t_sort = s[3] if theta_k % 2 == 0 else -s[3]
        return (theta_k, t_sort)

    for _ in range(max_iter):
        mid = (low + high) / 2.0
        mid = max(mid, min_dist_mm)
        spots = _generate_all_spots_with_spacing(
            masks, cx, cy, mid, angles_ordered, r_min, r_max
        )
        spots.sort(key=emission_order_key)
        filtered = _filter_overlaps_in_emission_order(spots, min_dist_mm)
        n = len(filtered)
        if abs(n - total_target) <= tolerance:
            return mid
        if n > total_target:
            low = mid
        else:
            high = mid
        best_spacing = mid
    return best_spacing


def generate_plan_simple(
    masks: list[MaskPolygon],
    image_width_mm: float,
    grid_spacing_mm: float = SIMPLE_GRID_SPACING_MM,
) -> PlanResult:
    """
    Generate spots on a regular XY grid (800 µm default), inside aperture and inside masks.

    - Center = centroid of all mask vertices; fallback (0, 0); same clamp as advanced.
    - Points at (cx + i*step, cy + j*step) inside circle radius 12.5 mm, inside at least one mask.
    - theta_deg and t_mm derived from (x, y) for DB/export/preview consistency.
    - Emission order: boustrophedon (snake)—first row left-to-right, second row right-to-left, etc.
    """
    if not masks:
        return PlanResult()
    all_vertices: list[tuple[float, float]] = []
    for m in masks:
        if len(m.vertices) >= 3:
            all_vertices.extend(m.vertices)
    cx, cy = _centroid(all_vertices) if all_vertices else (0.0, 0.0)
    fallback_used = False
    if not all_vertices:
        fallback_used = True
    if abs(cx) > APERTURE_RADIUS_MM * 2 or abs(cy) > APERTURE_RADIUS_MM * 2:
        cx, cy = 0.0, 0.0
        fallback_used = True

    R = APERTURE_RADIUS_MM
    step = max(grid_spacing_mm, 1e-6)
    n_cells = int(math.ceil(R / step))
    candidates: list[tuple[float, float, int | None]] = []  # (x, y, mask_id)
    for i in range(-n_cells, n_cells + 1):
        for j in range(-n_cells, n_cells + 1):
            x = cx + i * step
            y = cy + j * step
            if (x - cx) ** 2 + (y - cy) ** 2 > R * R + 1e-9:
                continue
            mask_id: int | None = None
            for m in masks:
                if len(m.vertices) >= 3 and _point_in_polygon(x, y, m.vertices):
                    mask_id = m.mask_id
                    break
            if mask_id is not None:
                candidates.append((x, y, mask_id))

    # Emission order: boustrophedon (snake)—row 0 left-to-right, row 1 right-to-left, etc.
    def _boustrophedon_key(c: tuple[float, float, int | None]) -> tuple[float, float]:
        x, y, _ = c
        row_key = round((y - cy) / step)  # discrete row index (higher y = higher row_key)
        # Top row first: sort by -row_key; within row: even row x asc, odd row x desc
        x_sort = x if row_key % 2 == 0 else -x
        return (-row_key, x_sort)

    candidates.sort(key=_boustrophedon_key)
    sequence: list[SpotRecord] = []
    for x, y, mask_id in candidates:
        t_mm = math.hypot(x - cx, y - cy)
        theta_rad = math.atan2(y - cy, x - cx)
        theta_deg = math.degrees(theta_rad)
        sequence.append(
            SpotRecord(x_mm=x, y_mm=y, theta_deg=theta_deg, t_mm=t_mm, mask_id=mask_id)
        )

    total_mask_area = sum(
        _polygon_area(m.vertices) for m in masks if len(m.vertices) >= 3
    )
    n_spots = len(sequence)
    achieved = (
        (100.0 * n_spots * SPOT_AREA_MM2 / total_mask_area)
        if total_mask_area > 0
        else None
    )
    plan_valid = 1 if n_spots > 0 else 0
    return PlanResult(
        spots=sequence,
        achieved_coverage_pct=achieved,
        spots_count=n_spots,
        spots_outside_mask_count=0,
        overlap_count=0,
        plan_valid=plan_valid,
        fallback_used=fallback_used,
    )


def _filter_overlaps_in_emission_order(
    spots: list[tuple[float, float, float, float, int | None]],
    min_dist_mm: float,
) -> list[tuple[float, float, float, float, int | None]]:
    """
    Keep only spots that are >= min_dist_mm from any already accepted spot.
    Walks in the order of spots (emission order); uses grid hash for fast neighbor lookup.
    """
    if min_dist_mm <= 0 or not spots:
        return list(spots)
    cell_size = min_dist_mm
    grid: dict[tuple[int, int], list[tuple[float, float]]] = {}
    accepted: list[tuple[float, float, float, float, int | None]] = []

    def dist_ok(ax: float, ay: float, bx: float, by: float) -> bool:
        return math.hypot(ax - bx, ay - by) >= min_dist_mm - 1e-9

    for s in spots:
        x, y = s[0], s[1]
        ci, cj = _grid_cell(x, y, cell_size)
        ok = True
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                key = (ci + di, cj + dj)
                for (ox, oy) in grid.get(key, []):
                    if not dist_ok(x, y, ox, oy):
                        ok = False
                        break
                if not ok:
                    break
            if not ok:
                break
        if not ok:
            continue
        accepted.append(s)
        key = (ci, cj)
        if key not in grid:
            grid[key] = []
        grid[key].append((x, y))
    return accepted


def generate_plan(
    masks: list[MaskPolygon],
    target_coverage_pct: float,
    coverage_per_mask: dict[str, float] | None,
    image_width_mm: float,
    angle_step_deg: int | None = None,
    spot_diameter_mm: float | None = None,
    use_unison_grid: bool = False,
) -> PlanResult:
    """
    Generate spot grid and emission sequence.

    - Only masks with area >= 3% aperture are used.
    - Vertices must be in center mm (+y up). Center = centroid of vertices; fallback = (0, 0).
    - Diameters 0° to 180° (0, 5, ..., 175). Sequence: (theta_k, t_sort) with alternating t per line (reference).
    - One global spacing for the whole plan so treatment points are as uniform as possible (unison grid).
    - Total target count = sum of per-mask targets (from coverage_per_mask or target_coverage_pct).
    - angle_step_deg, spot_diameter_mm: optional overrides for grid generator (standalone aperture).
    """
    angle_step = angle_step_deg if angle_step_deg is not None else ANGLE_STEP_DEG
    spot_d = spot_diameter_mm if spot_diameter_mm is not None else SPOT_DIAMETER_MM
    spot_area_use = math.pi * (spot_d / 2) ** 2
    min_dist_use = spot_d * 1.05

    included: list[MaskPolygon] = []
    for m in masks:
        area = _polygon_area(m.vertices)
        if area <= 0:
            continue
        if _mask_area_pct_of_aperture(area) >= MIN_MASK_PCT_APERTURE:
            included.append(m)
    total_included_area = sum(_polygon_area(m.vertices) for m in included)
    if total_included_area > 0:
        included = [m for m in included if _polygon_area(m.vertices) >= (MIN_MASK_PCT_OF_TOTAL / 100.0) * total_included_area]
    if not included and masks:
        included = [m for m in masks if _polygon_area(m.vertices) > 0]
    if not included:
        return PlanResult()

    all_vertices: list[tuple[float, float]] = []
    for m in included:
        all_vertices.extend(m.vertices)
    cx, cy = _centroid(all_vertices)
    fallback_used = False
    if not all_vertices:
        cx, cy = 0.0, 0.0  # image center in center-mm space
        fallback_used = True
    if abs(cx) > APERTURE_RADIUS_MM * 2 or abs(cy) > APERTURE_RADIUS_MM * 2:
        cx, cy = 0.0, 0.0
        fallback_used = True

    r_min, r_max = -APERTURE_RADIUS_MM, APERTURE_RADIUS_MM
    angles_ordered = _angles_0_to_180(angle_step)

    # Unison grid: one global spacing for regular concentric rings + radial lines (reference image).
    # Used for full-aperture (e.g. grid generator). Produces uniform t = -R, -R+s, ..., +R per diameter.
    if use_unison_grid:
        # Full-aperture target count from aperture area (not polygon area approximation).
        total_target = max(
            1, int(round((target_coverage_pct / 100.0) * APERTURE_AREA_MM2 / spot_area_use))
        )

        def _unison_emission_key(s: tuple) -> tuple:
            theta_deg = s[2]
            # theta_deg is already in [0,180) for this mode
            theta_k = int(round(theta_deg)) // angle_step
            t_sort = s[3] if theta_k % 2 == 0 else -s[3]
            return (theta_k, t_sort)

        # Binary search on spacing to hit total_target, using polar rings + diameter subsampling
        low = min_dist_use
        high = 10.0 * min_dist_use
        tolerance = max(1, int(0.02 * total_target))
        best: list[tuple[float, float, float, float, int | None]] = []

        for _ in range(22):
            mid = (low + high) / 2.0
            mid = max(mid, min_dist_use)
            cand = _build_candidates_polar_uniform_constrained(
                cx,
                cy,
                angles_ordered=angles_ordered,
                spacing_mm=mid,
                r_max=APERTURE_RADIUS_MM,
                angle_step_deg=angle_step,
                mask_id=included[0].mask_id if included else 0,
                mask_vertices=None,
            )
            cand.sort(key=_unison_emission_key)
            filtered = _filter_overlaps_in_emission_order(cand, min_dist_use)

            if not best or abs(len(filtered) - total_target) < abs(len(best) - total_target):
                best = filtered

            if abs(len(filtered) - total_target) <= tolerance:
                best = filtered
                break
            if len(filtered) > total_target:
                low = mid
            else:
                high = mid

        all_spots = [
            (s[0], s[1], s[2], s[3], s[4] if s[4] is not None else 0) for s in best
        ]
    else:
        # Polar uniform approach (same as grid generator): chord-based diameter subsampling,
        # per-mask binary search on spacing, greedy selection with avoid_xy across masks.
        avoid_xy: list[tuple[float, float]] = []
        all_spots = []
        for m in included:
            area_mm2 = _polygon_area(m.vertices)
            pct = target_coverage_pct
            if coverage_per_mask:
                key = str(m.mask_id) if str(m.mask_id) in coverage_per_mask else (m.mask_label or str(m.mask_id))
                pct = coverage_per_mask.get(key, target_coverage_pct)
            pct = max(3.0, min(20.0, pct))
            n_target = max(1, int(round((pct / 100.0) * area_mm2 / spot_area_use)))
            sel = _tune_spacing_polar(
                m, cx, cy, angles_ordered, angle_step,
                n_target, avoid_xy, APERTURE_RADIUS_MM, min_dist_use,
            )
            for (x, y, th, t, mask_id) in sel:
                all_spots.append((x, y, th, t, mask_id))
                avoid_xy.append((x, y))

    # Emission order: diameter-by-diameter 0° to 175° (36 diameters). Each diameter is a full line through center.
    # Points at (r, θ) and (r, θ+180°) are on the same diameter; normalize to diameter_angle in [0, 180).
    # t_signed: +r for θ in [0,180), -r for θ in [180,360) so both sides of center are on one diameter.
    def emission_order_key(s: tuple) -> tuple:
        theta_deg = s[2]
        t_mm = s[3]
        diameter_angle = theta_deg if theta_deg < 180.0 else theta_deg - 180.0
        t_signed = t_mm if theta_deg < 180.0 else -t_mm
        theta_k = int(round(diameter_angle)) // angle_step  # 0°->0, 5°->1, ..., 175°->35
        t_sort = t_signed if theta_k % 2 == 0 else -t_signed
        return (theta_k, t_sort)
    all_spots.sort(key=emission_order_key)
    sequence: list[SpotRecord] = []
    for (x, y, th, t, mask_id) in all_spots:
        sequence.append(SpotRecord(x_mm=x, y_mm=y, theta_deg=th, t_mm=t, mask_id=mask_id))

    total_mask_area = sum(_polygon_area(m.vertices) for m in included)
    n_spots = len(sequence)
    achieved = (100.0 * n_spots * spot_area_use / total_mask_area) if total_mask_area > 0 else None
    outside = 0
    for s in sequence:
        in_any = False
        for m in included:
            if _point_in_polygon(s.x_mm, s.y_mm, m.vertices):
                in_any = True
                break
        if not in_any:
            outside += 1
    overlap = 0
    for i, a in enumerate(sequence):
        for b in sequence[i + 1 :]:
            dist = math.hypot(a.x_mm - b.x_mm, a.y_mm - b.y_mm)
            if dist < min_dist_use - 1e-6:
                overlap += 1
    plan_valid = 1 if n_spots > 0 and (outside / n_spots <= 0.05 if n_spots else True) and overlap == 0 else 0

    return PlanResult(
        spots=sequence,
        achieved_coverage_pct=achieved,
        spots_count=n_spots,
        spots_outside_mask_count=outside,
        overlap_count=overlap,
        plan_valid=plan_valid,
        fallback_used=fallback_used,
    )


def generate_plan_by_mode(
    masks: list[MaskPolygon],
    target_coverage_pct: float,
    coverage_per_mask: dict[str, float] | None,
    image_width_mm: float,
    algorithm_mode: Literal["simple", "advanced"],
    grid_spacing_mm: float | None = None,
) -> PlanResult:
    """Dispatch to simple (XY grid) or advanced (diameters, binary search) planner."""
    if algorithm_mode == "simple":
        spacing = grid_spacing_mm if grid_spacing_mm is not None else SIMPLE_GRID_SPACING_MM
        return generate_plan_simple(masks, image_width_mm, spacing)
    return generate_plan(
        masks, target_coverage_pct, coverage_per_mask, image_width_mm
    )
