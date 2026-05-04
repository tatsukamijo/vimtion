# Known Bugs

Bugs detected during E2E test development. Kept separate from test refinement work.

## BUG-001: Rapid j/k round-trip causes DOM cursor desync

- **Detected**: 2026-04-14
- **Test**: `stress-fast-user.spec.ts` → "rapid 20j then 20k returns to start"
- **Reproduction**: From "Plain text line 1" (block index 2), press j 20 times with no delay, then k 20 times with no delay. DOM cursor ends up on block index 1 instead of 2.
- **Expected**: Cursor returns to original block (index 2)
- **Actual**: Cursor is on block index 1 (one block above)
- **Context**: Occurs after undo operations earlier in the session (no page reload). The rapid navigation without any waitForTimeout between presses appears to cause vim_info.active_line and the actual DOM selection to desync.
- **Severity**: Medium — affects fast Vim users who navigate quickly with held-down j/k

## BUG-002: k from code block returns to wrong block after I→type→Esc on heading above

- **Status**: **RESOLVED — test-infrastructure false-positive, not a source bug.**
- **Detected**: 2026-04-14
- **Resolved**: 2026-05-03 (commit `0cee452`)
- **Test**: `stress-fast-user.spec.ts` → "edit text before code block → j into code → k back"
- **Original symptom**: After `I→type→Esc→j→k` on a heading above a code block, the test asserted DOM cursor landed on block 37 but observed block 38.
- **Root cause**: Test queried `[data-content-editable-leaf="true"]` (93 elements) for its reference index while vim_info.lines is built from `[contenteditable="true"]` (94 elements — includes the page-title wrapper at index 0). The two index frames differed by exactly one. Vim's tracking was correct throughout; the test was reading the wrong frame.
- **Fix**: Test now queries the same `[contenteditable="true"]` set as vim, with a wrapper-exclusion filter (`!editables.some((other) => other !== l && l.contains(other))`) to skip the page-title wrapper's substring false-match. (Note: BUG-043 ultimately took the index-normalization route rather than wrapper-out-of-lines, so this test's wrapper-exclusion remains load-bearing — the wrapper still sits at `lines[0]` for keydown-listener stability.)
- **Severity**: Was High — actual user impact: none, since real-world `I→type→Esc→j→k` behavior was always correct.

## BUG-003: o→type→Esc→k returns to wrong block (off by 1)

- **Status**: **RESOLVED** — fixed by `ff013a9` (selection-leaf-as-truth recovery in `createRefreshLines` when a fresh leaf was inserted during the edit).
- **Detected**: 2026-04-14
- **Resolved**: 2026-05-03
- **Test**: `stress-fast-user.spec.ts` → "o→type→Esc→k returns to original block"; `insert-open-line.spec.ts` → 3 tests (bullet, nested todo, code block boundary)
- **Reproduction**: Navigate to "Plain text line 3" (block index 4). Press o, type "new line via o", Escape. Then k. DOM cursor ends up on block 3 instead of block 4.
- **Root cause**: `createRefreshLines` previously fell back to element-identity (and then `block_id`) recovery only. When `o` inserted a fresh leaf, the previously-active element was still in DOM (just at a new index), so identity recovery succeeded — but with the WRONG index relative to the user's intended position.
- **Fix**: When the post-rebuild DOM Selection's leaf was NOT in the previous lines snapshot, prefer the selection's leaf as the new `active_line` source. Conservative predicate so rapid-navigation identity recovery (BUG-001 path) is not disturbed.
- **Additional regression coverage**: `insert-open-line.spec.ts:370` (bullet) and `:393` (nested todo) markers were preserved through subsequent sprints and finally flipped to strict-pass during the BUG-040 sprint (commit `c0b111c` broadened the same selection-leaf recovery path used here, restoring stability for these BUG-003 fingerprints).
- **Severity**: Was High — o is a frequently used Vim command.

## BUG-004: h at column 0 desyncs DOM selection

- **Detected**: 2026-04-14
- **Test**: `navigation.spec.ts` → "h at column 0 stays at column 0"
- **Reproduction**: Navigate to any block, press `0` to go to column 0, then press `h`. Cursor column jumps to a non-zero value (e.g., 28) instead of staying at 0. Same issue with `b` at column 0.
- **Expected**: h at column 0 is a no-op; cursor stays at column 0
- **Actual**: DOM selection moves to an incorrect position
- **Severity**: Medium — boundary condition bug, affects navigation at line start

## BUG-005: $ moves cursor to line length instead of length-1

- **Detected**: 2026-04-14
- **Test**: `navigation.spec.ts` → "$ moves to last char (len-1)"
- **Root cause**: `jumpToLineEnd()` in `src/content_scripts/navigation/basic.ts:59` calls `setCursorPosition(currentElement, lineLength)` — should be `lineLength - 1` for Vim compatibility where `$` lands ON the last character, not past it.
- **Expected**: `$` on "The quick brown fox..." puts cursor at col 42 (length-1)
- **Actual**: Cursor at col 43 (length)
- **Severity**: Medium — off-by-one affects all end-of-line operations

## BUG-006: F and T (backward character search) do not move cursor

- **Status**: **RESOLVED — test-infrastructure false-positive, not a source bug.**
- **Detected**: 2026-04-14
- **Resolved**: 2026-05-03 (F: `e4aaf09`, T: `b8d5c0d`)
- **Test**: `navigation.spec.ts` → "F{c} finds character backward", "T{c} stops one after target char backward"
- **Original symptom**: Cursor did not move on `Shift+f` followed by `a`.
- **Root cause**: Playwright's `keyboard.down("Shift") / press("f") / up("Shift")` form did not produce `e.key === "F"` in Notion's contenteditable — the keydown delivered `e.key === "f"` (lowercase). Vimtion's normal-mode reducer correctly matched `case "f"` (forward find), set `pending_operator = "f"`, and the next char ran `findCharForward` instead of `findCharBackward`. The source paths for F/T were always correct.
- **Fix**: Switched the F-test to `pressKeys(page, "Shift+F")`, which yields `e.key === "F"`. T-test was symmetrically updated and tester verified 4/4 isolated strict runs (commit `b8d5c0d`).
- **Severity**: Was Medium — actual user impact: none, since real keyboards produce `e.key === "F"` natively.

## BUG-007: { and } (paragraph motions) do not move cursor

- **Detected**: 2026-04-14
- **Test**: `navigation.spec.ts` → "} moves forward past current block group", "{ moves backward past current block group"
- **Reproduction**: Press `}` in normal mode. Cursor line does not change.
- **Expected**: `}` moves forward to the next blank line / paragraph boundary
- **Actual**: No cursor movement
- **Severity**: Medium — paragraph navigation is a fundamental Vim motion

## BUG-008: I and A (Shift+i / Shift+a) insert at wrong cursor position (automated test only)

- **Detected**: 2026-04-14
- **Test**: `navigation.spec.ts` → "I inserts text at beginning of line", "A inserts text at end of line"
- **Reproduction (automated)**: Navigate to a text block, press `0` then `w` twice (col=10), then `Shift+i`. Type "ZZZ". Text appears at col 10 ("The quick ZZZbrown...") instead of at the beginning ("ZZZThe quick...").
- **Manual test**: User reports I and A work correctly in headed-mode manual testing.
- **Root cause analysis**: Extensive investigation revealed:
  1. `insertAtLineStart()` calls `jumpToLineStart()` → `setCursorPosition(element, 0)` which runs in the **content script's isolated world**
  2. The `0` key also calls `jumpToLineStart()` and **works correctly** (cursor moves to col 0)
  3. The difference: after `I`, mode switches to "insert" which changes body CSS classes. After `0`, mode stays "normal"
  4. Tested reordering (mode first, cursor second) — still fails
  5. Tested `setTimeout(50ms)` delay — still fails
  6. Tested dispatching Home key instead — still fails (Notion ignores `dispatchEvent` keyboard events)
  7. **Key finding**: Setting selection via `page.evaluate()` (main world) DOES work and correctly moves cursor to col 0 with text inserting at the beginning
  8. **Conclusion**: After mode switches to "insert", Notion's internal cursor tracking overrides Selection API changes from the content script's isolated world. Changes from the page's main world are respected.
- **Potential fix approaches**: (1) Use `window.postMessage` to relay cursor position to a main-world script that sets the selection. (2) Inject a `<script>` tag that exposes a cursor-setting function in the main world.
- **Expected**: `I` moves cursor to column 0 before entering insert mode; `A` moves cursor past last character
- **Actual (automated)**: Both `I` and `A` enter insert mode at the current cursor position without moving
- **Severity**: Medium — works in manual use but fails in automated tests; may indicate Notion's Selection API handling differs between content script and main world contexts
- **Affects**: Both plain text and block types (headings, bullets, etc.)

## BUG-009: O (Shift+o) creates line below instead of above (automated test only)

- **Detected**: 2026-04-14
- **Test**: `navigation.spec.ts` → "O opens new line above and enters insert", "O on numbered list creates line above"
- **Reproduction**: In automated (headless Playwright) test: navigate to a block, press `Shift+o`, type text. The new line appears below the current block instead of above it.
- **Manual test**: User reports O works correctly in headed-mode manual testing (line correctly created above).
- **Root cause analysis**: `openLineAbove()` in `vim.ts:273` calls `jumpToLineStart()` then dispatches an Enter `KeyboardEvent` at position 0. The assumption is that Enter at pos 0 pushes text down and creates an empty line above. Debug investigation shows that in headless Playwright, Notion creates the empty block **below** the original text instead. The subsequent ArrowUp dispatch doesn't fix this because the cursor is already in the (wrongly positioned) new block below.
- **Possible causes**: (1) `dispatchEvent(new KeyboardEvent(...))` may be handled differently from real user keypresses by Notion (Notion may use `InputEvent`/`beforeinput` rather than `keydown` for Enter handling). (2) Headless vs headed browser rendering differences. (3) Timing: `jumpToLineStart()` sets DOM selection synchronously but Notion may read cursor position asynchronously.
- **Expected**: `O` opens a new line above the current line and enters insert mode
- **Actual (headless)**: New line is created below (same behavior as `o`)
- **Severity**: Medium — works in manual use but fails in automated tests; may indicate fragile event dispatch approach

## BUG-010: j on last line of code block lands on ghost line, gets stuck

- **Detected**: 2026-04-14
- **Reproduction**: In a 2-line code block, navigate to line 2, press `j`. Cursor moves to a non-editable "ghost" line 3 (past the actual last line). Pressing `i` from the ghost line returns to line 2. Pressing `j` again from the ghost line does NOT exit the code block — cursor is stuck.
- **Root cause analysis**: Two related issues in `src/content_scripts/navigation/code-block.ts`:
  1. **Ghost line**: If the code block's `textContent` has a trailing `\n` (e.g., `"line1\nline2\n"`), `moveCursorDownInCodeBlock()` at line 19 finds the trailing `\n` via `text.indexOf("\n", currentPos)` and moves the cursor past it to an empty ghost line. The `lineEnd === -1` exit check on line 20 never triggers because the trailing `\n` is found.
  2. **Stuck on exit**: When `moveCursorDownInCodeBlock()` finally detects the last line (lineEnd === -1) at lines 21-23, it only does `vim_info.active_line += 1; return;`. Back in `vim.ts:2895-2896`, the `return true;` is hit immediately — `setActiveLine()` and `updateInfoContainer()` are **never called**. The DOM cursor stays inside the code block while `active_line` points to the next block. The same issue exists in `moveCursorUpInCodeBlock()` at lines 55-57.
- **Expected**: `j` on last code block line exits to the block below; `k` on first code block line exits to the block above
- **Actual**: `j` lands on ghost line (trailing `\n`), then gets stuck because exit path doesn't call `setActiveLine`/`updateInfoContainer`
- **Test findings**: `code-block-nav.spec.ts` confirms: (1) j on last real line stays in code block (text still shows code content), (2) from ghost line, j DOES exit but skips "Text after code block" and lands on wrong block, (3) k from first code block line also fails to exit (same `moveCursorUpInCodeBlock` pattern), (4) i from ghost line works (enters insert mode)
- **Severity**: High — code block navigation is broken at boundaries, users get stuck

## BUG-011: o inside code block fails to insert newline (automated test)

- **Detected**: 2026-04-15
- **Test**: `code-block-nav.spec.ts` → "o inside code block creates new line below within block"
- **Reproduction**: Navigate into a code block, press `o`. Type text. The text appends to the end of the current line without a line break.
- **Root cause**: `openLineBelowInCodeBlock()` in `src/content_scripts/navigation/code-block.ts:110` uses `document.execCommand("insertText", false, "\n")` to insert a newline. In automated (Playwright) tests, the `\n` insertion doesn't create a new line — text is appended inline. Example: `"function hello() {NEW_CODE_LINE\n..."` instead of `"function hello() {\nNEW_CODE_LINE\n..."`.
- **Expected**: `o` creates a new line below current code line within the code block
- **Actual**: Text appends to current line without newline
- **Severity**: Medium — may be automated-test-only (needs manual verification); `execCommand` is deprecated API

## BUG-012: Escape from code block created via ``` snaps cursor to wrong block

- **Detected**: 2026-04-15
- **Reproduction**: On a plain text block, enter insert mode, type ` ``` ` + Enter. Notion converts the paragraph to a code block. Type something inside the code block. Press Escape to return to normal mode. Cursor (vim_info.active_line) points to the wrong block — typically the block that was at the old index before the paragraph→code block conversion.
- **Root cause**: When Notion converts a paragraph to a code block, the original `[contenteditable="true"]` element is destroyed and replaced. The `MutationObserver` fires `refreshLines()` which rebuilds `vim_info.lines`, but `refreshLines` tries to find the old `currentActiveElement` by reference equality (`findIndex(line => line.element === currentActiveElement)`). Since the old element was removed from DOM, `findIndex` returns `-1` and `active_line` is NOT updated — it keeps the stale index.
  - Location: `src/content_scripts/core/line-management.ts:120-128` — the `if (newIndex !== -1)` guard silently leaves `active_line` at the old value when the element is gone.
  - The `handleClick` listener only fires in normal mode (line 428 of vim.ts), so clicking inside the code block during insert mode doesn't update `active_line` either.
- **Expected**: After Escape, `active_line` should point to the newly created code block element
- **Actual**: `active_line` points to the block that now occupies the old index (typically the block before the code block)
- **Test result**: Automated test (`code-block-nav.spec.ts`) passes — cursor correctly stays on code block after Escape, j/k works. Bug may be timing-dependent or triggered by specific DOM mutation patterns not captured in test.
- **Severity**: High — affects any user who creates code blocks inline; j/k navigation after Escape goes to the wrong line

## BUG-013: Escape after creating heading via ## jumps cursor to wrong block

- **Detected**: 2026-04-15
- **Reproduction**: In insert mode on an empty line, type `## hogehoge` then Enter. Notion converts the line to an H2 heading. Press Escape — cursor jumps above the heading instead of staying on the newly created line below.
- **Root cause**: Same as BUG-012. When Notion converts a paragraph to a heading (or any block type change triggered by markdown shortcuts like `##`, `-`, `1.`, `>`, etc.), the original paragraph `[contenteditable="true"]` element is destroyed. `refreshLines()` in `line-management.ts:120-128` tries to find the old element by reference but fails (`newIndex === -1`), leaving `active_line` at the stale index.
- **Affects**: All Notion markdown shortcuts that convert block types during insert mode: `##` (heading), `###` (h3), `-` (bullet), `1.` (numbered), `>` (quote), `[]` (todo), ` ``` ` (code block)
- **Expected**: After Escape, cursor stays on the block where the user was editing
- **Actual**: `active_line` points to a wrong block (the block now at the old index)
- **Test result**: Tests now check `active_line` vs DOM cursor index — **confirmed off-by-one** for all four variants: `## + Enter`, `- + Enter`, `> + Enter`, and `## no-enter` (intermittent). All marked `test.fail()`. Bug triggers when Notion converts block type via markdown shortcuts, causing `refreshLines` to lose track of the active element.
- **Severity**: High — every Notion power user creates headings/lists via markdown shortcuts

### Verification (2026-05-03 — confirmed real)

`test/e2e/scenario-markdown-chaos.spec.ts` (Scenario 6) catches this on the
literal `Escape` after `## hogehoge`+Enter once the test harness's main-world
bridge (commit ec8cda4) is active. Diagnostic:

```
vim_info.active_line: 7 → "Plain text line 5"
DOM cursor block:     9 → "" (new empty paragraph after the heading)
Off-by-2: heading + new paragraph
```

Earlier "all conversions passed" report from this spec was a false negative —
the cursor invariant was silently no-opping because `window.vim_info` lives
in the content script's isolated world and is inaccessible from Playwright's
main-world `page.evaluate`. The bridge resolves that; the bug is real today.

Root cause confirmed: `refreshLines()` at `line-management.ts:120-128`'s
`findIndex === -1` silently leaves `active_line` at its stale value when
Notion destroys the original paragraph element during markdown conversion.

The conversion-chain test now serves as a **regression check** — any future
re-introduction of the bug surfaces as a labeled `[CursorInvariant]`
violation naming the exact shortcut that broke (`## conversion + Esc`,
`- conversion + Esc`, etc.).

## BUG-014: `pending_operator = "g"` leaks across V→Esc into normal mode

- **Detected**: 2026-05-03
- **Status**: **RESOLVED.** Fix landed earlier (visualLineReducer `case "Escape"` now clears `pending_operator`) and the visualReducer Escape path got the same reset for symmetry. Test `visual-line.spec.ts` → "BUG-014: g pending state leaks across V→Esc into normal mode" passes on `main`.
- **Source**: Latent bug found by code reading (see `docs/test-overhaul/bug-investigation.md`).
- **Test**: `visual-line.spec.ts` → "BUG-014: g pending state leaks across V→Esc into normal mode"
- **Reproduction (pre-fix)**: From any block where `active_line > 1`, press `V` (visual-line), `g` (sets `pending_operator = "g"`), `Escape` (returns to normal but does NOT clear `pending_operator`), then `g`. The final `g` was interpreted as the second `g` of `gg` and jumped to the first line.
- **Root cause**: `visualLineReducer` `case "g"` set `pending_operator = "g"` to wait for a second `g`. The `case "Escape"` did not clear `pending_operator` before returning to normal. Same leak affected any motion key in visual-line mode that didn't reset the pending state.
- **Fix**: `visualLineReducer` `case "Escape"` now sets `pending_operator = null` before transitioning to normal. The same line was added to the visualReducer Escape path so half-typed `g` (toward `gg`) and any operator carried in from normal mode (`d` / `c` / `y`) cannot leak across the visual→normal boundary.
- **Severity**: Was Medium — surfaced only when user used `g` in visual-line mode then aborted, but was silently incorrect.

## BUG-035: `f` / `F` / `t` / `T` in multi-line code block set `desired_column` to absolute textContent offset

- **Detected**: 2026-05-03
- **Status**: **RESOLVED.** All four character-find functions in `src/content_scripts/navigation/char-find.ts` now compute `desired_column` via a `visualColumn(text, offset)` helper that measures the column from the most recent `\n`, so the value is the per-line column rather than the absolute textContent offset. `code-block-nav.spec.ts:755` (BUG-035) passes.
- **Source**: Latent bug found by code reading (see `docs/test-overhaul/bug-investigation.md`).
- **Test**: `code-block-nav.spec.ts` → "BUG-035: f in code block preserves visual column for subsequent j"
- **Reproduction (pre-fix)**: In a multi-line code block, position cursor on a non-first line, press `f{char}` (or `F` / `t` / `T`) to find a character on that line. Then press `j` to move down. The cursor landed at `min(absolute_offset, next_line_length)` instead of the visual column from the search target — typically end-of-line on shorter lines.
- **Root cause**: All four character-find functions set `vim_info.desired_column = foundIndex` (or `foundIndex - 1` / `+ 1`) where `foundIndex` is the position from `text.indexOf(char, currentPos)` against the FULL code-block textContent (which includes `\n`). For non-code-blocks this was fine (single-line text), but for code blocks the absolute offset is not a visual column. Subsequent `j` / `k` then misused this number as the target column on the next line.
- **Severity**: Was High — corrupted column-memory after any character-search inside a code block.

## BUG-036: `h` / `l` in multi-line code block set `desired_column` to absolute textContent offset

- **Detected**: 2026-05-03
- **Status**: **RESOLVED.** `moveCursorBackwardsInCodeBlock` and `moveCursorForwardsInCodeBlock` in `src/content_scripts/navigation/code-block.ts` now compute `desired_column` via `codeBlockVisualColumn(text, newPos)`, which measures the column from the start of the current logical line. `code-block-nav.spec.ts:678` (BUG-036) passes.
- **Source**: Latent bug found by code reading (see `docs/test-overhaul/bug-investigation.md`).
- **Test**: `code-block-nav.spec.ts` → "BUG-036: h in code block preserves visual column for subsequent j/k"
- **Reproduction (pre-fix)**: In a multi-line code block, position cursor on a non-first line at column N (e.g. `j j l l l l l` → line 2 col 5). Press `h` (or `l`) to move horizontally. Press `j` — cursor landed at end of next line instead of visual column N±1.
- **Root cause**: Both code-block horizontal-move functions did `vim_info.desired_column = newPos` where `newPos = currentPos ± 1` — an absolute offset within the code-block textContent (containing `\n`). The exit-block `j` / `k` paths and `moveCursorDownInCodeBlock` then used `desired_column` as a per-line column, mis-clamping to `min(absolute_offset, line_length)`.
- **Severity**: Was High — every `h` / `l` keystroke inside a code block corrupted subsequent `j` / `k` column landing.

## BUG-029: `j` exiting code block bumps `active_line` but leaves DOM cursor inside

- **Detected**: 2026-05-03
- **Source**: Latent bug found by code reading (see `docs/test-overhaul/bug-investigation.md`). Sibling of BUG-010.
- **Test**: `code-block-nav.spec.ts` → "BUG-029: j exiting code block syncs DOM cursor with active_line"
- **Reproduction**: Navigate into a code block, press `j` to reach the last real line (and any ghost line). Press `j` once more to exit. The status bar shows the next block's line number, but the DOM cursor stays inside the code block element.
- **Root cause**: `src/content_scripts/navigation/code-block.ts:20-23` and `:54-58`. The exit branches (`if (lineEnd === -1)` for `j`, `if (lineStart === -1)` for `k`) do `vim_info.active_line = vim_info.active_line ± 1; return;` without calling `setActiveLine()`, `updateInfoContainer()`, or any cursor-positioning helper. Status bar / `active_line` advance, but the DOM `<selection>` is never moved out of the code block's contenteditable.
- **Expected**: `j` from the last real line of a code block (or its ghost line) moves the DOM cursor to the next block.
- **Actual**: DOM cursor remains inside the code block's contenteditable; subsequent operations target the wrong block.
- **Severity**: High — every code-block exit hits this path; explains "I pressed j but my cursor didn't move" reports.


## BUG-040: Post-undo cursor desync after o / O / A insert (broader than code blocks)

- **Status**: **RESOLVED** — 3 of 4 fingerprints fixed by `c0b111c` (2026-05-03), final code-block fingerprint A fixed 2026-05-04 by an undo-scoped tier-0 in `core/line-management.ts:createRefreshLines` plus a non-mutating neighbour-rect measurement in `cursor/block-cursor.ts`.
- **Detected**: 2026-05-03
- **Resolved (partial)**: 2026-05-03
- **Resolved (full)**: 2026-05-04
- **Source**: Surfaced during BUG-011 fix work (see commit `6614210`); scope broadened during e07b3e5 verification.
- **Reproduction patterns** (all fingerprint-identical):
  - Inside a code block: `o` → type → `u`. DOM cursor lands on the heading above; `vim_info.active_line` still points at the code-block leaf. **Fixed** (2026-05-04, `code-block-nav.spec.ts:354`).
  - On a numbered/regular/nested bullet item: `A` → type → `Esc` → `j` → `u`. `vim_info.active_line` advances; DOM cursor stays one block back. **Fixed** (`insert-open-line.spec.ts:586`).
  - On any insert variant: `o` → `Esc` (immediately, empty new line) → `u`. `vim_info.lines.length` (95) outpaces actual DOM editable count (94) — refreshLines missed the undo-driven leaf removal. **Fixed** (`insert-open-line.spec.ts:702`).
  - On a nested bullet: `O` → `Esc` immediately → `u`. Same fingerprint. **Fixed** (`insert-open-line.spec.ts:731`).
- **Root cause**: `document.execCommand("undo")` rewinds Notion's DOM mutations (including leaf insertions/restorations), but the previous refreshLines/active_line reconciliation didn't follow undo-driven cursor jumps to pre-existing leaves — `vim_info` kept the post-insert state while DOM rolled back. For the code-block fingerprint A specifically, Notion's undo additionally relocates the DOM cursor up to the heading above the code block, ~200ms after the keypress; the strict cursor-invariant check fires at ~50ms post-keypress, catching the transient mismatch window.
- **Fix**:
  - `c0b111c` (2026-05-03): broadens tier-1 (selection-leaf) recovery in `core/line-management.ts:createRefreshLines` to catch undo cursor-jumps to pre-existing leaves; adds a characterData MutationObserver + `selectionchange` listener for the no-mutation cases. Closes 3 of 4 fingerprints.
  - 2026-05-04: adds a tier-0 code-block anchor in `createRefreshLines`, scoped to the post-undo settle window opened by `undo()` in `vim.ts` via `__vimtionUndoSettleUntil` (500ms). When previousActiveElement was inside a code block AND the post-mutation DOM selection has wandered outside any code block, restore active_line to the code-block leaf and re-anchor the DOM cursor inside it. Scoping to the undo window keeps click-driven navigation OUT of a code block from being fought. Pairs with a non-mutating neighbour-rect cursor measurement in `cursor/block-cursor.ts` that replaces the zws round-trip on interior code-block carets — the zws path used to cascade through Notion's PrismJS tokenizer and form an infinite loop the moment tier-0 forced the caret onto a code-block leaf.
- **Verified pre-existing**: Reproduced on `0677b34` (parent of A/o `setCursorPastLineEnd` fix `2e5ee72`), so this was NOT a regression from any 2026-05-03 sprint commit.
- **Severity**: Was Medium-High — broader than initially scoped; affects A/o/O across most block types after undo. All four fingerprints now resolved.

## BUG-041: ``` markdown shortcut → code block conversion leaves cursor desynced

- **Detected**: 2026-05-03
- **Source**: Residual from BUG-012 territory; surfaced as 2-3 still-failing tests in code-block-nav after the BUG-001/010/011/029 batch.
- **Reproduction**: In an empty paragraph in insert mode, type ``` then Enter (or any code-block trigger). Notion converts the block to a code block. After Escape, `vim_info.active_line` and DOM cursor are misaligned similar to BUG-012/013 but specifically for the code-block conversion case.
- **Root cause**: Likely the same MutationObserver-driven leaf swap as BUG-012/013, but the code-block leaf's structure (single contenteditable wrapping `\n`-separated lines) interacts with the block_id recovery in `core/line-management.ts:createRefreshLines` differently than regular paragraph swaps.
- **Severity**: Medium — happens once per code-block creation via shortcut.

## BUG-042: o on nested bullet/todo child creates wrong sibling

- **Status**: **RESOLVED** — fixed by `2e5ee72` (added `setCursorPastLineEnd` helper for `A` and `o`; `$` keeps the Vim len-1 semantics).
- **Detected**: 2026-05-03 (tester smoke-set after BUG-001/010/011/029 batch)
- **Resolved**: 2026-05-03
- **Test**: `insert-open-line.spec.ts:80` (nested bullet child), `:104` (last nested bullet child), `:156` (nested todo child) — all three fail consistently
- **Root cause**: Earlier commit `f261a89` correctly moved `$` to land at len-1, but `A` and `o` shared the same `jumpToLineEnd` helper. The synthetic Enter from `o` then split the leaf at len-1 ("Nested bullet child 1" len 21 split at 20) instead of appending below. Plain-bullet tests asserted only on the new sibling's content so the silent split went unnoticed; nested bullet/todo children surfaced it because their tests checked parent-line integrity.
- **Fix**: New `setCursorPastLineEnd` helper used by `A` and `o` only; `$` still uses `jumpToLineEnd`. `O`/`I` and code-block o/O paths untouched.
- **Severity**: Was Medium — only nested bullet/todo, but those are common Notion patterns.

## BUG-043: gg / k-at-line-1 land on page-title role=group, not h1 leaf

- **Detected**: 2026-05-03 (tester smoke-set after BUG-001/010/011/029 batch)
- **Test**: `navigation.spec.ts:75` (`gg moves to line 0`), `:96` (`k at first line stays at 0`)
- **Reproduction**: Press `gg` (or `k` repeatedly while on line 1).
- **Expected**: vim_info.active_line = 0 with DOM cursor on the page-title h1 leaf.
- **Actual**: vim_info.active_line lands on the page-title `<div role="group">` (block 0) while DOM cursor goes to the h1 leaf — desync.
- **Root-cause hypothesis**: page-title element gets included in our `[contenteditable=true]` query but with a wrapper that's not the actual cursor-receiving leaf. Either filter the title from vim_info.lines or normalize index resolution to the leaf.
- **Severity**: Medium — every page hits this on initial gg.

## BUG-044: Escape relocates DOM cursor to page-title H1 in normal mode

- **Status**: **NOT REPRODUCIBLE in baseline — withdrawn.**
- **Detected**: 2026-05-03 (surfaced during BUG-043 investigation)
- **Withdrawn**: 2026-05-03 — implementer re-investigated on a clean baseline (no source changes) with a 3-scenario debug spec (clean Escape, H1-touched-then-Escape, accumulated activity then Escape). Cursor stayed on the target leaf in all three; vim_info and DOM agreed throughout.
- **Misattribution origin**: The Escape→H1 behavior was a coupling artifact of the partial BUG-043 WIP (page-title wrapper filter + bare `vim_info.active_line = 0` in `createSetLines`). With the filter applied, `lines[0]` became the real H1 leaf rather than the inert wrapper, and the partial WIP's init paths primed Notion's focus tracking onto H1. Neither happens without the partial WIP.
- **Implication for BUG-043**: page-title-filter approach is viable on its own; no Escape reconciliation needed.

## BUG-045: Table-walk drift after 6-markdown-shortcut chain (rapid j×5 → +1 active_line)

- **Detected**: 2026-05-04 (surfaced during BUG-040 bisect verification on `d55a4f3`)
- **Status**: Pre-existing — reproduces standalone on `main`, on `c0b111c`, and on the bisect attempt `d55a4f3` alike. Not introduced by any 2026-05-03 / 2026-05-04 sprint.
- **Test**: `scenario-markdown-chaos.spec.ts:305` (`Validate: walked block classes contain expected sequence`)
- **Reproduction**: After `convertOnSpace` runs the 6-shortcut conversion chain (Rounds 1–6 in the same `scenario-markdown-chaos` test), press `j` rapidly 5 times to walk into the table region below. `vim_info.active_line` lands one block past where the DOM cursor is — the walked-block-class sequence is off by one.
- **Suspected root cause**: Likely interacts with the same identity/block_id recovery paths that BUG-001 / BUG-040 exercise, but specifically the rapid-j burst that crosses from the post-conversion region into a table block. Tables wrap their contenteditable cells differently from regular blocks; the recovery's wrapper-skip may not match table-cell shape.
- **Severity**: Low–Medium — rare in practice (requires sequential markdown conversions then immediate rapid j into a table), but indicates a gap in our recovery paths for table-cell DOM shape.

## BUG-047: `x` (delete-character) inside code block is broken — block deletion in headed, letter insertion in headless

- **Detected**: 2026-05-04 (manual report from user during BUG-040 fingerprint A verification)
- **Status**: **RESOLVED** for `x` in `deleteCharacter`. `X` / `s` / `dd` / `D` / motion-delete still route through `execCommand("cut" | "delete")` and may share the same fingerprint — tracked separately.
- **Resolution**: 2026-05-04. New helper `deleteCharacterInCodeBlock` in `src/content_scripts/navigation/code-block.ts` builds a `Range` over the target character via two `setCursorPosition` calls (so endpoints survive Notion's multi-span syntax-highlighted DOM), calls `range.deleteContents()`, and dispatches an `InputEvent("input", { inputType: "deleteContentForward" })` so Notion's renderer / undo stack stay consistent. `vim.ts` `deleteCharacter` branches to it when `isInsideCodeBlock(currentElement)`. The helper also refuses to delete a `\n` line separator, matching vim's "x doesn't cross line boundaries" semantics.
- **Test markers**: `code-block-nav.spec.ts` — "BUG-047: x at line-end position in code block does not destroy block or insert 'x'" (covers headed data-loss and headless letter-insertion fingerprints), and "BUG-047: x in middle of code-block line deletes exactly one character" (positive case).
- **Reproduction (pre-fix, headed/manual)**: Inside a code block in normal mode, position cursor anywhere, press `x`. The **entire code block is deleted** instead of one character.
- **Reproduction (pre-fix, headless/automated)**: Same flow. The `x` keystroke is **inserted as the literal character 'x'** at the cursor position; the code block grows by one character. (Originally verified in throwaway repro spec: `"function hello() {"` → `"function hello() {x"`, length 61 → 62.)
- **Root cause**: `deleteCharacter()` in `src/content_scripts/vim.ts` used `document.execCommand("cut")` after selecting one char in the current element's text node. For a code-block leaf:
  - **Headed (Notion live)**: Notion's own `cut` handler treats the code-block contenteditable as a unit and removes the whole block (same way Cmd+X on a code block does).
  - **Headless (Playwright)**: `execCommand("cut")` returns false silently (clipboard access denied / event not fully synthesized), the selection is left dangling, and the original `x` keydown bubbles through to Notion's text-input pipeline, which inserts the letter at the caret.
- **Why both paths broke with one root**: `deleteCharacter` was written for plain text leaves, where one-char selection + `cut` produces the right behavior. Code blocks need a code-block-specific path that uses `Range`-and-`Text`-mutation directly (analogous to `openLineBelowInCodeBlock` in `src/content_scripts/navigation/code-block.ts`), bypassing both Notion's clipboard handler and the platform clipboard altogether.
- **Severity**: **High** in headed (data loss — the user's whole code block is destroyed by a single `x`). High in headless too, but as a different fingerprint. Affected every code-block user.
- **Follow-up**: `X` (`deleteCharacterBefore` at `vim.ts:376`), `s` (`substituteCharacter` at `vim.ts:397`), `dd` / `D` / motion-delete (`operators/motion-delete.ts:122,189`) all still use `execCommand("cut" | "delete")` and almost certainly share the same data-loss fingerprint inside code blocks. Worth a follow-up PR that ports the same Range-based pattern to those call sites.

## BUG-046: Cross-spec cumulative flake under `npm test` full-suite run

- **Detected**: 2026-05-03 (surfaced during BUG-040 PR #12 final verification on `c0b111c`)
- **Status**: Accepted as known intermittent under `npm test` full-suite; both tests pass standalone or on retry.
- **Tests**: `cursor-sync.spec.ts:186` (`I → Escape → k on text after code block stays consistent`) and `scenario-markdown-chaos.spec.ts:213` (`Conversion chain: 6 markdown shortcuts in sequence`).
- **Reproduction**: Run `npm test` (full Playwright suite). Both tests fail intermittently in the full-suite run on `c0b111c` and later. Re-running either test in isolation passes cleanly. The bisect attempt on `d55a4f3` (which removed the new `selectionchange` listener and `characterData: true` from the MutationObserver) fixed these two but caused 22 other failures and 81 total test losses, confirming the new listeners are load-bearing for cross-spec state cleanliness elsewhere.
- **Suspected root cause**: The `selectionchange` listener and `characterData`-watching MutationObserver added in `c0b111c` likely accumulate state or fire mid-teardown across spec boundaries, contaminating the next spec's setup. Specifically: `selectionchange` listeners attached across page navigations may not be detached cleanly when Playwright reuses contexts, and the broadened observer fires on mid-teardown text mutations that wouldn't happen in a real session.
- **Severity**: Low — only triggers under cumulative cross-spec state in CI-like full-suite runs. Real users with single-page sessions are not affected. Net trade was +23 reliable passes for these 2 intermittents (PR #12).
- **Possible fix directions**: Detach `selectionchange` on page unload; rate-limit or debounce `reconcileFromSelection`; narrow the `characterData` observer to specific subtree roots; or re-architect the reconciliation so it doesn't need either listener.
