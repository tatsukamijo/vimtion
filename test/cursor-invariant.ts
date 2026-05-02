/**
 * Continuous cursor-sync invariant.
 *
 * Asserts after each keystroke that:
 *   window.vim_info.lines[active_line].element  ===  the leaf element
 *   that owns window.getSelection()'s anchor/focus node.
 *
 * Element-identity (not index-identity) is the rule, so it's robust to:
 *   - code blocks that hold many visual rows in one [contenteditable="true"]
 *   - selector mismatches between [contenteditable="true"] and
 *     [data-content-editable-leaf="true"]
 *
 * See docs/test-overhaul/invariant-design.md for the full rationale.
 */
import { expect, test as base, type Page } from "@playwright/test";

export interface InvariantOptions {
  /** Check the invariant after each key (default: respects the spec-wide flag). */
  assertInvariant?: boolean;
  /** Even check in insert mode (default: false — Notion may transiently own selection). */
  strict?: boolean;
  /** Free-form label included in failure message. Useful for fence-post asserts. */
  label?: string;
}

// Module-level flags toggled by useCursorInvariant().
let specWideEnabled = false;
let specWideStrict = false;
const recentKeys: string[] = [];

interface InvariantSnapshot {
  mode: string;
  pendingOperator: string | null;
  activeLine: number;
  cursorPosition: number;
  linesLength: number;
  domEditableCount: number;
  expectedElementHtml: string | null;
  actualElementHtml: string | null;
  elementMatch: boolean;
  expectedDetached: boolean;
  actualIdx: number;
  textWindow: Array<{ idx: number; text: string }>;
}

async function snapshot(page: Page): Promise<InvariantSnapshot> {
  return page.evaluate(() => {
    interface VimLineLite {
      element: HTMLElement;
      cursor_position: number;
    }
    interface VimInfoLite {
      active_line: number;
      cursor_position: number;
      lines: VimLineLite[];
      mode: string;
      pending_operator: string | null;
    }
    const vi = (window as unknown as { vim_info?: VimInfoLite }).vim_info;
    const sel = window.getSelection();
    const anchor = sel?.anchorNode ?? null;
    const focus = sel?.focusNode ?? null;
    const cursorNode = vi?.mode?.startsWith("visual") ? focus : anchor;
    const el =
      cursorNode && cursorNode.nodeType === 1
        ? (cursorNode as Element)
        : cursorNode?.parentElement ?? null;
    const actualLeaf = el?.closest('[contenteditable="true"]') ?? null;
    const expectedLeaf = vi?.lines?.[vi.active_line]?.element ?? null;
    const allEditable = Array.from(
      document.querySelectorAll('[contenteditable="true"]'),
    );
    const trim = (e: Element | null): string | null => {
      if (!e) return null;
      const html = e.outerHTML;
      return html.length > 120 ? `${html.slice(0, 120)}…` : html;
    };
    const buildWindow = (i: number): Array<{ idx: number; text: string }> => {
      const out: Array<{ idx: number; text: string }> = [];
      const len = vi?.lines?.length ?? 0;
      for (const d of [-2, -1, 0, 1, 2]) {
        const j = i + d;
        if (j < 0 || j >= len) continue;
        const text = (vi!.lines[j].element.textContent ?? "").slice(0, 60);
        out.push({ idx: j, text });
      }
      return out;
    };
    return {
      mode: vi?.mode ?? "unknown",
      pendingOperator: (vi?.pending_operator as string | null) ?? null,
      activeLine: vi?.active_line ?? -1,
      cursorPosition: vi?.cursor_position ?? -1,
      linesLength: vi?.lines?.length ?? 0,
      domEditableCount: allEditable.length,
      expectedElementHtml: trim(expectedLeaf),
      actualElementHtml: trim(actualLeaf),
      elementMatch: !!expectedLeaf && expectedLeaf === actualLeaf,
      expectedDetached: !!expectedLeaf && !document.contains(expectedLeaf),
      actualIdx: actualLeaf ? allEditable.indexOf(actualLeaf) : -1,
      textWindow: buildWindow(vi?.active_line ?? -1),
    };
  });
}

function shouldCheck(s: InvariantSnapshot, strict: boolean): boolean {
  if (s.mode === "link-hint") return false;
  if (s.linesLength === 0) return false;
  if (s.mode === "insert" && !strict) return false;
  return true;
}

function diagnose(s: InvariantSnapshot): string {
  if (s.expectedDetached) {
    return (
      "lines[active_line].element is detached — stale element after a " +
      "DOM mutation (likely BUG-012/013: refreshLines lost track)."
    );
  }
  if (s.linesLength !== s.domEditableCount) {
    return (
      `lines.length (${s.linesLength}) ≠ DOM editable count ` +
      `(${s.domEditableCount}) — list out of sync (refreshLines missed a mutation).`
    );
  }
  if (s.elementMatch === false && s.activeLine === s.actualIdx) {
    return "Same index, different element — selector or list-build mismatch.";
  }
  return "Cursor moved without active_line being updated (or vice versa).";
}

/** Manual one-shot check. Safe to call any time. */
export async function assertCursorInvariant(
  page: Page,
  opts: InvariantOptions = {},
): Promise<void> {
  const strict = opts.strict ?? specWideStrict;
  const s = await snapshot(page);
  if (!shouldCheck(s, strict)) return;
  if (s.elementMatch) return;

  const label = opts.label ? ` (label: "${opts.label}")` : "";
  const lastKey = recentKeys[recentKeys.length - 1] ?? "<none>";
  const lines = [
    `[CursorInvariant] Mismatch after key "${lastKey}"${label}`,
    ``,
    `  mode:                 ${s.mode}`,
    `  pending_operator:     ${s.pendingOperator}`,
    `  vim_info.active_line: ${s.activeLine}  → ${s.expectedElementHtml}`,
    `  DOM cursor block:     ${s.actualIdx}  → ${s.actualElementHtml}`,
    `  element identity:     ${s.elementMatch ? "MATCH" : "MISMATCH"}`,
    `  vim_info.cursor_position: ${s.cursorPosition}`,
    `  vim_info.lines.length:    ${s.linesLength}`,
    `  DOM editable count:       ${s.domEditableCount}`,
    ``,
    `  Last keys: ${JSON.stringify(recentKeys.slice(-5))}`,
    ``,
    `  Block contents (active_line ± 2):`,
    ...s.textWindow.map((w) => {
      const marker = w.idx === s.activeLine ? "→ " : "  ";
      return `${marker}${w.idx}: ${JSON.stringify(w.text)}`;
    }),
    ``,
    `  Hint: ${diagnose(s)}`,
  ];
  expect(s.elementMatch, lines.join("\n")).toBe(true);
}

/**
 * Replacement for the legacy pressKeys — accepts a trailing options object.
 * `pressKeys(page, "j", "k")` continues to work; `pressKeys(page, "j", { assertInvariant: true })`
 * opts in to a per-call check.
 */
export async function pressKeys(
  page: Page,
  ...keysOrOpts: Array<string | InvariantOptions>
): Promise<void> {
  let opts: InvariantOptions = {};
  const last = keysOrOpts[keysOrOpts.length - 1];
  if (last && typeof last === "object") {
    opts = keysOrOpts.pop() as InvariantOptions;
  }
  const keys = keysOrOpts as string[];
  const enabled = opts.assertInvariant ?? specWideEnabled;
  for (const key of keys) {
    await page.keyboard.press(key);
    recentKeys.push(key);
    if (recentKeys.length > 16) recentKeys.shift();
    await page.waitForTimeout(50);
    if (enabled) await assertCursorInvariant(page, opts);
  }
}

/**
 * Spec-level toggle. Call inside a describe() block — Playwright's beforeEach/afterEach
 * register against the enclosing scope.
 *
 * If the spec uses a fixture-extended `test` object (e.g. `import { test } from "../fixtures"`),
 * pass it as the second argument. Hooks registered on `base` from `@playwright/test` do NOT
 * always propagate to fixture-extended test objects — passing the same `test` the spec uses
 * guarantees they fire.
 */
type HookHost = {
  beforeEach: (fn: (...a: unknown[]) => unknown) => void;
  afterEach: (fn: (...a: unknown[]) => unknown) => void;
};

export function useCursorInvariant(
  opts: { strict?: boolean; skipInsert?: boolean } = {},
  testObj: HookHost = base as unknown as HookHost,
): void {
  testObj.beforeEach(() => {
    specWideEnabled = true;
    specWideStrict = opts.strict ?? false;
  });
  testObj.afterEach(() => {
    specWideEnabled = false;
    specWideStrict = false;
    recentKeys.length = 0;
  });
}
