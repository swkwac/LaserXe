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
    <nav className="flex flex-wrap items-center gap-2" aria-label="Pagination navigation">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handlePrev}
        disabled={!canPrev}
        aria-label="Previous page"
      >
        <span data-lang="pl">Poprzednia</span>
        <span data-lang="en">Previous</span>
      </Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        <span data-lang="pl">
          Strona {page} z {lastPage} (łącznie {total} pozycji)
        </span>
        <span data-lang="en">
          Page {page} of {lastPage} (total {total} items)
        </span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleNext}
        disabled={!canNext}
        aria-label="Next page"
      >
        <span data-lang="pl">Następna</span>
        <span data-lang="en">Next</span>
      </Button>
      {onPageSizeChange && (
        <select
          className="h-9 rounded-xl border-2 border-input bg-white px-2 text-sm focus:border-primary"
          value={page_size}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Items per page"
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
