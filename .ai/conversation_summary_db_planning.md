<conversation_summary>

<decisions>

1. Encja użytkownicy powiązana z iteracjami planów (created_by, accepted_by) dla audytu i certyfikacji.
2. Osobne tabele: images, masks (przy obrazie), plan_iterations (referencja do image_id + snapshot parametrów); maski należą do obrazu.
3. Jedna tabela spots z kolumną sequence_index jako kolejność emisji (bez osobnej tabeli sekwencji).
4. Wierzchołki masek (wielokąty) w jednej kolumnie vertices w formacie JSON.
5. Logowanie zdarzeń do bazy (tabela audit_log), nie tylko do plików.
6. Status i blokada tylko danej iteracji: status (draft/accepted/rejected), accepted_at, accepted_by; nowe iteracje przez parent_id.
7. Indeksy: parent_id, image_id, created_at na plan_iterations; iteration_id na spots; iteration_id, created_at na audit_log; image_id na masks.
8. Metryki w kolumnach tabeli plan_iterations (target_coverage_pct, achieved_coverage_pct, spots_count, plan_valid itd.).
9. „RLS” w SQLite realizowane w warstwie aplikacji (Python): filtrowanie po user_id w zapytaniach.
10. Brak partycjonowania w MVP.
11. Seed domyślnego użytkownika (user / 123) – migracja lub skrypt Pythona po migracjach; zrealizowane jako skrypt seed po uruchomieniu migracji.
12. Ścieżka obrazów (storage_path): ścieżka względna do katalogu uploadów (np. backend/uploads/ lub backend/data/uploads/); jedna konwencja w konfiguracji.
13. Struktura params_snapshot (JSON): zdefiniowany minimalny zestaw pól (scale_mm, spot_diameter_um, angle_step_deg, coverage_pct, coverage_per_mask) w dokumentacji/kontrakcie API.
14. Zamknięta lista event_type w audit_log (iteration_created, iteration_accepted, iteration_rejected, plan_generated, fallback_used); enum w kodzie.
15. Tryb demo w tej samej bazie; flaga plan_iterations.is_demo (0/1) dla rozróżnienia danych demo vs kliniczne.
16. Eksport na MVP on demand (PNG/JPG, JSON) bez zapisu ścieżek w bazie; opcjonalna tabela exports w przyszłości.
17. Uruchamianie migracji: skrypt Pythona (run_migrations.py) wykonujący pliki *.sql w kolejności nazwy + tabela schema_version; po migracjach uruchamiany seed użytkownika.
18. Równoczesna edycja: na MVP jeden użytkownik i jedno okno; ewentualnie później updated_at/version pod optimistic locking.

</decisions>

<matched_recommendations>

1. Powiązanie users z plan_iterations (created_by, accepted_by) – istotne dla audytu i przyszłej certyfikacji.
2. Model relacji: images → masks; plan_iterations → image_id + params_snapshot; iteracje wersjonowane przez parent_id.
3. Jedna tabela spots z sequence_index – unikanie duplikacji, zachowanie determinizmu sekwencji.
4. Vertices masek w JSON w jednej kolumnie – prostota MVP i zgodność z eksportem JSON.
5. Audit w bazie (audit_log) – spójny audyt i wersjonowanie pod certyfikację.
6. Blokada tylko iteracji (status accepted); historia przez nowe iteracje z parent_id.
7. Indeksy zgodne z typowymi zapytaniami (nawigacja drzewa, lista po dacie, ładowanie spotów, logi).
8. Metryki w kolumnach plan_iterations – uproszczenie odczytu i walidacji.
9. Filtrowanie po user_id w warstwie aplikacji (brak RLS w SQLite); przy migracji na PostgreSQL – polityki RLS.
10. Brak partycjonowania w MVP; archiwizacja lub partycjonowanie w PostgreSQL w późniejszej fazie.
11. Seed użytkownika domyślnego (user/123) po migracjach – skrypt Python + passlib[bcrypt].
12. Konwencja storage_path (względna) – dokumentacja w README migracji.
13. Kontrakt params_snapshot i event_type – dokumentacja w README; enum w kodzie dla spójności.
14. Flaga is_demo na plan_iterations – ta sama baza, rozróżnienie demo vs kliniczne.
15. Eksport on demand bez tabeli exports w MVP.
16. Skrypt run_migrations.py + schema_version – idempotentne uruchamianie migracji.
17. Zakładanie jednego użytkownika i jednego okna na MVP; optimistic locking opcjonalnie później.

</matched_recommendations>

<database_planning_summary>

**Główne wymagania dotyczące schematu bazy danych**

- Baza: SQLite (MVP); możliwa późniejsza migracja do PostgreSQL (zachowanie konwencji nazw, ewentualne RLS).
- Przechowywanie: użytkownicy (logowanie), obrazy i maski, iteracje planów (wersjonowanie, parametry, metryki), punkty siatki (spoty) w kolejności emisji, logi audytu.
- Idempotentne migracje (IF NOT EXISTS), śledzenie zastosowanych migracji (schema_version), seed domyślnego użytkownika po migracjach.
- Określone struktury JSON: vertices (maski), params_snapshot (parametry iteracji), payload (audit_log); zamknięta lista event_type.

**Kluczowe encje i relacje**

- **users** – id, login (unique), password_hash; relacja: created_by, accepted_by w plan_iterations.
- **images** – id, storage_path, width_mm, created_by; relacja: 1:N z masks, 1:N z plan_iterations.
- **masks** – id, image_id (FK), vertices (JSON), mask_label; należą do obrazu; CASCADE przy usunięciu obrazu.
- **plan_iterations** – id, image_id, parent_id (self-ref, wersjonowanie), created_by, status (draft/accepted/rejected), accepted_at, accepted_by, is_demo, metryki w kolumnach, params_snapshot (JSON); relacja: 1:N z spots, 1:N z audit_log.
- **spots** – id, iteration_id, sequence_index, x_mm, y_mm, theta_deg, t_mm, mask_id, component_id; CASCADE przy usunięciu iteracji.
- **audit_log** – id, iteration_id, event_type, payload (JSON), user_id, created_at.
- **schema_version** – migration_name, applied_at (tworzona przez skrypt migracji).

**Bezpieczeństwo i skalowalność**

- Bezpieczeństwo: w SQLite brak RLS; dostęp do wierszy realizowany w aplikacji (Python) przez filtrowanie po user_id (created_by, accepted_by). Przed produkcją: hash haseł (bcrypt w seed), zmiana domyślnego hasła, ewentualnie OAuth. Przy migracji na PostgreSQL – polityki RLS.
- Skalowalność: indeksy na kluczach obcych i created_at; na MVP brak partycjonowania; typowa skala to jeden użytkownik i ograniczona liczba obrazów/iteracji. W razie wzrostu: archiwizacja starych iteracji lub migracja do PostgreSQL z partycjonowaniem po dacie.

**Zrealizowane elementy drugiej rundy**

- Migracja dodająca plan_iterations.is_demo.
- Skrypt run_migrations.py (schema_version + wykonywanie *.sql + seed).
- Skrypt seed_default_user.py (user / 123 z passlib[bcrypt]).
- Dokumentacja w README migracji: params_snapshot, event_type, storage_path, is_demo, eksport on demand, równoczesna edycja, instrukcja uruchamiania migracji i seed.

</database_planning_summary>

<unresolved_issues>

- **Tabela exports:** nie w MVP; w przyszłości można dodać tabelę exports (iteration_id, format, path, created_at) jeśli wymagana będzie historia eksportów.
- **Długoterminowa architektura przechowywania:** PRD wskazuje „architektura backendowa i przechowywanie danych długoterminowo (baza, pliki, chmura) – do ustalenia”; decyzje schematu MVP tego nie zamykają.
- **Formalne testy regresji i dataset referencyjny:** świadomie poza MVP; nie wpływają na obecny schemat.
- **Wymagania regulacyjne (CE/MDR):** odłożone na później; schemat i audit_log przygotowują grunt pod audyt i certyfikację.

</unresolved_issues>

</conversation_summary>
