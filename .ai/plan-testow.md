# Plan testów – LaserXe (laserme 2.0a MVP)

**Wersja:** 1.0  
**Data:** 2026-02-01  
**Język:** polski

---

## 1. Wprowadzenie i cele testowania

### 1.1 Cel dokumentu

Dokument definiuje strategię i zakres testów dla projektu LaserXe (aplikacja do planowania zabiegów laserowych: obrazy, maski, generacja siatki spotów, iteracje planów). Plan jest dostosowany do stosu technologicznego (Astro 5, React 19, TypeScript, Tailwind, Shadcn/ui po stronie frontendu; Python, FastAPI, SQLite po stronie backendu) oraz do istniejącej struktury repozytorium i już wdrożonych mechanizmów testowych.

### 1.2 Cele testowania

- **Weryfikacja poprawności** – logika biznesowa (algorytmy siatki, konwersje współrzędnych, uwierzytelnienie), API REST oraz kluczowe ścieżki użytkownika działają zgodnie ze specyfikacją.
- **Wykrywanie regresji** – zmiany w kodzie nie niszczą istniejącej funkcjonalności (testy jednostkowe i integracyjne backendu, testy E2E).
- **Gotowość do wdrożenia** – kryteria akceptacji są jasno zdefiniowane, a proces testowy powtarzalny (np. w CI).

### 1.3 Ocena istniejącego mechanizmu testów

**Obecny stan:**

- **Backend (Python):** pytest + FastAPI TestClient. Istnieją:
  - **test_auth.py** – logowanie (sukces, zły hasło, brak sesji), /me, wylogowanie, walidacja 422; fixture z bazą SQLite in-memory i seedem użytkownika.
  - **test_coordinates.py** – konwersje top-left mm ↔ center mm, rundtrip punktów i wierzchołków, kierunek osi Y.
  - **test_plan_grid.py** – generacja planu (kąt 0–175°, naprzemienne t, geometria spotów, determinizm), tryb prosty (siatka XY, boustrophedon), tryb zaawansowany, `generate_plan_by_mode`.
- **Frontend / E2E:** Playwright w katalogu `e2e/`. Jedyny plik: **grid-algorithm.spec.ts** – logowanie, przejście do szczegółów obrazu, zakładka Plan, wybór algorytmu (Prosty / Zaawansowany), generacja planu, metryki (w tym odstęp siatki 1 mm).

**Co jest w porządku:**

- Testy jednostkowe dla kluczowej logiki (auth, coordinates, plan_grid) są rozbudowane i pokrywają edge case’y oraz konwencje (np. kąty, kolejność emisji).
- Testy auth obejmują zarówno sukces, jak i błędy (401, 422) oraz sesję (cookie, logout).
- E2E pokrywa najważniejszy flow: logowanie → lista obrazów → szczegóły obrazu → Plan → wybór algorytmu → generacja → metryki.

**Co wymaga rozszerzenia:**

- **Brak testów API** dla endpointów: obrazy (list, upload, get, update, delete), maski, iteracje, iteration_by_id, audit log. Te obszary są krytyczne dla integralności danych i bezpieczeństwa (własność zasobów, paginacja, walidacja).
- **Brak testów jednostkowych frontendu** – np. komponenty React (formularze, walidacja), helpery (`api.ts`, `utils.ts`) nie są testowane automatycznie.
- **E2E** – brak scenariuszy: nieudane logowanie, przekierowanie niezalogowanego użytkownika, upload obrazu, lista obrazów (pusta/stronicowanie), zakładki Historia/Maski/Animacja/Audit log, obsługa błędów sieci/401.
- **Brak pipeline’u CI** – w `.github` nie ma workflowów (np. GitHub Actions) uruchamiających pytest i Playwright przy pushu/PR; wymóg ze stosu technologicznego nie jest jeszcze spełniony.
- **Brak testów** dla endpointu `/health` oraz dla migracji bazy danych (skrypty w `backend/scripts/`).

Plan poniżej uzupełnia te luki i porządkuje typy testów, środowisko, narzędzia oraz kryteria akceptacji.

---

## 2. Zakres testów

### 2.1 W zakresie

| Obszar | Opis |
|--------|------|
| **Backend – uwierzytelnienie** | Logowanie, wylogowanie, sesja (cookie), endpoint /me, ochrona endpointów wymagających auth. |
| **Backend – serwisy** | `coordinates` (konwersje mm, wierzchołki), `plan_grid` (tryb prosty i zaawansowany, parametry, metryki). |
| **Backend – API REST** | Auth (już w testach), Images (list, upload, get, update, delete, audit log), Masks, Iterations, Iteration by id, Audit log; health. |
| **Frontend – ścieżki użytkownika** | Logowanie (sukces/porażka), lista obrazów, szczegóły obrazu, zakładki (Plan, Historia, Maski, Animacja, Audit log), upload obrazu, generacja planu. |
| **Integracja** | Zależność frontend → backend (API, CORS, cookies); baza SQLite w testach (fixture in-memory). |
| **Jakość kodu** | ESLint (frontend), ewentualnie linting backendu (np. ruff); formatowanie (Prettier). |

### 2.2 Poza zakresem (MVP)

- Testy wydajnościowe i obciążeniowe (np. load testy API, duże obrazy).
- Testy bezpieczeństwa penetracyjne (OAuth, CSRF – poza podstawową walidacją).
- Testy automatyczne dla AI/automatycznej segmentacji (funkcja poza MVP).
- Testy kompatybilności przeglądarkowej (w MVP wystarczy jeden browser w E2E, np. Chromium).

---

## 3. Typy testów do przeprowadzenia

### 3.1 Testy jednostkowe (backend)

- **Cel:** Weryfikacja pojedynczych funkcji i modułów w izolacji (bez pełnego HTTP ani realnej bazy na dysku).
- **Narzędzie:** pytest.
- **Obecny stan:** test_auth (z fixture DB), test_coordinates, test_plan_grid.
- **Rozszerzenie:** Zachować i utrzymywać istniejące; dodać testy dla edge case’ów w serwisach, jeśli pojawią się nowe (np. walidacja parametrów planu).

### 3.2 Testy integracyjne / API (backend)

- **Cel:** Weryfikacja endpointów REST: statusy HTTP, body odpowiedzi, własność zasobów (user_id), walidacja wejścia (422), 401 przy braku sesji.
- **Narzędzie:** pytest + FastAPI `TestClient`, baza SQLite in-memory (jak w test_auth).
- **Rozszerzenie (priorytet):**
  1. **Images API** – GET list (paginacja, sort, pusty wynik), POST upload (PNG/JPEG, odrzucenie nieprawidłowego typu), GET by id (200/404), PATCH, DELETE, audit log dla obrazu; 401 bez sesji.
  2. **Masks API** – list/create/get w kontekście image_id i własności użytkownika; 401/404.
  3. **Iterations API** – list/create dla image_id; w create – walidacja parametrów (target_coverage_pct, algorithm_mode), zapis do DB; 401/404.
  4. **Iteration by id** – GET iteration po id (własność przez image → user); 404 dla cudzego zasobu.
  5. **Audit log** – GET lista wpisów dla obrazu; 401/404.
  6. **Health** – GET /health → 200, body `{"status":"ok"}`.

### 3.3 Testy E2E (frontend + backend)

- **Cel:** Weryfikacja pełnych ścieżek użytkownika w przeglądarce (Astro + React, z backendem na localhost).
- **Narzędzie:** Playwright (już w projekcie), baseURL localhost:4321, backend :8000.
- **Obecny stan:** grid-algorithm.spec.ts (logowanie, Plan, algorytmy, generacja, metryki).
- **Rozszerzenie (priorytet):**
  1. Logowanie – niepoprawne dane → komunikat/brak przekierowania; poprawne → przekierowanie na /images.
  2. Ochrona tras – niezalogowany użytkownik na /images lub /images/[id] → przekierowanie na /login (z return URL).
  3. Lista obrazów – strona /images (pusta lista vs lista z kartami), paginacja jeśli dostępna.
  4. Szczegóły obrazu – wejście na /images/[id], przełączanie zakładek (Plan, Historia, Maski, Animacja, Audit log), widoczność nagłówków/treści.
  5. Upload – strona /images/new, upload pliku (można użyć małego PNG), oczekiwane przekierowanie lub odświeżenie listy.
  6. Obsługa 401 – np. po wygaśnięciu sesji (symulacja) wywołanie API powinno zakończyć się przekierowaniem na login (opcjonalnie w późniejszej fazie).

### 3.4 Testy jednostkowe frontendu (opcjonalne, zalecane)

- **Cel:** Weryfikacja logiki w komponentach React i w helperach (np. `api.ts`, `utils.ts`) bez uruchamiania przeglądarki.
- **Narzędzie:** Vitest (zalecany dla Vite/Astro) + React Testing Library lub testy dla czystych funkcji.
- **Zakres:** Funkcje w `src/lib/` (getApiBase, apiFetch, formatowanie); proste komponenty (np. formularz logowania – walidacja pól). Obecnie **nie ma** takich testów – ich wprowadzenie traktować jako rozszerzenie po ustabilizowaniu API i E2E.

### 3.5 Testy migracji i skryptów (opcjonalne)

- **Cel:** Upewnienie się, że migracje SQL i skrypty (np. seed użytkownika, weryfikacja schemy) wykonują się bez błędów w czystym środowisku.
- **Sposób:** Uruchomienie migracji na kopii bazy testowej (np. plik tymczasowy lub :memory:) oraz sprawdzenie kodu wyjścia skryptów; można zautomatyzować w CI.

---

## 4. Scenariusze testowe dla kluczowych funkcjonalności

### 4.1 Uwierzytelnienie

| ID | Scenariusz | Typ | Oczekiwany wynik |
|----|------------|-----|------------------|
| A1 | Logowanie poprawnymi danymi (user, 123) | API / E2E | 200, cookie ustawione, przekierowanie na /images |
| A2 | Logowanie błędnym hasłem | API / E2E | 401, brak cookie |
| A3 | Logowanie bez pola login lub password | API | 422 |
| A4 | GET /api/auth/me bez sesji | API | 401 |
| A5 | GET /api/auth/me z poprawną sesją | API | 200, body z login |
| A6 | Wylogowanie z sesją | API | 204, sesja unieważniona, kolejne /me → 401 |
| A7 | POST /api/auth/logout bez sesji | API | 401 |
| A8 | Wejście na /images bez zalogowania | E2E | Przekierowanie na /login |

### 4.2 Obrazy (Images)

| ID | Scenariusz | Typ | Oczekiwany wynik |
|----|------------|-----|------------------|
| I1 | GET /api/images – brak sesji | API | 401 |
| I2 | GET /api/images – zalogowany, pusty wynik | API | 200, lista pusta, total zgodny |
| I3 | GET /api/images?page=1&page_size=10 | API | 200, paginacja, sort domyślny |
| I4 | POST upload – plik PNG/JPEG | API | 201, zwrot id, width_mm itd. |
| I5 | POST upload – nieprawidłowy typ (np. PDF) | API | 400/422, brak zapisu |
| I6 | GET /api/images/:id – własny obraz | API | 200 |
| I7 | GET /api/images/:id – cudzy obraz lub nieistniejący id | API | 404 |
| I8 | PATCH /api/images/:id (np. width_mm) | API | 200, zaktualizowane dane |
| I9 | DELETE /api/images/:id | API | 204 lub 200, obraz usunięty |
| I10 | GET audit log dla obrazu | API | 200, lista wpisów (może pusta) |

### 4.3 Maski i iteracje

| ID | Scenariusz | Typ | Oczekiwany wynik |
|----|------------|-----|------------------|
| M1 | GET/POST mask dla image_id – własny obraz | API | 200/201 |
| M2 | GET maski dla cudzego image_id | API | 404 |
| M3 | Lista iteracji dla image_id – własny | API | 200, lista (może pusta) |
| M4 | POST iteracja – poprawne parametry (algorithm_mode: simple/advanced) | API | 201, zwrot iteration z spots/metrykami |
| M5 | POST iteracja – nieprawidłowe parametry | API | 422 |
| M6 | GET /api/iterations/:id – własna iteracja | API | 200 |
| M7 | GET /api/iterations/:id – cudza/nieistniejąca | API | 404 |

### 4.4 Plan (algorytm siatki)

| ID | Scenariusz | Typ | Oczekiwany wynik |
|----|------------|-----|------------------|
| P1 | Zakładka Plan – widoczne opcje Prosty / Zaawansowany (beta) i przycisk Generuj plan | E2E | Widoczne |
| P2 | Wybór Prosty, Generuj plan – metryki (Liczba punktów itd.) | E2E | Metryki widoczne |
| P3 | Wybór Zaawansowany (beta), Generuj plan – metryki | E2E | Metryki widoczne |
| P4 | Prosty + Odstęp siatki 1 mm – generacja i metryki z „1 mm” | E2E | Zgodne z parametrem |
| P5 | Kąty 0°, 5°, …, 175°; naprzemienne t; geometria x=t*cos(θ), y=t*sin(θ) | Jednostkowe | test_plan_grid.py (już pokryte) |
| P6 | Tryb simple – siatka XY, boustrophedon, brak punktów poza maską | Jednostkowe | test_plan_grid.py (już pokryte) |

### 4.5 Inne

| ID | Scenariusz | Typ | Oczekiwany wynik |
|----|------------|-----|------------------|
| H1 | GET /health | API | 200, {"status":"ok"} |
| C1 | Konwersje współrzędnych – środek ↔ top-left, rundtrip, wierzchołki | Jednostkowe | test_coordinates.py (już pokryte) |

---

## 5. Środowisko testowe

### 5.1 Backend (pytest)

- **Python:** 3.11+ (zgodnie z tech stack).
- **Baza:** SQLite in-memory w fixture (bez pliku na dysku); schemat tworzony w teście (np. jak w test_auth) lub przez uruchomienie migracji na :memory:.
- **Zmienne środowiskowe:** Ustawiane w fixture (AUTH_SECRET_KEY, AUTH_COOKIE_*, itd.); brak zależności od zewnętrznych serwisów.
- **Uruchomienie:** Z katalogu `backend/`: `pytest` (lub `python -m pytest`). Opcjonalnie: `pytest -v`, `pytest --cov=app` po dodaniu pytest-cov.

### 5.2 E2E (Playwright)

- **Frontend:** Serwer deweloperski Astro na `http://localhost:4321` (uruchamiany ręcznie lub przez `webServer` w playwright.config.ts, jeśli zostanie skonfigurowany).
- **Backend:** FastAPI na `http://localhost:8000` (np. `uvicorn main:app --port 8000`).
- **Baza:** SQLite z zaseedowanym użytkownikiem (user / 123); zalecane osobne pliki bazy/testowe, aby nie nadpisywać danych deweloperskich.
- **Przeglądarka:** W konfiguracji domyślnej Chromium; w CI można uruchomić headless.

### 5.3 Izolacja danych

- Testy API nie powinny polegać na współdzielonej bazie z E2E; każdy zestaw testów używa własnej bazy (in-memory dla pytest; dla E2E – osobna baza lub reset przed suite’em, jeśli potrzebny).

---

## 6. Narzędzia do testowania

| Warstwa | Narzędzie | Uwagi |
|---------|-----------|--------|
| Backend – jednostkowe/integracyjne | **pytest** (≥8.0), **httpx** (TestClient) | Już w requirements.txt |
| Backend – coverage (opcjonalnie) | **pytest-cov** | `pytest --cov=app --cov-report=term-missing` |
| E2E | **Playwright** (@playwright/test) | package.json: `e2e`, `e2e:ui`; testDir: e2e |
| Frontend – lint | **ESLint** | `npm run lint` |
| Frontend – format | **Prettier** | `npm run format` |
| Frontend – jednostkowe (propozycja) | **Vitest**, **React Testing Library** | Do dodania w devDependencies przy rozszerzeniu |
| CI | **GitHub Actions** | Workflow do dodania (build, lint, pytest, playwright) |

---

## 7. Harmonogram testów

### 7.1 W trakcie rozwoju (przy każdej zmianie)

- Uruchomienie testów jednostkowych i API backendu przed commitem (lub w pre-commit): `cd backend && pytest`.
- Lint frontendu: `npm run lint` (już w lint-staged dla *.ts, *.tsx, *.astro).

### 7.2 Przed mergem / PR

- Pełna suita backendu: `pytest` (wszystkie moduły w `backend/tests/`).
- E2E (gdy serwery działają): `npm run e2e` (Playwright).
- Opcjonalnie: format `npm run format`, lint backendu jeśli zostanie dodany.

### 7.3 W CI (po wdrożeniu GitHub Actions)

- Krok 1: Lint (ESLint).
- Krok 2: Build frontendu (npm run build).
- Krok 3: Instalacja zależności backendu, uruchomienie migracji na bazie testowej (lub in-memory), pytest.
- Krok 4: Uruchomienie serwerów (backend + frontend) i testy Playwright (headless).

### 7.4 Przed release’em / wdrożeniem

- Pełna suita (jednostkowe + API + E2E) w CI.
- Ręczny przegląd checklisty krytycznych scenariuszy (np. oparta na .ai/grid-algorithm-manual-test-checklist.md) – uzupełnienie automatyzacji tam, gdzie to możliwe.

---

## 8. Kryteria akceptacji testów

- **Backend:** Wszystkie testy w `backend/tests/` przechodzą (zielone) przy uruchomieniu `pytest` w środowisku zgodnym z wymaganiami (Python 3.11+, zależności z requirements.txt). Nowe endpointy (Images, Masks, Iterations, Iteration by id, Audit log, Health) mają co najmniej testy integracyjne dla: 401 bez sesji, 404 dla cudzego/nieistniejącego zasobu, 200/201 dla poprawnych requestów oraz 422 przy błędnej walidacji (tam gdzie dotyczy).
- **E2E:** Zdefiniowane scenariusze E2E (logowanie, ochrona tras, lista obrazów, szczegóły obrazu, zakładka Plan i generacja planu, opcjonalnie upload i zakładki Historia/Maski/Animacja/Audit) przechodzą przy uruchomieniu `npm run e2e` z działającym backendem i frontendem; testy są stabilne (retry w CI dopuszczalne, np. 2).
- **CI:** Pipeline (GitHub Actions) uruchamia lint, build, pytest oraz Playwright; status PR zależy od wyniku tych kroków.
- **Jakość:** Nowe funkcje krytyczne (auth, obrazy, maski, iteracje, algorytmy planu) są objęte testami zgodnie z priorytetami z sekcji 4; regresje w istniejących testach (szczególnie test_plan_grid, test_coordinates, test_auth) są usuwane przed mergem.

---

## 9. Role i odpowiedzialności w procesie testowania

| Rola | Odpowiedzialność |
|------|------------------|
| **Developer** | Pisanie i utrzymanie testów jednostkowych oraz integracyjnych dla zmienianego kodu; uruchamianie testów lokalnie przed pushem; naprawa testów przy regresjach. |
| **QA / weryfikator** | Rozszerzanie scenariuszy E2E, wykonywanie testów E2E i testów ręcznych (checklisty); raportowanie błędów według procedury; weryfikacja kryteriów akceptacji przed release’em. |
| **Tech lead / maintainer** | Definiowanie priorytetów testów (np. które endpointy muszą mieć testy API w pierwszej kolejności); konfiguracja CI (GitHub Actions); dbanie o to, aby plan testów był aktualny przy zmianie zakresu produktu. |

---

## 10. Procedury raportowania błędów

### 10.1 Zawartość raportu

- **Tytuł:** Krótki, opisowy (np. „GET /api/images zwraca 500 przy page=0”).
- **Kroki do reprodukcji:** Numerowane kroki (środowisko, dane wejściowe, request/akcje w UI).
- **Oczekiwany wynik:** Zgodnie ze specyfikacją lub planem testów.
- **Rzeczywisty wynik:** Komunikat błędu, status HTTP, zrzut ekranu lub log.
- **Środowisko:** OS, przeglądarka (dla E2E), wersja backendu/frontendu lub commit.
- **Priorytet/ważność:** Krytyczny / Wysoki / Średni / Niski (np. blokuje release vs kosmetyka).

### 10.2 Gdzie raportować

- **Issue tracker projektu** (np. GitHub Issues): jeden issue na bug; etykiety np. `bug`, `test-failure`, `api`, `e2e`.
- **W dyskusji PR:** Jeśli bug wykryto w trakcie review, można opisać go w komentarzu i założyć osobny issue z linkiem.

### 10.3 Po naprawie

- Zamknięcie issue z odwołaniem do PR/commita wprowadzającego poprawkę.
- Uzupełnienie testu (jednostkowego, API lub E2E), który wykrywa ten błąd, aby uniknąć regresji – jeśli jeszcze taki test nie istnieje.

---

*Dokument stanowi oficjalny plan testów dla projektu LaserXe (MVP) i powinien być aktualizowany przy istotnych zmianach zakresu aplikacji lub stosu technologicznego.*
