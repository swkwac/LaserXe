import * as React from "react";
import type { GridGeneratorParamsDto, GridGeneratorSpotDto } from "@/types";

const SIMPLE_SIZE_MM = 12;
const ADVANCED_RADIUS_MM = 12.5;
const SPOT_RADIUS_MM = 0.15; // 300 µm default; 150 µm = 0.075

/** Orange for treatment spots (scientific schematic style). */
const SPOT_FILL = "#e67e22";
const SPOT_STROKE = "rgba(0,0,0,0.25)";

export interface GridSchematicViewProps {
  params: GridGeneratorParamsDto;
  spots: GridGeneratorSpotDto[];
  /** Spot radius in mm for display (scales with spot_diameter_um). */
  spotRadiusMm?: number;
  /** Show construction lines (rings, angle lines) for advanced. Default true. */
  showConstruction?: boolean;
}

function formatTitle(params: GridGeneratorParamsDto): string {
  if (params.aperture_type === "simple") {
    const axis = params.axis_distance_mm != null ? `${params.axis_distance_mm.toFixed(2)} mm` : "—";
    const cov = params.target_coverage_pct?.toFixed(1) ?? "—";
    return `12 mm | Siatka | ${axis} odstęp — ${cov}% pokrycie, boustrophedon`;
  }
  const cov = params.target_coverage_pct?.toFixed(1) ?? "—";
  const step = params.angle_step_deg != null ? `${params.angle_step_deg}°` : "—";
  return `Zaawansowany 25 mm, ${cov}% pokrycie, ${step}`;
}

/**
 * SVG schematic: aperture outline, grid lines, spot positions.
 * Scientific style: title, dual boundary (solid outer, dashed inner), axis ticks, orange spots.
 * Simple: 12×12 mm rectangle, X right Y up.
 * Advanced: 25 mm circle, center origin, X right Y up.
 */
export function GridSchematicView({
  params,
  spots,
  spotRadiusMm = SPOT_RADIUS_MM,
  showConstruction = true,
}: GridSchematicViewProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [size, setSize] = React.useState({ w: 400, h: 400 });
  const isSimple = params.aperture_type === "simple";

  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setSize({ w: Math.max(320, width), h: Math.max(320, height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isSimple]);

  const title = formatTitle(params);

  if (isSimple) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <p className="mb-2 shrink-0 text-center text-sm font-medium text-foreground">{title}</p>
        <div className="min-h-0 flex-1 w-full">
          <SimpleSchematic
            ref={svgRef}
            spots={spots}
            size={size}
            spotRadiusMm={spotRadiusMm}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="mb-2 shrink-0 text-center text-sm font-medium text-foreground">{title}</p>
      <div className="min-h-0 flex-1 w-full">
        <AdvancedSchematic
        ref={svgRef}
        params={params}
        spots={spots}
        size={size}
        spotRadiusMm={spotRadiusMm}
        showConstruction={showConstruction}
      />
      </div>
    </div>
  );
}

/** Simple 12×12 mm: top-left coords, y down. All axis labels OUTSIDE the aperture. */
const SimpleSchematic = React.forwardRef<
  SVGSVGElement,
  {
    spots: GridGeneratorSpotDto[];
    size: { w: number; h: number };
    spotRadiusMm: number;
  }
>(function SimpleSchematic({ spots, size, spotRadiusMm }, ref) {
  const labelAreaLeft = 52;
  const topPadding = 36;
  const bottomPadding = 36;
  const plotH = size.h - topPadding - bottomPadding;
  const scale = Math.min(size.w - labelAreaLeft, plotH) / SIMPLE_SIZE_MM;
  const apertureW = SIMPLE_SIZE_MM * scale;
  const apertureH = apertureW;

  const plotLeft = Math.max(labelAreaLeft, (size.w - apertureW) / 2);
  const plotTop = (size.h - apertureH) / 2;

  const mmToSvg = (xMm: number, yMm: number) => ({
    x: plotLeft + xMm * scale,
    y: plotTop + yMm * scale,
  });

  const origin = mmToSvg(0, 0);
  const bottomRight = mmToSvg(SIMPLE_SIZE_MM, SIMPLE_SIZE_MM);

  // Inner boundary: spot centers must be in [r, 12-r] × [r, 12-r]
  const r = spotRadiusMm;
  const innerMin = mmToSvg(r, r);
  const innerMax = mmToSvg(SIMPLE_SIZE_MM - r, SIMPLE_SIZE_MM - r);
  const innerW = innerMax.x - innerMin.x;

  const ticks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const tickLabelOffset = 14;

  return (
    <svg
      ref={ref}
      className="w-full h-full min-h-[300px] bg-white"
      viewBox={`0 0 ${size.w} ${size.h}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Outer boundary (solid) - emission aperture */}
      <rect
        x={origin.x}
        y={origin.y}
        width={apertureW}
        height={apertureH}
        fill="none"
        stroke="#000"
        strokeWidth={2}
      />
      {/* Inner boundary (dashed) - spot placement region */}
      <rect
        x={innerMin.x}
        y={innerMin.y}
        width={innerW}
        height={innerMax.y - innerMin.y}
        fill="none"
        stroke="#000"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {/* Grid lines inside aperture only - 1 mm intervals */}
      {ticks.slice(1, -1).map((t) => (
        <React.Fragment key={`v-${t}`}>
          <line
            x1={mmToSvg(t, 0).x}
            y1={origin.y}
            x2={mmToSvg(t, 0).x}
            y2={bottomRight.y}
            stroke="#e5e5e5"
            strokeWidth={0.5}
          />
          <line
            x1={origin.x}
            y1={mmToSvg(0, t).y}
            x2={bottomRight.x}
            y2={mmToSvg(0, t).y}
            stroke="#e5e5e5"
            strokeWidth={0.5}
          />
        </React.Fragment>
      ))}
      {/* X-axis tick labels - OUTSIDE below aperture */}
      {ticks.map((t) => (
        <text
          key={`x-${t}`}
          x={mmToSvg(t, 0).x}
          y={bottomRight.y + tickLabelOffset}
          textAnchor="middle"
          className="fill-foreground text-[10px]"
        >
          {t}
        </text>
      ))}
      {/* Y-axis tick labels - OUTSIDE left of aperture */}
      {ticks.map((t) => (
        <text
          key={`y-${t}`}
          x={plotLeft - 10}
          y={mmToSvg(0, t).y}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-foreground text-[10px]"
        >
          {t}
        </text>
      ))}
      {/* Axis labels - outside aperture, no overlap */}
      <text
        x={plotLeft + apertureW / 2}
        y={bottomRight.y + tickLabelOffset + 14}
        textAnchor="middle"
        className="fill-foreground text-xs"
      >
        x [mm]
      </text>
      {/* y [mm] above top-left of aperture, horizontal - no overlap with tick values */}
      <text
        x={plotLeft - 36}
        y={plotTop - 8}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-xs"
      >
        y [mm]
      </text>
      {/* Spots */}
      {spots.map((s) => {
        const { x, y } = mmToSvg(s.x_mm, s.y_mm);
        const spotR = Math.max(1, spotRadiusMm * scale);
        return (
          <circle
            key={s.sequence_index}
            cx={x}
            cy={y}
            r={spotR}
            fill={SPOT_FILL}
            stroke={SPOT_STROKE}
            strokeWidth={0.5}
          />
        );
      })}
    </svg>
  );
});

/** Angle line colors (Version B style). */
const ANGLE_LINE_COLORS = [
  "rgba(100, 150, 255, 0.4)",
  "rgba(255, 180, 100, 0.4)",
  "rgba(100, 200, 150, 0.4)",
  "rgba(200, 100, 255, 0.4)",
];

/** Advanced 25 mm: center coords, X right Y up (y_svg = -y_center for display). */
const AdvancedSchematic = React.forwardRef<
  SVGSVGElement,
  {
    params: GridGeneratorParamsDto;
    spots: GridGeneratorSpotDto[];
    size: { w: number; h: number };
    spotRadiusMm: number;
    showConstruction: boolean;
  }
>(function AdvancedSchematic({ params, spots, size, spotRadiusMm, showConstruction }, ref) {
  // Match simple grid: label area for axis ticks outside aperture
  const labelArea = 44;
  const padding = 36;
  const plotSize = Math.min(size.w - 2 * labelArea, size.h - 2 * padding) - 2 * padding;
  const scale = plotSize / (2 * ADVANCED_RADIUS_MM);
  const cx = size.w / 2;
  const cy = size.h / 2;

  const mmToSvg = (xMm: number, yMm: number) => ({
    x: cx + xMm * scale,
    y: cy - yMm * scale,
  });

  const angleStep = params.angle_step_deg ?? 5;
  // 36 diameters: 0° to 175° (each diameter is full line through center)
  const constructionStep = Math.max(angleStep * 2, 10);
  const angles = Array.from(
    { length: Math.floor(180 / constructionStep) },
    (_, i) => i * constructionStep
  );

  // Inner boundary: spot centers within (12.5 - r) radius
  const innerRadiusMm = ADVANCED_RADIUS_MM - spotRadiusMm;
  const outerR = ADVANCED_RADIUS_MM * scale;
  const innerR = innerRadiusMm * scale;

  const ticks = [-12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12];
  const tickLabelOffset = 14;
  const ringRadii = showConstruction ? [5, 7.5, 10] : [];

  return (
    <svg
      ref={ref}
      className="w-full h-full min-h-[300px] bg-white"
      viewBox={`0 0 ${size.w} ${size.h}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Dotted grid background */}
      {showConstruction &&
        ticks.slice(1, -1).map((t) => (
          <React.Fragment key={`grid-${t}`}>
            <line
              x1={mmToSvg(t, 0).x}
              y1={mmToSvg(t, -ADVANCED_RADIUS_MM).y}
              x2={mmToSvg(t, 0).x}
              y2={mmToSvg(t, ADVANCED_RADIUS_MM).y}
              stroke="#e5e5e5"
              strokeWidth={0.5}
              strokeDasharray="2 2"
            />
            <line
              x1={mmToSvg(-ADVANCED_RADIUS_MM, t).x}
              y1={mmToSvg(0, t).y}
              x2={mmToSvg(ADVANCED_RADIUS_MM, t).x}
              y2={mmToSvg(0, t).y}
              stroke="#e5e5e5"
              strokeWidth={0.5}
              strokeDasharray="2 2"
            />
          </React.Fragment>
        ))}
      {/* Construction rings (dotted gray) */}
      {showConstruction &&
        ringRadii.map((rMm) => (
          <circle
            key={`ring-${rMm}`}
            cx={cx}
            cy={cy}
            r={rMm * scale}
            fill="none"
            stroke="#9ca3af"
            strokeWidth={0.5}
            strokeDasharray="3 3"
          />
        ))}
      {/* Outer boundary (solid) */}
      <circle
        cx={cx}
        cy={cy}
        r={outerR}
        fill="none"
        stroke="#000"
        strokeWidth={2}
      />
      {/* Inner boundary (dashed) - spot placement region */}
      <circle
        cx={cx}
        cy={cy}
        r={innerR}
        fill="none"
        stroke="#000"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {/* Angle lines (radial) */}
      {showConstruction &&
        angles.map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const p1 = mmToSvg(-ADVANCED_RADIUS_MM * cos, -ADVANCED_RADIUS_MM * sin);
          const p2 = mmToSvg(ADVANCED_RADIUS_MM * cos, ADVANCED_RADIUS_MM * sin);
          const color = ANGLE_LINE_COLORS[i % ANGLE_LINE_COLORS.length];
          return (
            <line
              key={deg}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={color}
              strokeWidth={0.8}
            />
          );
        })}
      {/* Axes */}
      <line
        x1={cx - outerR}
        y1={cy}
        x2={cx + outerR}
        y2={cy}
        stroke="#000"
        strokeWidth={1}
      />
      <line
        x1={cx}
        y1={cy + outerR}
        x2={cx}
        y2={cy - outerR}
        stroke="#000"
        strokeWidth={1}
      />
      {/* Axis tick labels - outside circle, like simple grid */}
      {ticks.map((t) => {
        const px = mmToSvg(t, 0);
        const py = mmToSvg(0, t);
        return (
          <React.Fragment key={t}>
            <text
              x={px.x}
              y={cy + outerR + tickLabelOffset}
              textAnchor="middle"
              className="fill-foreground text-[10px]"
            >
              {t}
            </text>
            <text
              x={cx - outerR - tickLabelOffset}
              y={py.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-foreground text-[10px]"
            >
              {t}
            </text>
          </React.Fragment>
        );
      })}
      {/* Axis labels outside aperture - match simple grid style */}
      <text
        x={cx}
        y={cy + outerR + tickLabelOffset + 14}
        textAnchor="middle"
        className="fill-foreground text-xs"
      >
        x [mm]
      </text>
      <text
        x={cx - outerR - tickLabelOffset - 24}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-xs"
      >
        y [mm]
      </text>
      {/* Spots */}
      {spots.map((s) => {
        const { x, y } = mmToSvg(s.x_mm, s.y_mm);
        const spotR = Math.max(1, spotRadiusMm * scale);
        return (
          <circle
            key={s.sequence_index}
            cx={x}
            cy={y}
            r={spotR}
            fill={SPOT_FILL}
            stroke={SPOT_STROKE}
            strokeWidth={0.5}
          />
        );
      })}
    </svg>
  );
});
