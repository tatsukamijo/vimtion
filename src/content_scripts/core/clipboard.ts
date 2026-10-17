/**
 * Keeps the clipboard intact across Vimtion's internal block cuts.
 *
 * Notion only removes a block reliably through a cut, and every cut replaces
 * the clipboard. Commands that are not supposed to touch it (J) mark their
 * cut, and the clipboard content Vimtion last saw is written back into that
 * cut event. Content copied outside the page is unknown here; it is lost.
 */

let last: { text: string; html: string } | null = null;
let restoreOnNextCut = false;

const record = (e: ClipboardEvent) => {
  const data = e.clipboardData;
  if (!data) return;
  last = { text: data.getData("text/plain"), html: data.getData("text/html") };
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
  e.clipboardData.setData("text/plain", last.text);
  if (last.html) e.clipboardData.setData("text/html", last.html);
  e.preventDefault();
});

// Vimtion also writes the clipboard directly (yank paths).
if (navigator.clipboard && navigator.clipboard.writeText) {
  const write = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = (text: string) => {
    last = { text, html: "" };
    return write(text);
  };
}

/** The next cut is internal: keep the clipboard as it was. */
export const preserveClipboardOnNextCut = (): void => {
  restoreOnNextCut = true;
};
