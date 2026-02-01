# PlanTab Refactoring Plan – React Hook Form

This document provides an analysis of `PlanTab.tsx` and its child `PlanParamsForm.tsx`, a refactoring breakdown, and a structured plan for introducing React Hook Form and improving structure, efficiency, and maintainability.

---

## 1. Analysis

### 1.1 Components and main functionalities

**Components in scope**

| Component | File | Purpose |
|-----------|------|---------|
| **PlanTab** | `src/components/images/PlanTab.tsx` | “Zakładka Plan” – lets the user set plan parameters, generate a new iteration (POST), view metrics and preview of the selected iteration, accept/reject draft, and export (JSON/CSV/PNG/JPG). |
| **PlanParamsForm** | `src/components/images/PlanParamsForm.tsx` | Controlled form for plan parameters: algorithm mode (simple/advanced), grid spacing (mm), target coverage (%). Used only inside PlanTab. |

**PlanTab responsibilities**

1. **Form state** – holds `params` (IterationCreateCommand) and passes `value`/`onChange` to PlanParamsForm.
2. **Generate plan** – “Generuj plan” button calls POST `/api/images/{imageId}/iterations` with current params; on success sets `lastGenerated` and calls `onIterationSelected`.
3. **Selected iteration** – can come from parent (`selectedIterationId` / `selectedIteration`) or from a fetch when user navigates from History; also falls back to `lastGenerated`.
4. **Fetch iteration by id** – when `selectedIterationIdFromParent` is set, one effect fetches `GET /api/iterations/{id}` into `fetchedIteration`.
5. **Preview data** – when an iteration is selected, another effect fetches image blob, masks, and spots (three API calls) and sets `previewImageUrl`, `previewMasks`, `previewSpots`; manages object URL lifecycle.
6. **Status change** – PATCH `/api/iterations/{id}` for accept/reject; updates local state and calls `onIterationUpdated`.
7. **Export** – GET endpoints for JSON, CSV, PNG, JPG; uses shared `downloadBlob`.
8. **UI** – params form + generate button, error alert, metrics block, accept/reject/export buttons, SVG overlay (masks + grid lines + spots).

**PlanParamsForm responsibilities**

- Renders: algorithm radio (simple/advanced), conditional grid spacing number input, target coverage number input.
- All state is controlled via `value` (IterationCreateCommand) and `onChange`; no internal form state.
- Clamps/parses values in change handlers (e.g. grid spacing between MIN/MAX, target coverage).

### 1.2 Form-related logic

- **PlanTab** (lines 47, 274–278): `const [params, setParams] = React.useState<IterationCreateCommand>(defaultParams)`; passes `value={params}` and `onChange={setParams}` to PlanParamsForm. “Generuj plan” uses `params` in `handleGenerate` (lines 137–172). So the only “form” in PlanTab is the params object; there is no `<form>`, no validation, and no submit event—generate is triggered by a button click that reads `params` from state.
- **PlanParamsForm** (lines 23–59): Three logical fields—`algorithm_mode`, `grid_spacing_mm`, `target_coverage_pct`. Each has a handler that calls `onChange` with a new object spread from `value`. Validation is ad hoc (parseFloat, clamp in handler). No zod/yup schema yet.

So form-related logic is: (1) one top-level state object in PlanTab, (2) controlled child that updates that object on every change. React Hook Form can replace this with a single form context, optional validation schema, and fewer re-renders (RHF uses refs for values until submit/watch).

### 1.3 Areas of high complexity

- **Many useState (9)** in PlanTab: `params`, `generating`, `error`, `lastGenerated`, `fetchedIteration`, `previewImageUrl`, `previewImageSize`, `previewMasks`, `previewSpots`. Plus one ref for object URL. This makes the component hard to scan and reason about.
- **Two useEffects with async logic**: First effect (lines 58–74) fetches iteration by id; second (lines 76–128) fetches image blob + masks + spots and manages object URL creation/revoke. The second effect is long and does multiple fetches and state updates; cleanup must revoke the object URL.
- **Derived `selectedIteration`** (lines 130–135): `selectedFromParent ?? (fetchedIteration && …) ?? lastGenerated`. Correct but easy to misread; lives inline.
- **handleGenerate** (lines 137–172): Builds request body from `params` with conditional `grid_spacing_mm` for simple mode; duplicates default logic (e.g. `params.algorithm_mode ?? "simple"`). Double `res.json()` risk if backend returns body on both success and error (currently handled by early return on !res.ok).
- **Large inline SVG** (lines 384–428): IIFE that returns masks polygons, 36 diameter lines, and spot circles. Scale and coordinate logic (`spotPxFromTopLeftMm`, `centerPx`, `radiusPx`) mixed with JSX. Same pattern as AnimationTab—could be a presentational component.
- **PlanParamsForm** re-renders on every keystroke because parent passes a new object reference on each `onChange`; RHF would reduce re-renders by keeping values in refs until submit or explicit watch.

### 1.4 Where API calls are made

| Location | Endpoint | When |
|----------|----------|------|
| PlanTab lines 64–69 | `GET /api/iterations/{selectedIterationIdFromParent}` | Effect when `selectedIterationIdFromParent` changes; sets `fetchedIteration`. |
| PlanTab lines 91–94 | `GET /api/images/{imageId}/file` | Effect when `imageId` or `selectedIterationIdFromParent` set; sets preview image URL (blob → object URL). |
| PlanTab lines 91–94 | `GET /api/images/{imageId}/masks` | Same effect; sets `previewMasks`. |
| PlanTab lines 91–94 | `GET /api/iterations/{id}/spots?format=json` | Same effect; sets `previewSpots`. |
| PlanTab lines 142–155 | `POST /api/images/{imageId}/iterations` | On “Generuj plan” click; body from `params`. |
| PlanTab lines 179–184 | `PATCH /api/iterations/{iterationId}` | On Accept/Reject; body `{ status }`. |
| PlanTab lines 221 | `GET /api/iterations/{id}/export?format=json` | On “Eksport JSON”. |
| PlanTab lines 235 | `GET /api/iterations/{id}/spots?format=csv` | On “Pobierz CSV (spoty)”. |
| PlanTab lines 251–252 | `GET /api/iterations/{id}/export?format=png|jpg` | On “Eksport PNG” / “Eksport JPG”. |

All use `apiFetch` from `@/lib/api`. No shared error toast or retry; PlanTab uses local `error` state and displays it in an alert block.

---

<refactoring_breakdown>

## Refactoring breakdown

### Step 1 – Analyse current components

**Quotes / areas that need refactoring:**

1. **Form state is a single useState object**  
   *“const [params, setParams] = React.useState<IterationCreateCommand>(defaultParams)”* and *“value={params} onChange={setParams}”* – the whole params object is in React state and passed to PlanParamsForm. Every change in PlanParamsForm (e.g. grid spacing) does `onChange({ ...value, grid_spacing_mm: ... })`, causing full parent re-render and new object reference. No validation layer; generate button just reads `params` and POSTs.

2. **Generate handler builds body manually**  
   *“body: JSON.stringify({ target_coverage_pct: params.target_coverage_pct, coverage_per_mask: params.coverage_per_mask, is_demo: params.is_demo ?? false, algorithm_mode: params.algorithm_mode ?? \"simple\", ...(params.algorithm_mode === \"simple\" ? { grid_spacing_mm: params.grid_spacing_mm ?? 0.8 } : {}), })”* – defaults and conditionals are in the component. If the API schema changes, this must be updated in sync. A small “toAPI” helper or using RHF’s `getValues()` with a schema would centralize this.

3. **Two effects with multiple concerns**  
   First effect: fetch iteration by id only. Second effect: when selected iteration id is set, fetch image + masks + spots and manage object URL. The second effect is long and does three fetches + blob handling + revoke on cleanup. Extracting “preview data” (image URL, masks, spots) into a custom hook (e.g. `useIterationPreview(imageId, selectedIterationId)`) would mirror `useAnimationTabData` and simplify PlanTab.

4. **Inline SVG overlay**  
   *Lines 384–428* – the IIFE with `previewMasks.map`, `Array.from({ length: 36 }, ...)` for diameter lines, and `previewSpots.map` with `spotPxFromTopLeftMm`. This is presentational logic that could live in a component like `PlanPreviewOverlay` receiving `imageWidthMm`, `previewImageSize`, `previewMasks`, `previewSpots`, and `imageUrl`, so PlanTab only composes layout and actions.

5. **PlanParamsForm is fully controlled**  
   *“value={value}” and “onChange({ ...value, grid_spacing_mm: ... })”* – every field change replaces the whole object. React Hook Form can own this state with `defaultValues: defaultParams`, and either PlanTab uses `useForm` and passes `control` to PlanParamsForm (via Controller or useFormContext), or PlanParamsForm uses `useForm` and exposes `getValues`/`trigger` so PlanTab reads values on “Generuj plan” click. The latter keeps form ownership in the same place as the generate button.

**Brainstorm – React Hook Form usage:**

- **Option A – RHF in PlanTab; PlanParamsForm receives control**  
  PlanTab calls `useForm<IterationCreateCommand>({ defaultValues: defaultParams })`. PlanParamsForm receives `control` (and `disabled`) and uses `Controller` for each field (algorithm_mode, grid_spacing_mm, target_coverage_pct). On “Generuj plan”, PlanTab calls `handleSubmit(onGenerate)` or manually `getValues()` and then POST.  
  **Pros:** Single form instance; validation can be added in PlanTab (e.g. zodResolver).  
  **Cons:** PlanParamsForm becomes tied to RHF (Controller); harder to reuse without RHF.

- **Option B – RHF inside PlanParamsForm; PlanTab gets values via ref/callback**  
  PlanParamsForm uses `useForm` internally and renders inputs with Controller/register. It exposes a ref (e.g. `getValuesRef`) or a callback `onValuesReady(getValues)` so PlanTab can call `getValues()` when user clicks “Generuj plan”.  
  **Pros:** Form UI and state live together.  
  **Cons:** Parent needs a way to trigger “submit” (generate); typically done via ref: `formRef.current?.getValues()` or a callback that PlanTab stores and calls on button click.

- **Option C – RHF in PlanTab; PlanParamsForm as presentational with register/Controller**  
  Same as A: PlanTab owns `useForm`, passes `control` to PlanParamsForm. PlanParamsForm only renders fields wired to `control`. Generate button stays in PlanTab and uses `getValues()` or `handleSubmit`.  
  **Pros:** Clear ownership; validation and submit in one place.  
  **Cons:** PlanParamsForm must accept `control` and use RHF APIs.

**Recommendation:** Option A/C (equivalent): keep `useForm` in PlanTab, pass `control` (and `disabled`) to PlanParamsForm so the “Generate” action and form state live in the same component. PlanParamsForm is refactored to use `Controller` (or `register` where possible) so we get fewer re-renders and a single source of truth. Option B is viable if you prefer the form component to fully “own” the form, but then PlanTab needs a ref or callback to read values on button click, which is slightly more awkward.

**API and logic extraction:**

- **Custom hook for “iteration by id”** – e.g. `useIteration(iterationId)` that returns `{ iteration, loading, error }`. PlanTab would use it when `selectedIterationIdFromParent != null` and set `fetchedIteration` from the result (or use the hook as the single source and drop `fetchedIteration` state).
- **Custom hook for “preview data”** – e.g. `useIterationPreview(imageId, iterationId)` returning `{ imageUrl, imageSize, masks, spots, loading, error }` and handling object URL lifecycle internally. PlanTab then has no useEffect for image/masks/spots and no preview state beyond what the hook returns.
- **Service or API module** – move `POST /iterations`, `PATCH /iterations/:id`, and export GETs into named functions in `@/lib/api` or `@/lib/services/planApi.ts` (e.g. `createIteration(imageId, body)`, `updateIterationStatus(id, status)`, `exportIterationJson(id)`). PlanTab (or a small hook like `usePlanActions`) would call these; easier to mock in tests and keeps components thin.

**Edge cases to preserve:**

- When `selectedIterationIdFromParent` is cleared, preview must clear and object URL must be revoked (already in effect cleanup).
- After generate, `lastGenerated` is set and `onIterationSelected(iteration.id)` is called; parent may set `selectedIterationId` so the next render shows the new iteration. The derived `selectedIteration` must still resolve to the new iteration (from `lastGenerated` or `fetchedIteration`).
- Accept/Reject updates local `lastGenerated` and `fetchedIteration` when the updated iteration id matches; `onIterationUpdated` is called so parent can refresh (e.g. history list).
- Double-read of `res.json()`: after `!res.ok` we do `await res.json()` for error detail; on success we do `await res.json()` again. Backend must return JSON in both cases; if 204 or empty body on success, current code would throw. Plan does not change this but it’s a good candidate for a small `parseJsonResponse` helper that avoids double-read and handles empty body.

</refactoring_breakdown>

---

## 2. Refactoring Plan

### 2.1 Component structure changes

- **PlanTab**
  - Introduce a custom hook **`useIterationPreview(imageId, iterationId)`** that:
    - When `iterationId` is null, returns `{ imageUrl: null, imageSize: null, masks: [], spots: [] }` and does not fetch.
    - When `iterationId` is set, fetches image file, masks, and spots (same three endpoints), creates/revokes object URL in cleanup, and returns `{ imageUrl, imageSize, masks, spots, loading?, error? }`.
  - Optionally introduce **`useIteration(iterationId)`** that fetches `GET /api/iterations/{id}` and returns `{ iteration, loading, error }`. PlanTab would use it instead of the first useEffect and `fetchedIteration` state (derived `selectedIteration` would use `iteration` from the hook when id matches).
  - Extract the SVG overlay (masks + diameter lines + spots) into a presentational component **`PlanPreviewOverlay`** (or keep name like `PlanPreviewCanvas`) with props: `imageUrl`, `imageWidthMm`, `imageSize`, `masks`, `spots`, `alt?`. PlanTab renders the image and overlays this component; no IIFE in PlanTab.
  - Keep “Parametry planu” section + error + “Metryki” + action buttons + preview block inside PlanTab; only data fetching and SVG are moved out.

- **PlanParamsForm**
  - Change props from `value` / `onChange` to **`control`** (and `disabled`). Accept `Control<IterationCreateCommand>` from React Hook Form.
  - Use **`Controller`** for:
    - `algorithm_mode` (radio group)
    - `grid_spacing_mm` (number input, only when algorithm_mode === "simple")
    - `target_coverage_pct` (number input)
  - Keep the same UI and labels; validation (min/max, step) can stay in the Controller’s render or be moved to schema (zod) with `resolver` in PlanTab.
  - If you add zod: define a schema that matches `IterationCreateCommand` (e.g. `target_coverage_pct` number between 3–20, `algorithm_mode` enum, `grid_spacing_mm` optional number 0.3–2) and use `zodResolver` in PlanTab’s `useForm`.

- **New modules**
  - `src/components/images/useIterationPreview.ts` – hook for image URL + masks + spots for a given iteration id.
  - `src/components/images/PlanPreviewOverlay.tsx` – presentational SVG overlay component.
  - Optional: `src/lib/services/planApi.ts` (or under `api.ts`) – `createIteration`, `updateIterationStatus`, `exportIterationJson`, `exportIterationCsv`, `exportIterationImage` that wrap `apiFetch` and return typed responses/blobs.

### 2.2 React Hook Form implementation

- **PlanTab**
  - Install/use existing `react-hook-form` (already in package.json).
  - At the top of PlanTab:
    - `const form = useForm<IterationCreateCommand>({ defaultValues: defaultParams });`
    - Optionally add validation: `zodResolver(iterationCreateSchema)` and `mode: "onChange"` or `"onTouched"` if you want inline errors before submit.
  - Replace `params` state and `setParams` with form state:
    - Remove `const [params, setParams] = React.useState<IterationCreateCommand>(defaultParams)`.
    - Pass `control={form.control}` and `disabled={generating}` to PlanParamsForm.
  - “Generuj plan” button:
    - Option 1: `onClick={() => form.handleSubmit(onGenerate)()}` where `onGenerate(data: IterationCreateCommand)` does the POST with `data` (and sets error/generating/lastGenerated). No HTML form element needed.
    - Option 2: Wrap the params section in `<form onSubmit={form.handleSubmit(onGenerate)}>` and make the button `type="submit"`. Then you get Enter-key submit and semantic form.
  - Build request body from form values in `onGenerate`: use `data.target_coverage_pct`, `data.algorithm_mode ?? "simple"`, `data.grid_spacing_mm ?? 0.8` when simple, etc. Either keep the current inline object or move to a small `toIterationCreatePayload(data: IterationCreateCommand)` in types or api layer.

- **PlanParamsForm**
  - Props: `control: Control<IterationCreateCommand>`, `disabled?: boolean`.
  - For each field:
    - **algorithm_mode**: `<Controller name="algorithm_mode" control={control} render={({ field }) => ( ... radio inputs with field.value, field.onChange ... )} />`. Default value in form is set in PlanTab’s defaultValues.
    - **grid_spacing_mm**: `<Controller name="grid_spacing_mm" control={control} render={({ field }) => ( <Input ... value={field.value ?? DEFAULT_GRID_SPACING_MM} onChange={(e) => { const n = parseFloat(e.target.value); field.onChange(Number.isFinite(n) ? clamp(n, MIN, MAX) : DEFAULT_GRID_SPACING_MM); }} /> )} />`. Only render when `useWatch({ control, name: "algorithm_mode" }) === "simple"` (or get it from control).
    - **target_coverage_pct**: Same idea with Controller and clamp/default.
  - Remove all `value`/`onChange` props that referred to the old `value` object; everything goes through `control`.

- **Validation (optional but recommended)**
  - Define `iterationCreateSchema` with zod (or yup): e.g. `z.object({ target_coverage_pct: z.number().min(3).max(20), algorithm_mode: z.enum(["simple", "advanced"]).optional(), grid_spacing_mm: z.number().min(0.3).max(2).optional(), ... })`.
  - In PlanTab: `useForm({ defaultValues: defaultParams, resolver: zodResolver(iterationCreateSchema) })`. Then in PlanParamsForm you can show `errors` from `formState` (passed as prop or via FormProvider) for each field.

### 2.3 Logic optimization

- **Derived `selectedIteration`**: Keep the same logic but optionally move to a small helper or useMemo for readability: e.g. `const selectedIteration = useMemo(() => selectedFromParent ?? (fetchedIteration && selectedIterationIdFromParent === fetchedIteration.id ? fetchedIteration : null) ?? lastGenerated, [selectedFromParent, fetchedIteration, selectedIterationIdFromParent, lastGenerated])`.
- **Request body building**: Extract to `buildIterationCreateBody(params: IterationCreateCommand)` that returns the object sent in POST body (with defaults and conditional `grid_spacing_mm`). Use it in `onGenerate` so PlanTab and tests have one place to maintain.
- **Error handling**: Keep local `error` state for generate/status/export; optionally centralize “set error from API response” in a tiny helper (e.g. `setErrorFromResponse(res, fallback)` that does `res.json().then(data => setError(...)).catch(() => setError(fallback))`) to avoid repeating the same pattern.
- **Preview hook**: Using `useIterationPreview` ensures object URL is always revoked in the hook’s cleanup and PlanTab has no preview-related useEffect; logic is in one place and testable in isolation.

### 2.4 API call management

- **Best practices**
  - Use a single place for base URL and credentials (already via `apiFetch`).
  - Avoid double `res.json()`: either read body once and branch on `res.ok`, or add helper `async function parseJsonResponse<T>(res: Response): Promise<{ ok: boolean; data?: T; error?: string }>` that reads once and returns parsed body + ok flag.
  - For “generate” and “status change”, consider not reading body on 4xx/5xx if backend returns non-JSON (current code assumes JSON for detail).

- **Suggested extraction**
  - **planApi.ts** (or under `src/lib/api.ts` as named exports):
    - `createIteration(imageId: number, body: IterationCreateCommand): Promise<IterationDto>`
    - `fetchIteration(id: number): Promise<IterationDto>`
    - `updateIterationStatus(id: number, status: "accepted" | "rejected"): Promise<IterationDto>`
    - `fetchIterationSpots(id: number, format: "json"): Promise<{ items: SpotDto[] }>`
    - `exportIterationJson(id: number): Promise<Blob>`, `exportIterationCsv(id: number): Promise<Blob>`, `exportIterationImage(id: number, format: "png" | "jpg"): Promise<Blob>`
  - **useIterationPreview** (and optionally **useIteration**) would call these or `apiFetch` internally; PlanTab (or a hook like `usePlanActions`) would call `createIteration`, `updateIterationStatus`, and export functions. This keeps components free of raw fetch/url construction and makes unit and integration tests easier (mock the module).

### 2.5 Testing strategy

- **Unit tests (Vitest)**
  - **PlanParamsForm**: Render with a mock `control` (from `useForm` in test) and assert that changing algorithm mode shows/hides grid spacing, and that inputs reflect `control` values. If you add validation, assert that error messages appear when values are invalid.
  - **PlanPreviewOverlay**: Render with mock `imageSize`, `masks`, `spots` and assert that the correct number of polygons, lines, and circles are rendered (snapshot or queryAllByRole/queryAll for elements).
  - **buildIterationCreateBody** (or equivalent): Given various `IterationCreateCommand` objects, assert the resulting POST body (e.g. grid_spacing_mm only when algorithm_mode === "simple", defaults applied).
  - **useIterationPreview**: With a mocked apiFetch, assert that when `iterationId` is null no request is made; when set, the three GETs are called and return values are mapped to hook result; on unmount or id change, revoke is called (may need to mock URL.createObjectURL/revokeObjectURL).

- **Integration / E2E**
  - Plan tab: Open image detail → Plan tab → change params → click “Generuj plan” → assert that metrics and preview appear and that “Akceptuj”/“Odrzuć” and export buttons work. Optionally assert that after accept, history or parent state updates (if testable).
  - Validation: If you add zod + inline errors, submit with invalid values (e.g. target coverage 0 or 100) and assert error messages and that POST is not sent.

- **Edge cases**
  - Generate in progress: button disabled, form disabled, no double submit.
  - Selected iteration from parent vs last generated: after generate, selected iteration should be the new one (parent sets id or component uses lastGenerated); accept/reject should update the shown iteration when id matches.
  - Clearing selected iteration (e.g. switching tab or parent clearing id): preview clears, object URL revoked (covered by useIterationPreview cleanup).
  - 401: apiFetch redirects to login; PlanTab’s catch for "Unauthorized" prevents setting “Błąd połączenia” (already correct).

---

## Summary

| Area | Action |
|------|--------|
| **Form state** | Replace `params` useState in PlanTab with `useForm<IterationCreateCommand>`; pass `control` to PlanParamsForm. |
| **PlanParamsForm** | Refactor to use `Controller` for algorithm_mode, grid_spacing_mm, target_coverage_pct; remove value/onChange. |
| **Generate** | Use `form.handleSubmit(onGenerate)` or form submit; build body in onGenerate (or via helper). |
| **Data fetching** | Extract `useIterationPreview(imageId, iterationId)` and optionally `useIteration(iterationId)`; remove two useEffects from PlanTab. |
| **API layer** | Add createIteration, updateIterationStatus, export helpers (and optionally fetchIteration, fetchIterationSpots) in planApi or api.ts. |
| **SVG overlay** | Extract PlanPreviewOverlay component; keep coordinate/scale logic there. |
| **Validation** | Optional zod schema + zodResolver; show field errors in PlanParamsForm. |
| **Tests** | Unit tests for PlanParamsForm (with RHF), PlanPreviewOverlay, build body, useIterationPreview; E2E for generate + accept/reject + export. |

This plan improves structure (hooks, presentational component, API module), reduces re-renders (RHF), centralizes validation and request body building, and keeps behavior and edge cases intact while making the code easier to maintain and test.
