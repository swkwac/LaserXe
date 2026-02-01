import * as React from "react";
import {
  fetchImageFile,
  fetchIterationSpots,
  fetchIterations,
  fetchMasks,
} from "@/lib/services/planApi";
import type { IterationDto, MaskDto, SpotDto } from "@/types";

export interface UseAnimationTabDataResult {
  imageObjectUrl: string | null;
  iterations: IterationDto[];
  masks: MaskDto[];
  spots: SpotDto[];
  /** Resolved: selectedFromParent ?? first iteration id ?? null */
  selectedIterationId: number | null;
  loadingIterations: boolean;
  loadingSpots: boolean;
  /** User-facing error when iterations fetch fails (network/API). Cleared when refetch succeeds. */
  errorIterations: string | null;
  /** User-facing error when spots fetch fails. */
  errorSpots: string | null;
  /** User-facing error when image file fetch fails. */
  errorImage: string | null;
}

const ERROR_ITERATIONS = "Nie udało się załadować iteracji.";
const ERROR_SPOTS = "Nie udało się załadować punktów.";
const ERROR_IMAGE = "Nie udało się załadować obrazu.";

/**
 * Fetches image file, iterations, masks, and spots for the animation tab.
 * All API calls go through planApi (no direct apiFetch) for consistent URLs and error handling.
 * Uses AbortController so only the latest request updates state when imageId/selectedIterationId change.
 * When selectedFromParent is null, resolves to first iteration id once iterations load.
 * Revokes object URL on cleanup or when imageId changes.
 */
export function useAnimationTabData(
  imageId: number,
  selectedFromParent: number | null
): UseAnimationTabDataResult {
  const [imageObjectUrl, setImageObjectUrl] = React.useState<string | null>(null);
  const [iterations, setIterations] = React.useState<IterationDto[]>([]);
  const [masks, setMasks] = React.useState<MaskDto[]>([]);
  const [spots, setSpots] = React.useState<SpotDto[]>([]);
  const [loadingIterations, setLoadingIterations] = React.useState(true);
  const [loadingSpots, setLoadingSpots] = React.useState(false);
  const [errorIterations, setErrorIterations] = React.useState<string | null>(null);
  const [errorSpots, setErrorSpots] = React.useState<string | null>(null);
  const [errorImage, setErrorImage] = React.useState<string | null>(null);

  const objectUrlRef = React.useRef<string | null>(null);

  // Revoke object URL when imageId changes or on unmount
  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
        setImageObjectUrl(null);
      }
    };
  }, [imageId]);

  // Image file
  React.useEffect(() => {
    const ac = new AbortController();
    setErrorImage(null);
    (async () => {
      try {
        const blob = await fetchImageFile(imageId, { signal: ac.signal });
        if (!blob) {
          setErrorImage(ERROR_IMAGE);
          return;
        }
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setImageObjectUrl(url);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setErrorImage(ERROR_IMAGE);
        setImageObjectUrl(null);
      }
    })();
    return () => ac.abort();
  }, [imageId]);

  // Iterations
  React.useEffect(() => {
    const ac = new AbortController();
    setLoadingIterations(true);
    setErrorIterations(null);
    (async () => {
      try {
        const items = await fetchIterations(imageId, { signal: ac.signal });
        setIterations(items);
        setLoadingIterations(false);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setErrorIterations(ERROR_ITERATIONS);
        setIterations([]);
        setLoadingIterations(false);
      }
    })();
    return () => ac.abort();
  }, [imageId]);

  // Masks
  React.useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const items = await fetchMasks(imageId, { signal: ac.signal });
        setMasks(items);
      } catch {
        if (ac.signal.aborted) return;
        setMasks([]);
      }
    })();
    return () => ac.abort();
  }, [imageId]);

  const selectedIterationId = selectedFromParent ?? (iterations[0]?.id ?? null);

  // Spots (when iteration selected)
  React.useEffect(() => {
    if (selectedIterationId == null) {
      setSpots([]);
      setLoadingSpots(false);
      setErrorSpots(null);
      return;
    }
    const ac = new AbortController();
    setLoadingSpots(true);
    setErrorSpots(null);
    (async () => {
      try {
        const items = await fetchIterationSpots(selectedIterationId, {
          signal: ac.signal,
        });
        setSpots(items);
        setLoadingSpots(false);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setErrorSpots(ERROR_SPOTS);
        setSpots([]);
        setLoadingSpots(false);
      }
    })();
    return () => ac.abort();
  }, [selectedIterationId]);

  return {
    imageObjectUrl,
    iterations,
    masks,
    spots,
    selectedIterationId,
    loadingIterations,
    loadingSpots,
    errorIterations,
    errorSpots,
    errorImage,
  };
}
