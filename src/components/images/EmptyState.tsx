import * as React from "react";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  onAddImage?: () => void;
}

function EmptyState({ onAddImage }: EmptyStateProps) {
  const handleAdd = React.useCallback(() => {
    if (onAddImage) {
      onAddImage();
    } else {
      window.location.href = "/images/new";
    }
  }, [onAddImage]);

  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center"
      role="status"
      aria-label="No images"
    >
      <p className="text-muted-foreground mb-4">
        <span data-lang="pl">Brak obrazów – wgraj pierwszy</span>
        <span data-lang="en">No images yet – upload the first one</span>
      </p>
      <Button type="button" onClick={handleAdd} variant="secondary">
        <span data-lang="pl">Dodaj obraz</span>
        <span data-lang="en">Add image</span>
      </Button>
    </div>
  );
}

export default EmptyState;
