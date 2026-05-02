import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
  getAllBlockTexts,
} from "../helpers";

async function fastKeys(
  page: import("@playwright/test").Page,
  ...keys: string[]
) {
  for (const key of keys) {
    await page.keyboard.press(key);
  }
}

async function goToBlock(
  page: import("@playwright/test").Page,
  targetText: string,
): Promise<number> {
  const leaf = page.locator('[data-content-editable-leaf="true"]')
    .filter({ hasText: targetText }).first();
  await leaf.scrollIntoViewIfNeeded();
  await leaf.click();
  await page.waitForTimeout(100);
  await fastKeys(page, "Escape");
  await waitForMode(page, "normal");
  await page.waitForTimeout(100);

  const allTexts = await getAllBlockTexts(page);
  const targetIndex = allTexts.findIndex((t) => t.includes(targetText));
  if (targetIndex === -1) throw new Error(`Block "${targetText}" not found`);
  return targetIndex;
}

async function getBlockText(
  page: import("@playwright/test").Page,
  blockIndex: number,
): Promise<string> {
  const blocks = page.locator('[data-content-editable-leaf="true"]');
  return (await blocks.nth(blockIndex).textContent()) ?? "";
}

// =============================================================================
// Undo / Redo tests
// Vimtion: u = undo, r = redo (dispatches Cmd+Z / Cmd+Shift+Z to Notion)
// =============================================================================

test.describe.serial("Undo / Redo", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // ===== Basic undo =====

  test("u undoes a single dw", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");

    await fastKeys(page, "d", "w");
    await page.waitForTimeout(200);
    expect(await getBlockText(page, idx)).toBe("quick brown fox jumps over the lazy dog");

    await pressKeys(page, "u");
    await page.waitForTimeout(300);

    expect(await getBlockText(page, idx)).toBe("The quick brown fox jumps over the lazy dog");
  });

  test("u undoes an insert mode edit", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "short");
    const original = await getBlockText(page, idx);

    await pressKeys(page, "0");
    await fastKeys(page, "i");
    await page.waitForTimeout(100);
    await page.keyboard.type("XYZ", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    expect(await getBlockText(page, idx)).toBe("XYZshort");

    await pressKeys(page, "u");
    await page.waitForTimeout(300);

    expect(await getBlockText(page, idx)).toBe(original);
  });

  test("u undoes x (single char delete)", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "short");
    await pressKeys(page, "0");

    await fastKeys(page, "x");
    await page.waitForTimeout(200);
    expect(await getBlockText(page, idx)).toBe("hort");

    await pressKeys(page, "u");
    await page.waitForTimeout(300);

    expect(await getBlockText(page, idx)).toBe("short");
  });

  // ===== Basic redo =====

  test("r redoes after u", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");

    await fastKeys(page, "d", "w");
    await page.waitForTimeout(200);
    expect(await getBlockText(page, idx)).toBe("quick brown fox jumps over the lazy dog");

    await pressKeys(page, "u");
    await page.waitForTimeout(300);
    expect(await getBlockText(page, idx)).toBe("The quick brown fox jumps over the lazy dog");

    await pressKeys(page, "r");
    await page.waitForTimeout(300);
    expect(await getBlockText(page, idx)).toBe("quick brown fox jumps over the lazy dog");

    // Clean up
    await pressKeys(page, "u");
    await page.waitForTimeout(300);
  });

  // ===== Consecutive undo (using x which doesn't cause cursor drift) =====

  test("multiple u undoes consecutive dw one by one", async ({ extensionPage: page }) => {
    // Use dw on a longer line where word deletion is reliable
    const idx = await goToBlock(page, "find char: abcdefghij");
    await pressKeys(page, "0");

    // dw 1: delete "find "
    await fastKeys(page, "d", "w");
    await page.waitForTimeout(400);
    const after1 = await getBlockText(page, idx);

    // dw 2: delete next word
    await fastKeys(page, "d", "w");
    await page.waitForTimeout(400);
    const after2 = await getBlockText(page, idx);
    expect(after2).not.toBe(after1);

    // Undo 1: back to after1
    await pressKeys(page, "u");
    await page.waitForTimeout(400);
    expect(await getBlockText(page, idx)).toBe(after1);

    // Undo 2: back to original
    await pressKeys(page, "u");
    await page.waitForTimeout(400);
    expect(await getBlockText(page, idx)).toBe("find char: abcdefghij klmnop");
  });

  // ===== Consecutive redo =====

  test("multiple r redoes consecutive undos", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "find char: abcdefghij");
    await pressKeys(page, "0");
    const original = "find char: abcdefghij klmnop";

    // 2 dw deletes
    await fastKeys(page, "d", "w");
    await page.waitForTimeout(400);
    const after1 = await getBlockText(page, idx);

    await fastKeys(page, "d", "w");
    await page.waitForTimeout(400);
    const after2 = await getBlockText(page, idx);

    // Undo all 2
    await pressKeys(page, "u");
    await page.waitForTimeout(400);
    await pressKeys(page, "u");
    await page.waitForTimeout(400);
    expect(await getBlockText(page, idx)).toBe(original);

    // Redo 1
    await pressKeys(page, "r");
    await page.waitForTimeout(400);
    expect(await getBlockText(page, idx)).toBe(after1);

    // Redo 2
    await pressKeys(page, "r");
    await page.waitForTimeout(400);
    expect(await getBlockText(page, idx)).toBe(after2);

    // Clean up
    await pressKeys(page, "u");
    await page.waitForTimeout(300);
    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  // ===== Redo invalidation =====

  test("new edit after undo clears redo history", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    const original = "The quick brown fox jumps over the lazy dog";
    await pressKeys(page, "0");

    // Edit 1: dw
    await fastKeys(page, "d", "w");
    await page.waitForTimeout(300);
    const afterDw = await getBlockText(page, idx);
    expect(afterDw).toBe("quick brown fox jumps over the lazy dog");

    // Undo
    await pressKeys(page, "u");
    await page.waitForTimeout(400);
    expect(await getBlockText(page, idx)).toBe(original);

    // New edit: different dw (clears redo stack)
    await pressKeys(page, "0", "w");
    await fastKeys(page, "d", "w");
    await page.waitForTimeout(300);

    // Redo should NOT bring back first dw result
    await pressKeys(page, "r");
    await page.waitForTimeout(300);
    const text = await getBlockText(page, idx);
    expect(text).not.toBe(afterDw);

    // Clean up
    await pressKeys(page, "u");
    await page.waitForTimeout(300);
    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  // ===== Mode stays normal =====

  test("u keeps normal mode", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");

    await fastKeys(page, "d", "w");
    await page.waitForTimeout(200);

    await pressKeys(page, "u");
    await page.waitForTimeout(300);

    expect((await getVimState(page)).mode).toBe("normal");
  });

  test("r keeps normal mode", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");

    await fastKeys(page, "d", "w");
    await page.waitForTimeout(200);
    await pressKeys(page, "u");
    await page.waitForTimeout(300);
    await pressKeys(page, "r");
    await page.waitForTimeout(300);

    expect((await getVimState(page)).mode).toBe("normal");

    // Clean up
    await pressKeys(page, "u");
    await page.waitForTimeout(300);
  });

  // ===== Mixed operation types =====

  test("repeated u eventually restores original after mixed edits", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    const original = "The quick brown fox jumps over the lazy dog";
    await pressKeys(page, "0");

    // Edit 1: dw (delete "The ")
    await fastKeys(page, "d", "w");
    await page.waitForTimeout(300);
    expect(await getBlockText(page, idx)).toBe("quick brown fox jumps over the lazy dog");

    // Edit 2: i + type + Esc
    await fastKeys(page, "i");
    await page.waitForTimeout(100);
    await page.keyboard.type("Z", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(200);
    expect(await getBlockText(page, idx)).toBe("Zquick brown fox jumps over the lazy dog");

    // Undo until we get back to original (Notion may group undo steps)
    for (let i = 0; i < 5; i++) {
      await pressKeys(page, "u");
      await page.waitForTimeout(400);
      if ((await getBlockText(page, idx)) === original) break;
    }
    expect(await getBlockText(page, idx)).toBe(original);
  });

  // ===== Rapid undo/redo cycle =====

  test("rapid u u r r cycle restores final state", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "find char: abcdefghij");
    const original = "find char: abcdefghij klmnop";
    await pressKeys(page, "0");

    // 2 dw deletes
    await fastKeys(page, "d", "w");
    await page.waitForTimeout(400);
    await fastKeys(page, "d", "w");
    await page.waitForTimeout(400);
    const afterAll = await getBlockText(page, idx);

    // Rapid undo x2
    await fastKeys(page, "u");
    await page.waitForTimeout(300);
    await fastKeys(page, "u");
    await page.waitForTimeout(400);
    expect(await getBlockText(page, idx)).toBe(original);

    // Rapid redo x2
    await fastKeys(page, "r");
    await page.waitForTimeout(300);
    await fastKeys(page, "r");
    await page.waitForTimeout(400);
    expect(await getBlockText(page, idx)).toBe(afterAll);

    // Clean up
    await fastKeys(page, "u");
    await page.waitForTimeout(300);
    await fastKeys(page, "u");
    await page.waitForTimeout(400);
  });

  // ===== Visual Line selection + delete + undo/redo =====

  test("V + 3j + d deletes 4 lines, u restores them", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");
    const beforeCount = (await getAllBlockTexts(page)).length;

    await pressKeys(page, "Shift+v");
    await page.waitForTimeout(500);

    await pressKeys(page, "j", "j", "j");
    await page.waitForTimeout(300);

    await pressKeys(page, "d");
    await page.waitForTimeout(800);

    let duringCount = beforeCount;
    for (let i = 0; i < 10; i++) {
      duringCount = (await getAllBlockTexts(page)).length;
      if (duringCount < beforeCount) break;
      await page.waitForTimeout(200);
    }
    expect(duringCount).toBeLessThan(beforeCount);

    // Undo — all deleted lines should come back
    await pressKeys(page, "u");
    await page.waitForTimeout(800);

    const afterCount = (await getAllBlockTexts(page)).length;
    expect(afterCount).toBe(beforeCount);
  });

  test("V + 3j + d + u + r re-deletes the lines", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");
    const beforeCount = (await getAllBlockTexts(page)).length;

    await pressKeys(page, "Shift+v");
    await page.waitForTimeout(500);
    await pressKeys(page, "j", "j", "j");
    await page.waitForTimeout(300);
    await pressKeys(page, "d");
    await page.waitForTimeout(800);

    let deletedCount = beforeCount;
    for (let i = 0; i < 10; i++) {
      deletedCount = (await getAllBlockTexts(page)).length;
      if (deletedCount < beforeCount) break;
      await page.waitForTimeout(200);
    }
    expect(deletedCount).toBeLessThan(beforeCount);

    // Undo
    await pressKeys(page, "u");
    await page.waitForTimeout(800);
    expect((await getAllBlockTexts(page)).length).toBe(beforeCount);

    // Redo
    await pressKeys(page, "r");
    await page.waitForTimeout(800);
    expect((await getAllBlockTexts(page)).length).toBe(deletedCount);

    // Clean up
    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("V + large selection (5j) + d + u restores all", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 1");
    const beforeCount = (await getAllBlockTexts(page)).length;

    await pressKeys(page, "Shift+v");
    await page.waitForTimeout(500);
    await pressKeys(page, "j", "j", "j", "j", "j");
    await page.waitForTimeout(300);
    await pressKeys(page, "d");
    await page.waitForTimeout(800);

    let duringCount = beforeCount;
    for (let i = 0; i < 10; i++) {
      duringCount = (await getAllBlockTexts(page)).length;
      if (duringCount < beforeCount) break;
      await page.waitForTimeout(200);
    }
    expect(duringCount).toBeLessThan(beforeCount);

    // Undo
    await pressKeys(page, "u");
    await page.waitForTimeout(800);
    expect((await getAllBlockTexts(page)).length).toBe(beforeCount);
  });

  test("V + d stays in normal mode after delete", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 5");

    await pressKeys(page, "Shift+v");
    await page.waitForTimeout(500);
    await pressKeys(page, "j");
    await page.waitForTimeout(300);
    await pressKeys(page, "d");
    await page.waitForTimeout(800);

    // Wait for delete to complete and return to normal mode
    for (let i = 0; i < 10; i++) {
      if ((await getVimState(page)).mode === "normal") break;
      await page.waitForTimeout(200);
    }
    expect((await getVimState(page)).mode).toBe("normal");

    // Clean up
    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });
});
