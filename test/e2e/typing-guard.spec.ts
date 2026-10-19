/**
 * Outside insert mode nothing typed may reach the page, even when a key gets
 * past Vimtion's keydown handling. A visual-line selection over long
 * paragraphs was emptied and replaced by "jjj" when Notion took the keys.
 * page.keyboard.insertText sends text without a keydown: what Notion would
 * insert if Vimtion never saw the key.
 */
import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { pressKeys, waitForVimStateReady, getVimState } from "../helpers";

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

const LONG =
  "Instead of requiring every robot capability to exist as a predefined primitive, we propose letting an agent discover unfamiliar manipulation skills through slow, closed-loop interaction.";
const LINES = ["Proposed idea", LONG, `${LONG} Again.`, "last line"];
let pageId = "";
let shrinkPageId = "";
let shiftPageId = "";

test.afterAll(async () => {
  for (const id of [pageId, shrinkPageId, shiftPageId]) {
    if (id) await notion("PATCH", `/v1/pages/${id}`, { archived: true }).catch(() => {});
  }
});

const body = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".notion-page-content [data-content-editable-leaf]")).map(
      (e) => e.textContent ?? "",
    ),
  );

test("typing outside insert mode never replaces a visual-line selection", async ({
  extensionPage: page,
}) => {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Guard" } }] } },
    children: [
      { object: "block", type: "heading_1", heading_1: { rich_text: [{ type: "text", text: { content: "Big heading" } }] } },
      ...LINES.map((l) => ({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: l } }] },
      })),
    ],
  });
  pageId = p.id;
  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.getByText("last line", { exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);
  await page.getByText("Big heading", { exact: true }).click();
  await pressKeys(page, "Escape", "V", "j", "j", "j");
  await page.waitForTimeout(500);
  expect((await getVimState(page)).mode).toBe("visual-line");
  const before = await body(page);

  await page.keyboard.insertText("jjj");
  await page.waitForTimeout(600);
  expect(await body(page)).toEqual(before);

  // Normal mode too.
  await pressKeys(page, "Escape");
  await page.waitForTimeout(300);
  await page.keyboard.insertText("kk");
  await page.waitForTimeout(600);
  expect(await body(page)).toEqual(before);
});

test("visual-line keeps working when lines at the end disappear under it", async ({
  extensionPage: page,
}) => {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Shrink" } }] } },
    children: ["one", "two", "three", "tail a", "tail b"].map((l) => ({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ type: "text", text: { content: l } }] },
    })),
  });
  shrinkPageId = p.id;
  const kids = (await notion("GET", `/v1/blocks/${p.id}/children`)).results as { id: string }[];
  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.getByText("tail b", { exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);
  await page.getByText("two", { exact: true }).click();
  await pressKeys(page, "Escape", "V", "j", "j", "j");
  await page.waitForTimeout(400);
  expect((await getVimState(page)).statusText).toContain("VISUAL-LINE");

  // The last two lines (the cursor's among them) go away under the selection.
  await notion("DELETE", `/v1/blocks/${kids[3].id}`);
  await notion("DELETE", `/v1/blocks/${kids[4].id}`);
  await page.getByText("tail b", { exact: true }).waitFor({ state: "detached", timeout: 30_000 });
  await page.waitForTimeout(800);

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("Vimtion")) errors.push(m.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  await pressKeys(page, "k");
  await page.waitForTimeout(400);
  const state = await getVimState(page);
  expect(state.mode).toBe("visual-line");
  expect(state.activeLine).toBeLessThanOrEqual(state.lineCount);
  expect(errors).toEqual([]);
  await pressKeys(page, "Escape");
  await page.waitForTimeout(300);
  expect(await body(page)).toEqual(["one", "two", "three"]);
});

test("Vd deletes the highlighted lines when lines above them disappear", async ({
  extensionPage: page,
}) => {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: "Shift" } }] } },
    children: ["top one", "top two", "sel one", "sel two", "sel three", "bottom"].map((l) => ({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ type: "text", text: { content: l } }] },
    })),
  });
  shiftPageId = p.id;
  const kids = (await notion("GET", `/v1/blocks/${p.id}/children`)).results as { id: string }[];
  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.getByText("bottom", { exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    document
      .querySelectorAll(".vimtion-notification-overlay, .vimtion-update-notification")
      .forEach((e) => e.remove()),
  );
  await waitForVimStateReady(page, 10_000);
  await page.getByText("sel one", { exact: true }).click();
  await pressKeys(page, "Escape", "V", "j", "j");
  await page.waitForTimeout(400);

  // Two lines above the selection go away (another client, a re-render).
  await notion("DELETE", `/v1/blocks/${kids[0].id}`);
  await notion("DELETE", `/v1/blocks/${kids[1].id}`);
  await page.getByText("top two", { exact: true }).waitFor({ state: "detached", timeout: 30_000 });
  await page.waitForTimeout(800);

  await pressKeys(page, "d");
  await page.waitForTimeout(1500);
  expect(await body(page)).toEqual(["bottom"]);
});

