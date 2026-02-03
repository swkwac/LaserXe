import * as React from "react";
import { Button } from "@/components/ui/button";
import type { MaskDto, MaskVertexDto } from "@/types";

export interface CanvasWorkspaceProps {
  /** Image URL (e.g. object URL from blob). */
  imageUrl: string | null;
  /** Image width in mm (scale reference). */
  widthMm: number;
  /** Masks to display (vertices in mm). */
  masks: MaskDto[];
  /** Called when user finishes drawing a new polygon (vertices in mm). */
  onSaveMask: (vertices: MaskVertexDto[], maskLabel?: string | null) => void;
  /** Called when user deletes a mask. */
  onDeleteMask: (maskId: number) => void;
  /** Called when user saves edited vertices (PATCH mask). */
  onUpdateMask?: (maskId: number, vertices: MaskVertexDto[], maskLabel?: string | null) => void;
  /** Optional: called when saving fails (e.g. 400 mask &lt;3% aperture). */
  onError?: (message: string) => void;
  /** Optional: called when user calibrates scale using the scale tool (new width_mm in mm). */
  onScaleChange?: (newWidthMm: number) => void;
  /** Disable drawing/delete while saving. */
  disabled?: boolean;
  /** Tryb demo – wyświetl watermark DEMO na canvas. */
  isDemo?: boolean;
  /** ID maski w trybie edycji (przeciąganie wierzchołków). */
  editingMaskId?: number | null;
  /** Wywołane gdy użytkownik wybiera maskę do edycji lub anuluje. */
  onEditingMaskIdChange?: (maskId: number | null) => void;
}

/** Convert mm to px using scale (px per mm). */
function mmToPx(vertices: MaskVertexDto[], scale: number): { x: number; y: number }[] {
  return vertices.map((v) => ({ x: v.x * scale, y: v.y * scale }));
}

/** Polygon metrics from vertices in mm: xSize, ySize (bounding box), area (shoelace). */
function polygonMetrics(vertices: MaskVertexDto[]): { xSizeMm: number; ySizeMm: number; areaMm2: number } {
  if (vertices.length < 3) {
    return { xSizeMm: 0, ySizeMm: 0, areaMm2: 0 };
  }
  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);
  const xSizeMm = Math.max(...xs) - Math.min(...xs);
  const ySizeMm = Math.max(...ys) - Math.min(...ys);
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  const areaMm2 = Math.abs(area) / 2;
  return { xSizeMm, ySizeMm, areaMm2 };
}

/** Convert px to mm. */
function pxToMm(vertices: { x: number; y: number }[], scale: number): MaskVertexDto[] {
  return vertices.map((v) => ({ x: v.x / scale, y: v.y / scale }));
}

const MASK_COLORS = ["rgba(255,255,255,0.4)", "rgba(0,200,100,0.4)", "rgba(80,120,255,0.4)"];

const VERTEX_RADIUS = 8;

function CanvasWorkspace({
  imageUrl,
  widthMm,
  masks,
  onSaveMask,
  onDeleteMask,
  onUpdateMask,
  onError,
  onScaleChange,
  disabled = false,
  isDemo = false,
  editingMaskId = null,
  onEditingMaskIdChange,
}: CanvasWorkspaceProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = React.useState<{ w: number; h: number } | null>(null);
  const [drawingPoints, setDrawingPoints] = React.useState<{ x: number; y: number }[]>([]);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [editedVerticesPx, setEditedVerticesPx] = React.useState<{ x: number; y: number }[] | null>(null);
  const [draggingVertexIndex, setDraggingVertexIndex] = React.useState<number | null>(null);
  const [scaleMode, setScaleMode] = React.useState(false);
  const [scalePoints, setScalePoints] = React.useState<{ x: number; y: number }[]>([]);
  const [scaleMm, setScaleMm] = React.useState("");

  const scale = imageSize && widthMm > 0 ? imageSize.w / widthMm : 1;
  const editingMask = editingMaskId != null ? masks.find((m) => m.id === editingMaskId) : null;
  const editVerticesPx = React.useMemo(
    () => editedVerticesPx ?? (editingMask ? mmToPx(editingMask.vertices, scale) : []),
    [editedVerticesPx, editingMask, scale]
  );

  React.useEffect(() => {
    setEditedVerticesPx(null);
    setDraggingVertexIndex(null);
  }, [editingMaskId]);

  const handleImageLoad = React.useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const handleCanvasClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || !containerRef.current) return;
      const img = containerRef.current.querySelector("img");
      if (!img || !imageSize) return;
      const rect = img.getBoundingClientRect();
      const scaleX = rect.width / imageSize.w;
      const scaleY = rect.height / imageSize.h;
      const x = (e.clientX - rect.left) / scaleX;
      const y = (e.clientY - rect.top) / scaleY;
      if (x < 0 || y < 0 || x > imageSize.w || y > imageSize.h) return;

      // Scale tool mode: first two clicks define calibration line
      if (scaleMode) {
        setScalePoints((prev) => {
          if (prev.length >= 2) return prev;
          return [...prev, { x, y }];
        });
        return;
      }

      if (!isDrawing) return;
      setDrawingPoints((prev) => [...prev, { x, y }]);
    },
    [disabled, isDrawing, imageSize, scaleMode]
  );

  const handleStartDrawing = React.useCallback(() => {
    setScaleMode(false);
    setScalePoints([]);
    setScaleMm("");
    setDrawingPoints([]);
    setIsDrawing(true);
    onError?.("");
  }, [onError]);

  const handleCancelDrawing = React.useCallback(() => {
    setDrawingPoints([]);
    setIsDrawing(false);
  }, []);

  const handleStartScale = React.useCallback(() => {
    setIsDrawing(false);
    setDrawingPoints([]);
    setScaleMode(true);
    setScalePoints([]);
    setScaleMm("");
    onError?.("");
  }, [onError]);

  const handleCancelScale = React.useCallback(() => {
    setScaleMode(false);
    setScalePoints([]);
    setScaleMm("");
  }, []);

  const handleSaveScale = React.useCallback(() => {
    if (!imageSize || scalePoints.length !== 2 || !onScaleChange) return;
    const num = parseFloat(scaleMm);
    if (!Number.isFinite(num) || num <= 0) {
      onError?.("Podaj dodatnią długość odcinka w mm.");
      return;
    }
    const [p1, p2] = scalePoints;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const linePx = Math.hypot(dx, dy);
    if (linePx <= 0) {
      onError?.("Długość odcinka w pikselach jest równa 0.");
      return;
    }
    // px_per_mm = linePx / num; image_width_mm = imageSize.w / px_per_mm
    const newWidthMm = imageSize.w * (num / linePx);
    onScaleChange(newWidthMm);
    setScaleMode(false);
    setScalePoints([]);
    setScaleMm("");
  }, [imageSize, scalePoints, scaleMm, onScaleChange, onError]);

  const handleFinishDrawing = React.useCallback(() => {
    if (drawingPoints.length < 3) {
      onError?.("Dodaj co najmniej 3 punkty, aby zamknąć maskę.");
      return;
    }
    const verticesMm = pxToMm(drawingPoints, scale);
    onSaveMask(verticesMm);
    setDrawingPoints([]);
    setIsDrawing(false);
  }, [drawingPoints, scale, onSaveMask, onError]);

  const handleSaveEdit = React.useCallback(() => {
    if (editingMaskId == null || !onUpdateMask || editVerticesPx.length < 3) return;
    const verticesMm = pxToMm(editVerticesPx, scale);
    onUpdateMask(editingMaskId, verticesMm);
    setEditedVerticesPx(null);
    onEditingMaskIdChange?.(null);
  }, [editingMaskId, onUpdateMask, editVerticesPx, scale, onEditingMaskIdChange]);

  const handleCancelEdit = React.useCallback(() => {
    setEditedVerticesPx(null);
    setDraggingVertexIndex(null);
    onEditingMaskIdChange?.(null);
  }, [onEditingMaskIdChange]);

  const getImageCoords = React.useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const img = containerRef.current?.querySelector("img");
      if (!img || !imageSize) return null;
      const rect = img.getBoundingClientRect();
      const scaleX = rect.width / imageSize.w;
      const scaleY = rect.height / imageSize.h;
      const x = (clientX - rect.left) / scaleX;
      const y = (clientY - rect.top) / scaleY;
      if (x < 0 || y < 0 || x > imageSize.w || y > imageSize.h) return null;
      return { x, y };
    },
    [imageSize]
  );

  React.useEffect(() => {
    if (draggingVertexIndex == null) return;
    const onMove = (e: MouseEvent) => {
      const coords = getImageCoords(e.clientX, e.clientY);
      if (coords) {
        setEditedVerticesPx((prev) => {
          const base = prev ?? editVerticesPx;
          const next = [...base];
          next[draggingVertexIndex] = coords;
          return next;
        });
      }
    };
    const onUp = () => setDraggingVertexIndex(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingVertexIndex, getImageCoords, editVerticesPx]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {editingMaskId != null ? (
          <>
            <Button type="button" size="sm" onClick={handleSaveEdit} disabled={disabled || !onUpdateMask}>
              Zapisz zmiany
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit}>
              Anuluj edycję
            </Button>
          </>
        ) : scaleMode ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveScale}
              disabled={disabled || !imageSize || scalePoints.length !== 2 || !onScaleChange}
            >
              Zapisz skalę
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleCancelScale}>
              Anuluj skalowanie
            </Button>
          </>
        ) : !isDrawing ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStartDrawing}
              disabled={disabled || !imageUrl}
            >
              Dodaj maskę
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStartScale}
              disabled={disabled || !imageUrl}
            >
              Kalibruj skalę
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" onClick={handleFinishDrawing} disabled={disabled}>
              Zakończ rysowanie ({drawingPoints.length} punktów)
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleCancelDrawing}>
              Anuluj
            </Button>
          </>
        )}
      </div>

      <div
        ref={containerRef}
        role="button"
        tabIndex={0}
        className="relative inline-block max-w-full border border-border rounded-md overflow-hidden bg-muted/30"
        style={{ cursor: isDrawing ? "crosshair" : "default" }}
        onClick={handleCanvasClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCanvasClick(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        }}
      >
        {imageUrl && (
          <>
            <img
              src={imageUrl}
              alt="Obraz zmiany skórnej"
              className="block max-h-[70vh] w-auto"
              onLoad={handleImageLoad}
              draggable={false}
              style={{ userSelect: "none", pointerEvents: isDrawing ? "none" : "auto" }}
            />
            {imageSize && (
              <svg
                className="absolute top-0 left-0 w-full h-full"
                style={{
                  width: "100%",
                  height: "100%",
                  pointerEvents: isDrawing ? "none" : "auto",
                }}
                viewBox={`0 0 ${imageSize.w} ${imageSize.h}`}
                preserveAspectRatio="xMidYMid meet"
              >
                {masks.map((mask, idx) => {
                  const vertsPx = editingMaskId === mask.id ? editVerticesPx : mmToPx(mask.vertices, scale);
                  return (
                    <polygon
                      key={mask.id}
                      points={vertsPx.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={MASK_COLORS[idx % MASK_COLORS.length]}
                      stroke={editingMaskId === mask.id ? "rgba(255,180,0,0.95)" : "rgba(255,255,255,0.8)"}
                      strokeWidth={editingMaskId === mask.id ? 3 : 2}
                    />
                  );
                })}
                {scaleMode && scalePoints.length > 0 && (
                  <g>
                    {scalePoints.length === 2 && (
                      <line
                        x1={scalePoints[0].x}
                        y1={scalePoints[0].y}
                        x2={scalePoints[1].x}
                        y2={scalePoints[1].y}
                        stroke="rgba(255,180,0,0.9)"
                        strokeWidth={2}
                      />
                    )}
                    {scalePoints.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={6}
                        fill="rgba(255,200,0,0.9)"
                        stroke="rgba(200,120,0,0.9)"
                        strokeWidth={2}
                      />
                    ))}
                  </g>
                )}
                {editingMaskId != null && editVerticesPx.length > 0 && (
                  <g pointerEvents="all">
                    {editVerticesPx.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={VERTEX_RADIUS}
                        fill="rgba(255,200,0,0.8)"
                        stroke="rgba(200,120,0,0.9)"
                        strokeWidth={2}
                        style={{ cursor: "grab" }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraggingVertexIndex(i);
                        }}
                      />
                    ))}
                  </g>
                )}
                {isDrawing && drawingPoints.length > 0 && (
                  <polygon
                    points={drawingPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="rgba(255,200,0,0.3)"
                    stroke="rgba(255,180,0,0.9)"
                    strokeWidth={2}
                  />
                )}
              </svg>
            )}
          </>
        )}
        {!imageUrl && (
          <div className="flex items-center justify-center w-96 h-48 text-muted-foreground text-sm">
            Ładowanie obrazu…
          </div>
        )}
        {isDemo && imageUrl && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
            <span
              className="text-4xl font-bold text-amber-500/40 select-none -rotate-[-25deg]"
              style={{ textShadow: "0 0 8px rgba(0,0,0,0.3)" }}
            >
              DEMO
            </span>
          </div>
        )}
      </div>

      {scaleMode && imageSize && scalePoints.length === 2 && (
        <div className="text-xs text-muted-foreground space-y-1">
          {(() => {
            const [p1, p2] = scalePoints;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const linePx = Math.hypot(dx, dy);
            return (
              <p>
                Skala: długość odcinka ≈ {linePx.toFixed(1)} px. Podaj długość tego odcinka w mm, aby przeskalować obraz.
              </p>
            );
          })()}
          <div className="flex items-center gap-2">
            <label className="text-xs">
              <span className="mr-1">Długość (mm):</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={scaleMm}
                onChange={(e) => setScaleMm(e.target.value)}
                className="h-7 w-24 rounded border border-input bg-background px-1 text-xs"
              />
            </label>
          </div>
        </div>
      )}

      {masks.length > 0 && (
        <ul className="space-y-1 text-sm">
          {masks.map((mask) => {
            const { xSizeMm, ySizeMm, areaMm2 } = polygonMetrics(mask.vertices);
            return (
              <li
                key={mask.id}
                className="flex flex-col gap-1 rounded border border-border px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>
                    Maska #{mask.id}
                    {mask.mask_label ? ` – ${mask.mask_label}` : ""} ({mask.vertices.length} wierzchołków)
                  </span>
                  <div className="flex gap-1">
                    {editingMaskId === mask.id ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditingMaskIdChange?.(mask.id)}
                        disabled={disabled || !onUpdateMask}
                      >
                        Edytuj
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDeleteMask(mask.id)}
                      disabled={disabled}
                    >
                      Usuń
                    </Button>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-x-4 text-xs text-muted-foreground">
                  <div>
                    <dt className="sr-only">Szerokość X</dt>
                    <dd>X: {xSizeMm.toFixed(2)} mm</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Wysokość Y</dt>
                    <dd>Y: {ySizeMm.toFixed(2)} mm</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Pole</dt>
                    <dd>Pole: {areaMm2.toFixed(2)} mm²</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default CanvasWorkspace;
