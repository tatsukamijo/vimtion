/**
 * Visual-line p / P (V ... p) replace the selected lines with the clipboard,
 * always line-wise, and leave the clipboard as it was so the same content can
 * be put again.
 */
import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import {
  pressKeys,
  getVimState,
  waitForVimStateReady,
  getAllBlockTexts,
  getActualCursorBlockText,
  getActualCursorBlockIndex,
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

const text = (t: string) => [{ type: "text", text: { content: t } }];
const para = (t: string) => ({ object: "block", type: "paragraph", paragraph: { rich_text: text(t) } });
const code = (t: string) => ({ object: "block", type: "code", code: { rich_text: text(t), language: "plain text" } });
const bullet = (t: string, children?: unknown[]) => ({
  object: "block",
  type: "bulleted_list_item",
  bulleted_list_item: { rich_text: text(t), ...(children ? { children } : {}) },
});

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
    properties: { title: { title: text("Visual line put") } },
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

const setClipboard = (page: Page, t: string) =>
  page.evaluate((s) => navigator.clipboard.writeText(s), t);
const readClipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Block texts below the page title. */
const body = async (page: Page) => (await getAllBlockTexts(page)).slice(1);

/** Text of the line the caret is on. */
const activeLineText = (page: Page) => getActualCursorBlockText(page);
/** Index of the line the caret is on (0 is the page title). */
const activeLine = (page: Page) => getActualCursorBlockIndex(page);

/** Texts of the bulleted list items on the page. */
const bullets = (page: Page) =>
  page
    .locator(".notion-bulleted_list-block")
    .evaluateAll((els) => els.map((e) => e.textContent || "").filter((t) => t !== ""));

const settle = (page: Page, ms = 1200) => page.waitForTimeout(ms);

test.describe("visual-line p / P", () => {
  test("Vp replaces one line with outside text and keeps the clipboard", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [para("one"), para("two"), para("three")]);
    await setClipboard(page, "NEW");

    await pressKeys(page, "j", "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["one", "NEW", "three"]);
    expect((await getVimState(page)).mode).toBe("normal");
    expect(await activeLineText(page)).toBe("NEW");
    expect(await readClipboard(page)).toBe("NEW");

    // The clipboard still holds the text: put it again over the next line.
    await pressKeys(page, "j", "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["one", "NEW", "NEW"]);
    expect(await readClipboard(page)).toBe("NEW");
  });

  test("VjjP replaces several lines with one and keeps the clipboard", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [para("a"), para("b"), para("c"), para("d"), para("e")]);
    await setClipboard(page, "X");

    await pressKeys(page, "j", "V", "j", "j", "P");
    await settle(page, 1800);
    expect(await body(page)).toEqual(["a", "X", "e"]);
    expect((await getVimState(page)).mode).toBe("normal");
    expect(await activeLineText(page)).toBe("X");
    expect(await readClipboard(page)).toBe("X");
  });

  test("a selection made upwards (Vk) is replaced the same way", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("a"), para("b"), para("c"), para("d")]);
    await setClipboard(page, "X");

    await pressKeys(page, "j", "j", "V", "k", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["a", "X", "d"]);
    expect(await activeLineText(page)).toBe("X");
  });

  test("multi-line outside text becomes one line each", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("one"), para("two"), para("three")]);
    await setClipboard(page, "X\nY");

    await pressKeys(page, "j", "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["one", "X", "Y", "three"]);
    // On the first put line.
    expect(await activeLineText(page)).toBe("X");
    expect(await readClipboard(page)).toBe("X\nY");
  });

  test("yy then Vp over another line puts the yanked line there, repeatably", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [para("src"), para("b"), para("c"), para("d")]);

    await pressKeys(page, "y", "y");
    await settle(page, 600);
    await pressKeys(page, "j", "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["src", "src", "c", "d"]);
    expect(await activeLineText(page)).toBe("src");
    expect(await activeLine(page)).toBe(2);

    // Still the yanked line: over the last two lines.
    await pressKeys(page, "j", "V", "j", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["src", "src", "src"]);
    expect((await readClipboard(page)).trim()).toBe("src");
  });

  test("Vjy then Vp: two yanked lines replace one", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("a"), para("b"), para("c"), para("d")]);

    await pressKeys(page, "V", "j", "y");
    await settle(page, 800);
    await pressKeys(page, "G", "V", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["a", "b", "c", "a", "b"]);
    expect(await activeLineText(page)).toBe("a");
    expect(await activeLine(page)).toBe(4);
  });

  test("the first and the last line of the page", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("first"), para("mid"), para("last")]);
    await setClipboard(page, "X");

    await pressKeys(page, "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["X", "mid", "last"]);
    expect(await activeLineText(page)).toBe("X");

    await pressKeys(page, "G", "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["X", "mid", "X"]);
    expect(await activeLine(page)).toBe(3);
    expect(await readClipboard(page)).toBe("X");
  });

  test("the whole body selected", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("a"), para("b"), para("c")]);
    await setClipboard(page, "X");

    await pressKeys(page, "V", "G", "p");
    await settle(page, 1800);
    expect(await body(page)).toEqual(["X"]);
    expect(await activeLineText(page)).toBe("X");
  });

  test("u undoes the whole put", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("a"), para("b"), para("c"), para("d")]);
    await setClipboard(page, "X");

    await pressKeys(page, "j", "V", "j", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["a", "X", "d"]);

    await pressKeys(page, "u");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["a", "b", "c", "d"]);
    expect((await getVimState(page)).mode).toBe("normal");
  });

  test("an empty clipboard deletes nothing", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("a"), para("b"), para("c")]);
    await setClipboard(page, "");

    await pressKeys(page, "j", "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["a", "b", "c"]);
    expect((await getVimState(page)).mode).toBe("normal");
  });

  test("a yanked paragraph over bullets replaces them with a paragraph", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [para("plain"), bullet("b1"), bullet("b2"), bullet("b3")]);

    await pressKeys(page, "y", "y");
    await settle(page, 600);
    await pressKeys(page, "j", "V", "j", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["plain", "plain", "b3"]);
    expect(await bullets(page)).toEqual(["b3"]);
  });

  test("outside text over a bullet between bullets", async ({ extensionPage: page }) => {
    await openFreshPage(page, [bullet("b1"), bullet("b2"), bullet("b3"), para("end")]);
    await setClipboard(page, "X");

    await pressKeys(page, "j", "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["b1", "X", "b3", "end"]);
    expect(await activeLineText(page)).toBe("X");
    expect(await readClipboard(page)).toBe("X");
  });

  test("a parent selected without its children keeps the children", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [
      para("top"),
      bullet("parent", [bullet("child 1"), bullet("child 2")]),
      para("end"),
    ]);
    await setClipboard(page, "X");

    await pressKeys(page, "j", "V", "p");
    await settle(page, 1800);
    expect(await body(page)).toEqual(["top", "X", "child 1", "child 2", "end"]);
    expect(await activeLineText(page)).toBe("X");
  });

  test("a parent selected with its children is replaced whole", async ({ extensionPage: page }) => {
    await openFreshPage(page, [
      para("top"),
      bullet("parent", [bullet("child 1"), bullet("child 2")]),
      para("end"),
    ]);
    await setClipboard(page, "X");

    await pressKeys(page, "j", "V", "j", "j", "p");
    await settle(page, 1800);
    expect(await body(page)).toEqual(["top", "X", "end"]);
    expect(await activeLineText(page)).toBe("X");
  });

  test("V on a code line inside a code block replaces that code line only", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [para("before"), code("line 1\nline 2\nline 3"), para("after")]);
    await setClipboard(page, "NEW");

    // Into the code block, onto its second line.
    await pressKeys(page, "j", "j", "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["before", "line 1\nNEW\nline 3", "after"]);
    expect((await getVimState(page)).mode).toBe("normal");
    expect(await readClipboard(page)).toBe("NEW");
  });

  test("u undoes a code line put", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("before"), code("line 1\nline 2\nline 3"), para("after")]);
    await setClipboard(page, "NEW");

    await pressKeys(page, "j", "j", "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["before", "line 1\nNEW\nline 3", "after"]);
    await pressKeys(page, "u");
    await settle(page);
    expect(await body(page)).toEqual(["before", "line 1\nline 2\nline 3", "after"]);
  });

  test("an empty line is replaced in place", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("a"), para(""), para("c")]);
    await setClipboard(page, "X");

    await pressKeys(page, "j", "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["a", "X", "c"]);
    expect(await activeLine(page)).toBe(2);

    // A selection starting on an empty line.
    await setClipboard(page, "");
    await openFreshPage(page, [para(""), para("b"), para("c")]);
    // (After a line-wise yank: the clipboard below is still not that yank.)
    await pressKeys(page, "j", "y", "y", "k");
    await settle(page, 800);
    await setClipboard(page, "Y");
    await pressKeys(page, "V", "j", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["Y", "c"]);
  });

  test("a word yanked from a heading is put as a plain line (yiw, Vp)", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [
      { object: "block", type: "heading_2", heading_2: { rich_text: text("Title word") } },
      para("target"),
      para("end"),
    ]);

    await pressKeys(page, "y", "i", "w", "j", "V", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["Title word", "Title", "end"]);
    expect(await page.locator(".notion-sub_header-block").count()).toBe(1);
  });

  test("a yanked heading over a paragraph stays a heading (yy, Vp)", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [
      { object: "block", type: "heading_2", heading_2: { rich_text: text("Head") } },
      para("target"),
      para("end"),
    ]);

    await pressKeys(page, "y", "y");
    await settle(page, 600);
    await pressKeys(page, "j", "V", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["Head", "Head", "end"]);
    expect(await page.locator(".notion-sub_header-block").count()).toBe(2);
  });

  test("typed-ahead keys wait for the put (Vp then j)", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("a"), para("b"), para("c"), para("d")]);
    await setClipboard(page, "X");

    await pressKeys(page, "j", "V", "p", "j");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["a", "X", "c", "d"]);
    expect(await activeLineText(page)).toBe("c");
    expect((await getVimState(page)).mode).toBe("normal");
  });

  test("yanked line over a selection starting on an empty line (yy, Vjp), then u", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [para(""), para("b"), para("c"), para("d")]);

    await pressKeys(page, "G", "y", "y");
    await settle(page, 600);
    await pressKeys(page, "g", "g", "j", "V", "j", "p");
    await settle(page, 2000);
    expect(await body(page)).toEqual(["d", "c", "d"]);
    expect(await activeLine(page)).toBe(1);
    expect((await readClipboard(page)).trim()).toBe("d");

    await pressKeys(page, "u");
    await settle(page, 2000);
    expect(await body(page)).toEqual(["", "b", "c", "d"]);
  });

  test("text ending in a line break adds no empty line", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("one"), para("two"), para("three")]);
    await setClipboard(page, "X\n");

    await pressKeys(page, "j", "V", "p");
    await settle(page);
    expect(await body(page)).toEqual(["one", "X", "three"]);
    expect(await readClipboard(page)).toBe("X\n");
  });

  test("ggVGp replaces the body and keeps the title", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("a"), para("b"), para("c")]);
    await setClipboard(page, "X");

    await pressKeys(page, "g", "g", "V", "G", "p");
    await settle(page, 2000);
    expect(await getAllBlockTexts(page)).toEqual(["Visual line put", "X"]);
    expect(await readClipboard(page)).toBe("X");
  });

  test("u after a put leaves the edit before it alone (text)", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("abc"), para("b"), para("c"), para("d")]);
    await pressKeys(page, "x");
    await page.waitForTimeout(1500);
    await setClipboard(page, "X");

    await pressKeys(page, "j", "V", "j", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["bc", "X", "d"]);
    await pressKeys(page, "u");
    await settle(page, 2000);
    expect(await body(page)).toEqual(["bc", "b", "c", "d"]);
  });

  test("u after a put leaves the edit before it alone (yanked line)", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [para("abc"), para("b"), para("c"), para("d")]);
    await pressKeys(page, "x");
    await page.waitForTimeout(1500);
    await pressKeys(page, "G", "y", "y");
    await settle(page, 600);

    await pressKeys(page, "g", "g", "j", "j", "V", "j", "p");
    await settle(page, 2000);
    expect(await body(page)).toEqual(["bc", "d", "d"]);
    await pressKeys(page, "u");
    await settle(page, 2000);
    expect(await body(page)).toEqual(["bc", "b", "c", "d"]);
  });

  test("lines copied elsewhere with html become one line each", async ({ extensionPage: page }) => {
    await openFreshPage(page, [para("one"), para("two"), para("three")]);
    await page.evaluate(() =>
      navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob(["<meta charset='utf-8'><div>X</div><div>Y</div>"], { type: "text/html" }),
          "text/plain": new Blob(["X\nY"], { type: "text/plain" }),
        }),
      ]),
    );

    await pressKeys(page, "j", "V", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["one", "X", "Y", "three"]);
    expect(await readClipboard(page)).toBe("X\nY");
  });

  test("a URL over lines, then j: no menu takes the keys", async ({ extensionPage: page }) => {
    const url = "https://example.com/vimtion";
    await openFreshPage(page, [para("a"), para("b"), para("c"), para("d")]);
    await setClipboard(page, url);

    await pressKeys(page, "j", "V", "j", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(["a", url, "d"]);
    expect((await getVimState(page)).mode).toBe("normal");
    await pressKeys(page, "j");
    await settle(page, 300);
    expect(await activeLineText(page)).toBe("d");
    expect(await body(page)).toEqual(["a", url, "d"]);
    expect(await readClipboard(page)).toBe(url);
  });

  test("u after a put on an empty first line leaves the edit before it alone", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [para("abc"), para(""), para("c"), para("d")]);
    await pressKeys(page, "x");
    await page.waitForTimeout(1500);
    await pressKeys(page, "G", "y", "y");
    await settle(page, 600);

    await pressKeys(page, "g", "g", "j", "j", "V", "j", "p");
    await settle(page, 2000);
    expect(await body(page)).toEqual(["bc", "d", "d"]);
    await pressKeys(page, "u");
    await settle(page, 2000);
    expect(await body(page)).toEqual(["bc", "", "c", "d"]);
  });

  // Notion does not follow a caret set from script into a code block, so a
  // whole code block cannot be cut (Vd leaves it behind too, see
  // docs/known-bugs.md). The put leaves such a selection alone rather than
  // replace part of it.
  test("a selection holding a whole code block is left unchanged", async ({
    extensionPage: page,
  }) => {
    const blocks = ["before", "let a = 1", "after", "end"];
    await openFreshPage(page, [para("before"), code("let a = 1"), para("after"), para("end")]);
    await setClipboard(page, "X");

    await pressKeys(page, "V", "j", "j", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(blocks);
    expect((await getVimState(page)).mode).toBe("normal");
    expect(await readClipboard(page)).toBe("X");

    // Starting on the code block (V k from below).
    await pressKeys(page, "j", "j", "V", "k", "p");
    await settle(page, 1500);
    expect(await body(page)).toEqual(blocks);
    expect(await readClipboard(page)).toBe("X");
  });

  test("Vjjd over a whole code block deletes it (known bug: it is left behind)", async ({
    extensionPage: page,
  }) => {
    await openFreshPage(page, [para("before"), code("let a = 1"), para("after"), para("end")]);
    await pressKeys(page, "V", "j", "j", "d");
    await settle(page, 1800);
    expect(await body(page)).toEqual(["end"]);
  });
});
