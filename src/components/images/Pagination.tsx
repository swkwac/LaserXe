import * as React from "react";
import { Button } from "@/components/ui/button";

export interface PaginationProps {
  page: number;
  page_size: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (page_size: number) => void;
}

const PAGE_SIZES = [10, 20, 50, 100] as const;

function Pagination({ page, page_size, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / page_size));
  const canPrev = page > 1;
  const canNext = page < lastPage;

  const handlePrev = React.useCallback(() => {
    if (canPrev) onPageChange(page - 1);
  }, [canPrev, page, onPageChange]);

  const handleNext = React.useCallback(() => {
    if (canNext) onPageChange(page + 1);
  }, [canNext, page, onPageChange]);

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Nawigacja paginacji">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handlePrev}
        disabled={!canPrev}
        aria-label="Poprzednia strona"
      >
        Poprzednia
      </Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        Strona {page} z {lastPage} (łącznie {total} pozycji)
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleNext}
        disabled={!canNext}
        aria-label="Następna strona"
      >
        Następna
      </Button>
      {onPageSizeChange && (
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={page_size}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Liczba na stronie"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      )}
    </nav>
  );
}

export default Pagination;
