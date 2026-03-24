import { createExtension } from "@blocknote/core";
import { createSearchPlugin } from "./searchPlugin";

/**
 * BlockNote extension for in-editor search & replace.
 *
 * Wraps the ProseMirror search plugin in a BlockNote extension,
 * following the same pattern as {@link cursorCenteringExtension}.
 */
export const searchExtension = createExtension({
  key: "searchReplace",
  prosemirrorPlugins: [createSearchPlugin()],
});
