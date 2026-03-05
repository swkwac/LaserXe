import * as React from "react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateGrid } from "@/lib/services/gridApi";
import {
  loadGridGeneratorParams,
  saveGridGeneratorParams,
  type StoredGridParams,
} from "@/lib/gridGeneratorStorage";
import type { GridGeneratorRequestDto, GridGeneratorResponseDto } from "@/types";

const MIN_COVERAGE = 0.1;
const MAX_COVERAGE = 100;
const MIN_AXIS_DISTANCE_MM = 0.5;
const MAX_AXIS_DISTANCE_MM = 3;
const DEFAULT_AXIS_DISTANCE_MM = 0.8;
const DEFAULT_COVERAGE = 10;
const MIN_ANGLE_STEP = 3;
const MAX_ANGLE_STEP = 20;
const DEFAULT_ANGLE_STEP = 5;

export type SimpleInputMode = "coverage" | "spacing";

export interface GridGeneratorFormProps {
  onResult: (
    result: GridGeneratorResponseDto,
    meta?: { simple_input_mode?: SimpleInputMode; advanced_input_mode?: SimpleInputMode }
  ) => void;
}

const defaultParams: GridGeneratorRequestDto & {
  simple_input_mode?: SimpleInputMode;
  advanced_input_mode?: SimpleInputMode;
} = {
  aperture_type: "simple",
  spot_diameter_um: 300,
  target_coverage_pct: DEFAULT_COVERAGE,
  axis_distance_mm: DEFAULT_AXIS_DISTANCE_MM,
  simple_input_mode: "coverage",
  angle_step_deg: DEFAULT_ANGLE_STEP,
};

function GridGeneratorForm({ onResult }: GridGeneratorFormProps) {
  const [params, setParams] = React.useState<
    GridGeneratorRequestDto & {
      simple_input_mode?: SimpleInputMode;
      advanced_input_mode?: SimpleInputMode;
    }
  >(() => {
    const saved = loadGridGeneratorParams() as StoredGridParams | null;
    if (saved) {
      const isSimple = saved.aperture_type === "simple";
      return {
        ...defaultParams,
        ...saved,
        simple_input_mode: isSimple ? (saved.simple_input_mode ?? "coverage") : undefined,
        advanced_input_mode: !isSimple ? (saved.advanced_input_mode ?? "coverage") : undefined,
        target_coverage_pct: saved.target_coverage_pct ?? defaultParams.target_coverage_pct,
        axis_distance_mm: saved.axis_distance_mm ?? defaultParams.axis_distance_mm,
        angle_step_deg: saved.angle_step_deg ?? defaultParams.angle_step_deg,
      };
    }
    return defaultParams;
  });
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const apertureFieldsetId = useId();
  const simpleModeFieldsetId = useId();
  const advancedModeFieldsetId = useId();
  const spotDiameterId = useId();
  const targetId = useId();
  const axisDistanceId = useId();
  const angleStepId = useId();

  const handleSimpleInputModeChange = React.useCallback((mode: SimpleInputMode) => {
    setError(null);
    setParams((prev) => ({
      ...prev,
      simple_input_mode: mode,
    }));
  }, []);

  const handleApertureChange = React.useCallback((type: "simple" | "advanced") => {
    setError(null);
    setParams((prev) => ({
      ...prev,
      aperture_type: type,
      simple_input_mode: type === "simple" ? (prev.simple_input_mode ?? "coverage") : undefined,
       advanced_input_mode: type === "advanced" ? (prev.advanced_input_mode ?? "coverage") : undefined,
      target_coverage_pct: type === "advanced" ? (prev.target_coverage_pct ?? DEFAULT_COVERAGE) : prev.target_coverage_pct,
      axis_distance_mm: type === "simple"
        ? (prev.axis_distance_mm ?? DEFAULT_AXIS_DISTANCE_MM)
        : prev.axis_distance_mm,
      angle_step_deg: type === "advanced" ? DEFAULT_ANGLE_STEP : undefined,
    }));
  }, []);

  const handleSpotDiameterChange = React.useCallback((um: 300 | 150) => {
    setError(null);
    setParams((prev) => ({ ...prev, spot_diameter_um: um }));
  }, []);

  const handleAdvancedInputModeChange = React.useCallback((mode: SimpleInputMode) => {
    setError(null);
    setParams((prev) => ({
      ...prev,
      advanced_input_mode: mode,
    }));
  }, []);

  const handleTargetChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const num = parseFloat(e.target.value);
    setParams((prev) => ({
      ...prev,
      target_coverage_pct: Number.isFinite(num)
        ? Math.max(MIN_COVERAGE, Math.min(MAX_COVERAGE, num))
        : MIN_COVERAGE,
    }));
  }, []);

  const handleAxisDistanceChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const num = parseFloat(e.target.value);
    setParams((prev) => ({
      ...prev,
      axis_distance_mm: Number.isFinite(num)
        ? Math.max(MIN_AXIS_DISTANCE_MM, Math.min(MAX_AXIS_DISTANCE_MM, num))
        : DEFAULT_AXIS_DISTANCE_MM,
    }));
  }, []);

  const handleAngleStepChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const num = parseInt(e.target.value, 10);
    setParams((prev) => ({
      ...prev,
      angle_step_deg: Number.isFinite(num)
        ? Math.max(MIN_ANGLE_STEP, Math.min(MAX_ANGLE_STEP, num))
        : DEFAULT_ANGLE_STEP,
    }));
  }, []);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setGenerating(true);
      try {
        const payload: GridGeneratorRequestDto = {
          aperture_type: params.aperture_type,
          spot_diameter_um: params.spot_diameter_um,
        };
        if (params.aperture_type === "simple") {
          const mode = params.simple_input_mode ?? "coverage";
          if (mode === "coverage") {
            payload.target_coverage_pct = params.target_coverage_pct ?? DEFAULT_COVERAGE;
          } else {
            payload.axis_distance_mm = params.axis_distance_mm ?? DEFAULT_AXIS_DISTANCE_MM;
          }
        } else {
          const mode = params.advanced_input_mode ?? "coverage";
          if (mode === "coverage") {
            payload.target_coverage_pct = params.target_coverage_pct ?? DEFAULT_COVERAGE;
          } else {
            payload.axis_distance_mm = params.axis_distance_mm ?? DEFAULT_AXIS_DISTANCE_MM;
          }
          payload.angle_step_deg = params.angle_step_deg ?? DEFAULT_ANGLE_STEP;
        }
        const result = await generateGrid(payload);
        saveGridGeneratorParams({
          ...payload,
          simple_input_mode: params.simple_input_mode,
          advanced_input_mode: params.advanced_input_mode,
        });
        const meta =
          params.aperture_type === "simple"
            ? { simple_input_mode: params.simple_input_mode ?? "coverage" }
            : { advanced_input_mode: params.advanced_input_mode ?? "coverage" };
        onResult(result, meta);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Connection error.";
        setError(msg === "Unauthorized" ? "Session expired. Please log in again." : msg);
      } finally {
        setGenerating(false);
      }
    },
    [params, onResult]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      aria-busy={generating}
      aria-describedby={error ? "grid-form-error" : undefined}
    >
      <fieldset
        id={apertureFieldsetId}
        className="space-y-2"
        aria-label="Aperture type"
        disabled={generating}
      >
        <span className="text-sm font-medium">
          <span data-lang="pl">Typ apertury</span>
          <span data-lang="en">Aperture type</span>
        </span>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${apertureFieldsetId}-simple`}
            className="flex items-start gap-2 cursor-pointer"
          >
            <input
              id={`${apertureFieldsetId}-simple`}
              type="radio"
              name="aperture_type"
              value="simple"
              checked={params.aperture_type === "simple"}
              onChange={() => handleApertureChange("simple")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">
                <span data-lang="pl">Prosty – 12×12 mm</span>
                <span data-lang="en">Simple – 12×12 mm</span>
              </span>
              <p className="text-xs text-muted-foreground">
                <span data-lang="pl">Prostokąt, siatka XY, odstęp między osiami 0.5–3 mm.</span>
                <span data-lang="en">Rectangle, XY grid, axis spacing 0.5–3 mm.</span>
              </p>
            </span>
          </label>
          <label
            htmlFor={`${apertureFieldsetId}-advanced`}
            className="flex items-start gap-2 cursor-pointer"
          >
            <input
              id={`${apertureFieldsetId}-advanced`}
              type="radio"
              name="aperture_type"
              value="advanced"
              checked={params.aperture_type === "advanced"}
              onChange={() => handleApertureChange("advanced")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">
                <span data-lang="pl">Zaawansowany – 25 mm średnicy</span>
                <span data-lang="en">Advanced – 25 mm diameter</span>
              </span>
              <p className="text-xs text-muted-foreground">
                <span data-lang="pl">Okrąg, linie średnicowe, krok kąta 3–20°.</span>
                <span data-lang="en">Circle, diameter lines, angle step 3–20°.</span>
              </p>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset
        className="space-y-2"
        disabled={generating}
        aria-label="Spot diameter"
      >
        <span className="text-sm font-medium">
          <span data-lang="pl">Średnica spotu</span>
          <span data-lang="en">Spot diameter</span>
        </span>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
            <input
              type="radio"
              name="spot_diameter"
              value="300"
              checked={params.spot_diameter_um === 300}
              onChange={() => handleSpotDiameterChange(300)}
              aria-label="300 µm"
            />
            <span>300 µm</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
            <input
              type="radio"
              name="spot_diameter"
              value="150"
              checked={params.spot_diameter_um === 150}
              onChange={() => handleSpotDiameterChange(150)}
              aria-label="150 µm"
            />
            <span>150 µm</span>
          </label>
        </div>
      </fieldset>

      {params.aperture_type === "simple" && (
        <fieldset
          id={simpleModeFieldsetId}
          className="space-y-2"
          aria-label="Input parameter (simple aperture)"
          disabled={generating}
        >
          <span className="text-sm font-medium">
            <span data-lang="pl">Parametr wejściowy</span>
            <span data-lang="en">Input parameter</span>
          </span>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`${simpleModeFieldsetId}-coverage`}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                id={`${simpleModeFieldsetId}-coverage`}
                type="radio"
                name="simple_input_mode"
                value="coverage"
                checked={(params.simple_input_mode ?? "coverage") === "coverage"}
                onChange={() => handleSimpleInputModeChange("coverage")}
              />
              <span>
                <span data-lang="pl">Pokrycie docelowe (%)</span>
                <span data-lang="en">Target coverage (%)</span>
              </span>
            </label>
            <label
              htmlFor={`${simpleModeFieldsetId}-spacing`}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                id={`${simpleModeFieldsetId}-spacing`}
                type="radio"
                name="simple_input_mode"
                value="spacing"
                checked={(params.simple_input_mode ?? "coverage") === "spacing"}
                onChange={() => handleSimpleInputModeChange("spacing")}
              />
              <span>
                <span data-lang="pl">Odstęp między osiami XY (mm)</span>
                <span data-lang="en">XY axis spacing (mm)</span>
              </span>
            </label>
          </div>
        </fieldset>
      )}

      {params.aperture_type === "simple" &&
        (params.simple_input_mode ?? "coverage") === "coverage" && (
          <div className="space-y-2">
            <Label htmlFor={targetId}>
              <span data-lang="pl">Pokrycie docelowe (%)</span>
              <span data-lang="en">Target coverage (%)</span>
            </Label>
            <Input
              id={targetId}
              type="number"
              min={MIN_COVERAGE}
              max={MAX_COVERAGE}
              step={0.1}
              value={params.target_coverage_pct ?? DEFAULT_COVERAGE}
              onChange={handleTargetChange}
            />
          </div>
        )}

      {params.aperture_type === "simple" &&
        (params.simple_input_mode ?? "coverage") === "spacing" && (
          <div className="space-y-2">
            <Label htmlFor={axisDistanceId}>
              <span data-lang="pl">Odstęp między osiami (mm)</span>
              <span data-lang="en">Axis spacing (mm)</span>
            </Label>
            <Input
              id={axisDistanceId}
              type="number"
              min={MIN_AXIS_DISTANCE_MM}
              max={MAX_AXIS_DISTANCE_MM}
              step={0.1}
              value={params.axis_distance_mm ?? DEFAULT_AXIS_DISTANCE_MM}
              onChange={handleAxisDistanceChange}
            />
          </div>
        )}

      {params.aperture_type === "advanced" && (
        <>
          <fieldset
            id={advancedModeFieldsetId}
            className="space-y-2"
            aria-label="Input parameter (advanced aperture)"
            disabled={generating}
          >
            <span className="text-sm font-medium">
              <span data-lang="pl">Parametr wejściowy</span>
              <span data-lang="en">Input parameter</span>
            </span>
            <div className="flex flex-col gap-2">
              <label
                htmlFor={`${advancedModeFieldsetId}-coverage`}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  id={`${advancedModeFieldsetId}-coverage`}
                  type="radio"
                  name="advanced_input_mode"
                  value="coverage"
                  checked={(params.advanced_input_mode ?? "coverage") === "coverage"}
                  onChange={() => handleAdvancedInputModeChange("coverage")}
                />
                <span>
                  <span data-lang="pl">Pokrycie docelowe (%)</span>
                  <span data-lang="en">Target coverage (%)</span>
                </span>
              </label>
              <label
                htmlFor={`${advancedModeFieldsetId}-spacing`}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  id={`${advancedModeFieldsetId}-spacing`}
                  type="radio"
                  name="advanced_input_mode"
                  value="spacing"
                  checked={(params.advanced_input_mode ?? "coverage") === "spacing"}
                  onChange={() => handleAdvancedInputModeChange("spacing")}
                />
                <span>
                  <span data-lang="pl">Odstęp między punktami na średnicy (mm)</span>
                  <span data-lang="en">Spacing between points on diameter (mm)</span>
                </span>
              </label>
            </div>
          </fieldset>

          {(params.advanced_input_mode ?? "coverage") === "coverage" && (
            <div className="space-y-2">
              <Label htmlFor={targetId}>
                <span data-lang="pl">Pokrycie docelowe (%)</span>
                <span data-lang="en">Target coverage (%)</span>
              </Label>
              <Input
                id={targetId}
                type="number"
                min={MIN_COVERAGE}
                max={MAX_COVERAGE}
                step={0.1}
                value={params.target_coverage_pct ?? DEFAULT_COVERAGE}
                onChange={handleTargetChange}
              />
            </div>
          )}

          {(params.advanced_input_mode ?? "coverage") === "spacing" && (
            <div className="space-y-2">
              <Label htmlFor={axisDistanceId}>
                <span data-lang="pl">Odstęp między punktami (mm)</span>
                <span data-lang="en">Point spacing (mm)</span>
              </Label>
              <Input
                id={axisDistanceId}
                type="number"
                min={MIN_AXIS_DISTANCE_MM}
                max={MAX_AXIS_DISTANCE_MM}
                step={0.1}
                value={params.axis_distance_mm ?? DEFAULT_AXIS_DISTANCE_MM}
                onChange={handleAxisDistanceChange}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={angleStepId}>
              <span data-lang="pl">Krok kąta (°)</span>
              <span data-lang="en">Angle step (°)</span>
            </Label>
            <Input
              id={angleStepId}
              type="number"
              min={MIN_ANGLE_STEP}
              max={MAX_ANGLE_STEP}
              step={1}
              value={params.angle_step_deg ?? DEFAULT_ANGLE_STEP}
              onChange={handleAngleStepChange}
            />
          </div>
        </>
      )}

      {error && (
        <p id="grid-form-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={generating} aria-busy={generating}>
        {generating ? (
          <>
            <span data-lang="pl">Generowanie…</span>
            <span data-lang="en">Generating…</span>
          </>
        ) : (
          <>
            <span data-lang="pl">Generuj</span>
            <span data-lang="en">Generate</span>
          </>
        )}
      </Button>
    </form>
  );
}

export default GridGeneratorForm;
