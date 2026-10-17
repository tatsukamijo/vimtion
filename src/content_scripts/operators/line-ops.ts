/**
 * ~ (toggle case), J (join lines), >> / << (indent / outdent), % (matching
 * bracket).
 */

import {
  getCursorIndexInElement,
  setCursorPosition,
  selectCharRange,
  deleteCharRange,
  lineBoundsAt,
  columnInLine,
  charBoundsAt,
} from "../cursor";
import { isInsideCodeBlock } from "../notion";
import { setActiveLine } from "../core/line-management";
import { beginBusy, endBusy } from "../core/busy";
import { deleteMultipleLinesAtomically } from "../core/dom-utils";
import { preserveClipboardOnNextCut } from "../core/clipboard";

const current = () => {
  const { vim_info } = window;
  const element = vim_info.lines[vim_info.active_line]?.element;
  return element ? { element, text: element.textContent || "" } : null;
};

/** ~ : toggle the case of the character under the cursor and move right. */
export const toggleCase = () => {
  const { vim_info } = window;
  const cur = current();
  if (!cur || cur.text.length === 0) return;
  const { element, text } = cur;
  const pos = getCursorIndexInElement(element);
  const { start, end } = charBoundsAt(text, pos);
  const ch = text.slice(start, end);
  const swapped = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
  if (swapped !== ch && selectCharRange(element, start, end)) {
    document.execCommand("insertText", false, swapped);
  }
  // Move right, but never past the last character of the (code) line.
  const newText = element.textContent || "";
  const line = lineBoundsAt(newText, start);
  const next = end < line.end ? end : start;
  setCursorPosition(element, next);
  vim_info.desired_column = columnInLine(element, next);
};

/**
 * J : join the next line onto this one with a single space (leading spaces
 * of the next line dropped), cursor on the join point. Inside a code block
 * it joins code lines; between Notion blocks it merges the blocks.
 */
export const joinLines = (refreshLines: () => void, updateInfoContainer: () => void) => {
  const { vim_info } = window;
  const cur = current();
  if (!cur) return;
  const { element, text } = cur;
  const pos = getCursorIndexInElement(element);

  if (isInsideCodeBlock(element)) {
    const { end } = lineBoundsAt(text, pos);
    // Last code line (Notion keeps a placeholder "\n" at the very end).
    if (end >= text.length - 1) return;
    let nextStart = end + 1;
    while (text[nextStart] === " " || text[nextStart] === "\t") nextStart++;
    const nextIsEmpty = nextStart >= text.length || text[nextStart] === "\n";
    const needsSpace = end > 0 && text[end - 1] !== " " && !nextIsEmpty;
    deleteCharRange(element, end, nextStart);
    if (needsSpace && selectCharRange(element, end, end)) {
      document.execCommand("insertText", false, " ");
    }
    setCursorPosition(element, end);
    vim_info.desired_column = columnInLine(element, end);
    return;
  }

  const nextIndex = vim_info.active_line + 1;
  const next = vim_info.lines[nextIndex]?.element;
  if (!next || isInsideCodeBlock(next)) return;
  const nextText = next.textContent || "";
  const tail = nextText.replace(/^[ \t]+/, "");
  const joinAt = text.length;
  const needsSpace = text.length > 0 && !text.endsWith(" ") && tail.length > 0;

  // Notion merges blocks only on a real Backspace, which a script cannot
  // send. Append the next line's text here (as plain text: its inline
  // formatting is lost), empty that block, then remove it the way dd does,
  // keeping the clipboard (J does not yank).
  beginBusy();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    if (selectCharRange(element, joinAt, joinAt) || joinAt === 0) {
      if (joinAt === 0) setCursorPosition(element, 0);
      document.execCommand("insertText", false, (needsSpace ? " " : "") + tail);
    }
    // Let Notion commit each edit before the next one touches another block.
    await sleep(120);
    const appended = (element.textContent || "").length > joinAt || tail.length === 0;
    if (!appended) {
      // The text did not land: leave both lines as they were.
      updateInfoContainer();
      endBusy();
      return;
    }
    if (nextText.length > 0) deleteCharRange(next, 0, nextText.length);
    await sleep(120);
    preserveClipboardOnNextCut();
    // Insert mode while the block cut runs, as dd does, so Vimtion's own key
    // handling lets the cut's synthetic events through.
    vim_info.mode = "insert";
    await deleteMultipleLinesAtomically(next as HTMLElement, 1);
    vim_info.mode = "normal";
    refreshLines();
    const idx = vim_info.lines.findIndex((l) => l.element === element);
    if (idx !== -1) {
      vim_info.active_line = idx;
      // Vim puts the cursor on the join point (the inserted space).
      const after = element.textContent || "";
      const rest = Math.max(0, Math.min(joinAt, after.length - 1));
      setCursorPosition(element, rest);
      vim_info.desired_column = rest;
    }
    updateInfoContainer();
    endBusy();
  })();
};

/** >> / << : indent / outdent the block (Notion's Tab / Shift+Tab). */
export const shiftBlock = (
  outdent: boolean,
  refreshLines: () => void,
  updateInfoContainer: () => void,
) => {
  const { vim_info } = window;
  const cur = current();
  if (!cur || isInsideCodeBlock(cur.element)) return;
  const { element } = cur;
  const pos = getCursorIndexInElement(element);
  const blockId = vim_info.lines[vim_info.active_line].block_id;

  beginBusy();
  const previousMode = vim_info.mode;
  vim_info.mode = "insert";
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      keyCode: 9,
      which: 9,
      shiftKey: outdent,
      bubbles: true,
      cancelable: true,
    }),
  );
  setTimeout(() => {
    vim_info.mode = previousMode;
    refreshLines();
    // Notion may re-render the block; find it again by its id.
    let idx = vim_info.lines.findIndex((l) => l.element === element);
    if (idx === -1 && blockId) idx = vim_info.lines.findIndex((l) => l.block_id === blockId);
    if (idx !== -1) {
      const el = vim_info.lines[idx].element;
      vim_info.active_line = idx;
      setCursorPosition(el, Math.min(pos, Math.max(0, (el.textContent || "").length - 1)));
    } else {
      setActiveLine(vim_info.active_line);
    }
    updateInfoContainer();
    endBusy();
  }, 80);
};

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", ")": "(", "]": "[", "}": "{" };

/**
 * % : jump to the bracket matching the one under the cursor, or the first
 * bracket after it on the line (Vim). Searches the whole block, so it works
 * across the lines of a code block.
 */
export const jumpToMatchingBracket = () => {
  const { vim_info } = window;
  const cur = current();
  if (!cur) return;
  const { element, text } = cur;
  const pos = getCursorIndexInElement(element);
  const { end } = lineBoundsAt(text, pos);
  let at = pos;
  while (at < end && !PAIRS[text[at]]) at++;
  if (at >= end) return;
  const open = text[at];
  const close = PAIRS[open];
  const forward = "([{".includes(open);
  let depth = 0;
  for (let i = at; forward ? i < text.length : i >= 0; i += forward ? 1 : -1) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) {
        setCursorPosition(element, i);
        vim_info.desired_column = columnInLine(element, i);
        return;
      }
    }
  }
};
