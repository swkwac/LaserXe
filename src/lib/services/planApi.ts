/**
 * Plan / iteration API: create iteration, fetch iteration, update status, exports.
 * Uses apiFetch for auth and 401 redirect. Throws on create/update errors with API detail when available.
 */
import { apiFetch } from "@/lib/api";
import { fetchJsonOrThrow } from "@/lib/apiErrors";
import type {
  IterationCreateCommand,
  IterationDto,
  IterationListResponseDto,
  MaskDto,
  MaskListResponseDto,
  SpotDto,
} from "@/types";

/**
 * Creates a new plan iteration for the given image. On success returns the iteration.
 * On 4xx/5xx throws Error with long formatted API detail.
 */
export async function createIteration(imageId: number, body: IterationCreateCommand): Promise<IterationDto> {
  const payload = {
    target_coverage_pct: body.target_coverage_pct,
    coverage_per_mask: body.coverage_per_mask,
    is_demo: body.is_demo ?? false,
    algorithm_mode: body.algorithm_mode ?? "simple",
    ...(body.algorithm_mode === "simple" ? { grid_spacing_mm: body.grid_spacing_mm ?? 0.8 } : {}),
  };
  const path = `/api/images/${imageId}/iterations`;
  return fetchJsonOrThrow<IterationDto>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    {
      operation: `Create plan iteration for image id=${imageId}`,
      path,
      method: "POST",
    }
  );
}

/**
 * Fetches a single iteration by id. Returns null if not found or not ok.
 */
export async function fetchIteration(iterationId: number): Promise<IterationDto | null> {
  const res = await apiFetch(`/api/iterations/${iterationId}`);
  if (!res.ok) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as IterationDto;
  } catch {
    return null;
  }
}

/**
 * Updates iteration status (accepted/rejected). Returns updated iteration or throws with API detail.
 */
export async function updateIterationStatus(
  iterationId: number,
  status: "accepted" | "rejected"
): Promise<IterationDto> {
  const path = `/api/iterations/${iterationId}`;
  return fetchJsonOrThrow<IterationDto>(
    path,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
    {
      operation: `Update iteration ${iterationId} status to "${status}"`,
      path,
      method: "PATCH",
    }
  );
}

export interface PlanApiFetchOptions {
  signal?: AbortSignal;
}

/**
 * Fetches iterations for an image (page 1, page_size 50). Returns empty array on error.
 */
export async function fetchIterations(imageId: number, options?: PlanApiFetchOptions): Promise<IterationDto[]> {
  const res = await apiFetch(`/api/images/${imageId}/iterations?page=1&page_size=50`, { signal: options?.signal });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text) return [];
  try {
    const data = JSON.parse(text) as IterationListResponseDto;
    return data.items ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetches image file as blob. Returns null if not ok.
 */
export async function fetchImageFile(imageId: number, options?: PlanApiFetchOptions): Promise<Blob | null> {
  const res = await apiFetch(`/api/images/${imageId}/file`, {
    signal: options?.signal,
  });
  if (!res.ok) return null;
  return res.blob();
}

/**
 * Fetches masks for an image. Returns empty array on error.
 */
export async function fetchMasks(imageId: number, options?: PlanApiFetchOptions): Promise<MaskDto[]> {
  const res = await apiFetch(`/api/images/${imageId}/masks`, {
    signal: options?.signal,
  });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text) return [];
  try {
    const data = JSON.parse(text) as MaskListResponseDto;
    return data.items ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetches spots for an iteration (JSON format). Returns empty array on error.
 */
export async function fetchIterationSpots(iterationId: number, options?: PlanApiFetchOptions): Promise<SpotDto[]> {
  const res = await apiFetch(`/api/iterations/${iterationId}/spots?format=json`, { signal: options?.signal });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text) return [];
  try {
    const data = JSON.parse(text) as { items: SpotDto[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

/**
 * Exports iteration as JSON blob. Returns null if not ok.
 */
export async function exportIterationJson(iterationId: number): Promise<Blob | null> {
  const res = await apiFetch(`/api/iterations/${iterationId}/export?format=json`);
  if (!res.ok) return null;
  return res.blob();
}

/**
 * Exports iteration spots as CSV blob. Returns null if not ok.
 */
export async function exportIterationCsv(iterationId: number): Promise<Blob | null> {
  const res = await apiFetch(`/api/iterations/${iterationId}/spots?format=csv`);
  if (!res.ok) return null;
  return res.blob();
}

/**
 * Exports iteration as image (png or jpg). Returns null if not ok.
 */
export async function exportIterationImage(iterationId: number, format: "png" | "jpg"): Promise<Blob | null> {
  const res = await apiFetch(`/api/iterations/${iterationId}/export?format=${format}`);
  if (!res.ok) return null;
  return res.blob();
}
