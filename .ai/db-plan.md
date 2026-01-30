# Plan schematu bazy danych SQLite – laserme 2.0a (MVP)

**Wersja:** 1.0  
**Data:** 2026-01-30  
**Kontekst:** Schemat dla SQLite (MVP); konwencja nazw i relacji zachowana pod ewentualną późniejszą migrację do PostgreSQL.

---

## 1. Lista tabel z kolumnami, typami danych i ograniczeniami

### 1.1. `users`

| Kolumna       | Typ     | Ograniczenia              | Opis |
|---------------|---------|---------------------------|------|
| id            | INTEGER | PRIMARY KEY AUTOINCREMENT| Identyfikator użytkownika. |
| login         | TEXT    | NOT NULL, UNIQUE          | Login (np. `user` w MVP). |
| password_hash | TEXT    | NOT NULL                  | Hash hasła (np. bcrypt, passlib). |
| created_at    | TEXT    | NOT NULL DEFAULT (datetime('now')) | Data utworzenia konta. |
| updated_at    | TEXT    |                           | Ostatnia aktualizacja (opcjonalnie). |

### 1.2. `images`

| Kolumna      | Typ    | Ograniczenia              | Opis |
|--------------|--------|---------------------------|------|
| id           | INTEGER| PRIMARY KEY AUTOINCREMENT | Identyfikator obrazu. |
| storage_path | TEXT   | NOT NULL                  | Ścieżka względna do pliku (np. `uploads/xxx.png`). |
| width_mm     | REAL   | NOT NULL                  | Szerokość zmiany w mm (skala obrazu). |
| created_by   | INTEGER| REFERENCES users(id)      | Użytkownik wgrywający obraz. |
| created_at   | TEXT   | NOT NULL DEFAULT (datetime('now')) | Data uploadu. |

### 1.3. `masks`

| Kolumna    | Typ    | Ograniczenia                              | Opis |
|------------|--------|-------------------------------------------|------|
| id         | INTEGER| PRIMARY KEY AUTOINCREMENT                | Identyfikator maski. |
| image_id   | INTEGER| NOT NULL, REFERENCES images(id) ON DELETE CASCADE | Obraz, do którego należy maska. |
| vertices   | TEXT   | NOT NULL                                  | Wierzchołki wielokąta w JSON (np. `[{"x":0,"y":0}, ...]` w mm lub px + skala). |
| mask_label | TEXT   |                                           | Etykieta maski (np. `white`, `blue`, `green`). |
| created_at | TEXT   | NOT NULL DEFAULT (datetime('now'))        | Data utworzenia. |

### 1.4. `plan_iterations`

| Kolumna                  | Typ    | Ograniczenia                                              | Opis |
|--------------------------|--------|-----------------------------------------------------------|------|
| id                       | INTEGER| PRIMARY KEY AUTOINCREMENT                                | Identyfikator iteracji. |
| image_id                 | INTEGER| NOT NULL, REFERENCES images(id)                          | Obraz, dla którego wygenerowano plan. |
| parent_id                | INTEGER| REFERENCES plan_iterations(id)                           | Poprzednia iteracja (wersjonowanie). |
| created_by               | INTEGER| REFERENCES users(id)                                     | Twórca iteracji. |
| status                   | TEXT   | NOT NULL CHECK (status IN ('draft','accepted','rejected')) DEFAULT 'draft' | Stan planu. |
| accepted_at              | TEXT   |                                                           | Czas akceptacji. |
| accepted_by              | INTEGER| REFERENCES users(id)                                     | Kto zaakceptował (gdy status = accepted). |
| is_demo                  | INTEGER| NOT NULL DEFAULT 0                                       | Tryb demo (0 = kliniczny, 1 = demo; watermark, brak akceptacji). |
| params_snapshot          | TEXT   |                                                           | Snapshot parametrów w JSON (scale_mm, spot_diameter_um, angle_step_deg, coverage_pct, coverage_per_mask). |
| target_coverage_pct      | REAL   |                                                           | Zadany % pokrycia (3–20). |
| achieved_coverage_pct    | REAL   |                                                           | Osiągnięty % pokrycia. |
| spots_count              | INTEGER|                                                           | Liczba wygenerowanych spotów. |
| spots_outside_mask_count | INTEGER|                                                           | Punkty poza maską (walidacja). |
| overlap_count            | INTEGER|                                                           | Liczba nakładających się spotów (docelowo 0). |
| plan_valid               | INTEGER| NOT NULL DEFAULT 0                                       | Czy plan spełnia kryteria (≥95% w masce, 0% overlap); 0/1. |
| created_at               | TEXT   | NOT NULL DEFAULT (datetime('now'))                        | Data utworzenia iteracji. |

### 1.5. `spots`

| Kolumna       | Typ    | Ograniczenia                                              | Opis |
|---------------|--------|-----------------------------------------------------------|------|
| id            | INTEGER| PRIMARY KEY AUTOINCREMENT                                | Identyfikator rekordu. |
| iteration_id  | INTEGER| NOT NULL, REFERENCES plan_iterations(id) ON DELETE CASCADE| Iteracja planu. |
| sequence_index| INTEGER| NOT NULL                                                 | Kolejność w sekwencji emisji (0-based). |
| x_mm          | REAL   | NOT NULL                                                 | Współrzędna X w mm (układ kartezjański). |
| y_mm          | REAL   | NOT NULL                                                 | Współrzędna Y w mm. |
| theta_deg     | REAL   | NOT NULL                                                 | Kąt obrotu w stopniach (0, 5, 10, …). |
| t_mm          | REAL   | NOT NULL                                                 | Pozycja wzdłuż osi liniowej w mm. |
| mask_id       | INTEGER| REFERENCES masks(id)                                     | Maska (tryb wielomaskowy). |
| component_id  | INTEGER|                                                           | Numer składowej/obszaru maski (wielomaskowość). |
| created_at    | TEXT   | NOT NULL DEFAULT (datetime('now'))                        | Opcjonalnie – do audytu. |

**Rekomendacja:** Ograniczenie `UNIQUE (iteration_id, sequence_index)` – gwarancja deterministycznej sekwencji; można dodać w kolejnej migracji.

### 1.6. `audit_log`

| Kolumna      | Typ    | Ograniczenia                    | Opis |
|--------------|--------|---------------------------------|------|
| id           | INTEGER| PRIMARY KEY AUTOINCREMENT      | Identyfikator wpisu. |
| iteration_id | INTEGER| REFERENCES plan_iterations(id)  | Powiązana iteracja (może być NULL dla zdarzeń globalnych). |
| event_type   | TEXT   | NOT NULL                        | Typ zdarzenia (zamknięta lista w aplikacji). |
| payload      | TEXT   |                                 | Dodatkowe dane w JSON (parametry, metryki, komunikaty). |
| user_id      | INTEGER| REFERENCES users(id)           | Użytkownik wywołujący akcję. |
| created_at   | TEXT   | NOT NULL DEFAULT (datetime('now')) | Czas zdarzenia. |

**Kontrakt event_type (enum w kodzie):** `iteration_created`, `iteration_accepted`, `iteration_rejected`, `plan_generated`, `fallback_used`.

### 1.7. `schema_version`

| Kolumna        | Typ   | Ograniczenia     | Opis |
|----------------|-------|------------------|------|
| migration_name | TEXT  | PRIMARY KEY      | Nazwa pliku migracji (np. `20260130140000_create_initial_schema.sql`). |
| applied_at     | TEXT  | NOT NULL DEFAULT (datetime('now')) | Czas zastosowania migracji. |

Tworzona i uzupełniana przez skrypt migracji (`run_migrations.py`).

---

## 2. Relacje między tabelami

| Relacja | Typ | Opis |
|---------|-----|------|
| **users** → **images** | 1:N | Jeden użytkownik może wgrać wiele obrazów (`images.created_by`). |
| **users** → **plan_iterations** | 1:N (created_by) | Użytkownik tworzy wiele iteracji. |
| **users** → **plan_iterations** | 1:N (accepted_by) | Użytkownik może zaakceptować wiele iteracji. |
| **images** → **masks** | 1:N | Jeden obraz ma wiele masek; usunięcie obrazu usuwa maski (CASCADE). |
| **images** → **plan_iterations** | 1:N | Dla jednego obrazu wiele iteracji planu. |
| **plan_iterations** → **plan_iterations** | 1:N (self) | Drzewo wersji przez `parent_id` (jedna iteracja ma co najwyżej jednego rodzica, wiele dzieci). |
| **plan_iterations** → **spots** | 1:N | Jedna iteracja ma wiele spotów w kolejności `sequence_index`; usunięcie iteracji usuwa spoty (CASCADE). |
| **plan_iterations** → **audit_log** | 1:N | Do jednej iteracji wiele wpisów audytu. |
| **masks** → **spots** | 1:N | W trybie wielomaskowym spot należy do jednej maski (`spots.mask_id`). |
| **users** → **audit_log** | 1:N | Użytkownik generuje wiele wpisów audytu (`audit_log.user_id`). |

**Tabele łączące:** Brak relacji wiele-do-wielu wymagających osobnej tabeli; powiązania realizowane przez klucze obce.

---

## 3. Indeksy

| Tabela         | Indeks | Kolumny | Cel |
|----------------|--------|---------|-----|
| masks          | idx_masks_image_id | (image_id) | Pobieranie masek po obrazie, CASCADE. |
| plan_iterations| idx_plan_iterations_parent_id | (parent_id) | Nawigacja drzewa wersji. |
| plan_iterations| idx_plan_iterations_image_id | (image_id) | Lista iteracji dla obrazu. |
| plan_iterations| idx_plan_iterations_created_at | (created_at) | Sortowanie po dacie. |
| plan_iterations| idx_plan_iterations_created_by | (created_by) | Filtrowanie po użytkowniku (warstwa aplikacji). |
| spots          | idx_spots_iteration_id | (iteration_id) | Pobieranie spotów iteracji w kolejności. |
| audit_log      | idx_audit_log_iteration_id | (iteration_id) | Logi per iteracja. |
| audit_log      | idx_audit_log_created_at | (created_at) | Audyt w czasie. |

Opcjonalnie (przy migracji lub rozszerzeniu): `idx_plan_iterations_status (status)`, `idx_spots_iteration_sequence (iteration_id, sequence_index)` (ew. UNIQUE), `idx_audit_log_user_id (user_id)`.

---

## 4. Zasady PostgreSQL (RLS) – gdy dotyczy migracji

W **SQLite RLS nie istnieje**. Dostęp do wierszy realizowany jest w warstwie aplikacji (Python): filtrowanie po `user_id` (created_by, accepted_by) w zapytaniach. Przed produkcją: hash haseł (bcrypt w seed), zmiana domyślnego hasła, ewentualnie OAuth.

Przy **migracji na PostgreSQL** można włączyć RLS i zdefiniować polityki, np.:

- **images:** SELECT/INSERT/UPDATE/DELETE tylko gdy `created_by = current_setting('app.current_user_id')::BIGINT` (lub rola admin).
- **plan_iterations:** SELECT/INSERT/UPDATE gdy `created_by = current_setting('app.current_user_id')::BIGINT`; UPDATE do ustawienia `accepted_by`/`status` zgodnie z regułami biznesowymi.
- **audit_log:** SELECT gdy wpis dotyczy iteracji należącej do użytkownika (JOIN z plan_iterations); INSERT dla zalogowanego użytkownika.

Konkretna implementacja zależy od wyboru uwierzytelnienia (sesja vs JWT, rola admin). W MVP z jednym użytkownikiem RLS może być przygotowane w dokumentacji, ale nie jest wymagane w SQLite.

---

## 5. Uwagi i decyzje projektowe

### 5.1. Normalizacja

Schemat jest w **3NF**: encje użytkownika, obrazu, maski, iteracji i spotów są rozdzielone; powtarzalne dane (parametry iteracji) są w `params_snapshot` (JSON w TEXT) jako snapshot, bez denormalizacji do osobnych tabel – ułatwia to audyt i wersjonowanie.

### 5.2. Typy danych (SQLite)

- **INTEGER** – klucze, liczniki, flagi (plan_valid, is_demo jako 0/1).
- **REAL** – pomiary (mm, stopnie, %); w SQLite brak NUMERIC, REAL jest wystarczający dla MVP.
- **TEXT** – stringi, daty (ISO 8601 / `datetime('now')`), JSON (vertices, params_snapshot, payload).
- **CHECK** – status w plan_iterations; event_type egzekwowany w aplikacji (enum) i opcjonalnie CHECK w przyszłej migracji.

### 5.3. Kontrakt JSON

- **params_snapshot:** minimalnie `scale_mm`, `spot_diameter_um`, `angle_step_deg`, `coverage_pct`, `coverage_per_mask` (tryb wielomaskowy) – zgodnie z dokumentacją i PRD.
- **vertices:** tablica punktów `{ "x": number, "y": number }` w mm (po przeliczeniu skali) lub w pikselach z odniesieniem do skali – zgodnie z eksportem JSON z PRD.
- **event_type:** zamknięta lista w kodzie (enum); wartości: iteration_created, iteration_accepted, iteration_rejected, plan_generated, fallback_used.

### 5.4. Tryb demo

Kolumna `plan_iterations.is_demo` (0/1) rozróżnia dane demo od klinicznych w tej samej bazie; zapytania mogą filtrować `WHERE is_demo = 0` dla widoku klinicznego.

### 5.5. Ścieżka obrazów

`images.storage_path` – ścieżka **względna** do katalogu uploadów (np. `uploads/xxx.png`); konwencja w konfiguracji/README migracji.

### 5.6. Eksport

W MVP eksport (PNG/JPG, JSON) jest **on demand**, bez tabeli `exports`. W przyszłości można dodać tabelę `exports(iteration_id, format, storage_path, created_at)` do historii eksportów.

### 5.7. Seed użytkownika

Domyślny użytkownik (login: **user**, hasło: **123**) tworzony jest **po migracjach** skryptem Pythona (`seed_default_user.py`) z hashowanym hasłem (np. passlib/bcrypt). Nie jest częścią schematu SQL – tylko danych początkowych.

### 5.8. Partycjonowanie

W MVP **brak partycjonowania**. Przy migracji na PostgreSQL i wzroście wolumenu (audit_log, spots) można rozważyć partycjonowanie po dacie (np. created_at).

### 5.9. Równoczesna edycja

Na MVP zakładany jest jeden użytkownik i jedno okno; ewentualnie później `updated_at` / kolumna `version` pod optimistic locking.

---

*Schemat jest zgodny z migracjami w `backend/migrations/` i gotowy do wykorzystania jako podstawa dalszych migracji oraz odniesienie przy utrzymaniu bazy SQLite i ewentualnej migracji do PostgreSQL.*
