# Grid Generator – Implementation Plan

## Overview

A standalone grid generator for two handpiece apertures, accessible after login at `/grid-generator`. No image required. Generates emission points based on geometric parameters, with schematic visualization, animation, and CSV export.

---

## 1. Constants & Parameters

### Aperture 1 (Simple – 12×12 mm)
| Parameter | Value | Notes |
|-----------|-------|-------|
| Aperture size | 12 mm × 12 mm | Rectangle, origin at top-left corner |
| Grid type | Regular XY | Fills full rectangle |
| Axis distance | 0.5 – 3 mm | Spacing between parallel lines (user input) |

### Aperture 2 (Advanced – 25 mm diameter)
| Parameter | Value | Notes |
|-----------|-------|-------|
| Aperture size | 25 mm diameter | Circle, origin at center |
| Grid type | Diameter lines | Points on radial lines |
| Angle step | 3 – 20 ° | Integer only, degrees between rotational axes |

### Shared (User-selectable)
| Parameter | Options / Range |
|-----------|-----------------|
| Spot diameter | 300 µm or 150 µm |
| % fill (target coverage) | Same as current (e.g. 1–100%) |

---

## 2. Backend

### 2.1 New API Module

**File:** `backend/app/api/grid_generator.py`

**Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/grid-generator/generate` | Required | Generate grid, return spots |

**Request body (JSON):**
```json
{
  "aperture_type": "simple" | "advanced",
  "spot_diameter_um": 300 | 150,
  "target_coverage_pct": 10,
  "axis_distance_mm": 0.8,        // simple only, 0.5–3
  "angle_step_deg": 5             // advanced only, 3–20 integer
}
```

**Response:**
```json
{
  "spots": [
    {
      "sequence_index": 0,
      "x_mm": 0.4,
      "y_mm": 0.4,
      "theta_deg": 45.0,
      "t_mm": 0.566,
      "mask_id": null,
      "component_id": null
    }
  ],
  "spots_count": 144,
  "achieved_coverage_pct": 9.8,
  "params": {
    "aperture_type": "simple",
    "spot_diameter_um": 300,
    "target_coverage_pct": 10,
    "axis_distance_mm": 0.8,
    "angle_step_deg": null
  }
}
```

### 2.2 Grid Generation Logic

**File:** `backend/app/services/grid_generator.py`

**Simple (12×12 mm):**
- Origin: top-left corner (0, 0); X right, Y down (image convention for consistency with existing).
- Rectangle: 0 ≤ x ≤ 12, 0 ≤ y ≤ 12.
- Grid: points at (i × axis_distance, j × axis_distance) for i, j such that point is inside [0,12]×[0,12].
- Filter by % fill: compute total area of spots, compare to 12×12 = 144 mm²; if over target, reduce points (e.g. skip every Nth) or use spacing to hit target.
- Emission order: boustrophedon (snake) – row 0 left→right, row 1 right→left, etc.
- theta_deg, t_mm: derive from (x, y) relative to center (6, 6) for CSV compatibility.

**Advanced (25 mm diameter):**
- Origin: center (0, 0); radius R = 12.5 mm.
- Reuse existing `plan_grid.py` logic: diameter lines at 0°, angle_step°, 2×angle_step°, … up to 175°.
- Use candidate-based selection with target_coverage_pct.
- Spot diameter: 0.3 mm or 0.15 mm → min_dist_mm = diameter × 1.05.
- Emission order: same as current advanced (alternating t per line).

**Spot area:**
- 300 µm: area = π × (0.15)² mm²
- 150 µm: area = π × (0.075)² mm²

### 2.3 Validation

- `aperture_type`: enum "simple" | "advanced"
- `spot_diameter_um`: 300 or 150
- `target_coverage_pct`: 0.1 – 100
- `axis_distance_mm`: 0.5 – 3 (required if simple)
- `angle_step_deg`: 3 – 20 integer (required if advanced)

### 2.4 Router Registration

Add `grid_generator` router in `backend/app/main.py` with prefix `/api/grid-generator`.

---

## 3. Frontend

### 3.1 Routing & Auth

- **Page:** `src/pages/grid-generator.astro`
- **Route:** `/grid-generator`
- **Auth:** Same as `/images` – client-side; unauthenticated API calls redirect to `/login`.
- **Navigation:** Add link in `AppHeader` (e.g. "Generator siatki" next to "Obrazy" or in a nav menu).

### 3.2 Page Structure

```
/grid-generator
├── Parameters form (aperture type, spot diameter, % fill, axis distance / angle step)
├── "Generuj" button
├── Grid preview (schematic SVG/canvas)
├── Animation section
└── Export CSV button
```

### 3.3 Components

| Component | Responsibility |
|-----------|----------------|
| `GridGeneratorPage` (or split) | Page layout, state, API call |
| `GridGeneratorForm` | Form inputs with validation |
| `GridSchematicView` | SVG schematic of aperture + grid points |
| `GridAnimationView` | Animation overlay (reuse `AnimationOverlay` logic, no image) |

### 3.4 Schematic View (Scientific/Engineering Style)

**Simple (12×12):**
- SVG with axes: X (0–12 mm), Y (0–12 mm).
- Axis labels: "x (mm)", "y (mm)".
- Grid lines at axis_distance intervals.
- Points as circles at spot positions.
- Optional: minor ticks, legend.

**Advanced (25 mm):**
- SVG with axes: X (-12.5 to 12.5 mm), Y (-12.5 to 12.5 mm).
- Circle outline for 25 mm diameter.
- Diameter lines at angle_step.
- Points as circles.
- Axis labels: "x (mm)", "y (mm)".

### 3.5 Animation View

- Same emission sequence as grid.
- Schematic background (aperture outline, optional grid).
- Head position + fired spots (reuse `buildAnimationTimelineFromSpots`, `AnimationOverlay`-style rendering).
- Formatted similarly: axes, labels, mm scale.

### 3.6 Export CSV

- Same format as current: `sequence_index, theta_deg, t_mm, x_mm, y_mm, mask_id, component_id`.
- Add comment lines with params: `# aperture_type=simple`, `# spot_diameter_um=300`, etc.
- Client-side: generate CSV from spots array, trigger download.

---

## 4. Implementation Order

### Phase 1: Backend
1. Create `grid_generator.py` service (simple + advanced logic).
2. Create `grid_generator.py` API router.
3. Register router, add tests.

### Phase 2: Frontend – Core
4. Create `grid-generator.astro` page.
5. Add navigation link in header.
6. Create `GridGeneratorForm` + API integration.
7. Create `GridSchematicView` (SVG with axes, grid, points).

### Phase 3: Frontend – Animation & Export
8. Create `GridAnimationView` (reuse animation utils, schematic bg).
9. Implement CSV export (client-side from spots).

### Phase 4: Polish
10. Validation, error handling, loading states.
11. Responsive layout, accessibility.
12. E2E test (optional).

---

## 5. File Checklist

| Path | Action |
|------|--------|
| `backend/app/services/grid_generator.py` | Create |
| `backend/app/api/grid_generator.py` | Create |
| `backend/app/main.py` | Register router |
| `backend/tests/test_grid_generator.py` | Create |
| `src/pages/grid-generator.astro` | Create |
| `src/components/grid/GridGeneratorForm.tsx` | Create |
| `src/components/grid/GridSchematicView.tsx` | Create |
| `src/components/grid/GridAnimationView.tsx` | Create |
| `src/components/AppHeader.astro` | Add nav link |
| `src/lib/services/gridApi.ts` | Create (API client) |
| `src/types.ts` | Add GridGeneratorRequest, GridGeneratorResponse |

---

## 6. Coordinate Systems

**Simple (12×12):**
- Storage/API: top-left mm (0,0) at top-left, x right, y down.
- Schematic: same – x axis right, y axis down; origin bottom-left of SVG (or top-left with y flipped for math convention – confirm with user preference for "scientific" look; typically y-up for graphs).

**Clarification for schematic:** Engineering plots often use:
- X right, Y up (origin bottom-left) – like typical math graph.
- Or X right, Y down (origin top-left) – like image coordinates.

Recommendation: Use **X right, Y up** for schematic (scientific convention). Simple grid: map (x_tl, y_tl) → (x_tl, 12 - y_tl) for display so origin is bottom-left.

**Advanced (25 mm):**
- Center mm: origin at center, +y up (existing convention).
- Schematic: X right, Y up, origin center – standard polar/cartesian.

---

## 7. Open Points

- [ ] Confirm schematic Y-axis direction (up vs down) for "scientific" look.
- [ ] Nav placement: separate "Generator siatki" link or under a menu.
- [ ] Persist last-used params in localStorage (optional).
