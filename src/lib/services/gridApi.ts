/**
 * Grid Generator API: standalone grid generation (no image).
 * Uses apiFetch for auth and 401 redirect.
 */
import { fetchJsonOrThrow } from "@/lib/apiErrors";
import type { GridGeneratorRequestDto, GridGeneratorResponseDto } from "@/types";

/**
 * Generates grid for simple (12×12 mm) or advanced (25 mm diameter) aperture.
 * On 4xx/5xx throws Error with long formatted API detail.
 */
export async function generateGrid(body: GridGeneratorRequestDto): Promise<GridGeneratorResponseDto> {
  const payload: Record<string, unknown> = {
    aperture_type: body.aperture_type,
    spot_diameter_um: body.spot_diameter_um,
  };
  if (body.aperture_type === "simple") {
    if (body.axis_distance_mm != null) {
      payload.axis_distance_mm = body.axis_distance_mm;
    } else if (body.target_coverage_pct != null) {
      payload.target_coverage_pct = body.target_coverage_pct;
    }
  } else {
    if (body.axis_distance_mm != null) payload.axis_distance_mm = body.axis_distance_mm;
    if (body.target_coverage_pct != null) payload.target_coverage_pct = body.target_coverage_pct;
    if (body.angle_step_deg != null) payload.angle_step_deg = body.angle_step_deg;
  }

  return fetchJsonOrThrow<GridGeneratorResponseDto>(
    "/api/grid-generator/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    {
      operation: "Generate treatment grid (simple or advanced aperture)",
      path: "/api/grid-generator/generate",
      method: "POST",
    }
  );
}
