# Bug Investigation — Vimtion Test Overhaul

Owner: bug-hunter
Scope: (A) reproduction recipes for manual-only bugs BUG-001/002/012; (B) latent bugs found by reading code.

All file:line citations point at `main`-tip code as of this branch.

---

## Part A — Manual-only bug reproduction recipes

### BUG-001: rapid `20j` then `20k` desync — what the test misses

**Existing test** (`test/e2e/stress-fast-user.spec.ts:603-615`):
```ts
for (let i = 0; i < 20; i++) await fastKeys(page, "j");
await page.waitForTimeout(50);
for (let i = 0; i < 20; i++) await fastKeys(page, "k");
await page.waitForTimeout(100);
expect(await getActualCursorBlockIndex(page), "20j→20k: DOM block").toBe(startIdx);
```

**Why the test is too slow.** `fastKeys` calls `page.keyboard.press(key)`, which Playwright internally fires as `keydown → char → keyup` with a small implicit gap (each `await` round-trips the CDP socket). Between every j press, Notion's MutationObserver in `core/line-management.ts:163-170` has time to fire `refreshLines()`, finish reflow, and settle. Real key-repeat (held-down j) fires `keydown` events at 30–60 ms with no time for layout. The desync mode in production happens when refreshLines fires *while* `setActiveLine` is mid-execution — the test never produces that interleaving.

**Where the desync actually originates.** `setActiveLine` in `core/line-management.ts:23-79` does, for normal blocks (line 71-72): `targetElement.click(); targetElement.focus({preventScroll:true});` synchronously, then calls `setCursorPosition`. The `.click()` triggers Notion's internal click handler synchronously, which writes to the DOM — which fires the MutationObserver, which schedules `refreshLines()` (microtask). Then we still execute `setCursorPosition`. On the next `j`, refreshLines may have already mutated `vim_info.lines` and re-found the active element, but the `i = idx + 1` arithmetic at the call site (`vim.ts:2898`) was computed against the *old* index. If virtualization unmounts the original "Plain text line 1" element after scrolling far down, `refreshLines` at `core/line-management.ts:121-128` cannot find `currentActiveElement` (`findIndex === -1`), and silently leaves `active_line` at the stale value.

**Reliable reproduction recipe:**

1. Use real key-repeat instead of discrete presses. CDP exposes this via `page.keyboard.down('j')` followed by waiting for the autorepeat interval, then `up('j')`. To force autorepeat in headless Chromium, dispatch raw `keydown` events with `repeat: true` via `page.evaluate`:
   ```ts
   await page.evaluate(() => {
     const fire = (key: string) => {
       const el = document.activeElement || document.body;
       for (let i = 0; i < 20; i++) {
         el.dispatchEvent(new KeyboardEvent('keydown', {
           key, code: 'KeyJ', bubbles: true, cancelable: true,
           repeat: i > 0,
         }));
       }
     };
     fire('j');
   });
   ```
   This delivers all 20 events on a single microtask flush — refreshLines cannot run between them.
2. Pre-condition the page to a long scroll: navigate to a block far enough down that Notion virtualizes the top blocks. The current test target "Plain text line 1" is at the very top, so it's never unmounted. Pick a target ~30-block window where 20j scrolls past virtualization boundaries.
3. After `20j` + `20k`, assert two things separately:
   - `getActualCursorBlockIndex(page)` (DOM Selection) — what BUG-001 currently checks.
   - `(await getVimState(page)).activeLine` — what's missing. The desync mode is exactly when these two diverge.

**The cleanest single change to make BUG-001 reliably fail:** replace the press loop with a single `page.evaluate(...)` that synchronously dispatches 20 keydowns, then assert both DOM index and `vim_info.active_line` against `startIdx`.

---

### BUG-002: I → type → Esc on heading above code block, then j+k goes wrong

**Existing test** (`stress-fast-user.spec.ts:579-601`, marked `test.fail()`).

**Hypothesis on root cause.** When you press `I` on the heading "Section 8: Code block" and type one character "X":
1. `insertAtLineStart` (`vim.ts:237-241`) calls `jumpToLineStart` → `setCursorPosition(element, 0)` (`navigation/basic.ts:51-57`), then sets `vim_info.mode = "insert"`. Per the BUG-008 root-cause analysis, in insert mode Notion's main-world handlers may stamp over the cursor position the content script just set.
2. Typing "X" mutates the heading's contenteditable. The MutationObserver fires `refreshLines()`. In `core/line-management.ts:121-128`:
   ```ts
   const currentActiveElement = vim_info.lines[vim_info.active_line]?.element;
   ...
   if (currentActiveElement) {
     const newIndex = vim_info.lines.findIndex(line => line.element === currentActiveElement);
     if (newIndex !== -1) vim_info.active_line = newIndex;
   }
   ```
   For a *heading* edited inline, Notion may rewrap the contenteditable with a new node (the heading uses inline rich-text spans whose container can be re-created by the text-formatter). `findIndex === -1` ⇒ active_line keeps stale value. But by sheer coincidence the *same numerical index* now points at the heading's *replacement* element only if no other elements were added/removed; if Notion inserted any helper element (e.g., a placeholder span when the heading transiently shows the "/" menu hint), the indices shift by 1.
3. After Escape, `vim_info.active_line` still points to old index 37 (the heading's old slot). DOM cursor is correctly inside the new heading element, which is now at index 37 *or* shifted to 38. j increments active_line to 38 — which lands inside the code block. k decrements to 37 — but if the heading shifted to 38, 37 is now the block *above* the heading.

**What the test misses.** It asserts `getActualCursorBlockIndex` ≠ `headingIdx` post-k, but does not directly assert that `vim_info.lines.findIndex(l => l.element === <active leaf>)` survived the typing. The bug happens *during* the typing, but the test only inspects post-Escape.

**Recipe to make BUG-002 a reliable, deterministic test:**

1. Capture the heading element's reference before `I`:
   ```ts
   const beforeRef = await page.evaluate(() => {
     const root = document.querySelector('[data-content-editable-root="true"]');
     const leaves = Array.from(root.querySelectorAll('[data-content-editable-leaf="true"]'));
     return leaves.findIndex(l => l.textContent?.includes('Section 8: Code block'));
   });
   ```
2. After `I → type "X" → Esc`, re-find the heading element by text and compare:
   ```ts
   const afterRef = await page.evaluate(() => {
     const root = document.querySelector('[data-content-editable-root="true"]');
     const leaves = Array.from(root.querySelectorAll('[data-content-editable-leaf="true"]'));
     return leaves.findIndex(l => l.textContent?.includes('Section 8: Code blockX'));
   });
   const vimActive = (await getVimState(page)).activeLine - 1; // status bar 1-based
   expect(vimActive, 'active_line tracks heading after edit').toBe(afterRef);
   ```
   If `vimActive !== afterRef`, BUG-002 is captured at its source — the refreshLines mismatch — instead of through the lossy j/k indirection.
3. To force the failure deterministically, edit a heading that has *content following the same line* (forces Notion to re-fragment text spans) — type a character that triggers Notion's auto-format heuristics: e.g., type `*`, which makes Notion think you might be starting bold formatting, and reliably re-creates the leaf wrapper.

**Cleanest single test that always fails when bug is present:** add a third assertion to the existing BUG-002 test before `j` — `expect(vimActive).toBe(afterRef)`. The off-by-one is observable directly without any j/k.

---

### BUG-012: ` ``` ` to create code block, Esc — test passes, manual fails

**Existing test** (`code-block-nav.spec.ts:416-466`).

**What the test asserts (line 465):**
```ts
expect(text).toContain("console.log");
```
Where `text = await getActualCursorBlockText(page)` returns the textContent of whichever leaf currently contains the DOM Selection (`helpers.ts:144-156`). After typing `console.log('test')` into the new code block, the DOM cursor is *inside the code block element you just typed in*, so `getActualCursorBlockText` returns the code block's content. The assertion passes regardless of `vim_info.active_line`.

**What the test does NOT assert:**
1. `vim_info.active_line` matches the DOM index of the code block (the actual bug).
2. `j`/`k` post-Escape land on the expected blocks. Lines 446-456 *log* `lineBefore`, `lineAfter`, `textAfterK` but never `expect()` them.
3. The status bar reflects the right line number.

**Why the bug is invisible to the test.** `refreshLines` (`core/line-management.ts:96-128`) tries to preserve active_line by element reference. But ` ``` ` triggers Notion to *destroy* the original `<div contenteditable="true">` paragraph and *create* a new contenteditable for the code block. The old element ref is no longer in the rebuilt `lines` array → `findIndex === -1` → the `if (newIndex !== -1)` guard at line 125 silently leaves `active_line` pointing at whatever block now occupies the old index. In the test environment the original line is "Plain text line 5" near the start; the code block becomes the new index 6 (or wherever) but `active_line` may still be e.g. 5, pointing at "Plain text line 5" or 4 depending on insertion ordering.

**The DOM cursor is correct because it's controlled by Notion (the user just typed there); but Vimtion's bookkeeping is wrong.** The test reads the *DOM* cursor and concludes everything is fine.

**Reliable reproduction recipe — the missing assertions:**

1. Right after the Escape (line 437-439), capture both:
   ```ts
   const domIdx = await getActualCursorBlockIndex(page);
   const vimIdx = (await getVimState(page)).activeLine - 1;
   expect(vimIdx, 'vim active_line === DOM cursor block').toBe(domIdx);
   ```
   This single assertion will fail whenever BUG-012 manifests.
2. To make the bug reliably *trigger* (not just be detectable), preserve order-dependent state: navigate via j/k to "Plain text line 5" rather than clicking. Clicking calls `handleClick` (`vim.ts:424-485`) which re-syncs `active_line` to `lineIndex`, masking any prior drift. The current test uses `goToBlock` which clicks (`stress-fast-user.spec.ts:46-49`) — this *resets* the bug-trigger condition. Reach the target block via key-only navigation (`gg` then 20j or whatever) so the bug-prone code path is the one being exercised.
3. Trigger the markdown shortcut from a *non-empty* paragraph. The test does `Shift+a → Enter → ```` ` → ...`, which creates a fresh empty paragraph first. The original user-reported manual reproduction is "on a plain text block, enter insert mode, type ` ``` ` + Enter" — i.e., on an existing paragraph block whose contenteditable is then *destroyed* in place. Adjust:
   ```ts
   await goToBlock(page, "Plain text line 5"); // existing block to convert
   await pressKeys(page, "Shift+a");           // append at end
   await page.keyboard.type(" ```");            // tail end of current line
   await page.waitForTimeout(500);
   await page.keyboard.press("Escape");
   // Now assert vim_info.active_line tracks the converted block
   ```

**Cleanest single change:** the existing test is one `expect(vimIdx).toBe(domIdx)` away from catching BUG-012. The same one-line check will catch BUG-013 (heading via `##`).

---

## Part B — Suspected latent bugs (BUG-014+)

For each: location, why suspicious, proposed test (keystroke sequence) to confirm.

### BUG-014: `gg` pending-operator state leak in visual-line mode

**Location:** `src/content_scripts/vim.ts:928-940` (visualLineReducer, case `g`).

**Why fragile:** Pressing `g` in visual-line sets `vim_info.pending_operator = "g"`, expecting next `g` to jump to top. But any other key in between (`j`, `k`, `{`, `}`, etc.) does NOT clear `pending_operator`. The same is true after `Escape` from visual-line back to normal — Escape (line 904-921) doesn't clear `pending_operator`. So an unrelated `g` press later behaves as the second `g` of `gg`.

**Test recipe to expose:**
1. `V` (enter visual-line)
2. `g` (sets pending_operator = "g")
3. `j` (moves selection down)
4. `g` — BUG: triggers gg-jump-to-top instead of waiting for second g.

Or cross-mode:
1. `V g Escape g` — last `g` in normal mode jumps to top.

Assertion: `(await getVimState(page)).activeLine` should not be 1 after the third key.

---

### BUG-015: `isInsideCodeBlock` matches non-code blocks via `[class*="code"]`

**Location:** `src/content_scripts/notion/dom.ts:6-16`.

```ts
const codeContainer =
  element.closest('[class*="code"]') ||
  element.closest("code") ||
  element.closest("pre");
```

**Why fragile:** `[class*="code"]` matches any class substring "code". Notion's class soup includes things like `notion-decoration-code` (inline code styling), `notion-codepen-block`, etc. Worse, `element.closest("code")` matches if the cursor happens to be inside an *inline* `<code>` element (single-backtick markdown in a paragraph). When this returns `true` for a regular paragraph that just contains inline code, every j/k/h/l routes through the code-block paths in `navigation/code-block.ts` which treat `\n` as line separators — but inline code has no `\n`, so the navigation behaves erratically.

**Test recipe to expose:**
1. Navigate to a paragraph containing inline code: type ` `inline` ` somewhere in a plain paragraph.
2. Click a position inside the inline code.
3. Press `j` and `k` — should go to next/previous block, but will likely be no-ops or produce odd cursor positions because `moveCursorDownInCodeBlock` does `text.indexOf("\n", currentPos)` and finds nothing.
4. Or: press `o` — `openLineBelowInCodeBlockWrapped` runs instead of `openLineBelow`, calls `execCommand("insertText", "\n")` which corrupts the inline code formatting.

Assertion: from a paragraph with inline code, `j` should advance to the next block (not stay).

---

### BUG-016: `w` / `b` crossing line boundaries don't update status bar / block cursor

**Location:** `src/content_scripts/navigation/word.ts:7-69`, dispatched in `vim.ts:2924-2929`.

**Why fragile:** When `jumpToNextWord` reaches end of line, it does `vim_info.active_line = vim_info.active_line + 1` directly (word.ts:27) and `setCursorPosition(nextElement, 0)`. It does NOT call `setActiveLine` or `updateInfoContainer`. The status bar still shows the old line; the custom `<span class="vim-block-cursor">` overlay is not repositioned. Same issue in `jumpToPreviousWord` (word.ts:46-53).

**Test recipe to expose:**
1. Navigate to the end of a multi-line page section. Position cursor near end of line 5.
2. Press `w` enough times to cross into line 6.
3. Read status bar via `getVimState(page)` — `activeLine` should reflect line 6 but will reflect line 5.
4. `getActualCursorBlockIndex(page)` returns line 6 (DOM is correct).

Assertion: `vimState.activeLine - 1 === DOMIdx` after `w` crosses a boundary. Will fail.

---

### BUG-017: `{` / `}` paragraph motion doesn't sync active line / UI

**Location:** `src/content_scripts/navigation/paragraph.ts:31-37, 63-77`.

**Why fragile:** Same pattern as BUG-016: `vim_info.active_line = targetLine` is set directly with no `setActiveLine` call, no `updateInfoContainer`, no `updateBlockCursor`. The block cursor visual stays at the old line until next event triggers a redraw. Documented bug BUG-007 says these don't move at all — but if/when that's fixed, this UI desync will surface.

**Test recipe to expose (pre-supposing BUG-007 is fixed):**
1. Navigate to a block before an empty paragraph boundary.
2. Press `}`.
3. Status bar `activeLine` differs from DOM block index: `expect(vimState.activeLine - 1).toBe(domIdx)` fails.

---

### BUG-018: `setActiveLine` accesses `lines[0].element` without bounds check

**Location:** `src/content_scripts/core/line-management.ts:29-35`.

```ts
if (idx >= lines.length) i = lines.length - 1;
if (i < 0) i = 0;
...
const targetElement = lines[i].element;  // crashes if lines.length === 0
```

**Why fragile:** When `lines.length === 0` (edge case during page reload, after deleting all blocks via visual-line+d, or transient state during reinitializeAfterNavigation), `lines.length - 1 = -1`, then clamped to 0, then `lines[0].element` throws.

**Test recipe to expose:**
1. Create a tiny test page with two blocks.
2. `V G d` (visual-line, jump to bottom, delete all). Most blocks deleted.
3. If lines.length transiently hits 0 during the `refreshLines` after deletion (`vim.ts:1364`), and a user keystroke fires before `setActiveLine` is called with a valid index, crash.

Hard to reproduce deterministically — most relevant as a defensive-code change. Test: `await page.evaluate(() => { window.vim_info.lines = []; window.vim_info.active_line = 0; });` then press any movement key and assert no console errors.

---

### BUG-019: `o` / `O` cancellation race when Esc pressed during setTimeout chain

**Location:** `src/content_scripts/vim.ts:243-316`.

`openLineBelow`:
```ts
jumpToLineEnd();
vim_info.mode = "insert";
updateInfoContainer();
setTimeout(() => {
  ... dispatch Enter ...
  setTimeout(() => { refreshLines(); }, 100);
}, 0);
```

`openLineAbove` is the same pattern with two more chained 50ms timeouts.

**Why fragile:** If the user presses `Escape` between the `o` press and the first setTimeout(0) callback (highly unlikely), or between the Enter dispatch and the refreshLines callback (likely with rapid Esc), mode flips to normal mid-flight. Subsequent dispatches still fire (Enter, ArrowUp), but they now act on whatever element is focused in normal mode — possibly inserting an Enter into a normal-mode-only block. Vim's `o` is supposed to be atomic; this implementation isn't.

**Test recipe to expose:**
1. Navigate to a block.
2. Press `o`, then immediately (no delay) press `Escape`.
3. Press `i` and look at where the new line was created and the cursor's current position.

Assertion: `vimState.mode === 'normal'` and exactly one new line was inserted. Will likely fail with two newlines or cursor on wrong block.

---

### BUG-020: `pasteBeforeCursor` and `deleteCharacterBefore` mutate `textContent` directly

**Location:** `src/content_scripts/vim.ts:1740-1755` (pasteBeforeCursor character path), `vim.ts:360-379` (deleteCharacterBefore for `X`).

```ts
// pasteBeforeCursor:
currentElement.textContent = newText;
// X:
currentElement.textContent = newText;
```

**Why fragile:** Direct `textContent` assignment replaces *all* child nodes in one shot. This:
1. Bypasses Notion's input event pipeline → Notion's internal model doesn't know the edit happened. The block re-renders on next save sync and may revert.
2. Strips inline formatting (bold/italic/code/links) — replaces rich children with a single text node.
3. Doesn't enter the browser's native undo stack, so `u` cannot undo the change.

**Test recipe to expose:**
1. Navigate to a paragraph containing **bold** text.
2. Position cursor inside the bold word, press `X` to delete the char before.
3. Verify the bold formatting on the rest of the word still exists. Will fail — entire block becomes plain text.
4. Press `u` — the `X` deletion is not undone.

---

### BUG-021: `pending_operator` not cleared on mode-transitioning Escapes

**Location:** `src/content_scripts/vim.ts:831-838` (visualReducer Escape), `vim.ts:904-921` (visualLineReducer Escape), `reducers/insert.ts:41-47` (insertReducer Escape).

**Why fragile:** None of these mode-exit handlers reset `vim_info.pending_operator`. In normal mode, the `default: return true` case at vim.ts:3045 also doesn't clear it. A pending operator left over from one mode survives transitions.

**Test recipe to expose:**
1. Normal mode, press `d` (sets pending_operator = "d").
2. Press `v` — handlePendingOperator("v") clears it (clears at vim.ts:1871). OK actually this is fine in normal mode.
3. But: visual-line, press `g` (sets pending_operator = "g" via visualLineReducer line 938). Press Escape (returns to normal). Press `g` in normal mode — handlePendingOperator(operator="g", key="g") → `case "g": jumpToTop()`.

Assertion after step 3: `activeLine` should NOT be 1. Will be.

---

### BUG-022: `Tab` falls through to Notion in normal mode

**Location:** `src/content_scripts/vim.ts:3041-3043`.

```ts
case "Tab":
  // Let Notion handle Tab/Shift+Tab for indenting/outdenting bullet points
  return false;
```

**Why fragile:** The comment says "indenting bullet points". But in *normal* mode the cursor is just positioned, not editing — letting Tab pass to Notion when the active block is a bulleted list will indent the bullet, which is a *destructive* change while the user thinks they're navigating. Vim's normal-mode Tab is `Ctrl+I` (jump forward in jumplist), not edit-anything.

**Test recipe to expose:**
1. Navigate to a top-level bullet item.
2. Press `Tab` in normal mode.
3. Read the block's indent level — it will be indented one level, but no edit was intended.

Assertion: bullet indent level unchanged after Tab in normal mode.

---

### BUG-023: TODO Enter toggle has 10ms race window

**Location:** `src/content_scripts/vim.ts:2627-2705`.

```ts
const cursorPos = getCursorIndexInElement(currentLine.element);
const savedActiveLine = vim_info.active_line;
... checkbox click ...
setTimeout(() => {
  vim_info.active_line = savedActiveLine;
  setCursorPosition(currentLine.element, cursorPos);
  ...
}, 10);
```

**Why fragile:** If the user presses Enter twice rapidly, the second Enter fires before the first's setTimeout has restored state. `currentLine.element` is captured at first-Enter time but Notion may have re-rendered the TODO block on toggle — `currentLine.element` is stale, `setCursorPosition` is a no-op or sets on a detached node.

**Test recipe to expose:**
1. Navigate to a TODO block.
2. Press Enter, Enter (within 5ms — use `page.evaluate` to dispatch both as sync events).
3. Inspect: TODO check state (toggled twice = back to original? or stuck?), cursor position, active_line.

Assertion: TODO check state matches expected (toggled once if events deduped, twice if both registered) AND cursor stayed on the TODO block.

---

### BUG-024: `redo` bound to `r`, conflicts with Vim's "replace character"

**Location:** `src/content_scripts/vim.ts:3038-3040`.

**Why suspicious:** Vim users expect `r{char}` to replace the character under cursor with `{char}`. Vimtion's `r` does redo. Documented in CLAUDE.md but not user-discoverable. A user typing `rX` to replace gets: redo (probably no-op because no redo stack) then mode is still normal, then `X` deletes the char before cursor (BUG-020 path).

**Test recipe to expose:**
1. Navigate to a block with text "hello".
2. Press `0` (col 0), `r`, `X`. Vim expectation: text becomes "Xello".
3. Actual: `r` is redo (no-op), then `X` (BUG-020) deletes char before col 0 (no-op or weird).

Assertion: block text is "Xello" after `0rX`. Will fail.

---

### BUG-025: `reinitializeAfterNavigation` sets `active_line=0` then waits 300ms

**Location:** `src/content_scripts/vim.ts:3296-3377`.

```ts
window.vim_info.active_line = 0;
...
setTimeout(() => {
  const editableElements = ...;
  if (editableElements.length >= 3) { setLines(...); }
}, 300);
```

**Why fragile:** During the 300ms wait, `vim_info.lines` still references the *old* page's elements (now detached from DOM). If a keystroke fires (`handleKeydown` runs), `normalReducer` accesses `vim_info.lines[active_line=0].element` which is a detached node from the previous page. `getCursorIndexInElement` returns 0 (selection isn't inside it), `setCursorPosition` operates on a detached node, etc. Likely produces no-ops but could throw on deeply integrated paths (visual selection, openLineBelow's Enter dispatch on detached element).

**Test recipe to expose:**
1. Press `gl` to enter link-hint mode, select a hint that navigates to another Notion page.
2. Within 100ms (before 300ms timeout), press `j` repeatedly via `page.evaluate(() => { for (...) document.body.dispatchEvent(new KeyboardEvent('keydown', {key: 'j'})); })`.
3. Listen for console errors and check that final state is consistent.

Assertion: no console errors, final active_line points at a valid leaf in the new page.

---

### BUG-026: `setActiveLine` clamps silently — masks off-by-one drift

**Location:** `src/content_scripts/core/line-management.ts:29-30`.

```ts
if (idx >= lines.length) i = lines.length - 1;
if (i < 0) i = 0;
```

**Why fragile:** If a `j` is fired when active_line is already lines.length-1, `setActiveLine(lines.length)` clamps silently to lines.length-1 — no error, no callback. So tests that assert `state.activeLine === expectedAfter` only pass if expectedAfter is right; off-by-one drift accumulates invisibly. Also: if BUG-012-style refreshLines mismatch leaves active_line *past* the new lines.length (after some blocks are deleted), the next setActiveLine clamps it to last-line, which is *not* where the user is.

**Test recipe to expose:** combined with BUG-019 above — after `o` desync produces an extra block, then `dd` to delete it, then j/k navigation will be off because active_line was silently clamped during the deletion. Assert active_line increments are strictly monotonic on valid j presses; if a press is silently clamped, the test catches it by detecting two consecutive identical activeLine values that should differ.

---

### BUG-027: word/paragraph motions use `vim_info.lines[active_line]` without null guard

**Location:** `src/content_scripts/navigation/word.ts:9, 40, 73, 103, 134, 156`; `paragraph.ts:35, 65`.

```ts
const currentElement = vim_info.lines[vim_info.active_line].element;
```

**Why fragile:** If `vim_info.active_line` is out of bounds (never null-guarded after BUG-018/BUG-026 silent clamp), `vim_info.lines[active_line]` is `undefined`, then `.element` throws. `setActiveLine` clamps but other code paths (refreshLines mid-key, motion handlers calling each other) don't.

**Test recipe to expose:** fuzz `active_line = vim_info.lines.length + 5` via `page.evaluate`, then press `w` — should not throw. Will throw `Cannot read property 'element' of undefined`.

---

### BUG-028: `pasteAfterCursor` line-paste increments active_line without reading new content

**Location:** `src/content_scripts/vim.ts:1625-1634`.

```ts
setTimeout(() => {
  vim_info.mode = "normal";
  refreshLines();
  const newLineIndex = Math.min(vim_info.active_line + 1, vim_info.lines.length - 1);
  setActiveLine(newLineIndex);
}, 100);
```

**Why fragile:** After dispatching a paste event, Notion may insert *multiple* new blocks if the clipboard contained a multi-line yank (`yy` of a code block produces `\n`-separated content that Notion turns into N blocks). The code assumes exactly one new block was created and just does `+1`. If 3 blocks were inserted, active_line should advance by 3 to land on the *first* pasted block — instead it lands on whatever is at `+1`, which is the original block's neighbor, not the paste.

**Test recipe to expose:**
1. `yy` on a multi-line code block (3 lines).
2. Move to a different location.
3. `p`.
4. After paste, `(state.activeLine - 1)` should match the index of the first pasted block.

Assertion: paste lands cursor at first new block, not at original cursor + 1.

---

### BUG-029: `code-block.ts` `moveCursorDownInCodeBlock` exit doesn't sync DOM cursor

**Location:** `src/content_scripts/navigation/code-block.ts:20-23`.

```ts
let lineEnd = text.indexOf("\n", currentPos);
if (lineEnd === -1) {
  vim_info.active_line = vim_info.active_line + 1;
  return;
}
```

**Why fragile:** This is BUG-010, *partially*. The ghost-line side is documented; the additional issue here is that `setActiveLine` is *not* called — only `vim_info.active_line` is mutated. So even when no ghost line exists (no trailing `\n`), the DOM cursor is left inside the code block element while `active_line` is advanced. No `updateInfoContainer`, no `updateBlockCursor`. Same bug in `moveCursorUpInCodeBlock` (line 56).

**Test recipe to expose:** in a code block whose textContent has NO trailing `\n` (verify via `expect(text.endsWith('\n')).toBe(false)`), navigate to last line, press `j` → assert `getActualCursorBlockIndex(page)` advanced (will fail; DOM cursor still in code block) AND status bar shows new line number (will fail).

---

### BUG-030: `linkSelectionMode` is a global toggle independent of `vim_info.mode`

**Location:** `src/content_scripts/vim.ts:2333-2583` (handler), and `linkSelectionMode` boolean lives in module scope (not `vim_info`).

**Why fragile:** Two pieces of "what mode am I in" state. If `linkSelectionMode = true` but `vim_info.mode = "normal"`, the normalReducer's link-selection branch (line 2333) handles keys differently. If the user invokes `gl` (which sets `vim_info.mode = "link-hint"`) while `linkSelectionMode` is true, `linkHintReducer` runs but the cleanup of link-selection's `availableLinks` / highlights doesn't happen. Two link-UIs visible simultaneously.

**Test recipe to expose:**
1. Navigate to an empty line, press `Enter` to enter link-selection mode.
2. Without pressing Escape, press `gl` to enter link-hint mode.
3. Inspect the DOM: highlights from `highlightSelectedLink` (linkSelection) are still present, and link-hint overlays from `enterLinkHintMode` are also present. Both UIs visible.

Assertion: after `gl`, only one of linkSelectionMode UI / linkHint UI is active. Will fail.

---

### BUG-031: visual-mode `Escape` reads `lines[active_line].element` without bounds check

**Location:** `src/content_scripts/vim.ts:835-836`.

```ts
case "Escape":
  vim_info.mode = "normal";
  window.getSelection()?.removeAllRanges();
  const currentElement = vim_info.lines[vim_info.active_line].element;
  setCursorPosition(currentElement, vim_info.desired_column);
```

**Why fragile:** No null-guard. If active_line is out of bounds (after refreshLines drift while in visual mode — entirely possible since visual selections persist across mutations), this throws.

**Test recipe to expose:**
1. Enter visual mode (`v`).
2. While in visual mode, trigger a refreshLines that removes lines past active_line (e.g., type something elsewhere via `page.evaluate`). 
3. Press Escape.

Hard to reach via real keystrokes in tests; primary value is as defensive-code bug. Confirm by `page.evaluate(() => window.vim_info.active_line = 9999)` then dispatching Escape → expect no throw.

---

### BUG-032: `Enter` on TODO captures `cursorPos` from old element ref

**Location:** `src/content_scripts/vim.ts:2648-2697`. Same as BUG-023 but a different race: the captured `currentLine.element` may be replaced by Notion's re-render after the checkbox click, since toggling a TODO mutates the block's data and Notion sometimes recreates the contenteditable.

**Test recipe:** toggle a TODO via Enter, immediately inspect `currentLine.element` ref equality with the new leaf — if they differ, the setTimeout-restore is a no-op and `active_line` is whatever, but DOM cursor is on the new TODO. Detect by asserting `vim_info.active_line` matches DOM index post-toggle.

---

### BUG-033: `o` in normal mode on empty line creates double-newline (Notion default)

**Location:** `src/content_scripts/vim.ts:243-271`. Code dispatches Enter at end of line — but on an empty line, end-of-line is position 0. Notion's Enter handler at position 0 of an empty paragraph creates a new empty block above (Vim's `o` should create one below). Then ArrowUp logic from `openLineAbove` is missing here, so cursor lands on the wrong line.

**Test recipe to expose:**
1. Navigate to an empty paragraph block.
2. Press `o`.
3. Type "X".
4. Inspect: where did "X" appear? Above or below the empty line? Vim convention: a new line *below* current. Likely actual: above.

Assertion: after `o` on empty line + type "X", "X" appears in a block whose DOM index is greater than the original empty line's index.

---

### BUG-034: `MutationObserver` triggers `refreshLines` for *every* DOM change

**Location:** `src/content_scripts/core/line-management.ts:163-170`.

```ts
const observer = new MutationObserver(() => {
  refreshLines();
});
observer.observe(document.body, { childList: true, subtree: true });
```

**Why fragile:** Notion's UI is animation-heavy: tooltips, hover states, format menus, autosave indicators all mutate `document.body`. Every one of those triggers a full `refreshLines` rebuild which iterates `document.querySelectorAll("[contenteditable=true]")`. On a large page (100+ blocks) this is expensive and runs *every* mouse move that triggers a tooltip. Performance + race-condition surface area: the more often refreshLines runs, the more chances for the BUG-012 stale-ref window to hit. Should be debounced (e.g., 50ms) or scoped to the editor root.

**Test recipe to expose:** `page.evaluate` to wrap `refreshLines` in a counter, do nothing on the page for 5 seconds, then read the count. Should be ~0 (page idle); will be in the hundreds because Notion tooltips, drag handles, autosave indicator all churn.

---

### BUG-035: `f` / `F` / `t` / `T` set `desired_column` to *line offset*, not visual column

**Location:** `src/content_scripts/navigation/char-find.ts:21-22, 39-40, 58-59, 77-78`.

```ts
setCursorPosition(currentElement, foundIndex);
vim_info.desired_column = foundIndex;
```

**Why fragile:** `desired_column` is supposed to be the *column within the line* (used by j/k to maintain horizontal position across lines). After `f{c}`, `desired_column` is set to the absolute index of the found char. For single-line blocks this is fine. For multi-line code blocks, `foundIndex` includes any preceding newlines — it's an offset into the whole textContent, not a column number. Subsequent j/k in the code block uses this number as a column on the next line, landing in random spots.

**Test recipe to expose:**
1. Navigate to a multi-line code block, line 0, col 0.
2. Press `j` to land on line 1.
3. Press `f` followed by a character that exists on line 1 — say at column 10.
4. `desired_column` is now (line0 length + 1 + 10) — a 3-digit number on a long block.
5. Press `j` to line 2.
6. Cursor goes to position min(big_number, line2_length). On a short line 2, cursor goes to end-of-line — but should be at column 10.

Assertion: after `f{c}` on a code block line, then `j`, cursor column matches (or is min-clamped to line length of) the column where `c` was found.

---

### BUG-036: `code-block.ts` `moveCursorBackwardsInCodeBlock` `desired_column = newPos`

**Location:** `src/content_scripts/navigation/code-block.ts:87, 106`.

```ts
const newPos = currentPos - 1;
setCursorPosition(currentElement, newPos);
vim_info.desired_column = newPos;
```

**Why fragile:** Same as BUG-035 — `newPos` is absolute offset in code block textContent, not column on a line. After `h` in a code block, `desired_column` is e.g. 47, then `j` to next line lands at column min(47, lineLength) which is not the visual column.

**Test recipe:** in code block, on line 1 col 5, press `h` (col 4 visually). Then `j` to line 2. Cursor should be at col 4 of line 2; instead lands at offset (line0len + 1 + 4) which is col 4 of *line 1* of the textContent — i.e. wrong line entirely after the j step uses desired_column.

---

### BUG-037: `pasteAfterCursor` doesn't clear `vim_info.yank_type` after paste

**Location:** `src/content_scripts/vim.ts:1597-1656`.

After a line-paste, `yank_type === "line"` remains "line" until next yank. So if user yanks a partial selection (yank_type = "char"), then pastes (yank_type stays "char"), then in another session does line-paste — the `yank_type` value is whatever was set last, which may not match the actual clipboard content.

**Test recipe to expose:**
1. `yy` on a line (yank_type = "line").
2. Manually copy partial text via Cmd+C (clipboard now has char content but `vim_info.yank_type` still "line").
3. `p` — does line-paste behavior (creates new line below) on the char clipboard data, producing weird output.

Assertion: paste content matches expected paste mode based on actual clipboard content, not the stale yank_type flag.

---

### BUG-038: `handlePendingOperator` "f"/"F"/"t"/"T" doesn't validate `key`

**Location:** `src/content_scripts/vim.ts:1873-1888`.

```ts
if (operator === "f") { findCharForward(key); return true; }
```

**Why fragile:** `key` is the raw `e.key` from the next keydown. If user presses `f` then `Escape`, `findCharForward("Escape")` is called — `text.indexOf("Escape", currentPos + 1)` searches for the literal 6-char string "Escape", finds nothing, no-op. OK practically. But if user presses `f` then `Backspace` or `Tab` or any non-printing key, similar weirdness. Visually the operator state is silently consumed.

More problematic: what if user presses `f` then `Shift`? At line 1866-1868, modifier keys return early without clearing pending_operator. Then `Shift+a`: e.key === "A". `findCharForward("A")` searches for capital A — fine. But user typed `Shift+a` thinking they'd type "a" — got A search instead. No way to type capital-letter f-search reliably; small UX bug.

**Test recipe:** press `f`, then `Escape`. Verify pending_operator is cleared and cursor didn't move. Will pass at the cursor level but pending state may leak.

---

### BUG-039: `redo` is alias for `r` but no `Ctrl+r`

**Location:** `src/content_scripts/vim.ts:3038-3040`. (Same site as BUG-024 but separate concern.)

`Ctrl+r` is the standard Vim binding for redo. The code at line 2293-2322 reserves `Ctrl+d/u/f/b` for vim navigation but explicitly returns false for any other Ctrl combination, letting the browser handle it. So `Ctrl+r` is browser-reload — destructive, loses all unsaved edits. Bind `Ctrl+r` to redo and `r` to replace-character.

**Test recipe:** press `Ctrl+r` (Cmd+r on macOS) in normal mode → page reloads. Will fail any "redo" test that uses Ctrl+r convention.

---

### BUG-040: Tests/manual gap — special blocks (page links, embeds, equations, dividers, columns, tables, synced blocks) in `lines[]`

**Location:** general — `setLines` / `refreshLines` only filter to `[contenteditable="true"]`.

**Why suspicious:**
- Page links and embeds use `[contenteditable="false"]` with `[tabindex]` — they're NOT in `lines[]`. So j/k SKIPS them entirely. User pressing j over a page-link block jumps over it, which feels right for navigation, but the user's mental model may be "I'm on the line containing the page link" — there's no concept.
- Dividers use `[contenteditable="false"]` — also skipped. OK.
- Columns: each column contains contenteditable leaves. j/k goes from leaf in column A to leaf in column B in document order (Notion's DOM order), which is rarely what the user wants. Vim users expect "j on the bottom of column 1 should go to first row of next thing below the columns block".
- Tables (Notion's `notion-collection-view-block` with table view): cells are contenteditable. j/k traverses cells in DOM order — left-to-right then next row. Vim users want "j moves to the cell in the same column on the next row". Currently broken.
- Synced blocks: contain contenteditable leaves that mirror another page. Edits go through but `data-block-id` may not exist on all leaves; cursor save/restore may fail.
- Equations (KaTeX/inline-math `notion-equation-block`): renders as `[contenteditable="false"]` — skipped. OK.

**Test recipes to expose (low cost):**
1. Page with two-column layout. Place cursor in last leaf of column A. `j` — does it go to first leaf of column B (current) or to the first leaf of the block below the columns container (Vim-expected)?
2. Page with a table. Cursor in cell (row 1, col 1). `j` — should land in (row 2, col 1). Currently lands in (row 1, col 2).
3. Page with a synced block. Edit a leaf inside, navigate away with j, come back with k. Verify active_line tracks correctly across the synced-block boundary.

These are not strictly bugs — they're missing-feature gaps, but they're also entirely untested.

---

### BUG-041: `insertAfterCursor` (`a`) fails when cursor is past last char

**Location:** `src/content_scripts/vim.ts:318-332`.

```ts
const lineLength = currentElement.textContent?.length || 0;
if (currentCursorPosition < lineLength) {
  setCursorPosition(currentElement, currentCursorPosition + 1);
  ...
}
window.vim_info.mode = "insert";
```

**Why fragile:** Vim's `a` should *always* place cursor "one position to the right of current". On the last char, `a` puts cursor *after* the last char (col == length). This code does that conditionally — but if `currentCursorPosition === lineLength` already (e.g., after `$` on a non-empty line, BUG-005 says `$` goes to lineLength), then `a` is a no-op cursor-wise, just enters insert mode at lineLength. That's actually... right. But if `currentCursorPosition === lineLength - 1` (on the last char), `a` advances to `lineLength`. OK. Then mode is insert; user types — Notion appends. Fine.

Actually this looks OK on a careful re-read. Marking as low-priority — but worth a test: at end of multi-char line, `$ a foo Esc`, verify "foo" is appended.

---

### BUG-042: Operator + Escape mid-sequence for text objects

**Location:** `src/content_scripts/vim.ts:2064-2174` (`yi`/`di`/`ci` and ya/da/ca handlers).

**Why fragile:** Pressing `d` then `i` then `Escape`. handlePendingOperator(operator="di", key="Escape"). The switch at line 2066 has cases for "w", "(", "[", etc. — no case for "Escape". Falls through to `default: return true;` at line 2172. pending_operator was cleared at line 1871. OK, no harm. *But* if any motion key happens to match a case (like `w`), the operation runs even after Escape was pressed in between. Not actually possible because every key clears pending_operator — but what about *modifier* keys?

Modifier keys are bypassed at line 1866. So pressing `d` then `Shift` then `i`: `Shift` bypasses, then `i` is processed with operator still "d" → sets pending = "di". Then user presses `Shift+w` (e.key === "W"): visited at line 2066, no case for "W" (only lowercase "w"), default `return true`. pending_operator was cleared. Net effect: di-w-with-shift is a no-op. Vim convention: `diW` is "delete inner WORD". Vimtion's convention seems to lowercase only — `diW` doesn't work.

**Test recipe to expose:** `diW` on a punctuated word (`hello-world`). Should delete "hello-world" (Vim semantics: WORD is whitespace-separated). Vimtion: probably no-op or `diw`-equivalent.

---

### BUG-043: refresh during operator pending leaves orphaned state

**Location:** `src/content_scripts/vim.ts:2978-2980` (case "d" → set pending), and any motion that fires refreshLines.

**Why fragile:** pending_operator is module-state. Press `d` → pending = "d". A MutationObserver-triggered refreshLines completes. The next keystroke runs handlePendingOperator with old pending. But refreshLines may have changed `vim_info.active_line` (BUG-012 stale-ref → mismatched index) — so `dw` deletes from a different line than user expected.

**Test recipe to expose:**
1. Press `d`, then trigger an external DOM mutation (`page.evaluate(() => document.body.appendChild(document.createElement('div')))`).
2. Press `w` — assert that the deletion happens on the original active_line, not on whatever drift occurred.

---

## Prioritization

For Goal A (test fixes for known bugs), in order of "fix produces most value":
1. **BUG-012**: 1-line assertion change in `code-block-nav.spec.ts`. Catches BUG-012 AND BUG-013 with same change.
2. **BUG-002**: 1 additional `expect` line for active_line vs. DOM index.
3. **BUG-001**: requires switching from Playwright `keyboard.press` to a `page.evaluate`-driven dispatch loop.

For Goal B (latent bugs by impact):
- **High**: BUG-014 (gg state leak), BUG-016/017 (UI desync after motions), BUG-029 (code-block exit DOM/active mismatch), BUG-035/036 (desired_column polluted).
- **Medium**: BUG-015 (false-positive code-block detection), BUG-019 (o/O Esc race), BUG-020 (textContent direct write), BUG-022 (Tab passes to Notion), BUG-040 (special block coverage).
- **Low**: BUG-018, 023, 024, 025-028, 030-034, 037-039, 041-043 — defensive-code or UX-papercut bugs without obvious user impact today.

**Total latent bugs proposed: 30 (BUG-014 through BUG-043).**
