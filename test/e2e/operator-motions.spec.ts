import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
  getActualCursorBlockIndex,
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

async function undo(page: import("@playwright/test").Page, times = 5) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(200);
}

async function shiftKey(page: import("@playwright/test").Page, key: string) {
  await page.evaluate((k) => {
    const target = document.activeElement || document;
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key: k.toUpperCase(), code: `Key${k.toUpperCase()}`, shiftKey: true,
      bubbles: true, cancelable: true,
    }));
  }, key);
}

// =============================================================================
// Operator + Motion tests. Each test:
// 1. Navigates to a specific block
// 2. Positions cursor (via pressKeys with delays)
// 3. Executes operator + motion
// 4. Verifies resulting text
// 5. Undoes the change
// =============================================================================

test.describe.serial("Operator + Motion", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // ===== Delete + Motion =====

  test("dw deletes to next word", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");

    await fastKeys(page, "d", "w");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toBe("quick brown fox jumps over the lazy dog");

    await undo(page);
  });

  test("d$ deletes to end of line", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w", "w");

    await fastKeys(page, "d", "$");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toBe("The quick ");

    await undo(page);
  });

  test("d0 deletes to beginning of line", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w", "w", "w");

    await fastKeys(page, "d", "0");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toBe("fox jumps over the lazy dog");

    await undo(page);
  });

  test("D deletes to end of line (like d$)", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w", "w");

    await shiftKey(page, "d");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toBe("The quick ");

    await undo(page);
  });

  // ===== Delete + Character Search =====

  test("df deletes through found character", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "find char: abcdefghij");
    await pressKeys(page, "0");

    await fastKeys(page, "d", "f", ":");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toBe(" abcdefghij klmnop");

    await undo(page);
  });

  test("dt deletes up to (not including) character", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "find char: abcdefghij");
    await pressKeys(page, "0");

    await fastKeys(page, "d", "t", ":");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toBe(": abcdefghij klmnop");

    await undo(page);
  });

  // ===== Change + Motion =====

  test("cw changes word and enters insert mode", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");

    await fastKeys(page, "c", "w");
    await page.waitForTimeout(200);

    const state = await getVimState(page);
    expect(state.mode).toBe("insert");

    await page.keyboard.type("A", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    const text = await getBlockText(page, idx);
    expect(text).toBe("Aquick brown fox jumps over the lazy dog");

    await undo(page);
  });

  test("c$ changes to end of line", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w", "w");

    await fastKeys(page, "c", "$");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("RED", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    const text = await getBlockText(page, idx);
    expect(text).toBe("The quick RED");

    await undo(page);
  });

  test("C changes to end of line (like c$)", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w");

    await shiftKey(page, "c");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("FAST", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    const text = await getBlockText(page, idx);
    expect(text).toBe("The FAST");

    await undo(page);
  });

  test("cc changes entire line", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "short");
    await pressKeys(page, "0");

    await fastKeys(page, "c", "c");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("replaced", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    const text = await getBlockText(page, idx);
    expect(text).toBe("replaced");

    await undo(page);
  });

  // ===== Yank + Motion =====

  test("yw yanks word, p pastes it", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");

    await fastKeys(page, "y", "w");
    await page.waitForTimeout(300);

    await pressKeys(page, "$");
    await fastKeys(page, "p");
    await page.waitForTimeout(500);

    const text = await getBlockText(page, idx);
    expect(text).toContain("The ");
    expect(text).toMatch(/The $/);

    await undo(page);
  });

  test("y$ yanks to end of line", async ({ extensionPage: page }) => {
    await goToBlock(page, "short");
    await pressKeys(page, "0");

    await fastKeys(page, "y", "$");
    await page.waitForTimeout(300);

    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "$");
    await fastKeys(page, "p");
    await page.waitForTimeout(500);

    const otherIdx = (await getAllBlockTexts(page)).findIndex(t => t.includes("The quick brown fox"));
    const text = await getBlockText(page, otherIdx);
    expect(text).toContain("short");

    await undo(page);
  });

  // ===== Text Objects: Inner =====

  test("ciw changes inner word", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w");

    await fastKeys(page, "c", "i", "w");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("slow", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    const text = await getBlockText(page, idx);
    expect(text).toBe("The slow brown fox jumps over the lazy dog");

    await undo(page);
  });

  test("diw deletes inner word", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w");

    await fastKeys(page, "d", "i", "w");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toBe("The  brown fox jumps over the lazy dog");

    await undo(page);
  });

  test("daw deletes around word (including surrounding space)", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w");

    await fastKeys(page, "d", "a", "w");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toBe("The brown fox jumps over the lazy dog");

    await undo(page);
  });

  test("ci( changes inside parentheses", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "hello(world)");
    await pressKeys(page, "0", "f", "(", "l");

    await fastKeys(page, "c", "i", "(");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("earth", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    const text = await getBlockText(page, idx);
    expect(text).toContain("hello(earth)");

    await undo(page);
  });

  test("di[ deletes inside brackets", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "hello(world)");
    await pressKeys(page, "0", "f", "[", "l");

    await fastKeys(page, "d", "i", "[");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toContain("[]");

    await undo(page);
  });

  test("ci{ changes inside braces", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "hello(world)");
    await pressKeys(page, "0", "f", "{", "l");

    await fastKeys(page, "c", "i", "{");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("curly", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    const text = await getBlockText(page, idx);
    expect(text).toContain("{curly}");

    await undo(page);
  });

  test("ci' changes inside single quotes", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "say 'single'");
    await pressKeys(page, "0", "f", "'", "l");

    await fastKeys(page, "c", "i", "'");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("replaced", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    const text = await getBlockText(page, idx);
    expect(text).toContain("'replaced'");

    await undo(page);
  });

  test('ci" changes inside double quotes', async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "say 'single'");
    await pressKeys(page, "0", "f", '"', "l");

    await fastKeys(page, "c", "i", '"');
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("changed", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    const text = await getBlockText(page, idx);
    expect(text).toContain('"changed"');

    await undo(page);
  });

  test("ci` changes inside backticks", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "some *bold*");
    await pressKeys(page, "0", "f", "`", "l");

    await fastKeys(page, "c", "i", "`");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("snippet", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    const text = await getBlockText(page, idx);
    expect(text).toContain("`snippet`");

    await undo(page);
  });

  test("di/ deletes inside slashes", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "first/second/third");
    await pressKeys(page, "0", "f", "/", "l");

    await fastKeys(page, "d", "i", "/");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toContain("first//third");

    await undo(page);
  });

  // ===== Text Objects: Around =====

  test("da( deletes around parentheses", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "hello(world)");
    await pressKeys(page, "0", "f", "(", "l");

    await fastKeys(page, "d", "a", "(");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).not.toContain("(");
    expect(text).not.toContain(")");
    expect(text).toContain("hello");

    await undo(page);
  });

  test('da" deletes around double quotes', async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "say 'single'");
    await pressKeys(page, "0", "f", '"', "l");

    await fastKeys(page, "d", "a", '"');
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).not.toContain('"');
    expect(text).toContain("say");

    await undo(page);
  });

  // ===== Standalone Commands =====

  test("x deletes character at cursor", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "short");
    await pressKeys(page, "0");

    await fastKeys(page, "x");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toBe("hort");

    await undo(page);
  });

  test("X deletes character before cursor", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "short");
    await pressKeys(page, "0", "l");

    await shiftKey(page, "x");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toBe("hort");

    await undo(page);
  });

  test("s substitutes character and enters insert mode", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "short");
    await pressKeys(page, "0");

    await fastKeys(page, "s");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("S", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    const text = await getBlockText(page, idx);
    expect(text).toBe("Short");

    await undo(page);
  });

  // ===== Visual mode + operator =====

  test("viw selects inner word, d deletes it", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w");

    await fastKeys(page, "v", "i", "w");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("visual");

    await fastKeys(page, "d");
    await page.waitForTimeout(200);

    const text = await getBlockText(page, idx);
    expect(text).toBe("The  brown fox jumps over the lazy dog");

    await undo(page);
  });

  test("v$ selects to end of line, y yanks it", async ({ extensionPage: page }) => {
    await goToBlock(page, "short");
    await pressKeys(page, "0");

    await fastKeys(page, "v", "$");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("visual");

    await fastKeys(page, "y");
    await page.waitForTimeout(300);

    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "$");
    await fastKeys(page, "p");
    await page.waitForTimeout(500);

    const otherIdx = (await getAllBlockTexts(page)).findIndex(t => t.includes("The quick brown fox"));
    const text = await getBlockText(page, otherIdx);
    expect(text).toContain("short");

    await undo(page);
  });

  // ===== Cursor position after operations =====

  test("after dw, cursor stays in normal mode on correct block", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");

    await fastKeys(page, "d", "w");
    await page.waitForTimeout(200);

    const state = await getVimState(page);
    expect(state.mode).toBe("normal");
    expect(await getActualCursorBlockIndex(page)).toBe(idx);

    await undo(page);
  });

  test("after ciw + Esc, j moves to next block", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w");

    await fastKeys(page, "c", "i", "w");
    await page.waitForTimeout(200);
    await page.keyboard.type("REPLACED", { delay: 30 });
    await fastKeys(page, "Escape");
    await page.waitForTimeout(100);

    expect(await getActualCursorBlockIndex(page)).toBe(idx);

    await pressKeys(page, "j");
    expect(await getActualCursorBlockIndex(page)).toBe(idx + 1);

    await undo(page);
  });

  // ===== Paragraph motions =====

  test("d} deletes to next paragraph", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");

    const beforeTexts = await getAllBlockTexts(page);
    await fastKeys(page, "d", "}");
    await page.waitForTimeout(500);

    const afterTexts = await getAllBlockTexts(page);
    expect(afterTexts.length).toBeLessThan(beforeTexts.length);

    await undo(page, 15);
  });
});
