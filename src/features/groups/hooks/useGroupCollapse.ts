import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/app/providers/store-provider";

/**
 * Persists the collapsed/expanded state of each group to `configStore`.
 *
 * Groups default to expanded; only explicitly collapsed groups are tracked.
 */
export function useGroupCollapse() {
  const { config } = useAppStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    config
      .get<Record<string, boolean>>("groupCollapseState")
      .then((state) => {
        if (state) setCollapsed(state);
      })
      .catch(console.error);
  }, [config]);

  const toggle = useCallback(
    (groupId: string) => {
      setCollapsed((prev) => {
        const next = { ...prev, [groupId]: !prev[groupId] };
        config.set("groupCollapseState", next).catch(console.error);
        return next;
      });
    },
    [config],
  );

  const isCollapsed = useCallback(
    (groupId: string) => collapsed[groupId] ?? false,
    [collapsed],
  );

  return { isCollapsed, toggle };
}
