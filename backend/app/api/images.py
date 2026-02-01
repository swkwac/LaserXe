"""Images API: list, upload, get by id, update, delete, audit-log for image."""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, UploadFile, File, Form
from fastapi.responses import FileResponse

from app.db.connection import get_db
from app.schemas.images import ImageSchema, PagedImagesSchema, ImageUpdateSchema
from app.schemas.audit_log import AuditLogEntrySchema, AuditLogListSchema

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg"}
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg"}


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


def _row_to_image(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "storage_path": row["storage_path"],
        "width_mm": row["width_mm"],
        "created_by": row["created_by"],
        "created_at": row["created_at"],
    }


@router.get("", response_model=PagedImagesSchema)
def list_images(
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    sort: str = "created_at",
    order: str = "desc",
) -> PagedImagesSchema:
    """List images for the current user (paginated)."""
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
    offset = (page - 1) * page_size

    total_row = db.execute(
        "SELECT COUNT(*) AS total FROM images WHERE created_by = ?",
        (user_id,),
    ).fetchone()
    total = total_row["total"] if total_row else 0

    cursor = db.execute(
        f"SELECT id, storage_path, width_mm, created_by, created_at "
        f"FROM images WHERE created_by = ? ORDER BY {sort} {order} LIMIT ? OFFSET ?",
        (user_id, page_size, offset),
    )
    rows = cursor.fetchall()
    items = [_row_to_image(row) for row in rows]

    return PagedImagesSchema(items=items, total=total, page=page, page_size=page_size)


def _get_upload_dir() -> Path:
    base = os.environ.get("UPLOAD_DIR", "uploads")
    path = Path(base)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent.parent / path
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ImageSchema)
def create_image(
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    file: UploadFile = File(...),
    width_mm: float = Form(...),
) -> ImageSchema:
    """Upload image (PNG/JPG) and set scale (width_mm)."""
    if width_mm <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="width_mm must be positive",
        )

    content_type = (file.content_type or "").strip().lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PNG and JPG are allowed",
        )

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PNG and JPG are allowed",
        )

    user_id = get_current_user_id(request)
    upload_dir = _get_upload_dir()
    unique_name = f"{uuid.uuid4().hex}{suffix}"
    storage_path = f"uploads/{unique_name}"
    dest_path = upload_dir / unique_name

    try:
        contents = file.file.read()
    except Exception as exc:
        logger.exception("Failed to read uploaded file.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read file",
        ) from exc

    try:
        dest_path.write_bytes(contents)
    except Exception as exc:
        logger.exception("Failed to write file to %s", dest_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file",
        ) from exc

    try:
        cursor = db.execute(
            "INSERT INTO images (storage_path, width_mm, created_by, created_at) "
            "VALUES (?, ?, ?, datetime('now'))",
            (storage_path, width_mm, user_id),
        )
        db.commit()
        row_id = cursor.lastrowid
    except Exception as exc:
        logger.exception("Failed to insert image row.")
        try:
            dest_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save image record",
        ) from exc

    row = db.execute(
        "SELECT id, storage_path, width_mm, created_by, created_at FROM images WHERE id = ?",
        (row_id,),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Image not found after insert",
        )
    return ImageSchema(**_row_to_image(row))


@router.get("/{image_id:int}", response_model=ImageSchema)
def get_image(
    image_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> ImageSchema:
    """Get one image by id (must belong to current user)."""
    user_id = get_current_user_id(request)
    row = db.execute(
        "SELECT id, storage_path, width_mm, created_by, created_at FROM images WHERE id = ? AND created_by = ?",
        (image_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )
    return ImageSchema(**_row_to_image(row))


EVENT_TYPES = (
    "iteration_created",
    "iteration_accepted",
    "iteration_rejected",
    "plan_generated",
    "fallback_used",
)


def _audit_row_to_entry(row: sqlite3.Row) -> dict:
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


@router.get("/{image_id:int}/audit-log", response_model=AuditLogListSchema)
def list_image_audit_log(
    image_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    event_type: str | None = Query(None),
    from_ts: str | None = Query(None, alias="from"),
    to_ts: str | None = Query(None, alias="to"),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
) -> AuditLogListSchema:
    """List audit log entries for all iterations of this image (image must belong to current user)."""
    user_id = get_current_user_id(request)
    row = db.execute(
        "SELECT id FROM images WHERE id = ? AND created_by = ?",
        (image_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )
    if sort not in ("created_at", "id", "event_type"):
        sort = "created_at"
    if order not in ("asc", "desc"):
        order = "desc"
    order_sql = "ASC" if order == "asc" else "DESC"

    base = (
        "FROM audit_log a "
        "INNER JOIN plan_iterations p ON a.iteration_id = p.id "
        "WHERE p.image_id = ? AND p.image_id IN (SELECT id FROM images WHERE created_by = ?)"
    )
    params: list = [image_id, user_id]
    if event_type is not None and event_type in EVENT_TYPES:
        base += " AND a.event_type = ?"
        params.append(event_type)
    if from_ts is not None:
        base += " AND a.created_at >= ?"
        params.append(from_ts)
    if to_ts is not None:
        base += " AND a.created_at <= ?"
        params.append(to_ts)

    total_row = db.execute(
        f"SELECT COUNT(*) AS total {base}",
        params,
    ).fetchone()
    total = total_row["total"] if total_row else 0

    offset = (page - 1) * page_size
    params.extend([page_size, offset])
    rows = db.execute(
        f"SELECT a.id, a.iteration_id, a.event_type, a.payload, a.user_id, a.created_at {base} ORDER BY a.{sort} {order_sql} LIMIT ? OFFSET ?",
        params,
    ).fetchall()
    items = [AuditLogEntrySchema(**_audit_row_to_entry(r)) for r in rows]
    return AuditLogListSchema(items=items, total=total, page=page, page_size=page_size)


@router.get("/{image_id:int}/file")
def get_image_file(
    image_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
):
    """Serve image file (PNG/JPG). Must belong to current user."""
    user_id = get_current_user_id(request)
    row = db.execute(
        "SELECT id, storage_path FROM images WHERE id = ? AND created_by = ?",
        (image_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )
    upload_dir = _get_upload_dir()
    path = upload_dir / Path(row["storage_path"]).name
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image file not found",
        )
    suffix = path.suffix.lower()
    media_type = "image/png" if suffix == ".png" else "image/jpeg"
    return FileResponse(path, media_type=media_type)


@router.patch("/{image_id:int}", response_model=ImageSchema)
def update_image(
    image_id: int,
    payload: ImageUpdateSchema,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> ImageSchema:
    """Update image (e.g. width_mm)."""
    if payload.width_mm is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No fields to update",
        )
    user_id = get_current_user_id(request)
    cursor = db.execute(
        "UPDATE images SET width_mm = ? WHERE id = ? AND created_by = ?",
        (payload.width_mm, image_id, user_id),
    )
    db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )
    row = db.execute(
        "SELECT id, storage_path, width_mm, created_by, created_at FROM images WHERE id = ?",
        (image_id,),
    ).fetchone()
    return ImageSchema(**_row_to_image(row))


@router.delete("/{image_id:int}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(
    image_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> None:
    """Delete image (cascades to masks, iterations, spots)."""
    user_id = get_current_user_id(request)
    cursor = db.execute(
        "DELETE FROM images WHERE id = ? AND created_by = ?",
        (image_id, user_id),
    )
    db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )
