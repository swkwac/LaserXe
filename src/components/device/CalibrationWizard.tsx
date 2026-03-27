/**
 * Calibration wizard: measure actual travel and derive encoder_resolution_nm (linear)
 * or gear_ratio (rotation) to match physical motion.
 *
 * Linear: Record start position → move by known mm → record end → compute new encoder_resolution_nm.
 * Rotation: Record start → move by known deg → record end → compute new gear_ratio.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DeviceConfigDto, DeviceStatusDto } from "@/types";

type Axis = "linear" | "rotation";

interface CalibrationWizardProps {
  config: DeviceConfigDto;
  status: DeviceStatusDto | null;
  commandBusy: boolean;
  onSendCommand: (cmd: { type: string; axis?: string; value?: number; unit?: string }) => Promise<void>;
  onApplyAndSave: (updatedConfig: DeviceConfigDto) => Promise<void>;
}

export function CalibrationWizard({
  config,
  status,
  commandBusy,
  onSendCommand,
  onApplyAndSave,
}: CalibrationWizardProps) {
  const [open, setOpen] = React.useState(false);
  const [axis, setAxis] = React.useState<Axis>("linear");
  const [startPos, setStartPos] = React.useState<number | null>(null);
  const [travelInput, setTravelInput] = React.useState("");
  const [endPos, setEndPos] = React.useState<number | null>(null);
  const [step, setStep] = React.useState<1 | 2 | 3>(1);

  const pos = axis === "linear" ? status?.linear_position_mm : status?.rotation_position_deg;
  const moving = axis === "linear" ? status?.linear_moving : status?.rotation_moving;
  const unit = axis === "linear" ? "mm" : "deg";

  const reset = React.useCallback(() => {
    setStartPos(null);
    setEndPos(null);
    setTravelInput("");
    setStep(1);
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  React.useEffect(() => {
    if (axis === "linear") {
      setStartPos(null);
      setEndPos(null);
      setStep(1);
    } else {
      setStartPos(null);
      setEndPos(null);
      setStep(1);
    }
  }, [axis]);

  const recordStart = () => {
    if (pos != null) {
      setStartPos(pos);
      setStep(2);
    }
  };

  const recordEnd = () => {
    if (pos != null) {
      setEndPos(pos);
      setStep(3);
    }
  };

  const travel = Number.parseFloat(travelInput);
  const validTravel = !Number.isNaN(travel) && travel > 0;
  const reportedDelta = startPos != null && endPos != null ? endPos - startPos : null;

  const applyCalibration = () => {
    if (reportedDelta == null || !validTravel || Math.abs(reportedDelta) < 0.001) return;
    const actual = travel;
    const reported = reportedDelta;
    const scale = actual / reported;

    let updated: DeviceConfigDto;
    if (axis === "linear") {
      const oldRes = config.linear.encoder_resolution_nm;
      const newRes = Math.round(oldRes * scale);
      const clamped = Math.max(1, Math.min(100000, newRes));
      updated = {
        ...config,
        linear: { ...config.linear, encoder_resolution_nm: clamped },
      };
    } else {
      const oldRatio = config.rotation.gear_ratio;
      const newRatio = oldRatio * scale;
      const clamped = Math.max(0.01, Math.min(1000, newRatio));
      updated = {
        ...config,
        rotation: { ...config.rotation, gear_ratio: clamped },
      };
    }
    reset();
    setOpen(false);
    void onApplyAndSave(updated);
  };

  const canRecordEnd = step === 2 && startPos != null && !moving && pos != null;

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
        <span data-lang="pl">Kalibracja</span>
        <span data-lang="en">Calibration</span>
      </Button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-2 min-w-[320px] max-w-md rounded-lg border border-border bg-card p-4 shadow-lg"
          role="dialog"
          aria-labelledby="calibration-title"
        >
          <h4 id="calibration-title" className="mb-3 text-base font-semibold">
            <span data-lang="pl">Kreator kalibracji</span>
            <span data-lang="en">Calibration wizard</span>
          </h4>

          <div className="space-y-4">
          <div className="grid gap-2">
            <Label>
              <span data-lang="pl">Oś</span>
              <span data-lang="en">Axis</span>
            </Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={axis}
              onChange={(e) => setAxis(e.target.value as Axis)}
              disabled={step > 1}
            >
              <option value="linear">Linear (mm) — encoder_resolution_nm</option>
              <option value="rotation">Rotation (deg) — gear_ratio</option>
            </select>
          </div>

          <p className="text-sm text-muted-foreground">
            {axis === "linear" ? (
              <>
                <span data-lang="pl">
                  1. Zaznacz start. 2. Wpisz rzeczywisty ruch (np. zmierzony linijką). 3. Wykonaj ruch. 4.
                  Zaznacz koniec. Wartość encoder_resolution_nm zostanie skorygowana.
                </span>
                <span data-lang="en">
                  1. Record start. 2. Enter actual travel (e.g. measured with ruler). 3. Execute move.
                  4. Record end. encoder_resolution_nm will be updated.
                </span>
              </>
            ) : (
              <>
                <span data-lang="pl">
                  1. Zaznacz start. 2. Wpisz kąt (np. 360). 3. Wykonaj ruch. 4. Zaznacz koniec.
                  gear_ratio zostanie skorygowany.
                </span>
                <span data-lang="en">
                  1. Record start. 2. Enter angle (e.g. 360). 3. Execute move. 4. Record end.
                  gear_ratio will be updated.
                </span>
              </>
            )}
          </p>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              <span data-lang="pl">Obecna pozycja</span>
              <span data-lang="en">Current position</span>
            </p>
            <p className="text-lg font-semibold">
              {pos != null ? pos.toFixed(axis === "linear" ? 3 : 2) : "—"} {unit}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {step === 1 && (
              <Button onClick={recordStart} disabled={pos == null || commandBusy}>
                <span data-lang="pl">Zaznacz start</span>
                <span data-lang="en">Record start</span>
              </Button>
            )}
            {step === 2 && (
              <>
                <div className="grid w-full gap-2">
                  <Label>
                    {axis === "linear" ? (
                      <>
                        <span data-lang="pl">Rzeczywisty ruch (mm)</span>
                        <span data-lang="en">Actual travel (mm)</span>
                      </>
                    ) : (
                      <>
                        <span data-lang="pl">Kąt (deg)</span>
                        <span data-lang="en">Angle (deg)</span>
                      </>
                    )}
                  </Label>
                  <Input
                    type="number"
                    step={axis === "linear" ? 0.01 : 1}
                    value={travelInput}
                    onChange={(e) => setTravelInput(e.target.value)}
                    placeholder={axis === "linear" ? "10" : "360"}
                  />
                </div>
                <Button
                  onClick={() => onSendCommand({ type: "move_rel", axis, value: travel, unit })}
                  disabled={!validTravel || commandBusy}
                >
                  <span data-lang="pl">Wykonaj ruch</span>
                  <span data-lang="en">Execute move</span>
                </Button>
                <Button variant="outline" onClick={recordEnd} disabled={!canRecordEnd}>
                  <span data-lang="pl">Zaznacz koniec</span>
                  <span data-lang="en">Record end</span>
                </Button>
              </>
            )}
          </div>

          {step === 3 && reportedDelta != null && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-sm">
                <span data-lang="pl">Ruch zgłoszony:</span>
                <span data-lang="en">Reported travel:</span> {reportedDelta.toFixed(4)} {unit}
              </p>
              <p className="text-sm">
                <span data-lang="pl">Ruch rzeczywisty:</span>
                <span data-lang="en">Actual travel:</span> {travel} {unit}
              </p>
              <p className="text-sm font-medium">
                {axis === "linear" ? (
                  <>
                    <span data-lang="pl">Nowy encoder_resolution_nm:</span>
                    <span data-lang="en">New encoder_resolution_nm:</span>{" "}
                    {Math.round(
                      Math.max(
                        1,
                        Math.min(
                          100000,
                          config.linear.encoder_resolution_nm * (travel / reportedDelta)
                        )
                      )
                    )}
                  </>
                ) : (
                  <>
                    <span data-lang="pl">Nowy gear_ratio:</span>
                    <span data-lang="en">New gear_ratio:</span>{" "}
                    {(config.rotation.gear_ratio * (travel / reportedDelta)).toFixed(4)}
                  </>
                )}
              </p>
              <div className="flex gap-2">
                <Button onClick={applyCalibration}>
                  <span data-lang="pl">Zastosuj i zapisz</span>
                  <span data-lang="en">Apply and save</span>
                </Button>
                <Button variant="outline" onClick={reset}>
                  <span data-lang="pl">Anuluj</span>
                  <span data-lang="en">Cancel</span>
                </Button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
