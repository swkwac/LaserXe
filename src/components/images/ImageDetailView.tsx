import * as React from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import type { ImageDto } from "@/types";
import MasksTab from "./MasksTab";
import PlanTab from "./PlanTab";
import HistoryTab from "./HistoryTab";
import AnimationTab from "./AnimationTab";
import AuditLogTab from "./AuditLogTab";

const TABS = [
  { id: "masks", label: "Maski" },
  { id: "plan", label: "Plan" },
  { id: "animation", label: "Animacja" },
  { id: "history", label: "Historia iteracji" },
  { id: "audit", label: "Audit log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isValidTab(t: string): t is TabId {
  return TABS.some((tab) => tab.id === t);
}

const DEMO_STORAGE_KEY = "laserxe_demo";

export interface ImageDetailViewProps {
  imageId: number;
  initialTab?: string;
  initialIterationId?: number;
  /** Tryb demo (z URL ?demo=1 lub sesji). */
  initialDemo?: boolean;
}

function ImageDetailView({
  imageId,
  initialTab = "masks",
  initialIterationId,
  initialDemo = false,
}: ImageDetailViewProps) {
  const [image, setImage] = React.useState<ImageDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedTab, setSelectedTab] = React.useState<TabId>(isValidTab(initialTab) ? initialTab : "masks");
  const [selectedIterationId, setSelectedIterationId] = React.useState<number | null>(initialIterationId ?? null);
  const [isDemo, setIsDemo] = React.useState(initialDemo);

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
      return;
    }
    try {
      if (sessionStorage.getItem(DEMO_STORAGE_KEY) === "1") setIsDemo(true);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    const tabParam = params.get("tab");
    if (tabParam && isValidTab(tabParam)) setSelectedTab(tabParam);
  }, [initialTab]);

  React.useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam && isValidTab(tabParam)) setSelectedTab(tabParam);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/api/images/${imageId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          window.location.href = "/images";
          return;
        }
        if (!res.ok) {
          setError("Nie udało się załadować obrazu.");
          setImage(null);
          return;
        }
        const data = (await res.json()) as ImageDto;
        setImage(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if ((err as Error).message !== "Unauthorized") {
          setError("Błąd połączenia.");
          setImage(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  const setTab = React.useCallback((tab: TabId) => {
    setSelectedTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  if (loading && !image) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Ładowanie szczegółów obrazu">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded bg-muted" />
      </section>
    );
  }

  if (error && !image) {
    return (
      <section role="alert" className="space-y-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" asChild>
          <a href="/images">Powrót do listy</a>
        </Button>
      </section>
    );
  }

  if (!image) return null;

  return (
    <section className="space-y-6" aria-label="Szczegóły obrazu">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <a
              href={isDemo ? "/images?demo=1" : "/images"}
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              ← Powrót do listy
            </a>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Szczegóły obrazu #{image.id}</h1>
          </div>
          {isDemo && (
            <span
              className="inline-flex items-center rounded-md border border-amber-500/60 bg-amber-500/20 px-2.5 py-1 text-sm font-medium text-amber-700 dark:text-amber-400"
              role="status"
              aria-label="Tryb demo"
            >
              Tryb demo
            </span>
          )}
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Zakładki">
        {/* tablist has no native HTML element; div is the standard container for ARIA tablist */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
        <div role="tablist" className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selectedTab === tab.id}
              onClick={() => setTab(tab.id)}
              className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
                selectedTab === tab.id
                  ? "border border-b-0 border-border bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-current={selectedTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="min-h-[200px] rounded-md border border-border bg-muted/30 p-4">
        {selectedTab === "masks" && (
          <MasksTab imageId={imageId} image={image} onImageUpdate={setImage} isDemo={isDemo} />
        )}
        {selectedTab === "plan" && (
          <PlanTab
            imageId={imageId}
            image={image}
            selectedIterationId={selectedIterationId}
            onIterationSelected={setSelectedIterationId}
            onIterationUpdated={() => {
              /* no-op: parent can refresh via other means */
            }}
          />
        )}
        {selectedTab === "animation" && (
          <AnimationTab
            imageId={imageId}
            image={image}
            selectedIterationId={selectedIterationId}
            onSelectIteration={setSelectedIterationId}
            isDemo={isDemo}
          />
        )}
        {selectedTab === "history" && (
          <HistoryTab
            imageId={imageId}
            image={image}
            onShowIteration={(id) => {
              setSelectedIterationId(id);
              setSelectedTab("plan");
              const url = new URL(window.location.href);
              url.searchParams.set("tab", "plan");
              url.searchParams.set("iteration", String(id));
              window.history.replaceState({}, "", url.pathname + url.search);
            }}
          />
        )}
        {selectedTab === "audit" && <AuditLogTab imageId={imageId} iterationIdFilter={selectedIterationId} />}
      </div>
    </section>
  );
}

export default ImageDetailView;
