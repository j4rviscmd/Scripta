/**
 * App-lifecycle helpers shared across E2E test files.
 *
 * Handles splash-screen removal, editor-ready detection,
 * note creation, and screenshot management.
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as S from "./selectors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseScreenshotDir = path.resolve(__dirname, "..", "screenshots");

/**
 * Ensure a screenshot sub-directory exists under `screenshots/`.
 *
 * @param subdir - Optional subdirectory name within the base screenshots directory
 * @returns The absolute path to the (possibly newly created) directory
 */
export function ensureScreenshotDir(subdir?: string): string {
  const dir = subdir
    ? path.join(baseScreenshotDir, subdir)
    : baseScreenshotDir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Save a screenshot to `screenshots/{category}/{name}.png`.
 *
 * @param category - Subdirectory name used to organize screenshots
 * @param name - File name (without extension) for the screenshot
 */
export async function saveScreenshot(
  category: string,
  name: string
): Promise<void> {
  const dir = ensureScreenshotDir(category);
  const filePath = path.join(dir, `${name}.png`);
  const data = await browser.takeScreenshot();
  fs.writeFileSync(filePath, Buffer.from(data, "base64"));
  console.log(`Screenshot saved: ${filePath}`);
}

/**
 * Wait for the splash screen to disappear, force-removing it if necessary.
 * WKWebView does not fire `transitionend`, so we remove the element directly.
 */
export async function waitForSplashDone(): Promise<void> {
  // Wait for React to mount
  await browser.waitUntil(
    async () => {
      const header = await browser.$(S.SIDEBAR_HEADER);
      return await header.isExisting();
    },
    { timeout: 30_000, timeoutMsg: "React did not mount within 30s" }
  );

  // Force-remove splash overlay
  await browser.execute((sel: string) => {
    const splash = document.querySelector(sel);
    if (splash) splash.remove();
  }, S.SPLASH_SELECTOR);

  await browser.pause(500);
}

/**
 * Wait for the editor to become visible (opacity-100 transition).
 *
 * @throws Throws if the editor does not reach the ready state within 15 seconds
 */
export async function waitForEditorReady(): Promise<void> {
  await browser.waitUntil(
    async () => {
      const root = await browser.$(S.EDITOR_ROOT);
      if (!(await root.isExisting())) return false;
      const cls = await root.getAttribute("class");
      return cls?.includes("opacity-100") ?? false;
    },
    { timeout: 15_000, timeoutMsg: "Editor did not become ready within 15s" }
  );
}

/**
 * Click the sidebar "+" button to create a new note and wait for it.
 *
 * Waits for the sidebar note count to increment, then waits for the editor
 * to be ready before returning.
 *
 * @throws Throws if the new note does not appear within 5 seconds
 */
export async function createNewNote(): Promise<void> {
  const before = await getSidebarNoteCount();
  const btn = await browser.$(`${S.SIDEBAR_HEADER} button`);
  await btn.click();
  await browser.waitUntil(
    async () => (await getSidebarNoteCount()) > before,
    { timeout: 5_000, timeoutMsg: "New note did not appear" }
  );
  await waitForEditorReady();
  await browser.pause(300);
}

/**
 * Count visible note items in the sidebar.
 *
 * @returns The number of note items currently rendered in the sidebar
 */
export async function getSidebarNoteCount(): Promise<number> {
  return browser.execute(
    (sel: string) => document.querySelectorAll(sel).length,
    S.SIDEBAR_MENU_ITEM
  );
}

/** Focus the ProseMirror contenteditable element. */
export async function focusEditor(): Promise<void> {
  const pm = await browser.$(S.PROSEMIRROR);
  await pm.click();
  await browser.pause(200);
}

/**
 * Count all blocks matching a CSS selector within the editor.
 *
 * @param selector - CSS selector to match blocks (e.g., `'[data-content-type="heading"]'`)
 * @returns The number of matching block elements
 */
export async function countBlocks(selector: string): Promise<number> {
  return browser.execute(
    (sel: string) => document.querySelectorAll(sel).length,
    selector
  );
}

/**
 * Delete the currently active note via Tauri invoke.
 * Uses `list_notes` to find the most recently created note, then
 * calls `delete_note` to remove it. Falls back to no-op if no notes exist.
 */
export async function deleteActiveNote(): Promise<void> {
  await browser.execute(async () => {
    const { invoke } = (window as any).__TAURI_INTERNALS__;
    const notes = await invoke("list_notes");
    if (!notes || notes.length === 0) return;
    // The active note is the first one in the sidebar (sorted by updatedAt desc)
    const newest = notes[0];
    await invoke("delete_note", { id: newest.id });
  });
  await browser.pause(300);
}
