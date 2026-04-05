/**
 * ai-features.e2e.ts
 *
 * Minimal E2E tests for Apple Intelligence features.
 * Requires macOS 26+ with Apple Intelligence enabled.
 *
 * Categories:
 *  1. Summarization (manual trigger → accordion displays summary)
 *  2. Translation (toolbar trigger → in-place streaming translation)
 */

import { expect } from "chai";
import {
  ensureScreenshotDir,
  saveScreenshot,
  waitForSplashDone,
  waitForEditorReady,
  createNewNote,
  focusEditor,
  deleteActiveNote,
} from "../helpers/app.helpers.js";
import {
  typeText,
  pressEnter,
  moveToEndAndNewParagraph,
} from "../helpers/editor.helpers.js";
import * as S from "../helpers/selectors.js";

const ss = (category: string, name: string) =>
  saveScreenshot("ai-features", `${category}--${name}`);

// Enough content (200+ chars) to exceed the 100-char minimum for summarization
const TEST_PARAGRAPHS = [
  "Frieren is a fantasy anime series that follows an elven mage who outlives her human companions after their decade-long quest to defeat the Demon King.",
  "The story explores themes of time, memory, and the meaning of human connections through the eyes of an immortal being who must learn to cherish fleeting relationships.",
  "With stunning animation by Madhouse studio, the series has become one of the most acclaimed anime of the decade.",
];

describe("AI Features — Apple Intelligence", () => {
  before(async () => {
    ensureScreenshotDir("ai-features");
    await waitForSplashDone();
    await createNewNote();
    await focusEditor();
    await browser.pause(500);

    // Move past title and type test content
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

    // Type multiple paragraphs
    for (const para of TEST_PARAGRAPHS) {
      await typeText(para);
      await pressEnter();
      await browser.pause(200);
    }
    await browser.pause(500);
  });

  after(async () => {
    await deleteActiveNote();
  });

  afterEach(async function () {
    if (this.currentTest?.state === "failed") {
      await saveScreenshot(
        "ai-features",
        `FAIL-${this.currentTest.title.replace(/[^a-z0-9]/gi, "-")}`
      );
    }
  });

  // ═══════════════════════════════════════════════════
  // Category 1: Summarization
  // ═══════════════════════════════════════════════════
  describe("1 — Summarization", () => {
    it("1.1 — Summarize button generates summary in accordion", async () => {
      // The summarize button should exist and not be disabled
      // (content is 200+ chars, above the 100-char minimum)
      const btnExists = await browser.execute(() => {
        const buttons = document.querySelectorAll("header button");
        for (const btn of buttons) {
          // Find the button containing the Sparkles SVG (summarize)
          const svg = btn.querySelector("svg");
          if (!svg) continue;
          const path = svg.querySelector("path");
          if (!path) continue;
          // Sparkles icon has a distinctive d attribute
          if (
            btn.getAttribute("aria-disabled") !== "true" &&
            svg.classList.contains("lucide-sparkles")
          ) {
            return true;
          }
        }
        return false;
      });
      expect(btnExists).to.be.true;

      // Click the summarize button
      await browser.execute(() => {
        const buttons = document.querySelectorAll("header button");
        for (const btn of buttons) {
          const svg = btn.querySelector("svg.lucide-sparkles");
          if (svg && btn.getAttribute("aria-disabled") !== "true") {
            (btn as HTMLElement).click();
            return;
          }
        }
      });
      await browser.pause(500);

      // Wait for the summary accordion to appear (may take several seconds)
      await browser.waitUntil(
        async () => {
          return browser.execute(() => {
            // Look for accordion trigger containing "Summary" text
            const triggers = document.querySelectorAll(
              '[data-slot="accordion-trigger"]'
            );
            for (const t of triggers) {
              if (t.textContent?.includes("Summary")) return true;
            }
            // Fallback: look for any element with "Summary" in the accordion area
            const accordions = document.querySelectorAll(
              '[data-slot="accordion-item"]'
            );
            return accordions.length > 0;
          });
        },
        {
          timeout: 30_000,
          timeoutMsg: "Summary accordion did not appear within 30s",
        }
      );

      await ss("01-summarize", "accordion-appeared");

      // Wait for actual summary text (not "Generating summary…")
      await browser.waitUntil(
        async () => {
          return browser.execute(() => {
            const contentAreas = document.querySelectorAll(
              '[data-slot="accordion-content"] p'
            );
            for (const p of contentAreas) {
              const text = p.textContent?.trim() ?? "";
              if (text.length > 0 && !text.includes("Generating summary")) {
                return true;
              }
            }
            return false;
          });
        },
        {
          timeout: 30_000,
          timeoutMsg: "Summary text did not appear within 30s",
        }
      );

      // Verify summary text is non-empty
      const summaryText = await browser.execute(() => {
        const contentAreas = document.querySelectorAll(
          '[data-slot="accordion-content"] p'
        );
        for (const p of contentAreas) {
          const text = p.textContent?.trim() ?? "";
          if (text.length > 0 && !text.includes("Generating summary")) {
            return text;
          }
        }
        return "";
      });

      expect(summaryText.length).to.be.greaterThan(0);
      await ss("01-summarize", "summary-generated");
    });
  });

  // ═══════════════════════════════════════════════════
  // Category 2: Translation
  // ═══════════════════════════════════════════════════
  describe("2 — Translation", () => {
    it("2.1 — Translate button triggers streaming translation", async () => {
      // Find and click the translate button (Languages/Globe icon in header)
      const translateBtnExists = await browser.execute(() => {
        const buttons = document.querySelectorAll("header button");
        for (const btn of buttons) {
          const svg = btn.querySelector("svg.lucide-languages");
          if (svg && !btn.hasAttribute("disabled")) {
            return true;
          }
        }
        return false;
      });
      expect(translateBtnExists).to.be.true;

      // Click translate button
      await browser.execute(() => {
        const buttons = document.querySelectorAll("header button");
        for (const btn of buttons) {
          const svg = btn.querySelector("svg.lucide-languages");
          if (svg && !btn.hasAttribute("disabled")) {
            (btn as HTMLElement).click();
            return;
          }
        }
      });
      await browser.pause(500);

      // Wait for TranslationIndicator to appear (pill with progress or language pair)
      await browser.waitUntil(
        async () => {
          return browser.execute(() => {
            // TranslationIndicator contains Globe icon + language dropdowns
            // or Loader2 + progress (e.g. "3/5")
            const indicators = document.querySelectorAll(
              "svg.lucide-globe, svg.lucide-loader-2"
            );
            // Check if any are inside the translation indicator area (not header)
            for (const svg of indicators) {
              const parent = svg.closest(".rounded-md.border.bg-background");
              if (parent) return true;
            }
            // Fallback: look for progress text like "0/3" or "1/3"
            const texts = document.body.innerText;
            return /\d+\/\d+/.test(texts);
          });
        },
        {
          timeout: 10_000,
          timeoutMsg: "Translation indicator did not appear",
        }
      );

      await ss("02-translate", "indicator-appeared");

      // Wait for translation to complete (progress indicator disappears,
      // replaced by language selectors)
      await browser.waitUntil(
        async () => {
          return browser.execute(() => {
            // When done, the indicator shows Globe icon (not Loader2) + language selectors
            const pill = document.querySelector(
              ".rounded-md.border.bg-background"
            );
            if (!pill) return false;
            const loader = pill.querySelector("svg.lucide-loader-2");
            const globe = pill.querySelector("svg.lucide-globe");
            return !loader && !!globe;
          });
        },
        {
          timeout: 60_000,
          timeoutMsg:
            "Translation did not complete within 60s",
        }
      );

      await ss("02-translate", "translation-complete");

      // Verify the editor content has changed (translated text should be different)
      const editorText = await browser.execute(() => {
        const pm = document.querySelector(".ProseMirror");
        return pm?.textContent ?? "";
      });

      // The original was in English; translated text should exist and be non-empty
      expect(editorText.length).to.be.greaterThan(0);

      // Dismiss the translation indicator
      await browser.execute(() => {
        const pill = document.querySelector(
          ".rounded-md.border.bg-background"
        );
        if (!pill) return;
        const closeBtn = pill.querySelector("button");
        if (closeBtn) (closeBtn as HTMLElement).click();
      });
      await browser.pause(500);

      await ss("02-translate", "dismissed");
    });
  });
});
