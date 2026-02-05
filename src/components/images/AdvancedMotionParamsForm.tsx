import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { AdvancedMotionParams, TreatmentTimeBreakdown } from "@/lib/animationUtils";

export interface AdvancedMotionParamsFormProps {
  value: AdvancedMotionParams;
  onChange: (params: AdvancedMotionParams) => void;
  totalDurationMs: number;
  /** Optional breakdown to show which parameter limits total time. */
  breakdown?: TreatmentTimeBreakdown;
  disabled?: boolean;
}

const MIN_SPEED = 50;
const MAX_SPEED = 1000;
const MIN_ACCEL = 20;
// Acceleration is in mm/s²; allow values up to 500 m/s² ≈ 500000 mm/s².
const MAX_ACCEL = 500_000;
const MIN_EMIT_SPEED = 0;
const MAX_EMIT_SPEED = MAX_SPEED;
const MIN_ROTATE = 0.2;
const MAX_ROTATE = 10;
const MIN_DWELL_MS = 0.01;
const MAX_DWELL_MS = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatDurationSeconds(ms: number): string {
  const s = ms / 1000;
  const decimals = s >= 1 ? 2 : s >= 0.1 ? 3 : 4;
  return `${s.toFixed(decimals)} s`;
}

function formatBreakdownItem(ms: number, totalMs: number): string {
  const s = ms / 1000;
  const pct = totalMs > 0 ? (100 * ms) / totalMs : 0;
  const decimals = s >= 1 ? 2 : s >= 0.1 ? 3 : 4;
  return `${s.toFixed(decimals)} s (${pct.toFixed(0)}%)`;
}

export function AdvancedMotionParamsForm({
  value,
  onChange,
  totalDurationMs,
  breakdown,
  disabled = false,
}: AdvancedMotionParamsFormProps) {
  const handleChange = React.useCallback(
    (field: keyof AdvancedMotionParams) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const num = parseFloat(e.target.value);
      if (Number.isNaN(num)) return;
      const next = { ...value };
      switch (field) {
        case "linearSpeedMmPerS":
          next.linearSpeedMmPerS = clamp(num, MIN_SPEED, MAX_SPEED);
          break;
        case "linearAccelMmPerS2":
          next.linearAccelMmPerS2 = clamp(num, MIN_ACCEL, MAX_ACCEL);
          break;
        case "minEmissionSpeedMmPerS": {
          const clamped = clamp(num, MIN_EMIT_SPEED, MAX_EMIT_SPEED);
          // Allow v_emit >= v_max but show a validation message in the UI.
          next.minEmissionSpeedMmPerS = clamped;
          break;
        }
        case "rotateMsPerDeg":
          next.rotateMsPerDeg = clamp(num, MIN_ROTATE, MAX_ROTATE);
          break;
        case "dwellMsPerSpot":
          next.dwellMsPerSpot = clamp(num, MIN_DWELL_MS, MAX_DWELL_MS);
          break;
      }
      onChange(next);
    },
    [value, onChange]
  );

  const emitSpeedTooHigh =
    value.fireInMotionEnabled &&
    value.minEmissionSpeedMmPerS > 0 &&
    value.minEmissionSpeedMmPerS >= value.linearSpeedMmPerS;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">Czas:</span>
          <strong className="text-sm" title="Szacowany czas leczenia">
            {formatDurationSeconds(totalDurationMs)}
          </strong>
        </div>
        {breakdown && breakdown.totalMs > 0 && (
          <div className="text-[10px] text-muted-foreground" title="Czynniki limitujące czas">
            Emisja: {formatBreakdownItem(breakdown.dwellMs, breakdown.totalMs)} ·{" "}
            Ruch: {formatBreakdownItem(breakdown.moveMs, breakdown.totalMs)} ·{" "}
            Obrot: {formatBreakdownItem(breakdown.rotateMs, breakdown.totalMs)}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={value.fireInMotionEnabled ? "default" : "outline"}
          onClick={() =>
            onChange({ ...value, fireInMotionEnabled: !value.fireInMotionEnabled })
          }
          disabled={disabled}
        >
          Emisja w ruchu
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-white/70 px-2 py-1">
        <table className="w-full text-xs">
          <tbody>
            <tr>
              <td className="py-0.5 pr-2 align-middle">
                <Label htmlFor="motion-min-speed" className="whitespace-nowrap">
                  Min. prędkość emisji v<sub>emit</sub> (mm/s)
                </Label>
              </td>
              <td className="py-0.5 align-middle">
                <Input
                  id="motion-min-speed"
                  type="number"
                  min={MIN_EMIT_SPEED}
                  max={MAX_EMIT_SPEED}
                  step={1}
                  value={value.minEmissionSpeedMmPerS}
                  onChange={handleChange("minEmissionSpeedMmPerS")}
                  disabled={disabled || !value.fireInMotionEnabled}
                  className={`h-7 w-24 text-xs ${emitSpeedTooHigh ? "border-red-500" : ""}`}
                  aria-invalid={emitSpeedTooHigh}
                />
              </td>
            </tr>
            {emitSpeedTooHigh && (
              <tr>
                <td className="py-0.5 pr-2 align-middle" />
                <td className="py-0.5 align-middle text-[10px] text-red-500">
                  Min. prędkość emisji v
                  <sub>emit</sub> musi być mniejsza niż prędkość liniowa v
                  <sub>max</sub>. Zmniejsz v
                  <sub>emit</sub> lub zwiększ v
                  <sub>max</sub>.
                </td>
              </tr>
            )}
            <tr>
              <td className="py-0.5 pr-2 align-middle">
                <Label htmlFor="motion-speed" className="whitespace-nowrap">
                  Prędkość liniowa v<sub>max</sub> (mm/s)
                </Label>
              </td>
              <td className="py-0.5 align-middle">
                <Input
                  id="motion-speed"
                  type="number"
                  min={MIN_SPEED}
                  max={MAX_SPEED}
                  step={50}
                  value={value.linearSpeedMmPerS}
                  onChange={handleChange("linearSpeedMmPerS")}
                  disabled={disabled}
                  className="h-7 w-24 text-xs"
                />
              </td>
            </tr>
            <tr>
              <td className="py-0.5 pr-2 align-middle">
                <Label htmlFor="motion-accel" className="whitespace-nowrap">
                  Przyspieszenie a (mm/s²)
                </Label>
              </td>
              <td className="py-0.5 align-middle">
                <Input
                  id="motion-accel"
                  type="number"
                  min={MIN_ACCEL}
                  max={MAX_ACCEL}
                  step={10}
                  value={value.linearAccelMmPerS2}
                  onChange={handleChange("linearAccelMmPerS2")}
                  disabled={disabled}
                  className="h-7 w-24 text-xs"
                />
              </td>
            </tr>
            <tr>
              <td className="py-0.5 pr-2 align-middle">
                <Label htmlFor="motion-rotate" className="whitespace-nowrap">
                  Obrót T<sub>rot</sub> (ms/°)
                </Label>
              </td>
              <td className="py-0.5 align-middle">
                <Input
                  id="motion-rotate"
                  type="number"
                  min={MIN_ROTATE}
                  max={MAX_ROTATE}
                  step={0.1}
                  value={value.rotateMsPerDeg}
                  onChange={handleChange("rotateMsPerDeg")}
                  disabled={disabled}
                  className="h-7 w-24 text-xs"
                />
              </td>
            </tr>
            <tr>
              <td className="py-0.5 pr-2 align-middle">
                <Label htmlFor="motion-dwell" className="whitespace-nowrap">
                  Emisja T<sub>spot</sub> (ms/spot)
                </Label>
              </td>
              <td className="py-0.5 align-middle">
                <Input
                  id="motion-dwell"
                  type="number"
                  min={MIN_DWELL_MS}
                  max={MAX_DWELL_MS}
                  step={0.1}
                  value={value.dwellMsPerSpot}
                  onChange={handleChange("dwellMsPerSpot")}
                  disabled={disabled}
                  className="h-7 w-24 text-xs"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
