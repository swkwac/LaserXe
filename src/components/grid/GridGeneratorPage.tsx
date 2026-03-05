import * as React from "react";
import { Button } from "@/components/ui/button";
import { downloadCsv, gridSpotsToCsv } from "@/lib/gridExport";
import type { GridGeneratorResponseDto } from "@/types";
import { GridAnimationView } from "./GridAnimationView";
import GridGeneratorForm, { type SimpleInputMode } from "./GridGeneratorForm";
import { GridSchematicView } from "./GridSchematicView";

function GridGeneratorPage() {
  const [result, setResult] = React.useState<GridGeneratorResponseDto | null>(null);
  const [lastSimpleInputMode, setLastSimpleInputMode] = React.useState<SimpleInputMode | null>(null);
  const [lastAdvancedInputMode, setLastAdvancedInputMode] = React.useState<SimpleInputMode | null>(null);

  const advancedSpacingSummary = React.useMemo(() => {
    if (!result || result.spots_count <= 0 || result.params.aperture_type !== "advanced") {
      return null;
    }
    const radii = Array.from(
      new Set(
        result.spots
          .map((s) => Math.abs(s.t_mm))
          .filter((r) => Number.isFinite(r) && r > 1e-6)
      )
    ).sort((a, b) => a - b);
    if (radii.length < 2) {
      return null;
    }
    const diffs: number[] = [];
    for (let i = 0; i < radii.length - 1; i += 1) {
      diffs.push(radii[i + 1] - radii[i]);
    }
    if (diffs.length === 0) {
      return null;
    }
    const min = Math.min(...diffs);
    const max = Math.max(...diffs);
    const avg = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
    return {
      min,
      max,
      avg,
    };
  }, [result]);

  const handleResult = React.useCallback(
    (
      r: GridGeneratorResponseDto,
      meta?: { simple_input_mode?: SimpleInputMode; advanced_input_mode?: SimpleInputMode }
    ) => {
      setResult(r);
      setLastSimpleInputMode(
        r.params.aperture_type === "simple" ? (meta?.simple_input_mode ?? null) : null
      );
      setLastAdvancedInputMode(
        r.params.aperture_type === "advanced" ? (meta?.advanced_input_mode ?? null) : null
      );
    },
    []
  );

  const handleExportCsv = React.useCallback(() => {
    if (!result) return;
    const csv = gridSpotsToCsv(result.spots, result.params);
    const filename = `grid_${result.params.aperture_type}_${Date.now()}.csv`;
    downloadCsv(csv, filename);
  }, [result]);

  const spotRadiusMm = result
    ? (result.params.spot_diameter_um / 1000) / 2
    : 0.15;

  return (
    <div className="grid gap-8 grid-cols-1 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4" aria-label="Generation parameters">
        <h2 id="params-heading" className="text-sm font-medium text-foreground">
          <span data-lang="pl">Parametry</span>
          <span data-lang="en">Parameters</span>
        </h2>
        <GridGeneratorForm onResult={handleResult} />
      </aside>
      <section
        className="space-y-6 min-w-0"
        aria-labelledby="preview-heading"
      >
        <h2 id="preview-heading" className="text-sm font-medium text-foreground">
          <span data-lang="pl">Podgląd siatki</span>
          <span data-lang="en">Grid preview</span>
        </h2>
        {result ? (
          <>
            <div
              className="flex flex-wrap items-center gap-4"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted-foreground">
                  {result.spots_count === 0 ? (
                    <>
                      <span data-lang="pl">Nie wygenerowano punktów dla podanych parametrów.</span>
                      <span data-lang="en">No spots were generated for the given parameters.</span>
                    </>
                  ) : (
                    <>
                      <span data-lang="pl">
                        Wygenerowano {result.spots_count} punktów. Pokrycie: {result.achieved_coverage_pct}%.
                      </span>
                      <span data-lang="en">
                        Generated {result.spots_count} spots. Coverage: {result.achieved_coverage_pct}%.
                      </span>
                    </>
                  )}
                </p>
                {result.spots_count > 0 &&
                  result.params.aperture_type === "simple" &&
                  lastSimpleInputMode != null && (
                    <p className="text-xs text-muted-foreground">
                      {lastSimpleInputMode === "coverage" ? (
                        <>
                          <span data-lang="pl">
                            Obliczony odstęp między osiami:{" "}
                            {result.params.axis_distance_mm?.toFixed(4) ?? "—"} mm
                          </span>
                          <span data-lang="en">
                            Calculated axis spacing: {result.params.axis_distance_mm?.toFixed(4) ?? "—"} mm
                          </span>
                        </>
                      ) : (
                        <>
                          <span data-lang="pl">
                            Obliczone pokrycie:{" "}
                            {result.params.target_coverage_pct?.toFixed(2) ?? result.achieved_coverage_pct}%
                          </span>
                          <span data-lang="en">
                            Calculated coverage:{" "}
                            {result.params.target_coverage_pct?.toFixed(2) ?? result.achieved_coverage_pct}%
                          </span>
                        </>
                      )}
                    </p>
                  )}
                {result.spots_count > 0 &&
                  result.params.aperture_type === "advanced" &&
                  lastAdvancedInputMode != null && (
                    <p className="text-xs text-muted-foreground">
                      {lastAdvancedInputMode === "coverage" ? (
                        advancedSpacingSummary ? (
                          <>
                            <span data-lang="pl">
                              Średni odstęp między punktami: {advancedSpacingSummary.avg.toFixed(4)} mm (min{" "}
                              {advancedSpacingSummary.min.toFixed(4)} – max {advancedSpacingSummary.max.toFixed(4)} mm)
                            </span>
                            <span data-lang="en">
                              Average spacing between spots: {advancedSpacingSummary.avg.toFixed(4)} mm (min{" "}
                              {advancedSpacingSummary.min.toFixed(4)} – max {advancedSpacingSummary.max.toFixed(4)} mm)
                            </span>
                          </>
                        ) : (
                          <>
                            <span data-lang="pl">Nie można obliczyć odstępów między punktami.</span>
                            <span data-lang="en">Cannot compute spacing between spots.</span>
                          </>
                        )
                      ) : (
                        <>
                          <span data-lang="pl">
                            Obliczone pokrycie:{" "}
                            {result.params.target_coverage_pct?.toFixed(2) ?? result.achieved_coverage_pct}%
                          </span>
                          <span data-lang="en">
                            Calculated coverage:{" "}
                            {result.params.target_coverage_pct?.toFixed(2) ?? result.achieved_coverage_pct}%
                          </span>
                        </>
                      )}
                    </p>
                  )}
              </div>
              {result.spots_count > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportCsv}
                  aria-label="Download grid as CSV file"
                >
                  <span data-lang="pl">Eksportuj CSV</span>
                  <span data-lang="en">Export CSV</span>
                </Button>
              )}
            </div>
            {result.spots_count > 0 && (
              <>
                <div
                  className="rounded-lg border border-border overflow-hidden bg-white h-[420px]"
                  role="img"
                  aria-label="Schemat siatki punktów emisji"
                >
                  <GridSchematicView
                    params={result.params}
                    spots={result.spots}
                    spotRadiusMm={spotRadiusMm}
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-foreground">
                    <span data-lang="pl">Animacja sekwencji</span>
                    <span data-lang="en">Sequence animation</span>
                  </h3>
                  <GridAnimationView params={result.params} spots={result.spots} />
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span data-lang="pl">Kliknij „Generuj”, aby wyświetlić schemat siatki.</span>
            <span data-lang="en">Click “Generate” to display the grid schematic.</span>
          </p>
        )}
      </section>
    </div>
  );
}

export default GridGeneratorPage;
