/**
 * Enter on an external link opens it in a new tab; coming back to the Notion
 * tab, the cursor is still on the link's line (it used to land at the top of
 * the page: the click left no caret, and the returning focus put one at the
 * start of the page).
 */
import { test, expect } from "../fixtures";
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

let pageId = "";

test.afterAll(async () => {
  if (pageId) await notion("PATCH", `/v1/pages/${pageId}`, { archived: true }).catch(() => {});
});

const paragraph = (...rich: unknown[]) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rich } });
const plain = (content: string) => ({ type: "text", text: { content } });

test("Enter on an external link keeps the cursor on its line after coming back", async ({
  extensionPage: page,
  extensionContext: context,
}) => {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [plain("External link")] } },
    children: [
      paragraph(plain("line one")),
      paragraph(plain("line two")),
      paragraph(plain("see "), { type: "text", text: { content: "example", link: { url: "https://example.com/" } } }),
      paragraph(plain("after")),
    ],
  });
  pageId = p.id;
  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.getByText("after", { exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);
  await page.getByText("line two", { exact: true }).click();
  await pressKeys(page, "Escape", "j", "0");
  await page.waitForTimeout(300);
  expect(await getActualCursorBlockText(page)).toBe("see example");

  const opened = context.waitForEvent("page", { timeout: 10_000 });
  await pressKeys(page, "Enter");
  const tab = await opened;
  await tab.bringToFront();
  await page.waitForTimeout(500);
  await page.bringToFront();
  await page.waitForTimeout(800);

  expect(await getActualCursorBlockText(page)).toBe("see example");
  expect((await getVimState(page)).mode).toBe("normal");
  await pressKeys(page, "j");
  await page.waitForTimeout(300);
  expect(await getActualCursorBlockText(page)).toBe("after");
  await tab.close();
});
