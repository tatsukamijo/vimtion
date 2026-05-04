import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  waitForBodyClass,
  pressKeys,
  getModeText,
  getAllBlockTexts,
} from "../helpers";

test.describe.serial("Mode transitions", () => {
  let initialized = false;

  test.beforeEach(async ({ extensionPage: page }) => {
    if (!initialized) {
      await navigateToTestPage(page);
      initialized = true;
    }
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  test("Normal → Insert (i)", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "i");
    await waitForMode(page, "insert");

    const text = await getModeText(page);
    expect(text).toContain("-- INSERT --");
    await waitForBodyClass(page, "vim-insert-mode");

    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });

  test("Insert → Normal (Escape)", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "i");
    await waitForMode(page, "insert");

    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
    await waitForBodyClass(page, "vim-normal-mode");

    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });

  test("Insert → Normal (jk escape sequence)", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "i");
    await waitForMode(page, "insert");

    await page.keyboard.press("j");
    await page.waitForTimeout(10);
    await page.keyboard.press("k");
    await waitForMode(page, "normal", 3_000);

    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });

  // The previous insert-then-undo model required `k` to land within ~200ms
  // of `j` or the user saw `j` linger as a literal character. The new
  // commit-on-second-key model removes that pressure: `j` is suppressed
  // until either `k` arrives (→ exit) or the timer fires (→ commit `j` as
  // text). A 150ms gap was on the edge of the old window for many users
  // and is now comfortably inside the recognition window.
  test("Insert → Normal (jk escape with relaxed 150ms gap)", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "i");
    await waitForMode(page, "insert");

    await page.keyboard.press("j");
    await page.waitForTimeout(150);
    await page.keyboard.press("k");
    await waitForMode(page, "normal", 3_000);

    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter, "no `j` or `k` should leak into the document").toEqual(blocksBefore);
  });

  // A lone `j` press in insert mode should still produce the literal `j`
  // in the document — the suppress-and-wait timer must commit on
  // expiration. Without this guarantee the user would lose every `j` they
  // typed in insert mode.
  test("Insert mode: lone `j` commits as text after timeout", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "i");
    await waitForMode(page, "insert");

    await page.keyboard.press("j");
    // Wait well past JK_TIMEOUT_MS so the suppressed `j` is committed.
    await page.waitForTimeout(500);

    // Mode must still be insert (no follow-up `k`).
    const text = await getModeText(page);
    expect(text).toContain("-- INSERT --");

    // Exactly one block must have grown by exactly the literal "j".
    const blocksAfter = await getAllBlockTexts(page);
    const diffs = blocksAfter
      .map((after, i) => ({ i, before: blocksBefore[i], after }))
      .filter((d) => d.before !== d.after);
    expect(diffs.length, "exactly one block changed").toBe(1);
    expect(diffs[0].after.length - diffs[0].before.length, "block grew by 1 char").toBe(1);
    expect(diffs[0].after.endsWith("j") || diffs[0].after.includes("j"), "the inserted char is `j`").toBe(true);

    // Cleanup: undo the insert via Escape + u so the rest of the suite
    // sees the original document.
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
    await pressKeys(page, "u");
    await page.waitForTimeout(200);
  });

  test("Normal → Visual (v)", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "v");
    await waitForMode(page, "visual");

    const text = await getModeText(page);
    expect(text).toContain("-- VISUAL --");
    await waitForBodyClass(page, "vim-visual-mode");

    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });

  test("Visual → Normal (Escape)", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "v");
    await waitForMode(page, "visual");

    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
    await waitForBodyClass(page, "vim-normal-mode");

    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });

  test("Normal → Visual Line (V)", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "Shift+V");
    await waitForMode(page, "visual-line");

    const text = await getModeText(page);
    expect(text).toContain("-- VISUAL-LINE --");
    await waitForBodyClass(page, "vim-visual-line-mode");

    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });

  test("Visual Line → Normal (Escape)", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "Shift+V");
    await waitForMode(page, "visual-line");

    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
    await waitForBodyClass(page, "vim-normal-mode");

    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });
});
