import * as React from "react";
import { apiFetch } from "@/lib/api";
import type { AuditLogEntryDto, AuditLogListResponseDto } from "@/types";

const EVENT_TYPES = [
  "",
  "iteration_created",
  "iteration_accepted",
  "iteration_rejected",
  "plan_generated",
  "fallback_used",
] as const;

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pl-PL");
  } catch {
    return iso;
  }
}

function eventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    iteration_created: "Utworzono iterację",
    iteration_accepted: "Iteracja zaakceptowana",
    iteration_rejected: "Iteracja odrzucona",
    plan_generated: "Wygenerowano plan",
    fallback_used: "Użyto fallback",
  };
  return labels[eventType] ?? eventType;
}

export interface AuditLogTabProps {
  /** When set, show audit only for this iteration (GET /api/iterations/{id}/audit-log). */
  iterationIdFilter?: number | null;
  /** When set, enables "Tylko ten obraz" filter (GET /api/images/{id}/audit-log). */
  imageId?: number | null;
}

function AuditLogTab({ iterationIdFilter, imageId }: AuditLogTabProps) {
  const [items, setItems] = React.useState<AuditLogEntryDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [eventType, setEventType] = React.useState<string>("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [onlyThisImage, setOnlyThisImage] = React.useState(false);

  const fetchList = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      params.set("sort", "created_at");
      params.set("order", "desc");
      if (eventType) params.set("event_type", eventType);
      if (fromDate) params.set("from", fromDate + "T00:00:00Z");
      if (toDate) params.set("to", toDate + "T23:59:59Z");

      const url =
        iterationIdFilter != null && !onlyThisImage
          ? `/api/iterations/${iterationIdFilter}/audit-log?${params}`
          : onlyThisImage && imageId != null
            ? `/api/images/${imageId}/audit-log?${params}`
            : `/api/audit-log?${params}`;
      const res = await apiFetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          setItems([]);
          setTotal(0);
          return;
        }
        setError("Nie udało się załadować audytu.");
        setItems([]);
        setTotal(0);
        return;
      }
      const data = (await res.json()) as AuditLogListResponseDto;
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
  }, [iterationIdFilter, imageId, onlyThisImage, page, pageSize, eventType, fromDate, toDate]);

  React.useEffect(() => {
    fetchList();
  }, [fetchList]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4" aria-label="Zakładka Audit log">
      <h2 className="text-sm font-medium">Audit log</h2>
      {iterationIdFilter != null && !onlyThisImage && (
        <p className="text-sm text-muted-foreground">Wpisy tylko dla iteracji #{iterationIdFilter}.</p>
      )}
      {onlyThisImage && imageId != null && (
        <p className="text-sm text-muted-foreground">Wpisy tylko dla obrazu #{imageId}.</p>
      )}

      <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-muted/30 p-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Typ zdarzenia:</span>
          <select
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t || "all"} value={t}>
                {t ? eventTypeLabel(t) : "Wszystkie"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Od:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Do:</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </label>
        {imageId != null && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyThisImage}
              onChange={(e) => {
                setOnlyThisImage(e.target.checked);
                setPage(1);
              }}
              className="rounded border border-input"
            />
            <span className="text-muted-foreground">Tylko ten obraz</span>
          </label>
        )}
        <button
          type="button"
          className="rounded-md border border-input bg-background px-3 py-1 text-sm hover:bg-muted"
          onClick={() => fetchList()}
        >
          Odśwież
        </button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && <p className="text-sm text-muted-foreground">Brak wpisów audytu.</p>}
      {!loading && !error && items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm" aria-label="Tabela audytu">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Id</th>
                  <th className="px-3 py-2 text-left font-medium">Iteracja</th>
                  <th className="px-3 py-2 text-left font-medium">Zdarzenie</th>
                  <th className="px-3 py-2 text-left font-medium">Payload</th>
                  <th className="px-3 py-2 text-left font-medium">User</th>
                  <th className="px-3 py-2 text-left font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{entry.id}</td>
                    <td className="px-3 py-2">{entry.iteration_id ?? "—"}</td>
                    <td className="px-3 py-2">{eventTypeLabel(entry.event_type)}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={JSON.stringify(entry.payload ?? {})}>
                      {entry.payload && Object.keys(entry.payload).length > 0 ? JSON.stringify(entry.payload) : "—"}
                    </td>
                    <td className="px-3 py-2">{entry.user_id ?? "—"}</td>
                    <td className="px-3 py-2">{formatDate(entry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              Strona {page} / {totalPages} (łącznie {total} wpisów)
            </span>
            <button
              type="button"
              className="rounded border border-input px-2 py-1 hover:bg-muted disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Poprzednia
            </button>
            <button
              type="button"
              className="rounded border border-input px-2 py-1 hover:bg-muted disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Następna
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default AuditLogTab;
