import { describe, it, expect } from "vitest";
import { buildAnimationTimelineFromSpots, spotColor, spotPxFromTopLeftMm } from "./animationUtils";
import type { SpotDto } from "@/types";

describe("animationUtils", () => {
  describe("spotColor", () => {
    it("returns default hue when total <= 0", () => {
      expect(spotColor(0, 0)).toMatch(/^hsl\(200,/);
      expect(spotColor(0, -1)).toMatch(/^hsl\(200,/);
    });

    it("returns same hue when total === 1", () => {
      const c = spotColor(0, 1);
      expect(c).toMatch(/^hsl\(\d+, 80%, 50%\)$/);
    });

    it("returns blue-ish for index 0 and red-ish for last index", () => {
      const first = spotColor(0, 5);
      const last = spotColor(4, 5);
      expect(first).toContain("220"); // blue
      expect(last).toContain("0"); // red
    });

    it("interpolates hue for indices 0..n-1", () => {
      const colors = [0, 1, 2].map((i) => spotColor(i, 3));
      expect(colors[0]).toMatch(/220/);
      expect(colors[2]).toMatch(/0/);
      expect(colors[1]).not.toBe(colors[0]);
      expect(colors[1]).not.toBe(colors[2]);
    });
  });

  describe("spotPxFromTopLeftMm", () => {
    it("scales mm to px with scale 1", () => {
      const p = spotPxFromTopLeftMm(10, 20, 1);
      expect(p).toEqual({ x: 10, y: 20 });
    });

    it("scales mm to px with scale 2", () => {
      const p = spotPxFromTopLeftMm(5, 10, 2);
      expect(p).toEqual({ x: 10, y: 20 });
    });

    it("handles zero scale (returns 0,0)", () => {
      const p = spotPxFromTopLeftMm(1, 2, 0);
      expect(p).toEqual({ x: 0, y: 0 });
    });
  });

  describe("buildAnimationTimelineFromSpots", () => {
    const spot = (id: number, x: number, y: number): SpotDto =>
      ({
        id,
        iteration_id: 1,
        sequence_index: id,
        x_mm: x,
        y_mm: y,
        theta_deg: 0,
        t_mm: 0,
        mask_id: null,
        component_id: null,
        created_at: "",
      }) as SpotDto;

    it("returns empty array for empty spots", () => {
      const timeline = buildAnimationTimelineFromSpots([], 1);
      expect(timeline).toEqual([]);
    });

    it("returns frames for one spot (flash frames only)", () => {
      const spots = [spot(1, 10, 20)];
      const timeline = buildAnimationTimelineFromSpots(spots, 1);
      expect(timeline.length).toBeGreaterThanOrEqual(1);
      expect(timeline[0]).toEqual({
        headPx: { x: 10, y: 20 },
        firedIndices: [0],
        flash: expect.any(Boolean),
      });
    });

    it("returns frames for two spots with head movement and fired indices", () => {
      const spots = [spot(1, 0, 0), spot(2, 100, 100)];
      const timeline = buildAnimationTimelineFromSpots(spots, 1);
      expect(timeline.length).toBeGreaterThan(4);
      const firstFrame = timeline[0];
      expect(firstFrame).toBeDefined();
      if (firstFrame) {
        expect(firstFrame.headPx).toEqual({ x: 0, y: 0 });
        expect(firstFrame.firedIndices).toEqual([0]);
      }
      const lastFrame = timeline[timeline.length - 1];
      expect(lastFrame).toBeDefined();
      if (lastFrame) {
        expect(lastFrame.headPx).toEqual({ x: 100, y: 100 });
        expect(lastFrame.firedIndices).toEqual([0, 1]);
      }
    });

    it("uses scale for headPx positions", () => {
      const spots = [spot(1, 10, 20)];
      const timeline = buildAnimationTimelineFromSpots(spots, 2);
      expect(timeline[0]?.headPx).toEqual({ x: 20, y: 40 });
    });
  });
});
