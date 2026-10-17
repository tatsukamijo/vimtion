# Known Bugs

Bugs detected during E2E test development. Kept separate from test refinement work.

## BUG-001: Rapid j/k round-trip causes DOM cursor desync

- **Status**: Likely resolved together with BUG-071 (same root cause); not re-run against the original spec.

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
- **Status**: **RESOLVED (test artifact)** on `fix/live-sweep-batch1`. Playwright `press("Shift+i")` / `"Shift+o"` sends `key: "i"` / `"o"` with Shift held, so Vimtion correctly ran `i` / `o`. The specs now send `"Shift+I"` / `"Shift+O"`. Real keyboards send `I` / `O`.
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
- **Status**: **RESOLVED (test artifact)** on `fix/live-sweep-batch1`. Playwright `press("Shift+i")` / `"Shift+o"` sends `key: "i"` / `"o"` with Shift held, so Vimtion correctly ran `i` / `o`. The specs now send `"Shift+I"` / `"Shift+O"`. Real keyboards send `I` / `O`.
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

---

# Live-driver sweep — 2026-10-15

Found with `tools/notion-driver` (`vt`) against real Notion (now served from `app.notion.com` with a rewritten, atomic-CSS DOM). Six agents each covered one command family on fresh fixture pages and diffed the results against `nvim -u NONE`. Each finding was then re-run from scratch in a **headed** browser by a separate verifier that tried to refute it: 67 of 68 survived. Duplicates are merged below and grouped by likely root cause.

Repro notation: `fixture` lines use the `vt fixture` spec (see `tools/notion-driver/README.md`). Line numbers are driver lines: L1 = page title, content starts at L2. Keys are Vim notation, sent with the 30ms default gap unless noted.

## BUG-048: Line/block deletion (`dd`, `Vd`, `Vjd`) deletes nothing on current Notion

- **Status**: **RESOLVED** on `fix/live-sweep-batch1`. Each block is now removed with a collapsed `execCommand('cut')` (Notion's real cut path) instead of synthetic drag/key events. Undo counts one step per Notion edit.

- **Detected**: 2026-10-15 (live driver, headed + headless)
- **Repro**: fixture `alpha one / bravo two / charlie three`; `jjj` (on `bravo two`) then `dd`, or `Vjd`. Nothing is deleted. The mode reads `insert` for about 800ms, then returns to normal. Reproduced on heading, paragraph, todo, quote, callout, toggle, last line, and a top-level bullet with children. (`2dd` also deletes one line, but that is the missing count prefix, MISSING-001, not this bug.)
- **Root cause**: `deleteMultipleLinesAtomically` (`core/dom-utils.ts`) selects blocks with a synthetic `mousedown`/`mousemove`/`mouseup` drag, then dispatches a synthetic `Backspace`. Current Notion does not react to the synthetic drag (no `[data-block-selected]`), and the per-block keyboard fallback also fails.
- **Severity**: **Critical**. Every line-wise delete is broken. Visual-line delete and the stashed WIP fix `WIP: visual-line delete cursor sync` both sit on top of this.

## BUG-049: `dd` on a nested bullet child deletes the whole parent subtree

- **Status**: **RESOLVED** on `fix/live-sweep-batch1`. Deletion now matches Vim: only the deleted lines go. Surviving children are lifted one level first (synthetic Shift+Tab, last child first) and take the deleted line's place. Undo restores the original tree.

- **Repro**: fixture `top / - parent /   - child a /   - child b / tail`; cursor on `child a` → `dd`. Result: `top / tail`. Parent and both children are deleted, and a reload confirms it. `u` restores the blocks but leaves the cursor on `tail`.
- **Root cause**: Same synthetic drag as BUG-048. On a nested block it selects the top-level ancestor.
- **Severity**: **High**. Data loss.

## BUG-050: Cursor jumps to the page title after yank / visual-delete / `dw` on an empty line

- **Status**: **RESOLVED** on `fix/live-sweep-batch1` for `yy`, visual `d`/`y`, `Vy`, and `dw` on an empty line: the caret is restored instead of cleared. The `dw`-on-empty-line case still flashes the title for one frame (about 0–50ms).

- **Repro**:
  - `yy`: fixture `alpha one / beta two / gamma three`; on `gamma three`, `yy` → `--series` shows `@0ms dom=L0`, then `@100ms vim=L1` (the title). `yyp` pastes under the title.
  - Visual: `wved`, `wviwd`, `Vy`, `vlly`. The cursor ends on L1 (or the caret is detached). The next `x` deletes from the title (`vt fixture` → `t fixture`), and `Vy` then `p` pastes **into** the title.
  - `dw` on an empty line removes the line correctly, but the cursor goes to the title.
- **Root cause**: `createYankCurrentLine` (`operators/motion-yank.ts`), `createDeleteVisualSelection` / `createYankVisualSelection` / `createYankVisualLineSelection` (`visual/helpers.ts`), and `createDeleteToNextWord` on an empty line all end with `getSelection().removeAllRanges()` and never restore the caret. Selection reconciliation then resolves the active line to the title. `Vy` also leaves `yank_type` null, so the paste is character-wise.
- **Severity**: **High**. The very next edit silently modifies the page title.

## BUG-051: Normal-mode caret ends up past the last character (no Vim "step back")

- **Status**: **RESOLVED** on `fix/live-sweep-batch1` for Esc/`jk`, `x` at EOL, `p`, and `j`/`k` clamping. `W`/`w` at the end of a line and `D`/`d$` are still open.

One root idea (normal-mode column must be clamped to `len-1`) behind several triggers:
- **Esc / `jk` from insert** never moves the caret one left: `AZ<Esc>` leaves col = len, and `x` then does nothing. `wiXY<Esc>` should end on `Y`. This hits almost every edit (`reducers/insert.ts`).
- **`x` at end of line**: `$xxx` deletes only once. The caret stays at the old len and later `x` presses are no-ops.
- **`p`** leaves the caret one past the pasted text (`ywp` → col 12, nvim 11; `y$p` at EOL → caret past end). `P` is correct.
- **`j`/`k` onto a shorter line** (and `}` at end of document, and `j` in code blocks) clamp to `len` instead of `len-1` (`setActiveLine`: `Math.min(desired_column, lineLength)`).
- **`W`** on the last WORD (never wraps to the next line) and **`w`** on the last word of the document stop at `len`.
- **Deletions at end of line** (`D`, `d$`) set the caret to `pos` instead of `pos-1`.
- **Severity**: **Medium–High**. The block cursor renders after the text, and the next keystroke is silently lost.

## BUG-052: `$` is not sticky for later `j`/`k`

- **Repro**: fixture `short / a much longer line here`; on `short`, `$j` lands at col 4 (nvim: end of line, col 22). Going the other way, `$jj` keeps a numeric column instead of "end of line".
- **Root cause**: `jumpToLineEnd` (`navigation/basic.ts`) stores a numeric `desired_column` with no end-of-line marker.
- **Severity**: Low.

## BUG-053: `desired_column` is stale after leaving insert mode

- **Status**: **RESOLVED** on `fix/live-sweep-batch1` (Esc syncs `desired_column`).

- **Repro**: `iabcdef<Esc>j` lands at C0 (nvim: col 5). After `A<CR>two<Esc>k`, `k` lands past the end of the previous line.
- **Root cause**: The insert-mode Escape handler does not sync `desired_column` from the DOM selection.
- **Severity**: Medium.

## BUG-054: Code-block operators act on the whole block, not the current code line (data loss, not undoable)

- **Status**: **RESOLVED** on `fix/live-sweep-batch1`: edits go through `deleteCharRange` (execCommand delete), scoped to the current code line. They persist after reload and undo works.

- **Repro**: fixture `top / ```python / x = 1 / y = 2 / z = 3 / ``` / end`.
  - `cc` on `y = 2` empties the **entire** code block.
  - `D` / `C` / `d$` / `c$` truncate everything after the cursor across all code lines. `d0` deletes from the block start, and `y$` yanks to the block end.
  - `u` cannot restore any of it: the edit is DOM-only (`textContent = …`) and reverts on reload if nothing else was typed.
- **Root cause**: `createChangeCurrentLine` (`operators/motion-change.ts`) and `createDeleteToEndOfLine` (`operators/motion-delete.ts`) write `element.textContent` directly. They have no code-block line scoping and dispatch no input event. This is the BUG-047 follow-up, still open.
- **Severity**: **High**. Data loss.

## BUG-055: Code-block motions and inserts use the whole block instead of the current code line

- **Status**: **RESOLVED** on `fix/live-sweep-batch1` for `0`/`$`/`^`/`f`/`t`/`I`/`A`/`X` verified. `yy`+`p` inside a code block and normal-mode `h`/`l` crossing code lines were not re-checked.

- `0` → block offset 0; `$` → the trailing `⏎` after the last line; `f(`/`F`/`t`/`T` search across code lines (`navigation/basic.ts`, `navigation/char-find.ts`).
- `I` on the 2nd code line inserts at the start of the 1st (`insertAtLineStart`).
- `h`/`l` cross code-line boundaries and stop on the newline position (`code-block.ts` `moveCursor{Forwards,Backwards}InCodeBlock`).
- `X` changes only the DOM and drops syntax highlighting; the change reverts on reload (`deleteCharacterBefore` sets `textContent`; BUG-047 follow-up).
- `yy` in a code block copies the whole block and moves the caret to col 0. `p` then pastes nothing and leaves the block.
- `O` in a code block inserts the newline but leaves the caret on the original line (related to BUG-011).
- **Severity**: Medium (X / yy+p: High).

## BUG-056: `A` + `Enter` in a code block splits the block *above* and types there

- **Status**: **RESOLVED** on `fix/live-sweep-batch1`: the caret goes to the end of the code line, and entering insert mode clicks the code block so Notion's Enter acts on it, including after `j`/`k` entry.

- **Repro**: fixture `para above / ```python / x = 1 / y = 2 / ``` / after code`; on `x = 1`: `A<CR>`, then type `z = 3` → `z = 3para above`. The code block is unchanged.
- **Root cause**: `setCursorPastLineEnd` (`vim.ts`) uses the full `textContent.length` of the code leaf, including Notion's trailing `\n` placeholder, so the caret leaves the block.
- **Severity**: **High**.

## BUG-057: `k` out of the first code line jumps *below* the code block; `j` out loses the column

- **Status**: **RESOLVED** on `fix/live-sweep-batch1` by the navigation guard (cursor/position.ts): for 400ms after a Vimtion navigation, a selection that drifts elsewhere with no mouse press since is put back instead of followed. Any Vimtion caret placement re-targets the guard; undo/redo clear it. k from the first code line lands on the line above 5/5, and j out keeps the column. The click handler also stores a code-line column.

- **Repro**: fixture `line above / ```python / a = 1 / b = 2 / ``` / line B after / line C after`; on code line 1, col 4, press `k` → the cursor ends on `line B after` col 0 (4 of 5 trials). For `j` out of the block, the column resets to 0 in 30–60% of trials.
- **Root cause**: When the caret leaves a code block, Notion asynchronously moves the selection to the start of the block after it, about one macrotask after `setActiveLine`, and reconciliation follows it.
- **Severity**: **High**.

## BUG-058: `j` on the last line of a code block at the end of the page wraps to the block's first line

- **Repro**: fixture `first para / ```python / def f(): /  /     return 1 / ``` ` → on the last code line, `j` jumps to `def f():`. A held `j` cycles, and `G` lands on the first code line.
- **Root cause**: `moveCursorDownInCodeBlock` → `setActiveLine(active_line+1)` clamps back to the same block and enters it from the top.
- **Severity**: Medium.

## BUG-059: `x` at column 0 loses the cursor

- **Status**: **RESOLVED** on `fix/live-sweep-batch1`: `getCursorIndexInElement` is Range-based, so element-anchored selections are read correctly.

- **Repro**: fixture `alpha beta gamma delta / second line`; on L2, `xxx` → only the first `x` deletes. After that, `w` jumps to the next line, `h` jumps to the end of the line, and `l` is a no-op. Same on heading, bullet and todo.
- **Root cause**: After `execCommand('cut')` the selection is anchored on the leaf element (`DIV`, offset 0), not on a text node. `getCursorIndexInElement` (`cursor/position.ts`) only resolves text-node anchors.
- **Severity**: **High**. The most basic edit is broken.

## BUG-060: `x` / `s` / `dw` / `cw` at a formatted-span or syntax-token boundary type the letter instead of deleting

- **Status**: **RESOLVED** on `fix/live-sweep-batch1` for `x`/`s`/`dw` (`selectCharRange` resolves offsets at formatting boundaries). `cw` and code-block tokens still need re-verification.

- **Repro**: make `beta` bold in `alpha beta gamma delta` (`jwviw<D-b><Esc>`); `0w` then `x` → `alpha x**beta**…` (a literal `x` is inserted). `s` inserts `s` and stays in normal mode. `dw`/`cw` at the boundary throw `IndexSizeError`. The same happens on code-block syntax tokens.
- **Root cause**: `deleteCharacter` / `substituteCharacter` (`vim.ts`) do `r.setEnd(r.startContainer, r.startOffset + 1)`. When the caret sits at the end of the previous text node, that offset is out of range.
- **Severity**: **High**. Breaks on any page with formatting or code.

## BUG-061: Visual `v` + operator with no motion deletes/yanks the whole block

- **Status**: **RESOLVED** on `fix/live-sweep-batch1`: `v` draws its one-char selection immediately and starts from the real caret.

- **Repro**: fixture `hello world foo bar / second line here`; on L2, `wvd` → the whole block is deleted and the cursor goes to the title (nvim: `hello orld foo bar`). `wvx` does the same, and `wvy` yanks the whole line.
- **Same mechanism**: `v` after `j` onto a shorter line. Visual motions use the stale `desired_column` instead of the real caret, so the selection collapses, and `vhd` then deletes the whole `abc def` block.
- **Root cause**: `createStartVisualMode` (`visual/helpers.ts`) never calls `updateVisualSelection()`. `execCommand('cut')` on a collapsed selection cuts the whole block.
- **Severity**: **High**. Data loss.

## BUG-062: Visual `v` inside a code block operates on the paragraph *above* the block

- **Status**: **RESOLVED** on `fix/live-sweep-batch1`: `setRangeInElement` resolves endpoints inside nested tokens. Visual delete in a code block deletes only the selection; `Vd` deletes only the code line.

- **Repro**: fixture `para QQQ above / ```python / alpha = 1 / beta = two / gamma / ``` / after code`; on `beta = two`, `vlld` → `para QQQ above` is deleted and the code block is untouched. `v$y` yanks `para QQQ above`. A bold span inside a `v` selection sometimes yanks the whole line the same way.
- **Root cause**: `setRangeInElement` (`visual/helpers.ts`) recurses into the element that contains the start and returns without setting the end.
- **Severity**: **High**. Data loss.

## BUG-063: Visual-line yank in a code block leaves the line selected; the next insert overwrites it

- **Status**: **RESOLVED** on `fix/live-sweep-batch1`.

- **Repro**: same fixture as BUG-062; on `beta = two`, `VyiZ<Esc>` → `alpha = 1\nZ\ngamma`.
- **Root cause**: `removeAllRanges()` after `Vy` does not stick for the code-block range.
- **Severity**: **High**.

## BUG-064: Visual-mode gaps

- `c` in character-visual does nothing, and typed text then runs as visual motions (MISSING-005, but the README documents `c`).
- `j`/`k`, `o`, `p` and counts are swallowed in `v`, and with no other motion `vjy` yanks the whole line.
- `Vgg` / `Vkkk` reach line 0, the page wrapper: the whole page turns pink and `y` yanks the title.
- Fast `VjJ<Esc>` (Shift+J move, then Esc right away) leaves vim on the moved block and the DOM caret on the old line (the 50ms re-anchor `setTimeout` races Esc).
- Fast `Vc` + type + `<Esc>`: about 500ms after Esc, the mode flips back to INSERT with the caret at col 0 (the trailing `setTimeout` in `changeVisualLineSelection` unconditionally sets insert).
- **Severity**: Medium.

## BUG-065: Paste behaviour

- `yy` then `P` pastes **inline** at col 0 instead of opening a line above (`pasteBeforeCursor` checks `endsWith('\n')`; `pasteAfterCursor` uses `yank_type`).
- `yank_type` stays `'line'` after a later charwise yank, so `yy … yw p` opens a new line.
- Linewise `p` on a bullet with children pastes after the subtree but puts the cursor on the first child (`setActiveLine(active_line+1)` is hard-coded).
- `yy`/`p` drops the block type: heading, todo and bullet paste as plain text.
- `yy` on an empty line, then `p`, pastes nothing.
- **Severity**: Medium (P inline: High).

## BUG-066: `O` on a callout types into the callout; `O` on the page title renames the page

- **Status**: **RESOLVED** on `fix/live-sweep-batch1`. After Enter at col 0, `O` finds the newly inserted block (the block id not present before) and puts the caret there, instead of sending a synthetic ArrowUp (which never left a callout). On the page title, `O` opens the first body line, because nothing can sit above the title.

- **Repro**: fixture `alpha / ! callout here / omega`; on the callout, `ONEW<Esc>` → `NEWcallout here`. On a fresh fixture with the cursor on the title, `ONEW<Esc>` → the title becomes `NEW` and the old title moves into a paragraph.
- **Root cause**: `openLineAbove` (Enter at pos 0, then ArrowUp) does not leave a callout's inner editable and has no title guard.
- **Severity**: Medium.

## BUG-067: Word motions and `cw` deviate from Vim

- `w`/`b`/`e` treat punctuation as whitespace: `foo.bar` is one word. `dw` on `foo.bar baz` deletes `foo.bar ` (nvim deletes `foo`), and `w` in code skips `=` (`navigation/word.ts` uses only `\w` / non-`\w`).
- `cw` behaves like `dw` and eats the trailing space (`cwX` on `one two` → `Xtwo`; nvim: `X two`).
- `e`/`E` at end of line do not wrap to the next line, and `B` at col 0 does not wrap back (`b` does).
- **Severity**: Low–Medium.

## BUG-068: Text-object edge cases

- **Status**: **PARTIAL** on `fix/live-sweep-batch1`: `ci(`/`ci"` with no pair now abort, and `diw`/`daw` at line end keep the caret on a char. The inner-closing-bracket pair choice and the `da"` double space are still open.

- With the cursor on an inner closing bracket, the outer pair is used: `call(foo(bar), baz)` with the cursor on the first `)`, then `di(` → `call() end` (nvim: `call(foo(), baz) end`). Same for `[]` and `{}` (`text-objects/bracket.ts` counts the bracket under the cursor as depth+1).
- `da"` / `ca'` leave a double space (trailing whitespace is not consumed).
- `ci(` / `ci"` on a line with no pair still enters insert mode, so the user's next keys are typed into the line (nvim aborts).
- **Severity**: Medium (`ci(` no-pair: High in practice, because it types text).

## BUG-069: Missing commands silently swallowed — `S`, `Y`, and README-advertised `de`/`db`/`ce`/`cb`/`ye`/`yb`/`dW`/`dB`/`dE`

- README "Operators with Motions" claims they are supported, but the pending-operator switch has no `e`/`b`/`W`/`B`/`E` cases. See MISSING-002/003/004/006. `S` and `Y` are not listed in missing-features.
- **Severity**: Medium (documentation mismatch).

## BUG-070: `j`/`k` in a Notion table move only every other press

- **Status**: **RESOLVED** on `fix/live-sweep-batch1` by the navigation guard (cursor/position.ts): for 400ms after a Vimtion navigation, a selection that drifts elsewhere with no mouse press since is put back instead of followed. Any Vimtion caret placement re-targets the guard; undo/redo clear it. Table j/k now move one cell per press in both directions.

- **Repro**: shared test page, Section 20 table: `kkkkkk` (150ms or 500ms gap) moves 3 cells. A trace shows the reducer moving 91→90, then `reconcileFromSelection` moving it back 90→91.
- **Related**: BUG-045. **Severity**: **High** for table users.

## BUG-071: Fast key repeat drops `j`/`k` presses (BUG-001 still open)

- **Status**: **RESOLVED** on `fix/live-sweep-batch1` by the navigation guard (cursor/position.ts): for 400ms after a Vimtion navigation, a selection that drifts elsewhere with no mouse press since is put back instead of followed. Any Vimtion caret placement re-targets the guard; undo/redo clear it. Held j/k (30 repeats at 16–60ms) land exactly. The scroll listener no longer relocates the cursor for scrolls that follow a Vimtion motion.

- **Repro**: 40-paragraph fixture, `vt hold j 30 --interval 16` → L20–21 instead of L31. Results by repeat interval: 25ms → L28, 33ms → L31 (correct). A burst of 5 `j` with zero gap moves 4.
- **Root cause**: An async `selectionchange` reports the previous leaf after the next `j` has already moved, and `reconcileFromSelection` reverts it.
- **Severity**: Medium (held-key users).

## BUG-072: `Ctrl-u` does not move the cursor; `Ctrl-d` moves only to the first visible line and resets the column

- **Repro**: 40-paragraph fixture, at L6 col 5, `<C-d>` → L11 col 0 (nvim: +half a window, column kept). `<C-u>` scrolls but the cursor stays at L11.
- **Root cause**: `navigation/scroll.ts` only scrolls. The cursor moves only through the debounced scroll listener, and only when it goes off-screen.
- **Severity**: Medium.

## BUG-073: Insert-mode and undo granularity details

- `aTaj<Esc>` drops the trailing `j` (the Escape path calls `cancelPendingJ()` instead of committing it).
- A change op (`C`, `ciw`), a pause, then typing takes two `u` to undo; `o` + type also takes two `u`.
- Machine-speed `oxyz<Esc>` (0–5ms gaps) puts the first character into the original line: the synthetic Enter is dispatched in `setTimeout(0)`.
- Notion merges edits made within about 1s into one undo step: `dw dw u` (400ms apart) undoes both words. With a gap of 1.2s or more, each `u` undoes one `dw`. On `main` this was masked because the second `dw` lost the cursor to the title, and that selection jump split the undo group. Test: `undo-redo.spec.ts` "multiple u undoes consecutive dw one by one". It is left failing on purpose.
- After undoing a multi-line `Vjd`, the cursor lands on the second restored line instead of the first (Notion leaves the caret there).
- **Severity**: Low.

## Harness / environment notes from the sweep

- Notion renders a copy of a block, with the same `data-block-id`, inside its hover menu while the mouse is over the block. `querySelector('[data-block-id="…"]')` can then return the copy, which has no editable leaf. Block deletion now picks the block that owns an editable leaf. The block-link navigation lookups in `vim.ts` (~2733, ~3104) and `links/link-hints.ts` (~204) still use plain `querySelector` and are likely affected.

- The "Using Vimium?" warning tells users to exclude `https://www.notion.com/*`, but pages are now on `app.notion.com`.
- `test/helpers.ts` `navigateToTestPage` short-circuits on `url.includes("notion.so")`, which no longer matches.
- `npm run build` silently produced no `dist/` until `.parcel-cache` was deleted.

## BUG-074: Closing Notion's Cmd+/ block menu sends the cursor to the page title

- **Detected**: 2026-10-16 (user report, then reproduced with the live driver)
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`.
- **Repro**: fixture `alpha one / bravo two / charlie three / delta four`; on `charlie three` col 2: `<D-/>`, optionally type into the menu's search, then `<Esc>`. The cursor lands on L1 (title). This happens in normal and insert mode. Picking **Duplicate** with Enter leaves no caret at all, so the next key acts on the title too.
- **Root cause**: Keys typed in Notion's popup inputs never reach Vimtion (its keydown listeners sit on the editor lines). When the popup closes, Notion does not restore the caret, and line recovery falls back to the title.
- **Fix**: When focus moves from the page into a popup input, remember the block, the caret column (the last collapsed page caret, since Cmd+/ block-selects the line first) and the mode. After Esc/Enter in the popup, restore them. A popup closed by clicking back into the page is left alone.

## BUG-075: `z-` / `zb` bounce the cursor to the top visible line

- **Detected**: 2026-10-16 (full suite: `z-scroll.spec.ts` "z. / z<CR> / z- run without leaving normal mode")
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`.
- **Root cause**: `z-`/`zb` put the line flush with the bottom edge. The debounced scroll listener treated any sub-pixel overhang (`rect.bottom > innerHeight`) as off-screen and moved the cursor to the first visible line.
- **Fix**: Only move the cursor when the active line has left the viewport entirely.

## BUG-076: New page — type the title, press Enter, and the cursor jumps back to the start of the title

- **Detected**: 2026-10-16 (user report; reproduced with the live driver by creating the page through Notion's UI: sidebar new-page button → Page)
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`.
- **Repro**: Create a page from the UI. Notion focuses the empty title. Type a title, then Enter. The caret goes to the new body line, then about 600ms later jumps to column 0 of the title. Also, Vimtion was not listening to the title at all on the new page: an `i` typed as a command ended up in the title text.
- **Root cause**: `reinitializeAfterNavigation` waited for at least 3 editable elements. A brand-new page has only the page wrapper and the title, so it retried every 200ms, resetting `active_line = 0` each time and never calling `setLines`. When Enter created the first body block, the count reached 3, `setLines` ran, and its `setActiveLine(0)` moved the caret to the title start.
- **Fix**: The page counts as ready once a content leaf (the title) exists. `active_line` is reset only on the first attempt, not on retries. `setLines` adopts the line the caret is already in, instead of moving it. A new page whose caret Notion put in the title (empty title, or the `showMoveTo=true` new-page URL) starts in insert mode, so typing the title is text, not Vim commands.

## Pre-ship sweep (2026-10-16)

Nine driver agents (menus, markdown shortcuts, structure, pages, mouse, core, old bugs ×2, timing), then one adversarial verifier per finding. 32 of 39 findings were confirmed. Not confirmed:
- Cmd+Shift+Up/Down losing the caret. Notion does this without the extension too.
- ```` ``` ```` sending the caret to the title (not reproduced by 3 of 4 verifiers; see BUG-041).

## BUG-077: The navigation guard undid deliberate scrolls and Notion's own edits

- **Detected**: 2026-10-16 (pre-ship sweep, timing agent). Regression from the BUG-070/057/071 guard.
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`.
- **Repro**: 40-line page.
  - `jj<C-f>`, `j<C-d>`, or `G` then `k<C-b>`: the page scrolls, then snaps back, and the cursor does not move.
  - A wheel/trackpad flick within ~600ms of `j`: snaps back the same way.
  - `jj<D-z>` after an earlier `x`, or `j<D-v>`: the text changes, but the caret is put back on the `j` target.
- **Root cause**: The scroll listener's "Notion is catching up with the caret" branch (`msSinceNavigation() < 600`) also caught Vimtion's own page scrolls and user scrolls. Meta-key edits passed through to Notion left the caret guard armed, so Notion's caret was treated as stray.
- **Fix**: Ctrl-d/u/f/b clear the guard. A wheel or touch scroll after the motion ends the guard window. Any Ctrl/Meta/Alt key that normal mode passes through to Notion clears the guard.
- **Follow-up (post-fix sweep)**: a key within ~100ms after Ctrl-d/u/f/b still acted on the old line, and `j` re-armed the guard, which pulled the page back. Ctrl-d/u/f/b now move the cursor on screen synchronously (`keepCursorOnScreen`). The scroll listener does not pull the page back within 1s of a wheel/touch scroll. Verified: `<C-d>j`, `G` then `<C-u>k`, `gg` then `<C-f>x`, and held `k` afterwards.

## BUG-078: `H` / browser back never restored the cursor

- **Detected**: 2026-10-16 (pre-ship sweep, pages agent)
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`.
- **Repro**: `jjjjll`, `gl` + a hint to another page, then `H` (or Cmd+[ / `history.back()`). The cursor lands on the title.
- **Root cause**:
  - `restoreCursorPosition` set `active_line` but moved the DOM caret only 100ms later, re-reading `active_line`. The title caret's queued `selectionchange` had already reconciled `active_line` back to the title by then.
  - Native back had no "intentional navigation" flag, because it was consumed on the previous page load, so the saved position was deleted as if on reload.
  - The saved column was the stale `vim_info.cursor_position`.
- **Fix**: Restore places the caret synchronously and marks it as a navigation, then re-places it after 100ms. `popstate` sets the intentional-navigation flag and syncs the URL poller. The saved column comes from the DOM caret.

## BUG-079: `x` on the second half of an emoji deletes the whole line

- **Detected**: 2026-10-16 (pre-ship sweep, menus agent). **Critical** (data loss).
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`. Caret placement and edited/selected ranges snap to grapheme boundaries (`charBoundsAt`, `Intl.Segmenter`); `h`/`l`/`$` step by whole characters. Verified with 😃, 👍🏽 and 🇯🇵.
- **Repro**: `ab😃cd`, `$hh`, then `x`. The whole block is removed. `h`/`l` also take two presses to cross an emoji.
- **Root cause**: Columns are UTF-16 code units, so the cursor can sit between a surrogate pair. `x` then cuts a lone low surrogate, and Notion's cut handler removes the whole block. This happens even when Vimtion is not involved.

## BUG-080: Clicking another line in `v` / `V` mode

- **Detected**: 2026-10-16 (pre-ship sweep, mouse agent)
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`. A click in visual modes ends visual mode and moves the cursor there (Vim `mouse=a`). Clicks that land on Notion's selection overlay (no line under the target) are resolved with `caretRangeFromPoint`. Note: in headless runs Notion's selection toolbar can cover the click point, and that click is then a toolbar click.
- **Repro**: `v` (or `V`), then click a different line. `v` stays in VISUAL with focus on `body`, and Esc/`x` do nothing. In `V`, the click is ignored; Esc returns to the old line, and the next edit hits it.

## BUG-081: Clicking a to-do checkbox or toggle triangle puts the cursor on line 0

- **Detected**: 2026-10-16 (pre-ship sweep, mouse + structure agents)
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`.
  - Clicks that bubble to the page wrapper are no longer adopted as a line.
  - Selection recovery (`refreshLines` tier 1, `reconcileFromSelection`) ignores a caret that resolves to the wrapper.
  - When the active line disappears (a toggle closed around it), the cursor moves to the closest earlier surviving line, which is the toggle head.
- **Repro**: Click a to-do checkbox or toggle triangle on another line. `active_line` becomes 0 (the page wrapper), and the next `j` goes to the title.

## BUG-082: After dragging a block by its handle, keys do nothing until a click

- **Detected**: 2026-10-16 (pre-ship sweep, structure agent)
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`. A document-level keydown fallback covers focus left on `<body>`, a checkbox or a toggle button inside the page (not text fields or popups): it puts the caret back on the active line and handles the key there. Enter/Space on a focused control still activate it.

## BUG-083: A key or click within ~150ms after `dd` is dropped

- **Detected**: 2026-10-16 (pre-ship sweep, mouse + timing agents)
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`. `dd` and `Vd` mark themselves busy (`core/busy.ts`). Real keys and clicks that arrive meanwhile are queued, then replayed in order, paced so that `o`/`O` finish before the typed text. Insert-mode text is replayed with `beforeinput` + `execCommand("insertText")`, because Notion drops a bare `execCommand` insert into a freshly created empty block. Verified: `ddj`, `ddx`, `ddk`, `ddjdd`, `Vjdj`, `ddohey<Esc>`, `ddiXY<Esc>`, `ddOab<Esc>`, `ddAz<Esc>j`, and a click within 0ms of `dd` (3/3).
- **Repro**: `jjj`, then `ddj` (or `ddx`, `ddk`) at typing speed. The second command is lost.
- **Root cause**: `createDeleteCurrentLine` sets `mode = "insert"` while the async block cut runs (~150ms). Keys go to the insert reducer (the `j` is eaten as a pending `jk`), and clicks are ignored. The `.then` then resets the line.

## BUG-084: Normal-mode Enter on a line with a link can open a sidebar link

- **Detected**: 2026-10-16 (pre-ship sweep, pages agent)
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`. Enter now picks among the line's own links: the one under the cursor, else the next one after it, else the last one before it.
- **Root cause**: The link is picked from `detectAllLinks()` (which includes the sidebar) by vertical distance to the line's centre, not from the line's own anchors.

## BUG-085: Code-block edge cases

- **Detected**: 2026-10-16 (pre-ship sweep, core + timing + old-bugs agents)
- **Status**: **PARTIAL** on `fix/live-sweep-batch1`.
  - Fixed: `j`/`k` clamp to the last character.
  - Fixed: `dd` on the last code line treats Notion's trailing placeholder `\n` as the end; the cursor goes to the start of the line that took the deleted line's place.
  - Fixed: `r` lands on the redone change (BUG-090).
  - Still open: linewise `p` into a code block (also the unresolved part of BUG-055).
- **Repro**:
  - `j`/`k` onto a shorter code line puts the caret on the line's `\n` (column = length), so `x` does nothing (`navigation/code-block.ts` clamps to `len`, not `len-1`).
  - `dd` on the last code line leaves an empty code line.
  - Linewise `p` into a code block pastes nothing and moves the cursor below.
  - `r` after `u` of a `dd` next to a code block lands below the block or on line 0.

## BUG-086: `O` followed by fast typing sends the first characters into the original line

- **Detected**: 2026-10-16 (pre-ship sweep, core + old-bugs agents)
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`. `O` holds typeahead (`core/busy.ts`) until the caret is in the new block. Verified at 30ms key gaps on a paragraph, a quote, a code line and the line after a code block. Seen with quote, toggle and nested bullet, at fast human typing speed.

## BUG-087: `/table` and multi-line Cmd+V lose the caret

- **Detected**: 2026-10-16 (pre-ship sweep, core, structure and old-bugs agents)
- **Status**: **PARTIAL** on `fix/live-sweep-batch1`. The wrapper is no longer adopted as a line, so Esc and `j` no longer go to line 0 or the title.
  - After `/table` + Esc, the cursor sits on the line above the table.
  - After a multi-line paste + Esc, it sits on the line before the pasted block, not on its last character.
- **Repro**: Create a table with `/table` + Enter, then Esc. Or paste multi-line text with Cmd+V in insert mode, then Esc. Vimtion is left on line 0 with no caret, and the next `j` goes to the title.

## BUG-088: Notion `@` / `:` menus and chips

- **Detected**: 2026-10-16 (pre-ship sweep, menus agent)
- **Status**: **PARTIAL** on `fix/live-sweep-batch1`.
  - Fixed: with a Notion menu open in the page overlay, insert-mode Esc reaches Notion, so the menu closes, and Vimtion then leaves insert mode.
  - Still open: `w`/`h`/`b` over a mention chip.
- **Repro**:
  - Esc does not close the `@` mention or `:` emoji menu. It stays open in normal mode, and a later `x` edits its search text.
  - `w` skips over an `@mention` chip, and `h`/`b` cannot cross it.

## BUG-089: More ways to end up with the normal-mode caret past the last character (BUG-051 triggers)

- **Detected**: 2026-10-16 (pre-ship sweep)
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`. After undo/redo and after a click, the caret steps back onto the last character of the (code) line.
- **Repro**: `u` of an `A`/`o` insert or of a markdown conversion, or a click past the end of a line. Afterwards `x` does nothing.

## BUG-090: `r` (redo) puts the cursor where it was when `u` was pressed

- **Detected**: 2026-10-16 (pre-ship sweep, timing agent)
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`. Undo remembers where it left the cursor (the changed spot). If the redo changed the page, the cursor goes back there. Notion's redo restores the selection from undo time, and `redo()` adopts it.

## BUG-091: Typing in Notion's non-page editables ran Vim commands (sidebar Rename, comment box, database cell editor)

- **Detected**: 2026-10-16 (post-fix sweep, focus agent). **Critical**: renaming a page from the sidebar and typing `kdd` deleted a block of the open page.
- **Status**: **RESOLVED** on `fix/live-sweep-batch1`.
- **Root cause**: `refreshLines`/`setLines` took every `[contenteditable=true]` in the document as a line, including the sidebar Rename popover, the comment box (`.discussion-input-text-block`) and the database cell editor. Their keydowns went to the normal-mode reducer. This predates today's branch.
- **Fix**:
  - Lines are only editables that belong to the page (`isDocumentEditable`: inside `.notion-frame`, not in a dialog, overlay, sidebar, top bar or discussion).
  - Focus moving into one of the other editables saves the page position (from the last page caret) like the popup-return episode, and Esc/Enter there restores it.
  - Verified: Cmd+Shift+M, type `hello` + `o` → the comment holds `helloo`. Esc returns to the same line and column, and `x` edits there.

## Open from the post-fix sweep (2026-10-16, stopped before it finished)

Confirmed, not yet fixed:
- ~~Regression (ed2bb05): a mouse drag across blocks in normal mode is collapsed.~~ **RESOLVED**: `followClick` keeps a range made by a drag, double-click or Shift+click and only follows its end line.
- ~~Regression (ed2bb05): a checkbox or toggle click in `v`/`V` mode silently drops visual mode on the next key.~~ **RESOLVED**: a click on a control ends visual mode right away, and the status bar shows it.
- ~~A mouse range selection in normal mode is not used by `x`/`d`/`y`~~ **RESOLVED** for single-line selections: a drag, double-click or Shift+click within one line enters visual mode, as in Vim with `mouse=a`. A cross-line mouse range stays Notion's selection, because Vimtion's charwise visual mode is single-line.
- ~~Normal-mode Enter on a link does not save the cursor~~ **RESOLVED**: Enter saves before leaving for another page.
- ~~Status bar stale after navigation/restore; a new page opens at the previous page's column~~ **RESOLVED**: a new page resets the column, and the status bar redraws after `setLines` and after a restore.
- ~~After navigating away by a sidebar click, `H` does not restore~~ **RESOLVED**: a click on a same-host link to another page saves the cursor.
- **Test harness**: Playwright's `press("Shift+i")` sends `key: "i"` with Shift, not `"I"`, so 51 presses across 9 specs were testing `a`/`i`/`o`/`v`/`w`/`b`/`e` instead of `A`/`I`/`O`/`V`/`W`/`B`/`E`. This is the "automated test only" cause of BUG-008/009. The specs now send the uppercase key. Exposed by the click-past-end clamp: the stress test's stray `x` (typed by `i`, not `I`) now lands before the last character and broke later specs' text lookups.
- The block cursor is drawn at column 0 while focus is outside the page.

Unverified sweep claims (re-check):
- ~~Esc from the top-bar `...` menu leaves Vimtion deaf~~ **RESOLVED**: Notion refocuses the top-bar button. The keydown fallback now covers focused top-bar buttons and excludes database grids. Stale `popupReturn` after a click-outside close: not yet checked.
- ~~Cmd-z in normal mode leaves the restored text selected; `desired_column` stale after Cmd-v~~ **RESOLVED**: after Cmd-z/Cmd-Shift-z/Cmd-v/Cmd-x in normal mode, the selection collapses, the caret rests on a character, and the line and column are re-read. Cmd-Shift-z landing on the pre-undo position: still Notion's placement.
- `z<CR>`/`z-` leave the line 70px from the window edge.
- ~~Esc does not close the AI prompt or the `:` emoji picker~~ **RESOLVED**: the AI prompt (`.notion-agent-writer-ui`) is not a line, so Esc reaches Notion and the cursor returns to the line, still in insert mode. The emoji picker is a dialog/grid in the overlay, now recognised as an inline menu. ~~A code block made with ```` ``` ```` puts the caret on the title~~ **Not Vimtion**: the same steps in a Chromium without the extension (fresh fixture, click, End, Enter, type ```` ``` ```` then `abc`) also leave the caret outside the new code block, and `abc` is lost, both headless and headed. Notion currently drops the caret after this conversion.
- `j`/`k` skip the rows of a soft-line-break text block. A column inside an emoji after Esc.
- Text typed into a table cell is not saved. `W` on the last WORD. `;` after `t`/`T` next to the target.
- The refix-a/refix-b areas (emoji edges, undo/redo chains, typeahead edges) did not finish. Their browsers also lost the extension mid-run when `dist-dev` was rebuilt.

Full suite on ed2bb05 (stopped at ~410/428): 14 failures. 4 are the known flakes (code-block-nav:416, operators:81, undo-redo:132, markdown-chaos). To investigate:
- navigation:485 `{`
- operators-block-types:61 `V+d`
- scenario-ime:184
- scenario-speed-typist:82 (`holdKey j×30`)
- stress-fast-user:91
- ui-sync:80/98/111/139/161: timeouts, "page closed"; possibly infrastructure
