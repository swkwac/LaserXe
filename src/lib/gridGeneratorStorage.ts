import type { GridGeneratorRequestDto } from "@/types";

const STORAGE_KEY = "laserxe_grid_generator_params";

export type StoredGridParams = GridGeneratorRequestDto & {
  simple_input_mode?: "coverage" | "spacing";
};

/**
 * Load last-used grid generator params from localStorage.
 * Returns null if not found or invalid.
 */
export function loadGridGeneratorParams(): StoredGridParams | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Record<string, unknown>;
    const aperture_type = p.aperture_type;
    const spot_diameter_um = p.spot_diameter_um;
    if (aperture_type !== "simple" && aperture_type !== "advanced") {
      return null;
    }
    if (spot_diameter_um !== 300 && spot_diameter_um !== 150) return null;

    const result: StoredGridParams = {
      aperture_type,
      spot_diameter_um,
    };

    if (aperture_type === "simple") {
      const mode = p.simple_input_mode;
      if (mode === "spacing") {
        if (typeof p.axis_distance_mm !== "number" || p.axis_distance_mm < 0.5 || p.axis_distance_mm > 3) {
          return null;
        }
        result.axis_distance_mm = p.axis_distance_mm;
        result.simple_input_mode = "spacing";
      } else {
        const target_coverage_pct = p.target_coverage_pct;
        if (typeof target_coverage_pct !== "number" || target_coverage_pct < 0.1 || target_coverage_pct > 100) {
          return null;
        }
        result.target_coverage_pct = target_coverage_pct;
        result.simple_input_mode = "coverage";
      }
    } else {
      const target_coverage_pct = p.target_coverage_pct;
      if (typeof target_coverage_pct !== "number" || target_coverage_pct < 0.1 || target_coverage_pct > 100) {
        return null;
      }
      result.target_coverage_pct = target_coverage_pct;
      if (typeof p.angle_step_deg === "number" && p.angle_step_deg >= 3 && p.angle_step_deg <= 20) {
        result.angle_step_deg = p.angle_step_deg;
      }
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Save grid generator params to localStorage (after successful generation).
 */
export function saveGridGeneratorParams(params: StoredGridParams): void {
  if (typeof window === "undefined") return;
  try {
    const toSave: Record<string, unknown> = {
      aperture_type: params.aperture_type,
      spot_diameter_um: params.spot_diameter_um,
    };
    if (params.aperture_type === "simple") {
      toSave.simple_input_mode = params.simple_input_mode ?? "coverage";
      if (params.simple_input_mode === "spacing" && params.axis_distance_mm != null) {
        toSave.axis_distance_mm = params.axis_distance_mm;
      } else if (params.target_coverage_pct != null) {
        toSave.target_coverage_pct = params.target_coverage_pct;
      }
    } else {
      if (params.target_coverage_pct != null) toSave.target_coverage_pct = params.target_coverage_pct;
      if (params.angle_step_deg != null) toSave.angle_step_deg = params.angle_step_deg;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // ignore storage errors
  }
}
