import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  ADVANCED_MOTION_PARAMS,
  buildAnimationTimelineAdvanced,
  buildAnimationTimelineFromSpots,
  estimateAdvancedTreatmentTimeBreakdown,
  estimateAdvancedTreatmentTimeMs,
  estimateSimpleTreatmentTimeBreakdown,
  spotColor,
  type AdvancedMotionParams,
} from "@/lib/animationUtils";
import type { ImageDto } from "@/types";
import { AdvancedMotionParamsForm } from "./AdvancedMotionParamsForm";
import { MotionCharts } from "./MotionCharts";
import { AnimationOverlay } from "./AnimationOverlay";
import { useAnimationPlayback, useAnimationPlaybackRealtime } from "./useAnimationPlayback";
import { useAnimationTabData } from "./useAnimationTabData";

export interface AnimationTabProps {
  imageId: number;
  image: ImageDto;
  selectedIterationId?: number | null;
  onSelectIteration?: (id: number) => void;
  isDemo?: boolean;
}

const ANIMATION_DURATION_MS = 5000;
const ANIMATION_FPS = 12;
const APERTURE_RADIUS_MM = 12.5;

interface AnimationTabFormValues {
  iterationId: number | "";
  showDiameterLines: boolean;
}

function AnimationTab({
  imageId,
  image,
  selectedIterationId: selectedFromParent,
  onSelectIteration,
  isDemo = false,
}: AnimationTabProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = React.useState<{ w: number; h: number } | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [motionParams, setMotionParams] = React.useState<AdvancedMotionParams>(() => ({
    ...ADVANCED_MOTION_PARAMS,
  }));
  const [showConfig, setShowConfig] = React.useState(false);
  const [showCharts, setShowCharts] = React.useState(false);

  const {
    imageObjectUrl,
    iterations,
    masks,
    spots,
    selectedIterationId,
    loadingIterations,
    loadingSpots,
    errorIterations,
    errorSpots,
    errorImage,
  } = useAnimationTabData(imageId, selectedFromParent ?? null);

  const { control, watch, setValue } = useForm<AnimationTabFormValues>({
    defaultValues: {
      iterationId: "",
      showDiameterLines: false,
    },
  });

  const iterationId = watch("iterationId");
  const showDiameterLines = watch("showDiameterLines");
  const selectedIteration = iterations.find((i) => i.id === selectedIterationId);
  const algorithmMode = selectedIteration?.params_snapshot?.algorithm_mode;

  // Sync form iterationId when parent or iterations list change
  React.useEffect(() => {
    const next = selectedFromParent ?? iterations[0]?.id ?? "";
    setValue("iterationId", next);
  }, [selectedFromParent, iterations, setValue]);

  // Reset frame when selected iteration changes
  React.useEffect(() => {
    setCurrentFrameIndex(0);
  }, [selectedIterationId]);

  const scale = imageSize && image.width_mm > 0 ? imageSize.w / image.width_mm : 1;
  // Center of treatment grid: mask centroid (matches backend) so diameter lines pass through spots
  const centerPx = React.useMemo(() => {
    if (!imageSize || imageSize.w <= 0 || imageSize.h <= 0) return null;
    const fallback = { x: imageSize.w / 2, y: imageSize.h / 2 };
    if (masks.length > 0) {
      const allVerts = masks.flatMap((m) => m.vertices);
      if (allVerts.length > 0) {
        const cxMm = allVerts.reduce((s, v) => s + v.x, 0) / allVerts.length;
        const cyMm = allVerts.reduce((s, v) => s + v.y, 0) / allVerts.length;
        return { x: cxMm * scale, y: cyMm * scale };
      }
    }
    if (spots.length > 0) {
      const cxMm = spots.reduce((s, p) => s + p.x_mm, 0) / spots.length;
      const cyMm = spots.reduce((s, p) => s + p.y_mm, 0) / spots.length;
      return { x: cxMm * scale, y: cyMm * scale };
    }
    return fallback;
  }, [imageSize, spots, masks, scale]);
  const radiusPx = centerPx ? APERTURE_RADIUS_MM * scale : 0;

  // Advanced: sort diameter-by-diameter (theta_k, t_sort) so head moves along each diameter, then rotates
  const orderedSpots = React.useMemo(() => {
    if (algorithmMode !== "advanced" || spots.length === 0) return spots;
    const angleStep = selectedIteration?.params_snapshot?.angle_step_deg ?? 5;
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
  }, [spots, algorithmMode, selectedIteration?.params_snapshot?.angle_step_deg]);

  const isAdvanced = algorithmMode === "advanced" && imageSize && image.width_mm > 0 && orderedSpots.length > 0;
  const isSimple = algorithmMode === "simple" && imageSize && image.width_mm > 0 && orderedSpots.length > 0;
  const angleStep = selectedIteration?.params_snapshot?.angle_step_deg ?? 5;
  const { timeline, totalDurationMs, breakdown, linearMoveSegments, rotateSegments } = React.useMemo(() => {
    if (orderedSpots.length === 0) {
      return {
        timeline: [] as ReturnType<typeof buildAnimationTimelineFromSpots>,
        totalDurationMs: ANIMATION_DURATION_MS,
        breakdown: undefined,
        linearMoveSegments: [] as import("@/lib/animationUtils").LinearMoveSegmentMeta[],
        rotateSegments: [] as import("@/lib/animationUtils").RotateSegmentMeta[],
      };
    }
    if (isAdvanced) {
      const widthMm = image.width_mm;
      const heightMm = widthMm * (imageSize!.h / imageSize!.w);
      const centerXMm = widthMm / 2;
      const centerYMm = heightMm / 2;
      const spotsCenterMm = orderedSpots.map((s) => ({
        x_mm: s.x_mm - centerXMm,
        y_mm: centerYMm - s.y_mm,
        theta_deg: s.theta_deg,
        t_mm: s.t_mm,
      }));
      const { frames, linearMoveSegments, rotateSegments } = buildAnimationTimelineAdvanced(
        spotsCenterMm,
        scale,
        angleStep,
        centerXMm,
        centerYMm,
        motionParams
      );
      const totalMs = estimateAdvancedTreatmentTimeMs(spotsCenterMm, angleStep, motionParams);
      const breakdownResult = estimateAdvancedTreatmentTimeBreakdown(
        spotsCenterMm,
        angleStep,
        motionParams
      );
      return {
        timeline: frames,
        totalDurationMs: totalMs,
        breakdown: breakdownResult,
        linearMoveSegments,
        rotateSegments,
      };
    }
    // Simple (snake) mode with the same motion model and charts as advanced mode.
    const timelineSimple = buildAnimationTimelineFromSpots(orderedSpots, scale, motionParams);
    const breakdownSimple = estimateSimpleTreatmentTimeBreakdown(orderedSpots, motionParams);
    return {
      timeline: timelineSimple,
      totalDurationMs: breakdownSimple.totalMs,
      breakdown: breakdownSimple,
      linearMoveSegments: [] as import("@/lib/animationUtils").LinearMoveSegmentMeta[],
      rotateSegments: [] as import("@/lib/animationUtils").RotateSegmentMeta[],
    };
  }, [
    orderedSpots,
    scale,
    isAdvanced,
    imageSize,
    image.width_mm,
    angleStep,
    motionParams,
  ]);

  const totalFrames = Math.max(1, Math.round((totalDurationMs / 1000) * 12));
  const timelineIdx =
    timeline.length <= 1
      ? 0
      : isAdvanced
        ? Math.min(currentFrameIndex, timeline.length - 1)
        : Math.min(Math.round((currentFrameIndex / Math.max(1, totalFrames - 1)) * (timeline.length - 1)), timeline.length - 1);
  const frame = timeline.length > 0 ? (timeline[timelineIdx] ?? null) : null;

  useAnimationPlayback(!isAdvanced && playing, totalFrames, totalDurationMs, setCurrentFrameIndex, setPlaying);
  useAnimationPlaybackRealtime(isAdvanced && playing, timeline, totalDurationMs, setCurrentFrameIndex, setPlaying);

  // Reset animation when motion params change (advanced mode)
  React.useEffect(() => {
    if (isAdvanced) {
      setPlaying(false);
      setCurrentFrameIndex(0);
    }
  }, [motionParams, isAdvanced]);

  const handleIterationChange = React.useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      if (v) {
        const id = Number(v);
        setValue("iterationId", id);
        onSelectIteration?.(id);
      }
    },
    [onSelectIteration, setValue]
  );

  const handlePlay = React.useCallback(() => setPlaying(true), []);
  const handlePause = React.useCallback(() => setPlaying(false), []);
  const handleReset = React.useCallback(() => {
    setPlaying(false);
    setCurrentFrameIndex(0);
  }, []);

  const handleImageLoad = React.useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // Reset motion params defaults when switching between simple/advanced modes.
  React.useEffect(() => {
    setMotionParams((prev) => {
      if (algorithmMode === "simple") {
        return {
          ...prev,
          linearSpeedMmPerS: 200,
          linearAccelMmPerS2: 60_000,
          dwellMsPerSpot: 20,
        };
      }
      if (algorithmMode === "advanced") {
        return {
          ...prev,
          linearSpeedMmPerS: 1000,
          linearAccelMmPerS2: 200_000,
          dwellMsPerSpot: 20,
        };
      }
      return prev;
    });
  }, [algorithmMode]);

  const currentSpeedMmPerS = frame?.v_mm_per_s ?? null;
  const formattedTotalTime = React.useMemo(() => {
    const s = totalDurationMs / 1000;
    const decimals = s >= 1 ? 2 : s >= 0.1 ? 3 : 4;
    return `${s.toFixed(decimals)} s`;
  }, [totalDurationMs]);

  return (
    <div className="space-y-4" aria-label="Animation tab">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-sm font-medium">
          <span data-lang="pl">Wizualizacja sekwencji emisji</span>
          <span data-lang="en">Emission sequence visualization</span>
        </h2>
        {loadingIterations ? (
          <span className="text-sm text-muted-foreground">
            <span data-lang="pl">Ładowanie iteracji…</span>
            <span data-lang="en">Loading iterations…</span>
          </span>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              <span data-lang="pl">Iteracja:</span>
              <span data-lang="en">Iteration:</span>
            </span>
            <select
              value={iterationId === "" ? "" : String(iterationId)}
              onChange={handleIterationChange}
              className="rounded-xl border-2 border-input bg-white px-2 py-1 text-sm focus:border-primary"
              disabled={iterations.length === 0}
            >
              {iterations.length === 0 && (
                <option value="">
                  <span data-lang="pl">Brak iteracji</span>
                  <span data-lang="en">No iterations</span>
                </option>
              )}
              {iterations.map((it) => (
                <option key={it.id} value={it.id}>
                  #{it.id} – {it.spots_count ?? 0} punktów
                  {it.is_demo ? " (demo)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {(errorIterations || errorSpots || errorImage) && (
        <div
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {errorIterations && <p>{errorIterations}</p>}
          {errorSpots && <p>{errorSpots}</p>}
          {errorImage && <p>{errorImage}</p>}
        </div>
      )}

      {loadingSpots && selectedIterationId && (
        <p className="text-sm text-muted-foreground">
          <span data-lang="pl">Ładowanie punktów…</span>
          <span data-lang="en">Loading spots…</span>
        </p>
      )}

      {spots.length > 0 && (
        <div className="flex justify-center">
          <div className="flex items-center gap-3 rounded-full border border-border/70 bg-white/80 px-3 py-1 shadow-sm">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={handlePlay}
              disabled={spots.length === 0 || playing}
              className="h-8 w-8 rounded-full p-0"
              aria-label="Odtwórz animację"
            >
              <span aria-hidden>▶</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={handlePause}
              disabled={!playing}
              className="h-8 w-8 rounded-full p-0"
              aria-label="Wstrzymaj animację"
            >
              <span aria-hidden>⏸</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={handleReset}
              disabled={spots.length === 0}
              className="h-8 w-8 rounded-full p-0"
              aria-label="Resetuj animację"
            >
              <span aria-hidden>⟲</span>
            </Button>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Czas: {formattedTotalTime}
            </span>
          </div>
        </div>
      )}

      {image.width_mm <= 0 ? (
        <p className="text-sm text-muted-foreground">
          Skalibruj skalę obrazu w zakładce Maski (narzędzie „Kalibruj skalę”), aby zobaczyć animację.
        </p>
      ) : (
        <div
          className={
            (isAdvanced || isSimple) && showCharts && timeline.length > 0
              ? "flex flex-row gap-4 items-start"
              : ""
          }
        >
          <div
            ref={containerRef}
            className={`relative border border-border rounded-md overflow-hidden bg-muted/30 ${
              isAdvanced && showCharts && timeline.length > 0
                ? "flex-1 min-w-0 inline-block max-w-full"
                : "inline-block max-w-full"
            }`}
          >
            {imageObjectUrl && (
              <>
                <img
                  src={imageObjectUrl}
                  alt="Obraz zmiany skórnej"
                  className="block max-h-[70vh] w-auto"
                  onLoad={handleImageLoad}
                  draggable={false}
                  style={{ userSelect: "none" }}
                />
                {imageSize && (
                  <AnimationOverlay
                    imageSize={imageSize}
                    scale={scale}
                    masks={masks}
                    spots={orderedSpots}
                    frame={frame}
                    showMovementAxes={showDiameterLines}
                    algorithmMode={algorithmMode}
                    centerPx={centerPx}
                    radiusPx={radiusPx}
                  />
                )}
              </>
            )}
            {!imageObjectUrl && (
              <div className="flex items-center justify-center w-96 h-48 text-muted-foreground text-sm">
                Ładowanie obrazu…
              </div>
            )}
            {isDemo && imageObjectUrl && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
                <span
                  className="text-4xl font-bold text-amber-500/40 select-none -rotate-[-25deg]"
                  style={{ textShadow: "0 0 8px rgba(0,0,0,0.3)" }}
                >
                  DEMO
                </span>
              </div>
            )}
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
      )}

      <div className="flex flex-wrap items-center gap-4">
        {(isAdvanced || isSimple) && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowConfig((prev) => !prev)}
              >
                <span data-lang="pl">Konfiguracja</span>
                <span data-lang="en">Configuration</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCharts((prev) => !prev)}
              >
                <span data-lang="pl">Wykresy prędkości</span>
                <span data-lang="en">Speed charts</span>
              </Button>
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
        <Controller
          name="showDiameterLines"
          control={control}
          render={({ field }) => (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                onBlur={field.onBlur}
                ref={field.ref}
                className="rounded border border-input"
              />
              <span className="text-muted-foreground">Osie ruchu (przez punkty)</span>
            </label>
          )}
        />
      </div>

      {spots.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            <span data-lang="pl">
              Klatka {currentFrameIndex + 1} / {totalFrames}
              {frame && ` · Wyemitowane: ${frame.firedIndices.length} / ${spots.length}`}
            </span>
            <span data-lang="en">
              Frame {currentFrameIndex + 1} / {totalFrames}
              {frame && ` · Fired: ${frame.firedIndices.length} / ${spots.length}`}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Kolejność:</span>
            <div
              className="w-32 h-3 rounded border border-border"
              style={{
                background: `linear-gradient(to right, ${spotColor(0, spots.length)}, ${spotColor(spots.length - 1, spots.length)})`,
              }}
            />
            <span className="text-muted-foreground text-xs">0 → {spots.length - 1}</span>
          </div>
        </div>
      )}

      {!loadingIterations && iterations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          <span data-lang="pl">
            Brak iteracji. Wygeneruj plan w zakładce Plan, aby zobaczyć animację.
          </span>
          <span data-lang="en">
            No iterations. Generate a plan in the Plan tab to see the animation.
          </span>
        </p>
      )}
    </div>
  );
}

export default AnimationTab;
