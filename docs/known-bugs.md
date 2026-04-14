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
- **Test**: `stress-fast-user.spec.ts` → "o→type→Esc→k returns to original block"
- **Reproduction**: Navigate to "Plain text line 3" (block index 4). Press o, type "new line via o", Escape. Then k. DOM cursor ends up on block 3 instead of block 4.
- **Expected**: k returns to block 4 (the original "Plain text line 3")
- **Actual**: k returns to block 3 (one above the original)
- **Context**: After `o` creates a new line below and Escape returns to normal mode, the vim_info line mapping appears off by one. This is a variant of the cursor desync after insert operations.
- **Severity**: High — o is a frequently used Vim command
