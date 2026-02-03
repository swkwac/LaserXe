import type { SpotDto } from "@/types";

/** One frame: head position in pixel (from top-left mm), fired spot indices, flash. */
export interface TimelineFrame {
  headPx: { x: number; y: number };
  firedIndices: number[];
  flash: boolean;
  /** Cumulative time from start (ms). Used for real-time advanced animation. */
  t_ms?: number;
}

/** Motion parameters for advanced mode treatment time estimation. */
export interface AdvancedMotionParams {
  /** Max linear speed (mm/s). */
  linearSpeedMmPerS: number;
  /** Linear acceleration/deceleration (mm/s²). */
  linearAccelMmPerS2: number;
  /** Rotation time: ms per degree. */
  rotateMsPerDeg: number;
  /** Dwell time at each spot for emission (ms). */
  dwellMsPerSpot: number;
}

/** Default advanced motion parameters (carriage + rotation + emission). */
export const ADVANCED_MOTION_PARAMS: AdvancedMotionParams = {
  linearSpeedMmPerS: 400,
  linearAccelMmPerS2: 100,
  rotateMsPerDeg: 1,
  dwellMsPerSpot: 50,
};

/**
 * Time for linear move with trapezoidal profile (accel → constant → decel).
 * v_max mm/s, a mm/s². Returns ms.
 */
export function computeLinearMoveTimeMs(
  distanceMm: number,
  vMax: number,
  accel: number
): number {
  if (distanceMm <= 0) return 0;
  const sAccel = (vMax * vMax) / (2 * accel);
  const dMax = 2 * sAccel;
  if (distanceMm <= dMax) {
    return 2000 * Math.sqrt(distanceMm / accel);
  }
  const tAccel = vMax / accel;
  return 1000 * (2 * tAccel + (distanceMm - dMax) / vMax);
}

/**
 * Time for rotation (ms).
 */
export function computeRotateTimeMs(angleDeg: number, msPerDeg: number): number {
  return Math.abs(angleDeg) * msPerDeg;
}

/** Hue for gradient: blue (220) -> red (0). */
export function spotColor(index: number, total: number): string {
  if (total <= 0) return "hsl(200, 80%, 50%)";
  const t = total === 1 ? 1 : index / (total - 1);
  const hue = 220 - t * 220;
  return `hsl(${hue}, 80%, 50%)`;
}

/** Spot/head position in pixel from top-left mm (API/DB convention). Aligns with mask vertices. */
export function spotPxFromTopLeftMm(xMm: number, yMm: number, scale: number): { x: number; y: number } {
  return {
    x: xMm * scale,
    y: yMm * scale,
  };
}

/** Center-mm to top-left mm (origin at image center, +y up in center-mm). */
function centerMmToTopLeftMm(
  xCenter: number,
  yCenter: number,
  centerXMm: number,
  centerYMm: number
): { x: number; y: number } {
  return {
    x: xCenter + centerXMm,
    y: centerYMm - yCenter,
  };
}

/** Spot with polar info for advanced timeline. */
export interface AdvancedSpot {
  x_mm: number;
  y_mm: number;
  theta_deg: number;
  t_mm: number;
}

/**
 * Build timeline for advanced (diameter) mode: diameter-by-diameter order, move along diameter then rotate.
 * Spots in center-mm (+y up). Converts to top-left mm using center (e.g. 12.5, 12.5 for 25mm aperture).
 */
export function buildAnimationTimelineAdvanced(
  spots: AdvancedSpot[],
  scale: number,
  angleStepDeg: number,
  centerXMm: number,
  centerYMm: number
): TimelineFrame[] {
  if (spots.length === 0) return [];

  const sorted = [...spots].sort((a, b) => {
    const diamA = a.theta_deg < 180 ? a.theta_deg : a.theta_deg - 180;
    const diamB = b.theta_deg < 180 ? b.theta_deg : b.theta_deg - 180;
    const tSignedA = a.theta_deg < 180 ? a.t_mm : -a.t_mm;
    const tSignedB = b.theta_deg < 180 ? b.t_mm : -b.t_mm;
    const thetaKA = Math.floor(Math.round(diamA) / angleStepDeg);
    const thetaKB = Math.floor(Math.round(diamB) / angleStepDeg);
    if (thetaKA !== thetaKB) return thetaKA - thetaKB;
    const tSortA = thetaKA % 2 === 0 ? tSignedA : -tSignedA;
    const tSortB = thetaKB % 2 === 0 ? tSignedB : -tSignedB;
    return tSortA - tSortB;
  });

  const frames: TimelineFrame[] = [];
  const toPx = (xc: number, yc: number) => {
    const tl = centerMmToTopLeftMm(xc, yc, centerXMm, centerYMm);
    return spotPxFromTopLeftMm(tl.x, tl.y, scale);
  };

  for (let i = 0; i < sorted.length; i++) {
    const spot = sorted[i]!;
    const headPx = toPx(spot.x_mm, spot.y_mm);
    const firedIndices = Array.from({ length: i + 1 }, (_, k) => k);

    for (let k = 0; k < 4; k++) {
      frames.push({ headPx, firedIndices: [...firedIndices], flash: k >= 2 });
    }

    if (i < sorted.length - 1) {
      const next = sorted[i + 1]!;
      const diamCurr = spot.theta_deg < 180 ? spot.theta_deg : spot.theta_deg - 180;
      const diamNext = next.theta_deg < 180 ? next.theta_deg : next.theta_deg - 180;
      const thetaKCurr = Math.floor(Math.round(diamCurr) / angleStepDeg);
      const thetaKNext = Math.floor(Math.round(diamNext) / angleStepDeg);

      if (thetaKCurr === thetaKNext) {
        const nextPx = toPx(next.x_mm, next.y_mm);
        const dist = Math.hypot(nextPx.x - headPx.x, nextPx.y - headPx.y);
        const n = Math.max(2, Math.min(20, Math.round(dist / 4)));
        for (let j = 1; j <= n; j++) {
          const u = j / n;
          const interp = {
            x: headPx.x + u * (nextPx.x - headPx.x),
            y: headPx.y + u * (nextPx.y - headPx.y),
          };
          frames.push({ headPx: interp, firedIndices: [...firedIndices], flash: false });
        }
      } else {
        const rEnd = spot.t_mm;
        let deltaDeg = next.theta_deg - spot.theta_deg;
        if (deltaDeg > 180) deltaDeg -= 360;
        else if (deltaDeg < -180) deltaDeg += 360;
        const thetaStartRad = (spot.theta_deg * Math.PI) / 180;
        const deltaRad = (deltaDeg * Math.PI) / 180;
        const nRotate = Math.max(3, Math.min(15, Math.round(Math.abs(deltaDeg) * 0.8)));
        for (let j = 1; j <= nRotate; j++) {
          const u = j / nRotate;
          const theta = thetaStartRad + u * deltaRad;
          const xc = rEnd * Math.cos(theta);
          const yc = rEnd * Math.sin(theta);
          const rotPx = toPx(xc, yc);
          frames.push({ headPx: rotPx, firedIndices: [...firedIndices], flash: false });
        }
      }
    }
  }
  return frames;
}

/**
 * Build timeline from spot positions (x_mm, y_mm in top-left mm).
 * Head moves from spot to spot in emission order; works for both simple (snake) and advanced (diameter) algorithms.
 */
export function buildAnimationTimelineFromSpots(spots: SpotDto[], scale: number): TimelineFrame[] {
  const frames: TimelineFrame[] = [];
  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    if (!spot) continue;
    const headPx = spotPxFromTopLeftMm(spot.x_mm, spot.y_mm, scale);
    const firedIndices = Array.from({ length: i + 1 }, (_, k) => k);
    // Flash on emit: a few frames at this position
    for (let k = 0; k < 4; k++) {
      frames.push({
        headPx,
        firedIndices: [...firedIndices],
        flash: k >= 2,
      });
    }
    // Move to next spot (interpolate)
    if (i < spots.length - 1) {
      const next = spots[i + 1];
      if (!next) continue;
      const nextPx = spotPxFromTopLeftMm(next.x_mm, next.y_mm, scale);
      const dist = Math.hypot(nextPx.x - headPx.x, nextPx.y - headPx.y);
      const n = Math.max(2, Math.min(20, Math.round(dist / 4)));
      for (let j = 1; j <= n; j++) {
        const u = j / n;
        const interp = {
          x: headPx.x + u * (nextPx.x - headPx.x),
          y: headPx.y + u * (nextPx.y - headPx.y),
        };
        frames.push({
          headPx: interp,
          firedIndices: [...firedIndices],
          flash: false,
        });
      }
    }
  }
  return frames;
}
