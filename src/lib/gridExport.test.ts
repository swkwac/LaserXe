/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { gridSpotsToCsv, downloadCsv } from "./gridExport";
import type { GridGeneratorParamsDto, GridGeneratorSpotDto } from "@/types";

describe("gridExport", () => {
  describe("gridSpotsToCsv", () => {
    it("generates CSV with comment lines and header for simple aperture", () => {
      const spots: GridGeneratorSpotDto[] = [
        {
          sequence_index: 0,
          x_mm: 0.4,
          y_mm: 0.4,
          theta_deg: 45,
          t_mm: 0.566,
          mask_id: null,
          component_id: null,
        },
      ];
      const params: GridGeneratorParamsDto = {
        aperture_type: "simple",
        spot_diameter_um: 300,
        target_coverage_pct: 10,
        axis_distance_mm: 0.8,
        angle_step_deg: null,
      };
      const csv = gridSpotsToCsv(spots, params);
      expect(csv).toContain("# aperture_type=simple");
      expect(csv).toContain("# spot_diameter_um=300");
      expect(csv).toContain("# target_coverage_pct=10");
      expect(csv).toContain("# axis_distance_mm=0.8");
      expect(csv).not.toContain("angle_step_deg");
      expect(csv).toContain("sequence_index,theta_deg,t_mm,x_mm,y_mm,mask_id,component_id");
      expect(csv).toContain("0,45,0.566,0.4,0.4,,");
    });

    it("generates CSV for advanced aperture with angle_step", () => {
      const spots: GridGeneratorSpotDto[] = [];
      const params: GridGeneratorParamsDto = {
        aperture_type: "advanced",
        spot_diameter_um: 150,
        target_coverage_pct: 5,
        axis_distance_mm: null,
        angle_step_deg: 5,
      };
      const csv = gridSpotsToCsv(spots, params);
      expect(csv).toContain("# aperture_type=advanced");
      expect(csv).toContain("# angle_step_deg=5");
      expect(csv).not.toContain("axis_distance_mm");
      expect(csv).toContain("sequence_index,theta_deg,t_mm,x_mm,y_mm,mask_id,component_id");
    });

    it("includes all spots in CSV body", () => {
      const spots: GridGeneratorSpotDto[] = [
        { sequence_index: 0, x_mm: 0, y_mm: 0, theta_deg: 0, t_mm: 0, mask_id: null, component_id: null },
        { sequence_index: 1, x_mm: 1, y_mm: 1, theta_deg: 45, t_mm: 1.414, mask_id: null, component_id: null },
      ];
      const params: GridGeneratorParamsDto = {
        aperture_type: "simple",
        spot_diameter_um: 300,
        target_coverage_pct: 10,
        axis_distance_mm: 0.8,
        angle_step_deg: null,
      };
      const csv = gridSpotsToCsv(spots, params);
      const lines = csv.split("\n");
      const dataLines = lines.filter((l) => !l.startsWith("#") && l !== "sequence_index,theta_deg,t_mm,x_mm,y_mm,mask_id,component_id");
      expect(dataLines).toHaveLength(2);
      expect(dataLines[0]).toContain("0,0,0,0,0,,");
      expect(dataLines[1]).toContain("1,45,1.414,1,1,,");
    });
  });

  describe("downloadCsv", () => {
    it("does not throw when called (triggers download)", () => {
      const createObjectURL = vi.fn(() => "blob:mock");
      const revokeObjectURL = vi.fn();
      vi.stubGlobal("URL", {
        ...globalThis.URL,
        createObjectURL,
        revokeObjectURL,
      });
      expect(() => downloadCsv("a,b\n1,2", "test.csv")).not.toThrow();
      expect(createObjectURL).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
      vi.unstubAllGlobals();
    });
  });
});
