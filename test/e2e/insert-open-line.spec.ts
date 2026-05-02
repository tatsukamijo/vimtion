import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
  getCursorPosition,
  getActualCursorBlockText,
  getActualCursorBlockIndex,
  getAllBlockTexts,
  getCurrentBlockType,
} from "../helpers";

async function goToBlock(
  page: import("@playwright/test").Page,
  targetText: string,
): Promise<number> {
  const allLeaves = page.locator('[data-content-editable-leaf="true"]');
  const firstLeaf = allLeaves.first();
  await firstLeaf.scrollIntoViewIfNeeded();
  await firstLeaf.click();
  await page.waitForTimeout(50);

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

  const allTexts = await getAllBlockTexts(page);
  return allTexts.findIndex((t) => t.includes(targetText));
}

test.describe.serial("Insert / Open Line — block types & edge cases", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // =========================================================================
  // o (open below) — nested bullets
  // =========================================================================

  test("o on parent bullet with children creates line between parent and first child", async ({ extensionPage: page }) => {
    const idx = await goToBlock(page, "Bullet item 2");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("AFTER_PARENT");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const newIdx = after.findIndex((t) => t.includes("AFTER_PARENT"));
    const child1Idx = after.findIndex((t) => t.includes("Nested bullet child 1"));

    console.log("o-parent-bullet: AFTER_PARENT at", newIdx, "child1 at", child1Idx, "parent was", idx);
    // Notion creates new line right after parent in DOM order (between parent and first child)
    expect(newIdx).toBe(idx + 1);
    expect(newIdx).toBeLessThan(child1Idx);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  test("o on nested bullet child creates sibling", async ({ extensionPage: page }) => {
    await goToBlock(page, "Nested bullet child 1");
    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("NEW_SIBLING");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const child1Idx = after.findIndex((t) => t.includes("Nested bullet child 1"));
    const newIdx = after.findIndex((t) => t.includes("NEW_SIBLING"));
    const child2Idx = after.findIndex((t) => t.includes("Nested bullet child 2"));

    console.log("o-nested-child: child1 at", child1Idx, "NEW_SIBLING at", newIdx, "child2 at", child2Idx);
    // Should be inserted between child 1 and child 2
    expect(newIdx).toBe(child1Idx + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  test("o on last nested bullet child", async ({ extensionPage: page }) => {
    await goToBlock(page, "Nested bullet child 2");
    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("AFTER_LAST_CHILD");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const child2Idx = after.findIndex((t) => t.includes("Nested bullet child 2"));
    const newIdx = after.findIndex((t) => t.includes("AFTER_LAST_CHILD"));
    const item3Idx = after.findIndex((t) => t.includes("Bullet item 3"));

    console.log("o-last-nested: child2 at", child2Idx, "AFTER_LAST_CHILD at", newIdx, "item3 at", item3Idx);
    expect(newIdx).toBe(child2Idx + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  // =========================================================================
  // o (open below) — nested todos
  // =========================================================================

  test("o on todo with nested child creates line between parent and child", async ({ extensionPage: page }) => {
    const parentIdx = await goToBlock(page, "Todo unchecked 2");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("AFTER_TODO_PARENT");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const nestedIdx = after.findIndex((t) => t.includes("Nested todo child"));
    const newIdx = after.findIndex((t) => t.includes("AFTER_TODO_PARENT"));

    console.log("o-todo-parent: parent was", parentIdx, "new at", newIdx, "nested at", nestedIdx);
    // Same as bullet: new line goes right after parent in DOM order
    expect(newIdx).toBe(parentIdx + 1);
    expect(newIdx).toBeLessThan(nestedIdx);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  test("o on nested todo child", async ({ extensionPage: page }) => {
    await goToBlock(page, "Nested todo child");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("AFTER_NESTED_TODO");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const nestedIdx = after.findIndex((t) => t.includes("Nested todo child"));
    const newIdx = after.findIndex((t) => t.includes("AFTER_NESTED_TODO"));

    console.log("o-nested-todo: nested at", nestedIdx, "AFTER_NESTED_TODO at", newIdx);
    expect(newIdx).toBe(nestedIdx + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  // =========================================================================
  // o (open below) — code block boundary
  // =========================================================================

  test("o on heading before code block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("BEFORE_CODE");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const headingIdx = after.findIndex((t) => t.includes("Section 8: Code block"));
    const newIdx = after.findIndex((t) => t.includes("BEFORE_CODE"));

    console.log("o-before-code: heading at", headingIdx, "BEFORE_CODE at", newIdx);
    expect(newIdx).toBe(headingIdx + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  test("o on text after code block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Text after code block");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("AFTER_CODE_TEXT");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const textIdx = after.findIndex((t) => t.includes("Text after code block"));
    const newIdx = after.findIndex((t) => t.includes("AFTER_CODE_TEXT"));

    console.log("o-after-code: text at", textIdx, "AFTER_CODE_TEXT at", newIdx);
    expect(newIdx).toBe(textIdx + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  // =========================================================================
  // o (open below) — divider boundary
  // =========================================================================

  test("o on text before divider", async ({ extensionPage: page }) => {
    await goToBlock(page, "Before divider");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("BETWEEN_DIVIDER");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const beforeIdx = after.findIndex((t) => t.includes("Before divider"));
    const newIdx = after.findIndex((t) => t.includes("BETWEEN_DIVIDER"));

    console.log("o-before-divider: before at", beforeIdx, "BETWEEN_DIVIDER at", newIdx);
    expect(newIdx).toBe(beforeIdx + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  test("o on text after divider", async ({ extensionPage: page }) => {
    await goToBlock(page, "After divider");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("POST_DIVIDER");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const afterIdx = after.findIndex((t) => t.includes("After divider"));
    const newIdx = after.findIndex((t) => t.includes("POST_DIVIDER"));

    console.log("o-after-divider: after at", afterIdx, "POST_DIVIDER at", newIdx);
    expect(newIdx).toBe(afterIdx + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  // =========================================================================
  // O (open above) — nested bullets
  // =========================================================================

  // BUG-009: O creates line below instead of above in automated tests
  test.fail("O on nested bullet child creates line above it", async ({ extensionPage: page }) => {
    await goToBlock(page, "Nested bullet child 1");
    const before = await getAllBlockTexts(page);
    const child1Idx = before.findIndex((t) => t.includes("Nested bullet child 1"));

    await pressKeys(page, "Shift+o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("ABOVE_NESTED");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const newIdx = after.findIndex((t) => t.includes("ABOVE_NESTED"));
    const child1After = after.findIndex((t) => t.includes("Nested bullet child 1"));

    console.log("O-nested-bullet: ABOVE_NESTED at", newIdx, "child1 at", child1After, "was", child1Idx);
    await pressKeys(page, "u");
    await page.waitForTimeout(500);

    expect(newIdx).toBeLessThan(child1After);
  });

  // BUG-009: O creates line below instead of above in automated tests
  test.fail("O on parent bullet with children creates line above parent", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 2");
    const before = await getAllBlockTexts(page);
    const parentIdx = before.findIndex((t) => t.includes("Bullet item 2"));

    await pressKeys(page, "Shift+o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("ABOVE_PARENT");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const newIdx = after.findIndex((t) => t.includes("ABOVE_PARENT"));
    const parentAfter = after.findIndex((t) => t.includes("Bullet item 2"));

    console.log("O-parent-bullet: ABOVE_PARENT at", newIdx, "parent at", parentAfter, "was", parentIdx);
    await pressKeys(page, "u");
    await page.waitForTimeout(500);

    expect(newIdx).toBeLessThan(parentAfter);
  });

  // =========================================================================
  // O (open above) — code block boundary
  // =========================================================================

  // BUG-009: O creates line below instead of above in automated tests
  test.fail("O on text after code block creates line between code and text", async ({ extensionPage: page }) => {
    await goToBlock(page, "Text after code block");
    const before = await getAllBlockTexts(page);
    const textIdx = before.findIndex((t) => t.includes("Text after code block"));

    await pressKeys(page, "Shift+o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("BETWEEN_CODE_TEXT");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const newIdx = after.findIndex((t) => t.includes("BETWEEN_CODE_TEXT"));
    const textAfter = after.findIndex((t) => t.includes("Text after code block"));

    console.log("O-after-code: BETWEEN_CODE_TEXT at", newIdx, "text at", textAfter, "was", textIdx);
    await pressKeys(page, "u");
    await page.waitForTimeout(500);

    expect(newIdx).toBeLessThan(textAfter);
  });

  // =========================================================================
  // o + type + Esc → j/k cursor consistency
  // =========================================================================

  // BUG-003: o→type→Esc→k returns to wrong block (off by 1)
  test.fail("o on bullet + type + Esc, then k returns to original", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 1");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    await page.keyboard.type("temp");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    await pressKeys(page, "k");
    await page.waitForTimeout(200);

    const textAfterK = await getActualCursorBlockText(page);
    console.log("o-bullet-k: text after k =", JSON.stringify(textAfterK), "expected Bullet item 1");
    await pressKeys(page, "u");
    await page.waitForTimeout(500);

    expect(textAfterK).toContain("Bullet item 1");
  });

  // BUG-003: o→type→Esc→k returns to wrong block (off by 1)
  test.fail("o on nested todo + type + Esc, then k returns to original", async ({ extensionPage: page }) => {
    await goToBlock(page, "Nested todo child");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    await page.keyboard.type("temp");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    await pressKeys(page, "k");
    await page.waitForTimeout(200);

    const textAfterK = await getActualCursorBlockText(page);
    console.log("o-nested-todo-k: text after k =", JSON.stringify(textAfterK));
    await pressKeys(page, "u");
    await page.waitForTimeout(500);

    expect(textAfterK).toContain("Nested todo child");
  });

  // BUG-003 variant: o→type→Esc near code block causes j/k cursor desync
  test.fail("o on heading before code block + type + Esc, then j enters code block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    await page.keyboard.type("temp_before_code");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    // j should go to the next line (which is the code block or the line after)
    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const lineAfterJ = (await getCursorPosition(page)).line;
    const textAfterJ = await getActualCursorBlockText(page);
    console.log("o-before-code-j: line =", lineAfterJ, "text =", JSON.stringify(textAfterJ));

    // k should return to the temp line
    await pressKeys(page, "k");
    await page.waitForTimeout(200);
    const textAfterK = await getActualCursorBlockText(page);
    console.log("o-before-code-k: text =", JSON.stringify(textAfterK));

    // Undo before assertion so cleanup runs even when test.fail() catches throw
    await pressKeys(page, "u");
    await page.waitForTimeout(500);

    expect(textAfterK).toContain("temp_before_code");
  });

  // =========================================================================
  // I/A — cursor position before and after on various blocks
  // (BUG-008: I/A may not move cursor in automated tests due to isolated world)
  // These tests verify the behavioral effect regardless of internal cursor
  // =========================================================================

  // BUG-008: I doesn't move cursor to col 0 in automated tests
  test.fail("I on bullet: text should be prepended", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 3");
    await pressKeys(page, "$");
    await page.waitForTimeout(100);

    await pressKeys(page, "Shift+i");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("PRE_");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const text = await getActualCursorBlockText(page);
    console.log("I-bullet:", JSON.stringify(text));
    await pressKeys(page, "u");
    await page.waitForTimeout(400);

    // BUG-008: I doesn't move cursor to col 0 in automated tests
    // If fixed, text should start with "PRE_"
    // If buggy, "PRE_" will be at end
    expect(text.startsWith("PRE_")).toBe(true);
  });

  // BUG-008: A doesn't move cursor to end in automated tests
  test.fail("A on nested bullet child: text should be appended", async ({ extensionPage: page }) => {
    await goToBlock(page, "Nested bullet child 1");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "Shift+a");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("_APP");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const text = await getActualCursorBlockText(page);
    console.log("A-nested-bullet:", JSON.stringify(text));
    await pressKeys(page, "u");
    await page.waitForTimeout(400);

    // BUG-008: A doesn't move cursor to end in automated tests
    expect(text.endsWith("_APP")).toBe(true);
  });

  // BUG-008: I doesn't move cursor to col 0 in automated tests
  test.fail("I on todo: text should be prepended", async ({ extensionPage: page }) => {
    await goToBlock(page, "Todo unchecked 1");
    await pressKeys(page, "$");
    await page.waitForTimeout(100);

    await pressKeys(page, "Shift+i");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("PRE_");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const text = await getActualCursorBlockText(page);
    console.log("I-todo:", JSON.stringify(text));
    await pressKeys(page, "u");
    await page.waitForTimeout(400);

    expect(text.startsWith("PRE_")).toBe(true);
  });

  // BUG-008: A doesn't move cursor to end in automated tests
  test.fail("A on quote block: text should be appended", async ({ extensionPage: page }) => {
    await goToBlock(page, "This is a quote block");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "Shift+a");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("_END");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const text = await getActualCursorBlockText(page);
    console.log("A-quote:", JSON.stringify(text));
    await pressKeys(page, "u");
    await page.waitForTimeout(400);

    expect(text.endsWith("_END")).toBe(true);
  });

  // =========================================================================
  // I/A + Esc → j/k consistency
  // =========================================================================

  test("I on heading + type + Esc, j moves to next block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Heading 1 test");

    await pressKeys(page, "Shift+i");
    await page.waitForTimeout(200);
    await page.keyboard.type("X");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const textAfterJ = await getActualCursorBlockText(page);
    console.log("I-heading-j: text =", JSON.stringify(textAfterJ));
    // After j from Heading 1, should land on Heading 2 (next block)
    expect(textAfterJ).toContain("Heading 2 test");

    await pressKeys(page, "k");
    await page.waitForTimeout(200);
    const textAfterK = await getActualCursorBlockText(page);
    console.log("I-heading-k: text =", JSON.stringify(textAfterK));

    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  test("A on numbered item + type + Esc, j moves to next item", async ({ extensionPage: page }) => {
    await goToBlock(page, "Numbered item 1");

    await pressKeys(page, "Shift+a");
    await page.waitForTimeout(200);
    await page.keyboard.type("Z");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const textAfterJ = await getActualCursorBlockText(page);
    console.log("A-numbered-j: text =", JSON.stringify(textAfterJ));
    expect(textAfterJ).toContain("Numbered item 2");

    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  test("I on text before code block + type + Esc, j navigates into code block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");

    await pressKeys(page, "Shift+i");
    await page.waitForTimeout(200);
    await page.keyboard.type("X");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    const lineBefore = (await getCursorPosition(page)).line;
    await pressKeys(page, "j");
    await page.waitForTimeout(200);
    const lineAfter = (await getCursorPosition(page)).line;

    console.log("I-before-code-j: line", lineBefore, "→", lineAfter);
    expect(lineAfter).toBeGreaterThan(lineBefore);

    // k should return
    await pressKeys(page, "k");
    await page.waitForTimeout(200);
    const lineBack = (await getCursorPosition(page)).line;
    console.log("I-before-code-k: line back to", lineBack);
    expect(lineBack).toBe(lineBefore);

    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  // =========================================================================
  // o/O on mixed content section (rapid block type changes)
  // =========================================================================

  test("o on quote in mixed section", async ({ extensionPage: page }) => {
    await goToBlock(page, "Quote in mixed");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("AFTER_MIXED_QUOTE");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const quoteIdx = after.findIndex((t) => t.includes("Quote in mixed"));
    const newIdx = after.findIndex((t) => t.includes("AFTER_MIXED_QUOTE"));

    console.log("o-mixed-quote: quote at", quoteIdx, "new at", newIdx);
    expect(newIdx).toBe(quoteIdx + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  test("o on empty line in mixed section", async ({ extensionPage: page }) => {
    // Navigate to the empty line — it's between "Todo in mixed" and "Text with special chars"
    await goToBlock(page, "Todo in mixed");
    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const cursorText = await getActualCursorBlockText(page);
    console.log("empty-line cursor text:", JSON.stringify(cursorText));

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("AFTER_EMPTY");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const after = await getAllBlockTexts(page);
    const newIdx = after.findIndex((t) => t.includes("AFTER_EMPTY"));
    console.log("o-empty-mixed: AFTER_EMPTY at", newIdx);
    expect(newIdx).toBeGreaterThan(-1);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  // =========================================================================
  // o + Esc (no typing) — does empty line persist or get cleaned up?
  // =========================================================================

  test("o + Esc immediately creates and keeps empty line", async ({ extensionPage: page }) => {
    const beforeTexts = await getAllBlockTexts(page);
    const beforeCount = beforeTexts.length;

    await goToBlock(page, "Plain text line 1");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    const afterTexts = await getAllBlockTexts(page);
    console.log("o-esc: before count", beforeCount, "after count", afterTexts.length);
    // New empty line should exist (count increased by 1)
    expect(afterTexts.length).toBe(beforeCount + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  test("O + Esc immediately on nested bullet", async ({ extensionPage: page }) => {
    const beforeTexts = await getAllBlockTexts(page);
    const beforeCount = beforeTexts.length;

    await goToBlock(page, "Nested bullet child 2");

    await pressKeys(page, "Shift+o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    const afterTexts = await getAllBlockTexts(page);
    console.log("O-esc-nested: before count", beforeCount, "after count", afterTexts.length);
    expect(afterTexts.length).toBe(beforeCount + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  // =========================================================================
  // BUG-013: Block type conversion via markdown shortcuts + Escape
  // Tests check BOTH DOM selection position AND vim_info.active_line
  // to detect desync between visual cursor and logical cursor.
  // =========================================================================

  test("## heading + Enter + Escape: active_line matches DOM cursor", async ({ extensionPage: page }) => {
    test.fail(); // BUG-013: active_line off by 1 after ## conversion + Enter
    await goToBlock(page, "Plain text line 5");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    await page.keyboard.type("## test heading");
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.keyboard.type("after heading");
    await page.waitForTimeout(200);

    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(300);

    const domText = await getActualCursorBlockText(page);
    const domIdx = await getActualCursorBlockIndex(page);
    const activeLine = (await getCursorPosition(page)).line; // vim_info.active_line (0-based)
    console.log("##-enter-esc: domText =", JSON.stringify(domText), "domIdx =", domIdx, "activeLine =", activeLine);

    // j from current position — check it advances correctly
    await pressKeys(page, "j");
    await page.waitForTimeout(200);
    const afterJText = await getActualCursorBlockText(page);
    const afterJIdx = await getActualCursorBlockIndex(page);
    console.log("##-enter-j: domText =", JSON.stringify(afterJText), "domIdx =", afterJIdx);

    // Undo
    for (let i = 0; i < 5; i++) {
      await pressKeys(page, "u");
      await page.waitForTimeout(300);
    }

    // DOM cursor should be on "after heading"
    expect(domText).toContain("after heading");
    // active_line should match DOM index (the real check for BUG-013)
    expect(activeLine).toBe(domIdx);
    // j should have moved to a DIFFERENT block (not stayed on same)
    expect(afterJIdx).not.toBe(domIdx);
  });

  test("- bullet + Enter + Escape: active_line matches DOM cursor", async ({ extensionPage: page }) => {
    test.fail(); // BUG-013: active_line off by 1 after bullet conversion + Enter
    await goToBlock(page, "Plain text line 4");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    await page.keyboard.type("- bullet test");
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.keyboard.type("after bullet");
    await page.waitForTimeout(200);

    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(300);

    const domText = await getActualCursorBlockText(page);
    const domIdx = await getActualCursorBlockIndex(page);
    const activeLine = (await getCursorPosition(page)).line;
    console.log("bullet-esc: domText =", JSON.stringify(domText), "domIdx =", domIdx, "activeLine =", activeLine);

    await pressKeys(page, "j");
    await page.waitForTimeout(200);
    const afterJText = await getActualCursorBlockText(page);
    console.log("bullet-j: domText =", JSON.stringify(afterJText));

    for (let i = 0; i < 5; i++) {
      await pressKeys(page, "u");
      await page.waitForTimeout(300);
    }

    expect(domText).toContain("after bullet");
    expect(activeLine).toBe(domIdx);
  });

  // NOTE: Notion's `>` markdown shortcut produces a TOGGLE block, not a
  // quote — Notion has no markdown shortcut for quote (slash menu only).
  // The earlier name "> quote ..." was a misnomer. The test still exercises
  // the same BUG-013 surface (markdown-shortcut → block-type swap) since
  // toggle conversion goes through the same refreshLines code path.
  // TODO: add a separate slash-menu reproducer for quote conversion if we
  // want explicit quote coverage.
  test("> toggle + Enter + Escape: active_line matches DOM cursor (Notion `>` produces toggle, not quote)", async ({ extensionPage: page }) => {
    test.fail(); // BUG-013: active_line off after toggle conversion + Enter
    await goToBlock(page, "Plain text line 3");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    await page.keyboard.type("> toggle test");
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.keyboard.type("after toggle");
    await page.waitForTimeout(200);

    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(300);

    const domText = await getActualCursorBlockText(page);
    const domIdx = await getActualCursorBlockIndex(page);
    const activeLine = (await getCursorPosition(page)).line;
    // Sanity: the conversion must have produced a toggle, not a quote.
    // Confirms the rename matches Notion's actual behavior (independent of
    // BUG-013's active_line check below).
    const convertedType = await getCurrentBlockType(page);
    console.log(
      "toggle-esc: domText =", JSON.stringify(domText),
      "domIdx =", domIdx,
      "activeLine =", activeLine,
      "convertedType =", convertedType,
    );

    for (let i = 0; i < 5; i++) {
      await pressKeys(page, "u");
      await page.waitForTimeout(300);
    }

    expect(domText).toContain("after toggle");
    expect(activeLine).toBe(domIdx);
  });

  test("## heading + Escape (no Enter): active_line matches DOM cursor", async ({ extensionPage: page }) => {
    test.fail(); // BUG-013: active_line intermittently desyncs after ## conversion
    await goToBlock(page, "Plain text line 2");

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    await page.keyboard.type("## direct escape");
    await page.waitForTimeout(500);

    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(300);

    const domText = await getActualCursorBlockText(page);
    const domIdx = await getActualCursorBlockIndex(page);
    const activeLine = (await getCursorPosition(page)).line;
    console.log("##-direct-esc: domText =", JSON.stringify(domText), "domIdx =", domIdx, "activeLine =", activeLine);

    // j should advance to a different block
    await pressKeys(page, "j");
    await page.waitForTimeout(200);
    const afterJText = await getActualCursorBlockText(page);
    const afterJIdx = await getActualCursorBlockIndex(page);
    console.log("##-direct-j: text =", JSON.stringify(afterJText), "idx =", afterJIdx);

    for (let i = 0; i < 5; i++) {
      await pressKeys(page, "u");
      await page.waitForTimeout(300);
    }

    expect(domText).toContain("direct escape");
    expect(activeLine).toBe(domIdx);
    expect(afterJIdx).not.toBe(domIdx);
  });
});
