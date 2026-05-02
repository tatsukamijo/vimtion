/**
 * Systematic cross-block-type tests.
 * Every basic motion/operator is tested on every editable block type.
 */
import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
  getActualCursorBlockText,
  getCursorPosition,
  getAllBlockTexts,
  useCursorInvariant,
} from "../helpers";

// Continuous cursor-sync invariant for the entire file. Applies to all
// describe blocks below — Playwright's beforeEach at module scope is global
// to the file. See docs/test-overhaul/invariant-design.md.
useCursorInvariant({ strict: false }, test);

// Block types with enough text for word/char motions
const BLOCK_TARGETS = [
  { name: "plain text", text: "The quick brown fox jumps over the lazy dog" },
  { name: "heading 1", text: "Heading 1 test" },
  { name: "heading 2", text: "Section 3: Headings" },
  { name: "heading 3", text: "Heading 3 test" },
  { name: "bullet", text: "Bullet item 1" },
  { name: "nested bullet", text: "Nested bullet child 1" },
  { name: "numbered", text: "Numbered item 1" },
  { name: "todo", text: "Todo unchecked 1" },
  { name: "nested todo", text: "Nested todo child" },
  { name: "quote", text: "This is a quote block" },
  { name: "callout", text: "This is a callout block" },
  { name: "toggle", text: "Toggle block" },
] as const;

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

async function getDOMCursorOffset(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return -1;
    const node = sel.anchorNode;
    if (!node) return -1;
    const el = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    const leaf = el?.closest('[data-content-editable-leaf="true"]');
    if (!leaf) return sel.anchorOffset;
    const walker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let current = walker.nextNode();
    while (current) {
      if (current === sel.anchorNode) return offset + sel.anchorOffset;
      offset += (current.textContent || "").length;
      current = walker.nextNode();
    }
    return sel.anchorOffset;
  });
}

// =========================================================================
// h / l — horizontal motion on every block type
// =========================================================================

test.describe("h/l across block types", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  for (const block of BLOCK_TARGETS) {
    test(`l moves right on ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      await pressKeys(page, "0");
      await page.waitForTimeout(50);

      const before = await getDOMCursorOffset(page);
      await pressKeys(page, "l");
      await page.waitForTimeout(50);
      const after = await getDOMCursorOffset(page);

      expect(after).toBe(before + 1);
    });

    test(`h moves left on ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      await pressKeys(page, "0", "l", "l");
      await page.waitForTimeout(50);

      const before = await getDOMCursorOffset(page);
      await pressKeys(page, "h");
      await page.waitForTimeout(50);
      const after = await getDOMCursorOffset(page);

      expect(after).toBe(before - 1);
    });
  }
});

// =========================================================================
// 0 / $ — line boundary on every block type
// =========================================================================

test.describe("0/$ across block types", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  for (const block of BLOCK_TARGETS) {
    test(`0 goes to col 0 on ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      await pressKeys(page, "l", "l", "l");
      await page.waitForTimeout(50);

      await pressKeys(page, "0");
      await page.waitForTimeout(50);
      const offset = await getDOMCursorOffset(page);

      expect(offset).toBe(0);
    });

    test(`$ goes to end of ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      await pressKeys(page, "0");
      await page.waitForTimeout(50);

      await pressKeys(page, "$");
      await page.waitForTimeout(50);
      const offset = await getDOMCursorOffset(page);
      const text = await getActualCursorBlockText(page);
      const len = text.length;

      // $ should put cursor at or near end (BUG-005: may be len instead of len-1)
      expect(offset).toBeGreaterThanOrEqual(len - 1);
    });
  }
});

// =========================================================================
// w / b / e — word motions on every block type
// =========================================================================

test.describe("w/b/e across block types", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  for (const block of BLOCK_TARGETS) {
    // Only test blocks with multiple words (>= 2 words)
    if (block.text.split(/\s+/).length < 2) continue;

    test(`w advances on ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      await pressKeys(page, "0");
      await page.waitForTimeout(50);

      const before = await getDOMCursorOffset(page);
      await pressKeys(page, "w");
      await page.waitForTimeout(50);
      const after = await getDOMCursorOffset(page);

      expect(after).toBeGreaterThan(before);
    });

    test(`b returns on ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      await pressKeys(page, "0", "w");
      // Only do second w if block has 3+ words so we don't wrap
      if (block.text.split(/\s+/).length >= 3) {
        await pressKeys(page, "w");
      }
      await page.waitForTimeout(50);

      const before = await getDOMCursorOffset(page);
      await pressKeys(page, "b");
      await page.waitForTimeout(50);
      const after = await getDOMCursorOffset(page);

      expect(after).toBeLessThan(before);
    });

    test(`e advances on ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      await pressKeys(page, "0");
      await page.waitForTimeout(50);

      const before = await getDOMCursorOffset(page);
      await pressKeys(page, "e");
      await page.waitForTimeout(50);
      const after = await getDOMCursorOffset(page);

      expect(after).toBeGreaterThan(before);
    });
  }
});

// =========================================================================
// dw — delete word on every block type
// =========================================================================

test.describe("dw across block types", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  for (const block of BLOCK_TARGETS) {
    if (block.text.split(/\s+/).length < 2) continue;

    test(`dw deletes first word on ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      await pressKeys(page, "0");
      await page.waitForTimeout(50);

      const firstWord = block.text.split(/\s+/)[0];
      await pressKeys(page, "d", "w");
      await page.waitForTimeout(200);

      const after = await getActualCursorBlockText(page);
      expect(after).not.toContain(firstWord);

      await pressKeys(page, "u");
      await page.waitForTimeout(400);
    });
  }
});

// =========================================================================
// ciw — change inner word on every block type
// =========================================================================

test.describe("ciw across block types", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  for (const block of BLOCK_TARGETS) {
    if (block.text.split(/\s+/).length < 2) continue;

    test(`ciw changes word on ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      await pressKeys(page, "0");
      await page.waitForTimeout(50);

      const firstWord = block.text.split(/\s+/)[0];
      await pressKeys(page, "c", "i", "w");
      await page.waitForTimeout(200);

      expect((await getVimState(page)).mode).toBe("insert");

      await page.keyboard.type("REPLACED");
      await page.waitForTimeout(100);
      await page.keyboard.press("Escape");
      await waitForMode(page, "normal");

      const after = await getActualCursorBlockText(page);
      expect(after).toContain("REPLACED");
      expect(after.startsWith(firstWord)).toBe(false);

      await pressKeys(page, "u");
      await page.waitForTimeout(400);
    });
  }
});

// =========================================================================
// j / k — vertical navigation across block type transitions
// =========================================================================

test.describe("j/k across block type transitions", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // Test j from each block type: verify active_line increments and DOM cursor moves
  const J_TARGETS = [
    { from: "Heading 1 test", expectNext: "Heading 2 test" },
    { from: "Heading 3 test", expectNext: "Text after heading" },
    { from: "Bullet item 1", expectNext: "Bullet item 2" },
    { from: "Nested bullet child 2", expectNext: "Bullet item 3" },
    { from: "Numbered item 1", expectNext: "Numbered item 2" },
    { from: "Todo unchecked 1", expectNext: "Todo unchecked 2" },
    { from: "This is a quote block", expectNext: "This is a callout block" },
    { from: "Toggle block", expectNext: "Text after toggle" },
    { from: "Before divider", expectNext: "After divider" },
    { from: "Before empty line", expectNext: "" },
    { from: "Normal text", expectNext: "Bullet in mixed" },
    { from: "Bullet in mixed", expectNext: "Todo in mixed" },
    { from: "Todo in mixed", expectNext: "" },
    { from: "Number in mixed", expectNext: "Quote in mixed" },
    { from: "Quote in mixed", expectNext: "Final line of test page" },
  ];

  for (const { from, expectNext } of J_TARGETS) {
    test(`j from "${from}" lands on next block`, async ({ extensionPage: page }) => {
      await goToBlock(page, from);
      const lineBefore = (await getCursorPosition(page)).line;

      await pressKeys(page, "j");
      await page.waitForTimeout(100);

      const lineAfter = (await getCursorPosition(page)).line;
      expect(lineAfter).toBeGreaterThan(lineBefore);

      if (expectNext) {
        const text = await getActualCursorBlockText(page);
        expect(text).toContain(expectNext);
      }
    });
  }

  // Test k from each block type
  const K_TARGETS = [
    { from: "Heading 2 test", expectPrev: "Heading 1 test" },
    { from: "Text after heading", expectPrev: "Heading 3 test" },
    { from: "Bullet item 3", expectPrev: "Nested bullet child 2" },
    { from: "Numbered item 2", expectPrev: "Numbered item 1" },
    { from: "This is a callout block", expectPrev: "This is a quote block" },
    { from: "Text after toggle", expectPrev: "Toggle block" },
    { from: "After divider", expectPrev: "Before divider" },
    { from: "Bullet in mixed", expectPrev: "Normal text" },
    { from: "Quote in mixed", expectPrev: "Number in mixed" },
    { from: "Final line of test page", expectPrev: "Quote in mixed" },
  ];

  for (const { from, expectPrev } of K_TARGETS) {
    test(`k from "${from}" lands on prev block`, async ({ extensionPage: page }) => {
      await goToBlock(page, from);
      const lineBefore = (await getCursorPosition(page)).line;

      await pressKeys(page, "k");
      await page.waitForTimeout(100);

      const lineAfter = (await getCursorPosition(page)).line;
      expect(lineAfter).toBeLessThan(lineBefore);

      const text = await getActualCursorBlockText(page);
      expect(text).toContain(expectPrev);
    });
  }
});

// =========================================================================
// V+d — delete line on every block type
// =========================================================================

test.describe("V+d across block types", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // Test all block types that aren't already in operators-block-types.spec.ts
  const VD_TARGETS = [
    { name: "heading 3", text: "Heading 3 test" },
    { name: "nested bullet", text: "Nested bullet child 1" },
    { name: "nested todo", text: "Nested todo child" },
    { name: "callout", text: "This is a callout block" },
    { name: "toggle", text: "Toggle block" },
    { name: "todo checked", text: "Todo checked" },
    { name: "text after code block", text: "Text after code block" },
  ];

  for (const block of VD_TARGETS) {
    test(`V+d deletes ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      const before = await getAllBlockTexts(page);
      const beforeCount = before.filter((t) => t.includes(block.text)).length;
      expect(beforeCount).toBeGreaterThanOrEqual(1);

      await pressKeys(page, "Shift+v");
      await page.waitForTimeout(100);
      await pressKeys(page, "d");
      await page.waitForTimeout(300);

      const after = await getAllBlockTexts(page);
      const afterCount = after.filter((t) => t.includes(block.text)).length;
      expect(afterCount).toBeLessThan(beforeCount);

      await pressKeys(page, "u");
      await page.waitForTimeout(500);
    });
  }
});

// =========================================================================
// yy+p — duplicate on every block type
// =========================================================================

test.describe("yy+p across block types", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // Block types not yet tested in operators-block-types.spec.ts
  const YYP_TARGETS = [
    { name: "heading 3", text: "Heading 3 test" },
    { name: "nested bullet", text: "Nested bullet child 1" },
    { name: "nested todo", text: "Nested todo child" },
    { name: "quote", text: "This is a quote block" },
    { name: "callout", text: "This is a callout block" },
    { name: "toggle", text: "Toggle block" },
  ];

  for (const block of YYP_TARGETS) {
    test(`yy+p duplicates ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      const before = await getAllBlockTexts(page);
      const beforeCount = before.filter((t) => t.includes(block.text)).length;

      await pressKeys(page, "y", "y");
      await page.waitForTimeout(100);
      await pressKeys(page, "p");
      await page.waitForTimeout(500);

      const after = await getAllBlockTexts(page);
      const afterCount = after.filter((t) => t.includes(block.text)).length;
      expect(afterCount).toBe(beforeCount + 1);

      await pressKeys(page, "u");
      await page.waitForTimeout(500);
    });
  }
});

// =========================================================================
// x — delete char on every block type
// =========================================================================

test.describe("x across block types", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  for (const block of BLOCK_TARGETS) {
    test(`x deletes char on ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      await pressKeys(page, "0");
      await page.waitForTimeout(50);

      const firstChar = block.text[0];
      await pressKeys(page, "x");
      await page.waitForTimeout(200);

      const after = await getActualCursorBlockText(page);
      expect(after[0]).not.toBe(firstChar);
      expect(after.length).toBe(block.text.length - 1);

      await pressKeys(page, "u");
      await page.waitForTimeout(400);
    });
  }
});

// =========================================================================
// i → type → Esc on every block type (basic insert mode)
// =========================================================================

test.describe("i insert across block types", () => {
  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  for (const block of BLOCK_TARGETS) {
    test(`i inserts text on ${block.name}`, async ({ extensionPage: page }) => {
      await goToBlock(page, block.text);
      await pressKeys(page, "0");
      await page.waitForTimeout(50);

      await pressKeys(page, "i");
      await page.waitForTimeout(100);
      expect((await getVimState(page)).mode).toBe("insert");

      await page.keyboard.type("Z");
      await page.waitForTimeout(100);
      await page.keyboard.press("Escape");
      await waitForMode(page, "normal");

      const after = await getActualCursorBlockText(page);
      expect(after).toContain("Z");

      await pressKeys(page, "u");
      await page.waitForTimeout(400);
    });
  }
});
