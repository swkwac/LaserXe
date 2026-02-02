import * as React from "react";
import { apiFetch } from "@/lib/api";
import type { ImageDto, MaskDto, MaskListResponseDto, MaskVertexDto } from "@/types";
import CanvasWorkspace from "./CanvasWorkspace";
import WidthMmForm from "./WidthMmForm";

export interface MasksTabProps {
  imageId: number;
  image: ImageDto;
  onImageUpdate?: (image: ImageDto) => void;
  isDemo?: boolean;
}

function MasksTab({ imageId, image, onImageUpdate, isDemo }: MasksTabProps) {
  const [masks, setMasks] = React.useState<MaskDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [imageObjectUrl, setImageObjectUrl] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [maskError, setMaskError] = React.useState<string | null>(null);
  const [editingMaskId, setEditingMaskId] = React.useState<number | null>(null);

  const fetchMasks = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/images/${imageId}/masks`);
      if (!res.ok) {
        if (res.status === 404) {
          setMasks([]);
          return;
        }
        if (res.status === 0) {
          setError("Brak połączenia z API. Sprawdź, czy backend działa (http://localhost:8000).");
        } else {
          setError("Nie udało się załadować masek.");
        }
        setMasks([]);
        return;
      }
      const data = (await res.json()) as MaskListResponseDto;
      setMasks(data.items ?? []);
    } catch (err) {
      if ((err as Error).message !== "Unauthorized") {
        setError("Błąd połączenia. Upewnij się, że backend działa (http://localhost:8000) i że jesteś zalogowany.");
        setMasks([]);
      }
    } finally {
      setLoading(false);
    }
  }, [imageId]);

  React.useEffect(() => {
    fetchMasks();
  }, [fetchMasks]);

  React.useEffect(() => {
    let url: string | null = null;
    (async () => {
      try {
        const res = await apiFetch(`/api/images/${imageId}/file`);
        if (!res.ok) return;
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        setImageObjectUrl(url);
      } catch {
        setImageObjectUrl(null);
      }
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageId]);

  const handleImageUpdate = React.useCallback(
    (updated: ImageDto) => {
      onImageUpdate?.(updated);
    },
    [onImageUpdate]
  );

  const handleSaveMask = React.useCallback(
    async (vertices: MaskVertexDto[], maskLabel?: string | null) => {
      setMaskError(null);
      setSaving(true);
      try {
        const res = await apiFetch(`/api/images/${imageId}/masks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vertices, mask_label: maskLabel ?? null }),
        });
        if (!res.ok) {
          if (res.status === 0) {
            setMaskError("Brak połączenia z API. Sprawdź, czy backend działa (http://localhost:8000) i CORS.");
            return;
          }
          const data = await res.json().catch(() => ({}));
          const msg =
            typeof data?.detail === "string"
              ? data.detail
              : res.status === 400
                ? "Maska poniżej 3% apertury – odrzucona."
                : "Nie udało się zapisać maski.";
          setMaskError(msg);
          return;
        }
        let created: MaskDto;
        try {
          created = (await res.json()) as MaskDto;
        } catch {
          setMaskError("Nieprawidłowa odpowiedź serwera po zapisie maski.");
          return;
        }
        setMasks((prev) => [...prev, created]);
        setMaskError(null);
      } catch (err) {
        if ((err as Error).message !== "Unauthorized") {
          setMaskError(
            "Błąd połączenia. Upewnij się, że backend działa (http://localhost:8000) i że jesteś zalogowany."
          );
        }
      } finally {
        setSaving(false);
      }
    },
    [imageId]
  );

  const handleDeleteMask = React.useCallback(
    async (maskId: number) => {
      setMaskError(null);
      setEditingMaskId((prev) => (prev === maskId ? null : prev));
      setSaving(true);
      try {
        const res = await apiFetch(`/api/images/${imageId}/masks/${maskId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          setMaskError("Nie udało się usunąć maski.");
          return;
        }
        setMasks((prev) => prev.filter((m) => m.id !== maskId));
      } catch (err) {
        if ((err as Error).message !== "Unauthorized") {
          setMaskError("Błąd połączenia.");
        }
      } finally {
        setSaving(false);
      }
    },
    [imageId]
  );

  const handleUpdateMask = React.useCallback(
    async (maskId: number, vertices: MaskVertexDto[], maskLabel?: string | null) => {
      setMaskError(null);
      setSaving(true);
      try {
        const res = await apiFetch(`/api/images/${imageId}/masks/${maskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vertices,
            mask_label: maskLabel ?? masks.find((m) => m.id === maskId)?.mask_label ?? undefined,
          }),
        });
        if (!res.ok) {
          if (res.status === 0) {
            setMaskError("Brak połączenia z API. Sprawdź, czy backend działa (http://localhost:8000) i CORS.");
            return;
          }
          const data = await res.json().catch(() => ({}));
          const msg =
            typeof data?.detail === "string"
              ? data.detail
              : res.status === 400
                ? "Maska poniżej 3% apertury – odrzucona."
                : "Nie udało się zapisać zmian.";
          setMaskError(msg);
          return;
        }
        let updated: MaskDto;
        try {
          updated = (await res.json()) as MaskDto;
        } catch {
          setMaskError("Nieprawidłowa odpowiedź serwera po zapisie maski.");
          return;
        }
        setMasks((prev) => prev.map((m) => (m.id === maskId ? updated : m)));
        setEditingMaskId(null);
        setMaskError(null);
      } catch (err) {
        if ((err as Error).message !== "Unauthorized") {
          setMaskError(
            "Błąd połączenia. Upewnij się, że backend działa (http://localhost:8000) i że jesteś zalogowany."
          );
        }
      } finally {
        setSaving(false);
      }
    },
    [imageId, masks]
  );

  return (
    <div className="space-y-6" aria-label="Zakładka Maski">
      <div className="laserme-card">
        <h2 className="text-sm font-medium mb-2">Szerokość zmiany (skala)</h2>
        <WidthMmForm image={image} onSave={handleImageUpdate} />
      </div>

      <div className="laserme-card">
        <h2 className="text-sm font-medium mb-2">Obszar roboczy – maski</h2>
        {loading && <p className="text-sm text-muted-foreground">Ładowanie masek…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive mb-2">
            {error}
          </p>
        )}
        {maskError && (
          <p role="alert" className="text-sm text-destructive mb-2">
            {maskError}
          </p>
        )}
        {!loading && (
          <CanvasWorkspace
            imageUrl={imageObjectUrl}
            widthMm={image.width_mm}
            masks={masks}
            onSaveMask={handleSaveMask}
            onDeleteMask={handleDeleteMask}
            onUpdateMask={handleUpdateMask}
            onError={setMaskError}
            disabled={saving}
            isDemo={isDemo}
            editingMaskId={editingMaskId}
            onEditingMaskIdChange={setEditingMaskId}
          />
        )}
      </div>
    </div>
  );
}

export default MasksTab;
