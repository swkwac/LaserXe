-- Dodanie flagi trybu demo do plan_iterations (ta sama baza, rozróżnienie danych demo vs kliniczne)
alter table plan_iterations add column is_demo integer not null default 0;
