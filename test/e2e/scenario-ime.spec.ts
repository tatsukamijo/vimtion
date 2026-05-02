// Scenario 9 — IME mixed input
//
// Vimtion currently has NO `e.isComposing` guard (verified by env-architect:
// grep "isComposing|compositionstart" src/ returns 0 hits). All tests in
// this spec are expected to fail until a guard is added to handleKeydown
// in src/content_scripts/vim.ts. See docs/test-overhaul/env-gaps.md Gap 3.
//
// Per team direction we deliberately do NOT mark these test.fail() — real
// failures here are the deliverable. They turn an invisible Japanese-user
// breakage class into keystroke-localized assertions that motivate the fix.
//
// Implementation note on the input path: pressKeysWithIME drives Notion via
// CDP Input.imeSetComposition + Input.insertText. This is the same path
// Chrome's real IME pipeline uses, so it fires legitimate compositionstart /
// compositionupdate / compositionend events plus an InputEvent with
// inputType "insertCompositionText". It does NOT fire `keydown` events for
// the romaji characters that the IME is consuming — that is the actual
// browser behavior during real IME composition (the keydowns are intercepted
// by the IME). This means some bug classes (e.g., a `keydown` with
// `event.isComposing === true` that Vimtion mishandles) will NOT surface
// from this scenario alone — see the per-test commentary below for which
// surface each test exercises.

import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
  getActualCursorBlockIndex,
  getActualCursorBlockText,
  getAllBlockTexts,
  pressKeysWithIME,
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

// =============================================================================
// All tests run in ONE serial block so we can observe state accumulation
// (e.g., test N's text leftovers may surface bugs that a fresh page would
// hide). Each test cleans up its own block when feasible.
// =============================================================================

test.describe.serial("Scenario 9 — IME mixed input", () => {
  // strict: false — insert-mode checks are skipped, which is appropriate
  // because Notion legitimately moves the selection during IME insertion.
  // The invariant still runs after every Escape and in normal mode.
  useCursorInvariant({ strict: false });

  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // ---------------------------------------------------------------------------
  // Test 1 — Normal IME flow: enter insert, compose+commit kanji, escape.
  //
  // Expected behavior: kanji is inserted, mode returns to normal, vim_info
  // and DOM cursor remain in sync.
  //
  // Failure modes we'd see:
  //   - Mode does not return to normal after Escape (composition state stuck).
  //   - Block text missing the kanji (commit silently failed).
  //   - Cursor invariant fires after Escape (refreshLines lost the element
  //     during composition mutations — adjacent to BUG-012/013).
  // ---------------------------------------------------------------------------
  test("Test 1: insert + IME compose 日本語 + Escape — text inserted, mode normal", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1");

    await pressKeys(page, "i");
    await waitForMode(page, "insert");

    await pressKeysWithIME(page, "nihongo", "日本語");
    await page.waitForTimeout(150);

    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const state = await getVimState(page);
    expect(state.mode, "mode is normal after Escape").toBe("normal");

    const text = await getActualCursorBlockText(page);
    expect(text, 'block contains the committed kanji "日本語"').toContain(
      "日本語",
    );

    await assertCursorInvariant(page, {
      label: "after IME compose 日本語 + Escape",
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2 — `jk` escape during composition.
  //
  // The critical Japanese-user case: a user typing romaji `jk` for the
  // hiragana `じゃ` MUST NOT trigger Vimtion's `jk → Escape` shortcut.
  //
  // Behavior under CDP IME: imeSetComposition + insertText do not fire
  // discrete `j` / `k` keydown events, so the insertReducer's
  // jk-escape state machine (lastInsertKey === "j" + timeout) never sees
  // the romaji at all. This test therefore PASSES even without an
  // `isComposing` guard — it's documenting the user-observable behavior,
  // not directly exercising the missing guard. The failure mode that DOES
  // exercise the guard (real OS IME firing keydown(key="j", isComposing=
  // true)) is not reachable from CDP alone and would require a real OS IME.
  //
  // Keeping the test anyway because:
  //   1. It locks in the user-observable contract.
  //   2. If Vimtion ever adds composition-event listeners, this becomes the
  //      regression assertion.
  // ---------------------------------------------------------------------------
  test('Test 2: insert + IME compose "jk"→"じゃ" — mode stays insert', async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 2");

    await pressKeys(page, "i");
    await waitForMode(page, "insert");

    await pressKeysWithIME(page, "jk", "じゃ");
    await page.waitForTimeout(150);

    const state = await getVimState(page);
    expect(
      state.mode,
      "mode is STILL insert after IME composition (jk-escape MUST NOT fire during composition)",
    ).toBe("insert");

    const text = await getActualCursorBlockText(page);
    expect(text, 'block contains the committed hiragana "じゃ"').toContain(
      "じゃ",
    );

    // Restore normal mode for the next test — explicit Escape, not jk.
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await assertCursorInvariant(page, {
      label: 'after IME compose "jk"→"じゃ" + explicit Escape',
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3 — Motion key during composition in NORMAL mode.
  //
  // User accidentally has IME enabled while in normal mode (a real failure
  // mode reported by Japanese Vim users). They type `j` thinking it's the
  // motion; the IME consumes it and produces `じ`.
  //
  // Expected: cursor MUST NOT advance — no Vim motion fired, because j was
  // consumed by composition.
  //
  // Side effect we DON'T assert (but flag): the kanji `じ` will likely be
  // inserted into the active block because Notion's contenteditable
  // accepts the InputEvent regardless of Vimtion's mode. That's a
  // separate latent bug — Vimtion should suppress text insertion in
  // normal mode. Assertion deferred so this test focuses on the motion
  // suppression contract.
  // ---------------------------------------------------------------------------
  test('Test 3: normal mode + IME compose "j"→"じ" — cursor does NOT advance', async ({ extensionPage: page }) => {
    const startIdx = await goToBlock(page, "Plain text line 3");
    const startState = await getVimState(page);

    // Click into the block to ensure a contenteditable is focused (CDP IME
    // events drop silently if focus isn't on an editable). Stay in normal
    // mode — focus does not flip mode in Vimtion.
    expect(startState.mode, "mode is normal at test start").toBe("normal");

    await pressKeysWithIME(page, "j", "じ");
    await page.waitForTimeout(150);

    const afterState = await getVimState(page);
    const afterIdx = await getActualCursorBlockIndex(page);

    expect(
      afterState.activeLine,
      "active_line did NOT advance during IME composition in normal mode",
    ).toBe(startState.activeLine);
    expect(
      afterIdx,
      "DOM cursor block index did NOT advance during IME composition in normal mode",
    ).toBe(startIdx);
    expect(
      afterState.mode,
      "mode unchanged (still normal) after IME composition",
    ).toBe("normal");

    await assertCursorInvariant(page, {
      label: 'after IME compose "j"→"じ" in normal mode',
    });
  });

  // ---------------------------------------------------------------------------
  // Test 4 — Compose kanji, then type ASCII (the "mixed input" case from
  // the scenario name).
  //
  // Real users frequently compose a kanji word, then continue typing ASCII
  // inside the same insert-mode block. The cursor needs to be in the right
  // place after the composition for the ASCII to land where expected.
  // ---------------------------------------------------------------------------
  test('Test 4: insert + IME 日本語 + " world" + Escape — concatenated text', async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 4");

    await pressKeys(page, "i");
    await waitForMode(page, "insert");

    await pressKeysWithIME(page, "nihongo", "日本語");
    await page.waitForTimeout(100);

    // ASCII follow-up via real keystrokes (CDP) — exercises the cursor-
    // positioning-after-composition path.
    await page.keyboard.type(" world");
    await page.waitForTimeout(100);

    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const text = await getActualCursorBlockText(page);
    expect(
      text,
      'block contains the concatenated "日本語 world" — ASCII landed after the kanji, not before',
    ).toContain("日本語 world");

    await assertCursorInvariant(page, {
      label: "after IME 日本語 + ASCII follow-up + Escape",
    });
  });
});
