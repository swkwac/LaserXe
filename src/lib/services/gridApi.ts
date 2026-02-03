/**
 * Grid Generator API: standalone grid generation (no image).
 * Uses apiFetch for auth and 401 redirect.
 */
import { apiFetch } from "@/lib/api";
import type { GridGeneratorRequestDto, GridGeneratorResponseDto } from "@/types";

const DEFAULT_ERROR = "Nie udało się wygenerować siatki.";

/**
 * Generates grid for simple (12×12 mm) or advanced (25 mm diameter) aperture.
 * On 4xx/5xx throws Error with API detail message or default.
 */
export async function generateGrid(
  body: GridGeneratorRequestDto
): Promise<GridGeneratorResponseDto> {
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
    if (body.target_coverage_pct != null) payload.target_coverage_pct = body.target_coverage_pct;
    if (body.angle_step_deg != null) payload.angle_step_deg = body.angle_step_deg;
  }

  const res = await apiFetch("/api/grid-generator/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    const message = text
      ? (() => {
          try {
            const data = JSON.parse(text) as { detail?: string };
            return typeof data?.detail === "string" ? data.detail : DEFAULT_ERROR;
          } catch {
            return DEFAULT_ERROR;
          }
        })()
      : DEFAULT_ERROR;
    throw new Error(message);
  }
  if (!text) throw new Error(DEFAULT_ERROR);
  return JSON.parse(text) as GridGeneratorResponseDto;
}
