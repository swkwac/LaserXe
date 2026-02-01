/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAnimationTabData } from "./useAnimationTabData";
import * as planApi from "@/lib/services/planApi";
import type { IterationDto, MaskDto, SpotDto } from "@/types";

vi.mock("@/lib/services/planApi", () => ({
  fetchImageFile: vi.fn(),
  fetchIterations: vi.fn(),
  fetchMasks: vi.fn(),
  fetchIterationSpots: vi.fn(),
}));

const mockIteration = (id: number): IterationDto =>
  ({
    id,
    image_id: 1,
    parent_id: null,
    created_by: null,
    status: "draft",
    accepted_at: null,
    accepted_by: null,
    is_demo: 0,
    target_coverage_pct: null,
    achieved_coverage_pct: null,
    spots_count: 2,
    spots_outside_mask_count: null,
    overlap_count: null,
    plan_valid: 1,
    created_at: "2026-01-01T00:00:00Z",
  }) as IterationDto;

const mockMask = (id: number): MaskDto =>
  ({
    id,
    image_id: 1,
    vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }],
    mask_label: null,
    created_at: "2026-01-01T00:00:00Z",
  }) as MaskDto;

const mockSpot = (id: number): SpotDto =>
  ({
    id,
    iteration_id: 1,
    sequence_index: id,
    x_mm: id * 10,
    y_mm: id * 10,
    theta_deg: 0,
    t_mm: 0,
    mask_id: null,
    component_id: null,
    created_at: "2026-01-01T00:00:00Z",
  }) as SpotDto;

describe("useAnimationTabData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(planApi.fetchImageFile).mockResolvedValue(new Blob());
    vi.mocked(planApi.fetchIterations).mockResolvedValue([
      mockIteration(1),
      mockIteration(2),
    ]);
    vi.mocked(planApi.fetchMasks).mockResolvedValue([mockMask(1)]);
    vi.mocked(planApi.fetchIterationSpots).mockResolvedValue([
      mockSpot(1),
      mockSpot(2),
    ]);
    if (typeof URL.createObjectURL === "undefined") {
      vi.stubGlobal("URL", {
        ...globalThis.URL,
        createObjectURL: () => "blob:mock",
        revokeObjectURL: () => {},
      });
    }
  });

  it("calls fetchIterations and fetchMasks with imageId and signal on mount", async () => {
    renderHook(() => useAnimationTabData(42, null));

    await waitFor(() => {
      expect(planApi.fetchIterations).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ signal: expect.anything() })
      );
    });
    expect(planApi.fetchMasks).toHaveBeenCalled();
    expect(planApi.fetchImageFile).toHaveBeenCalled();
  });

  it("does not call fetchIterationSpots when selectedFromParent is null and iterations not yet loaded", async () => {
    vi.mocked(planApi.fetchIterations).mockResolvedValue([]);
    const { result } = renderHook(() => useAnimationTabData(1, null));

    await waitFor(() => {
      expect(result.current.loadingIterations).toBe(false);
    });
    expect(planApi.fetchIterationSpots).not.toHaveBeenCalled();
    expect(result.current.spots).toEqual([]);
  });

  it("calls fetchIterationSpots when selectedFromParent is set", async () => {
    const { result } = renderHook(() => useAnimationTabData(1, 10));

    await waitFor(() => {
      expect(result.current.loadingSpots).toBe(false);
    });
    expect(planApi.fetchIterationSpots).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(result.current.spots).toHaveLength(2);
  });

  it("resolves selectedIterationId from first iteration when selectedFromParent is null", async () => {
    const { result } = renderHook(() => useAnimationTabData(1, null));

    await waitFor(() => {
      expect(result.current.loadingIterations).toBe(false);
    });
    expect(result.current.selectedIterationId).toBe(1);
    expect(result.current.iterations).toHaveLength(2);
  });

  it("returns loadingIterations true until iterations resolve", async () => {
    let resolveIterations: (value: IterationDto[]) => void;
    const iterationsPromise = new Promise<IterationDto[]>((r) => {
      resolveIterations = r;
    });
    vi.mocked(planApi.fetchIterations).mockReturnValue(iterationsPromise);

    const { result } = renderHook(() => useAnimationTabData(1, null));

    expect(result.current.loadingIterations).toBe(true);

    resolveIterations!([mockIteration(1)]);
    await waitFor(() => {
      expect(result.current.loadingIterations).toBe(false);
    });
  });

  it("returns errorIterations when fetchIterations throws", async () => {
    vi.mocked(planApi.fetchIterations).mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useAnimationTabData(1, null));

    await waitFor(() => {
      expect(result.current.loadingIterations).toBe(false);
      expect(result.current.errorIterations).not.toBeNull();
    });
  });

  it("returns null error fields on success (iterations and spots)", async () => {
    const { result } = renderHook(() => useAnimationTabData(1, 1));

    await waitFor(() => {
      expect(result.current.loadingSpots).toBe(false);
    });
    expect(result.current.errorIterations).toBeNull();
    expect(result.current.errorSpots).toBeNull();
  });
});
