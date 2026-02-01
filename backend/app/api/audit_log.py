"""Audit log API: GET /api/audit-log, GET /api/iterations/{id}/audit-log."""

from __future__ import annotations

import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.db.connection import get_db
from app.schemas.audit_log import AuditLogEntrySchema, AuditLogListSchema

router = APIRouter()

EVENT_TYPES = (
    "iteration_created",
    "iteration_accepted",
    "iteration_rejected",
    "plan_generated",
    "fallback_used",
)


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


def _row_to_entry(row: sqlite3.Row) -> dict:
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


@router.get("/audit-log", response_model=AuditLogListSchema)
def list_audit_log(
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    iteration_id: int | None = Query(None),
    user_id: int | None = Query(None),
    event_type: str | None = Query(None),
    from_ts: str | None = Query(None, alias="from"),
    to_ts: str | None = Query(None, alias="to"),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
) -> AuditLogListSchema:
    """List audit log entries (only for iterations owned by current user)."""
    uid = get_current_user_id(request)
    if sort not in ("created_at", "id", "event_type"):
        sort = "created_at"
    if order not in ("asc", "desc"):
        order = "desc"
    order_sql = "ASC" if order == "asc" else "DESC"

    base = (
        "FROM audit_log a "
        "INNER JOIN plan_iterations p ON a.iteration_id = p.id "
        "INNER JOIN images i ON p.image_id = i.id AND i.created_by = ? "
        "WHERE 1=1"
    )
    params: list = [uid]
    if iteration_id is not None:
        base += " AND a.iteration_id = ?"
        params.append(iteration_id)
    if user_id is not None:
        base += " AND a.user_id = ?"
        params.append(user_id)
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
    items = [AuditLogEntrySchema(**_row_to_entry(r)) for r in rows]
    return AuditLogListSchema(items=items, total=total, page=page, page_size=page_size)

