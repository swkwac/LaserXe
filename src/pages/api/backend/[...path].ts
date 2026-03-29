import type { APIRoute } from "astro";

export const prerender = false;

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function getBackendBase(): string {
  const raw = String(import.meta.env.PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  return raw.replace("://localhost", "://127.0.0.1");
}

function copyHeaders(headers: Headers): Headers {
  const out = new Headers();
  headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      out.set(key, value);
    }
  });
  return out;
}

const forward: APIRoute = async ({ params, request, url }) => {
  const restPath = params.path ? `/${params.path}` : "";
  const targetUrl = `${getBackendBase()}${restPath}${url.search}`;

  try {
    const method = request.method.toUpperCase();
    const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
    const upstream = await fetch(targetUrl, {
      method,
      headers: copyHeaders(request.headers),
      body,
      redirect: "manual",
    });
    const responseBody = await upstream.arrayBuffer();
    return new Response(responseBody, {
      status: upstream.status,
      headers: copyHeaders(upstream.headers),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ detail: `Proxy request failed: ${detail}`, target: targetUrl }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const OPTIONS = forward;
export const HEAD = forward;

