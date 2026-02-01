# LaserXe – instrukcja użytkowania krok po kroku

Aplikacja służy do planowania emisji spotów laserowych na podstawie zdjęcia zmiany skórnej: wgrywasz obraz, rysujesz maski obszaru zabiegowego, generujesz plan (siatkę punktów) i przeglądasz animację sekwencji emisji.

---

## 0. Uruchomienie

**Backend (Python):**
```bash
cd backend
# opcjonalnie: python -m venv .venv && .venv\Scripts\activate  (Windows)
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend (Astro):**
```bash
npm install
npm run dev
```

Otwórz w przeglądarce adres podany przez `npm run dev` (np. `http://localhost:4321`).

**Dane logowania (MVP):** login **user**, hasło **123** (do zmiany przed produkcją).

---

## Krok 1: Logowanie

1. Wejdź na stronę główną – zostaniesz przekierowany na **Logowanie**.
2. Wpisz **login** i **hasło** (np. `user` / `123`).
3. Kliknij **Zaloguj**.
4. Po poprawnym logowaniu trafisz na listę **Obrazy**.

---

## Krok 2: Lista obrazów

- Na stronie **Obrazy** widzisz listę swoich zdjęć (jeśli brak – lista jest pusta).
- **Dodaj nowy obraz** – przycisk/link prowadzi do formularza uploadu (**Krok 3**).
- Kliknięcie w **kartę obrazu** (np. „Szczegóły obrazu #1”) otwiera **widok szczegółów** tego obrazu (**Krok 4**).
- **Wyloguj** – przycisk w prawym górnym rogu.

---

## Krok 3: Dodanie nowego obrazu (upload)

1. Kliknij **Dodaj nowy obraz** (lub wejdź na `/images/new`).
2. Podaj **szerokość zmiany w mm** (np. 20 dla zmiany 2 cm).
3. Wybierz **plik obrazu** (PNG lub JPG).
4. Kliknij **Wgraj**.
5. Po udanym uploadie zostaniesz przekierowany na listę obrazów; możesz wejść w nowo dodany obraz.

---

## Krok 4: Widok szczegółów obrazu (zakładki)

Po wejściu w obraz (np. **Szczegóły obrazu #1**) masz **zakładki** u góry:

- **Maski** – rysowanie i edycja masek (**Krok 5**).
- **Plan** – parametry planu, generowanie, metryki, akceptacja/odrzucenie, eksport (**Krok 6**).
- **Animacja** – wizualizacja sekwencji emisji (**Krok 7**).
- **Historia iteracji** – lista wersji planu (**Krok 8**).
- **Audit log** – wpisy audytu (**Krok 9**).

Na górze strony: **← Powrót do listy** (powrót do `/images`).

---

## Krok 5: Zakładka Maski

1. **Rysowanie maski**
   - Kliknij **Zacznij rysowanie** (lub wejdź w tryb rysowania).
   - Klikaj na obrazie, aby dodać wierzchołki wielokąta (obszar zabiegowy).
   - Zakończ wielokąt (np. przycisk **Zakończ rysowanie** lub zamknięcie kształtu).
   - System zapisze maskę (jeśli jej powierzchnia ≥ 3% apertury).

2. **Lista masek**
   - Pod obrazem widzisz listę masek.
   - **Edytuj** – włącz tryb edycji: na canvasie pojawią się kółka na wierzchołkach; przeciągaj je, potem **Zapisz zmiany** lub **Anuluj edycję**.
   - **Usuń** – usuwa wybraną maskę.

3. Możesz dodać **wiele masek** (np. różne kolory dla czytelności). Maski mniejsze niż 3% apertury są odrzucane.

---

## Krok 6: Zakładka Plan

### Algorytmy siatki

- **Prosty** – siatka XY z odstępem **800 µm** (domyślnie); odstęp można zmienić w polu **Odstęp siatki (mm)** (0,3–2 mm). Punkty tylko wewnątrz masek. Przewidywalny układ.
- **Zaawansowany (beta)** – algorytm w trakcie rozwoju: **pokrycie docelowe**, średnice co 5°, automatyczne zagęszczenie. Wybierz, jeśli potrzebujesz dostosowania do pokrycia docelowego.

1. **Parametry planu**
   - Wybierz **algorytm** (Prosty lub Zaawansowany beta).
   - Przy Prosty: opcjonalnie **Odstęp siatki (mm)** (0,3–2; domyślnie 0,8).
   - Ustaw **pokrycie docelowe** (np. 5–20%) – dotyczy algorytmu Zaawansowany.
   - Opcjonalnie **pokrycie per maska** (jeśli jest kilka masek).

2. **Generowanie planu**
   - Kliknij **Generuj plan**.
   - Backend tworzy iterację (wersję planu), generuje siatkę spotów wzdłuż średnic co 5° i zapisuje punkty.

3. **Wynik**
   - Pojawią się **metryki**: pokrycie docelowe/osiągnięte, liczba punktów, „Plan poprawny” (Tak/Nie).
   - **Podgląd planu (overlay punktów)** – obraz z nałożonymi maskami i punktami (bez animacji).

4. **Akcje**
   - **Akceptuj** – zatwierdza plan (dostępne tylko gdy plan jest poprawny i nie jest to tryb demo).
   - **Odrzuć** – odrzuca wersję (szkic).
   - **Eksport JSON** – pobiera plik JSON z planem.
   - **Pobierz CSV (spoty)** – pobiera listę spotów w CSV.
   - **Eksport PNG** / **Eksport JPG** – pobiera obraz z nałożonymi maskami i punktami.

---

## Krok 7: Zakładka Animacja

1. **Wybór iteracji**
   - W polu **Iteracja** wybierz wersję planu (np. „#1 – 73 punktów”).

2. **Odtwarzanie**
   - **Odtwórz** – start animacji: czerwona kropka (wózek) przechodzi przez punkty w kolejności emisji; przy każdym punkcie krótkie zatrzymanie i „flash”.
   - **Wstrzymaj** – pauza.
   - **Reset** – powrót do pierwszego punktu.

3. **Opcje**
   - **Linie średnic co 5°** – checkbox: włącza/wyłącza rysowanie linii średnic na canvasie.

4. Pod obrazem: **Punkt X / N** oraz legenda kolejności (gradient 0 → N).

---

## Krok 8: Zakładka Historia iteracji

- Tabela: **Data**, **Status** (draft/accepted/rejected), **Pokrycie docelowe/osiągnięte**, **Punkty**, **Plan poprawny**, **Akcje**.
- **Pokaż** – przełącza na zakładkę Plan i ustawia wyświetlaną iterację.
- **Usuń** – tylko dla iteracji w statusie **draft** (szkic).

---

## Krok 9: Zakładka Audit log

- Lista wpisów audytu (np. „Wygenerowano plan”, „Iteracja zaakceptowana”).
- **Filtry:** typ zdarzenia, data od–do.
- **Tylko ten obraz** – checkbox: pokazuje tylko wpisy dotyczące iteracji bieżącego obrazu.
- **Odśwież** – ponowne pobranie listy.
- Paginacja: **Poprzednia** / **Następna**.

---

## Tryb demo

- Wejście z parametrem **?demo=1** (np. `/images?demo=1`) włącza **Tryb demo**.
- W nagłówku widoczny jest badge **Tryb demo**; na canvasie (Maski, Animacja) – półprzezroczysty napis „DEMO”.
- W trybie demo **nie można zaakceptować** planu (tylko odrzucić lub usuwać szkice).

---

## Szybki przepływ (podsumowanie)

1. Zaloguj się → **Obrazy**.
2. **Dodaj nowy obraz** → podaj szerokość (mm) i wgraj plik.
3. Wejdź w **Szczegóły obrazu**.
4. **Maski** – narysuj jedną lub więcej masek (obszar zabiegowy).
5. **Plan** – ustaw pokrycie, kliknij **Generuj plan**.
6. **Animacja** – wybierz iterację, kliknij **Odtwórz** i zobacz sekwencję emisji.
7. **Plan** – w razie potrzeby **Akceptuj** lub **Eksport PNG/JPG/JSON/CSV**.
8. **Historia iteracji** – przegląd wersji; **Audit log** – przegląd zdarzeń.

Jeśli coś nie działa, sprawdź czy backend działa na `http://localhost:8000` (np. `GET /health` → `{"status":"ok"}`) i czy frontend łączy się z tym adresem (zmienna `PUBLIC_API_URL` lub domyślnie localhost:8000).
