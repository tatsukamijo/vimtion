import { test, expect } from "../fixtures";
import {
  reloadAndWait,
  waitForMode,
  pressKeys,
  getVimState,
  getAllBlockTexts,
} from "../helpers";

test.describe.serial("Operators", () => {
  test.beforeEach(async ({ extensionPage: page }) => {
    await reloadAndWait(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  test.afterEach(async ({ extensionPage: page }) => {
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(100);
    }
  });

  test.fixme("dd deletes current line", async ({ extensionPage: page }) => {
    // FIXME: Synthetic mouse events in deleteMultipleLinesAtomically trigger
    // Notion's AI popup instead of block selection in headless Chromium.
    await pressKeys(page, "j", "j", "j");
    await page.waitForTimeout(200);

    const textsBefore = await getAllBlockTexts(page);

    await pressKeys(page, "d", "d");
    await page.waitForTimeout(3000);

    const after = await getVimState(page);
    const textsAfter = await getAllBlockTexts(page);

    expect(after.mode).toBe("normal");
    expect(textsAfter.length).toBe(textsBefore.length - 1);
  });

  test("yy + p duplicates line with correct content", async ({ extensionPage: page }) => {
    await pressKeys(page, "j", "j", "j", "j");
    await page.waitForTimeout(200);

    await pressKeys(page, "y", "y");
    await page.waitForTimeout(500);

    const textsAfterYank = await getAllBlockTexts(page);
    const afterYankState = await getVimState(page);
    expect(afterYankState.mode).toBe("normal");

    // Retry p up to 3 times if paste doesn't take effect
    const expectedCount = textsAfterYank.length + 1;
    let textsAfter: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      await pressKeys(page, "p");
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        textsAfter = await getAllBlockTexts(page);
        if (textsAfter.length >= expectedCount) break;
        await page.waitForTimeout(200);
      }
      if (textsAfter.length >= expectedCount) break;
    }

    const after = await getVimState(page);

    expect(after.mode).toBe("normal");
    expect(textsAfter.length).toBe(textsAfterYank.length + 1);
  });

  test("V+d deletes current line (visual line)", async ({ extensionPage: page }) => {
    await pressKeys(page, "j", "j", "j");
    await page.waitForTimeout(200);

    const textsBefore = await getAllBlockTexts(page);

    await pressKeys(page, "Shift+v");
    await page.waitForTimeout(300);
    await pressKeys(page, "d");

    // Wait for block count to decrease
    const expectedCount = textsBefore.length - 1;
    let textsAfter: string[] = [];
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      textsAfter = await getAllBlockTexts(page);
      if (textsAfter.length <= expectedCount) break;
      await page.waitForTimeout(200);
    }

    const after = await getVimState(page);

    expect(after.mode).toBe("normal");
    expect(textsAfter.length).toBe(textsBefore.length - 1);
  });
});
