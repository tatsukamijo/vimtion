/**
 * Ctrl+h from the page moves onto the left sidebar: j / k walk its items, keys
 * meant for the page do not edit it, Enter opens the highlighted page, and
 * Ctrl+l / Esc come back to the page with the cursor where it was.
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

/** A fresh page ("first line", "second line"), cursor on "second line". */
async function openPage(page: Page) {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Sidebar" } }] } },
    children: [paragraph("first line"), paragraph("second line")],
  });
  created.push(p.id);
  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.getByText("second line", { exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);
  await page.getByText("second line", { exact: true }).click();
  await pressKeys(page, "Escape", "0");
  await page.waitForTimeout(300);
  expect(await getActualCursorBlockText(page)).toBe("second line");
}

/** The highlighted sidebar item: its label, role and link. */
const highlighted = (page: Page) =>
  page.evaluate(() => {
    const all = document.querySelectorAll(".vim-sidebar-cursor");
    const el = all[0];
    return {
      count: all.length,
      inSidebar: !!el?.closest(".notion-sidebar"),
      label: (el?.textContent ?? "").trim(),
      role: el?.getAttribute("role") ?? "",
      href: el?.getAttribute("href") ?? "",
      top: el ? Math.round(el.getBoundingClientRect().top) : -1,
    };
  });

const body = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".notion-page-content [data-content-editable-leaf]")).map(
      (e) => e.textContent ?? "",
    ),
  );

test.describe("sidebar", () => {
  test("Ctrl+h walks the sidebar without touching the page; Ctrl+l and Esc come back", async ({
    extensionPage: page,
  }) => {
    await openPage(page);
    await pressKeys(page, "Control+h");
    await page.waitForTimeout(300);
    const first = await highlighted(page);
    expect(first.count).toBe(1);
    expect(first.inSidebar).toBe(true);
    expect((await getVimState(page)).statusText).toMatch(/Sidebar \d+\/\d+/);

    await pressKeys(page, "j");
    await page.waitForTimeout(200);
    const next = await highlighted(page);
    expect(next.top).toBeGreaterThan(first.top);
    await pressKeys(page, "k");
    await page.waitForTimeout(200);
    expect((await highlighted(page)).top).toBe(first.top);

    // Page commands do nothing here.
    await pressKeys(page, "x", "d", "d", "i", "a");
    await page.waitForTimeout(400);
    expect(await body(page)).toEqual(["first line", "second line"]);
    expect((await getVimState(page)).mode).toBe("normal");

    await pressKeys(page, "Control+l");
    await page.waitForTimeout(300);
    expect((await highlighted(page)).count).toBe(0);
    expect((await getVimState(page)).statusText).not.toMatch(/Sidebar/);
    expect(await getActualCursorBlockText(page)).toBe("second line");
    await pressKeys(page, "k");
    await page.waitForTimeout(200);
    expect(await getActualCursorBlockText(page)).toBe("first line");

    await pressKeys(page, "Control+h", "Escape");
    await page.waitForTimeout(300);
    expect((await highlighted(page)).count).toBe(0);
    await pressKeys(page, "j");
    await page.waitForTimeout(200);
    expect(await getActualCursorBlockText(page)).toBe("second line");
  });

  test("Enter opens the highlighted page", async ({ extensionPage: page }) => {
    await openPage(page);
    const from = new URL(page.url()).pathname;
    await pressKeys(page, "Control+h", "g", "g");
    await page.waitForTimeout(300);
    // Down to a page item that is not this page.
    let target = await highlighted(page);
    for (let i = 0; i < 40 && (target.role !== "treeitem" || from.includes(target.href.split("?")[0])); i++) {
      await pressKeys(page, "j");
      target = await highlighted(page);
    }
    expect(target.role).toBe("treeitem");
    const id = target.href.match(/[a-f0-9]{32}/)?.[0];
    expect(id).toBeTruthy();
    await pressKeys(page, "Enter");
    await page.waitForURL((u) => u.pathname.includes(id!), { timeout: 10_000 });
    await page.waitForTimeout(1500);
    expect((await highlighted(page)).count).toBe(0);
    expect((await getVimState(page)).mode).toBe("normal");
    expect((await getVimState(page)).statusText).not.toMatch(/Sidebar/);
  });
});
