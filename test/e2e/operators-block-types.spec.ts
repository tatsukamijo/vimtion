import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
  getAllBlockTexts,
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

async function deleteCurrentLineVd(
  page: import("@playwright/test").Page,
): Promise<void> {
  await pressKeys(page, "Shift+v");
  await page.waitForTimeout(500);
  await pressKeys(page, "d");
  await page.waitForTimeout(800);
}

async function waitForBlockCountChange(
  page: import("@playwright/test").Page,
  originalCount: number,
  direction: "decrease" | "increase",
  timeout = 10_000,
): Promise<string[]> {
  const deadline = Date.now() + timeout;
  let texts: string[] = [];
  while (Date.now() < deadline) {
    texts = await getAllBlockTexts(page);
    if (direction === "decrease" && texts.length < originalCount) return texts;
    if (direction === "increase" && texts.length > originalCount) return texts;
    await page.waitForTimeout(200);
  }
  return texts;
}

test.describe.serial("Operators across block types", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // ===== V+d on different block types =====

  test("V+d deletes a plain text line", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 3");
    const before = await getAllBlockTexts(page);

    await deleteCurrentLineVd(page);
    const after = await waitForBlockCountChange(page, before.length, "decrease");

    expect(after.length).toBe(before.length - 1);
    expect(after.find((t) => t.includes("Plain text line 3"))).toBeUndefined();
    expect((await getVimState(page)).mode).toBe("normal");

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("V+d deletes a heading", async ({ extensionPage: page }) => {
    await goToBlock(page, "Heading 1 test");
    const before = await getAllBlockTexts(page);

    await deleteCurrentLineVd(page);
    const after = await waitForBlockCountChange(page, before.length, "decrease");

    expect(after.length).toBe(before.length - 1);
    expect(after.find((t) => t.includes("Heading 1 test"))).toBeUndefined();

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("V+d deletes a bullet item", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 1");
    const before = await getAllBlockTexts(page);

    await deleteCurrentLineVd(page);
    const after = await waitForBlockCountChange(page, before.length, "decrease");

    expect(after.length).toBe(before.length - 1);
    expect(after.find((t) => t === "Bullet item 1")).toBeUndefined();

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("V+d deletes a nested bullet", async ({ extensionPage: page }) => {
    await goToBlock(page, "Nested bullet");
    const before = await getAllBlockTexts(page);

    await deleteCurrentLineVd(page);
    const after = await waitForBlockCountChange(page, before.length, "decrease");

    expect(after.length).toBeLessThan(before.length);

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("V+d deletes a todo item", async ({ extensionPage: page }) => {
    await goToBlock(page, "Todo unchecked 1");
    const before = await getAllBlockTexts(page);

    await deleteCurrentLineVd(page);
    const after = await waitForBlockCountChange(page, before.length, "decrease");

    expect(after.length).toBe(before.length - 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("V+d deletes a numbered list item", async ({ extensionPage: page }) => {
    await goToBlock(page, "Numbered item 1");
    const before = await getAllBlockTexts(page);

    await deleteCurrentLineVd(page);
    const after = await waitForBlockCountChange(page, before.length, "decrease");

    expect(after.length).toBe(before.length - 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("V+d deletes a quote block", async ({ extensionPage: page }) => {
    await goToBlock(page, "This is a quote");
    const before = await getAllBlockTexts(page);

    await deleteCurrentLineVd(page);
    const after = await waitForBlockCountChange(page, before.length, "decrease");

    expect(after.length).toBeLessThan(before.length);

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("V+d on line before divider", async ({ extensionPage: page }) => {
    await goToBlock(page, "Before divider");
    const before = await getAllBlockTexts(page);

    await deleteCurrentLineVd(page);
    const after = await waitForBlockCountChange(page, before.length, "decrease");

    expect(after.length).toBeLessThan(before.length);

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("V+d on line after divider", async ({ extensionPage: page }) => {
    await goToBlock(page, "After divider");
    const before = await getAllBlockTexts(page);

    await deleteCurrentLineVd(page);
    const after = await waitForBlockCountChange(page, before.length, "decrease");

    expect(after.length).toBeLessThan(before.length);

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  // ===== yy+p on different block types =====

  test("yy+p duplicates a heading", async ({ extensionPage: page }) => {
    await goToBlock(page, "Heading 1 test");
    const before = await getAllBlockTexts(page);

    await pressKeys(page, "y", "y");
    await page.waitForTimeout(500);

    let after: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      await pressKeys(page, "p");
      after = await waitForBlockCountChange(page, before.length, "increase");
      if (after.length > before.length) break;
    }

    expect(after.length).toBe(before.length + 1);
    const headingMatches = after.filter((t) => t.includes("Heading 1 test"));
    expect(headingMatches.length).toBeGreaterThanOrEqual(2);

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("yy+p duplicates a bullet item", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 2");
    const before = await getAllBlockTexts(page);

    await pressKeys(page, "y", "y");
    await page.waitForTimeout(500);

    let after: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      await pressKeys(page, "p");
      after = await waitForBlockCountChange(page, before.length, "increase");
      if (after.length > before.length) break;
    }

    expect(after.length).toBe(before.length + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("yy+p duplicates a todo item", async ({ extensionPage: page }) => {
    await goToBlock(page, "Todo unchecked 1");
    const before = await getAllBlockTexts(page);

    await pressKeys(page, "y", "y");
    await page.waitForTimeout(500);

    let after: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      await pressKeys(page, "p");
      after = await waitForBlockCountChange(page, before.length, "increase");
      if (after.length > before.length) break;
    }

    expect(after.length).toBe(before.length + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  test("yy+p duplicates a numbered list item", async ({ extensionPage: page }) => {
    await goToBlock(page, "Numbered item 2");
    const before = await getAllBlockTexts(page);

    await pressKeys(page, "y", "y");
    await page.waitForTimeout(500);

    let after: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      await pressKeys(page, "p");
      after = await waitForBlockCountChange(page, before.length, "increase");
      if (after.length > before.length) break;
    }

    expect(after.length).toBe(before.length + 1);

    await pressKeys(page, "u");
    await page.waitForTimeout(800);
  });

  // ===== dw on different block types =====

  test("dw on heading deletes first word", async ({ extensionPage: page }) => {
    await goToBlock(page, "Heading 1 test");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "d", "w");
    await page.waitForTimeout(300);

    const blocks = await getAllBlockTexts(page);
    const heading = blocks.find(
      (t) => t.includes("1 test") && !t.includes("Heading"),
    );
    expect(heading).toBeDefined();

    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  test("dw on bullet item deletes first word", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 1");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "d", "w");
    await page.waitForTimeout(300);

    const blocks = await getAllBlockTexts(page);
    const bullet = blocks.find(
      (t) => t.includes("item 1") && !t.includes("Bullet"),
    );
    expect(bullet).toBeDefined();

    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  test("dw on todo item deletes first word", async ({ extensionPage: page }) => {
    await goToBlock(page, "Todo unchecked 1");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "d", "w");
    await page.waitForTimeout(300);

    const blocks = await getAllBlockTexts(page);
    const todo = blocks.find(
      (t) => t.includes("unchecked 1") && !t.includes("Todo"),
    );
    expect(todo).toBeDefined();

    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });
});
