/**
 * Editor interaction helpers for E2E tests.
 *
 * Uses `document.execCommand` and DOM manipulation for ProseMirror-compatible
 * interactions, following patterns proven in app-launch.e2e.ts.
 */

import * as S from "./selectors.js";

// ── Basic text input ──

/**
 * Type text into the focused editor via `execCommand` (ProseMirror-compatible).
 *
 * @param text - The text string to insert at the current cursor position
 */
export async function typeText(text: string): Promise<void> {
  await browser.execute((t: string) => {
    document.execCommand("insertText", false, t);
  }, text);
  await browser.pause(200);
}

/**
 * Type text character by character via separate `execCommand` calls.
 * Required for triggering ProseMirror input rules (e.g., markdown shortcuts).
 *
 * @param text - The text string whose characters are inserted one at a time
 */
export async function typeTextCharByChar(text: string): Promise<void> {
  for (const char of text) {
    await browser.execute((c: string) => {
      document.execCommand("insertText", false, c);
    }, char);
    await browser.pause(50);
  }
  await browser.pause(200);
}

/** Press Enter to create a new paragraph block via insertParagraph. */
export async function pressEnter(): Promise<void> {
  await browser.execute(() => {
    document.execCommand("insertParagraph", false);
  });
  await browser.pause(200);
}

/** Press Escape. */
export async function pressEscape(): Promise<void> {
  await browser.keys(["Escape"]);
  await browser.pause(200);
}

/**
 * Press Backspace one or more times.
 *
 * @param n - Number of backspace key presses (defaults to 1)
 */
export async function pressBackspace(n = 1): Promise<void> {
  for (let i = 0; i < n; i++) {
    await browser.keys(["Backspace"]);
  }
  await browser.pause(100);
}

// ── Text selection ──

/** Move cursor to end of editor content. */
export async function moveCursorToEnd(): Promise<void> {
  await browser.execute(() => {
    const pm = document.querySelector(".ProseMirror") as HTMLElement;
    if (pm) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.selectAllChildren(pm);
      sel?.collapseToEnd();
    }
  });
  await browser.pause(200);
}

/**
 * Move cursor to very end of editor and create a new paragraph.
 * Useful for exiting complex blocks (code blocks, lists, tables, columns).
 */
export async function moveToEndAndNewParagraph(): Promise<void> {
  await browser.execute(() => {
    const pm = document.querySelector(".ProseMirror") as HTMLElement;
    if (pm) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.selectAllChildren(pm);
      sel?.collapseToEnd();
      document.execCommand("insertParagraph", false);
    }
  });
  await browser.pause(300);
}

// ── Inline formatting via execCommand (ProseMirror-compatible) ──
// Selection + formatting MUST be in a single browser.execute() call
// to maintain ProseMirror state consistency.

/** Select text in last block and apply bold formatting. */
export async function selectAndApplyBold(): Promise<void> {
  await browser.execute(() => {
    const blocks = document.querySelectorAll(".bn-block-content .bn-inline-content");
    let target: Element | null = null;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].textContent?.trim()) { target = blocks[i]; break; }
    }
    if (target) {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand("bold", false);
    }
  });
  await browser.pause(200);
}

/** Select text in last block and apply italic formatting. */
export async function selectAndApplyItalic(): Promise<void> {
  await browser.execute(() => {
    const blocks = document.querySelectorAll(".bn-block-content .bn-inline-content");
    let target: Element | null = null;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].textContent?.trim()) { target = blocks[i]; break; }
    }
    if (target) {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand("italic", false);
    }
  });
  await browser.pause(200);
}

/** Select text in last block and apply underline formatting. */
export async function selectAndApplyUnderline(): Promise<void> {
  await browser.execute(() => {
    const blocks = document.querySelectorAll(".bn-block-content .bn-inline-content");
    let target: Element | null = null;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].textContent?.trim()) { target = blocks[i]; break; }
    }
    if (target) {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand("underline", false);
    }
  });
  await browser.pause(200);
}

/** Select text in last block and apply strikethrough formatting. */
export async function selectAndApplyStrikethrough(): Promise<void> {
  await browser.execute(() => {
    const blocks = document.querySelectorAll(".bn-block-content .bn-inline-content");
    let target: Element | null = null;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].textContent?.trim()) { target = blocks[i]; break; }
    }
    if (target) {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand("strikeThrough", false);
    }
  });
  await browser.pause(200);
}

/**
 * Select text in last non-empty block for toolbar-based operations.
 * Used for inline code and link creation which need toolbar button clicks.
 */
export async function selectTextInLastBlock(): Promise<void> {
  await browser.execute(() => {
    const blocks = document.querySelectorAll(
      ".bn-block-content .bn-inline-content"
    );
    let target: Element | null = null;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].textContent?.trim()) { target = blocks[i]; break; }
    }
    if (target) {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      // Dispatch selectionchange so ProseMirror updates and shows toolbar
      document.dispatchEvent(new Event("selectionchange"));
    }
  });
  await browser.pause(300);
}

// ── Slash menu ──

/**
 * Open the slash menu by typing "/" and select an item by keyword.
 * @param keyword - Text to filter slash menu items (e.g., "heading1", "bullet")
 */
export async function slashCommand(keyword: string): Promise<void> {
  // Type "/" via execCommand to trigger BlockNote's suggestion menu
  await browser.execute(() => {
    document.execCommand("insertText", false, "/");
  });
  await browser.pause(500);

  // Wait for suggestion menu to appear
  await browser.waitUntil(
    async () => {
      const menu = await browser.$(S.SUGGESTION_MENU);
      return await menu.isExisting();
    },
    { timeout: 5_000, timeoutMsg: "Slash menu did not appear" }
  );

  // Type filter text via execCommand
  await browser.execute((kw: string) => {
    document.execCommand("insertText", false, kw);
  }, keyword);
  await browser.pause(500);

  // Press Enter to select the first matching item
  await browser.keys(["Enter"]);
  await browser.pause(500);
}

// ── Side menu / drag handle ──

/**
 * Hover a block to reveal the side menu, then click the drag handle
 * to open the context menu.
 *
 * @param blockSelector - CSS selector for the target block element to hover
 * @throws Throws if the drag handle does not appear within 3 seconds
 */
export async function openDragHandleMenu(
  blockSelector: string
): Promise<void> {
  const block = await browser.$(blockSelector);
  await block.moveTo();
  await browser.pause(300);

  const handle = await browser.$(S.DRAG_HANDLE);
  await browser.waitUntil(async () => handle.isDisplayed(), {
    timeout: 3_000,
    timeoutMsg: "Drag handle did not appear",
  });
  await handle.click();
  await browser.pause(300);
}

/**
 * Click a drag-handle menu item by text content.
 * Call {@link openDragHandleMenu} first.
 *
 * @param label - Text content to match within the menu item
 */
export async function clickDragMenuItem(label: string): Promise<void> {
  await browser.execute((lbl: string) => {
    const items = document.querySelectorAll(
      '[class*="mantine-Menu-item"]'
    );
    for (const item of items) {
      if (item.textContent?.includes(lbl)) {
        (item as HTMLElement).click();
        return;
      }
    }
  }, label);
  await browser.pause(400);
}

// ── Link operations ──

/**
 * Edit a link via the link toolbar → "Edit Link" button.
 * The link must already be focused/selected.
 */
export async function clickEditLink(): Promise<void> {
  const toolbar = await browser.$(S.LINK_TOOLBAR);
  await browser.waitUntil(async () => toolbar.isDisplayed(), {
    timeout: 3_000,
    timeoutMsg: "Link toolbar did not appear",
  });
  await browser.execute(() => {
    const btns = document.querySelectorAll(".bn-link-toolbar button");
    for (const btn of btns) {
      if (btn.textContent?.includes("Edit") || btn.getAttribute("aria-label")?.includes("Edit")) {
        (btn as HTMLElement).click();
        return;
      }
    }
  });
  await browser.pause(300);
}

/**
 * Delete a link via the link toolbar "Unlink" button.
 *
 * @throws Throws if the link toolbar does not appear within 3 seconds
 */
export async function clickDeleteLink(): Promise<void> {
  const toolbar = await browser.$(S.LINK_TOOLBAR);
  await browser.waitUntil(async () => toolbar.isDisplayed(), {
    timeout: 3_000,
    timeoutMsg: "Link toolbar did not appear",
  });
  await browser.execute(() => {
    const btns = document.querySelectorAll(".bn-link-toolbar button");
    for (const btn of btns) {
      if (btn.textContent?.includes("Unlink") || btn.getAttribute("aria-label")?.includes("Unlink")) {
        (btn as HTMLElement).click();
        return;
      }
    }
  });
  await browser.pause(300);
}

// ── Search & Replace ──

/**
 * Open the search panel via Cmd+F.
 *
 * @throws Throws if the search panel does not open within 3 seconds
 */
export async function openSearch(): Promise<void> {
  await browser.keys(["Meta", "f"]);
  await browser.pause(400);
  await browser.waitUntil(
    async () => {
      const panel = await browser.$(S.SEARCH_PANEL);
      return await panel.isExisting();
    },
    { timeout: 3_000, timeoutMsg: "Search panel did not open" }
  );
}

/** Close the search panel via Escape. */
export async function closeSearch(): Promise<void> {
  await pressEscape();
  await browser.pause(300);
}

/**
 * Type into the search input field.
 *
 * @param query - The search text to enter
 */
export async function typeSearchQuery(query: string): Promise<void> {
  const input = await browser.$(`${S.SEARCH_PANEL} input`);
  await input.click();
  await input.clearValue();
  await browser.pause(100);
  await input.setValue(query);
  await browser.pause(500);
}

/**
 * Type into the replace input field.
 *
 * @param text - The replacement text to enter
 */
export async function typeReplaceText(text: string): Promise<void> {
  const inputs = await browser.$$(
    `${S.SEARCH_PANEL} input`
  );
  const count = await inputs.length;
  if (count >= 2) {
    await inputs[1].click();
    await inputs[1].clearValue();
    await browser.pause(100);
    await inputs[1].setValue(text);
    await browser.pause(300);
  }
}

/** Click the "Replace" button. */
export async function clickReplace(): Promise<void> {
  await browser.execute(() => {
    const btns = document.querySelectorAll(".search-panel button");
    for (const btn of btns) {
      if (btn.textContent?.trim() === "Replace") {
        (btn as HTMLElement).click();
        return;
      }
    }
  });
  await browser.pause(400);
}

/** Click the "Replace all" button. */
export async function clickReplaceAll(): Promise<void> {
  await browser.execute(() => {
    const btns = document.querySelectorAll(".search-panel button");
    for (const btn of btns) {
      if (btn.textContent?.trim() === "Replace all") {
        (btn as HTMLElement).click();
        return;
      }
    }
  });
  await browser.pause(400);
}

/**
 * Read the match label text from the search panel.
 *
 * @returns The match indicator string (e.g., `"1/3"`) or `"No results"`, or empty string if not found
 */
export async function getSearchMatchLabel(): Promise<string> {
  return browser.execute(() => {
    const spans = document.querySelectorAll(".search-panel span");
    for (const span of spans) {
      const text = span.textContent?.trim() ?? "";
      if (text.includes("/") || text === "No results") return text;
    }
    return "";
  });
}

// ── Utility: Check inline style existence ──

/**
 * Check if an inline style element exists within the last non-empty block.
 * @param selector - CSS selector(s) to search for (e.g., "strong, b" for bold)
 */
export async function hasInlineStyle(selector: string): Promise<boolean> {
  return browser.execute((sel: string) => {
    const blocks = document.querySelectorAll(
      ".bn-block-content .bn-inline-content"
    );
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].textContent?.trim()) {
        return blocks[i].querySelector(sel) !== null;
      }
    }
    return false;
  }, selector);
}

/**
 * Check if a block with the given selector exists anywhere in the editor.
 *
 * @param selector - CSS selector to search for
 * @returns `true` if at least one matching element exists
 */
export async function blockExists(selector: string): Promise<boolean> {
  const el = await browser.$(selector);
  return el.isExisting();
}

// ── Image operations ──

/**
 * Switch to the "Embed" tab in the file panel and enter a URL.
 * Assumes the file panel is already open (e.g., after `/image` slash command).
 *
 * @param url - The image URL to embed
 * @throws Throws if the file panel, embed input, or embed button does not appear in time
 */
export async function embedImageUrl(url: string): Promise<void> {
  // Wait for the file panel to appear
  await browser.waitUntil(
    async () => {
      const panel = await browser.$(".bn-panel");
      return await panel.isExisting();
    },
    { timeout: 5_000, timeoutMsg: "File panel did not appear" }
  );
  await browser.pause(300);

  // Click the "Embed" tab using WebDriver's click (not browser.execute)
  // so that Radix/React event handlers fire properly
  const triggers = await browser.$$('.bn-panel [data-slot="tabs-trigger"]');
  for (const trigger of triggers) {
    const text = await trigger.getText();
    if (text.includes("Embed")) {
      await trigger.click();
      break;
    }
  }
  await browser.pause(500);

  // Wait for the embed input to appear, then type the URL
  await browser.waitUntil(
    async () => {
      const el = await browser.$(S.EMBED_TAB_INPUT);
      return await el.isExisting();
    },
    { timeout: 3_000, timeoutMsg: "Embed input did not appear" }
  );
  const input = await browser.$(S.EMBED_TAB_INPUT);
  await input.click();
  await input.setValue(url);
  await browser.pause(200);

  // Click the embed button
  await browser.waitUntil(
    async () => {
      const btn = await browser.$(S.EMBED_TAB_BUTTON);
      return await btn.isExisting();
    },
    { timeout: 3_000, timeoutMsg: "Embed button did not appear" }
  );
  const button = await browser.$(S.EMBED_TAB_BUTTON);
  await button.click();
  await browser.pause(500);
}

/**
 * Insert an image block programmatically via the editor API.
 * @param url - Image source URL
 * @param name - Display name for the image
 */
export async function insertImageBlock(
  url: string,
  name: string
): Promise<void> {
  await browser.execute(
    (imgUrl: string, imgName: string) => {
      const editor = (window as any).__blocknote_editor;
      if (!editor) return;
      const cursor = editor.getTextCursorPosition();
      editor.insertBlocks(
        [{ type: "image", props: { url: imgUrl, name: imgName, caption: imgName } }],
        cursor.block,
        "after"
      );
    },
    url,
    name
  );
  await browser.pause(500);
}

/**
 * Get the `src` attribute of the first visible image in the editor.
 *
 * @returns The image source URL, or `null` if no image is found
 */
export async function getImageSrc(): Promise<string | null> {
  return browser.execute(() => {
    const img = document.querySelector(
      '[data-content-type="image"] img.bn-visual-media'
    ) as HTMLImageElement | null;
    return img?.src ?? null;
  });
}

/**
 * Count visible image elements in the editor.
 *
 * @returns The number of `[data-content-type="image"]` elements
 */
export async function countImages(): Promise<number> {
  return browser.execute(() => {
    return document.querySelectorAll(
      '[data-content-type="image"]'
    ).length;
  });
}
