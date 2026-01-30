# REST API Plan

**Version:** 1.0  
**Date:** 2026-01-30  
**Context:** laserme 2.0a (LaserXe) MVP – Python backend (FastAPI), SQLite, aligned with db-plan, PRD, and tech-stack.

---

## 1. Resources

| Resource        | DB Table         | Description |
|----------------|------------------|-------------|
| **Auth**       | users            | Login; no direct CRUD on users in MVP except via login. |
| **Images**     | images           | Uploaded lesion images with scale (width_mm). |
| **Masks**      | masks            | Polygons per image (vertices JSON, mask_label). |
| **Iterations** | plan_iterations  | Plan versions (draft/accepted/rejected), params snapshot, metrics. |
| **Spots**      | spots            | Emission sequence points per iteration (read-only from API perspective after generation). |
| **Audit log**  | audit_log        | Events (iteration_created, iteration_accepted, iteration_rejected, plan_generated, fallback_used). |
| **Export**     | —                | On-demand export of iteration (JSON, PNG/JPG); no dedicated table in MVP. |

---

## 2. Endpoints

Base path: `/api` for application resources. The health check is served at `/health` (outside the base path).  
Authentication: all endpoints under `/api` require a valid session or token except `POST /api/auth/login` (see §3).

---

### 2.1. Health

| HTTP  | Path     | Description |
|-------|----------|-------------|
| GET   | /health  | Liveness/readiness for CI/CD and Docker. No auth. |

**Query parameters:** none.

**Response (200):**

```json
{
  "status": "ok"
}
```

**Error responses:** none (always 200 when service is up).

---

### 2.2. Authentication

| HTTP  | Path           | Description |
|-------|----------------|-------------|
| POST  | /api/auth/login | Authenticate user; returns session/token. |

**Request body (JSON):**

```json
{
  "login": "string",
  "password": "string"
}
```

| Field     | Type   | Required | Validation |
|-----------|--------|----------|------------|
| login     | string | yes      | Non-empty. |
| password  | string | yes      | Non-empty. |

**Response (200):**

```json
{
  "token": "string",
  "user": {
    "id": 1,
    "login": "user"
  }
}
```

Or session via `Set-Cookie` (secure, httpOnly) and body:

```json
{
  "user": {
    "id": 1,
    "login": "user"
  }
}
```

**Error responses:**

| Code | Condition           | Body example |
|------|---------------------|--------------|
| 401  | Invalid credentials | `{ "detail": "Invalid login or password" }` |
| 422  | Missing/invalid body| Validation error (e.g. Pydantic). |

**Logout (optional in MVP):**  
If using token: client discards token. If using cookie: `POST /api/auth/logout` clears session cookie and returns 204.

---

### 2.3. Images

| HTTP   | Path                    | Description |
|--------|-------------------------|-------------|
| GET    | /api/images             | List images for the current user (paginated). |
| POST   | /api/images             | Upload image (multipart) and set scale (width_mm). |
| GET    | /api/images/{id}        | Get one image by id. |
| PATCH  | /api/images/{id}        | Update image (e.g. width_mm). |
| DELETE | /api/images/{id}        | Delete image (cascades to masks, iterations, spots). |

**GET /api/images**

**Query parameters:**

| Parameter  | Type   | Default | Description |
|------------|--------|---------|-------------|
| page       | int    | 1       | Page number (1-based). |
| page_size  | int    | 20      | Items per page (max 100). |
| sort       | string | created_at | Sort field: `created_at`, `id`. |
| order      | string | desc    | Sort order: `asc`, `desc`. |

**Response (200):**

```json
{
  "items": [
    {
      "id": 1,
      "storage_path": "uploads/xxx.png",
      "width_mm": 20.0,
      "created_by": 1,
      "created_at": "2026-01-30T12:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 20
}
```

**Error responses:** 401 if not authenticated.

---

**POST /api/images**

**Request:** `multipart/form-data`

| Field     | Type   | Required | Description |
|-----------|--------|----------|-------------|
| file      | file   | yes      | PNG or JPG. |
| width_mm  | number | yes      | Width of lesion in mm (scale). |

**Response (201):**

```json
{
  "id": 1,
  "storage_path": "uploads/xxx.png",
  "width_mm": 20.0,
  "created_by": 1,
  "created_at": "2026-01-30T12:00:00Z"
}
```

**Error responses:**

| Code | Condition              | Body example |
|------|------------------------|--------------|
| 400  | Unsupported file type  | `{ "detail": "Only PNG and JPG are allowed" }` |
| 422  | Missing/invalid fields | Validation error. |

---

**GET /api/images/{id}**

**Path parameters:** `id` – image id (integer).

**Response (200):** Same object as in list item above.

**Error responses:** 401, 404 if image not found or not owned by user.

---

**PATCH /api/images/{id}**

**Request body (JSON):**

```json
{
  "width_mm": 20.5
}
```

| Field     | Type   | Required | Validation |
|-----------|--------|----------|------------|
| width_mm  | number | no       | If present: positive. |

**Response (200):** Updated image object.

**Error responses:** 401, 404, 422.

---

**DELETE /api/images/{id}**

**Response (204):** No body.

**Error responses:** 401, 404.

---

### 2.4. Masks

| HTTP   | Path                          | Description |
|--------|-------------------------------|-------------|
| GET    | /api/images/{image_id}/masks  | List masks for an image. |
| POST   | /api/images/{image_id}/masks  | Create mask (vertices, mask_label). Reject if area < 3% aperture. |
| GET    | /api/images/{image_id}/masks/{mask_id} | Get one mask. |
| PATCH  | /api/images/{image_id}/masks/{mask_id} | Update mask. |
| DELETE | /api/images/{image_id}/masks/{mask_id} | Delete mask. |

**GET /api/images/{image_id}/masks**

**Response (200):**

```json
{
  "items": [
    {
      "id": 1,
      "image_id": 1,
      "vertices": [{"x": 0.0, "y": 0.0}, {"x": 10.0, "y": 0.0}, {"x": 10.0, "y": 10.0}],
      "mask_label": "white",
      "created_at": "2026-01-30T12:00:00Z"
    }
  ]
}
```

**Error responses:** 401, 404 if image not found or not owned.

---

**POST /api/images/{image_id}/masks**

**Request body (JSON):**

```json
{
  "vertices": [{"x": 0.0, "y": 0.0}, {"x": 10.0, "y": 0.0}, {"x": 10.0, "y": 10.0}],
  "mask_label": "white"
}
```

| Field       | Type   | Required | Validation |
|-------------|--------|----------|-------------|
| vertices    | array  | yes      | At least 3 points; each `{ "x": number, "y": number }` in mm (or pixels + scale reference per contract). |
| mask_label  | string | no       | Optional label (e.g. white, blue, green). |

**Response (201):** Created mask object (id, image_id, vertices, mask_label, created_at).

**Error responses:**

| Code | Condition                    | Body example |
|------|------------------------------|--------------|
| 400  | Mask area < 3% aperture      | `{ "detail": "Mask area is below 3% of aperture and is rejected" }` |
| 404  | Image not found              | `{ "detail": "Image not found" }` |
| 422  | Invalid vertices (e.g. < 3 points) | Validation error. |

---

**GET /api/images/{image_id}/masks/{mask_id}**  
**Response (200):** Single mask object. **Errors:** 401, 404.

**PATCH /api/images/{image_id}/masks/{mask_id}**  
**Request body:** Same as POST (vertices, mask_label; partial update). **Response (200):** Updated mask. **Errors:** 400 (if area < 3% after update), 401, 404, 422.

**DELETE /api/images/{image_id}/masks/{mask_id}**  
**Response (204).** **Errors:** 401, 404.

---

### 2.5. Iterations (plan versions)

| HTTP   | Path                                  | Description |
|--------|---------------------------------------|-------------|
| GET    | /api/images/{image_id}/iterations    | List iterations for an image (paginated, filterable). |
| POST   | /api/images/{image_id}/iterations    | Generate new iteration (runs grid + sequence algorithm, stores spots and metrics). |
| GET    | /api/iterations/{id}                  | Get one iteration with summary (no spots by default). |
| GET    | /api/iterations/{id}/spots            | Get spots for iteration (ordered by sequence_index). |
| PATCH  | /api/iterations/{id}                  | Update iteration (e.g. set status to accepted/rejected). |
| DELETE | /api/iterations/{id}                  | Delete iteration (cascade to spots; only draft allowed in MVP). |

**GET /api/images/{image_id}/iterations**

**Query parameters:**

| Parameter  | Type   | Default     | Description |
|------------|--------|-------------|-------------|
| page       | int    | 1           | Page number. |
| page_size  | int    | 20          | Max 100. |
| status     | string | —           | Filter: `draft`, `accepted`, `rejected`. |
| is_demo    | bool   | —           | Filter by demo flag (0 = clinical, 1 = demo). |
| sort       | string | created_at  | `created_at`, `id`. |
| order      | string | desc        | `asc`, `desc`. |

**Response (200):**

```json
{
  "items": [
    {
      "id": 1,
      "image_id": 1,
      "parent_id": null,
      "created_by": 1,
      "status": "draft",
      "accepted_at": null,
      "accepted_by": null,
      "is_demo": 0,
      "params_snapshot": { "scale_mm": 20, "spot_diameter_um": 300, "angle_step_deg": 5, "coverage_pct": 10, "coverage_per_mask": null },
      "target_coverage_pct": 10.0,
      "achieved_coverage_pct": 9.8,
      "spots_count": 150,
      "spots_outside_mask_count": 0,
      "overlap_count": 0,
      "plan_valid": 1,
      "created_at": "2026-01-30T12:00:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "page_size": 20
}
```

**Error responses:** 401, 404 if image not found or not owned.

---

**POST /api/images/{image_id}/iterations**

Creates a new plan iteration: runs grid generation and emission sequence algorithm, validates (overlap, points outside mask), stores spots and metrics, writes audit (e.g. `plan_generated`, `fallback_used` if applicable).  
Uses current user as `created_by`; `parent_id` set to previous iteration for same image if any.

**Request body (JSON):**

```json
{
  "target_coverage_pct": 10.0,
  "coverage_per_mask": { "1": 20.0, "2": 10.0 },
  "is_demo": false
}
```

| Field                | Type   | Required | Validation |
|----------------------|--------|----------|-------------|
| target_coverage_pct  | number | yes      | 3–20 (single-mask or default). |
| coverage_per_mask    | object | no       | Map mask_id (or label) → coverage % (3–20) for multi-mask. |
| is_demo              | bool   | no       | Default false. If true: demo mode (watermark, no clinical accept). |

Other params (spot_diameter_um, angle_step_deg, etc.) are fixed or from config in MVP; can be extended later.

**Response (201):**

```json
{
  "id": 1,
  "image_id": 1,
  "parent_id": null,
  "created_by": 1,
  "status": "draft",
  "is_demo": 0,
  "params_snapshot": { "scale_mm": 20, "spot_diameter_um": 300, "angle_step_deg": 5, "coverage_pct": 10, "coverage_per_mask": null },
  "target_coverage_pct": 10.0,
  "achieved_coverage_pct": 9.8,
  "spots_count": 150,
  "spots_outside_mask_count": 0,
  "overlap_count": 0,
  "plan_valid": 1,
  "created_at": "2026-01-30T12:00:00Z"
}
```

**Error responses:**

| Code | Condition                          | Body example |
|------|------------------------------------|--------------|
| 400  | No valid masks / image not ready   | `{ "detail": "Image has no masks above 3% aperture" }` |
| 404  | Image not found                    | `{ "detail": "Image not found" }` |
| 422  | target_coverage_pct out of range   | Validation error. |

---

**GET /api/iterations/{id}**

**Query parameters:** none.

**Response (200):** Full iteration object (same shape as list item, with all fields). Optionally include `spots_count` and high-level metrics only; spots fetched via `/iterations/{id}/spots` to keep payload small.

**Error responses:** 401, 404.

---

**GET /api/iterations/{id}/spots**

**Query parameters:**

| Parameter  | Type   | Default | Description |
|------------|--------|---------|-------------|
| format     | string | json    | `json` or `csv`. CSV matches PRD export format (index, theta_deg, t_mm, x_mm, y_mm; optional mask, component_id, theta_k for multi-mask). |

**Response (200) – JSON:**

```json
{
  "items": [
    {
      "id": 1,
      "iteration_id": 1,
      "sequence_index": 0,
      "x_mm": 1.5,
      "y_mm": 2.0,
      "theta_deg": 0,
      "t_mm": 0.0,
      "mask_id": 1,
      "component_id": null,
      "created_at": "2026-01-30T12:00:00Z"
    }
  ]
}
```

Items ordered by `sequence_index` ascending.

**Response (200) – CSV:** Content-Type `text/csv`; header row; same columns as PRD §9.1 / 9.2.

**Error responses:** 401, 404.

---

**PATCH /api/iterations/{id}**

Used mainly to set **status** to `accepted` or `rejected`. Accept is only allowed when `plan_valid === 1` and `is_demo === 0`; otherwise return 400.

**Request body (JSON):**

```json
{
  "status": "accepted"
}
```

| Field  | Type   | Required | Validation |
|--------|--------|----------|-------------|
| status | string | no       | One of: `draft`, `accepted`, `rejected`. |

When setting to `accepted`: set `accepted_at` (now), `accepted_by` (current user). Write audit_log `iteration_accepted`. When setting to `rejected`: optional audit `iteration_rejected`.

**Response (200):** Updated iteration object.

**Error responses:**

| Code | Condition                                      | Body example |
|------|------------------------------------------------|--------------|
| 400  | Accept despite plan invalid or demo            | `{ "detail": "Plan cannot be accepted: invalid or demo iteration" }` |
| 404  | Iteration not found                            | `{ "detail": "Iteration not found" }` |
| 422  | Invalid status value                           | Validation error. |

---

**DELETE /api/iterations/{id}**

Only iterations in `draft` status may be deleted (optional business rule; otherwise 400 for accepted/rejected).

**Response (204).** **Errors:** 401, 404, 400 if not draft.

---

### 2.6. Export

| HTTP | Path                          | Description |
|------|-------------------------------|-------------|
| GET  | /api/iterations/{id}/export  | Export iteration as JSON or image (PNG/JPG) with overlay. |

**GET /api/iterations/{id}/export**

**Query parameters:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| format    | string | yes      | `json`, `png`, `jpg`. |

**Response (200):**

- **format=json:** Content-Type `application/json`. Payload per PRD §9.3: metadata (version, iteration_id, parent_id, created_at, params), masks (polygons), points (spots), metrics (achieved vs target coverage, spots_count, spots_outside_mask_count, overlap_count), validation (plan_valid, error messages if blocked).
- **format=png | jpg:** Content-Type `image/png` or `image/jpeg`. Image with spot overlay (and optional diameter lines, legend) for visualization/export.

**Error responses:** 401, 404.

---

### 2.7. Audit log

| HTTP | Path                   | Description |
|------|------------------------|-------------|
| GET  | /api/audit-log         | List audit entries (paginated, filterable). |
| GET  | /api/iterations/{id}/audit-log | List audit entries for one iteration. |

**GET /api/audit-log**

**Query parameters:**

| Parameter    | Type   | Default     | Description |
|--------------|--------|-------------|-------------|
| page         | int    | 1           | Page number. |
| page_size    | int    | 50          | Max 100. |
| iteration_id | int    | —           | Filter by iteration. |
| user_id      | int    | —           | Filter by user. |
| event_type   | string | —           | Filter: `iteration_created`, `iteration_accepted`, `iteration_rejected`, `plan_generated`, `fallback_used`. |
| from         | string | —           | ISO 8601 date/time (inclusive). |
| to           | string | —           | ISO 8601 date/time (inclusive). |
| sort         | string | created_at  | Sort field. |
| order        | string | desc        | `asc`, `desc`. |

**Response (200):**

```json
{
  "items": [
    {
      "id": 1,
      "iteration_id": 1,
      "event_type": "plan_generated",
      "payload": {},
      "user_id": 1,
      "created_at": "2026-01-30T12:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "page_size": 50
}
```

**Error responses:** 401.

---

**GET /api/iterations/{id}/audit-log**

Same query params except `iteration_id` is fixed by path. Response shape same as above. **Errors:** 401, 404 if iteration not found or not owned.

---

## 3. Authentication and authorization

- **Mechanism:** Session-based (secure, httpOnly cookie) or token-based (Bearer in `Authorization` header). Tech-stack: “Sesje: secure, httpOnly cookies lub tokeny; ochrona przed CSRF.”
- **Login:** `POST /api/auth/login` with `login` and `password`. Verify against `users` (password via hash comparison, e.g. bcrypt/passlib). On success: create session or issue JWT/session token; return user id and login. Default MVP credentials: login **user**, password **123** (must be changed before production).
- **Protected routes:** All routes under `/api` except `/api/auth/login` require a valid session or Bearer token. If missing or invalid: **401 Unauthorized**. The `/health` endpoint is public.
- **Authorization (MVP):** Filter by ownership: images and iterations are scoped to `created_by` (current user). Only list/read/update/delete resources owned by the current user. Admin role can be added later (e.g. read-all).
- **CSRF:** If using cookie-based sessions, use CSRF token for state-changing requests (POST, PATCH, DELETE) from browser clients.

---

## 4. Validation and business logic

### 4.1. Per-resource validation (aligned with DB schema)

- **Auth (users):** `login` non-empty, unique; password hashed before store (no plain text).
- **Images:** `storage_path` and `width_mm` required; `width_mm` > 0; `created_by` set from current user.
- **Masks:** `image_id` required; `vertices` required, JSON array of `{x, y}` with at least 3 points; `mask_label` optional. **Business rule:** reject create/update if computed area < 3% of aperture (PRD §3.2, US-005).
- **Plan iterations:** `status` in `draft`, `accepted`, `rejected`; `target_coverage_pct` in 3–20 when provided; `params_snapshot` JSON; `plan_valid` 0/1 set by backend after generation.
- **Spots:** Not created/updated by API directly; created by POST iteration. When returning: `sequence_index`, `x_mm`, `y_mm`, `theta_deg`, `t_mm` required; `mask_id`, `component_id` optional.
- **Audit log:** `event_type` enum: `iteration_created`, `iteration_accepted`, `iteration_rejected`, `plan_generated`, `fallback_used`; `payload` JSON optional.

### 4.2. Business logic in API

1. **Mask area < 3% aperture:** On POST/PATCH mask, compute area (e.g. in mm² using image scale); if &lt; 3% of aperture area (π·(12.5)² mm² for 25 mm diameter), return **400** and do not persist (PRD §3.2, US-005).
2. **Plan generation (POST iteration):** Load image and its masks (only masks ≥ 3% aperture); run grid and sequence algorithm (deterministic); compute metrics (achieved coverage, spots outside mask, overlap); set `plan_valid` to 1 only if ≥95% points inside mask and 0 overlap (PRD §3.6, §6). If fallback used (e.g. global reference outside mask), write `fallback_used` to audit_log. Store spots with `sequence_index`; optionally enforce UNIQUE(iteration_id, sequence_index) in DB.
3. **Accept iteration:** Only if `plan_valid === 1` and `is_demo === 0`. Set `status = accepted`, `accepted_at`, `accepted_by`; write `iteration_accepted` to audit_log (PRD §3.8, US-010). Demo iterations cannot be accepted (PRD §3.10, US-013).
4. **Reject iteration:** Allow setting `status = rejected`; optionally log `iteration_rejected`.
5. **Versioning:** When creating a new iteration for an image, set `parent_id` to the latest iteration for that image (if any).
6. **Export:** JSON export includes metadata, masks, points, metrics, and validation info per PRD §9.3. Image export (PNG/JPG) renders overlay (and optionally diameter lines) server-side or returns pre-rendered asset.
7. **Deletion:** Delete image cascades to masks, plan_iterations, spots (DB CASCADE). Delete iteration cascades to spots. Optionally allow DELETE iteration only when status is `draft`.

### 4.3. Pagination and filtering

- List endpoints (`GET /api/images`, `GET /api/images/{id}/iterations`, `GET /api/audit-log`) support `page`, `page_size` (cap e.g. 100), and sort/order. Iterations and audit-log support status/event_type and date range filters to keep responses small and queryable.

### 4.4. Assumptions

- **Spot diameter and angle step** are fixed (e.g. 300 µm, 5°) in MVP or read from app config; not required in request body. They are stored in `params_snapshot` for audit.
- **Vertices** are in mm (after scale) in API contract; if frontend sends pixels, conversion is documented and consistent.
- **Export** image (PNG/JPG) may be implemented by backend rendering or by frontend sending canvas data; the plan assumes backend can return a raster export for simplicity and consistency.
- **Rate limiting** is not specified in PRD/tech-stack; can be added later (e.g. per-user or per-IP) for production.
