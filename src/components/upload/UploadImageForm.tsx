import * as React from "react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import type { ImageDto } from "@/types";

const ALLOWED_TYPES = ["image/png", "image/jpeg"] as const;

function parseDetail(body: unknown): string {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length > 0) {
      const first = d[0];
      if (typeof first === "object" && first !== null && "msg" in first) {
        return String((first as { msg: string }).msg);
      }
      return String(first);
    }
  }
  return "Wystąpił błąd. Spróbuj ponownie.";
}

export interface UploadImageFormProps {
  onSuccess?: (image: ImageDto) => void;
  redirectToDetail?: boolean;
}

function UploadImageForm({ onSuccess, redirectToDetail = true }: UploadImageFormProps) {
  const [file, setFile] = React.useState<File | null>(null);
  // Initial width_mm is arbitrary; proper scale is set later via scale tool on Masks tab.
  const [widthMm] = React.useState("10");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const fileId = useId();
  const widthId = useId();
  const errorId = useId();

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.files?.[0] ?? null;
      setFile(next);
      setErrorMessage(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      if (next && ALLOWED_TYPES.includes(next.type as (typeof ALLOWED_TYPES)[number])) {
        setPreviewUrl(URL.createObjectURL(next));
      }
    },
    [previewUrl]
  );

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setErrorMessage(null);

      if (!file) {
        setErrorMessage("Wybierz plik PNG lub JPG.");
        return;
      }
      if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
        setErrorMessage("Tylko pliki PNG i JPG są dozwolone.");
        return;
      }

      setIsSubmitting(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("width_mm", widthMm);

        const res = await apiFetch("/api/images", {
          method: "POST",
          body: formData,
          // Do not set Content-Type: browser sets multipart/form-data with boundary
        });

        if (!res.ok) {
          if (res.status === 0) {
            setErrorMessage(
              "Brak połączenia z API (sprawdź, czy backend działa: npm run dev w backendzie lub uvicorn main:app --port 8000)."
            );
            return;
          }
          const data = await res.json().catch(() => ({}));
          setErrorMessage(
            res.status === 400
              ? parseDetail(data) || "Tylko pliki PNG i JPG są dozwolone."
              : res.status === 422
                ? parseDetail(data) || "Wypełnij wszystkie pola poprawnie."
                : res.status === 401
                  ? "Sesja wygasła. Zaloguj się ponownie."
                  : "Błąd serwera. Spróbuj ponownie."
          );
          return;
        }

        const data = (await res.json()) as ImageDto;
        onSuccess?.(data);
        if (redirectToDetail && data.id) {
          window.location.href = `/images/${data.id}?tab=masks`;
        }
      } catch (err) {
        if ((err as Error).message !== "Unauthorized") {
          setErrorMessage(
            "Błąd połączenia. Upewnij się, że backend działa (http://localhost:8000) i że jesteś zalogowany."
          );
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [file, widthMm, onSuccess, redirectToDetail]
  );

  const submitDisabled = isSubmitting || !file || !widthMm.trim() || parseFloat(widthMm) <= 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      noValidate
      aria-describedby={errorMessage ? errorId : undefined}
    >
      <div className="space-y-2">
        <Label htmlFor={fileId}>Plik (PNG lub JPG)</Label>
        <Input
          id={fileId}
          type="file"
          accept="image/png, image/jpeg"
          onChange={handleFileChange}
          disabled={isSubmitting}
          aria-invalid={!!errorMessage}
        />
        {previewUrl && (
          <div className="mt-2 aspect-video max-h-48 w-full overflow-hidden rounded-md border border-border bg-muted">
            <img src={previewUrl} alt="Podgląd" className="h-full w-full object-contain" />
          </div>
        )}
      </div>

      {errorMessage && (
        <div
          id={errorId}
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      )}

      <Button type="submit" disabled={submitDisabled} aria-busy={isSubmitting}>
        {isSubmitting ? "Wgrywanie…" : "Wgraj"}
      </Button>
    </form>
  );
}

export default UploadImageForm;
