-- Migracja: indeksy opcjonalne z planu db-plan.md (sekcja 3)
-- Tabele: spots (UNIQUE), plan_iterations, audit_log
-- Cel: deterministyczna sekwencja spotów; szybsze filtrowanie po statusie i user_id.
-- Uwaga: UNIQUE na (iteration_id, sequence_index) może nie wykonać się, jeśli w bazie są duplikaty – wtedy należy je usunąć przed migracją.

-- ---------------------------------------------------------------------------
-- spots – gwarancja deterministycznej sekwencji (jeden indeks na iterację i kolejność)
-- ---------------------------------------------------------------------------
create unique index if not exists idx_spots_iteration_sequence on spots(iteration_id, sequence_index);

-- ---------------------------------------------------------------------------
-- plan_iterations – filtrowanie po statusie (draft/accepted/rejected)
-- ---------------------------------------------------------------------------
create index if not exists idx_plan_iterations_status on plan_iterations(status);

-- ---------------------------------------------------------------------------
-- audit_log – filtrowanie po użytkowniku (warstwa aplikacji / audyt)
-- ---------------------------------------------------------------------------
create index if not exists idx_audit_log_user_id on audit_log(user_id);
