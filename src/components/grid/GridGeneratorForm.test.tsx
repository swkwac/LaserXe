/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GridGeneratorForm from "./GridGeneratorForm";
import * as gridApi from "@/lib/services/gridApi";
import type { GridGeneratorResponseDto } from "@/types";

vi.mock("@/lib/services/gridApi", () => ({
  generateGrid: vi.fn(),
}));

vi.mock("@/lib/gridGeneratorStorage", () => ({
  loadGridGeneratorParams: vi.fn(() => null),
  saveGridGeneratorParams: vi.fn(),
}));

const mockResult: GridGeneratorResponseDto = {
  spots: [
    {
      sequence_index: 0,
      x_mm: 0.4,
      y_mm: 0.4,
      theta_deg: 45,
      t_mm: 0.566,
      mask_id: null,
      component_id: null,
    },
  ],
  spots_count: 1,
  achieved_coverage_pct: 9.8,
  params: {
    aperture_type: "simple",
    spot_diameter_um: 300,
    target_coverage_pct: 10,
    axis_distance_mm: 0.8,
    angle_step_deg: null,
  },
};

describe("GridGeneratorForm", () => {
  const mockOnResult = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form with aperture options and Generuj button", () => {
    render(<GridGeneratorForm onResult={mockOnResult} />);
    expect(screen.getByText("Prosty – 12×12 mm")).toBeInTheDocument();
    expect(screen.getByText("Zaawansowany – 25 mm średnicy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generuj" })).toBeInTheDocument();
  });

  it("calls generateGrid and onResult on submit with simple params (coverage mode)", async () => {
    vi.mocked(gridApi.generateGrid).mockResolvedValue(mockResult);

    render(<GridGeneratorForm onResult={mockOnResult} />);
    await fireEvent.click(screen.getByRole("button", { name: "Generuj" }));

    await waitFor(() => {
      expect(gridApi.generateGrid).toHaveBeenCalledWith(
        expect.objectContaining({
          aperture_type: "simple",
          spot_diameter_um: 300,
          target_coverage_pct: 10,
        })
      );
    });
    await waitFor(() => {
      expect(mockOnResult).toHaveBeenCalledWith(mockResult, { simple_input_mode: "coverage" });
    });
  });

  it("calls generateGrid with axis_distance_mm when simple spacing mode", async () => {
    vi.mocked(gridApi.generateGrid).mockResolvedValue(mockResult);

    render(<GridGeneratorForm onResult={mockOnResult} />);
    await fireEvent.click(screen.getByRole("radio", { name: "Odstęp między osiami XY (mm)" }));
    await fireEvent.click(screen.getByRole("button", { name: "Generuj" }));

    await waitFor(() => {
      expect(gridApi.generateGrid).toHaveBeenCalledWith(
        expect.objectContaining({
          aperture_type: "simple",
          spot_diameter_um: 300,
          axis_distance_mm: 0.8,
        })
      );
    });
    expect(mockOnResult).toHaveBeenCalledWith(mockResult, { simple_input_mode: "spacing" });
  });

  it("shows error message when generateGrid throws", async () => {
    vi.mocked(gridApi.generateGrid).mockRejectedValue(new Error("Network error"));

    render(<GridGeneratorForm onResult={mockOnResult} />);
    await fireEvent.click(screen.getByRole("button", { name: "Generuj" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
    });
    expect(mockOnResult).not.toHaveBeenCalled();
  });

  it("shows session expired message for Unauthorized error", async () => {
    vi.mocked(gridApi.generateGrid).mockRejectedValue(new Error("Unauthorized"));

    render(<GridGeneratorForm onResult={mockOnResult} />);
    await fireEvent.click(screen.getByRole("button", { name: "Generuj" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Sesja wygasła");
    });
  });

  it("switches to advanced and shows angle step field", async () => {
    render(<GridGeneratorForm onResult={mockOnResult} />);
    await fireEvent.click(screen.getByRole("radio", { name: /Zaawansowany/ }));
    expect(screen.getByLabelText("Krok kąta (°)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Odstęp między osiami (mm)")).not.toBeInTheDocument();
  });

  it("shows input mode selector for simple aperture", () => {
    render(<GridGeneratorForm onResult={mockOnResult} />);
    const coverageRadio = screen.getByRole("radio", { name: "Pokrycie docelowe (%)" });
    const spacingRadio = screen.getByRole("radio", { name: "Odstęp między osiami XY (mm)" });
    expect(coverageRadio).toBeInTheDocument();
    expect(spacingRadio).toBeInTheDocument();
    expect(coverageRadio).toBeChecked();
  });
});
