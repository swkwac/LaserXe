"""Pydantic schemas for Audit log API (response)."""

from __future__ import annotations

from pydantic import BaseModel


class AuditLogEntrySchema(BaseModel):
    """Single audit log entry."""

    id: int
    iteration_id: int | None
    event_type: str
    payload: dict | None
    user_id: int | None
    created_at: str


class AuditLogListSchema(BaseModel):
    """Paginated list of audit log entries."""

    items: list[AuditLogEntrySchema]
    total: int
    page: int
    page_size: int
