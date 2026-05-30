import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
} from "../helpers";

/**
 * Vim `z` reposition family: zz (center), zt (top), zb (bottom), and the
 * first-non-blank variants z. / z<CR> / z-.
 *
 * The viewport assertions compare the SAME block's viewport-relative top after
 * each command. Only the scroll offset changes, so the block sits higher after
 * `zt` than after `zz`, and higher after `zz` than after `zb`.
 */
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
  await page.waitForTimeout(100);
}

/** Viewport-relative top (px) of the target block's leaf. */
function leafTop(
  page: import("@playwright/test").Page,
  targetText: string,
): Promise<number> {
  return page
    .locator('[data-content-editable-leaf="true"]')
    .filter({ hasText: targetText })
    .first()
    .evaluate((el) => el.getBoundingClientRect().top);
}

// A block roughly mid-document so it has room to be pushed to the top AND
// pulled to the bottom of the viewport.
const TARGET = "The quick brown fox jumps over the lazy dog";

test.describe.serial("z reposition commands (zz/zt/zb)", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  test("zt / zz / zb place the active line at top / center / bottom", async ({
    extensionPage: page,
  }) => {
    await goToBlock(page, TARGET);

    await pressKeys(page, "z", "t");
    await page.waitForTimeout(150);
    const topAfterZt = await leafTop(page, TARGET);

    await pressKeys(page, "z", "z");
    await page.waitForTimeout(150);
    const topAfterZz = await leafTop(page, TARGET);

    await pressKeys(page, "z", "b");
    await page.waitForTimeout(150);
    const topAfterZb = await leafTop(page, TARGET);

    console.log("z reposition tops:", { topAfterZt, topAfterZz, topAfterZb });

    // Same block, three scroll positions: zt highest, zb lowest in the viewport.
    // 40px margins guard against sub-pixel / header-offset noise while staying
    // far below the real gaps (hundreds of px on a normal viewport).
    expect(topAfterZt).toBeLessThan(topAfterZz - 40);
    expect(topAfterZz).toBeLessThan(topAfterZb - 40);

    // Repositioning must not change mode or active line.
    expect((await getVimState(page)).mode).toBe("normal");
  });

  test("z. / z<CR> / z- run without leaving normal mode", async ({
    extensionPage: page,
  }) => {
    await goToBlock(page, TARGET);
    const startLine = (await getVimState(page)).activeLine;

    for (const second of [".", "Enter", "-"]) {
      await pressKeys(page, "z", second);
      await page.waitForTimeout(120);
      const state = await getVimState(page);
      expect(state.mode, `z${second} should stay in normal mode`).toBe(
        "normal",
      );
      // The reposition variants must not move the cursor off its line.
      expect(state.activeLine, `z${second} must not change active line`).toBe(
        startLine,
      );
    }
  });
});
