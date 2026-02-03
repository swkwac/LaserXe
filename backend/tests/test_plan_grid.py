"""Tests for plan_grid spot generation (emission order, mask filter, coverage).

Phase D: angle set 0..175°, alternating t per line, spot geometry (center mm), determinism.
"""

from __future__ import annotations

import math
from collections import defaultdict

import pytest

from app.services.plan_grid import (
    APERTURE_RADIUS_MM,
    ANGLE_STEP_DEG,
    MaskPolygon,
    PlanResult,
    SIMPLE_GRID_SPACING_MM,
    generate_plan,
    generate_plan_by_mode,
    generate_plan_simple,
)


def _square_mask(mask_id: int, cx_mm: float, cy_mm: float, side_mm: float) -> MaskPolygon:
    """Square mask centered at (cx_mm, cy_mm) with given side length in mm."""
    h = side_mm / 2
    vertices = [
        (cx_mm - h, cy_mm - h),
        (cx_mm + h, cy_mm - h),
        (cx_mm + h, cy_mm + h),
        (cx_mm - h, cy_mm + h),
    ]
    return MaskPolygon(mask_id=mask_id, vertices=vertices, mask_label=None)


def test_emission_order_0_to_180() -> None:
    """Spots should be emitted diameter-by-diameter 0° to 175° (36 diameters); within each diameter t alternates (even: asc, odd: desc)."""
    # One mask well inside aperture, ~5% coverage
    side = 6.0  # 36 mm²
    m = _square_mask(1, 0, 0, side)
    result = generate_plan(
        masks=[m],
        target_coverage_pct=5.0,
        coverage_per_mask=None,
        image_width_mm=20.0,
    )
    assert result.spots_count >= 1
    spots = result.spots

    def diameter_angle(th: float) -> float:
        return th if th < 180.0 else th - 180.0

    seen_diameters: list[float] = []
    for s in spots:
        d = diameter_angle(s.theta_deg)
        if not seen_diameters or abs(d - seen_diameters[-1]) > 0.01:
            seen_diameters.append(d)
    # Diameters should be 0°, 5°, ..., 175° (non-decreasing)
    for i, d in enumerate(seen_diameters):
        assert 0 <= d < 180, f"Diameter {d} should be in [0, 180)"
        if i >= 1:
            assert d >= seen_diameters[i - 1] - 0.01, f"Diameters should be non-decreasing: {seen_diameters}"


def test_small_mask_discarded() -> None:
    """Masks smaller than 1% of total mask surface are excluded."""
    # Large mask + tiny mask; total such that tiny < 1% of total
    big = _square_mask(1, 0, 0, 8.0)   # 64 mm²
    tiny_side = 0.6   # 0.36 mm²; if total = 64 + 0.36, tiny is 0.36/64.36 < 1%
    tiny = _square_mask(2, 5, 5, tiny_side)
    result = generate_plan(
        masks=[big, tiny],
        target_coverage_pct=5.0,
        coverage_per_mask=None,
        image_width_mm=20.0,
    )
    # Tiny mask should be discarded by 1% rule -> no spots for mask 2
    mask_ids = {s.mask_id for s in result.spots}
    assert 1 in mask_ids
    assert 2 not in mask_ids


def test_empty_masks_returns_empty() -> None:
    """No masks -> empty plan."""
    result = generate_plan(
        masks=[],
        target_coverage_pct=5.0,
        coverage_per_mask=None,
        image_width_mm=20.0,
    )
    assert result.spots_count == 0
    assert result.spots == []


def test_coverage_per_mask() -> None:
    """Different coverage per mask label/id."""
    m1 = _square_mask(1, -3, 0, 4.0)
    m1.mask_label = "white"
    m2 = _square_mask(2, 3, 0, 4.0)
    m2.mask_label = "green"
    result = generate_plan(
        masks=[m1, m2],
        target_coverage_pct=5.0,
        coverage_per_mask={"white": 10.0, "green": 5.0},
        image_width_mm=20.0,
    )
    by_mask: dict[int | None, int] = {}
    for s in result.spots:
        by_mask[s.mask_id] = by_mask.get(s.mask_id, 0) + 1
    # White (10%) should get more spots than green (5%) for same area
    assert 1 in by_mask and 2 in by_mask
    assert by_mask[1] >= by_mask[2]


def test_angle_set_0_to_175() -> None:
    """Unique angles in output must be a subset of 0°, 5°, ..., 175° (36 diameters)."""
    m = _square_mask(1, 0, 0, 6.0)
    result = generate_plan(
        masks=[m],
        target_coverage_pct=5.0,
        coverage_per_mask=None,
        image_width_mm=20.0,
    )
    assert result.spots_count >= 1
    expected_angles = [float(a) for a in range(0, 180, ANGLE_STEP_DEG)]
    seen = set()
    for s in result.spots:
        th = round(s.theta_deg * 100) / 100
        seen.add(th)
        assert th in expected_angles, f"Angle {s.theta_deg} not in 0,5,...,175"
    assert 0.0 in seen, "At least 0° should appear"


def test_alternating_t_per_line() -> None:
    """Within each diameter: even theta_k → t_signed ascending, odd theta_k → t_signed descending."""
    m = _square_mask(1, 0, 0, 6.0)
    result = generate_plan(
        masks=[m],
        target_coverage_pct=5.0,
        coverage_per_mask=None,
        image_width_mm=20.0,
    )
    if result.spots_count < 2:
        return

    def diameter_angle(th: float) -> float:
        return th if th < 180.0 else th - 180.0

    def t_signed(th: float, t: float) -> float:
        return t if th < 180.0 else -t

    by_diameter: dict[float, list[float]] = defaultdict(list)
    for s in result.spots:
        d = round(diameter_angle(s.theta_deg) * 100) / 100
        by_diameter[d].append(t_signed(s.theta_deg, s.t_mm))
    for d, t_list in by_diameter.items():
        if len(t_list) < 2:
            continue
        theta_k = int(round(d)) // ANGLE_STEP_DEG
        if theta_k % 2 == 0:
            assert t_list == sorted(t_list), f"Even diameter {d}° should have t_signed ascending: {t_list}"
        else:
            assert t_list == sorted(t_list, reverse=True), (
                f"Odd diameter {d}° should have t_signed descending: {t_list}"
            )


def test_spot_geometry_center_mm() -> None:
    """Spots satisfy x = t*cos(θ), y = t*sin(θ) in center mm and |t| <= R (reference)."""
    m = _square_mask(1, 0, 0, 6.0)
    result = generate_plan(
        masks=[m],
        target_coverage_pct=5.0,
        coverage_per_mask=None,
        image_width_mm=20.0,
    )
    for s in result.spots:
        rad = math.radians(s.theta_deg)
        expected_x = s.t_mm * math.cos(rad)
        expected_y = s.t_mm * math.sin(rad)
        assert abs(s.x_mm - expected_x) < 1e-6, f"x_mm {s.x_mm} vs t*cos {expected_x}"
        assert abs(s.y_mm - expected_y) < 1e-6, f"y_mm {s.y_mm} vs t*sin {expected_y}"
        assert abs(s.t_mm) <= APERTURE_RADIUS_MM + 1e-6, f"|t| {abs(s.t_mm)} > R"


def test_plan_deterministic() -> None:
    """Same inputs → same spot count and same first/last spot (theta, t)."""
    m = _square_mask(1, 0, 0, 5.0)
    kwargs = dict(
        masks=[m],
        target_coverage_pct=5.0,
        coverage_per_mask=None,
        image_width_mm=20.0,
    )
    r1 = generate_plan(**kwargs)
    r2 = generate_plan(**kwargs)
    assert r1.spots_count == r2.spots_count
    if r1.spots_count > 0:
        a, b = r1.spots[0], r1.spots[-1]
        c, d = r2.spots[0], r2.spots[-1]
        assert abs(a.theta_deg - c.theta_deg) < 0.01 and abs(a.t_mm - c.t_mm) < 1e-6
        assert abs(b.theta_deg - d.theta_deg) < 0.01 and abs(b.t_mm - d.t_mm) < 1e-6


# --- Simple mode (XY grid 800 µm) ---


def test_simple_empty_masks_returns_empty() -> None:
    """generate_plan_simple with no masks returns empty plan."""
    result = generate_plan_simple(
        masks=[],
        image_width_mm=20.0,
        grid_spacing_mm=SIMPLE_GRID_SPACING_MM,
    )
    assert result.spots_count == 0
    assert result.spots == []
    assert result.overlap_count == 0
    assert result.spots_outside_mask_count == 0


def test_simple_one_mask_grid_inside_mask() -> None:
    """Simple mode: one square mask yields grid points inside mask only, ~0.8 mm spacing."""
    m = _square_mask(1, 0, 0, 6.0)  # 6 mm square centered at origin
    result = generate_plan_simple(
        masks=[m],
        image_width_mm=20.0,
        grid_spacing_mm=SIMPLE_GRID_SPACING_MM,
    )
    assert result.spots_count >= 1
    assert result.overlap_count == 0
    assert result.spots_outside_mask_count == 0
    # All spots should be inside aperture and inside the square [-3,3] x [-3,3]
    for s in result.spots:
        assert abs(s.x_mm) <= APERTURE_RADIUS_MM + 1e-6
        assert abs(s.y_mm) <= APERTURE_RADIUS_MM + 1e-6
        assert -3 <= s.x_mm <= 3 and -3 <= s.y_mm <= 3
        assert s.mask_id == 1
    # Spacing between adjacent grid rows/cols should be ~0.8 mm (no overlap)
    spots_list = result.spots
    for i, a in enumerate(spots_list):
        for b in spots_list[i + 1 :]:
            dist = math.hypot(a.x_mm - b.x_mm, a.y_mm - b.y_mm)
            assert dist >= SIMPLE_GRID_SPACING_MM - 0.01 or dist < 0.01


def test_simple_theta_t_mm_consistent_with_xy() -> None:
    """Simple mode: theta_deg and t_mm reconstruct (x, y) in center mm."""
    m = _square_mask(1, 0, 0, 5.0)
    result = generate_plan_simple(
        masks=[m],
        image_width_mm=20.0,
        grid_spacing_mm=SIMPLE_GRID_SPACING_MM,
    )
    for s in result.spots:
        rad = math.radians(s.theta_deg)
        expected_x = s.t_mm * math.cos(rad)
        expected_y = s.t_mm * math.sin(rad)
        assert abs(s.x_mm - expected_x) < 1e-6, f"x_mm {s.x_mm} vs t*cos {expected_x}"
        assert abs(s.y_mm - expected_y) < 1e-6, f"y_mm {s.y_mm} vs t*sin {expected_y}"


def test_generate_plan_by_mode_simple() -> None:
    """generate_plan_by_mode(..., 'simple') uses simple grid; returns spots."""
    m = _square_mask(1, 0, 0, 5.0)
    result = generate_plan_by_mode(
        masks=[m],
        target_coverage_pct=10.0,
        coverage_per_mask=None,
        image_width_mm=20.0,
        algorithm_mode="simple",
    )
    assert result.spots_count >= 1
    assert result.overlap_count == 0
    assert result.spots_outside_mask_count == 0


def test_generate_plan_by_mode_advanced() -> None:
    """generate_plan_by_mode(..., 'advanced') matches generate_plan."""
    m = _square_mask(1, 0, 0, 6.0)
    kwargs = dict(
        masks=[m],
        target_coverage_pct=5.0,
        coverage_per_mask=None,
        image_width_mm=20.0,
    )
    r_adv = generate_plan_by_mode(**kwargs, algorithm_mode="advanced")
    r_direct = generate_plan(**kwargs)
    assert r_adv.spots_count == r_direct.spots_count
    assert r_adv.plan_valid == r_direct.plan_valid


def test_simple_grid_spacing_mm_custom() -> None:
    """generate_plan_simple with grid_spacing_mm=1.0 yields ~1.0 mm spacing; fewer spots than 0.8 mm."""
    m = _square_mask(1, 0, 0, 6.0)
    result_08 = generate_plan_simple(
        masks=[m],
        image_width_mm=20.0,
        grid_spacing_mm=SIMPLE_GRID_SPACING_MM,
    )
    result_10 = generate_plan_simple(
        masks=[m],
        image_width_mm=20.0,
        grid_spacing_mm=1.0,
    )
    assert result_10.spots_count >= 1
    assert result_10.spots_count <= result_08.spots_count
    for i, a in enumerate(result_10.spots):
        for b in result_10.spots[i + 1 :]:
            dist = math.hypot(a.x_mm - b.x_mm, a.y_mm - b.y_mm)
            assert dist >= 1.0 - 0.02 or dist < 0.01


def test_advanced_uniform_spacing_nearest_neighbor() -> None:
    """Advanced mode: all nearest-neighbor distances >= min_dist; uniformity check."""
    m = _square_mask(1, 0, 0, 10.0)  # 10 mm square centered at origin
    result = generate_plan(
        masks=[m],
        target_coverage_pct=8.0,
        coverage_per_mask=None,
        image_width_mm=20.0,
    )
    if result.spots_count < 2:
        return
    min_dist = 0.3 * 1.05  # SPOT_DIAMETER_MM * 1.05
    spots = [(s.x_mm, s.y_mm) for s in result.spots]
    for i, (x, y) in enumerate(spots):
        nn_dist = min(
            math.hypot(x - ox, y - oy) for j, (ox, oy) in enumerate(spots) if j != i
        )
        assert nn_dist >= min_dist - 1e-6, (
            f"Spot {i} at ({x},{y}) has nearest neighbor at {nn_dist:.4f} mm < min_dist {min_dist}"
        )


def test_simple_emission_order_boustrophedon() -> None:
    """generate_plan_simple emission order is boustrophedon: row 0 left-to-right, row 1 right-to-left, etc."""
    # Small square centered at (0,0); step 1.0 so we get a few rows
    m = _square_mask(1, 0, 0, 4.0)
    result = generate_plan_simple(
        masks=[m],
        image_width_mm=20.0,
        grid_spacing_mm=1.0,
    )
    assert result.spots_count >= 2
    spots = result.spots
    # Group by y (row)
    by_y: dict[float, list[tuple[float, float]]] = {}
    for s in spots:
        y_round = round(s.y_mm * 100) / 100
        if y_round not in by_y:
            by_y[y_round] = []
        by_y[y_round].append((s.x_mm, s.y_mm))
    rows = sorted(by_y.keys(), reverse=True)  # top row first (higher y)
    for row_idx, y_val in enumerate(rows):
        row_spots = by_y[y_val]
        xs = sorted(p[0] for p in row_spots)
        # Even row (0, 2, ...): emission order should be x ascending
        # Odd row (1, 3, ...): emission order should be x descending
        emitted_xs = [p[0] for p in row_spots]
        if row_idx % 2 == 0:
            assert emitted_xs == xs, f"Row {row_idx} (y={y_val}): expected x asc {xs}, got {emitted_xs}"
        else:
            assert emitted_xs == list(reversed(xs)), f"Row {row_idx} (y={y_val}): expected x desc {list(reversed(xs))}, got {emitted_xs}"
