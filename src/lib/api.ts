/**
 * API base URL (backend). Uses PUBLIC_API_URL from env, fallback for dev.
 */
export function getApiBase(): string {
  if (typeof import.meta.env !== "undefined" && import.meta.env.PUBLIC_API_URL) {
    return normalizeLoopbackBase(String(import.meta.env.PUBLIC_API_URL)).replace(/\/$/, "");
  }
  return "http://127.0.0.1:8000";
}

export type ApiFetchOptions = RequestInit & {
  /** If true (default), 401 throws an Unauthorized error. */
  handle401?: boolean;
};

/**
 * Fetch with credentials: 'include' and optional 401 handling.
 */
export async function apiFetch(pathOrUrl: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { handle401 = true, ...init } = options;
  const relativePath = pathOrUrl.startsWith("http")
    ? null
    : pathOrUrl.startsWith("/")
      ? pathOrUrl
      : `/${pathOrUrl}`;
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${getApiBase()}${relativePath}`;
  const proxyUrl = relativePath ? `/api/backend${relativePath}` : null;
  const requestInit: RequestInit = {
    ...init,
    credentials: "include",
  };
  let res: Response;
  try {
    // Prefer same-origin proxy to avoid browser CORS/network quirks when calling backend directly.
    if (proxyUrl) {
      res = await fetch(proxyUrl, requestInit);
    } else {
      res = await fetch(url, requestInit);
    }
  } catch (err) {
    if (proxyUrl) {
      // Proxy can fail when the frontend dev server changed routes during HMR; fall back to direct backend URL.
      res = await fetch(url, requestInit);
    } else {
      const retryUrl = toIpv4LoopbackUrl(url);
      if (!retryUrl) throw err;
      // On some Windows setups localhost resolves to ::1 first, but backend binds only 127.0.0.1.
      res = await fetch(retryUrl, requestInit);
    }
  }
  if (res.status === 401 && handle401) {
    throw new Error("Unauthorized");
  }
  return res;
}

function toIpv4LoopbackUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname !== "localhost" && parsed.hostname !== "::1" && parsed.hostname !== "[::1]") {
      return null;
    }
    parsed.hostname = "127.0.0.1";
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeLoopbackBase(base: string): string {
  const normalized = toIpv4LoopbackUrl(base);
  return normalized ?? base;
}
