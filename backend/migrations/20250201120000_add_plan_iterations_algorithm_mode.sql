-- Kolumna algorithm_mode w plan_iterations (filtr/analytics; params_snapshot nadal źródłem prawdy)
-- Tabela: plan_iterations

alter table plan_iterations add column algorithm_mode text;

-- Backfill z params_snapshot (JSON): json_extract(params_snapshot, '$.algorithm_mode')
update plan_iterations
set algorithm_mode = json_extract(params_snapshot, '$.algorithm_mode')
where params_snapshot is not null and json_extract(params_snapshot, '$.algorithm_mode') is not null;
