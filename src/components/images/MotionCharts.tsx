import * as React from "react";
import type {
  LinearMoveSegmentMeta,
  RotateSegmentMeta,
  TimelineFrame,
  TreatmentTimeBreakdown,
} from "@/lib/animationUtils";
import { angularVelocityAtTime, velocityAtTime } from "@/lib/animationUtils";

export interface MotionChartsProps {
  timeline: TimelineFrame[];
  linearMoveSegments?: LinearMoveSegmentMeta[];
  rotateSegments?: RotateSegmentMeta[];
  /** When true, use narrower chart width for side-by-side layout. */
  compact?: boolean;
  /** Show rotational speed chart (disable for simple mode). */
  showRotationChart?: boolean;
  currentFrame: TimelineFrame | null;
  totalDurationMs: number;
  breakdown?: TreatmentTimeBreakdown;
}

interface SeriesPoint {
  t: number;
  v: number;
}

interface PhaseSeries {
  dwell: SeriesPoint[];
  move: SeriesPoint[];
  rotate: SeriesPoint[];
  maxValue: number;
}

interface VelocitySeries {
  points: SeriesPoint[];
  maxValue: number;
}

// Build cumulative phase time components, normalised by total treatment time.
// At t = T, dwell(T) = dwellMs / totalMs etc. so final values match the global breakdown.
function buildPhaseSeries(timeline: TimelineFrame[], totalDurationMs: number): PhaseSeries | null {
  if (timeline.length === 0 || totalDurationMs <= 0) return null;
  if (timeline[0]?.t_ms == null) return null;

  const dwell: SeriesPoint[] = [];
  const move: SeriesPoint[] = [];
  const rotate: SeriesPoint[] = [];

  let dwellAcc = 0;
  let moveAcc = 0;
  let rotateAcc = 0;

  let prev = timeline[0]!;
  const firstT = prev.t_ms ?? 0;

  // Start at t=0 with zero contributions
  dwell.push({ t: firstT, v: 0 });
  move.push({ t: firstT, v: 0 });
  rotate.push({ t: firstT, v: 0 });

  for (let i = 1; i < timeline.length; i++) {
    const curr = timeline[i]!;
    const tPrev = prev.t_ms ?? 0;
    const tCurr = curr.t_ms ?? tPrev;
    const dtMs = Math.max(0, tCurr - tPrev);

    switch (prev.phase) {
      case "dwell":
        dwellAcc += dtMs;
        break;
      case "move":
        moveAcc += dtMs;
        break;
      case "rotate":
        rotateAcc += dtMs;
        break;
      default:
        break;
    }

    const totalMs = dwellAcc + moveAcc + rotateAcc || 1;

    dwell.push({ t: tCurr, v: dwellAcc / totalMs });
    move.push({ t: tCurr, v: moveAcc / totalMs });
    rotate.push({ t: tCurr, v: rotateAcc / totalMs });

    prev = curr;
  }

  return {
    dwell,
    move,
    rotate,
    maxValue: 1,
  };
}

function buildVelocitySeries(
  timeline: TimelineFrame[],
  segments?: LinearMoveSegmentMeta[]
): VelocitySeries | null {
  if (timeline.length === 0) return null;
  if (timeline[0]?.t_ms == null) return null;

  const totalDurationMs =
    timeline[timeline.length - 1]!.t_ms ?? timeline[0]!.t_ms ?? 0;
  const dtSampleMs = 1; // 0.001 s sampling (per ms)
  const nSamples = Math.max(1, Math.floor(totalDurationMs / dtSampleMs) + 1);

  const points: SeriesPoint[] = [];
  let maxValue = 0;

  let idx = 1;
  let prev = timeline[0]!;

  for (let i = 0; i < nSamples; i++) {
    const t = i * dtSampleMs;

    // Advance along timeline until current interval contains t
    while (
      idx < timeline.length &&
      (timeline[idx]?.t_ms ?? t) <= t
    ) {
      prev = timeline[idx] ?? prev;
      idx += 1;
    }

    let v = prev.v_mm_per_s ?? 0;

    if (segments && segments.length > 0) {
      const seg = segments.find(
        (s) => t >= s.tStartMs && t <= s.tEndMs
      );
      if (seg) {
        const tLocalSec = (t - seg.tStartMs) / 1000;
        v = velocityAtTime(seg.profile, tLocalSec);
      }
    }

    points.push({ t, v });
    if (v > maxValue) maxValue = v;
  }

  if (maxValue <= 0) maxValue = 1;

  return { points, maxValue };
}

function buildRotationalSpeedSeries(
  timeline: TimelineFrame[],
  totalDurationMs: number,
  segments?: RotateSegmentMeta[]
): VelocitySeries | null {
  if (timeline.length === 0) return null;
  if (timeline[0]?.t_ms == null) return null;

  const points: SeriesPoint[] = [];
  let maxValue = 0;

  if (segments && segments.length > 0) {
    // Use 1 ms sampling so short rotations are captured with maximum temporal resolution.
    const dtSampleMs = 1;
    const nSamples = Math.max(1, Math.floor(totalDurationMs / dtSampleMs) + 1);

    for (let i = 0; i < nSamples; i++) {
      const t = i * dtSampleMs;
      let omega = 0;
      const seg = segments.find((s) => t >= s.tStartMs && t <= s.tEndMs);
      if (seg) {
        const tLocalSec = (t - seg.tStartMs) / 1000;
        omega = angularVelocityAtTime(seg.profile, tLocalSec);
      }
      points.push({ t, v: omega });
      if (omega > maxValue) maxValue = omega;
    }
  } else {
    const dtSampleMs = 100;
    const nSamples = Math.max(1, Math.floor(totalDurationMs / dtSampleMs) + 1);
    for (let i = 0; i < nSamples; i++) {
      points.push({ t: i * dtSampleMs, v: 0 });
    }
  }

  if (maxValue <= 0) maxValue = 1;
  return { points, maxValue };
}

/** Emission on/off over time: 1 during dwell (laser firing), 0 during move/rotate. */
function buildEmissionSeries(timeline: TimelineFrame[], totalDurationMs: number): VelocitySeries | null {
  if (timeline.length === 0) return null;
  if (timeline[0]?.t_ms == null) return null;

  const dtSampleMs = 1;
  const nSamples = Math.max(1, Math.floor(totalDurationMs / dtSampleMs) + 1);

  const points: SeriesPoint[] = [];
  let maxValue = 0;
  let idx = 1;
  let prev = timeline[0]!;

  for (let i = 0; i < nSamples; i++) {
    const t = i * dtSampleMs;
    while (idx < timeline.length && (timeline[idx]?.t_ms ?? t) <= t) {
      prev = timeline[idx] ?? prev;
      idx += 1;
    }
    const v = prev.phase === "dwell" ? 1 : 0;
    points.push({ t, v });
    if (v > maxValue) maxValue = v;
  }

  if (maxValue <= 0) maxValue = 1;
  return { points, maxValue };
}

interface TimeSeriesChartSeries {
  points: SeriesPoint[];
  color: string;
  dash?: string;
  width?: number;
}

interface TimeSeriesChartProps {
  width: number;
  height: number;
  totalDurationMs: number;
  currentTimeMs: number;
  series: TimeSeriesChartSeries[];
  maxY: number;
  yLabel: string;
}

function TimeSeriesChart({
  width,
  height,
  totalDurationMs,
  currentTimeMs,
  series,
  maxY,
  yLabel,
}: TimeSeriesChartProps) {
  const paddingLeft = 52;
  const paddingRight = 6;
  const paddingTop = 6;
  const paddingBottom = 16;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const xMaxMsRaw = Math.max(totalDurationMs, 1);
  const xMaxMs = Math.ceil(xMaxMsRaw / 1000) * 1000;

  const niceRoundUp = (value: number): number => {
    if (value <= 0) return 1;
    const exp = Math.floor(Math.log10(value));
    const base = Math.pow(10, exp);
    const norm = value / base;
    let factor = 1;
    if (norm > 5) factor = 10;
    else if (norm > 2) factor = 5;
    else if (norm > 1) factor = 2;
    return factor * base;
  };

  const yMaxRaw = Math.max(maxY, 1);
  const yMax = niceRoundUp(yMaxRaw);

  const toX = (t: number) =>
    paddingLeft + (xMaxMs > 0 ? (t / xMaxMs) * plotWidth : 0);
  const toY = (v: number) =>
    paddingTop + (yMax > 0 ? plotHeight - (v / yMax) * plotHeight : plotHeight);

  const gridColor = "rgba(148, 163, 184, 0.3)";
  const axisColor = "rgba(148, 163, 184, 0.9)";

  const xTicks = 4;
  const yTicks = 4;

  const currentX = toX(Math.min(Math.max(currentTimeMs, 0), xMaxMs));

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="border border-border rounded bg-white"
    >
      {/* Grid lines */}
      {Array.from({ length: xTicks + 1 }, (_, i) => {
        const x = paddingLeft + (plotWidth * i) / xTicks;
        return (
          <line
            key={`x-${i}`}
            x1={x}
            y1={paddingTop}
            x2={x}
            y2={paddingTop + plotHeight}
            stroke={gridColor}
            strokeWidth={0.5}
          />
        );
      })}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const y = paddingTop + (plotHeight * i) / yTicks;
        return (
          <line
            key={`y-${i}`}
            x1={paddingLeft}
            y1={y}
            x2={paddingLeft + plotWidth}
            y2={y}
            stroke={gridColor}
            strokeWidth={0.5}
          />
        );
      })}

      {/* Axes */}
      <line
        x1={paddingLeft}
        y1={paddingTop}
        x2={paddingLeft}
        y2={paddingTop + plotHeight}
        stroke={axisColor}
        strokeWidth={0.8}
      />
      <line
        x1={paddingLeft}
        y1={paddingTop + plotHeight}
        x2={paddingLeft + plotWidth}
        y2={paddingTop + plotHeight}
        stroke={axisColor}
        strokeWidth={0.8}
      />

      {/* Series */}
      {series.map((s, idx) => {
        if (s.points.length === 0) return null;
        const d = s.points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.t)} ${toY(p.v)}`)
          .join(" ");
        return (
          <path
            key={idx}
            d={d}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width ?? 1.8}
            strokeDasharray={s.dash}
          />
        );
      })}

      {/* Current time cursor */}
      <line
        x1={currentX}
        y1={paddingTop}
        x2={currentX}
        y2={paddingTop + plotHeight}
        stroke="rgba(248, 113, 113, 0.9)"
        strokeWidth={1}
        strokeDasharray="4 2"
      />

      {/* Labels */}
      {/* Axis labels */}
      <text
        x={paddingLeft + plotWidth / 2}
        y={height - 4}
        fontSize={12}
        fontWeight={600}
        textAnchor="middle"
        fill={axisColor}
      >
        t [s]
      </text>
      <text
        x={10}
        y={paddingTop + plotHeight / 2}
        fontSize={12}
        fontWeight={600}
        textAnchor="middle"
        fill={axisColor}
        transform={`rotate(-90 8 ${paddingTop + plotHeight / 2})`}
      >
        {yLabel}
      </text>

      {/* Numeric tick labels */}
      {Array.from({ length: xTicks + 1 }, (_, i) => {
        const x = paddingLeft + (plotWidth * i) / xTicks;
        const tSec = (xMaxMs / 1000) * (i / xTicks);
        return (
          <text
            key={`xlabel-${i}`}
            x={x}
            y={paddingTop + plotHeight + 10}
            fontSize={10}
            fontWeight={500}
            textAnchor="middle"
            fill={axisColor}
          >
            {tSec.toFixed(1)}
          </text>
        );
      })}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const y = paddingTop + (plotHeight * i) / yTicks;
        const vVal = maxY * (1 - i / yTicks);
        return (
          <text
            key={`ylabel-${i}`}
            x={paddingLeft - 8}
            y={y + 3}
            fontSize={10}
            fontWeight={500}
            textAnchor="end"
            fill={axisColor}
          >
            {vVal.toFixed(1)}
          </text>
        );
      })}
    </svg>
  );
}

const CHART_WIDTH_FULL = 780;
const CHART_WIDTH_COMPACT = 640;

export function MotionCharts({
  timeline,
  linearMoveSegments,
  rotateSegments,
  compact = false,
  showRotationChart = true,
  currentFrame,
  totalDurationMs,
  breakdown,
}: MotionChartsProps) {
  const currentTimeMs = currentFrame?.t_ms ?? 0;
  const chartWidth = compact ? CHART_WIDTH_COMPACT : CHART_WIDTH_FULL;

  const phase = React.useMemo(
    () => buildPhaseSeries(timeline, totalDurationMs),
    [timeline, totalDurationMs]
  );
  const velocity = React.useMemo(
    () => buildVelocitySeries(timeline, linearMoveSegments),
    [timeline, linearMoveSegments]
  );
  const rotationalSpeed = React.useMemo(
    () => buildRotationalSpeedSeries(timeline, totalDurationMs, rotateSegments),
    [timeline, totalDurationMs, rotateSegments]
  );
  const emission = React.useMemo(
    () => buildEmissionSeries(timeline, totalDurationMs),
    [timeline, totalDurationMs]
  );

  if (!phase || !velocity || !rotationalSpeed || !emission) {
    return null;
  }

  const seriesPhase: TimeSeriesChartSeries[] = [
    { points: phase.dwell, color: "#f59e0b", dash: "1", width: 1.8 }, // emission – solid
    { points: phase.move, color: "#3b82f6", dash: "6 3", width: 1.8 }, // move – dashed
    { points: phase.rotate, color: "#ec4899", dash: "2 2", width: 1.8 }, // rotation – dotted
  ];

  const seriesVelocity: TimeSeriesChartSeries[] = [
    { points: velocity.points, color: "#22c55e", width: 2.0 },
  ]; // green – linear speed

  return (
    <div className="flex flex-col gap-4 text-xs text-muted-foreground">
      <div className="space-y-1">
        <div>Phase time share f (–) vs. Time t (s)</div>
        <TimeSeriesChart
          width={chartWidth}
          height={240}
          totalDurationMs={totalDurationMs}
          currentTimeMs={currentTimeMs}
          series={seriesPhase}
          maxY={phase.maxValue}
          yLabel="Phase time share f (–)"
        />
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <span className="flex items-center gap-1">
            <span className="inline-block h-[6px] w-[10px] rounded bg-[#f59e0b]" />
            Emisja
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-[6px] w-[10px] rounded bg-[#3b82f6]" />
            Ruch liniowy
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-[6px] w-[10px] rounded bg-[#ec4899]" />
            Obrót
          </span>
          {breakdown && (
            <span className="flex flex-wrap gap-2 text-[10px] text-muted-foreground/90">
              <span>
                Emisja: {(breakdown.dwellMs / 1000).toFixed(2)} s
              </span>
              <span>
                Ruch: {(breakdown.moveMs / 1000).toFixed(2)} s
              </span>
              <span>
                Obrót: {(breakdown.rotateMs / 1000).toFixed(2)} s
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <div>Linear carriage speed v (mm/s) vs. Time t (s) – Δt = 0.001 s</div>
        <TimeSeriesChart
          width={chartWidth}
          height={240}
          totalDurationMs={totalDurationMs}
          currentTimeMs={currentTimeMs}
          series={seriesVelocity}
          maxY={velocity.maxValue}
          yLabel="Linear carriage speed v (mm/s)"
        />
      </div>
      <div className="space-y-1">
        {showRotationChart && rotationalSpeed.maxValue > 0 && (
          <>
            <div>Angular speed ω (°/s) vs. Time t (s) – Δt = 0.02 s</div>
            <TimeSeriesChart
              width={chartWidth}
              height={240}
              totalDurationMs={totalDurationMs}
              currentTimeMs={currentTimeMs}
              series={[
                { points: rotationalSpeed.points, color: "#ec4899", width: 2.0 },
              ]}
              maxY={rotationalSpeed.maxValue}
              yLabel="Angular speed ω (°/s)"
            />
          </>
        )}
      </div>
      <div className="space-y-1">
        <div>Emission (on/off) vs. Time t (s) – Δt = 0.1 s</div>
        <TimeSeriesChart
          width={chartWidth}
          height={240}
          totalDurationMs={totalDurationMs}
          currentTimeMs={currentTimeMs}
          series={[{ points: emission.points, color: "#f59e0b", width: 2.0 }]}
          maxY={1}
          yLabel="Emission (–)"
        />
      </div>
    </div>
  );
}

