# Migracje SQLite

Skrypty SQL do wersjonowania schematu bazy laserme 2.0a MVP.

## Konwencja nazw plików

`YYYYMMDDHHmmss_krotki_opis.sql` (UTC), np. `20260130140000_create_initial_schema.sql`.

## Schemat (decyzje projektowe)

| Tabela | Opis |
|--------|------|
| **users** | Użytkownicy (login, password_hash). Powiązanie z iteracjami (created_by, accepted_by) dla audytu. |
| **images** | Obrazy zmian skórnych (storage_path, width_mm). Maski należą do obrazu. |
| **masks** | Maski obszaru zabiegowego. Wierzchołki wielokąta w jednej kolumnie **vertices** (JSON). |
| **plan_iterations** | Iteracje planów: image_id, parent_id (wersjonowanie), status (draft/accepted/rejected), accepted_at/accepted_by, metryki w kolumnach (target/achieved_coverage_pct, spots_count, plan_valid), params_snapshot (JSON). |
| **spots** | Punkty siatki w jednej tabeli; **sequence_index** = kolejność emisji. x_mm, y_mm, theta_deg, t_mm; opcjonalnie mask_id, component_id. |
| **audit_log** | Logi zdarzeń (iteration_id, event_type, payload JSON, user_id). Audyt i certyfikacja. |

- **Bezpieczeństwo na poziomie wierszy:** w SQLite brak RLS; filtrowanie po `user_id` w warstwie aplikacji (Python).
- **Indeksy:** parent_id, image_id, created_at (plan_iterations); iteration_id (spots); iteration_id, created_at (audit_log); image_id (masks).
- **Partycjonowanie:** nie w MVP.
- **Tryb demo:** ta sama baza; kolumna `plan_iterations.is_demo` (0/1) odróżnia dane demo od klinicznych.
- **Ścieżka obrazów:** `images.storage_path` – ścieżka względna do katalogu uploadów (np. `backend/uploads/` lub `backend/data/uploads/`); jedną konwencję ustalić w konfiguracji.
- **Eksport:** na MVP eksport PNG/JPG i JSON on demand, bez zapisu ścieżek w bazie; opcjonalna tabela `exports` w przyszłości.
- **Równoczesna edycja:** na MVP zakładamy jednego użytkownika i jedno okno; ewentualnie później `updated_at` / `version` pod optimistic locking.

### Struktura `params_snapshot` (JSON)

Minimalny zestaw pól (spójny z eksportem i logami):

- `scale_mm` – szerokość zmiany w mm
- `spot_diameter_um` – średnica spotu w µm (parametr techniczny)
- `angle_step_deg` – krok kąta w ° (np. 5)
- `coverage_pct` – docelowy % pokrycia (pojedyncza maska / union)
- `coverage_per_mask` – opcjonalnie obiekt mask_id → % (tryb wielomaskowy)

### Typy zdarzeń `audit_log.event_type`

Zamknięta lista (enum w kodzie, np. Python/TypeScript):

- `iteration_created`
- `iteration_accepted`
- `iteration_rejected`
- `plan_generated`
- `fallback_used`

### Uruchamianie migracji i seed

- Skrypt: `python backend/scripts/run_migrations.py` (z katalogu projektu) lub `python scripts/run_migrations.py` (z katalogu backend).
- Zmienna środowiskowa `DATABASE_URL` (np. `sqlite:///./laserme.db`); domyślnie plik `./laserme.db`.
- Skrypt tworzy tabelę `schema_version`, wykonuje pliki `*.sql` z `backend/migrations/` w kolejności nazwy, następnie seed domyślnego użytkownika (login: **user**, hasło: **123**) jeśli tabela `users` jest pusta. Wymaga: `passlib[bcrypt]`.
- Weryfikacja schematu po migracjach: `python backend/scripts/verify_schema.py [ścieżka_do_bazy]` – wypisuje tabele, kolumny i indeksy oraz listę zastosowanych migracji.
