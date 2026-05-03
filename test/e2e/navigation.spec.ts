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
  useCursorInvariant,
} from "../helpers";

async function goToBlock(
  page: import("@playwright/test").Page,
  targetText: string,
): Promise<number> {
  // Click a different block first to ensure a fresh focus when clicking target
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

test.describe.serial("Navigation", () => {
  useCursorInvariant({ strict: false }, test);

  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // =========================================================================
  // j / k — vertical navigation
  // =========================================================================

  test("j moves cursor down exactly one block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");
    const before = await getCursorPosition(page);

    await pressKeys(page, "j");
    await page.waitForTimeout(100);

    const after = await getCursorPosition(page);
    expect(after.line).toBe(before.line + 1);
  });

  test("k moves cursor up exactly one block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 3");
    const before = await getCursorPosition(page);

    await pressKeys(page, "k");
    await page.waitForTimeout(100);

    const after = await getCursorPosition(page);
    expect(after.line).toBe(before.line - 1);
  });

  test("gg moves to line 0", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 5");

    await pressKeys(page, "g", "g");
    await page.waitForTimeout(200);

    const pos = await getCursorPosition(page);
    expect(pos.line).toBe(0);
  });

  test("G moves to last line", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");

    await pressKeys(page, "Shift+G");
    await page.waitForTimeout(200);

    const state = await getVimState(page);
    const pos = await getCursorPosition(page);
    expect(pos.line).toBe(state.lineCount - 1);
  });

  test("k at first line stays at 0", async ({ extensionPage: page }) => {
    await pressKeys(page, "g", "g");
    await page.waitForTimeout(200);

    await pressKeys(page, "k");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).line).toBe(0);
  });

  test("j at last line stays at last line", async ({ extensionPage: page }) => {
    await pressKeys(page, "Shift+G");
    await page.waitForTimeout(200);
    const lastLine = (await getVimState(page)).lineCount - 1;

    await pressKeys(page, "j");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).line).toBe(lastLine);
  });

  // =========================================================================
  // h / l — horizontal character navigation
  // =========================================================================

  test("l moves right by exactly 1 character", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);
    expect((await getCursorPosition(page)).col).toBe(0);

    await pressKeys(page, "l");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(1);
  });

  test("h moves left by exactly 1 character", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "l", "l", "l");
    await page.waitForTimeout(100);
    expect((await getCursorPosition(page)).col).toBe(3);

    await pressKeys(page, "h");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(2);
  });

  // BUG-004 fixed (moveCursorBackwards now no-ops at col 0).
  test("h at column 0 stays at column 0", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");
    await page.waitForTimeout(200);
    expect((await getCursorPosition(page)).col).toBe(0);

    await pressKeys(page, "h");
    await page.waitForTimeout(200);

    expect((await getCursorPosition(page)).col).toBe(0);
  });

  // BUG-004/005 fixed (moveCursorForwards no-ops at last char).
  test("l at end of line does not go past last char", async ({ extensionPage: page }) => {
    await goToBlock(page, "short");
    await pressKeys(page, "$");
    await page.waitForTimeout(200);
    // In Vim, $ should put cursor on last char (col 4 for "short")
    expect((await getCursorPosition(page)).col).toBe(4);

    await pressKeys(page, "l");
    await page.waitForTimeout(200);

    // l at end should not advance
    expect((await getCursorPosition(page)).col).toBe(4);
  });

  test("5x l moves to column 5", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "l", "l", "l", "l", "l");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(5);
  });

  test("h/l round-trip preserves position", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "l", "l", "l");
    await page.waitForTimeout(100);
    const before = (await getCursorPosition(page)).col;

    await pressKeys(page, "l", "l", "l", "h", "h", "h");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(before);
  });

  // =========================================================================
  // 0 / $ — line start/end
  // =========================================================================

  test("0 moves to column 0", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "$");
    await page.waitForTimeout(100);

    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(0);
  });

  // BUG-005 fixed (jumpToLineEnd now sets newPos = len-1).
  test("$ moves to last char (len-1)", async ({ extensionPage: page }) => {
    await goToBlock(page, "short");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "$");
    await page.waitForTimeout(100);

    // "short" = 5 chars, $ in Vim = col 4
    expect((await getCursorPosition(page)).col).toBe(4);
  });

  // BUG-005 fixed (jumpToLineEnd now sets newPos = len-1).
  test("$ on long line goes to len-1", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "$");
    await page.waitForTimeout(100);

    const text = await getActualCursorBlockText(page);
    expect((await getCursorPosition(page)).col).toBe(text.length - 1);
  });

  // =========================================================================
  // w / b / e — word motions
  // =========================================================================

  test("w from col 0 jumps to start of second word", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    // "The quick..." — w: T(0) -> q(4)
    await pressKeys(page, "w");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(4);
  });

  test("w twice lands on third word", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    // w w: T(0) -> q(4) -> b(10)
    await pressKeys(page, "w", "w");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(10);
  });

  test("b from third word goes back to second word start", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w", "w");
    await page.waitForTimeout(100);
    expect((await getCursorPosition(page)).col).toBe(10);

    await pressKeys(page, "b");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(4);
  });

  // BUG-004 fixed (jumpToPreviousWord no-ops at col 0).
  test("b at column 0 stays at 0", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "b");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(0);
  });

  test("e from col 0 lands on end of first word", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    // "The" ends at col 2
    await pressKeys(page, "e");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(2);
  });

  test("e twice lands on end of second word", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    // e e: e(2) -> k(8) (end of "quick")
    await pressKeys(page, "e", "e");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(8);
  });

  test("w then b returns to same column", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "w", "b");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(0);
  });

  // =========================================================================
  // W / B / E — WORD motions (whitespace-delimited)
  // =========================================================================

  test("W jumps to next whitespace-delimited word", async ({ extensionPage: page }) => {
    await goToBlock(page, "find char: abcdefghij");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    // "find char:..." — W: f(0) -> c(5)
    await pressKeys(page, "Shift+w");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(5);
  });

  test("B jumps back to previous WORD start", async ({ extensionPage: page }) => {
    await goToBlock(page, "find char: abcdefghij");
    await pressKeys(page, "0", "Shift+w", "Shift+w");
    await page.waitForTimeout(100);
    await pressKeys(page, "Shift+b");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(5);
  });

  test("E jumps to end of current WORD", async ({ extensionPage: page }) => {
    await goToBlock(page, "find char: abcdefghij");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    // "find" ends at col 3
    await pressKeys(page, "Shift+e");
    await page.waitForTimeout(100);

    expect((await getCursorPosition(page)).col).toBe(3);
  });

  // =========================================================================
  // f / F / t / T — character search
  // =========================================================================

  test("f{c} finds character forward", async ({ extensionPage: page }) => {
    await goToBlock(page, "find char: abcdefghij");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "f");
    await page.waitForTimeout(50);
    await page.keyboard.press("c");
    await page.waitForTimeout(100);

    // "find [c]har:" — c at col 5
    expect((await getCursorPosition(page)).col).toBe(5);
  });

  // BUG-006: F (find backward) does not move cursor — stays at current position
  test.fail("F{c} finds character backward", async ({ extensionPage: page }) => {
    await goToBlock(page, "find char: abcdefghij");
    // Move to 'j' (col 20) via f+j, then search backward for 'c'
    await pressKeys(page, "0");
    await page.waitForTimeout(100);
    await pressKeys(page, "f");
    await page.waitForTimeout(50);
    await page.keyboard.press("j");
    await page.waitForTimeout(100);

    await page.keyboard.down("Shift");
    await page.keyboard.press("f");
    await page.keyboard.up("Shift");
    await page.waitForTimeout(100);
    await page.keyboard.press("c");
    await page.waitForTimeout(200);

    // "find char: ab[c]defghij" — c at col 13
    expect((await getCursorPosition(page)).col).toBe(13);
  });

  test("t{c} stops one before target char", async ({ extensionPage: page }) => {
    await goToBlock(page, "find char: abcdefghij");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "t");
    await page.waitForTimeout(50);
    await page.keyboard.press("c");
    await page.waitForTimeout(100);

    // One before 'c' at col 5 = col 4
    expect((await getCursorPosition(page)).col).toBe(4);
  });

  // BUG-006: T (till backward) likely same issue as F
  test.fail("T{c} stops one after target char backward", async ({ extensionPage: page }) => {
    await goToBlock(page, "find char: abcdefghij");
    // Move to 'j' via f+j, then T+c
    await pressKeys(page, "0");
    await page.waitForTimeout(100);
    await pressKeys(page, "f");
    await page.waitForTimeout(50);
    await page.keyboard.press("j");
    await page.waitForTimeout(100);

    await pressKeys(page, "Shift+t");
    await page.waitForTimeout(50);
    await page.keyboard.press("c");
    await page.waitForTimeout(100);

    // One after last 'c' backward from 'j' = col 14
    expect((await getCursorPosition(page)).col).toBe(14);
  });

  // =========================================================================
  // { / } — paragraph motions
  // =========================================================================

  // BUG-007: } paragraph motion doesn't move cursor forward
  test.fail("} moves forward past current block group", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");
    const before = (await getCursorPosition(page)).line;

    await pressKeys(page, "}");
    await page.waitForTimeout(200);

    expect((await getCursorPosition(page)).line).toBeGreaterThan(before);
  });

  // BUG-007: { paragraph motion likely same issue
  test.fail("{ moves backward past current block group", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 3");
    const before = (await getCursorPosition(page)).line;

    await pressKeys(page, "{");
    await page.waitForTimeout(200);

    expect((await getCursorPosition(page)).line).toBeLessThan(before);
  });

  // =========================================================================
  // j/k across block types — DOM cursor must actually move
  // =========================================================================

  test("j from heading updates DOM cursor to next block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Heading 1 test");
    const beforeIdx = await getActualCursorBlockIndex(page);

    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const afterIdx = await getActualCursorBlockIndex(page);
    expect(afterIdx).toBe(beforeIdx + 1);
  });

  test("j from bullet to next bullet updates DOM cursor", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 1");
    const beforeIdx = await getActualCursorBlockIndex(page);

    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    expect(await getActualCursorBlockIndex(page)).toBe(beforeIdx + 1);
  });

  test("k from todo updates DOM cursor to previous block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Todo unchecked 1");
    const beforeIdx = await getActualCursorBlockIndex(page);

    await pressKeys(page, "k");
    await page.waitForTimeout(200);

    expect(await getActualCursorBlockIndex(page)).toBe(beforeIdx - 1);
  });

  test("j past empty line lands on correct block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Before empty line");
    expect(await getActualCursorBlockText(page)).toContain("Before empty line");

    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    // Should have moved — not still on "Before empty line"
    const afterText = await getActualCursorBlockText(page);
    expect(afterText).not.toContain("Before empty line");
  });

  // =========================================================================
  // Ctrl+d / Ctrl+u — half-page scroll
  // =========================================================================

  test("Ctrl+d moves down multiple lines", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");
    const before = (await getCursorPosition(page)).line;

    await page.keyboard.down("Control");
    await page.keyboard.press("d");
    await page.keyboard.up("Control");
    await page.waitForTimeout(300);

    const after = (await getCursorPosition(page)).line;
    expect(after).toBeGreaterThan(before + 1);
  });

  test("Ctrl+u moves up multiple lines", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 3");
    const before = (await getCursorPosition(page)).line;

    await page.keyboard.down("Control");
    await page.keyboard.press("u");
    await page.keyboard.up("Control");
    await page.waitForTimeout(300);

    const after = (await getCursorPosition(page)).line;
    expect(after).toBeLessThan(before - 1);
  });

  test("Ctrl+d then Ctrl+u returns within 2 lines of start", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 3");
    const before = (await getCursorPosition(page)).line;

    await page.keyboard.down("Control");
    await page.keyboard.press("d");
    await page.keyboard.up("Control");
    await page.waitForTimeout(300);

    await page.keyboard.down("Control");
    await page.keyboard.press("u");
    await page.keyboard.up("Control");
    await page.waitForTimeout(300);

    const after = (await getCursorPosition(page)).line;
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  });

  // =========================================================================
  // Insert mode entry: I / a / A / o / O
  // =========================================================================

  // BUG-008: I/A don't move cursor — content script's setCursorPosition runs in
  // isolated world, and Notion ignores Selection API changes from that world after
  // mode switch to insert. Verified: page.evaluate selection works, content script doesn't.
  // Home key dispatch also ignored. This is a Chrome extension isolated world limitation.
  test.fail("I inserts text at beginning of line", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w", "w");
    await page.waitForTimeout(100);

    await pressKeys(page, "Shift+i");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("ZZZ");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const text = await getActualCursorBlockText(page);
    await pressKeys(page, "u");
    await page.waitForTimeout(400);

    expect(text.startsWith("ZZZ")).toBe(true);
  });

  test("a inserts text one position after cursor", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "a");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("X");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const text = await getActualCursorBlockText(page);
    expect(text.startsWith("TX")).toBe(true);

    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  // DEBUG: Investigating BUG-008 — A (Shift+a) insert position
  test("A inserts text at end of line — debug", async ({ extensionPage: page }) => {
    await goToBlock(page, "short");
    const colAfterGoTo = (await getCursorPosition(page)).col;
    console.log("A-DEBUG COL after goToBlock:", colAfterGoTo);
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    const colAfterZero = (await getCursorPosition(page)).col;
    console.log("A-DEBUG COL after 0:", colAfterZero);

    await pressKeys(page, "Shift+a");
    await page.waitForTimeout(200);
    const mode = (await getVimState(page)).mode;
    const colAfterA = (await getCursorPosition(page)).col;
    console.log("A-DEBUG MODE after Shift+a:", mode);
    console.log("A-DEBUG COL after Shift+a:", colAfterA, "(expected: 5 for 'short')");

    await page.keyboard.type("END");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const text = await getActualCursorBlockText(page);
    console.log("A-DEBUG TEXT after typing END:", JSON.stringify(text));
    console.log("A-DEBUG endsWith END?", text.endsWith("END"));

    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  test("o opens new line below and enters insert", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 3");
    const beforeTexts = await getAllBlockTexts(page);
    const origIndex = beforeTexts.findIndex((t) => t.includes("Plain text line 3"));

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("NEW_BELOW");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const afterTexts = await getAllBlockTexts(page);
    expect(afterTexts[origIndex]).toContain("Plain text line 3");
    expect(afterTexts[origIndex + 1]).toContain("NEW_BELOW");

    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  // BUG-009: Shift+o creates line below instead of above
  // openLineAbove() assumes Enter at pos 0 pushes text down, but Notion creates
  // empty block below instead. Confirmed via debug: NEW_ABOVE ends up at origIndex+1.
  // User reports O works correctly in manual headed-mode testing — may be a
  // dispatchEvent vs real keypress or headless vs headed difference.
  test.fail("O opens new line above and enters insert", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 3");
    const beforeTexts = await getAllBlockTexts(page);
    const origIndex = beforeTexts.findIndex((t) => t.includes("Plain text line 3"));

    await pressKeys(page, "Shift+o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("NEW_ABOVE");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const afterTexts = await getAllBlockTexts(page);
    await pressKeys(page, "u");
    await page.waitForTimeout(400);

    expect(afterTexts[origIndex]).toContain("NEW_ABOVE");
    expect(afterTexts[origIndex + 1]).toContain("Plain text line 3");
  });

  // =========================================================================
  // I/a/A on different block types
  // =========================================================================

  // BUG-008: Shift+i on heading inserts at wrong position
  test.fail("I on heading inserts at beginning", async ({ extensionPage: page }) => {
    await goToBlock(page, "Heading 1 test");
    await pressKeys(page, "$");
    await page.waitForTimeout(100);

    await pressKeys(page, "Shift+i");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("ZZZ");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const text = await getActualCursorBlockText(page);
    await pressKeys(page, "u");
    await page.waitForTimeout(400);

    expect(text.startsWith("ZZZ")).toBe(true);
    expect(text).toContain("Heading 1 test");
  });

  // BUG-008: Shift+a on bullet inserts at wrong position
  test.fail("A on bullet inserts at end", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 1");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "Shift+a");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("END");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const text = await getActualCursorBlockText(page);
    await pressKeys(page, "u");
    await page.waitForTimeout(400);

    expect(text.endsWith("END")).toBe(true);
    expect(text).toContain("Bullet item 1");
  });

  test("a on todo inserts after first char", async ({ extensionPage: page }) => {
    await goToBlock(page, "Todo unchecked 1");
    await pressKeys(page, "0");
    await page.waitForTimeout(100);

    await pressKeys(page, "a");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("X");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const text = await getActualCursorBlockText(page);
    expect(text.startsWith("TX")).toBe(true);

    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  test("o on bullet creates new line below", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 1");
    const beforeTexts = await getAllBlockTexts(page);
    const origIndex = beforeTexts.findIndex((t) => t.includes("Bullet item 1"));

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("NEW_BULLET");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const afterTexts = await getAllBlockTexts(page);
    expect(afterTexts[origIndex]).toContain("Bullet item 1");
    expect(afterTexts[origIndex + 1]).toContain("NEW_BULLET");

    await pressKeys(page, "u");
    await page.waitForTimeout(400);
  });

  // BUG-009: Shift+o creates line below instead of above
  test.fail("O on numbered list creates line above", async ({ extensionPage: page }) => {
    await goToBlock(page, "Numbered item 2");
    const beforeTexts = await getAllBlockTexts(page);
    const origIndex = beforeTexts.findIndex((t) => t.includes("Numbered item 2"));

    await pressKeys(page, "Shift+o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("NEW_NUM");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const afterTexts = await getAllBlockTexts(page);
    await pressKeys(page, "u");
    await page.waitForTimeout(400);

    expect(afterTexts[origIndex]).toContain("NEW_NUM");
    expect(afterTexts[origIndex + 1]).toContain("Numbered item 2");
  });

  // =========================================================================
  // desired_column preservation
  // =========================================================================

  test("j to short line then k restores original column", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox");
    await pressKeys(page, "0", "w", "w");
    await page.waitForTimeout(100);
    const targetCol = (await getCursorPosition(page)).col;
    // col should be 10 ("brown")
    expect(targetCol).toBe(10);

    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    await pressKeys(page, "k");
    await page.waitForTimeout(200);

    expect((await getCursorPosition(page)).col).toBe(targetCol);
  });
});
