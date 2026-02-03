import * as React from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { fetchMasks } from "@/lib/services/planApi";
import type { ImageDto, MaskDto, MaskVertexDto } from "@/types";

export interface ImageCardProps {
  image: ImageDto;
  /** Optional pre-fetched URL; if not provided, fetches on mount. */
  imageUrl?: string | null;
  /** Gdy true, link do szczegółów zawiera ?demo=1 (tryb demo). */
  demoMode?: boolean;
  /** Called after successful delete; parent should refresh list. */
  onDelete?: (imageId: number) => void;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pl-PL");
  } catch {
    return iso;
  }
}

/** Convert mask vertices (mm) to SVG points (px) using scale (px per mm). */
function mmToPx(vertices: MaskVertexDto[], scale: number): { x: number; y: number }[] {
  return vertices.map((v) => ({ x: v.x * scale, y: v.y * scale }));
}

const MASK_PREVIEW_COLORS = ["rgba(255,255,255,0.5)", "rgba(0,200,100,0.5)", "rgba(80,120,255,0.5)"];

function ImageCard({ image, imageUrl: imageUrlProp, demoMode, onDelete }: ImageCardProps) {
  const [imageUrl, setImageUrl] = React.useState<string | null>(imageUrlProp ?? null);
  const [deleting, setDeleting] = React.useState(false);
  const [masks, setMasks] = React.useState<MaskDto[]>([]);
  const [imageSize, setImageSize] = React.useState<{ w: number; h: number } | null>(null);

  React.useEffect(() => {
    if (imageUrlProp != null) {
      setImageUrl(imageUrlProp);
      return;
    }
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await apiFetch(`/api/images/${image.id}/file`);
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      } catch {
        setImageUrl(null);
      }
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.id, imageUrlProp]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchMasks(image.id);
        if (!cancelled) setMasks(items ?? []);
      } catch {
        if (!cancelled) setMasks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [image.id]);

  const handleImageLoad = React.useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const handleDelete = React.useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!onDelete) return;
      if (!window.confirm("Czy na pewno chcesz usunąć ten obraz? Ta operacja jest nieodwracalna.")) {
        return;
      }
      setDeleting(true);
      try {
        const res = await apiFetch(`/api/images/${image.id}`, { method: "DELETE" });
        if (res.ok) {
          onDelete(image.id);
        }
      } catch {
        // Unauthorized etc. – onDelete not called
      } finally {
        setDeleting(false);
      }
    },
    [image.id, onDelete]
  );

  const scale = imageSize && image.width_mm > 0 ? imageSize.w / image.width_mm : 1;
  const showMaskOverlay = imageUrl && imageSize && masks.length > 0;

  const href = demoMode ? `/images/${image.id}?demo=1` : `/images/${image.id}`;
  const label = `Obraz ${image.id}, szerokość ${image.width_mm} mm, ${formatDate(image.created_at)}`;

  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl border-2 border-primary bg-white shadow-md"
      aria-label={label}
    >
      <div className="aspect-video w-full bg-muted flex items-center justify-center relative overflow-hidden">
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-contain"
              onLoad={handleImageLoad}
            />
            {showMaskOverlay && (
              <svg
                className="absolute inset-0 h-full w-full pointer-events-none"
                style={{ objectFit: "contain" }}
                viewBox={`0 0 ${imageSize.w} ${imageSize.h}`}
                preserveAspectRatio="xMidYMid meet"
                aria-hidden
              >
                {masks.map((mask, idx) => {
                  const vertsPx = mmToPx(mask.vertices, scale);
                  return (
                    <polygon
                      key={mask.id}
                      points={vertsPx.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={MASK_PREVIEW_COLORS[idx % MASK_PREVIEW_COLORS.length]}
                      stroke="rgba(255,255,255,0.9)"
                      strokeWidth={Math.max(1, 2 * (imageSize.w / 400))}
                    />
                  );
                })}
              </svg>
            )}
          </>
        ) : (
          <span className="text-muted-foreground text-sm">Obraz</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-sm text-muted-foreground">Szerokość: {image.width_mm} mm</p>
        <p className="text-xs text-muted-foreground">{formatDate(image.created_at)}</p>
        <div className="flex gap-2 mt-auto">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <a href={href}>Otwórz</a>
          </Button>
          {onDelete && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={deleting}
              aria-busy={deleting}
            >
              {deleting ? "Usuwanie…" : "Usuń"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default ImageCard;
