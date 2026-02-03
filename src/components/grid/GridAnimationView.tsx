import * as React from "react";
import {
  buildAnimationTimelineAdvanced,
  buildAnimationTimelineFromSpots,
  spotColor,
  spotPxFromTopLeftMm,
  type TimelineFrame,
} from "@/lib/animationUtils";
import { useAnimationPlayback } from "@/components/images/useAnimationPlayback";
import { Button } from "@/components/ui/button";
import type { GridGeneratorParamsDto, GridGeneratorSpotDto, SpotDto } from "@/types";

const ANIMATION_DURATION_MS = 5000;
const ANIMATION_FPS = 12;
const SIMPLE_SIZE_MM = 12;
const ADVANCED_SIZE_MM = 25;
const ADVANCED_RADIUS_MM = 12.5;

/** Convert grid spots to top-left mm for animation (buildAnimationTimelineFromSpots expects this). */
function toTopLeftMmSpots(
  spots: GridGeneratorSpotDto[],
  apertureType: "simple" | "advanced"
): { x_mm: number; y_mm: number }[] {
  if (apertureType === "simple") {
    return spots.map((s) => ({ x_mm: s.x_mm, y_mm: s.y_mm }));
  }
  return spots.map((s) => ({
    x_mm: s.x_mm + ADVANCED_RADIUS_MM,
    y_mm: ADVANCED_RADIUS_MM - s.y_mm,
  }));
}

export interface GridAnimationViewProps {
  params: GridGeneratorParamsDto;
  spots: GridGeneratorSpotDto[];
}

export function GridAnimationView({ params, spots }: GridAnimationViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ w: 400, h: 400 });
  const [currentFrameIndex, setCurrentFrameIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const mmSize = params.aperture_type === "simple" ? SIMPLE_SIZE_MM : ADVANCED_SIZE_MM;
  const scale = Math.min(size.w, size.h) / mmSize;
  const tlSpots = React.useMemo(
    () => toTopLeftMmSpots(spots, params.aperture_type),
    [spots, params.aperture_type]
  );

  // Advanced: sort diameter-by-diameter (theta_k, t_sort) so head moves along each diameter, then rotates
  const orderedSpots = React.useMemo(() => {
    if (params.aperture_type !== "advanced" || spots.length === 0) return spots;
    const angleStep = params.angle_step_deg ?? 5;
    return [...spots].sort((a, b) => {
      const diamA = a.theta_deg < 180 ? a.theta_deg : a.theta_deg - 180;
      const diamB = b.theta_deg < 180 ? b.theta_deg : b.theta_deg - 180;
      const tSignedA = a.theta_deg < 180 ? a.t_mm : -a.t_mm;
      const tSignedB = b.theta_deg < 180 ? b.t_mm : -b.t_mm;
      const thetaKA = Math.floor(Math.round(diamA) / angleStep);
      const thetaKB = Math.floor(Math.round(diamB) / angleStep);
      if (thetaKA !== thetaKB) return thetaKA - thetaKB;
      const tSortA = thetaKA % 2 === 0 ? tSignedA : -tSignedA;
      const tSortB = thetaKB % 2 === 0 ? tSignedB : -tSignedB;
      return tSortA - tSortB;
    });
  }, [spots, params.aperture_type, params.angle_step_deg]);

  const orderedTlSpots = React.useMemo(
    () => toTopLeftMmSpots(orderedSpots, params.aperture_type),
    [orderedSpots, params.aperture_type]
  );

  const totalFrames = Math.max(1, Math.round((ANIMATION_DURATION_MS / 1000) * ANIMATION_FPS));
  const timeline = React.useMemo(() => {
    if (params.aperture_type === "advanced" && orderedSpots.length > 0) {
      const angleStep = params.angle_step_deg ?? 5;
      return buildAnimationTimelineAdvanced(
        orderedSpots.map((s) => ({ x_mm: s.x_mm, y_mm: s.y_mm, theta_deg: s.theta_deg, t_mm: s.t_mm })),
        scale,
        angleStep,
        ADVANCED_RADIUS_MM,
        ADVANCED_RADIUS_MM
      );
    }
    if (orderedTlSpots.length === 0) return [];
    const spotsForTimeline: SpotDto[] = orderedTlSpots.map((s, i) => ({
      x_mm: s.x_mm,
      y_mm: s.y_mm,
      id: i,
      iteration_id: 0,
      sequence_index: i,
      theta_deg: 0,
      t_mm: 0,
      mask_id: null,
      component_id: null,
      created_at: "",
    }));
    return buildAnimationTimelineFromSpots(spotsForTimeline, scale);
  }, [params.aperture_type, params.angle_step_deg, orderedSpots, orderedTlSpots, scale]);

  const timelineIdx =
    timeline.length <= 1
      ? 0
      : Math.min(
          Math.round((currentFrameIndex / (totalFrames - 1)) * (timeline.length - 1)),
          timeline.length - 1
        );
  const frame = timeline.length > 0 ? (timeline[timelineIdx] ?? null) : null;

  useAnimationPlayback(playing, totalFrames, ANIMATION_DURATION_MS, setCurrentFrameIndex, setPlaying);

  React.useEffect(() => {
    setCurrentFrameIndex(0);
  }, [params.aperture_type, spots.length]);

  const handlePlay = React.useCallback(() => setPlaying(true), []);
  const handlePause = React.useCallback(() => setPlaying(false), []);
  const handleReset = React.useCallback(() => {
    setPlaying(false);
    setCurrentFrameIndex(0);
  }, []);

  if (spots.length === 0) return null;

  const isSimple = params.aperture_type === "simple";
  const plotSize = mmSize * scale;
  const offsetX = (size.w - plotSize) / 2;
  const offsetY = (size.h - plotSize) / 2;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2" role="group" aria-label="Sterowanie animacją">
        <Button size="sm" variant="outline" onClick={handlePlay} disabled={playing}>
          Odtwórz
        </Button>
        <Button size="sm" variant="outline" onClick={handlePause} disabled={!playing}>
          Wstrzymaj
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          Reset
        </Button>
      </div>
      <div
        ref={containerRef}
        className="relative w-full min-h-[300px] rounded-lg border border-border overflow-hidden bg-muted/30"
      >
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${size.w} ${size.h}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <g transform={`translate(${offsetX}, ${offsetY})`}>
            {isSimple ? (
              <SimpleBackground scale={scale} />
            ) : (
              <AdvancedBackground scale={scale} params={params} />
            )}
            {frame && (
              <AnimationOverlayContent
                frame={frame}
                spots={orderedTlSpots}
                scale={scale}
                spotColor={spotColor}
              />
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}

function SimpleBackground({ scale }: { scale: number }) {
  return (
    <rect
      x={0}
      y={0}
      width={SIMPLE_SIZE_MM * scale}
      height={SIMPLE_SIZE_MM * scale}
      fill="none"
      stroke="var(--border)"
      strokeWidth={1}
    />
  );
}

function AdvancedBackground({ scale, params }: { scale: number; params: GridGeneratorParamsDto }) {
  const cx = ADVANCED_RADIUS_MM * scale;
  const cy = ADVANCED_RADIUS_MM * scale;
  const r = ADVANCED_RADIUS_MM * scale;
  const angleStep = params.angle_step_deg ?? 5;
  const angles = Array.from({ length: Math.floor(180 / angleStep) }, (_, i) => i * angleStep);

  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={1} />
      {angles.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const x1 = cx - r * cos;
        const y1 = cy + r * sin;
        const x2 = cx + r * cos;
        const y2 = cy - r * sin;
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(100,150,255,0.25)"
            strokeWidth={0.8}
          />
        );
      })}
    </>
  );
}

function AnimationOverlayContent({
  frame,
  spots,
  scale,
  spotColor,
}: {
  frame: TimelineFrame;
  spots: { x_mm: number; y_mm: number }[];
  scale: number;
  spotColor: (i: number, total: number) => string;
}) {
  return (
    <>
      {frame.firedIndices.map((spotIdx) => {
        const spot = spots[spotIdx];
        if (!spot) return null;
        const spotPx = spotPxFromTopLeftMm(spot.x_mm, spot.y_mm, scale);
        return (
          <circle
            key={spotIdx}
            cx={spotPx.x}
            cy={spotPx.y}
            r={Math.max(2, Math.min(0.15 * scale, 8))}
            fill={spotColor(spotIdx, spots.length)}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth={1}
          />
        );
      })}
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
  );
}
