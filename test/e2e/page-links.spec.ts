/**
 * j / k stop on the page's page blocks (sub-pages and links to pages) like on
 * database rows: the block is highlighted while the caret stays on the line
 * above it, editing keys do nothing, Enter opens the page (Shift+Enter in a
 * new tab) and Esc leaves.
 */
import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { pressKeys, waitForVimStateReady, getActualCursorBlockText, getVimState } from "../helpers";

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

const paragraph = (content: string) => ({
  object: "block",
  type: "paragraph",
  paragraph: { rich_text: [{ type: "text", text: { content } }] },
});
const title = (content: string) => ({ title: { title: [{ type: "text", text: { content } }] } });

/**
 * A fresh page: "first line", "before pages", sub-pages "Child one" and
 * "Child two", "between", a link to "Child one", "last line". Cursor on
 * "first line". Returns the sub-pages' ids (32 hex).
 */
async function openPage(page: Page): Promise<{ one: string; two: string }> {
  const parent = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: title("Page links"),
    children: [paragraph("first line"), paragraph("before pages")],
  });
  created.push(parent.id);
  const one = await notion("POST", "/v1/pages", {
    parent: { page_id: parent.id },
    properties: title("Child one"),
    children: [paragraph("inside child")],
  });
  const two = await notion("POST", "/v1/pages", { parent: { page_id: parent.id }, properties: title("Child two") });
  await notion("PATCH", `/v1/blocks/${parent.id}/children`, {
    children: [
      paragraph("between"),
      { object: "block", type: "link_to_page", link_to_page: { type: "page_id", page_id: one.id } },
      paragraph("last line"),
    ],
  });
  await page.goto(parent.url, { waitUntil: "domcontentloaded" });
  await page.getByText("last line", { exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);
  await page.getByText("first line", { exact: true }).click();
  await pressKeys(page, "Escape", "0");
  await page.waitForTimeout(300);
  expect(await getActualCursorBlockText(page)).toBe("first line");
  return { one: one.id.replace(/-/g, ""), two: two.id.replace(/-/g, "") };
}

/** The highlighted page block: its kind and text ("" when none). */
const highlighted = (page: Page) =>
  page.evaluate(() => {
    const boxes = document.querySelectorAll<HTMLElement>(".vim-page-link-cursor");
    const box = boxes[0];
    let block: Element | undefined;
    if (box) {
      const r = box.getBoundingClientRect();
      block = document
        .elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        .find((e) => e.matches(".notion-page-block, .notion-alias-block"));
    }
    return {
      count: boxes.length,
      mode: document.body.classList.contains("vim-page-link-mode"),
      kind: block?.classList.contains("notion-alias-block") ? "link" : block ? "page" : "",
      text: (block?.textContent ?? "").trim(),
    };
  });

const body = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".notion-page-content [data-block-id]"))
      .filter((e) => !e.parentElement?.closest(".notion-page-content [data-block-id]"))
      .map((e) => (e.textContent ?? "").trim()),
  );

const PAGE = ["first line", "before pages", "Child one", "Child two", "between", "Child one", "last line"];

/** Press `key`; then expect the highlighted block (or none) and the caret's line. */
async function step(page: Page, key: string, block: string, line: string) {
  await pressKeys(page, key);
  await page.waitForTimeout(250);
  const h = await highlighted(page);
  if (block) {
    expect(h.count).toBe(1);
    expect(h.mode).toBe(true);
    expect(`${h.kind}:${h.text}`).toBe(block);
    expect((await getVimState(page)).statusText).toMatch(/Page \d+\/3/);
  } else {
    expect(h.count).toBe(0);
    expect(h.mode).toBe(false);
    expect((await getVimState(page)).statusText).not.toMatch(/Page \d/);
  }
  expect(await getActualCursorBlockText(page)).toBe(line);
}

test.describe("page blocks", () => {
  test("j / k stop on sub-pages and links to pages", async ({ extensionPage: page }) => {
    await openPage(page);
    expect(await body(page)).toEqual(PAGE);
    await step(page, "j", "", "before pages");
    await step(page, "j", "page:Child one", "before pages");
    await step(page, "j", "page:Child two", "before pages");
    await step(page, "j", "", "between");
    await step(page, "j", "link:Child one", "between");
    await step(page, "j", "", "last line");
    await step(page, "k", "link:Child one", "between");
    await step(page, "k", "", "between");
    await step(page, "k", "page:Child two", "before pages");
    await step(page, "k", "page:Child one", "before pages");
    await step(page, "k", "", "before pages");
    await step(page, "k", "", "first line");
  });

  test("editing keys do nothing on a page block; Esc leaves it", async ({ extensionPage: page }) => {
    await openPage(page);
    await step(page, "j", "", "before pages");
    await step(page, "j", "page:Child one", "before pages");
    await pressKeys(page, "x", "d", "d", "i", "a", "o", "p", "u");
    await page.waitForTimeout(600);
    expect(await body(page)).toEqual(PAGE);
    expect((await getVimState(page)).mode).toBe("normal");
    expect((await highlighted(page)).text).toBe("Child one");
    await step(page, "Escape", "", "before pages");
    // Back to plain lines: j goes on from "before pages".
    await step(page, "j", "page:Child one", "before pages");
    // A motion elsewhere leaves the block and runs.
    await step(page, "G", "", "last line");
  });

  test("Enter opens the page; Back comes to the line above it", async ({ extensionPage: page }) => {
    const { two } = await openPage(page);
    const from = page.url();
    await pressKeys(page, "j", "j", "j");
    await page.waitForTimeout(250);
    expect((await highlighted(page)).text).toBe("Child two");
    await pressKeys(page, "Enter");
    await page.waitForURL((u) => u.pathname.includes(two), { timeout: 10_000 });
    await page.waitForTimeout(1500);
    expect((await highlighted(page)).count).toBe(0);
    expect((await getVimState(page)).mode).toBe("normal");
    await page.goBack();
    await page.waitForURL(from, { timeout: 10_000 });
    await page.getByText("last line", { exact: true }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    expect(await getActualCursorBlockText(page)).toBe("before pages");
  });

  test("Shift+Enter opens the page in a new tab", async ({ extensionPage: page, extensionContext: context }) => {
    const { one } = await openPage(page);
    const from = page.url();
    await pressKeys(page, "j", "j", "j", "j", "j");
    await page.waitForTimeout(250);
    expect(await highlighted(page)).toMatchObject({ kind: "link", text: "Child one" });
    const opened = context.waitForEvent("page", { timeout: 10_000 });
    await pressKeys(page, "Shift+Enter");
    const tab = await opened;
    await tab.waitForURL((u) => u.pathname.includes(one), { timeout: 10_000 });
    expect(page.url()).toBe(from);
    await tab.close();
    await page.bringToFront();
    await page.waitForTimeout(500);
    expect((await highlighted(page)).count).toBe(0);
    expect(await getActualCursorBlockText(page)).toBe("between");
  });
});
