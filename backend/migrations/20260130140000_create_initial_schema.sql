-- Migracja: schemat początkowy bazy SQLite dla laserme 2.0a MVP
-- Tabele: users, images, masks, plan_iterations, spots, audit_log
-- Zgodnie z zatwierdzonymi rekomendacjami (pytania 1–10)

-- ---------------------------------------------------------------------------
-- users – użytkownicy (logowanie, audyt)
-- ---------------------------------------------------------------------------
create table if not exists users (
  id integer primary key autoincrement,
  login text not null unique,
  password_hash text not null,
  created_at text not null default (datetime('now')),
  updated_at text
);

-- ---------------------------------------------------------------------------
-- images – obrazy zmian skórnych (upload, skala)
-- ---------------------------------------------------------------------------
create table if not exists images (
  id integer primary key autoincrement,
  storage_path text not null,
  width_mm real not null,
  created_by integer,
  created_at text not null default (datetime('now')),
  foreign key (created_by) references users(id)
);

-- ---------------------------------------------------------------------------
-- masks – maski obszaru zabiegowego (wielokąty, JSON vertices)
-- ---------------------------------------------------------------------------
create table if not exists masks (
  id integer primary key autoincrement,
  image_id integer not null,
  vertices text not null,
  mask_label text,
  created_at text not null default (datetime('now')),
  foreign key (image_id) references images(id) on delete cascade
);

create index if not exists idx_masks_image_id on masks(image_id);

-- ---------------------------------------------------------------------------
-- plan_iterations – iteracje planów (wersjonowanie, parent_id, status, metryki)
-- ---------------------------------------------------------------------------
create table if not exists plan_iterations (
  id integer primary key autoincrement,
  image_id integer not null,
  parent_id integer,
  created_by integer,
  status text not null check (status in ('draft', 'accepted', 'rejected')) default 'draft',
  accepted_at text,
  accepted_by integer,
  target_coverage_pct real,
  achieved_coverage_pct real,
  spots_count integer,
  spots_outside_mask_count integer,
  overlap_count integer,
  plan_valid integer not null default 0,
  params_snapshot text,
  created_at text not null default (datetime('now')),
  foreign key (image_id) references images(id),
  foreign key (parent_id) references plan_iterations(id),
  foreign key (created_by) references users(id),
  foreign key (accepted_by) references users(id)
);

create index if not exists idx_plan_iterations_parent_id on plan_iterations(parent_id);
create index if not exists idx_plan_iterations_image_id on plan_iterations(image_id);
create index if not exists idx_plan_iterations_created_at on plan_iterations(created_at);
create index if not exists idx_plan_iterations_created_by on plan_iterations(created_by);

-- ---------------------------------------------------------------------------
-- spots – punkty siatki (sekwencja emisji w jednej tabeli, sequence_index)
-- ---------------------------------------------------------------------------
create table if not exists spots (
  id integer primary key autoincrement,
  iteration_id integer not null,
  sequence_index integer not null,
  x_mm real not null,
  y_mm real not null,
  theta_deg real not null,
  t_mm real not null,
  mask_id integer,
  component_id integer,
  created_at text not null default (datetime('now')),
  foreign key (iteration_id) references plan_iterations(id) on delete cascade,
  foreign key (mask_id) references masks(id)
);

create index if not exists idx_spots_iteration_id on spots(iteration_id);

-- ---------------------------------------------------------------------------
-- audit_log – logi iteracji, parametrów, fallbacków (audyt, certyfikacja)
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id integer primary key autoincrement,
  iteration_id integer,
  event_type text not null,
  payload text,
  user_id integer,
  created_at text not null default (datetime('now')),
  foreign key (iteration_id) references plan_iterations(id),
  foreign key (user_id) references users(id)
);

create index if not exists idx_audit_log_iteration_id on audit_log(iteration_id);
create index if not exists idx_audit_log_created_at on audit_log(created_at);
