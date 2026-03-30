/**
 * Device control API (Pi ↔ Pico / GRBL + XDA).
 */
import { apiFetch, getApiBase } from "@/lib/api";
import { DetailedApiError, fetchJsonOrThrow } from "@/lib/apiErrors";
import type {
  DeviceCommandDto,
  DeviceCommandResponseDto,
  DeviceConfigDto,
  DeviceConfigResponseDto,
  DevicePatternDto,
  DevicePositionPresetDto,
  DeviceSerialPortDto,
  DeviceStatusDto,
  DeviceRotationDiagDto,
  DeviceXdaDiagDto,
  DeviceXdaToolsStateDto,
} from "@/types";

function wsBaseFromHttp(base: string): string {
  if (base.startsWith("https://")) return base.replace("https://", "wss://");
  if (base.startsWith("http://")) return base.replace("http://", "ws://");
  return base;
}

export function getDeviceStreamUrl(): string {
  const base = getApiBase();
  return `${wsBaseFromHttp(base)}/api/device/stream`;
}

export async function getDeviceConfig(): Promise<DeviceConfigResponseDto> {
  return fetchJsonOrThrow<DeviceConfigResponseDto>("/api/device/config", undefined, {
    operation: "Load device configuration (mechanism, serial ports, axis limits)",
    path: "/api/device/config",
    method: "GET",
  });
}

// Never call PUT /api/device/config here — some environments still register a strict body model that rejects linear_*.
const SAVE_CONFIG_ATTEMPTS: { path: string; method: string }[] = [
  { path: "/api/device/config-merge", method: "PUT" },
  { path: "/api/device/config-merge", method: "POST" },
  { path: "/api/laserxe/device-config", method: "PUT" },
  { path: "/api/laserxe/device-config", method: "POST" },
  { path: "/api/device/save-device-config", method: "PUT" },
  { path: "/api/device/config", method: "POST" },
  { path: "/api/device/config-file", method: "PUT" },
];

function isRetryableSaveError(e: unknown): boolean {
  if (!(e instanceof DetailedApiError)) return false;
  if (e.status === 404 || e.status === 405) return true;
  // Stale FastAPI request validation: linear_* forbidden on serial (list detail, body → serial → …).
  if (e.status === 422) {
    const m = e.message;
    if (m.includes('Field "body → serial') || m.includes('"body","serial","linear_')) return true;
  }
  return false;
}

/** True if OpenAPI lists merge save; false if fetched OK but path missing; null if fetch failed. */
async function openapiListsConfigMerge(): Promise<boolean | null> {
  try {
    const res = await apiFetch("/openapi.json");
    if (!res.ok) return null;
    const text = await res.text();
    return text.includes("/api/device/config-merge");
  } catch {
    return null;
  }
}

/** True only for this repo's main.py (see backend/main.py /health). */
async function healthShowsLaserXeMerge(): Promise<boolean | null> {
  try {
    const res = await apiFetch("/health");
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return data.laserxe_device_config_merge === true;
  } catch {
    return null;
  }
}

export async function saveDeviceConfig(config: DeviceConfigDto): Promise<DeviceConfigResponseDto> {
  const op = "Save device configuration to backend/device_config.json";
  const body = JSON.stringify(config);
  const tried: string[] = [];
  let last: DetailedApiError | undefined;
  for (const { path, method } of SAVE_CONFIG_ATTEMPTS) {
    try {
      return await fetchJsonOrThrow<DeviceConfigResponseDto>(
        path,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body,
        },
        { operation: op, path, method }
      );
    } catch (e) {
      if (e instanceof DetailedApiError) {
        tried.push(`${method} ${path} → HTTP ${e.status}`);
        if (isRetryableSaveError(e)) {
          last = e;
          continue;
        }
      }
      throw e;
    }
  }
  const base = getApiBase();
  const openapiHint = await openapiListsConfigMerge();
  const healthMerge = await healthShowsLaserXeMerge();
  const lines = [
    op,
    "",
    `API base URL: ${base}`,
    "",
    "Every merge-save URL was tried; none succeeded. Log:",
    ...tried.map((t) => `  • ${t}`),
    "",
    healthMerge === false
      ? `GET ${base}/health responded but "laserxe_device_config_merge" is not true — another app is still on this URL (old LaserXe, Docker, or different main.py).`
      : healthMerge === true
        ? "GET /health shows laserxe_device_config_merge but save URLs 404 — extremely unusual; try hard-refresh and check for a reverse proxy rewriting /api."
        : `GET ${base}/health could not be read as JSON with laserxe_device_config_merge.`,
    "",
    openapiHint === false
      ? `OpenAPI at ${base}/openapi.json does NOT list /api/device/config-merge — not this codebase on that port.`
      : openapiHint === true
        ? "OpenAPI lists config-merge but saves 404 — proxy or path rewrite issue."
        : `Could not use ${base}/openapi.json.`,
    "",
    "Fix (Windows): in Explorer open LaserXe\\backend and run:",
    "  .\\start-api.ps1",
    "(That script cd's to this folder, checks main.py, frees port 8001, starts uvicorn.)",
    "",
    "Or manually:",
    "  1) Stop everything on port 8001.",
    "  2) cd …\\LaserXe\\backend  (folder that contains main.py + start-api.ps1 + app\\)",
    "  3) python -m uvicorn main:app --host 127.0.0.1 --port 8001",
    "",
    `Sanity: open ${base}/health — you must see "laserxe_device_config_merge": true. If you only see {"status":"ok"}, wrong process.`,
    `Then ${base}/docs — search "config-merge".`,
  ];
  throw new DetailedApiError(lines.join("\n"), {
    status: last?.status ?? 404,
    operation: op,
    path: "/api/device/config-merge",
  });
}

export async function sendDeviceCommand(command: DeviceCommandDto): Promise<DeviceCommandResponseDto> {
  return fetchJsonOrThrow<DeviceCommandResponseDto>(
    "/api/device/command",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    },
    {
      operation: `Send device command (${command.type})`,
      path: "/api/device/command",
      method: "POST",
    }
  );
}

export async function getDeviceStatus(): Promise<DeviceStatusDto> {
  return fetchJsonOrThrow<DeviceStatusDto>("/api/device/status", undefined, {
    operation: "Read device status (positions, connection, firmware)",
    path: "/api/device/status",
    method: "GET",
  });
}

export async function getSerialPorts(): Promise<DeviceSerialPortDto[]> {
  return fetchJsonOrThrow<DeviceSerialPortDto[]>("/api/device/serial-ports", undefined, {
    operation: "List USB/serial COM ports (for Arduino and XDA)",
    path: "/api/device/serial-ports",
    method: "GET",
  });
}

export async function getXdaDiag(): Promise<DeviceXdaDiagDto> {
  return fetchJsonOrThrow<DeviceXdaDiagDto>("/api/device/xda-diag", undefined, {
    operation: "Read recent XDA serial TX/RX lines",
    path: "/api/device/xda-diag",
    method: "GET",
  });
}

export async function getRotationDiag(): Promise<DeviceRotationDiagDto> {
  return fetchJsonOrThrow<DeviceRotationDiagDto>("/api/device/rotation-diag", undefined, {
    operation: "Read recent rotation serial TX/RX lines",
    path: "/api/device/rotation-diag",
    method: "GET",
  });
}

export async function rotationSendRaw(command: string): Promise<{ ok: boolean; sent: string }> {
  return fetchJsonOrThrow(
    "/api/device/rotation-tools/raw",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    },
    {
      operation: "Send raw rotation step-dir command",
      path: "/api/device/rotation-tools/raw",
      method: "POST",
    }
  );
}

export async function getRotationIdleTimeout(): Promise<{
  seconds: number;
  source: string;
  env_seconds: number;
  enabled: boolean;
}> {
  return fetchJsonOrThrow("/api/device/rotation-tools/idle-timeout", undefined, {
    operation: "Read step-dir idle auto-disable timeout",
    path: "/api/device/rotation-tools/idle-timeout",
    method: "GET",
  });
}

export async function setRotationIdleTimeout(seconds: number): Promise<{
  seconds: number;
  source: string;
  env_seconds: number;
  enabled: boolean;
}> {
  return fetchJsonOrThrow(
    "/api/device/rotation-tools/idle-timeout",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds }),
    },
    {
      operation: "Set step-dir idle auto-disable timeout",
      path: "/api/device/rotation-tools/idle-timeout",
      method: "POST",
    }
  );
}

export async function getXdaToolsState(): Promise<DeviceXdaToolsStateDto> {
  return fetchJsonOrThrow<DeviceXdaToolsStateDto>("/api/device/xda-tools", undefined, {
    operation: "Read XDA runtime tool state",
    path: "/api/device/xda-tools",
    method: "GET",
  });
}

export async function setXdaOpenLoop(enabled: boolean): Promise<DeviceXdaToolsStateDto> {
  return fetchJsonOrThrow<DeviceXdaToolsStateDto>(
    "/api/device/xda-tools/open-loop",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
    {
      operation: "Set XDA jog open-loop mode",
      path: "/api/device/xda-tools/open-loop",
      method: "POST",
    }
  );
}

export async function setXdaAxisPrefix(enabled: boolean): Promise<DeviceXdaToolsStateDto> {
  return fetchJsonOrThrow<DeviceXdaToolsStateDto>(
    "/api/device/xda-tools/axis-prefix",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
    {
      operation: "Set XDA axis-prefix mode",
      path: "/api/device/xda-tools/axis-prefix",
      method: "POST",
    }
  );
}

export async function xdaConnect(params?: { port?: string; baud?: number; axis?: string }): Promise<{
  ok: boolean;
  axis?: string;
  stat?: number | null;
  epos?: number | null;
}> {
  return fetchJsonOrThrow(
    "/api/device/xda-tools/connect",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
    },
    { operation: "Connect XDA serial", path: "/api/device/xda-tools/connect", method: "POST" }
  );
}

export async function xdaDisconnect(): Promise<{ ok: boolean }> {
  return fetchJsonOrThrow("/api/device/xda-tools/disconnect", { method: "POST" }, {
    operation: "Disconnect XDA serial",
    path: "/api/device/xda-tools/disconnect",
    method: "POST",
  });
}

export async function xdaStopNow(): Promise<{ ok: boolean; axis?: string }> {
  return fetchJsonOrThrow("/api/device/xda-tools/stop", { method: "POST" }, {
    operation: "Stop XDA motion",
    path: "/api/device/xda-tools/stop",
    method: "POST",
  });
}

export async function xdaResetNow(): Promise<{ ok: boolean }> {
  return fetchJsonOrThrow("/api/device/xda-tools/reset", { method: "POST" }, {
    operation: "Send XDA reset",
    path: "/api/device/xda-tools/reset",
    method: "POST",
  });
}

export async function xdaSetSpeed(speed_units: number): Promise<{ ok: boolean; axis?: string; speed_units?: number }> {
  return fetchJsonOrThrow(
    "/api/device/xda-tools/set-speed",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speed_units }),
    },
    { operation: "Set XDA speed (SSPD)", path: "/api/device/xda-tools/set-speed", method: "POST" }
  );
}

export async function xdaStepCounts(step_counts: number): Promise<{ ok: boolean; axis?: string; step_counts?: number }> {
  return fetchJsonOrThrow(
    "/api/device/xda-tools/step-counts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step_counts }),
    },
    { operation: "Step XDA in counts", path: "/api/device/xda-tools/step-counts", method: "POST" }
  );
}

export async function xdaMoveAbsCounts(target_counts: number): Promise<{ ok: boolean; axis?: string; target_counts?: number }> {
  return fetchJsonOrThrow(
    "/api/device/xda-tools/move-abs-counts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_counts }),
    },
    { operation: "Move XDA absolute counts", path: "/api/device/xda-tools/move-abs-counts", method: "POST" }
  );
}

export async function xdaStepMm(
  delta_mm: number,
  counts_per_mm: number,
  invert_direction: boolean
): Promise<{ ok: boolean; axis?: string; step_counts?: number }> {
  return fetchJsonOrThrow(
    "/api/device/xda-tools/step-mm",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta_mm, counts_per_mm, invert_direction }),
    },
    { operation: "Step XDA in millimeters", path: "/api/device/xda-tools/step-mm", method: "POST" }
  );
}

export async function xdaMoveAbsMm(
  target_mm: number,
  counts_per_mm: number,
  invert_direction: boolean
): Promise<{ ok: boolean; axis?: string; target_counts?: number }> {
  return fetchJsonOrThrow(
    "/api/device/xda-tools/move-abs-mm",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_mm, counts_per_mm, invert_direction }),
    },
    { operation: "Move XDA absolute millimeters", path: "/api/device/xda-tools/move-abs-mm", method: "POST" }
  );
}

export async function xdaSetInfoMode(mode: number): Promise<{ ok: boolean; info_mode?: number }> {
  return fetchJsonOrThrow(
    "/api/device/xda-tools/set-info",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    },
    { operation: "Set XDA INFO mode", path: "/api/device/xda-tools/set-info", method: "POST" }
  );
}

export async function xdaQuery(tag: string): Promise<{ ok: boolean; tag?: string; value?: number | null; axis?: string }> {
  return fetchJsonOrThrow(
    "/api/device/xda-tools/query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    },
    { operation: `Query XDA value (${tag})`, path: "/api/device/xda-tools/query", method: "POST" }
  );
}

export async function xdaSendRaw(command: string): Promise<{ ok: boolean; sent?: string }> {
  return fetchJsonOrThrow(
    "/api/device/xda-tools/raw",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    },
    { operation: "Send raw XDA command", path: "/api/device/xda-tools/raw", method: "POST" }
  );
}

export async function xdaEnableDriveNow(value = 3): Promise<{ ok: boolean; stat?: number | null; enbl?: number }> {
  return fetchJsonOrThrow<{ ok: boolean; stat?: number | null; enbl?: number }>(
    "/api/device/xda-tools/enable-drive",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    },
    { operation: `Send ENBL=${value} to XDA`, path: "/api/device/xda-tools/enable-drive", method: "POST" }
  );
}

export async function xdaRunIndexNow(): Promise<{ ok: boolean; stat?: number | null; epos?: number | null }> {
  return fetchJsonOrThrow<{ ok: boolean; stat?: number | null; epos?: number | null }>(
    "/api/device/xda-tools/run-index",
    { method: "POST" },
    { operation: "Run INDX on XDA now", path: "/api/device/xda-tools/run-index", method: "POST" }
  );
}

export async function xdaRunDemoNow(): Promise<{
  ok: boolean;
  axis?: string;
  enbl?: number;
  center_mm?: number;
  target_mm?: number;
  repeats?: number;
  scan_mm_s?: number;
  scan_dir?: number;
  scan_time_s?: number;
  stat?: number | null;
  epos?: number | null;
}> {
  return fetchJsonOrThrow(
    "/api/device/xda-tools/run-demo",
    { method: "POST" },
    { operation: "Run XDA demo (travel-safe)", path: "/api/device/xda-tools/run-demo", method: "POST" }
  );
}

export async function xdaRunStepTestNow(): Promise<{
  ok: boolean;
  axis?: string;
  stat?: number | null;
  epos?: number | null;
  test_sspd?: number;
  test_step?: number;
  test_include_indx?: boolean;
}> {
  return fetchJsonOrThrow<{
    ok: boolean;
    axis?: string;
    stat?: number | null;
    epos?: number | null;
    test_sspd?: number;
    test_step?: number;
    test_include_indx?: boolean;
  }>(
    "/api/device/xda-tools/run-test-step",
    { method: "POST" },
    { operation: "Run XDA TEST step sequence", path: "/api/device/xda-tools/run-test-step", method: "POST" }
  );
}

export async function xdaVendorInitNow(): Promise<{
  ok: boolean;
  axis?: string;
  stat?: number | null;
  epos?: number | null;
  info_mode?: number;
  enbl?: number;
}> {
  return fetchJsonOrThrow(
    "/api/device/xda-tools/vendor-init",
    { method: "POST" },
    { operation: "Run XDA vendor-like init sequence", path: "/api/device/xda-tools/vendor-init", method: "POST" }
  );
}

export async function getPresets(): Promise<DevicePositionPresetDto[]> {
  return fetchJsonOrThrow<DevicePositionPresetDto[]>("/api/device/presets", undefined, {
    operation: "Load saved position presets",
    path: "/api/device/presets",
    method: "GET",
  });
}

export async function savePresets(presets: DevicePositionPresetDto[]): Promise<DevicePositionPresetDto[]> {
  return fetchJsonOrThrow<DevicePositionPresetDto[]>(
    "/api/device/presets",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(presets),
    },
    {
      operation: "Save position presets",
      path: "/api/device/presets",
      method: "PUT",
    }
  );
}

export async function getPatterns(): Promise<DevicePatternDto[]> {
  return fetchJsonOrThrow<DevicePatternDto[]>("/api/device/patterns", undefined, {
    operation: "Load saved motion patterns",
    path: "/api/device/patterns",
    method: "GET",
  });
}

export async function savePatterns(patterns: DevicePatternDto[]): Promise<DevicePatternDto[]> {
  return fetchJsonOrThrow<DevicePatternDto[]>(
    "/api/device/patterns",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patterns),
    },
    {
      operation: "Save motion patterns",
      path: "/api/device/patterns",
      method: "PUT",
    }
  );
}
