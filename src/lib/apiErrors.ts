/**
 * Rich HTTP/API error formatting for FastAPI and fetch failures.
 * Use normalizeClientError() when displaying any thrown value in the UI.
 */
import { apiFetch, getApiBase } from "@/lib/api";

export type ApiErrorContext = {
  /** Human-readable action, e.g. "Load device configuration" */
  operation: string;
  /** URL path only, e.g. /api/device/command */
  path: string;
  method?: string;
};

export class DetailedApiError extends Error {
  readonly status: number;
  readonly operation: string;
  readonly path: string;

  constructor(message: string, meta: { status: number; operation: string; path: string }) {
    super(message);
    this.name = "DetailedApiError";
    this.status = meta.status;
    this.operation = meta.operation;
    this.path = meta.path;
  }
}

function truncateBody(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… (${s.length - max} more characters omitted)`;
}

/** Short hint for operators (not a substitute for the full server message). */
function httpStatusHint(code: number): string {
  switch (code) {
    case 400:
      return "Bad request — invalid input, missing configuration, or business rule failed (read the server message below).";
    case 401:
      return "Not authenticated — session expired; sign in again.";
    case 403:
      return "Forbidden — your account cannot perform this action.";
    case 404:
      return "Not found — wrong URL, missing resource, or outdated id.";
    case 422:
      return "Validation error — JSON body failed schema checks (field paths are listed below).";
    case 500:
      return "Internal server error — unexpected failure on the server; check the backend console / logs.";
    case 502:
    case 503:
    case 504:
      return "Service unavailable — backend overloaded, restarting, or dependency failed (e.g. serial device, database).";
    default:
      return "See standard HTTP status code documentation if needed.";
  }
}

/**
 * Format structured device errors from LaserXe backend (`device_configuration` / `device_connection`).
 */
export function formatDeviceServiceDetail(d: Record<string, unknown>): string {
  const lines: string[] = [];
  if (typeof d.code === "string") {
    lines.push(`Error code: ${d.code}`);
  }
  if (typeof d.title === "string") {
    lines.push("", d.title);
  }
  if (typeof d.summary === "string") {
    lines.push("", "Summary:", d.summary);
  }
  if (typeof d.command_attempted === "string") {
    lines.push("", `Command attempted: ${d.command_attempted}`);
  }
  if (typeof d.config_file === "string") {
    lines.push("", `Config file on server: ${d.config_file}`);
  }
  if (d.config_snapshot != null && typeof d.config_snapshot === "object") {
    lines.push(
      "",
      "Config snapshot (exact values the server used for this request):",
      JSON.stringify(d.config_snapshot, null, 2)
    );
  }
  if (Array.isArray(d.remediation)) {
    lines.push("", "What to try (in order):");
    d.remediation.forEach((step, i) => {
      lines.push(`  ${i + 1}. ${String(step)}`);
    });
  }
  if (typeof d.for_developers === "string") {
    lines.push("", "--- For developers / support ---", d.for_developers);
  }
  if (lines.length === 0) {
    return JSON.stringify(d, null, 2);
  }
  return lines.join("\n");
}

/** Structured 422 from PUT /api/device/config when merge + validate fails in Python. */
export function formatDeviceConfigValidationDetail(d: Record<string, unknown>): string {
  const lines: string[] = [];
  if (typeof d.title === "string") lines.push(d.title);
  if (typeof d.summary === "string") lines.push("", "Summary:", d.summary);
  if (Array.isArray(d.pydantic_errors)) {
    lines.push("", "Field errors:");
    d.pydantic_errors.forEach((item, i) => {
      if (item && typeof item === "object" && "msg" in item) {
        const o = item as { loc?: unknown; msg?: string; type?: string };
        const loc = Array.isArray(o.loc) ? o.loc.map(String).join(" → ") : String(o.loc ?? "?");
        lines.push(`  ${i + 1}. Field "${loc}": ${String(o.msg)}${o.type ? ` [type: ${o.type}]` : ""}`);
      } else {
        lines.push(`  ${i + 1}. ${JSON.stringify(item)}`);
      }
    });
  }
  return lines.length > 0 ? lines.join("\n") : JSON.stringify(d, null, 2);
}

/**
 * Turn FastAPI `detail` (string | ValidationError[] | object) into readable text.
 */
export function formatFastApiDetail(detail: unknown): string {
  if (detail === undefined || detail === null) {
    return "(Response JSON had no `detail` field, or it was null.)";
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    if (detail.length === 0) {
      return "(Empty validation error list.)";
    }
    return detail
      .map((item, i) => {
        if (typeof item === "string") {
          return `  ${i + 1}. ${item}`;
        }
        if (item && typeof item === "object" && "msg" in item) {
          const o = item as { loc?: unknown; msg?: string; type?: string; ctx?: unknown };
          const loc = Array.isArray(o.loc) ? o.loc.map(String).join(" → ") : String(o.loc ?? "?");
          const msg = String(o.msg ?? "(no message)");
          const type = o.type ? ` [type: ${o.type}]` : "";
          const ctx = o.ctx != null ? `\n      context: ${JSON.stringify(o.ctx)}` : "";
          return `  ${i + 1}. Field "${loc}": ${msg}${type}${ctx}`;
        }
        return `  ${i + 1}. ${JSON.stringify(item)}`;
      })
      .join("\n");
  }
  if (typeof detail === "object" && detail !== null && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    if (d.error === "device_configuration" || d.error === "device_connection") {
      return formatDeviceServiceDetail(d);
    }
    if (d.error === "device_config_validation") {
      return formatDeviceConfigValidationDetail(d);
    }
    return JSON.stringify(detail, null, 2);
  }
  return String(detail);
}

function extractDetailFromBody(text: string): { detail: unknown } | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && "detail" in parsed) {
      return { detail: parsed.detail };
    }
    return { detail: undefined };
  } catch {
    return null;
  }
}

export function buildDetailedHttpMessage(options: {
  context: ApiErrorContext;
  status: number;
  statusText: string;
  bodyText: string;
  detailFormatted: string;
}): string {
  const { context, status, statusText, bodyText, detailFormatted } = options;
  const method = (context.method ?? "GET").toUpperCase();
  const apiBase = getApiBase();
  const lines = [
    `Operation: ${context.operation}`,
    "",
    `HTTP ${status} ${statusText || "(no status text)"}`,
    `What this usually means: ${httpStatusHint(status)}`,
    "",
    `Request: ${method} ${context.path}`,
    `API base URL: ${apiBase}`,
    "",
    "--- Message from server (detail) ---",
    detailFormatted,
    "",
    "--- Raw response body (for debugging / support) ---",
    truncateBody((bodyText ?? "").trim() || "(empty body)", 2800),
  ];
  return lines.join("\n");
}

export function throwDetailedHttpError(res: Response, bodyText: string, context: ApiErrorContext): never {
  const extracted = extractDetailFromBody(bodyText);
  let detailFormatted: string;
  if (extracted) {
    detailFormatted = formatFastApiDetail(extracted.detail);
  } else if (bodyText?.trim()) {
    detailFormatted = `(Response was not JSON or had unexpected shape.)\n${truncateBody(bodyText.trim(), 2000)}`;
  } else {
    detailFormatted =
      "The server returned an empty body. Often this means the process crashed before writing JSON, or a proxy stripped the body.";
  }
  const msg = buildDetailedHttpMessage({
    context,
    status: res.status,
    statusText: res.statusText,
    bodyText,
    detailFormatted,
  });
  throw new DetailedApiError(msg, {
    status: res.status,
    operation: context.operation,
    path: context.path,
  });
}

export function wrapFetchFailure(err: unknown, context: ApiErrorContext): Error {
  if (err instanceof DetailedApiError) {
    return err;
  }
  const method = (context.method ?? "GET").toUpperCase();
  const apiBase = getApiBase();
  const name = err instanceof Error ? err.name : "Error";
  const base = err instanceof Error ? err.message : String(err);
  const msg = [
    `Operation: ${context.operation}`,
    "",
    "The browser could not complete the HTTP request (network layer).",
    "This is not an HTTP status from your API — the request may not have reached the server.",
    "",
    `Request: ${method} ${context.path}`,
    `API base URL: ${apiBase}`,
    "",
    "--- Underlying error ---",
    `${name}: ${base}`,
    "",
    "Common causes:",
    "• Python backend not running (from the `backend` folder: `python -m uvicorn main:app --host 127.0.0.1 --port 8001`).",
    "• Wrong PUBLIC_API_URL in `.env` — the app is calling the URL shown above.",
    "• Browser blocked the request (CORS) — open DevTools → Network, click the failed request, read the red error.",
    "• Firewall, VPN, or corporate proxy blocking localhost.",
    "• Wrong protocol (http vs https) or wrong port.",
  ].join("\n");
  return new Error(msg);
}

export function normalizeClientError(err: unknown): string {
  if (err instanceof DetailedApiError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return typeof err === "string" ? err : JSON.stringify(err, null, 2);
}

/**
 * GET/POST/PUT JSON helper: throws DetailedApiError or long Error on failure.
 */
export async function fetchJsonOrThrow<T>(path: string, init: RequestInit | undefined, context: ApiErrorContext): Promise<T> {
  const method = init?.method ?? "GET";
  const ctx = { ...context, method };
  try {
    const res = await apiFetch(path, init);
    const text = await res.text();
    if (!res.ok) {
      throwDetailedHttpError(res, text, ctx);
    }
    if (!text.trim()) {
      throw new Error(
        [
          `Operation: ${context.operation}`,
          "",
          `Success response had an empty body for ${method} ${path}.`,
          "The client expected JSON. Check the API contract for this endpoint.",
        ].join("\n")
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch (parseErr) {
      const pe = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(
        [
          `Operation: ${context.operation}`,
          "",
          `Response was not valid JSON (${pe}).`,
          `Request: ${method} ${path}`,
          "",
          "--- Body preview ---",
          truncateBody(text, 1200),
        ].join("\n")
      );
    }
  } catch (e) {
    if (e instanceof DetailedApiError) {
      throw e;
    }
    if (e instanceof Error && e.message.includes("Operation:") && e.message.includes("valid JSON")) {
      throw e;
    }
    if (e instanceof Error && e.message.includes("empty body")) {
      throw e;
    }
    if (e instanceof Error && e.message === "Unauthorized") {
      throw new Error(
        [
          `Operation: ${context.operation}`,
          "",
          "HTTP 401 Unauthorized — session missing or expired before the response body was read.",
          `Request: ${method} ${path}`,
          `API base URL: ${getApiBase()}`,
          "",
          "Sign in again. For local development you may need to relax auth on the backend or log in through the app.",
        ].join("\n")
      );
    }
    throw wrapFetchFailure(e, ctx);
  }
}
