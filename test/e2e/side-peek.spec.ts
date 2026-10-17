/**
 * Pages opened in a side peek (database rows) get Vim keys too, and the page
 * behind keeps working after the peek closes.
 */
import { test, expect } from "../fixtures";
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

test("j / x / k act inside a side peek, and on the page after it closes", async ({ extensionPage: page }) => {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Peek" } }] } },
    children: [paragraph("main page line")],
  });
  pageId = p.id;
  const db = await notion("POST", "/v1/databases", {
    parent: { type: "page_id", page_id: p.id },
    is_inline: true,
    title: [{ type: "text", text: { content: "Logs" } }],
    properties: { Name: { title: {} } },
  });
  const row = await notion("POST", "/v1/pages", {
    parent: { database_id: db.id },
    properties: { Name: { title: [{ type: "text", text: { content: "Today" } }] } },
    children: ["first log line", "second log line", "third log line"].map(paragraph),
  });

  // Open the row in a side peek straight from the URL (?p=<id>&pm=s), the
  // way Notion links to a peeked database page.
  const rowId = String(row.id).replace(/-/g, "");
  await page.goto(`${p.url}?p=${rowId}&pm=s`, { waitUntil: "domcontentloaded" });
  const peek = page.locator(".notion-peek-renderer");
  await peek.getByText("third log line").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  // Vimtion's first-run notices would intercept the clicks below.
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);

  await peek.getByText("first log line").click();
  await pressKeys(page, "Escape", "0", "j", "x");
  await page.waitForTimeout(600);
  expect(await peek.getByText("econd log line", { exact: true }).count()).toBe(1);
  expect(await peek.locator('[data-content-editable-leaf="true"]').allTextContents()).not.toContain(
    "fjirst log line",
  );

  // Back on the page behind the peek.
  await page.getByText("main page line").click();
  await pressKeys(page, "Escape", "0", "x");
  await page.waitForTimeout(600);
  expect(await getActualCursorBlockText(page)).toBe("ain page line");
});
