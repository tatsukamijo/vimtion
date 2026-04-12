import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import {
  reloadAndWait,
  waitForMode,
  pressKeys,
  getVimState,
  getAllBlockTexts,
} from "../helpers";

async function waitForLineCountChange(
  page: Page,
  previousCount: number,
  timeout = 10_000
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await getVimState(page);
    if (state.lineCount !== previousCount) return;
    await page.waitForTimeout(100);
  }
}

test.describe.serial("Operators", () => {
  test.beforeEach(async ({ extensionPage: page }) => {
    await reloadAndWait(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  test.skip("dd deletes current line", async ({ extensionPage: page }) => {
    const blocks = page.locator('[contenteditable="true"]');
    await blocks.nth(2).click();
    await page.waitForTimeout(200);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");

    const before = await getVimState(page);
    const textsBefore = await getAllBlockTexts(page);
    const deletedLineIndex = before.activeLine - 1;
    const deletedText = textsBefore[deletedLineIndex];

    await pressKeys(page, "d", "d");
    await waitForLineCountChange(page, before.lineCount);

    const after = await getVimState(page);
    const textsAfter = await getAllBlockTexts(page);

    expect(after.lineCount).toBe(before.lineCount - 1);
    expect(after.mode).toBe("normal");
    expect(textsAfter).not.toContain(deletedText);
    expect(textsAfter.length).toBe(textsBefore.length - 1);

    // Verify surrounding blocks are untouched
    for (let i = 0; i < deletedLineIndex; i++) {
      expect(textsAfter[i]).toBe(textsBefore[i]);
    }
    for (let i = deletedLineIndex; i < textsAfter.length; i++) {
      expect(textsAfter[i]).toBe(textsBefore[i + 1]);
    }
  });

  test.skip("yy + p duplicates line with correct content", async ({ extensionPage: page }) => {
    const blocks = page.locator('[contenteditable="true"]');
    await blocks.nth(3).click();
    await page.waitForTimeout(200);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");

    const before = await getVimState(page);
    const textsBefore = await getAllBlockTexts(page);
    const yankedLineIndex = before.activeLine - 1;
    const yankedText = textsBefore[yankedLineIndex];

    await pressKeys(page, "y", "y");
    await page.waitForTimeout(200);

    // yy should not change anything
    const afterYank = await getVimState(page);
    const textsAfterYank = await getAllBlockTexts(page);
    expect(afterYank.lineCount).toBe(before.lineCount);
    expect(afterYank.activeLine).toBe(before.activeLine);
    expect(afterYank.mode).toBe("normal");
    expect(textsAfterYank).toEqual(textsBefore);

    await pressKeys(page, "p");
    await waitForLineCountChange(page, before.lineCount);

    const after = await getVimState(page);
    const textsAfter = await getAllBlockTexts(page);

    expect(after.lineCount).toBe(before.lineCount + 1);
    expect(after.mode).toBe("normal");
    expect(textsAfter.length).toBe(textsBefore.length + 1);

    // The pasted line should appear after the yanked line with identical text
    const pastedText = textsAfter[yankedLineIndex + 1];
    expect(pastedText).toBe(yankedText);

    // Blocks before the yanked line should be untouched
    for (let i = 0; i <= yankedLineIndex; i++) {
      expect(textsAfter[i]).toBe(textsBefore[i]);
    }
    // Blocks after the pasted line should be the original blocks shifted down
    for (let i = yankedLineIndex + 1; i < textsBefore.length; i++) {
      expect(textsAfter[i + 1]).toBe(textsBefore[i]);
    }
  });
});
