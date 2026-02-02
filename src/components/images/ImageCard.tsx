import * as React from "react";
import { Button } from "@/components/ui/button";
import type { ImageDto } from "@/types";

export interface ImageCardProps {
  image: ImageDto;
  imageUrl?: string | null;
  /** Gdy true, link do szczegółów zawiera ?demo=1 (tryb demo). */
  demoMode?: boolean;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pl-PL");
  } catch {
    return iso;
  }
}

function ImageCard({ image, imageUrl, demoMode }: ImageCardProps) {
  const href = demoMode ? `/images/${image.id}?demo=1` : `/images/${image.id}`;
  const label = `Obraz ${image.id}, szerokość ${image.width_mm} mm, ${formatDate(image.created_at)}`;

  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl border-2 border-primary bg-white shadow-md"
      aria-label={label}
    >
      <div className="aspect-video w-full bg-muted flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-muted-foreground text-sm">Obraz</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-sm text-muted-foreground">Szerokość: {image.width_mm} mm</p>
        <p className="text-xs text-muted-foreground">{formatDate(image.created_at)}</p>
        <Button asChild variant="outline" size="sm" className="mt-auto">
          <a href={href}>Otwórz</a>
        </Button>
      </div>
    </article>
  );
}

export default ImageCard;
