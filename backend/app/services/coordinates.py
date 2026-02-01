"""
Coordinate conversion: top-left mm ↔ center mm (+y up).

Reference: .ai/working_lesion_spot_planner.txt
- Top-left mm: origin at image top-left, +x right, +y down (as stored in DB and used by frontend).
- Center mm: origin at image center, +x right, +y up (used by planner and reference).

Mapping:
  x_center = x_tl - width_mm / 2
  y_center = height_mm / 2 - y_tl   (so pixel down → mm y decreases → +y up in center)

  x_tl = x_center + width_mm / 2
  y_tl = height_mm / 2 - y_center
"""

from __future__ import annotations


def top_left_mm_to_center_mm(
    x_tl: float,
    y_tl: float,
    width_mm: float,
    height_mm: float,
) -> tuple[float, float]:
    """Convert a point from top-left mm (origin top-left, +y down) to center mm (origin center, +y up)."""
    x_center = x_tl - width_mm / 2
    y_center = height_mm / 2 - y_tl
    return (x_center, y_center)


def center_mm_to_top_left_mm(
    x_center: float,
    y_center: float,
    width_mm: float,
    height_mm: float,
) -> tuple[float, float]:
    """Convert a point from center mm (origin center, +y up) to top-left mm (origin top-left, +y down)."""
    x_tl = x_center + width_mm / 2
    y_tl = height_mm / 2 - y_center
    return (x_tl, y_tl)


def vertices_top_left_to_center(
    vertices: list[tuple[float, float]],
    width_mm: float,
    height_mm: float,
) -> list[tuple[float, float]]:
    """Convert a list of (x, y) from top-left mm to center mm."""
    return [
        top_left_mm_to_center_mm(x, y, width_mm, height_mm)
        for x, y in vertices
    ]


def vertices_center_to_top_left(
    vertices: list[tuple[float, float]],
    width_mm: float,
    height_mm: float,
) -> list[tuple[float, float]]:
    """Convert a list of (x, y) from center mm to top-left mm."""
    return [
        center_mm_to_top_left_mm(x, y, width_mm, height_mm)
        for x, y in vertices
    ]
