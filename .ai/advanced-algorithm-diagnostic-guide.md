# Advanced Algorithm Diagnostic Guide

**Purpose:** Help diagnose why the advanced algorithm works locally (standalone Python script) but not in the LaserXe web app.

---

## 1. What I Understand

| Context | Description |
|--------|-------------|
| **"Works locally"** | The reference `working_lesion_spot_planner.txt` (standalone Python) produces correct spots, chart, and GIF |
| **"Doesn't work in site"** | When using the web app (Plan tab → Zaawansowany (beta) → Generuj plan), something fails |
| **Key difference** | Reference uses **pixel masks** from images; site uses **polygon vertices** drawn by user (stored in top-left mm) |

---

## 2. Possible Failure Modes

| Symptom | Likely cause |
|---------|--------------|
| **0 spots generated** | No masks, or masks too small (< 0.5% aperture or < 1% of total mask area) |
| **Spots in wrong position** | Coordinate conversion bug (top-left mm ↔ center mm) |
| **API error (500)** | Backend exception – check backend logs |
| **Animation looks wrong** | Frontend coordinate/scale mismatch |
| **Different spot count than reference** | Different input (polygons vs pixel masks), different coverage logic |

---

## 3. Diagnostic Checklist (please run and share results)

### Step A: Backend unit tests

```powershell
cd "c:\Onedrive\ITP SA\OneDrive - ITP SA\Dokumenty\GitHub\LaserXe\backend"
python -m pytest tests/test_plan_grid.py -v
```

**Expected:** All tests pass. If any fail, that’s a backend bug.

---

### Step B: Manual test in browser

1. Start backend: `cd backend && uvicorn main:app --reload --port 8000`
2. Start frontend: `npm run dev`
3. Log in (user / 123)
4. Open an image that has **at least one mask** (draw a polygon in Masks tab if needed)
5. Go to **Plan** tab
6. Select **Zaawansowany (beta)**
7. Set **Docelowe pokrycie** to 10%
8. Click **Generuj plan**

**Report:**
- [ ] Did the request succeed (no error toast)?
- [ ] How many spots were generated (Liczba punktów)?
- [ ] Do spots appear in the preview?
- [ ] If 0 spots: does the image have masks? What is the mask area (approx)?

---

### Step C: API call directly (to isolate frontend)

Open DevTools (F12) → Network tab. When you click **Generuj plan**, find the `POST .../iterations` request.

**Report:**
- Status code (200, 201, 500, etc.)?
- Response body (or error message)?

---

### Step D: Backend logs

When you click **Generuj plan**, check the terminal where the backend is running.

**Report:**
- Any traceback or error?
- Any `WARNING` or `ERROR` lines?

---

## 4. How to Report Back to Me

Please copy this template and fill it in:

```
## Advanced algorithm diagnostic report

**Backend tests (Step A):** [ ] Pass / [ ] Fail (if fail: paste error)

**Manual test (Step B):**
- Request succeeded: [ ] Yes / [ ] No
- Spots count: ___
- Spots visible in preview: [ ] Yes / [ ] No
- Image has masks: [ ] Yes / [ ] No
- Mask area (approx): ___ mm² or "unknown"

**API response (Step C):**
- Status: ___
- Response snippet: [paste first 500 chars or error]

**Backend logs (Step D):**
- Errors: [ ] None / [ ] Yes (paste if yes)

**What "doesn't work" means to you (be specific):**
- e.g. "0 spots when I expect ~50"
- e.g. "Spots appear outside the mask"
- e.g. "Animation head moves wrong direction"
```

---

## 5. Quick Fix: Ensure Masks Exist

The advanced algorithm **requires masks**. If the image has no masks:

1. Go to **Maski** tab
2. Draw a polygon over the lesion area (click to add vertices, double-click to close)
3. Save the mask
4. Return to **Plan** tab and generate again

Masks must be large enough: at least **0.5% of the 25 mm aperture** (~5 mm²) and **1% of total mask area** if there are multiple masks.

---

## 6. Coordinate Convention (for reference)

| Space | Origin | +y direction |
|-------|--------|--------------|
| **Top-left mm** (DB, frontend) | Image top-left | Down |
| **Center mm** (planner) | Image center | Up |

Conversion: `y_center = height_mm/2 - y_tl`
