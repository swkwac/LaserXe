import type { SpotDto } from "@/types";

/** Analytic motion profile for a linear move (v_emit → v_max → v_emit or 0 → v_max → 0). */
export interface LinearMoveProfile {
  /** Profile type: trapezoid (reaches v_max) or triangle (short segment). */
  type: "trapezoid" | "triangle";
  /** Start velocity (mm/s). */
  vStart: number;
  /** End velocity (mm/s). */
  vEnd: number;
  /** Peak velocity (mm/s) – v_max for trapezoid, v_peak for triangle. */
  vPeak: number;
  /** Acceleration (mm/s²). */
  accel: number;
  /** Phase durations (s): [accel, constant, decel]. */
  tAccel: number;
  tConst: number;
  tDecel: number;
  /** Total duration (s). */
  tTotal: number;
  /** Total distance (mm). */
  distanceMm: number;
}

/** Segment metadata for analytic v(t) sampling in velocity charts. */
export interface LinearMoveSegmentMeta {
  tStartMs: number;
  tEndMs: number;
  profile: LinearMoveProfile;
  startMm: { x: number; y: number };
  endMm: { x: number; y: number };
}

/** Analytic angular motion profile for rotation (0 → ω_max → 0). */
export interface RotateProfile {
  type: "trapezoid" | "triangle";
  omegaMax: number;
  alpha: number;
  tAccel: number;
  tConst: number;
  tDecel: number;
  tTotal: number;
  angleDeg: number;
}

/** Segment metadata for analytic ω(t) sampling in rotational speed charts. */
export interface RotateSegmentMeta {
  tStartMs: number;
  tEndMs: number;
  profile: RotateProfile;
}

/** One frame: head position in pixel (from top-left mm), fired spot indices, flash. */
export interface TimelineFrame {
  headPx: { x: number; y: number };
  firedIndices: number[];
  flash: boolean;
  /** Cumulative time from start (ms). Used for real-time advanced animation. */
  t_ms?: number;
  /** Approximate linear speed of the carriage at this frame (mm/s). */
  v_mm_per_s?: number;
  /** Motion phase for this frame (used by engineering charts). */
  phase?: "dwell" | "move" | "rotate";
}

/** Motion parameters for advanced mode treatment time estimation. */
export interface AdvancedMotionParams {
  /** Max linear speed (mm/s). */
  linearSpeedMmPerS: number;
  /** Linear acceleration/deceleration (mm/s²). */
  linearAccelMmPerS2: number;
  /**
   * Minimum linear speed during emission (mm/s).
   * 0 means the head is fully stopped for each spot (current behaviour).
   * >0 means the mechanism can fire "in motion" once it slows down to at most this speed.
   */
  minEmissionSpeedMmPerS: number;
  /**
   * When true, the mechanism is allowed to emit "in motion":
   * - Linear segments do not fully decelerate to 0 before/after dwell.
   * - During dwell the carriage keeps moving at minEmissionSpeedMmPerS.
   * When false, a classic 0 → v_max → 0 motion profile with full stops is used.
   */
  fireInMotionEnabled: boolean;
  /** Rotation time: ms per degree. */
  rotateMsPerDeg: number;
  /** Dwell time at each spot for emission (ms). Range 0.01–100 ms. */
  dwellMsPerSpot: number;
}

/** Default advanced motion parameters (carriage + rotation + emission). */
export const ADVANCED_MOTION_PARAMS: AdvancedMotionParams = {
  // Advanced mode defaults: v_max = 1000 mm/s, a = 200 m/s² ≈ 200000 mm/s².
  linearSpeedMmPerS: 1000,
  linearAccelMmPerS2: 200_000,
  minEmissionSpeedMmPerS: 0,
  fireInMotionEnabled: false,
  rotateMsPerDeg: 1,
  // Dwell time 20 ms/spot.
  dwellMsPerSpot: 20,
};

/**
 * Compute analytic motion profile for a linear move.
 * When vEmit <= 0: classic 0 → v_max → 0 profile.
 * When vEmit > 0: v_emit → v_max → v_emit (fire-in-motion).
 */
export function computeLinearMoveProfile(
  distanceMm: number,
  vMax: number,
  accel: number,
  vEmit: number
): LinearMoveProfile {
  const d = Math.max(distanceMm, 0);
  if (d <= 0 || accel <= 0 || vMax <= 0) {
    return {
      type: "triangle",
      vStart: vEmit,
      vEnd: vEmit,
      vPeak: vEmit,
      accel,
      tAccel: 0,
      tConst: 0,
      tDecel: 0,
      tTotal: 0,
      distanceMm: 0,
    };
  }

  const vE = Math.min(Math.max(vEmit, 0), vMax);

  if (vE <= 0) {
    // Classic 0 → v_max → 0
    const sAccel = (vMax * vMax) / (2 * accel);
    const dMax = 2 * sAccel;
    if (d <= dMax) {
      const tTotal = 2 * Math.sqrt(d / accel);
      const vPeak = Math.sqrt(d * accel);
      return {
        type: "triangle",
        vStart: 0,
        vEnd: 0,
        vPeak,
        accel,
        tAccel: vPeak / accel,
        tConst: 0,
        tDecel: vPeak / accel,
        tTotal,
        distanceMm: d,
      };
    }
    const tAccel = vMax / accel;
    const tConst = (d - dMax) / vMax;
    return {
      type: "trapezoid",
      vStart: 0,
      vEnd: 0,
      vPeak: vMax,
      accel,
      tAccel,
      tConst,
      tDecel: tAccel,
      tTotal: 2 * tAccel + tConst,
      distanceMm: d,
    };
  }

  // v_emit → v_max → v_emit
  const sAccel = (vMax * vMax - vE * vE) / (2 * accel);
  const sConst = d - 2 * sAccel;

  if (sConst >= 0) {
    const tAccel = (vMax - vE) / accel;
    const tConst = sConst / vMax;
    return {
      type: "trapezoid",
      vStart: vE,
      vEnd: vE,
      vPeak: vMax,
      accel,
      tAccel,
      tConst,
      tDecel: tAccel,
      tTotal: 2 * tAccel + tConst,
      distanceMm: d,
    };
  }

  // Triangle: never reach v_max
  const vPeak = Math.sqrt(vE * vE + d * accel);
  const tAccel = (vPeak - vE) / accel;
  return {
    type: "triangle",
    vStart: vE,
    vEnd: vE,
    vPeak,
    accel,
    tAccel,
    tConst: 0,
    tDecel: tAccel,
    tTotal: 2 * tAccel,
    distanceMm: d,
  };
}

/**
 * Instantaneous velocity at local time τ (s) within a segment.
 * τ = 0 at segment start, τ = tTotal at segment end.
 */
export function velocityAtTime(profile: LinearMoveProfile, tLocalSec: number): number {
  if (tLocalSec <= 0) return profile.vStart;
  if (tLocalSec >= profile.tTotal) return profile.vEnd;
  if (profile.tTotal <= 0) return profile.vStart;

  const { vStart, vPeak, accel, tAccel, tConst, tDecel } = profile;

  if (tLocalSec < tAccel) {
    return vStart + accel * tLocalSec;
  }
  if (tConst > 0 && tLocalSec < tAccel + tConst) {
    return vPeak;
  }
  const tIntoDecel = tLocalSec - tAccel - tConst;
  return vPeak - accel * tIntoDecel;
}

/**
 * Compute time for a linear move between two spots.
 * - When fireInMotionEnabled is false, this is a classic 0 → v_max → 0 profile.
 * - When fireInMotionEnabled is true, we approximate emission-in-motion by
 *   assuming that during dwell the carriage keeps moving at v_emit along the
 *   path, so a part of the distance between spots is "covered for free" while
 *   emitting. The remaining distance is traversed with the standard profile.
 */
function computeLinearMoveTimeWithMinEmission(
  distanceMm: number,
  params: AdvancedMotionParams
): number {
  const vMax = params.linearSpeedMmPerS;
  const accel = params.linearAccelMmPerS2;
  const baseDistanceMm = Math.max(distanceMm, 0);

  if (
    !params.fireInMotionEnabled ||
    params.minEmissionSpeedMmPerS <= 0 ||
    accel <= 0 ||
    vMax <= 0
  ) {
    return computeLinearMoveTimeMs(baseDistanceMm, vMax, accel);
  }

  const vEmit = Math.min(params.minEmissionSpeedMmPerS, vMax);
  const dwellSec = Math.max(params.dwellMsPerSpot, 0) / 1000;
  const overlapMm = vEmit * dwellSec;
  const remainingMm = Math.max(baseDistanceMm - overlapMm, 0);
  if (remainingMm <= 0) return 0;

  const profile = computeLinearMoveProfile(remainingMm, vMax, accel, vEmit);
  return profile.tTotal * 1000;
}

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
 * Compute analytic angular motion profile for rotation.
 * Triangle (short) or trapezoid (long) profile: 0 → ω_max → 0.
 */
export function computeRotateProfile(
  angleDeg: number,
  msPerDeg: number
): RotateProfile {
  const angleAbs = Math.abs(angleDeg);
  if (angleAbs <= 0 || msPerDeg <= 0) {
    return {
      type: "triangle",
      omegaMax: 0,
      alpha: 4000,
      tAccel: 0,
      tConst: 0,
      tDecel: 0,
      tTotal: 0,
      angleDeg: 0,
    };
  }

  const alpha = 4000; // deg/s²
  const omegaMax = 1000 / msPerDeg;
  const sAccel = (omegaMax * omegaMax) / (2 * alpha);
  const dMax = 2 * sAccel;

  if (angleAbs <= dMax) {
    const tTotal = 2 * Math.sqrt(angleAbs / alpha);
    const omegaPeak = Math.sqrt(angleAbs * alpha);
    const tAccel = omegaPeak / alpha;
    return {
      type: "triangle",
      omegaMax: omegaPeak,
      alpha,
      tAccel,
      tConst: 0,
      tDecel: tAccel,
      tTotal,
      angleDeg: angleAbs,
    };
  }

  const tAccel = omegaMax / alpha;
  const tConst = (angleAbs - dMax) / omegaMax;
  const tTotal = 2 * tAccel + tConst;
  return {
    type: "trapezoid",
    omegaMax,
    alpha,
    tAccel,
    tConst,
    tDecel: tAccel,
    tTotal,
    angleDeg: angleAbs,
  };
}

/**
 * Instantaneous angular velocity ω (deg/s) at local time τ (s) within a rotate segment.
 */
export function angularVelocityAtTime(profile: RotateProfile, tLocalSec: number): number {
  if (tLocalSec <= 0 || profile.tTotal <= 0) return 0;
  if (tLocalSec >= profile.tTotal) return 0;

  const { omegaMax, alpha, tAccel, tConst, tDecel } = profile;

  if (tLocalSec < tAccel) return alpha * tLocalSec;
  if (tConst > 0 && tLocalSec < tAccel + tConst) return omegaMax;
  const tIntoDecel = tLocalSec - tAccel - tConst;
  return omegaMax - alpha * tIntoDecel;
}

/**
 * Time for rotation (ms) with acceleration-limited profile.
 */
export function computeRotateTimeMs(angleDeg: number, msPerDeg: number): number {
  const profile = computeRotateProfile(angleDeg, msPerDeg);
  return profile.tTotal * 1000;
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

/** Result of buildAnimationTimelineAdvanced: frames for playback and segment metadata for analytic v(t) and ω(t). */
export interface AdvancedTimelineResult {
  frames: TimelineFrame[];
  linearMoveSegments: LinearMoveSegmentMeta[];
  rotateSegments: RotateSegmentMeta[];
}

/**
 * Build timeline for advanced (diameter) mode: diameter-by-diameter order, move along diameter then rotate.
 * Spots in center-mm (+y up). Converts to top-left mm using center (e.g. 12.5, 12.5 for 25mm aperture).
 * When motionParams is provided, frames get t_ms for real-time playback and segment durations match physics.
 */
export function buildAnimationTimelineAdvanced(
  spots: AdvancedSpot[],
  scale: number,
  angleStepDeg: number,
  centerXMm: number,
  centerYMm: number,
  motionParams?: AdvancedMotionParams
): AdvancedTimelineResult {
  if (spots.length === 0) return { frames: [], linearMoveSegments: [], rotateSegments: [] };

  const params = motionParams ?? ADVANCED_MOTION_PARAMS;
  const vMax = params.linearSpeedMmPerS;
  const accel = params.linearAccelMmPerS2;
  const msPerDeg = params.rotateMsPerDeg;
  const dwellMs = params.dwellMsPerSpot;
  const vEmit =
    params.fireInMotionEnabled && params.minEmissionSpeedMmPerS > 0
      ? Math.min(params.minEmissionSpeedMmPerS, vMax)
      : 0;

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
  const linearMoveSegments: LinearMoveSegmentMeta[] = [];
  const rotateSegments: RotateSegmentMeta[] = [];
  const toPx = (xc: number, yc: number) => {
    const tl = centerMmToTopLeftMm(xc, yc, centerXMm, centerYMm);
    return spotPxFromTopLeftMm(tl.x, tl.y, scale);
  };

  let tCumulativeMs = 0;
  const frameIntervalMs = 16;

  for (let i = 0; i < sorted.length; i++) {
    const spot = sorted[i]!;
    const headPx = toPx(spot.x_mm, spot.y_mm);
    const firedIndices = Array.from({ length: i + 1 }, (_, k) => k);

    const dwellFrames = Math.max(1, Math.ceil(dwellMs / frameIntervalMs));
    const dwellSpeed =
      params.fireInMotionEnabled && params.minEmissionSpeedMmPerS > 0
        ? Math.min(params.minEmissionSpeedMmPerS, vMax)
        : 0;
    for (let k = 0; k < dwellFrames; k++) {
      const u = k / dwellFrames;
      const tMs = tCumulativeMs + u * dwellMs;
      frames.push({
        headPx,
        firedIndices: [...firedIndices],
        flash: u >= 0.4 && u < 0.8,
        t_ms: tMs,
        v_mm_per_s: dwellSpeed,
        phase: "dwell",
      });
    }
    tCumulativeMs += dwellMs;

    if (i < sorted.length - 1) {
      const next = sorted[i + 1]!;
      const diamCurr = spot.theta_deg < 180 ? spot.theta_deg : spot.theta_deg - 180;
      const diamNext = next.theta_deg < 180 ? next.theta_deg : next.theta_deg - 180;
      const thetaKCurr = Math.floor(Math.round(diamCurr) / angleStepDeg);
      const thetaKNext = Math.floor(Math.round(diamNext) / angleStepDeg);

      if (thetaKCurr === thetaKNext) {
        const distMm = Math.hypot(next.x_mm - spot.x_mm, next.y_mm - spot.y_mm);
        const moveMs = computeLinearMoveTimeWithMinEmission(distMm, params);
        const nextPx = toPx(next.x_mm, next.y_mm);

        const baseDistanceMm = Math.max(distMm, 0);
        let remainingMm = baseDistanceMm;
        if (
          params.fireInMotionEnabled &&
          params.minEmissionSpeedMmPerS > 0 &&
          accel > 0 &&
          vMax > 0
        ) {
          const dwellSec = Math.max(params.dwellMsPerSpot, 0) / 1000;
          const overlapMm = vEmit * dwellSec;
          remainingMm = Math.max(baseDistanceMm - overlapMm, 0);
        }
        const profile =
          remainingMm > 0
            ? computeLinearMoveProfile(remainingMm, vMax, accel, vEmit)
            : null;

        const tStartMs = tCumulativeMs;
        const tEndMs = tCumulativeMs + moveMs;
        if (profile) {
          linearMoveSegments.push({
            tStartMs,
            tEndMs,
            profile,
            startMm: { x: spot.x_mm, y: spot.y_mm },
            endMm: { x: next.x_mm, y: next.y_mm },
          });
        }

        const n = Math.max(2, Math.ceil(moveMs / frameIntervalMs));
        for (let j = 1; j <= n; j++) {
          const u = j / n;
          const tLocalMs = u * moveMs;
          const tLocalSec = tLocalMs / 1000;
          const speedMmPerS = profile
            ? velocityAtTime(profile, tLocalSec)
            : (moveMs > 0 ? distMm / (moveMs / 1000) : 0);
          const interp = {
            x: headPx.x + u * (nextPx.x - headPx.x),
            y: headPx.y + u * (nextPx.y - headPx.y),
          };
          frames.push({
            headPx: interp,
            firedIndices: [...firedIndices],
            flash: false,
            t_ms: tCumulativeMs + tLocalMs,
            v_mm_per_s: speedMmPerS,
            phase: "move",
          });
        }
        tCumulativeMs += moveMs;
      } else {
        // Rotate along the actual circular path between the current and next spot.
        // Use the true polar angles from (x_mm, y_mm) rather than theta_deg alone,
        // so that points on the "bottom" half of the circle are not mirrored.
        const thetaStartRad = Math.atan2(spot.y_mm, spot.x_mm);
        const thetaEndRad = Math.atan2(next.y_mm, next.x_mm);
        let deltaRad = thetaEndRad - thetaStartRad;
        // Shortest-path normalisation to [-π, π]
        if (deltaRad > Math.PI) deltaRad -= 2 * Math.PI;
        else if (deltaRad < -Math.PI) deltaRad += 2 * Math.PI;
        const deltaDeg = (deltaRad * 180) / Math.PI;

        const rotateProfile = computeRotateProfile(deltaDeg, msPerDeg);
        const rotateMs = rotateProfile.tTotal * 1000;
        const tRotateStartMs = tCumulativeMs;
        const tRotateEndMs = tCumulativeMs + rotateMs;
        rotateSegments.push({
          tStartMs: tRotateStartMs,
          tEndMs: tRotateEndMs,
          profile: rotateProfile,
        });

        const nRotate = Math.max(2, Math.ceil(rotateMs / frameIntervalMs));
        const rRotate = Math.hypot(spot.x_mm, spot.y_mm);
        for (let j = 1; j <= nRotate; j++) {
          const u = j / nRotate;
          const theta = thetaStartRad + u * deltaRad;
          const xc = rRotate * Math.cos(theta);
          const yc = rRotate * Math.sin(theta);
          const rotPx = toPx(xc, yc);
          frames.push({
            headPx: rotPx,
            firedIndices: [...firedIndices],
            flash: false,
            t_ms: tCumulativeMs + u * rotateMs,
            v_mm_per_s: 0,
            phase: "rotate",
          });
        }
        tCumulativeMs += rotateMs;
      }
    }
  }
  return { frames, linearMoveSegments, rotateSegments };
}

/**
 * Estimate total treatment time (ms) for advanced mode from spots and motion params.
 */
export function estimateAdvancedTreatmentTimeMs(
  spots: AdvancedSpot[],
  angleStepDeg: number,
  params: AdvancedMotionParams = ADVANCED_MOTION_PARAMS
): number {
  if (spots.length === 0) return 0;
  const breakdown = estimateAdvancedTreatmentTimeBreakdown(spots, angleStepDeg, params);
  return breakdown.totalMs;
}

/** Breakdown of treatment time by component (ms). */
export interface TreatmentTimeBreakdown {
  dwellMs: number;
  moveMs: number;
  rotateMs: number;
  totalMs: number;
}

/**
 * Compute treatment time breakdown to identify limiting factors.
 */
export function estimateAdvancedTreatmentTimeBreakdown(
  spots: AdvancedSpot[],
  angleStepDeg: number,
  params: AdvancedMotionParams = ADVANCED_MOTION_PARAMS
): TreatmentTimeBreakdown {
  if (spots.length === 0) {
    return {
      dwellMs: 0,
      moveMs: 0,
      rotateMs: 0,
      totalMs: 0,
    };
  }

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

  let dwellMs = spots.length * params.dwellMsPerSpot;
  let moveMs = 0;
  let rotateMs = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i]!;
    const next = sorted[i + 1]!;
    const diamCurr = curr.theta_deg < 180 ? curr.theta_deg : curr.theta_deg - 180;
    const diamNext = next.theta_deg < 180 ? next.theta_deg : next.theta_deg - 180;
    const thetaKCurr = Math.floor(Math.round(diamCurr) / angleStepDeg);
    const thetaKNext = Math.floor(Math.round(diamNext) / angleStepDeg);

    if (thetaKCurr === thetaKNext) {
      const distMm = Math.hypot(next.x_mm - curr.x_mm, next.y_mm - curr.y_mm);
      moveMs += computeLinearMoveTimeWithMinEmission(distMm, params);
    } else {
      let deltaDeg = next.theta_deg - curr.theta_deg;
      if (deltaDeg > 180) deltaDeg -= 360;
      else if (deltaDeg < -180) deltaDeg += 360;
      rotateMs += computeRotateTimeMs(deltaDeg, params.rotateMsPerDeg);
    }
  }

  return {
    dwellMs,
    moveMs,
    rotateMs,
    totalMs: dwellMs + moveMs + rotateMs,
  };
}

/**
 * Simple (snake) mode treatment time breakdown (ms) using the same motion model as advanced mode.
 * No rotation components (rotateMs = 0).
 */
export function estimateSimpleTreatmentTimeBreakdown(
  spots: SpotDto[],
  params: AdvancedMotionParams = ADVANCED_MOTION_PARAMS
): TreatmentTimeBreakdown {
  if (spots.length === 0) {
    return {
      dwellMs: 0,
      moveMs: 0,
      rotateMs: 0,
      totalMs: 0,
    };
  }

  const dwellMs = spots.length * params.dwellMsPerSpot;
  let moveMs = 0;

  for (let i = 0; i < spots.length - 1; i++) {
    const curr = spots[i]!;
    const next = spots[i + 1]!;
    const distMm = Math.hypot(next.x_mm - curr.x_mm, next.y_mm - curr.y_mm);
    moveMs += computeLinearMoveTimeWithMinEmission(distMm, params);
  }

  return {
    dwellMs,
    moveMs,
    rotateMs: 0,
    totalMs: dwellMs + moveMs,
  };
}

export function estimateSimpleTreatmentTimeMs(
  spots: SpotDto[],
  params: AdvancedMotionParams = ADVANCED_MOTION_PARAMS
): number {
  return estimateSimpleTreatmentTimeBreakdown(spots, params).totalMs;
}

/**
 * Build timeline from spot positions (x_mm, y_mm in top-left mm).
 * Head moves from spot to spot in emission order.
 *
 * - When motionParams is omitted, this returns a simple frame sequence without timing (legacy simple mode).
 * - When motionParams is provided, frames get t_ms / v_mm_per_s / phase for charts and real-time analysis.
 */
export function buildAnimationTimelineFromSpots(
  spots: SpotDto[],
  scale: number,
  motionParams?: AdvancedMotionParams
): TimelineFrame[] {
  if (!motionParams) {
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

  const params = motionParams ?? ADVANCED_MOTION_PARAMS;
  const vMax = params.linearSpeedMmPerS;
  const accel = params.linearAccelMmPerS2;
  const dwellMs = params.dwellMsPerSpot;
  const vEmit =
    params.fireInMotionEnabled && params.minEmissionSpeedMmPerS > 0
      ? Math.min(params.minEmissionSpeedMmPerS, vMax)
      : 0;

  const frames: TimelineFrame[] = [];
  let tCumulativeMs = 0;
  const frameIntervalMs = 16;

  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    if (!spot) continue;
    const headPx = spotPxFromTopLeftMm(spot.x_mm, spot.y_mm, scale);
    const firedIndices = Array.from({ length: i + 1 }, (_, k) => k);

    // Dwell (emission) at this spot
    const dwellFrames = Math.max(1, Math.ceil(dwellMs / frameIntervalMs));
    const dwellSpeed =
      params.fireInMotionEnabled && params.minEmissionSpeedMmPerS > 0
        ? Math.min(params.minEmissionSpeedMmPerS, vMax)
        : 0;
    for (let k = 0; k < dwellFrames; k++) {
      const u = k / dwellFrames;
      const tMs = tCumulativeMs + u * dwellMs;
      frames.push({
        headPx,
        firedIndices: [...firedIndices],
        flash: u >= 0.4 && u < 0.8,
        t_ms: tMs,
        v_mm_per_s: dwellSpeed,
        phase: "dwell",
      });
    }
    tCumulativeMs += dwellMs;

    // Linear move to next spot
    if (i < spots.length - 1) {
      const next = spots[i + 1];
      if (!next) continue;
      const distMm = Math.hypot(next.x_mm - spot.x_mm, next.y_mm - spot.y_mm);
      const moveMs = computeLinearMoveTimeWithMinEmission(distMm, params);
      const nextPx = spotPxFromTopLeftMm(next.x_mm, next.y_mm, scale);

      // Approximate analytic profile for v(t) along this simple move
      const baseDistanceMm = Math.max(distMm, 0);
      let remainingMm = baseDistanceMm;
      if (
        params.fireInMotionEnabled &&
        params.minEmissionSpeedMmPerS > 0 &&
        accel > 0 &&
        vMax > 0
      ) {
        const dwellSec = Math.max(params.dwellMsPerSpot, 0) / 1000;
        const overlapMm = vEmit * dwellSec;
        remainingMm = Math.max(baseDistanceMm - overlapMm, 0);
      }
      const profile =
        remainingMm > 0
          ? computeLinearMoveProfile(remainingMm, vMax, accel, vEmit)
          : null;

      const n = Math.max(2, Math.ceil(moveMs / frameIntervalMs));
      for (let j = 1; j <= n; j++) {
        const u = j / n;
        const tLocalMs = u * moveMs;
        const tLocalSec = tLocalMs / 1000;
        const speedMmPerS =
          profile != null
            ? velocityAtTime(profile, tLocalSec)
            : moveMs > 0
              ? distMm / (moveMs / 1000)
              : 0;
        const interp = {
          x: headPx.x + u * (nextPx.x - headPx.x),
          y: headPx.y + u * (nextPx.y - headPx.y),
        };
        frames.push({
          headPx: interp,
          firedIndices: [...firedIndices],
          flash: false,
          t_ms: tCumulativeMs + tLocalMs,
          v_mm_per_s: speedMmPerS,
          phase: "move",
        });
      }
      tCumulativeMs += moveMs;
    }
  }

  return frames;
}
