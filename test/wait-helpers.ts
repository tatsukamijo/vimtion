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
 *   3. Re-focuses the new element
 *
 * The mutation is async (typically <100ms but can be longer under load).
 * `waitForBlockConversion` polls until the active block reports the expected
 * type, then resolves — making downstream assertions deterministic.
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

/**
 * Snapshot of the currently-active block. All fields are computed inside the
 * page's main world via `page.evaluate` — the values we need for both
 * type-detection and diagnostic messages.
 */
interface ActiveBlockSnapshot {
  /** True if `document.activeElement` resolved to a block; false if focus is lost. */
  hasActive: boolean;
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
 * Implementation note: this is a single `page.evaluate` rather than separate
 * locator queries so the values are read atomically — important when polling,
 * because the DOM mutates between calls and a multi-step read could see
 * inconsistent state (e.g., type changed between the className read and the
 * textContent read).
 */
async function readActiveBlock(page: Page): Promise<ActiveBlockSnapshot> {
  return page.evaluate((mappingJson: string) => {
    const mapping = JSON.parse(mappingJson) as Record<string, string>;
    const active = document.activeElement;
    const block = active?.closest("[data-block-id]") as HTMLElement | null;

    if (!block) {
      return {
        hasActive: false,
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
      hasActive: true,
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
 * Wait until the active block (the block containing `document.activeElement`)
 * has the given type — i.e., until Notion has finished applying a markdown
 * shortcut conversion (`##` → heading, `- ` → bullet, etc.).
 *
 * Throws on timeout with a diagnostic that includes:
 *   - what was expected
 *   - the actual block's class set (so unmapped Notion classes show up)
 *   - the active block's textContent (first 80 chars)
 *   - the active block's `data-block-id`
 *   - whether focus was lost (`hasActive: false`)
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
    if (last.hasActive && last.type === expectedType) {
      return;
    }
    await page.waitForTimeout(pollIntervalMs);
  }

  // One final read after the loop so the diagnostic reflects the latest state.
  const final = await readActiveBlock(page);
  const snap = final.hasActive ? final : last;

  const diag = snap
    ? [
        `expected: "${expectedType}"`,
        snap.hasActive
          ? `actual type: "${snap.type}"`
          : `actual: NO active block — document.activeElement has no [data-block-id] ancestor (focus lost?)`,
        snap.hasActive ? `block class: "${snap.classNames}"` : "",
        snap.hasActive ? `block id: "${snap.blockId}"` : "",
        snap.hasActive
          ? `text (first 80): "${snap.textPreview}"`
          : "",
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
 * matched (Notion shipped a new class), or `"unknown"` if focus is not on
 * any block (callers should verify focus first if they care).
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
