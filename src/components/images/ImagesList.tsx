import * as React from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import type { ImageDto, ImageListResponseDto, ImageListQueryCommand } from "@/types";
import ImageCard from "./ImageCard";
import EmptyState from "./EmptyState";
import Pagination from "./Pagination";

const DEFAULT_PAGE_SIZE = 20;
const DEMO_STORAGE_KEY = "laserxe_demo";

export interface ImagesListProps {
  initialPage?: number;
  initialPageSize?: number;
  uploadPath?: string;
}

function buildQuery(params: ImageListQueryCommand): string {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.page_size != null) q.set("page_size", String(params.page_size));
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);
  const s = q.toString();
  return s ? `?${s}` : "";
}

function ImagesList({
  initialPage = 1,
  initialPageSize = DEFAULT_PAGE_SIZE,
  uploadPath = "/images/new",
}: ImagesListProps) {
  const [items, setItems] = React.useState<ImageDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(initialPage);
  const [page_size, setPageSize] = React.useState(initialPageSize);
  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isDemo, setIsDemo] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      try {
        sessionStorage.setItem(DEMO_STORAGE_KEY, "1");
      } catch {
        // ignore
      }
      setIsDemo(true);
    }
  }, []);

  const fetchList = React.useCallback(async (p: number, ps: number) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const query = buildQuery({
        page: p,
        page_size: ps,
        sort: "created_at",
        order: "desc",
      });
      const res = await apiFetch(`/api/images${query}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail =
          typeof data === "object" && data !== null && "detail" in data
            ? String((data as { detail: unknown }).detail)
            : "Błąd ładowania listy.";
        setErrorMessage(detail);
        setItems([]);
        setTotal(0);
        return;
      }
      const data = (await res.json()) as ImageListResponseDto;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? p);
      setPageSize(data.page_size ?? ps);
    } catch (e) {
      if ((e as Error).message !== "Unauthorized") {
        setErrorMessage("Błąd połączenia. Spróbuj ponownie.");
        setItems([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchList(page, page_size);
  }, [page, page_size, fetchList]);

  const handlePageChange = React.useCallback((newPage: number) => {
    setPage(Math.max(1, newPage));
  }, []);

  const handlePageSizeChange = React.useCallback((newSize: number) => {
    setPageSize(Math.max(1, Math.min(100, newSize)));
    setPage(1);
  }, []);

  const handleAddImage = React.useCallback(() => {
    window.location.href = uploadPath;
  }, [uploadPath]);

  const handleRetry = React.useCallback(() => {
    fetchList(page, page_size);
  }, [fetchList, page, page_size]);

  if (loading && items.length === 0) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Ładowanie listy obrazów">
        <div className="h-10 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="aspect-video rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6" aria-label="Lista obrazów">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" onClick={handleAddImage}>
          Dodaj obraz
        </Button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <p>{errorMessage}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={handleRetry}>
            Odśwież
          </Button>
        </div>
      )}

      {!errorMessage && items.length === 0 && <EmptyState onAddImage={handleAddImage} />}

      {!errorMessage && items.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((image) => (
              <ImageCard key={image.id} image={image} demoMode={isDemo} />
            ))}
          </div>
          {total > page_size && (
            <Pagination
              page={page}
              page_size={page_size}
              total={total}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </>
      )}
    </section>
  );
}

export default ImagesList;
