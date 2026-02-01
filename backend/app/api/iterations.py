"""Iterations API: list and create (with grid/sequence algorithm) for an image."""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from PIL import Image as PILImage

from app.db.connection import get_db
from app.schemas.iterations import (
    IterationSchema,
    IterationListSchema,
    IterationCreateSchema,
    IterationParamsSnapshotSchema,
)
from app.services.coordinates import (
    center_mm_to_top_left_mm,
    vertices_top_left_to_center,
)
from app.services.plan_grid import MaskPolygon, generate_plan_by_mode

logger = logging.getLogger(__name__)

router = APIRouter()


def get_current_user_id(request: Request) -> int:
    """Return current user id from request.state (set by auth middleware)."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    user_id = user.get("id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return int(user_id)


def _ensure_image_owned(
    db: sqlite3.Connection, image_id: int, user_id: int
) -> None:
    """Raise 404 if image does not exist or is not owned by user."""
    row = db.execute(
        "SELECT id FROM images WHERE id = ? AND created_by = ?",
        (image_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )


def _parse_params_snapshot(raw: str | None) -> dict | None:
    """Parse params_snapshot JSON from DB to dict for response."""
    if not raw:
        return None
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError):
        return None


def _row_to_iteration(row: sqlite3.Row) -> dict:
    # sqlite3.Row supports row["col"] but not row.get(); use indexing.
    params = _parse_params_snapshot(row["params_snapshot"])
    return {
        "id": row["id"],
        "image_id": row["image_id"],
        "parent_id": row["parent_id"],
        "created_by": row["created_by"],
        "status": row["status"],
        "accepted_at": row["accepted_at"],
        "accepted_by": row["accepted_by"],
        "is_demo": row["is_demo"],
        "params_snapshot": params,
        "target_coverage_pct": row["target_coverage_pct"],
        "achieved_coverage_pct": row["achieved_coverage_pct"],
        "spots_count": row["spots_count"],
        "spots_outside_mask_count": row["spots_outside_mask_count"],
        "overlap_count": row["overlap_count"],
        "plan_valid": row["plan_valid"],
        "created_at": row["created_at"],
    }


@router.get("/{image_id:int}/iterations", response_model=IterationListSchema)
def list_iterations(
    image_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    status_filter: str | None = Query(None, alias="status"),
    is_demo: bool | None = None,
    algorithm_mode: str | None = Query(None, alias="algorithm_mode"),
    sort: str = "created_at",
    order: str = "desc",
) -> IterationListSchema:
    """List iterations for an image (paginated, filterable)."""
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 1
    if page_size > 100:
        page_size = 100
    if sort not in ("created_at", "id"):
        sort = "created_at"
    if order not in ("asc", "desc"):
        order = "desc"

    user_id = get_current_user_id(request)
    _ensure_image_owned(db, image_id, user_id)
    offset = (page - 1) * page_size

    where_clauses = ["image_id = ?"]
    params: list[object] = [image_id]
    if status_filter in ("draft", "accepted", "rejected"):
        where_clauses.append("status = ?")
        params.append(status_filter)
    if is_demo is not None:
        where_clauses.append("is_demo = ?")
        params.append(1 if is_demo else 0)
    if algorithm_mode in ("simple", "advanced"):
        where_clauses.append("algorithm_mode = ?")
        params.append(algorithm_mode)

    where_sql = " AND ".join(where_clauses)
    total_row = db.execute(
        f"SELECT COUNT(*) AS total FROM plan_iterations WHERE {where_sql}",
        params,
    ).fetchone()
    total = total_row["total"] if total_row else 0

    params.extend([page_size, offset])
    cursor = db.execute(
        f"SELECT id, image_id, parent_id, created_by, status, accepted_at, accepted_by, "
        f"is_demo, params_snapshot, target_coverage_pct, achieved_coverage_pct, "
        f"spots_count, spots_outside_mask_count, overlap_count, plan_valid, created_at "
        f"FROM plan_iterations WHERE {where_sql} ORDER BY {sort} {order} LIMIT ? OFFSET ?",
        params,
    )
    rows = cursor.fetchall()
    items = [IterationSchema(**_row_to_iteration(r)) for r in rows]
    return IterationListSchema(items=items, total=total, page=page, page_size=page_size)


def _get_upload_dir() -> Path:
    """Upload directory for image files (same logic as images API)."""
    base = os.environ.get("UPLOAD_DIR", "uploads")
    path = Path(base)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent.parent / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def _get_image_width_height_mm(
    db: sqlite3.Connection, image_id: int, user_id: int
) -> tuple[float, float]:
    """
    Return (width_mm, height_mm) for the image.
    height_mm = width_mm * H / W from pixel dimensions; if image file is missing, assume square.
    """
    row = db.execute(
        "SELECT storage_path, width_mm FROM images WHERE id = ? AND created_by = ?",
        (image_id, user_id),
    ).fetchone()
    if not row:
        return (0.0, 0.0)
    width_mm = float(row["width_mm"])
    upload_dir = _get_upload_dir()
    path = upload_dir / Path(row["storage_path"]).name
    if not path.is_file():
        return (width_mm, width_mm)  # assume square if file missing
    try:
        with PILImage.open(path) as img:
            w, h = img.size
        if w <= 0:
            return (width_mm, width_mm)
        height_mm = width_mm * h / w
        return (width_mm, height_mm)
    except Exception:
        return (width_mm, width_mm)


def _load_masks_for_plan(db: sqlite3.Connection, image_id: int) -> list[MaskPolygon]:
    """Load masks for image; vertices in top-left mm (JSON array of {x,y})."""
    rows = db.execute(
        "SELECT id, vertices, mask_label FROM masks WHERE image_id = ?",
        (image_id,),
    ).fetchall()
    result: list[MaskPolygon] = []
    for r in rows:
        raw = r["vertices"]
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(data, list) or len(data) < 3:
            continue
        verts: list[tuple[float, float]] = []
        for p in data:
            if isinstance(p, dict) and "x" in p and "y" in p:
                verts.append((float(p["x"]), float(p["y"])))
            elif isinstance(p, (list, tuple)) and len(p) >= 2:
                verts.append((float(p[0]), float(p[1])))
        if len(verts) >= 3:
            result.append(
                MaskPolygon(
                    mask_id=int(r["id"]),
                    vertices=verts,
                    mask_label=r["mask_label"] if r["mask_label"] else None,
                )
            )
    return result


@router.post("/{image_id:int}/iterations", status_code=status.HTTP_201_CREATED, response_model=IterationSchema)
def create_iteration(
    image_id: int,
    payload: IterationCreateSchema,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> IterationSchema:
    """Create iteration: run grid/sequence algorithm, store spots and metrics."""
    user_id = get_current_user_id(request)
    _ensure_image_owned(db, image_id, user_id)

    width_mm, height_mm = _get_image_width_height_mm(db, image_id, user_id)
    if width_mm <= 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )

    params_snapshot = {
        "scale_mm": width_mm,
        "spot_diameter_um": 300.0,
        "angle_step_deg": 5.0,
        "coverage_pct": payload.target_coverage_pct,
        "coverage_per_mask": payload.coverage_per_mask,
        "algorithm_mode": payload.algorithm_mode,
    }
    if payload.algorithm_mode == "simple":
        params_snapshot["grid_spacing_mm"] = (
            payload.grid_spacing_mm if payload.grid_spacing_mm is not None else 0.8
        )
    params_json = json.dumps(params_snapshot)

    is_demo_int = 1 if payload.is_demo else 0

    parent_row = db.execute(
        "SELECT id FROM plan_iterations WHERE image_id = ? ORDER BY created_at DESC LIMIT 1",
        (image_id,),
    ).fetchone()
    parent_id: int | None = int(parent_row["id"]) if parent_row else None

    masks_tl = _load_masks_for_plan(db, image_id)
    # Convert mask vertices from top-left mm to center mm (+y up) for planner
    masks_center: list[MaskPolygon] = []
    for m in masks_tl:
        verts_center = vertices_top_left_to_center(m.vertices, width_mm, height_mm)
        masks_center.append(
            MaskPolygon(
                mask_id=m.mask_id,
                vertices=verts_center,
                mask_label=m.mask_label,
            )
        )
    coverage_per_mask = payload.coverage_per_mask if payload.coverage_per_mask else None
    grid_spacing = (
        payload.grid_spacing_mm if payload.algorithm_mode == "simple" else None
    )
    plan = generate_plan_by_mode(
        masks_center,
        payload.target_coverage_pct,
        coverage_per_mask,
        width_mm,
        payload.algorithm_mode,
        grid_spacing_mm=grid_spacing,
    )

    try:
        cursor = db.execute(
            "INSERT INTO plan_iterations (image_id, parent_id, created_by, status, is_demo, "
            "params_snapshot, target_coverage_pct, achieved_coverage_pct, spots_count, "
            "spots_outside_mask_count, overlap_count, plan_valid, algorithm_mode, created_at) "
            "VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            (
                image_id,
                parent_id,
                user_id,
                is_demo_int,
                params_json,
                payload.target_coverage_pct,
                plan.achieved_coverage_pct,
                plan.spots_count,
                plan.spots_outside_mask_count,
                plan.overlap_count,
                plan.plan_valid,
                payload.algorithm_mode,
            ),
        )
        row_id = cursor.lastrowid

        # Store spots in top-left mm (DB/frontend convention)
        for seq_idx, spot in enumerate(plan.spots):
            x_tl, y_tl = center_mm_to_top_left_mm(
                spot.x_mm, spot.y_mm, width_mm, height_mm
            )
            db.execute(
                "INSERT INTO spots (iteration_id, sequence_index, x_mm, y_mm, theta_deg, t_mm, mask_id, component_id, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))",
                (
                    row_id,
                    seq_idx,
                    x_tl,
                    y_tl,
                    spot.theta_deg,
                    spot.t_mm,
                    spot.mask_id,
                ),
            )

        db.execute(
            "INSERT INTO audit_log (iteration_id, event_type, payload, user_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
            (row_id, "iteration_created", "{}", user_id),
        )
        db.execute(
            "INSERT INTO audit_log (iteration_id, event_type, payload, user_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
            (
                row_id,
                "plan_generated",
                json.dumps({
                    "target_coverage_pct": payload.target_coverage_pct,
                    "spots_count": plan.spots_count,
                    "achieved_coverage_pct": plan.achieved_coverage_pct,
                }),
                user_id,
            ),
        )
        if plan.fallback_used:
            db.execute(
                "INSERT INTO audit_log (iteration_id, event_type, payload, user_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
                (row_id, "fallback_used", "{}", user_id),
            )
        db.commit()
    except Exception as exc:
        logger.exception("Failed to insert iteration or spots.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create iteration",
        ) from exc

    row = db.execute(
        "SELECT id, image_id, parent_id, created_by, status, accepted_at, accepted_by, "
        "is_demo, params_snapshot, target_coverage_pct, achieved_coverage_pct, "
        "spots_count, spots_outside_mask_count, overlap_count, plan_valid, created_at "
        "FROM plan_iterations WHERE id = ?",
        (row_id,),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Iteration not found after insert",
        )
    return IterationSchema(**_row_to_iteration(row))
