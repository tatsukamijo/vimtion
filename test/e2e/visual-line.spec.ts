import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
  getAllBlockTexts,
} from "../helpers";

/**
 * Click into a target block (by text) and Escape to normal mode.
 * Used as setup so each test starts from a known cursor position.
 */
async function goToBlock(
  page: import("@playwright/test").Page,
  targetText: string,
): Promise<number> {
  const leaf = page
    .locator('[data-content-editable-leaf="true"]')
    .filter({ hasText: targetText })
    .first();
  await leaf.scrollIntoViewIfNeeded();
  await leaf.click();
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await waitForMode(page, "normal");
  await page.waitForTimeout(100);

  const allTexts = await getAllBlockTexts(page);
  return allTexts.findIndex((t) => t.includes(targetText));
}

test.describe.serial("Visual-line mode — pending operator state", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // =========================================================================
  // BUG-014: pending_operator "g" leaks across V→Esc into normal mode
  // =========================================================================
  // Reducer does `pending_operator = "g"` on first `g` press in visual-line
  // (vim.ts:928-940), but neither the `Escape` exit (vim.ts:904-921) nor
  // motion keys clear it. So a subsequent `g` in normal mode is treated as
  // the second `g` of `gg` and jumps to line 1.
  test("BUG-014: g pending state leaks across V→Esc into normal mode", async ({ extensionPage: page }) => {
    const startIdx = await goToBlock(page, "Plain text line 5");
    const startState = await getVimState(page);
    expect(startState.activeLine, "Plain text line 5 should be far from line 1").toBeGreaterThan(2);

    // V g Esc g — the trailing g should NOT trigger gg-jump-to-top because
    // the V-pending-g should have been cleared by Escape.
    await pressKeys(page, "V", "g", "Escape", "g");
    await page.waitForTimeout(150);

    const state = await getVimState(page);
    console.log(
      "BUG-014: startIdx =",
      startIdx,
      "startActiveLine =",
      startState.activeLine,
      "endActiveLine =",
      state.activeLine,
    );

    // BUG-014 — see docs/known-bugs.md
    // The leaked pending_operator causes the trailing `g` to be interpreted
    // as the second `g` of gg → jump to line 1. If the bug is fixed,
    // active_line stays at start (or moved by some other key path).
    expect(state.activeLine, "BUG-014: active_line must NOT be 1 after V g Esc g").not.toBe(1);
    expect(state.mode, "should be back in normal mode after Escape").toBe("normal");
  });
});
