import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { buildAnimationTimelineFromSpots, spotColor } from "@/lib/animationUtils";
import type { ImageDto } from "@/types";
import { AnimationOverlay } from "./AnimationOverlay";
import { useAnimationPlayback } from "./useAnimationPlayback";
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

type AnimationTabFormValues = {
  iterationId: number | "";
  showDiameterLines: boolean;
  showAxisLine: boolean;
};

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
      showAxisLine: false,
    },
  });

  const iterationId = watch("iterationId");
  const showDiameterLines = watch("showDiameterLines");
  const showAxisLine = watch("showAxisLine");

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
  const centerPx =
    imageSize && imageSize.w > 0 && imageSize.h > 0
      ? { x: imageSize.w / 2, y: imageSize.h / 2 }
      : null;
  const radiusPx = centerPx ? APERTURE_RADIUS_MM * scale : 0;

  const totalFrames = Math.max(
    1,
    Math.round((ANIMATION_DURATION_MS / 1000) * ANIMATION_FPS)
  );
  const timeline = React.useMemo(() => {
    if (spots.length === 0) return [];
    return buildAnimationTimelineFromSpots(spots, scale);
  }, [spots, scale]);
  const timelineIdx =
    timeline.length <= 1
      ? 0
      : Math.min(
          Math.round((currentFrameIndex / (totalFrames - 1)) * (timeline.length - 1)),
          timeline.length - 1
        );
  const frame = timeline.length > 0 ? timeline[timelineIdx]! : null;

  useAnimationPlayback(
    playing,
    totalFrames,
    ANIMATION_DURATION_MS,
    setCurrentFrameIndex,
    setPlaying
  );

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

  return (
    <div className="space-y-4" aria-label="Zakładka Animacja">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-sm font-medium">Wizualizacja sekwencji emisji</h2>
        {loadingIterations ? (
          <span className="text-sm text-muted-foreground">Ładowanie iteracji…</span>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Iteracja:</span>
            <select
              value={iterationId === "" ? "" : String(iterationId)}
              onChange={handleIterationChange}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              disabled={iterations.length === 0}
            >
              {iterations.length === 0 && (
                <option value="">Brak iteracji</option>
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
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {errorIterations && <p>{errorIterations}</p>}
          {errorSpots && <p>{errorSpots}</p>}
          {errorImage && <p>{errorImage}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handlePlay}
            disabled={spots.length === 0 || playing}
          >
            Odtwórz
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePause}
            disabled={!playing}
          >
            Wstrzymaj
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={spots.length === 0}
          >
            Reset
          </Button>
        </div>
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
              <span className="text-muted-foreground">Linie średnic co 5°</span>
            </label>
          )}
        />
        <Controller
          name="showAxisLine"
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
              <span className="text-muted-foreground">Oś głowicy (linia)</span>
            </label>
          )}
        />
      </div>

      {loadingSpots && selectedIterationId && (
        <p className="text-sm text-muted-foreground">Ładowanie punktów…</p>
      )}

      <div
        ref={containerRef}
        className="relative inline-block max-w-full border border-border rounded-md overflow-hidden bg-muted/30"
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
                spots={spots}
                frame={frame}
                showDiameterLines={showDiameterLines}
                showAxisLine={showAxisLine}
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
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden
          >
            <span
              className="text-4xl font-bold text-amber-500/40 select-none -rotate-[-25deg]"
              style={{ textShadow: "0 0 8px rgba(0,0,0,0.3)" }}
            >
              DEMO
            </span>
          </div>
        )}
      </div>

      {spots.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Klatka {currentFrameIndex + 1} / {totalFrames}
            {frame && ` · Wyemitowane: ${frame.firedIndices.length} / ${spots.length}`}
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
          Brak iteracji. Wygeneruj plan w zakładce Plan, aby zobaczyć animację.
        </p>
      )}
    </div>
  );
}

export default AnimationTab;
