/**
 * Enter in normal mode opens and closes a toggle (and a toggle heading), like
 * clicking its triangle, and the cursor stays where it was on the toggle's
 * line.
 */
import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { pressKeys, waitForVimStateReady, getActualCursorBlockText, getCursorPosition, getMode } from "../helpers";

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

const text = (content: string) => ({ rich_text: [{ type: "text", text: { content } }] });
const paragraph = (s: string) => ({ object: "block", type: "paragraph", paragraph: text(s) });

/**
 * A fresh page: "first line", a toggle "my toggle" (holding "inside" and a
 * nested toggle "nested toggle" holding "deep"), a toggle heading "Toggle
 * heading" (holding "under heading"), "last line". All toggles closed; cursor
 * on "first line".
 */
async function openTogglePage(page: Page) {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Toggles" } }] } },
    children: [
      paragraph("first line"),
      {
        object: "block",
        type: "toggle",
        toggle: {
          ...text("my toggle"),
          children: [
            paragraph("inside"),
            { object: "block", type: "toggle", toggle: { ...text("nested toggle"), children: [paragraph("deep")] } },
          ],
        },
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: { ...text("Toggle heading"), is_toggleable: true, children: [paragraph("under heading")] },
      },
      paragraph("last line"),
    ],
  });
  created.push(p.id);
  await page.goto(p.url, { waitUntil: "domcontentloaded" });
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
}

/** The page's visible lines. */
const body = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".notion-page-content [data-content-editable-leaf]"))
      .filter((e) => e.getBoundingClientRect().height > 0)
      .map((e) => e.textContent ?? ""),
  );

const CLOSED = ["first line", "my toggle", "Toggle heading", "last line"];

test.describe("Enter on a toggle", () => {
  test("opens and closes a toggle, keeping the cursor's column", async ({ extensionPage: page }) => {
    await openTogglePage(page);
    expect(await body(page)).toEqual(CLOSED);
    await pressKeys(page, "j", "l", "l");
    await pressKeys(page, "Enter");
    await page.waitForTimeout(600);
    expect(await body(page)).toEqual(["first line", "my toggle", "inside", "nested toggle", "Toggle heading", "last line"]);
    expect(await getMode(page)).toBe("normal");
    expect(await getActualCursorBlockText(page)).toBe("my toggle");
    expect((await getCursorPosition(page)).col).toBe(2);
    // j now goes into the toggle.
    await pressKeys(page, "j");
    await page.waitForTimeout(200);
    expect(await getActualCursorBlockText(page)).toBe("inside");
    await pressKeys(page, "k", "Enter");
    await page.waitForTimeout(600);
    expect(await body(page)).toEqual(CLOSED);
    expect(await getActualCursorBlockText(page)).toBe("my toggle");
    await pressKeys(page, "j");
    await page.waitForTimeout(200);
    expect(await getActualCursorBlockText(page)).toBe("Toggle heading");
  });

  test("opens a nested toggle and a toggle heading", async ({ extensionPage: page }) => {
    await openTogglePage(page);
    await pressKeys(page, "j", "Enter");
    await page.waitForTimeout(600);
    await pressKeys(page, "j", "j", "Enter");
    await page.waitForTimeout(600);
    expect(await getActualCursorBlockText(page)).toBe("nested toggle");
    expect(await body(page)).toEqual([
      "first line",
      "my toggle",
      "inside",
      "nested toggle",
      "deep",
      "Toggle heading",
      "last line",
    ]);
    await pressKeys(page, "j", "j", "Enter");
    await page.waitForTimeout(600);
    expect(await getActualCursorBlockText(page)).toBe("Toggle heading");
    expect(await body(page)).toEqual([
      "first line",
      "my toggle",
      "inside",
      "nested toggle",
      "deep",
      "Toggle heading",
      "under heading",
      "last line",
    ]);
    expect(await getMode(page)).toBe("normal");
  });
});
