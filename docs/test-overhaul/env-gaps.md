# Test Environment Realism Gaps

**Author**: env-architect
**Date**: 2026-05-03
**Status**: Investigation report — no code changed

The Vimtion test suite has **391 tests passing yet real users still hit bugs**. This report enumerates the gaps between the Playwright environment and a real user's environment, ranks them by bug-catching impact, and gives actionable fixes with file:line references.

The smoking gun is BUG-008/009/011: bugs that **only fail in headless automated tests** but work manually. Their inverse is just as bad — bugs that **only manifest manually** because the test harness suppresses the trigger conditions. Both classes prove the harness ≠ the user.

---

## TL;DR — Recommended priority order

| # | Gap | Catches | Effort |
|---|---|---|---|
| 1 | **Real-keystroke event injection (CDP `Input.dispatchKeyEvent` instead of synthesized `KeyboardEvent`)** | BUG-009, BUG-011, latent `O`/`o`/code-block siblings | M |
| 2 | **Run all tests in BOTH headed and headless (parity matrix)** | BUG-008, BUG-009; future divergence | S |
| 3 | **IME / composition events (Japanese, Chinese, Korean input)** | Latent insert-mode breakage, unknown count of bugs | M |
| 4 | **Block-type breadth: tables, columns, synced blocks, toggle children, nested page links** | Latent navigation/operator bugs | M |
| 5 | **Long-running session state — drop the `beforeAll` reset across files** | BUG-001, BUG-002, BUG-003, BUG-012, BUG-013 | S |
| 6 | **Variable typing cadence + key-repeat (autorepeat) simulation** | BUG-001 root-cause, hold-j cursor desync | S |
| 7 | **Virtualized / long page (≥200 blocks, scroll past viewport)** | Latent `setLines`/`refreshLines` bugs | M |
| 8 | **Markdown-shortcut block conversion coverage (`##`, `-`, `>`, `[]`, `1.`, ` ``` `)** | BUG-012, BUG-013 | S |
| 9 | **Cursor-sync invariant assertion after EVERY keypress (continuous, not end-of-test)** | All cursor-desync bugs (1, 2, 3, 4, 8, 12, 13) | M |
| 10 | **Real-content fixtures (rich text, decorations, mentions, equations inline)** | Latent text-object/word-motion bugs | M |

The first three are non-negotiable: without them, the harness systematically can't see whole categories of user bugs.

---

## Gap 1: Synthesized `KeyboardEvent` vs. real OS keystrokes

### Evidence

- BUG-008 root-cause analysis (docs/known-bugs.md:77–89): "Notion ignores `dispatchEvent` keyboard events" and Notion's main-world cursor handling overrides changes from the content script's isolated world.
- BUG-009 (docs/known-bugs.md:92–102): `O` calls `openLineAbove` at `src/content_scripts/vim.ts:273` which dispatches `new KeyboardEvent("keydown", {key:"Enter", ...})` at `vim.ts:287–294`. This synthetic event is treated differently by Notion vs. a real Enter — *headless behaves differently from headed*.
- BUG-011 root-cause: `document.execCommand("insertText", false, "\n")` fails to insert a newline in a code block under Playwright. The code path is `src/content_scripts/navigation/code-block.ts:110`.
- Playwright's `page.keyboard.press()` already injects keys via Chrome DevTools Protocol's `Input.dispatchKeyEvent`, which **does** fire `beforeinput`/`InputEvent` correctly. But Vimtion's *internal* implementations of `O`, `o-in-code-block`, and Enter-injection all use `new KeyboardEvent(...)` — which Notion's own input pipeline ignores.

### What we're missing in the env

The harness *can* exercise the user-input path correctly (Playwright→CDP→browser fires real composition + input events). But three of Vimtion's own code paths bypass that and synthesize their own events. Those internal synthesized events get different treatment than user keystrokes:

1. **`openLineBelow`** (`vim.ts:243`): `setTimeout` → `dispatchEvent(new KeyboardEvent("Enter"))`
2. **`openLineAbove`** (`vim.ts:273`): same pattern, plus dispatched `ArrowUp`
3. **`openLineBelowInCodeBlock`** (`navigation/code-block.ts:110`): `document.execCommand("insertText", "\n")`

Tests don't fail in headed mode because Notion-in-headed apparently honors these synthesized events; Notion-in-headless doesn't. **The env gap is that we don't have a test that uses the same code path Vimtion uses internally.**

### Fix

- **Add a low-level test fixture** that exercises every Vimtion code path that synthesizes input. Concretely, write a test that: (a) checks `O` actually inserts a line above (BUG-009); (b) checks `o` inside code block actually inserts `\n` (BUG-011); and crucially run them in BOTH headed and headless. The headed/headless divergence is the assertion.
- **Switch internal Vimtion code paths from `new KeyboardEvent` → CDP-equivalent**. Specifically: replace `vim.ts:256–264`, `vim.ts:287–294`, `vim.ts:300–307` with `document.execCommand("insertParagraph")` / `Selection`-based insertion / explicit Range manipulation that does not require fake KeyboardEvents. (Out of scope for this report — flag for the implementation teammate.)
- **Test-side**: add a Playwright trace assertion that after an `O` press the DOM has exactly one new sibling block *above* the active block. Today the test in `navigation.spec.ts` checks block content, but not insertion position relative to the previous active block.

### Bug-catching ROI

- **High**. Directly catches BUG-009, BUG-011, and any future regression where Vimtion swaps out a "real keypress" for a synthesized one. Likely also catches user-only bugs where a manual user's real Enter goes through fine but our synthetic Enter went through fine in headed (false negative) and broke in headless (true negative — and we only saw headless failures).

---

## Gap 2: Headed vs. headless parity

### Evidence

- `test/fixtures.ts:23`: `headless: !process.env.HEADED` — defaults to headless. CI almost certainly runs without `HEADED=1`.
- `test/global-setup.ts:50`: same.
- BUG-008/BUG-009 explicitly note "works in headed-mode manual testing." So the suite is *one mode away* from catching them.
- BUG-011 says "may be automated-test-only (needs manual verification)" — same problem in reverse: we don't know whether this bug exists for users.

### What we're missing

The single boolean `HEADED` environment variable means we run *either* headed *or* headless, never both. The Playwright `projects` config in `test/playwright.config.ts:37–48` has only one e2e project.

### Fix

In `test/playwright.config.ts:37–48`, expand the `projects` array to two e2e projects:

```ts
projects: [
  { name: "setup", testMatch: /global-setup\.ts/, testDir: "." },
  { name: "e2e-headless", dependencies: ["setup"], testDir: "./e2e",
    use: { launchOptions: { headless: true } } },
  { name: "e2e-headed",   dependencies: ["setup"], testDir: "./e2e",
    use: { launchOptions: { headless: false } } },
]
```

But Playwright's `launchOptions` won't propagate to `chromium.launchPersistentContext` (used in `test/fixtures.ts:21`). So the actual fix is:

1. In `test/fixtures.ts:23`, replace `headless: !process.env.HEADED` with `headless: process.env.PW_HEADLESS !== "false"`.
2. In `test/global-setup.ts:50`, same change.
3. In `test/playwright.config.ts`, add per-project `metadata.headless` and read from a fixture worker init.
4. Tag each known-bug-fail test with `test.skip(({}, testInfo) => testInfo.project.name !== "e2e-headed", "headed-only")` to keep CI green while we work through the divergence list.

CI runs both. The first time they diverge for a *new* bug, you have a smoking gun.

### Bug-catching ROI

- **Very High** for known divergence bugs (BUG-008/009 already known; BUG-011 needs verification).
- **Medium** for future regressions, but it's a permanent guard against any future "fix that only works when DevTools is open."
- **Cost**: ~2× CI time. Worth it.

---

## Gap 3: IME / composition events

### Evidence

- `grep -rn "compositionstart\|isComposing\|IME" src/content_scripts/` returns **zero hits**. Vimtion doesn't acknowledge IME at all.
- The user is at U-Tokyo (`tatsuya.kamijo@weblab.t.u-tokyo.ac.jp`). Japanese users will compose every word: type `nihongo` → IME shows hiragana → user picks kanji `日本語` → confirm with Enter or Space.
- During composition, `keydown` fires with `event.isComposing === true` and `event.key === "Process"` (or the literal key) but the *real* output is delivered later via `compositionend` + an `InputEvent`.
- Vimtion's `handleKeydown` at `vim.ts:487–522` has **no `isComposing` guard**. So if a user is in insert mode and triggers their `jk` escape sequence accidentally during composition (typing the romaji `j` for `じ`), the `insertReducer.ts:48–51` will set `lastInsertKey = "j"` and the next composed char might trigger the escape.
- More dangerously: in **normal mode**, if the user accidentally activates IME and types — `vim_info.mode === "normal"` will run `normalReducer(e)` which preventDefaults motion keys. The composition ends in a broken state.

### What we're missing

There is **not a single test** that exercises IME. The harness has no fixture that simulates `compositionstart`/`compositionupdate`/`compositionend` events.

### Fix

**Test-side (the env-architect's domain):**

1. Add `test/helpers.ts:pressKeysWithIME(page, romaji, kanji)` helper that uses CDP to dispatch:
   ```ts
   await page.evaluate(({romaji, kanji}) => {
     const el = document.activeElement!;
     el.dispatchEvent(new CompositionEvent("compositionstart", {data: ""}));
     el.dispatchEvent(new CompositionEvent("compositionupdate", {data: romaji}));
     el.dispatchEvent(new CompositionEvent("compositionend", {data: kanji}));
     el.dispatchEvent(new InputEvent("input", {inputType: "insertCompositionText", data: kanji}));
   }, {romaji, kanji});
   ```
2. Or, more realistically, switch input method via Chromium command-line flag `--lang=ja` and `chrome://settings/languages` enabling Japanese IME — Playwright supports `locale` and `lang` via `contextOptions`.
3. Write minimum viable test set:
   - Insert mode + IME composition + commit + Esc → cursor at end of inserted kanji, mode is normal.
   - Insert mode + start composition + IME-cancel (Escape during composition) → does Vimtion swallow Esc? It must NOT exit insert mode while `isComposing`.
   - Normal mode + IME accidentally enabled + type → motion keys still preventDefault'd? They should not be when `e.isComposing`.
   - `jk` escape sequence during composition: type `nihongo` → hits `j` and `k` in the romaji stream. The reducer must not treat composing j/k as the escape sequence.

**Source-side (out of scope for this report — flag for the implementation teammate):**

Add `if (e.isComposing || e.keyCode === 229) return;` at the top of `handleKeydown` in `vim.ts:487`. This is the standard guard. Document it as required for non-Latin input.

### Bug-catching ROI

- **High and silent**: there is currently *no telemetry* on whether Japanese users are hitting `jk`-escape misfires during composition, or whether normal-mode motion keys are getting preventDefault'd mid-composition. Given the user is at a Japanese university, this is the most likely "users complain" bug class that's invisible to the suite.

---

## Gap 4: Block-type breadth

### Evidence

`test/setup-test-page.ts:152–246` constructs the test page. Inventory of what's covered vs. real-user content:

| Block type | Created in fixture? | Notes |
|---|---|---|
| paragraph, heading_{1,2,3} | ✅ | |
| bulleted_list_item, numbered_list_item, to_do | ✅ | Including nested via `addNestedChildren` |
| quote, callout | ✅ | |
| code | ✅ | One JavaScript block, no other languages |
| equation, divider, toggle | ✅ | But toggle has no children — see below |
| **table** (Notion table) | ❌ | Most users have at least one table |
| **table_row** (cells) | ❌ | Cells are `[contenteditable=true]` — `setLines` will pick them up but cross-cell navigation is untested |
| **column_list** + **column** | ❌ | Multi-column layouts; very common |
| **synced_block** | ❌ | Editing in synced block has duplicate DOM nodes — likely breaks `findIndex(line => line.element === currentActiveElement)` |
| **child_page** (page link) | ❌ | Notion's "special block" path (docs/known-bugs.md mentions but no fixture) |
| **child_database** | ❌ | Database views inline |
| **link_to_page** | ❌ | |
| **embed**, **bookmark**, **video**, **image**, **file**, **pdf** | ❌ | All are special blocks |
| **toggle children** | Partially | Toggle exists but is empty — no test of editing inside an opened toggle |
| **inline mentions** (`@user`, `@page`, `@date`) | ❌ | These are inline elements that break word boundaries |
| **inline equations** | ❌ | Inline LaTeX |
| **rich text decorations** (bold/italic/strike/code/color) | ❌ | All `richText()` calls use plain text — no annotations |
| **inline formulas** | ❌ | |

### What we're missing

`refreshLines` in `core/line-management.ts:88–129` rebuilds the lines array from `document.querySelectorAll("[contenteditable=true]")`. For:

- **Synced blocks**: the same logical content has multiple DOM nodes. `findIndex(line => line.element === currentActiveElement)` may pick the wrong one after a refresh.
- **Tables**: every cell is its own `[contenteditable=true]`. So a 5×4 table adds 20 entries to `vim_info.lines`. `j` from a paragraph above would step into table cells one cell at a time. Untested.
- **Columns**: blocks inside columns are siblings of the column container in Notion's tree but appear linearly in DOM order. Whether `j`/`k` correctly traverse across columns is untested.
- **Decorated text**: `getCursorIndexInElement` walks all text nodes (`reducers/insert.ts:71–93` uses `TreeWalker` similarly). Decorations create extra nested nodes — boundary calculations may be off by one.

### Fix

Extend `test/setup-test-page.ts:buildTestBlocks()` with:

1. A **Section 14: Table** — `{ type: "table", table: { table_width: 3, has_column_header: true, has_row_header: false, children: [<table_row>, <table_row>, …] } }`. Add operator/motion tests across cells.
2. A **Section 15: Columns** — `{ type: "column_list", column_list: { children: [{type:"column", column:{children:[paragraph(), paragraph()]}} × 2] } }`.
3. A **Section 16: Toggle with children** — an open toggle containing 3 paragraphs.
4. A **Section 17: Decorated text** — paragraph with rich_text array of multiple segments: `[{plain "the "}, {bold "quick"}, {plain " brown "}, {italic "fox"}, {code "func"}]`. Test `w`, `b`, `e` motions across decoration boundaries.
5. A **Section 18: Inline mentions/equations** — `richText` mixed with `{type: "mention", mention: {…}}` and `{type: "equation", equation: {expression: "x^2"}}`.
6. A **Section 19: Synced block source + reference** (requires two API calls — create source, then `synced_block` referencing it).
7. A **Section 20: Page link / child_page** — for the special-block path.

Then in `test/e2e/`, add `cross-block-types.spec.ts`-style coverage for each. The catalog already says `cross-block-types.spec.ts` has 170 tests — but they all run on a fixture that has no tables/columns/synced blocks/decorations. The breadth is illusory.

### Bug-catching ROI

- **High but diffuse**. We don't have a known bug list pinned to these block types, but the absence of test fixtures means we *can't* see them. Real users report problems "in tables" and "in columns" — those reports are currently invisible to the suite.

---

## Gap 5: `beforeAll` resets ≠ real session state

### Evidence

Every spec file has `test.beforeAll(async ({ extensionPage: page }) => { await navigateToTestPage(page); ... })`. `navigateToTestPage` in `helpers.ts:21–51` either reuses the page if `.vim-mode` is ready, OR navigates afresh. State leaks across `test()` blocks within a `describe.serial`, but is reset per spec file.

But the bug pattern from BUG-001/002/003/012/013 is exactly **state-accumulation**:

- BUG-001 is "after undo operations earlier in the session"
- BUG-002 is "after editing a heading … the cursor position mapping … gets off by one"
- BUG-012/013 are about `refreshLines`'s `findIndex` returning -1 when an element has been replaced — which only happens after Notion has done at least one block-type conversion in this session

A fresh page cannot exercise these bugs because they require accumulated edits.

### What we're missing

No spec runs across pages. No spec reloads then continues. No spec navigates to a sub-page and back. `stress-fast-user.spec.ts` is the closest thing (no reload between tests within the file, comment at line 67–69) but is contained to one file.

### Fix

1. **Promote a single spec to "session-stress"**: a *single* `describe.serial` block that runs `[create-100-blocks → navigate → edit-each → undo-50-times → redo-25-times → markdown-convert-block → reload → cursor-restored?]`. This is one test file but maybe ~15 minutes of runtime. Run it last.
2. **Cross-spec session**: change worker scope. `extensionContext` in `test/fixtures.ts:19–39` is `scope: "worker"` — good — but the `beforeAll(navigateToTestPage)` reloads. Add a worker-scoped `extensionPage` (already there at line 53–60) and a single `before-all-specs` setup that does the reload, with each spec resuming in whatever state the previous left things. This is the realistic-user-session pattern. **Trade-off**: order-dependence makes failures harder to debug; a `--repeat-each=3` shuffle helps catch state-dependent failures.
3. **Add an explicit "stale element" test**: programmatically (a) mark a block, (b) trigger Notion to replace it (via `##` markdown shortcut), (c) press `j`/`k`, (d) assert `vim_info.active_line` matches the DOM cursor. Today `code-block-nav.spec.ts` does this but the test passes (BUG-012 note: "Automated test passes — cursor correctly stays on code block after Escape"). The bug is timing-dependent — see Gap 6.

### Bug-catching ROI

- **High for BUG-001/002/003/012/013.** These are exactly the "after a few minutes of editing, things drift" bugs.

---

## Gap 6: Variable typing cadence + key-repeat

### Evidence

- `test/helpers.ts:114–122`: `pressKeys` always sleeps `50ms` between keystrokes. Real users:
  - Type bursts of 5–10 chars at 30–80 ms intervals
  - Pause for 200–2000 ms between thoughts
  - **Hold j/k**: OS-level autorepeat fires `keydown` events at the OS-set rate (default ~30 ms on macOS after a 250 ms delay, then continuous)
- `stress-fast-user.spec.ts:16–23` has `fastKeys` with no delay — closer, but **still uses `page.keyboard.press()` which sends discrete `keydown`+`keyup` pairs**. Held-key autorepeat is `keydown` events with NO `keyup` between them. That's a fundamentally different event stream.
- BUG-001's reproduction: "press j 20 times with no delay" — but in reality, *holding* j is what users do. They never tap it 20× discretely. The DOM cursor desync may have a different signature under autorepeat.

### What we're missing

- No test simulates **autorepeat** (key held down → multiple `keydown` without intervening `keyup`).
- No test uses **variable cadence** — bursts, pauses, mid-word backspaces.
- No test models **typing then pausing then typing again** — which is when Notion's auto-save and `MutationObserver` storms fire and collide with Vimtion state.

### Fix

Add helpers in `test/helpers.ts`:

```ts
// Real autorepeat: hold key down, fire many keydowns without keyups
export async function holdKey(page: Page, key: string, repeats: number, intervalMs = 30) {
  await page.keyboard.down(key);
  for (let i = 0; i < repeats - 1; i++) {
    // CDP: dispatchKeyEvent with autoRepeat=true
    await page.evaluate(({key}) => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", {key, repeat: true, bubbles: true, cancelable: true}));
    }, {key});
    await page.waitForTimeout(intervalMs);
  }
  await page.keyboard.up(key);
}

// Variable-cadence typing
export async function typeRealistic(page: Page, text: string) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    const delay = Math.random() < 0.1 ? 200 + Math.random()*300 : 30 + Math.random()*50;
    await page.waitForTimeout(delay);
  }
}
```

Caveat: `page.evaluate` to dispatch synthetic `KeyboardEvent` is *exactly* what Vimtion does internally and has the same Notion-ignores-it problem. The right answer is CDP `Input.dispatchKeyEvent` with `autoRepeat: true`, accessed via `page.context().newCDPSession(page)`. Spell out:

```ts
const cdp = await page.context().newCDPSession(page);
await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "j", autoRepeat: true });
```

Then port `stress-fast-user.spec.ts` "rapid 20j then 20k" to use `holdKey(page, "j", 20)` instead of 20 discrete presses.

### Bug-catching ROI

- **Direct fix for BUG-001 reproducibility.** If BUG-001 only repros under discrete-press, that tells us something. If it ALSO repros under autorepeat, the fix needs to address both. Either way we learn.

---

## Gap 7: Virtualization & long pages

### Evidence

- `test/setup-test-page.ts` creates ~70 blocks. Notion's content area fits all of them in a 1280×720 viewport without scrolling. Notion only virtualizes when blocks scroll off-screen.
- `core/line-management.ts:91–93`: `setLines` queries `document.querySelectorAll("[contenteditable=true]")`. If Notion virtualizes (removes off-screen blocks from the DOM), `vim_info.lines` will SHRINK as the user scrolls. `setActiveLine(idx)` at line 23 does `if (idx >= lines.length) i = lines.length - 1` — so a `gg` after scrolling 200 lines down might land at the wrong block.
- `MutationObserver` at `core/line-management.ts:163–170` watches `document.body` `childList: true, subtree: true`. Every virtualization in/out fires a refresh — a long page is a MutationObserver storm. `refreshLines` runs synchronously each time, which is O(N) over `[contenteditable=true]`. Performance and correctness are both untested.
- `vim.ts:3328`: `if (editableElements.length >= 3)` — magic number that assumes a small page. For a 1000-block page, partial loading might be ≥3 long before the page is ready.

### What we're missing

- No long-page fixture (e.g., 500 paragraph blocks).
- No scroll-into-virtualized-territory test.
- No assertion that `j` on a block whose DOM parent has been removed by virtualization recovers gracefully.

### Fix

1. Add to `setup-test-page.ts:buildTestBlocks()` an optional `LONG_PAGE` mode (env var) that appends 500 `paragraph(`Long-page line ${i}`)` blocks. Run a new spec `long-page.spec.ts` against this.
2. Test cases:
   - `gg` from middle-of-page lands on block 0 with cursor at col 0 (not on a virtualized block index that doesn't exist anymore).
   - `G` from top scrolls and lands on the last block.
   - 100×j with scroll: each step actually advances `active_line` and DOM cursor by 1.
   - Scroll page so blocks 50–100 are virtualized out, then `j` from block 49 to 100. Vimtion must trigger Notion to re-render those blocks, OR fail-safe.

### Bug-catching ROI

- **Medium**. We have no known bug pinned to virtualization, but it's a class of failure that 1-page tests literally cannot see. Likely culprit for "j stops working after I scroll a lot" reports.

---

## Gap 8: Markdown-shortcut block-type conversion

### Evidence

- BUG-012 (docs/known-bugs.md:126–136) and BUG-013 (docs/known-bugs.md:138–147) are both about Notion converting a paragraph to another block type via markdown shortcuts (`##`, `-`, `>`, `[]`, `1.`, ` ``` `). The original element is destroyed and `refreshLines` `findIndex` returns -1 (location: `core/line-management.ts:122–127`). The `if (newIndex !== -1)` guard at line 125 silently keeps the stale index.
- BUG-013's note: "Tests now check `active_line` vs DOM cursor index — confirmed off-by-one for all four variants… All marked `test.fail()`."
- BUG-012's note: "Automated test passes — cursor correctly stays on code block after Escape, j/k works. Bug may be timing-dependent or triggered by specific DOM mutation patterns not captured in test."

So tests partially cover this but only at "headed manual" level. The harness has shown it CAN catch BUG-013 (good), but BUG-012 is hidden from it.

### What we're missing

- The MutationObserver fires but the test asserts state too late. By the time we call `getActualCursorBlockIndex`, the system has settled. We need an assertion *immediately after Escape*, before any post-update has happened.
- All seven markdown-shortcut variants need cells in a matrix: `[##, ###, -, 1., >, [], ` ``` `]` × `[at start of empty line, at start of non-empty line, mid-content]`. Currently only a subset.

### Fix

1. Add a parametrized test in `test/e2e/markdown-shortcut-conversion.spec.ts` that loops over all `(shortcut, content)` pairs.
2. After typing the shortcut + Enter (or trigger char), immediately read `vim_info.active_line` (via `vim-mode` status bar) AND `getActualCursorBlockIndex(page)`. They MUST match. If they don't, we've reproduced BUG-012/013 deterministically.
3. **Source-side fix** (out of scope here, flag for impl): in `core/line-management.ts:121–128`, when `newIndex === -1`, fall back to *position-based* recovery: find the new element by `data-block-id` (saved before the mutation) or by index proximity. Don't silently keep the stale index.

### Bug-catching ROI

- **High** for BUG-012, BUG-013, and any future block-conversion bug.

---

## Gap 9: Continuous cursor-sync invariant assertion

### Evidence

This is the *meta-gap*. Five of the 13 known bugs (1, 2, 3, 4, 12, 13) are "vim_info state and DOM cursor disagree." Today, tests check this at the **end** of a sequence — after `j` 20×, after `o`+type+Esc, etc. They do NOT check after EACH key.

Helpers `getActualCursorBlockIndex` (`helpers.ts:162–176`) and `getCursorPosition` (line 178–211) exist but are called sparingly.

### Fix

Add a Playwright fixture that wraps `page.keyboard.press` to assert the invariant after every press (in normal/visual modes — not insert mode where Notion legitimately moves the cursor):

```ts
async function assertCursorSync(page: Page) {
  const state = await getVimState(page);
  if (state.mode === "normal" || state.mode.startsWith("visual")) {
    const domIdx = await getActualCursorBlockIndex(page);
    expect(state.activeLine - 1).toBe(domIdx); // 1-based to 0-based
  }
}
```

This is task #2 (Design continuous cursor-sync invariant system) — flag it for that teammate.

### Bug-catching ROI

- **Highest for cursor desync class.** This is the assertion that turns "we know there's a bug somewhere" into "the bug is at this exact keystroke."

---

## Gap 10: Real-content fixtures (decorations, mentions, edge text)

### Evidence

`test/setup-test-page.ts:23–31` defines `richText(content, annotations?)` but every call site passes plain strings. No annotations, no multi-segment rich_text arrays, no inline mentions, no inline equations.

Real users have:

- Bold/italic/strikethrough/underline/code/colored text inside paragraphs
- `@`-mentions of pages, users, dates
- Inline LaTeX (`$x^2$`)
- Emoji inside text (varying byte lengths break UTF-16 cursor offsets)
- Empty leaf elements next to text (Notion sometimes inserts `<br>` placeholders)

`getCursorIndexInElement` and the various `setCursorPosition` calls (e.g., `core/line-management.ts:77`) walk text nodes. Cursor position in a paragraph with `[plain "abc"][bold "def"]` is 6, but the DOM has two `<span>` children — selection offsets within the second span need to be added to the first span's length. Untested.

### Fix

In `test/setup-test-page.ts`, add Section 14: "Decorated text" with `richText` arrays:

```ts
function decoratedParagraph(): NotionBlock {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        { type: "text", text: { content: "the " } },
        { type: "text", text: { content: "quick" }, annotations: { bold: true } },
        { type: "text", text: { content: " brown " } },
        { type: "text", text: { content: "fox" }, annotations: { italic: true } },
        { type: "text", text: { content: " jumps over " } },
        { type: "text", text: { content: "the lazy" }, annotations: { code: true } },
        { type: "text", text: { content: " dog" } },
      ],
    },
  };
}
```

Then test `w`, `b`, `e`, `f`, `t`, `0`, `$`, `ciw`, `daw` across the decoration boundaries. Add a paragraph with a date mention and assert `dw` over the mention. Add a paragraph with emoji and assert cursor offset is correct (Notion uses UTF-16 surrogate pairs).

### Bug-catching ROI

- **Medium**. Likely catches latent text-object boundary bugs that real users hit but our plain-text fixture hides.

---

## Cross-cutting: things to watch for as gaps close

- **Notion API rate-limits** during `setup-test-page` — adding more block types may exceed the 3 req/s limit. Add `await new Promise(r => setTimeout(r, 350))` between batches if you batch.
- **Fixture page TTL** — the `deleteTestPage` flow archives the previous page (`global-setup.ts:111–117`). After 100 runs, the parent page has 100 archived children. Add a cleanup script that hard-deletes archived test pages older than 7 days.
- **Worker concurrency** — `playwright.config.ts:27` has `workers: 1`. If we add headed parallel projects (Gap 2), they MUST stay serial because they share `auth/.user-data`. Or, use separate user-data dirs per project.
- **Parcel build artifacts** — tests load `dist/` (`fixtures.ts:9`). If a developer forgets `npm run build`, tests run against stale code. Add a `pretest` script: `"pretest": "npm run build"` in package.json.

---

## Hand-off summary for team lead

| Gap | Pieces to hand to other teammates |
|---|---|
| 1 (event injection) | **impl-eng**: replace `vim.ts:256–264, 287–294, 300–307, navigation/code-block.ts:110` with non-synthetic event paths. **test-eng** (this overhaul): write headed/headless parity tests. |
| 2 (headed parity) | **infra/CI**: extend `playwright.config.ts:37–48` projects; double CI time. |
| 3 (IME) | **test-eng**: write composition-event helpers + Japanese input fixture. **impl-eng**: add `e.isComposing` guard at `vim.ts:487`. |
| 4 (block-type breadth) | **test-eng**: extend `test/setup-test-page.ts:152–246` with Sections 14–20 (table, columns, synced, toggle children, decorated rich_text, mentions, page links). |
| 5 (session state) | **test-eng**: build `session-stress.spec.ts`; consider cross-spec persistent worker. |
| 6 (typing cadence) | **test-eng**: add `holdKey` and `typeRealistic` in `test/helpers.ts`; rewrite `stress-fast-user.spec.ts` to use them. |
| 7 (virtualization) | **test-eng**: 500-block fixture mode; `long-page.spec.ts`. |
| 8 (markdown shortcuts) | **test-eng**: parametrized `markdown-shortcut-conversion.spec.ts`. **impl-eng**: position-based recovery in `core/line-management.ts:121–128`. |
| 9 (continuous invariant) | **task #2 owner** (cursor-sync designer): build the `assertCursorSync` fixture. |
| 10 (real content) | **test-eng**: rich_text arrays in `test/setup-test-page.ts`. |

The single highest-ROI move: **enable headed/headless matrix (Gap 2) + add the continuous cursor-sync invariant (Gap 9)**. Together they catch BUG-008, BUG-009, BUG-001, BUG-002, BUG-003, BUG-012, BUG-013 — seven of thirteen known bugs — for ~3 days of test-eng work and ~2× CI cost. Everything else is high-leverage but secondary.
