/**
 * gl puts hints on database rows (which have no <a>), and a hint opens the
 * row the way its "Open" button does: here in a side peek, Notion's default.
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

const paragraph = (t: string) => ({
  object: "block",
  type: "paragraph",
  paragraph: { rich_text: [{ type: "text", text: { content: t } }] },
});

let pageId = "";

test.afterAll(async () => {
  if (pageId) await notion("PATCH", `/v1/pages/${pageId}`, { archived: true }).catch(() => {});
});

/** The hint label shown on the database row titled `title`. */
async function hintForRow(page: Page, title: string): Promise<string> {
  return page.evaluate((t) => {
    const row = Array.from(document.querySelectorAll(".notion-collection-item")).find(
      (e) => e.textContent === t,
    );
    if (!row) return "";
    const box = row.getBoundingClientRect();
    const hint = Array.from(document.querySelectorAll<HTMLElement>(".vim-link-hint")).find((h) => {
      const r = h.getBoundingClientRect();
      return r.left >= box.left - 2 && r.top >= box.top - 2 && r.top < box.bottom;
    });
    return hint?.textContent ?? "";
  }, title);
}

test("gl hints database rows and opens one in a side peek", async ({ extensionPage: page }) => {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "DB hints" } }] } },
    children: [paragraph("main page line")],
  });
  pageId = p.id;
  const db = await notion("POST", "/v1/databases", {
    parent: { type: "page_id", page_id: p.id },
    is_inline: true,
    title: [{ type: "text", text: { content: "Daily Logs" } }],
    properties: { Name: { title: {} } },
  });
  for (const day of ["Monday", "Friday"]) {
    await notion("POST", "/v1/pages", {
      parent: { database_id: db.id },
      properties: { Name: { title: [{ type: "text", text: { content: day } }] } },
      children: [paragraph(`${day} first`), paragraph(`${day} second`)],
    });
  }

  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.locator(".notion-collection-item", { hasText: "Friday" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);

  await pressKeys(page, "g", "l");
  await page.waitForTimeout(300);
  const monday = await hintForRow(page, "Monday");
  const friday = await hintForRow(page, "Friday");
  expect(monday).not.toBe("");
  expect(friday).not.toBe("");
  expect(friday).not.toBe(monday);

  await page.keyboard.type(friday);
  const peek = page.locator(".notion-peek-renderer");
  await peek.getByText("Friday second").waitFor({ timeout: 15_000 });
  expect(page.url()).toContain("pm=s");
  // The row's title was not turned into an editor, and nothing was typed.
  expect(await page.locator('.notion-table-view-cell [contenteditable="true"]').count()).toBe(0);
  expect(await page.locator(".notion-table-view-cell span").allTextContents()).toEqual(
    expect.arrayContaining(["Monday", "Friday"]),
  );

  // Vim keys act inside the peek.
  await page.waitForTimeout(800);
  await pressKeys(page, "G");
  await page.waitForTimeout(400);
  expect(await getActualCursorBlockText(page)).toBe("Friday second");
});
