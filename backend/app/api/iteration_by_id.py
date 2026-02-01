"""Iterations by id API: GET, PATCH, DELETE /api/iterations/{id}; GET spots, GET export."""

from __future__ import annotations

import csv
import io
import json
import logging
import os
import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from PIL import Image, ImageDraw

from app.db.connection import get_db
from app.schemas.audit_log import AuditLogEntrySchema, AuditLogListSchema
from app.schemas.iterations import (
    IterationExportJsonSchema,
    IterationSchema,
    IterationUpdateSchema,
)
from app.schemas.spots import SpotSchema, SpotsListSchema

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


def _parse_params_snapshot(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError):
        return None


def _row_to_iteration(row: sqlite3.Row) -> dict:
    # sqlite3.Row supports row["col"] but not row.get()
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


def _get_iteration_owned_by_user(
    db: sqlite3.Connection, iteration_id: int, user_id: int
) -> sqlite3.Row | None:
    """Return iteration row if it belongs to an image owned by user, else None."""
    return db.execute(
        "SELECT p.id, p.image_id, p.parent_id, p.created_by, p.status, p.accepted_at, p.accepted_by, "
        "p.is_demo, p.params_snapshot, p.target_coverage_pct, p.achieved_coverage_pct, "
        "p.spots_count, p.spots_outside_mask_count, p.overlap_count, p.plan_valid, p.created_at "
        "FROM plan_iterations p "
        "INNER JOIN images i ON p.image_id = i.id AND i.created_by = ? "
        "WHERE p.id = ?",
        (user_id, iteration_id),
    ).fetchone()


def _row_to_spot(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "iteration_id": row["iteration_id"],
        "sequence_index": row["sequence_index"],
        "x_mm": row["x_mm"],
        "y_mm": row["y_mm"],
        "theta_deg": row["theta_deg"],
        "t_mm": row["t_mm"],
        "mask_id": row["mask_id"],
        "component_id": row["component_id"],
        "created_at": row["created_at"],
    }


@router.get("/{iteration_id:int}", response_model=IterationSchema)
def get_iteration(
    iteration_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> IterationSchema:
    """Get one iteration by id (must belong to user's image)."""
    user_id = get_current_user_id(request)
    row = _get_iteration_owned_by_user(db, iteration_id, user_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Iteration not found",
        )
    return IterationSchema(**_row_to_iteration(row))


@router.get("/{iteration_id:int}/spots", response_model=None)
def get_iteration_spots(
    iteration_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    format: str = Query("json", pattern="^(json|csv)$"),
) -> SpotsListSchema | Response:
    """Get spots for iteration (ordered by sequence_index). JSON or CSV."""
    user_id = get_current_user_id(request)
    row = _get_iteration_owned_by_user(db, iteration_id, user_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Iteration not found",
        )
    rows = db.execute(
        "SELECT id, iteration_id, sequence_index, x_mm, y_mm, theta_deg, t_mm, "
        "mask_id, component_id, created_at FROM spots WHERE iteration_id = ? "
        "ORDER BY sequence_index ASC",
        (iteration_id,),
    ).fetchall()
    items = [SpotSchema(**_row_to_spot(r)) for r in rows]
    if format == "csv":
        params = _parse_params_snapshot(row["params_snapshot"])
        buf = io.StringIO()
        if params:
            if params.get("algorithm_mode") is not None:
                buf.write(f"# algorithm_mode={params['algorithm_mode']}\n")
            if params.get("grid_spacing_mm") is not None:
                buf.write(f"# grid_spacing_mm={params['grid_spacing_mm']}\n")
        writer = csv.writer(buf)
        writer.writerow(
            ["sequence_index", "theta_deg", "t_mm", "x_mm", "y_mm", "mask_id", "component_id"]
        )
        for s in items:
            writer.writerow(
                [
                    s.sequence_index,
                    s.theta_deg,
                    s.t_mm,
                    s.x_mm,
                    s.y_mm,
                    s.mask_id if s.mask_id is not None else "",
                    s.component_id if s.component_id is not None else "",
                ]
            )
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=iteration-{iteration_id}-spots.csv"
            },
        )
    return SpotsListSchema(items=items)


def _get_upload_dir() -> Path:
    base = os.environ.get("UPLOAD_DIR", "uploads")
    path = Path(base)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent.parent / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def _render_export_image(
    image_path: Path,
    width_mm: float,
    mask_vertices_list: list[list[tuple[float, float]]],
    spot_xy_mm: list[tuple[float, float]],
    output_format: str,
) -> bytes:
    """Draw masks and spots on image, return PNG or JPEG bytes."""
    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    if width_mm <= 0:
        scale = 1.0
    else:
        scale = w / width_mm
    draw = ImageDraw.Draw(img)
    for verts_mm in mask_vertices_list:
        verts_px = [(int(x * scale), int(y * scale)) for x, y in verts_mm]
        if len(verts_px) >= 3:
            draw.polygon(verts_px, outline=(100, 200, 100), fill=(200, 255, 200))
    r = max(2, int(3 * scale))
    for x_mm, y_mm in spot_xy_mm:
        x, y = int(x_mm * scale), int(y_mm * scale)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(255, 100, 100), outline=(180, 0, 0))
    buf = io.BytesIO()
    if output_format == "jpg":
        img.save(buf, format="JPEG", quality=90)
    else:
        img.save(buf, format="PNG")
    return buf.getvalue()


@router.get("/{iteration_id:int}/export", response_model=None)
def get_iteration_export(
    iteration_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    format: str = Query(..., pattern="^(json|png|jpg)$"),
) -> IterationExportJsonSchema | Response:
    """Export iteration as JSON or image (PNG/JPG) with overlay."""
    user_id = get_current_user_id(request)
    row = _get_iteration_owned_by_user(db, iteration_id, user_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Iteration not found",
        )
    image_id = row["image_id"]
    if format in ("png", "jpg"):
        img_row = db.execute(
            "SELECT storage_path, width_mm FROM images WHERE id = ? AND created_by = ?",
            (image_id, user_id),
        ).fetchone()
        if not img_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image not found",
            )
        upload_dir = _get_upload_dir()
        path = upload_dir / Path(img_row["storage_path"]).name
        if not path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image file not found",
            )
        mask_rows = db.execute(
            "SELECT vertices FROM masks WHERE image_id = ?",
            (image_id,),
        ).fetchall()
        mask_vertices_list = []
        for mr in mask_rows:
            raw = mr["vertices"]
            try:
                verts = json.loads(raw) if isinstance(raw, str) else raw
            except (TypeError, json.JSONDecodeError):
                verts = []
            mask_vertices_list.append([(float(v["x"]), float(v["y"])) for v in verts])
        spot_rows = db.execute(
            "SELECT x_mm, y_mm FROM spots WHERE iteration_id = ? ORDER BY sequence_index ASC",
            (iteration_id,),
        ).fetchall()
        spot_xy_mm = [(float(s["x_mm"]), float(s["y_mm"])) for s in spot_rows]
        content = _render_export_image(
            path,
            float(img_row["width_mm"]),
            mask_vertices_list,
            spot_xy_mm,
            format,
        )
        media_type = "image/png" if format == "png" else "image/jpeg"
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename=iteration-{iteration_id}-export.{format}"
            },
        )
    params = _parse_params_snapshot(row["params_snapshot"])
    metadata = {
        "version": "1.0",
        "iteration_id": iteration_id,
        "parent_id": row["parent_id"],
        "created_at": row["created_at"],
        "params": params,
        "algorithm_mode": (params or {}).get("algorithm_mode"),
        "grid_spacing_mm": (params or {}).get("grid_spacing_mm"),
    }
    mask_rows = db.execute(
        "SELECT id, image_id, vertices, mask_label, created_at FROM masks WHERE image_id = ?",
        (image_id,),
    ).fetchall()
    masks = []
    for mr in mask_rows:
        raw = mr["vertices"]
        try:
            verts = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, json.JSONDecodeError):
            verts = []
        masks.append(
            {
                "id": mr["id"],
                "image_id": mr["image_id"],
                "vertices": [{"x": v["x"], "y": v["y"]} for v in verts],
                "mask_label": mr["mask_label"],
                "created_at": mr["created_at"],
            }
        )
    spot_rows = db.execute(
        "SELECT id, iteration_id, sequence_index, x_mm, y_mm, theta_deg, t_mm, "
        "mask_id, component_id, created_at FROM spots WHERE iteration_id = ? "
        "ORDER BY sequence_index ASC",
        (iteration_id,),
    ).fetchall()
    points = [_row_to_spot(s) for s in spot_rows]
    metrics = {
        "achieved_coverage_pct": row["achieved_coverage_pct"],
        "target_coverage_pct": row["target_coverage_pct"],
        "spots_count": row["spots_count"],
        "spots_outside_mask_count": row["spots_outside_mask_count"],
        "overlap_count": row["overlap_count"],
    }
    validation = {
        "plan_valid": bool(row["plan_valid"]),
        "errors": [] if row["plan_valid"] else ["Plan invalid or incomplete"],
    }
    return IterationExportJsonSchema(
        metadata=metadata,
        masks=masks,
        points=points,
        metrics=metrics,
        validation=validation,
    )


def _row_to_audit_entry(row: sqlite3.Row) -> dict:
    raw = row["payload"]
    payload = None
    if raw is not None:
        try:
            payload = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, json.JSONDecodeError):
            pass
    return {
        "id": row["id"],
        "iteration_id": row["iteration_id"],
        "event_type": row["event_type"],
        "payload": payload,
        "user_id": row["user_id"],
        "created_at": row["created_at"],
    }


@router.get("/{iteration_id:int}/audit-log", response_model=AuditLogListSchema)
def list_iteration_audit_log(
    iteration_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
) -> AuditLogListSchema:
    """List audit log entries for one iteration (must belong to user's image)."""
    user_id = get_current_user_id(request)
    if _get_iteration_owned_by_user(db, iteration_id, user_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Iteration not found",
        )
    if sort not in ("created_at", "id", "event_type"):
        sort = "created_at"
    order_sql = "ASC" if order == "asc" else "DESC"
    total_row = db.execute(
        "SELECT COUNT(*) AS total FROM audit_log WHERE iteration_id = ?",
        (iteration_id,),
    ).fetchone()
    total = total_row["total"] if total_row else 0
    offset = (page - 1) * page_size
    rows = db.execute(
        "SELECT id, iteration_id, event_type, payload, user_id, created_at "
        "FROM audit_log WHERE iteration_id = ? ORDER BY " + sort + " " + order_sql + " LIMIT ? OFFSET ?",
        (iteration_id, page_size, offset),
    ).fetchall()
    items = [AuditLogEntrySchema(**_row_to_audit_entry(r)) for r in rows]
    return AuditLogListSchema(items=items, total=total, page=page, page_size=page_size)


@router.patch("/{iteration_id:int}", response_model=IterationSchema)
def update_iteration(
    iteration_id: int,
    payload: IterationUpdateSchema,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> IterationSchema:
    """Update iteration (e.g. status to accepted/rejected)."""
    if payload.status is None:
        row = _get_iteration_owned_by_user(db, iteration_id, get_current_user_id(request))
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Iteration not found")
        return IterationSchema(**_row_to_iteration(row))

    user_id = get_current_user_id(request)
    row = _get_iteration_owned_by_user(db, iteration_id, user_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Iteration not found",
        )

    new_status = payload.status
    if new_status == "accepted":
        if row["plan_valid"] != 1 or row["is_demo"] != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Plan cannot be accepted: invalid or demo iteration",
            )
        db.execute(
            "UPDATE plan_iterations SET status = ?, accepted_at = datetime('now'), accepted_by = ? WHERE id = ?",
            (new_status, user_id, iteration_id),
        )
        db.execute(
            "INSERT INTO audit_log (iteration_id, event_type, payload, user_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
            (iteration_id, "iteration_accepted", "{}", user_id),
        )
    else:
        db.execute(
            "UPDATE plan_iterations SET status = ? WHERE id = ?",
            (new_status, iteration_id),
        )
        if new_status == "rejected":
            db.execute(
                "INSERT INTO audit_log (iteration_id, event_type, payload, user_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
                (iteration_id, "iteration_rejected", "{}", user_id),
            )
    db.commit()

    updated = _get_iteration_owned_by_user(db, iteration_id, user_id)
    return IterationSchema(**_row_to_iteration(updated))


@router.delete("/{iteration_id:int}", status_code=status.HTTP_204_NO_CONTENT)
def delete_iteration(
    iteration_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> None:
    """Delete iteration (only draft allowed)."""
    user_id = get_current_user_id(request)
    row = _get_iteration_owned_by_user(db, iteration_id, user_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Iteration not found",
        )
    if row["status"] != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft iterations can be deleted",
        )
    cursor = db.execute("DELETE FROM plan_iterations WHERE id = ?", (iteration_id,))
    db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Iteration not found",
        )
