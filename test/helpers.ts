import type { Page } from "@playwright/test";

const TEST_PAGE_URL = process.env.NOTION_TEST_PAGE_URL || "";

export interface VimState {
  mode: string;
  activeLine: number;
  lineCount: number;
  statusText: string;
}

async function waitForVimtionReady(page: Page, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    // Check if Line info is already in status bar
    const text = await page.locator(".vim-mode").textContent().catch(() => "");
    if (text && text.includes("Line")) {
      return;
    }

    // Try clicking a contenteditable element to trigger line detection
    const editable = page.locator('[contenteditable="true"]').first();
    if (await editable.isVisible().catch(() => false)) {
      await editable.click({ timeout: 2_000 }).catch(() => {});
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    `Vimtion did not initialize within ${timeout}ms. Status bar: "${await page.locator(".vim-mode").textContent().catch(() => "not found")}"`
  );
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

  await page.goto(TEST_PAGE_URL, { waitUntil: "load" });

  // Dismiss Notion's "using Vimium?" warning if it appears
  const gotItButton = page.getByRole("button", { name: "Got it" });
  if (await gotItButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await gotItButton.click();
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

export async function pressKeys(
  page: Page,
  ...keys: string[]
): Promise<void> {
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
  }
}

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
