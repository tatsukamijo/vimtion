/**
 * Clipboard bookkeeping: Notion's own clipboard data for yank / put, and
 * keeping the clipboard intact across Vimtion's internal block cuts.
 *
 * Mentions (pages, link previews, people, dates) only survive copy and paste
 * through Notion's private clipboard types (text/_notion-blocks-v3-...). A
 * page can't read those back from the system clipboard, so the data Notion
 * writes in each copy / cut event is kept here, and p / P hand it back to
 * Notion's paste handler while the clipboard still holds that text.
 *
 * Notion only removes a block reliably through a cut, and every cut replaces
 * the clipboard. Commands that are not supposed to touch it (J) mark their
 * cut, and the clipboard content Vimtion last saw is written back into that
 * cut event. Content copied outside the page is unknown here; it is lost.
 */

const NOTION_TYPE = /^text\/_notion-/;
const NOTION_BLOCKS = "text/_notion-blocks-v3-production";

export interface ClipboardPayload {
  text: string;
  html: string;
  /** Notion's private types (empty when the content came from elsewhere). */
  notion: Record<string, string>;
}

let last: ClipboardPayload | null = null;
let restoreOnNextCut = false;
/** While collecting, every copy / cut is kept (multi-line yank and dd). */
let collected: ClipboardPayload[] | null = null;

const payloadOf = (data: DataTransfer): ClipboardPayload => {
  const notion: Record<string, string> = {};
  Array.from(data.types)
    .filter((t) => NOTION_TYPE.test(t))
    .forEach((t) => {
      notion[t] = data.getData(t);
    });
  return { text: data.getData("text/plain"), html: data.getData("text/html"), notion };
};

const record = (e: ClipboardEvent) => {
  const data = e.clipboardData;
  if (!data) return;
  // While collecting, only the merged result becomes the clipboard content.
  if (collected) collected.push(payloadOf(data));
  else last = payloadOf(data);
};

// Bubble phase on window: runs after Notion has filled the event's data.
window.addEventListener("copy", record);
window.addEventListener("cut", (e: ClipboardEvent) => {
  if (!restoreOnNextCut) {
    record(e);
    return;
  }
  restoreOnNextCut = false;
  if (!last || !e.clipboardData) return;
  const kept = last;
  e.clipboardData.setData("text/plain", kept.text);
  if (kept.html) e.clipboardData.setData("text/html", kept.html);
  Object.entries(kept.notion).forEach(([t, v]) => e.clipboardData!.setData(t, v));
  e.preventDefault();
});

// Vimtion also writes the clipboard directly (yank paths): plain text only.
if (navigator.clipboard && navigator.clipboard.writeText) {
  const write = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = (text: string) => {
    last = { text, html: "", notion: {} };
    return write(text);
  };
}

/** The next cut is internal: keep the clipboard as it was. */
export const preserveClipboardOnNextCut = (): void => {
  restoreOnNextCut = true;
};

/**
 * Start keeping every copy / cut (one per block of a line-wise yank or dd).
 * False when a collection is already running.
 */
export const startCollecting = (): boolean => {
  if (collected) return false;
  collected = [];
  return true;
};

/** Stop collecting and drop what was collected (a failed yank). */
export const cancelCollecting = (): void => {
  collected = null;
};

/**
 * Merge what was collected into one line-wise payload (blocks in document
 * order; pass `reverse` when they were cut last-first). Null when a block's
 * Notion data is missing. (Notion pastes a copied block with its children:
 * it rebuilds each block from its id, whatever the copied data says.)
 */
export const finishCollecting = (reverse = false): ClipboardPayload | null => {
  const items = collected ?? [];
  collected = null;
  if (reverse) items.reverse();
  if (items.length === 0 || items.some((p) => !p.notion[NOTION_BLOCKS])) return null;
  try {
    const parsed = items.map((p) => JSON.parse(p.notion[NOTION_BLOCKS]));
    const blocks = parsed.flatMap((d) => d.blocks ?? []);
    const notion = { ...items[0].notion };
    notion[NOTION_BLOCKS] = JSON.stringify({ ...parsed[0], blocks, wasContiguousSelection: true });
    const merged: ClipboardPayload = {
      text: items.map((p) => p.text).join("\n"),
      html: items.map((p) => p.html).join(""),
      notion,
    };
    last = merged;
    return merged;
  } catch {
    return null;
  }
};

/** Put a payload's text and HTML on the system clipboard. */
export const writeClipboard = (p: ClipboardPayload): Promise<void> => {
  last = p;
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard.write) {
    return navigator.clipboard.writeText(p.text).then(() => {
      last = p;
    });
  }
  return navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": new Blob([p.text], { type: "text/plain" }),
      "text/html": new Blob([p.html || p.text], { type: "text/html" }),
    }),
  ]);
};

const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();

/**
 * Notion's data for what the system clipboard holds now (`text`), if it
 * came from a copy / cut / yank in Notion; null for anything else.
 */
export const notionDataFor = (text: string): Record<string, string> | null =>
  last && last.notion[NOTION_BLOCKS] && normalize(last.text) === normalize(text) ? last.notion : null;

/** The payload as a paste event's DataTransfer. */
export const pasteDataOf = (text: string, html: string, notion: Record<string, string>): DataTransfer => {
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  if (html) dt.setData("text/html", html);
  Object.entries(notion).forEach(([t, v]) => dt.setData(t, v));
  return dt;
};
