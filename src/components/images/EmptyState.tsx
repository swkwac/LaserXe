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
      aria-label="Brak obrazów"
    >
      <p className="text-muted-foreground mb-4">Brak obrazów – wgraj pierwszy</p>
      <Button type="button" onClick={handleAdd} variant="secondary">
        Dodaj obraz
      </Button>
    </div>
  );
}

export default EmptyState;
