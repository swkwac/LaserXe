import * as React from "react";
import { cn } from "@/lib/utils";

export interface ApiErrorPanelProps {
  /** Shown above the monospace block (e.g. "Command failed") */
  title?: string;
  /** Full multi-line message; use normalizeClientError() from @/lib/apiErrors */
  message: string;
  className?: string;
}

/**
 * Accessible, scrollable panel for long API / network error text.
 */
export function ApiErrorPanel({ title, message, className }: ApiErrorPanelProps) {
  if (!message.trim()) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "rounded-md border border-destructive/50 bg-destructive/[0.06] p-4 text-left shadow-sm",
        className
      )}
    >
      {title ? <p className="text-sm font-semibold text-destructive">{title}</p> : null}
      <pre
        className={cn(
          "overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-destructive/95",
          "max-h-[min(28rem,55vh)]",
          title ? "mt-2" : "mt-0"
        )}
      >
        {message}
      </pre>
    </div>
  );
}
