import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  reloadAndWait,
  waitForMode,
  pressKeys,
  getVimState,
  getAllBlockTexts,
  getActualCursorBlockIndex,
} from "../helpers";

/**
 * Navigate to a specific block by its text content, using gg + j to get there.
 * Returns the leaf block index.
 */
async function navigateToBlockWithText(
  page: import("@playwright/test").Page,
  targetText: string,
): Promise<number> {
  await pressKeys(page, "g", "g");
  await page.waitForTimeout(200);

  const allTexts = await getAllBlockTexts(page);
  const targetIndex = allTexts.findIndex((t) => t.includes(targetText));
  if (targetIndex === -1) throw new Error(`Block with text "${targetText}" not found`);

  // gg puts us on line 1 (first content block). Navigate down to target.
  // We need to figure out how many j presses from the current position.
  // Since gg lands on the first vim line, iterate j until we reach the target.
  let attempts = 0;
  const maxAttempts = allTexts.length + 5;
  while (attempts < maxAttempts) {
    const cursorIdx = await getActualCursorBlockIndex(page);
    if (cursorIdx === targetIndex) return targetIndex;
    if (cursorIdx > targetIndex) {
      await pressKeys(page, "k");
    } else {
      await pressKeys(page, "j");
    }
    await page.waitForTimeout(50);
    attempts++;
  }
  throw new Error(`Could not navigate to block "${targetText}" after ${maxAttempts} attempts`);
}

/**
 * Core assertion: after I → Escape → j, the DOM cursor should move exactly
 * one leaf block down, and vim state should stay consistent.
 */
async function assertInsertEscapeNavigation(
  page: import("@playwright/test").Page,
  direction: "j" | "k",
) {
  const blockBefore = await getActualCursorBlockIndex(page);
  const stateBefore = await getVimState(page);

  // I → Escape
  await pressKeys(page, "Shift+i");
  await waitForMode(page, "insert");
  await page.waitForTimeout(200);
  await pressKeys(page, "Escape");
  await waitForMode(page, "normal");
  await page.waitForTimeout(200);

  // Cursor should still be on same block after I → Escape
  const blockAfterEscape = await getActualCursorBlockIndex(page);
  const stateAfterEscape = await getVimState(page);
  expect(blockAfterEscape).toBe(blockBefore);
  expect(stateAfterEscape.activeLine).toBe(stateBefore.activeLine);

  // Navigate one line
  await pressKeys(page, direction);
  await page.waitForTimeout(200);

  const blockAfterNav = await getActualCursorBlockIndex(page);
  const stateAfterNav = await getVimState(page);

  // DOM cursor should have moved exactly one block
  const expectedDelta = direction === "j" ? 1 : -1;
  expect(blockAfterNav).toBe(blockBefore + expectedDelta);

  // vim state should also reflect the move
  expect(stateAfterNav.activeLine).toBe(stateAfterEscape.activeLine + expectedDelta);
}

test.describe.serial("Cursor synchronization", () => {
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

  // ===== Basic: Plain text blocks =====

  test("I → Escape → j on plain text", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Plain text line 3");
    await assertInsertEscapeNavigation(page, "j");
  });

  test("I → Escape → k on plain text", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Plain text line 3");
    await assertInsertEscapeNavigation(page, "k");
  });

  // ===== Empty lines =====

  test("I → Escape → j near empty line", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Before empty line");
    await assertInsertEscapeNavigation(page, "j");
  });

  test("I → Escape → j after empty line", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "After empty line");
    await assertInsertEscapeNavigation(page, "j");
  });

  // ===== Headings =====

  test("I → Escape → j on heading", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Heading 1 test");
    await assertInsertEscapeNavigation(page, "j");
  });

  test("I → Escape → j on heading 3 → text after", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Heading 3 test");
    await assertInsertEscapeNavigation(page, "j");
  });

  // ===== Bulleted list =====

  test("I → Escape → j on bullet item", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Bullet item 1");
    await assertInsertEscapeNavigation(page, "j");
  });

  test("I → Escape → j on nested bullet", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Nested bullet child 1");
    await assertInsertEscapeNavigation(page, "j");
  });

  // ===== Numbered list =====

  test("I → Escape → j on numbered item", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Numbered item 1");
    await assertInsertEscapeNavigation(page, "j");
  });

  // ===== Todo =====

  test("I → Escape → j on todo item", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Todo unchecked 1");
    await assertInsertEscapeNavigation(page, "j");
  });

  test("I → Escape → j on nested todo", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Nested todo child");
    await assertInsertEscapeNavigation(page, "k");
  });

  // ===== Quote and callout =====

  test("I → Escape → j on quote", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "This is a quote block");
    await assertInsertEscapeNavigation(page, "j");
  });

  test("I → Escape → j on callout", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "This is a callout block");
    await assertInsertEscapeNavigation(page, "j");
  });

  // ===== Code block =====

  test("I → Escape → j on text before code block", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Section 8: Code block");
    await assertInsertEscapeNavigation(page, "j");
  });

  test("I → Escape → k on text after code block stays consistent", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Text after code block");
    const blockBefore = await getActualCursorBlockIndex(page);
    const stateBefore = await getVimState(page);

    await pressKeys(page, "Shift+i");
    await waitForMode(page, "insert");
    await page.waitForTimeout(200);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    // After I → Escape, cursor should still be on same block
    expect(await getActualCursorBlockIndex(page)).toBe(blockBefore);
    expect((await getVimState(page)).activeLine).toBe(stateBefore.activeLine);

    // k goes into the code block (which has multiple vim lines in one DOM leaf)
    await pressKeys(page, "k");
    await page.waitForTimeout(200);
    const stateAfterK = await getVimState(page);
    expect(stateAfterK.activeLine).toBe(stateBefore.activeLine - 1);
  });

  // ===== Around divider =====

  test("I → Escape → j before divider", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Before divider");
    await assertInsertEscapeNavigation(page, "j");
  });

  test("I → Escape → k after divider", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "After divider");
    await assertInsertEscapeNavigation(page, "k");
  });

  // ===== Mixed content =====

  test("I → Escape → j in mixed section", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Bullet in mixed");
    await assertInsertEscapeNavigation(page, "j");
  });

  test("I → Escape → j on special chars", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "special chars");
    await assertInsertEscapeNavigation(page, "j");
  });

  // ===== Stress: repeated mode switches =====

  test("5x (I → Escape) does not drift cursor", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Plain text line 3");
    const startBlock = await getActualCursorBlockIndex(page);
    const startState = await getVimState(page);

    for (let i = 0; i < 5; i++) {
      await pressKeys(page, "Shift+i");
      await waitForMode(page, "insert");
      await page.waitForTimeout(100);
      await pressKeys(page, "Escape");
      await waitForMode(page, "normal");
      await page.waitForTimeout(100);
    }

    const endBlock = await getActualCursorBlockIndex(page);
    const endState = await getVimState(page);
    expect(endBlock).toBe(startBlock);
    expect(endState.activeLine).toBe(startState.activeLine);
  });

  // ===== j/k round-trip =====

  test("j/k round-trip across block types", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Plain text line 1");
    const startBlock = await getActualCursorBlockIndex(page);
    const startState = await getVimState(page);

    // Navigate down through various block types, then back up
    for (let i = 0; i < 10; i++) {
      await pressKeys(page, "j");
      await page.waitForTimeout(30);
    }
    for (let i = 0; i < 10; i++) {
      await pressKeys(page, "k");
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(200);

    const endBlock = await getActualCursorBlockIndex(page);
    const endState = await getVimState(page);
    expect(endBlock).toBe(startBlock);
    expect(endState.activeLine).toBe(startState.activeLine);
  });

  // ===== i/a variants =====

  test("i → Escape → j on bullet", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Bullet item 1");
    const blockBefore = await getActualCursorBlockIndex(page);

    await pressKeys(page, "i");
    await waitForMode(page, "insert");
    await page.waitForTimeout(200);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const blockAfter = await getActualCursorBlockIndex(page);
    expect(blockAfter).toBe(blockBefore + 1);
  });

  test("a → Escape → j on todo", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Todo unchecked 1");
    const blockBefore = await getActualCursorBlockIndex(page);

    await pressKeys(page, "a");
    await waitForMode(page, "insert");
    await page.waitForTimeout(200);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const blockAfter = await getActualCursorBlockIndex(page);
    expect(blockAfter).toBe(blockBefore + 1);
  });

  test("A → Escape → k on numbered list", async ({ extensionPage: page }) => {
    await navigateToBlockWithText(page, "Numbered item 2");
    const blockBefore = await getActualCursorBlockIndex(page);

    await pressKeys(page, "Shift+a");
    await waitForMode(page, "insert");
    await page.waitForTimeout(200);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    await pressKeys(page, "k");
    await page.waitForTimeout(200);

    const blockAfter = await getActualCursorBlockIndex(page);
    expect(blockAfter).toBe(blockBefore - 1);
  });
});
