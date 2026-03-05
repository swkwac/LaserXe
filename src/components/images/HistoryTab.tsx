import * as React from "react";
import { apiFetch } from "@/lib/api";
import { getAdvancedAlgorithmLabel } from "@/lib/constants";
import type { ImageDto, IterationDto, IterationListResponseDto } from "@/types";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  } catch {
    return iso;
  }
}

export interface HistoryTabProps {
  imageId: number;
  image: ImageDto;
  onShowIteration?: (iterationId: number) => void;
}

type AlgorithmFilter = "all" | "simple" | "advanced";

function HistoryTab({ imageId, onShowIteration }: HistoryTabProps) {
  const [items, setItems] = React.useState<IterationDto[]>([]);
  const [, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [algorithmFilter, setAlgorithmFilter] = React.useState<AlgorithmFilter>("all");

  const fetchList = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: "1",
      page_size: "50",
      sort: "created_at",
      order: "desc",
    });
    if (algorithmFilter !== "all") {
      params.set("algorithm_mode", algorithmFilter);
    }
    try {
      const res = await apiFetch(`/api/images/${imageId}/iterations?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 404) {
          setItems([]);
          setTotal(0);
          return;
        }
        setError("Failed to load iteration history.");
        setItems([]);
        setTotal(0);
        return;
      }
      const data = (await res.json()) as IterationListResponseDto;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      if ((err as Error).message !== "Unauthorized") {
        setError("Connection error.");
        setItems([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [imageId, algorithmFilter]);

  React.useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleAlgorithmFilterChange = React.useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setAlgorithmFilter(e.target.value as AlgorithmFilter);
  }, []);

  const handleDelete = React.useCallback(
    async (iterationId: number) => {
      if (!window.confirm("Czy na pewno usunąć tę iterację (szkic)?")) return;
      setDeletingId(iterationId);
      setError(null);
      try {
        const res = await apiFetch(`/api/iterations/${iterationId}`, {
          method: "DELETE",
        });
        if (res.status === 204) {
          await fetchList();
        } else {
          const data = await res.json().catch(() => ({}));
          setError(typeof data?.detail === "string" ? data.detail : "Nie udało się usunąć iteracji.");
        }
      } catch (err) {
        if ((err as Error).message !== "Unauthorized") {
          setError("Błąd połączenia.");
        }
      } finally {
        setDeletingId(null);
      }
    },
    [fetchList]
  );

  return (
    <div className="space-y-4" aria-label="History tab">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">
          <span data-lang="pl">Historia iteracji</span>
          <span data-lang="en">Iteration history</span>
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            <span data-lang="pl">Algorytm:</span>
            <span data-lang="en">Algorithm:</span>
          </span>
          <select
            value={algorithmFilter}
            onChange={handleAlgorithmFilterChange}
            className="rounded-xl border-2 border-input bg-white px-2 py-1 text-sm focus:border-primary"
            aria-label="Filter by algorithm"
          >
            <option value="all">Wszystkie</option>
            <option value="simple">Prosty</option>
            <option value="advanced">{getAdvancedAlgorithmLabel()}</option>
          </select>
        </label>
      </div>
      {loading && (
        <p className="text-sm text-muted-foreground">
          <span data-lang="pl">Ładowanie…</span>
          <span data-lang="en">Loading…</span>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          <span data-lang="pl">Brak iteracji. Wygeneruj plan w zakładce Plan.</span>
          <span data-lang="en">No iterations. Generate a plan in the Plan tab.</span>
        </p>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm" aria-label="Iterations table">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">
                  <span data-lang="pl">Data</span>
                  <span data-lang="en">Date</span>
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <span data-lang="pl">Status</span>
                  <span data-lang="en">Status</span>
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <span data-lang="pl">Algorytm</span>
                  <span data-lang="en">Algorithm</span>
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <span data-lang="pl">Pokrycie docelowe</span>
                  <span data-lang="en">Target coverage</span>
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <span data-lang="pl">Pokrycie osiągnięte</span>
                  <span data-lang="en">Achieved coverage</span>
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <span data-lang="pl">Punkty</span>
                  <span data-lang="en">Spots</span>
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <span data-lang="pl">Plan poprawny</span>
                  <span data-lang="en">Plan valid</span>
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <span data-lang="pl">Akcje</span>
                  <span data-lang="en">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{formatDate(it.created_at)}</td>
                  <td className="px-3 py-2">{it.status}</td>
                  <td className="px-3 py-2">
                    {it.params_snapshot?.algorithm_mode === "simple"
                      ? "Simple"
                      : it.params_snapshot?.algorithm_mode === "advanced"
                        ? getAdvancedAlgorithmLabel()
                        : "—"}
                  </td>
                  <td className="px-3 py-2">{it.target_coverage_pct ?? "—"} %</td>
                  <td className="px-3 py-2">{it.achieved_coverage_pct ?? "—"} %</td>
                  <td className="px-3 py-2">{it.spots_count ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span data-lang="pl">{it.plan_valid ? "Tak" : "Nie"}</span>
                    <span data-lang="en">{it.plan_valid ? "Yes" : "No"}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={() => onShowIteration?.(it.id)}
                    >
                      <span data-lang="pl">Pokaż</span>
                      <span data-lang="en">Show</span>
                    </button>
                    {it.status === "draft" && (
                      <>
                        {" "}
                        <span className="text-muted-foreground">|</span>{" "}
                        <button
                          type="button"
                          className="text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                          aria-label={`Delete iteration ${it.id}`}
                          disabled={deletingId === it.id}
                          onClick={() => handleDelete(it.id)}
                        >
                          {deletingId === it.id ? (
                            <>
                              <span data-lang="pl">Usuwanie…</span>
                              <span data-lang="en">Deleting…</span>
                            </>
                          ) : (
                            <>
                              <span data-lang="pl">Usuń</span>
                              <span data-lang="en">Delete</span>
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default HistoryTab;
