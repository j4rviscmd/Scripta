import { useEffect, useRef, useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import type { SaveStatus } from "@/features/editor";

/** Duration in milliseconds to keep the "saved" indicator visible before fading out. */
const SAVED_DISPLAY_MS = 3000;

/**
 * Compact save-status indicator for the editor header.
 *
 * Shows a subtle dot-based indicator reflecting the auto-save state:
 * - `saving` – pulsing dot
 * - `saved`  – check icon only (fades out after 3 s)
 * - `error`  – warning icon + "Save failed"
 * - `idle`   – hidden
 */
export function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  const [display, setDisplay] = useState<SaveStatus | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    clearTimeout(savedTimerRef.current!);

    if (status === "idle") {
      // Keep showing "saved" until its display timer expires
      if (display !== "saved") {
        setDisplay(null);
      }
      return;
    }

    setDisplay(status);

    if (status === "saved") {
      savedTimerRef.current = setTimeout(() => setDisplay(null), SAVED_DISPLAY_MS);
    }
  }, [status]);

  if (!display) return null;

  return (
    <span className="inline-flex items-center text-xs text-muted-foreground">
      {display === "saving" && (
        <span className="h-2 w-2 rounded-full bg-muted-foreground animate-pulse" />
      )}
      {display === "saved" && <Check className="h-3.5 w-3.5" />}
      {display === "error" && (
        <>
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          <span className="text-destructive">Save failed</span>
        </>
      )}
    </span>
  );
}
