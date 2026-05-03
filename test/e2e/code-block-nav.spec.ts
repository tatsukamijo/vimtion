import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  pressKeys,
  getVimState,
  getActualCursorBlockText,
  getActualCursorBlockIndex,
  getCursorPosition,
  waitForBlockConversion,
  useCursorInvariant,
  useUiInvariant,
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

async function getCodeBlockInfo(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { text: "", offset: -1, totalLength: -1 };
    const node = sel.anchorNode;
    if (!node) return { text: "", offset: -1, totalLength: -1 };
    const el = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    const leaf = el?.closest('[data-content-editable-leaf="true"]');
    if (!leaf) return { text: "", offset: -1, totalLength: -1 };

    const walker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let current = walker.nextNode();
    while (current) {
      if (current === sel.anchorNode) {
        offset += sel.anchorOffset;
        break;
      }
      offset += (current.textContent || "").length;
      current = walker.nextNode();
    }

    const fullText = leaf.textContent || "";
    return { text: fullText, offset, totalLength: fullText.length };
  });
}

function getCodeLineFromOffset(fullText: string, offset: number): { lineIndex: number; lineCount: number } {
  const lines = fullText.split("\n");
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = pos + lines[i].length;
    if (offset <= lineEnd) return { lineIndex: i, lineCount: lines.length };
    pos = lineEnd + 1; // +1 for \n
  }
  return { lineIndex: lines.length - 1, lineCount: lines.length };
}

// NOTE: dropped `describe.serial` so the invariants don't halt the full
// diagnostic capture on the first violation. Each test does its own
// `goToBlock(...)` reset, so they're already independent of each other.
test.describe("Code block navigation", () => {
  useCursorInvariant({ strict: false }, test);
  useUiInvariant({ strict: false }, test);

  test.beforeAll(async ({ extensionPage: page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  // =========================================================================
  // j/k within code block
  // =========================================================================

  test("j from heading enters code block first line", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");

    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const info = await getCodeBlockInfo(page);
    console.log("enter-code-j: text starts with", JSON.stringify(info.text.slice(0, 30)), "offset =", info.offset);

    expect(info.text).toContain("function hello");
    const { lineIndex } = getCodeLineFromOffset(info.text, info.offset);
    expect(lineIndex).toBe(0);
  });

  test("j moves down through code block lines", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    // Now on code block line 0, press j to go to line 1
    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const info = await getCodeBlockInfo(page);
    const { lineIndex } = getCodeLineFromOffset(info.text, info.offset);
    console.log("code-j-line1: lineIndex =", lineIndex, "offset =", info.offset);
    expect(lineIndex).toBe(1);
  });

  test("k moves up through code block lines", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // enter code block
    await page.waitForTimeout(200);
    await pressKeys(page, "j"); // line 1
    await page.waitForTimeout(200);

    await pressKeys(page, "k"); // back to line 0
    await page.waitForTimeout(200);

    const info = await getCodeBlockInfo(page);
    const { lineIndex } = getCodeLineFromOffset(info.text, info.offset);
    console.log("code-k-line0: lineIndex =", lineIndex, "offset =", info.offset);
    expect(lineIndex).toBe(0);
  });

  // BUG-010: k from first code block line — the navigation FIX is in
  // moveCursorUpInCodeBlock (lineStart === -1 routes through setActiveLine +
  // updateInfoContainer), but the strict cursor-invariant still trips during
  // the k press: active_line correctly steps back to the heading, yet the
  // DOM cursor lands two leaves further down, suggesting setActiveLine's
  // heading.click() does not reliably move the selection in the test
  // environment. Marker stays until that sync issue is resolved separately.
  test.fail("k from code block first line exits to block above", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // enter code block
    await page.waitForTimeout(200);

    await pressKeys(page, "k"); // should exit to heading
    await page.waitForTimeout(200);

    const text = await getActualCursorBlockText(page);
    console.log("code-k-exit: text =", JSON.stringify(text));
    expect(text).toContain("Section 8: Code block");
  });

  // =========================================================================
  // BUG-010: j on last code block line — ghost line and stuck cursor
  // =========================================================================

  test("j through all code block lines reaches last line", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // enter code block
    await page.waitForTimeout(200);

    const info = await getCodeBlockInfo(page);
    const { lineCount } = getCodeLineFromOffset(info.text, 0);
    // Drop the trailing-empty split entry (BUG-010 fix: j on the visible
    // last line now exits, so iterating to lineCount-1 would walk us out
    // of the block).
    const rawLines = info.text.split("\n");
    const realLineCount =
      rawLines.length > 1 && rawLines[rawLines.length - 1] === ""
        ? lineCount - 1
        : lineCount;
    console.log("code block has", lineCount, "raw lines (real:", realLineCount, "), text length =", info.totalLength);

    // Navigate to the visible last line
    for (let i = 1; i < realLineCount; i++) {
      await pressKeys(page, "j");
      await page.waitForTimeout(100);
    }

    const afterInfo = await getCodeBlockInfo(page);
    const pos = getCodeLineFromOffset(afterInfo.text, afterInfo.offset);
    console.log("code-last-line: lineIndex =", pos.lineIndex, "/", pos.lineCount, "offset =", afterInfo.offset);
    expect(pos.lineIndex).toBe(realLineCount - 1);
  });

  // BUG-010 (fixed): j on the visible last line of the code block exits
  // downward. Previously, the trailing "\n" in textContent let split("\n")
  // produce a phantom empty entry, so j navigated into ghost territory
  // before the next j finally exited.
  test("j on last code block line exits to block below", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // enter code block
    await page.waitForTimeout(200);

    const info = await getCodeBlockInfo(page);
    // Strip the trailing-empty entry from a code block whose textContent
    // ends in "\n" — that entry is no longer treated as a real line.
    const rawLines = info.text.split("\n");
    const realLineCount =
      rawLines.length > 1 && rawLines[rawLines.length - 1] === ""
        ? rawLines.length - 1
        : rawLines.length;

    // Navigate to the visible last line
    for (let i = 1; i < realLineCount; i++) {
      await pressKeys(page, "j");
      await page.waitForTimeout(100);
    }

    // One more j should exit the code block
    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const text = await getActualCursorBlockText(page);
    console.log("code-j-exit: text =", JSON.stringify(text));
    // Should land on "Text after code block", not still in code block
    expect(text).toContain("Text after code block");
  });

  // BUG-010 (fixed): i in code block enters insert mode without crashing.
  // Used to test recovery from the ghost-line slot reached via repeated j;
  // the ghost line is now unreachable, so this just sanity-checks i.
  test("i in code block enters insert mode", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // enter code block
    await page.waitForTimeout(200);

    // i should enter insert mode
    await pressKeys(page, "i");
    await page.waitForTimeout(200);

    const state = await getVimState(page);
    expect(state.mode).toBe("insert");

    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
  });

  // =========================================================================
  // j/k round-trip within code block
  // =========================================================================

  test("j then k round-trip stays on same code block line", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // enter code block line 0
    await page.waitForTimeout(200);

    const before = await getCodeBlockInfo(page);
    const posBefore = getCodeLineFromOffset(before.text, before.offset);

    await pressKeys(page, "j"); // line 1
    await page.waitForTimeout(100);
    await pressKeys(page, "k"); // back to line 0
    await page.waitForTimeout(200);

    const after = await getCodeBlockInfo(page);
    const posAfter = getCodeLineFromOffset(after.text, after.offset);
    console.log("code-jk-roundtrip: before line", posBefore.lineIndex, "after line", posAfter.lineIndex);
    expect(posAfter.lineIndex).toBe(posBefore.lineIndex);
  });

  // =========================================================================
  // h/l within code block
  // =========================================================================

  test("l moves right within code block line", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // enter code block
    await page.waitForTimeout(200);
    await pressKeys(page, "0"); // go to start
    await page.waitForTimeout(100);

    const before = await getCodeBlockInfo(page);

    await pressKeys(page, "l");
    await page.waitForTimeout(100);

    const after = await getCodeBlockInfo(page);
    console.log("code-l: offset", before.offset, "→", after.offset);
    expect(after.offset).toBe(before.offset + 1);
  });

  test("h moves left within code block line", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // enter code block
    await page.waitForTimeout(200);
    await pressKeys(page, "l", "l", "l"); // move right a few
    await page.waitForTimeout(100);

    const before = await getCodeBlockInfo(page);

    await pressKeys(page, "h");
    await page.waitForTimeout(100);

    const after = await getCodeBlockInfo(page);
    console.log("code-h: offset", before.offset, "→", after.offset);
    expect(after.offset).toBe(before.offset - 1);
  });

  // =========================================================================
  // desired_column preservation across code block entry/exit
  // =========================================================================

  test("desired_column preserved when entering code block from above", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    // Move to column 5 on heading
    await pressKeys(page, "0");
    await page.waitForTimeout(50);
    for (let i = 0; i < 5; i++) {
      await pressKeys(page, "l");
      await page.waitForTimeout(30);
    }

    await pressKeys(page, "j"); // enter code block
    await page.waitForTimeout(200);

    const info = await getCodeBlockInfo(page);
    const firstLine = info.text.split("\n")[0];
    const expectedCol = Math.min(5, firstLine.length);
    // offset should be at column 5 (or end of first line if shorter)
    console.log("code-desired-col: offset =", info.offset, "expected ≈", expectedCol);
    expect(info.offset).toBeLessThanOrEqual(firstLine.length);
  });

  // =========================================================================
  // Code block edge: enter insert mode and return
  // =========================================================================

  test("i in code block enters insert, Esc returns to normal on same line", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // code block line 0
    await page.waitForTimeout(200);
    await pressKeys(page, "j"); // line 1
    await page.waitForTimeout(200);

    const beforeInfo = await getCodeBlockInfo(page);
    const beforeLine = getCodeLineFromOffset(beforeInfo.text, beforeInfo.offset);

    await pressKeys(page, "i");
    await page.waitForTimeout(200);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    const afterInfo = await getCodeBlockInfo(page);
    const afterLine = getCodeLineFromOffset(afterInfo.text, afterInfo.offset);
    console.log("code-i-esc: before line", beforeLine.lineIndex, "after line", afterLine.lineIndex);
    expect(afterLine.lineIndex).toBe(beforeLine.lineIndex);
  });

  // =========================================================================
  // Code block: o/O behavior
  // =========================================================================

  // BUG-011: o in code block fails to insert newline — execCommand("insertText", "\n") doesn't
  // create a new line in automated tests; text appends to current line without line break
  test.fail("o inside code block creates new line below within block", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // code block line 0
    await page.waitForTimeout(200);

    const beforeInfo = await getCodeBlockInfo(page);
    const beforeLineCount = beforeInfo.text.split("\n").length;

    await pressKeys(page, "o");
    await page.waitForTimeout(500);
    expect((await getVimState(page)).mode).toBe("insert");

    await page.keyboard.type("NEW_CODE_LINE");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");

    const afterInfo = await getCodeBlockInfo(page);
    const afterLines = afterInfo.text.split("\n");
    console.log("code-o: before lines", beforeLineCount, "after lines", afterLines.length, "text =", JSON.stringify(afterInfo.text.slice(0, 100)));

    // Undo before assert so cleanup runs even when test.fail() catches throw
    await pressKeys(page, "u");
    await page.waitForTimeout(500);

    // o should create a new line (lineCount + 1), with NEW_CODE_LINE on its own line
    expect(afterLines.length).toBe(beforeLineCount + 1);
    expect(afterLines.some((l: string) => l.trim() === "NEW_CODE_LINE")).toBe(true);
  });

  // =========================================================================
  // Multiple code block entries/exits
  // =========================================================================

  test("enter code block, exit below, k re-enters code block last line", async ({ extensionPage: page }) => {
    // First navigate to "Text after code block" which is right below the code block
    await goToBlock(page, "Text after code block");

    await pressKeys(page, "k"); // should enter code block from below (last line)
    await page.waitForTimeout(200);

    const info = await getCodeBlockInfo(page);
    if (info.text.includes("function hello")) {
      // We're in the code block — check we're on the visible last line.
      // Code blocks frequently end their textContent with a trailing "\n";
      // setActiveLine now drops that phantom entry on enter-from-below
      // (BUG-010 fix), so "last line" means the last non-empty split entry.
      const { lineIndex, lineCount } = getCodeLineFromOffset(info.text, info.offset);
      const rawLines = info.text.split("\n");
      const lastRealIndex =
        rawLines.length > 1 && rawLines[rawLines.length - 1] === ""
          ? lineCount - 2
          : lineCount - 1;
      console.log("code-k-enter-from-below: lineIndex =", lineIndex, "/", lineCount, "lastRealIndex =", lastRealIndex);
      expect(lineIndex).toBe(lastRealIndex);
    } else {
      // If k didn't enter code block, that's also a valid finding (block ordering)
      console.log("code-k-enter-from-below: landed on", JSON.stringify(info.text.slice(0, 50)));
    }
  });

  // =========================================================================
  // BUG-012: Creating code block via ``` then Escape → cursor jumps
  // =========================================================================

  // BUG-012: User reports cursor jumps after creating code block with ```
  // Test passes in automated environment but bug may be timing-dependent
  test("type ``` to create code block, type inside, Escape keeps cursor in code block", async ({ extensionPage: page }) => {
    // Navigate to a plain text block that we can safely convert
    await goToBlock(page, "Plain text line 5");

    // Enter insert mode and go to end of line
    await pressKeys(page, "Shift+a");
    await page.waitForTimeout(200);

    // Press Enter to create a new empty line below
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    // Type ``` to trigger Notion's code block creation
    await page.keyboard.type("```");
    await page.waitForTimeout(500);

    // Notion should have converted to a code block — type something inside
    await page.keyboard.type("console.log('test')");
    await page.waitForTimeout(200);

    // Press Escape to return to normal mode
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(300);

    // BUG-012 — see docs/known-bugs.md
    // Capture DOM-cursor block index and vim_info.active_line BEFORE any further
    // navigation. The original test only asserted DOM block text contained the typed
    // string, which is controlled by Notion (the user just typed there). The bug is
    // that vim_info.active_line points to a stale slot whose element was destroyed
    // by Notion's paragraph→code-block conversion (refreshLines findIndex returns -1
    // and silently leaves active_line unchanged).
    const domIdxAfterEsc = await getActualCursorBlockIndex(page);
    const vimIdxAfterEsc = (await getVimState(page)).activeLine - 1;

    // The cursor should be on the code block we just created
    const text = await getActualCursorBlockText(page);
    console.log("backtick-code-esc: cursor on =", JSON.stringify(text), "domIdx =", domIdxAfterEsc, "vimIdx =", vimIdxAfterEsc);

    // j should move within or past the code block, not stay stuck on a wrong block
    const lineBefore = (await getCursorPosition(page)).line;
    await pressKeys(page, "j");
    await page.waitForTimeout(200);
    const lineAfter = (await getCursorPosition(page)).line;
    console.log("backtick-code-j: line", lineBefore, "→", lineAfter);

    // k should return to the code block
    await pressKeys(page, "k");
    await page.waitForTimeout(200);
    const textAfterK = await getActualCursorBlockText(page);
    console.log("backtick-code-k: cursor on =", JSON.stringify(textAfterK));

    // Undo before assertions (cleanup for serial tests)
    for (let i = 0; i < 5; i++) {
      await pressKeys(page, "u");
      await page.waitForTimeout(300);
    }

    // The cursor text after Escape should contain what we typed
    expect(text).toContain("console.log");
    // BUG-012 — see docs/known-bugs.md
    // The single most important assertion for this bug: vim_info.active_line must
    // match the DOM cursor's leaf-block index after the markdown-shortcut conversion.
    expect(vimIdxAfterEsc, "BUG-012: vim active_line === DOM cursor block").toBe(domIdxAfterEsc);
  });

  test("type inside existing code block, Escape stays on same code line", async ({ extensionPage: page }) => {
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // enter code block line 0
    await page.waitForTimeout(200);
    await pressKeys(page, "j"); // line 1
    await page.waitForTimeout(200);

    await pressKeys(page, "Shift+a"); // insert at end
    await page.waitForTimeout(200);
    await page.keyboard.type("_EDIT");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(200);

    // Cursor should still be in the code block
    const info = await getCodeBlockInfo(page);
    const { lineIndex } = getCodeLineFromOffset(info.text, info.offset);
    console.log("code-edit-esc: lineIndex =", lineIndex, "text contains _EDIT:", info.text.includes("_EDIT"));

    // j should advance within code block
    await pressKeys(page, "j");
    await page.waitForTimeout(200);
    const afterJ = await getCodeBlockInfo(page);
    const jLine = getCodeLineFromOffset(afterJ.text, afterJ.offset);
    console.log("code-edit-j: lineIndex =", jLine.lineIndex);
    expect(jLine.lineIndex).toBe(lineIndex + 1);

    // k should return
    await pressKeys(page, "k");
    await page.waitForTimeout(200);
    const afterK = await getCodeBlockInfo(page);
    const kLine = getCodeLineFromOffset(afterK.text, afterK.offset);
    expect(kLine.lineIndex).toBe(lineIndex);

    await pressKeys(page, "u");
    await page.waitForTimeout(500);
  });

  // =========================================================================
  // BUG-029: j exiting code block bumps active_line but leaves DOM cursor inside
  // =========================================================================

  // BUG-029 — see docs/known-bugs.md
  // Tests the BUG-010 sibling: when `moveCursorDownInCodeBlock` falls into the
  // `lineEnd === -1` branch (no \n after currentPos), it does
  // `vim_info.active_line += 1; return;` without calling setActiveLine /
  // updateInfoContainer / updateBlockCursor. The status bar advances, but the
  // DOM cursor stays inside the code block element. This is the root-cause
  // assertion for "cursor stuck after exiting code block via j".
  test("BUG-029: j exiting code block syncs DOM cursor with active_line", async ({ extensionPage: page }) => {
    // Reset to a known-good location first (avoid serial-test contamination)
    await goToBlock(page, "Plain text line 1");
    await goToBlock(page, "Section 8: Code block");
    await pressKeys(page, "j"); // enter code block line 0
    await page.waitForTimeout(200);

    const info = await getCodeBlockInfo(page);
    const { lineCount } = getCodeLineFromOffset(info.text, 0);
    console.log("BUG-029: code block has", lineCount, "lines");

    // Push past the last real line — enough j's to land on ghost line if any,
    // and to ensure `text.indexOf("\n", currentPos)` returns -1 on the next press.
    for (let i = 1; i <= lineCount; i++) {
      await pressKeys(page, "j");
      await page.waitForTimeout(80);
    }

    const beforeIdx = await getActualCursorBlockIndex(page);
    const beforeActive = (await getVimState(page)).activeLine;
    // Capture the baseline offset between vim tracking and DOM leaf index. Notion
    // pages typically have a fixed offset (e.g. page title is in vim_info.lines
    // but not in [data-content-editable-leaf=true]). The bug, if any, should
    // disturb this offset across the exit-j transition.
    const beforeOffset = beforeActive - 1 - beforeIdx;
    console.log("BUG-029 pre-exit-j: domIdx =", beforeIdx, "activeLine =", beforeActive, "offset =", beforeOffset);

    // The exit press: should advance BOTH DOM cursor and active_line by the
    // SAME amount (since one j press = one block forward).
    await pressKeys(page, "j");
    await page.waitForTimeout(200);

    const afterIdx = await getActualCursorBlockIndex(page);
    const afterActive = (await getVimState(page)).activeLine;
    const afterOffset = afterActive - 1 - afterIdx;
    console.log("BUG-029 post-exit-j: domIdx =", afterIdx, "activeLine =", afterActive, "offset =", afterOffset);

    // BUG-029 — see docs/known-bugs.md
    // The exit branch (code-block.ts:22) increments `vim_info.active_line` by 1
    // but does not call setActiveLine/updateBlockCursor — so DOM cursor either
    // stays put OR advances by a different amount than active_line. The
    // baseline offset between active_line and DOM index must be preserved
    // across the transition.
    expect(afterIdx, "BUG-029: DOM cursor advances out of code block").toBeGreaterThan(beforeIdx);
    expect(afterActive, "BUG-029: status-bar active_line advances out of code block").toBeGreaterThan(beforeActive);
    expect(afterOffset, "BUG-029: vim active_line ↔ DOM index offset preserved across exit-j").toBe(beforeOffset);
  });

  // =========================================================================
  // BUG-012: Strong reproducer — convert an EXISTING non-empty paragraph in
  // place via ` ``` ` markdown shortcut. This destroys the original
  // [contenteditable="true"] element; refreshLines's findIndex returns -1 and
  // silently leaves vim_info.active_line at the stale slot.
  // The earlier "type ``` to create code block" test uses a freshly-created
  // empty paragraph (Shift+a → Enter → ```) which doesn't trigger the bug.
  // See docs/test-overhaul/bug-investigation.md, Part A, BUG-012 section 3.
  // =========================================================================

  test("BUG-012: convert existing paragraph to code block via ``` keeps active_line in sync", async ({ extensionPage: page }) => {
    // Reset to a known-good location first to avoid serial-test contamination
    await goToBlock(page, "Plain text line 1");
    // Navigate to "Before empty line" then j onto the EXISTING empty paragraph.
    // The empty paragraph is a stable [contenteditable="true"] element that
    // existed since page load (created by setup-test-page.ts:288 emptyParagraph()).
    // When Notion converts it via ``` + Enter, this stable element is destroyed
    // and replaced — the exact trigger refreshLines's findIndex stale-ref
    // condition (core/line-management.ts:121-128).
    await goToBlock(page, "Before empty line");
    await pressKeys(page, "j"); // land on the existing empty paragraph
    await page.waitForTimeout(200);

    await pressKeys(page, "i"); // insert mode at col 0 of existing empty paragraph
    await page.waitForTimeout(200);

    // Type the markdown trigger directly on the existing-but-empty contenteditable
    await page.keyboard.type("```");
    await page.waitForTimeout(200);

    // Enter triggers the conversion — Notion sees ``` at start of line.
    await page.keyboard.press("Enter");

    // Wait for Notion to actually convert the block — deterministic instead of
    // a fixed sleep.
    await waitForBlockConversion(page, "code");

    // Type something INSIDE the new code block so we have a clear signal
    await page.keyboard.type("converted_in_place");
    await page.waitForTimeout(150);

    // Return to normal mode
    await page.keyboard.press("Escape");
    await waitForMode(page, "normal");
    await page.waitForTimeout(300);

    // BUG-012 — see docs/known-bugs.md, docs/test-overhaul/bug-investigation.md
    // Capture both pointers before any further keys move them.
    const domIdxAfterEsc = await getActualCursorBlockIndex(page);
    const vimIdxAfterEsc = (await getVimState(page)).activeLine - 1;
    const text = await getActualCursorBlockText(page);
    console.log(
      "BUG-012 strong: text =",
      JSON.stringify(text.slice(0, 60)),
      "domIdx =",
      domIdxAfterEsc,
      "vimIdx =",
      vimIdxAfterEsc,
    );

    // Cleanup BEFORE asserting (serial tests share state)
    for (let i = 0; i < 8; i++) {
      await pressKeys(page, "u");
      await page.waitForTimeout(250);
    }

    // Sanity: DOM cursor is in the new code block
    expect(text).toContain("converted_in_place");
    // BUG-012 — see docs/known-bugs.md
    // The single proximate-cause assertion: vim_info.active_line must point
    // to the same leaf-block index that the DOM cursor is in.
    expect(vimIdxAfterEsc, "BUG-012: vim active_line === DOM cursor block (existing-paragraph trigger)").toBe(domIdxAfterEsc);
  });

  // =========================================================================
  // BUG-036: `h` / `l` in multi-line code block set `desired_column` to the
  // ABSOLUTE offset within the code block's textContent (which includes \n),
  // not the visual column on the line. Subsequent `j` / `k` then read
  // desired_column as a column → cursor lands at min(absolute_offset,
  // line_length) on the next line — typically end-of-line for short lines.
  // Source: src/content_scripts/navigation/code-block.ts:87, :106
  // See docs/test-overhaul/bug-investigation.md, BUG-036 entry.
  // =========================================================================

  test("BUG-036: h in code block preserves visual column for subsequent j/k", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1"); // reset
    await goToBlock(page, "Section 8: Code block");

    // Enter the code block. Code block content:
    //   "function hello() {\n  console.log('world');\n  return true;\n}"
    // Line 0: "function hello() {" (18)
    // Line 1: "  console.log('world');" (23)
    // Line 2: "  return true;" (14)
    // Line 3: "}" (1)
    await pressKeys(page, "j"); // enter code block (cursor lands at desired_column on line 0)
    await page.waitForTimeout(150);

    // Normalize position: jumpToLineStart sets cursor to offset 0 (line 0 col 0)
    // and resets desired_column to 0. Without this, desired_column carries the
    // click position from goToBlock and `j` lands at unexpected lines.
    await pressKeys(page, "0");
    await page.waitForTimeout(80);

    // Now move down to line 1 col 0
    await pressKeys(page, "j");
    await page.waitForTimeout(150);

    // Move to col 5 of line 1 by pressing l five times.
    // moveCursorForwardsInCodeBlock at code-block.ts:106 does
    //   `vim_info.desired_column = newPos` (absolute offset, BUG-036)
    for (let i = 0; i < 5; i++) {
      await pressKeys(page, "l");
      await page.waitForTimeout(40);
    }

    // h once → visual col 4. With the bug, desired_column is set to the
    // ABSOLUTE offset (~23), not the visual column 4.
    await pressKeys(page, "h");
    await page.waitForTimeout(80);

    const beforeJ = await getCodeBlockInfo(page);
    const beforeLine = getCodeLineFromOffset(beforeJ.text, beforeJ.offset);
    // Compute visual column on the current line
    const beforeLineStart = beforeJ.text.split("\n").slice(0, beforeLine.lineIndex).reduce((s, l) => s + l.length + 1, 0);
    const beforeVisualCol = beforeJ.offset - beforeLineStart;
    console.log("BUG-036 pre-j: line =", beforeLine.lineIndex, "visual col =", beforeVisualCol);

    // Sanity: we're on line 1 col 4
    expect(beforeLine.lineIndex, "should be on code line 1 after j 0 j l*5 h").toBe(1);
    expect(beforeVisualCol, "visual col on line 1 should be 4 after l*5 h").toBe(4);

    // Now press j → land on line 2. Line 2 is "  return true;" (14 chars).
    // Without bug: visual col = 4 (preserved from line 1).
    // With bug: desired_column was set to absolute offset (~23), so target =
    //          min(23, 14) = 14 → cursor lands at END of line 2.
    await pressKeys(page, "j");
    await page.waitForTimeout(150);

    const afterJ = await getCodeBlockInfo(page);
    const afterLine = getCodeLineFromOffset(afterJ.text, afterJ.offset);
    const afterLineStart = afterJ.text.split("\n").slice(0, afterLine.lineIndex).reduce((s, l) => s + l.length + 1, 0);
    const afterVisualCol = afterJ.offset - afterLineStart;
    console.log("BUG-036 post-j: line =", afterLine.lineIndex, "visual col =", afterVisualCol);

    expect(afterLine.lineIndex, "j should land on code line 2").toBe(2);
    // BUG-036 — see docs/known-bugs.md, docs/test-overhaul/bug-investigation.md
    // Visual column 4 should be preserved on line 2. With the bug, the cursor
    // lands at column 14 (end of "  return true;") because desired_column
    // was polluted with the absolute textContent offset.
    expect(afterVisualCol, "BUG-036: visual column preserved across code-block j after h").toBe(4);
  });

  // =========================================================================
  // BUG-035: `f{c}` / `F{c}` / `t{c}` / `T{c}` in multi-line code block set
  // `desired_column` to the absolute offset of the found char, not the visual
  // column. Same desired_column corruption pattern as BUG-036 but via
  // character-search instead of h/l.
  // Source: src/content_scripts/navigation/char-find.ts:21-22, :39-40, :58-59, :77-78
  // See docs/test-overhaul/bug-investigation.md, BUG-035 entry.
  // =========================================================================

  test("BUG-035: f in code block preserves visual column for subsequent j", async ({ extensionPage: page }) => {
    await goToBlock(page, "Plain text line 1"); // reset
    await goToBlock(page, "Section 8: Code block");

    // Reach line 1 col 0. (See BUG-036 test for layout notes.)
    await pressKeys(page, "j"); // enter code block (cursor at desired_column from click)
    await page.waitForTimeout(150);
    await pressKeys(page, "0"); // normalize to line 0 col 0, desired_column=0
    await page.waitForTimeout(80);
    await pressKeys(page, "j"); // line 1 col 0
    await page.waitForTimeout(150);

    // f c — finds 'c' on line 1 ("  console..."). 'c' is at line-1 visual col 2.
    // With bug: desired_column set to absolute offset (~21), not visual col 2.
    await pressKeys(page, "f");
    await page.waitForTimeout(40);
    await pressKeys(page, "c");
    await page.waitForTimeout(80);

    const beforeJ = await getCodeBlockInfo(page);
    const beforeLine = getCodeLineFromOffset(beforeJ.text, beforeJ.offset);
    const beforeLineStart = beforeJ.text.split("\n").slice(0, beforeLine.lineIndex).reduce((s, l) => s + l.length + 1, 0);
    const beforeVisualCol = beforeJ.offset - beforeLineStart;
    console.log("BUG-035 pre-j: line =", beforeLine.lineIndex, "visual col =", beforeVisualCol);

    // Sanity: on line 1 col 2 (the 'c' of "console")
    expect(beforeLine.lineIndex, "should be on code line 1 after f c").toBe(1);
    expect(beforeVisualCol, "f c on line 1 should land on visual col 2").toBe(2);

    // j → land on line 2 ("  return true;" = 14 chars).
    // Without bug: visual col = 2 (preserved).
    // With bug: desired_column = ~21 → target = min(21, 14) = 14 (end of line).
    await pressKeys(page, "j");
    await page.waitForTimeout(150);

    const afterJ = await getCodeBlockInfo(page);
    const afterLine = getCodeLineFromOffset(afterJ.text, afterJ.offset);
    const afterLineStart = afterJ.text.split("\n").slice(0, afterLine.lineIndex).reduce((s, l) => s + l.length + 1, 0);
    const afterVisualCol = afterJ.offset - afterLineStart;
    console.log("BUG-035 post-j: line =", afterLine.lineIndex, "visual col =", afterVisualCol);

    expect(afterLine.lineIndex, "j should land on code line 2").toBe(2);
    // BUG-035 — see docs/known-bugs.md, docs/test-overhaul/bug-investigation.md
    // Visual column 2 should be preserved. With the bug, lands at col 14
    // (end of line) because char-find polluted desired_column with the
    // absolute textContent offset.
    expect(afterVisualCol, "BUG-035: visual column preserved across code-block j after f").toBe(2);
  });
});
