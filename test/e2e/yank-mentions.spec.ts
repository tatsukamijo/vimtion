/**
 * Line-wise yank / delete and put keep Notion's rich content: page mentions
 * (and link previews, people, dates), inline formatting and links. Plain-text
 * yank used to paste a mention back as a bare link / URL.
 */
import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { pressKeys, waitForVimStateReady, getActualCursorBlockText } from "../helpers";

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

test.afterAll(async () => {
  for (const id of created) {
    await notion("PATCH", `/v1/pages/${id}`, { archived: true }).catch(() => {});
  }
});

/**
 * A fresh page: a bullet with a page mention, a bullet with bold text, then
 * "last line". Opened, cursor on the mention bullet.
 */
async function openRichPage(page: Page) {
  const target = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Mentioned page" } }] } },
  });
  created.push(target.id);
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Rich lines" } }] } },
    children: [
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            { type: "mention", mention: { page: { id: target.id } } },
            { type: "text", text: { content: " (RSS'18)" } },
          ],
        },
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            { type: "text", text: { content: "bold part" }, annotations: { bold: true } },
            { type: "text", text: { content: " and plain" } },
          ],
        },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: "last line" } }] },
      },
    ],
  });
  created.push(p.id);
  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.locator(".notion-page-mention-token").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  // Vimtion's first-run notices would intercept the click below.
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);
  await page.getByText("bold part").click();
  await pressKeys(page, "Escape", "k", "0");
  await page.waitForTimeout(300);
  expect(await getActualCursorBlockText(page)).toBe("Mentioned page (RSS'18)");
}

/** Each line's text, marked [M] when it holds a mention and [B] for bold. */
const lines = (page: Page) =>
  page.evaluate(() => {
    const title = Array.from(document.querySelectorAll("[data-content-editable-leaf]")).findIndex(
      (e) => e.textContent === "Rich lines",
    );
    return Array.from(document.querySelectorAll("[data-content-editable-leaf]"))
      .slice(title + 1)
      .map((e) => {
        const bold = Array.from(e.querySelectorAll<HTMLElement>("span")).some(
          (s) => Number(getComputedStyle(s).fontWeight) >= 600,
        );
        return (
          (e.textContent ?? "") +
          (e.querySelector(".notion-page-mention-token") ? " [M]" : "") +
          (bold ? " [B]" : "")
        );
      });
  });

const MENTION = "Mentioned page (RSS'18) [M]";
const BOLD = "bold part and plain [B]";

test.describe("yank / put keep mentions and formatting", () => {
  test("Vjy then p", async ({ extensionPage: page }) => {
    await openRichPage(page);
    await pressKeys(page, "V", "j", "y");
    await page.waitForTimeout(800);
    await pressKeys(page, "G", "p");
    await page.waitForTimeout(1200);
    expect(await lines(page)).toEqual([MENTION, BOLD, "last line", MENTION, BOLD]);
  });

  test("yy then P", async ({ extensionPage: page }) => {
    await openRichPage(page);
    await pressKeys(page, "y", "y");
    await page.waitForTimeout(800);
    await pressKeys(page, "G", "P");
    await page.waitForTimeout(1200);
    expect(await lines(page)).toEqual([MENTION, BOLD, MENTION, "last line"]);
    expect(await getActualCursorBlockText(page)).toBe("Mentioned page (RSS'18)");
  });

  test("2dd then p", async ({ extensionPage: page }) => {
    await openRichPage(page);
    await pressKeys(page, "2", "d", "d");
    await page.waitForTimeout(1500);
    expect(await lines(page)).toEqual(["last line"]);
    await pressKeys(page, "p");
    await page.waitForTimeout(1200);
    expect(await lines(page)).toEqual(["last line", MENTION, BOLD]);
  });

  test("V over a nested list then p: each item once, children still nested", async ({
    extensionPage: page,
  }) => {
    await openNestedPage(page);
    // Group A, a1, a2, Group B, b1.
    await pressKeys(page, "V", "j", "j", "j", "j", "y");
    await page.waitForTimeout(1200);
    await pressKeys(page, "G", "p");
    await page.waitForTimeout(1500);
    const list = ["Group A", "  a1 [M]", "  a2 [M]", "Group B", "  b1 [M]"];
    expect(await nested(page)).toEqual([...list, "end", ...list]);
  });

  test("P on a nested line pastes at that line's level", async ({ extensionPage: page }) => {
    await openNestedPage(page);
    // yy on a1, then P on b1 (whose line above is its parent).
    await pressKeys(page, "j", "y", "y");
    await page.waitForTimeout(800);
    await pressKeys(page, "j", "j", "j", "P");
    await page.waitForTimeout(2000);
    expect(await nested(page)).toEqual([
      "Group A",
      "  a1 [M]",
      "  a2 [M]",
      "Group B",
      "  a1 [M]",
      "  b1 [M]",
      "end",
    ]);
    expect(await getActualCursorBlockText(page)).toBe("Mentioned page a1");
  });
});

/**
 * A fresh page: "Group A" (a1, a2 nested, each with a mention), "Group B"
 * (b1), "end". Opened, cursor on "Group A".
 */
async function openNestedPage(page: Page) {
  const target = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Mentioned page" } }] } },
  });
  created.push(target.id);
  const child = (s: string) => ({
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [
        { type: "mention", mention: { page: { id: target.id } } },
        { type: "text", text: { content: ` ${s}` } },
      ],
    },
  });
  const parent = (s: string, children: unknown[]) => ({
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: [{ type: "text", text: { content: s } }], children },
  });
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Nested lines" } }] } },
    children: [
      parent("Group A", [child("a1"), child("a2")]),
      parent("Group B", [child("b1")]),
      { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "end" } }] } },
    ],
  });
  created.push(p.id);
  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.getByText("end", { exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);
  await page.getByText("Group A", { exact: true }).click();
  await pressKeys(page, "Escape", "0");
  await page.waitForTimeout(300);
  expect(await getActualCursorBlockText(page)).toBe("Group A");
}

/** Body lines, indented by nesting, [M] for a mention ("Mentioned page " dropped). */
const nested = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".notion-page-content [data-content-editable-leaf]")).map((e) => {
      let depth = 0;
      let b = e.closest("[data-block-id]");
      while (b && (b = b.parentElement?.closest(".notion-bulleted_list-block") ?? null)) depth++;
      const text = (e.textContent ?? "").replace("Mentioned page ", "");
      return "  ".repeat(depth) + text + (e.querySelector(".notion-page-mention-token") ? " [M]" : "");
    }),
  );
