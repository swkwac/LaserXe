/**
 * 2D preview of waypoints: X = linear_mm, Y = rotation_deg.
 * Draws points and lines connecting them in order.
 */
import * as React from "react";
import type { DeviceWaypointDto } from "@/types";

interface PatternPreviewProps {
  waypoints: DeviceWaypointDto[];
  /** Optional axis limits; if not provided, derived from data + padding */
  linearMin?: number;
  linearMax?: number;
  rotationMin?: number;
  rotationMax?: number;
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 160;

export function PatternPreview({
  waypoints,
  linearMin,
  linearMax,
  rotationMin,
  rotationMax,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: PatternPreviewProps) {
  const padding = { top: 16, right: 16, bottom: 16, left: 16 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const lins = waypoints.map((w) => w.linear_mm);
  const rots = waypoints.map((w) => w.rotation_deg);
  const linLo = linearMin ?? Math.min(...lins, 0) - 1;
  const linHi = linearMax ?? Math.max(...lins, 0) + 1;
  const rotLo = rotationMin ?? Math.min(...rots, 0) - 5;
  const rotHi = rotationMax ?? Math.max(...rots, 0) + 5;

  const scaleX = (v: number) =>
    padding.left + ((v - linLo) / (linHi - linLo || 1)) * plotW;
  const scaleY = (v: number) => {
    const t = (v - rotLo) / (rotHi - rotLo || 1);
    return padding.top + plotH - t * plotH;
  };

  const pts = waypoints.map((w) => ({ x: scaleX(w.linear_mm), y: scaleY(w.rotation_deg) }));

  if (waypoints.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 text-sm text-muted-foreground"
        style={{ width, height }}
      >
        <span data-lang="pl">Brak punktów</span>
        <span data-lang="en">No waypoints</span>
      </div>
    );
  }

  const pathD =
    pts.length >= 2
      ? pts
          .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
          .join(" ")
      : "";

  return (
    <svg
      width={width}
      height={height}
      className="rounded-md border border-border bg-muted/10"
      aria-label="Pattern preview"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="currentColor" />
        </marker>
      </defs>
      {/* Axes */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke="currentColor"
        strokeWidth="1"
        opacity={0.3}
      />
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="currentColor"
        strokeWidth="1"
        opacity={0.3}
      />
      {/* Path */}
      {pathD && (
        <path
          d={pathD}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd="url(#arrowhead)"
        />
      )}
      {/* Points */}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={4}
          fill="hsl(var(--primary))"
          stroke="hsl(var(--background))"
          strokeWidth="2"
        />
      ))}
      {/* Labels */}
      <text
        x={width - padding.right - 4}
        y={height - 4}
        fontSize="9"
        fill="currentColor"
        opacity={0.6}
        textAnchor="end"
      >
        linear (mm)
      </text>
      <text
        x={padding.left + 4}
        y={12}
        fontSize="9"
        fill="currentColor"
        opacity={0.6}
      >
        rotation (°)
      </text>
    </svg>
  );
}
