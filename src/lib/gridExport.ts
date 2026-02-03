import type { GridGeneratorParamsDto, GridGeneratorSpotDto } from "@/types";

/**
 * Generate CSV content from grid generator spots.
 * Format: sequence_index, theta_deg, t_mm, x_mm, y_mm, mask_id, component_id
 * With comment lines for params.
 */
export function gridSpotsToCsv(
  spots: GridGeneratorSpotDto[],
  params: GridGeneratorParamsDto
): string {
  const lines: string[] = [];
  lines.push(`# aperture_type=${params.aperture_type}`);
  lines.push(`# spot_diameter_um=${params.spot_diameter_um}`);
  lines.push(`# target_coverage_pct=${params.target_coverage_pct}`);
  if (params.axis_distance_mm != null) {
    lines.push(`# axis_distance_mm=${params.axis_distance_mm}`);
  }
  if (params.angle_step_deg != null) {
    lines.push(`# angle_step_deg=${params.angle_step_deg}`);
  }
  lines.push("sequence_index,theta_deg,t_mm,x_mm,y_mm,mask_id,component_id");
  for (const s of spots) {
    lines.push(
      `${s.sequence_index},${s.theta_deg},${s.t_mm},${s.x_mm},${s.y_mm},,`
    );
  }
  return lines.join("\n");
}

/**
 * Trigger download of CSV file.
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
