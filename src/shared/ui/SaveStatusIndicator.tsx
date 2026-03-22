import { useEffect, useRef, useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isTimerActiveRef = useRef(false);

  useEffect(() => {
    clearTimeout(savedTimerRef.current);

    if (status === "idle") {
      if (!isTimerActiveRef.current) {
        setDisplay(null);
      }
      return;
    }

    setDisplay(status);

    if (status === "saved") {
      isTimerActiveRef.current = true;
      savedTimerRef.current = setTimeout(() => {
        setDisplay(null);
        isTimerActiveRef.current = false;
      }, SAVED_DISPLAY_MS);
    }
  }, [status]);

  return (
    <span
      className={cn(
        "inline-flex h-4 items-center text-xs text-muted-foreground",
        !display && "invisible",
      )}
      aria-hidden={!display}
    >
      {display === "saving" && (
        <span className="h-2 w-2 rounded-full bg-muted-foreground animate-pulse" />
      )}
      {display === "saved" && <Check className="h-3.5 w-3.5 text-success" />}
      {display === "error" && (
        <>
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          <span className="text-destructive">Save failed</span>
        </>
      )}
    </span>
  );
}
