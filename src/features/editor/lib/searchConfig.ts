import type { SearchMatch } from './searchMatch'

/**
 * Mutable configuration for the search & replace extension.
 *
 * The ProseMirror plugin reads from this object on every decoration
 * pass, so writing to these properties takes effect immediately without
 * re-registering the extension.
 *
 * @remarks
 * Updated via the {@link useSearchReplace} hook.
 */
export const searchConfig = {
  isOpen: false,
  query: '',
  replaceText: '',
  caseSensitive: false,
  useRegex: false,
  results: [] as SearchMatch[],
  currentIndex: -1,
}
