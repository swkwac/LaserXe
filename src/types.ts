// DTO and Command Model types derived from the SQLite schema and API plan.
// Naming: *EntityDto mirrors DB tables; *Dto is API shape; *Command is request/input.

export type IdDto = number;
export type IsoDateTimeStringDto = string;
export type SqliteBoolDto = 0 | 1;

// --- Entity DTOs (1:1 with DB tables) ---
export interface UserEntityDto {
  id: IdDto;
  login: string;
  password_hash: string;
  created_at: IsoDateTimeStringDto;
  updated_at: IsoDateTimeStringDto | null;
}

export interface ImageEntityDto {
  id: IdDto;
  storage_path: string;
  width_mm: number;
  created_by: IdDto | null;
  created_at: IsoDateTimeStringDto;
}

export interface MaskEntityDto {
  id: IdDto;
  image_id: IdDto;
  // Stored as JSON text in DB; API DTO uses structured points.
  vertices: string;
  mask_label: string | null;
  created_at: IsoDateTimeStringDto;
}

export interface PlanIterationEntityDto {
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
}

export interface SpotEntityDto {
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
}

export interface AuditLogEntityDto {
  id: IdDto;
  iteration_id: IdDto | null;
  event_type: "iteration_created" | "iteration_accepted" | "iteration_rejected" | "plan_generated" | "fallback_used";
  payload: string | null;
  user_id: IdDto | null;
  created_at: IsoDateTimeStringDto;
}

// --- Shared DTO building blocks ---
export interface MaskVertexDto {
  x: number;
  y: number;
}

// Map of mask_id (or label) -> coverage percentage.
export type CoveragePerMaskDto = Record<string, number>;

export interface IterationParamsSnapshotDto {
  scale_mm: number;
  spot_diameter_um: number;
  angle_step_deg: number;
  coverage_pct: number | null;
  coverage_per_mask: CoveragePerMaskDto | null;
  algorithm_mode?: "simple" | "advanced";
  grid_spacing_mm?: number;
}

export interface PagedResultDto<TItem> {
  items: TItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ItemsResultDto<TItem> {
  items: TItem[];
}

// --- Auth DTOs ---
export type AuthUserDto = Pick<UserEntityDto, "id" | "login">;

export type AuthLoginResponseDto = { token: string; user: AuthUserDto } | { user: AuthUserDto };

// --- Health DTO ---
export interface HealthStatusDto {
  status: "ok";
}

// --- Device control DTOs ---
export interface DeviceSerialConfigDto {
  pico_port: string | null;
  pico_baud: number;
  rotation_backend?: "pico" | "arduino_grbl";
}

export interface DeviceLinearAxisConfigDto {
  travel_min_mm: number;
  travel_max_mm: number;
  encoder_resolution_nm: number;
  xda_axis: string;
  max_speed_units?: number | null;
  in_position_tolerance_units?: number;
  move_timeout_ms?: number;
}

export interface DeviceRotationAxisConfigDto {
  travel_min_deg: number;
  travel_max_deg: number;
  motor_steps_per_rev: number;
  microsteps: number;
  gear_ratio: number;
  encoder_cpr: number;
  max_speed_steps_per_s: number;
  accel_steps_per_s2: number;
  encoder_correction_threshold?: number;
}

export interface DeviceConfigDto {
  serial: DeviceSerialConfigDto;
  linear: DeviceLinearAxisConfigDto;
  rotation: DeviceRotationAxisConfigDto;
}

export interface DeviceConfigComputedDto {
  linear_units_per_mm: number;
  rotation_steps_per_deg: number;
  rotation_encoder_counts_per_deg: number;
}

export interface DeviceConfigResponseDto {
  config: DeviceConfigDto;
  computed: DeviceConfigComputedDto;
}

export type DeviceAxis = "linear" | "rotation" | "both";

export interface DeviceWaypointDto {
  linear_mm: number;
  rotation_deg: number;
  dwell_ms?: number | null;
}

export interface DeviceCommandDto {
  type:
    | "home"
    | "move_abs"
    | "move_rel"
    | "stop"
    | "emergency_stop"
    | "jog"
    | "jog_stop"
    | "pattern_start"
    | "pattern_cancel"
    | "status";
  axis?: DeviceAxis;
  value?: number;
  unit?: "mm" | "deg";
  speed?: number;
  pattern?: DeviceWaypointDto[];
}

export interface DeviceCommandResponseDto {
  ok: boolean;
  sent: Record<string, unknown>;
  message?: string | null;
}

export interface DeviceStatusDto {
  connected: boolean;
  last_error?: string | null;
  linear_position_mm?: number | null;
  rotation_position_deg?: number | null;
  linear_moving?: boolean | null;
  rotation_moving?: boolean | null;
  last_update?: string | null;
  firmware_version?: string | null;
}

export interface DevicePositionPresetDto {
  name: string;
  linear_mm: number;
  rotation_deg: number;
}

export interface DevicePatternDto {
  name: string;
  waypoints: DeviceWaypointDto[];
}

export interface DeviceSerialPortDto {
  port: string;
  description: string;
  hwid: string;
}

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

export interface IterationExportJsonDto {
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
}

// --- Command Models (requests / query params) ---
export interface AuthLoginCommand {
  login: string;
  password: string;
}

export interface ImageUploadCommand {
  file: File;
  width_mm: number;
}

export type ImageUpdateCommand = Partial<Pick<ImageDto, "width_mm">>;

export interface ImageListQueryCommand {
  page?: number;
  page_size?: number;
  sort?: "created_at" | "id";
  order?: "asc" | "desc";
}

export interface MaskCreateCommand {
  vertices: MaskVertexDto[];
  mask_label?: string;
}

export type MaskUpdateCommand = Partial<MaskCreateCommand>;

export interface IterationCreateCommand {
  target_coverage_pct: number;
  coverage_per_mask?: CoveragePerMaskDto;
  is_demo?: boolean;
  algorithm_mode?: "simple" | "advanced";
  grid_spacing_mm?: number;
}

export interface IterationUpdateCommand {
  status?: PlanIterationEntityDto["status"];
}

export interface IterationListQueryCommand {
  page?: number;
  page_size?: number;
  status?: PlanIterationEntityDto["status"];
  // Query param is a boolean in API; DB stores as 0/1.
  is_demo?: boolean;
  algorithm_mode?: "simple" | "advanced";
  sort?: "created_at" | "id";
  order?: "asc" | "desc";
}

export interface SpotListQueryCommand {
  format?: "json" | "csv";
}

export interface AuditLogListQueryCommand {
  page?: number;
  page_size?: number;
  iteration_id?: IdDto;
  user_id?: IdDto;
  event_type?: AuditLogEntityDto["event_type"];
  from?: IsoDateTimeStringDto;
  to?: IsoDateTimeStringDto;
  sort?: "created_at";
  order?: "asc" | "desc";
}

export interface ExportQueryCommand {
  format: "json" | "png" | "jpg";
}

// --- Grid Generator DTOs (standalone, no image) ---

export interface GridGeneratorRequestDto {
  aperture_type: "simple" | "advanced";
  spot_diameter_um: 300 | 150;
  /** Required for advanced; for simple use when input mode is "coverage". */
  target_coverage_pct?: number;
  /** For simple aperture when input mode is "spacing". */
  axis_distance_mm?: number;
  /** For advanced aperture. */
  angle_step_deg?: number;
}

export interface GridGeneratorSpotDto {
  sequence_index: number;
  x_mm: number;
  y_mm: number;
  theta_deg: number;
  t_mm: number;
  mask_id: null;
  component_id: null;
}

export interface GridGeneratorParamsDto {
  aperture_type: "simple" | "advanced";
  spot_diameter_um: number;
  target_coverage_pct: number;
  axis_distance_mm: number | null;
  angle_step_deg: number | null;
}

export interface GridGeneratorResponseDto {
  spots: GridGeneratorSpotDto[];
  spots_count: number;
  achieved_coverage_pct: number;
  params: GridGeneratorParamsDto;
}
