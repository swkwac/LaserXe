# Zgodność algorytmu siatki z „instrukcje generowania siatki.md”

**Data:** 2026-01-31  
**Algorytm:** `backend/app/services/plan_grid.py` (generate_plan)

---

## 1. Zgodne z instrukcją

| Instrukcja (§) | Implementacja |
|----------------|----------------|
| Jednostki mm, spot_diameter_mm = 0.3 | SPOT_DIAMETER_MM = 0.3, współrzędne w mm |
| Oś P(t) = center + t·dir, t ∈ [-R, +R] | cx + t·cos(θ), cy + t·sin(θ), R = 12.5 mm |
| N_target z pokrycia (§5.3) | n_desired = (pct/100) * area_mm2 / SPOT_AREA_MM2 |
| Środek: mask_centroid / image_center | Centroid masek; fallback (width_mm/2, width_mm/2) |
| angle_step_deg (np. 5°) | ANGLE_STEP_DEG = 5 |
| treatment_circle_diameter 25 mm | APERTURE_RADIUS_MM = 12.5 |
| Test przynależności do maski (§7) | point-in-polygon (ray casting) na wielokątach |
| Pokrycie per maska / kolor (§10.3) | coverage_per_mask (mask_id / label → pct) |
| Wyjście: x_mm, y_mm, theta_deg, t_mm | SpotRecord + mask_id |

---

## 2. Różnice / brakujące elementy

### §6.4 Równomierność (wymagana w instrukcji)

- **Instrukcja:** Generowanie t „od środka na zewnątrz”: `[0, +s, -s, +2s, -2s, ...]` oraz osie „naprzemiennej”: `[0, +Δθ, -Δθ, +2Δθ, -2Δθ, ...]`.
- **Obecnie:** Punkty wzdłuż segmentu (t_lo → t_hi) liniowo; kolejność średnic: 0°, 355°, 350°, …, 5° (zgodnie z kinematyką „succesful point and animation algorythm” – ruch wskazówek zegara). Brak wariantu „od środka na zewnątrz” i „naprzemiennej” osi.

### §8 Filtr overlapów (OBOWIĄZKOWY w instrukcji)

- **Instrukcja:** Haszowanie przestrzenne (grid hash), min_dist_mm = spot_diameter * 1.05; nowy punkt tylko jeśli odległość do punktów w komórce i 8 sąsiednich ≥ min_dist_mm.
- **Obecnie:** Brak filtra overlapów podczas generacji. Spacing wzdłuż jednej osi ≥ spot_diameter; overlap między osiami/maskami możliwy. Overlap liczony tylko ex post (O(N²)) do metryki plan_valid.

### §9 Binary search dla spacing_mm

- **Instrukcja:** Binary search (low=spot_diameter, high=10*spot_diameter), max 20–30 iteracji, kryterium stopu |N − N_target| ≤ tolerance.
- **Obecnie:** spacing = total_length / n_desired (jedno przejście), bez iteracji. Osiągnięte N może odbiegać od N_target (np. przez zaokrąglenie n_steps).

### min_dist_mm = spot_diameter * 1.05

- **Instrukcja:** Margines 1.05.
- **Obecnie:** spacing ≥ spot_diameter (bez współczynnika 1.05).

### Pipeline wejścia (segmentacja, morfologia, connected components)

- **Instrukcja:** Maska z obrazu (segmentacja, open/close, connected components, odrzucanie instancji <1% powierzchni koloru).
- **Obecnie:** Maski jako wielokąty rysowane przez użytkownika (API/PRD), odrzucanie masek <3% apertury. Inny model wejścia – celowo (workflow rysowania masek w UI).

---

## 3. Podsumowanie

- **Zgodnie z pierwszym promptem (next-steps-implementation.md):** Wszystkie kroki 1–12 są zrealizowane; w dokumencie nie ma dalszych zaplanowanych kroków. Nic obowiązkowego do zrobienia z tego planu.
- **Zgodność z instrukcją:** Algorytm jest zgodny z instrukcją w zakresie jednostek, osi, N_target, środka, kąta 5°, testu maski i pokrycia per maska. Różnice: brak §6.4 (równomierność od środka / osie naprzemienne), brak §8 (filtr overlapów z grid hash), brak §9 (binary search spacing), brak marginesu 1.05 oraz inny model wejścia (wielokąty zamiast segmentacji z obrazu).

Jeśli chcesz pełną zgodność z instrukcją, do zrobienia:
1. Dodać filtr overlapów (§8) – grid hash, min_dist = spot_diameter * 1.05.
2. Opcjonalnie: generowanie t „od środka na zewnątrz” i/lub osie naprzemienne (§6.4).
3. Opcjonalnie: binary search dla spacing (§9) i stała min_dist_mm = spot_diameter * 1.05.
