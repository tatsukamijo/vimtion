import type { Page } from "@playwright/test";

export {
  pressKeys,
  assertCursorInvariant,
  useCursorInvariant,
  assertUiInvariant,
  useUiInvariant,
  type InvariantOptions,
} from "./cursor-invariant";

// Realistic-input helpers — see test/realistic-input.ts for the rationale on
// why these route through CDP rather than synthetic KeyboardEvents.
export {
  holdKey,
  typeRealistic,
  pressKeysWithIME,
  type HoldKeyOptions,
  type TypeRealisticOptions,
} from "./realistic-input";

// Wait helpers — async DOM waits for Notion's post-input mutations
// (e.g., markdown-shortcut block conversions). See test/wait-helpers.ts.
export {
  waitForBlockConversion,
  getCurrentBlockType,
  type BlockType,
  type WaitForBlockConversionOptions,
} from "./wait-helpers";

const TEST_PAGE_URL = process.env.NOTION_TEST_PAGE_URL || "";

export interface VimState {
  mode: string;
  activeLine: number;
  lineCount: number;
  statusText: string;
}

async function waitForVimtionReady(page: Page, timeout: number): Promise<void> {
  // Wait for Vimtion's status bar to appear
  await page.waitForSelector(".vim-mode", { timeout });

  // Press Escape to trigger updateInfoContainer and ensure normal mode
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

export async function navigateToTestPage(
  page: Page,
  timeout = 30_000
): Promise<void> {
  if (!TEST_PAGE_URL) {
    throw new Error(
      "NOTION_TEST_PAGE_URL is not set. Create test/.env with the URL of your test Notion page."
    );
  }

  // If already on the test page with Vimtion ready, skip navigation
  const currentUrl = page.url();
  if (currentUrl.includes("notion.so")) {
    const text = await page.locator(".vim-mode").textContent().catch(() => "");
    if (text && text.includes("Line")) {
      return;
    }
  }

  // Retry page.goto on transient Notion failures (net::ERR_FAILED, timeouts, ABORTED).
  // These come from Notion's CDN / rate limiter intermittently and used to halt entire
  // describe.serial blocks via beforeAll. Three attempts with brief backoff is enough
  // to absorb the flake without papering over genuine "Notion is down" outages.
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(TEST_PAGE_URL, {
        waitUntil: "domcontentloaded",
        timeout,
      });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient =
        msg.includes("net::ERR_FAILED") ||
        msg.includes("net::ERR_ABORTED") ||
        msg.includes("net::ERR_TIMED_OUT") ||
        msg.includes("Timeout");
      if (!transient || attempt === 3) throw err;
      await page.waitForTimeout(1500 * attempt);
    }
  }
  if (lastError) throw lastError;

  // Dismiss Notion's "using Vimium?" warning if it appears
  const gotItButton = page.getByRole("button", { name: "Got it" });
  if (await gotItButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await gotItButton.click();
    // Reload to restart Vimtion's line detection polling
    await page.reload({ waitUntil: "domcontentloaded" });
  }

  await waitForVimtionReady(page, timeout);
}

export async function reloadAndWait(
  page: Page,
  timeout = 30_000
): Promise<void> {
  await page.reload({ waitUntil: "load" });
  await waitForVimtionReady(page, timeout);
}

export function parseStatusText(text: string): VimState {
  const modeMatch = text.match(/--\s+(\S+)\s+--/);
  const mode = modeMatch ? modeMatch[1].toLowerCase() : "unknown";

  const lineMatch = text.match(/Line\s+(\d+)\/(\d+)/);
  const activeLine = lineMatch ? parseInt(lineMatch[1], 10) : -1;
  const lineCount = lineMatch ? parseInt(lineMatch[2], 10) : -1;

  return { mode, activeLine, lineCount, statusText: text };
}

export async function getVimState(page: Page): Promise<VimState> {
  const text = (await page.locator(".vim-mode").textContent()) ?? "";
  return parseStatusText(text);
}

export async function waitForVimStateReady(
  page: Page,
  timeout = 5_000
): Promise<VimState> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await getVimState(page);
    if (state.lineCount > 0 && state.activeLine > 0) return state;
    // Press Escape to trigger updateInfoContainer and populate line info
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
  return getVimState(page);
}

export async function getMode(page: Page): Promise<string> {
  const state = await getVimState(page);
  return state.mode;
}

export async function waitForMode(
  page: Page,
  mode: string,
  timeout = 5_000
): Promise<void> {
  const modeUpper = mode.toUpperCase();
  await page.locator(".vim-mode").filter({ hasText: `-- ${modeUpper} --` }).waitFor({ timeout });
}

export async function waitForBodyClass(
  page: Page,
  className: string,
  timeout = 5_000
): Promise<void> {
  await page.waitForSelector(`body.${className}`, { timeout });
}

// pressKeys is now exported from ./cursor-invariant via the re-export at the
// top of this file. The new signature is a strict superset of the legacy one
// (`...string[]` still works), with optional trailing InvariantOptions.

export async function getLineText(
  page: Page,
  lineIndex: number
): Promise<string> {
  const blocks = page.locator('[contenteditable="true"]');
  return (await blocks.nth(lineIndex).textContent()) ?? "";
}

export async function getEditableBlockCount(page: Page): Promise<number> {
  return page.locator('[contenteditable="true"]').count();
}

export async function getModeText(page: Page): Promise<string> {
  return (await page.locator(".vim-mode").textContent()) ?? "";
}

/**
 * Get the text of the block that actually has the DOM cursor/selection.
 * This checks the real browser selection, independent of vim_info.active_line.
 */
export async function getActualCursorBlockText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return "";
    const node = sel.anchorNode;
    if (!node) return "";
    const el = node.nodeType === Node.ELEMENT_NODE
      ? node as Element
      : node.parentElement;
    const leaf = el?.closest('[data-content-editable-leaf="true"]');
    return leaf?.textContent ?? "";
  });
}

/**
 * Get the index of the block that has the DOM cursor among all leaf blocks.
 * Returns -1 if cursor is not in any leaf block.
 */
export async function getActualCursorBlockIndex(page: Page): Promise<number> {
  return page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return -1;
    const node = sel.anchorNode;
    if (!node) return -1;
    const el = node.nodeType === Node.ELEMENT_NODE
      ? node as Element
      : node.parentElement;
    const leaf = el?.closest('[data-content-editable-leaf="true"]');
    if (!leaf) return -1;
    const allLeaves = document.querySelectorAll('[data-content-editable-leaf="true"]');
    return Array.from(allLeaves).indexOf(leaf);
  });
}

export async function getCursorPosition(page: Page): Promise<{ line: number; col: number }> {
  const state = await getVimState(page);
  // activeLine from status bar is 1-based, convert to 0-based
  const line = state.activeLine > 0 ? state.activeLine - 1 : -1;

  // Read cursor_position from vim_info via content script's injected DOM attribute
  // Since vim_info is in the content script's isolated world, we read from the
  // vim-block-cursor element's position or the status bar
  const col = await page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return -1;
    // Calculate character offset from the start of the leaf block
    const node = sel.anchorNode;
    if (!node) return -1;
    const el = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    const leaf = el?.closest('[data-content-editable-leaf="true"]');
    if (!leaf) return sel.anchorOffset;

    // Walk all text nodes in the leaf to compute absolute offset
    const walker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let current = walker.nextNode();
    while (current) {
      if (current === sel.anchorNode) {
        return offset + sel.anchorOffset;
      }
      offset += (current.textContent || "").length;
      current = walker.nextNode();
    }
    return sel.anchorOffset;
  });

  return { line, col };
}

export async function getSelectionOffset(page: Page): Promise<number> {
  return page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return -1;
    return sel.anchorOffset;
  });
}

export async function getAllBlockTexts(page: Page): Promise<string[]> {
  const blocks = page.locator('[data-content-editable-leaf="true"]');
  const count = await blocks.count();
  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    texts.push((await blocks.nth(i).textContent()) ?? "");
  }
  return texts;
}
