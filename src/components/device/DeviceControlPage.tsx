import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getDeviceConfig,
  getPatterns,
  getDeviceStatus,
  getPresets,
  getSerialPorts,
  getDeviceStreamUrl,
  saveDeviceConfig,
  savePatterns,
  savePresets,
  sendDeviceCommand,
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
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  // Equal-scale axes keep geometry readable (no ellipse distortion).
  // In polar projection mode, anchor origin to true radius/angle origin (0,0).
  let xMin: number;
  let xMax: number;
  let yMin: number;
  let yMax: number;
  if (mode === "polar_xy") {
    const half = Math.max(
      0.5,
      Math.abs(minX),
      Math.abs(maxX),
      Math.abs(minY),
      Math.abs(maxY)
    );
    xMin = -half;
    xMax = half;
    yMin = -half;
    yMax = half;
  } else {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const halfX = Math.max(0.5, (maxX - minX) / 2);
    const halfY = Math.max(0.5, (maxY - minY) / 2);
    const half = Math.max(halfX, halfY);
    xMin = cx - half;
    xMax = cx + half;
    yMin = cy - half;
    yMax = cy + half;
  }

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
  const [streamConnected, setStreamConnected] = React.useState(false);
  const [linearTarget, setLinearTarget] = React.useState(0);
  const [linearStep, setLinearStep] = React.useState(0.5);
  const [rotationTarget, setRotationTarget] = React.useState(0);
  const [rotationStep, setRotationStep] = React.useState(5);
  const [sweepXMin, setSweepXMin] = React.useState(-5);
  const [sweepXMax, setSweepXMax] = React.useState(5);
  const [sweepStepY, setSweepStepY] = React.useState(1);
  const [sweepDwellMs, setSweepDwellMs] = React.useState(200);
  const [sweepRotateDeg, setSweepRotateDeg] = React.useState(5);
  const [sweepRepeats, setSweepRepeats] = React.useState(4);
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
        setConfig(data.config);
        setComputed(data.computed);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load device config.");
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

  const handleSave = React.useCallback(async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveDeviceConfig(config);
      setConfig(result.config);
      setComputed(result.computed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config.");
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleApplyAndSaveCalibration = React.useCallback(
    async (updatedConfig: DeviceConfigDto) => {
      setSaving(true);
      setError(null);
      try {
        setConfig(updatedConfig);
        const result = await saveDeviceConfig(updatedConfig);
        setConfig(result.config);
        setComputed(result.computed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save calibration.");
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const activateSimpleMode = React.useCallback(async () => {
    setUiMode("simple");
    if (!config) return;
    if (config.serial.rotation_backend === "arduino_grbl") return;
    const updated: DeviceConfigDto = {
      ...config,
      serial: { ...config.serial, rotation_backend: "arduino_grbl" },
    };
    setSaving(true);
    setError(null);
    try {
      setConfig(updated);
      const result = await saveDeviceConfig(updated);
      setConfig(result.config);
      setComputed(result.computed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch to simple mode backend.");
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
      setError(err instanceof Error ? err.message : "Failed to save pattern.");
    } finally {
      setSaving(false);
    }
  }, [patternSaveName, patterns, currentWaypoints]);

  const handleLoadPattern = React.useCallback(() => {
    const p = patterns.find((x) => x.name === patternLoadId);
    if (p) setCurrentWaypoints(p.waypoints);
  }, [patterns, patternLoadId]);

  const sendCommand = React.useCallback(async (command: DeviceCommandDto) => {
    setCommandError(null);
    setCommandBusy(true);
    try {
      await sendDeviceCommand(command);
    } catch (err) {
      setCommandError(err instanceof Error ? err.message : "Command failed.");
    } finally {
      setCommandBusy(false);
    }
  }, []);

  const updateConfig = React.useCallback((updater: (prev: DeviceConfigDto) => DeviceConfigDto) => {
    setConfig((prev) => (prev ? updater(prev) : prev));
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

  const jogStart = React.useCallback(
    (axis: "linear" | "rotation", direction: number) => {
      sendCommand({ type: "jog", axis, value: direction });
    },
    [sendCommand]
  );
  const jogStop = React.useCallback(
    (axis: "linear" | "rotation") => {
      sendCommand({ type: "jog_stop", axis });
    },
    [sendCommand]
  );

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

    const makeSweepStops = (from: number, to: number): number[] => {
      const dir = to >= from ? 1 : -1;
      const pts: number[] = [from];
      let x = from;
      while (true) {
        const next = x + dir * step;
        if ((dir > 0 && next >= to) || (dir < 0 && next <= to)) break;
        pts.push(next);
        x = next;
      }
      const last = pts[pts.length - 1];
      if (Math.abs(last - to) > 1e-9) pts.push(to);
      return pts;
    };

    let rotation = status?.rotation_position_deg ?? rotationTarget ?? 0;
    let forward = true;
    const waypoints: DeviceWaypointDto[] = [];

    for (let i = 0; i < repeats; i += 1) {
      const from = forward ? minX : maxX;
      const to = forward ? maxX : minX;
      const sweepPts = makeSweepStops(from, to);
      for (const x of sweepPts) {
        waypoints.push({ linear_mm: x, rotation_deg: rotation, dwell_ms: dwell });
      }
      rotation += sweepRotateDeg;
      waypoints.push({ linear_mm: to, rotation_deg: rotation, dwell_ms: 0 });
      forward = !forward;
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
    status?.rotation_position_deg,
    rotationTarget,
    sendCommand,
  ]);

  const sweepPreviewWaypoints = React.useMemo(() => {
    const minX = Math.min(sweepXMin, sweepXMax);
    const maxX = Math.max(sweepXMin, sweepXMax);
    const step = Math.abs(sweepStepY);
    const repeats = Math.max(1, Math.floor(sweepRepeats));
    const dwell = Math.max(0, Math.floor(sweepDwellMs));
    if (step <= 0) return [] as DeviceWaypointDto[];

    const makeSweepStops = (from: number, to: number): number[] => {
      const dir = to >= from ? 1 : -1;
      const pts: number[] = [from];
      let x = from;
      while (true) {
        const next = x + dir * step;
        if ((dir > 0 && next >= to) || (dir < 0 && next <= to)) break;
        pts.push(next);
        x = next;
      }
      const last = pts[pts.length - 1];
      if (Math.abs(last - to) > 1e-9) pts.push(to);
      return pts;
    };

    let rotation = status?.rotation_position_deg ?? rotationTarget ?? 0;
    let forward = true;
    const waypoints: DeviceWaypointDto[] = [];
    for (let i = 0; i < repeats; i += 1) {
      const from = forward ? minX : maxX;
      const to = forward ? maxX : minX;
      const sweepPts = makeSweepStops(from, to);
      for (const x of sweepPts) {
        waypoints.push({ linear_mm: x, rotation_deg: rotation, dwell_ms: dwell });
      }
      rotation += sweepRotateDeg;
      waypoints.push({ linear_mm: to, rotation_deg: rotation, dwell_ms: 0 });
      forward = !forward;
    }
    return waypoints;
  }, [
    sweepXMin,
    sweepXMax,
    sweepStepY,
    sweepDwellMs,
    sweepRotateDeg,
    sweepRepeats,
    status?.rotation_position_deg,
    rotationTarget,
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
  }, [sweepXMin, sweepXMax, sweepStepY, sweepDwellMs, sweepRotateDeg, sweepRepeats]);

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
      <section role="alert" className="space-y-2">
        <p className="text-destructive">{error}</p>
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
            </p>
          </div>
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
                {config.serial.rotation_backend === "arduino_grbl" ? "Arduino/GRBL" : "Pico"}
              </span>
            </p>
            <p className="text-sm">
              <span data-lang="pl">Połączenie: </span>
              <span data-lang="en">Connected: </span>
              {status?.connected ? "yes" : "no"}
            </p>
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
              <p className="text-xs text-destructive">{status.last_error}</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-lg font-semibold">
            <span data-lang="pl">Sterowanie liniowe</span>
            <span data-lang="en">Linear control</span>
          </h3>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="linear-target">Target (mm)</Label>
              <Input
                id="linear-target"
                type="number"
                step="0.01"
                value={linearTarget}
                onChange={(e) => updateNumber(e.target.value, setLinearTarget)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="linear-step">Step (mm)</Label>
              <Input
                id="linear-step"
                type="number"
                step="0.01"
                value={linearStep}
                onChange={(e) => updateNumber(e.target.value, setLinearStep)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  sendCommand({ type: "move_abs", axis: "linear", value: linearTarget, unit: "mm" })
                }
                disabled={commandBusy}
              >
                <span data-lang="pl">Jedź do</span>
                <span data-lang="en">Move abs</span>
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  sendCommand({ type: "move_rel", axis: "linear", value: linearStep, unit: "mm" })
                }
                disabled={commandBusy}
              >
                <span data-lang="pl">Krok</span>
                <span data-lang="en">Move rel</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => sendCommand({ type: "home", axis: "linear" })}
                disabled={commandBusy}
                className={uiMode === "simple" ? "hidden" : ""}
              >
                <span data-lang="pl">Home</span>
                <span data-lang="en">Home</span>
              </Button>
              <Button
                variant="destructive"
                onClick={() => sendCommand({ type: "stop", axis: "linear" })}
                disabled={commandBusy}
                className={uiMode === "simple" ? "hidden" : ""}
              >
                <span data-lang="pl">Stop</span>
                <span data-lang="en">Stop</span>
              </Button>
              <Button
                variant="outline"
                onMouseDown={() => jogStart("linear", -1)}
                onMouseUp={() => jogStop("linear")}
                onMouseLeave={() => jogStop("linear")}
              >
                − <span data-lang="pl">Jog</span>
                <span data-lang="en">Jog</span>
              </Button>
              <Button
                variant="outline"
                onMouseDown={() => jogStart("linear", 1)}
                onMouseUp={() => jogStop("linear")}
                onMouseLeave={() => jogStop("linear")}
              >
                + <span data-lang="pl">Jog</span>
                <span data-lang="en">Jog</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-lg font-semibold">
            <span data-lang="pl">Sterowanie obrotem</span>
            <span data-lang="en">Rotation control</span>
          </h3>
          <div className="mt-4 grid gap-4">
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
            <div className="grid gap-2">
              <Label htmlFor="rotation-step">Step (deg)</Label>
              <Input
                id="rotation-step"
                type="number"
                step="0.1"
                value={rotationStep}
                onChange={(e) => updateNumber(e.target.value, setRotationStep)}
              />
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
                <span data-lang="pl">Home</span>
                <span data-lang="en">Home</span>
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
                onMouseDown={() => jogStart("rotation", -1)}
                onMouseUp={() => jogStop("rotation")}
                onMouseLeave={() => jogStop("rotation")}
              >
                − <span data-lang="pl">Jog</span>
                <span data-lang="en">Jog</span>
              </Button>
              <Button
                variant="outline"
                onMouseDown={() => jogStart("rotation", 1)}
                onMouseUp={() => jogStop("rotation")}
                onMouseLeave={() => jogStop("rotation")}
              >
                + <span data-lang="pl">Jog</span>
                <span data-lang="en">Jog</span>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {uiMode === "simple" && (
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-lg font-semibold">
          <span data-lang="pl">Program skanowania (prosty)</span>
          <span data-lang="en">Sweep program (simple)</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          <span data-lang="pl">
            Sekwencja: sweep X min→max z postojami, obrót R, sweep max→min z postojami, obrót R; powtórz N razy.
          </span>
          <span data-lang="en">
            Sequence: sweep X min→max with dwell stops, rotate by R, sweep max→min with dwell stops, rotate by R; repeat N times.
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
            <Label htmlFor="sweep-rotate">Rotate R (deg)</Label>
            <Input id="sweep-rotate" type="number" step="0.1" value={sweepRotateDeg} onChange={(e) => updateNumber(e.target.value, setSweepRotateDeg)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sweep-repeats">Repeats N</Label>
            <Input id="sweep-repeats" type="number" step="1" min={1} value={sweepRepeats} onChange={(e) => updateInt(e.target.value, setSweepRepeats)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void runSweepProgram()} disabled={commandBusy}>
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
                setLinearTarget(p.linear_mm);
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

      {commandError && <p className="text-sm text-destructive">{commandError}</p>}

      {uiMode === "advanced" && (
      <section className="rounded-lg border border-border bg-card p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              <span data-lang="pl">Konfiguracja mechaniki</span>
              <span data-lang="en">Mechanism configuration</span>
            </h3>
            <p className="text-sm text-muted-foreground">
              <span data-lang="pl">Ustawienia osi i portu USB kontrolera.</span>
              <span data-lang="en">Axis settings and controller USB port.</span>
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

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium">Serial</legend>
            <div className="grid gap-2">
              <Label htmlFor="rotation-backend">Motion backend</Label>
              <select
                id="rotation-backend"
                value={config.serial.rotation_backend ?? "pico"}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    serial: {
                      ...prev.serial,
                      rotation_backend: (e.target.value as "pico" | "arduino_grbl") ?? "pico",
                    },
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="pico">Pico (JSON protocol)</option>
                <option value="arduino_grbl">Arduino / GRBL (CNC shield)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                <span data-lang="pl">Wybierz sterownik osi obrotu. Zmiana wymaga zapisania konfiguracji.</span>
                <span data-lang="en">Select rotation controller backend. Save config after changing.</span>
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pico-port">Controller port</Label>
              <select
                id="pico-port"
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
                  <span data-lang="pl">Lub wpisz ścieżkę ręcznie:</span>
                  <span data-lang="en">Or type path manually:</span>
                </span>
                <Input
                  placeholder="/dev/ttyACM0 or COM3"
                  value={
                    config.serial.pico_port && serialPorts.some((p) => p.port === config.serial.pico_port)
                      ? ""
                      : config.serial.pico_port ?? ""
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
              <Label htmlFor="pico-baud">Controller baud</Label>
              <Input
                id="pico-baud"
                type="number"
                value={config.serial.pico_baud}
                onChange={(e) =>
                  updateNumber(e.target.value, (num) =>
                    updateConfig((prev) => ({ ...prev, serial: { ...prev.serial, pico_baud: num } }))
                  )
                }
              />
            </div>
          </fieldset>

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
