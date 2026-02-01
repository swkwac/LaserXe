import * as React from "react";
import {
  fetchImageFile,
  fetchIterationSpots,
  fetchMasks,
} from "@/lib/services/planApi";
import type { MaskDto, SpotDto } from "@/types";

export interface UseIterationPreviewResult {
  imageUrl: string | null;
  masks: MaskDto[];
  spots: SpotDto[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches image file (as object URL), masks, and spots for a given image and iteration.
 * When iterationId is null, returns empty state and does not fetch.
 * Revokes object URL on cleanup or when imageId/iterationId change.
 */
export function useIterationPreview(
  imageId: number,
  iterationId: number | null | undefined
): UseIterationPreviewResult {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [masks, setMasks] = React.useState<MaskDto[]>([]);
  const [spots, setSpots] = React.useState<SpotDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const objectUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (iterationId == null) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setImageUrl(null);
      setMasks([]);
      setSpots([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [blob, masksData, spotsData] = await Promise.all([
          fetchImageFile(imageId),
          fetchMasks(imageId),
          fetchIterationSpots(iterationId),
        ]);
        if (cancelled) return;

        if (blob != null) {
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
          }
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          setImageUrl(url);
        } else {
          setImageUrl(null);
        }
        setMasks(masksData ?? []);
        setSpots(spotsData ?? []);
      } catch (err) {
        if (!cancelled) {
          setImageUrl(null);
          setMasks([]);
          setSpots([]);
          setError(err instanceof Error ? err.message : "Błąd połączenia.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setImageUrl(null);
    };
  }, [imageId, iterationId]);

  return { imageUrl, masks, spots, loading, error };
}
