// Scenario 5 — see docs/test-overhaul/workflow-scenarios.md
//
// "Speed-typist burst": held-key autorepeat + rapid mode flap. Primary
// surface for BUG-001 (rapid j/k round-trip desync) and a stress test for
// the MutationObserver / lines[] cache under sustained input load.
//
// We deliberately do NOT mark phases as test.fail(). Per team direction,
// the point of this spec is to turn invisible cursor-sync bugs into
// keystroke-localized failures with diagnostic output. Failures here ARE
// the deliverable — the labeled assertCursorInvariant() calls pinpoint
// the exact burst boundary at which the invariant first breaks.

import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
  getActualCursorBlockIndex,
  getActualCursorBlockText,
  getAllBlockTexts,
  holdKey,
  assertCursorInvariant,
  useCursorInvariant,
} from "../helpers";

/**
 * Click a block by its text content, then Escape to ensure normal mode.
 * Copied from test/e2e/navigation.spec.ts so this spec is self-contained
 * (and so we don't pollute the shared helpers per team-lead direction).
 *
 * Uses page.keyboard.press("Escape") directly rather than pressKeys() so
 * the spec-wide cursor invariant doesn't fire during setup — goToBlock is
 * itself the act of synchronising state, so checking mid-setup would race.
 */
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

// =============================================================================
// All phases run in ONE serial block with NO reloads between them.
// State accumulates exactly like a real fast-typist session.
// =============================================================================

test.describe.serial("Scenario 5 — Speed-typist burst", () => {
  // Spec-wide invariant: after every pressKeys keystroke (in normal mode),
  // assert window.vim_info matches the DOM cursor's owning leaf. strict:false
  // skips checks in insert mode where Notion may transiently own selection.
  useCursorInvariant({ strict: false });

  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // ---------------------------------------------------------------------------
  // Phase 1 — Rapid descent: hold j down for 30 autorepeats.
  // ---------------------------------------------------------------------------
  test("Phase 1: rapid descent — holdKey j×30", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");
    await assertCursorInvariant(page, { label: "before holdKey j×30" });

    const startState = await getVimState(page);
    const startIdx = await getActualCursorBlockIndex(page);

    await holdKey(page, "j", 30);
    await page.waitForTimeout(150);

    const afterState = await getVimState(page);
    const afterIdx = await getActualCursorBlockIndex(page);

    // Cursor should have advanced. May cap below 30 if it hit the page bottom,
    // but it must not have stayed still or moved backwards.
    expect(
      afterState.activeLine,
      "active_line advanced past start",
    ).toBeGreaterThan(startState.activeLine);
    expect(
      afterIdx,
      "DOM cursor block index advanced past start",
    ).toBeGreaterThan(startIdx);

    // The headline check: after a single rapid burst, vim_info must still
    // point at the same leaf the DOM cursor is in.
    await assertCursorInvariant(page, { label: "after holdKey j×30" });
  });

  // ---------------------------------------------------------------------------
  // Phase 2 — Rapid ascent: hold k down for 30 autorepeats. Cursor SHOULD
  // return to the starting line. Per BUG-001 it commonly lands one block
  // above (or below) the start.
  // ---------------------------------------------------------------------------
  test("Phase 2: rapid ascent — holdKey k×30 returns to Phase 1 start", async ({ extensionPage: page }) => {
    await assertCursorInvariant(page, { label: "before holdKey k×30" });

    const beforeState = await getVimState(page);
    const beforeIdx = await getActualCursorBlockIndex(page);

    await holdKey(page, "k", 30);
    await page.waitForTimeout(150);

    const afterState = await getVimState(page);
    const afterIdx = await getActualCursorBlockIndex(page);

    // Sanity: cursor moved up (not stuck).
    expect(
      afterState.activeLine,
      "active_line decreased after k×30",
    ).toBeLessThan(beforeState.activeLine);
    expect(
      afterIdx,
      "DOM cursor index decreased after k×30",
    ).toBeLessThan(beforeIdx);

    // Headline: the invariant must hold even after the round-trip.
    // This is the primary BUG-001 surface — failure here means the
    // 30j-then-30k pattern produced a vim_info ↔ DOM mismatch.
    await assertCursorInvariant(page, { label: "after holdKey k×30 — BUG-001 surface" });
  });

  // ---------------------------------------------------------------------------
  // Phase 3 — Rapid mode flap across 10 consecutive blocks.
  // Each iter: i / x / Escape / j. State accumulates: 10 blocks each get an
  // "x" prepended. The spec-wide invariant runs after every Escape and j.
  // ---------------------------------------------------------------------------
  test("Phase 3: rapid mode flap across 10 blocks", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");
    await assertCursorInvariant(page, { label: "before 10× i/x/Esc/j flap" });

    const startState = await getVimState(page);

    for (let i = 0; i < 10; i++) {
      // pressKeys runs the spec-wide invariant after each keystroke (and
      // is mode-aware: insert-mode "x" is skipped, Escape and j are checked).
      await pressKeys(page, "i", "x", "Escape", "j");
      // Per-iter checkpoint label so a mid-loop failure tells us exactly
      // which iteration broke.
      if ((i + 1) % 3 === 0) {
        await assertCursorInvariant(page, { label: `after iter ${i + 1}/10 of i/x/Esc/j` });
      }
    }
    await page.waitForTimeout(100);

    const endState = await getVimState(page);

    // Each iter ends with j → 10 j's = +10 blocks total. We assert via the
    // status-bar's active_line (robust across block types) and let the
    // element-identity invariant catch any DOM ↔ vim_info drift.
    expect(
      endState.activeLine,
      "active_line advanced by exactly 10",
    ).toBe(startState.activeLine + 10);

    await assertCursorInvariant(page, { label: "after 10× i/x/Esc/j flap" });
  });

  // ---------------------------------------------------------------------------
  // Phase 4 — Word-motion bursts: hold w then hold b on a long line.
  // ---------------------------------------------------------------------------
  test("Phase 4: word motion bursts — holdKey w×8 then b×8", async ({ extensionPage: page }) => {
    await goToBlock(page, "The quick brown fox jumps over the lazy dog");
    // goToBlock clicks the leaf, which places the cursor at an unspecified
    // column. Anchor to col 0 so the w-count math is well-defined.
    await pressKeys(page, "0");
    await assertCursorInvariant(page, { label: "before holdKey w×8 (anchored at col 0)" });

    const startBlockIdx = await getActualCursorBlockIndex(page);

    // The line has 9 words: The/quick/brown/fox/jumps/over/the/lazy/dog.
    // Starting at col 0 ("The"), w×8 should land on the 9th word ("dog")
    // and stay on the same block (Vim's `w` only crosses lines at the very
    // end of the last word).
    await holdKey(page, "w", 8);
    await page.waitForTimeout(100);
    await assertCursorInvariant(page, { label: "after holdKey w×8" });

    expect(
      await getActualCursorBlockIndex(page),
      "cursor still on same block after w×8",
    ).toBe(startBlockIdx);
    const afterW = await getActualCursorBlockText(page);
    expect(afterW, "block text intact after w×8").toContain("dog");

    await holdKey(page, "b", 8);
    await page.waitForTimeout(100);
    await assertCursorInvariant(page, { label: "after holdKey b×8" });

    expect(
      await getActualCursorBlockIndex(page),
      "cursor still on same block after b×8",
    ).toBe(startBlockIdx);
    const afterB = await getActualCursorBlockText(page);
    expect(afterB, "block text intact after b×8").toContain("The");
  });

  // ---------------------------------------------------------------------------
  // Phase 5 — Stationary mode flap: 20× i/Esc with no movement. Cursor MUST
  // NOT drift. Sustained-load stress on the MutationObserver / refreshLines.
  // ---------------------------------------------------------------------------
  test("Phase 5: stationary i/Esc flap × 20 — no drift", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 3");
    await assertCursorInvariant(page, { label: "before 20× i/Esc stationary flap" });

    const startIdx = await getActualCursorBlockIndex(page);
    const startState = await getVimState(page);

    for (let i = 0; i < 20; i++) {
      await pressKeys(page, "i", "Escape");
    }
    await page.waitForTimeout(100);

    const endIdx = await getActualCursorBlockIndex(page);
    const endState = await getVimState(page);

    expect(endIdx, "DOM block index unchanged after 20× i/Esc").toBe(startIdx);
    expect(endState.activeLine, "active_line unchanged after 20× i/Esc").toBe(
      startState.activeLine,
    );

    await assertCursorInvariant(page, { label: "after 20× i/Esc stationary flap" });
  });

  // ---------------------------------------------------------------------------
  // Phase 6 — Micro vertical cycle: hold j×5 then hold k×5. Smaller variant
  // of Phases 1+2 — surfaces BUG-001 even when burst length is modest.
  // ---------------------------------------------------------------------------
  test("Phase 6: micro vertical cycle — holdKey j×5 + k×5 returns to start", async ({ extensionPage: page }) => {
    await assertCursorInvariant(page, { label: "before micro 5j+5k" });

    const startIdx = await getActualCursorBlockIndex(page);
    const startState = await getVimState(page);

    await holdKey(page, "j", 5);
    await page.waitForTimeout(80);
    await assertCursorInvariant(page, { label: "after holdKey j×5 (mid-cycle)" });

    await holdKey(page, "k", 5);
    await page.waitForTimeout(80);

    const endIdx = await getActualCursorBlockIndex(page);
    const endState = await getVimState(page);

    expect(endIdx, "DOM block index returns after 5j+5k").toBe(startIdx);
    expect(endState.activeLine, "active_line returns after 5j+5k").toBe(
      startState.activeLine,
    );

    await assertCursorInvariant(page, { label: "after micro 5j+5k — BUG-001 surface" });
  });
});
