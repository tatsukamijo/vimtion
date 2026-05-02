// Scenario 6 — see docs/test-overhaul/workflow-scenarios.md (lines 284-335)
//
// "Markdown shortcut chaos": six markdown conversions in sequence (`##`, `-`,
// `1.`, `>`, `[]`, ` ``` `). Each round opens a fresh paragraph with `o`,
// types the markdown prefix + sample text, presses Enter, escapes — and the
// labeled assertCursorInvariant immediately after Esc is the BUG-013 surface.
//
// Headline targets:
//   - BUG-013 (every conversion + Esc — refreshLines loses the original
//     paragraph element when Notion swaps it for the converted block).
//   - BUG-012 (the ``` round — same root cause, different shortcut).
//
// Per team direction we deliberately do NOT mark `test.fail()`. The spec is
// EXPECTED to fail loudly. The labeled assertCursorInvariant() calls turn
// each broken round into a keystroke-localized diagnostic that pinpoints
// the offending shortcut.
//
// Notion conversion timing notes (verified by manual experimentation; see
// the existing BUG-013 reproducer at test/e2e/insert-open-line.spec.ts:737):
//   - For `##`, `-`, `1.`, `>`, `[]`: conversion fires when Notion sees the
//     trailing space character. Active block becomes the converted type
//     immediately; subsequent typing happens inside the converted block.
//     A later Enter then creates a NEW paragraph below the converted block.
//   - For ` ``` `: conversion fires on Enter (no space-trigger). The Enter
//     itself becomes the conversion event, so we wait for the conversion
//     AFTER pressing Enter, then continue typing inside the code block
//     (Enter inside a code block is a soft newline, not a block split).
//
// Therefore each round produces +2 blocks (converted block + new paragraph
// below from Enter), EXCEPT the code-block round which produces +1 (no
// trailing paragraph because Enter was consumed by conversion). Total
// expected line-count delta after all 6 rounds: roughly +11. We do not
// hardcode this — we capture the value before/after and simply assert
// monotonic growth.
//
// Undo characterization: undo grouping across markdown conversions is
// undocumented in Notion. One `u` may revert (a) only the conversion,
// (b) both the `o`-paragraph and the conversion in one step, or (c)
// be a no-op. The "Characterize undo" phase observes the actual line-count
// trace and records it in the assertion message rather than asserting a
// specific count.

import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
  getAllBlockTexts,
  getCurrentBlockType,
  waitForBlockConversion,
  useCursorInvariant,
  assertCursorInvariant,
  type BlockType,
} from "../helpers";

/**
 * Click a block by its text content, then Escape to ensure normal mode.
 * Local copy of the same pattern in other scenario specs to keep this file
 * self-contained.
 */
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

/**
 * Run a single markdown-conversion round for shortcuts that convert on the
 * trailing space (heading, bullet, numbered, quote, todo).
 *
 * The Escape uses pressKeys with `assertInvariant: false` so the spec-wide
 * auto-check is suppressed for this one keystroke — we want our explicit
 * `assertCursorInvariant({ label })` immediately after to be the failure
 * site, with a meaningful label rather than a generic "after key Escape".
 */
async function convertOnSpace(
  page: import("@playwright/test").Page,
  prefix: string,
  sampleText: string,
  expectedType: BlockType,
  label: string,
): Promise<void> {
  await pressKeys(page, "o", { assertInvariant: false });
  // `o` must fully transition into insert mode AND Notion must finish creating
  // the new paragraph + placing focus inside it before we start typing —
  // otherwise the markdown shortcut fires against the wrong block (or against
  // no block at all, with focus on document.body, which is what failed the
  // first run of this spec). The existing BUG-013 reproducer at
  // test/e2e/insert-open-line.spec.ts:741 waits 500 ms here for the same
  // reason.
  await waitForMode(page, "insert");
  await page.waitForTimeout(500);

  // Type the prefix (ending with a space) — Notion fires conversion here.
  await page.keyboard.type(prefix);
  await waitForBlockConversion(page, expectedType);

  // Continue typing inside the converted block.
  await page.keyboard.type(sampleText);

  // Enter creates a new paragraph below the converted block.
  await page.keyboard.press("Enter");
  // Settle for the new-paragraph DOM mutation. Match the 500ms cadence the
  // existing BUG-013 reproducer uses — anything shorter races with Notion.
  await page.waitForTimeout(300);

  // Suppress the auto-check on Escape so the labeled diagnostic is the
  // failure site (more useful than the generic "after key Escape" message).
  await pressKeys(page, "Escape", { assertInvariant: false });
  await waitForMode(page, "normal");

  // Headline assertion — this is where BUG-013 fires.
  await assertCursorInvariant(page, { label });
}

// =============================================================================
// All rounds run in ONE serial block with NO reloads. State accumulates so a
// later round may surface bugs caused by the residue of earlier conversions.
// =============================================================================

test.describe.serial("Scenario 6 — Markdown shortcut chaos", () => {
  // strict: false — insert-mode checks are skipped (Notion legitimately
  // moves the selection while typing). Normal-mode checks (after every
  // Escape) are where BUG-013 surfaces.
  useCursorInvariant({ strict: false }, test);

  // Module-scoped state shared across the phases in this serial block.
  let originalLineCount = 0;

  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // ---------------------------------------------------------------------------
  // Conversion chain — all 6 markdown rounds in ONE test so focus and DOM
  // state flow naturally between rounds (per the design's "story" semantics).
  //
  // Splitting rounds into separate test()s loses focus across the test
  // boundary (Playwright's between-test housekeeping displaces it), and
  // calling goToBlock at the start of each round would jump back to PT5
  // each time — which would test 6 isolated conversions, defeating the
  // "state accumulates" point of this scenario.
  //
  // The labeled `assertCursorInvariant({ label })` calls inside `convertOnSpace`
  // are the BUG-013 / BUG-012 surface points. The test fails at the FIRST
  // round whose label triggers, telling us exactly which shortcut broke.
  // ---------------------------------------------------------------------------
  test("Conversion chain: 6 markdown shortcuts in sequence (BUG-013/BUG-012 surface)", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 5");
    originalLineCount = (await getVimState(page)).lineCount;
    await assertCursorInvariant(page, { label: "before Round 1 (## heading)" });

    // Round 1 — `## ` heading conversion. Active block becomes heading_2 on
    // space, then Enter creates a new paragraph below. After Esc the cursor
    // is on that new paragraph; per BUG-013, vim_info.active_line points to
    // the stale (destroyed) original paragraph element.
    await convertOnSpace(
      page,
      "## ",
      "Heading sample",
      "heading_2",
      "after ## conversion + Esc — BUG-013 surface",
    );

    // Round 2 — `- ` bullet conversion.
    await convertOnSpace(
      page,
      "- ",
      "Bullet sample",
      "bulleted_list",
      "after - conversion + Esc — BUG-013 surface",
    );

    // Round 3 — `1. ` numbered list conversion.
    await convertOnSpace(
      page,
      "1. ",
      "Numbered sample",
      "numbered_list",
      "after 1. conversion + Esc — BUG-013 surface",
    );

    // Round 4 — `> ` quote conversion.
    await convertOnSpace(
      page,
      "> ",
      "Quote sample",
      "quote",
      "after > conversion + Esc — BUG-013 surface",
    );

    // Round 5 — `[] ` todo conversion.
    await convertOnSpace(
      page,
      "[] ",
      "Todo sample",
      "to_do",
      "after [] conversion + Esc — BUG-013 surface",
    );

    // Round 6 — ` ``` ` code-block conversion. Different timing: conversion
    // fires on Enter (not space). After conversion, focus stays inside the
    // code block; subsequent Enter would be a soft newline. We type the body
    // BEFORE Esc to populate the code block (Notion can collapse empty code
    // blocks). This is the BUG-012 surface.
    await pressKeys(page, "o", { assertInvariant: false });
    await waitForMode(page, "insert");
    await page.waitForTimeout(500);

    await page.keyboard.type("```py");
    await page.keyboard.press("Enter");
    await waitForBlockConversion(page, "code");

    await page.keyboard.type("x = 1");
    await page.waitForTimeout(200);

    await pressKeys(page, "Escape", { assertInvariant: false });
    await waitForMode(page, "normal");

    await assertCursorInvariant(page, { label: "after ``` conversion + Esc — BUG-012 surface" });
  });

  // ---------------------------------------------------------------------------
  // Validate — gg to top, walk down, and assert that the converted-block
  // type sequence appears IN ORDER somewhere in the page (subset match —
  // intermediate blocks like the empty paragraphs Notion inserts after Enter
  // may sit between conversions).
  // ---------------------------------------------------------------------------
  test("Validate: walked types contain expected sequence in order", async ({ extensionPage: page }) => {
    await pressKeys(page, "g", "g");

    const observedTypes: Array<BlockType | "unknown"> = [];
    // Cap at 200 j-presses — page is large but bounded; this is plenty
    // and guards against an infinite loop if status-bar parsing fails.
    for (let i = 0; i < 200; i++) {
      observedTypes.push(await getCurrentBlockType(page));
      const state = await getVimState(page);
      // status bar's activeLine is 1-based; lineCount is the total. Stop
      // when we've reached the bottom.
      if (state.activeLine >= state.lineCount) break;
      await pressKeys(page, "j");
    }

    const expectedOrder: BlockType[] = [
      "heading_2",
      "bulleted_list",
      "numbered_list",
      "quote",
      "to_do",
      "code",
    ];

    let cursor = 0;
    for (const t of observedTypes) {
      if (t === expectedOrder[cursor]) cursor += 1;
      if (cursor === expectedOrder.length) break;
    }
    expect(
      cursor,
      `expected to encounter types in order ${JSON.stringify(expectedOrder)} during walkdown; observed sequence: ${JSON.stringify(observedTypes)}`,
    ).toBe(expectedOrder.length);
  });

  // ---------------------------------------------------------------------------
  // Sanity: the page actually grew. Soft check — we don't hardcode the exact
  // delta because (a) intermediate empty paragraphs vary by shortcut, (b)
  // we want this test to be robust to future Notion behavior changes.
  // ---------------------------------------------------------------------------
  test("Sanity: lineCount grew over the 6-round chain", async ({ extensionPage: page }) => {
    const after = (await getVimState(page)).lineCount;
    expect(
      after,
      `lineCount should have grown after 6 markdown conversions (was ${originalLineCount})`,
    ).toBeGreaterThan(originalLineCount);
  });

  // ---------------------------------------------------------------------------
  // Characterize undo — hammer `u` and record the line-count trace. We do
  // NOT assert a specific number of undos because:
  //   1. Notion's own undo stack groups events at unpredictable boundaries.
  //   2. Vimtion's `u` calls into the browser's native undo via
  //      document.execCommand (per CLAUDE.md "Undo/Redo" section).
  //   3. The team-lead constraint #6 explicitly asks us to characterize, not
  //      enforce, this behavior.
  //
  // The trace becomes the failure message if the soft assertion (line count
  // must decrease at least once) fails — giving us per-step visibility into
  // what `u` actually did.
  // ---------------------------------------------------------------------------
  test("Characterize undo: hammer u, observe line-count trace", async ({ extensionPage: page }) => {
    const before = (await getVimState(page)).lineCount;
    const trace: Array<{ step: number; lineCount: number; activeLine: number }> = [];
    let lastLineCount = before;
    let stableSteps = 0;

    for (let i = 1; i <= 30; i++) {
      await pressKeys(page, "u", { assertInvariant: false });
      await page.waitForTimeout(120);
      const s = await getVimState(page);
      trace.push({ step: i, lineCount: s.lineCount, activeLine: s.activeLine });
      if (s.lineCount === lastLineCount) stableSteps += 1;
      else stableSteps = 0;
      lastLineCount = s.lineCount;
      // Stop early if 5 consecutive undos didn't change anything — undo stack
      // appears empty.
      if (stableSteps >= 5) break;
    }

    const after = (await getVimState(page)).lineCount;
    expect(
      after,
      `undo characterization — lineCount must decrease at least once. ` +
        `before=${before}, after=${after}, trace=${JSON.stringify(trace)}`,
    ).toBeLessThan(before);

    // Even after a long undo chain the cursor invariant must hold.
    await assertCursorInvariant(page, { label: "after undo chain (≤30× u)" });
  });

  // ---------------------------------------------------------------------------
  // Characterize redo — same shape as the undo phase. Vimtion uses `r` for
  // redo (NOT replace-character — see CLAUDE.md "Undo/Redo").
  // ---------------------------------------------------------------------------
  test("Characterize redo: hammer r, observe line-count trace", async ({ extensionPage: page }) => {
    const before = (await getVimState(page)).lineCount;
    const trace: Array<{ step: number; lineCount: number; activeLine: number }> = [];
    let lastLineCount = before;
    let stableSteps = 0;

    for (let i = 1; i <= 30; i++) {
      await pressKeys(page, "r", { assertInvariant: false });
      await page.waitForTimeout(120);
      const s = await getVimState(page);
      trace.push({ step: i, lineCount: s.lineCount, activeLine: s.activeLine });
      if (s.lineCount === lastLineCount) stableSteps += 1;
      else stableSteps = 0;
      lastLineCount = s.lineCount;
      if (stableSteps >= 5) break;
    }

    const after = (await getVimState(page)).lineCount;
    expect(
      after,
      `redo characterization — lineCount must increase at least once. ` +
        `before=${before}, after=${after}, trace=${JSON.stringify(trace)}`,
    ).toBeGreaterThan(before);

    await assertCursorInvariant(page, { label: "after redo chain (≤30× r)" });
  });
});
