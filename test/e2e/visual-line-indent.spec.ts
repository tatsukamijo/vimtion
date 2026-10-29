/**
 * Tab / Shift+Tab in visual-line mode indent / outdent every selected block
 * at once (Notion's Tab on a multi-block selection), and the selection stays
 * on the same blocks so the key can be pressed again.
 */
import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { pressKeys, getVimState, waitForVimStateReady, getAllBlockTexts } from "../helpers";

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
const bullet = (t: string, children?: unknown[]) => ({
  object: "block",
  type: "bulleted_list_item",
  bulleted_list_item: { rich_text: text(t), ...(children ? { children } : {}) },
});
const code = (t: string) => ({ object: "block", type: "code", code: { rich_text: text(t), language: "plain text" } });

const created: string[] = [];

test.afterAll(async () => {
  await Promise.all(
    created.map((id) => notion("PATCH", `/v1/pages/${id}`, { archived: true }).catch(() => {})),
  );
});

/** A fresh page holding `children`, opened, cursor on the first block. */
async function openFreshPage(page: Page, children: unknown[]) {
  const p = await notion("POST", "/v1/pages", {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: text("Indent") } },
    children,
  });
  created.push(p.id);
  await page.goto(p.url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-content-editable-leaf="true"]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await waitForVimStateReady(page, 10_000);
  // Title -> first block.
  await pressKeys(page, "j");
  await page.waitForTimeout(200);
}

/** Text of the block whose children `child`'s block sits in ("" at the top level). */
const parentOf = (page: Page, child: string): Promise<string> =>
  page.evaluate((t) => {
    const leaf = Array.from(document.querySelectorAll('[data-content-editable-leaf="true"]')).find(
      (e) => e.textContent === t,
    );
    const block = leaf?.closest("[data-block-id]");
    const parent = block?.parentElement?.closest("[data-block-id]");
    if (!parent || parent.matches(".notion-page-content, .notion-page-block")) return "";
    return parent.querySelector('[data-content-editable-leaf="true"]')?.textContent ?? "";
  }, child);

const settle = (page: Page, ms = 800) => page.waitForTimeout(ms);

test.describe("visual-line Tab / Shift+Tab", () => {
  test("Tab indents every selected bullet, Shift+Tab outdents them, selection kept", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [bullet("top"), bullet("alpha"), bullet("beta"), bullet("after")]);
    await pressKeys(page, "j", "V", "j", "Tab");
    await settle(page);

    expect(await parentOf(page, "alpha")).toBe("top");
    expect(await parentOf(page, "beta")).toBe("top");
    expect(await parentOf(page, "after")).toBe("");
    expect((await getVimState(page)).mode).toBe("visual-line");

    await pressKeys(page, "Shift+Tab");
    await settle(page);
    expect(await parentOf(page, "alpha")).toBe("");
    expect(await parentOf(page, "beta")).toBe("");
    expect((await getVimState(page)).mode).toBe("visual-line");

    // Still on alpha..beta: Tab again nests them again.
    await pressKeys(page, "Tab");
    await settle(page);
    expect(await parentOf(page, "alpha")).toBe("top");
    expect(await parentOf(page, "beta")).toBe("top");

    await pressKeys(page, "Escape");
    await settle(page, 300);
    expect((await getVimState(page)).mode).toBe("normal");
  });

  test("one Tab indents one level, even when the block above has children", async ({
    extensionPage: page,
  }) => {
    // A second indent would put alpha under "top child".
    await openFreshPage(page, [bullet("top", [bullet("top child")]), bullet("alpha"), bullet("beta")]);
    await pressKeys(page, "j", "j", "V", "j", "Tab");
    await settle(page);

    expect(await parentOf(page, "alpha")).toBe("top");
    expect(await parentOf(page, "beta")).toBe("top");
  });

  test("a nested list with links (several levels selected) indents as one", async ({ extensionPage: page }) => {
    const link = (t: string, url: string) => ({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ type: "text", text: { content: t, link: { url } } }] },
    });
    await openFreshPage(page, [
      bullet("first"),
      bullet("Candidates", [
        { ...link("https://example.com/a", "https://example.com/a"),
          bulleted_list_item: {
            ...link("https://example.com/a", "https://example.com/a").bulleted_list_item,
            children: [bullet("Follow-up"), bullet("Follow-Follow-up")],
          } },
        link("https://example.com/b", "https://example.com/b"),
      ]),
      bullet("after"),
    ]);
    // Candidates .. https://example.com/b (5 lines, three levels).
    await pressKeys(page, "j", "V", "j", "j", "j", "j", "Tab");
    await settle(page);

    expect(await parentOf(page, "Candidates")).toBe("first");
    expect(await parentOf(page, "https://example.com/a")).toBe("Candidates");
    expect(await parentOf(page, "Follow-up")).toBe("https://example.com/a");
    expect(await parentOf(page, "https://example.com/b")).toBe("Candidates");
    expect(await parentOf(page, "after")).toBe("");
    expect((await getVimState(page)).mode).toBe("visual-line");
  });

  test("a parent selected with its child indents as one subtree", async ({ extensionPage: page }) => {
    await openFreshPage(page, [bullet("top"), bullet("parent", [bullet("child")]), bullet("after")]);
    await pressKeys(page, "j", "V", "j", "Tab");
    await settle(page);

    expect(await parentOf(page, "parent")).toBe("top");
    expect(await parentOf(page, "child")).toBe("parent");
    expect(await parentOf(page, "after")).toBe("");
  });

  test("selected upward (V k) works the same", async ({ extensionPage: page }) => {
    await openFreshPage(page, [bullet("top"), bullet("alpha"), bullet("beta"), bullet("after")]);
    await pressKeys(page, "j", "j", "V", "k", "Tab");
    await settle(page);

    expect(await parentOf(page, "alpha")).toBe("top");
    expect(await parentOf(page, "beta")).toBe("top");
    expect((await getVimState(page)).mode).toBe("visual-line");
  });

  test("a selection with a code block in it is left as it is", async ({ extensionPage: page }) => {
    await openFreshPage(page, [bullet("top"), bullet("alpha"), code("let x = 1"), bullet("after")]);
    const before = await getAllBlockTexts(page);
    await pressKeys(page, "j", "V", "j", "Tab");
    await settle(page);

    expect(await getAllBlockTexts(page)).toEqual(before);
    expect(await parentOf(page, "alpha")).toBe("");
    expect((await getVimState(page)).mode).toBe("visual-line");
  });
});
