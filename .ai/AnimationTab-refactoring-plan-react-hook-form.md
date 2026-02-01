# AnimationTab Refactoring Plan – React Hook Form

This document provides an analysis of `AnimationTab.tsx`, a refactoring breakdown, and a structured plan for introducing React Hook Form and improving structure, efficiency, and maintainability.

---

## 1. Analysis

### 1.1 Component and main functionalities

**Single component in scope: `AnimationTab`** (`src/components/images/AnimationTab.tsx`)

| Area | Description |
|------|-------------|
| **Purpose** | “Wizualizacja sekwencji emisji” – visualizes the emission sequence of spots for a selected plan iteration. |
| **Responsibilities** | (1) Load image file, iterations list, masks, and spots for selected iteration via API. (2) Let user pick an iteration from a dropdown. (3) Play/pause/reset a timeline animation. (4) Toggle “Linie średnic co 5°” and “Oś głowicy”. (5) Render image + SVG overlay (masks, diameter lines, axis, fired spots, head position, flash). (6) Show frame counter and gradient legend. |
| **Props** | `imageId`, `image` (ImageDto), `selectedIterationId?`, `onSelectIteration?`, `isDemo?`. |
| **State** | Many `useState`: `imageObjectUrl`, `imageSize`, `masks`, `iterations`, `spots`, `loadingIterations`, `loadingSpots`, `currentFrameIndex`, `playing`, `showDiameterLines`, `showAxisLine`; one `useRef` for container and one for the animation timer. |
| **Derived** | `selectedIterationId` (from parent or first iteration), `scale`, `centerPx`, `radiusPx`, `timeline`, `timelineIdx`, `frame`. |

So the component mixes: **data fetching**, **form-like controls** (one select + two checkboxes), **animation playback**, and **complex SVG rendering**.

### 1.2 Form-related logic

- **Iteration select** (lines 274–293): `value={selectedIterationId ?? ""}`, `onChange` → `onSelectIteration?.(Number(v))`. Effectively **controlled by parent** (ImageDetailView holds `selectedIterationId` and passes `onSelectIteration={setSelectedIterationId}`).
- **Checkbox “Linie średnic co 5°”** (lines 326–333): `checked={showDiameterLines}`, `onChange` → `setShowDiameterLines(e.target.checked)`.
- **Checkbox “Oś głowicy (linia)”** (lines 334–341): `checked={showAxisLine}`, `onChange` → `setShowAxisLine(e.target.checked)`.

There is **no submit handler**, **no validation**, and **no form element** wrapping these controls. The “form” is implicit: one select and two booleans. React Hook Form can still centralize this UI state and make future fields (e.g. playback speed, FPS) easier to add.

### 1.3 Areas of high complexity

- **Four separate `useEffect`s** for API: image blob, iterations list, masks, spots. Each has its own loading/error handling and dependency list. Reading and testing the data flow requires jumping between multiple effects.
- **Large inline JSX**: SVG with masks, diameter lines loop, frame-based circles and head/flash. The return block is long and mixes layout, controls, and canvas logic.
- **Animation effect** (lines 218–234): interval updates `currentFrameIndex`, clears on end, dependency on `playing`, `spots.length`, `totalFrames`. Timer ref must be cleared on unmount and pause.
- **Derived timeline** (lines 123–134): `useMemo` for `timeline`; then `timelineIdx` and `frame` derived from `currentFrameIndex` and `totalFrames`. The mapping from “event-based” frame index to timeline index is easy to misread.
- **Pure functions in file** (e.g. `spotColor`, `spotPxFromTopLeftMm`, `buildAnimationTimelineFromSpots`) are already well-scoped but live in the same file as the big component.

### 1.4 Where API calls are made

| Location | Endpoint | When |
|----------|----------|------|
| Lines 136–152 | `GET /api/images/${imageId}/file` | On `imageId` change; sets `imageObjectUrl`. |
| Lines 154–173 | `GET /api/images/${imageId}/iterations?page=1&page_size=50` | On `imageId` change; sets `iterations`, `loadingIterations`. |
| Lines 174–188 | `GET /api/images/${imageId}/masks` | On `imageId` change; sets `masks`. |
| Lines 191–216 | `GET /api/iterations/${selectedIterationId}/spots?format=json` | On `selectedIterationId` change; sets `spots`, `loadingSpots`, resets `currentFrameIndex`. |

All use `apiFetch` from `@/lib/api` and manual `setState` in async IIFEs inside `useEffect`. There is no shared error reporting or retry; revoke of object URL is only for the image blob.

---

<refactoring_breakdown>

## Refactoring breakdown

### Step 1 – Analyse current components

**Quotes / areas that need refactoring:**

1. **Form state is ad hoc**  
   *“value={selectedIterationId ?? ""}”, “checked={showDiameterLines}”, “checked={showAxisLine}”* – three independent pieces of state (one effectively from parent, two local). Adding another control (e.g. playback speed) would add more `useState` and more wiring.

2. **API logic is embedded in the component**  
   *“React.useEffect(() => { (async () => { setLoadingIterations(true); try { const res = await apiFetch(...)”* – four effects with similar patterns. Hard to test in isolation, hard to reuse (e.g. if another tab needed iterations + spots).

3. **SVG and layout dominate the file**  
   *Lines 312–408* – the overlay (masks, diameter lines, axis, fired spots, head, flash) is one large block. The diameter-lines loop is an IIFE returning an array of `<line>` elements. This could be a presentational subcomponent with clear props.

4. **Animation and ref cleanup**  
   *“timerRef.current = setInterval(...)”, “if (timerRef.current) clearInterval(timerRef.current)”* – playback logic and ref cleanup are correct but live inside the main component; a small custom hook would isolate “current frame index + playing + step” and make the main component easier to follow.

**Brainstorm – React Hook Form usage:**

- **Option A – RHF only for checkboxes**  
  Register only `showDiameterLines` and `showAxisLine`; leave the iteration select as today (value from prop, onChange → `onSelectIteration`).  
  **Pros:** Minimal change; parent stays single source of truth for iteration.  
  **Cons:** Form state is split (two fields in RHF, one outside); less benefit from RHF.

- **Option B – RHF for all three fields; iteration synced with parent**  
  Form state: `iterationId` (number | ""), `showDiameterLines`, `showAxisLine`. Default `iterationId` from `selectedFromParent ?? iterations[0]?.id ?? ""`. When `iterationId` changes (user or reset), call `onSelectIteration(Number(iterationId))`. When `selectedFromParent` or `iterations` change (e.g. after load), `reset` or `setValue('iterationId', ...)` so the form stays in sync.  
  **Pros:** One place for all controls; easy to add more fields; consistent pattern.  
  **Cons:** Need to keep form and parent in sync (effect on `selectedFromParent`/`iterations` that updates the form).

- **Option C – RHF with Controller for iteration**  
  Same as B but use `Controller` with `value`/`onChange` driven by parent when provided.  
  **Pros:** Explicit control when parent drives the value.  
  **Cons:** More boilerplate; still need sync logic.

**Recommendation:** Option B: one form with three fields; one `useEffect` that watches `selectedFromParent` and `iterations` and calls `setValue('iterationId', ...)` so the dropdown reflects parent/initial state; `watch('iterationId')` and `useEffect` to call `onSelectIteration` when the user changes the select. That keeps a single form model and preserves parent control.

**Pros/cons of refactoring approaches:**

- **Extract API into custom hook**  
  **Pros:** Component only deals with “data + loading”; effects move to one place; hook can be unit-tested with mock fetch.  
  **Cons:** Hook interface (imageId, selectedIterationId → imageObjectUrl, imageSize, iterations, masks, spots, loadings) must stay in sync with current behaviour (e.g. revoke object URL on imageId change).

- **Extract SVG overlay to subcomponent**  
  **Pros:** Shorter main component; overlay can be tested with fixed props; reuse of “spot color / scale” logic via props.  
  **Cons:** Need to pass many props (imageSize, scale, masks, spots, frame, showDiameterLines, showAxisLine, centerPx, radiusPx); or pass a single “overlay state” object.

- **Extract animation playback into hook**  
  **Pros:** `useAnimationPlayback(playing, totalFrames, onStep, onEnd)` encapsulates interval and ref cleanup.  
  **Cons:** Slight indirection; current logic is already in one effect.

### Step 2 – Implement React Hook Form

- **Dependency:** Project does not have `react-hook-form`; add it (and optionally `@hookform/resolvers` if we add Zod later for any validation).
- **Form shape:**  
  `{ iterationId: number | ""; showDiameterLines: boolean; showAxisLine: boolean }`  
  Defaults: `iterationId: ""`, `showDiameterLines: false`, `showAxisLine: false`. After iterations load, we need to set `iterationId` to `selectedFromParent ?? iterations[0]?.id ?? ""` (via `reset` or `setValue` in an effect).
- **Integration:**  
  - Wrap the iteration select and two checkboxes in `<form>` (optional; can be div) and use `register('iterationId')`, `register('showDiameterLines')`, `register('showAxisLine')` or Controller if we need custom components.  
  - For the select: `value` must reflect form state; when parent forces a new `selectedIterationId`, we update the form so the select doesn’t show stale value.  
  - No submit handler unless we later add “Apply” or similar; for now, changes are applied on change (select → `onSelectIteration`, checkboxes → re-render).

### Step 3 – Optimize component logic

- **Simplify data flow:** One hook `useAnimationTabData(imageId, selectedIterationId)` returning `{ imageObjectUrl, imageSize, iterations, masks, spots, loadingIterations, loadingSpots }`. All four API effects move there; blob URL revoke in the hook’s cleanup.
- **Simplify playback:** Either keep the single `useEffect` for the interval or extract `useAnimationPlayback(playing, totalFrames, animationDurationMs, setCurrentFrameIndex, setPlaying)`. The latter makes the main component a bit cleaner.
- **Readability:** Extract `AnimationOverlay` (or `EmissionOverlay`) component: props like `imageSize`, `scale`, `masks`, `spots`, `frame`, `showDiameterLines`, `showAxisLine`, `centerPx`, `radiusPx`. It only renders the SVG; pure presentational. Keep `spotColor`, `spotPxFromTopLeftMm`, `buildAnimationTimelineFromSpots` in the same file or move to `utils`/`animation` if shared.

### Step 4 – Manage API calls

- **Best practice:** Don’t call API directly inside the component; use a custom hook or a small service. Here, a hook is enough: `useAnimationTabData(imageId, selectedIterationId)` that:
  - Fetches image file when `imageId` changes; creates object URL; revokes on cleanup or when `imageId` changes.
  - Fetches iterations when `imageId` changes.
  - Fetches masks when `imageId` changes.
  - Fetches spots when `selectedIterationId` is set; otherwise sets spots to [].
- **Error handling:** Currently errors only clear or set empty arrays. We could extend the hook to return `errorIterations`, `errorSpots`, etc., and show a small toast or inline message in the tab. For the plan we can keep current behaviour and add error state in the hook for future use.
- **Service layer:** Optional: add `imagesApi.getFile(id)`, `imagesApi.getIterations(id)`, `imagesApi.getMasks(id)`, `iterationsApi.getSpots(id)` in `src/lib/api.ts` or `src/lib/services/imagesApi.ts` and call them from the hook. That keeps URLs and response types in one place.

### Step 5 – Review and test strategy

- **Pure functions:** Unit test `spotColor`, `spotPxFromTopLeftMm`, `buildAnimationTimelineFromSpots` with fixed inputs (e.g. empty spots, one spot, two spots; scale 1 and 2). No React needed.
- **useAnimationTabData:** Test with mocked `apiFetch`: assert that it calls the right URLs when `imageId`/`selectedIterationId` change, returns loading flags, and revokes object URL on cleanup. Use Vitest + React Testing Library or a simple test that mounts a wrapper that calls the hook.
- **AnimationTab (integration):** Render with mock props and mocked `apiFetch`; assert that iteration select and checkboxes render, play/pause/reset buttons work, and that selecting an iteration triggers the expected fetch (e.g. via mock assert on URL). Snapshot tests are optional and can be brittle for SVG.
- **Edge cases:** (1) `imageId` changes while a fetch is in flight – hook should avoid updating state for a stale request (e.g. ignore previous response). (2) `selectedIterationId` null vs first iteration – dropdown should show correct value. (3) Unmount during playback – interval must be cleared (no setState after unmount). (4) Iterations load after mount – form’s `iterationId` should get first iteration if parent didn’t provide one.

</refactoring_breakdown>

---

## 2. Refactoring Plan

### 2.1 Component structure changes

1. **Add a data hook**  
   - Create `useAnimationTabData(imageId: number, selectedIterationId: number | null)` in e.g. `src/components/images/useAnimationTabData.ts` (or under `src/lib/hooks/` if you prefer).  
   - Move the four `useEffect`s from `AnimationTab` into this hook.  
   - Return: `{ imageObjectUrl, imageSize, iterations, masks, spots, loadingIterations, loadingSpots }`.  
   - In the hook, revoke the image object URL in the effect cleanup when `imageId` changes or on unmount.

2. **Optional: playback hook**  
   - Create `useAnimationPlayback(playing: boolean, totalFrames: number, animationDurationMs: number, onStep: (nextIndex: number) => void, onEnd: () => void)` that sets an interval when `playing` is true, calls `onStep` each tick, calls `onEnd` when reaching the last frame, and clears the interval on cleanup or when `playing` becomes false.  
   - Use it in `AnimationTab` to replace the current interval effect and ref.

3. **Extract overlay component**  
   - Create `AnimationOverlay` (in same file or `AnimationOverlay.tsx`) that accepts: `imageSize`, `scale`, `masks`, `spots`, `frame`, `showDiameterLines`, `showAxisLine`, `centerPx`, `radiusPx`, and optionally `spotColor`/`spotPxFromTopLeftMm` or pass precomputed data.  
   - Render the SVG (masks, diameter lines, axis, fired spots, head, flash) inside this component.  
   - Keep `MASK_COLORS` and diameter/axis drawing logic inside the overlay.

4. **Keep pure functions**  
   - Leave `spotColor`, `spotPxFromTopLeftMm`, `buildAnimationTimelineFromSpots` (and types like `TimelineFrame`) in the same module as `AnimationTab`, or move to e.g. `src/lib/animationUtils.ts` if you want them reusable and easier to unit test.

### 2.2 React Hook Form implementation

1. **Install**  
   - `npm install react-hook-form`  
   - Optionally `@hookform/resolvers` and `zod` if you add validation later.

2. **Form model**  
   - Type:  
     `type AnimationTabFormValues = { iterationId: number | ""; showDiameterLines: boolean; showAxisLine: boolean }`  
   - Default values:  
     `defaultValues: { iterationId: "", showDiameterLines: false, showAxisLine: false }`

3. **In AnimationTab**  
   - Call `useForm<AnimationTabFormValues>({ defaultValues })`.  
   - **Iteration select:**  
     - Use `register('iterationId')` or `Controller` with `value: watch('iterationId')` and `onChange` that calls `setValue('iterationId', id)` and `onSelectIteration?.(id)`.  
     - In an effect, when `selectedFromParent` or `iterations` change, set form value:  
       `setValue('iterationId', selectedFromParent ?? iterations[0]?.id ?? "")`  
       so the dropdown stays in sync when parent forces a selection or when iterations load.  
   - **Checkboxes:**  
     - Use `register('showDiameterLines')` and `register('showAxisLine')` and bind `checked`/`onChange` to the registered refs and onChange handlers (standard RHF pattern).  
   - **Effective selected iteration:**  
     - Use either `watch('iterationId')` or the same derived value as today: `selectedFromParent ?? iterations[0]?.id ?? null`, but ensure the form’s `iterationId` is updated when parent or list change so the select displays correctly. Use the form value for “which iteration we’re showing” only when it’s consistent with parent (e.g. when user changes select, parent updates and form already has the new value). Simplest: keep deriving `selectedIterationId = selectedFromParent ?? (iterations[0]?.id ?? null)` for data fetching, and sync form’s `iterationId` to this value in an effect; when user changes the select, call `onSelectIteration` and rely on parent to pass the new value back, then the effect will set the form again. So:  
     - Effect: `selectedFromParent`, `iterations` → `setValue('iterationId', selectedFromParent ?? iterations[0]?.id ?? "")`.  
     - Select: `value={watch('iterationId')}`, `onChange` → `setValue('iterationId', id)` and `onSelectIteration?.(id)`.  
     - Data hook and timeline still use `selectedIterationId = selectedFromParent ?? iterations[0]?.id ?? null` (unchanged).

4. **No submit**  
   - No `<form onSubmit>` unless you add it later; controls are “live” on change.

### 2.3 Logic optimization

- **Single source of truth for “selected iteration”:** Remain parent-driven for cross-tab sync (PlanTab and AnimationTab share the same id). Form only holds the current dropdown value and the two checkboxes; keep deriving `selectedIterationId` for API/timeline as today.
- **Reduce effect count in AnimationTab:** After moving API to `useAnimationTabData`, the component should have: one effect to sync form `iterationId` from props/iterations, one effect for playback (or the playback hook). Image load callback can stay.
- **Simplify JSX:** Use `AnimationOverlay` so the main return has a clear structure: toolbar (iteration + play/pause/reset + checkboxes) → loading message → canvas (image + overlay) → frame info → empty state. The diameter-lines loop stays inside the overlay as a clear, testable block.

### 2.4 API call management

- **Custom hook** (see 2.1): All four requests live in `useAnimationTabData`. The hook should:
  - Use a guard or abort controller so that when `imageId` or `selectedIterationId` changes before a request completes, you don’t set state from a stale response (e.g. track a “run id” or use `AbortController` and pass `signal` to `fetch`).
  - Revoke previous object URL before creating a new one when `imageId` changes.
- **Optional service layer:** In `src/lib/api.ts` or `src/lib/services/imagesApi.ts`, add:
  - `getImageFile(imageId): Promise<Blob>`
  - `getIterations(imageId, page, pageSize): Promise<IterationListResponseDto>`
  - `getMasks(imageId): Promise<MaskListResponseDto>`
  - `getIterationSpots(iterationId): Promise<{ items: SpotDto[] }>`  
  Then `useAnimationTabData` calls these and keeps loading/state logic. This improves testability and keeps API contracts in one place.

### 2.5 Testing strategy

1. **Unit tests (Vitest)**  
   - **Animation utils:**  
     - `spotColor(index, total)` for `total <= 0`, `total === 1`, and `index 0..n-1`.  
     - `spotPxFromTopLeftMm(x, y, scale)` for a few (x, y, scale) values.  
     - `buildAnimationTimelineFromSpots`: empty array; one spot; two spots; check frame count and that `headPx`/`firedIndices`/`flash` match expectations.  
   - **useAnimationTabData:** Mock `apiFetch`. For a given `imageId` and `selectedIterationId`, assert:  
     - Correct URLs are called.  
     - Returned state (after resolving promises) has `iterations`, `spots`, etc.  
     - When `selectedIterationId` is null, spots fetch is not called (or returns []).  
     - Object URL is revoked when `imageId` changes (e.g. mock `URL.createObjectURL`/`revokeObjectURL` and assert revoke is called).

2. **Component tests**  
   - Render `AnimationTab` with `imageId`, `image`, and mock `apiFetch` returning empty or minimal data.  
   - Assert: iteration select and both checkboxes are present; play/pause/reset buttons are present and disabled when appropriate.  
   - Change iteration select and assert `onSelectIteration` was called with the right id.  
   - Toggle checkboxes and assert no errors and that overlay (if rendered) receives updated props (or snapshot overlay only if desired).  
   - Optional: test that when iterations load, the first iteration is selected in the dropdown when parent didn’t provide a selection.

3. **Edge cases and integration**  
   - **Stale response:** Change `imageId` quickly; only the latest request’s result should update state (implement in hook and test with delayed mock).  
   - **Unmount during playback:** Unmount the component while playing; ensure no setState on unmounted component (interval cleared in cleanup).  
   - **No iterations:** Message “Brak iteracji. Wygeneruj plan…” is shown.  
   - **Demo mode:** When `isDemo` is true, the “DEMO” overlay is visible.

4. **E2E (optional)**  
   - In Playwright, open an image detail with an iteration, go to Animacja tab, select an iteration, click Odtwórz, then Wstrzymaj; assert frame counter or overlay visibility. Ensures full stack and real API behaviour.

---

## Summary

| Item | Action |
|------|--------|
| **Form state** | Introduce React Hook Form for iteration select + two checkboxes; keep selection in sync with parent via effect and `onSelectIteration`. |
| **API** | Move all four API effects into `useAnimationTabData(imageId, selectedIterationId)`; optional thin API service layer. |
| **Playback** | Keep current effect or extract `useAnimationPlayback` for clarity. |
| **SVG** | Extract `AnimationOverlay` with clear props. |
| **Pure logic** | Keep in module or move to `animationUtils.ts` and add unit tests. |
| **Tests** | Unit tests for utils and hook; component tests with mocked API; optional E2E for animation tab. |

This plan improves structure and maintainability, centralizes form state with React Hook Form, and isolates API and playback logic for easier testing and future changes.
