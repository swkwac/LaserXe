# Plan: Simple vs Advanced Grid Algorithm

## Goal

Offer two point-generation modes on the grid generation page:

1. **Simple** – XY grid, same spot diameter (300 µm), points spaced **800 µm** apart on a regular XY grid. Predictable and easy to reason about.
2. **Advanced** – Current algorithm (diameters every 5°, binary search for spacing, mask-aware coverage). Label in UI as **beta, under development**.

The user chooses the mode before clicking "Generuj plan".

---

## 1. Backend: Plan service (`plan_grid.py`)

### 1.1 Keep current logic as "advanced"

- Rename or keep `generate_plan()` as the **advanced** path (no functional change).
- It stays the single entry point that dispatches by mode, or we add a thin wrapper (see below).

### 1.2 Add simple grid generator

- New function: `generate_plan_simple(...)` that:
  - **Inputs:** `masks: list[MaskPolygon]`, `image_width_mm: float`, `grid_spacing_mm: float = 0.8`.
  - **Center:** Same convention as advanced: centroid of all mask vertices (in center-mm); fallback `(0, 0)` if no vertices or if centroid is far outside aperture.
  - **Aperture:** Same 25 mm diameter circle (radius 12.5 mm) in center-mm space.
  - **Grid:** In center-mm coordinates, generate points at:
    - `x = cx + i * grid_spacing_mm`, `y = cy + j * grid_spacing_mm` for integers `i, j` such that the point lies **inside** the circle `(x - cx)² + (y - cy)² ≤ 12.5²`.
  - **Mask filter (recommended):** Include only points that lie inside **at least one** mask polygon (using existing `_point_in_polygon`). This keeps treatment limited to drawn masks. If there are no masks, you can either return no spots or include all points inside the aperture; the plan should specify "only inside masks" for consistency with advanced.
  - **Spot size:** Same 300 µm diameter conceptually (no change to `SpotRecord`; `theta_deg` and `t_mm` can be derived from `(x, y)` for DB/export consistency: e.g. `theta_deg = atan2(y-cy, x-cx)` in degrees, `t_mm = distance from center`).
  - **Emission order:** Deterministic, e.g. sort by `(row index, col index)` or by `(y, x)` so that animation/export order is stable (e.g. row-by-row).
  - **Return:** Same `PlanResult` (list of `SpotRecord`, achieved_coverage_pct, spots_count, spots_outside_mask_count, overlap_count, plan_valid, fallback_used). For simple mode, overlap_count should be 0 (grid guarantees spacing), spots_outside_mask_count 0 if we filter by masks.

- **Constants:** Use `SPOT_DIAMETER_MM` (0.3) and aperture 12.5 mm from existing code; add `SIMPLE_GRID_SPACING_MM = 0.8` (800 µm).

### 1.3 Single entry point

- Add a parameter to the **create-iteration** flow, not necessarily to `generate_plan` itself. Two options:
  - **Option A:** New top-level function `generate_plan_by_mode(masks, target_coverage_pct, coverage_per_mask, image_width_mm, algorithm_mode: "simple" | "advanced")` that calls `generate_plan_simple(...)` when `algorithm_mode == "simple"` and `generate_plan(...)` when `"advanced"`. Iterations API calls `generate_plan_by_mode(...)`.
  - **Option B:** Iterations API checks `algorithm_mode` and calls either `generate_plan_simple(...)` or `generate_plan(...)` directly. No new function in `plan_grid.py`.

Recommendation: **Option A** keeps API logic in one place and leaves `plan_grid.py` as the only module that knows about both algorithms.

- For **simple** mode, `target_coverage_pct` and `coverage_per_mask` can be ignored (grid spacing is fixed 0.8 mm); they can still be stored in `params_snapshot` for consistency.

---

## 2. Backend: API and schemas

### 2.1 Iteration create payload

- **Schema** (`backend/app/schemas/iterations.py`):
  - Add to `IterationCreateSchema`: `algorithm_mode: Literal["simple", "advanced"] = "simple"`. Preferred default is **simple** so new users get the predictable XY grid.

- **Params snapshot** (already JSON in DB):
  - When creating an iteration, set `params_snapshot` to include e.g. `algorithm_mode`, and for simple mode `grid_spacing_mm: 0.8`. No DB migration needed.

### 2.2 Iterations API (`backend/app/api/iterations.py`)

- In `create_iteration`:
  - Read `payload.algorithm_mode`.
  - Build `params_snapshot` with `algorithm_mode` and optionally `grid_spacing_mm` for simple.
  - Call `generate_plan_by_mode(masks_center, payload.target_coverage_pct, coverage_per_mask, width_mm, payload.algorithm_mode)` (or the two branches with `generate_plan` / `generate_plan_simple`).
  - Rest of the flow unchanged: convert spots from center-mm to top-left mm, insert iteration and spots, audit log.

---

## 3. Frontend: Grid generation page

### 3.1 Types (`src/types.ts`)

- Extend `IterationCreateCommand` with:
  - `algorithm_mode?: "simple" | "advanced";`
- Default in the form: `"simple"` (preferred default).

### 3.2 Plan params form (`PlanParamsForm.tsx`)

- Add an **algorithm mode** selector:
  - **Simple** – e.g. "Siatka XY, odstęp 800 µm" (or "Prosty algorytm: siatka XY 800 µm").
  - **Advanced** – e.g. "Zaawansowany (beta, w trakcie rozwoju)".
- Control can be two radio buttons or a select. Pass `algorithm_mode` in `value` / `onChange` so parent state stays in sync.

### 3.3 Plan tab (`PlanTab.tsx`)

- Include `algorithm_mode` in `params` state and in the POST body when calling `POST /api/images/:id/iterations`:
  - `body: JSON.stringify({ target_coverage_pct, coverage_per_mask, is_demo, algorithm_mode: params.algorithm_mode ?? "simple" })`. Default is **simple**.

### 3.4 UI copy (final, implemented in PlanParamsForm)

- **Algorytm** (fieldset label): "Algorytm"
- **Simple:** "Prosty – siatka XY 800 µm" — hint: "Punkty w jednakowych odstępach 800 µm, tylko wewnątrz masek."
- **Advanced:** "Zaawansowany (beta)" — hint: "Algorytm w trakcie rozwoju; pokrycie docelowe i średnice co 5°."
- **Docelowe pokrycie:** hint: "Zakres: 3–20 % (dotyczy algorytmu zaawansowanego)"

---

## 4. Database and migrations

- **No new migration** required. `params_snapshot` is already a JSON text column; adding `algorithm_mode` and `grid_spacing_mm` is a payload change only.
- Optional later: add a column `algorithm_mode text` to `plan_iterations` for filtering/analytics; not necessary for this plan.

---

## 5. Tests

- **`backend/tests/test_plan_grid.py`**:
  - Add tests for `generate_plan_simple` (or `generate_plan_by_mode(..., "simple")`):
    - One mask: rectangle or circle; expect grid points inside mask only, spacing ~0.8 mm, no overlaps.
    - No masks / empty list: define expected behaviour (e.g. no spots or full aperture grid) and test it.
    - Check that returned spots have `theta_deg` and `t_mm` set (e.g. derived from position) so export and preview still work.
  - Keep existing tests for the advanced path (unchanged behaviour when `algorithm_mode="advanced"` or when calling `generate_plan` directly).

---

## 6. Order of implementation

1. **Backend – simple algorithm:** Implement `generate_plan_simple` in `plan_grid.py` (and optionally `generate_plan_by_mode`).
2. **Backend – API:** Add `algorithm_mode` to `IterationCreateSchema`, extend `create_iteration` and `params_snapshot`.
3. **Frontend – types and form:** Add `algorithm_mode` to `IterationCreateCommand` and to `PlanParamsForm` (selector + labels).
4. **Frontend – PlanTab:** Send `algorithm_mode` in POST and default `params.algorithm_mode` (e.g. to `"simple"`).
5. **Tests:** Add tests for simple mode; run existing tests to ensure advanced path is unchanged.
6. **Docs/copy:** Finalise Polish labels and hints for Simple vs Advanced (beta).

---

## 7. Summary

| Area        | Change |
|------------|--------|
| **plan_grid.py** | Add `generate_plan_simple()`; add `generate_plan_by_mode(..., algorithm_mode)` that calls simple or existing `generate_plan()`. |
| **iterations schema** | `IterationCreateSchema.algorithm_mode: "simple" \| "advanced"` with default. |
| **iterations API** | Use `algorithm_mode` in create, pass to planner, put in `params_snapshot`. |
| **types.ts** | `IterationCreateCommand.algorithm_mode?: "simple" \| "advanced"`. |
| **PlanParamsForm** | Algorithm selector: Simple (800 µm XY) vs Advanced (beta). |
| **PlanTab** | Include `algorithm_mode` in params and in POST body. |
| **DB** | No migration; `params_snapshot` JSON only. |
| **Tests** | New tests for simple grid; regression for advanced. |

This gives users a clear choice: a simple, predictable 800 µm XY grid vs the current advanced (beta) algorithm, with minimal schema change and no DB migration.

---

## 8. Implementation status

Steps 1–6 are implemented: backend simple + by_mode, API + schema, frontend types + PlanParamsForm + PlanTab, tests, UI copy documented above.

---

## 9. Next 3 steps (follow-up) — DONE

1. **Manual / E2E check:** Implemented: `.ai/grid-algorithm-manual-test-checklist.md` with steps for Plan tab, Simple/Advanced generation, and History column. Full browser E2E (Playwright) left as optional.
2. **Iteration list / detail:** Implemented: History tab table has column **Algorytm** showing "Prosty" / "Zaawansowany (beta)" from `params_snapshot.algorithm_mode`; `IterationParamsSnapshotDto` and types extended.
3. **Optional DB column:** Implemented: migration `20250201120000_add_plan_iterations_algorithm_mode.sql` adds `algorithm_mode text` to `plan_iterations`, backfills from `json_extract(params_snapshot, '$.algorithm_mode')`; `create_iteration` INSERT sets `algorithm_mode`; params_snapshot still stored for compatibility.

---

## 10. Next 3 steps (follow-up after §9) — DONE

1. **Browser E2E (Playwright):** Implemented: `@playwright/test` added, `playwright.config.ts` (baseURL :4321), `e2e/grid-algorithm.spec.ts` — login (user/123), go to /images, open first image’s Plan tab, assert "Prosty – siatka XY 800 µm", "Zaawansowany (beta)", "Generuj plan" visible. Run: `npm run e2e` (requires backend :8000 and `npm run dev` :4321).
2. **Export metadata:** Implemented: `iteration_by_id.get_iteration_export` JSON response now includes top-level `metadata.algorithm_mode` and `metadata.grid_spacing_mm` (from params_snapshot) for reproducibility.
3. **Filter by algorithm:** Implemented: `GET /api/images/{image_id}/iterations?algorithm_mode=simple|advanced`; History tab has dropdown "Algorytm: Wszystkie / Prosty / Zaawansowany (beta)"; `IterationListQueryCommand.algorithm_mode` added.

---

## 11. Next 3 steps (follow-up after §10) — DONE

1. **E2E: full generate flow:** Implemented: `e2e/grid-algorithm.spec.ts` — test "select Prosty, click Generuj plan, then see metrics (iteration created)": login, open first image, Plan tab, check Prosty radio, click Generuj plan, wait for button "Generuj plan" again (20s), assert "Liczba punktów" visible.
2. **CSV spots export metadata:** Implemented: `iteration_by_id.get_iteration_spots` when `format=csv` now prepends comment lines `# algorithm_mode=simple` and `# grid_spacing_mm=0.8` (when present in params_snapshot) so CSV is self-describing.
3. **PlanTab: show algorithm for selected iteration:** Implemented: metrics section (Metryki ostatnia iteracja) now has first row "Algorytm" with value "Prosty" / "Zaawansowany (beta)" / "—" from `params_snapshot.algorithm_mode`.

---

## 12. Next 3 steps (follow-up after §11) — DONE

1. **E2E: Advanced mode generate:** Implemented: `e2e/grid-algorithm.spec.ts` — test "select Zaawansowany (beta), click Generuj plan, then see metrics (iteration created)" mirrors the Prosty test; both modes covered by E2E.
2. **Document CSV comment lines:** Implemented: README section "Export formats (LaserXe)" describes spots CSV comment lines `# algorithm_mode=...` and `# grid_spacing_mm=...` and that parsers should skip lines starting with `#`; E2E section added.
3. **Optional: configurable simple grid spacing:** Implemented: `IterationCreateSchema.grid_spacing_mm` (optional, 0.3–2.0 mm); `generate_plan_by_mode(..., grid_spacing_mm)`; PlanParamsForm shows "Odstęp siatki (mm)" (0.3–2 mm, default 0.8) when Prosty selected; PlanTab sends `grid_spacing_mm` when simple; stored in params_snapshot.

---

## 13. Next 3 steps (follow-up after §12) — DONE

1. **Unit test for grid_spacing_mm:** Implemented: `test_simple_grid_spacing_mm_custom` in `test_plan_grid.py` — calls `generate_plan_simple(..., grid_spacing_mm=1.0)`, asserts spot count ≤ default 0.8 mm run and min distance between spots ≥ 1.0 mm (or overlapping).
2. **PlanTab: show grid_spacing_mm in metrics:** Implemented: when selected iteration used simple mode, metrics section shows row "Odstęp siatki" with value from `params_snapshot.grid_spacing_mm` (e.g. "0.8 mm") or "0.8 mm" when missing.
3. **Optional: remove Advanced beta label later:** Implemented: `PlanParamsForm` has constant `SHOW_ADVANCED_BETA_LABEL = true`; advanced option label is "Zaawansowany (beta)" when true else "Zaawansowany". Set to `false` when algorithm is stable to hide "(beta)".

---

## 14. Next 3 steps (follow-up after §13) — DONE

1. **Shared beta label constant:** Implemented: `src/lib/constants.ts` with `SHOW_ADVANCED_BETA_LABEL` and `getAdvancedAlgorithmLabel()`; PlanParamsForm, HistoryTab, and PlanTab import and use it so one flip hides "(beta)" everywhere.
2. **E2E: custom grid spacing:** Implemented: `e2e/grid-algorithm.spec.ts` — test "select Prosty, set Odstęp siatki to 1 mm, generate plan, then see Odstęp siatki 1 mm in metrics": fill "Odstęp siatki (mm)" with 1, Generuj plan, assert "Odstęp siatki" and "1 mm" visible.
3. **Docs: simple vs advanced summary:** Implemented: `.ai/instrukcja-uzytkowania.md` — "Algorytmy siatki" subsection in Krok 6 (Prosty: 800 µm, configurable 0.3–2 mm; Zaawansowany beta: coverage, 5°); parametry planu updated. README — "Grid algorithms (LaserXe)" section with short summary and pointer to instrukcja.

---

## 15. Next 3 steps (optional / when needed)

1. **Flip beta label:** When advanced algorithm is stable, set `SHOW_ADVANCED_BETA_LABEL = false` in `src/lib/constants.ts`; update E2E test that matches "Zaawansowany (beta)" to match "Zaawansowany" or use `getAdvancedAlgorithmLabel()` if test can read from app.
2. **Analytics or reporting:** If needed, filter or group iterations by `algorithm_mode` (DB column and API param already exist) for reports.
3. **No further steps required:** The simple vs advanced grid feature is complete. Optional future: more algorithm presets, or A/B comparison view.
