import * as React from "react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import type { ImageDto } from "@/types";

export interface WidthMmFormProps {
  image: ImageDto;
  onSave?: (image: ImageDto) => void;
}

function WidthMmForm({ image, onSave }: WidthMmFormProps) {
  const [value, setValue] = React.useState(String(image.width_mm));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const widthId = useId();

  React.useEffect(() => {
    setValue(String(image.width_mm));
  }, [image.id, image.width_mm]);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      const num = parseFloat(value);
      if (!Number.isFinite(num) || num <= 0) {
        setError("Podaj wartość większą od 0.");
        return;
      }
      setSaving(true);
      try {
        const res = await apiFetch(`/api/images/${image.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ width_mm: num }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(typeof data?.detail === "string" ? data.detail : "Nie udało się zapisać.");
          return;
        }
        const updated = (await res.json()) as ImageDto;
        onSave?.(updated);
      } catch (err) {
        if ((err as Error).message !== "Unauthorized") setError("Błąd połączenia.");
      } finally {
        setSaving(false);
      }
    },
    [image.id, value, onSave]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={widthId}>Szerokość zmiany (mm)</Label>
        <Input
          id={widthId}
          type="number"
          min={0.1}
          step={0.1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          disabled={saving}
          aria-invalid={!!error}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Zmiana skali unieważnia istniejące iteracje (metryki będą nieaktualne).
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving} aria-busy={saving}>
        {saving ? "Zapisywanie…" : "Zapisz"}
      </Button>
    </form>
  );
}

export default WidthMmForm;
