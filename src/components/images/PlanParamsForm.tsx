import * as React from "react";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdvancedAlgorithmLabel } from "@/lib/constants";
import type { IterationCreateCommand } from "@/types";

const MIN_COVERAGE = 3;
const MAX_COVERAGE = 20;
const MIN_GRID_SPACING_MM = 0.3;
const MAX_GRID_SPACING_MM = 2;
const DEFAULT_GRID_SPACING_MM = 0.8;

export interface PlanParamsFormProps {
  value: IterationCreateCommand;
  onChange: (value: IterationCreateCommand) => void;
  disabled?: boolean;
}

const ALGORITHM_SIMPLE: "simple" | "advanced" = "simple";

function PlanParamsForm({ value, onChange, disabled }: PlanParamsFormProps) {
  const inputId = useId();
  const algorithmFieldsetId = useId();
  const gridSpacingId = useId();
  const target = value.target_coverage_pct;
  const algorithmMode = value.algorithm_mode ?? ALGORITHM_SIMPLE;
  const gridSpacingMm = value.grid_spacing_mm ?? DEFAULT_GRID_SPACING_MM;

  const handleGridSpacingChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const num = parseFloat(e.target.value);
      onChange({
        ...value,
        grid_spacing_mm: Number.isFinite(num)
          ? Math.max(MIN_GRID_SPACING_MM, Math.min(MAX_GRID_SPACING_MM, num))
          : DEFAULT_GRID_SPACING_MM,
      });
    },
    [value, onChange]
  );

  const handleTargetChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const num = parseFloat(e.target.value);
      onChange({
        ...value,
        target_coverage_pct: Number.isFinite(num) ? num : MIN_COVERAGE,
      });
    },
    [value, onChange]
  );

  const handleAlgorithmChange = React.useCallback(
    (mode: "simple" | "advanced") => {
      onChange({ ...value, algorithm_mode: mode });
    },
    [value, onChange]
  );

  return (
    <div className="space-y-4">
      <fieldset
        id={algorithmFieldsetId}
        className="space-y-2"
        aria-label="Algorytm generowania siatki"
        disabled={disabled}
      >
        <span className="text-sm font-medium">Algorytm</span>
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- label wraps input + text; htmlFor/id link present */}
          <label htmlFor={`${algorithmFieldsetId}-simple`} className="flex items-start gap-2 cursor-pointer">
            <input
              id={`${algorithmFieldsetId}-simple`}
              type="radio"
              name="algorithm_mode"
              value="simple"
              checked={algorithmMode === "simple"}
              onChange={() => handleAlgorithmChange("simple")}
              className="mt-1"
              aria-describedby={`${algorithmFieldsetId}-simple-hint`}
            />
            <span>
              <span className="font-medium">Prosty – siatka XY 800 µm</span>
              <p id={`${algorithmFieldsetId}-simple-hint`} className="text-xs text-muted-foreground">
                Punkty w jednakowych odstępach 800 µm, tylko wewnątrz masek.
              </p>
            </span>
          </label>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- label wraps input + text; htmlFor/id link present */}
          <label htmlFor={`${algorithmFieldsetId}-advanced`} className="flex items-start gap-2 cursor-pointer">
            <input
              id={`${algorithmFieldsetId}-advanced`}
              type="radio"
              name="algorithm_mode"
              value="advanced"
              checked={algorithmMode === "advanced"}
              onChange={() => handleAlgorithmChange("advanced")}
              className="mt-1"
              aria-describedby={`${algorithmFieldsetId}-advanced-hint`}
            />
            <span>
              <span className="font-medium">{getAdvancedAlgorithmLabel()}</span>
              <p id={`${algorithmFieldsetId}-advanced-hint`} className="text-xs text-muted-foreground">
                Algorytm w trakcie rozwoju; pokrycie docelowe i średnice co 5°.
              </p>
            </span>
          </label>
        </div>
      </fieldset>

      {algorithmMode === "simple" && (
        <div className="space-y-2">
          <Label htmlFor={gridSpacingId}>Odstęp siatki (mm)</Label>
          <Input
            id={gridSpacingId}
            type="number"
            min={MIN_GRID_SPACING_MM}
            max={MAX_GRID_SPACING_MM}
            step={0.1}
            value={gridSpacingMm}
            onChange={handleGridSpacingChange}
            disabled={disabled}
            aria-describedby={`${gridSpacingId}-hint`}
          />
          <p id={`${gridSpacingId}-hint`} className="text-xs text-muted-foreground">
            Zakres: {MIN_GRID_SPACING_MM}–{MAX_GRID_SPACING_MM} mm (domyślnie 0,8)
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={inputId}>Docelowe pokrycie (%)</Label>
        <Input
          id={inputId}
          type="number"
          min={MIN_COVERAGE}
          max={MAX_COVERAGE}
          step={0.5}
          value={target}
          onChange={handleTargetChange}
          disabled={disabled}
          aria-describedby={`${inputId}-hint`}
        />
        <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          Zakres: {MIN_COVERAGE}–{MAX_COVERAGE} % (dotyczy algorytmu zaawansowanego)
        </p>
      </div>
    </div>
  );
}

export default PlanParamsForm;
