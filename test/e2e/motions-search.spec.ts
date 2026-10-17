/**
 * ; , ~ J >> << % and / ? n N * search.
 *
 * Every test runs on its own freshly created page, so edits never leak into
 * other tests (the shared test page made several specs order-dependent).
 */
import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import {
  pressKeys,
  getVimState,
  waitForVimStateReady,
  getActualCursorBlockText,
  getAllBlockTexts,
} from "../helpers";

const LINES = ["one two three four five six", "line a", "line b", "line c", "line d"];

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
async function openFreshPage(page: Page, lines: string[] = LINES) {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Motions" } }] } },
    children: lines.map((l) => ({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: l ? [{ type: "text", text: { content: l } }] : [] },
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
  const first = texts.findIndex((t) => t === "Motions");
  return texts.slice(first + 1);
}

const settle = (page: Page, ms = 800) => page.waitForTimeout(ms);

/** The text of each range in a search highlight (CSS Custom Highlight API). */
const highlighted = (page: Page, name: string): Promise<string[]> =>
  page.evaluate((n) => {
    const h = (CSS as any).highlights?.get(n);
    return h ? [...h].map((r: Range) => r.toString()) : [];
  }, name);

test.describe("; , ~ J >> << % and search", () => {
  test.afterAll(async () => {
    await Promise.all(
      created.map((id) => notion("PATCH", `/v1/pages/${id}`, { archived: true }).catch(() => {})),
    );
  });

  test("; and , repeat f in both directions", async ({ extensionPage: page }) => {
    await openFreshPage(page, ["a x b x c x d"]);
    await pressKeys(page, "f", "x", ";", ";", "x");
    await settle(page);
    expect((await body(page))[0]).toBe("a x b x c  d");
    await pressKeys(page, "0", "f", "x", ";", ",", "x");
    await settle(page);
    expect((await body(page))[0]).toBe("a  b x c  d");
  });

  test("~ toggles case and moves right; 3~", async ({ extensionPage: page }) => {
    await openFreshPage(page, ["Hello World"]);
    await pressKeys(page, "~", "3", "~");
    await settle(page);
    expect((await body(page))[0]).toBe("hELLo World");
  });

  test("J joins the next line with one space", async ({ extensionPage: page }) => {
    await openFreshPage(page, ["first part", "   second part", "third"]);
    await pressKeys(page, "J");
    await settle(page, 2000);
    expect(await body(page)).toEqual(["first part second part", "third"]);
  });

  test(">> indents and << outdents a block", async ({ extensionPage: page }) => {
    await openFreshPage(page, ["parent", "child"]);
    const depth = () =>
      page.evaluate(() => {
        const leaf = [...document.querySelectorAll('[data-content-editable-leaf="true"]')].find(
          (e) => e.textContent === "child",
        );
        let d = 0;
        let el = leaf?.closest("[data-block-id]");
        while ((el = el?.parentElement?.closest("[data-block-id]") ?? null)) d++;
        return d;
      });
    const before = await depth();
    await pressKeys(page, "j", ">", ">");
    await settle(page, 1200);
    expect(await depth()).toBe(before + 1);
    await pressKeys(page, "<", "<");
    await settle(page, 1200);
    expect(await depth()).toBe(before);
  });

  test("% jumps between matching brackets", async ({ extensionPage: page }) => {
    await openFreshPage(page, ["call(a, (b), c) end"]);
    await pressKeys(page, "%", "x");
    await settle(page);
    expect((await body(page))[0]).toBe("call(a, (b), c end");
  });

  test("/ search, n / N, ? backward, smartcase", async ({ extensionPage: page }) => {
    await openFreshPage(page, ["alpha beta", "second beta", "third Beta"]);
    await pressKeys(page, "/");
    await page.keyboard.type("beta");
    await pressKeys(page, "Enter");
    await settle(page);
    expect(await getActualCursorBlockText(page)).toBe("alpha beta");
    await pressKeys(page, "n", "n");
    await settle(page);
    expect(await getActualCursorBlockText(page)).toBe("third Beta");
    await pressKeys(page, "N", "x");
    await settle(page);
    expect((await body(page))[1]).toBe("second eta");
    await pressKeys(page, "?");
    await page.keyboard.type("alpha");
    await pressKeys(page, "Enter", "x");
    await settle(page);
    expect((await body(page))[0]).toBe("lpha beta");
  });

  test("search highlights every match and counts the one under the cursor", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, ["Foo one foo", "two", "three foo"]);
    await pressKeys(page, "/");
    await page.keyboard.type("foo");
    await settle(page, 300);
    // incsearch: all matches are painted while typing, the next one marked.
    expect(await highlighted(page, "vimtion-search")).toEqual(["Foo", "foo", "foo"]);
    expect(await highlighted(page, "vimtion-search-current")).toEqual(["foo"]);
    expect(await page.locator(".vim-search-count").textContent()).toBe("[2/3]");
    await pressKeys(page, "Enter");
    await settle(page);
    expect((await getVimState(page)).statusText).toContain("/foo [2/3]");
    await pressKeys(page, "n");
    await settle(page);
    expect((await getVimState(page)).statusText).toContain("/foo [3/3]");
    await pressKeys(page, "n");
    await settle(page);
    expect((await getVimState(page)).statusText).toContain("/foo [1/3]");
    expect(await highlighted(page, "vimtion-search-current")).toEqual(["Foo"]);
    // Off a match the count stays, without a current match.
    await pressKeys(page, "j");
    await settle(page);
    expect((await getVimState(page)).statusText).toContain("/foo [-/3]");
    expect(await highlighted(page, "vimtion-search-current")).toEqual([]);
    // An edit updates the matches.
    await pressKeys(page, "k", "0", "x");
    await settle(page);
    expect(await highlighted(page, "vimtion-search")).toEqual(["foo", "foo"]);
    // Esc in normal mode turns the highlighting off (:nohlsearch).
    await pressKeys(page, "Escape");
    await settle(page, 300);
    expect(await highlighted(page, "vimtion-search")).toEqual([]);
    expect((await getVimState(page)).statusText).not.toContain("/foo");
  });

  test("cancelling the search bar keeps the previous search highlighted", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, ["foo bar", "bar foo"]);
    await pressKeys(page, "/");
    await page.keyboard.type("foo");
    await pressKeys(page, "Enter");
    await settle(page);
    await pressKeys(page, "/");
    await page.keyboard.type("zzz");
    await settle(page, 300);
    expect(await page.locator(".vim-search-count").textContent()).toBe("[0/0]");
    expect(await highlighted(page, "vimtion-search")).toEqual([]);
    await pressKeys(page, "Escape");
    await settle(page);
    expect(await highlighted(page, "vimtion-search")).toEqual(["foo", "foo"]);
    expect((await getVimState(page)).statusText).toContain("/foo [2/2]");
  });

  test("search counts overlapping matches and keeps offsets after İ", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, ["İstanbul foo", "baaaa"]);
    // "İ" lower-cases to two code units; the match must still be "foo".
    await pressKeys(page, "/");
    await page.keyboard.type("foo");
    await pressKeys(page, "Enter");
    await settle(page);
    expect(await highlighted(page, "vimtion-search")).toEqual(["foo"]);
    await pressKeys(page, "x");
    await settle(page);
    expect((await body(page))[0]).toBe("İstanbul oo");
    // n stops at every overlapping "aa", and the count agrees.
    await pressKeys(page, "/");
    await page.keyboard.type("aa");
    await pressKeys(page, "Enter");
    await settle(page);
    expect(await highlighted(page, "vimtion-search")).toEqual(["aa", "aa", "aa"]);
    expect((await getVimState(page)).statusText).toContain("/aa [1/3]");
    await pressKeys(page, "n");
    await settle(page);
    expect((await getVimState(page)).statusText).toContain("/aa [2/3]");
    await pressKeys(page, "n");
    await settle(page);
    expect((await getVimState(page)).statusText).toContain("/aa [3/3]");
  });
});
