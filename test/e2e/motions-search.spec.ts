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
});
