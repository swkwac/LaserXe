import * as React from "react";
import { ApiErrorPanel } from "@/components/ui/ApiErrorPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeClientError } from "@/lib/apiErrors";
import {
  getDeviceConfig,
  getPatterns,
  getDeviceStatus,
  getPresets,
  getSerialPorts,
  getDeviceStreamUrl,
  getRotationDiag,
  rotationSendRaw,
  getRotationIdleTimeout,
  setRotationIdleTimeout,
  getXdaDiag,
  getXdaToolsState,
  saveDeviceConfig,
  savePatterns,
  savePresets,
  sendDeviceCommand,
  xdaConnect,
  xdaDisconnect,
  xdaMoveAbsMm,
  xdaQuery,
  xdaResetNow,
  xdaSendRaw,
  xdaSetInfoMode,
  xdaSetSpeed,
  xdaStepCounts,
  xdaStepMm,
  xdaStopNow,
  setXdaAxisPrefix,
  xdaEnableDriveNow,
  xdaRunIndexNow,
} from "@/lib/services/deviceApi";
import { CalibrationWizard } from "@/components/device/CalibrationWizard";
import { PatternPreview } from "@/components/device/PatternPreview";
import type {
  DeviceCommandDto,
  DeviceConfigComputedDto,
  DeviceConfigDto,
  DevicePatternDto,
  DevicePositionPresetDto,
  DeviceSerialPortDto,
  DeviceStatusDto,
  DeviceWaypointDto,
  DeviceXdaToolsStateDto,
} from "@/types";

function SweepXYPreview({
  waypoints,
  activeIndex,
  mode = "polar_xy",
  width = 500,
  height = 500,
}: {
  waypoints: DeviceWaypointDto[];
  activeIndex: number;
  mode?: "command_xy" | "polar_xy";
  width?: number;
  height?: number;
}) {
  if (waypoints.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 text-sm text-muted-foreground"
        style={{ width, height }}
      >
        <span data-lang="pl">Brak punktów podglądu</span>
        <span data-lang="en">No preview points</span>
      </div>
    );
  }

  const pad = { top: 14, right: 14, bottom: 26, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const pts = waypoints.map((p) => {
    if (mode === "polar_xy") {
      const rad = (p.rotation_deg * Math.PI) / 180;
      return {
        x: p.linear_mm * Math.cos(rad),
        y: p.linear_mm * Math.sin(rad),
        dwell_ms: p.dwell_ms ?? 0,
      };
    }
    return { x: p.linear_mm, y: p.rotation_deg, dwell_ms: p.dwell_ms ?? 0 };
  });
  // Fixed preview frame requested by user for easier visual comparison between runs.
  const xMin = -15;
  const xMax = 15;
  const yMin = -15;
  const yMax = 15;

  const sx = (x: number) => pad.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y: number) => pad.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;
  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`)
    .join(" ");
  const active = Math.max(0, Math.min(activeIndex, waypoints.length - 1));
  const activePoint = pts[active];

  return (
    <svg width={width} height={height} className="rounded-md border border-border bg-muted/10">
      {Array.from({ length: 5 }).map((_, i) => {
        const t = i / 4;
        const gx = pad.left + t * plotW;
        const gy = pad.top + t * plotH;
        return (
          <React.Fragment key={`g-${i}`}>
            <line x1={gx} y1={pad.top} x2={gx} y2={pad.top + plotH} stroke="currentColor" opacity={0.08} />
            <line x1={pad.left} y1={gy} x2={pad.left + plotW} y2={gy} stroke="currentColor" opacity={0.08} />
          </React.Fragment>
        );
      })}
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke="currentColor" opacity={0.25} />
      <line x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH} stroke="currentColor" opacity={0.25} />
      {xMin <= 0 && xMax >= 0 && (
        <line x1={sx(0)} y1={pad.top} x2={sx(0)} y2={pad.top + plotH} stroke="currentColor" opacity={0.2} strokeDasharray="3 3" />
      )}
      {yMin <= 0 && yMax >= 0 && (
        <line x1={pad.left} y1={sy(0)} x2={pad.left + plotW} y2={sy(0)} stroke="currentColor" opacity={0.2} strokeDasharray="3 3" />
      )}
      <circle
        cx={sx(0)}
        cy={sy(0)}
        r={Math.abs(sx(12.5) - sx(0))}
        fill="none"
        stroke="#2563eb"
        strokeWidth="1.6"
        opacity={0.95}
      />
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => {
        const dwell = (p.dwell_ms ?? 0) > 0;
        return (
          <circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={dwell ? 4 : 3}
            fill={dwell ? "#f59e0b" : "hsl(var(--primary))"}
            opacity={i === active ? 1 : 0.9}
            stroke={i === active ? "#111827" : "none"}
            strokeWidth={i === active ? 1.2 : 0}
          />
        );
      })}
      <circle
        cx={sx(activePoint.x)}
        cy={sy(activePoint.y)}
        r={6}
        fill="none"
        stroke="#111827"
        strokeWidth="1.2"
      />
      <circle cx={sx(pts[0].x)} cy={sy(pts[0].y)} r={4.5} fill="#10b981" stroke="#065f46" strokeWidth="1" />
      <rect x={sx(pts[pts.length - 1].x) - 4} y={sy(pts[pts.length - 1].y) - 4} width={8} height={8} fill="#ef4444" stroke="#7f1d1d" strokeWidth="1" />
      <circle cx={pad.left + 8} cy={10} r={3} fill="hsl(var(--primary))" />
      <text x={pad.left + 16} y={12} fontSize="9" fill="currentColor" opacity={0.75}>Move point</text>
      <circle cx={pad.left + 70} cy={10} r={3.5} fill="#f59e0b" />
      <text x={pad.left + 78} y={12} fontSize="9" fill="currentColor" opacity={0.75}>Dwell / emission</text>
      <circle cx={pad.left + 156} cy={10} r={4.5} fill="none" stroke="#111827" strokeWidth="1.2" />
      <text x={pad.left + 164} y={12} fontSize="9" fill="currentColor" opacity={0.75}>Current</text>
      <circle cx={pad.left + 214} cy={10} r={3.5} fill="#10b981" />
      <text x={pad.left + 222} y={12} fontSize="9" fill="currentColor" opacity={0.75}>Start</text>
      <rect x={pad.left + 256} y={6.5} width={7} height={7} fill="#ef4444" />
      <text x={pad.left + 266} y={12} fontSize="9" fill="currentColor" opacity={0.75}>End</text>
      {mode === "polar_xy" ? (
        <>
          <text x={pad.left + plotW} y={height - 6} textAnchor="end" fontSize="9" fill="currentColor" opacity={0.65}>X (projected mm)</text>
          <text x={pad.left - 30} y={pad.top + 10} fontSize="9" fill="currentColor" opacity={0.65}>Y (projected mm)</text>
          <text x={pad.left + plotW - 4} y={12} textAnchor="end" fontSize="9" fill="currentColor" opacity={0.55}>equal scale</text>
          <text x={pad.left + 2} y={height - 6} fontSize="9" fill="currentColor" opacity={0.6}>
            x:[{xMin.toFixed(2)}, {xMax.toFixed(2)}] y:[{yMin.toFixed(2)}, {yMax.toFixed(2)}]
          </text>
        </>
      ) : (
        <>
          <text x={pad.left + plotW} y={height - 6} textAnchor="end" fontSize="9" fill="currentColor" opacity={0.65}>X (linear mm)</text>
          <text x={pad.left - 30} y={pad.top + 10} fontSize="9" fill="currentColor" opacity={0.65}>Y (rot deg)</text>
          <text x={pad.left + 2} y={height - 6} fontSize="9" fill="currentColor" opacity={0.6}>
            x:[{xMin.toFixed(2)}, {xMax.toFixed(2)}] y:[{yMin.toFixed(2)}, {yMax.toFixed(2)}]
          </text>
        </>
      )}
    </svg>
  );
}

/** Generic serial defaults; COM ports must be configured explicitly. */
const DEFAULT_SERIAL_BAUD = 115200;
const ROTATION_NUDGE_DEG = 1;
const ROTATION_PRESET_VALUES = [5, 10, 15, 30, 90] as const;

type SweepRotationFirstToward = "negative_limit" | "positive_limit";

/**
 * One pass across the configured rotation span: no “go to min then back through the same angles to max”.
 * Backend HOME + approach moves the hardware to the first planned angle before the raster legs run.
 */
function monotonicRotationScheduleOneSpanCentered(
  rotMin: number,
  rotMax: number,
  numLegs: number,
  firstToward: SweepRotationFirstToward
): number[] {
  const span = rotMax - rotMin;
  const n = Math.max(1, Math.floor(numLegs));
  if (span < 1e-9 || n <= 1) {
    return [rotMin + span / 2];
  }
  const laneStep = span / n;
  const first = rotMin + laneStep / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i;
    if (firstToward === "negative_limit") {
      out.push(first + t * laneStep);
    } else {
      out.push(rotMax - laneStep / 2 - t * laneStep);
    }
  }
  return out;
}

/** N linear sweeps: constant angle per sweep, then rotate by |R| toward the chosen limit (clamped). */
function sweepRotationScheduleFixedRSteps(
  rotMin: number,
  rotMax: number,
  numLegs: number,
  rotateStepDeg: number,
  firstToward: SweepRotationFirstToward
): number[] {
  const clampR = (a: number) => Math.min(rotMax, Math.max(rotMin, a));
  const span = Math.max(0, rotMax - rotMin);
  const mid = (rotMin + rotMax) / 2;
  const stepMag = Math.abs(rotateStepDeg);
  const n = numLegs + 1;
  if (n < 1) return [clampR(rotMin)];
  if (stepMag < 1e-9) {
    const start = mid;
    return Array.from({ length: n }, () => clampR(start));
  }
  const delta = firstToward === "negative_limit" ? stepMag : -stepMag;
  // Keep both endpoints equally far from software limits whenever full-span is disabled.
  const travel = Math.min(span, stepMag * numLegs);
  const startForward = mid - travel / 2;
  const start = firstToward === "negative_limit" ? startForward : mid + travel / 2;
  const out: number[] = [];
  let theta = start;
  out.push(clampR(theta));
  for (let k = 0; k < numLegs; k += 1) {
    theta += delta;
    out.push(clampR(theta));
  }
  return out;
}

function buildSweepWaypoints(params: {
  minX: number;
  maxX: number;
  step: number;
  repeats: number;
  dwell: number;
  sweepRotateDeg: number;
  rotMin: number;
  rotMax: number;
  /** Min→max or max→min along the travel span (one monotonic pass). */
  rotationFirstToward: SweepRotationFirstToward;
  /** If true, leg count = ceil(span/|R|) only (N ignored). If false, exactly N sweeps with |R| between legs. */
  rotationCoverFullTravel: boolean;
}): DeviceWaypointDto[] {
  const {
    minX,
    maxX,
    step,
    repeats,
    dwell,
    sweepRotateDeg,
    rotMin,
    rotMax,
    rotationFirstToward,
    rotationCoverFullTravel,
  } = params;
  // Keep sweep as symmetric around Y-axis as possible: use mirrored X span.
  const halfX = Math.max(Math.abs(minX), Math.abs(maxX));
  const lo = -halfX;
  const hi = halfX;
  const stepAbs = Math.abs(step);
  const reps = Math.max(1, Math.floor(repeats));
  const dw = Math.max(0, Math.floor(dwell));
  if (stepAbs <= 0) return [];

  const makeSweepStops = (from: number, to: number): number[] => {
    const dir = to >= from ? 1 : -1;
    const pts: number[] = [from];
    let x = from;
    while (true) {
      const next = x + dir * stepAbs;
      if ((dir > 0 && next >= to) || (dir < 0 && next <= to)) break;
      pts.push(next);
      x = next;
    }
    const last = pts[pts.length - 1];
    if (Math.abs(last - to) > 1e-9) pts.push(to);
    return pts;
  };

  const pathLenDeg = rotMax - rotMin;
  const stepRotAbs = Math.abs(sweepRotateDeg);
  const minRepsFromRotation =
    stepRotAbs < 1e-9 ? 1 : Math.max(1, Math.ceil(pathLenDeg / stepRotAbs));
  const repsEff = rotationCoverFullTravel
    ? Math.min(400, minRepsFromRotation)
    : Math.min(400, reps);

  const legRotations = rotationCoverFullTravel
    ? monotonicRotationScheduleOneSpanCentered(rotMin, rotMax, repsEff, rotationFirstToward)
    : sweepRotationScheduleFixedRSteps(
        rotMin,
        rotMax,
        repsEff,
        sweepRotateDeg,
        rotationFirstToward
      );

  let forward = true;
  const waypoints: DeviceWaypointDto[] = [];

  for (let i = 0; i < repsEff; i += 1) {
    const rotation = legRotations[i] ?? legRotations[legRotations.length - 1];
    const nextCornerRot = legRotations[i + 1] ?? rotation;
    const from = forward ? lo : hi;
    const to = forward ? hi : lo;
    const sweepPts = makeSweepStops(from, to);
    for (const x of sweepPts) {
      waypoints.push({ linear_mm: x, rotation_deg: rotation, dwell_ms: dw });
    }
    // Avoid a blank/no-op corner at the very end.
    if (i < repsEff - 1 && Math.abs(nextCornerRot - rotation) > 1e-9) {
      waypoints.push({ linear_mm: to, rotation_deg: nextCornerRot, dwell_ms: 0 });
    }
    forward = !forward;
  }

  return waypoints;
}

function getLinearCountsPerMm(
  computed: DeviceConfigComputedDto | null,
  config: DeviceConfigDto
): number {
  if (computed?.linear_units_per_mm && Number.isFinite(computed.linear_units_per_mm) && computed.linear_units_per_mm > 0) {
    return computed.linear_units_per_mm;
  }
  const nmPerCount = config.linear.encoder_resolution_nm;
  if (Number.isFinite(nmPerCount) && nmPerCount > 0) {
    return 1_000_000 / nmPerCount;
  }
  return 1250;
}

function withDefaultConnectionFields(cfg: DeviceConfigDto): DeviceConfigDto {
  const rb = cfg.serial.rotation_backend ?? "arduino_step_dir";
  return {
    ...cfg,
    serial: {
      ...cfg.serial,
      rotation_backend: rb,
      pico_port: cfg.serial.pico_port?.trim() ? cfg.serial.pico_port.trim() : null,
      linear_port: cfg.serial.linear_port?.trim() ? cfg.serial.linear_port.trim() : null,
    },
  };
}

function DeviceControlPage() {
  const [uiMode, setUiMode] = React.useState<"simple" | "advanced">("simple");
  const [config, setConfig] = React.useState<DeviceConfigDto | null>(null);
  const [computed, setComputed] = React.useState<DeviceConfigComputedDto | null>(null);
  const [status, setStatus] = React.useState<DeviceStatusDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [commandBusy, setCommandBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [commandError, setCommandError] = React.useState<string | null>(null);
  const [lastCommandAck, setLastCommandAck] = React.useState<string | null>(null);
  const [streamConnected, setStreamConnected] = React.useState(false);
  const [showXdaLog, setShowXdaLog] = React.useState(true);
  const [showRotationLog, setShowRotationLog] = React.useState(true);
  const [showLinearControlPanel, setShowLinearControlPanel] = React.useState(true);
  const [showRotationControlPanel, setShowRotationControlPanel] = React.useState(true);
  const [showSweepProgram, setShowSweepProgram] = React.useState(true);
  const [xdaDiagLines, setXdaDiagLines] = React.useState<string[]>([]);
  const [rotationDiagLines, setRotationDiagLines] = React.useState<string[]>([]);
  const [xdaToolsState, setXdaToolsState] = React.useState<DeviceXdaToolsStateDto | null>(null);
  const [xdaPanelBusy, setXdaPanelBusy] = React.useState(false);
  const [xdaPort, setXdaPort] = React.useState("");
  const [xdaBaud, setXdaBaud] = React.useState(DEFAULT_SERIAL_BAUD);
  const [xdaAxis, setXdaAxis] = React.useState("X");
  const [xdaCountsPerMm, setXdaCountsPerMm] = React.useState(1250);
  const [xdaInvertDirection, setXdaInvertDirection] = React.useState(true);
  const [xdaSpeedUnits, setXdaSpeedUnits] = React.useState(5000);
  const [xdaRelativeMm, setXdaRelativeMm] = React.useState(1);
  const [xdaRelativeCounts, setXdaRelativeCounts] = React.useState(1250);
  const [xdaAbsoluteMm, setXdaAbsoluteMm] = React.useState(0);
  const [xdaInfoMode, setXdaInfoMode] = React.useState(7);
  const [xdaRawCommand, setXdaRawCommand] = React.useState("STEP=1250");
  const [rotationTarget, setRotationTarget] = React.useState(0);
  const [rotationStep, setRotationStep] = React.useState(5);
  const [rotationStartUs, setRotationStartUs] = React.useState(1600);
  const [rotationMinUs, setRotationMinUs] = React.useState(800);
  const [rotationRampSteps, setRotationRampSteps] = React.useState(800);
  const [rotationMicrosteps, setRotationMicrosteps] = React.useState(8);
  const [rotationIdleDisableS, setRotationIdleDisableS] = React.useState(20);
  const [sweepXMin, setSweepXMin] = React.useState(-5);
  const [sweepXMax, setSweepXMax] = React.useState(5);
  const [sweepStepY, setSweepStepY] = React.useState(1);
  const [sweepDwellMs, setSweepDwellMs] = React.useState(200);
  const [sweepRotateDeg, setSweepRotateDeg] = React.useState(5);
  const [sweepRepeats, setSweepRepeats] = React.useState(4);
  const [sweepRotationCoverFullTravel, setSweepRotationCoverFullTravel] =
    React.useState(false);
  const [sweepRotationFirstToward, setSweepRotationFirstToward] =
    React.useState<SweepRotationFirstToward>("negative_limit");
  const [sweepSimPlaying, setSweepSimPlaying] = React.useState(false);
  const [sweepSimIndex, setSweepSimIndex] = React.useState(0);
  const [sweepPlotMode, setSweepPlotMode] = React.useState<"command_xy" | "polar_xy">("polar_xy");
  const [serialPorts, setSerialPorts] = React.useState<DeviceSerialPortDto[]>([]);
  const [presets, setPresets] = React.useState<DevicePositionPresetDto[]>([]);
  const [patterns, setPatterns] = React.useState<DevicePatternDto[]>([]);
  const [currentWaypoints, setCurrentWaypoints] = React.useState<DeviceWaypointDto[]>([
    { linear_mm: 0, rotation_deg: 0, dwell_ms: 0 },
  ]);
  const [patternSaveName, setPatternSaveName] = React.useState("");
  const [patternLoadId, setPatternLoadId] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDeviceConfig()
      .then((data) => {
        if (cancelled) return;
        setConfig(withDefaultConnectionFields(data.config));
        setComputed(data.computed);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(normalizeClientError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    getSerialPorts()
      .then(setSerialPorts)
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    getPresets()
      .then(setPresets)
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    getPatterns()
      .then(setPatterns)
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!config) return;
    setXdaPort((config.serial.linear_port ?? "").trim());
    setXdaBaud(config.serial.linear_baud ?? DEFAULT_SERIAL_BAUD);
    setXdaAxis((config.linear.xda_axis ?? "X").slice(0, 1).toUpperCase() || "X");
    const countsPerMm = getLinearCountsPerMm(computed, config);
    setXdaCountsPerMm(Math.max(1, countsPerMm));
    setXdaRelativeCounts(Math.max(1, Math.round(countsPerMm)));
  }, [config, computed]);

  React.useEffect(() => {
    // Always open in simple mode by default.
    setUiMode("simple");
  }, []);

  React.useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnect: number | null = null;
    let active = true;

    const connect = () => {
      if (!active) return;
      try {
        ws = new WebSocket(getDeviceStreamUrl());
      } catch {
        reconnect = window.setTimeout(connect, 2000);
        return;
      }
      ws.onopen = () => setStreamConnected(true);
      ws.onclose = () => {
        if (!active) return;
        setStreamConnected(false);
        reconnect = window.setTimeout(connect, 2000);
      };
      ws.onerror = () => {
        if (!active) return;
        setStreamConnected(false);
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as DeviceStatusDto;
          setStatus(data);
        } catch {
          // ignore parse errors
        }
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnect) window.clearTimeout(reconnect);
      if (ws) ws.close();
    };
  }, []);

  React.useEffect(() => {
    if (status) return;
    getDeviceStatus()
      .then((data) => setStatus(data))
      .catch(() => {
        /* ignore */
      });
  }, [status]);

  const refreshStatus = React.useCallback(async () => {
    try {
      const data = await getDeviceStatus();
      setStatus(data);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshXdaDiag = React.useCallback(async () => {
    try {
      const data = await getXdaDiag();
      setXdaDiagLines(data.lines || []);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshRotationDiag = React.useCallback(async () => {
    try {
      const data = await getRotationDiag();
      setRotationDiagLines(data.lines || []);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshXdaToolsState = React.useCallback(async () => {
    try {
      const data = await getXdaToolsState();
      setXdaToolsState(data);
    } catch {
      /* ignore */
    }
  }, []);

  /** Live stream pushes ~10/s; if the WebSocket fails, poll so positions/errors still update. */
  React.useEffect(() => {
    if (streamConnected) return;
    const id = window.setInterval(() => {
      void refreshStatus();
    }, 2000);
    return () => window.clearInterval(id);
  }, [streamConnected, refreshStatus]);

  React.useEffect(() => {
    void refreshRotationDiag();
    void refreshXdaDiag();
    void refreshXdaToolsState();
    const id = window.setInterval(() => {
      void refreshRotationDiag();
      void refreshXdaDiag();
      void refreshXdaToolsState();
    }, 2000);
    return () => window.clearInterval(id);
  }, [refreshRotationDiag, refreshXdaDiag, refreshXdaToolsState]);

  const handleSave = React.useCallback(async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveDeviceConfig(config);
      setConfig(withDefaultConnectionFields(result.config));
      setComputed(result.computed);
    } catch (err) {
      setError(normalizeClientError(err));
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleApplyAndSaveCalibration = React.useCallback(
    async (updatedConfig: DeviceConfigDto) => {
      setSaving(true);
      setError(null);
      try {
        const merged = withDefaultConnectionFields(updatedConfig);
        setConfig(merged);
        const result = await saveDeviceConfig(merged);
        setConfig(withDefaultConnectionFields(result.config));
        setComputed(result.computed);
      } catch (err) {
        setError(normalizeClientError(err));
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const activateSimpleMode = React.useCallback(async () => {
    setUiMode("simple");
    if (!config) return;
    if (config.serial.rotation_backend === "arduino_step_dir") return;
    const updated = withDefaultConnectionFields({
      ...config,
      serial: { ...config.serial, rotation_backend: "arduino_step_dir" },
    });
    setSaving(true);
    setError(null);
    try {
      setConfig(updated);
      const result = await saveDeviceConfig(updated);
      setConfig(withDefaultConnectionFields(result.config));
      setComputed(result.computed);
    } catch (err) {
      setError(normalizeClientError(err));
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleSavePattern = React.useCallback(async () => {
    const name = patternSaveName.trim();
    if (!name) return;
    const existing = patterns.find((p) => p.name === name);
    const updated = existing
      ? patterns.map((p) =>
          p.name === name ? { ...p, waypoints: currentWaypoints } : p
        )
      : [...patterns, { name, waypoints: currentWaypoints }];
    setSaving(true);
    setError(null);
    try {
      const saved = await savePatterns(updated);
      setPatterns(saved);
      setPatternSaveName("");
    } catch (err) {
      setError(normalizeClientError(err));
    } finally {
      setSaving(false);
    }
  }, [patternSaveName, patterns, currentWaypoints]);

  const handleLoadPattern = React.useCallback(() => {
    const p = patterns.find((x) => x.name === patternLoadId);
    if (p) setCurrentWaypoints(p.waypoints);
  }, [patterns, patternLoadId]);

  const sendCommand = React.useCallback(
    async (command: DeviceCommandDto) => {
      setCommandError(null);
      setCommandBusy(true);
      try {
        const res = await sendDeviceCommand(command);
        const asyncSweep =
          command.type === "pattern_start" &&
          Boolean(res.sent && typeof res.sent === "object" && res.sent.running_async === true);
        setLastCommandAck(
          `${new Date().toLocaleTimeString()} — ${command.type} acknowledged by API` +
            (asyncSweep ? " (sweep continues on server; watch status below)" : "")
        );
        await refreshStatus();
      } catch (err) {
        setLastCommandAck(null);
        setCommandError(normalizeClientError(err));
        await refreshStatus();
      } finally {
        setCommandBusy(false);
      }
    },
    [refreshStatus]
  );

  const runRotationToolAction = React.useCallback(
    async (fn: () => Promise<void>) => {
      setCommandError(null);
      setCommandBusy(true);
      try {
        await fn();
        setLastCommandAck(`${new Date().toLocaleTimeString()} — rotation profile applied`);
        await refreshRotationDiag();
        await refreshStatus();
      } catch (err) {
        setLastCommandAck(null);
        setCommandError(normalizeClientError(err));
        await refreshStatus();
      } finally {
        setCommandBusy(false);
      }
    },
    [refreshRotationDiag, refreshStatus]
  );

  const applyRotationProfile = React.useCallback(async () => {
    if (!config) return;
    if (config.serial.rotation_backend !== "arduino_step_dir") {
      setCommandError("Rotation profile tuning is available only for Arduino CW/CCW (arduino_step_dir).");
      return;
    }
    const startUs = Math.max(50, Math.floor(rotationStartUs));
    const minUs = Math.max(20, Math.floor(rotationMinUs));
    const ramp = Math.max(0, Math.floor(rotationRampSteps));
    const ustep = Math.max(1, Math.floor(rotationMicrosteps));
    await runRotationToolAction(async () => {
      await rotationSendRaw(`USTEP=${ustep}`);
      await rotationSendRaw(`STARTUS=${startUs}`);
      await rotationSendRaw(`MINUS=${minUs}`);
      await rotationSendRaw(`RAMP=${ramp}`);
      await rotationSendRaw("STAT?");
    });
  }, [config, rotationStartUs, rotationMinUs, rotationRampSteps, rotationMicrosteps, runRotationToolAction]);

  const loadRotationIdleTimeout = React.useCallback(async () => {
    if (!config || config.serial.rotation_backend !== "arduino_step_dir") return;
    try {
      const data = await getRotationIdleTimeout();
      if (Number.isFinite(data.seconds)) {
        setRotationIdleDisableS(data.seconds);
      }
    } catch {
      /* ignore */
    }
  }, [config]);

  const applyRotationIdleTimeout = React.useCallback(async () => {
    if (!config) return;
    if (config.serial.rotation_backend !== "arduino_step_dir") {
      setCommandError("Idle timeout control is available only for Arduino CW/CCW (arduino_step_dir).");
      return;
    }
    const seconds = Math.max(0, Number(rotationIdleDisableS));
    await runRotationToolAction(async () => {
      const data = await setRotationIdleTimeout(seconds);
      if (Number.isFinite(data.seconds)) {
        setRotationIdleDisableS(data.seconds);
      }
    });
  }, [config, rotationIdleDisableS, runRotationToolAction]);

  React.useEffect(() => {
    void loadRotationIdleTimeout();
  }, [loadRotationIdleTimeout]);

  const updateConfig = React.useCallback((updater: (prev: DeviceConfigDto) => DeviceConfigDto) => {
    setConfig((prev) => (prev ? updater(prev) : prev));
  }, []);

  const refreshSerialPorts = React.useCallback(() => {
    getSerialPorts()
      .then(setSerialPorts)
      .catch(() => {});
  }, []);

  const updateNumber = (value: string, onUpdate: (num: number) => void) => {
    const num = Number.parseFloat(value);
    if (!Number.isNaN(num)) onUpdate(num);
  };

  const updateInt = (value: string, onUpdate: (num: number) => void) => {
    const num = Number.parseInt(value, 10);
    if (!Number.isNaN(num)) onUpdate(num);
  };

  const formatValue = (value?: number | null, digits = 3) =>
    value == null ? "—" : value.toFixed(digits);

  const lastUpdateLabel =
    status?.last_update != null ? new Date(status.last_update).toLocaleTimeString() : "—";
  const hasPicoPort = Boolean(config?.serial.pico_port?.trim());
  const hasLinearPort = Boolean(config?.serial.linear_port?.trim());
  const sweepPortsMissing =
    config?.serial.rotation_backend !== "pico"
      ? !hasPicoPort || !hasLinearPort
      : !hasPicoPort;

  const handleXdaEnableDrive = React.useCallback(async (enblValue: 0 | 1 | 2 | 3) => {
    setCommandError(null);
    try {
      const res = await xdaEnableDriveNow(enblValue);
      const effective = typeof res.enbl === "number" ? res.enbl : enblValue;
      setLastCommandAck(`${new Date().toLocaleTimeString()} — XDA ENBL=${effective} sent`);
      await Promise.all([refreshStatus(), refreshXdaDiag(), refreshXdaToolsState()]);
    } catch (err) {
      setCommandError(normalizeClientError(err));
    }
  }, [refreshStatus, refreshXdaDiag, refreshXdaToolsState]);

  const handleXdaRunIndex = React.useCallback(async () => {
    setCommandError(null);
    try {
      await xdaRunIndexNow();
      setLastCommandAck(`${new Date().toLocaleTimeString()} — XDA INDX command sent`);
      await Promise.all([refreshStatus(), refreshXdaDiag(), refreshXdaToolsState()]);
    } catch (err) {
      setCommandError(normalizeClientError(err));
    }
  }, [refreshStatus, refreshXdaDiag, refreshXdaToolsState]);

  const handleSetAxisPrefix = React.useCallback(async (enabled: boolean) => {
    setCommandError(null);
    try {
      const next = await setXdaAxisPrefix(enabled);
      setXdaToolsState(next);
      setLastCommandAck(
        `${new Date().toLocaleTimeString()} — XDA command prefix: ${next.axis_prefix_enabled ? "axis ON (X:...)" : "axis OFF (...)" }`
      );
      await Promise.all([refreshStatus(), refreshXdaDiag(), refreshXdaToolsState()]);
    } catch (err) {
      setCommandError(normalizeClientError(err));
    }
  }, [refreshStatus, refreshXdaDiag, refreshXdaToolsState]);

  const runXdaPanelAction = React.useCallback(
    async (action: () => Promise<void>) => {
      setCommandError(null);
      setXdaPanelBusy(true);
      try {
        await action();
        await Promise.all([refreshStatus(), refreshXdaDiag(), refreshXdaToolsState()]);
      } catch (err) {
        setCommandError(normalizeClientError(err));
      } finally {
        setXdaPanelBusy(false);
      }
    },
    [refreshStatus, refreshXdaDiag, refreshXdaToolsState]
  );

  const handleXdaConnect = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      const res = await xdaConnect({
        port: xdaPort.trim() || undefined,
        baud: xdaBaud,
        axis: xdaAxis.trim() || undefined,
      });
      setLastCommandAck(
        `${new Date().toLocaleTimeString()} — XDA connected (${res.axis ?? xdaAxis.toUpperCase()}, STAT=${res.stat ?? "?"}, EPOS=${res.epos ?? "?"})`
      );
    });
  }, [runXdaPanelAction, xdaPort, xdaBaud, xdaAxis]);

  const handleXdaDisconnect = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      await xdaDisconnect();
      setLastCommandAck(`${new Date().toLocaleTimeString()} — XDA disconnected`);
    });
  }, [runXdaPanelAction]);

  const handleXdaStop = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      await xdaStopNow();
      setLastCommandAck(`${new Date().toLocaleTimeString()} — XDA STOP sent`);
    });
  }, [runXdaPanelAction]);

  const handleXdaReset = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      await xdaResetNow();
      setLastCommandAck(`${new Date().toLocaleTimeString()} — XDA RESET sent`);
    });
  }, [runXdaPanelAction]);

  const handleXdaSetSpeed = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      const res = await xdaSetSpeed(xdaSpeedUnits);
      setLastCommandAck(`${new Date().toLocaleTimeString()} — ${res.axis ?? xdaAxis.toUpperCase()}:SSPD=${res.speed_units ?? xdaSpeedUnits}`);
    });
  }, [runXdaPanelAction, xdaSpeedUnits, xdaAxis]);

  const handleXdaMoveMm = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      const res = await xdaStepMm(xdaRelativeMm, xdaCountsPerMm, xdaInvertDirection);
      setLastCommandAck(
        `${new Date().toLocaleTimeString()} — STEP(mm): ${xdaRelativeMm} mm -> ${res.step_counts ?? "?"} counts`
      );
    });
  }, [runXdaPanelAction, xdaRelativeMm, xdaCountsPerMm, xdaInvertDirection]);

  const handleXdaMoveCounts = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      const res = await xdaStepCounts(xdaRelativeCounts);
      setLastCommandAck(`${new Date().toLocaleTimeString()} — STEP=${res.step_counts ?? xdaRelativeCounts}`);
    });
  }, [runXdaPanelAction, xdaRelativeCounts]);

  const handleXdaGotoMm = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      const res = await xdaMoveAbsMm(xdaAbsoluteMm, xdaCountsPerMm, xdaInvertDirection);
      setLastCommandAck(
        `${new Date().toLocaleTimeString()} — DPOS(mm): ${xdaAbsoluteMm} mm -> ${res.target_counts ?? "?"} counts`
      );
    });
  }, [runXdaPanelAction, xdaAbsoluteMm, xdaCountsPerMm, xdaInvertDirection]);

  const handleXdaSetInfo = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      const res = await xdaSetInfoMode(xdaInfoMode);
      setLastCommandAck(`${new Date().toLocaleTimeString()} — INFO=${res.info_mode ?? xdaInfoMode}`);
    });
  }, [runXdaPanelAction, xdaInfoMode]);

  const handleXdaInfoZero = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      await xdaSetInfoMode(0);
      setLastCommandAck(`${new Date().toLocaleTimeString()} — INFO=0`);
    });
  }, [runXdaPanelAction]);

  const handleXdaReadEpos = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      const res = await xdaQuery("EPOS");
      setLastCommandAck(`${new Date().toLocaleTimeString()} — EPOS=${res.value ?? "timeout"}`);
    });
  }, [runXdaPanelAction]);

  const handleXdaReadStat = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      const res = await xdaQuery("STAT");
      setLastCommandAck(`${new Date().toLocaleTimeString()} — STAT=${res.value ?? "timeout"}`);
    });
  }, [runXdaPanelAction]);

  const handleXdaReadFreq = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      const res = await xdaQuery("FREQ");
      setLastCommandAck(`${new Date().toLocaleTimeString()} — FREQ=${res.value ?? "timeout"}`);
    });
  }, [runXdaPanelAction]);

  const handleXdaSendRaw = React.useCallback(async () => {
    await runXdaPanelAction(async () => {
      const cmd = xdaRawCommand.trim();
      if (!cmd) {
        throw new Error("Raw command is empty.");
      }
      const res = await xdaSendRaw(cmd);
      setLastCommandAck(`${new Date().toLocaleTimeString()} — raw sent: ${res.sent ?? cmd}`);
    });
  }, [runXdaPanelAction, xdaRawCommand]);

  const runSweepProgram = React.useCallback(async () => {
    const minX = Math.min(sweepXMin, sweepXMax);
    const maxX = Math.max(sweepXMin, sweepXMax);
    const step = Math.abs(sweepStepY);
    const repeats = Math.max(1, Math.floor(sweepRepeats));
    const dwell = Math.max(0, Math.floor(sweepDwellMs));
    if (step <= 0) {
      setCommandError("Sweep step must be > 0.");
      return;
    }

    const rotMin = config?.rotation.travel_min_deg ?? -90;
    const rotMax = config?.rotation.travel_max_deg ?? 90;

    const waypoints = buildSweepWaypoints({
      minX,
      maxX,
      step,
      repeats,
      dwell,
      sweepRotateDeg,
      rotMin,
      rotMax,
      rotationFirstToward: sweepRotationFirstToward,
      rotationCoverFullTravel: sweepRotationCoverFullTravel,
    });
    if (waypoints.length === 0) {
      setCommandError("Could not build sweep path (check step and limits).");
      return;
    }

    setCurrentWaypoints(waypoints);
    await sendCommand({ type: "pattern_start", pattern: waypoints });
  }, [
    sweepXMin,
    sweepXMax,
    sweepStepY,
    sweepDwellMs,
    sweepRotateDeg,
    sweepRepeats,
    sweepRotationFirstToward,
    sweepRotationCoverFullTravel,
    sendCommand,
    config?.rotation.travel_min_deg,
    config?.rotation.travel_max_deg,
  ]);

  const sweepPreviewWaypoints = React.useMemo(() => {
    const minX = Math.min(sweepXMin, sweepXMax);
    const maxX = Math.max(sweepXMin, sweepXMax);
    const step = Math.abs(sweepStepY);
    const repeats = Math.max(1, Math.floor(sweepRepeats));
    const dwell = Math.max(0, Math.floor(sweepDwellMs));
    const rotMin = config?.rotation.travel_min_deg ?? -90;
    const rotMax = config?.rotation.travel_max_deg ?? 90;
    return buildSweepWaypoints({
      minX,
      maxX,
      step,
      repeats,
      dwell,
      sweepRotateDeg,
      rotMin,
      rotMax,
      rotationFirstToward: sweepRotationFirstToward,
      rotationCoverFullTravel: sweepRotationCoverFullTravel,
    });
  }, [
    sweepXMin,
    sweepXMax,
    sweepStepY,
    sweepDwellMs,
    sweepRotateDeg,
    sweepRepeats,
    sweepRotationFirstToward,
    sweepRotationCoverFullTravel,
    config?.rotation.travel_min_deg,
    config?.rotation.travel_max_deg,
  ]);

  const sweepPreviewStats = React.useMemo(() => {
    if (sweepPreviewWaypoints.length === 0) return null;
    const totalDwellMs = sweepPreviewWaypoints.reduce((sum, p) => sum + (p.dwell_ms ?? 0), 0);
    return {
      points: sweepPreviewWaypoints.length,
      totalDwellMs,
      estSeconds: totalDwellMs / 1000,
    };
  }, [sweepPreviewWaypoints]);

  const sweepPreviewDims = React.useMemo(() => {
    if (sweepPreviewWaypoints.length === 0) return null;
    const points =
      sweepPlotMode === "polar_xy"
        ? sweepPreviewWaypoints.map((p) => {
            const rad = (p.rotation_deg * Math.PI) / 180;
            return { x: p.linear_mm * Math.cos(rad), y: p.linear_mm * Math.sin(rad) };
          })
        : sweepPreviewWaypoints.map((p) => ({ x: p.linear_mm, y: p.rotation_deg }));
    const xMin = Math.min(...points.map((p) => p.x));
    const xMax = Math.max(...points.map((p) => p.x));
    const yMin = Math.min(...points.map((p) => p.y));
    const yMax = Math.max(...points.map((p) => p.y));
    return {
      xMin,
      xMax,
      yMin,
      yMax,
      xSpan: xMax - xMin,
      ySpan: yMax - yMin,
    };
  }, [sweepPreviewWaypoints, sweepPlotMode]);

  React.useEffect(() => {
    setSweepSimIndex(0);
    setSweepSimPlaying(false);
  }, [
    sweepXMin,
    sweepXMax,
    sweepStepY,
    sweepDwellMs,
    sweepRotateDeg,
    sweepRepeats,
    sweepRotationFirstToward,
    sweepRotationCoverFullTravel,
  ]);

  React.useEffect(() => {
    if (!sweepSimPlaying || sweepPreviewWaypoints.length === 0) return;
    const timer = window.setInterval(() => {
      setSweepSimIndex((prev) => {
        if (prev >= sweepPreviewWaypoints.length - 1) {
          setSweepSimPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 350);
    return () => window.clearInterval(timer);
  }, [sweepSimPlaying, sweepPreviewWaypoints.length]);

  if (loading && !config) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Loading device settings">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded bg-muted" />
      </section>
    );
  }

  if (error && !config) {
    return (
      <section className="space-y-3" aria-label="Device control load error">
        <ApiErrorPanel title="Could not load device control" message={error} />
        <Button variant="outline" onClick={() => window.location.reload()}>
          <span data-lang="pl">Odśwież</span>
          <span data-lang="en">Refresh</span>
        </Button>
      </section>
    );
  }

  if (!config) return null;

  return (
    <section className="space-y-8" aria-label="Device control">
      <section
        className="rounded-lg border border-border bg-card p-4"
        aria-label="USB serial and motion backend"
      >
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              <span data-lang="pl">Połączenie USB / porty COM</span>
              <span data-lang="en">USB connection / COM ports</span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span data-lang="pl">
                Domyślny układ: Arduino (CW/CCW, obrót) + XDA (oś liniowa). Porty: COM20 (Arduino), COM22 (XDA), baud
                115200. Zapis: /api/device/config-merge (PUT lub POST).
              </span>
              <span data-lang="en">
                Default setup: Arduino (CW/CCW text, rotation) + XDA (linear). Ports: COM20 (Arduino), COM22 (XDA), baud 115200.
                Save uses /api/device/config-merge (PUT or POST).
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={refreshSerialPorts}>
              <span data-lang="pl">Odśwież listę portów</span>
              <span data-lang="en">Refresh port list</span>
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <span data-lang="pl">Zapisz połączenie</span>
              <span data-lang="en">Save connection</span>
            </Button>
          </div>
        </header>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium">
              <span data-lang="pl">Szeregowy / backend</span>
              <span data-lang="en">Serial / backend</span>
            </legend>
            <div className="grid gap-2">
              <Label htmlFor="conn-rotation-backend">Motion backend</Label>
              <select
                id="conn-rotation-backend"
                value={config.serial.rotation_backend ?? "arduino_step_dir"}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    serial: {
                      ...prev.serial,
                      rotation_backend:
                        (e.target.value as "pico" | "arduino_grbl" | "arduino_step_dir") ??
                        "arduino_step_dir",
                    },
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="arduino_step_dir">Arduino (CW/CCW text protocol)</option>
                <option value="arduino_grbl">Arduino / GRBL (CNC shield)</option>
                <option value="pico">Pico (JSON protocol)</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="conn-pico-port">
                {config.serial.rotation_backend !== "pico" ? (
                  <>
                    <span data-lang="pl">Port USB obrotu (Arduino)</span>
                    <span data-lang="en">Rotation USB (Arduino)</span>
                  </>
                ) : (
                  <>
                    <span data-lang="pl">Port kontrolera (Pico)</span>
                    <span data-lang="en">Controller port (Pico)</span>
                  </>
                )}
              </Label>
              <select
                id="conn-pico-port"
                value={config.serial.pico_port ?? ""}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    serial: { ...prev.serial, pico_port: e.target.value || null },
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">— Select port —</option>
                {serialPorts.map((p) => (
                  <option key={p.port} value={p.port}>
                    {p.port} {p.description ? `(${p.description})` : ""}
                  </option>
                ))}
                {config.serial.pico_port &&
                  !serialPorts.some((p) => p.port === config.serial.pico_port) && (
                    <option value={config.serial.pico_port}>{config.serial.pico_port}</option>
                  )}
              </select>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  <span data-lang="pl">Lub wpisz ręcznie (np. COM20):</span>
                  <span data-lang="en">Or type manually (e.g. COM20):</span>
                </span>
                <Input
                  placeholder="COM20"
                  value={
                    config.serial.pico_port && serialPorts.some((p) => p.port === config.serial.pico_port)
                      ? ""
                      : (config.serial.pico_port ?? "")
                  }
                  onChange={(e) => {
                    const v = e.target.value.trim() || null;
                    updateConfig((prev) => ({ ...prev, serial: { ...prev.serial, pico_port: v } }));
                  }}
                  className="text-sm"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="conn-pico-baud">
                {config.serial.rotation_backend !== "pico" ? (
                  <>
                    <span data-lang="pl">Baud obrotu (Arduino)</span>
                    <span data-lang="en">Rotation baud (Arduino)</span>
                  </>
                ) : (
                  <>
                    <span data-lang="pl">Baud kontrolera</span>
                    <span data-lang="en">Controller baud</span>
                  </>
                )}
              </Label>
              <Input
                id="conn-pico-baud"
                type="number"
                value={config.serial.pico_baud}
                onChange={(e) =>
                  updateNumber(e.target.value, (num) =>
                    updateConfig((prev) => ({ ...prev, serial: { ...prev.serial, pico_baud: num } }))
                  )
                }
              />
            </div>
            {config.serial.rotation_backend !== "pico" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="conn-linear-port">
                    <span data-lang="pl">Port USB liniowy (XDA / XLA-1)</span>
                    <span data-lang="en">Linear USB (XDA / XLA-1)</span>
                  </Label>
                  <select
                    id="conn-linear-port"
                    value={config.serial.linear_port ?? ""}
                    onChange={(e) =>
                      updateConfig((prev) => ({
                        ...prev,
                        serial: { ...prev.serial, linear_port: e.target.value || null },
                      }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">— Select port —</option>
                    {serialPorts.map((p) => (
                      <option key={p.port} value={p.port}>
                        {p.port} {p.description ? `(${p.description})` : ""}
                      </option>
                    ))}
                    {config.serial.linear_port &&
                      !serialPorts.some((p) => p.port === config.serial.linear_port) && (
                        <option value={config.serial.linear_port}>{config.serial.linear_port}</option>
                      )}
                  </select>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      <span data-lang="pl">Lub wpisz ręcznie (np. COM22):</span>
                      <span data-lang="en">Or type manually (e.g. COM22):</span>
                    </span>
                    <Input
                      placeholder="COM22"
                      value={
                        config.serial.linear_port &&
                        serialPorts.some((p) => p.port === config.serial.linear_port)
                          ? ""
                          : (config.serial.linear_port ?? "")
                      }
                      onChange={(e) => {
                        const v = e.target.value.trim() || null;
                        updateConfig((prev) => ({ ...prev, serial: { ...prev.serial, linear_port: v } }));
                      }}
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="conn-linear-baud">
                    <span data-lang="pl">Baud liniowy (XDA)</span>
                    <span data-lang="en">Linear baud (XDA)</span>
                  </Label>
                  <Input
                    id="conn-linear-baud"
                    type="number"
                    value={config.serial.linear_baud ?? DEFAULT_SERIAL_BAUD}
                    onChange={(e) =>
                      updateNumber(e.target.value, (num) =>
                        updateConfig((prev) => ({ ...prev, serial: { ...prev.serial, linear_baud: num } }))
                      )
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  <span data-lang="pl">
                    Arduino + XDA: dwa porty USB — CW/CCW (tekst) na obroty, protokół ASCII XD-OEM na oś liniową.
                  </span>
                  <span data-lang="en">
                    Arduino + XDA: two USB ports — CW/CCW text protocol for rotation, XD-OEM ASCII for linear axis.
                  </span>
                </p>
              </>
            )}
          </fieldset>
          <div className="rounded-md border border-dashed border-border/80 bg-muted/20 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              <span data-lang="pl">Wskazówki</span>
              <span data-lang="en">Hints</span>
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>
                <span data-lang="pl">
                  Uruchom API: w folderze LaserXe/backend uruchom start-api.ps1 (albo uvicorn stamtąd). Sprawdź
                  http://localhost:8000/health — musi być laserxe_device_config_merge: true.
                </span>
                <span data-lang="en">
                  Start the API: in LaserXe/backend run start-api.ps1 (or uvicorn from that folder). Open
                  http://localhost:8000/health — you must see laserxe_device_config_merge: true.
                </span>
              </li>
              <li>
                <span data-lang="pl">Tylko jedna aplikacja może trzymać dany COM otwarty (np. zamknij Serial Monitor).</span>
                <span data-lang="en">Only one app can hold a COM port open (e.g. close Arduino Serial Monitor).</span>
              </li>
            </ul>
          </div>
        </div>

        {error && (
          <div className="mt-4">
            <ApiErrorPanel title="Configuration or save error" message={error} />
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button
          variant="destructive"
          size="lg"
          onClick={() => sendCommand({ type: "emergency_stop" })}
          disabled={commandBusy}
          className="font-bold"
        >
          <span data-lang="pl">STOP AWARYJNY</span>
          <span data-lang="en">EMERGENCY STOP</span>
        </Button>
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            className={`px-3 py-1 text-sm ${uiMode === "simple" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
            onClick={() => {
              void activateSimpleMode();
            }}
          >
            <span data-lang="pl">Tryb prosty</span>
            <span data-lang="en">Simple mode</span>
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-sm ${uiMode === "advanced" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
            onClick={() => setUiMode("advanced")}
          >
            <span data-lang="pl">Tryb zaawansowany</span>
            <span data-lang="en">Advanced mode</span>
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              <span data-lang="pl">Status urządzenia</span>
              <span data-lang="en">Device status</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              <span data-lang="pl">Połączenie i pozycje osi w czasie rzeczywistym.</span>
              <span data-lang="en">Connection and axis positions in real time.</span>
              {!streamConnected && (
                <>
                  {" "}
                  <span data-lang="pl">Bez streamu status odświeża się co ~2 s.</span>
                  <span data-lang="en">Without the stream, status refreshes about every 2s.</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void refreshStatus()}>
              <span data-lang="pl">Odśwież status</span>
              <span data-lang="en">Refresh status</span>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void refreshXdaDiag()}>
              <span data-lang="pl">Odśwież log XDA</span>
              <span data-lang="en">Refresh XDA log</span>
            </Button>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                streamConnected ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"
              }`}
            >
              {streamConnected ? (
                <>
                  <span data-lang="pl">Stream aktywny</span>
                  <span data-lang="en">Stream active</span>
                </>
              ) : (
                <>
                  <span data-lang="pl">Brak streamu</span>
                  <span data-lang="en">No stream</span>
                </>
              )}
            </span>
          </div>
        </header>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-border/60 p-3">
            <p className="text-xs uppercase text-muted-foreground">Linear</p>
            <p className="text-lg font-semibold">{formatValue(status?.linear_position_mm)} mm</p>
            <p className="text-xs text-muted-foreground">
              <span data-lang="pl">Ruch: </span>
              <span data-lang="en">Moving: </span>
              {status?.linear_moving ? "yes" : "no"}
            </p>
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <p className="text-xs uppercase text-muted-foreground">Rotation</p>
            <p className="text-lg font-semibold">{formatValue(status?.rotation_position_deg)}°</p>
            <p className="text-xs text-muted-foreground">
              <span data-lang="pl">Ruch: </span>
              <span data-lang="en">Moving: </span>
              {status?.rotation_moving ? "yes" : "no"}
            </p>
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <p className="text-xs uppercase text-muted-foreground">System</p>
            <p className="mb-1">
              <span className="inline-flex items-center rounded-full border border-border/60 bg-muted px-2 py-0.5 text-xs font-medium">
                <span data-lang="pl">Backend ruchu:</span>
                <span data-lang="en">Motion backend:</span>&nbsp;
                {config.serial.rotation_backend === "pico"
                  ? "Pico"
                  : config.serial.rotation_backend === "arduino_grbl"
                    ? "Arduino/GRBL"
                    : "Arduino (CW/CCW)"}
              </span>
            </p>
            <p className="text-sm">
              <span data-lang="pl">Połączenie: </span>
              <span data-lang="en">Connected: </span>
              {status?.connected ? "yes" : "no"}
            </p>
            {status?.sweep_program_running ? (
              <p className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-200">
                <span data-lang="pl">Program sweep na serwerze: działa (sprawdź błędy poniżej).</span>
                <span data-lang="en">Sweep program on server: running (check errors below).</span>
              </p>
            ) : null}
            {status?.firmware_version && (
              <p className="text-xs text-muted-foreground">
                FW: {status.firmware_version}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              <span data-lang="pl">Ostatnia aktualizacja: </span>
              <span data-lang="en">Last update: </span>
              {lastUpdateLabel}
            </p>
            {status?.last_error && (
              <div className="mt-2">
                <ApiErrorPanel
                  title="Controller / serial reported (live status)"
                  message={[
                    "This text comes from the rotation (GRBL) or linear (XDA) hardware path, not from the last HTTP request.",
                    "Check COM ports, baud rates, USB cable, and power to the drivers.",
                    "",
                    status.last_error,
                  ].join("\n")}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">
            <span data-lang="pl">Log komunikacji obrotu (Arduino)</span>
            <span data-lang="en">Rotation communication log (Arduino)</span>
          </h3>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void refreshRotationDiag()}>
              <span data-lang="pl">Odśwież</span>
              <span data-lang="en">Refresh</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRotationLog((v) => !v)}
            >
              {showRotationLog ? (
                <>
                  <span data-lang="pl">Ukryj</span>
                  <span data-lang="en">Hide</span>
                </>
              ) : (
                <>
                  <span data-lang="pl">Pokaż</span>
                  <span data-lang="en">Show</span>
                </>
              )}
            </Button>
          </div>
        </header>
        {showRotationLog && (
          <div className="mt-3">
            <p className="mb-2 text-sm text-muted-foreground">
              <span data-lang="pl">Widoczne ostatnie {Math.min(1000, rotationDiagLines.length)} z {rotationDiagLines.length} linii.</span>
              <span data-lang="en">Showing last {Math.min(1000, rotationDiagLines.length)} of {rotationDiagLines.length} lines.</span>
            </p>
            <pre className="max-h-[20rem] overflow-auto rounded-md bg-muted/40 p-3 text-sm leading-6">
              {(rotationDiagLines.length > 0
                ? rotationDiagLines.slice(-1000).join("\n")
                : "No rotation serial lines yet. Send a rotation command, then refresh.")
                .trim()}
            </pre>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">
            <span data-lang="pl">Log komunikacji XDA / XLA-1</span>
            <span data-lang="en">XDA / XLA-1 communication log</span>
          </h3>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void refreshXdaDiag()}>
              <span data-lang="pl">Odśwież</span>
              <span data-lang="en">Refresh</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowXdaLog((v) => !v)}
            >
              {showXdaLog ? (
                <>
                  <span data-lang="pl">Ukryj</span>
                  <span data-lang="en">Hide</span>
                </>
              ) : (
                <>
                  <span data-lang="pl">Pokaż</span>
                  <span data-lang="en">Show</span>
                </>
              )}
            </Button>
          </div>
        </header>
        {showXdaLog && (
          <div className="mt-3">
            {xdaToolsState && (
              <p className="mb-2 text-xs text-muted-foreground">
                mode: axis-prefix={String(xdaToolsState.axis_prefix_enabled)} | jog-open-loop=
                {String(xdaToolsState.jog_open_loop)}
              </p>
            )}
            <p className="mb-2 text-sm text-muted-foreground">
              <span data-lang="pl">Widoczne ostatnie {Math.min(1000, xdaDiagLines.length)} z {xdaDiagLines.length} linii.</span>
              <span data-lang="en">Showing last {Math.min(1000, xdaDiagLines.length)} of {xdaDiagLines.length} lines.</span>
            </p>
            <pre className="max-h-[32rem] overflow-auto rounded-md bg-muted/40 p-3 text-sm leading-6">
              {(xdaDiagLines.length > 0
                ? xdaDiagLines.slice(-1000).join("\n")
                : "No XDA serial lines yet. Send a linear command (jog/move), then refresh.")
                .trim()}
            </pre>
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4 lg:p-5">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">
              <span data-lang="pl">Xeryon XD-OEM - panel liniowy</span>
              <span data-lang="en">Xeryon XD-OEM - linear panel</span>
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowLinearControlPanel((v) => !v)}>
              {showLinearControlPanel ? (
                <>
                  <span data-lang="pl">Ukryj</span>
                  <span data-lang="en">Hide</span>
                </>
              ) : (
                <>
                  <span data-lang="pl">Pokaż</span>
                  <span data-lang="en">Show</span>
                </>
              )}
            </Button>
          </header>
          {showLinearControlPanel && (
          <div className="mt-3 space-y-3">
            <div className="rounded-md border border-border/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connection</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className="grid gap-1">
                  <Label htmlFor="xda-port" className="text-xs">Port</Label>
                  <Input id="xda-port" className="h-8" value={xdaPort} onChange={(e) => setXdaPort(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="xda-baud" className="text-xs">Baud</Label>
                  <Input
                    id="xda-baud"
                    className="h-8"
                    type="number"
                    value={xdaBaud}
                    onChange={(e) => updateInt(e.target.value, setXdaBaud)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="xda-axis" className="text-xs">Axis</Label>
                  <Input
                    id="xda-axis"
                    className="h-8"
                    value={xdaAxis}
                    maxLength={1}
                    onChange={(e) => setXdaAxis(e.target.value.toUpperCase().slice(0, 1))}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="xda-counts" className="text-xs">Counts/mm</Label>
                  <Input
                    id="xda-counts"
                    className="h-8"
                    type="number"
                    min={1}
                    value={xdaCountsPerMm}
                    onChange={(e) => updateNumber(e.target.value, setXdaCountsPerMm)}
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={xdaInvertDirection}
                      onChange={(e) => setXdaInvertDirection(e.target.checked)}
                    />
                    Invert direction
                  </label>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="h-8 min-w-[7.5rem] justify-center" onClick={() => void handleXdaConnect()} disabled={xdaPanelBusy}>
                  Connect
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 min-w-[7.5rem] justify-center" onClick={() => void handleXdaDisconnect()} disabled={xdaPanelBusy}>
                  Disconnect
                </Button>
                <label className="ml-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(xdaToolsState?.axis_prefix_enabled)}
                    onChange={(e) => void handleSetAxisPrefix(e.target.checked)}
                    disabled={xdaPanelBusy || !xdaToolsState}
                  />
                  Use axis prefix (`X:...`)
                </label>
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motion</p>
              <div className="mb-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="h-8 min-w-[7.5rem] justify-center" onClick={() => void handleXdaEnableDrive(1)} disabled={xdaPanelBusy}>
                  Enable
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 min-w-[7.5rem] justify-center" onClick={() => void handleXdaRunIndex()} disabled={xdaPanelBusy}>
                  Find Index
                </Button>
                <Button type="button" size="sm" variant="destructive" className="h-8 min-w-[7.5rem] justify-center" onClick={() => void handleXdaStop()} disabled={xdaPanelBusy}>
                  Stop
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 min-w-[7.5rem] justify-center" onClick={() => void handleXdaReset()} disabled={xdaPanelBusy}>
                  Reset
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
                <Input
                  className="h-8"
                  type="number"
                  value={xdaSpeedUnits}
                  onChange={(e) => updateInt(e.target.value, setXdaSpeedUnits)}
                  placeholder="Speed (um/s)"
                />
                <Button type="button" size="sm" variant="outline" className="h-8 w-full justify-center" onClick={() => void handleXdaSetSpeed()} disabled={xdaPanelBusy}>
                  Set Speed
                </Button>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
                <Input
                  className="h-8"
                  type="number"
                  step="0.01"
                  value={xdaRelativeMm}
                  onChange={(e) => updateNumber(e.target.value, setXdaRelativeMm)}
                  placeholder="Relative mm"
                />
                <Button type="button" size="sm" variant="outline" className="h-8 w-full justify-center" onClick={() => void handleXdaMoveMm()} disabled={xdaPanelBusy}>
                  Move mm
                </Button>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
                <Input
                  className="h-8"
                  type="number"
                  value={xdaRelativeCounts}
                  onChange={(e) => updateInt(e.target.value, setXdaRelativeCounts)}
                  placeholder="Relative counts"
                />
                <Button type="button" size="sm" variant="outline" className="h-8 w-full justify-center" onClick={() => void handleXdaMoveCounts()} disabled={xdaPanelBusy}>
                  Move counts
                </Button>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
                <Input
                  className="h-8"
                  type="number"
                  step="0.01"
                  value={xdaAbsoluteMm}
                  onChange={(e) => updateNumber(e.target.value, setXdaAbsoluteMm)}
                  placeholder="Absolute mm"
                />
                <Button type="button" size="sm" variant="outline" className="h-8 w-full justify-center" onClick={() => void handleXdaGotoMm()} disabled={xdaPanelBusy}>
                  Go to mm
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feedback / Queries</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  className="h-8"
                  type="number"
                  value={xdaInfoMode}
                  min={0}
                  max={7}
                  onChange={(e) => updateInt(e.target.value, setXdaInfoMode)}
                  placeholder="INFO mode"
                />
                <Button type="button" size="sm" variant="outline" className="h-8 min-w-[7.5rem] justify-center" onClick={() => void handleXdaSetInfo()} disabled={xdaPanelBusy}>
                  Set INFO
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 min-w-[7.5rem] justify-center" onClick={() => void handleXdaInfoZero()} disabled={xdaPanelBusy}>
                  INFO=0
                </Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Button type="button" size="sm" variant="outline" className="h-8 min-w-[7.5rem] justify-center" onClick={() => void handleXdaReadEpos()} disabled={xdaPanelBusy}>
                  Read EPOS
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 min-w-[7.5rem] justify-center" onClick={() => void handleXdaReadStat()} disabled={xdaPanelBusy}>
                  Read STAT
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 min-w-[7.5rem] justify-center" onClick={() => void handleXdaReadFreq()} disabled={xdaPanelBusy}>
                  Read FREQ
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raw Command</p>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
                <Input className="h-8" value={xdaRawCommand} onChange={(e) => setXdaRawCommand(e.target.value)} />
                <Button type="button" size="sm" variant="outline" className="h-8 w-full justify-center" onClick={() => void handleXdaSendRaw()} disabled={xdaPanelBusy}>
                  Send Raw
                </Button>
              </div>
            </div>
          </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">
              <span data-lang="pl">Sterowanie obrotem</span>
              <span data-lang="en">Rotation control</span>
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRotationControlPanel((v) => !v)}
            >
              {showRotationControlPanel ? (
                <>
                  <span data-lang="pl">Ukryj</span>
                  <span data-lang="en">Hide</span>
                </>
              ) : (
                <>
                  <span data-lang="pl">Pokaż</span>
                  <span data-lang="en">Show</span>
                </>
              )}
            </Button>
          </header>
          {showRotationControlPanel && (
          <div className="mt-4 grid gap-4">
            <div className="rounded-md border border-border/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Home / reference
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => sendCommand({ type: "set_home", axis: "rotation" })}
                  disabled={commandBusy}
                >
                  <span data-lang="pl">Ustaw HOME (tu = 0°)</span>
                  <span data-lang="en">Set HOME (here = 0°)</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => sendCommand({ type: "home", axis: "rotation" })}
                  disabled={commandBusy}
                >
                  <span data-lang="pl">Jedź do HOME</span>
                  <span data-lang="en">Go HOME</span>
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span data-lang="pl">Profil ruchu (Arduino CW/CCW)</span>
                <span data-lang="en">Motion profile (Arduino CW/CCW)</span>
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                <span data-lang="pl">
                  Dla firmware CW/CCW prędkość wynika z opóźnienia impulsów (µs). Mniejsze µs = szybciej. RAMP steruje
                  narastaniem/hamowaniem (w mikro-krokach). To ustawienia runtime „na sterowniku” (nie zapisują się do
                  device_config.json), niezależne od programu sweep.
                </span>
                <span data-lang="en">
                  With CW/CCW firmware, speed is set by step pulse delay (µs). Smaller µs = faster. RAMP controls accel and
                  decel (in microsteps). These are runtime controller settings (not saved to device_config.json), independent
                  of the sweep program.
                </span>
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRotationMicrosteps(8);
                    setRotationStartUs(1400);
                    setRotationMinUs(750);
                    setRotationRampSteps(1000);
                  }}
                  disabled={commandBusy || config.serial.rotation_backend !== "arduino_step_dir"}
                >
                  <span data-lang="pl">1) “w miarę szybko”</span>
                  <span data-lang="en">1) sort of fast</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRotationMicrosteps(8);
                    setRotationStartUs(1100);
                    setRotationMinUs(600);
                    setRotationRampSteps(1400);
                  }}
                  disabled={commandBusy || config.serial.rotation_backend !== "arduino_step_dir"}
                >
                  <span data-lang="pl">2) szybko</span>
                  <span data-lang="en">2) fast</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRotationMicrosteps(8);
                    setRotationStartUs(850);
                    setRotationMinUs(450);
                    setRotationRampSteps(2000);
                  }}
                  disabled={commandBusy || config.serial.rotation_backend !== "arduino_step_dir"}
                >
                  <span data-lang="pl">3) bardzo szybko</span>
                  <span data-lang="en">3) very fast</span>
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-1">
                  <Label htmlFor="rot-ustep">
                    <span data-lang="pl">USTEP (tylko skala °)</span>
                    <span data-lang="en">USTEP (degrees scaling only)</span>
                  </Label>
                  <Input
                    id="rot-ustep"
                    type="number"
                    step="1"
                    min={1}
                    value={rotationMicrosteps}
                    onChange={(e) => updateNumber(e.target.value, setRotationMicrosteps)}
                    disabled={commandBusy || config.serial.rotation_backend !== "arduino_step_dir"}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="rot-start-us">
                    <span data-lang="pl">START (µs)</span>
                    <span data-lang="en">START (µs)</span>
                  </Label>
                  <Input
                    id="rot-start-us"
                    type="number"
                    step="10"
                    min={50}
                    value={rotationStartUs}
                    onChange={(e) => updateNumber(e.target.value, setRotationStartUs)}
                    disabled={commandBusy || config.serial.rotation_backend !== "arduino_step_dir"}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="rot-min-us">
                    <span data-lang="pl">MIN (µs) — max speed</span>
                    <span data-lang="en">MIN (µs) — max speed</span>
                  </Label>
                  <Input
                    id="rot-min-us"
                    type="number"
                    step="10"
                    min={20}
                    value={rotationMinUs}
                    onChange={(e) => updateNumber(e.target.value, setRotationMinUs)}
                    disabled={commandBusy || config.serial.rotation_backend !== "arduino_step_dir"}
                  />
                </div>
                <div className="grid gap-1 md:col-span-3">
                  <Label htmlFor="rot-ramp-steps">
                    <span data-lang="pl">RAMP (steps)</span>
                    <span data-lang="en">RAMP (steps)</span>
                  </Label>
                  <Input
                    id="rot-ramp-steps"
                    type="number"
                    step="50"
                    min={0}
                    value={rotationRampSteps}
                    onChange={(e) => updateNumber(e.target.value, setRotationRampSteps)}
                    disabled={commandBusy || config.serial.rotation_backend !== "arduino_step_dir"}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void applyRotationProfile()}
                  disabled={commandBusy || config.serial.rotation_backend !== "arduino_step_dir"}
                >
                  <span data-lang="pl">Zastosuj profil</span>
                  <span data-lang="en">Apply profile</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void runRotationToolAction(async () => {
                      await rotationSendRaw("CFG?");
                    })
                  }
                  disabled={commandBusy || config.serial.rotation_backend !== "arduino_step_dir"}
                >
                  <span data-lang="pl">Pokaż CFG w logu</span>
                  <span data-lang="en">Show CFG in log</span>
                </Button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="grid gap-1">
                  <Label htmlFor="rot-idle-disable-s">
                    <span data-lang="pl">Auto EN=0 po bezruchu (s)</span>
                    <span data-lang="en">Auto EN=0 after idle (s)</span>
                  </Label>
                  <Input
                    id="rot-idle-disable-s"
                    type="number"
                    step="1"
                    min={0}
                    value={rotationIdleDisableS}
                    onChange={(e) => updateNumber(e.target.value, setRotationIdleDisableS)}
                    disabled={commandBusy || config.serial.rotation_backend !== "arduino_step_dir"}
                  />
                  <p className="text-xs text-muted-foreground">
                    <span data-lang="pl">0 = wyłącz auto power-down. Domyślnie 20 s.</span>
                    <span data-lang="en">0 = disable auto power-down. Default is 20 s.</span>
                  </p>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void applyRotationIdleTimeout()}
                    disabled={commandBusy || config.serial.rotation_backend !== "arduino_step_dir"}
                  >
                    <span data-lang="pl">Zastosuj timeout</span>
                    <span data-lang="en">Apply timeout</span>
                  </Button>
                </div>
              </div>
              {config.serial.rotation_backend !== "arduino_step_dir" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span data-lang="pl">Dostępne tylko dla backendu `arduino_step_dir` (CW/CCW).</span>
                  <span data-lang="en">Available only for `arduino_step_dir` (CW/CCW).</span>
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span data-lang="pl">
                    Uwaga: “bardzo szybko” może gubić kroki zależnie od obciążenia i prądu TMC2100. Producent Twojego silnika
                    podaje “Max Optimal Speed” = 1 RPS — traktuj to jako wskazówkę, a nie twardy limit.
                  </span>
                  <span data-lang="en">
                    Note: “very fast” may skip steps depending on load and TMC2100 current. Your motor’s datasheet lists
                    “Max Optimal Speed” = 1 RPS — treat this as guidance, not a hard limit.
                  </span>
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rotation-target">Target (deg)</Label>
              <Input
                id="rotation-target"
                type="number"
                step="0.1"
                value={rotationTarget}
                onChange={(e) => updateNumber(e.target.value, setRotationTarget)}
              />
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Relative move (deg)
              </p>
              <div className="mb-2 flex flex-wrap gap-2">
                {ROTATION_PRESET_VALUES.map((v) => (
                  <React.Fragment key={`rel-${v}`}>
                    <Button
                      variant="outline"
                      onClick={() =>
                        sendCommand({ type: "move_rel", axis: "rotation", value: -v, unit: "deg" })
                      }
                      disabled={commandBusy}
                    >
                      -{v}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        sendCommand({ type: "move_rel", axis: "rotation", value: v, unit: "deg" })
                      }
                      disabled={commandBusy}
                    >
                      +{v}
                    </Button>
                  </React.Fragment>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Input
                  id="rotation-step-custom"
                  type="number"
                  step="0.1"
                  value={rotationStep}
                  onChange={(e) => updateNumber(e.target.value, setRotationStep)}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    sendCommand({ type: "move_rel", axis: "rotation", value: -Math.abs(rotationStep), unit: "deg" })
                  }
                  disabled={commandBusy}
                >
                  custom -
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    sendCommand({ type: "move_rel", axis: "rotation", value: Math.abs(rotationStep), unit: "deg" })
                  }
                  disabled={commandBusy}
                >
                  custom +
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Absolute move (deg)
              </p>
              <div className="mb-2 flex flex-wrap gap-2">
                {ROTATION_PRESET_VALUES.map((v) => (
                  <React.Fragment key={`abs-${v}`}>
                    <Button
                      variant="outline"
                      onClick={() =>
                        sendCommand({ type: "move_abs", axis: "rotation", value: -v, unit: "deg" })
                      }
                      disabled={commandBusy}
                    >
                      go -{v}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        sendCommand({ type: "move_abs", axis: "rotation", value: v, unit: "deg" })
                      }
                      disabled={commandBusy}
                    >
                      go +{v}
                    </Button>
                  </React.Fragment>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Input
                  id="rotation-target-custom"
                  type="number"
                  step="0.1"
                  value={rotationTarget}
                  onChange={(e) => updateNumber(e.target.value, setRotationTarget)}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    sendCommand({ type: "move_abs", axis: "rotation", value: -Math.abs(rotationTarget), unit: "deg" })
                  }
                  disabled={commandBusy}
                >
                  custom -
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    sendCommand({ type: "move_abs", axis: "rotation", value: Math.abs(rotationTarget), unit: "deg" })
                  }
                  disabled={commandBusy}
                >
                  custom +
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  sendCommand({ type: "move_abs", axis: "rotation", value: rotationTarget, unit: "deg" })
                }
                disabled={commandBusy}
              >
                <span data-lang="pl">Jedź do</span>
                <span data-lang="en">Move abs</span>
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  sendCommand({ type: "move_rel", axis: "rotation", value: rotationStep, unit: "deg" })
                }
                disabled={commandBusy}
              >
                <span data-lang="pl">Krok</span>
                <span data-lang="en">Move rel</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => sendCommand({ type: "home", axis: "rotation" })}
                disabled={commandBusy}
              >
                <span data-lang="pl">Go Home</span>
                <span data-lang="en">Go Home</span>
              </Button>
              <Button
                variant="destructive"
                onClick={() => sendCommand({ type: "stop", axis: "rotation" })}
                disabled={commandBusy}
                className={uiMode === "simple" ? "hidden" : ""}
              >
                <span data-lang="pl">Stop</span>
                <span data-lang="en">Stop</span>
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  sendCommand({
                    type: "move_rel",
                    axis: "rotation",
                    value: -ROTATION_NUDGE_DEG,
                    unit: "deg",
                  })
                }
                disabled={commandBusy}
              >
                −{ROTATION_NUDGE_DEG} deg
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  sendCommand({
                    type: "move_rel",
                    axis: "rotation",
                    value: ROTATION_NUDGE_DEG,
                    unit: "deg",
                  })
                }
                disabled={commandBusy}
              >
                +{ROTATION_NUDGE_DEG} deg
              </Button>
            </div>
          </div>
          )}
        </div>
      </section>

      {uiMode === "simple" && (
      <section className="rounded-lg border border-border bg-card p-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">
            <span data-lang="pl">Program skanowania (prosty)</span>
            <span data-lang="en">Sweep program (simple)</span>
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSweepProgram((v) => !v)}
          >
            {showSweepProgram ? (
              <>
                <span data-lang="pl">Ukryj</span>
                <span data-lang="en">Hide</span>
              </>
            ) : (
              <>
                <span data-lang="pl">Pokaż</span>
                <span data-lang="en">Show</span>
              </>
            )}
          </Button>
        </header>
        {showSweepProgram && (
        <>
        <p className="mt-1 text-xs text-muted-foreground">
          <span data-lang="pl">
            Serwer: HOME liniowy i obrotowy, dojazd do pierwszego punktu, cała sekwencja, na końcu HOME obu osi. Oś X na
            przemian min↔max. Bez „pełnego zakresu”: N przejść liniowych, po każdym obrót o |R|. Z pełnym zakresem: jeden
            przebieg kąta w ceil(zakres/|R|) przejściach (N wyłączone). Na każdym punkcie: obrót, potem X, postój Z.
          </span>
          <span data-lang="en">
            Server: HOME both axes, approach first waypoint, run pattern, HOME again. Linear alternates min↔max each leg.
            Without full-span: N linear sweeps, rotating |R| after each sweep. With full-span: one angular pass using
            ceil(span/|R|) legs (Repeats N disabled). Each waypoint: rotate, then linear X, dwell Z.
          </span>
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="grid gap-1">
            <Label htmlFor="sweep-x-min">X min (mm)</Label>
            <Input id="sweep-x-min" type="number" step="0.01" value={sweepXMin} onChange={(e) => updateNumber(e.target.value, setSweepXMin)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sweep-x-max">X max (mm)</Label>
            <Input id="sweep-x-max" type="number" step="0.01" value={sweepXMax} onChange={(e) => updateNumber(e.target.value, setSweepXMax)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sweep-step">Stop spacing Y (mm)</Label>
            <Input id="sweep-step" type="number" step="0.01" min={0.01} value={sweepStepY} onChange={(e) => updateNumber(e.target.value, setSweepStepY)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sweep-dwell">Dwell Z (ms)</Label>
            <Input id="sweep-dwell" type="number" step="10" min={0} value={sweepDwellMs} onChange={(e) => updateInt(e.target.value, setSweepDwellMs)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sweep-rotate">
              <span data-lang="pl">Krok kąta R (°) — monotonicznie w zakresie</span>
              <span data-lang="en">Rotate step R (deg) — monotonic in range</span>
            </Label>
            <Input id="sweep-rotate" type="number" step="0.1" value={sweepRotateDeg} onChange={(e) => updateNumber(e.target.value, setSweepRotateDeg)} />
            <p className="text-xs text-muted-foreground">
              <span data-lang="pl">
                Przy wyłączonym pełnym zakresie: po każdym pełnym przebiegu X następuje obrót o |R| (kierunek jak poniżej),
                N razy. Przy włączonym: R tylko ustala liczbę przejść na cały zakres.
              </span>
              <span data-lang="en">
                With full-span off: after each full X sweep, rotate by |R| (direction below), repeated N times. With full-span
                on, R only sets how many legs cover the whole travel range.
              </span>
            </p>
          </div>
          <div className="grid gap-2 md:col-span-3">
              <span className="text-xs font-medium text-muted-foreground">
              <span data-lang="pl">Kierunek kroku R (start przy limicie)</span>
              <span data-lang="en">Step-R direction (start at limit)</span>
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={sweepRotationFirstToward === "negative_limit" ? "default" : "outline"}
                onClick={() => setSweepRotationFirstToward("negative_limit")}
              >
                <span data-lang="pl">Od min (−) do max (+)</span>
                <span data-lang="en">Min limit → max (+)</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={sweepRotationFirstToward === "positive_limit" ? "default" : "outline"}
                onClick={() => setSweepRotationFirstToward("positive_limit")}
              >
                <span data-lang="pl">Od max (+) do min (−)</span>
                <span data-lang="en">Max limit → min (−)</span>
              </Button>
            </div>
          </div>
          <div className="flex items-start gap-2 md:col-span-3">
            <input
              type="checkbox"
              id="sweep-rotation-full-travel"
              className="mt-1 h-4 w-4 shrink-0 rounded border border-input"
              checked={sweepRotationCoverFullTravel}
              onChange={(e) => setSweepRotationCoverFullTravel(e.target.checked)}
            />
            <Label htmlFor="sweep-rotation-full-travel" className="cursor-pointer font-normal leading-snug">
              <span data-lang="pl" className="block">
                Pełny zakres kąta: liczba przejść = ceil((max°−min°) / |R|). Wyłącza pole „Repeats N”.
              </span>
              <span data-lang="en" className="block">
                Full rotation span: leg count = ceil((max°−min°) / |R|). Disables Repeats N.
              </span>
            </Label>
          </div>
          <div className="grid gap-1">
            <Label
              htmlFor="sweep-repeats"
              className={sweepRotationCoverFullTravel ? "text-muted-foreground" : undefined}
            >
              <span data-lang="pl">Repeats N (tylko bez pełnego zakresu)</span>
              <span data-lang="en">Repeats N (full-span off only)</span>
            </Label>
            <Input
              id="sweep-repeats"
              type="number"
              step="1"
              min={1}
              value={sweepRepeats}
              onChange={(e) => updateInt(e.target.value, setSweepRepeats)}
              disabled={sweepRotationCoverFullTravel}
              className={sweepRotationCoverFullTravel ? "opacity-60" : undefined}
            />
            {sweepRotationCoverFullTravel ? (
              <p className="text-xs text-muted-foreground">
                <span data-lang="pl">Liczba przejść wynika z pełnego zakresu i R.</span>
                <span data-lang="en">Leg count is set by full span and R.</span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => void runSweepProgram()}
            disabled={
              commandBusy ||
              sweepPortsMissing
            }
          >
            <span data-lang="pl">Uruchom program</span>
            <span data-lang="en">Run program</span>
          </Button>
          <Button variant="outline" onClick={() => sendCommand({ type: "pattern_cancel" })} disabled={commandBusy}>
            <span data-lang="pl">Stop programu</span>
            <span data-lang="en">Stop program</span>
          </Button>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-border/60 p-3">
            <h4 className="text-sm font-medium">
              <span data-lang="pl">Podgląd trajektorii</span>
              <span data-lang="en">Trajectory preview</span>
            </h4>
            <div className="mt-2 inline-flex overflow-hidden rounded border border-border">
              <button
                type="button"
                className={`px-2 py-1 text-xs ${sweepPlotMode === "polar_xy" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
                onClick={() => setSweepPlotMode("polar_xy")}
              >
                <span data-lang="pl">XY z promień+kąt</span>
                <span data-lang="en">XY from radius+angle</span>
              </button>
              <button
                type="button"
                className={`px-2 py-1 text-xs ${sweepPlotMode === "command_xy" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
                onClick={() => setSweepPlotMode("command_xy")}
              >
                <span data-lang="pl">Przestrzeń komend</span>
                <span data-lang="en">Command space</span>
              </button>
            </div>
            <div className="mt-2">
              <SweepXYPreview
                waypoints={sweepPreviewWaypoints}
                activeIndex={sweepSimIndex}
                mode={sweepPlotMode}
                width={500}
                height={500}
              />
            </div>
            {sweepPreviewStats && (
              <p className="mt-2 text-xs text-muted-foreground">
                <span data-lang="pl">
                  Punkty: {sweepPreviewStats.points}, łączny postój: {sweepPreviewStats.totalDwellMs} ms (~
                  {sweepPreviewStats.estSeconds.toFixed(1)} s)
                </span>
                <span data-lang="en">
                  Waypoints: {sweepPreviewStats.points}, total dwell: {sweepPreviewStats.totalDwellMs} ms (~
                  {sweepPreviewStats.estSeconds.toFixed(1)} s)
                </span>
              </p>
            )}
            {sweepPreviewDims && (
              <p className="mt-1 text-xs text-muted-foreground">
                <span data-lang="pl">
                  Wymiary podglądu: X [{sweepPreviewDims.xMin.toFixed(2)}, {sweepPreviewDims.xMax.toFixed(2)}] (Δ
                  {sweepPreviewDims.xSpan.toFixed(2)}), Y [{sweepPreviewDims.yMin.toFixed(2)},{" "}
                  {sweepPreviewDims.yMax.toFixed(2)}] (Δ {sweepPreviewDims.ySpan.toFixed(2)})
                </span>
                <span data-lang="en">
                  Preview dimensions: X [{sweepPreviewDims.xMin.toFixed(2)}, {sweepPreviewDims.xMax.toFixed(2)}] (Δ
                  {sweepPreviewDims.xSpan.toFixed(2)}), Y [{sweepPreviewDims.yMin.toFixed(2)},{" "}
                  {sweepPreviewDims.yMax.toFixed(2)}] (Δ {sweepPreviewDims.ySpan.toFixed(2)})
                </span>
              </p>
            )}
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <h4 className="text-sm font-medium">
              <span data-lang="pl">Symulacja sekwencji</span>
              <span data-lang="en">Sequence simulation</span>
            </h4>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSweepSimPlaying(true)}
                disabled={sweepPreviewWaypoints.length === 0}
              >
                <span data-lang="pl">Run</span>
                <span data-lang="en">Run</span>
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setSweepSimPlaying(false)}
                disabled={sweepPreviewWaypoints.length === 0}
              >
                <span data-lang="pl">Stop</span>
                <span data-lang="en">Stop</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSweepSimPlaying(false);
                  setSweepSimIndex(0);
                }}
                disabled={sweepPreviewWaypoints.length === 0}
              >
                <span data-lang="pl">Reset</span>
                <span data-lang="en">Reset</span>
              </Button>
            </div>
            <div className="mt-3 rounded bg-muted px-3 py-2 text-xs">
              {sweepPreviewWaypoints.length === 0 ? (
                <span data-lang="en">No preview points.</span>
              ) : (
                <>
                  <div>
                    <span data-lang="pl">Krok: </span>
                    <span data-lang="en">Step: </span>
                    {sweepSimIndex + 1}/{sweepPreviewWaypoints.length}
                  </div>
                  <div>
                    X: {sweepPreviewWaypoints[sweepSimIndex]?.linear_mm.toFixed(3)} mm | R:{" "}
                    {sweepPreviewWaypoints[sweepSimIndex]?.rotation_deg.toFixed(3)} deg | dwell:{" "}
                    {sweepPreviewWaypoints[sweepSimIndex]?.dwell_ms ?? 0} ms
                  </div>
                </>
              )}
            </div>
            <div className="mt-2 max-h-36 overflow-y-auto rounded border border-border/60">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-left">X (mm)</th>
                    <th className="px-2 py-1 text-left">R (deg)</th>
                    <th className="px-2 py-1 text-left">Dwell (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {sweepPreviewWaypoints.map((wp, i) => (
                    <tr key={i} className={i === sweepSimIndex ? "bg-primary/10" : ""}>
                      <td className="px-2 py-1">{i + 1}</td>
                      <td className="px-2 py-1">{wp.linear_mm.toFixed(3)}</td>
                      <td className="px-2 py-1">{wp.rotation_deg.toFixed(3)}</td>
                      <td className="px-2 py-1">{wp.dwell_ms ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </>
        )}
      </section>
      )}

      {uiMode === "advanced" && (
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-lg font-semibold">
          <span data-lang="pl">Presety pozycji</span>
          <span data-lang="en">Position presets</span>
        </h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button
              key={p.name}
              variant="outline"
              size="sm"
              onClick={() => {
                setXdaAbsoluteMm(p.linear_mm);
                setRotationTarget(p.rotation_deg);
                sendCommand({ type: "move_abs", axis: "linear", value: p.linear_mm, unit: "mm" });
                sendCommand({ type: "move_abs", axis: "rotation", value: p.rotation_deg, unit: "deg" });
              }}
              disabled={commandBusy}
            >
              {p.name}
            </Button>
          ))}
        </div>
      </section>
      )}

      {uiMode === "advanced" && (
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-lg font-semibold">
          <span data-lang="pl">Wzorce ruchu</span>
          <span data-lang="en">Motion patterns</span>
        </h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentWaypoints((prev) => [
                    ...prev,
                    {
                      linear_mm: prev[prev.length - 1]?.linear_mm ?? 0,
                      rotation_deg: prev[prev.length - 1]?.rotation_deg ?? 0,
                      dwell_ms: 0,
                    },
                  ])
                }
              >
                <span data-lang="pl">+ Punkt</span>
                <span data-lang="en">+ Point</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const lm = status?.linear_position_mm ?? 0;
                  const rd = status?.rotation_position_deg ?? 0;
                  setCurrentWaypoints((prev) => [...prev, { linear_mm: lm, rotation_deg: rd, dwell_ms: 0 }]);
                }}
              >
                <span data-lang="pl">+ Aktualna</span>
                <span data-lang="en">+ Current</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentWaypoints((prev) =>
                    prev.length > 1 ? prev.slice(0, -1) : prev
                  )
                }
              >
                <span data-lang="pl">− Punkt</span>
                <span data-lang="en">− Point</span>
              </Button>
              <Button
                onClick={() =>
                  sendCommand({ type: "pattern_start", pattern: currentWaypoints })
                }
                disabled={commandBusy || currentWaypoints.length === 0}
              >
                <span data-lang="pl">Uruchom</span>
                <span data-lang="en">Run</span>
              </Button>
              <Button
                variant="destructive"
                onClick={() => sendCommand({ type: "pattern_cancel" })}
                disabled={commandBusy}
              >
                <span data-lang="pl">Stop</span>
                <span data-lang="en">Stop</span>
              </Button>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {currentWaypoints.map((wp, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-6 text-muted-foreground">{i + 1}</span>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-20"
                    value={wp.linear_mm}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value);
                      if (!Number.isNaN(v))
                        setCurrentWaypoints((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, linear_mm: v } : p
                          )
                        );
                    }}
                  />
                  <span className="text-muted-foreground">mm</span>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 w-20"
                    value={wp.rotation_deg}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value);
                      if (!Number.isNaN(v))
                        setCurrentWaypoints((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, rotation_deg: v } : p
                          )
                        );
                    }}
                  />
                  <span className="text-muted-foreground">°</span>
                  <Input
                    type="number"
                    step="10"
                    className="h-8 w-16"
                    placeholder="dwell"
                    value={wp.dwell_ms ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number.parseInt(e.target.value, 10);
                      if (v === null || !Number.isNaN(v))
                        setCurrentWaypoints((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, dwell_ms: v ?? 0 } : p
                          )
                        );
                    }}
                  />
                  <span className="text-muted-foreground text-xs">ms</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Pattern name"
                value={patternSaveName}
                onChange={(e) => setPatternSaveName(e.target.value)}
                className="h-8 w-36"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSavePattern}
                disabled={saving || !patternSaveName.trim()}
              >
                <span data-lang="pl">Zapisz wzorzec</span>
                <span data-lang="en">Save pattern</span>
              </Button>
              <select
                className="h-8 w-36 rounded-md border border-input bg-transparent px-2 text-sm"
                value={patternLoadId}
                onChange={(e) => setPatternLoadId(e.target.value)}
              >
                <option value="">— Load —</option>
                {patterns.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadPattern}
                disabled={!patternLoadId}
              >
                <span data-lang="pl">Wczytaj</span>
                <span data-lang="en">Load</span>
              </Button>
            </div>
          </div>
          <div>
            <PatternPreview waypoints={currentWaypoints} width={280} height={160} />
          </div>
        </div>
      </section>
      )}

      {lastCommandAck && !commandError && (
        <p className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
          {lastCommandAck}
        </p>
      )}
      {commandError && (
        <ApiErrorPanel title="Device command or motion failed" message={commandError} className="mt-2" />
      )}

      {uiMode === "advanced" && (
      <section className="rounded-lg border border-border bg-card p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              <span data-lang="pl">Konfiguracja mechaniki</span>
              <span data-lang="en">Mechanism configuration</span>
            </h3>
            <p className="text-sm text-muted-foreground">
              <span data-lang="pl">Oś liniowa, obrót, kalibracja. Porty COM i backend są w panelu na górze strony.</span>
              <span data-lang="en">Linear axis, rotation, calibration. COM ports and backend are in the panel at the top.</span>
            </p>
          </div>
          <div className="flex gap-2">
            <CalibrationWizard
              config={config}
              status={status}
              commandBusy={commandBusy}
              onSendCommand={sendCommand}
              onApplyAndSave={handleApplyAndSaveCalibration}
            />
            <Button onClick={handleSave} disabled={saving}>
              <span data-lang="pl">Zapisz</span>
              <span data-lang="en">Save</span>
            </Button>
          </div>
        </header>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium">Linear (XLA-1)</legend>
            <div className="grid gap-2">
              <Label htmlFor="linear-min">Travel min (mm)</Label>
              <Input
                id="linear-min"
                type="number"
                step="0.01"
                value={config.linear.travel_min_mm}
                onChange={(e) =>
                  updateNumber(e.target.value, (num) =>
                    updateConfig((prev) => ({ ...prev, linear: { ...prev.linear, travel_min_mm: num } }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="linear-max">Travel max (mm)</Label>
              <Input
                id="linear-max"
                type="number"
                step="0.01"
                value={config.linear.travel_max_mm}
                onChange={(e) =>
                  updateNumber(e.target.value, (num) =>
                    updateConfig((prev) => ({ ...prev, linear: { ...prev.linear, travel_max_mm: num } }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="linear-encoder">Encoder resolution (nm)</Label>
              <Input
                id="linear-encoder"
                type="number"
                value={config.linear.encoder_resolution_nm}
                onChange={(e) =>
                  updateInt(e.target.value, (num) =>
                    updateConfig((prev) => ({
                      ...prev,
                      linear: { ...prev.linear, encoder_resolution_nm: num },
                    }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="linear-axis">XDA axis</Label>
              <Input
                id="linear-axis"
                value={config.linear.xda_axis}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, linear: { ...prev.linear, xda_axis: e.target.value } }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="linear-max-speed">Max speed (units/s)</Label>
              <Input
                id="linear-max-speed"
                type="number"
                placeholder="10000"
                value={config.linear.max_speed_units ?? ""}
                onChange={(e) =>
                  updateInt(e.target.value, (num) =>
                    updateConfig((prev) => ({
                      ...prev,
                      linear: { ...prev.linear, max_speed_units: num || null },
                    }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="linear-tolerance">In-position tolerance (units)</Label>
              <Input
                id="linear-tolerance"
                type="number"
                value={config.linear.in_position_tolerance_units ?? 50}
                onChange={(e) =>
                  updateInt(e.target.value, (num) =>
                    updateConfig((prev) => ({
                      ...prev,
                      linear: { ...prev.linear, in_position_tolerance_units: num ?? 50 },
                    }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="linear-timeout">Move timeout (ms)</Label>
              <Input
                id="linear-timeout"
                type="number"
                value={config.linear.move_timeout_ms ?? 5000}
                onChange={(e) =>
                  updateInt(e.target.value, (num) =>
                    updateConfig((prev) => ({
                      ...prev,
                      linear: { ...prev.linear, move_timeout_ms: num ?? 5000 },
                    }))
                  )
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Units per mm: {computed ? computed.linear_units_per_mm.toFixed(2) : "—"}
            </p>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium">Rotation (Stepper)</legend>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  updateConfig((prev) => ({
                    ...prev,
                    rotation: {
                      ...prev.rotation,
                      motor_steps_per_rev: 200,
                      microsteps: 8,
                      gear_ratio: 6.6,
                    },
                  }))
                }
              >
                <span data-lang="pl">Profil Arduino CW/CCW (200/8/6.6)</span>
                <span data-lang="en">Arduino CW/CCW profile (200/8/6.6)</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  updateConfig((prev) => ({
                    ...prev,
                    rotation: {
                      ...prev.rotation,
                      max_speed_steps_per_s: 800,
                      accel_steps_per_s2: 2000,
                    },
                  }))
                }
              >
                <span data-lang="pl">Łagodne</span>
                <span data-lang="en">Gentle</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  updateConfig((prev) => ({
                    ...prev,
                    rotation: {
                      ...prev.rotation,
                      max_speed_steps_per_s: 2000,
                      accel_steps_per_s2: 8000,
                    },
                  }))
                }
              >
                <span data-lang="pl">Normalne</span>
                <span data-lang="en">Normal</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  updateConfig((prev) => ({
                    ...prev,
                    rotation: {
                      ...prev.rotation,
                      max_speed_steps_per_s: 4000,
                      accel_steps_per_s2: 16000,
                    },
                  }))
                }
              >
                <span data-lang="pl">Szybkie</span>
                <span data-lang="en">Fast</span>
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rot-min">Travel min (deg)</Label>
              <Input
                id="rot-min"
                type="number"
                step="0.1"
                value={config.rotation.travel_min_deg}
                onChange={(e) =>
                  updateNumber(e.target.value, (num) =>
                    updateConfig((prev) => ({ ...prev, rotation: { ...prev.rotation, travel_min_deg: num } }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rot-max">Travel max (deg)</Label>
              <Input
                id="rot-max"
                type="number"
                step="0.1"
                value={config.rotation.travel_max_deg}
                onChange={(e) =>
                  updateNumber(e.target.value, (num) =>
                    updateConfig((prev) => ({ ...prev, rotation: { ...prev.rotation, travel_max_deg: num } }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rot-steps">Motor steps/rev</Label>
              <Input
                id="rot-steps"
                type="number"
                value={config.rotation.motor_steps_per_rev}
                onChange={(e) =>
                  updateInt(e.target.value, (num) =>
                    updateConfig((prev) => ({
                      ...prev,
                      rotation: { ...prev.rotation, motor_steps_per_rev: num },
                    }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rot-microsteps">Microsteps</Label>
              <Input
                id="rot-microsteps"
                type="number"
                value={config.rotation.microsteps}
                onChange={(e) =>
                  updateInt(e.target.value, (num) =>
                    updateConfig((prev) => ({ ...prev, rotation: { ...prev.rotation, microsteps: num } }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rot-gear">Gear ratio</Label>
              <Input
                id="rot-gear"
                type="number"
                step="0.01"
                value={config.rotation.gear_ratio}
                onChange={(e) =>
                  updateNumber(e.target.value, (num) =>
                    updateConfig((prev) => ({ ...prev, rotation: { ...prev.rotation, gear_ratio: num } }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rot-encoder">Encoder counts/rev</Label>
              <Input
                id="rot-encoder"
                type="number"
                value={config.rotation.encoder_cpr}
                onChange={(e) =>
                  updateInt(e.target.value, (num) =>
                    updateConfig((prev) => ({ ...prev, rotation: { ...prev.rotation, encoder_cpr: num } }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label
                htmlFor="rot-max-speed"
                title="Upper speed limit for the stepper ramp. Think of it like max RPM in Python control loops."
              >
                Max speed (steps/s)
              </Label>
              <Input
                id="rot-max-speed"
                type="number"
                value={config.rotation.max_speed_steps_per_s}
                onChange={(e) =>
                  updateNumber(e.target.value, (num) =>
                    updateConfig((prev) => ({
                      ...prev,
                      rotation: { ...prev.rotation, max_speed_steps_per_s: num },
                    }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label
                htmlFor="rot-accel"
                title="How fast speed ramps up/down. Similar to changing a loop delay gradually in Python."
              >
                Acceleration (steps/s²)
              </Label>
              <Input
                id="rot-accel"
                type="number"
                value={config.rotation.accel_steps_per_s2}
                onChange={(e) =>
                  updateNumber(e.target.value, (num) =>
                    updateConfig((prev) => ({
                      ...prev,
                      rotation: { ...prev.rotation, accel_steps_per_s2: num },
                    }))
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label
                htmlFor="rot-encoder-correction"
                title="When encoder position differs from stepper target by more than this (counts), controller correction is applied automatically. 0 = disabled."
              >
                Encoder correction threshold (counts)
              </Label>
              <Input
                id="rot-encoder-correction"
                type="number"
                min={0}
                value={config.rotation.encoder_correction_threshold ?? 0}
                onChange={(e) =>
                  updateInt(e.target.value, (num) =>
                    updateConfig((prev) => ({
                      ...prev,
                      rotation: {
                        ...prev.rotation,
                        encoder_correction_threshold: num ?? 0,
                      },
                    }))
                  )
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Steps/deg: {computed ? computed.rotation_steps_per_deg.toFixed(3) : "—"} · Encoder counts/deg:{" "}
              {computed ? computed.rotation_encoder_counts_per_deg.toFixed(3) : "—"}
            </p>
          </fieldset>
        </div>
      </section>
      )}
    </section>
  );
}

export default DeviceControlPage;
