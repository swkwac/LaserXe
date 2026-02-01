# Kolejne 3 kroki implementacji (zgodnie z PRD i ui-plan)

**Data:** 2026-01-31  
**Kontekst:** Po wdrożeniu zakładki Maski (canvas, rysowanie masek, POST/DELETE) oraz zakładki Animacja (canvas obraz+maski+spoty, gradient, Play/Pause/Reset, wybór iteracji, legenda).

**Status:** Kroki 1–9 zrealizowane. Kolejne 3 kroki (10–12) opisane poniżej.

---

## Zrealizowane w tej sesji (wcześniej)

1. **Backend:** `GET /api/images/{id}/file` – serwowanie pliku obrazu (FileResponse) z weryfikacją uprawnień.
2. **Zakładka Maski:** `CanvasWorkspace` – obraz + overlay masek (SVG), rysowanie wielokąta (klik → punkty, „Zakończ rysowanie” → POST maski), lista masek z przyciskiem Usuń (DELETE). Obsługa błędów 400 (maska <3% apertury).
3. **Zakładka Animacja:** canvas z obrazem, maskami i spotami; kolory punktów wg gradientu kolejności (sequence_index); czerwona kropka (wózek) na bieżącym punkcie; kontrolki Odtwórz / Wstrzymaj / Reset; wybór iteracji (select); legenda „Kolejność: 0 → N”; animacja ok. 5 s przez całą sekwencję.

---

## Krok 1: Eksport obrazu z overlayem (PNG/JPG) ✅ ZROBIONE

**Źródło:** PRD §3.9 (Eksport obrazu z overlayem), ui-plan §5 (Eksport PNG/JPG), api-plan §2.6 (`GET /api/iterations/{id}/export?format=png|jpg`).

**Zrealizowano:** Backend: `_render_export_image` (Pillow) – obraz + maski (wielokąty) + spoty (kółka); `GET /api/iterations/{id}/export?format=png|jpg` zwraca FileResponse. Frontend (PlanTab): przyciski „Eksport PNG” i „Eksport JPG”.

**Zadania:**

1. **Backend:** Implementacja `GET /api/iterations/{id}/export` dla `format=png` i `format=jpg`:
   - Pobranie obrazu (image_id z iteracji), masek i spotów (jak przy JSON).
   - Wygenerowanie obrazu z overlayem (np. biblioteka Pillow): obraz bazowy + półprzezroczyste wielokąty masek + kółka spotów (gradient lub jeden kolor).
   - Zwrócenie `FileResponse` z `Content-Type: image/png` lub `image/jpeg` oraz nagłówkiem `Content-Disposition: attachment; filename=...`.

2. **Frontend (PlanTab):** Przyciski „Eksport PNG” i „Eksport JPG” (obecnie tylko „Eksport JSON” i „Pobierz CSV”) – wywołanie `GET /api/iterations/{id}/export?format=png` (lub jpg) i pobranie pliku (jak przy JSON/CSV).

**Kryteria:** Użytkownik może pobrać wizualizację iteracji (obraz + maski + punkty) w formacie PNG lub JPG.

---

## Krok 2: Watermark trybu demo ✅ ZROBIONE

**Źródło:** PRD §3.10 (Tryb demo z watermarkiem), ui-plan §5 (Watermark trybu demo – widoczny w trybie demo na canvas lub w nagłówku), US-013.

**Zrealizowano:** Wykrywanie trybu demo z URL (`?demo=1`) i sessionStorage (`laserxe_demo`). Nagłówek widoku Szczegóły obrazu: badge „Tryb demo” (amber). Lista obrazów: przy wejściu z `?demo=1` ustawiane sessionStorage; linki do szczegółów z `?demo=1`. Canvas (Maski, Animacja): półprzezroczysta nakładka „DEMO” na środku.

**Zadania:**

1. **ImageDetailView (lub Layout):** Wykrywanie trybu demo – np. z sesji (parametr `demo=1` w URL po „Tryb demo” na logowaniu) lub z wybranej iteracji (`selectedIteration?.is_demo === 1`). Przekazanie flagi `isDemo: boolean` w dół (np. kontekst lub props).

2. **Nagłówek widoku Szczegóły obrazu:** Gdy `isDemo === true` – wyświetlenie wyraźnej etykiety/nakładki „Tryb demo” (np. pasek u góry lub badge przy tytule), w spójnym stylu (np. pomarańczowy/żółty, czytelny tekst).

3. **Opcjonalnie:** Na canvas (Maski / Animacja) – półprzezroczysta nakładka z tekstem „DEMO” (np. ukośny watermark na środku), aby zrzuty ekranu były jednoznacznie oznaczone.

**Kryteria:** W trybie demo użytkownik zawsze widzi oznaczenie „Tryb demo” w nagłówku (i opcjonalnie na canvas).

---

## Krok 3: Edycja masek (przeciąganie wierzchołków) ✅ ZROBIONE

**Źródło:** Plan implementacji widoku Szczegóły obrazu §4.2 (CanvasWorkspace – „edycja istniejącego (przeciąganie wierzchołków)”), ui-plan §2.4 (panel narzędzi do dodawania/edycji/usuwania masek).

**Zrealizowano:** CanvasWorkspace: tryb edycji (`editingMaskId`), wierzchołki jako kółka (przeciąganie), przyciski „Zapisz zmiany” i „Anuluj edycję”. W liście masek: przycisk „Edytuj”. PATCH `/api/images/{id}/masks/{mask_id}` z `vertices` (i zachowaniem `mask_label`).

**Zadania:**

1. **CanvasWorkspace:** Tryb „Wybierz do edycji” – po wyborze maski z listy (lub kliknięciu w maskę na canvas) wyświetlenie wierzchołków jako małych kółek/kwadratów na SVG. Przeciąganie (drag) wierzchołka aktualizuje lokalny stan; przycisk „Zapisz” lub auto-zapis po puszczeniu wywołuje `PATCH /api/images/{image_id}/masks/{mask_id}` z `vertices` w mm (konwersja px→mm jak przy zapisie nowej maski).

2. **API:** `PATCH` jest już zaimplementowane w backendzie – wystarczy przekazać zaktualizowane `vertices` (i opcjonalnie `mask_label`).

3. **UX:** W liście masek – przycisk „Edytuj” obok „Usuń”; po wejściu w edycję podświetlenie wybranej maski i włączone przeciąganie wierzchołków; walidacja min. 3 punkty przed zapisem; obsługa błędu 400 (maska <3% apertury) jak przy tworzeniu.

**Kryteria:** Użytkownik może wybrać maskę, przeciągnąć jej wierzchołki i zapisać zmiany przez PATCH; błędy walidacji są wyświetlane.

---

## Podsumowanie

| Krok | Temat                         | Status   |
|------|-------------------------------|----------|
| 1    | Eksport PNG/JPG               | ✅       |
| 2    | Watermark trybu demo          | ✅       |
| 3    | Edycja masek (PATCH)          | ✅       |
| 4    | Audit log (lista + frontend)  | ✅       |
| 5    | Linie średnic co 5° (Animacja)| ✅       |
| 6    | Overlay punktów (Plan)       | ✅       |
| 7    | Zapis do audit_log (backend) | ✅       |
| 8    | Flash emisji w animacji      | ✅       |
| 9    | Audit „dla tego obrazu”      | ✅       |
| 10   | Krótkie zatrzymanie przy emisji | ✅       |
| 11   | Algorytm generacji planu (siatka + spoty) | ✅       |
| 12   | parent_id przy tworzeniu iteracji | ✅       |

---

## Kroki 4–6 (zrealizowane w tej sesji)

### Krok 4: Audit log (lista wpisów audytu) ✅ ZROBIONE

**Zrealizowano:** Backend: `GET /api/audit-log` i `GET /api/iterations/{id}/audit-log` (już wcześniej). Frontend: nowa zakładka „Audit log” w widoku Szczegóły obrazu (`AuditLogTab`) – lista wpisów z filtrami (typ zdarzenia, od/do daty), paginacja; gdy wybrana jest iteracja – filtrowanie po tej iteracji (`iterationIdFilter`).

---

### Krok 5: Linie średnic co 5° w zakładce Animacja ✅ ZROBIONE

**Zrealizowano:** W `AnimationTab` checkbox „Linie średnic co 5°”; po włączeniu rysowane są linie od środka obrazu (apertura 12,5 mm) co 5° (0°, 5°, … 175°) w kolorze `rgba(100,150,255,0.4)` na SVG overlay.

---

### Krok 6: Overlay punktów (spotów) w zakładce Plan ✅ ZROBIONE

**Zrealizowano:** W `PlanTab` przy wybranej iteracji: blok „Podgląd planu (overlay punktów)” – obraz z API file + maski + spoty (kółka) w jednym kolorze, bez animacji; pobieranie obrazu, masek i spotów w jednym `useEffect`.

---

## Kroki 7–9 (zrealizowane w tej sesji)

### Krok 7: Zapis do audit_log przy zdarzeniach (backend) ✅ ZROBIONE

**Zrealizowano:** W `iteration_by_id.update_iteration`: po ustawieniu statusu `accepted` – `INSERT INTO audit_log (iteration_accepted)`; po `rejected` – `INSERT (iteration_rejected)`. W `iterations.create_iteration`: po utworzeniu iteracji – `INSERT (iteration_created)` oraz `INSERT (plan_generated)` z payloadem `target_coverage_pct`. Router `audit_log` dodany do `main.py` (`/api/audit-log`).

---

### Krok 8: Flash emisji w animacji (PRD §3.7) ✅ ZROBIONE

**Zrealizowano:** W `AnimationTab`: podczas odtwarzania (`playing`) rysowane jest dodatkowe kółko (żółte, większy promień) z animacją CSS `emission-flash` (opacity 0.85→0 w 0.2 s); `key={flash-${currentIndex}}` powoduje ponowne odtworzenie animacji przy każdej zmianie punktu. W `global.css` dodane `@keyframes emission-flash`.

---

### Krok 9: Filtrowanie audytu „dla tego obrazu” ✅ ZROBIONE

**Zrealizowano:** Backend: `GET /api/images/{id}/audit-log` w `images.py` – lista wpisów dla iteracji danego obrazu (JOIN audit_log + plan_iterations, filtrowanie po image_id i created_by), paginacja i filtry (event_type, from, to, sort, order). Frontend: w `AuditLogTab` prop `imageId`; checkbox „Tylko ten obraz” – gdy zaznaczony wywołanie `/api/images/{imageId}/audit-log` zamiast globalnego audytu. `ImageDetailView` przekazuje `imageId` do `AuditLogTab`.

---

## Kroki 10–12 (zrealizowane)

### Krok 10: Krótkie zatrzymanie przy emisji (animacja) ✅ ZROBIONE

**Zrealizowano:** W `AnimationTab` zmieniono timer animacji: `pauseAtEmissionMs = 100`, `baseStepMs = max(20, (durationMs - spots.length * pauseAtEmissionMs) / spots.length)`, `stepMs = baseStepMs + pauseAtEmissionMs`. Każdy krok ma ok. 100 ms „zatrzymania” przy emisji (spójnie z flashem).

---

### Krok 11: Algorytm generacji planu (siatka + sekwencja + spoty) ✅ ZROBIONE

**Zrealizowano:** Nowy moduł `app/services/plan_grid.py`: apertura 12,5 mm, spot 0,3 mm, średnice co 5° (0°, 355°, 350°, …, 5° – zgodnie z ruchem wskazówek zegara); centroid masek jako środek (fallback: środek obrazu); clip linii do wielokąta, rozmieszczenie punktów ze spacingiem z target coverage; sekwencja: sort po (diameter_index_clockwise, -t). W `iterations.create_iteration`: ładowanie masek z DB (`_load_masks_for_plan`), wywołanie `generate_plan`, INSERT spotów do `spots`, UPDATE `plan_iterations` (metryki, plan_valid), wpisy audit (iteration_created, plan_generated, fallback_used). Zgodne z opisem z pliku „succesful point and animation algorythm.txt”.

---

### Krok 12: parent_id przy tworzeniu iteracji (wersjonowanie) ✅ ZROBIONE

**Zrealizowano:** W `iterations.create_iteration` przed INSERT pobierana jest ostatnia iteracja obrazu (`SELECT id FROM plan_iterations WHERE image_id = ? ORDER BY created_at DESC LIMIT 1`); jej `id` przekazywane jest jako `parent_id` w INSERT (gdy brak – NULL).
