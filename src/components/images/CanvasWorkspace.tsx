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
      if (disabled || !containerRef.current || !isDrawing) return;
      const img = containerRef.current.querySelector("img");
      if (!img || !imageSize) return;
      const rect = img.getBoundingClientRect();
      const scaleX = rect.width / imageSize.w;
      const scaleY = rect.height / imageSize.h;
      const x = (e.clientX - rect.left) / scaleX;
      const y = (e.clientY - rect.top) / scaleY;
      if (x < 0 || y < 0 || x > imageSize.w || y > imageSize.h) return;
      setDrawingPoints((prev) => [...prev, { x, y }]);
    },
    [disabled, isDrawing, imageSize]
  );

  const handleStartDrawing = React.useCallback(() => {
    setDrawingPoints([]);
    setIsDrawing(true);
    onError?.("");
  }, [onError]);

  const handleCancelDrawing = React.useCallback(() => {
    setDrawingPoints([]);
    setIsDrawing(false);
  }, []);

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
        ) : !isDrawing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleStartDrawing}
            disabled={disabled || !imageUrl}
          >
            Dodaj maskę
          </Button>
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

      {masks.length > 0 && (
        <ul className="space-y-1 text-sm">
          {masks.map((mask) => (
            <li
              key={mask.id}
              className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2"
            >
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CanvasWorkspace;
