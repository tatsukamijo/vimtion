# E2E Test Catalog

All Playwright E2E tests for Vimtion. Update this file when adding, removing, or renaming tests.

**Total: 396 tests** (12 spec files)

---

## mode-transitions.spec.ts (7 tests)

| # | Test | Status |
|---|------|--------|
| 1 | Normal → Insert (i) | Pass |
| 2 | Insert → Normal (Escape) | Pass |
| 3 | Insert → Normal (jk escape sequence) | Pass |
| 4 | Normal → Visual (v) | Pass |
| 5 | Visual → Normal (Escape) | Pass |
| 6 | Normal → Visual Line (V) | Pass |
| 7 | Visual Line → Normal (Escape) | Pass |

## navigation.spec.ts (49 tests, serial)

### j / k — vertical navigation

| # | Test | Status |
|---|------|--------|
| 1 | j moves cursor down exactly one block | Pass |
| 2 | k moves cursor up exactly one block | Pass |
| 3 | gg moves to first line (line 0) | Pass |
| 4 | G moves to last line | Pass |
| 5 | k at first line stays at line 0 | Pass |
| 6 | j at last line stays at last line | Pass |

### h / l — horizontal navigation

| # | Test | Status |
|---|------|--------|
| 7 | l moves cursor right by 1 column | Pass |
| 8 | h moves cursor left by 1 column | Pass |
| 9 | BUG-004: h at column 0 stays at column 0 | Fail (expected) |
| 10 | BUG-005: l at end of line does not go past last char | Fail (expected) |

### 0 / $

| # | Test | Status |
|---|------|--------|
| 11 | 0 moves to column 0 | Pass |
| 12 | BUG-005: $ moves to last char (len-1) | Fail (expected) |
| 13 | BUG-005: $ on long line goes to len-1 | Fail (expected) |

### w / b / e — word motions

| # | Test | Status |
|---|------|--------|
| 14 | w jumps to next word start | Pass |
| 15 | b jumps back to previous word start | Pass |
| 16 | BUG-004: b at column 0 stays at 0 | Fail (expected) |
| 17 | e jumps to end of current/next word | Pass |
| 18 | w from last word stays on line | Pass |
| 19 | w w w advances through words | Pass |
| 20 | b after multiple w returns | Pass |

### W / B / E — WORD motions

| # | Test | Status |
|---|------|--------|
| 21 | W jumps to next WORD start | Pass |
| 22 | B jumps back to previous WORD start | Pass |
| 23 | E jumps to end of current WORD | Pass |

### f / F / t / T — character search

| # | Test | Status |
|---|------|--------|
| 24 | f{c} finds character forward | Pass |
| 25 | t{c} stops one before target char | Pass |
| 26 | BUG-006: F{c} finds character backward | Fail (expected) |
| 27 | BUG-006: T{c} stops one after target char backward | Fail (expected) |

### { / } — paragraph motions

| # | Test | Status |
|---|------|--------|
| 28 | BUG-007: } moves forward past current block group | Fail (expected) |
| 29 | BUG-007: { moves backward past current block group | Fail (expected) |

### j / k across block types

| # | Test | Status |
|---|------|--------|
| 30 | j from heading updates DOM cursor to next block | Pass |
| 31 | j from bullet to next bullet updates DOM cursor | Pass |
| 32 | k from todo updates DOM cursor to previous block | Pass |
| 33 | j past empty line lands on correct block | Pass |

### Ctrl+d / Ctrl+u — half-page scroll

| # | Test | Status |
|---|------|--------|
| 34 | Ctrl+d moves down multiple lines | Pass |
| 35 | Ctrl+u moves up multiple lines | Pass |
| 36 | Ctrl+d then Ctrl+u returns within 2 lines of start | Pass |

### Insert mode entry: I / a / A / o / O

| # | Test | Status |
|---|------|--------|
| 37 | BUG-008: I inserts text at beginning of line | Fail (expected) |
| 38 | a inserts text one position after cursor | Pass |
| 39 | BUG-008: A inserts text at end of line | Fail (expected) |
| 40 | o opens new line below and enters insert | Pass |
| 41 | BUG-009: O opens new line above and enters insert | Fail (expected) |

### I / a / A on different block types

| # | Test | Status |
|---|------|--------|
| 42 | BUG-008: I on heading inserts at beginning | Fail (expected) |
| 43 | BUG-008: A on bullet inserts at end | Fail (expected) |
| 44 | a on todo inserts after first char | Pass |

### o / O on different block types

| # | Test | Status |
|---|------|--------|
| 45 | o on bullet creates new line below | Pass |
| 46 | BUG-009: O on numbered list creates line above | Fail (expected) |

### desired_column preservation

| # | Test | Status |
|---|------|--------|
| 47 | j to short line then k restores original column | Pass |

## operators-block-types.spec.ts (16 tests, serial)

### V+d across block types

| # | Test | Status |
|---|------|--------|
| 1 | V+d deletes a plain text line | Pass |
| 2 | V+d deletes a heading | Pass |
| 3 | V+d deletes a bullet item | Pass |
| 4 | V+d deletes a nested bullet | Pass |
| 5 | V+d deletes a todo item | Pass |
| 6 | V+d deletes a numbered list item | Pass |
| 7 | V+d deletes a quote block | Pass |
| 8 | V+d on line before divider | Pass |
| 9 | V+d on line after divider | Pass |

### yy+p across block types

| # | Test | Status |
|---|------|--------|
| 10 | yy+p duplicates a heading | Pass |
| 11 | yy+p duplicates a bullet item | Pass |
| 12 | yy+p duplicates a todo item | Pass |
| 13 | yy+p duplicates a numbered list item | Pass |

### dw across block types

| # | Test | Status |
|---|------|--------|
| 14 | dw on heading deletes first word | Pass |
| 15 | dw on bullet item deletes first word | Pass |
| 16 | dw on todo item deletes first word | Pass |

## operators.spec.ts (3 tests)

| # | Test | Status |
|---|------|--------|
| 1 | dd deletes current line | Pass |
| 2 | yy + p duplicates line with correct content | Pass |
| 3 | V+d deletes current line (visual line) | Pass |

## operator-motions.spec.ts (32 tests, serial)

### Delete + Motion

| # | Test | Status |
|---|------|--------|
| 1 | dw deletes to next word | Pass |
| 2 | d$ deletes to end of line | Pass |
| 3 | d0 deletes to beginning of line | Pass |
| 4 | D deletes to end of line (like d$) | Pass |

### Delete + Character Search

| # | Test | Status |
|---|------|--------|
| 5 | df deletes through found character | Pass |
| 6 | dt deletes up to (not including) character | Pass |

### Change + Motion

| # | Test | Status |
|---|------|--------|
| 7 | cw changes word and enters insert mode | Pass |
| 8 | c$ changes to end of line | Pass |
| 9 | C changes to end of line (like c$) | Pass |
| 10 | cc changes entire line | Pass |

### Yank + Motion

| # | Test | Status |
|---|------|--------|
| 11 | yw yanks word, p pastes it | Pass |
| 12 | y$ yanks to end of line | Pass |

### Text Objects: Inner

| # | Test | Status |
|---|------|--------|
| 13 | ciw changes inner word | Pass |
| 14 | diw deletes inner word | Pass |
| 15 | daw deletes around word (including surrounding space) | Pass |
| 16 | ci( changes inside parentheses | Pass |
| 17 | di[ deletes inside brackets | Pass |
| 18 | ci{ changes inside braces | Pass |
| 19 | ci' changes inside single quotes | Pass |
| 20 | ci" changes inside double quotes | Pass |
| 21 | ci` changes inside backticks | Pass |
| 22 | di/ deletes inside slashes | Pass |

### Text Objects: Around

| # | Test | Status |
|---|------|--------|
| 23 | da( deletes around parentheses | Pass |
| 24 | da" deletes around double quotes | Pass |

### Standalone Commands

| # | Test | Status |
|---|------|--------|
| 25 | x deletes character at cursor | Pass |
| 26 | X deletes character before cursor | Pass |
| 27 | s substitutes character and enters insert mode | Pass |

### Visual Mode + Operator

| # | Test | Status |
|---|------|--------|
| 28 | viw selects inner word, d deletes it | Pass |
| 29 | v$ selects to end of line, y yanks it | Pass |

### Cursor Position After Operations

| # | Test | Status |
|---|------|--------|
| 30 | after dw, cursor stays in normal mode on correct block | Pass |
| 31 | after ciw + Esc, j moves to next block | Pass |

### Paragraph Motions

| # | Test | Status |
|---|------|--------|
| 32 | d} deletes to next paragraph | Pass |

## cursor-sync.spec.ts (24 tests, serial)

| # | Test | Status |
|---|------|--------|
| 1 | I → Escape → j on plain text | Pass |
| 2 | I → Escape → k on plain text | Pass |
| 3 | I → Escape → j near empty line | Pass |
| 4 | I → Escape → j after empty line | Pass |
| 5 | I → Escape → j on heading | Pass |
| 6 | I → Escape → j on heading 3 → text after | Pass |
| 7 | I → Escape → j on bullet item | Pass |
| 8 | I → Escape → j on nested bullet | Pass |
| 9 | I → Escape → j on numbered item | Pass |
| 10 | I → Escape → j on todo item | Pass |
| 11 | I → Escape → j on nested todo | Pass |
| 12 | I → Escape → j on quote | Pass |
| 13 | I → Escape → j on callout | Pass |
| 14 | I → Escape → j on text before code block | Pass |
| 15 | I → Escape → k on text after code block stays consistent | Pass |
| 16 | I → Escape → j before divider | Pass |
| 17 | I → Escape → k after divider | Pass |
| 18 | I → Escape → j in mixed section | Pass |
| 19 | I → Escape → j on special chars | Pass |
| 20 | 5x (I → Escape) does not drift cursor | Pass |
| 21 | j/k round-trip across block types | Pass |
| 22 | i → Escape → j on bullet | Pass |
| 23 | a → Escape → j on todo | Pass |
| 24 | A → Escape → k on numbered list | Pass |

## stress-fast-user.spec.ts (28 tests, serial, no reload)

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | rapid I→type→Esc→j on consecutive plain text blocks | Pass | |
| 2 | undo previous edits to restore page | Pass | |
| 3 | cycle i→Esc, a→Esc, I→Esc, A→Esc then j moves exactly +1 | Pass | |
| 4 | i→type sentence→Esc→j→k returns to same block | Pass | |
| 5 | undo typed text | Pass | |
| 6 | edit heading → bullet → todo → quote without reload | Pass | |
| 7 | undo cross block-type edits | Pass | |
| 8 | I→type→Esc→j on block requiring scroll (mixed section) | Pass | |
| 9 | undo scroll section edit | Pass | |
| 10 | navigate around divider: edit above → j → j → edit below | Pass | |
| 11 | undo divider section edits | Pass | |
| 12 | 10x rapid i→Esc flapping does not drift cursor | Pass | |
| 13 | 10x I→Esc flapping does not drift cursor | Pass | |
| 14 | 10x A→Esc flapping does not drift cursor | Pass | |
| 15 | interleaved editing: plain→bullet→back to plain | Pass | |
| 16 | undo interleaved edits | Pass | |
| 17 | fast j through nested bullet children | Pass | |
| 18 | realistic session: 8 sequential edits across page without reload | Pass | |
| 19 | undo realistic session edits | Pass | |
| 20 | v→Esc→I→type→Esc→j stays consistent | Pass | |
| 21 | undo visual-insert edit | Pass | |
| 22 | edit on empty line → j → edit → k returns | Pass | |
| 23 | undo empty line edit | Pass | |
| 24 | rapid j→I→char→Esc for 5 consecutive blocks | Pass | |
| 25 | undo rapid chain edits | Pass | |
| 26 | BUG-003: o→type→Esc→k returns to original block | Skipped | Known bug, `test.skip()` |
| 27 | BUG-002: I→type→Esc near code block → j → k returns to correct block | Fail (expected) | Known bug, `test.fail()` |
| 28 | BUG-001: rapid 20j then 20k returns to start | Flaky | Known bug, intermittent |

## insert-open-line.spec.ts (30 tests, serial)

### o (open below) — nested bullets

| # | Test | Status |
|---|------|--------|
| 1 | o on parent bullet with children creates line between parent and first child | Pass |
| 2 | o on nested bullet child creates sibling | Pass |
| 3 | o on last nested bullet child | Pass |

### o (open below) — nested todos

| # | Test | Status |
|---|------|--------|
| 4 | o on todo with nested child creates line between parent and child | Pass |
| 5 | o on nested todo child | Pass |

### o (open below) — code block boundary

| # | Test | Status |
|---|------|--------|
| 6 | o on heading before code block | Pass |
| 7 | o on text after code block | Pass |

### o (open below) — divider boundary

| # | Test | Status |
|---|------|--------|
| 8 | o on text before divider | Pass |
| 9 | o on text after divider | Pass |

### O (open above) — nested bullets

| # | Test | Status | Notes |
|---|------|--------|-------|
| 10 | BUG-009: O on nested bullet child creates line above it | Fail (expected) | Automated only |
| 11 | BUG-009: O on parent bullet with children creates line above parent | Fail (expected) | Automated only |

### O (open above) — code block boundary

| # | Test | Status | Notes |
|---|------|--------|-------|
| 12 | BUG-009: O on text after code block creates line between code and text | Fail (expected) | Automated only |

### o + type + Esc → j/k cursor consistency

| # | Test | Status | Notes |
|---|------|--------|-------|
| 13 | BUG-003: o on bullet + type + Esc, then k returns to original | Fail (expected) | Off by 1 |
| 14 | BUG-003: o on nested todo + type + Esc, then k returns to original | Fail (expected) | Off by 1 |
| 15 | BUG-003: o on heading before code block + type + Esc, then j enters code block | Fail (expected) | Cursor desync near code |

### I/A — cursor position on various blocks

| # | Test | Status | Notes |
|---|------|--------|-------|
| 16 | BUG-008: I on bullet: text should be prepended | Fail (expected) | Isolated world |
| 17 | BUG-008: A on nested bullet child: text should be appended | Fail (expected) | Isolated world |
| 18 | BUG-008: I on todo: text should be prepended | Fail (expected) | Isolated world |
| 19 | BUG-008: A on quote block: text should be appended | Fail (expected) | Isolated world |

### I/A + Esc → j/k consistency

| # | Test | Status |
|---|------|--------|
| 20 | I on heading + type + Esc, j moves to next block | Pass |
| 21 | A on numbered item + type + Esc, j moves to next item | Pass |
| 22 | I on text before code block + type + Esc, j navigates into code block | Pass |

### o on mixed content / empty lines

| # | Test | Status |
|---|------|--------|
| 23 | o on quote in mixed section | Pass |
| 24 | o on empty line in mixed section | Pass |

### o/O + Esc (empty line creation)

| # | Test | Status |
|---|------|--------|
| 25 | o + Esc immediately creates and keeps empty line | Pass |
| 26 | O + Esc immediately on nested bullet | Pass |

### BUG-013: Markdown shortcut block conversion + Escape (active_line desync)

| # | Test | Status | Notes |
|---|------|--------|-------|
| 27 | ## heading + Enter + Escape: active_line matches DOM cursor | Fail (expected) | BUG-013: active_line off by 1 |
| 28 | - bullet + Enter + Escape: active_line matches DOM cursor | Fail (expected) | BUG-013: active_line off by 1 |
| 29 | > quote + Enter + Escape: active_line matches DOM cursor | Fail (expected) | BUG-013: active_line off by 1 |
| 30 | ## heading + Escape (no Enter): active_line matches DOM cursor | Fail (expected) | BUG-013: intermittent desync |

## cross-block-types.spec.ts (170 tests)

Systematic testing of every basic operation across all editable block types:
plain text, heading 1/2/3, bullet, nested bullet, numbered, todo, nested todo, quote, callout, toggle.

### h/l across block types (24 tests)

| # | Test | Block types | Status |
|---|------|-------------|--------|
| 1-12 | l moves right on {type} | All 12 types | Pass |
| 13-24 | h moves left on {type} | All 12 types | Pass |

### 0/$ across block types (24 tests)

| # | Test | Block types | Status |
|---|------|-------------|--------|
| 25-36 | 0 goes to col 0 on {type} | All 12 types | Pass |
| 37-48 | $ goes to end of {type} | All 12 types | Pass |

### w/b/e across block types (30 tests)

Tested on blocks with 2+ words (10 block types).

| # | Test | Block types | Status |
|---|------|-------------|--------|
| 49-58 | w advances on {type} | 10 multi-word types | Pass |
| 59-68 | b returns on {type} | 10 multi-word types | Pass |
| 69-78 | e advances on {type} | 10 multi-word types | Pass |

### dw across block types (10 tests)

| # | Test | Block types | Status |
|---|------|-------------|--------|
| 79-88 | dw deletes first word on {type} | 10 multi-word types | Pass |

### ciw across block types (10 tests)

| # | Test | Block types | Status |
|---|------|-------------|--------|
| 89-98 | ciw changes word on {type} | 10 multi-word types | Pass |

### j/k across block type transitions (25 tests)

| # | Test | Status |
|---|------|--------|
| 99-113 | j from "{block}" lands on next block | Pass (15 transitions) |
| 114-123 | k from "{block}" lands on prev block | Pass (10 transitions) |

### V+d across block types (7 tests)

Block types not already in operators-block-types.spec.ts.

| # | Test | Status |
|---|------|--------|
| 124-130 | V+d deletes {type} | Pass (heading 3, nested bullet, nested todo, callout, toggle, todo checked, text after code) |

### yy+p across block types (6 tests)

| # | Test | Status |
|---|------|--------|
| 131-136 | yy+p duplicates {type} | Pass (heading 3, nested bullet, nested todo, quote, callout, toggle) |

### x across block types (12 tests)

| # | Test | Block types | Status |
|---|------|-------------|--------|
| 137-148 | x deletes char on {type} | All 12 types | Pass |

### i insert across block types (12 tests)

| # | Test | Block types | Status |
|---|------|-------------|--------|
| 149-160 | i inserts text on {type} | All 12 types | Pass |

## code-block-nav.spec.ts (23 tests, serial)

### j/k entering and within code block

| # | Test | Status |
|---|------|--------|
| 1 | j from heading enters code block first line | Pass |
| 2 | j moves down through code block lines | Pass |
| 3 | k moves up through code block lines | Pass |
| 4 | BUG-010: k from code block first line exits to block above | Fail (expected) |

### BUG-010: j exit from code block

| # | Test | Status | Notes |
|---|------|--------|-------|
| 5 | j through all code block lines reaches last line | Pass | |
| 6 | BUG-010: j on last code block line exits to block below | Fail (expected) | Ghost line |
| 7 | j on ghost line (past last code line) exits code block | Pass | Second j exits |
| 8 | i on ghost line returns to editable content | Pass | |

### j/k round-trip

| # | Test | Status |
|---|------|--------|
| 9 | j then k round-trip stays on same code block line | Pass |

### h/l within code block

| # | Test | Status |
|---|------|--------|
| 10 | l moves right within code block line | Pass |
| 11 | h moves left within code block line | Pass |

### desired_column preservation

| # | Test | Status |
|---|------|--------|
| 12 | desired_column preserved when entering code block from above | Pass |

### Insert mode in code block

| # | Test | Status |
|---|------|--------|
| 13 | i in code block enters insert, Esc returns to normal on same line | Pass |

### o/O in code block

| # | Test | Status | Notes |
|---|------|--------|-------|
| 14 | BUG-011: o inside code block creates new line below within block | Fail (expected) | execCommand newline fails |

### Code block re-entry

| # | Test | Status |
|---|------|--------|
| 15 | enter code block, exit below, k re-enters code block last line | Pass |

### Code block creation and editing

| # | Test | Status | Notes |
|---|------|--------|-------|
| 16 | BUG-012: type ``` to create code block, type inside, Escape keeps cursor | Fail (expected) | Now asserts `vim active_line === DOM cursor block` |
| 17 | type inside existing code block, Escape stays on same code line | Pass | |

### Code block exit (BUG-029)

| # | Test | Status | Notes |
|---|------|--------|-------|
| 18 | BUG-029: j exiting code block syncs DOM cursor with active_line | Fail (expected) | Asserts BOTH DOM index and active_line advance |

### BUG-012 strong reproducer (existing-paragraph trigger)

| # | Test | Status | Notes |
|---|------|--------|-------|
| 19 | BUG-012: convert existing non-empty paragraph to code block via ``` keeps active_line in sync | Fail (expected) | Triggers refreshLines stale-ref by destroying existing element in place |

### desired_column corruption in multi-line code blocks (BUG-035 / BUG-036)

| # | Test | Status | Notes |
|---|------|--------|-------|
| 20 | BUG-036: h in code block preserves visual column for subsequent j/k | Fail (expected) | h/l set desired_column to absolute textContent offset |
| 21 | BUG-035: f in code block preserves visual column for subsequent j | Fail (expected) | f/F/t/T set desired_column to absolute textContent offset |

### x in code block (BUG-047)

| # | Test | Status | Notes |
|---|------|--------|-------|
| 22 | BUG-047: x at line-end position in code block does not destroy block or insert 'x' | Pass | Range-based delete + dispatched input event bypasses execCommand("cut") |
| 23 | BUG-047: x in middle of code-block line deletes exactly one character | Pass | Positive case: same code path produces correct one-char delete |

## undo-redo.spec.ts (17 tests, serial)

### Basic Undo

| # | Test | Status |
|---|------|--------|
| 1 | u undoes a single dw | Pass |
| 2 | u undoes an insert mode edit | Pass |
| 3 | u undoes x (single char delete) | Pass |

### Basic Redo

| # | Test | Status |
|---|------|--------|
| 4 | r redoes after u | Pass |

### Consecutive Undo

| # | Test | Status |
|---|------|--------|
| 5 | multiple u undoes consecutive dw one by one | Pass |

### Consecutive Redo

| # | Test | Status |
|---|------|--------|
| 6 | multiple r redoes consecutive undos | Pass |

### Redo Invalidation

| # | Test | Status |
|---|------|--------|
| 7 | new edit after undo clears redo history | Pass |

### Mode Preservation

| # | Test | Status |
|---|------|--------|
| 8 | u keeps normal mode | Pass |
| 9 | r keeps normal mode | Pass |

### Mixed Operations

| # | Test | Status |
|---|------|--------|
| 10 | repeated u eventually restores original after mixed edits | Pass |

### Rapid Undo/Redo

| # | Test | Status |
|---|------|--------|
| 11 | rapid u u r r cycle restores final state | Pass |

### Visual Line Selection + Undo/Redo

| # | Test | Status |
|---|------|--------|
| 12 | V + 3j + d deletes 4 lines, u restores them | Pass |
| 13 | V + 3j + d + u + r re-deletes the lines | Pass |
| 14 | V + large selection (5j) + d + u restores all | Pass |
| 15 | V + d stays in normal mode after delete | Pass |

## visual-line.spec.ts (1 test, serial)

### Pending operator state leaks

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | BUG-014: g pending state leaks across V→Esc into normal mode | Pass | Visual reducers' Escape path now clears `pending_operator` before transitioning to normal |

---

## Related Docs

- [Known Bugs](known-bugs.md) — BUG-001 through BUG-014, BUG-029, BUG-035, BUG-036
- [Bug Investigation](test-overhaul/bug-investigation.md) — full latent-bug catalog (BUG-014 through BUG-043)
- [Missing Features](missing-features.md) — MISSING-001 through MISSING-019
