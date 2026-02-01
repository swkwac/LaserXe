# Checklist: test wyboru algorytmu siatki (Prosty vs Zaawansowany)

## Przygotowanie

- Backend: `uvicorn main:app --reload --port 8000`
- Frontend: `npm run dev` (Astro)
- Zalogowany użytkownik, obraz z co najmniej jedną maską

## Kroki

1. **Strona obrazu → zakładka Plan**
   - [ ] Widoczny wybór **Algorytm** z dwiema opcjami:
     - **Prosty – siatka XY 800 µm** (z podpowiedzią o odstępach i maskach)
     - **Zaawansowany (beta)** (z podpowiedzią o rozwoju i 5°)
   - [ ] Domyślnie zaznaczony **Prosty**

2. **Generowanie z algorytmem Prosty**
   - [ ] Zaznacz **Prosty**, wpisz np. 10% pokrycia, kliknij **Generuj plan**
   - [ ] Plan się generuje (bez błędu)
   - [ ] Metryki: liczba punktów, pokrycie osiągnięte, plan poprawny
   - [ ] Podgląd: punkty na siatce (regularny układ ~800 µm)

3. **Generowanie z algorytmem Zaawansowany (beta)**
   - [ ] Zaznacz **Zaawansowany (beta)**, kliknij **Generuj plan**
   - [ ] Plan się generuje (bez błędu)
   - [ ] Metryki i podgląd mogą się różnić od Prosty (średnice co 5°, inne zagęszczenie)

4. **Historia iteracji**
   - [ ] Zakładka **Historia** – tabela zawiera kolumnę **Algorytm**
   - [ ] Dla nowych iteracji w kolumnie widać „Prosty” lub „Zaawansowany (beta)” zgodnie z wyborem

5. **Opcjonalnie: E2E (Playwright)**
   - Dodać test: logowanie → wybór obrazu → Plan → wybór Prosty → Generuj → sprawdzenie odpowiedzi/redirect.
   - Dodać test: wybór Zaawansowany → Generuj → sprawdzenie.
