/**
 * UI-sync invariant exercise spec — purpose-built canary for BUG-016 / BUG-017.
 *
 * The class of bug:
 *   `vim_info.active_line` is *correct* (the motion handler updates it directly),
 *   but the rendered status bar `.vim-mode` and the absolutely-positioned
 *   `<div class="vim-block-cursor">` overlay are stale because the handler did
 *   not call updateInfoContainer() / updateBlockCursor().
 *
 *   - BUG-016: `w` / `b` crossing a block boundary
 *     (src/content_scripts/navigation/word.ts:27, 47 — direct `active_line += 1`
 *      with setCursorPosition but no UI refresh)
 *   - BUG-017: `{` / `}` paragraph motion
 *     (src/content_scripts/navigation/paragraph.ts — same pattern, gated behind
 *      BUG-007 which currently makes these no-ops; UI desync becomes visible
 *      only once BUG-007 is fixed)
 *
 * Both `useCursorInvariant` and `useUiInvariant` are active. Cursor-invariant
 * SHOULD pass (active_line is correct, DOM selection is on the right element).
 * UI-invariant SHOULD FAIL on the cross-line `w` / `b` tests — the failures
 * here are *the proof the new tool works*. They are not marked `test.fail`;
 * they document the bugs with diagnostic output.
 */
import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  useCursorInvariant,
  useUiInvariant,
  assertUiInvariant,
} from "../helpers";

async function goToBlock(
  page: import("@playwright/test").Page,
  targetText: string,
): Promise<void> {
  const leaf = page
    .locator('[data-content-editable-leaf="true"]')
    .filter({ hasText: targetText })
    .first();
  await leaf.scrollIntoViewIfNeeded();
  await leaf.click();
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await waitForMode(page, "normal");
  await page.waitForTimeout(200);
}

test.describe.serial("UI-sync invariant — BUG-016 / BUG-017 canary", () => {
  useCursorInvariant({ strict: false }, test);
  useUiInvariant({ strict: false }, test);

  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // -------------------------------------------------------------------------
  // CONTROL: in-block `w` should pass both invariants.
  // -------------------------------------------------------------------------
  test("control: w within one block keeps UI in sync", async ({
    extensionPage: page,
  }) => {
    // No hand-rolled cross-checks here — we deliberately let the two installed
    // invariants speak. If either fires, this test fails with a diagnostic
    // message far more useful than `expect(a).toBe(b)`. If both pass, we have
    // proof the UI invariant is not a false-positive on legitimate in-block
    // motion.
    await goToBlock(page, "The quick brown fox jumps over the lazy dog");
    await pressKeys(page, "0");
    // Three `w`s land on "brown", "fox", "jumps" — all within the same block.
    await pressKeys(page, "w", "w", "w");
  });

  // -------------------------------------------------------------------------
  // BUG-016 (forward): `w` past end of block must update status bar / overlay.
  // -------------------------------------------------------------------------
  test("w from end of 'Plain text line 1' crosses to next block — status bar must follow", async ({
    extensionPage: page,
  }) => {
    await goToBlock(page, "Plain text line 1");
    await pressKeys(page, "$"); // end of line

    // Diagnostic probes: capture vim_info.active_line and the status bar
    // text BEFORE and AFTER the `w` keystroke. This documents whether
    // BUG-016 actually triggers in headless Playwright. If active_line
    // increments but the status bar text stays at the old "Line N", we have
    // proof the bug fired; if neither moves, the cross-block branch in
    // jumpToNextWord wasn't taken.
    const before = await page.evaluate(() => {
      const vi = (window as unknown as { vim_info: { active_line: number } }).vim_info;
      const bar = document.querySelector(".vim-mode")?.textContent ?? "";
      return { activeLine: vi.active_line, bar };
    });

    // Pressing `w` here should advance into "Plain text line 2".
    // Per BUG-016, active_line increments and DOM cursor moves, but the
    // status bar `.vim-mode` text is stale because jumpToNextWord at
    // word.ts:27 doesn't call updateInfoContainer().
    await pressKeys(page, "w");

    const after = await page.evaluate(() => {
      const vi = (window as unknown as { vim_info: { active_line: number } }).vim_info;
      const bar = document.querySelector(".vim-mode")?.textContent ?? "";
      return { activeLine: vi.active_line, bar };
    });

    // Annotate the test result so the diagnostic surfaces even on pass.
    test.info().annotations.push({
      type: "diagnostic",
      description: `BEFORE active_line=${before.activeLine} bar=${JSON.stringify(before.bar)} | AFTER active_line=${after.activeLine} bar=${JSON.stringify(after.bar)}`,
    });

    // If active_line incremented, this was a cross-block w. In that case
    // assert UI sync explicitly with strict mode (forces the check even if
    // mode transitioned). Use expect to surface a clear pass/fail signal.
    if (after.activeLine !== before.activeLine) {
      // Cross-block w fired. Status bar's "Line N" must reflect the new
      // active line. If BUG-016 manifests, this assertion fails loudly.
      const expectedFragment = `Line ${after.activeLine + 1}/`;
      expect(
        after.bar,
        `BUG-016: status bar should contain "${expectedFragment}" after cross-block w but got ${JSON.stringify(after.bar)}`,
      ).toContain(expectedFragment);
    }

    // Run the invariant explicitly as a fence-post to confirm the hooked
    // version is doing the same check.
    await assertUiInvariant(page, { label: "post cross-block w", strict: true });
  });

  // -------------------------------------------------------------------------
  // BUG-016 (forward, repeated): multiple `w` presses across paragraphs.
  // -------------------------------------------------------------------------
  test("repeated w across plain-text paragraphs surfaces stale status bar", async ({
    extensionPage: page,
  }) => {
    await goToBlock(page, "Plain text line 2");
    await pressKeys(page, "$");
    // Cross from line 2 → line 3 → line 4 with consecutive `w`s.
    await pressKeys(page, "w", "w", "w");
  });

  // -------------------------------------------------------------------------
  // BUG-016 (backward): `b` from start of block must update UI.
  // jumpToPreviousWord (word.ts:47) has the symmetric issue.
  // -------------------------------------------------------------------------
  test("b from start of 'Plain text line 3' crosses backward — status bar must follow", async ({
    extensionPage: page,
  }) => {
    await goToBlock(page, "Plain text line 3");
    await pressKeys(page, "0"); // start of line
    // `b` should move to last word of "Plain text line 2".
    await pressKeys(page, "b");
  });

  // -------------------------------------------------------------------------
  // BUG-016 (backward, repeated): mirror of the forward repeated case.
  // -------------------------------------------------------------------------
  test("repeated b across plain-text paragraphs surfaces stale status bar", async ({
    extensionPage: page,
  }) => {
    await goToBlock(page, "Plain text line 4");
    await pressKeys(page, "0");
    await pressKeys(page, "b", "b", "b");
  });

  // -------------------------------------------------------------------------
  // BUG-017 (gated by BUG-007): `}` paragraph motion. Currently `{`/`}` are
  // no-ops in this codebase (BUG-007), so this test is expected to PASS today
  // — the invariant will only catch BUG-017 after BUG-007 is fixed and `}`
  // actually moves. Kept here as a sentinel: when BUG-007 is fixed, this test
  // will start failing with a `[UiInvariant]` diagnostic naming `}` as the
  // breaking key — that's the desired outcome.
  // -------------------------------------------------------------------------
  test("} paragraph motion — sentinel for BUG-017 (passes today, will fail post-BUG-007 fix)", async ({
    extensionPage: page,
  }) => {
    await goToBlock(page, "Plain text line 1");
    await pressKeys(page, "}");
  });

  // -------------------------------------------------------------------------
  // BUG-017 (gated): mirror sentinel for `{`.
  // -------------------------------------------------------------------------
  test("{ paragraph motion — sentinel for BUG-017 (passes today, will fail post-BUG-007 fix)", async ({
    extensionPage: page,
  }) => {
    await goToBlock(page, "Plain text line 5");
    await pressKeys(page, "{");
  });

  // -------------------------------------------------------------------------
  // CONTROL: `j` cross-block already calls setActiveLine which DOES refresh
  // the UI. This test should pass both invariants and confirms the UI-invariant
  // doesn't false-positive on legitimate cross-block motions.
  // -------------------------------------------------------------------------
  test("control: j cross-block keeps UI in sync (refreshes via setActiveLine)", async ({
    extensionPage: page,
  }) => {
    // Same reasoning as the in-block control: rely on the invariants.
    await goToBlock(page, "Plain text line 1");
    await pressKeys(page, "j", "j");
  });
});
