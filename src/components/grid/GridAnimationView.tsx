import * as React from "react";
import {
  ADVANCED_MOTION_PARAMS,
  buildAnimationTimelineAdvanced,
  buildAnimationTimelineFromSpots,
  estimateAdvancedTreatmentTimeBreakdown,
  estimateAdvancedTreatmentTimeMs,
  estimateSimpleTreatmentTimeBreakdown,
  spotColor,
  spotPxFromTopLeftMm,
  type AdvancedMotionParams,
  type AdvancedSpot,
  type TimelineFrame,
} from "@/lib/animationUtils";
import { MotionCharts } from "@/components/images/MotionCharts";
import { AdvancedMotionParamsForm } from "@/components/images/AdvancedMotionParamsForm";
import { useAnimationPlayback, useAnimationPlaybackRealtime } from "@/components/images/useAnimationPlayback";
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
  const [motionParams, setMotionParams] = React.useState<AdvancedMotionParams>(() => {
    if (params.aperture_type === "simple") {
      // Simple mode defaults: v_max = 200 mm/s, a = 60 m/s² ≈ 60000 mm/s², dwell = 20 ms.
      return {
        ...ADVANCED_MOTION_PARAMS,
        linearSpeedMmPerS: 200,
        linearAccelMmPerS2: 60_000,
        dwellMsPerSpot: 20,
      };
    }
    // Advanced mode uses ADVANCED_MOTION_PARAMS as-is.
    return { ...ADVANCED_MOTION_PARAMS };
  });
  const [showConfig, setShowConfig] = React.useState(false);
  const [showSmears, setShowSmears] = React.useState(false);
  const [showCharts, setShowCharts] = React.useState(false);

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

  const isAdvanced = params.aperture_type === "advanced" && orderedSpots.length > 0;
  const isSimple = params.aperture_type === "simple" && orderedSpots.length > 0;
  const angleStep = params.angle_step_deg ?? 5;
  const advancedSpotsCenterMm: AdvancedSpot[] = React.useMemo(
    () =>
      orderedSpots.map((s) => ({
        x_mm: s.x_mm,
        y_mm: s.y_mm,
        theta_deg: s.theta_deg,
        t_mm: s.t_mm,
      })),
    [orderedSpots]
  );

  const { timeline, totalDurationMs, breakdown, linearMoveSegments, rotateSegments } = React.useMemo(() => {
    if (isAdvanced) {
      const { frames, linearMoveSegments: segments, rotateSegments: rotSegs } = buildAnimationTimelineAdvanced(
        advancedSpotsCenterMm,
        scale,
        angleStep,
        ADVANCED_RADIUS_MM,
        ADVANCED_RADIUS_MM,
        motionParams
      );
      const totalMs = estimateAdvancedTreatmentTimeMs(advancedSpotsCenterMm, angleStep, motionParams);
      const breakdownResult = estimateAdvancedTreatmentTimeBreakdown(
        advancedSpotsCenterMm,
        angleStep,
        motionParams
      );
      return {
        timeline: frames,
        totalDurationMs: totalMs,
        breakdown: breakdownResult,
        linearMoveSegments: segments,
        rotateSegments: rotSegs,
      };
    }

    if (orderedTlSpots.length === 0) {
      return {
        timeline: [] as TimelineFrame[],
        totalDurationMs: ANIMATION_DURATION_MS,
        breakdown: undefined,
        linearMoveSegments: [],
        rotateSegments: [],
      };
    }

    // Simple (snake) mode with the same motion model and charts as advanced mode.
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
    const simpleTimeline = buildAnimationTimelineFromSpots(spotsForTimeline, scale, motionParams);
    const breakdownSimple = estimateSimpleTreatmentTimeBreakdown(spotsForTimeline, motionParams);
    return {
      timeline: simpleTimeline,
      totalDurationMs: breakdownSimple.totalMs,
      breakdown: breakdownSimple,
      linearMoveSegments: [],
      rotateSegments: [],
    };
  }, [isAdvanced, advancedSpotsCenterMm, orderedTlSpots, scale, angleStep, motionParams]);

  const totalFrames = Math.max(1, Math.round((totalDurationMs / 1000) * ANIMATION_FPS));
  const timelineIdx =
    timeline.length <= 1
      ? 0
      : isAdvanced
        ? Math.min(currentFrameIndex, timeline.length - 1)
        : Math.min(
            Math.round((currentFrameIndex / Math.max(1, totalFrames - 1)) * (timeline.length - 1)),
            timeline.length - 1
          );
  const frame = timeline.length > 0 ? (timeline[timelineIdx] ?? null) : null;

  useAnimationPlayback(!isAdvanced && playing, totalFrames, totalDurationMs, setCurrentFrameIndex, setPlaying);
  useAnimationPlaybackRealtime(isAdvanced && playing, timeline, totalDurationMs, setCurrentFrameIndex, setPlaying);

  React.useEffect(() => {
    setCurrentFrameIndex(0);
  }, [params.aperture_type, spots.length]);

  React.useEffect(() => {
    if (isAdvanced) {
      setPlaying(false);
      setCurrentFrameIndex(0);
    }
  }, [motionParams, isAdvanced]);

  const handlePlay = React.useCallback(() => setPlaying(true), []);
  const handlePause = React.useCallback(() => setPlaying(false), []);
  const handleReset = React.useCallback(() => {
    setPlaying(false);
    setCurrentFrameIndex(0);
  }, []);

  if (spots.length === 0) return null;

  const plotSize = mmSize * scale;
  const offsetX = (size.w - plotSize) / 2;
  const offsetY = (size.h - plotSize) / 2;
  const currentSpeedMmPerS = frame?.v_mm_per_s ?? null;
  const formattedTotalTime = React.useMemo(() => {
    const s = totalDurationMs / 1000;
    const decimals = s >= 1 ? 2 : s >= 0.1 ? 3 : 4;
    return `${s.toFixed(decimals)} s`;
  }, [totalDurationMs]);

  return (
    <div className="space-y-2">
      <div className="flex justify-center">
        <div className="flex items-center gap-3 rounded-full border border-border/70 bg-white/80 px-3 py-1 shadow-sm">
          <Button
            size="icon"
            variant="outline"
            onClick={handlePlay}
            disabled={playing}
            className="h-8 w-8 rounded-full p-0"
            aria-label="Play animation"
          >
            <span aria-hidden>▶</span>
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={handlePause}
            disabled={!playing}
            className="h-8 w-8 rounded-full p-0"
            aria-label="Pause animation"
          >
            <span aria-hidden>⏸</span>
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={handleReset}
            className="h-8 w-8 rounded-full p-0"
            aria-label="Reset animation"
          >
            <span aria-hidden>⏲</span>
          </Button>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Czas: {formattedTotalTime}
          </span>
        </div>
      </div>
      <div
        className={
          (isAdvanced || isSimple) && showCharts && timeline.length > 0
            ? "flex flex-row gap-4 items-start"
            : ""
        }
      >
        <div
          ref={containerRef}
          className={`relative rounded-lg border border-border overflow-hidden bg-muted/30 ${
            isAdvanced && showCharts && timeline.length > 0
              ? "flex-1 min-w-0 min-h-[300px]"
              : "w-full min-h-[300px]"
          }`}
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
              {isAdvanced && showSmears && frame && (
                <SmearOverlayContent
                  spots={orderedTlSpots}
                  scale={scale}
                  motionParams={motionParams}
                  frame={frame}
                />
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
        {(isAdvanced || isSimple) && showCharts && timeline.length > 0 && (
          <div className="flex-shrink-0 w-[700px] overflow-y-auto max-h-[85vh]">
            <MotionCharts
              timeline={timeline}
              linearMoveSegments={linearMoveSegments}
              rotateSegments={rotateSegments}
              compact
              showRotationChart={isAdvanced}
              currentFrame={frame}
              totalDurationMs={totalDurationMs}
              breakdown={breakdown}
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Sterowanie parametrami animacji">
        {(isAdvanced || isSimple) && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowConfig((prev) => !prev)}
              >
                <span data-lang="pl">Konfiguracja</span>
                <span data-lang="en">Configuration</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCharts((prev) => !prev)}
              >
                <span data-lang="pl">Wykresy prędkości</span>
                <span data-lang="en">Speed charts</span>
              </Button>
              {motionParams.fireInMotionEnabled && (
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showSmears}
                    onChange={(e) => setShowSmears(e.target.checked)}
                    className="h-3 w-3 rounded border border-input"
                  />
                  <span className="whitespace-nowrap">Smugi emisji</span>
                </label>
              )}
              {showConfig && (
                <AdvancedMotionParamsForm
                  value={motionParams}
                  onChange={setMotionParams}
                  totalDurationMs={totalDurationMs}
                  breakdown={breakdown}
                />
              )}
            </div>
            <div className="text-xs text-muted-foreground ml-auto">
              <span data-lang="pl">Prędkość wózka: </span>
              <span data-lang="en">Carriage speed: </span>
              {currentSpeedMmPerS != null ? `${currentSpeedMmPerS.toFixed(1)} mm/s` : "—"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SimpleBackground({ scale }: { scale: number }) {
  const width = SIMPLE_SIZE_MM * scale;
  const height = SIMPLE_SIZE_MM * scale;
  const cx = width / 2;
  const cy = height / 2;
  const axisStroke = "rgba(120,120,120,0.5)";

  return (
    <>
      <rect x={0} y={0} width={width} height={height} fill="none" stroke="var(--border)" strokeWidth={1} />
      {/* Axes */}
      <line x1={0} y1={cy} x2={width} y2={cy} stroke={axisStroke} strokeWidth={0.8} strokeDasharray="4 2" />
      <line x1={cx} y1={0} x2={cx} y2={height} stroke={axisStroke} strokeWidth={0.8} strokeDasharray="4 2" />
      {/* Axis labels */}
      <text x={width - 4} y={cy - 4} fontSize={8} textAnchor="end" fill={axisStroke}>
        X
      </text>
      <text x={cx + 4} y={8} fontSize={8} fill={axisStroke}>
        Y
      </text>
    </>
  );
}

function AdvancedBackground({ scale, params }: { scale: number; params: GridGeneratorParamsDto }) {
  const cx = ADVANCED_RADIUS_MM * scale;
  const cy = ADVANCED_RADIUS_MM * scale;
  const r = ADVANCED_RADIUS_MM * scale;
  const angleStep = params.angle_step_deg ?? 5;
  const angles = Array.from({ length: Math.floor(180 / angleStep) }, (_, i) => i * angleStep);
  const axisStroke = "rgba(120,120,120,0.5)";

  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={1} />
      {/* Axes */}
      <line
        x1={cx - r}
        y1={cy}
        x2={cx + r}
        y2={cy}
        stroke={axisStroke}
        strokeWidth={0.8}
        strokeDasharray="4 2"
      />
      <line
        x1={cx}
        y1={cy - r}
        x2={cx}
        y2={cy + r}
        stroke={axisStroke}
        strokeWidth={0.8}
        strokeDasharray="4 2"
      />
      {/* Axis labels */}
      <text x={cx + r - 4} y={cy - 4} fontSize={8} textAnchor="end" fill={axisStroke}>
        X
      </text>
      <text x={cx + 4} y={cy - r + 10} fontSize={8} fill={axisStroke}>
        Y
      </text>
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

const SPOT_DIAMETER_MM = 0.3;

function SmearOverlayContent({
  spots,
  scale,
  motionParams,
  frame,
}: {
  spots: { x_mm: number; y_mm: number }[];
  scale: number;
  motionParams: AdvancedMotionParams;
  frame: TimelineFrame | null;
}) {
  if (spots.length === 0 || !frame) return null;

  const vEmitMmPerS =
    motionParams.fireInMotionEnabled && motionParams.minEmissionSpeedMmPerS > 0
      ? Math.min(motionParams.minEmissionSpeedMmPerS, motionParams.linearSpeedMmPerS)
      : 0;
  const tEffS = motionParams.dwellMsPerSpot / 1000;
  const smearLengthMm = vEmitMmPerS * tEffS;
  if (smearLengthMm <= 0) return null;

  const rMm = SPOT_DIAMETER_MM / 2;
  const strokeWidthPx = 2 * rMm * scale;
  const fired = new Set(frame.firedIndices);

  const lines = spots.map((c, i) => {
    if (!fired.has(i)) return null;
    let prev = c;
    let next = c;
    if (spots.length > 1) {
      if (i === 0) {
        next = spots[1] ?? c;
      } else if (i === spots.length - 1) {
        prev = spots[spots.length - 2] ?? c;
      } else {
        prev = spots[i - 1] ?? c;
        next = spots[i + 1] ?? c;
      }
    }
    const vx = next.x_mm - prev.x_mm;
    const vy = next.y_mm - prev.y_mm;
    const norm = Math.hypot(vx, vy);
    if (norm === 0) return null;
    const ux = vx / norm;
    const uy = vy / norm;
    const halfL = smearLengthMm / 2;
    const p0Mm = { x: c.x_mm - ux * halfL, y: c.y_mm - uy * halfL };
    const p1Mm = { x: c.x_mm + ux * halfL, y: c.y_mm + uy * halfL };
    const p0Px = spotPxFromTopLeftMm(p0Mm.x, p0Mm.y, scale);
    const p1Px = spotPxFromTopLeftMm(p1Mm.x, p1Mm.y, scale);
    return (
      <line
        key={i}
        x1={p0Px.x}
        y1={p0Px.y}
        x2={p1Px.x}
        y2={p1Px.y}
        stroke="rgba(255,100,100,0.7)"
        strokeWidth={strokeWidthPx}
        strokeLinecap="round"
      />
    );
  });

  return <>{lines}</>;
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
