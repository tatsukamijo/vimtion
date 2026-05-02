# Missing Features

Vim operations that users would expect but are not yet implemented. Discovered during E2E test development.

## MISSING-001: Numeric count prefix for operators

- **Detected**: 2026-04-14
- **Impact**: High
- **Example**: `d3w` (delete 3 words), `5j` (move down 5 lines)
- **Current behavior**: Number keys are ignored when a pending operator is active. `d3w` sends `d`, then `3` (which clears the pending operator via default case), then `w` (standalone word jump).
- **Expected Vim behavior**: Count prefix multiplies the motion — `d3w` deletes 3 words, `3dd` deletes 3 lines.

## MISSING-002: `db` (delete backward word)

- **Detected**: 2026-04-14
- **Impact**: Medium
- **Context**: `handlePendingOperator` for `d` does not handle `b` key. Falls through to `default: return true`.
- **Expected Vim behavior**: `db` deletes from cursor backward to the start of the previous word.

## MISSING-003: `de` (delete to end of word)

- **Detected**: 2026-04-14
- **Impact**: Medium
- **Context**: `handlePendingOperator` for `d` does not handle `e` key.
- **Expected Vim behavior**: `de` deletes from cursor to the end of the current word (inclusive).

## MISSING-004: `dW`, `dB`, `dE` (WORD-based delete motions)

- **Detected**: 2026-04-14
- **Impact**: Low
- **Context**: `handlePendingOperator` for `d` does not handle `W`, `B`, or `E` keys.
- **Expected Vim behavior**: Same as `dw`/`db`/`de` but using whitespace-only word boundaries (WORD).

## MISSING-005: `c` operator in character-wise visual mode

- **Detected**: 2026-04-14
- **Impact**: High
- **Context**: `visualReducer` handles `d`, `x`, `y` but not `c` or `s`. The visual line mode reducer (`visualLineReducer`) does handle `c`/`s`.
- **Expected Vim behavior**: In visual mode, `c` should delete the selection and enter insert mode.

## MISSING-006: `cb`, `ce`, `cW`, `cB`, `cE` (change motions)

- **Detected**: 2026-04-14
- **Impact**: Medium
- **Context**: `handlePendingOperator` for `c` mirrors `d` — only supports `c`, `w`, `$`, `0`, `{`, `}`, `f/F/t/T`, `i/a`.
- **Expected Vim behavior**: Same as delete counterparts but entering insert mode after.

## MISSING-007: `.` (dot repeat)

- **Detected**: 2026-04-14
- **Impact**: High
- **Expected Vim behavior**: `.` repeats the last editing command (e.g., `dw`, `ciw`, `x`).

## MISSING-008: `r{char}` (replace character)

- **Detected**: 2026-04-14
- **Impact**: N/A (conflict)
- **Note**: `r` is currently mapped to redo. In standard Vim, `r{char}` replaces the character under cursor. Redo is `Ctrl+r` in Vim.
- **Expected Vim behavior**: `r` enters single-character replace mode, `Ctrl+r` is redo.

## MISSING-009: `/` and `?` (search)

- **Detected**: 2026-04-14
- **Impact**: High
- **Expected Vim behavior**: `/` opens forward search prompt, `?` opens backward search. `n`/`N` jump to next/previous match.

## MISSING-010: `^` (first non-whitespace character)

- **Detected**: 2026-04-14
- **Impact**: Medium
- **Expected Vim behavior**: `^` moves cursor to the first non-whitespace character on the line.

## MISSING-011: `%` (matching bracket jump)

- **Detected**: 2026-04-14
- **Impact**: Medium
- **Expected Vim behavior**: `%` jumps to the matching bracket/parenthesis/brace.

## MISSING-012: `;` and `,` (repeat character search)

- **Detected**: 2026-04-14
- **Impact**: Medium
- **Expected Vim behavior**: `;` repeats the last `f`/`t`/`F`/`T` search. `,` repeats it in the opposite direction.

## MISSING-013: `J` (join lines)

- **Detected**: 2026-04-14
- **Impact**: Medium
- **Expected Vim behavior**: `J` joins the current line with the next line, separated by a space.

## MISSING-014: `~` (toggle case)

- **Detected**: 2026-04-14
- **Impact**: Low
- **Expected Vim behavior**: `~` toggles the case of the character under cursor and advances.

## MISSING-015: `>>` / `<<` (indent / outdent)

- **Detected**: 2026-04-14
- **Impact**: Medium
- **Expected Vim behavior**: `>>` indents the current line, `<<` outdents. In Notion context, this could map to Tab/Shift+Tab for block indentation.

## MISSING-016: `gj` / `gk` (display line movement)

- **Detected**: 2026-04-14
- **Impact**: Low
- **Expected Vim behavior**: Move by display lines (wrapped lines) rather than logical lines.

## MISSING-017: `zz` / `zt` / `zb` (scroll positioning)

- **Detected**: 2026-04-14
- **Impact**: Low
- **Expected Vim behavior**: `zz` centers current line on screen, `zt` scrolls to top, `zb` scrolls to bottom.

## MISSING-018: Marks (`m{a-z}`, `'{a-z}`)

- **Detected**: 2026-04-14
- **Impact**: Low
- **Expected Vim behavior**: `m{a-z}` sets a mark at current position, `'{a-z}` jumps to that mark.

## MISSING-019: Named registers (`"a-z`)

- **Detected**: 2026-04-14
- **Impact**: Medium
- **Expected Vim behavior**: `"a` selects register `a` for the next yank/delete/paste. Allows multiple clipboards.
