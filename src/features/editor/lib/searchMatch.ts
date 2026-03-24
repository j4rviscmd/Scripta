import type { Node as ProseMirrorNode } from "prosemirror-model";

/**
 * Represents a single search match within a ProseMirror document,
 * identified by its absolute document positions.
 */
export interface SearchMatch {
  from: number;
  to: number;
}

/**
 * Options that control search behaviour.
 *
 * @property caseSensitive - When `false`, matching ignores case differences.
 * @property useRegex - When `true`, `query` is interpreted as a regular expression.
 */
export interface SearchOptions {
  caseSensitive: boolean;
  useRegex: boolean;
}

/**
 * Scans a ProseMirror document for all occurrences of `query`.
 *
 * Searches across text nodes and maps character offsets back to
 * ProseMirror document positions. Each text node is searched
 * independently — matches spanning block boundaries are not supported.
 *
 * @param doc - The ProseMirror document node to search.
 * @param query - The search string.
 * @param options - Search options (case sensitivity).
 * @returns An array of match positions in document order.
 */
export function findMatches(
  doc: ProseMirrorNode,
  query: string,
  options: SearchOptions,
): SearchMatch[] {
  if (!query) return [];

  const matches: SearchMatch[] = [];
  const { caseSensitive, useRegex } = options;

  if (useRegex) {
    try {
      const flags = caseSensitive ? "g" : "gi";
      const regex = new RegExp(query, flags);
      doc.descendants((node, pos) => {
        if (!node.isText) return;
        const text = node.text!;
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
          matches.push({ from: pos + m.index, to: pos + m.index + m[0].length });
          if (m[0].length === 0) regex.lastIndex++;
        }
      });
    } catch {
      return [];
    }
  } else {
    const needle = caseSensitive ? query : query.toLowerCase();
    doc.descendants((node, pos) => {
      if (!node.isText) return;
      const text = caseSensitive ? node.text! : node.text!.toLowerCase();
      let index = text.indexOf(needle);
      while (index !== -1) {
        matches.push({ from: pos + index, to: pos + index + needle.length });
        index = text.indexOf(needle, index + 1);
      }
    });
  }

  return matches;
}
