/**
 * @module features/sidebar
 *
 * Public API for the sidebar feature module.
 *
 * Re-exports:
 * - {@link NoteSidebar} -- sidebar component displaying notes grouped by relative date.
 * - {@link useDebounce} -- generic hook that delays value updates by a configurable timeout.
 */

export { NoteSidebar } from "./ui/NoteSidebar";
export { useDebounce } from "./hooks/useDebounce";
