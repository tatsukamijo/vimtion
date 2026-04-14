import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  reloadAndWait,
  waitForMode,
  pressKeys,
  getVimState,
  getAllBlockTexts,
} from "../helpers";

test.describe.serial("Navigation", () => {
  let initialized = false;

  test.beforeEach(async ({ extensionPage: page }) => {
    if (!initialized) {
      await navigateToTestPage(page);
      initialized = true;
    } else {
      await reloadAndWait(page);
    }
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  test("j moves cursor down", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "g", "g");
    await page.waitForTimeout(200);

    const before = await getVimState(page);
    expect(before.activeLine).toBeGreaterThanOrEqual(1);
    expect(before.activeLine).toBeLessThanOrEqual(2);

    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const after = await getVimState(page);
    expect(after.activeLine).toBeGreaterThan(before.activeLine);
    expect(after.mode).toBe("normal");
    expect(after.lineCount).toBe(before.lineCount);
    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });

  test("k moves cursor up", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "g", "g");
    await pressKeys(page, "j", "j", "j");
    await page.waitForTimeout(200);
    const before = await getVimState(page);

    await pressKeys(page, "k");
    await page.waitForTimeout(200);
    const after = await getVimState(page);

    expect(after.activeLine).toBeLessThan(before.activeLine);
    expect(after.mode).toBe("normal");
    expect(after.lineCount).toBe(before.lineCount);
    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });

  test("gg moves to first line", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "j", "j", "j");
    await page.waitForTimeout(200);

    await pressKeys(page, "g", "g");
    await page.waitForTimeout(200);

    const state = await getVimState(page);
    expect(state.activeLine).toBeGreaterThanOrEqual(1);
    expect(state.activeLine).toBeLessThanOrEqual(2);
    expect(state.mode).toBe("normal");
    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });

  test("G moves to last line", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "Shift+G");
    await page.waitForTimeout(200);

    const state = await getVimState(page);
    expect(state.activeLine).toBe(state.lineCount);
    expect(state.mode).toBe("normal");
    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });

  test("k does not go above first line", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "g", "g");
    await page.waitForTimeout(200);
    const atTop = await getVimState(page);

    await pressKeys(page, "k", "k", "k");
    await page.waitForTimeout(200);
    const after = await getVimState(page);

    expect(after.activeLine).toBeGreaterThanOrEqual(1);
    expect(after.activeLine).toBeLessThanOrEqual(atTop.activeLine);
    expect(after.mode).toBe("normal");
    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });

  test("j at last line stays at last line", async ({ extensionPage: page }) => {
    const blocksBefore = await getAllBlockTexts(page);

    await pressKeys(page, "Shift+G");
    await page.waitForTimeout(200);
    const before = await getVimState(page);

    await pressKeys(page, "j");
    await page.waitForTimeout(200);
    const after = await getVimState(page);

    expect(after.activeLine).toBe(before.activeLine);
    expect(after.mode).toBe("normal");
    expect(after.lineCount).toBe(before.lineCount);
    const blocksAfter = await getAllBlockTexts(page);
    expect(blocksAfter).toEqual(blocksBefore);
  });
});
