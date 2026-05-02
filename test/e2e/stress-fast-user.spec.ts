import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
  getActualCursorBlockIndex,
  getActualCursorBlockText,
  getAllBlockTexts,
  useCursorInvariant,
  useUiInvariant,
} from "../helpers";

/**
 * Fast-press keys with NO artificial delay between them,
 * simulating a real Vim power user.
 */
async function fastKeys(
  page: import("@playwright/test").Page,
  ...keys: string[]
) {
  for (const key of keys) {
    await page.keyboard.press(key);
  }
}

/**
 * Type text at real typing speed (~30ms per char).
 */
async function typeText(
  page: import("@playwright/test").Page,
  text: string,
) {
  await page.keyboard.type(text, { delay: 30 });
}

/**
 * Navigate to a block by clicking on it directly, then pressing Escape
 * to ensure normal mode with Vimtion synced. This is a setup helper —
 * we click instead of using j/k so the helper itself isn't affected by
 * code blocks or accumulated state from prior tests.
 */
async function goToBlock(
  page: import("@playwright/test").Page,
  targetText: string,
): Promise<number> {
  // Click on the target block to place cursor there
  const leaf = page.locator('[data-content-editable-leaf="true"]').filter({ hasText: targetText }).first();
  await leaf.scrollIntoViewIfNeeded();
  await leaf.click();
  await page.waitForTimeout(100);

  // Escape to ensure normal mode and sync Vimtion state
  await fastKeys(page, "Escape");
  await waitForMode(page, "normal");
  await page.waitForTimeout(100);

  const allTexts = await getAllBlockTexts(page);
  const targetIndex = allTexts.findIndex((t) => t.includes(targetText));
  if (targetIndex === -1) throw new Error(`Block "${targetText}" not found`);

  const cursorIdx = await getActualCursorBlockIndex(page);
  if (cursorIdx !== targetIndex) {
    throw new Error(`goToBlock("${targetText}"): cursor on block ${cursorIdx}, expected ${targetIndex}`);
  }
  return targetIndex;
}

// =============================================================================
// All tests run in ONE serial block with NO reloads.
// State accumulates exactly like a real editing session.
// =============================================================================

test.describe.serial("Stress: fast user session (no reload)", () => {
  // Spec-wide invariants. strict: false skips checks during insert mode where
  // Notion may transiently own selection / lag the UI; checks run after every
  // pressKeys(...) call in normal/visual modes. This is a stress / accumulated-
  // state spec — a passing assertion at the end of a test is not enough; the
  // continuous invariants surface drift the moment it appears.
  useCursorInvariant({ strict: false }, test);
  useUiInvariant({ strict: false }, test);

  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // ---- Rapid I → type → Escape → j, no pauses ----

  test("rapid I→type→Esc→j on consecutive plain text blocks", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");
    const startIdx = await getActualCursorBlockIndex(page);
    const startState = await getVimState(page);

    for (let i = 0; i < 3; i++) {
      await fastKeys(page, "Shift+i");
      await typeText(page, "x");
      await fastKeys(page, "Escape");
      await page.waitForTimeout(50);

      const blockIdx = await getActualCursorBlockIndex(page);
      const state = await getVimState(page);
      expect(blockIdx, `after edit ${i}: DOM block`).toBe(startIdx + i);
      expect(state.activeLine, `after edit ${i}: activeLine`).toBe(startState.activeLine + i);

      if (i < 2) {
        await fastKeys(page, "j");
        await page.waitForTimeout(30);
      }
    }
  });

  test("undo previous edits to restore page", async ({ extensionPage: page }) => {
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(80);
    }
  });

  // ---- i/a/I/A all from same block, then navigate ----

  test("cycle i→Esc, a→Esc, I→Esc, A→Esc then j moves exactly +1", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 3");
    const blockIdx = await getActualCursorBlockIndex(page);
    const state = await getVimState(page);

    const entries = ["i", "a", "Shift+i", "Shift+a"];
    for (const key of entries) {
      await fastKeys(page, key);
      await page.waitForTimeout(30);
      await fastKeys(page, "Escape");
      await page.waitForTimeout(30);

      const idx = await getActualCursorBlockIndex(page);
      const s = await getVimState(page);
      expect(idx, `after ${key}→Esc: DOM block`).toBe(blockIdx);
      expect(s.activeLine, `after ${key}→Esc: activeLine`).toBe(state.activeLine);
    }

    await fastKeys(page, "j");
    await page.waitForTimeout(50);

    const afterJ = await getActualCursorBlockIndex(page);
    const afterState = await getVimState(page);
    expect(afterJ, "j after cycle: DOM block").toBe(blockIdx + 1);
    expect(afterState.activeLine, "j after cycle: activeLine").toBe(state.activeLine + 1);
  });

  // ---- Type real text, Escape, navigate ----

  test("i→type sentence→Esc→j→k returns to same block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 2");
    const blockIdx = await getActualCursorBlockIndex(page);
    const state = await getVimState(page);

    await fastKeys(page, "i");
    await typeText(page, "hello world ");
    await fastKeys(page, "Escape");
    await page.waitForTimeout(50);

    expect(await getActualCursorBlockIndex(page), "after typing: DOM block").toBe(blockIdx);

    await fastKeys(page, "j");
    await page.waitForTimeout(30);
    await fastKeys(page, "k");
    await page.waitForTimeout(50);

    expect(await getActualCursorBlockIndex(page), "j→k round-trip: DOM block").toBe(blockIdx);
    expect((await getVimState(page)).activeLine, "j→k round-trip: activeLine").toBe(state.activeLine);
  });

  test("undo typed text", async ({ extensionPage: page }) => {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(80);
    }
  });

  // ---- Cross block-type editing without reload ----

  test("edit heading → bullet → todo → quote without reload", async ({ extensionPage: page }) => {
    const targets = [
      "Heading 3 test",
      "Bullet item 1",
      "Todo unchecked 1",
      "This is a quote block",
    ];

    for (const target of targets) {
      await goToBlock(page, target);
      const blockIdx = await getActualCursorBlockIndex(page);
      const state = await getVimState(page);

      await fastKeys(page, "Shift+a");
      await typeText(page, " edited");
      await fastKeys(page, "Escape");
      await page.waitForTimeout(50);

      const afterIdx = await getActualCursorBlockIndex(page);
      const afterState = await getVimState(page);
      expect(afterIdx, `${target}: DOM block after A→type→Esc`).toBe(blockIdx);
      expect(afterState.activeLine, `${target}: activeLine after A→type→Esc`).toBe(state.activeLine);

      // j then k should return
      await fastKeys(page, "j");
      await page.waitForTimeout(30);
      await fastKeys(page, "k");
      await page.waitForTimeout(50);
      expect(await getActualCursorBlockIndex(page), `${target}: j→k round-trip`).toBe(blockIdx);
    }
  });

  test("undo cross block-type edits", async ({ extensionPage: page }) => {
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(80);
    }
  });

  // ---- Scroll-dependent: operate on blocks far down the page ----

  test("I→type→Esc→j on block requiring scroll (mixed section)", async ({ extensionPage: page }) => {
    await goToBlock(page, "Normal text");
    const blockIdx = await getActualCursorBlockIndex(page);
    const state = await getVimState(page);

    await fastKeys(page, "Shift+i");
    await typeText(page, "Z");
    await fastKeys(page, "Escape");
    await page.waitForTimeout(50);

    expect(await getActualCursorBlockIndex(page), "scrolled block: DOM after I→type→Esc").toBe(blockIdx);
    expect((await getVimState(page)).activeLine, "scrolled block: activeLine").toBe(state.activeLine);

    await fastKeys(page, "j");
    await page.waitForTimeout(50);
    expect(await getActualCursorBlockIndex(page), "scrolled block: j moves +1").toBe(blockIdx + 1);
  });

  test("undo scroll section edit", async ({ extensionPage: page }) => {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(80);
    }
  });

  // ---- Around special blocks: divider, code block, equation ----

  test("navigate around divider: edit above → j → j → edit below", async ({ extensionPage: page }) => {
    await goToBlock(page, "Before divider");
    const beforeIdx = await getActualCursorBlockIndex(page);

    await fastKeys(page, "Shift+a");
    await typeText(page, "!");
    await fastKeys(page, "Escape");
    await page.waitForTimeout(50);
    expect(await getActualCursorBlockIndex(page), "before divider: after edit").toBe(beforeIdx);

    // j to cross divider (Vimtion skips non-editable divider blocks)
    await fastKeys(page, "j");
    await page.waitForTimeout(50);

    const afterDividerText = await getActualCursorBlockText(page);
    expect(afterDividerText, "crossed divider").toContain("After divider");

    await fastKeys(page, "Shift+a");
    await typeText(page, "!");
    await fastKeys(page, "Escape");
    await page.waitForTimeout(50);

    const afterEditText = await getActualCursorBlockText(page);
    expect(afterEditText, "after divider: after edit").toContain("After divider");
  });

  test("undo divider section edits", async ({ extensionPage: page }) => {
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(80);
    }
  });

  // Moved to end: "edit text before code block" (BUG-002)

  // ---- Rapid mode flapping: insert/normal/insert/normal ----

  test("10x rapid i→Esc flapping does not drift cursor", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 2");
    const startIdx = await getActualCursorBlockIndex(page);
    const startState = await getVimState(page);

    for (let i = 0; i < 10; i++) {
      await fastKeys(page, "i");
      await page.waitForTimeout(10);
      await fastKeys(page, "Escape");
      await page.waitForTimeout(10);
    }

    expect(await getActualCursorBlockIndex(page), "10x i→Esc: DOM block").toBe(startIdx);
    expect((await getVimState(page)).activeLine, "10x i→Esc: activeLine").toBe(startState.activeLine);
  });

  test("10x I→Esc flapping does not drift cursor", async ({ extensionPage: page }) => {
    await goToBlock(page, "Numbered item 2");
    const startIdx = await getActualCursorBlockIndex(page);
    const startState = await getVimState(page);

    for (let i = 0; i < 10; i++) {
      await fastKeys(page, "Shift+i");
      await page.waitForTimeout(10);
      await fastKeys(page, "Escape");
      await page.waitForTimeout(10);
    }

    expect(await getActualCursorBlockIndex(page), "10x I→Esc: DOM block").toBe(startIdx);
    expect((await getVimState(page)).activeLine, "10x I→Esc: activeLine").toBe(startState.activeLine);
  });

  test("10x A→Esc flapping does not drift cursor", async ({ extensionPage: page }) => {
    await goToBlock(page, "Todo unchecked 2");
    const startIdx = await getActualCursorBlockIndex(page);
    const startState = await getVimState(page);

    for (let i = 0; i < 10; i++) {
      await fastKeys(page, "Shift+a");
      await page.waitForTimeout(10);
      await fastKeys(page, "Escape");
      await page.waitForTimeout(10);
    }

    expect(await getActualCursorBlockIndex(page), "10x A→Esc: DOM block").toBe(startIdx);
    expect((await getVimState(page)).activeLine, "10x A→Esc: activeLine").toBe(startState.activeLine);
  });

  // ---- Interleaved: edit block A → navigate to B → edit B → back to A ----

  test("interleaved editing: plain→bullet→back to plain", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 4");
    const plainIdx = await getActualCursorBlockIndex(page);

    await fastKeys(page, "Shift+a");
    await typeText(page, " [1]");
    await fastKeys(page, "Escape");
    await page.waitForTimeout(30);

    // Navigate to bullet section
    await goToBlock(page, "Bullet item 3");
    const bulletIdx = await getActualCursorBlockIndex(page);
    const bulletState = await getVimState(page);

    await fastKeys(page, "Shift+a");
    await typeText(page, " [2]");
    await fastKeys(page, "Escape");
    await page.waitForTimeout(30);

    expect(await getActualCursorBlockIndex(page), "bullet after edit").toBe(bulletIdx);
    expect((await getVimState(page)).activeLine, "bullet activeLine").toBe(bulletState.activeLine);

    // Go back to the plain text block
    await goToBlock(page, "Plain text line 4");
    const backIdx = await getActualCursorBlockIndex(page);
    expect(backIdx, "back to plain").toBe(plainIdx);

    // j should still work correctly
    await fastKeys(page, "j");
    await page.waitForTimeout(50);
    expect(await getActualCursorBlockIndex(page), "j from plain after interleave").toBe(plainIdx + 1);
  });

  test("undo interleaved edits", async ({ extensionPage: page }) => {
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(80);
    }
  });

  // o test moved to known-bug section (BUG-003)

  // ---- Rapid navigation through nested blocks ----

  test("fast j through nested bullet children", async ({ extensionPage: page }) => {
    await goToBlock(page, "Bullet item 1");
    const startState = await getVimState(page);

    // j through: item1 → item2 → nested1 → nested2 → item3
    const lines: number[] = [];
    for (let i = 0; i < 5; i++) {
      await fastKeys(page, "j");
      await page.waitForTimeout(20);
      lines.push((await getVimState(page)).activeLine);
    }

    // Each j should strictly increase activeLine
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i], `nested j step ${i}`).toBeGreaterThan(lines[i - 1]);
    }

    // k all the way back
    for (let i = 0; i < 5; i++) {
      await fastKeys(page, "k");
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(50);
    expect((await getVimState(page)).activeLine, "back after nested traversal").toBe(startState.activeLine);
  });

  // ---- Long sequence: edit → navigate → edit → navigate (simulates real session) ----

  test("realistic session: 8 sequential edits across page without reload", async ({ extensionPage: page }) => {
    const targets = [
      "Plain text line 1",
      "Before empty line",
      "Heading 2 test",
      "Bullet item 2",
      "Numbered item 1",
      "Todo unchecked 1",
      "This is a callout block",
      "Final line of test page",
    ];

    for (let i = 0; i < targets.length; i++) {
      await goToBlock(page, targets[i]);
      const blockIdx = await getActualCursorBlockIndex(page);
      const state = await getVimState(page);

      // Alternate between i, a, I, A
      const entryKeys = ["i", "a", "Shift+i", "Shift+a"];
      const key = entryKeys[i % entryKeys.length];

      await fastKeys(page, key);
      await typeText(page, `[${i}]`);
      await fastKeys(page, "Escape");
      await page.waitForTimeout(30);

      const afterIdx = await getActualCursorBlockIndex(page);
      const afterState = await getVimState(page);
      expect(afterIdx, `session edit ${i} (${targets[i]}): DOM block`).toBe(blockIdx);
      expect(afterState.activeLine, `session edit ${i} (${targets[i]}): activeLine`).toBe(state.activeLine);

      // Quick j→k sanity check (skip on last block — j is a no-op there)
      const stateCheck = await getVimState(page);
      if (stateCheck.activeLine < stateCheck.lineCount) {
        await fastKeys(page, "j");
        await page.waitForTimeout(20);
        await fastKeys(page, "k");
        await page.waitForTimeout(30);
        expect(await getActualCursorBlockIndex(page), `session edit ${i}: j→k`).toBe(blockIdx);
      }
    }
  });

  test("undo realistic session edits", async ({ extensionPage: page }) => {
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(80);
    }
  });

  // ---- Visual mode interleaved with insert ----

  test("v→Esc→I→type→Esc→j stays consistent", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 5");
    const blockIdx = await getActualCursorBlockIndex(page);
    const state = await getVimState(page);

    // Enter and exit visual mode
    await fastKeys(page, "v");
    await page.waitForTimeout(30);
    await fastKeys(page, "Escape");
    await page.waitForTimeout(30);

    // Now I → type → Escape
    await fastKeys(page, "Shift+i");
    await typeText(page, "V");
    await fastKeys(page, "Escape");
    await page.waitForTimeout(30);

    expect(await getActualCursorBlockIndex(page), "v→Esc→I: DOM block").toBe(blockIdx);

    await fastKeys(page, "j");
    await page.waitForTimeout(50);
    expect(await getActualCursorBlockIndex(page), "j after v→I sequence").toBe(blockIdx + 1);
    expect((await getVimState(page)).activeLine).toBe(state.activeLine + 1);
  });

  test("undo visual-insert edit", async ({ extensionPage: page }) => {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(80);
    }
  });

  // ---- Empty line handling ----

  test("edit on empty line → j → edit → k returns", async ({ extensionPage: page }) => {
    await goToBlock(page, "Before empty line");
    await fastKeys(page, "j");
    await page.waitForTimeout(50);

    // Now on the empty line
    const emptyIdx = await getActualCursorBlockIndex(page);
    const emptyState = await getVimState(page);

    await fastKeys(page, "i");
    await typeText(page, "was empty");
    await fastKeys(page, "Escape");
    await page.waitForTimeout(30);

    expect(await getActualCursorBlockIndex(page), "empty line: after edit").toBe(emptyIdx);

    await fastKeys(page, "j");
    await page.waitForTimeout(30);
    const nextIdx = await getActualCursorBlockIndex(page);
    expect(nextIdx, "empty line: j moves +1").toBe(emptyIdx + 1);

    await fastKeys(page, "k");
    await page.waitForTimeout(50);
    expect(await getActualCursorBlockIndex(page), "empty line: k returns").toBe(emptyIdx);
    expect((await getVimState(page)).activeLine, "empty line: activeLine returns").toBe(emptyState.activeLine);
  });

  test("undo empty line edit", async ({ extensionPage: page }) => {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(80);
    }
  });

  // ---- Ultimate stress: rapid alternating j→I→type→Esc down the page ----

  test("rapid j→I→char→Esc for 5 consecutive blocks", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");
    const startIdx = await getActualCursorBlockIndex(page);

    for (let i = 0; i < 5; i++) {
      const expectedIdx = startIdx + i;
      expect(await getActualCursorBlockIndex(page), `rapid chain step ${i}: before edit`).toBe(expectedIdx);

      await fastKeys(page, "Shift+i");
      await page.keyboard.press("KeyZ");
      await fastKeys(page, "Escape");
      await page.waitForTimeout(20);

      expect(await getActualCursorBlockIndex(page), `rapid chain step ${i}: after edit`).toBe(expectedIdx);

      if (i < 4) {
        await fastKeys(page, "j");
        await page.waitForTimeout(20);
      }
    }

    // Navigate all the way back
    for (let i = 0; i < 4; i++) {
      await fastKeys(page, "k");
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(50);
    expect(await getActualCursorBlockIndex(page), "rapid chain: back to start").toBe(startIdx);
  });

  test("undo rapid chain edits", async ({ extensionPage: page }) => {
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Meta+z");
      await page.waitForTimeout(80);
    }
  });

  // ==== Known bugs — marked test.fail() so they pass when broken, alert when fixed ====

  test("BUG-003: o→type→Esc→k returns to original block", async ({ extensionPage: page }) => {
    test.fail();
    await goToBlock(page, "Plain text line 3");
    const origIdx = await getActualCursorBlockIndex(page);
    const origState = await getVimState(page);

    await fastKeys(page, "o");
    await page.waitForTimeout(100);
    await typeText(page, "new line via o");
    await fastKeys(page, "Escape");
    await page.waitForTimeout(50);

    await fastKeys(page, "k");
    await page.waitForTimeout(50);

    expect(await getActualCursorBlockIndex(page), "k after o: back to original").toBe(origIdx);
    expect((await getVimState(page)).activeLine, "k after o: activeLine").toBe(origState.activeLine);
  });

  test("BUG-002: I→type→Esc near code block → j → k returns to correct block", async ({ extensionPage: page }) => {
    test.fail();
    await goToBlock(page, "Section 8: Code block");
    const headingIdx = await getActualCursorBlockIndex(page);
    const headingState = await getVimState(page);

    await fastKeys(page, "Shift+i");
    await typeText(page, "X");
    await fastKeys(page, "Escape");
    await page.waitForTimeout(50);

    expect(await getActualCursorBlockIndex(page), "after I→type→Esc").toBe(headingIdx);

    // BUG-002 — see docs/known-bugs.md
    // Direct proximate-cause assertion: re-find the heading element by its mutated
    // textContent ("Section 8: Code blockX") and verify vim_info.active_line still
    // tracks it. If refreshLines lost the element ref during the typing, the
    // active_line points to whatever block now occupies the old index — no need to
    // press j/k to observe the desync; the bug is observable directly post-Escape.
    const afterRef = await page.evaluate(() => {
      const root = document.querySelector('[data-content-editable-root="true"]');
      if (!root) return -1;
      const leaves = Array.from(root.querySelectorAll('[data-content-editable-leaf="true"]'));
      return leaves.findIndex((l) => (l.textContent || "").includes("Section 8: Code blockX"));
    });
    const vimActive = (await getVimState(page)).activeLine - 1;
    expect(vimActive, "BUG-002: active_line tracks heading element after I→type→Esc").toBe(afterRef);

    await fastKeys(page, "j");
    await page.waitForTimeout(50);
    const inCodeState = await getVimState(page);
    expect(inCodeState.activeLine, "j into code").toBe(headingState.activeLine + 1);

    await fastKeys(page, "k");
    await page.waitForTimeout(50);
    expect(await getActualCursorBlockIndex(page), "k back to heading").toBe(headingIdx);
    expect((await getVimState(page)).activeLine, "activeLine back").toBe(headingState.activeLine);
  });

  test("BUG-001: rapid 20j then 20k returns to start @flaky", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");
    const startIdx = await getActualCursorBlockIndex(page);
    const startState = await getVimState(page);

    for (let i = 0; i < 20; i++) await fastKeys(page, "j");
    await page.waitForTimeout(50);
    for (let i = 0; i < 20; i++) await fastKeys(page, "k");
    await page.waitForTimeout(100);

    expect(await getActualCursorBlockIndex(page), "20j→20k: DOM block").toBe(startIdx);
    expect((await getVimState(page)).activeLine, "20j→20k: activeLine").toBe(startState.activeLine);
  });
});
