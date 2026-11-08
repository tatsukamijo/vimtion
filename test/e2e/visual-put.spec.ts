/**
 * Visual p / P replace the selection with the clipboard and leave the
 * clipboard as it was, so `viwp` can put the same text again (Vim's v_P).
 */
import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { pressKeys, getVimState, waitForVimStateReady, getAllBlockTexts, getCursorPosition } from "../helpers";

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

const text = (t: string) => [{ type: "text", text: { content: t } }];
const para = (t: string) => ({ object: "block", type: "paragraph", paragraph: { rich_text: text(t) } });
const code = (t: string) => ({ object: "block", type: "code", code: { rich_text: text(t), language: "plain text" } });

const created: string[] = [];

test.afterAll(async () => {
  await Promise.all(
    created.map((id) => notion("PATCH", `/v1/pages/${id}`, { archived: true }).catch(() => {})),
  );
});

/** A fresh page holding `children`, opened, cursor on the first block. */
async function openFreshPage(page: Page, children: unknown[]) {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: text("Visual put") } },
    children,
  });
  created.push(p.id);
  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-content-editable-leaf="true"]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await waitForVimStateReady(page, 10_000);
  // Title -> first block.
  await pressKeys(page, "j");
  await page.waitForTimeout(200);
}

const setClipboard = (page: Page, t: string) =>
  page.evaluate((s) => navigator.clipboard.writeText(s), t);
const readClipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Block texts below the page title. */
const body = async (page: Page) => (await getAllBlockTexts(page)).slice(1);

const settle = (page: Page, ms = 600) => page.waitForTimeout(ms);

test.describe("visual p / P", () => {
  test("viwp replaces a word with a URL and keeps the URL in the clipboard", async ({
    extensionPage: page,
  }) => {
    const url = "https://example.com/vimtion";
    await openFreshPage(page, [para("url: temp"), para("also: other"), para("end")]);
    await setClipboard(page, url);

    await pressKeys(page, "$", "v", "i", "w", "p");
    await settle(page);
    expect(await body(page)).toEqual([`url: ${url}`, "also: other", "end"]);
    expect((await getVimState(page)).mode).toBe("normal");
    expect(await readClipboard(page)).toBe(url);
    // On the last pasted character.
    expect((await getCursorPosition(page)).col).toBe(`url: ${url}`.length - 1);

    // The clipboard still holds the URL: put it again over the next line's word.
    await pressKeys(page, "Escape", "j", "$", "v", "i", "w", "p");
    await settle(page);
    expect(await body(page)).toEqual([`url: ${url}`, `also: ${url}`, "end"]);
    expect(await readClipboard(page)).toBe(url);
  });

  test("viwP in the middle of a line replaces only the word", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("one two three"), para("end")]);
    await setClipboard(page, "XYZ");

    await pressKeys(page, "w", "v", "i", "w", "P");
    await settle(page);
    expect(await body(page)).toEqual(["one XYZ three", "end"]);
    expect((await getCursorPosition(page)).col).toBe("one XY".length);
    expect(await readClipboard(page)).toBe("XYZ");
  });

  test("v with a motion: vep over part of a line", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("alpha beta gamma"), para("end")]);
    await setClipboard(page, "B");

    await pressKeys(page, "w", "v", "e", "p");
    await settle(page);
    expect(await body(page)).toEqual(["alpha B gamma", "end"]);
    expect(await readClipboard(page)).toBe("B");
  });

  test("u undoes the put in one step", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("keep this word"), para("end")]);
    await setClipboard(page, "NEW");

    await pressKeys(page, "w", "v", "i", "w", "p");
    await settle(page);
    expect(await body(page)).toEqual(["keep NEW word", "end"]);

    await pressKeys(page, "u");
    await settle(page);
    expect(await body(page)).toEqual(["keep this word", "end"]);
  });

  test("viwp inside a code block replaces the word, not the block", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [para("before"), code("let a = 1"), para("after")]);
    await setClipboard(page, "b");

    await pressKeys(page, "j", "w", "v", "i", "w", "p");
    await settle(page);
    expect(await body(page)).toEqual(["before", "let b = 1", "after"]);
    expect(await readClipboard(page)).toBe("b");
  });
});
