import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.resolve(__dirname, "..", "screenshots");

const EDITOR_SELECTOR = "[data-editor-root] .ProseMirror";
const SPLASH_SELECTOR = ".fixed.inset-0.z-50.flex.items-center.justify-center";
const SIDEBAR_MENU_BUTTON = '[data-slot="sidebar-menu-button"]';

/**
 * Ensures the screenshot output directory exists, creating it recursively if necessary.
 */
function ensureScreenshotDir() {
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
}

/**
 * Takes a screenshot of the current browser state and saves it as a PNG file.
 *
 * @param name - The file name (including extension) to save the screenshot as.
 */
async function saveScreenshot(name: string) {
  const screenshotPath = path.join(screenshotDir, name);
  const screenshot = await browser.takeScreenshot();
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot, "base64"));
  console.log(`Screenshot saved: ${screenshotPath}`);
}

/**
 * Returns the number of note items currently rendered in the sidebar.
 *
 * @returns A promise that resolves to the count of sidebar menu items.
 */
async function getSidebarNoteCount(): Promise<number> {
  return await browser.execute(() => {
    return document.querySelectorAll('[data-slot="sidebar-menu-item"]').length;
  });
}

describe("Scripta E2E Pilot", () => {
  before(() => {
    ensureScreenshotDir();
  });

  // ─── Phase 0: Splash & App Launch ───

  it("should show splash screen on launch", async () => {
    await browser.waitUntil(
      async () => {
        const h1 = await browser.$("h1");
        const text = await h1.getText().catch(() => "");
        return text.includes("Scripta");
      },
      {
        timeout: 15000,
        timeoutMsg: "Splash screen h1 not found within 15s",
      }
    );

    await saveScreenshot("00-splash-screen.png");

    const splashExists = await browser.execute(
      (sel: string) => document.querySelector(sel) !== null,
      SPLASH_SELECTOR
    );
    expect(splashExists).toBe(true);
  });

  it("should show the main UI after splash", async () => {
    await browser.waitUntil(
      async () => {
        const header = await browser.$('[data-slot="sidebar-header"]');
        return await header.isExisting();
      },
      {
        timeout: 30000,
        timeoutMsg: "React did not mount within 30s",
      }
    );

    // splash強制削除（WKWebViewでonTransitionEndが発火しないため）
    await browser.execute(
      (sel: string) => {
        const splash = document.querySelector(sel);
        if (splash) splash.remove();
      },
      SPLASH_SELECTOR
    );

    await browser.pause(500);
    await saveScreenshot("01-app-launch.png");
  });

  // ─── Phase 1: Create Note ───

  it("should create a new note via the sidebar button", async () => {
    const initialCount = await getSidebarNoteCount();
    console.log(`Initial note count: ${initialCount}`);

    const newNoteBtn = await browser.$(
      '[data-slot="sidebar-header"] button'
    );
    await newNoteBtn.click();
    console.log("Clicked new note button");

    await browser.waitUntil(
      async () => (await getSidebarNoteCount()) > initialCount,
      { timeout: 5000, timeoutMsg: "New note did not appear in sidebar" }
    );

    const afterCount = await getSidebarNoteCount();
    console.log(`Note count after create: ${afterCount}`);
    expect(afterCount).toBe(initialCount + 1);

    await browser.pause(500);
    await saveScreenshot("02-note-created.png");
  });

  // ─── Phase 2: Type, Format & Slash Command (all in one note) ───

  it("should type content and apply editor formatting", async () => {
    // Step 1: テキスト入力
    const typed = await browser.execute((sel: string) => {
      const editor = document.querySelector(sel) as HTMLElement | null;
      if (!editor) return false;
      editor.focus();
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, "E2E Test Note");
      return true;
    }, EDITOR_SELECTOR);
    expect(typed).toBe(true);
    await browser.pause(300);

    // Step 2: Italic適用（selectAll → italic）
    const italic = await browser.execute((sel: string) => {
      const editor = document.querySelector(sel) as HTMLElement | null;
      if (!editor) return false;
      editor.focus();
      document.execCommand("selectAll", false);
      document.execCommand("italic", false);
      const em = editor.querySelector("em");
      const i = editor.querySelector("i");
      return (em?.textContent ?? i?.textContent ?? "").includes("E2E Test Note");
    }, EDITOR_SELECTOR);
    console.log(`Italic applied: ${italic}`);
    await browser.pause(300);

    // Step 3: 新しいブロックを作成してBold適用
    const bold = await browser.execute((sel: string) => {
      const editor = document.querySelector(sel) as HTMLElement | null;
      if (!editor) return false;
      editor.focus();
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.selectAllChildren(editor);
      s?.collapseToEnd();
      document.execCommand("insertParagraph", false);
      document.execCommand("insertText", false, "Bold test content");

      const blocks = editor.querySelectorAll(
        '[data-content-type="paragraph"] .bn-inline-content'
      );
      const lastBlock = blocks[blocks.length - 1];
      if (!lastBlock) return false;

      const range = document.createRange();
      range.selectNodeContents(lastBlock);
      s?.removeAllRanges();
      s?.addRange(range);
      document.execCommand("bold", false);

      const strong = editor.querySelector("strong");
      const b = editor.querySelector("b");
      return (strong?.textContent ?? b?.textContent ?? "").includes(
        "Bold test content"
      );
    }, EDITOR_SELECTOR);
    console.log(`Bold applied: ${bold}`);
    await browser.pause(300);

    // Step 4: Slash command → /heading → H2変換
    await browser.execute((sel: string) => {
      const editor = document.querySelector(sel) as HTMLElement | null;
      if (!editor) return;
      editor.focus();
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.selectAllChildren(editor);
      s?.collapseToEnd();
      document.execCommand("insertParagraph", false);
      document.execCommand("insertText", false, "/heading");
    }, EDITOR_SELECTOR);

    await browser.pause(1000);

    const menuClicked = await browser.execute(() => {
      const items = document.querySelectorAll(
        '[role="option"], [class*="menu-item"]'
      );
      for (const item of items) {
        if (
          item.textContent?.toLowerCase().includes("heading") &&
          item.getClientRects().length > 0
        ) {
          (item as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    console.log(`Heading menu clicked: ${menuClicked}`);

    await browser.pause(800);

    await browser.execute((sel: string) => {
      const editor = document.querySelector(sel) as HTMLElement | null;
      if (!editor) return;
      editor.focus();
      document.execCommand("insertText", false, "Formatted Heading");
    }, EDITOR_SELECTOR);
    await browser.pause(500);

    // 検証
    expect(italic).toBe(true);
    expect(bold).toBe(true);

    await saveScreenshot("03-note-formatted.png");
  });

  // ─── Phase 3: Verify Persistence ───

  it("should persist note title in sidebar", async () => {
    const findTitle = () =>
      browser.execute((btnSel: string) => {
        const buttons = document.querySelectorAll(btnSel);
        for (const btn of buttons) {
          const span = btn.querySelector("span");
          if (span?.textContent?.includes("E2E Test Note")) {
            return span.textContent;
          }
        }
        return null;
      }, SIDEBAR_MENU_BUTTON);

    await browser.waitUntil(
      async () => (await findTitle()) !== null,
      { timeout: 10000, timeoutMsg: "Note title not updated in sidebar" }
    );

    const title = await findTitle();
    console.log(`Sidebar note title: "${title}"`);
    expect(title).toContain("E2E Test Note");

    await saveScreenshot("04-title-persisted.png");
  });

  // ─── Phase 4: Delete Note ───

  it("should delete a note via context menu", async () => {
    const countBefore = await getSidebarNoteCount();
    console.log(`Note count before delete: ${countBefore}`);

    // テストノートを含むボタンをテキスト内容で検索して右クリック
    const menuOpened = await browser.execute(() => {
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        const span = btn.querySelector("span");
        if (span?.textContent?.includes("E2E Test Note")) {
          btn.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
          );
          return true;
        }
      }
      return false;
    });
    expect(menuOpened).toBe(true);

    // コンテキストメニューが表示されるまで待機
    await browser.waitUntil(
      async () => {
        const menu = await browser.$('[data-slot="context-menu-content"]');
        return await menu.isExisting();
      },
      { timeout: 5000, timeoutMsg: "Context menu did not appear" }
    );

    console.log("Context menu opened");
    await saveScreenshot("05-context-menu.png");

    // "Delete"メニューアイテムをクリック
    const deleteItem = await browser.execute(() => {
      const items = document.querySelectorAll(
        '[data-slot="context-menu-item"]'
      );
      for (const item of items) {
        if (item.textContent?.includes("Delete")) {
          (item as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    expect(deleteItem).toBe(true);
    console.log("Clicked Delete in context menu");

    // 削除確認ダイアログが表示されるまで待機
    await browser.waitUntil(
      async () => {
        const dialog = await browser.$('[data-slot="alert-dialog-content"]');
        return await dialog.isExisting();
      },
      { timeout: 5000, timeoutMsg: "Delete confirmation dialog did not appear" }
    );

    console.log("Delete confirmation dialog visible");
    await saveScreenshot("06-delete-dialog.png");

    // ダイアログタイトルを検証
    const dialogTitle = await browser.$('[data-slot="alert-dialog-title"]');
    const titleText = await dialogTitle.getText();
    expect(titleText).toContain("Delete");

    // 削除を実行
    const actionBtn = await browser.$('[data-slot="alert-dialog-action"]');
    await actionBtn.click();
    console.log("Clicked Delete confirmation");

    // ノートが減るまで待機
    await browser.waitUntil(
      async () => (await getSidebarNoteCount()) < countBefore,
      { timeout: 5000, timeoutMsg: "Note was not deleted" }
    );

    const countAfter = await getSidebarNoteCount();
    console.log(`Note count after delete: ${countAfter}`);
    expect(countAfter).toBe(countBefore - 1);

    await saveScreenshot("07-note-deleted.png");
  });
});
