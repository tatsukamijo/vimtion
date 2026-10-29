/**
 * gl hints buttons and other controls that are not links (a database's
 * "New page", a toggle's arrow, a to-do's checkbox) and clicks the one picked.
 * Buttons Notion only shows on hover get no hint.
 */
import { test, expect } from "../fixtures";
import type { Locator, Page } from "@playwright/test";
import { pressKeys, waitForVimStateReady } from "../helpers";

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
const paragraph = (t: string) => ({ object: "block", type: "paragraph", paragraph: { rich_text: text(t) } });

const created: string[] = [];

test.afterAll(async () => {
  await Promise.all(
    created.map((id) => notion("PATCH", `/v1/pages/${id}`, { archived: true }).catch(() => {})),
  );
});

/**
 * A fresh page: "before", a toggle, a to-do, and a "Logs" database with one
 * row. Opened, cursor on "before", mouse out of the way.
 */
async function openFreshPage(page: Page) {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: text("Clickables") } },
    children: [
      paragraph("before"),
      { object: "block", type: "toggle", toggle: { rich_text: text("a toggle"), children: [paragraph("hidden child")] } },
      { object: "block", type: "to_do", to_do: { rich_text: text("a todo"), checked: false } },
    ],
  });
  created.push(p.id);
  const db = await notion("POST", "/v1/databases", {
    parent: { type: "page_id", page_id: p.id },
    is_inline: true,
    title: text("Logs"),
    properties: { Name: { title: {} } },
  });
  await notion("POST", "/v1/pages", {
    parent: { database_id: db.id },
    properties: { Name: { title: text("Row one") } },
  });

  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.locator(".notion-collection-item", { hasText: "Row one" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);
  await page.getByText("before", { exact: true }).click();
  await pressKeys(page, "Escape");
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
}

/** The hint label placed at the top-left corner of `target` ("" if none). */
async function hintAt(target: Locator): Promise<string> {
  return target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const hint = Array.from(document.querySelectorAll<HTMLElement>(".vim-link-hint")).find((h) => {
      const r = h.getBoundingClientRect();
      return Math.abs(r.left - box.left) < 2 && Math.abs(r.top - box.top) < 2;
    });
    return hint?.textContent ?? "";
  });
}

/** Hints whose top-left lies inside `target`'s box. */
async function hintsInside(target: Locator): Promise<string[]> {
  return target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return Array.from(document.querySelectorAll<HTMLElement>(".vim-link-hint"))
      .filter((h) => {
        const r = h.getBoundingClientRect();
        return r.left >= box.left - 2 && r.left < box.right && r.top >= box.top - 2 && r.top < box.bottom;
      })
      .map((h) => h.textContent ?? "");
  });
}

async function pickHint(page: Page, hint: string) {
  expect(hint).not.toBe("");
  await pressKeys(page, ...hint.split(""));
  await page.waitForTimeout(1000);
  expect(await page.locator(".vim-link-hint").count()).toBe(0);
}

test.describe("gl hints buttons and controls", () => {
  test("the database's New page button gets a hint, and picking it adds a row", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page);
    const rows = page.locator(".notion-collection-item");
    expect(await rows.count()).toBe(1);

    await pressKeys(page, "g", "l");
    await page.waitForTimeout(300);
    const newPage = page.locator(".notion-collection_view-block [role='button']", { hasText: /^New page$/ });
    await pickHint(page, await hintAt(newPage));

    await expect(rows).toHaveCount(2, { timeout: 5000 });
    // Exactly one click: a doubled pointer + click event would add two.
    await page.waitForTimeout(1500);
    expect(await rows.count()).toBe(2);
  });

  test("a toggle's arrow gets a hint, and picking it opens the toggle", async ({ extensionPage: page }) => {
    await openFreshPage(page);
    const child = page.getByText("hidden child", { exact: true });
    await expect(child).toBeHidden();

    await pressKeys(page, "g", "l");
    await page.waitForTimeout(300);
    const arrow = page.locator(".notion-toggle-block [role='button']").first();
    await pickHint(page, await hintAt(arrow));

    await expect(child).toBeVisible({ timeout: 5000 });
  });

  test("a to-do's checkbox gets a hint, and picking it checks the to-do", async ({ extensionPage: page }) => {
    await openFreshPage(page);
    const box = page.locator(".notion-to_do-block input[type='checkbox']");
    await expect(box).not.toBeChecked();

    await pressKeys(page, "g", "l");
    await page.waitForTimeout(300);
    await pickHint(page, await hintAt(box));

    await expect(box).toBeChecked({ timeout: 5000 });
  });

  test("a database row gets one hint; its hover-only buttons and the hidden Add icon get none", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page);
    await pressKeys(page, "g", "l");
    await page.waitForTimeout(300);

    const row = page.locator(".notion-collection-item", { hasText: "Row one" });
    expect(await hintsInside(row)).toHaveLength(1);
    const addIcon = page.locator("[role='button']", { hasText: /^Add icon$/ });
    expect(await hintAt(addIcon)).toBe("");

    await pressKeys(page, "Escape");
    await page.waitForTimeout(300);
    expect(await page.locator(".vim-link-hint").count()).toBe(0);
  });
});
