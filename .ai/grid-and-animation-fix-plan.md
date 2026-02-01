# Plan: Align Grid and Animation with Reference (working_lesion_spot_planner)

This document describes how to change the grid planner and animation so that results are **comparable** to the reference implementation in `.ai/working_lesion_spot_planner.txt` (and the condensed algorithm in `.ai/succesful point and animation algorythm.md.txt`).

---

## 1. Reference behavior (summary)

### 1.1 Coordinate convention (critical)

From the reference file:

- **mm space**: origin at **image center**, **+x right**, **+y up**.
- **Pixel space**: origin top-left, +x right, +y down (standard image).
- **Mapping**:
  - `x_px = cx + x_mm * px_per_mm`
  - `y_px = cy - y_mm * px_per_mm`
  - So: `x_mm = (x_px - cx) / px_per_mm`, `y_mm = (cy - y_px) / px_per_mm`

So in mm, the image center is (0, 0) and increasing y in pixels (down) corresponds to decreasing y in mm (up).

### 1.2 Scaling

- **px_per_mm**: from the **union bbox of all masks** and a fixed lesion width, e.g.  
  `px_per_mm = (bbox_right - bbox_left + 1) / LESION_UNION_WIDTH_MM` (e.g. 20 mm).
- In our app we use **image width_mm** (user-provided) and full image size; we can keep that but must use **center-based mm** consistently.

### 1.3 Angles and sweep lines

- **Angle range**: **0° to 180°** only (half circle), step `DTHETA_DEG` (e.g. 5°).
- **Line equation**: `x = t * cos(θ)`, `y = t * sin(θ)` with **+y up** in mm (so `angle_rad = +radians(theta_deg)` → clockwise in the plotted frame).
- **Candidate t**: `t ∈ [-R_mm, R_mm]` with step `CANDIDATE_STEP_MM`; on **odd lines** (k % 2 == 1) the t sequence is **reversed** (`ts = ts[::-1]`).

### 1.4 Spot selection and ordering

- **Selection**: along each line, walk candidates; skip if too close to `last_t` on same line, or to any point in `avoid_xy` / already selected; then **tune_min_dist** (binary search on min_dist) to hit target count.
- **Motion order**: sort by `(theta_k, t_sort)` where:
  - `theta_k` = index of angle in sorted unique angles (0°, 5°, …, 175°),
  - `t_sort = t_mm` for even `theta_k`, `t_sort = -t_mm` for odd `theta_k` (alternating sweep direction per line).

So the execution order is: line 0° (e.g. left-to-right in t), then 5° (right-to-left), then 10° (left-to-right), etc.

### 1.5 Animation (reference)

- **Events**: for each spot index i:  
  `("emit", th, t, i)`; then if i < last:  
  if same angle as next → `("move", th, t0, t1)` else `("rotate", t, th0, th1)`.
- **Timeline**: from events build arrays `head`, `fired`, `axis`, `flash`:
  - **emit**: 4 frames at same (head, axis), last 2 with `flash=True`.
  - **move**: interpolate head along line from (t0, th) to (t1, th), same axis.
  - **rotate**: interpolate head at fixed t from angle th0 to th1 (axis rotates).
- **Head position**: `xy_from_t_theta(t, th) = (t*cos(a), t*sin(a))` with `a = axis_angle_plot(th)` (radians).
- **Sampling**: fixed number of frames (e.g. 5 s at 12 fps → 60 frames); frame index maps to timeline index via `linspace(0, len(head)-1, frames)`.

So the animation shows: head moving along diameters, rotating between diameters, flashing at each emission, and cumulative “fired” spots.

---

## 2. Current implementation vs reference

| Aspect | Reference | Current (LaserXe) | Action |
|--------|-----------|-------------------|--------|
| **Origin** | Image center (0,0) in mm | Top-left; centroid or (width_mm/2, width_mm/2) in a mixed space | Use center-based mm in planner and API contract |
| **Y axis in mm** | +y up | +y down (vertices stored as top-left mm) | Convert at boundaries: store/use center mm +y up in backend; convert to/from frontend top-left for display |
| **Angle range** | 0°–180° only | 0°, 355°, 350°, … (full 360°) | Switch to 0°–180°, step 5° |
| **Line ordering** | Alternating t per line (odd lines reversed t) | Alternating angle index + t descending | Align: use 0–180° and same (theta_k, t_sort) with t_sort = ± t_mm |
| **Candidate generation** | build_candidate_lines with inside_fn(mask), R_mm, dtheta, step; odd k → ts reversed | Polygon clip + uniform t spacing | Keep polygon clip but use 0–180° and alternating t direction per angle index |
| **Spot count tuning** | tune_min_dist(lines, target_n, avoid_xy, spot_d_mm) | _binary_search_spacing for spacing_mm | Keep binary search; ensure “avoid” set includes already selected spots across masks |
| **Animation** | Event-based (emit / move / rotate), interpolated head, axis line, flash at emit | Step through spots one-by-one, no interpolation, no axis line | Add event-based timeline, interpolated head, axis line, flash |

---

## 3. Implementation plan

### Phase A: Coordinate system (backend + API contract) ✅ DONE

**Goal**: Planner and spots use **center-based mm**, **+y up**, so that (x_mm, y_mm) match the reference convention.

1. **Define conversion in one place (backend)**  
   - Image: `width_mm`, pixel size `(W, H)`.  
   - `px_per_mm = W / width_mm` (or use union bbox later if we add it).  
   - Center in pixel: `(cx, cy) = (W/2, H/2)`.  
   - Top-left mm → center mm:  
     - `x_center = x_tl - width_mm/2`  
     - `y_center = -(y_tl - height_mm/2) = height_mm/2 - y_tl`  
     where `height_mm = width_mm * H / W`.  
   - Center mm → top-left mm:  
     - `x_tl = x_center + width_mm/2`  
     - `y_tl = height_mm/2 - y_center`

2. **Where to convert**  
   - **Option A (recommended)**: Store mask vertices in DB as **center mm** (+y up). Frontend sends center mm when creating/updating masks; frontend converts between pixel and center mm using image dimensions and width_mm.  
   - **Option B**: Keep storing **top-left mm** in DB; in iterations API when calling `generate_plan`, convert mask vertices from top-left mm to center mm; after plan, convert spots from center mm to top-left mm before storing. So DB and frontend stay in top-left mm; only the planner sees center mm.

   Recommendation: **Option B** for minimal frontend/DB change. Add `image_height_mm` (or derive as `width_mm * H / W`) where needed.

3. **Iterations API**  
   - When loading masks for plan: get image `(W, H)`, `width_mm`; compute `height_mm = width_mm * H / W`; convert each mask’s vertices from top-left mm to center mm; pass center-mm polygons to `generate_plan`.  
   - After `generate_plan`: convert each spot `(x_mm, y_mm)` from center mm to top-left mm before inserting into `spots` table, so existing frontend and exports stay in top-left mm.  
   - Alternatively, if we later move to Option A, we would store spots in center mm and convert only in the frontend for display.

4. **Planner (`plan_grid.py`)**  
   - Work only in **center mm**, +y up.  
   - Center: keep centroid of (converted) mask vertices, or fallback `(0, 0)` (image center in mm).  
   - All line/point math as in reference: `x = t*cos(θ)`, `y = t*sin(θ)` with θ in 0–180°.

### Phase B: Grid algorithm (plan_grid.py) ✅ DONE

**Goal**: Same angle set, same per-line t ordering, and same motion order as reference.

1. **Angles**  
   - Replace `_angles_alternating(step_deg)` (0°, 355°, …) with **0° to 180°** only:  
     `thetas = [0, step, 2*step, …, 180]` (e.g. 0, 5, 10, …, 175 or 180).  
   - Use these for both candidate generation and emission order.

2. **Alternating t per line**  
   - When generating candidates along each angle, mirror the reference: for angle index `k` (0, 1, 2, …), if `k % 2 == 1`, traverse t from high to low (reversed).  
   - In `_place_points_on_segment` / line clipping: either (a) generate t values and reverse the list for odd k, or (b) when building emission order, use `t_sort = -t_mm` for odd theta_k so the logical order matches.

3. **Emission order**  
   - Sort spots by `(theta_k, t_sort)` where:  
     - `theta_k` = index of `theta_deg` in sorted unique angles (0°, 5°, …, 175°).  
     - `t_sort = t_mm` for even `theta_k`, `t_sort = -t_mm` for odd `theta_k`.  
   - This yields the same “sweep left–right, then right–left on next line” behavior as the reference.

4. **Avoid set**  
   - When planning multiple masks/components, the reference passes `avoid_xy` so new spots do not overlap previously selected ones. Our `_filter_overlaps_in_emission_order` already enforces min_dist in emission order; ensure we do not add spots that are too close to spots from other masks (e.g. by building a global “avoid” set when merging spots from multiple masks and running selection/tuning in the same order as the reference).

5. **Binary search**  
   - Keep binary search on spacing (or min_dist) to hit target count; align with reference’s `tune_min_dist` behavior (same line ordering and avoid set).

### Phase C: Animation (frontend + optional backend) ✅ DONE

**Goal**: Head moves along lines and rotates between lines; axis line visible; flash at emission; cumulative fired spots; fixed duration (e.g. 5 s).

1. **Event list from spots**  
   - Given ordered spots `[(theta_deg, t_mm, x_mm, y_mm), …]`, build events:  
     - For each index i: `("emit", theta_i, t_i, i)`.  
     - If i < n-1: if `theta_{i+1} == theta_i` → `("move", theta_i, t_i, t_{i+1})`, else `("rotate", t_i, theta_i, theta_{i+1})`.  
   - This can be done in the frontend from the spots list, or in the backend (e.g. iteration export) as a small “animation timeline” structure.

2. **Timeline (head, fired, axis, flash)**  
   - **Emit**: append 4 frames: head at `(t*cos(a), t*sin(a))`, axis = a, same fired set; flash true on last 2 frames.  
   - **Move**: interpolate head along line: `u in [0,1]` → `t = (1-u)*t0 + u*t1`, same theta; append several frames (e.g. 3–4).  
   - **Rotate**: interpolate angle: `th = (1-u)*th0 + u*th1`, same t; append ~5–6 frames.  
   - Use **center mm** for head position so that when we draw in pixel we use:  
     `x_px = cx + x_mm * scale`, `y_px = cy - y_mm * scale` (with scale = px_per_mm or imageSize.w / width_mm and origin at image center in px).

3. **Display (AnimationTab)**  
   - **Coordinate conversion**: If spots and mask vertices are still stored/returned in **top-left mm** (Option B), keep drawing spots as today: `cx = spot.x_mm * scale`, `cy = spot.y_mm * scale` (with origin top-left in SVG). If we switch to center mm in API, then use:  
     `x_px = centerPx.x + spot.x_mm * scale`, `y_px = centerPx.y - spot.y_mm * scale`.  
   - **Animation mode**:  
     - Build event list from current spots (same order as backend).  
     - Build timeline (head positions in same coordinate system as display).  
     - Fixed duration (e.g. 5 s) and frame count (e.g. 60); map frame index to timeline index via `linspace`.  
   - **Draw per frame**:  
     - Fired spots: show all spots with index in `fired[i]`.  
     - Head: one circle at `head[i]`.  
     - Axis: line from center through head along current angle.  
     - Flash: briefly highlight at emit (e.g. larger/brighter circle for 1–2 frames).

4. **Diameter lines**  
   - Already drawn at 0°, 5°, …, 175°. Ensure they use the same convention (center, +y up in mm → pixel: `x_px = cx + x_mm*scale`, `y_px = cy - y_mm*scale`). If we stay in top-left mm for display, diameter lines should still go through `centerPx` and use `±radiusPx` along cos/sin; that’s already consistent with “center” in pixel space.

### Phase D: Tests and validation ✅ DONE

1. **Unit tests (plan_grid)**  
   - `test_angle_set_0_to_175`: unique angles in output are subset of 0°, 5°, …, 175°.  
   - `test_alternating_t_per_line`: within each angle line, even theta_k → t ascending, odd → t descending.  
   - `test_spot_geometry_center_mm`: spots satisfy x = t*cos(θ), y = t*sin(θ) and |t| ≤ R.  
   - `test_plan_deterministic`: same inputs → same spot count and first/last (theta, t).

2. **Unit tests (coordinates)**  
   - `test_coordinates.py`: image center top_left ↔ center (0,0); roundtrip point and vertices; +y up in center.

3. **Regression**  
   - No reference CSV in repo; determinism test covers same-input consistency.

4. **Animation (manual)**  
   - See “Manual animation check” below: head along diameters, axis line, flash, 5 s.

---

## 4. File-level checklist

| File / layer | Changes |
|--------------|--------|
| `backend/app/services/plan_grid.py` | Angles 0–180°; alternating t per line; emission order (theta_k, t_sort); work in center mm +y up; accept center-mm vertices. |
| `backend/app/api/iterations.py` | If Option B: load masks, get image W/H and width_mm; convert vertices top-left mm → center mm before plan; convert spots center mm → top-left mm before DB insert. |
| `backend/app/api/iteration_by_id.py` | If chart/export use center mm, convert for response; or keep top-left and ensure chart uses same convention as frontend. |
| `src/components/images/AnimationTab.tsx` | Build event list from spots; build timeline (head, fired, axis, flash); fixed-duration playback; draw axis line; flash at emit; optional: convert spot coords if API moves to center mm. |
| `src/components/images/CanvasWorkspace.tsx` | No change if Option B. If Option A: convert between pixel and center mm when saving/loading vertices. |
| Types / API contract | Document in `types.ts` or API spec whether spot/mask coordinates are “top-left mm” or “center mm +y up” so frontend and backend stay aligned. |

---

## 5. Order of implementation

1. **Phase A (coordinates)**  
   - Implement conversion helpers (top-left mm ↔ center mm) in backend.  
   - In iterations API: convert masks to center mm before plan; convert spots to top-left mm after plan (Option B).  
   - Planner: document that vertices and spots are in center mm +y up; no DB schema change.

2. **Phase B (grid)**  
   - Change angles to 0–180°.  
   - Add alternating t order per line and emission sort by (theta_k, t_sort).  
   - Run tests; compare one run to reference CSV if available.

3. **Phase C (animation)**  
   - Add event construction and timeline in AnimationTab (or small helper).  
   - Draw axis and flash; use fixed 5 s duration and frame sampling.  
   - Verify head path matches “move along line, then rotate” and matches reference GIF behavior.

4. **Phase D**  
   - Add/update unit tests; optional regression test with reference data.

---

## 6. Manual animation check

After Phase C, verify in the browser:

1. Open an image with masks and generate a plan (iteracja).
2. Go to the **Animacja** tab, select the iteration, click **Odtwórz**.
3. **Head**: red circle moves along diameter lines, then rotates to the next line (no jump).
4. **Axis line**: optional “Oś głowicy (linia)” shows the current diameter; it rotates when moving to the next angle.
5. **Fired spots**: cumulative; already-emitted spots stay visible.
6. **Flash**: at each new emission, a brief bright circle at the head (last 2 frames of each emit).
7. **Duration**: animation runs ~5 s (60 frames at 12 fps) then stops.
8. **Reset**: click Reset to return to frame 0.

---

## 7. Summary

- **Reference** uses: center-based mm, +y up; angles 0–180°; alternating t per line; motion order (theta_k, t_sort); event-based animation (emit / move / rotate) with interpolated head and flash.
- **Fixes**: (1) Use center mm +y up inside the planner and at API boundary (Option B: convert to/from top-left mm for DB and current frontend). (2) Restrict angles to 0–180° and use the same alternating t and (theta_k, t_sort) order. (3) Implement event-based animation with head interpolation, axis line, and flash so results are comparable to the reference file and GIF.
