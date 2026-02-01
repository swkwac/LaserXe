# Plan implementacji widoku Szczegóły obrazu (z zakładkami)

## 1. Przegląd

Widok **Szczegóły obrazu** to jeden ekran z czterema zakładkami: **Maski**, **Plan**, **Animacja**, **Historia iteracji**. Służy do pracy z jednym obrazem zmiany skórnej – od rysowania masek, przez generację i walidację planu zabiegowego, wizualizację i animację sekwencji emisji, po akceptację planu i przegląd historii wersji. Użytkownik wchodzi na niego z Listy obrazów (klik w kartę) lub bezpośrednio po Uploadzie (wtedy domyślnie otwarta zakładka **Maski**). Wspólny kontekst to `image_id` (z URL), dane obrazu (`ImageDto`), opcjonalnie wybrana iteracja (`iteration_id`) w zakładkach Plan i Animacja. Nawigacja: breadcrumb lub przycisk „Powrót do listy” → `/images`; przełączanie zakładek przez parametry URL `tab=masks|plan|animation|history` (bez zmiany `image_id`). Zgodnie z PRD i ui-plan: workflow liniowy (maski → plan → animacja → akceptacja), z możliwością cofania się (np. poprawa masek po obejrzeniu planu). Tryb demo: watermark, brak przycisku Akceptuj w zakładce Plan.

## 2. Routing widoku

- **Ścieżka:** `/images/[id]` (Astro: plik `src/pages/images/[id].astro`). Parametr dynamiczny `id` – identyfikator obrazu.
- **Parametr zakładki:** `tab` w query string: `tab=masks` | `tab=plan` | `tab=animation` | `tab=history`. Domyślnie (brak `tab` lub nieznana wartość): `tab=masks`. Wejście z uploadu: przekierowanie na `/images/{id}?tab=masks`.
- **Opcjonalnie:** `iteration` w query (np. `iteration=5`) – wybrana iteracja do wyświetlenia w Plan/Animacja; można ustawiać po wygenerowaniu lub z Historii (akcja „Pokaż”).
- Widok wymaga uwierzytelnienia. Przy 401/404 (obraz nie znaleziony lub nie należący do użytkownika) przekierowanie na `/login` lub `/images` z komunikatem.

## 3. Struktura komponentów

```
ImageDetailPage (strona Astro: /images/[id])
  └── Layout (breadcrumb: Lista obrazów > Szczegóły obrazu [id])
        └── ImageDetailView (React, client:load)
              ├── Nagłówek (tytuł obrazu, Powrót do listy, ewent. watermark gdy is_demo)
              ├── Tabs (Maski | Plan | Animacja | Historia iteracji) — sterowane przez tab z URL
              ├── TabPanel: Maski
              │     ├── CanvasWorkspace (obraz + overlay masek, narzędzia rysowania)
              │     ├── MaskList (lista masek z etykietami, akcje edycja/usuń)
              │     ├── WidthMmForm (edycja width_mm + ostrzeżenie)
              │     └── Alert (błędy API, np. maska <3% apertury)
              ├── TabPanel: Plan
              │     ├── PlanParamsForm (target_coverage_pct, coverage_per_mask)
              │     ├── Button „Generuj plan”
              │     ├── MetricsBlock (achieved/target, spots_count, spots_outside, overlap, plan_valid)
              │     ├── SpotsOverlay (opcjonalnie: punkty na obrazie)
              │     ├── ActionButtons (Akceptuj, Odrzuć) + Export (JSON, PNG, JPG, CSV)
              │     └── Alert (błędy, „Generowanie w toku”)
              ├── TabPanel: Animacja
              │     ├── AnimationCanvas (obraz + maski + punkty z gradientem + wózek)
              │     ├── AnimationControls (Play, Pause, Reset)
              │     ├── Legend (gradient kolejności, kolory masek)
              │     └── IterationSelect (wybór iteracji do wyświetlenia)
              └── TabPanel: Historia iteracji
                    ├── IterationTable (kolumny: data, status, pokrycie, spots_count, plan_valid)
                    ├── Filters (status, is_demo)
                    ├── Pagination
                    └── Akcje (Pokaż, Usuń dla draft)
```

- **ImageDetailPage** – strona Astro; odczytuje `id` z params, przekazuje do komponentu React; może odczytać `tab` z query i przekazać jako initialTab.
- **ImageDetailView** – kontener React: pobiera obraz (GET /api/images/{id}), udostępnia kontekst (imageId, image, selectedIterationId, isDemo?), renderuje Tabs i odpowiedni TabPanel w zależności od `tab`. Synchronizuje `tab` z URL (odczyt przy mount/change, zapis przy przełączeniu zakładki).
- Zakładki są osobnymi komponentami lub jednym komponentem z warunkowym renderowaniem treści panelu.

---

## 4. Szczegóły komponentów

### 4.1. Komponenty wspólne (widok)

#### ImageDetailPage (strona Astro)

- **Opis:** Strona dla `/images/[id]`. Przekazuje `id` (i opcjonalnie `tab`, `iteration` z query) do `ImageDetailView`. Layout z breadcrumb.
- **Główne elementy:** Layout, breadcrumb (Lista obrazów → Szczegóły obrazu), slot z `ImageDetailView` (client:load), przekazanie `id`, `tab`, `iteration` z URL.
- **Typy:** Brak. **Propsy:** — (id z route params).

#### ImageDetailView (komponent React)

- **Opis:** Główny kontener: pobiera `GET /api/images/{id}` przy mount/zmianie id; przy 404 przekierowuje na listę. Przechowuje w stanie (lub kontekście): `image`, `loading`, `error`; opcjonalnie `selectedIterationId` (z query lub po generacji). Renderuje nagłówek (tytuł, Powrót do listy), Tabs (wartość z URL), treść zakładki. Przy przełączeniu zakładki aktualizuje URL (`history.replaceState` lub router) bez przeładowania. Wyświetla watermark, gdy sesja/iteracja w trybie demo.
- **Główne elementy:** nagłówek, Tabs (Shadcn Tabs lub własne), TabPanel dla masks/plan/animation/history.
- **Obsługiwane zdarzenia:** zmiana zakładki → aktualizacja URL; Powrót do listy → nawigacja do `/images`.
- **Typy:** `ImageDto`; stan: image, loading, error, selectedTab, selectedIterationId.
- **Propsy:** `imageId: number`, `initialTab?: string`, `initialIterationId?: number`.

---

### 4.2. Zakładka „Maski”

#### TabPanel: Maski (MasksTab)

- **Opis:** Wyświetla obraz zmiany skórnej, listę masek (wielokąty) na overlayu, narzędzia do dodawania/edycji/usuwania masek, formularz edycji skali `width_mm` z ostrzeżeniem o unieważnieniu iteracji. CRUD masek przez API: GET/POST/PATCH/DELETE `/api/images/{image_id}/masks`. Komunikat przy odrzuceniu maski <3% apertury (400).
- **Główne elementy:** CanvasWorkspace (canvas lub SVG z obrazem + wielokąty masek, narzędzie rysowania/edycji), lista masek z etykietami i przyciskami Edytuj/Usuń, formularz width_mm (Input number, ostrzeżenie), Alert dla błędów.
- **Obsługiwane zdarzenia:** Rysowanie/edycja wielokąta (dodawanie wierzchołków, przesuwanie), zapis maski (POST/PATCH), usunięcie (DELETE), zmiana width_mm (PATCH /api/images/{id}), wyświetlanie błędów 400/422.
- **Walidacja:** vertices – min. 3 punkty; width_mm > 0. API: maska <3% apertury → 400; vertices nieprawidłowe → 422.
- **Typy:** `ImageDto`, `MaskDto`, `MaskListResponseDto`, `MaskCreateCommand`, `MaskUpdateCommand`, `MaskVertexDto`, `ImageUpdateCommand`.
- **Propsy:** `imageId: number`, `image: ImageDto`, `masks: MaskDto[]`, `onMasksChange: () => void` (refetch listy), `onImageUpdate: (image: ImageDto) => void`.

#### CanvasWorkspace (obszar roboczy)

- **Opis:** Renderuje obraz (z URL, np. z GET /api/images/{id}/file lub storage_path) oraz overlay masek (wielokąty w pikselach lub mm – skala z width_mm i wymiarów obrazu). W trybie edycji: rysowanie nowego wielokąta (klik dodaje wierzchołek, zamknięcie wielokąta), edycja istniejącego (przeciąganie wierzchołków), usuwanie. Kolory masek np. biały/zielony/niebieski (z mask_label lub paleta).
- **Główne elementy:** kontener (div), img (obraz), warstwa overlay (SVG lub canvas) z wielokątami, przyciski trybu (Dodaj maskę, Wybierz do edycji).
- **Typy:** `MaskDto`, `MaskVertexDto[]`; współrzędne mogą być w mm (API) lub w pikselach (mapowanie przez skale).
- **Propsy:** `imageUrl: string`, `widthMm: number`, `imageWidthPx: number`, `imageHeightPx: number`, `masks: MaskDto[]`, `onSaveMask: (vertices, label?) => void`, `onUpdateMask: (maskId, vertices, label?) => void`, `onDeleteMask: (maskId) => void`.

#### WidthMmForm

- **Opis:** Pole numeryczne width_mm, przycisk „Zapisz”. Ostrzeżenie: „Zmiana skali unieważnia istniejące iteracje (metryki będą nieaktualne).” Przy zapisie: PATCH /api/images/{id} z body { width_mm }.
- **Walidacja:** width_mm > 0. **Typy:** `ImageDto`, `ImageUpdateCommand`. **Propsy:** `image: ImageDto`, `onSave: (width_mm: number) => void`.

---

### 4.3. Zakładka „Plan”

#### TabPanel: Plan (PlanTab)

- **Opis:** Formularz parametrów planu (target_coverage_pct 3–20%, opcjonalnie coverage_per_mask), przycisk „Generuj plan”, blok metryk (zawsze w tym samym miejscu, wypełniany po generacji), opcjonalnie overlay punktów na obrazie, przyciski Akceptuj/Odrzuć, przyciski eksportu (JSON, PNG, JPG, CSV – CSV tylko gdy plan wygenerowany). Stan „Generowanie w toku” blokuje edycję. W trybie demo: watermark, brak przycisku Akceptuj. Tooltip: „Te same wejścia → ten sam wynik” (deterministyczność).
- **Główne elementy:** PlanParamsForm, Button „Generuj plan”, MetricsBlock, SpotsOverlay (opcjonalnie), ActionButtons (Akceptuj, Odrzuć), ExportButtons (JSON, PNG, JPG, CSV), Alert (błędy, „Generowanie w toku”).
- **Obsługiwane zdarzenia:** Zmiana target_coverage_pct / coverage_per_mask; klik „Generuj plan” → POST /api/images/{image_id}/iterations; po 201 ustawienie wybranej iteracji i wyświetlenie metryk. Akceptuj → PATCH /api/iterations/{id} status=accepted (tylko gdy plan_valid i !is_demo). Odrzuć → PATCH status=rejected. Eksport → GET /api/iterations/{id}/export?format=json|png|jpg lub GET /api/iterations/{id}/spots?format=csv.
- **Walidacja:** target_coverage_pct w zakresie 3–20. Akceptuj: disabled gdy !plan_valid lub is_demo. API: 400 gdy brak masek ≥3% apertury; 400 przy Akceptuj gdy plan invalid lub demo.
- **Typy:** `IterationDto`, `IterationCreateCommand`, `IterationUpdateCommand`, `IterationParamsSnapshotDto`, `CoveragePerMaskDto`, `SpotDto[]`, `ExportQueryCommand`.
- **Propsy:** `imageId: number`, `image: ImageDto`, `selectedIteration: IterationDto | null`, `onIterationSelected: (id) => void`, `isDemo?: boolean`, `onGenerate: (cmd) => Promise<IterationDto>`, `onAccept: (id) => void`, `onReject: (id) => void`.

#### PlanParamsForm

- **Opis:** Input number target_coverage_pct (min 3, max 20, step 0.5 lub 1). W trybie wielomaskowym: tabela/mapa mask_id → % pokrycia (3–20). Checkbox lub flaga is_demo (jeśli użytkownik może generować w trybie demo z tego widoku).
- **Typy:** `IterationCreateCommand`. **Propsy:** `value: IterationCreateCommand`, `onChange: (cmd: IterationCreateCommand) => void`, `disabled?: boolean`.

#### MetricsBlock

- **Opis:** Wyświetla: target_coverage_pct, achieved_coverage_pct, spots_count, spots_outside_mask_count, overlap_count, plan_valid (tak/nie). Tekst zachęty przy plan_valid=0 (np. „Plan niepoprawny – skoryguj parametry lub maski”).
- **Typy:** `IterationDto` (metryki). **Propsy:** `iteration: IterationDto | null`.

#### ActionButtons / ExportButtons

- **Opis:** Akceptuj (disabled gdy !plan_valid lub is_demo), Odrzuć. Eksport: przyciski JSON, PNG, JPG, CSV (CSV aktywny tylko gdy jest wygenerowana iteracja ze spotami). Eksport = pobranie pliku (fetch z odpowiednim Accept lub format, zapis do blob, download).
- **Propsy:** `iteration: IterationDto | null`, `isDemo: boolean`, `onAccept`, `onReject`, `onExport: (format) => void`.

---

### 4.4. Zakładka „Animacja”

#### TabPanel: Animacja (AnimationTab)

- **Opis:** Wizualizacja sekwencji emisji: overlay obrazu, masek i punktów (spoty) z gradientem koloru według indeksu w sekwencji; opcjonalnie linie średnic co 5°. Kontrolki Play, Pause, Reset. Animacja: czerwona kropka (wózek), płynny ruch wzdłuż średnic, zatrzymanie + „flash” przy emisji, obrót zajmuje czas. Legenda: zakres gradientu kolejności, kolory masek. Dane spotów: GET /api/iterations/{id}/spots (cache w stanie komponentu lub kontekście).
- **Główne elementy:** AnimationCanvas (obraz + maski + punkty + wózek), AnimationControls (Play, Pause, Reset), Legend, wybór iteracji (select/list) jeśli kilka draftów.
- **Obsługiwane zdarzenia:** Wybór iteracji → pobranie spotów (GET /api/iterations/{id}/spots); Play/Pause/Reset → sterowanie animacją (requestAnimationFrame lub timer, przesuwanie wózka według sequence_index).
- **Typy:** `SpotDto[]`, `IterationSpotsResponseDto`, `IterationDto`.
- **Propsy:** `imageId: number`, `image: ImageDto`, `masks: MaskDto[]`, `iterations: IterationDto[]`, `selectedIterationId: number | null`, `onSelectIteration: (id) => void`, `spots: SpotDto[]` (lub pobierane wewnątrz po selectedIterationId).

#### AnimationCanvas

- **Opis:** Renderuje obraz, maski, punkty (kolor z gradientu od indeksu), wózek (czerwona kropka) w pozycji aktualnego spotu. Animacja: interpolacja pozycji wózka między spotami, „flash” przy emisji. Czas trwania poglądowy (np. 5 s).
- **Typy:** `SpotDto[]`, współrzędne w mm (skalowanie do pikseli). **Propsy:** `imageUrl`, `masks`, `spots`, `currentIndex: number`, `playing: boolean`, `onComplete?: () => void`.

#### AnimationControls, Legend

- **Opis:** Przyciski Play, Pause, Reset; legenda (kolory masek, zakres gradientu 0..N spotów). **Propsy:** `playing`, `onPlay`, `onPause`, `onReset`; dla Legend: `spotsCount`, `maskLabels`.

---

### 4.5. Zakładka „Historia iteracji”

#### TabPanel: Historia iteracji (HistoryTab)

- **Opis:** Lista/tabela iteracji dla obrazu: GET /api/images/{image_id}/iterations z paginacją i filtrami (status, is_demo). Kolumny: data (created_at), status (draft/accepted/rejected), is_demo, pokrycie zadane/osiągnięte, spots_count, plan_valid. Akcje: „Pokaż” (przejście do Plan lub Animacja z wybraną iteracją – ustawienie selectedIterationId i ewentualnie tab=plan lub tab=animation), „Usuń” tylko dla draft (DELETE /api/iterations/{id}).
- **Główne elementy:** IterationTable (tabela), filtry (status, is_demo), Pagination, przyciski Pokaż, Usuń (draft).
- **Obsługiwane zdarzenia:** Zmiana filtrów/strony → ponowne GET iterations. Pokaż → callback z iterationId + przełączenie zakładki. Usuń → DELETE, potem refetch listy.
- **Walidacja:** Usuń tylko dla status=draft; API zwraca 400 dla accepted/rejected.
- **Typy:** `IterationDto`, `IterationListResponseDto`, `IterationListQueryCommand`.
- **Propsy:** `imageId: number`, `iterations: IterationDto[]`, `total: number`, `page: number`, `pageSize: number`, `onPageChange`, `onFilterChange`, `onShow: (iterationId: number) => void`, `onDelete: (iterationId: number) => void`.

---

## 5. Typy

Wykorzystywane istniejące typy z `src/types.ts`:

- **Obraz:** `ImageDto`, `ImageUpdateCommand`.
- **Maski:** `MaskDto`, `MaskListResponseDto`, `MaskCreateCommand`, `MaskUpdateCommand`, `MaskVertexDto`.
- **Iteracje:** `IterationDto`, `IterationListResponseDto`, `IterationCreateCommand`, `IterationUpdateCommand`, `IterationListQueryCommand`, `IterationParamsSnapshotDto`, `CoveragePerMaskDto`, `PlanIterationEntityDto["status"]`.
- **Spoty:** `SpotDto`, `IterationSpotsResponseDto`, `SpotListQueryCommand`.
- **Eksport:** `ExportQueryCommand`, `IterationExportJsonDto` (dla format=json).
- **Stronnicowanie:** `PagedResultDto<T>`.

**ViewModel / stan widoku (opcjonalnie w kontekście):**

- `image: ImageDto | null`
- `selectedTab: "masks" | "plan" | "animation" | "history"`
- `selectedIterationId: number | null`
- `isDemo: boolean` (z sesji lub z wybranej iteracji)
- Per zakładka: listy masek, iteracji, spotów – pobierane przez komponenty lub kontekst.

Nowe typy globalne nie są wymagane; ewentualnie alias dla wartości zakładki: `type ImageDetailTab = "masks" | "plan" | "animation" | "history"`.

---

## 6. Zarządzanie stanem

- **Kontekst wspólny (ImageDetailContext):** imageId (z URL), image (ImageDto | null), loading/error dla obrazu, selectedTab (zsynchronizowany z URL), selectedIterationId (z query lub ustawiany po generacji/wyborze z Historii), isDemo (z sesji lub z bieżącej iteracji). Dostarczenie: React Context lub przekazywanie propsów w dół.
- **Zakładka Maski:** Lista masek w stanie lokalnym lub w kontekście; pobieranie GET /api/images/{id}/masks przy wejściu na zakładkę lub przy imageId. Po POST/PATCH/DELETE maski – refetch listy.
- **Zakładka Plan:** Wybrana iteracja (selectedIterationId), metryki z obiektu iteracji. Stan generowania: isGenerating (blokada UI). Po POST iterations (Generuj plan) – zapis nowej iteracji w stanie, ustawienie selectedIterationId.
- **Zakładka Animacja:** Lista iteracji (do wyboru), spoty dla wybranej iteracji – GET /api/iterations/{id}/spots; cache w stanie (klucz: iterationId). Stan animacji: currentIndex, playing.
- **Zakładka Historia:** Lista iteracji z paginacją i filtrami; stan: items, total, page, page_size, loading.
- **Synchronizacja z URL:** Przy zmianie zakładki: `?tab=masks|plan|animation|history`. Przy wyborze iteracji (Plan/Animacja/Historia): opcjonalnie `?iteration=5`. Odczyt przy mount i przy popstate (back/forward).

---

## 7. Integracja API

| Akcja | Metoda | Endpoint | Typ żądania / odpowiedzi |
|-------|--------|----------|---------------------------|
| Pobranie obrazu | GET | /api/images/{id} | 200: ImageDto |
| Aktualizacja skali | PATCH | /api/images/{id} | body: { width_mm }; 200: ImageDto |
| Lista masek | GET | /api/images/{image_id}/masks | 200: MaskListResponseDto |
| Utworzenie maski | POST | /api/images/{image_id}/masks | body: MaskCreateCommand; 201: MaskDto |
| Aktualizacja maski | PATCH | /api/images/{image_id}/masks/{mask_id} | body: MaskUpdateCommand; 200: MaskDto |
| Usunięcie maski | DELETE | /api/images/{image_id}/masks/{mask_id} | 204 |
| Lista iteracji | GET | /api/images/{image_id}/iterations | query: page, page_size, status, is_demo; 200: IterationListResponseDto |
| Generacja iteracji | POST | /api/images/{image_id}/iterations | body: IterationCreateCommand; 201: IterationDto |
| Pobranie iteracji | GET | /api/iterations/{id} | 200: IterationDto |
| Spoty iteracji | GET | /api/iterations/{id}/spots | query: format=json|csv; 200: IterationSpotsResponseDto lub CSV |
| Akceptacja/odrzucenie | PATCH | /api/iterations/{id} | body: { status: "accepted"|"rejected" }; 200: IterationDto |
| Usunięcie iteracji | DELETE | /api/iterations/{id} | 204 (tylko draft) |
| Eksport | GET | /api/iterations/{id}/export | query: format=json|png|jpg; 200: JSON lub binary image |

**Uwaga CSV:** Eksport CSV sekwencji: GET /api/iterations/{id}/spots?format=csv (Content-Type text/csv). Pobranie pliku po stronie klienta (fetch, blob, link download).

---

## 8. Interakcje użytkownika

- **Przełączenie zakładki:** Klik w zakładkę → aktualizacja URL (`tab=...`), render odpowiedniego panelu. Bez przeładowania strony.
- **Maski:** Rysowanie wielokąta → zapis (POST masks); edycja → PATCH; usunięcie → DELETE. Edycja width_mm → PATCH image; ostrzeżenie przed zapisem. Błąd 400 (maska <3%) → komunikat pod formularzem/canvasem.
- **Plan:** Ustawienie target_coverage_pct (i coverage_per_mask) → klik „Generuj plan” → stan „Generowanie w toku” → po 201 wyświetlenie metryk, ustawienie wybranej iteracji. Akceptuj (gdy plan_valid i !is_demo) → PATCH status=accepted. Odrzuć → PATCH status=rejected. Eksport → pobranie pliku w wybranym formacie.
- **Animacja:** Wybór iteracji (jeśli kilka) → pobranie spotów; Play → odtwarzanie animacji; Pause/Reset → zatrzymanie/reset.
- **Historia:** Filtry (status, is_demo), strona → odświeżenie listy. Pokaż → ustawienie selectedIterationId, przełączenie na zakładkę Plan lub Animacja. Usuń (draft) → DELETE, odświeżenie listy.
- **Powrót do listy:** Link/button „Powrót do listy” → nawigacja do `/images`.

---

## 9. Warunki i walidacja

- **Obraz:** 404 lub nie należący do użytkownika → przekierowanie na listę lub login. Strona nie renderuje treści bez poprawnego obrazu.
- **Maski:** vertices min. 3 punkty; API 400 przy masce <3% apertury – UI wyświetla komunikat. width_mm > 0 przy PATCH.
- **Plan:** target_coverage_pct 3–20. Generacja: API 400 gdy brak masek ≥3% apertury – komunikat. Akceptuj: przycisk disabled gdy plan_valid=0 lub is_demo=1; API 400 przy próbie akceptacji w tych przypadkach.
- **Animacja:** Spoty pobierane tylko dla iteracji należącej do obrazu użytkownika (API 404 inaczej).
- **Historia:** Usuń tylko dla status=draft; API 400 dla accepted/rejected – UI nie pokazuje Usuń dla nie-draft lub obsługuje 400 komunikatem.

---

## 10. Obsługa błędów

- **401:** Globalna obsługa – wylogowanie, przekierowanie na /login.
- **404 (obraz/iteracja):** Komunikat „Obraz nie znaleziony” / „Iteracja nie znaleziona”; przekierowanie na `/images` lub odświeżenie zakładki.
- **400 (maska <3% apertury):** Komunikat z API detail (np. „Maska poniżej 3% apertury – odrzucona”) w zakładce Maski.
- **400 (brak masek przy generacji):** „Obraz nie ma masek powyżej 3% apertury” w zakładce Plan.
- **400 (akceptacja przy invalid/demo):** „Plan nie może być zaakceptowany: niepoprawny lub tryb demo” – przycisk Akceptuj i tak disabled w UI.
- **422:** Walidacja (vertices, width_mm, target_coverage_pct) – wyświetlenie szczegółów z odpowiedzi.
- **Generowanie w toku:** Blokada edycji, przycisk „Generuj” w stanie loading, komunikat „Generowanie w toku”. Przy błędzie sieci/5xx – komunikat i odblokowanie.

---

## 11. Kroki implementacji

1. **Strona Astro i routing:** Utworzyć `src/pages/images/[id].astro`. Odczyt `id` z `Astro.params`, opcjonalnie `tab`, `iteration` z `Astro.url.searchParams`. Przekazanie do `ImageDetailView` (client:load). Layout z breadcrumb (Lista obrazów → Szczegóły obrazu [id]).
2. **Komponent ImageDetailView:** Kontener z kontekstem (lub propsami): imageId, image, selectedTab, selectedIterationId. Efekt: przy mount i zmianie imageId wywołać GET /api/images/{id}; przy 404 przekierować na /images. Render Tabs (wartość z URL); przy zmianie zakładki aktualizować URL. Render warunkowy paneli: MasksTab, PlanTab, AnimationTab, HistoryTab.
3. **Synchronizacja tab z URL:** Odczyt `tab` z window.location.search przy mount; przy kliku w zakładkę: `history.replaceState` + setState lub router. Domyślna zakładka przy braku `tab`: masks.
4. **Zakładka Maski:** Komponent MasksTab – pobranie GET /api/images/{id}/masks; CanvasWorkspace (obraz + overlay masek, narzędzia rysowania wielokątów); lista masek z przyciskami Edytuj/Usuń; WidthMmForm (PATCH image). Obsługa POST/PATCH/DELETE masek i błędów 400/422.
5. **Zakładka Plan:** PlanParamsForm (target_coverage_pct 3–20, opcjonalnie coverage_per_mask). Przycisk „Generuj plan” → POST /api/images/{id}/iterations; stan isGenerating; po 201 zapis iteracji, wyświetlenie MetricsBlock. Przyciski Akceptuj (disabled gdy !plan_valid lub is_demo), Odrzuć. Przyciski eksportu: fetch GET /api/iterations/{id}/export?format=json|png|jpg i GET .../spots?format=csv, zapis blob, download. Tooltip deterministyczności. Watermark gdy is_demo.
6. **Zakładka Animacja:** Pobranie listy iteracji (GET /api/images/{id}/iterations) lub użycie z kontekstu. Select iteracji → GET /api/iterations/{id}/spots. AnimationCanvas z obrazem, maskami, punktami (gradient po sequence_index), wózek (czerwona kropka). Logika animacji: timer/requestAnimationFrame, currentIndex, interpolacja pozycji. Kontrolki Play, Pause, Reset. Legenda.
7. **Zakładka Historia:** GET /api/images/{id}/iterations z query (page, page_size, status, is_demo). Tabela: created_at, status, target/achieved coverage, spots_count, plan_valid. Filtry, paginacja. Przycisk Pokaż → ustawienie selectedIterationId + tab=plan lub tab=animation. Przycisk Usuń (tylko draft) → DELETE, refetch.
8. **Wspólny nagłówek i watermark:** W ImageDetailView: tytuł „Szczegóły obrazu – [id]” lub „Obraz [id]”; link „Powrót do listy”. Gdy is_demo: watermark (np. nakładka lub tekst „Tryb demo”) na canvas lub w nagłówku.
9. **Testy ręczne:** Wejście z listy i z uploadu (tab=masks). CRUD masek, zmiana width_mm, błąd 400 maska <3%. Generacja planu, metryki, Akceptuj/Odrzuć (w tym blokada w demo). Eksport JSON/PNG/JPG/CSV. Animacja play/pause/reset. Historia: filtry, Pokaż, Usuń draft. 404 obrazu – przekierowanie.
10. **Dokumentacja:** Zaktualizować listę widoków: Szczegóły obrazu (4 zakładki) – zaimplementowane według niniejszego planu; wejście z uploadu z tab=masks.
