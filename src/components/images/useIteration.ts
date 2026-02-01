import * as React from "react";
import { fetchIteration } from "@/lib/services/planApi";
import type { IterationDto } from "@/types";

export interface UseIterationResult {
  iteration: IterationDto | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches a single iteration by id. When iterationId is null, returns null iteration and does not fetch.
 * Revokes no resources; suitable for JSON-only response.
 */
export function useIteration(
  iterationId: number | null | undefined
): UseIterationResult {
  const [iteration, setIteration] = React.useState<IterationDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (iterationId == null) {
      setIteration(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchIteration(iterationId)
      .then((data) => {
        if (cancelled) return;
        setIteration(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setIteration(null);
        setError(err instanceof Error ? err.message : "Błąd połączenia.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [iterationId]);

  return { iteration, loading, error };
}
