# CanvasWorkspace, MasksTab, AuditLogTab – Refactoring Plan (React Hook Form)

This document analyses three components (`CanvasWorkspace.tsx`, `MasksTab.tsx`, `AuditLogTab.tsx`), provides a detailed refactoring breakdown, and outlines a structured plan for React Hook Form integration, logic optimization, API call management, and testing.

**Tech stack (from `.ai/tech-stack`):** Astro 5, React 19, TypeScript 5, Tailwind 4, Shadcn/ui; backend Python (FastAPI/Flask), SQLite. **React Hook Form** is already present in the project (`react-hook-form: ^7.71.1`).

---

## 1. Analysis

### 1.1 Component overview and main functionalities

| Component | Purpose | Main responsibilities |
|-----------|--------|------------------------|
| **CanvasWorkspace** | Canvas for drawing and editing masks on an image | (1) Display image and scale; (2) Draw new polygon (click points, finish/cancel); (3) Edit existing mask (drag vertices, save/cancel); (4) Delete mask; (5) Render SVG overlays (masks, drawing preview, vertex handles); (6) Demo watermark. |
| **MasksTab** | Tab “Maski” on image detail | (1) Fetch masks list and image blob; (2) Render WidthMmForm (image width in mm); (3) Render CanvasWorkspace with masks and handlers; (4) Handle save/delete/update mask via API; (5) Manage loading/error/saving/editingMaskId state. |
| **AuditLogTab** | Tab “Audit log” (list or filtered by iteration/image) | (1) Fetch audit log with filters (event type, date range, “only this image”); (2) Render filter controls (select, two date inputs, checkbox, “Odśwież”); (3) Render table and pagination. |

### 1.2 Form-related logic

- **CanvasWorkspace:** No classic form. State is **drawing/canvas state**: `drawingPoints`, `isDrawing`, `editedVerticesPx`, `draggingVertexIndex`, `imageSize`. Validation is inline (e.g. “min 3 points” in `handleFinishDrawing`). Buttons trigger callbacks (`onSaveMask`, `onUpdateMask`, `onDeleteMask`). **Conclusion:** Not a natural fit for React Hook Form; state is geometric and interaction-driven, not field-based.
- **MasksTab:** No form UI in the tab itself. It uses **WidthMmForm** (child), which has a real form: one number input (`width_mm`) and submit. WidthMmForm uses local `useState` for value, saving, and error; that form is a good RHF candidate (see WidthMmForm refactor or MasksTab section).
- **AuditLogTab:** **Filter form**: `eventType` (select), `fromDate` (date), `toDate` (date), `onlyThisImage` (checkbox). Each control is bound to `useState`; changing any filter triggers `setPage(1)` and the effect re-runs `fetchList()`. This is a clear **form** (filter criteria) and a strong candidate for React Hook Form.

### 1.3 Areas of high complexity

**CanvasWorkspace**

- **Multiple interrelated state variables:** `imageSize`, `drawingPoints`, `isDrawing`, `editedVerticesPx`, `draggingVertexIndex`. Mode switches (idle vs drawing vs editing) are implicit in these flags.
- **Coordinate logic:** `mmToPx` / `pxToMm`, `getImageCoords`, `handleCanvasClick` – DOM rect and scale calculations in several places.
- **Global mouse listeners** (lines 145–165): `useEffect` that adds `mousemove`/`mouseup` when `draggingVertexIndex != null`; must clean up correctly.
- **Large JSX block:** SVG with masks, editing vertices (circles), drawing polygon, demo overlay – all in one return.

**MasksTab**

- **Several `useEffect`s and callbacks:** One effect for `fetchMasks`, one for image blob (with object URL revoke). Three large async handlers: `handleSaveMask`, `handleDeleteMask`, `handleUpdateMask` – each with similar patterns (setSaving, apiFetch, parse response, setMaskError, update local state).
- **Duplicate error handling:** Same “status === 0”, “data?.detail”, “Unauthorized” handling repeated in each handler.
- **handleUpdateMask** depends on `masks` (to read `mask_label`), which can cause unnecessary callback identity changes.

**AuditLogTab**

- **Single large `fetchList`** with URL built from many params (`iterationIdFilter`, `imageId`, `onlyThisImage`, `page`, `pageSize`, `eventType`, `fromDate`, `toDate`). The dependency array is long; any filter change refetches.
- **Filter UI:** Four controlled inputs (select, two dates, checkbox) each with `onChange` that updates state and `setPage(1)`. No single “form” object; adding a new filter means another `useState` and more wiring.
- **Pagination** tied to the same effect: changing page triggers fetch. Logic is correct but could be clearer if “filters” and “page” were one form or one query state.

### 1.4 Where API calls are made

| Component | Location | Endpoint / action |
|-----------|----------|-------------------|
| **CanvasWorkspace** | None | No API calls; only calls props `onSaveMask`, `onDeleteMask`, `onUpdateMask`. |
| **MasksTab** | `fetchMasks` (effect) | `GET /api/images/${imageId}/masks` |
| **MasksTab** | Effect (image blob) | `GET /api/images/${imageId}/file` → `URL.createObjectURL(blob)` |
| **MasksTab** | `handleSaveMask` | `POST /api/images/${imageId}/masks` |
| **MasksTab** | `handleDeleteMask` | `DELETE /api/images/${imageId}/masks/${maskId}` |
| **MasksTab** | `handleUpdateMask` | `PATCH /api/images/${imageId}/masks/${maskId}` |
| **WidthMmForm** (child of MasksTab) | `handleSubmit` | `PATCH /api/images/${image.id}` (width_mm) |
| **AuditLogTab** | `fetchList` (effect) | `GET /api/audit-log?…` or `GET /api/iterations/${id}/audit-log?…` or `GET /api/images/${id}/audit-log?…` |

All use `apiFetch` from `@/lib/api`. MasksTab and AuditLogTab perform API calls inside the component (or in a child form); there is no shared masks/audit API module yet (planApi.ts has iterations/spots/file/masks list but not mask CRUD or audit-log).

---

<refactoring_breakdown>

## Refactoring breakdown

### CanvasWorkspace

**Quotes / areas that need refactoring:**

1. **“if (drawingPoints.length < 3)”** (line 106) – Validation is ad hoc in the callback. The component does not expose a “form” of drawing data; it’s a transient drawing state. No need for RHF here unless we add a separate “mask label” or “confirm polygon” form later.

2. **“setDrawingPoints((prev) => [...prev, { x, y }])”** (line 90), **“setEditedVerticesPx((prev) => …)”** (lines 150–156) – State is arrays of points and indices. React Hook Form is designed for field values (strings, numbers, booleans, nested objects), not for highly dynamic canvas interaction (click-by-click points, drag). Putting `drawingPoints` or `editedVerticesPx` into RHF would be possible but awkward (e.g. `setValue('points', nextPoints)` on every click/drag) and would not simplify the logic.

3. **Global mouse effect** (lines 145–165) – Logic is clear but lives inside the main component. Could be extracted to a small hook `useVertexDrag(draggingVertexIndex, getImageCoords, editVerticesPx, setEditedVerticesPx, setDraggingVertexIndex)` to isolate side effects and improve testability.

4. **Coordinate helpers** – `mmToPx`, `pxToMm`, `getImageCoords` are pure or callback-based; they could stay in the file or move to a small `canvasCoordinates.ts` if reused elsewhere.

**Brainstorm – React Hook Form in CanvasWorkspace:**

- **Option A – No RHF**  
  Keep all state as today (useState for drawing and editing). Use RHF only if we later add a small “Mask label” or “Confirm polygon” modal/form.  
  **Pros:** No unnecessary abstraction; component stays focused on canvas interaction.  
  **Cons:** None for current scope.

- **Option B – RHF for a hypothetical “new mask” form**  
  If we add a step “draw polygon → then open modal to set label and confirm”, that modal could use RHF with fields `maskLabel`, and optionally store `vertices` in form state only for that confirmation step.  
  **Pros:** Consistent form handling for the modal.  
  **Cons:** Out of scope for current refactor; CanvasWorkspace itself stays RHF-free.

**Recommendation for CanvasWorkspace:** Do **not** integrate React Hook Form. Optimize by: (1) optionally extracting `useVertexDrag` for the mouse listener effect; (2) optionally extracting presentational pieces (e.g. “MaskList” for the list of masks, or keep as is); (3) keep validation in callbacks. Document that RHF is reserved for real forms (e.g. future mask label modal).

---

### MasksTab

**Quotes / areas that need refactoring:**

1. **“const res = await apiFetch(`/api/images/${imageId}/masks`)”** (line 26) and the image blob effect (lines 57–73) – Data fetching is inside the component with multiple `useState`s. Similar to AnimationTab, a custom hook `useMasksTabData(imageId)` could return `{ masks, loading, error, imageObjectUrl, refetchMasks }` and encapsulate fetch + blob URL lifecycle.

2. **“setMaskError(null); setSaving(true); try { … } catch … finally { setSaving(false) }”** – Repeated in `handleSaveMask`, `handleDeleteMask`, and `handleUpdateMask`. Error message derivation (e.g. `res.status === 0`, `data?.detail`, “Maska poniżej 3% apertury”) is duplicated. A small helper or a dedicated **masks API service** (e.g. `createMask`, `deleteMask`, `updateMask`) would centralize URL, body, and error parsing.

3. **“handleUpdateMask”** (lines 164–209) – Depends on `[imageId, masks]`. Using `masks.find(m => m.id === maskId)?.mask_label` inside the callback ties it to `masks` and can cause unnecessary re-renders or callback changes. Passing `maskLabel` as argument (or reading from a ref) could reduce dependency on `masks`.

4. **WidthMmForm** – Child component has its own form (one input, submit). It uses `useState` for value, saving, error and manual `parseFloat` validation. This is the **only real form** in the MasksTab tree. Refactoring WidthMmForm with React Hook Form (single field `width_mm`, validation e.g. “number > 0”) would improve consistency and maintainability; MasksTab would then just pass `image` and `onSave` and not need RHF itself.

**Brainstorm – React Hook Form in MasksTab:**

- **Option A – RHF only in WidthMmForm**  
  MasksTab stays as is; refactor WidthMmForm to use `useForm({ defaultValues: { width_mm: image.width_mm } })`, `register('width_mm')` with validation, and submit that calls PATCH and `onSave(updated)`.  
  **Pros:** Clear boundary; only the form component uses RHF.  
  **Cons:** MasksTab still holds all API logic; no RHF in MasksTab itself.

- **Option B – RHF in MasksTab for a future “Add mask label” form**  
  If we later add a step to name a mask after drawing, that could be a small form in MasksTab or in a modal, using RHF.  
  **Pros:** Extensible.  
  **Cons:** Not required for current refactor.

**Recommendation for MasksTab:** (1) **Do not** add a form in MasksTab itself; (2) **Refactor WidthMmForm** with React Hook Form (see plan below); (3) **Extract API** into a custom hook `useMasksTabData(imageId)` for masks list + image blob, and optionally a service or hook for mask CRUD (e.g. `useMaskMutations(imageId)`) that returns `{ saveMask, deleteMask, updateMask, saving, maskError, setMaskError }` so MasksTab becomes thinner and testable.

---

### AuditLogTab

**Quotes / areas that need refactoring:**

1. **“const [eventType, setEventType] = React.useState<string>('')”** and similar for `fromDate`, `toDate`, `onlyThisImage` (lines 46–49) – Four independent state values that together form the **filter**. Every `onChange` does e.g. `setEventType(e.target.value); setPage(1)`. This is classic form state that React Hook Form can centralize.

2. **“const params = new URLSearchParams(); params.set('page', String(page)); … if (eventType) params.set('event_type', eventType); …”** (lines 55–62) – The effect depends on `[..., eventType, fromDate, toDate]` and also `page`, `pageSize`, `iterationIdFilter`, `imageId`, `onlyThisImage`. Filters and pagination are two concerns: **filter form** (eventType, fromDate, toDate, onlyThisImage) and **page index**. RHF can hold filter values; page can stay as separate state or be part of a “query” object. Submitting or watching the form would trigger refetch with page reset to 1.

3. **“onChange={(e) => { setEventType(e.target.value); setPage(1); }}”** (lines 120–123) – Repeated pattern for each control. With RHF, we can `watch()` the form and run an effect that sets page to 1 and refetches, or use a single “Apply” button and submit to refetch.

**Brainstorm – React Hook Form in AuditLogTab:**

- **Option A – RHF for filter fields only; refetch on every change (current behaviour)**  
  Form shape: `{ eventType: string, fromDate: string, toDate: string, onlyThisImage: boolean }`. Default values: `'', '', '', false`. Register all four controls. Use `watch()` or `useWatch` and `useEffect` to call `fetchList()` when any value changes, and set `setPage(1)` when filters change. Page remains `useState(1)`.  
  **Pros:** Single source of truth for filters; easy to add new filter fields; consistent reset (e.g. `reset({ ...defaultValues })`).  
  **Cons:** Still need to sync “form values → effect → fetchList”; page is outside the form.

- **Option B – RHF for filters + “Apply” button**  
  Form holds filters; user clicks “Odśwież” or “Apply” to submit. On submit, set page to 1 and call `fetchList()`. No automatic refetch on every keystroke.  
  **Pros:** Fewer requests; explicit user action.  
  **Cons:** Changes current UX (today every filter change refetches).

- **Option C – RHF for filters + page in form**  
  Form shape: `{ eventType, fromDate, toDate, onlyThisImage, page: number }`. Watch entire form; effect runs fetch when any field changes.  
  **Pros:** One object for “everything that affects the list”.  
  **Cons:** Pagination is not really “form” data; mixing can be confusing. Prefer keeping page as separate state.

**Recommendation for AuditLogTab:** **Option A** – React Hook Form for the four filter fields. Default values from constants. Use `watch()` (or `useWatch`) and `useEffect` to: (1) reset page to 1 when any filter changes, (2) call `fetchList()` with current form values and page. Keep `page` and `pageSize` as component state. “Odśwież” button can call `fetchList()` with current form values (or trigger a refetch flag). This preserves current “refetch on filter change” UX and improves structure.

**Pros/cons of extracting fetch:**

- **Custom hook `useAuditLog(iterationIdFilter, imageId, filters, page, pageSize)`**  
  Returns `{ items, total, loading, error, refetch }`. Builds URL and runs fetch inside the hook.  
  **Pros:** AuditLogTab only renders form + table; hook testable with mock apiFetch.  
  **Cons:** Hook must accept filters object (from RHF watch) and page; dependency array stays explicit.

---

</refactoring_breakdown>

---

## 2. Refactoring Plan

### 2.1 Component structure changes

| Component | Change |
|-----------|--------|
| **CanvasWorkspace** | Keep as presentational/controller component. Optionally extract: (1) `useVertexDrag(draggingVertexIndex, getImageCoords, editVerticesPx, setEditedVerticesPx, setDraggingVertexIndex)` to isolate global mouse listeners; (2) keep or extract small subcomponents (e.g. list of masks) only if it improves readability. No form wrapper. |
| **MasksTab** | (1) Introduce `useMasksTabData(imageId)` – fetches masks list and image blob, returns `{ masks, loading, error, imageObjectUrl, refetchMasks }`. (2) Optionally introduce `useMaskMutations(imageId)` or a service `masksApi` with `createMask`, `deleteMask`, `updateMask` that return promises and let the component set saving/error. (3) Keep WidthMmForm as child; refactor WidthMmForm to use RHF (see 2.2). |
| **AuditLogTab** | (1) Wrap filter controls in a single form using React Hook Form; one object for `eventType`, `fromDate`, `toDate`, `onlyThisImage`. (2) Optionally extract `useAuditLog(iterationIdFilter, imageId, filters, page, pageSize)` returning `{ items, total, loading, error, refetch }` so the component only wires form → hook → table. |

### 2.2 React Hook Form implementation

- **CanvasWorkspace**  
  **No React Hook Form.** State remains `useState` for drawing and editing. If a future feature adds a “mask label” or confirmation form, add a small RHF form in that feature (e.g. modal).

- **MasksTab**  
  **No RHF in MasksTab itself.** The only form in the tree is **WidthMmForm**:
  - Use `useForm<{ width_mm: number }>({ defaultValues: { width_mm: image.width_mm }, values: { width_mm: image.width_mm } })` so when `image` changes the form updates (or use `reset(image)` when `image.id` / `image.width_mm` change).
  - Register the single field: `register('width_mm', { valueAsNumber: true, min: 0.1, required: true })` (or use a resolver with Zod for “greater than 0”).
  - On submit: call `PATCH /api/images/${image.id}` with `{ width_mm: data.width_mm }`, then `onSave?.(updated)`. Keep loading/error state in WidthMmForm or derive from formState (isSubmitting, errors).
  - Use Shadcn `Input` with `Controller` if you need full control, or `register` with native input; ensure `aria-invalid` and error message from `formState.errors.width_mm`.

- **AuditLogTab**  
  - **Form shape:** `type AuditLogFilters = { eventType: string; fromDate: string; toDate: string; onlyThisImage: boolean }`. Default values: `{ eventType: '', fromDate: '', toDate: '', onlyThisImage: false }`.
  - **Setup:** `useForm<AuditLogFilters>({ defaultValues })`. Register: `eventType` (select), `fromDate` (date), `toDate` (date), `onlyThisImage` (checkbox). Use `register('eventType')`, `register('fromDate')`, `register('toDate')`, `register('onlyThisImage')` so the DOM is controlled by RHF.
  - **Refetch behaviour:** Use `watch()` (or `useWatch`) to get current filter values. In a `useEffect` that depends on `[watchedFilters, page, pageSize, iterationIdFilter, imageId]`, call `fetchList(watchedFilters, page)` (or the new hook). When any watched filter value changes, set `setPage(1)` and then run fetch. “Odśwież” button: call `fetchList()` with current form values.
  - **Pagination:** Keep `page` and `pageSize` as `useState`; when filters change (compare previous vs current watched values), set page to 1. No need to put page inside RHF.

### 2.3 Logic optimization

- **CanvasWorkspace:** (1) Extract `useVertexDrag` for the mouse-drag effect to reduce noise in the main component. (2) Keep coordinate helpers in file or in `src/lib/` if reused. (3) Leave validation (“at least 3 points”) in the finish-drawing callback.
- **MasksTab:** (1) Move masks list + image blob fetch to `useMasksTabData(imageId)`. (2) Centralize mask CRUD: either a hook `useMaskMutations(imageId)` that returns `{ saveMask, deleteMask, updateMask, saving, maskError, clearMaskError }` and internally uses apiFetch and sets state, or a plain async service that returns results and let the component set saving/error. (3) In `handleUpdateMask`, avoid depending on `masks` for label: accept `maskLabel` as parameter from caller (CanvasWorkspace could pass it when we add label support) or read from a ref that is updated when masks change.
- **AuditLogTab:** (1) Build a single `filters` object from RHF and pass it to `fetchList` or to `useAuditLog`. (2) In the effect that refetches, only depend on “effective” filter values and page, so logic is easier to follow. (3) Consider debouncing filter changes (e.g. 300 ms) if we want to avoid a request on every keystroke for date inputs; for select and checkbox, immediate refetch is fine.

### 2.4 API call management

- **Centralize masks API:** Add functions (e.g. in `src/lib/services/masksApi.ts` or extend an existing api module) such as:
  - `fetchMasks(imageId): Promise<MaskDto[]>`
  - `fetchImageFile(imageId): Promise<Blob>` (or return Response and let caller call `.blob()`)
  - `createMask(imageId, body): Promise<MaskDto>`
  - `updateMask(imageId, maskId, body): Promise<MaskDto>`
  - `deleteMask(imageId, maskId): Promise<void>`
  Each function uses `apiFetch`, checks `res.ok`, parses JSON or error detail once. MasksTab or `useMasksTabData` / `useMaskMutations` call these instead of inlining fetch.
- **Audit log API:** Add `fetchAuditLog(params: { iterationId?: number; imageId?: number; filters: AuditLogFilters; page: number; pageSize: number }): Promise<AuditLogListResponseDto>` that builds URL and query params in one place. AuditLogTab or `useAuditLog` calls it.
- **Error handling:** In the service (or hook), map status codes and `data?.detail` to a single error message and throw or return `{ ok: false, error }` so components only set one error state and avoid duplicated if/else blocks.
- **WidthMmForm:** Keep the PATCH call inside the form submit handler, or move to a small `imagesApi.updateImage(id, { width_mm })` and call it from the form.

### 2.5 Testing strategy

- **CanvasWorkspace:** (1) Unit tests: render with mock `imageUrl`, `masks`, `onSaveMask`, `onDeleteMask`, `onUpdateMask`; simulate click “Dodaj maskę”, then canvas clicks (need to mock getBoundingClientRect or fire synthetic events that produce known coordinates); assert “Zakończ rysowanie” is disabled until ≥3 points; assert callbacks called with correct vertex arrays (mm). (2) Test “Edytuj” → drag vertex → “Zapisz zmiany” calls `onUpdateMask` with new vertices. (3) If `useVertexDrag` is extracted, test it with a mock `getImageCoords` and assert `setEditedVerticesPx` is called with updated array on mousemove. Use Vitest + React Testing Library; mock `containerRef.current` and image dimensions for coordinate logic.
- **MasksTab:** (1) Mock `apiFetch` and `WidthMmForm`; render with `imageId` and `image`; assert fetch for masks and for image file on mount. (2) Assert CanvasWorkspace receives `masks`, `imageUrl`, and that saving/error state is passed. (3) If using `useMasksTabData` and `useMaskMutations`, unit test the hooks with mock apiFetch: assert correct URLs and body, and that refetch/update/delete update state as expected.
- **WidthMmForm (with RHF):** (1) Render with `image={{ id: 1, width_mm: 10 }}` and mock `onSave`; submit with valid value, assert PATCH called and `onSave` called with updated image. (2) Submit with invalid value (0, negative, non-number), assert validation error and no PATCH. (3) Test that when `image` prop changes, form default/values update (e.g. `reset` or `values` in useForm).
- **AuditLogTab:** (1) Mock `apiFetch`; render with `iterationIdFilter` and/or `imageId`; assert initial fetch URL and query params (page, page_size, sort, order). (2) Change filter (select event type, set fromDate) and assert effect runs and new request has correct params and page=1. (3) Change page only, assert request has same filters but new page. (4) With RHF, assert form default values and that “Odśwież” triggers fetch with current form values.
- **Edge cases:** (1) CanvasWorkspace: image not loaded yet (imageSize null); mask list empty; editingMaskId set then parent unmounts. (2) MasksTab: 401 (Unauthorized) – assert no crash and error state or redirect; 400 with detail (e.g. 3% aperture) – assert maskError shows server message. (3) AuditLogTab: empty response (items [], total 0); 404; onlyThisImage true with imageId null (should not call image endpoint).

Use Vitest, React Testing Library, and the project’s existing guidelines (Arrange–Act–Assert, `vi.mock('@/lib/api')`, jsdom). Add tests when refactoring so behaviour is preserved and regressions are caught.

---

## Summary

| Component        | RHF? | Main structural change |
|-----------------|------|-------------------------|
| CanvasWorkspace | No   | Optional: extract `useVertexDrag`; keep state as is. |
| MasksTab        | No (child WidthMmForm: yes) | Extract `useMasksTabData`, optional `useMaskMutations` or masks API service; refactor WidthMmForm to RHF. |
| AuditLogTab     | Yes  | Single RHF form for filters; optional `useAuditLog`; keep page in state. |

This plan keeps React Hook Form where it adds value (AuditLogTab filters, WidthMmForm) and avoids forcing it into canvas/drawing state (CanvasWorkspace) or into a tab that only orchestrates children and API (MasksTab). API logic is centralized in services or custom hooks for clarity and testability.
