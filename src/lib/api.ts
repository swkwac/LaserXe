/**
 * API base URL (backend). Uses PUBLIC_API_URL from env, fallback for dev.
 */
export function getApiBase(): string {
  if (typeof import.meta.env !== "undefined" && import.meta.env.PUBLIC_API_URL) {
    return String(import.meta.env.PUBLIC_API_URL).replace(/\/$/, "");
  }
  return "http://localhost:8000";
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
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${getApiBase()}${pathOrUrl}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
  });
  if (res.status === 401 && handle401) {
    throw new Error("Unauthorized");
  }
  return res;
}
