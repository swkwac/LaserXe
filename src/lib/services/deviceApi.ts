/**
 * Device control API (Pi ↔ Pico).
 */
import { apiFetch, getApiBase } from "@/lib/api";
import type {
  DeviceCommandDto,
  DeviceCommandResponseDto,
  DeviceConfigDto,
  DeviceConfigResponseDto,
  DevicePatternDto,
  DevicePositionPresetDto,
  DeviceSerialPortDto,
  DeviceStatusDto,
} from "@/types";

const DEFAULT_ERROR = "Device request failed.";

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
  const res = await apiFetch("/api/device/config");
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || DEFAULT_ERROR);
  }
  return JSON.parse(text) as DeviceConfigResponseDto;
}

export async function saveDeviceConfig(config: DeviceConfigDto): Promise<DeviceConfigResponseDto> {
  const res = await apiFetch("/api/device/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || DEFAULT_ERROR);
  }
  return JSON.parse(text) as DeviceConfigResponseDto;
}

export async function sendDeviceCommand(command: DeviceCommandDto): Promise<DeviceCommandResponseDto> {
  const res = await apiFetch("/api/device/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || DEFAULT_ERROR);
  }
  return JSON.parse(text) as DeviceCommandResponseDto;
}

export async function getDeviceStatus(): Promise<DeviceStatusDto> {
  const res = await apiFetch("/api/device/status");
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || DEFAULT_ERROR);
  }
  return JSON.parse(text) as DeviceStatusDto;
}

export async function getSerialPorts(): Promise<DeviceSerialPortDto[]> {
  const res = await apiFetch("/api/device/serial-ports");
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || DEFAULT_ERROR);
  }
  return JSON.parse(text) as DeviceSerialPortDto[];
}

export async function getPresets(): Promise<DevicePositionPresetDto[]> {
  const res = await apiFetch("/api/device/presets");
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || DEFAULT_ERROR);
  }
  return JSON.parse(text) as DevicePositionPresetDto[];
}

export async function savePresets(presets: DevicePositionPresetDto[]): Promise<DevicePositionPresetDto[]> {
  const res = await apiFetch("/api/device/presets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(presets),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || DEFAULT_ERROR);
  }
  return JSON.parse(text) as DevicePositionPresetDto[];
}

export async function getPatterns(): Promise<DevicePatternDto[]> {
  const res = await apiFetch("/api/device/patterns");
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || DEFAULT_ERROR);
  }
  return JSON.parse(text) as DevicePatternDto[];
}

export async function savePatterns(patterns: DevicePatternDto[]): Promise<DevicePatternDto[]> {
  const res = await apiFetch("/api/device/patterns", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patterns),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || DEFAULT_ERROR);
  }
  return JSON.parse(text) as DevicePatternDto[];
}
