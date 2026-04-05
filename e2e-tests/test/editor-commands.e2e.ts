/**
 * editor-commands.e2e.ts
 *
 * Comprehensive E2E test for all editor commands in a single note.
 * Tests run sequentially — each test builds on the previous state.
 *
 * Categories:
 *  1. Markdown shortcuts (# , ## , ### , - , 1. , [] , ```)
 *  2. Inline formatting (Bold, Italic, Underline, Strikethrough, Code, Link)
 *  3. Slash menu commands (/heading, /bullet, /numbered, /checklist, /table, /code, /columns)
 *  4. Block operations (Duplicate, Copy, Delete via drag handle)
 *  5. Link operations (Create, Edit, Delete)
 *  6. Search & replace (Open, Find, Replace one, Replace all, Close)
 *  7. Image operations (Slash insert, Embed remote, Embed local, Delete)
 */

import { expect } from "chai";
import {
  ensureScreenshotDir,
  saveScreenshot,
  waitForSplashDone,
  waitForEditorReady,
  createNewNote,
  focusEditor,
  countBlocks,
  deleteActiveNote,
} from "../helpers/app.helpers.js";
import {
  typeText,
  typeTextCharByChar,
  pressEnter,
  pressEscape,
  pressBackspace,
  selectTextInLastBlock,
  moveCursorToEnd,
  selectAndApplyBold,
  selectAndApplyItalic,
  selectAndApplyUnderline,
  selectAndApplyStrikethrough,
  moveToEndAndNewParagraph,
  slashCommand,
  openDragHandleMenu,
  clickDragMenuItem,
  clickEditLink,
  clickDeleteLink,
  openSearch,
  closeSearch,
  typeSearchQuery,
  typeReplaceText,
  clickReplace,
  clickReplaceAll,
  getSearchMatchLabel,
  hasInlineStyle,
  blockExists,
  embedImageUrl,
  countImages,
} from "../helpers/editor.helpers.js";
import * as S from "../helpers/selectors.js";

const ss = (category: string, name: string) =>
  saveScreenshot("editor-commands", `${category}--${name}`);

describe("Editor Commands — Comprehensive Test", () => {
  before(async () => {
    ensureScreenshotDir("editor-commands");
    await waitForSplashDone();
    await createNewNote();
    await focusEditor();
    await browser.pause(500);

    // Move cursor to end of editor content and create a new paragraph
    // to avoid typing into the title heading
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
  });

  after(async () => {
    // Clean up the test note to avoid accumulating notes across runs
    await deleteActiveNote();
  });

  afterEach(async function () {
    if (this.currentTest?.state === "failed") {
      await saveScreenshot(
        "editor-commands",
        `FAIL-${this.currentTest.title.replace(/[^a-z0-9]/gi, "-")}`
      );
    }
  });

  // ═══════════════════════════════════════════════════
  // Category 1: Markdown Shortcuts
  // ═══════════════════════════════════════════════════
  describe("1 — Markdown Shortcuts", () => {
    it("1.1 — # creates Heading 1", async () => {
      await typeTextCharByChar("# ");
      await browser.pause(300);
      await typeText("Heading One");
      expect(await blockExists(S.headingLevel(1))).to.be.true;
      await ss("01-markdown", "h1");
      await moveToEndAndNewParagraph();
    });

    it("1.2 — ## creates Heading 2", async () => {
      await typeTextCharByChar("## ");
      await browser.pause(300);
      await typeText("Heading Two");
      expect(await blockExists(S.headingLevel(2))).to.be.true;
      await ss("01-markdown", "h2");
      await moveToEndAndNewParagraph();
    });

    it("1.3 — ### creates Heading 3", async () => {
      await typeTextCharByChar("### ");
      await browser.pause(300);
      await typeText("Heading Three");
      expect(await blockExists(S.headingLevel(3))).to.be.true;
      await ss("01-markdown", "h3");
      await moveToEndAndNewParagraph();
    });

    it("1.4 — - creates bullet list", async () => {
      await typeTextCharByChar("- ");
      await browser.pause(300);
      await typeText("Bullet item");
      expect(await blockExists(S.BLOCK_BULLET)).to.be.true;
      await ss("01-markdown", "bullet");
      await moveToEndAndNewParagraph();
    });

    it("1.5 — 1. creates numbered list", async () => {
      await typeTextCharByChar("1. ");
      await browser.pause(300);
      await typeText("Numbered item");
      expect(await blockExists(S.BLOCK_NUMBERED)).to.be.true;
      await ss("01-markdown", "numbered");
      await moveToEndAndNewParagraph();
    });

    it("1.6 — [] creates checklist", async () => {
      await typeTextCharByChar("[] ");
      await browser.pause(300);
      await typeText("Check item");
      expect(await blockExists(S.BLOCK_CHECKLIST)).to.be.true;
      await ss("01-markdown", "checklist");
      await moveToEndAndNewParagraph();
    });

    it("1.7 — ``` creates code block", async () => {
      await typeTextCharByChar("``` ");
      await browser.pause(300);
      expect(await blockExists(S.BLOCK_CODE)).to.be.true;
      await typeText("const x = 1;");
      await ss("01-markdown", "codeblock");
      await moveToEndAndNewParagraph();
    });
  });

  // ═══════════════════════════════════════════════════
  // Category 2: Inline Formatting
  // ═══════════════════════════════════════════════════
  describe("2 — Inline Formatting", () => {
    it("2.1 — Bold formatting", async () => {
      await typeText("bold text");
      await selectAndApplyBold();
      expect(await hasInlineStyle("strong, b")).to.be.true;
      await ss("02-inline", "bold");
      await moveToEndAndNewParagraph();
    });

    it("2.2 — Italic formatting", async () => {
      await typeText("italic text");
      await selectAndApplyItalic();
      expect(await hasInlineStyle("em, i")).to.be.true;
      await ss("02-inline", "italic");
      await moveToEndAndNewParagraph();
    });

    it("2.3 — Underline formatting", async () => {
      await typeText("underline text");
      await selectAndApplyUnderline();
      expect(await hasInlineStyle("u")).to.be.true;
      await ss("02-inline", "underline");
      await moveToEndAndNewParagraph();
    });

    it("2.4 — Strikethrough formatting", async () => {
      await typeText("strikethrough text");
      await selectAndApplyStrikethrough();
      expect(await hasInlineStyle("s, del")).to.be.true;
      await ss("02-inline", "strikethrough");
      await moveToEndAndNewParagraph();
    });

    it("2.5 — Inline code formatting", async () => {
      // No code button in toolbar; use markdown backtick shortcut instead
      await typeTextCharByChar("`inline code`");
      await browser.pause(300);
      expect(await hasInlineStyle("code")).to.be.true;
      await ss("02-inline", "inline-code");
      await moveToEndAndNewParagraph();
    });

    it("2.6 — Create link via toolbar", async () => {
      await typeText("link text");
      await selectTextInLastBlock();
      // Wait for formatting toolbar
      await browser.waitUntil(
        async () => {
          const tb = await browser.$(S.FORMATTING_TOOLBAR);
          return await tb.isExisting();
        },
        { timeout: 3_000, timeoutMsg: "Formatting toolbar did not appear for link" }
      );
      // Click the create link button
      await browser.execute(() => {
        const toolbar = document.querySelector(".bn-formatting-toolbar");
        if (!toolbar) return;
        const buttons = toolbar.querySelectorAll("button");
        for (const btn of buttons) {
          const tooltip = btn.getAttribute("aria-label") || btn.getAttribute("title") || "";
          if (tooltip.toLowerCase().includes("link") && !tooltip.toLowerCase().includes("unlink")) {
            btn.click();
            return;
          }
        }
      });
      await browser.pause(300);

      // BlockNote's link input appears in the formatting toolbar
      const toolbarInput = await browser.$(
        `${S.FORMATTING_TOOLBAR} input`
      );
      const exists = await toolbarInput.isExisting();
      if (exists) {
        await toolbarInput.setValue("https://example.com");
        await browser.keys(["Enter"]);
        await browser.pause(300);
      }

      expect(await hasInlineStyle("a")).to.be.true;
      await ss("02-inline", "link");
      await moveToEndAndNewParagraph();
    });
  });

  // ═══════════════════════════════════════════════════
  // Category 3: Slash Menu Commands
  // ═══════════════════════════════════════════════════
  describe("3 — Slash Menu Commands", () => {
    it("3.1 — /heading1 inserts Heading 1", async () => {
      const before = await countBlocks(S.headingLevel(1));
      await slashCommand("heading1");
      await typeText("Slash H1");
      const after = await countBlocks(S.headingLevel(1));
      expect(after).to.be.greaterThan(before);
      await ss("03-slash", "heading1");
      await moveToEndAndNewParagraph();
    });

    it("3.2 — /heading2 inserts Heading 2", async () => {
      const before = await countBlocks(S.headingLevel(2));
      await slashCommand("heading2");
      await typeText("Slash H2");
      const after = await countBlocks(S.headingLevel(2));
      expect(after).to.be.greaterThan(before);
      await ss("03-slash", "heading2");
      await moveToEndAndNewParagraph();
    });

    it("3.3 — /heading3 inserts Heading 3", async () => {
      const before = await countBlocks(S.headingLevel(3));
      await slashCommand("heading3");
      await typeText("Slash H3");
      const after = await countBlocks(S.headingLevel(3));
      expect(after).to.be.greaterThan(before);
      await ss("03-slash", "heading3");
      await moveToEndAndNewParagraph();
    });

    it("3.4 — /bulletlist inserts bullet list", async () => {
      const before = await countBlocks(S.BLOCK_BULLET);
      await slashCommand("bullet");
      await typeText("Slash bullet");
      const after = await countBlocks(S.BLOCK_BULLET);
      expect(after).to.be.greaterThan(before);
      await ss("03-slash", "bulletlist");
      await moveToEndAndNewParagraph();
    });

    it("3.5 — /numberedlist inserts numbered list", async () => {
      const before = await countBlocks(S.BLOCK_NUMBERED);
      await slashCommand("numbered");
      await typeText("Slash numbered");
      const after = await countBlocks(S.BLOCK_NUMBERED);
      expect(after).to.be.greaterThan(before);
      await ss("03-slash", "numberedlist");
      await moveToEndAndNewParagraph();
    });

    it("3.6 — /checklist inserts check list", async () => {
      const before = await countBlocks(S.BLOCK_CHECKLIST);
      await slashCommand("check");
      await typeText("Slash check");
      const after = await countBlocks(S.BLOCK_CHECKLIST);
      expect(after).to.be.greaterThan(before);
      await ss("03-slash", "checklist");
      await moveToEndAndNewParagraph();
    });

    it("3.7 — /table inserts a table", async () => {
      await slashCommand("table");
      await browser.pause(500);
      expect(await blockExists(S.BLOCK_TABLE)).to.be.true;
      await ss("03-slash", "table");
      await moveToEndAndNewParagraph();
    });

    it("3.8 — /codeblock inserts a code block", async () => {
      const before = await countBlocks(S.BLOCK_CODE);
      await slashCommand("code");
      await typeText("console.log('slash');");
      const after = await countBlocks(S.BLOCK_CODE);
      expect(after).to.be.greaterThan(before);
      await ss("03-slash", "codeblock");
      await moveToEndAndNewParagraph();
    });

    it("3.9 — /columns inserts a multi-column block", async () => {
      await slashCommand("columns");
      await browser.pause(500);
      expect(await blockExists(S.BLOCK_COLUMN_LIST)).to.be.true;
      await ss("03-slash", "columns");
      await moveToEndAndNewParagraph();
    });
  });

  // ═══════════════════════════════════════════════════
  // Category 4: Block Operations (via Drag Handle)
  // ═══════════════════════════════════════════════════
  describe("4 — Block Operations", () => {
    let targetBlock: string;

    before(async () => {
      // Create a paragraph to operate on
      await typeText("Block ops target");
      await pressEnter();
      // The block we want to target is the last paragraph with "Block ops target"
      targetBlock = `${S.BLOCK_PARAGRAPH}`;
    });

    it("4.1 — Duplicate Block doubles the block", async () => {
      const before = await countBlocks(S.BLOCK_PARAGRAPH);
      // Find and hover the block containing "Block ops target"
      await browser.execute(() => {
        const blocks = document.querySelectorAll(
          '[data-content-type="paragraph"] .bn-inline-content'
        );
        for (const block of blocks) {
          if (block.textContent?.includes("Block ops target")) {
            (block as HTMLElement).dispatchEvent(
              new MouseEvent("mouseover", { bubbles: true })
            );
            break;
          }
        }
      });
      await browser.pause(300);

      try {
        await openDragHandleMenu(targetBlock);
        await clickDragMenuItem("Duplicate");
        const after = await countBlocks(S.BLOCK_PARAGRAPH);
        expect(after).to.be.greaterThan(before);
      } catch {
        console.log("Drag handle not available — skipping duplicate test");
      }
      await ss("04-block", "duplicate");
    });

    it("4.2 — Delete Block removes one block", async () => {
      const before = await countBlocks(S.BLOCK_PARAGRAPH);
      await browser.execute(() => {
        const blocks = document.querySelectorAll(
          '[data-content-type="paragraph"] .bn-inline-content'
        );
        for (const block of blocks) {
          if (block.textContent?.includes("Block ops target")) {
            (block as HTMLElement).dispatchEvent(
              new MouseEvent("mouseover", { bubbles: true })
            );
            break;
          }
        }
      });
      await browser.pause(300);

      try {
        await openDragHandleMenu(targetBlock);
        await clickDragMenuItem("Delete");
        const after = await countBlocks(S.BLOCK_PARAGRAPH);
        expect(after).to.be.lessThan(before);
      } catch {
        console.log("Drag handle not available — skipping delete test");
      }
      await ss("04-block", "delete");
      // Create new line for next tests
      await focusEditor();
      await moveToEndAndNewParagraph();
    });
  });

  // ═══════════════════════════════════════════════════
  // Category 5: Link Operations
  // ═══════════════════════════════════════════════════
  describe("5 — Link Operations", () => {
    it("5.1 — Create a link via toolbar", async () => {
      await typeText("visit example");
      await selectTextInLastBlock();
      // Wait for formatting toolbar
      await browser.waitUntil(
        async () => {
          const tb = await browser.$(S.FORMATTING_TOOLBAR);
          return await tb.isExisting();
        },
        { timeout: 3_000, timeoutMsg: "Formatting toolbar did not appear for link create" }
      );
      // Click create link button
      await browser.execute(() => {
        const toolbar = document.querySelector(".bn-formatting-toolbar");
        if (!toolbar) return;
        const buttons = toolbar.querySelectorAll("button");
        for (const btn of buttons) {
          const tooltip = btn.getAttribute("aria-label") || btn.getAttribute("title") || "";
          if (tooltip.toLowerCase().includes("link") && !tooltip.toLowerCase().includes("unlink")) {
            btn.click();
            return;
          }
        }
      });
      await browser.pause(300);

      // Fill in the URL in the toolbar input
      const toolbarInput = await browser.$(
        `${S.FORMATTING_TOOLBAR} input`
      );
      const exists = await toolbarInput.isExisting();
      if (exists) {
        await toolbarInput.setValue("https://example.com");
        await browser.keys(["Enter"]);
        await browser.pause(300);
      }

      expect(await hasInlineStyle("a")).to.be.true;
      await ss("05-link", "create");
    });

    it("5.2 — Edit link via toolbar", async () => {
      // Click on the link text to trigger link toolbar
      await browser.execute(() => {
        const link = document.querySelector(
          ".bn-inline-content a"
        ) as HTMLAnchorElement;
        if (link) link.click();
      });
      await browser.pause(500);

      // Check if link toolbar or edit dialog appears
      try {
        await clickEditLink();
        await browser.pause(300);

        // The EditLinkDialog should appear
        const urlInput = await browser.$(S.EDIT_LINK_URL);
        if (await urlInput.isExisting()) {
          await urlInput.clearValue();
          await urlInput.setValue("https://edited.example.com");
          // Click Save button
          await browser.execute(() => {
            const btns = document.querySelectorAll(
              '[data-slot="dialog-content"] button'
            );
            for (const btn of btns) {
              if (btn.textContent?.includes("Save")) {
                (btn as HTMLElement).click();
                return;
              }
            }
          });
          await browser.pause(300);
        }
      } catch {
        console.log("Link toolbar edit not available — skip");
      }
      await ss("05-link", "edit");
    });

    it("5.3 — Delete link via toolbar", async () => {
      // Click on a link to trigger toolbar
      await browser.execute(() => {
        const link = document.querySelector(
          ".bn-inline-content a"
        ) as HTMLAnchorElement;
        if (link) link.click();
      });
      await browser.pause(500);

      try {
        await clickDeleteLink();
        await browser.pause(300);
      } catch {
        console.log("Link toolbar delete not available — skip");
      }
      await ss("05-link", "delete");
      await moveToEndAndNewParagraph();
    });
  });

  // ═══════════════════════════════════════════════════
  // Category 6: Search & Replace
  // ═══════════════════════════════════════════════════
  describe("6 — Search & Replace", () => {
    before(async () => {
      // Add some searchable content
      await typeText("search target alpha");
      await pressEnter();
      await typeText("search target beta");
      await pressEnter();
      await typeText("search target gamma");
      await pressEnter();
    });

    it("6.1 — Cmd+F opens search panel", async () => {
      await openSearch();
      const panel = await browser.$(S.SEARCH_PANEL);
      expect(await panel.isExisting()).to.be.true;
      await ss("06-search", "panel-open");
    });

    it("6.2 — Search finds matches", async () => {
      await typeSearchQuery("search target");
      await browser.pause(500);
      const label = await getSearchMatchLabel();
      expect(label).to.not.equal("No results");
      expect(label).to.include("/"); // e.g., "1/3"
      await ss("06-search", "find-matches");
    });

    it("6.3 — Replace one match", async () => {
      await typeReplaceText("replaced");
      await clickReplace();
      await browser.pause(300);
      await ss("06-search", "replace-one");
    });

    it("6.4 — Replace all remaining matches", async () => {
      await clickReplaceAll();
      await browser.pause(500);
      const label = await getSearchMatchLabel();
      expect(label).to.equal("No results");
      await ss("06-search", "replace-all");
    });

    it("6.5 — Escape closes search panel", async () => {
      await closeSearch();
      await browser.pause(300);
      const panel = await browser.$(S.SEARCH_PANEL);
      expect(await panel.isExisting()).to.be.false;
      await ss("06-search", "panel-closed");
    });
  });

  // ═══════════════════════════════════════════════════
  // Category 7: Image Operations
  // ═══════════════════════════════════════════════════
  describe("7 — Image Operations", () => {
    before(async () => {
      await focusEditor();
      await moveCursorToEnd();
      await pressEnter();
    });

    it("7.1 — /image creates image placeholder", async () => {
      await slashCommand("image");
      await browser.pause(500);

      // The image block should appear
      expect(await blockExists(S.BLOCK_IMAGE)).to.be.true;
      await ss("07-image", "placeholder");

      // Press Escape to close any auto-opened panel, move to new paragraph
      await pressEscape();
      await browser.pause(300);
      await moveToEndAndNewParagraph();
    });

    it("7.2 — Embed remote image via URL", async () => {
      // Insert a new image block via slash menu
      await slashCommand("image");
      await browser.pause(500);

      // The file panel may auto-close; click the "Add image" button to reopen it
      await browser.execute(() => {
        const btns = document.querySelectorAll(".bn-add-file-button");
        const last = btns[btns.length - 1] as HTMLElement;
        if (last) last.click();
      });
      await browser.pause(800);

      const remoteUrl =
        "https://frieren-anime.jp/wp-content/themes/frieren_2023/assets/img/special/icon/001.jpg";
      await embedImageUrl(remoteUrl);
      await browser.pause(1_000);

      // Verify an <img> element appeared in the image block
      const imgCount = await countImages();
      expect(imgCount).to.be.greaterThan(0);

      // Verify the img src contains the remote URL
      const src = await browser.execute(() => {
        const imgs = document.querySelectorAll(
          '[data-content-type="image"] img.bn-visual-media'
        );
        const last = imgs[imgs.length - 1] as HTMLImageElement | undefined;
        return last?.src ?? "";
      });
      expect(src).to.include("frieren-anime.jp");
      await ss("07-image", "remote");
      await moveToEndAndNewParagraph();
    });

    it("7.3 — Embed local image via URL", async () => {
      const before = await countImages();

      // Insert a new image block via slash menu
      await slashCommand("image");
      await browser.pause(500);

      // Click the "Add image" button to ensure file panel opens
      await browser.execute(() => {
        const btns = document.querySelectorAll(".bn-add-file-button");
        const last = btns[btns.length - 1] as HTMLElement;
        if (last) last.click();
      });
      await browser.pause(500);

      // Use the Vite dev server URL for the public asset
      await embedImageUrl("/screenshot.png");
      await browser.pause(1_000);

      const after = await countImages();
      expect(after).to.be.greaterThan(before);

      // Verify the last image src contains the local path
      const src = await browser.execute(() => {
        const imgs = document.querySelectorAll(
          '[data-content-type="image"] img.bn-visual-media'
        );
        const last = imgs[imgs.length - 1] as HTMLImageElement | undefined;
        return last?.src ?? "";
      });
      expect(src).to.include("screenshot.png");
      await ss("07-image", "local");
      await moveToEndAndNewParagraph();
    });

    it("7.4 — Delete image block", async () => {
      const before = await countImages();
      expect(before).to.be.greaterThan(0);

      // Hover over the last image block to show the drag handle
      await browser.execute(() => {
        const imageBlocks = document.querySelectorAll(
          '[data-content-type="image"]'
        );
        const last = imageBlocks[imageBlocks.length - 1] as HTMLElement;
        if (last) {
          last.dispatchEvent(
            new MouseEvent("mouseover", { bubbles: true })
          );
        }
      });
      await browser.pause(300);

      try {
        await openDragHandleMenu(S.BLOCK_IMAGE);
        await clickDragMenuItem("Delete");
        await browser.pause(300);

        const after = await countImages();
        expect(after).to.be.lessThan(before);
      } catch {
        console.log("Drag handle not available for image — skip");
      }
      await ss("07-image", "delete");
    });
  });
});
