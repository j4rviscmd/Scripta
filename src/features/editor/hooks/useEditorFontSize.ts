import { useFontSize } from '@/app/providers/font-size-provider'

/**
 * Manages the editor font size with immediate persistence.
 *
 * This hook delegates to the {@link useFontSize} context hook, which
 * requires a {@link FontSizeProvider} ancestor in the component tree.
 *
 * @returns An object containing the current font size and its setters:
 *   - `fontSize` — Current font size in pixels.
 *   - `setFontSize` — Sets an arbitrary font size (clamped to the allowed range).
 *   - `increase` — Increments font size by one step.
 *   - `decrease` — Decrements font size by one step.
 *   - `reset` — Resets font size to the default value.
 */
export function useEditorFontSize() {
  return useFontSize()
}
