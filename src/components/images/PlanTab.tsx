import * as React from "react";
import { Button } from "@/components/ui/button";
import { getAdvancedAlgorithmLabel } from "@/lib/constants";
import {
  createIteration,
  exportIterationCsv,
  exportIterationImage,
  exportIterationJson,
  updateIterationStatus,
} from "@/lib/services/planApi";
import type { ImageDto, IterationCreateCommand, IterationDto } from "@/types";
import PlanParamsForm from "./PlanParamsForm";
import { useIteration } from "./useIteration";
import { useIterationPreview } from "./useIterationPreview";

export interface PlanTabProps {
  imageId: number;
  image: ImageDto;
  /** When user navigates from History, parent can pass the iteration id to show. */
  selectedIterationId?: number | null;
  selectedIteration?: IterationDto | null;
  onIterationSelected?: (id: number) => void;
  /** Called after iteration status change (accept/reject) so parent can refresh. */
  onIterationUpdated?: () => void;
}

const defaultParams: IterationCreateCommand = {
  target_coverage_pct: 10,
  algorithm_mode: "simple",
};

/** Spot position in pixel from top-left mm (API/DB convention). Aligns with mask vertices. */
function spotPxFromTopLeftMm(xMm: number, yMm: number, scale: number): { x: number; y: number } {
  return { x: xMm * scale, y: yMm * scale };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PlanTab({
  imageId,
  image,
  selectedIterationId: selectedIterationIdFromParent,
  selectedIteration: selectedFromParent,
  onIterationSelected,
  onIterationUpdated,
}: PlanTabProps) {
  const [params, setParams] = React.useState<IterationCreateCommand>(defaultParams);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = React.useState<IterationDto | null>(null);
  const [patchedIteration, setPatchedIteration] = React.useState<IterationDto | null>(null);
  const [previewImageSize, setPreviewImageSize] = React.useState<{ w: number; h: number } | null>(null);

  const { iteration: iterationFromHook } = useIteration(selectedIterationIdFromParent);
  const {
    imageUrl: previewImageUrl,
    masks: previewMasks,
    spots: previewSpots,
  } = useIterationPreview(imageId, selectedIterationIdFromParent);

  React.useEffect(() => {
    setPatchedIteration(null);
  }, [selectedIterationIdFromParent]);

  const fetchedIteration =
    patchedIteration?.id === selectedIterationIdFromParent ? patchedIteration : iterationFromHook;

  const selectedIteration =
    selectedFromParent ??
    (fetchedIteration && selectedIterationIdFromParent === fetchedIteration.id ? fetchedIteration : null) ??
    lastGenerated;

  const handleGenerate = React.useCallback(async () => {
    setError(null);
    setGenerating(true);
    try {
      const iteration = await createIteration(imageId, params);
      setLastGenerated(iteration);
      onIterationSelected?.(iteration.id);
    } catch (err) {
      if ((err as Error).message !== "Unauthorized") {
        setError(err instanceof Error ? err.message : "Błąd połączenia.");
      }
    } finally {
      setGenerating(false);
    }
  }, [imageId, params, onIterationSelected]);

  const handleStatusChange = React.useCallback(
    async (iterationId: number, status: "accepted" | "rejected") => {
      setError(null);
      try {
        const updated = await updateIterationStatus(iterationId, status);
        if (selectedIteration?.id === iterationId) {
          setLastGenerated((prev) => (prev?.id === iterationId ? updated : prev));
          setPatchedIteration(updated);
        }
        onIterationUpdated?.();
      } catch (err) {
        if ((err as Error).message !== "Unauthorized") {
          setError(err instanceof Error ? err.message : "Błąd połączenia.");
        }
      }
    },
    [selectedIteration?.id, onIterationUpdated]
  );

  const handleExportJson = React.useCallback(async (iterationId: number) => {
    try {
      const blob = await exportIterationJson(iterationId);
      if (blob) downloadBlob(blob, `iteration-${iterationId}-export.json`);
    } catch {
      // ignore
    }
  }, []);

  const handleExportCsv = React.useCallback(async (iterationId: number) => {
    try {
      const blob = await exportIterationCsv(iterationId);
      if (blob) downloadBlob(blob, `iteration-${iterationId}-spots.csv`);
    } catch {
      // ignore
    }
  }, []);

  const handleExportImage = React.useCallback(async (iterationId: number, format: "png" | "jpg") => {
    try {
      const blob = await exportIterationImage(iterationId, format);
      if (blob) downloadBlob(blob, `iteration-${iterationId}-export.${format}`);
    } catch {
      // ignore
    }
  }, []);

  const canAccept =
    selectedIteration &&
    selectedIteration.status === "draft" &&
    selectedIteration.plan_valid === 1 &&
    selectedIteration.is_demo === 0;
  const canReject = selectedIteration && selectedIteration.status === "draft";

  return (
    <div className="space-y-6" aria-label="Zakładka Plan">
      <div className="rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-medium mb-3">Parametry planu</h2>
        <PlanParamsForm value={params} onChange={setParams} disabled={generating} />
        <Button type="button" className="mt-4" onClick={handleGenerate} disabled={generating} aria-busy={generating}>
          {generating ? "Generowanie…" : "Generuj plan"}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {selectedIteration && (
        <div className="rounded-md border border-border bg-card p-4 space-y-4">
          <h2 className="text-sm font-medium mb-2">Metryki (ostatnia iteracja)</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Algorytm</dt>
            <dd>
              {selectedIteration.params_snapshot?.algorithm_mode === "simple"
                ? "Prosty"
                : selectedIteration.params_snapshot?.algorithm_mode === "advanced"
                  ? getAdvancedAlgorithmLabel()
                  : "—"}
            </dd>
            {selectedIteration.params_snapshot?.algorithm_mode === "simple" && (
              <>
                <dt className="text-muted-foreground">Odstęp siatki</dt>
                <dd>
                  {selectedIteration.params_snapshot?.grid_spacing_mm != null
                    ? `${selectedIteration.params_snapshot.grid_spacing_mm} mm`
                    : "0.8 mm"}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Pokrycie docelowe</dt>
            <dd>{selectedIteration.target_coverage_pct ?? "—"} %</dd>
            <dt className="text-muted-foreground">Pokrycie osiągnięte</dt>
            <dd>{selectedIteration.achieved_coverage_pct ?? "—"} %</dd>
            <dt className="text-muted-foreground">Liczba punktów</dt>
            <dd>{selectedIteration.spots_count ?? "—"}</dd>
            <dt className="text-muted-foreground">Plan poprawny</dt>
            <dd>{selectedIteration.plan_valid ? "Tak" : "Nie"}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => handleStatusChange(selectedIteration.id, "accepted")}
              disabled={!canAccept}
              aria-disabled={!canAccept}
            >
              Akceptuj
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleStatusChange(selectedIteration.id, "rejected")}
              disabled={!canReject}
              aria-disabled={!canReject}
            >
              Odrzuć
            </Button>
            <Button type="button" variant="outline" onClick={() => handleExportJson(selectedIteration.id)}>
              Eksport JSON
            </Button>
            <Button type="button" variant="outline" onClick={() => handleExportCsv(selectedIteration.id)}>
              Pobierz CSV (spoty)
            </Button>
            <Button type="button" variant="outline" onClick={() => handleExportImage(selectedIteration.id, "png")}>
              Eksport PNG
            </Button>
            <Button type="button" variant="outline" onClick={() => handleExportImage(selectedIteration.id, "jpg")}>
              Eksport JPG
            </Button>
          </div>
          {previewImageUrl && image.width_mm > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Podgląd planu (overlay punktów)</h3>
              <div className="relative inline-block max-w-full border border-border rounded-md overflow-hidden bg-muted/30">
                <img
                  src={previewImageUrl}
                  alt="Obraz z overlayem planu"
                  className="block max-h-[50vh] w-auto"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setPreviewImageSize({ w: img.naturalWidth, h: img.naturalHeight });
                  }}
                  draggable={false}
                  style={{ userSelect: "none" }}
                />
                {previewImageSize && (
                  <svg
                    className="absolute top-0 left-0 w-full h-full pointer-events-none"
                    style={{ width: "100%", height: "100%" }}
                    viewBox={`0 0 ${previewImageSize.w} ${previewImageSize.h}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {(() => {
                      const scale = previewImageSize.w / image.width_mm;
                      const centerPx = {
                        x: previewImageSize.w / 2,
                        y: previewImageSize.h / 2,
                      };
                      const apertureRadiusMm = 12.5;
                      const radiusPx = apertureRadiusMm * scale;
                      const MASK_COLORS = ["rgba(255,255,255,0.35)", "rgba(0,200,100,0.35)", "rgba(80,120,255,0.35)"];
                      return (
                        <>
                          {previewMasks.map((mask, idx) => (
                            <polygon
                              key={mask.id}
                              points={mask.vertices.map((v) => `${v.x * scale},${v.y * scale}`).join(" ")}
                              fill={MASK_COLORS[idx % MASK_COLORS.length]}
                              stroke="rgba(255,255,255,0.6)"
                              strokeWidth={1}
                            />
                          ))}
                          {/* Diameters at 0°, 5°, ..., 175° (same as backend grid) */}
                          {Array.from({ length: 36 }, (_, i) => i * 5).map((deg) => {
                            const rad = (deg * Math.PI) / 180;
                            const cos = Math.cos(rad);
                            const sin = Math.sin(rad);
                            return (
                              <line
                                key={deg}
                                x1={centerPx.x - radiusPx * cos}
                                y1={centerPx.y + radiusPx * sin}
                                x2={centerPx.x + radiusPx * cos}
                                y2={centerPx.y - radiusPx * sin}
                                stroke="rgba(100,150,255,0.35)"
                                strokeWidth={1}
                              />
                            );
                          })}
                          {/* Spots: position from top-left mm (x_mm, y_mm) so they align with mask */}
                          {previewSpots.map((spot) => {
                            const px = spotPxFromTopLeftMm(spot.x_mm, spot.y_mm, scale);
                            return (
                              <circle
                                key={spot.id}
                                cx={px.x}
                                cy={px.y}
                                r={Math.max(2, Math.min(0.15 * scale, 8))}
                                fill="rgba(220,80,80,0.8)"
                                stroke="rgba(0,0,0,0.3)"
                                strokeWidth={1}
                              />
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PlanTab;
