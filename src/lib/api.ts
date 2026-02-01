/**
 * API base URL (backend). Uses PUBLIC_API_URL from env, fallback for dev.
 */
export function getApiBase(): string {
  if (typeof import.meta.env !== "undefined" && import.meta.env.PUBLIC_API_URL) {
    return String(import.meta.env.PUBLIC_API_URL).replace(/\/$/, "");
  }
  return "http://localhost:8000";
}

const LOGIN_PATH = "/login";

/**
 * Redirects to login with optional message and return path.
 * Call on 401 to "logout" and send user to login.
 */
function redirectToLogin(message?: string, redirectPath?: string): void {
  const params = new URLSearchParams();
  if (message) params.set("message", message);
  if (redirectPath && redirectPath.startsWith("/") && !redirectPath.startsWith("//")) {
    params.set("redirect", redirectPath);
  }
  const qs = params.toString();
  window.location.href = qs ? `${LOGIN_PATH}?${qs}` : LOGIN_PATH;
}

export type ApiFetchOptions = RequestInit & {
  /** If true (default), 401 triggers redirect to /login?message=session_expired. */
  handle401?: boolean;
};

/**
 * Fetch with credentials: 'include' and optional 401 → redirect to login.
 * Use for all authenticated API calls so that expired session redirects to login.
 */
export async function apiFetch(pathOrUrl: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { handle401 = true, ...init } = options;
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${getApiBase()}${pathOrUrl}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
  });
  if (res.status === 401 && handle401) {
    redirectToLogin("session_expired", typeof window !== "undefined" ? window.location.pathname : undefined);
    throw new Error("Unauthorized");
  }
  return res;
}
