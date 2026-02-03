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

  const handleResult = React.useCallback(
    (r: GridGeneratorResponseDto, meta?: { simple_input_mode?: SimpleInputMode }) => {
      setResult(r);
      setLastSimpleInputMode(
        r.params.aperture_type === "simple" ? (meta?.simple_input_mode ?? null) : null
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
      <aside className="space-y-4" aria-label="Parametry generowania">
        <h2 id="params-heading" className="text-sm font-medium text-foreground">
          Parametry
        </h2>
        <GridGeneratorForm onResult={handleResult} />
      </aside>
      <section
        className="space-y-6 min-w-0"
        aria-labelledby="preview-heading"
      >
        <h2 id="preview-heading" className="text-sm font-medium text-foreground">
          Podgląd siatki
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
                  {result.spots_count === 0
                    ? "Nie wygenerowano punktów dla podanych parametrów."
                    : `Wygenerowano ${result.spots_count} punktów. Pokrycie: ${result.achieved_coverage_pct}%.`}
                </p>
                {result.spots_count > 0 &&
                  result.params.aperture_type === "simple" &&
                  lastSimpleInputMode != null && (
                    <p className="text-xs text-muted-foreground">
                      {lastSimpleInputMode === "coverage"
                        ? `Obliczony odstęp między osiami: ${result.params.axis_distance_mm?.toFixed(4) ?? "—"} mm`
                        : `Obliczone pokrycie: ${result.params.target_coverage_pct?.toFixed(2) ?? result.achieved_coverage_pct}%`}
                    </p>
                  )}
              </div>
              {result.spots_count > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportCsv}
                  aria-label="Pobierz siatkę jako plik CSV"
                >
                  Eksportuj CSV
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
                  <h3 className="mb-2 text-sm font-medium text-foreground">Animacja sekwencji</h3>
                  <GridAnimationView params={result.params} spots={result.spots} />
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Kliknij „Generuj”, aby wyświetlić schemat siatki.
          </p>
        )}
      </section>
    </div>
  );
}

export default GridGeneratorPage;
