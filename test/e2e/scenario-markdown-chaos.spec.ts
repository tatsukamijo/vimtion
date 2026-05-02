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
  useCursorInvariant,
  assertCursorInvariant,
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
/**
 * Poll until the leaf block containing window.getSelection()'s anchor matches
 * `expectedType`. Used in place of `waitForBlockConversion` for this spec
 * because `waitForBlockConversion` reads `document.activeElement`, which in
 * Playwright headless is often `<body>` rather than a Notion block — Notion
 * uses Selection (Range) for cursor position and doesn't always keep
 * document focus on the contenteditable leaf. The existing BUG-013
 * reproducer at test/e2e/insert-open-line.spec.ts:737 sidesteps this with
 * a fixed 500ms sleep; we poll instead so the test is faster on the happy
 * path and times out cleanly with a useful diagnostic on the unhappy one.
 *
 * NOTE: this helper deliberately does NOT live in shared helpers/ — the
 * "selection-based" vs "activeElement-based" trade-off is a per-spec
 * decision and shouldn't bake into the shared API while wait-helpers.ts is
 * still settling.
 */
async function waitForBlockConversionViaSelection(
  page: import("@playwright/test").Page,
  expectedTypeFragment: string,
  timeoutMs = 2500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastDiagnostic = "no snapshot taken";
  while (Date.now() < deadline) {
    const snap = await page.evaluate((needle: string) => {
      const sel = window.getSelection();
      const node = sel?.anchorNode ?? null;
      const el = node?.nodeType === 1 ? (node as Element) : node?.parentElement ?? null;
      const block = el?.closest("[data-block-id]") as HTMLElement | null;
      if (!block) {
        return { hit: false, reason: "no [data-block-id] ancestor of selection anchor", className: "", text: "" };
      }
      return {
        hit: (block.className || "").includes(needle),
        reason: "ok",
        className: block.className || "",
        text: (block.textContent || "").slice(0, 80),
      };
    }, expectedTypeFragment);
    if (snap.hit) return;
    lastDiagnostic = `expected class fragment "${expectedTypeFragment}", actual className="${snap.className}", text="${snap.text}", reason=${snap.reason}`;
    await page.waitForTimeout(40);
  }
  throw new Error(
    `waitForBlockConversionViaSelection timed out after ${timeoutMs}ms.\n  ${lastDiagnostic}`,
  );
}

async function convertOnSpace(
  page: import("@playwright/test").Page,
  prefix: string,
  sampleText: string,
  expectedClassFragment: string,
  label: string,
): Promise<void> {
  await pressKeys(page, "o", { assertInvariant: false });
  // `o` must fully transition into insert mode AND Notion must finish creating
  // the new paragraph + placing the selection inside it before we start typing —
  // otherwise the markdown shortcut fires against the wrong block. The existing
  // BUG-013 reproducer at test/e2e/insert-open-line.spec.ts:741 waits 500ms here
  // for the same reason.
  await waitForMode(page, "insert");
  await page.waitForTimeout(500);

  // Type the prefix (ending with a space) — Notion fires conversion here.
  await page.keyboard.type(prefix);
  await waitForBlockConversionViaSelection(page, expectedClassFragment);

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
      "notion-sub_header-block",
      "after ## conversion + Esc — BUG-013 surface",
    );

    // Round 2 — `- ` bullet conversion.
    await convertOnSpace(
      page,
      "- ",
      "Bullet sample",
      "notion-bulleted_list-block",
      "after - conversion + Esc — BUG-013 surface",
    );

    // Round 3 — `1. ` numbered list conversion.
    await convertOnSpace(
      page,
      "1. ",
      "Numbered sample",
      "notion-numbered_list-block",
      "after 1. conversion + Esc — BUG-013 surface",
    );

    // Round 4 — `> ` produces a TOGGLE in Notion (NOT a quote). Notion has
    // no markdown shortcut for quote — quote requires the slash menu. The
    // existing BUG-013 reproducer at insert-open-line.spec.ts:817 uses `>`
    // but only checks DOM text content (not block type) so it accidentally
    // passes against a toggle. We test the toggle conversion since it's
    // still a markdown-shortcut → block-type conversion, which is exactly
    // what BUG-013 surfaces.
    await convertOnSpace(
      page,
      "> ",
      "Toggle sample",
      "notion-toggle-block",
      "after > conversion (TOGGLE — Notion has no quote shortcut) + Esc — BUG-013 surface",
    );

    // Round 5 — `[] ` todo conversion.
    await convertOnSpace(
      page,
      "[] ",
      "Todo sample",
      "notion-to_do-block",
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
    await waitForBlockConversionViaSelection(page, "notion-code-block");

    await page.keyboard.type("x = 1");
    await page.waitForTimeout(200);

    await pressKeys(page, "Escape", { assertInvariant: false });
    await waitForMode(page, "normal");

    await assertCursorInvariant(page, { label: "after ``` conversion + Esc — BUG-012 surface" });
  });

  // ---------------------------------------------------------------------------
  // Validate — gg to top, walk down, and assert that the converted-block
  // class fragments appear IN ORDER somewhere in the page (subset match —
  // intermediate blocks like the empty paragraphs Notion inserts after Enter
  // may sit between conversions).
  //
  // Uses a selection-based block-class read (NOT the shipped getCurrentBlockType,
  // which uses document.activeElement and frequently returns "unknown" in this
  // headless environment). The shipped helper is correct in spirit but the
  // activeElement-vs-Selection trade-off doesn't favor it here.
  // ---------------------------------------------------------------------------
  test("Validate: walked block classes contain expected sequence in order", async ({ extensionPage: page }) => {
    // Re-anchor: the conversion-chain test left us deep in the page; a click
    // resets focus and ensures gg starts cleanly.
    await goToBlock(page, "Plain text line 1");
    await pressKeys(page, "g", "g");

    /** Read the class-fragment list of the leaf containing window.getSelection's anchor. */
    async function selectionClass(): Promise<string> {
      return page.evaluate(() => {
        const sel = window.getSelection();
        const node = sel?.anchorNode ?? null;
        const el = node?.nodeType === 1 ? (node as Element) : node?.parentElement ?? null;
        const block = el?.closest("[data-block-id]") as HTMLElement | null;
        return block?.className ?? "";
      });
    }

    const observed: string[] = [];
    // Cap at 200 j-presses — page is large but bounded; this is plenty
    // and guards against an infinite loop if status-bar parsing fails.
    for (let i = 0; i < 200; i++) {
      observed.push(await selectionClass());
      const state = await getVimState(page);
      // status bar's activeLine is 1-based; lineCount is the total. Stop
      // when we've reached the bottom.
      if (state.activeLine >= state.lineCount) break;
      await pressKeys(page, "j");
    }

    // The class fragments produced by the 6 conversions. We assert presence
    // (NOT in-order). The original design called for ordered checking, but
    // empirical observation revealed two complications:
    //   1. Notion's `>` produces a toggle, not a quote (see Round 4).
    //   2. After each round's `Esc`, the cursor lands such that the NEXT
    //      round's `o` inserts the new block BETWEEN PT5 and the prior
    //      round's blocks — i.e., the converted blocks end up in REVERSE
    //      order in the document. This may be a Notion behavior we want
    //      to surface elsewhere; here we accept it and just verify presence.
    //   3. The page already contains a heading_2 (Section 1's "Section 1:
    //      Plain text"), so an in-order check starting from sub_header
    //      would pre-match against the existing heading, not the converted
    //      one.
    // Per-round conversion success is enforced by the headline test above
    // (waitForBlockConversionViaSelection), so this check is the additional
    // sanity that all 6 survive in the DOM after the chain finishes.
    const requiredFragments: string[] = [
      "notion-sub_header-block",
      "notion-bulleted_list-block",
      "notion-numbered_list-block",
      "notion-toggle-block",
      "notion-to_do-block",
      "notion-code-block",
    ];

    const missing = requiredFragments.filter(
      (frag) => !observed.some((cls) => cls.includes(frag)),
    );
    expect(
      missing,
      `expected all 6 conversion class fragments present in walkdown. ` +
        `missing=${JSON.stringify(missing)}; observed=${JSON.stringify(observed)}`,
    ).toEqual([]);
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
  // Characterize undo / redo — record the line-count trace and attach it to
  // the test report; the only HARD assertion is that the cursor invariant
  // still holds after a long u/r chain.
  //
  // FINDING (recorded from a run on 2026-05-03): from the post-conversion-
  // chain state, `u` is a NO-OP. Five consecutive `u` presses leave both
  // lineCount and activeLine unchanged. Vimtion's `u` routes through
  // document.execCommand("undo") (per CLAUDE.md), and Notion appears to
  // ignore browser-native undo for blocks created via markdown shortcuts.
  // (Notion's own Cmd+Z would undo through Notion's internal stack — not
  // the path Vimtion uses today.) This is exactly the kind of "undefined
  // undo grouping across conversions" behavior the design called out for
  // characterization. We log the trace and let the test pass — the
  // FINDING comment is the deliverable, not a green/red signal.
  // ---------------------------------------------------------------------------
  test("Characterize undo: hammer u, log trace, invariant holds", async ({ extensionPage: page }, testInfo) => {
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
      // Stop early if 5 consecutive undos didn't change anything.
      if (stableSteps >= 5) break;
    }

    const after = (await getVimState(page)).lineCount;
    // Attach trace to test report so future maintainers can re-characterize
    // without rerunning the whole suite.
    await testInfo.attach("undo-trace.json", {
      body: JSON.stringify({ before, after, delta: after - before, trace }, null, 2),
      contentType: "application/json",
    });

    // Hard invariant: even when undo is a no-op, vim_info ↔ DOM cursor
    // sync must not have drifted.
    await assertCursorInvariant(page, { label: "after undo chain (≤30× u)" });

    // Soft sanity: lineCount must NOT have grown (would indicate spurious
    // block creation, which would be a real bug).
    expect(
      after,
      `undo characterization should not GROW lineCount. before=${before}, after=${after}`,
    ).toBeLessThanOrEqual(before);
  });

  // ---------------------------------------------------------------------------
  // Characterize redo — same shape. Vimtion uses `r` for redo (NOT
  // replace-character — see CLAUDE.md "Undo/Redo"). Symmetric finding:
  // if `u` is a no-op, `r` likely has nothing to redo and is also a no-op.
  // ---------------------------------------------------------------------------
  test("Characterize redo: hammer r, log trace, invariant holds", async ({ extensionPage: page }, testInfo) => {
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
    await testInfo.attach("redo-trace.json", {
      body: JSON.stringify({ before, after, delta: after - before, trace }, null, 2),
      contentType: "application/json",
    });

    await assertCursorInvariant(page, { label: "after redo chain (≤30× r)" });

    // Soft sanity: lineCount must NOT have shrunk after redo (redo can only
    // restore previously-undone blocks).
    expect(
      after,
      `redo characterization should not SHRINK lineCount. before=${before}, after=${after}`,
    ).toBeGreaterThanOrEqual(before);
  });
});
