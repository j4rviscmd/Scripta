import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ScrollToTopButtonProps {
  /** Whether the button is visible (scrolled past threshold). */
  visible: boolean;
  /** Callback invoked when the button is clicked. */
  onClick: () => void;
}

/**
 * Round icon button that scrolls the editor to the top.
 *
 * Fades in when `visible` is `true` and fades out when `false`,
 * with `pointer-events-none` while hidden to prevent phantom clicks.
 */
export function ScrollToTopButton({ visible, onClick }: ScrollToTopButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Scroll to top"
      className={cn(
        "pointer-events-auto rounded-full",
        "transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      <ArrowUp className="size-4" />
    </Button>
  );
}
