# Workflow Scenario Designs (Task #4)

Owner: scenario-author
Status: Design only — no test code yet.

## Why these scenarios

The current 391-test suite (`docs/e2e-test-catalog.md`) is overwhelmingly **isolated**: "press j, assert cursor moved one line." Real users execute **flows** in which `vim_info` state, `lines[]` cache, undo stack, scroll position, and DOM mutations all accumulate. Bugs like BUG-001 (20j → 20k drift), BUG-002 (heading-edit-then-code-entry desync), BUG-003 (`o→Esc→k` off-by-one), and BUG-012/013 (markdown-conversion `active_line` staleness) only manifest when state has been built up by prior actions.

`test/e2e/stress-fast-user.spec.ts` is the only existing scenario-style spec — but it bundles ~28 micro-tests inside one `describe.serial` block, separated by undo-resets. The scenarios below are **single, end-to-end stories** with continuous invariant checking after every keystroke.

## Conventions used in pseudocode

- `goTo("X")` — click block containing text "X", press Esc, sync to normal mode (existing `goToBlock` helper).
- `j`, `k`, `w`, `b`, `dd`, `o`, `O`, `i`, `I`, `a`, `A`, `Esc`, `u`, `r`, `gg`, `G`, `Ctrl+d`, `Ctrl+u` — keyboard primitives.
- `type("foo")` — `page.keyboard.type("foo", {delay: 30})` (real typist speed).
- `fast(...)` — sequential `page.keyboard.press()` with no inter-press delay (BUG-001 reproduction style).
- `assert.invariant()` — see "Invariants" subsection of each scenario.
- `wait.conversion("type")` — wait until Notion finishes converting the current paragraph to a new block type. **(Depends on env-architect providing this helper — currently no such helper exists; tests do `page.waitForTimeout(50–100)` which is flaky for markdown conversions.)**

## Continuous invariants (apply to ALL scenarios)

After every keystroke (or every group of 2-3 keystrokes for performance):

| Invariant | Check |
|-----------|-------|
| **I1. cursor sync** | `vim_info.active_line - 1 === getActualCursorBlockIndex(page)` |
| **I2. mode consistency** | `getMode()` matches the mode expected at that phase of the script |
| **I3. line-count integrity** | `vim_info.lines.length === document.querySelectorAll('[data-content-editable-leaf="true"]').length` (filtered to editable) |
| **I4. no orphaned operator** | After any operator completes (`d`/`c`/`y` followed by motion), `vim_info.pending_operator === null` |
| **I5. scroll-into-view** | The block at `active_line` is in viewport (commits `25c0001` ensures this; regression check) |

Scenarios cite *additional* invariants where relevant.

---

## Scenario 1 — "Meeting notes capture" (note-taking session)

### Story
User opens the page, jumps to the headings section, appends a meeting tag to a heading, dictates two paragraphs, then promotes them to bullets via the markdown shortcut `-`, indents one with Tab, scrolls back up to fix a typo, undoes once, redoes.

### Action sequence (~22 actions)
```
1.  goTo("Section 3: Headings")
2.  j                                  // → "Heading 1 test"
3.  j                                  // → "Heading 2 test"
4.  j                                  // → "Heading 3 test"
5.  A   type(" — 2026-05-03")  Esc     // append meeting date
6.  o   type("We discussed the roadmap.")  Esc
7.  o   type("Next milestones agreed.")    Esc
8.  o   type("- Review specs")  Enter      // markdown → bullet [BUG-013 trigger]
9.  Esc                                    // [I1 likely fails per BUG-013]
10. o   type("- Update CHANGELOG")  Enter  // markdown → bullet [BUG-013]
11. Esc
12. o   type("## Action Items")  Enter     // markdown → H2 [BUG-013]
13. Esc
14. k k                                    // walk back two blocks
15. cw  type("dictated")  Esc              // change first word
16. u                                      // undo cw
17. r                                      // redo cw
18. u u u                                  // undo three steps
19. G                                      // jump to end
20. gg                                     // jump to top
21. j  Ctrl+d                              // half-page down
22. assert.full_state()                    // final invariants
```

### Additional invariants
- After step 9, 11, 13 (post-conversion Esc): `active_line - 1 === getActualCursorBlockIndex()` — **this is the BUG-013 surface point**.
- Between steps 8–13: line count must increase by exactly +3 over starting count.
- After steps 18 (3× undo): line count must equal pre-step-12 count.
- After step 17 redo: text of edited block matches "dictated" position.

### Bugs surfaced
- **BUG-013** (heavily — three markdown conversions in a row).
- **BUG-003** (`o` followed by Esc; if user presses `k` after, off-by-one).
- Latent: undo grouping across markdown conversions (no existing test covers undo + conversion).

### Estimated runtime
~14 s (22 actions × 30 ms typing + ~50 ms waits + conversions).

### Dependencies on env-architect
- Needs `wait.conversion(type)` helper. Without it, steps 8/10/12 race against Notion's async paragraph→block mutation and produce intermittent failures.
- Does **not** require headed mode.

---

## Scenario 2 — "Code editing with prose" (code-block-centric)

### Story
User navigates into the existing JS code block, inspects it, exits to the paragraph below, writes a one-line explanation, creates a *new* code block via ` ``` ` markdown, types one statement inside, escapes, then bounces between the two code blocks with j/k.

### Action sequence (~20 actions)
```
1.  goTo("Section 8: Code block")          // heading
2.  j                                      // enter code block line 1
3.  j                                      // code line 2
4.  j                                      // code line 3
5.  j                                      // code line 4 (last real line)
6.  j                                      // [BUG-010: ghost line OR stuck]
7.  j                                      // expected exit → "Text after code block"
8.  assertCursorBlockText() === "Text after code block"
9.  A   type(" — see explanation below")  Esc
10. o   type("Now we add another snippet:") Esc
11. o   type("```js")  Enter               // markdown → new code block [BUG-012]
12. type("console.log('hello');")
13. Esc                                    // [BUG-012: active_line points to wrong block]
14. assert.invariant_I1()                  // **expected to fail per BUG-012**
15. k                                      // back to "Now we add..." paragraph
16. k                                      // back to "Text after code block"
17. k                                      // expected: enter ORIGINAL code block last line [BUG-010 reverse]
18. i   type("// edited")  Esc             // edit inside code block
19. j j j j                                // walk back out forward
20. G                                      // jump to bottom; ensure no crash
```

### Additional invariants
- Steps 2–5: every `j` increments `active_line` by exactly 1 and DOM cursor stays inside the code block element.
- Step 6: must NOT silently land on a ghost line; either exit or stay (current bug: lands on ghost).
- Step 14: `active_line` MUST point to the newly created code block's leaf, not a stale paragraph index.
- Step 18: typing inside code preserves `vim_info.lines.length` (no spurious refresh).

### Bugs surfaced
- **BUG-010** (steps 6, 7, 17 — both directions across code-block boundary).
- **BUG-012** (step 11–14 — markdown ``` conversion + Escape).
- **BUG-011** (latent — if `o` is added inside the code block).
- **BUG-002** (step 9, 10 — A/Esc near a code block boundary; possible heading-side desync).

### Estimated runtime
~12 s.

### Dependencies on env-architect
- Same `wait.conversion("code")` helper as Scenario 1.
- Needs decision on whether to use **headed mode** for code-block scenarios. Per BUG-009/BUG-008 notes, some code-block behaviors differ between headed and headless. If env-architect builds a headed lane, this scenario should run in both.
- Optionally: helper to query the **language label** of a code block (to verify ```js produced a JS code block, not generic).

---

## Scenario 3 — "Daily standup todo" (todo workflow)

### Story
User goes to the todo section, edits an existing todo, deletes a nested child todo, undoes, navigates back to parent, creates two new todos via `o`, indents one with Tab in insert mode, jumps around with j/k, then dd's a completed todo.

### Action sequence (~22 actions)
```
1.  goTo("Section 6: Todo list")
2.  j                                       // → "Todo unchecked 1"
3.  A   type(" (in progress)")  Esc
4.  j                                       // → "Todo unchecked 2"
5.  j                                       // → "Nested todo child" (nested block)
6.  dd                                      // delete nested
7.  u                                       // undo
8.  assert: nested child restored
9.  k                                       // → "Todo unchecked 2"
10. o   type("Buy milk")  Enter             // Notion creates new todo (sibling)
11. Esc
12. o   type("Walk dog")  Enter
13. Esc
14. assert.invariant_I1()                   // post-o sequence — **BUG-003 surface**
15. k                                       // back to "Buy milk"
16. i   Tab                                 // attempt indent in insert mode
17. type(" - extra detail")
18. Esc
19. assert: indent applied (block became nested under parent)
20. j   dd                                  // delete next todo
21. u u u                                   // undo back through edits
22. r r                                     // redo two
```

### Additional invariants
- After step 6 (dd of nested): `lines.length` decreases by 1; cursor lands on the next sibling, not on the parent.
- After steps 11/13 (`o` + Esc): `active_line - 1 === getActualCursorBlockIndex()`. **This is BUG-003 surface.**
- After step 16 Tab in insert mode: the block becomes a child (assert by reading the DOM — Notion adds nesting via `data-block-id` parent change).

### Bugs surfaced
- **BUG-003** (`o→type→Esc→k` off-by-one — happens at steps 11, 13, 15).
- **BUG-001** (latent if `j j j j j j` rapid sections are added).
- Latent: nested-block deletion may leave `vim_info.lines` stale if Notion collapses parent (no existing test).

### Estimated runtime
~16 s.

### Dependencies on env-architect
- Needs clarity on whether Vimtion has ANY binding that toggles a todo's checkbox (per CLAUDE.md, no such binding exists by default). If env-architect determines users want this, scenario should use Notion-native Cmd+Enter to toggle. Otherwise step uses `A` text edit instead.
- Tab in insert mode must pass through to Notion (verify in env audit).

---

## Scenario 4 — "Refactor & paste" (yank/paste/delete cycle)

### Story
User finds a paragraph in the operator-motions section, yanks the entire line with `yy`, navigates to the bottom of the page, pastes with `p`, deletes the original `dd`, then undoes/redoes the chain to verify reversibility.

### Action sequence (~18 actions)
```
1.  goTo("hello(world) and [brackets] and {braces} here")
2.  yy                                       // yank line
3.  goTo("Final line of test page")
4.  p                                        // paste below
5.  assert: line count = original + 1
6.  assert: pasted block text === yanked text
7.  assert: active_line === pasted block (NOT "Final line")
8.  goTo("hello(world) and [brackets] and {braces} here")
9.  dd                                       // delete original
10. assert: line count = original (one removed, one added)
11. assert: cursor on next sibling
12. u                                        // undo dd
13. assert: line count = original + 1
14. u                                        // undo p
15. assert: line count = original
16. r r                                      // redo both
17. j  k                                     // sanity-check navigation
18. G                                        // jump to end without crash
```

### Additional invariants
- After `yy`: `vim_info.yank_buffer` (or equivalent) === full line text including trailing newline semantics.
- After every `dd`/`p`/`u`/`r`: invariant I1 must hold.
- After step 16 (redo redo): final state must equal state after step 9 (deterministic redo).

### Bugs surfaced
- Latent: `vim_info.lines` may not refresh fast enough after `p` (no existing test asserts cursor lands on pasted block).
- **BUG-001** family if `goTo` uses j/k repeats internally.
- Latent yank-buffer corruption if scenario interleaves with another yank.

### Estimated runtime
~10 s.

### Dependencies on env-architect
- None beyond existing env.

---

## Scenario 5 — "Speed-typist burst" (held-key + rapid mode flap)

### Story
User imitates a Vim power user: holds j down for 30 lines, holds k for 30 lines, then bursts through 10 consecutive blocks with rapid `i → char → Esc → j` (no waits), then runs `w/b` cycles within a long line.

### Action sequence (~30 actions)
```
1.  goTo("Plain text line 1")               // baseline N
2.  fast(j × 30)                            // rapid descent [BUG-001 trigger]
3.  assert: active_line === N + 30 OR lineCount cap
4.  assert.invariant_I1()                   // DOM cursor matches
5.  fast(k × 30)                            // rapid ascent [BUG-001 trigger]
6.  assert: active_line === N               // **expected to fail per BUG-001**
7.  assert.invariant_I1()
8.  // Rapid mode flap across 10 blocks
9.  for blockIdx in [N..N+9]:
10.   fast(i, "x", Esc, j)                  // no waitForTimeout
11.   assert.invariant_I1() every 3rd iter
12. // Word motion bursts
13. goTo("The quick brown fox jumps over the lazy dog")
14. fast(w × 8)                             // rapid w bursts
15. assert: cursor on "dog" or near end
16. fast(b × 8)
17. assert: cursor on "The"
18. // Cycle i/Esc 20× without moving
19. for i in 0..19: fast(i, Esc)
20. assert.invariant_I1()                   // no drift after 20 cycles
21. fast(j × 5, k × 5)                      // micro-cycle drift check
22. assert.invariant_I1()
```

### Additional invariants
- I1 must hold after every burst (not just every keystroke — tested at burst boundaries).
- `desired_column` must survive vertical bursts (after step 21, column should match column at step 13).
- `pending_operator` must be null after every burst (no half-applied `d` or `c`).

### Bugs surfaced
- **BUG-001** (steps 2–7, primary).
- **BUG-002** (if N's path crosses Section 8 heading).
- Latent: `MutationObserver` debouncing may produce stale `lines[]` under sustained load.

### Estimated runtime
~8 s (mostly key bursts, almost no typing).

### Dependencies on env-architect
- **Strongly recommended:** env-architect should provide a `holdKey(key, count)` helper using CDP `Input.dispatchKeyEvent` with `autoRepeat: true`, which simulates browser-level autorepeat more faithfully than sequential `keyboard.press()` calls. Sequential `press()` produces discrete keydown/keyup pairs; real held keys have keydown-only repeats.
- If only sequential is available, scenario still surfaces BUG-001 but with weaker fidelity.

---

## Scenario 6 — "Markdown shortcut chaos" (BUG-013 family stress)

### Story
User starts on a fresh paragraph and converts it (and 5 freshly-`o`-created paragraphs) using every Notion markdown shortcut in sequence: `##`, `-`, `1.`, `>`, `[]`, ` ``` `. Escape after each. Then validates total line count and undo reversibility.

### Action sequence (~25 actions)
```
1.  goTo("Plain text line 5")
2.  o   type("## Heading sample")  Enter   Esc   // → H2 [BUG-013]
3.  assert.invariant_I1()                        // **fails**
4.  o   type("- Bullet sample")    Enter   Esc   // → bullet [BUG-013]
5.  assert.invariant_I1()                        // **fails**
6.  o   type("1. Numbered sample") Enter   Esc   // → numbered [BUG-013]
7.  assert.invariant_I1()                        // **fails**
8.  o   type("> Quote sample")     Enter   Esc   // → quote [BUG-013]
9.  assert.invariant_I1()                        // **fails**
10. o   type("[] Todo sample")     Enter   Esc   // → todo [BUG-013]
11. assert.invariant_I1()                        // **fails**
12. o   type("```py")              Enter   type("x = 1")   Esc  // → code [BUG-012]
13. assert.invariant_I1()                        // **fails**
14. // Validation
15. G                                            // jump to end
16. assert: lineCount === original + 6
17. gg                                           // jump to top
18. j j j j j j j j                              // walk down
19. assert: each block type matches expectation (H2, bullet, numbered, quote, todo, code)
20. // Undo chain
21. u u u u u u                                  // undo all 6 conversions
22. assert: line count back to original
23. r r r r r r                                  // redo all 6
24. assert: line count expanded again
25. G                                            // final position check
```

### Additional invariants
- I1 is the **headline invariant** for this scenario — fails at every step 3, 5, 7, 9, 11, 13.
- Step 16: lineCount delta is exactly +6 (every `o` + conversion produces exactly one new block).
- Step 19: per-block type assertion uses `getActualCursorBlockText()` + closest selector to determine block type.
- Step 22: after 6 undos, every conversion-pair must be reversed (one undo unconverts, one undo undoes the `o`? — TBD; this scenario should DOCUMENT actual undo grouping).

### Bugs surfaced
- **BUG-013** (every variant — H2, bullet, numbered, quote, todo).
- **BUG-012** (code block via ```).
- Latent: undo behavior across markdown conversion is undefined; this scenario CHARACTERIZES it.

### Estimated runtime
~20 s (typing-heavy; six `Enter` waits for conversion + six undos with ~80 ms each).

### Dependencies on env-architect
- **Hard dependency:** `wait.conversion(type)` helper. Without it, half the assertions race the mutation observer and produce false positives.
- May expose a Vimtion bug where `MutationObserver` debouncing in `line-management.ts:120-128` stays stale longer than 50 ms. env-architect's invariant system (Task #2) may need to expose `vim_info.lines` length directly so we can wait on it changing.

---

## Scenario 7 — "Long browse-then-edit session" (scroll + multi-section editing)

### Story
User opens the page, jumps to the bottom with `G`, edits the final paragraph, half-page scrolls up via `Ctrl+u`, navigates to the quote section with j/k, changes a word with `cw`, then jumps back to top with `gg`, deletes the first content word with `dw`, and finally undoes the entire session.

### Action sequence (~24 actions)
```
1.  gg                                          // top
2.  G                                           // bottom
3.  assert: active_line === lineCount
4.  A   type(" ✓")  Esc
5.  Ctrl+u                                      // scroll up half page
6.  assert: active_line decreased by ~half pageSize
7.  Ctrl+u                                      // again
8.  // Navigate to quote section by j/k (5–10 motions; exact count varies with state)
9.  k k k k k k k k                             // approximate
10. // Find quote by text
11. assertCursorBlockText() includes "Quote"  OR retry with j/k
12. cw   type("Quoting")   Esc                  // change first word
13. Ctrl+u                                      // up again
14. gg                                          // top
15. j                                           // first content block
16. dw                                          // delete first word
17. u                                           // undo dw
18. G                                           // jump back to bottom
19. // Undo all session edits
20. u u u u u u                                 // undo dw + cw + A
21. assert: page text content matches original
22. r r r r r r                                 // redo all
23. assert: page text content matches step 18 state
24. gg                                          // final
```

### Additional invariants
- After every `Ctrl+u`/`Ctrl+d`: block at `active_line` is in viewport (commit `25c0001` regression check).
- After step 21: `getAllBlockTexts()` must equal initial `getAllBlockTexts()` snapshot taken in beforeAll.
- After every `gg`: `active_line === 1`. After every `G`: `active_line === lineCount`.

### Bugs surfaced
- **BUG-001** (if `j j j j j j j j` in step 9 is rapid).
- **BUG-005** (latent — if scenario uses `$` it would surface end-of-line off-by-one; consider adding a `$` step).
- Scroll desync: latent bug where viewport doesn't follow cursor after Ctrl+u (no existing coverage).
- Undo determinism across long sessions.

### Estimated runtime
~14 s.

### Dependencies on env-architect
- **Soft dependency:** confirmation that `Ctrl+d`/`Ctrl+u` reliably trigger Vimtion's half-page scroll in headless Chromium (Notion intercepts some Ctrl combinations). Per CLAUDE.md, Ctrl+d/u/f/b are "reserved for Vim page navigation" — but reservation in code ≠ guarantee in test env.
- Helper to snapshot full page text for diff-on-undo comparison.

---

## Scenario 8 — "Visual-mode multi-line refactor" (V/v + operators across blocks)

### Story
User selects four lines with `V + 3j`, deletes them with `d`, undoes; then character-wise selects `0 → f)` to grab a parenthesized expression, yanks, navigates to the bottom, pastes inline, undoes, redoes.

### Action sequence (~22 actions)
```
1.  goTo("Plain text line 1")
2.  V                                             // visual line mode
3.  j j j                                         // extend 4 lines selected
4.  assert: 4 lines highlighted (background color present)
5.  d                                             // delete 4 lines
6.  assert: lineCount -= 4
7.  assert: mode === "normal"
8.  u                                             // undo
9.  assert: lineCount restored
10. goTo("hello(world) and [brackets] and {braces} here")
11. 0                                             // start of line
12. v                                             // visual char mode
13. f )                                           // extend to ")"
14. y                                             // yank
15. Esc
16. goTo("Final line of test page")
17. A   space   Esc                               // append a space
18. p                                             // paste
19. assert: current block text contains "hello(world)"
20. u                                             // undo paste
21. u                                             // undo space
22. r r                                           // redo both
23. // Char-wise visual delete check
24. v   l l l l   d
25. assert: 4 chars removed from current line
```

### Additional invariants
- During V mode (steps 2–5): `vim_info.mode === "visual-line"` and selected lines have the visual-line background CSS class.
- Step 7 transition: V → normal cleanly (no leftover selection background).
- After every `d`/`y` in visual modes: `pending_operator` is null and selection is cleared.
- After step 19 paste: pasted text is exactly `"hello(world)"` (yank-buffer integrity).

### Bugs surfaced
- Latent: cursor placement after `V+d` across mixed block types (no existing test asserts position).
- Latent: yank buffer interactions between V-line yank and v-char yank (no existing test).
- **BUG-005** could appear if `f )` lands one past the `)` due to off-by-one on inclusive motions.

### Estimated runtime
~12 s.

### Dependencies on env-architect
- None beyond existing env.

---

## Scenario 9 (OPTIONAL — blocked on env-architect) — "IME mixed input"

### Story
User toggles between Japanese IME and English while inserting and editing. Tests that Vimtion's `jk` escape sequence does not fire while IME composition is active.

### Why deferred
Per task description: "*if env-architect's report flags this as feasible*". Playwright does not natively simulate IME composition events. env-architect must determine whether CDP `Input.imeSetComposition` is reachable, or whether headed mode + manual IME activation is required.

### High-level action shape (if unblocked)
```
1.  goTo("Plain text line 1")
2.  i
3.  ime.compose("にほん")     // composition events fired
4.  ime.commit()             // produces "日本"
5.  type("jk")               // Vimtion MUST NOT escape (composition was active)
6.  Esc                      // explicit escape
7.  assert: text contains "日本jk"
8.  assert: mode === "normal"
```

### Bugs surfaced
- Latent: if Vimtion escapes on `jk` mid-composition, real Japanese users lose input.

### Dependencies
- **Hard block** on env-architect's IME feasibility report.

---

## Cross-scenario coverage matrix

| Scenario | BUG-001 | BUG-002 | BUG-003 | BUG-010 | BUG-011 | BUG-012 | BUG-013 |
|----------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| 1. Notes |    | ✓ | ✓ |    |    |    | ✓✓✓ |
| 2. Code  |    | ✓ |    | ✓✓ | ✓ | ✓ |    |
| 3. Todo  | ✓  |    | ✓✓ |    |    |    |    |
| 4. Refactor | ✓ |    |    |    |    |    |    |
| 5. Speed | ✓✓ | ✓ |    |    |    |    |    |
| 6. Markdown chaos |   |    | ✓ |    |    | ✓ | ✓✓✓ |
| 7. Long session | ✓ |    |    |    |    |    |    |
| 8. Visual |    |    |    |    |    |    |    |

`✓` = surfaces; `✓✓` = primary surface; `✓✓✓` = stress-tests the bug class.

---

## Estimated total runtime

| Scenario | Runtime |
|----------|---------|
| 1. Notes | 14 s |
| 2. Code | 12 s |
| 3. Todo | 16 s |
| 4. Refactor | 10 s |
| 5. Speed | 8 s |
| 6. Markdown chaos | 20 s |
| 7. Long session | 14 s |
| 8. Visual | 12 s |
| **Total (sequential, no reload)** | **~106 s** |

Plus ~30 s for one-time test page setup via Notion API + Vimtion init.

---

## Dependencies summary (for env-architect / invariant-guard handoff)

| Need | Owner | Used by |
|------|-------|---------|
| `wait.conversion(type)` helper | env-architect | Scenarios 1, 2, 6 |
| `holdKey(key, count)` autorepeat helper | env-architect | Scenario 5 |
| Headed-mode lane | env-architect | Scenario 2 (and any scenario where BUG-008/009 might mask) |
| IME composition support | env-architect | Scenario 9 (blocked) |
| Continuous `assert.invariant_I1()` after every action | invariant-guard (Task #2) | All scenarios |
| `assert.invariant_I3()` (lines.length === DOM count) | invariant-guard (Task #2) | All scenarios |
| `getYankBuffer()` helper | helpers.ts | Scenario 4, 8 |
| `getAllBlockTexts()` snapshot/diff | helpers.ts (exists) | Scenario 7 |
| `Ctrl+d/u` reliability confirmation | env-architect | Scenario 7 |

---

## Recommended implementation order

1. **Scenario 6** first — pure BUG-013 stress, smallest dependencies once `wait.conversion` lands. Highest signal per minute of test time.
2. **Scenario 5** second — surfaces BUG-001 unambiguously and drives env-architect's `holdKey` helper.
3. **Scenario 2** third — ties code-block bugs (BUG-010/011/012) into one story. Drives headed-mode decision.
4. **Scenario 1** fourth — most realistic user story; validates that the invariant system catches drift across a mixed flow.
5. Scenarios 3, 4, 7, 8 — fill out coverage breadth.
6. Scenario 9 — only after env-architect confirms IME feasibility.
