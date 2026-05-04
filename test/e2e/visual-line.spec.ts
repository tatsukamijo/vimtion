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

  // =========================================================================
  // V + j repeated must extend the selection one line per press, not stall.
  // =========================================================================
  // Repro: in visual-line mode, every `j` advances `active_line` by one and
  // calls `updateVisualLineSelection`, which sets a multi-leaf DOM Range
  // anchored at the start leaf and focused at the new active leaf. The
  // resulting `selectionchange` used to fire `reconcileFromSelection`, which
  // read the selection's anchorNode (still the start leaf) and reset
  // `active_line` back to it — so each `j` was immediately undone and the
  // selection was stuck at "start..start+1". `V + k` worked by accident
  // because there the anchor IS the new active leaf.
  test("V + j repeated extends selection by one line each press", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");
    const startState = await getVimState(page);

    await pressKeys(page, "V");
    await waitForMode(page, "visual-line");
    await page.waitForTimeout(50);

    for (let i = 0; i < 4; i++) {
      await pressKeys(page, "j");
      await page.waitForTimeout(80);
    }

    const after = await getVimState(page);
    console.log(
      "V+j x4: startActiveLine =",
      startState.activeLine,
      "endActiveLine =",
      after.activeLine,
    );

    // Four `j` presses must move the active line down by 4. With the
    // reconcile bug, active_line would stall at startActiveLine + 1.
    expect(
      after.activeLine - startState.activeLine,
      "V+j×4 must advance active_line by 4, not get stuck at +1",
    ).toBe(4);
    expect(after.mode).toBe("visual-line");

    // Restore for any followup tests.
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
  });
});
