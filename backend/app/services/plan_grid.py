"""
Plan grid and emission sequence algorithm.

Design: linear motor (carriage) + rotational motor. Treatment area = 25 mm diameter circle.
Spots = 300 µm diameter; axes every 5°; carriage moves along diameter, emits then rotates.

Refs: .ai/instrukcje generowania siatki.md, .ai/succesful point and animation algorythm.md.txt

- Units: mm. spot_diameter_mm = 0.3; min_dist_mm = spot_diameter_mm * 1.05.
- Center: centroid of included masks; fallback = (0, 0) image center in mm.
  Vertices and spots are in center mm (+y up); API converts to/from top-left mm at boundaries.
- Axis: P(t) = center + t * dir; t in [-R, +R], R = 12.5 mm.
- Emission order: angles 0° to 180° (0, 5, …, 175); on each diameter t alternates (even line: t ascending, odd line: t descending).
- Points on each diameter: linear t spacing; sort by (theta_k, t_sort) with t_sort = ± t_mm by line parity.
- Binary search (section 9): spacing_mm so N ≈ N_target. Overlap filter: grid hash, min_dist_mm.
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


def _generate_spots_for_one_mask(
    m: MaskPolygon,
    cx: float,
    cy: float,
    spacing_mm: float,
    angles_ordered: list[float],
    r_min: float,
    r_max: float,
) -> list[tuple[float, float, float, float, int | None]]:
    """Generate spot candidates for one mask with given spacing (center-outward t, alternating angles)."""
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


def _binary_search_global_spacing(
    masks: list[MaskPolygon],
    cx: float,
    cy: float,
    total_target: int,
    angles_ordered: list[float],
    r_min: float,
    r_max: float,
    angle_step: int,
    max_iter: int = 25,
) -> float:
    """
    One spacing for the whole plan so treatment points are as uniform as possible.
    Binary search: spacing such that (generate all with spacing, sort, filter) ≈ total_target.
    """
    if total_target <= 0:
        return 10.0 * SPOT_DIAMETER_MM
    low = SPOT_DIAMETER_MM
    high = 10.0 * SPOT_DIAMETER_MM
    tolerance = max(1, int(0.02 * total_target))
    best_spacing = (low + high) / 2.0

    def emission_order_key(s: tuple) -> tuple:
        theta_deg = s[2]
        theta_k = int(round(theta_deg)) // angle_step
        t_sort = s[3] if theta_k % 2 == 0 else -s[3]
        return (theta_k, t_sort)

    for _ in range(max_iter):
        mid = (low + high) / 2.0
        mid = max(mid, MIN_DIST_MM)
        spots = _generate_all_spots_with_spacing(
            masks, cx, cy, mid, angles_ordered, r_min, r_max
        )
        spots.sort(key=emission_order_key)
        filtered = _filter_overlaps_in_emission_order(spots, MIN_DIST_MM)
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
) -> PlanResult:
    """
    Generate spot grid and emission sequence.

    - Only masks with area >= 3% aperture are used.
    - Vertices must be in center mm (+y up). Center = centroid of vertices; fallback = (0, 0).
    - Diameters 0° to 180° (0, 5, ..., 175). Sequence: (theta_k, t_sort) with alternating t per line (reference).
    - One global spacing for the whole plan so treatment points are as uniform as possible (unison grid).
    - Total target count = sum of per-mask targets (from coverage_per_mask or target_coverage_pct).
    """
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
    angle_step = ANGLE_STEP_DEG
    angles_ordered = _angles_0_to_180(angle_step)

    # Per-mask target counts and total; one global spacing for unison grid (reference: tune_min_dist)
    total_target = 0
    for m in included:
        area_mm2 = _polygon_area(m.vertices)
        pct = target_coverage_pct
        if coverage_per_mask:
            key = str(m.mask_id) if str(m.mask_id) in coverage_per_mask else (m.mask_label or str(m.mask_id))
            pct = coverage_per_mask.get(key, target_coverage_pct)
        pct = max(3.0, min(20.0, pct))
        n_target = max(1, int(round((pct / 100.0) * area_mm2 / SPOT_AREA_MM2)))
        total_target += n_target

    spacing = _binary_search_global_spacing(
        included, cx, cy, total_target, angles_ordered, r_min, r_max, angle_step,
    )
    all_spots = _generate_all_spots_with_spacing(
        included, cx, cy, spacing, angles_ordered, r_min, r_max,
    )

    # Emission order: (theta_k, t_sort) with theta_k = angle index 0..n-1, t_sort = ± t_mm by line parity (reference)
    def emission_order_key(s: tuple) -> tuple:
        theta_deg = s[2]
        theta_k = int(round(theta_deg)) // angle_step  # 0°->0, 5°->1, ..., 175°->35
        t_sort = s[3] if theta_k % 2 == 0 else -s[3]   # even line: t asc; odd line: t desc
        return (theta_k, t_sort)
    all_spots.sort(key=emission_order_key)
    all_spots = _filter_overlaps_in_emission_order(all_spots, MIN_DIST_MM)
    sequence: list[SpotRecord] = []
    for idx, (x, y, th, t, mask_id) in enumerate(all_spots):
        sequence.append(SpotRecord(x_mm=x, y_mm=y, theta_deg=th, t_mm=t, mask_id=mask_id))

    total_mask_area = sum(_polygon_area(m.vertices) for m in included)
    n_spots = len(sequence)
    achieved = (100.0 * n_spots * SPOT_AREA_MM2 / total_mask_area) if total_mask_area > 0 else None
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
            if dist < MIN_DIST_MM - 1e-6:
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
