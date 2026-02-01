/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AnimationTab from "./AnimationTab";
import * as planApi from "@/lib/services/planApi";
import type { ImageDto, IterationDto, MaskDto, SpotDto } from "@/types";

vi.mock("@/lib/services/planApi", () => ({
  fetchImageFile: vi.fn(),
  fetchIterations: vi.fn(),
  fetchMasks: vi.fn(),
  fetchIterationSpots: vi.fn(),
}));

const mockImage: ImageDto = {
  id: 1,
  width_mm: 50,
  storage_path: "/test.jpg",
  created_at: "2026-01-01T00:00:00Z",
};

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
    spots_count: 1,
    spots_outside_mask_count: null,
    overlap_count: null,
    plan_valid: 1,
    created_at: "2026-01-01T00:00:00Z",
  }) as IterationDto;

const mockMask = (id: number): MaskDto =>
  ({
    id,
    image_id: 1,
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ],
    mask_label: null,
    created_at: "2026-01-01T00:00:00Z",
  }) as MaskDto;

const mockSpot = (id: number): SpotDto =>
  ({
    id,
    iteration_id: 1,
    sequence_index: id,
    x_mm: 10,
    y_mm: 10,
    theta_deg: 0,
    t_mm: 0,
    mask_id: null,
    component_id: null,
    created_at: "2026-01-01T00:00:00Z",
  }) as SpotDto;

describe("AnimationTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(planApi.fetchImageFile).mockResolvedValue(new Blob());
    vi.mocked(planApi.fetchIterations).mockResolvedValue([mockIteration(1), mockIteration(2)]);
    vi.mocked(planApi.fetchMasks).mockResolvedValue([mockMask(1)]);
    vi.mocked(planApi.fetchIterationSpots).mockResolvedValue([mockSpot(1)]);
  });

  it("renders iteration select and play/pause/reset buttons", async () => {
    render(<AnimationTab imageId={1} image={mockImage} />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /odtwórz/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /wstrzymaj/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("renders both checkboxes for diameter lines and axis", async () => {
    render(<AnimationTab imageId={1} image={mockImage} />);

    await waitFor(() => {
      expect(screen.getByText(/Linie średnic co 5°/i)).toBeInTheDocument();
      expect(screen.getByText(/Oś głowicy \(linia\)/i)).toBeInTheDocument();
    });
  });

  it("calls onSelectIteration when user selects an iteration", async () => {
    const onSelect = vi.fn();
    render(<AnimationTab imageId={1} image={mockImage} selectedIterationId={1} onSelectIteration={onSelect} />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "2" } });

    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("shows empty state when no iterations after load", async () => {
    vi.mocked(planApi.fetchIterations).mockResolvedValue([]);
    render(<AnimationTab imageId={1} image={mockImage} />);

    await waitFor(() => {
      expect(screen.getByText(/Brak iteracji. Wygeneruj plan/i)).toBeInTheDocument();
    });
  });
});
