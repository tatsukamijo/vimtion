/**
 * Wait Helpers
 *
 * Async-DOM waits for things Notion does after user input — particularly
 * block-type conversions triggered by markdown shortcuts (`##`, `-`, `> `,
 * ` ``` `, `1. `, `[] `).
 *
 * After a markdown shortcut + Enter, Notion:
 *   1. Removes the original `[contenteditable="true"]` paragraph element
 *   2. Inserts a new `[contenteditable="true"]` element of the converted type
 *   3. Re-focuses the new element via Range/Selection (NOT always via
 *      `document.activeElement`)
 *
 * The mutation is async (typically <100ms but can be longer under load).
 * `waitForBlockConversion` polls until the active block reports the expected
 * type, then resolves — making downstream assertions deterministic.
 *
 * Cursor-source resolution
 * ------------------------
 * Earlier versions of this helper used `document.activeElement.closest(...)`
 * to find the active block. That fails in Playwright headless after Vimtion's
 * synthetic-event paths (e.g., `o`, `O`): Notion advances the cursor via
 * `window.getSelection().setRange(...)` but does not always update
 * `document.activeElement`, which stays on `<body>` in headless. The helper
 * now reads the cursor from `window.getSelection().anchorNode` first and
 * falls back to `document.activeElement` only when the selection is empty —
 * the same pattern the cursor-invariant uses.
 */

import type { Page } from "@playwright/test";

// =============================================================================
// Notion block-type ↔ CSS class mapping
// =============================================================================

/**
 * The set of converted types we expect markdown shortcuts to produce.
 *
 * Aligned with Notion API block-type names (`heading_1`, `bulleted_list_item`,
 * etc.) where they exist; falls back to Vimtion's internal short names where
 * the API name and the CSS class name disagree (e.g., Notion's CSS class for
 * H1 is `notion-header-block`, not `notion-heading_1-block`).
 */
export type BlockType =
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bulleted_list"
  | "numbered_list"
  | "to_do"
  | "quote"
  | "code"
  | "callout"
  | "text";

/**
 * Map of `BlockType` → Notion CSS class fragment.
 *
 * These class names are taken from Vimtion's production block-type detection
 * at `src/content_scripts/notion/dom.ts:35-45` and are battle-tested in the
 * shipped extension. Notion's heading classes use the historical names
 * (`header` / `sub_header` / `sub_sub_header`) rather than the API's
 * `heading_1/2/3`.
 *
 * The matching is `className.includes(...)` to tolerate Notion's compound
 * class strings like `notion-selectable notion-header-block`.
 */
const BLOCK_TYPE_CLASS: Record<BlockType, string> = {
  heading_1: "notion-header-block",
  heading_2: "notion-sub_header-block",
  heading_3: "notion-sub_sub_header-block",
  bulleted_list: "notion-bulleted_list-block",
  numbered_list: "notion-numbered_list-block",
  to_do: "notion-to_do-block",
  quote: "notion-quote-block",
  code: "notion-code-block",
  callout: "notion-callout-block",
  // Notion paragraphs render as `notion-text-block`. The legacy detector at
  // notion/dom.ts:47 falls back to "text" without checking a class — we use
  // an explicit class here so the helper can affirm "this is a paragraph"
  // rather than just "this is none of the others".
  text: "notion-text-block",
};

// =============================================================================
// Block-type detection (runs in page context)
// =============================================================================

/** Where the cursor was sourced from when resolving the active block. */
type CursorSource = "selection" | "activeElement" | "none";

/**
 * Snapshot of the currently-active block. All fields are computed inside the
 * page's main world via `page.evaluate` — the values we need for both
 * type-detection and diagnostic messages.
 */
interface ActiveBlockSnapshot {
  /** True if a block was resolved; false if both selection and activeElement
   *  were empty / had no [data-block-id] ancestor. */
  hasBlock: boolean;
  /** Where we found the cursor: selection (preferred), activeElement (fallback), or none. */
  source: CursorSource;
  /** The detected block type (or `"unknown"` if no class matched). */
  type: BlockType | "unknown";
  /** The active block's `className` attribute, verbatim. */
  classNames: string;
  /** The first 80 chars of textContent, for diagnostics. */
  textPreview: string;
  /** The block's `data-block-id` attribute, for diagnostics. */
  blockId: string;
}

/** Stringified BLOCK_TYPE_CLASS for injection into page.evaluate. */
const BLOCK_TYPE_CLASS_JSON = JSON.stringify(BLOCK_TYPE_CLASS);

/**
 * Read the active block's type + diagnostic info from the page.
 *
 * Cursor source resolution (in order):
 *   1. `window.getSelection().anchorNode` — primary. Notion uses Range/
 *      Selection for cursor positioning and this is correct in both headed
 *      and headless. The cursor-invariant uses the same path.
 *   2. `document.activeElement` — fallback. Useful when the selection is
 *      empty (e.g., right after page load before any click).
 *   3. None — neither yielded a `[data-block-id]` ancestor.
 *
 * Implementation note: this is a single `page.evaluate` rather than separate
 * locator queries so the values are read atomically — important when polling,
 * because the DOM mutates between calls and a multi-step read could see
 * inconsistent state (e.g., type changed between the className read and the
 * textContent read).
 */
async function readActiveBlock(page: Page): Promise<ActiveBlockSnapshot> {
  return page.evaluate((mappingJson: string) => {
    const mapping = JSON.parse(mappingJson) as Record<string, string>;

    // 1. Primary: window.getSelection().anchorNode → closest [data-block-id]
    const sel = window.getSelection();
    const anchor = sel?.anchorNode ?? null;
    const anchorEl =
      anchor?.nodeType === Node.ELEMENT_NODE
        ? (anchor as Element)
        : anchor?.parentElement ?? null;
    const fromSelection = anchorEl?.closest("[data-block-id]") as
      | HTMLElement
      | null;

    // 2. Fallback: document.activeElement → closest [data-block-id]
    const fromActive = (document.activeElement as Element | null)?.closest(
      "[data-block-id]",
    ) as HTMLElement | null;

    let block: HTMLElement | null = null;
    let source: "selection" | "activeElement" | "none" = "none";
    if (fromSelection) {
      block = fromSelection;
      source = "selection";
    } else if (fromActive) {
      block = fromActive;
      source = "activeElement";
    }

    if (!block) {
      return {
        hasBlock: false,
        source,
        type: "unknown" as const,
        classNames: "",
        textPreview: "",
        blockId: "",
      };
    }

    const classNames = block.className || "";
    let detected: string = "unknown";
    for (const [type, cls] of Object.entries(mapping)) {
      if (classNames.includes(cls)) {
        detected = type;
        break;
      }
    }

    const text = (block.textContent || "").slice(0, 80);
    return {
      hasBlock: true,
      source,
      type: detected as ActiveBlockSnapshot["type"],
      classNames,
      textPreview: text,
      blockId: block.getAttribute("data-block-id") || "",
    };
  }, BLOCK_TYPE_CLASS_JSON);
}

// =============================================================================
// Public API
// =============================================================================

export interface WaitForBlockConversionOptions {
  /** Max wait in ms before throwing. Default 2000. */
  timeout?: number;
  /** Poll interval in ms. Default 30. */
  pollIntervalMs?: number;
}

/**
 * Wait until the active block (the block containing the cursor — either via
 * `window.getSelection().anchorNode` or, as a fallback, `document.activeElement`)
 * has the given type — i.e., until Notion has finished applying a markdown
 * shortcut conversion (`##` → heading, `- ` → bullet, etc.).
 *
 * Throws on timeout with a diagnostic that includes:
 *   - what was expected
 *   - the actual block's class set (so unmapped Notion classes show up)
 *   - the active block's textContent (first 80 chars)
 *   - the active block's `data-block-id`
 *   - which cursor source was used (`selection` / `activeElement` / `none`)
 *   - whether the block was resolvable at all (`hasBlock: false`)
 *
 * @param page - Playwright Page
 * @param expectedType - Target block type (see `BlockType` union)
 * @param opts - Optional timeout / poll interval
 *
 * Example:
 *   await page.keyboard.press("i");
 *   await page.keyboard.type("## My heading");
 *   await page.keyboard.press("Enter");
 *   await waitForBlockConversion(page, "heading_2");
 *   // Now safe to assert on the heading
 */
export async function waitForBlockConversion(
  page: Page,
  expectedType: BlockType,
  opts: WaitForBlockConversionOptions = {},
): Promise<void> {
  const timeout = opts.timeout ?? 2000;
  const pollIntervalMs = opts.pollIntervalMs ?? 30;
  const deadline = Date.now() + timeout;

  let last: ActiveBlockSnapshot | null = null;
  while (Date.now() < deadline) {
    last = await readActiveBlock(page);
    if (last.hasBlock && last.type === expectedType) {
      return;
    }
    await page.waitForTimeout(pollIntervalMs);
  }

  // One final read after the loop so the diagnostic reflects the latest state.
  const final = await readActiveBlock(page);
  const snap = final.hasBlock ? final : last;

  const diag = snap
    ? [
        `expected: "${expectedType}"`,
        snap.hasBlock
          ? `actual type: "${snap.type}"`
          : `actual: NO block resolvable from cursor — neither window.getSelection().anchorNode nor document.activeElement has a [data-block-id] ancestor`,
        `cursor source: "${snap.source}"`,
        snap.hasBlock ? `block class: "${snap.classNames}"` : "",
        snap.hasBlock ? `block id: "${snap.blockId}"` : "",
        snap.hasBlock ? `text (first 80): "${snap.textPreview}"` : "",
      ]
        .filter(Boolean)
        .join("\n  ")
    : "no snapshot taken";

  throw new Error(
    `waitForBlockConversion timed out after ${timeout}ms.\n  ${diag}`,
  );
}

/**
 * Read the currently-active block's type without polling. Useful for
 * per-block assertions in test bodies.
 *
 * Returns one of the `BlockType` union members, or `"unknown"` if no class
 * matched (Notion shipped a new class), or `"unknown"` if no block is
 * resolvable from either selection or activeElement (callers should verify
 * focus / selection first if they care).
 *
 * Resolution is the same as `waitForBlockConversion`: selection first,
 * activeElement fallback. See the module-level docstring.
 *
 * @param page - Playwright Page
 *
 * Example:
 *   expect(await getCurrentBlockType(page)).toBe("heading_2");
 */
export async function getCurrentBlockType(
  page: Page,
): Promise<BlockType | "unknown"> {
  const snap = await readActiveBlock(page);
  return snap.type;
}
