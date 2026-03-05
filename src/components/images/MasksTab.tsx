import * as React from "react";
import { apiFetch } from "@/lib/api";
import type { ImageDto, MaskDto, MaskListResponseDto, MaskVertexDto } from "@/types";
import CanvasWorkspace from "./CanvasWorkspace";

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
          setError("Cannot connect to API. Check that the backend is running (http://localhost:8000).");
        } else {
          setError("Failed to load masks.");
        }
        setMasks([]);
        return;
      }
      const data = (await res.json()) as MaskListResponseDto;
      setMasks(data.items ?? []);
      } catch (err) {
        if ((err as Error).message !== "Unauthorized") {
          setError("Connection error. Make sure the backend is running (http://localhost:8000) and that you are logged in.");
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

  const handleScaleChange = React.useCallback(
    async (newWidthMm: number) => {
      setMaskError(null);
      if (!Number.isFinite(newWidthMm) || newWidthMm <= 0) {
        setMaskError("New image width must be greater than 0 mm.");
        return;
      }
      const oldWidthMm = image.width_mm;
      if (oldWidthMm <= 0) {
        setMaskError("Current scale is invalid.");
        return;
      }
      const scaleFactor = newWidthMm / oldWidthMm;
      setSaving(true);
      try {
        // 1. Update image scale (primary source of truth)
        const res = await apiFetch(`/api/images/${imageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ width_mm: newWidthMm }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const detail = typeof data?.detail === "string" ? data.detail : "Failed to save scale.";
          setMaskError(detail);
          return;
        }
        const updatedImage = (await res.json()) as ImageDto;
        // 2. Rescale all mask vertices so they stay aligned with the image
        const updatedMasks: MaskDto[] = [];
        for (const mask of masks) {
          const rescaledVertices: MaskVertexDto[] = mask.vertices.map((v) => ({
            x: v.x * scaleFactor,
            y: v.y * scaleFactor,
          }));
          const patchRes = await apiFetch(`/api/images/${imageId}/masks/${mask.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vertices: rescaledVertices }),
          });
          if (!patchRes.ok) {
            setMaskError("Nie udało się przeskalować masek.");
            // Rollback: revert image to old scale
            await apiFetch(`/api/images/${imageId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ width_mm: oldWidthMm }),
            });
            return;
          }
          const patched = (await patchRes.json()) as MaskDto;
          updatedMasks.push(patched);
        }
        setMasks(updatedMasks.length > 0 ? updatedMasks : masks);
        onImageUpdate?.(updatedImage);
      } catch (err) {
        if ((err as Error).message !== "Unauthorized") {
          setMaskError("Błąd połączenia podczas zapisu skali.");
        }
      } finally {
        setSaving(false);
      }
    },
    [imageId, image.width_mm, masks, onImageUpdate]
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
            setMaskError("Cannot connect to API. Check that the backend is running (http://localhost:8000) and CORS is configured.");
            return;
          }
          const data = await res.json().catch(() => ({}));
          const msg =
            typeof data?.detail === "string"
              ? data.detail
              : res.status === 400
                ? "Mask below 3% of aperture – rejected."
                : "Failed to save mask.";
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
            "Connection error. Make sure the backend is running (http://localhost:8000) and that you are logged in."
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
          setMaskError("Failed to delete mask.");
          return;
        }
        setMasks((prev) => prev.filter((m) => m.id !== maskId));
      } catch (err) {
        if ((err as Error).message !== "Unauthorized") {
          setMaskError("Connection error.");
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
            setMaskError("Cannot connect to API. Check that the backend is running (http://localhost:8000) and CORS is configured.");
            return;
          }
          const data = await res.json().catch(() => ({}));
          const msg =
            typeof data?.detail === "string"
              ? data.detail
              : res.status === 400
                ? "Mask below 3% of aperture – rejected."
                : "Failed to save changes.";
          setMaskError(msg);
          return;
        }
        let updated: MaskDto;
        try {
          updated = (await res.json()) as MaskDto;
        } catch {
          setMaskError("Invalid server response when saving mask.");
          return;
        }
        setMasks((prev) => prev.map((m) => (m.id === maskId ? updated : m)));
        setEditingMaskId(null);
        setMaskError(null);
      } catch (err) {
        if ((err as Error).message !== "Unauthorized") {
          setMaskError(
            "Connection error. Make sure the backend is running (http://localhost:8000) and that you are logged in."
          );
        }
      } finally {
        setSaving(false);
      }
    },
    [imageId, masks]
  );

  return (
    <div className="space-y-6" aria-label="Masks tab">
      <div className="laserme-card">
        <h2 className="text-sm font-medium mb-2">
          <span data-lang="pl">Obszar roboczy – maski</span>
          <span data-lang="en">Workspace – masks</span>
        </h2>
        {loading && (
          <p className="text-sm text-muted-foreground">
            <span data-lang="pl">Ładowanie masek…</span>
            <span data-lang="en">Loading masks…</span>
          </p>
        )}
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
            onScaleChange={handleScaleChange}
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
