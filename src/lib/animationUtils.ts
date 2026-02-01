import type { SpotDto } from "@/types";

/** One frame: head position in pixel (from top-left mm), fired spot indices, flash. */
export type TimelineFrame = {
  headPx: { x: number; y: number };
  firedIndices: number[];
  flash: boolean;
};

/** Hue for gradient: blue (220) -> red (0). */
export function spotColor(index: number, total: number): string {
  if (total <= 0) return "hsl(200, 80%, 50%)";
  const t = total === 1 ? 1 : index / (total - 1);
  const hue = 220 - t * 220;
  return `hsl(${hue}, 80%, 50%)`;
}

/** Spot/head position in pixel from top-left mm (API/DB convention). Aligns with mask vertices. */
export function spotPxFromTopLeftMm(
  xMm: number,
  yMm: number,
  scale: number
): { x: number; y: number } {
  return {
    x: xMm * scale,
    y: yMm * scale,
  };
}

/**
 * Build timeline from spot positions (x_mm, y_mm in top-left mm).
 * Head moves from spot to spot in emission order; works for both simple (snake) and advanced (diameter) algorithms.
 */
export function buildAnimationTimelineFromSpots(
  spots: SpotDto[],
  scale: number
): TimelineFrame[] {
  const frames: TimelineFrame[] = [];
  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i]!;
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
      const next = spots[i + 1]!;
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
