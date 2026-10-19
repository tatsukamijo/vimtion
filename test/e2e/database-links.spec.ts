/**
 * gl puts hints on database rows (which have no <a>), and a hint opens the
 * row the way its "Open" button does: here in a side peek, Notion's default.
 */
import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import {
  pressKeys,
  waitForVimStateReady,
  getActualCursorBlockText,
  getVimState,
} from "../helpers";

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
const created: string[] = [];

test.afterAll(async () => {
  for (const id of [pageId, ...created]) {
    if (id) await notion("PATCH", `/v1/pages/${id}`, { archived: true }).catch(() => {});
  }
});

/**
 * A fresh page: "before", a "Daily Logs" database with `days` (each page has
 * "<day> first" / "<day> second"), "after". Opened, cursor on "before".
 * Returns the row titles in the order the table shows them.
 */
async function openDatabasePage(page: Page, days: string[]): Promise<string[]> {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "DB rows" } }] } },
    children: [paragraph("before")],
  });
  created.push(p.id);
  const db = await notion("POST", "/v1/databases", {
    parent: { type: "page_id", page_id: p.id },
    is_inline: true,
    title: [{ type: "text", text: { content: "Daily Logs" } }],
    properties: { Name: { title: {} } },
  });
  for (const day of days) {
    await notion("POST", "/v1/pages", {
      parent: { database_id: db.id },
      properties: { Name: { title: [{ type: "text", text: { content: day } }] } },
      children: [paragraph(`${day} first`), paragraph(`${day} second`)],
    });
  }
  await notion("PATCH", `/v1/blocks/${p.id}/children`, { children: [paragraph("after")] });

  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.locator(".notion-collection-item", { hasText: days[0] }).waitFor({ timeout: 30_000 });
  await page.getByText("after", { exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);
  await page.getByText("before", { exact: true }).click();
  await pressKeys(page, "Escape");
  await page.waitForTimeout(300);
  return (await page.locator(".notion-collection-item .notion-table-view-cell span").allTextContents()).filter(
    (t) => t !== "",
  );
}

const status = async (page: Page) => (await getVimState(page)).statusText;
const rowUnderCursor = (page: Page) =>
  page.evaluate(() => document.querySelector(".vim-row-cursor")?.textContent ?? "");

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

test("j / k walk database rows; Enter opens one; Ctrl+j / Ctrl+k step; gq comes back to it", async ({
  extensionPage: page,
}) => {
  const order = await openDatabasePage(page, ["Monday", "Tuesday", "Wednesday"]);
  expect(order).toHaveLength(3);

  // before -> database title -> first row -> second row.
  await pressKeys(page, "j", "j");
  await page.waitForTimeout(400);
  expect(await status(page)).toContain("Row 1/3");
  expect(await rowUnderCursor(page)).toContain(order[0]);
  await pressKeys(page, "j");
  await page.waitForTimeout(300);
  expect(await status(page)).toContain("Row 2/3");

  // Enter opens the row in the side peek, with Vim keys inside it.
  await pressKeys(page, "Enter");
  const peek = page.locator(".notion-peek-renderer");
  await peek.getByText(`${order[1]} second`).waitFor({ timeout: 15_000 });
  expect(page.url()).toContain("pm=s");

  // Ctrl+j / Ctrl+k: the next / previous row's page in the same peek.
  await page.waitForTimeout(800);
  await pressKeys(page, "Control+j");
  await peek.getByText(`${order[2]} second`).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await pressKeys(page, "Control+k");
  await peek.getByText(`${order[1]} second`).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);

  // gq closes the peek; the cursor is on that page's row.
  await pressKeys(page, "g", "q");
  await page.waitForTimeout(1000);
  expect(page.url()).not.toContain("pm=s");
  expect(await status(page)).toContain("Row 2/3");
  expect(await rowUnderCursor(page)).toContain(order[1]);

  // Past the last row, j continues below the database; k comes back up.
  await pressKeys(page, "j", "j");
  await page.waitForTimeout(500);
  expect(await getActualCursorBlockText(page)).toBe("after");
  expect(await status(page)).not.toContain("Row");
  await pressKeys(page, "k");
  await page.waitForTimeout(500);
  expect(await status(page)).toContain("Row 3/3");
  // Esc leaves row mode on the database title.
  await pressKeys(page, "Escape");
  await page.waitForTimeout(300);
  expect(await status(page)).not.toContain("Row");
  expect(await getActualCursorBlockText(page)).toBe("Daily Logs");
});

test("o on a row adds a page to the database and starts on its title", async ({
  extensionPage: page,
}) => {
  await openDatabasePage(page, ["Monday"]);
  await pressKeys(page, "j", "j");
  await page.waitForTimeout(400);
  expect(await status(page)).toContain("Row 1/1");
  await pressKeys(page, "o");
  await page.waitForTimeout(1200);
  expect((await getVimState(page)).mode).toBe("insert");
  await page.keyboard.type("Brand new");
  await pressKeys(page, "Escape");
  await page.waitForTimeout(1200);
  expect(await page.locator(".notion-collection-item .notion-table-view-cell span").allTextContents()).toEqual(
    expect.arrayContaining(["Monday", "Brand new"]),
  );
});

test("Shift+Enter on a row opens its page in a new tab, and yk below a database yanks lines", async ({
  extensionPage: page,
}) => {
  const order = await openDatabasePage(page, ["Monday", "Tuesday"]);
  await pressKeys(page, "j", "j");
  await page.waitForTimeout(400);
  expect(await status(page)).toContain("Row 1/2");
  const rowId = await page.evaluate(() =>
    (document.querySelector(".vim-row-cursor") as HTMLElement | null)?.dataset.blockId?.replace(/-/g, ""),
  );
  expect(rowId).toBeTruthy();
  // Shift on its own keeps row mode, so Shift+Enter reaches the row.
  const [tab] = await Promise.all([
    page.context().waitForEvent("page", { timeout: 10_000 }),
    pressKeys(page, "Shift+Enter"),
  ]);
  expect(tab.url()).toContain(rowId!);
  await tab.close();
  expect(order).toHaveLength(2);

  // yk from the line below the database is a line-wise yank, not a move onto
  // the database's rows.
  await page.getByText("after", { exact: true }).click();
  await pressKeys(page, "Escape");
  await page.waitForTimeout(300);
  await pressKeys(page, "y", "k");
  await page.waitForTimeout(600);
  expect(await status(page)).not.toContain("Row");
  expect((await getVimState(page)).mode).toBe("normal");
});

test("Ctrl+h / Ctrl+l then gq keeps the row cursor on the opened row", async ({
  extensionPage: page,
}) => {
  const order = await openDatabasePage(page, ["Monday", "Tuesday", "Wednesday"]);
  await pressKeys(page, "j", "j", "j");
  await page.waitForTimeout(400);
  expect(await status(page)).toContain("Row 2/3");
  await pressKeys(page, "Enter");
  await page.locator(".notion-peek-renderer").getByText(`${order[1]} second`).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
  // Ctrl on its own (sent before Ctrl+h / Ctrl+l) must not drop the row.
  await pressKeys(page, "Control+h");
  await page.waitForTimeout(500);
  expect(await status(page)).toContain("Row 2/3");
  await pressKeys(page, "Control+l");
  await page.waitForTimeout(500);
  await pressKeys(page, "g", "q");
  await page.waitForTimeout(1000);
  expect(await status(page)).toContain("Row 2/3");
  expect(await rowUnderCursor(page)).toContain(order[1]);
});
