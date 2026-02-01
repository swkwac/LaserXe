import * as React from "react";
import { apiFetch } from "@/lib/api";
import { getAdvancedAlgorithmLabel } from "@/lib/constants";
import type { ImageDto, IterationDto, IterationListResponseDto } from "@/types";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pl-PL");
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

function HistoryTab({ imageId, image, onShowIteration }: HistoryTabProps) {
  const [items, setItems] = React.useState<IterationDto[]>([]);
  const [total, setTotal] = React.useState(0);
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
      const res = await apiFetch(
        `/api/images/${imageId}/iterations?${params.toString()}`
      );
      if (!res.ok) {
        if (res.status === 404) {
          setItems([]);
          setTotal(0);
          return;
        }
        setError("Nie udało się załadować historii iteracji.");
        setItems([]);
        setTotal(0);
        return;
      }
      const data = (await res.json()) as IterationListResponseDto;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      if ((err as Error).message !== "Unauthorized") {
        setError("Błąd połączenia.");
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

  const handleAlgorithmFilterChange = React.useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setAlgorithmFilter(e.target.value as AlgorithmFilter);
    },
    []
  );

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
          setError(
            typeof data?.detail === "string" ? data.detail : "Nie udało się usunąć iteracji."
          );
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
    <div className="space-y-4" aria-label="Zakładka Historia iteracji">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">Historia iteracji</h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Algorytm:</span>
          <select
            value={algorithmFilter}
            onChange={handleAlgorithmFilterChange}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            aria-label="Filtruj po algorytmie"
          >
            <option value="all">Wszystkie</option>
            <option value="simple">Prosty</option>
            <option value="advanced">{getAdvancedAlgorithmLabel()}</option>
          </select>
        </label>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Brak iteracji. Wygeneruj plan w zakładce Plan.</p>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm" aria-label="Tabela iteracji">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Data</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Algorytm</th>
                <th className="px-3 py-2 text-left font-medium">Pokrycie docelowe</th>
                <th className="px-3 py-2 text-left font-medium">Pokrycie osiągnięte</th>
                <th className="px-3 py-2 text-left font-medium">Punkty</th>
                <th className="px-3 py-2 text-left font-medium">Plan poprawny</th>
                <th className="px-3 py-2 text-left font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{formatDate(it.created_at)}</td>
                  <td className="px-3 py-2">{it.status}</td>
                  <td className="px-3 py-2">
                    {it.params_snapshot?.algorithm_mode === "simple"
                      ? "Prosty"
                      : it.params_snapshot?.algorithm_mode === "advanced"
                        ? getAdvancedAlgorithmLabel()
                        : "—"}
                  </td>
                  <td className="px-3 py-2">{it.target_coverage_pct ?? "—"} %</td>
                  <td className="px-3 py-2">{it.achieved_coverage_pct ?? "—"} %</td>
                  <td className="px-3 py-2">{it.spots_count ?? "—"}</td>
                  <td className="px-3 py-2">{it.plan_valid ? "Tak" : "Nie"}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={() => onShowIteration?.(it.id)}
                    >
                      Pokaż
                    </button>
                    {it.status === "draft" && (
                      <>
                        {" "}
                        <span className="text-muted-foreground">|</span>
                        {" "}
                        <button
                          type="button"
                          className="text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                          aria-label={`Usuń iterację ${it.id}`}
                          disabled={deletingId === it.id}
                          onClick={() => handleDelete(it.id)}
                        >
                          {deletingId === it.id ? "Usuwanie…" : "Usuń"}
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
