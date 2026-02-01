import {
  spotColor,
  spotPxFromTopLeftMm,
  type TimelineFrame,
} from "@/lib/animationUtils";
import type { MaskDto, SpotDto } from "@/types";

const MASK_COLORS = [
  "rgba(255,255,255,0.35)",
  "rgba(0,200,100,0.35)",
  "rgba(80,120,255,0.35)",
];

export interface AnimationOverlayProps {
  imageSize: { w: number; h: number };
  scale: number;
  masks: MaskDto[];
  spots: SpotDto[];
  frame: TimelineFrame | null;
  showDiameterLines: boolean;
  showAxisLine: boolean;
  centerPx: { x: number; y: number } | null;
  radiusPx: number;
}

/**
 * SVG overlay: masks, optional diameter lines, optional axis line, fired spots, head position, flash.
 */
export function AnimationOverlay({
  imageSize,
  scale,
  masks,
  spots,
  frame,
  showDiameterLines,
  showAxisLine,
  centerPx,
  radiusPx,
}: AnimationOverlayProps) {
  return (
    <svg
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{ width: "100%", height: "100%" }}
      viewBox={`0 0 ${imageSize.w} ${imageSize.h}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {masks.map((mask, idx) => (
        <polygon
          key={mask.id}
          points={mask.vertices
            .map((v) => `${v.x * scale},${v.y * scale}`)
            .join(" ")}
          fill={MASK_COLORS[idx % MASK_COLORS.length]}
          stroke="rgba(255,255,255,0.6)"
          strokeWidth={1}
        />
      ))}
      {showDiameterLines && centerPx && radiusPx > 0 &&
        Array.from({ length: 36 }, (_, i) => i * 5).map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const x1 = centerPx.x - radiusPx * cos;
          const y1 = centerPx.y + radiusPx * sin;
          const x2 = centerPx.x + radiusPx * cos;
          const y2 = centerPx.y - radiusPx * sin;
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(100,150,255,0.4)"
              strokeWidth={1}
            />
          );
        })}
      {frame && (
        <>
          {frame.firedIndices.map((spotIdx) => {
            const spot = spots[spotIdx];
            if (!spot) return null;
            const spotPx = spotPxFromTopLeftMm(
              spot.x_mm,
              spot.y_mm,
              scale
            );
            return (
              <circle
                key={spot.id}
                cx={spotPx.x}
                cy={spotPx.y}
                r={Math.max(2, Math.min(0.15 * scale, 8))}
                fill={spotColor(spotIdx, spots.length)}
                stroke="rgba(0,0,0,0.3)"
                strokeWidth={1}
              />
            );
          })}
          {showAxisLine && centerPx && (
            <line
              x1={centerPx.x - radiusPx}
              y1={centerPx.y}
              x2={centerPx.x + radiusPx}
              y2={centerPx.y}
              stroke="rgba(255,80,80,0.5)"
              strokeWidth={1}
            />
          )}
          {frame.flash && (
            <circle
              cx={frame.headPx.x}
              cy={frame.headPx.y}
              r={Math.max(6, Math.min(0.35 * scale, 14))}
              fill="rgba(255,220,120,0.95)"
              stroke="none"
              style={{ animation: "emission-flash 0.2s ease-out forwards" }}
            />
          )}
          <circle
            cx={frame.headPx.x}
            cy={frame.headPx.y}
            r={Math.max(4, Math.min(0.25 * scale, 10))}
            fill="red"
            stroke="white"
            strokeWidth={2}
          />
        </>
      )}
    </svg>
  );
}
