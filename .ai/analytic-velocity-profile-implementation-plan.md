# Full Analytic v_emit → v_max → v_emit Profile – Implementation Plan

This document outlines a step-by-step plan to implement the full analytic motion profile for linear segments in fire-in-motion mode, including closed-form kinematics, triangle profile for short segments, and per-frame `v(t)` integration for the velocity graph.

---

## 1. Kinematic Background (Reference)

### 1.1 Classic 0 → v_max → 0 (current `computeLinearMoveTimeMs`)

- **Accel phase**: `s_accel = v_max² / (2a)`, `t_accel = v_max / a`
- **Total for triangle** (no constant phase): `d_max = 2 * s_accel = v_max² / a`
- **If d ≤ d_max**: triangle profile, `t = 2 * sqrt(d/a)`
- **If d > d_max**: trapezoid, `t = 2*t_accel + (d - d_max)/v_max`

### 1.2 New v_emit → v_max → v_emit (fire-in-motion)

- **Accel phase** (v_emit → v_max):  
  `s_accel = (v_max² - v_emit²) / (2a)`, `t_accel = (v_max - v_emit) / a`
- **Decel phase** (v_max → v_emit):  
  `s_decel = (v_max² - v_emit²) / (2a)`, `t_decel = (v_max - v_emit) / a`
- **Constant phase distance**:  
  `s_const = d - s_accel - s_decel`
- **Trapezoid** (s_const ≥ 0):  
  `t_const = s_const / v_max`, `t_total = t_accel + t_const + t_decel`
- **Triangle** (s_const < 0): never reach v_max; solve for v_peak:
  - `d = (v_peak² - v_emit²)/a` → `v_peak = sqrt(v_emit² + d*a)`
  - `t_accel = (v_peak - v_emit) / a`, `t_decel = (v_peak - v_emit) / a`
  - `t_total = 2 * (v_peak - v_emit) / a`

### 1.3 Analytic v(t) for a segment

For a segment starting at `t0` (ms), with phases:

| Phase      | Time range (local τ) | v(τ) |
|-----------|------------------------|------|
| Accel     | 0 ≤ τ < t_accel       | v_emit + a·τ |
| Constant  | t_accel ≤ τ < t_accel + t_const | v_max |
| Decel     | t_accel + t_const ≤ τ < t_total | v_max - a·(τ - t_accel - t_const) |

For triangle profile: no constant phase; `v_peak` replaces `v_max` in the formulas.

---

## 2. Implementation Steps

### Step 1: Add analytic profile types and helpers in `animationUtils.ts`

**Goal**: Introduce types and pure functions for the v_emit→v_max→v_emit profile.

**Tasks**:

1.1. Define `LinearMoveProfile` interface:

```ts
interface LinearMoveProfile {
  /** Profile type: trapezoid (reaches v_max) or triangle (short segment). */
  type: "trapezoid" | "triangle";
  /** Start velocity (mm/s). */
  vStart: number;
  /** End velocity (mm/s). */
  vEnd: number;
  /** Peak velocity (mm/s) – v_max for trapezoid, v_peak for triangle. */
  vPeak: number;
  /** Acceleration (mm/s²). */
  accel: number;
  /** Phase durations (s): [accel, constant, decel]. */
  tAccel: number;
  tConst: number;
  tDecel: number;
  /** Total duration (s). */
  tTotal: number;
  /** Total distance (mm). */
  distanceMm: number;
}
```

1.2. Add `computeLinearMoveProfile(distanceMm, vMax, accel, vEmit): LinearMoveProfile`:

- If `vEmit <= 0` or fire-in-motion disabled: delegate to classic 0→v_max→0 logic (or return a profile with vStart=vEnd=0).
- Compute `s_accel`, `s_decel`, `s_const` as above.
- If `s_const >= 0`: trapezoid; set `tAccel`, `tConst`, `tDecel`, `tTotal`, `vPeak = vMax`.
- If `s_const < 0`: triangle; compute `v_peak`, then `t_accel = t_decel = (v_peak - v_emit)/a`, `t_const = 0`.

1.3. Add `velocityAtTime(profile: LinearMoveProfile, tLocalSec: number): number`:

- Given local time `τ` (0 to `tTotal`), return `v(τ)` using the piecewise formulas above.
- Handle edge cases: `τ < 0` → `vStart`, `τ > tTotal` → `vEnd`.

1.4. Add unit tests for `computeLinearMoveProfile` and `velocityAtTime`:

- Trapezoid: long distance, verify phases and total time.
- Triangle: short distance, verify v_peak < v_max and correct total time.
- Boundary: distance exactly at transition trapezoid↔triangle.

---

### Step 2: Integrate analytic profile into time estimation

**Goal**: Use the new profile for accurate move time when fire-in-motion is enabled.

**Tasks**:

2.1. Update `computeLinearMoveTimeWithMinEmission`:

- Keep the “overlap” logic (distance covered during dwell at v_emit) to compute `d_remain`.
- Replace `computeLinearMoveTimeMs(remainingMm, vMax, accel)` with:
  - `profile = computeLinearMoveProfile(remainingMm, vMax, accel, vEmit)`
  - Return `profile.tTotal * 1000` (ms).

2.2. Ensure `estimateAdvancedTreatmentTimeBreakdown` still uses `computeLinearMoveTimeWithMinEmission` (no change needed if that function is updated).

2.3. Add/update unit tests to verify total treatment time matches the new profile (compare with hand-calculated values for a few cases).

---

### Step 3: Extend timeline with segment metadata for analytic v(t)

**Goal**: Allow the velocity graph to compute `v(t)` from the analytic profile instead of using a constant `v_mm_per_s` per frame.

**Tasks**:

3.1. Define `LinearMoveSegment` (or extend `TimelineFrame` metadata):

```ts
interface LinearMoveSegmentMeta {
  tStartMs: number;
  tEndMs: number;
  profile: LinearMoveProfile;
  /** For position interpolation: start (x,y) and end (x,y) in mm. */
  startMm: { x: number; y: number };
  endMm: { x: number; y: number };
}
```

3.2. Options for storing this:

- **Option A**: Add optional `segmentMeta?: LinearMoveSegmentMeta` to `TimelineFrame` for frames that are part of a linear move. Only the first frame of each move segment needs it (or we can store it on all frames in that segment for simplicity).
- **Option B**: Build a separate `LinearMoveSegments[]` array alongside the timeline, keyed by `[tStartMs, tEndMs]`. The velocity builder would iterate over this array when sampling.

**Recommendation**: Option B is cleaner—keep timeline as display/playback data, and maintain a parallel structure for “physics segments” used by the charts.

3.3. In `buildAnimationTimelineAdvanced`, when creating linear move frames:

- Compute `profile = computeLinearMoveProfile(remainingMm, vMax, accel, vEmit)` for that segment.
- Push `{ tStartMs, tEndMs, profile, startMm, endMm }` into a `linearMoveSegments` array.
- Return both `frames` and `linearMoveSegments` (or attach `linearMoveSegments` to a wrapper object).

3.4. Update the callers (`GridAnimationView`, `AnimationTab`) to pass `linearMoveSegments` (or equivalent) to `MotionCharts`.

---

### Step 4: Implement per-frame v(t) sampling in MotionCharts

**Goal**: Replace the current “use frame’s v_mm_per_s” logic with analytic `v(t)` when segment data is available.

**Tasks**:

4.1. Extend `MotionChartsProps`:

```ts
interface MotionChartsProps {
  timeline: TimelineFrame[];
  /** Optional: analytic segments for v(t) sampling. When present, velocity graph uses v(t) instead of frame v_mm_per_s. */
  linearMoveSegments?: LinearMoveSegmentMeta[];
  currentFrame: TimelineFrame | null;
  totalDurationMs: number;
  breakdown?: TreatmentTimeBreakdown;
}
```

4.2. Implement `velocityAtGlobalTime(tMs: number, segments: LinearMoveSegmentMeta[]): number`:

- Find the segment where `tStartMs <= tMs < tEndMs`.
- If found: `tLocalSec = (tMs - tStartMs) / 1000`, return `velocityAtTime(segment.profile, tLocalSec)`.
- If not found (dwell or rotate): return `v_emit` for dwell (from params) or `0` for rotate.
- Dwell: we need to know `v_emit`—either pass it via props or infer from the segment’s `profile.vStart`/`profile.vEnd` of adjacent segments. Simplest: pass `minEmissionSpeedMmPerS` in a small context or as part of `MotionChartsProps`.

4.3. Update `buildVelocitySeries`:

- If `linearMoveSegments` is provided and non-empty:
  - Sample at `dtSampleMs = 100` (0.1 s) as before.
  - For each sample time `t`, call `velocityAtGlobalTime(t, linearMoveSegments)` instead of using `prev.v_mm_per_s`.
  - For dwell/rotate phases, use the appropriate constant (v_emit or 0).
- Else: fall back to current behavior (use timeline frames’ `v_mm_per_s`).

4.4. Ensure phase detection for velocity: when `t` falls in a dwell, return `v_emit`; when in rotate, return `0`. This may require a “phase map” or iterating the timeline to determine phase at `t`. Alternatively, `linearMoveSegments` covers only moves; for dwell/rotate we can determine phase from the timeline (e.g. binary search by `t_ms` and check `phase`).

4.5. Add a helper `getPhaseAtTime(timeline, tMs): "dwell" | "move" | "rotate"` and `getVAtTime(timeline, segments, tMs, vEmit)` that combines segment lookup and phase logic.

---

### Step 5: Timeline frame v_mm_per_s from analytic v(t)

**Goal**: Optionally make each timeline frame’s `v_mm_per_s` reflect the analytic velocity at that frame’s time, for consistency (e.g. tooltips, debug display).

**Tasks**:

5.1. In `buildAnimationTimelineAdvanced`, for each linear move frame:

- `tLocalMs = tCumulativeMs + u * moveMs - tStartOfMove`
- `tLocalSec = tLocalMs / 1000`
- `speedMmPerS = velocityAtTime(profile, tLocalSec)`
- Assign `v_mm_per_s: speedMmPerS` instead of the constant clamped average.

5.2. This ensures that even without `linearMoveSegments` in MotionCharts, the timeline itself carries correct per-frame velocities. The chart can then either:
- Use `linearMoveSegments` for smooth 0.1 s sampling (recommended), or
- Use the updated timeline frames (will be stepwise between frame times).

Recommendation: do both—update timeline frames for consistency, and use `linearMoveSegments` in the chart for smooth curves.

---

### Step 6: Handle edge cases and fire-in-motion off

**Goal**: Ensure correct behavior when fire-in-motion is disabled or parameters are edge-case.

**Tasks**:

6.1. When `fireInMotionEnabled` is false or `minEmissionSpeedMmPerS <= 0`:

- Use classic 0→v_max→0 profile. Either:
  - Add `computeLinearMoveProfileClassic(d, vMax, accel)` returning a profile with `vStart=0`, `vEnd=0`, or
  - Reuse `computeLinearMoveProfile(d, vMax, accel, 0)` and ensure `vEmit=0` yields the classic profile.

6.2. When `v_emit >= v_max`:

- Entire move at v_emit (constant speed). Profile: `tAccel=0`, `tDecel=0`, `tConst = d/v_emit`.

6.3. Zero distance:

- Return zero-duration profile; `velocityAtTime` should handle `tTotal=0`.

6.4. Add unit tests for these edge cases.

---

### Step 7: Export and wire up

**Goal**: Ensure all new types and functions are exported and correctly wired.

**Tasks**:

7.1. Export from `animationUtils.ts`:

- `LinearMoveProfile`, `LinearMoveSegmentMeta` (if used)
- `computeLinearMoveProfile`, `velocityAtTime`
- Update `buildAnimationTimelineAdvanced` return type or add a wrapper that returns `{ frames, linearMoveSegments }`.

7.2. Update `GridAnimationView` and `AnimationTab`:

- Obtain `linearMoveSegments` from the timeline builder.
- Pass `linearMoveSegments` and `minEmissionSpeedMmPerS` (or equivalent) to `MotionCharts`.

7.3. Update `MotionCharts` to accept and use the new props.

---

### Step 8: Testing and validation

**Goal**: Verify correctness and visual behavior.

**Tasks**:

8.1. Unit tests:

- `computeLinearMoveProfile`: trapezoid, triangle, boundary, v_emit=0, v_emit=v_max.
- `velocityAtTime`: start, end, mid-accel, mid-const, mid-decel.
- `computeLinearMoveTimeWithMinEmission`: compare total time with profile’s `tTotal`.

8.2. Integration:

- Build a timeline with 2–3 spots, fire-in-motion on. Check that `linearMoveSegments` has correct entries.
- Verify velocity graph shows smooth ramps (no flat plateaus from constant v_avg).

8.3. Visual check:

- Velocity graph should show smooth v_emit→v_max→v_emit ramps for linear moves.
- Dwell phases at v_emit, rotate phases at 0.
- Short segments should show triangle (no flat top).

---

## 3. File Change Summary

| File | Changes |
|------|---------|
| `src/lib/animationUtils.ts` | Add `LinearMoveProfile`, `LinearMoveSegmentMeta`, `computeLinearMoveProfile`, `velocityAtTime`; update `computeLinearMoveTimeWithMinEmission`; extend `buildAnimationTimelineAdvanced` to return `linearMoveSegments` and use analytic v(t) per frame |
| `src/lib/animationUtils.test.ts` | Tests for new profile and v(t) |
| `src/components/images/MotionCharts.tsx` | Accept `linearMoveSegments`, `minEmissionSpeedMmPerS`; implement `velocityAtGlobalTime`; update `buildVelocitySeries` to use analytic v(t) |
| `src/components/grid/GridAnimationView.tsx` | Pass `linearMoveSegments` and emission speed to MotionCharts |
| `src/components/images/AnimationTab.tsx` | Same as GridAnimationView |

---

## 4. Dependency Order

```
Step 1 (types + profile + velocityAtTime)
    ↓
Step 2 (time estimation)
    ↓
Step 3 (segment metadata in timeline)
    ↓
Step 4 (MotionCharts v(t) sampling)
    ↓
Step 5 (timeline frame v_mm_per_s)
    ↓
Step 6 (edge cases)
    ↓
Step 7 (export + wire up)
    ↓
Step 8 (testing)
```

---

## 5. Optional Future Enhancements

- **Rotation profile**: Apply similar trapezoidal/triangle profile to rotation (angular velocity).
- **Jerk limiting**: Add jerk-limited S-curve profiles for smoother motion (more complex).
- **Smear overlay**: Use analytic v(t) at emission time for more accurate smear length/direction.
