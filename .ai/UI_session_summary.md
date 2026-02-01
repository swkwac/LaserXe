<conversation_summary>
<decisions>
1. Widok „Szczegóły obrazu” z zakładkami jako główna struktura ekranu (zgodnie z rekomendacją 1).
2. Po uploadzie przekierowanie do „Szczegóły obrazu” z aktywną zakładką Maski (zgodnie z rekomendacją 1 z drugiej tury).
3. Edycja `width_mm` możliwa po uploadzie, z ostrzeżeniem o unieważnieniu iteracji (zgodnie z rekomendacją 2).
4. Informacja o deterministyczności planu jako tooltip (zgodnie z rekomendacją 3).
5. Tryb demo dostępny jako przycisk na ekranie logowania, ustawiający `is_demo=true` (zgodnie z rekomendacją 4).
6. Metryki walidacji widoczne w UI; miejsce na nie zawsze, dane po generacji (zgodnie z rekomendacją 5).
7. Eksport CSV dostępny tylko po udanej generacji planu (zgodnie z rekomendacją 6).
8. Podczas generacji planu blokada edycji i czytelny stan „Generowanie w toku” (zgodnie z rekomendacją 7).
9. Walidacja formatów obrazów w UI + pełne komunikaty błędów z API (zgodnie z rekomendacją 8).
10. Brak widoku audytu w MVP; logi tylko po stronie backendu (odpowiedź „nie” na rekomendację 9).
11. Cache spotów tylko w pamięci sesji (zgodnie z rekomendacją 10).
</decisions>

<matched_recommendations>
1. Uporządkowanie workflow przez zakładki w „Szczegóły obrazu”.
2. Bezpośrednie przejście do edycji masek po uploadzie.
3. Możliwość korekty skali obrazu z oznaczeniem nieaktualnych iteracji.
4. Dyskretna informacja o deterministyczności (tooltip).
5. Szybki „Tryb demo” z flagą `is_demo`.
6. Stałe miejsce na metryki walidacji, wypełniane po generacji.
7. Eksport CSV tylko po wygenerowaniu planu.
8. Blokada edycji w trakcie generacji planu.
9. Walidacja plików na UI i wyświetlanie błędów z API.
10. Cache spotów tylko w pamięci sesji (bez trwałego zapisu).
</matched_recommendations>

<ui_architecture_planning_summary>
a) Główne wymagania UI:
- Ekran logowania jako brama do aplikacji (MVP, kliniczny dostęp).
- Liniowy workflow: upload obrazu → skala (`width_mm`) → maski → generacja planu → animacja → akceptacja.
- Czytelna wizualizacja (overlay punktów, legenda, gradient sekwencji), metryki walidacji i status planu.
- Tryb demo z watermarkiem i blokadą akceptacji.

b) Kluczowe widoki, ekrany i przepływy:
- Login + wejście w „Tryb demo”.
- Lista obrazów (opcjonalna), ale po uploadzie zawsze „Szczegóły obrazu”.
- „Szczegóły obrazu” z zakładkami: Maski, Plan, Animacja, Historia iteracji.
- Widok planu zawiera metryki, status, przyciski generacji/akceptacji oraz eksporty.

c) Strategia integracji z API i zarządzania stanem:
- Upload i skala: `POST /api/images`, korekta skali `PATCH /api/images/{id}`.
- Maski: CRUD `GET/POST/PATCH/DELETE /api/images/{image_id}/masks`, z walidacją <3% apertury.
- Iteracje: generacja `POST /api/images/{image_id}/iterations`, lista `GET /api/images/{image_id}/iterations`, status `PATCH /api/iterations/{id}`.
- Spoty do animacji/overlay: `GET /api/iterations/{id}/spots` (JSON/CSV).
- Cache spotów tylko w pamięci sesji; odświeżanie po zmianie statusu lub regeneracji.

d) Responsywność, dostępność, bezpieczeństwo:
- Layout z priorytetem dużego obszaru roboczego (canvas) i panelu parametrów.
- Czytelne kontrasty kolorów masek i gradientu emisji.
- Dostępność: klawiaturowa obsługa kluczowych akcji, jasne komunikaty błędów.
- Bezpieczeństwo: wszystkie endpointy `/api` zabezpieczone sesją/cookie; UI reaguje na 401/403 i pokazuje komunikaty.

e) Nierozwiązane kwestie:
- Dokładne kryteria responsywności (urządzenia docelowe, minimalne rozdzielczości).
- Sposób przedstawienia historii iteracji (lista vs oś czasu, zakres metryk).
- Szczegółowy UX dla trybu multi-mask (tabela pokryć per maska, kolejność priorytetów).
</ui_architecture_planning_summary>

<unresolved_issues>
1. Docelowe profile urządzeń i minimalne rozmiary UI.
2. Szczegółowy UI/UX historii iteracji (forma i zakres danych).
3. Dokładny projekt widoku multi-mask (edycja procentów, wizualne rozróżnienie).
</unresolved_issues>
</conversation_summary>
