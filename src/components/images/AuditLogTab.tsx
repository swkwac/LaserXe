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
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  } catch {
    return iso;
  }
}

function eventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    iteration_created: "Iteration created",
    iteration_accepted: "Iteration accepted",
    iteration_rejected: "Iteration rejected",
    plan_generated: "Plan generated",
    fallback_used: "Fallback used",
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
        setError("Failed to load audit log.");
        setItems([]);
        setTotal(0);
        return;
      }
      const data = (await res.json()) as AuditLogListResponseDto;
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
  }, [iterationIdFilter, imageId, onlyThisImage, page, pageSize, eventType, fromDate, toDate]);

  React.useEffect(() => {
    fetchList();
  }, [fetchList]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4" aria-label="Audit log tab">
      <h2 className="text-sm font-medium">Audit log</h2>
      {iterationIdFilter != null && !onlyThisImage && (
        <p className="text-sm text-muted-foreground">
          <span data-lang="pl">Wpisy tylko dla iteracji #{iterationIdFilter}.</span>
          <span data-lang="en">Entries only for iteration #{iterationIdFilter}.</span>
        </p>
      )}
      {onlyThisImage && imageId != null && (
        <p className="text-sm text-muted-foreground">
          <span data-lang="pl">Wpisy tylko dla obrazu #{imageId}.</span>
          <span data-lang="en">Entries only for image #{imageId}.</span>
        </p>
      )}

      <div className="laserme-card flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            <span data-lang="pl">Typ zdarzenia:</span>
            <span data-lang="en">Event type:</span>
          </span>
          <select
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border-2 border-input bg-white px-2 py-1 text-sm focus:border-primary"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t || "all"} value={t}>
                {t ? eventTypeLabel(t) : "All"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            <span data-lang="pl">Od:</span>
            <span data-lang="en">From:</span>
          </span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border-2 border-input bg-white px-2 py-1 text-sm focus:border-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            <span data-lang="pl">Do:</span>
            <span data-lang="en">To:</span>
          </span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border-2 border-input bg-white px-2 py-1 text-sm focus:border-primary"
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
            <span className="text-muted-foreground">
              <span data-lang="pl">Tylko ten obraz</span>
              <span data-lang="en">Only this image</span>
            </span>
          </label>
        )}
        <button
          type="button"
          className="rounded-xl border-2 border-primary bg-white px-3 py-1 text-sm text-primary hover:bg-primary/5"
          onClick={() => fetchList()}
        >
          <span data-lang="pl">Odśwież</span>
          <span data-lang="en">Refresh</span>
        </button>
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
          <span data-lang="pl">Brak wpisów audytu.</span>
          <span data-lang="en">No audit entries.</span>
        </p>
      )}
      {!loading && !error && items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border-2 border-border">
            <table className="w-full text-sm" aria-label="Audit table">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Id</th>
                  <th className="px-3 py-2 text-left font-medium">
                    <span data-lang="pl">Iteracja</span>
                    <span data-lang="en">Iteration</span>
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    <span data-lang="pl">Zdarzenie</span>
                    <span data-lang="en">Event</span>
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Payload</th>
                  <th className="px-3 py-2 text-left font-medium">User</th>
                  <th className="px-3 py-2 text-left font-medium">
                    <span data-lang="pl">Data</span>
                    <span data-lang="en">Date</span>
                  </th>
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
              <span data-lang="pl">
                Strona {page} / {totalPages} (łącznie {total} wpisów)
              </span>
              <span data-lang="en">
                Page {page} / {totalPages} (total {total} entries)
              </span>
            </span>
            <button
              type="button"
              className="rounded border border-input px-2 py-1 hover:bg-muted disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <span data-lang="pl">Poprzednia</span>
              <span data-lang="en">Previous</span>
            </button>
            <button
              type="button"
              className="rounded border border-input px-2 py-1 hover:bg-muted disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <span data-lang="pl">Następna</span>
              <span data-lang="en">Next</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default AuditLogTab;
