/**
 * The link hint key option: f or F can show link hints (Vimium-style) in
 * place of find-char, while gl and operator + f (df, cF, ...) keep working.
 *
 * Settings live in the persistent profile, so every test resets them.
 */
import { test, expect } from "../fixtures";
import type { BrowserContext, Page } from "@playwright/test";
import { pressKeys, waitForVimStateReady, getAllBlockTexts } from "../helpers";

// The extension service worker's chrome API (not typed in the test project).
declare const chrome: any;

async function notion(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.notion.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  return res.json();
}

const created: string[] = [];

/** A fresh page holding `lines` as paragraphs, opened, cursor on line 1. */
async function openFreshPage(page: Page, lines: string[]) {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Hint key" } }] } },
    children: lines.map((l) => ({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ type: "text", text: { content: l } }] },
    })),
  });
  created.push(p.id);
  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-content-editable-leaf="true"]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await waitForVimStateReady(page, 10_000);
  // Title -> first paragraph.
  await pressKeys(page, "j");
  await page.waitForTimeout(200);
}

/** Text of the page's paragraphs (after the title). */
async function body(page: Page): Promise<string[]> {
  const texts = await getAllBlockTexts(page);
  const first = texts.findIndex((t) => t === "Hint key");
  return texts.slice(first + 1);
}

async function setSettings(context: BrowserContext, settings: Record<string, unknown>) {
  const [worker] = context.serviceWorkers();
  await worker.evaluate((s) => chrome.storage.sync.set(s), settings);
}

async function resetSettings(context: BrowserContext) {
  const [worker] = context.serviceWorkers();
  await worker.evaluate(() => chrome.storage.sync.remove(["linkHintKey", "linkHintsEnabled"]));
}

const hintCount = (page: Page) => page.locator(".vim-link-hint").count();
const settle = (page: Page, ms = 500) => page.waitForTimeout(ms);

test.describe("link hint key option", () => {
  test.afterEach(async ({ extensionContext }) => {
    await resetSettings(extensionContext);
  });

  test.afterAll(async () => {
    await Promise.all(
      created.map((id) => notion("PATCH", `/v1/pages/${id}`, { archived: true }).catch(() => {})),
    );
  });

  test("f shows hints when bound; gl still does; df still deletes", async ({
    extensionContext,
    extensionPage: page,
  }) => {
    await openFreshPage(page, ["a x b x c"]);
    await setSettings(extensionContext, { linkHintKey: "f" });
    await settle(page);

    await pressKeys(page, "f");
    await settle(page, 300);
    expect(await hintCount(page)).toBeGreaterThan(0);
    await pressKeys(page, "Escape");
    await settle(page, 300);
    expect(await hintCount(page)).toBe(0);

    await pressKeys(page, "g", "l");
    await settle(page, 300);
    expect(await hintCount(page)).toBeGreaterThan(0);
    await pressKeys(page, "Escape");
    await settle(page, 300);

    // Operator + f is still find-char.
    await pressKeys(page, "0", "d", "f", "x");
    await settle(page, 800);
    expect(await hintCount(page)).toBe(0);
    expect((await body(page))[0]).toBe(" b x c");
  });

  test("F shows hints when bound; f still finds forward", async ({
    extensionContext,
    extensionPage: page,
  }) => {
    await openFreshPage(page, ["a x b x c"]);
    await setSettings(extensionContext, { linkHintKey: "F" });
    await settle(page);

    await pressKeys(page, "F");
    await settle(page, 300);
    expect(await hintCount(page)).toBeGreaterThan(0);
    await pressKeys(page, "Escape");
    await settle(page, 300);

    await pressKeys(page, "0", "f", "x", "x");
    await settle(page, 800);
    expect(await hintCount(page)).toBe(0);
    expect((await body(page))[0]).toBe("a  b x c");
  });

  test("a count before the bound f does not leak into the next command", async ({
    extensionContext,
    extensionPage: page,
  }) => {
    await openFreshPage(page, ["abcdef"]);
    await setSettings(extensionContext, { linkHintKey: "f" });
    await settle(page);

    await pressKeys(page, "0", "3", "f");
    await settle(page, 300);
    expect(await hintCount(page)).toBeGreaterThan(0);
    await pressKeys(page, "Escape");
    await settle(page, 300);

    await pressKeys(page, "x");
    await settle(page, 800);
    expect((await body(page))[0]).toBe("bcdef");
  });

  test("with link hints disabled, a bound f falls back to find-char", async ({
    extensionContext,
    extensionPage: page,
  }) => {
    await openFreshPage(page, ["a x b x c"]);
    await setSettings(extensionContext, { linkHintKey: "f", linkHintsEnabled: false });
    await settle(page);

    await pressKeys(page, "0", "f", "x", "x");
    await settle(page, 800);
    expect(await hintCount(page)).toBe(0);
    expect((await body(page))[0]).toBe("a  b x c");
  });
});
