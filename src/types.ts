// DTO and Command Model types derived from the SQLite schema and API plan.
// Naming: *EntityDto mirrors DB tables; *Dto is API shape; *Command is request/input.

export type IdDto = number;
export type IsoDateTimeStringDto = string;
export type SqliteBoolDto = 0 | 1;

// --- Entity DTOs (1:1 with DB tables) ---
export type UserEntityDto = {
  id: IdDto;
  login: string;
  password_hash: string;
  created_at: IsoDateTimeStringDto;
  updated_at: IsoDateTimeStringDto | null;
};

export type ImageEntityDto = {
  id: IdDto;
  storage_path: string;
  width_mm: number;
  created_by: IdDto | null;
  created_at: IsoDateTimeStringDto;
};

export type MaskEntityDto = {
  id: IdDto;
  image_id: IdDto;
  // Stored as JSON text in DB; API DTO uses structured points.
  vertices: string;
  mask_label: string | null;
  created_at: IsoDateTimeStringDto;
};

export type PlanIterationEntityDto = {
  id: IdDto;
  image_id: IdDto;
  parent_id: IdDto | null;
  created_by: IdDto | null;
  status: "draft" | "accepted" | "rejected";
  accepted_at: IsoDateTimeStringDto | null;
  accepted_by: IdDto | null;
  is_demo: SqliteBoolDto;
  params_snapshot: string | null;
  target_coverage_pct: number | null;
  achieved_coverage_pct: number | null;
  spots_count: number | null;
  spots_outside_mask_count: number | null;
  overlap_count: number | null;
  plan_valid: SqliteBoolDto;
  created_at: IsoDateTimeStringDto;
};

export type SpotEntityDto = {
  id: IdDto;
  iteration_id: IdDto;
  sequence_index: number;
  x_mm: number;
  y_mm: number;
  theta_deg: number;
  t_mm: number;
  mask_id: IdDto | null;
  component_id: number | null;
  created_at: IsoDateTimeStringDto;
};

export type AuditLogEntityDto = {
  id: IdDto;
  iteration_id: IdDto | null;
  event_type:
    | "iteration_created"
    | "iteration_accepted"
    | "iteration_rejected"
    | "plan_generated"
    | "fallback_used";
  payload: string | null;
  user_id: IdDto | null;
  created_at: IsoDateTimeStringDto;
};

// --- Shared DTO building blocks ---
export type MaskVertexDto = {
  x: number;
  y: number;
};

// Map of mask_id (or label) -> coverage percentage.
export type CoveragePerMaskDto = Record<string, number>;

export type IterationParamsSnapshotDto = {
  scale_mm: number;
  spot_diameter_um: number;
  angle_step_deg: number;
  coverage_pct: number | null;
  coverage_per_mask: CoveragePerMaskDto | null;
};

export type PagedResultDto<TItem> = {
  items: TItem[];
  total: number;
  page: number;
  page_size: number;
};

export type ItemsResultDto<TItem> = {
  items: TItem[];
};

// --- Auth DTOs ---
export type AuthUserDto = Pick<UserEntityDto, "id" | "login">;

export type AuthLoginResponseDto =
  | { token: string; user: AuthUserDto }
  | { user: AuthUserDto };

// --- Health DTO ---
export type HealthStatusDto = {
  status: "ok";
};

// --- Image DTOs ---
export type ImageDto = ImageEntityDto;

export type ImageListResponseDto = PagedResultDto<ImageDto>;

// --- Mask DTOs ---
export type MaskDto = Omit<MaskEntityDto, "vertices"> & {
  vertices: MaskVertexDto[];
};

export type MaskListResponseDto = ItemsResultDto<MaskDto>;

// --- Iteration DTOs ---
export type IterationDto = Omit<PlanIterationEntityDto, "params_snapshot"> & {
  params_snapshot: IterationParamsSnapshotDto | null;
};

export type IterationListResponseDto = PagedResultDto<IterationDto>;

// --- Spot DTOs ---
export type SpotDto = SpotEntityDto;

export type IterationSpotsResponseDto = ItemsResultDto<SpotDto>;

// --- Audit log DTOs ---
export type AuditLogEntryDto = Omit<AuditLogEntityDto, "payload"> & {
  payload: Record<string, unknown> | null;
};

export type AuditLogListResponseDto = PagedResultDto<AuditLogEntryDto>;

// --- Export DTOs (JSON export) ---
export type ExportMaskDto = Pick<MaskDto, "id" | "vertices" | "mask_label">;

export type ExportSpotDto = Omit<SpotDto, "created_at"> & {
  // Optional for multi-mask exports; not stored in DB.
  theta_k?: number;
};

export type IterationExportJsonDto = {
  metadata: {
    version: string;
    iteration_id: IdDto;
    parent_id: IdDto | null;
    created_at: IsoDateTimeStringDto;
    params: IterationParamsSnapshotDto | null;
  };
  masks: ExportMaskDto[];
  points: ExportSpotDto[];
  metrics: {
    target_coverage_pct: number | null;
    achieved_coverage_pct: number | null;
    spots_count: number | null;
    spots_outside_mask_count: number | null;
    overlap_count: number | null;
  };
  validation: {
    plan_valid: SqliteBoolDto;
    errors?: string[];
  };
};

// --- Command Models (requests / query params) ---
export type AuthLoginCommand = {
  login: string;
  password: string;
};

export type ImageUploadCommand = {
  file: File;
  width_mm: number;
};

export type ImageUpdateCommand = Partial<Pick<ImageDto, "width_mm">>;

export type ImageListQueryCommand = {
  page?: number;
  page_size?: number;
  sort?: "created_at" | "id";
  order?: "asc" | "desc";
};

export type MaskCreateCommand = {
  vertices: MaskVertexDto[];
  mask_label?: string;
};

export type MaskUpdateCommand = Partial<MaskCreateCommand>;

export type IterationCreateCommand = {
  target_coverage_pct: number;
  coverage_per_mask?: CoveragePerMaskDto;
  is_demo?: boolean;
};

export type IterationUpdateCommand = {
  status?: PlanIterationEntityDto["status"];
};

export type IterationListQueryCommand = {
  page?: number;
  page_size?: number;
  status?: PlanIterationEntityDto["status"];
  // Query param is a boolean in API; DB stores as 0/1.
  is_demo?: boolean;
  sort?: "created_at" | "id";
  order?: "asc" | "desc";
};

export type SpotListQueryCommand = {
  format?: "json" | "csv";
};

export type AuditLogListQueryCommand = {
  page?: number;
  page_size?: number;
  iteration_id?: IdDto;
  user_id?: IdDto;
  event_type?: AuditLogEntityDto["event_type"];
  from?: IsoDateTimeStringDto;
  to?: IsoDateTimeStringDto;
  sort?: "created_at";
  order?: "asc" | "desc";
};

export type ExportQueryCommand = {
  format: "json" | "png" | "jpg";
};
