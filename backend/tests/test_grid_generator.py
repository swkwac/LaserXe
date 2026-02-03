"""Tests for grid generator service and API."""

from __future__ import annotations

import math
import os

import pytest
from fastapi.testclient import TestClient

from app.services.grid_generator import (
    SIMPLE_WIDTH_MM,
    SIMPLE_HEIGHT_MM,
    generate_grid,
    generate_grid_simple,
    generate_grid_advanced,
)
from main import app


# --- Service unit tests ---


def test_generate_grid_simple_basic() -> None:
    """Simple aperture: axis_distance 0.8, spots fit entirely inside aperture [r, 12-r]."""
    result = generate_grid_simple(
        spot_diameter_um=300,
        axis_distance_mm=0.8,
    )
    assert result.spots_count >= 1
    assert result.achieved_coverage_pct > 0
    assert result.params["aperture_type"] == "simple"
    assert result.params["axis_distance_mm"] == 0.8
    assert result.params["angle_step_deg"] is None

    r = 0.15  # 300 µm radius
    for s in result.spots:
        assert r <= s.x_mm <= SIMPLE_WIDTH_MM - r + 1e-6
        assert r <= s.y_mm <= SIMPLE_HEIGHT_MM - r + 1e-6
        assert s.mask_id is None
        assert s.component_id is None


def test_generate_grid_simple_boustrophedon() -> None:
    """Simple: emission order is boustrophedon (row 0 left→right, row 1 right→left)."""
    result = generate_grid_simple(
        spot_diameter_um=300,
        axis_distance_mm=1.0,
    )
    if result.spots_count < 4:
        return

    # Group by y (row)
    by_y: dict[float, list[float]] = {}
    for s in result.spots:
        y_round = round(s.y_mm * 100) / 100
        if y_round not in by_y:
            by_y[y_round] = []
        by_y[y_round].append(s.x_mm)

    rows = sorted(by_y.keys())
    for row_idx, y_val in enumerate(rows):
        xs = sorted(by_y[y_val])
        emitted = [s.x_mm for s in result.spots if round(s.y_mm * 100) / 100 == y_val]
        if row_idx % 2 == 0:
            assert emitted == xs, f"Row {row_idx}: expected x asc"
        else:
            assert emitted == list(reversed(xs)), f"Row {row_idx}: expected x desc"


def test_generate_grid_simple_theta_t_from_center() -> None:
    """Simple: theta_deg and t_mm derive from (x, y) relative to center (6, 6)."""
    result = generate_grid_simple(
        spot_diameter_um=300,
        axis_distance_mm=1.0,
    )
    cx, cy = 6.0, 6.0
    for s in result.spots:
        dx = s.x_mm - cx
        dy = s.y_mm - cy
        expected_t = math.hypot(dx, dy)
        expected_theta = math.degrees(math.atan2(dy, dx))
        assert abs(s.t_mm - expected_t) < 1e-6
        assert abs(s.theta_deg - expected_theta) < 1e-6


def test_generate_grid_advanced_basic() -> None:
    """Advanced aperture: 25 mm diameter, yields spots inside circle."""
    result = generate_grid_advanced(
        angle_step_deg=5,
        spot_diameter_um=300,
        target_coverage_pct=5.0,
    )
    assert result.spots_count >= 1
    assert result.achieved_coverage_pct > 0
    assert result.params["aperture_type"] == "advanced"
    assert result.params["angle_step_deg"] == 5
    assert result.params["axis_distance_mm"] is None

    R = 12.5
    for s in result.spots:
        dist = math.hypot(s.x_mm, s.y_mm)
        assert dist <= R + 1e-6
        assert s.mask_id is None
        assert s.component_id is None


def test_generate_grid_advanced_spot_geometry() -> None:
    """Advanced: x = t*cos(θ), y = t*sin(θ) in center mm."""
    result = generate_grid_advanced(
        angle_step_deg=5,
        spot_diameter_um=300,
        target_coverage_pct=5.0,
    )
    for s in result.spots:
        rad = math.radians(s.theta_deg)
        expected_x = s.t_mm * math.cos(rad)
        expected_y = s.t_mm * math.sin(rad)
        assert abs(s.x_mm - expected_x) < 1e-5
        assert abs(s.y_mm - expected_y) < 1e-5


def test_generate_grid_dispatch_simple() -> None:
    """generate_grid with aperture_type=simple calls simple logic."""
    result = generate_grid(
        aperture_type="simple",
        spot_diameter_um=300,
        target_coverage_pct=None,
        axis_distance_mm=0.8,
        angle_step_deg=None,
    )
    assert result.params["aperture_type"] == "simple"
    assert result.spots_count >= 1


def test_generate_grid_dispatch_simple_by_coverage() -> None:
    """generate_grid(simple) with target_coverage_pct only calculates axis_distance."""
    result = generate_grid(
        aperture_type="simple",
        spot_diameter_um=300,
        target_coverage_pct=10.0,
        axis_distance_mm=None,
        angle_step_deg=None,
    )
    assert result.params["aperture_type"] == "simple"
    assert result.spots_count >= 1
    assert result.params["axis_distance_mm"] is not None


def test_generate_grid_dispatch_advanced() -> None:
    """generate_grid with aperture_type=advanced calls advanced logic."""
    result = generate_grid(
        aperture_type="advanced",
        spot_diameter_um=300,
        target_coverage_pct=5.0,
        axis_distance_mm=None,
        angle_step_deg=5,
    )
    assert result.params["aperture_type"] == "advanced"
    assert result.spots_count >= 1


def test_generate_grid_simple_requires_one_of() -> None:
    """generate_grid(simple) without both target and axis_distance raises."""
    with pytest.raises(ValueError, match="either"):
        generate_grid(
            aperture_type="simple",
            spot_diameter_um=300,
            target_coverage_pct=None,
            axis_distance_mm=None,
            angle_step_deg=None,
        )


def test_generate_grid_simple_rejects_both() -> None:
    """generate_grid(simple) with both target and axis_distance raises."""
    with pytest.raises(ValueError, match="only one"):
        generate_grid(
            aperture_type="simple",
            spot_diameter_um=300,
            target_coverage_pct=10.0,
            axis_distance_mm=0.8,
            angle_step_deg=None,
        )


def test_generate_grid_advanced_requires_angle_step() -> None:
    """generate_grid(advanced) without angle_step_deg raises."""
    with pytest.raises(ValueError, match="angle_step_deg"):
        generate_grid(
            aperture_type="advanced",
            spot_diameter_um=300,
            target_coverage_pct=5.0,
            axis_distance_mm=None,
            angle_step_deg=None,
        )


# --- API tests (with auth) ---


@pytest.fixture()
def client_with_auth():
    """Test client with auth env and logged-in session."""
    os.environ["AUTH_SECRET_KEY"] = "test-secret"
    os.environ["AUTH_COOKIE_NAME"] = "laserxe_session"
    os.environ["AUTH_COOKIE_SECURE"] = "false"
    os.environ["AUTH_COOKIE_SAMESITE"] = "lax"
    os.environ["AUTH_COOKIE_MAX_AGE_SECONDS"] = "3600"

    import sqlite3
    from passlib.hash import bcrypt
    from app.db.connection import get_db

    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        create table users (
            id integer primary key autoincrement,
            login text unique not null,
            password_hash text not null,
            created_at text not null,
            updated_at text
        )
        """
    )
    conn.execute(
        "insert into users (login, password_hash, created_at) values (?, ?, datetime('now'))",
        ("user", bcrypt.using(rounds=12).hash("123")),
    )
    conn.commit()

    def _override_get_db():
        yield conn

    app.dependency_overrides[get_db] = _override_get_db
    client = TestClient(app)
    login = client.post("/api/auth/login", json={"login": "user", "password": "123"})
    assert login.status_code == 200
    try:
        yield client
    finally:
        app.dependency_overrides.clear()
        conn.close()


def test_api_generate_requires_auth(client_with_auth: TestClient) -> None:
    """Unauthenticated request to /api/grid-generator/generate returns 401."""
    # Use fresh client without cookie
    os.environ["AUTH_SECRET_KEY"] = "test-secret"
    client = TestClient(app)
    response = client.post(
        "/api/grid-generator/generate",
        json={
            "aperture_type": "simple",
            "spot_diameter_um": 300,
            "target_coverage_pct": 10,
            "axis_distance_mm": 0.8,
        },
    )
    assert response.status_code == 401


def test_api_generate_simple_success(client_with_auth: TestClient) -> None:
    """Authenticated POST with simple params (axis_distance) returns spots."""
    response = client_with_auth.post(
        "/api/grid-generator/generate",
        json={
            "aperture_type": "simple",
            "spot_diameter_um": 300,
            "axis_distance_mm": 0.8,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "spots" in data
    assert "spots_count" in data
    assert "achieved_coverage_pct" in data
    assert "params" in data
    assert data["params"]["aperture_type"] == "simple"
    assert data["params"]["axis_distance_mm"] == 0.8
    assert len(data["spots"]) == data["spots_count"]
    if data["spots"]:
        spot = data["spots"][0]
        assert "sequence_index" in spot
        assert "x_mm" in spot
        assert "y_mm" in spot
        assert "theta_deg" in spot
        assert "t_mm" in spot
        assert spot.get("mask_id") is None
        assert spot.get("component_id") is None


def test_api_generate_advanced_success(client_with_auth: TestClient) -> None:
    """Authenticated POST with advanced params returns spots."""
    response = client_with_auth.post(
        "/api/grid-generator/generate",
        json={
            "aperture_type": "advanced",
            "spot_diameter_um": 300,
            "target_coverage_pct": 5,
            "angle_step_deg": 5,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["params"]["aperture_type"] == "advanced"
    assert data["params"]["angle_step_deg"] == 5
    assert data["params"]["axis_distance_mm"] is None
    assert data["spots_count"] >= 1


def test_api_generate_simple_coverage_only(client_with_auth: TestClient) -> None:
    """Simple with target_coverage_pct only (no axis_distance) returns spots."""
    response = client_with_auth.post(
        "/api/grid-generator/generate",
        json={
            "aperture_type": "simple",
            "spot_diameter_um": 300,
            "target_coverage_pct": 10,
        },
    )
    assert response.status_code == 200
    assert response.json()["spots_count"] >= 1
    assert response.json()["params"]["axis_distance_mm"] is not None


def test_api_generate_simple_missing_both(client_with_auth: TestClient) -> None:
    """Simple without both target_coverage and axis_distance returns 422."""
    response = client_with_auth.post(
        "/api/grid-generator/generate",
        json={
            "aperture_type": "simple",
            "spot_diameter_um": 300,
        },
    )
    assert response.status_code == 422


def test_api_generate_simple_both_provided(client_with_auth: TestClient) -> None:
    """Simple with both target_coverage and axis_distance returns 422."""
    response = client_with_auth.post(
        "/api/grid-generator/generate",
        json={
            "aperture_type": "simple",
            "spot_diameter_um": 300,
            "target_coverage_pct": 10,
            "axis_distance_mm": 0.8,
        },
    )
    assert response.status_code == 422


def test_api_generate_advanced_missing_angle_step(client_with_auth: TestClient) -> None:
    """Advanced without angle_step_deg returns 422."""
    response = client_with_auth.post(
        "/api/grid-generator/generate",
        json={
            "aperture_type": "advanced",
            "spot_diameter_um": 300,
            "target_coverage_pct": 5,
        },
    )
    assert response.status_code == 422
