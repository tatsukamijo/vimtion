/**
 * Counts, `.` repeat, S / Y, sticky `$`, Ctrl-d / Ctrl-u, and the operator +
 * word-motion forms (cw = ce, de, db, ...).
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
    properties: { title: { title: [{ type: "text", text: { content: "Counts" } }] } },
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
  const first = texts.findIndex((t) => t === "Counts");
  return texts.slice(first + 1);
}

const settle = (page: Page, ms = 800) => page.waitForTimeout(ms);

test.describe("Counts, dot repeat, S/Y, sticky $, Ctrl-d/u", () => {
  test.afterAll(async () => {
    await Promise.all(
      created.map((id) => notion("PATCH", `/v1/pages/${id}`, { archived: true }).catch(() => {})),
    );
  });

  test("3w moves three words", async ({ extensionPage: page }) => {
    await openFreshPage(page);
    await pressKeys(page, "3", "w", "x");
    await settle(page);
    expect((await body(page))[0]).toBe("one two three our five six");
  });

  test("3x deletes three characters and stops at the line end", async ({ extensionPage: page }) => {
    await openFreshPage(page);
    await pressKeys(page, "3", "x");
    await settle(page);
    expect((await body(page))[0]).toBe(" two three four five six");
    await pressKeys(page, "$", "3", "x");
    await settle(page);
    expect((await body(page))[0]).toBe(" two three four five si");
  });

  test("d2w and 2dw delete two words", async ({ extensionPage: page }) => {
    await openFreshPage(page);
    await pressKeys(page, "d", "2", "w");
    await settle(page);
    expect((await body(page))[0]).toBe("three four five six");
    await pressKeys(page, "2", "d", "w");
    await settle(page);
    expect((await body(page))[0]).toBe("five six");
  });

  test("2dd deletes two lines; d2j deletes three", async ({ extensionPage: page }) => {
    await openFreshPage(page);
    await pressKeys(page, "j", "2", "d", "d");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["one two three four five six", "line c", "line d"]);
    await pressKeys(page, "k", "d", "2", "j");
    await settle(page, 1500);
    expect((await body(page)).filter((t) => t !== "")).toEqual([]);
  });

  test("NG goes to line N (status-bar numbering)", async ({ extensionPage: page }) => {
    await openFreshPage(page);
    const line = (await getVimState(page)).activeLine;
    await pressKeys(page, String(line + 2), "G");
    await settle(page);
    expect((await getVimState(page)).activeLine).toBe(line + 2);
    expect(await getActualCursorBlockText(page)).toBe("line b");
  });

  test("cw changes to the word end (Vim's cw = ce); c2w spans two words", async ({ extensionPage: page }) => {
    await openFreshPage(page);
    await pressKeys(page, "w", "c", "w");
    await page.keyboard.type("X");
    await pressKeys(page, "Escape");
    await settle(page);
    expect((await body(page))[0]).toBe("one X three four five six");
    await pressKeys(page, "w", "c", "2", "w");
    await page.keyboard.type("Y");
    await pressKeys(page, "Escape");
    await settle(page);
    expect((await body(page))[0]).toBe("one X Y five six");
  });

  test("de and db", async ({ extensionPage: page }) => {
    await openFreshPage(page);
    await pressKeys(page, "w", "d", "e");
    await settle(page);
    expect((await body(page))[0]).toBe("one  three four five six");
    await pressKeys(page, "w", "w", "d", "b");
    await settle(page);
    expect((await body(page))[0]).toBe("one  four five six");
  });

  test("S replaces the line; Y + p duplicates it", async ({ extensionPage: page }) => {
    await openFreshPage(page);
    await pressKeys(page, "j", "S");
    await page.keyboard.type("new");
    await pressKeys(page, "Escape");
    await settle(page);
    expect((await body(page))[1]).toBe("new");
    await pressKeys(page, "Y", "p");
    await settle(page, 1500);
    expect((await body(page)).slice(1, 3)).toEqual(["new", "new"]);
  });

  test("$ is sticky for j / k", async ({ extensionPage: page }) => {
    await openFreshPage(page, ["short", "a much longer line", "mid", "x"]);
    await pressKeys(page, "$", "j", "x");
    await settle(page);
    expect((await body(page))[1]).toBe("a much longer lin");
    await pressKeys(page, "j", "x");
    await settle(page);
    expect((await body(page))[2]).toBe("mi");
  });

  test(". repeats x, dw, A-insert and dd", async ({ extensionPage: page }) => {
    await openFreshPage(page);
    await pressKeys(page, "x", ".", ".");
    await settle(page);
    expect((await body(page))[0]).toBe(" two three four five six");
    await pressKeys(page, "w", "d", "w", ".");
    await settle(page);
    expect((await body(page))[0]).toBe(" four five six");
    await pressKeys(page, "j", "A");
    await page.keyboard.type("!");
    await pressKeys(page, "Escape", "j", ".");
    await settle(page);
    expect((await body(page)).slice(1, 3)).toEqual(["line a!", "line b!"]);
    await pressKeys(page, "d", "d", ".");
    await settle(page, 2000);
    expect(await body(page)).toEqual([" four five six", "line a!", "line d"]);
  });

  test("Ctrl-d / Ctrl-u move the cursor with the half-page scroll", async ({ extensionPage: page }) => {
    const many = Array.from({ length: 40 }, (_, i) => `row ${i + 1}`);
    await openFreshPage(page, many);
    const start = (await getVimState(page)).activeLine;
    await pressKeys(page, "Control+d");
    await settle(page);
    const down = (await getVimState(page)).activeLine;
    expect(down).toBeGreaterThan(start + 3);
    await pressKeys(page, "Control+u");
    await settle(page);
    const back = (await getVimState(page)).activeLine;
    expect(Math.abs(back - start)).toBeLessThanOrEqual(1);
  });
});
