"""Masks API: list, create, get, update, delete for an image."""

from __future__ import annotations

import json
import logging
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.db.connection import get_db
from app.schemas.masks import (
    MaskSchema,
    MaskListSchema,
    MaskCreateSchema,
    MaskUpdateSchema,
    MaskVertexSchema,
)

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


def _vertices_to_json(vertices: list[MaskVertexSchema]) -> str:
    data = [{"x": v.x, "y": v.y} for v in vertices]
    return json.dumps(data)


def _row_to_mask(row: sqlite3.Row) -> dict:
    raw = row["vertices"]
    try:
        verts = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError):
        verts = []
    return {
        "id": row["id"],
        "image_id": row["image_id"],
        "vertices": [{"x": v["x"], "y": v["y"]} for v in verts],
        "mask_label": row["mask_label"],
        "created_at": row["created_at"],
    }


@router.get("/{image_id:int}/masks", response_model=MaskListSchema)
def list_masks(
    image_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> MaskListSchema:
    """List masks for an image (must belong to current user)."""
    user_id = get_current_user_id(request)
    _ensure_image_owned(db, image_id, user_id)
    cursor = db.execute(
        "SELECT id, image_id, vertices, mask_label, created_at FROM masks WHERE image_id = ? ORDER BY id",
        (image_id,),
    )
    rows = cursor.fetchall()
    items = [MaskSchema(**_row_to_mask(r)) for r in rows]
    return MaskListSchema(items=items)


@router.post("/{image_id:int}/masks", status_code=status.HTTP_201_CREATED, response_model=MaskSchema)
def create_mask(
    image_id: int,
    payload: MaskCreateSchema,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> MaskSchema:
    """Create mask (vertices, optional mask_label). At least 3 vertices required."""
    user_id = get_current_user_id(request)
    _ensure_image_owned(db, image_id, user_id)
    vertices_json = _vertices_to_json(payload.vertices)
    try:
        cursor = db.execute(
            "INSERT INTO masks (image_id, vertices, mask_label, created_at) VALUES (?, ?, ?, datetime('now'))",
            (image_id, vertices_json, payload.mask_label),
        )
        db.commit()
        row_id = cursor.lastrowid
    except Exception as exc:
        logger.exception("Failed to insert mask.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create mask",
        ) from exc
    row = db.execute(
        "SELECT id, image_id, vertices, mask_label, created_at FROM masks WHERE id = ?",
        (row_id,),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Mask not found after insert",
        )
    return MaskSchema(**_row_to_mask(row))


@router.get("/{image_id:int}/masks/{mask_id:int}", response_model=MaskSchema)
def get_mask(
    image_id: int,
    mask_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> MaskSchema:
    """Get one mask (image must belong to current user)."""
    user_id = get_current_user_id(request)
    _ensure_image_owned(db, image_id, user_id)
    row = db.execute(
        "SELECT id, image_id, vertices, mask_label, created_at FROM masks WHERE id = ? AND image_id = ?",
        (mask_id, image_id),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mask not found",
        )
    return MaskSchema(**_row_to_mask(row))


@router.patch("/{image_id:int}/masks/{mask_id:int}", response_model=MaskSchema)
def update_mask(
    image_id: int,
    mask_id: int,
    payload: MaskUpdateSchema,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> MaskSchema:
    """Update mask (partial: vertices, mask_label)."""
    user_id = get_current_user_id(request)
    _ensure_image_owned(db, image_id, user_id)
    row = db.execute(
        "SELECT id, image_id, vertices, mask_label, created_at FROM masks WHERE id = ? AND image_id = ?",
        (mask_id, image_id),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mask not found",
        )
    updates = []
    params = []
    if payload.vertices is not None:
        if len(payload.vertices) < 3:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="At least 3 vertices required",
            )
        updates.append("vertices = ?")
        params.append(_vertices_to_json(payload.vertices))
    if payload.mask_label is not None:
        updates.append("mask_label = ?")
        params.append(payload.mask_label)
    if not updates:
        return MaskSchema(**_row_to_mask(row))
    params.extend([mask_id, image_id])
    db.execute(
        f"UPDATE masks SET {', '.join(updates)} WHERE id = ? AND image_id = ?",
        params,
    )
    db.commit()
    row = db.execute(
        "SELECT id, image_id, vertices, mask_label, created_at FROM masks WHERE id = ? AND image_id = ?",
        (mask_id, image_id),
    ).fetchone()
    return MaskSchema(**_row_to_mask(row))


@router.delete("/{image_id:int}/masks/{mask_id:int}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mask(
    image_id: int,
    mask_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> None:
    """Delete mask (image must belong to current user)."""
    user_id = get_current_user_id(request)
    _ensure_image_owned(db, image_id, user_id)
    cursor = db.execute(
        "DELETE FROM masks WHERE id = ? AND image_id = ?",
        (mask_id, image_id),
    )
    db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mask not found",
        )
