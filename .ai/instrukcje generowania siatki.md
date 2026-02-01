# GRID_GENERATION_METHOD.md
## Metoda generowania siatki emisji na podstawie zdjęcia (maski)

Ten dokument definiuje **konkretną metodę** generowania punktów emisji (spotów) na podstawie zdjęcia zmiany skórnej, w sposób:
- zgodny z geometrią urządzenia (osie co stały kąt, np. 5°),
- z kontrolą pokrycia procentowego,
- bez overlapów,
- deterministyczny i łatwy do przetestowania.

Zakres: **tylko generowanie punktów**. Bez animacji i bez motion-planu.

---

## 0) Definicje i jednostki

- Układ współrzędnych roboczych: **mm**.
- Maska binarna: `mask[y, x] ∈ {0, 1}` w pikselach.
- Skala: `mm_per_px` (wynika z `real_width_mm` i szerokości zmiany w px).
- Spot (punkt emisji): koło o średnicy:
  - `spot_diameter_mm = 0.3`
- Minimalny dystans środków spotów (brak overlapów):
  - `min_dist_mm = spot_diameter_mm * 1.05`  *(margines bezpieczeństwa)*

---

## 1) Wejścia i wyjścia

### Wejście (wymagane)
1. `image_path` — ścieżka do obrazu.
2. `mask_definition` — sposób uzyskania maski:
   - v1: maska jest już oznaczona kolorem / bielą w obrazie (threshold),
   - lub: osobny plik maski.
3. `real_width_mm` — rzeczywista szerokość zmiany (np. 20 mm).
4. `coverage_percent_map` — docelowe pokrycie dla każdej maski/koloru:
   - np. `{ "white": 10, "green": 5 }`
5. `angle_step_deg` — krok osi obrotowej (np. 5°).
6. `treatment_circle_diameter_mm` — np. 25 mm (opcjonalnie jeśli ograniczasz obszar).
7. `center_mode` — definicja środka układu:
   - `"mask_centroid"` (zalecane)
   - `"image_center"`

### Wyjście
Dla każdej maski (i każdej jej instancji po connected-components):
- lista punktów w mm:
  - `[(x_mm, y_mm, theta_deg, t_mm), ...]`
gdzie:
- `theta_deg` — oś (kąt),
- `t_mm` — pozycja wzdłuż osi (parametr linii).

---

## 2) Pipeline (kolejność obowiązkowa)

1. Wczytaj obraz
2. Wydobądź maski (dla kolorów)
3. Oczyść maski morfologią
4. Podziel maskę na instancje (connected components)
5. Odrzuć małe instancje (< 1% sumy powierzchni dla danego koloru)
6. Skaluje piksele → mm (`mm_per_px`)
7. Dla każdej instancji:
   1) policz pole maski w mm²
   2) wylicz `N_target` spotów dla docelowego pokrycia
   3) dobierz `spacing_mm` (binary search)
   4) generuj punkty na osiach co `angle_step_deg`
   5) filtruj punkty: maska + brak overlapów
8. Zwróć punkty

---

## 3) Segmentacja i przygotowanie maski

### 3.1 Segmentacja (v1 - prosta)
Agent AI ma zaimplementować funkcję, która przyjmuje obraz i zwraca maski per kolor.

Przykładowe podejścia:
- jeśli maska jest biała: threshold po jasności w HSV / LAB,
- jeśli maski są kolorowe: zakresy HSV per kolor.

### 3.2 Morfologia (obowiązkowa)
Po segmentacji zastosuj:
- `open` (usuń szum)
- `close` (wypełnij małe dziury)

Parametry jądra morfologicznego: konfigurowalne, np. 3–7 px.

---

## 4) Skala: mm_per_px

### 4.1 Jak wyznaczyć px-width zmiany
Jeśli użytkownik podaje `real_width_mm`, agent musi określić szerokość zmiany w pikselach.

Wariant v1 (najprostszy, deterministyczny):
- dla całej maski (dla danej instancji) wyznacz bounding box:
  - `w_px = xmax - xmin + 1`
- ustaw:
  - `mm_per_px = real_width_mm / w_px`

> Uwaga: Jeśli w obrazie jest kilka masek/instancji, skalę licz z **największej instancji** albo podanej „głównej” (konfigurowalne).

---

## 5) Liczba spotów dla pokrycia

### 5.1 Pole spotu
`A_spot_mm2 = π * (spot_diameter_mm/2)^2`

### 5.2 Pole maski w mm²
`A_mask_mm2 = N_mask_px * (mm_per_px^2)`

### 5.3 Liczba spotów
`N_target = round((coverage_percent/100) * A_mask_mm2 / A_spot_mm2)`

Wymagania:
- jeśli `N_target == 0`, zwróć pustą listę,
- docelowo minimalizować błąd pokrycia.

---

## 6) Definicja osi i generowanie kandydatów

### 6.1 Oś jako linia przez środek
Oś o kącie `theta` (w radianach):
- `dir = (cos(theta), sin(theta))`
- punkt na osi:
  - `P(t) = center + t * dir`
gdzie `t` w mm.

### 6.2 Zakres t
Wyznacz `t_min, t_max` na podstawie:
- promienia obszaru roboczego (np. 12.5 mm),
- albo bounding box maski w mm + margines.

Wariant zalecany (bezpieczny):
- `R = treatment_circle_diameter_mm / 2` jeśli podane,
- `t ∈ [-R, +R]`.

### 6.3 Generowanie kandydatów co spacing
Dla danego `spacing_mm`:
- `t = -R, -R+spacing, ... , +R`

### 6.4 Poprawa równomierności (wymagana)
Żeby uniknąć zapełniania tylko jednej strony:
- generuj t w kolejności „od środka na zewnątrz”:
  - `[0, +s, -s, +2s, -2s, ...]`
- generuj osie w kolejności „naprzemiennej”:
  - `[0, +Δθ, -Δθ, +2Δθ, -2Δθ, ...]`

---

## 7) Test przynależności do maski

Punkt `(x_mm, y_mm)` mapuj do px:
- `u = round((x_mm - x0_mm)/mm_per_px + x0_px)`
- `v = round((y_mm - y0_mm)/mm_per_px + y0_px)`

W praktyce prościej:
- przechowuj `center_px = (cx_px, cy_px)` i `center_mm = (0,0)`
- wtedy:
  - `u = round(cx_px + x_mm / mm_per_px)`
  - `v = round(cy_px + y_mm / mm_per_px)`

Punkt jest dopuszczalny jeśli:
- `0 <= u < W` i `0 <= v < H`
- `mask[v,u] == 1`

---

## 8) Filtr overlapów (OBOWIĄZKOWY, szybki)

Nie wolno robić O(N²) przy większej liczbie punktów.
Użyj haszowania przestrzennego (grid hash).

### 8.1 Komórki
- `cell_size = min_dist_mm`
- dla punktu `(x,y)`:
  - `cell = (floor(x/cell_size), floor(y/cell_size))`

### 8.2 Reguła akceptacji
Nowy punkt można dodać tylko jeśli
- jego dystans do wszystkich punktów w tej komórce i 8 sąsiednich >= `min_dist_mm`.

---

## 9) Dobór spacing_mm (Binary Search)

Celem jest dobrać `spacing_mm` tak, żeby liczba zaakceptowanych punktów `N`
była możliwie bliska `N_target`.

### 9.1 Zakres startowy
- `low = spot_diameter_mm`
- `high = 10 * spot_diameter_mm`  *(konserwatywnie)*

### 9.2 Iteracje
- max iteracji: 20–30
- w każdej iteracji:
  - `mid = (low+high)/2`
  - wygeneruj punkty dla `mid`
  - jeśli `N > N_target`: zwiększ spacing => `low = mid`
  - jeśli `N < N_target`: zmniejsz spacing => `high = mid`

### 9.3 Kryterium stopu
- jeśli `abs(N - N_target) <= tolerance`, stop
  - `tolerance = max(1, round(0.01*N_target))`

Wynik:
- lista punktów + osiągnięty błąd pokrycia

---

## 10) Obsługa wielu masek i wielu instancji

### 10.1 Connected Components
Dla każdej maski koloru:
- wykonaj connected-components
- otrzymasz instancje: `mask_i`

### 10.2 Odrzucanie małych instancji
- policz `area_i` każdej instancji w px
- suma `A_total = sum(area_i)`
- odrzuć instancje jeśli:
  - `area_i < 0.01 * A_total`

### 10.3 Pokrycie per kolor
Każda instancja danego koloru ma to samo pokrycie docelowe
(np. wszystkie zielone: 5%).

---

## 11) Dane zwracane (kontrakt)

Każdy punkt to struktura:
```json
{
  "x_mm": 1.234,
  "y_mm": -0.456,
  "theta_deg": 15,
  "t_mm": -3.0,
  "mask_color": "green",
  "mask_instance_id": 2
}
