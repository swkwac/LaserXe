import { describe, it, expect } from "vitest";
import {
  ADVANCED_MOTION_PARAMS,
  buildAnimationTimelineAdvanced,
  buildAnimationTimelineFromSpots,
  computeLinearMoveProfile,
  computeLinearMoveTimeMs,
  computeRotateTimeMs,
  estimateAdvancedTreatmentTimeMs,
  spotColor,
  spotPxFromTopLeftMm,
  velocityAtTime,
} from "./animationUtils";
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

  describe("buildAnimationTimelineAdvanced", () => {
    it("returns empty frames and segments for empty spots", () => {
      const result = buildAnimationTimelineAdvanced([], 1, 5, 12.5, 12.5);
      expect(result.frames).toEqual([]);
      expect(result.linearMoveSegments).toEqual([]);
      expect(result.rotateSegments).toEqual([]);
    });

    it("sorts diameter-by-diameter and produces frames", () => {
      const spots = [
        { x_mm: 5, y_mm: 0, theta_deg: 0, t_mm: 5 },
        { x_mm: 0, y_mm: 5, theta_deg: 90, t_mm: 5 },
        { x_mm: 10, y_mm: 0, theta_deg: 0, t_mm: 10 },
      ];
      const { frames } = buildAnimationTimelineAdvanced(spots, 1, 5, 12.5, 12.5);
      expect(frames.length).toBeGreaterThan(4);
      expect(frames[0]?.firedIndices).toEqual([0]);
      const lastFrame = frames[frames.length - 1];
      expect(lastFrame?.firedIndices).toEqual([0, 1, 2]);
      expect(lastFrame?.headPx.x).toBeCloseTo(12.5, 0);
      expect(lastFrame?.headPx.y).toBeCloseTo(7.5, 0);
    });

    it("assigns t_ms for real-time playback when motion params used", () => {
      const spots = [{ x_mm: 5, y_mm: 0, theta_deg: 0, t_mm: 5 }];
      const { frames } = buildAnimationTimelineAdvanced(spots, 1, 5, 12.5, 12.5);
      expect(frames.length).toBeGreaterThan(0);
      expect(frames[0]?.t_ms).toBeDefined();
      expect(frames[0]?.t_ms).toBeGreaterThanOrEqual(0);
    });

    it("produces linearMoveSegments for linear moves when fire-in-motion enabled", () => {
      const spots = [
        { x_mm: 5, y_mm: 0, theta_deg: 0, t_mm: 5 },
        { x_mm: 10, y_mm: 0, theta_deg: 0, t_mm: 10 },
      ];
      const params = {
        ...ADVANCED_MOTION_PARAMS,
        fireInMotionEnabled: true,
        minEmissionSpeedMmPerS: 50,
      };
      const { frames, linearMoveSegments } = buildAnimationTimelineAdvanced(
        spots,
        1,
        5,
        12.5,
        12.5,
        params
      );
      expect(frames.length).toBeGreaterThan(0);
      expect(linearMoveSegments.length).toBe(1);
      expect(linearMoveSegments[0]!.profile.distanceMm).toBeGreaterThan(0);
      expect(linearMoveSegments[0]!.tStartMs).toBeLessThan(linearMoveSegments[0]!.tEndMs);
    });

    it("produces rotateSegments for rotations between diameters", () => {
      const spots = [
        { x_mm: 5, y_mm: 0, theta_deg: 0, t_mm: 5 },
        { x_mm: 0, y_mm: 5, theta_deg: 90, t_mm: 5 },
        { x_mm: 10, y_mm: 0, theta_deg: 0, t_mm: 10 },
      ];
      const { frames, rotateSegments } = buildAnimationTimelineAdvanced(
        spots,
        1,
        5,
        12.5,
        12.5
      );
      expect(frames.length).toBeGreaterThan(0);
      // Sorted: 0° (5mm), 0° (10mm), 90° → one linear move, one rotate
      expect(rotateSegments.length).toBeGreaterThanOrEqual(1);
      if (rotateSegments.length > 0) {
        expect(rotateSegments[0]!.profile.angleDeg).toBeGreaterThan(0);
        expect(rotateSegments[0]!.tStartMs).toBeLessThan(rotateSegments[0]!.tEndMs);
      }
    });
  });

  describe("computeLinearMoveTimeMs", () => {
    it("returns 0 for zero distance", () => {
      expect(computeLinearMoveTimeMs(0, 400, 100)).toBe(0);
    });

    it("returns positive time for positive distance", () => {
      const t = computeLinearMoveTimeMs(10, 400, 100);
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1000);
    });
  });

  describe("computeRotateTimeMs", () => {
    it("returns 0 for zero angle", () => {
      expect(computeRotateTimeMs(0, 1)).toBe(0);
    });

    it("returns positive time for positive angle", () => {
      expect(computeRotateTimeMs(5, 1)).toBeGreaterThan(0);
      expect(computeRotateTimeMs(90, 1)).toBeGreaterThan(0);
    });

    it("rotation time grows with angle for fixed msPerDeg", () => {
      const tSmall = computeRotateTimeMs(10, 1);
      const tLarge = computeRotateTimeMs(90, 1);
      expect(tLarge).toBeGreaterThan(tSmall);
    });

    it("rotation time decreases when msPerDeg decreases", () => {
      const angle = 45;
      const slow = computeRotateTimeMs(angle, 2); // slower setting
      const fast = computeRotateTimeMs(angle, 0.5); // faster setting
      expect(fast).toBeLessThanOrEqual(slow);
    });
  });

  describe("computeLinearMoveProfile", () => {
    const vMax = 400;
    const accel = 100;

    it("returns zero-duration profile for zero distance", () => {
      const p = computeLinearMoveProfile(0, vMax, accel, 0);
      expect(p.tTotal).toBe(0);
      expect(p.distanceMm).toBe(0);
    });

    it("returns classic triangle profile for short distance when vEmit=0", () => {
      const d = 100;
      const p = computeLinearMoveProfile(d, vMax, accel, 0);
      expect(p.type).toBe("triangle");
      expect(p.vStart).toBe(0);
      expect(p.vEnd).toBe(0);
      expect(p.vPeak).toBeLessThan(vMax);
      expect(p.tConst).toBe(0);
      expect(p.tTotal).toBeCloseTo(2 * Math.sqrt(d / accel), 6);
    });

    it("returns classic trapezoid profile for long distance when vEmit=0", () => {
      const dMax = (vMax * vMax) / accel;
      const d = dMax + 500;
      const p = computeLinearMoveProfile(d, vMax, accel, 0);
      expect(p.type).toBe("trapezoid");
      expect(p.vPeak).toBe(vMax);
      expect(p.tAccel).toBeCloseTo(vMax / accel, 6);
      expect(p.tConst).toBeGreaterThan(0);
    });

    it("returns fire-in-motion trapezoid for long distance with vEmit>0", () => {
      const vEmit = 50;
      const d = 2000;
      const p = computeLinearMoveProfile(d, vMax, accel, vEmit);
      expect(p.type).toBe("trapezoid");
      expect(p.vStart).toBe(vEmit);
      expect(p.vEnd).toBe(vEmit);
      expect(p.vPeak).toBe(vMax);
      expect(p.tAccel).toBeCloseTo((vMax - vEmit) / accel, 6);
    });

    it("returns fire-in-motion triangle for short distance with vEmit>0", () => {
      const vEmit = 50;
      const d = 200;
      const p = computeLinearMoveProfile(d, vMax, accel, vEmit);
      expect(p.type).toBe("triangle");
      expect(p.vPeak).toBeLessThan(vMax);
      expect(p.vPeak).toBeGreaterThan(vEmit);
      expect(p.tConst).toBe(0);
    });
  });

  describe("velocityAtTime", () => {
    it("returns vStart for τ <= 0", () => {
      const p = {
        type: "trapezoid" as const,
        vStart: 50,
        vEnd: 50,
        vPeak: 400,
        accel: 100,
        tAccel: 3.5,
        tConst: 1,
        tDecel: 3.5,
        tTotal: 8,
        distanceMm: 1500,
      };
      expect(velocityAtTime(p, -1)).toBe(50);
      expect(velocityAtTime(p, 0)).toBe(50);
    });

    it("returns vEnd for τ >= tTotal", () => {
      const p = {
        type: "trapezoid" as const,
        vStart: 50,
        vEnd: 50,
        vPeak: 400,
        accel: 100,
        tAccel: 3.5,
        tConst: 1,
        tDecel: 3.5,
        tTotal: 8,
        distanceMm: 1500,
      };
      expect(velocityAtTime(p, 8)).toBe(50);
      expect(velocityAtTime(p, 10)).toBe(50);
    });

    it("returns linear ramp during accel phase", () => {
      const p = {
        type: "trapezoid" as const,
        vStart: 50,
        vEnd: 50,
        vPeak: 400,
        accel: 100,
        tAccel: 3.5,
        tConst: 1,
        tDecel: 3.5,
        tTotal: 8,
        distanceMm: 1500,
      };
      expect(velocityAtTime(p, 1)).toBeCloseTo(50 + 100 * 1, 6);
      expect(velocityAtTime(p, 3.5)).toBeCloseTo(400, 6);
    });

    it("returns vPeak during constant phase", () => {
      const p = {
        type: "trapezoid" as const,
        vStart: 50,
        vEnd: 50,
        vPeak: 400,
        accel: 100,
        tAccel: 3.5,
        tConst: 1,
        tDecel: 3.5,
        tTotal: 8,
        distanceMm: 1500,
      };
      expect(velocityAtTime(p, 4)).toBe(400);
      expect(velocityAtTime(p, 4.5)).toBe(400);
    });
  });

  describe("estimateAdvancedTreatmentTimeMs", () => {
    it("returns 0 for empty spots", () => {
      expect(estimateAdvancedTreatmentTimeMs([], 5)).toBe(0);
    });

    it("returns dwell time for one spot (dwell only)", () => {
      const spots = [{ x_mm: 5, y_mm: 0, theta_deg: 0, t_mm: 5 }];
      const t = estimateAdvancedTreatmentTimeMs(spots, 5);
      expect(t).toBe(20);
    });
  });
});
