/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadGridGeneratorParams, saveGridGeneratorParams } from "./gridGeneratorStorage";
import type { GridGeneratorRequestDto } from "@/types";

describe("gridGeneratorStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("saveGridGeneratorParams / loadGridGeneratorParams", () => {
    it("saves and loads simple params (coverage mode)", () => {
      const params = {
        aperture_type: "simple" as const,
        spot_diameter_um: 300 as const,
        target_coverage_pct: 10,
        simple_input_mode: "coverage" as const,
      };
      saveGridGeneratorParams(params);
      const loaded = loadGridGeneratorParams();
      expect(loaded).toMatchObject({
        aperture_type: "simple",
        spot_diameter_um: 300,
        target_coverage_pct: 10,
        simple_input_mode: "coverage",
      });
    });

    it("saves and loads simple params (spacing mode)", () => {
      const params = {
        aperture_type: "simple" as const,
        spot_diameter_um: 300 as const,
        axis_distance_mm: 0.8,
        simple_input_mode: "spacing" as const,
      };
      saveGridGeneratorParams(params);
      const loaded = loadGridGeneratorParams();
      expect(loaded).toMatchObject({
        aperture_type: "simple",
        spot_diameter_um: 300,
        axis_distance_mm: 0.8,
        simple_input_mode: "spacing",
      });
    });

    it("saves and loads advanced params", () => {
      const params: GridGeneratorRequestDto = {
        aperture_type: "advanced",
        spot_diameter_um: 150,
        target_coverage_pct: 5,
        angle_step_deg: 5,
      };
      saveGridGeneratorParams(params);
      const loaded = loadGridGeneratorParams();
      expect(loaded).toEqual(params);
    });

    it("returns null for invalid stored data", () => {
      localStorage.setItem("laserxe_grid_generator_params", "invalid json");
      expect(loadGridGeneratorParams()).toBeNull();
    });

    it("returns null for empty storage", () => {
      expect(loadGridGeneratorParams()).toBeNull();
    });

    it("returns null when aperture_type is invalid", () => {
      saveGridGeneratorParams({
        aperture_type: "simple",
        spot_diameter_um: 300,
        target_coverage_pct: 10,
        simple_input_mode: "coverage",
      });
      localStorage.setItem(
        "laserxe_grid_generator_params",
        JSON.stringify({ aperture_type: "invalid", spot_diameter_um: 300, target_coverage_pct: 10 })
      );
      expect(loadGridGeneratorParams()).toBeNull();
    });
  });
});
