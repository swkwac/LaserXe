"""Tests for coordinate conversion (top-left mm ↔ center mm).

Phase D: roundtrip, image center mapping, vertices conversion.
"""

from __future__ import annotations

import pytest

from app.services.coordinates import (
    center_mm_to_top_left_mm,
    top_left_mm_to_center_mm,
    vertices_center_to_top_left,
    vertices_top_left_to_center,
)


def test_image_center_top_left_to_center() -> None:
    """Image center in top-left mm (width_mm/2, height_mm/2) maps to (0, 0) in center mm."""
    width_mm, height_mm = 20.0, 15.0
    x_tl, y_tl = width_mm / 2, height_mm / 2
    x_c, y_c = top_left_mm_to_center_mm(x_tl, y_tl, width_mm, height_mm)
    assert abs(x_c) < 1e-9 and abs(y_c) < 1e-9


def test_image_center_center_to_top_left() -> None:
    """Center mm (0, 0) maps to (width_mm/2, height_mm/2) in top-left mm."""
    width_mm, height_mm = 20.0, 15.0
    x_tl, y_tl = center_mm_to_top_left_mm(0.0, 0.0, width_mm, height_mm)
    assert abs(x_tl - width_mm / 2) < 1e-9 and abs(y_tl - height_mm / 2) < 1e-9


def test_roundtrip_point() -> None:
    """Roundtrip top_left → center → top_left recovers original."""
    width_mm, height_mm = 20.0, 15.0
    x_tl, y_tl = 3.0, 7.0
    x_c, y_c = top_left_mm_to_center_mm(x_tl, y_tl, width_mm, height_mm)
    x_tl2, y_tl2 = center_mm_to_top_left_mm(x_c, y_c, width_mm, height_mm)
    assert abs(x_tl2 - x_tl) < 1e-9 and abs(y_tl2 - y_tl) < 1e-9


def test_roundtrip_center_to_tl_to_center() -> None:
    """Roundtrip center → top_left → center recovers original."""
    width_mm, height_mm = 20.0, 15.0
    x_c, y_c = -2.0, 3.0
    x_tl, y_tl = center_mm_to_top_left_mm(x_c, y_c, width_mm, height_mm)
    x_c2, y_c2 = top_left_mm_to_center_mm(x_tl, y_tl, width_mm, height_mm)
    assert abs(x_c2 - x_c) < 1e-9 and abs(y_c2 - y_c) < 1e-9


def test_y_up_in_center() -> None:
    """In center mm +y is up: increasing y_tl (down in image) → decreasing y_center."""
    width_mm, height_mm = 20.0, 15.0
    _, y_c1 = top_left_mm_to_center_mm(10.0, 5.0, width_mm, height_mm)
    _, y_c2 = top_left_mm_to_center_mm(10.0, 8.0, width_mm, height_mm)
    assert y_c2 < y_c1, "Higher y_tl (down) should give smaller y_center (up)"


def test_vertices_roundtrip() -> None:
    """Vertices roundtrip top_left → center → top_left."""
    width_mm, height_mm = 20.0, 15.0
    verts_tl = [(0.0, 0.0), (20.0, 0.0), (20.0, 15.0), (0.0, 15.0)]
    verts_c = vertices_top_left_to_center(verts_tl, width_mm, height_mm)
    verts_tl2 = vertices_center_to_top_left(verts_c, width_mm, height_mm)
    for (a, b), (c, d) in zip(verts_tl, verts_tl2):
        assert abs(a - c) < 1e-9 and abs(b - d) < 1e-9
