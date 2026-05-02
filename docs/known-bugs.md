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

- **Detected**: 2026-04-14
- **Test**: `stress-fast-user.spec.ts` → "edit text before code block → j into code → k back"
- **Reproduction**: Navigate to "Section 8: Code block" heading. Press I, type "X", Escape. Then j (enters code block first line, activeLine increments by 1). Then k — DOM cursor lands on block 38 instead of block 37 (the heading).
- **Expected**: k returns to the heading block (index 37)
- **Actual**: k returns to the block after the heading (index 38, which is the code block itself)
- **Context**: After editing a heading block that's directly above a code block, the cursor position mapping between vim_info and DOM gets off by one. The I→type→Esc sequence on the heading seems to shift the vim line mapping.
- **Severity**: High — this is likely the bug users experience where "j/k goes to the wrong line after insert mode"

## BUG-003: o→type→Esc→k returns to wrong block (off by 1)

- **Detected**: 2026-04-14
- **Test**: `stress-fast-user.spec.ts` → "o→type→Esc→k returns to original block"; `insert-open-line.spec.ts` → 3 tests (bullet, nested todo, code block boundary)
- **Reproduction**: Navigate to "Plain text line 3" (block index 4). Press o, type "new line via o", Escape. Then k. DOM cursor ends up on block 3 instead of block 4.
- **Expected**: k returns to block 4 (the original "Plain text line 3")
- **Actual**: k returns to block 3 (one above the original)
- **Context**: After `o` creates a new line below and Escape returns to normal mode, the vim_info line mapping appears off by one. This is a variant of the cursor desync after insert operations. Confirmed on bullets, nested todos, and near code blocks (where j also fails to advance).
- **Severity**: High — o is a frequently used Vim command

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

- **Detected**: 2026-04-14
- **Test**: `navigation.spec.ts` → "F{c} finds character backward", "T{c} stops one after target char backward"
- **Reproduction**: Navigate to "find char: abcdefghij", press `$` to go to end, then `Shift+f` followed by `a`. Cursor does not move.
- **Expected**: `F{c}` searches backward from cursor to find the character
- **Actual**: Cursor stays at current position
- **Severity**: Medium — backward character search is a common Vim operation

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

## BUG-014: `pending_operator = "g"` leaks across V→Esc into normal mode

- **Detected**: 2026-05-03
- **Source**: Latent bug found by code reading (see `docs/test-overhaul/bug-investigation.md`).
- **Test**: `visual-line.spec.ts` → "BUG-014: g pending state leaks across V→Esc into normal mode"
- **Reproduction**: From any block where `active_line > 1`, press `V` (visual-line), `g` (sets `pending_operator = "g"`), `Escape` (returns to normal but does NOT clear `pending_operator`), then `g`. The final `g` is interpreted as the second `g` of `gg` and jumps to the first line.
- **Root cause**: `src/content_scripts/vim.ts:928-940` (visualLineReducer `case "g"`) sets `pending_operator = "g"` to wait for a second `g`. But `case "Escape"` at `vim.ts:904-921` does not clear `pending_operator` before returning to normal. The same leak likely affects any motion key in visual-line mode that doesn't reset the pending state.
- **Expected**: Trailing `g` after V/Esc should be ignored (no pending operator from previous mode).
- **Actual**: Cursor jumps to line 1 (gg-jump-to-top behavior).
- **Severity**: Medium — surfaces only when user uses `g` in visual-line mode then aborts, but is silently incorrect.

## BUG-035: `f` / `F` / `t` / `T` in multi-line code block set `desired_column` to absolute textContent offset

- **Detected**: 2026-05-03
- **Source**: Latent bug found by code reading (see `docs/test-overhaul/bug-investigation.md`).
- **Test**: `code-block-nav.spec.ts` → "BUG-035: f in code block preserves visual column for subsequent j"
- **Reproduction**: In a multi-line code block, position cursor on a non-first line, press `f{char}` (or `F` / `t` / `T`) to find a character on that line. Then press `j` to move down. The cursor lands at `min(absolute_offset, next_line_length)` instead of the visual column from the search target — typically end-of-line on shorter lines.
- **Root cause**: `src/content_scripts/navigation/char-find.ts:21-22, :39-40, :58-59, :77-78`. All four character-find functions set `vim_info.desired_column = foundIndex` (or `foundIndex - 1` / `+ 1`) where `foundIndex` is the position from `text.indexOf(char, currentPos)` against the FULL code-block textContent (which includes `\n`). For non-code-blocks this is fine (single-line text), but for code blocks the absolute offset is not a visual column. Subsequent `j` / `k` then misuse this number as the target column on the next line.
- **Expected**: After `f{c}` lands the cursor at visual column N of a code-block line, `j` moves to visual column min(N, next_line_length).
- **Actual**: Cursor lands at min(absolute_offset, next_line_length) → typically end-of-line.
- **Severity**: High — corrupts column-memory after any character-search inside a code block.

## BUG-036: `h` / `l` in multi-line code block set `desired_column` to absolute textContent offset

- **Detected**: 2026-05-03
- **Source**: Latent bug found by code reading (see `docs/test-overhaul/bug-investigation.md`).
- **Test**: `code-block-nav.spec.ts` → "BUG-036: h in code block preserves visual column for subsequent j/k"
- **Reproduction**: In a multi-line code block, position cursor on a non-first line at column N (e.g. `j j l l l l l` → line 2 col 5). Press `h` (or `l`) to move horizontally. Press `j` — cursor lands at end of next line instead of visual column N±1.
- **Root cause**: `src/content_scripts/navigation/code-block.ts:87` (`moveCursorBackwardsInCodeBlock`) and `:106` (`moveCursorForwardsInCodeBlock`). Both do `vim_info.desired_column = newPos` where `newPos = currentPos ± 1` — an absolute offset within the code-block textContent (containing `\n`). The exit-block `j` / `k` paths and `moveCursorDownInCodeBlock` then use `desired_column` as a per-line column, mis-clamping to `min(absolute_offset, line_length)`.
- **Expected**: `h` / `l` in a code block update `desired_column` to the visual column on the current line.
- **Actual**: `desired_column` polluted with absolute offset; vertical motion column-memory broken.
- **Severity**: High — every `h` / `l` keystroke inside a code block corrupts subsequent `j` / `k` column landing.

## BUG-029: `j` exiting code block bumps `active_line` but leaves DOM cursor inside

- **Detected**: 2026-05-03
- **Source**: Latent bug found by code reading (see `docs/test-overhaul/bug-investigation.md`). Sibling of BUG-010.
- **Test**: `code-block-nav.spec.ts` → "BUG-029: j exiting code block syncs DOM cursor with active_line"
- **Reproduction**: Navigate into a code block, press `j` to reach the last real line (and any ghost line). Press `j` once more to exit. The status bar shows the next block's line number, but the DOM cursor stays inside the code block element.
- **Root cause**: `src/content_scripts/navigation/code-block.ts:20-23` and `:54-58`. The exit branches (`if (lineEnd === -1)` for `j`, `if (lineStart === -1)` for `k`) do `vim_info.active_line = vim_info.active_line ± 1; return;` without calling `setActiveLine()`, `updateInfoContainer()`, or any cursor-positioning helper. Status bar / `active_line` advance, but the DOM `<selection>` is never moved out of the code block's contenteditable.
- **Expected**: `j` from the last real line of a code block (or its ghost line) moves the DOM cursor to the next block.
- **Actual**: DOM cursor remains inside the code block's contenteditable; subsequent operations target the wrong block.
- **Severity**: High — every code-block exit hits this path; explains "I pressed j but my cursor didn't move" reports.
