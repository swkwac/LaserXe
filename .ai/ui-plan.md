# Architektura UI dla laserme 2.0a (LaserXe)

## 1. Przegląd struktury UI

Interfejs użytkownika realizuje **liniowy workflow kliniczny**: od logowania, przez upload i skalowanie obrazu zmiany skórnej, rysowanie masek, generację planu zabiegowego, wizualizację i animację sekwencji emisji, po akceptację planu lub tworzenie nowej iteracji. Główną strukturą ekranową jest **widok „Szczegóły obrazu”** z zakładkami (Maski → Plan → Animacja → Historia iteracji), który porządkuje kroki workflow i zapewnia spójny kontekst (jeden obraz, jego maski i iteracje). Ekran logowania stanowi bramę do aplikacji; opcjonalna lista obrazów umożliwia wybór istniejącego obrazu lub upload nowego. Tryb demo jest dostępny z ekranu logowania i oznacza wszystkie generowane plany jako niedostępne do akceptacji klinicznej (watermark, brak przycisku Akceptuj). Architektura jest zgodna z REST API (obrazy, maski, iteracje, spoty, eksport) oraz z decyzjami z sesji planowania (zakładki, przekierowanie po uploadzie, metryki walidacji, blokada edycji podczas generacji).

---

## 2. Lista widoków

### 2.1. Logowanie

| Aspekt | Opis |
|--------|------|
| **Ścieżka** | `/login` (lub `/` jako domyślna dla niezalogowanych) |
| **Główny cel** | Uwierzytelnienie użytkownika klinicznego; wejście do aplikacji lub wejście w tryb demo. |
| **Kluczowe informacje** | Formularz: login, hasło; opcjonalnie informacja o domyślnych danych MVP (user/123); przycisk „Tryb demo” ustawiający `is_demo=true` w sesji. |
| **Kluczowe komponenty** | Formularz logowania (pola login, hasło, przycisk Zaloguj), przycisk „Tryb demo”, komunikaty błędów (np. „Nieprawidłowy login lub hasło” z API 401). |
| **UX, dostępność, bezpieczeństwo** | UX: czytelne etykiety, jeden główny CTA (Zaloguj); Tryb demo wyraźnie oddzielony (np. link lub przycisk drugorzędny). Dostępność: obsługa klawiatury (Tab, Enter), powiązanie etykiet z polami, komunikaty błędów powiązane z formularzem. Bezpieczeństwo: brak eksponowania haseł w URL; po zalogowaniu przekierowanie do listy obrazów lub szczegółów obrazu; reakcja na 401 (wygasła sesja) – przekierowanie z powrotem na logowanie z komunikatem. |

---

### 2.2. Lista obrazów

| Aspekt | Opis |
|--------|------|
| **Ścieżka** | `/images` (lub `/` po zalogowaniu) |
| **Główny cel** | Przegląd obrazów użytkownika, wybór obrazu do edycji, inicjacja uploadu nowego obrazu. |
| **Kluczowe informacje** | Lista/karta obrazów (np. miniatura, width_mm, data utworzenia); paginacja (page, page_size); przycisk „Dodaj obraz” / „Upload”. |
| **Kluczowe komponenty** | Lista lub siatka kart obrazów, przycisk uploadu, paginacja, ewentualnie pusty stan („Brak obrazów – wgraj pierwszy”). |
| **UX, dostępność, bezpieczeństwo** | UX: szybki dostęp do ostatnich obrazów; po kliknięciu w obraz – przejście do Szczegóły obrazu. Dostępność: nawigacja klawiaturowa po elementach listy, sensowne etykiety dla akcji. Bezpieczeństwo: wyświetlane tylko obrazy `created_by` = bieżący użytkownik (API filtruje); przy 401 wylogowanie i przekierowanie na login. |

---

### 2.3. Upload obrazu (krok w workflow)

| Aspekt | Opis |
|--------|------|
| **Ścieżka** | Może być modal lub dedykowana strona `/images/new`; po udanym uploadzie zawsze przekierowanie na `/images/{id}` z aktywną zakładką **Maski**. |
| **Główny cel** | Wgranie pliku PNG/JPG i podanie szerokości zmiany w mm (skala). |
| **Kluczowe informacje** | Pole pliku (akceptowane typy PNG, JPG), pole numeryczne `width_mm` (w mm); walidacja w UI (tylko PNG/JPG) oraz obsługa błędów API (400 – nieobsługiwany typ, 422 – brak/invalid pola). |
| **Kluczowe komponenty** | Input file, input number (width_mm), przycisk „Wgraj” / „Zapisz”; komunikaty błędów z API. |
| **UX, dostępność, bezpieczeństwo** | UX: zgodnie z sesją – po zapisie przekierowanie do Szczegóły obrazu, zakładka Maski (bezpośrednie przejście do rysowania masek). Dostępność: etykiety, komunikaty błędów. Bezpieczeństwo: wysyłka przez `POST /api/images` (multipart); wymagana sesja. |

---

### 2.4. Szczegóły obrazu – zakładka „Maski”

| Aspekt | Opis |
|--------|------|
| **Ścieżka** | `/images/{id}` z parametrem/stanem zakładki `tab=masks` (domyślnie po wejściu z uploadu). |
| **Główny cel** | Wyświetlenie obrazu zmiany skórnej, rysowanie i edycja masek (wielokąty), ustawienie/edycja skali (width_mm). |
| **Kluczowe informacje** | Obraz (z API, np. URL do storage_path); lista masek (vertices, mask_label); edytowalna skala `width_mm` z ostrzeżeniem, że zmiana unieważnia iteracje; komunikaty o odrzuceniu masek <3% apertury (z API 400). |
| **Kluczowe komponenty** | Canvas/obszar roboczy z overlayem obrazu i masek (wielokąty, kolory np. biały/zielony/niebieski); panel narzędzi do dodawania/edycji/usuwania masek; formularz edycji `width_mm` z ostrzeżeniem; lista masek z etykietami; komunikaty błędów (np. „Maska poniżej 3% apertury – odrzucona”). |
| **UX, dostępność, bezpieczeństwo** | UX: duży obszar roboczy; czytelne kolory masek; po zapisaniu maski – CRUD przez API (`GET/POST/PATCH/DELETE /api/images/{image_id}/masks`). Dostępność: możliwość obsługi kluczowych akcji z klawiatury; czytelne kontrasty. Bezpieczeństwo: operacje tylko na obrazie należącym do użytkownika; 404/401 obsłużone z komunikatem. |

---

### 2.5. Szczegóły obrazu – zakładka „Plan”

| Aspekt | Opis |
|--------|------|
| **Ścieżka** | `/images/{id}` z `tab=plan`. |
| **Główny cel** | Ustawienie parametrów planu (procent pokrycia 3–20%, ewentualnie coverage per mask w trybie wielomaskowym), generacja iteracji, wyświetlenie metryk walidacji, akceptacja/odrzucenie planu, eksport. |
| **Kluczowe informacje** | Pola: target_coverage_pct (3–20); w trybie wielomaskowym: coverage_per_mask (mapa mask_id → %); przycisk „Generuj plan”; stałe miejsce na metryki (achieved vs target coverage, spots_count, spots_outside_mask_count, overlap_count, plan_valid); status iteracji (draft/accepted/rejected); przyciski Akceptuj / Odrzuć; eksport (JSON, PNG, JPG, CSV – CSV tylko po udanej generacji); w trybie demo – watermark, brak przycisku Akceptuj. Tooltip o deterministyczności planu (te same wejścia → ten sam wynik). |
| **Kluczowe komponenty** | Formularz parametrów (procent pokrycia, opcjonalnie tabela % per maska); przycisk „Generuj plan”; blok metryk (zawsze widoczny, wypełniany po generacji); overlay/wykres punktów na obrazie (opcjonalnie w tej zakładce lub link do Animacja); przyciski Akceptuj / Odrzuć (Akceptuj tylko gdy plan_valid i nie demo); przyciski eksportu (JSON, PNG, JPG, CSV – CSV aktywny tylko gdy jest wygenerowany plan); stan „Generowanie w toku” z blokadą edycji; komunikaty błędów (np. brak masek ≥3% apertury, plan niepoprawny). |
| **UX, dostępność, bezpieczeństwo** | UX: zgodnie z sesją – podczas generacji blokada edycji i czytelny stan „Generowanie w toku”; metryki zawsze w tym samym miejscu; eksport CSV tylko po wygenerowaniu (sesja). Dostępność: jasne komunikaty o błędach walidacji (np. >5% punktów poza maską); przycisk Akceptuj niedostępny (disabled) gdy plan invalid lub demo. Bezpieczeństwo: Akceptuj wywołuje `PATCH /api/iterations/{id}` tylko gdy plan_valid i !is_demo; API zwraca 400 w przeciwnym razie; UI nie pozwala na akceptację w trybie demo. |

---

### 2.6. Szczegóły obrazu – zakładka „Animacja”

| Aspekt | Opis |
|--------|------|
| **Ścieżka** | `/images/{id}` z `tab=animation`. |
| **Główny cel** | Wizualizacja sekwencji emisji: overlay punktów (gradient kolejności), opcjonalnie linie średnic co 5°, animacja ruchu wózka (play/pause/reset). |
| **Kluczowe informacje** | Dane spotów z `GET /api/iterations/{id}/spots` (cache w pamięci sesji); gradient koloru punktu według indeksu w sekwencji; legenda (zakres gradientu, kolory masek w trybie wielomaskowym); podsumowanie liczbowe (liczba spotów). Animacja: czerwona kropka (wózek), płynny ruch, zatrzymanie + „flash” przy emisji, obrót zajmuje czas. |
| **Kluczowe komponenty** | Canvas/wykres z overlayem obrazu, masek i punktów (gradient); opcjonalnie linie średnic (przerywane); kontrolki animacji (Play, Pause, Reset); legenda (kolory masek, gradient kolejności); ewentualnie wybór iteracji do wyświetlenia (jeśli wiele draftów). |
| **UX, dostępność, bezpieczeństwo** | UX: czytelna legenda i kontrasty (PRD); animacja poglądowa (np. 5 s), bez odwzorowania czasu rzeczywistego. Dostępność: kontrolki animacji dostępne z klawiatury; opisowe etykiety. Bezpieczeństwo: spoty tylko dla iteracji należących do obrazu użytkownika; cache spotów tylko w sesji (sesja). |

---

### 2.7. Szczegóły obrazu – zakładka „Historia iteracji”

| Aspekt | Opis |
|--------|------|
| **Ścieżka** | `/images/{id}` z `tab=history`. |
| **Główny cel** | Przegląd wersji planu (iteracji): status, parent_id, metryki, data; możliwość przejścia do podglądu/animacji wybranej iteracji lub utworzenia nowej iteracji (zmiana parametrów w zakładce Plan). |
| **Kluczowe informacje** | Lista iteracji z API `GET /api/images/{image_id}/iterations` (paginated, filtrowanie po statusie/demo); dla każdej: id, parent_id, status (draft/accepted/rejected), is_demo, params_snapshot (skrót), target/achieved coverage, spots_count, plan_valid, created_at. |
| **Kluczowe komponenty** | Lista/tabela iteracji (kolumny: data, status, pokrycie zadane/osiągnięte, liczba spotów, plan_valid); filtry (status, is_demo); paginacja; akcje: „Pokaż” (przejście do Plan/Animacja z wybraną iteracją), „Usuń” tylko dla draft (DELETE iteration). |
| **UX, dostępność, bezpieczeństwo** | UX: czytelne odróżnienie draft vs accepted vs rejected; wersjonowanie (parent_id) może być pokazane jako drzewo lub lista z odniesieniem. Dostępność: nawigacja po wierszach. Bezpieczeństwo: usuwanie tylko draft (zgodnie z API); tylko iteracje danego obrazu użytkownika. |

---

## 3. Mapa podróży użytkownika

1. **Wejście:** Użytkownik otwiera aplikację → trafia na **Logowanie**. Zalogowanie (lub „Tryb demo”) → **Lista obrazów**.
2. **Nowy plan:** Na liście obrazów użytkownik klika „Dodaj obraz” → **Upload** (modal lub strona). Wypełnia plik i width_mm, zatwierdza → przekierowanie na **Szczegóły obrazu**, zakładka **Maski**.
3. **Maski:** Na zakładce Maski użytkownik rysuje/edyuje maski, ewentualnie koryguje width_mm (z ostrzeżeniem). Zapisuje maski przez API.
4. **Plan:** Przełącza na zakładkę **Plan**. Ustawia procent pokrycia (i ewentualnie per maska). Klika „Generuj plan” → stan „Generowanie w toku” (blokada edycji) → po odpowiedzi API metryki się wypełniają. Czyta metryki i status plan_valid. Jeśli plan poprawny i nie demo – może kliknąć „Akceptuj”; jeśli nie – „Odrzuć” lub zmienia parametry i generuje ponownie (nowa iteracja). Eksport (JSON, PNG, JPG, CSV) gdy plan wygenerowany.
5. **Animacja:** Przełącza na zakładkę **Animacja**. Wybiera iterację (jeśli kilka). Odtwarza animację (play/pause/reset), ogląda overlay i gradient kolejności.
6. **Historia:** Na zakładce **Historia iteracji** przegląda listę wersji, może usunąć draft lub przejść do podglądu wybranej iteracji.
7. **Iteracja (nowa wersja):** Z zakładki Plan użytkownik zmienia parametr (np. % pokrycia) i ponownie klika „Generuj plan” → tworzona jest nowa iteracja (parent_id = poprzednia); w Historii widać nowy wiersz.

Przepływ jest liniowy w sensie logicznym (upload → maski → plan → animacja → akceptacja), ale nawigacja zakładkowa pozwala wracać (np. poprawa masek po obejrzeniu planu).

---

## 4. Układ i struktura nawigacji

- **Poziomy nawigacji:** (1) Logowanie; (2) Lista obrazów (nagłówek z „Wyloguj”, „Dodaj obraz”); (3) Szczegóły obrazu z wewnętrznymi zakładkami: Maski | Plan | Animacja | Historia iteracji; breadcrumb lub przycisk „Powrót do listy” z widoku szczegółów.
- **Przejścia:** Lista obrazów ↔ Szczegóły obrazu (wybór obrazu lub powrót); Upload → zawsze Szczegóły obrazu (zakładka Maski). W obrębie Szczegóły obrazu – przełączanie zakładek bez zmiany URL lub z `tab=` (w zależności od implementacji routingu).
- **Dostęp do funkcji:** Upload z listy obrazów. Generacja planu, akceptacja, eksport – w zakładce Plan. Animacja – zakładka Animacja. Historia i usuwanie draftów – zakładka Historia iteracji. Edycja skali i masek – zakładka Maski.

---

## 5. Kluczowe komponenty

| Komponent | Opis |
|-----------|------|
| **Formularz logowania** | Pola login/hasło, przycisk Zaloguj, przycisk/link Tryb demo; obsługa błędów 401/422. |
| **Lista/karty obrazów** | Wyświetlenie elementów z `GET /api/images` z paginacją; miniatura, width_mm, data; akcja „Otwórz” → Szczegóły obrazu. |
| **Upload obrazu** | Input pliku (PNG/JPG), pole width_mm; walidacja po stronie UI i obsługa odpowiedzi API; po sukcesie przekierowanie na `/images/{id}?tab=masks`. |
| **Zakładki Szczegóły obrazu** | Kontener zakładek (Maski, Plan, Animacja, Historia iteracji); utrzymanie kontekstu image_id i opcjonalnie iteration_id. |
| **Canvas / obszar roboczy** | Wyświetlanie obrazu zmiany skórnej, overlay masek (wielokąty) i punktów (z gradientem); w zakładce Maski – narzędzia do rysowania/edycji; w Animacja – wizualizacja ruchu i emisji. |
| **Panel parametrów planu** | Procent pokrycia (3–20), opcjonalnie coverage_per_mask; przycisk „Generuj plan”; blok metryk (target/achieved coverage, spots_count, spots_outside_mask, overlap, plan_valid). |
| **Kontrolki animacji** | Play, Pause, Reset; integracja z danymi spotów (GET /api/iterations/{id}/spots). |
| **Legenda** | Kolory masek, zakres gradientu kolejności emisji; spójna semantyka wizualna (PRD). |
| **Przyciski akcji planu** | Akceptuj (tylko gdy plan_valid i !is_demo), Odrzuć; eksport (JSON, PNG, JPG, CSV – CSV tylko po wygenerowaniu). |
| **Lista iteracji** | Tabela/lista z Historii iteracji: kolumny status, metryki, data; filtry; akcje Pokaż, Usuń (draft). |
| **Komunikaty błędów i stanów** | Błędy API (400, 401, 404, 422) z czytelnym tekstem; stan „Generowanie w toku”; ostrzeżenie przy zmianie width_mm (unieważnienie iteracji); informacja o odrzuceniu maski <3% apertury. |
| **Watermark trybu demo** | Widoczny w trybie demo (np. na canvas lub w nagłówku); brak przycisku Akceptuj w Plan. |

---

## 6. Mapowanie historyjek użytkownika (PRD) na architekturę UI

| ID | Historyjka | Elementy UI |
|----|------------|-------------|
| US-001 | Uwierzytelnienie użytkownika klinicznego | Widok Logowanie; formularz login/hasło; Tryb demo; ochrona tras – przekierowanie na login przy 401. |
| US-002 | Upload obrazu zmiany skórnej | Widok/flow Upload; input pliku PNG/JPG; integracja z POST /api/images. |
| US-003 | Definicja skali obrazu | Pole width_mm w Upload i w zakładce Maski (edycja z ostrzeżeniem); PATCH /api/images/{id}. |
| US-004 | Rysowanie maski | Zakładka Maski; canvas i narzędzia do wielokątów; POST/PATCH /api/images/{image_id}/masks. |
| US-005 | Filtrowanie małych masek | API zwraca 400; UI wyświetla komunikat „Maska poniżej 3% apertury – odrzucona”. |
| US-006 | Ustawienie procentu pokrycia | Zakładka Plan; pole target_coverage_pct (i coverage_per_mask); przycisk Generuj. |
| US-007 | Generacja siatki spotów | Zakładka Plan; przycisk „Generuj plan”; POST /api/images/{image_id}/iterations; metryki po odpowiedzi. |
| US-008 | Walidacja planu | Blok metryk (plan_valid, spots_outside_mask, overlap); blokada Akceptuj gdy plan invalid. |
| US-009 | Animacja sekwencji emisji | Zakładka Animacja; kontrolki play/pause/reset; dane z GET /api/iterations/{id}/spots. |
| US-010 | Akceptacja planu | Zakładka Plan; przycisk Akceptuj (tylko gdy plan_valid i !is_demo); PATCH /api/iterations/{id} status=accepted. |
| US-011 | Iteracja planu | Zmiana parametrów w Plan i ponowne „Generuj plan” (nowa iteracja); zakładka Historia iteracji. |
| US-012 | Eksport wyników | Zakładka Plan; przyciski eksportu JSON, PNG, JPG, CSV; GET /api/iterations/{id}/export. |
| US-013 | Tryb demo | Przycisk na Logowanie; watermark w aplikacji; brak Akceptuj w Plan; is_demo w żądaniach generacji. |

---

## 7. Wymagania PRD → elementy UI (skrót)

- **Wejście danych (obraz, skala):** Upload + width_mm; edycja width_mm w Maski z ostrzeżeniem.
- **Maski (wiele, edytowalne, <3% odrzucane):** Zakładka Maski, canvas, CRUD masek; komunikaty 400.
- **Parametry planu (% pokrycia 3–20):** Zakładka Plan, formularz parametrów.
- **Generacja siatki i walidacja:** Przycisk Generuj; metryki (achieved/target, spots outside, overlap, plan_valid); blokada akceptacji przy błędach.
- **Wizualizacja (overlay, gradient, wykres, animacja):** Zakładka Plan (overlay/legenda), zakładka Animacja (animacja + legenda).
- **Iteracje i akceptacja:** Historia iteracji; Akceptuj/Odrzuć w Plan; nowa iteracja przez ponowną generację.
- **Eksport (PNG/JPG, JSON, CSV):** Przyciski eksportu w Plan; CSV tylko po wygenerowaniu.
- **Tryb demo:** Wejście z logowania; watermark; brak Akceptuj.
- **Deterministyczność:** Tooltip w Plan (te same wejścia → ten sam wynik).

---

## 8. Przypadki brzegowe i stany błędów

- **Brak masek lub wszystkie <3% apertury:** Przy generacji planu API 400; UI: komunikat „Obraz nie ma masek powyżej 3% apertury” (lub odpowiednik z API); przycisk Generuj może być aktywny, ale po wywołaniu pokazany błąd.
- **Plan niepoprawny (>5% punktów poza maską lub overlap):** plan_valid=0; metryki wyświetlone; przycisk Akceptuj disabled; komunikat zachęcający do korekty (np. zmiana % pokrycia lub masek).
- **Edycja width_mm po utworzeniu iteracji:** Ostrzeżenie w UI, że istniejące iteracje staną się nieaktualne; po zapisie iteracje pozostają w bazie, ale użytkownik może generować nową iterację z nową skalą.
- **Wygasła sesja (401):** Globalna obsługa (np. intercept odpowiedzi); przekierowanie na Logowanie z komunikatem „Sesja wygasła”.
- **Obraz/usunięty zasób (404):** Komunikat „Obraz nie znaleziony” lub „Iteracja nie znaleziona”; przekierowanie do listy obrazów lub odświeżenie zakładki.
- **Generowanie planu w toku:** Blokada edycji parametrów i masek; przycisk „Generuj” w stanie loading; komunikat „Generowanie w toku”.
- **Tryb demo – próba akceptacji:** Przycisk Akceptuj niewidoczny lub disabled; ewentualnie tooltip „W trybie demo akceptacja jest wyłączona”.

---

## 9. Potencjalne punkty bólu użytkownika i odpowiedzi UI

- **Niepewność co do skali (błędne width_mm):** Ostrzeżenie przy edycji skali; w przyszłości możliwe narzędzie do pomiaru na obrazie (poza MVP).
- **Skomplikowany wielomaskowy plan:** Czytelna legenda i kolory masek (PRD); w Plan – tabela coverage per mask; metryki i walidacja per konfiguracja.
- **Czy plan jest „ten sam” przy tych samych danych:** Tooltip o deterministyczności w Plan.
- **Gubienie kontekstu (który obraz, która iteracja):** Breadcrumb lub tytuł „Szczegóły obrazu – [id/nazwa]”; w Plan/Animacja wyraźne wskazanie wybranej iteracji.
- **Długie generowanie planu:** Stan „Generowanie w toku” i blokada zapobiegająca przypadkowym zmianom; w przyszłości progress (jeśli API to umożliwi).
- **Błąd przy uploadzie lub masce:** Walidacja formatów w UI (PNG/JPG); pełne komunikaty błędów z API (sesja – rekomendacja 8 i 9).

---

*Dokument architektury UI. Szczegóły implementacji, makiet wizualnych i kodu pozostają w kolejnych krokach projektu.*
