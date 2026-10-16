/**
 * Cursor position management
 * Functions for getting and setting cursor position within elements
 */

import { updateBlockCursor } from "./block-cursor";

/**
 * Get the cursor index within the active element
 */
export const getCursorIndex = () => {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }

  const range = selection.getRangeAt(0);
  let i = 0;

  const checkElementNode = (element: Element) => {
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (checkElementNode(node as Element)) {
          break;
        } else {
          continue;
        }
      }
      if (node.isSameNode(range.startContainer)) {
        i += range.startOffset;
        return true;
      }
      i += node.textContent.length;
    }
    return false;
  };

  checkElementNode(document.activeElement);
  return i;
};

/**
 * Get the cursor index within a specific element
 *
 * Counts the characters between the start of `element` and the selection
 * start with a Range, so it is correct however the selection is anchored:
 * on a text node, or on an element (e.g. `(leaf, 0)`, which is where Notion
 * leaves the caret after execCommand("cut")). Walking only text nodes used to
 * miss element anchors and report the full line length instead.
 */
export const getCursorIndexInElement = (element: Element): number => {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) {
    // Selection is outside this element: keep the historical fallback.
    return element.textContent?.length || 0;
  }

  const prefix = document.createRange();
  prefix.selectNodeContents(element);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString().length;
};

/**
 * Resolve a character index inside `element` to a (text node, offset) pair.
 *
 * At a boundary between two text nodes (e.g. plain text followed by a bold
 * span, or two syntax-highlight tokens) the index is both "end of the previous
 * node" and "start of the next one". `preferNext` picks the node that holds
 * the character AT `index` — what a range start needs — while the default
 * picks the end of the previous node — what a range end needs.
 */
export const resolveTextPosition = (
  element: Element,
  index: number,
  preferNext = false,
): { node: Text; offset: number } | null => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let i = 0;
  let last: Text | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.data.length;
    if (preferNext ? index < i + len : index <= i + len) {
      return { node, offset: index - i };
    }
    i += len;
    last = node;
    node = walker.nextNode() as Text | null;
  }
  return last ? { node: last, offset: last.data.length } : null;
};

/**
 * Bounds [start, end) of the user-perceived character (grapheme) at `pos`.
 * Columns are UTF-16 offsets, so an emoji spans 2+ of them. A cursor or range
 * edge inside one splits a surrogate pair, and Notion's cut handler then cuts
 * the whole block. Every caret placement and edited range snaps to these.
 */
const graphemeSegmenter = (Intl as any).Segmenter
  ? new (Intl as any).Segmenter(undefined, { granularity: "grapheme" })
  : null;

export const charBoundsAt = (
  text: string,
  pos: number,
): { start: number; end: number } => {
  if (pos >= text.length) return { start: text.length, end: text.length };
  if (graphemeSegmenter) {
    // Segment a small window around pos: clusters are short.
    const from = Math.max(0, pos - 32);
    const chunk = text.slice(from, pos + 32);
    const segs: { index: number; segment: string }[] = Array.from(
      graphemeSegmenter.segment(chunk),
    );
    for (let k = 0; k < segs.length; k++) {
      const start = from + segs[k].index;
      const end = start + segs[k].segment.length;
      if (pos < end) return { start, end };
    }
  }
  const code = (i: number) => text.charCodeAt(i);
  const isHigh = (i: number) => code(i) >= 0xd800 && code(i) <= 0xdbff;
  const isLow = (i: number) => code(i) >= 0xdc00 && code(i) <= 0xdfff;
  const start = pos > 0 && isLow(pos) && isHigh(pos - 1) ? pos - 1 : pos;
  const end = isHigh(start) && isLow(start + 1) ? start + 2 : start + 1;
  return { start, end };
};

/** Snap a range [start, end) outward to whole characters. */
const snapRange = (element: Element, start: number, end: number) => {
  const text = element.textContent || "";
  const s = charBoundsAt(text, start).start;
  const e = end > s && end < text.length ? charBoundsAt(text, end - 1).end : end;
  return { start: s, end: Math.max(e, end) };
};

/**
 * Select characters [start, end) of `element` as the document selection,
 * spanning text-node / formatting boundaries correctly.
 * Returns false when the element has no text to select.
 */
export const selectCharRange = (
  element: Element,
  start: number,
  end: number,
): boolean => {
  ({ start, end } = snapRange(element, start, end));
  const from = resolveTextPosition(element, start, true);
  const to = resolveTextPosition(element, end, false);
  if (!from || !to) return false;
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const selection = window.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
};

/**
 * Delete characters [start, end) of `element` through the browser's editing
 * pipeline (selection + execCommand("delete")), so Notion records the edit:
 * it persists, is undoable, and keeps formatting / syntax highlighting.
 * Assigning element.textContent does none of that — inside code blocks the
 * change was DOM-only and reverted on reload.
 * Returns true if something was deleted.
 */
export const deleteCharRange = (
  element: Element,
  start: number,
  end: number,
): boolean => {
  if (end <= start) return false;
  if (!selectCharRange(element, start, end)) return false;
  return document.execCommand("delete");
};

/**
 * Bounds [start, end) of the logical line containing `pos`, excluding its
 * "\n". For a normal block that is the whole block; inside a code block (or
 * a block with soft line breaks) it is the current "\n"-delimited line.
 */
export const lineBoundsAt = (
  text: string,
  pos: number,
): { start: number; end: number } => {
  const start = pos > 0 ? text.lastIndexOf("\n", pos - 1) + 1 : 0;
  const nl = text.indexOf("\n", pos);
  return { start, end: nl === -1 ? text.length : nl };
};

/**
 * Column of absolute offset `pos` within its logical line: `pos` itself for
 * normal blocks, the offset from the code line's start inside a code block.
 * desired_column holds this value in normal mode (j/k re-apply it per line).
 */
export const columnInLine = (element: Element, pos: number): number =>
  pos - lineBoundsAt(element.textContent || "", pos).start;

/**
 * Cut characters [start, end) to the clipboard (Vim's d / x yank).
 * Outside code blocks this is execCommand("cut") on the range, which keeps
 * rich formatting on the clipboard. Inside a code block Notion turns any cut
 * into "cut the whole code block", so write the text ourselves and delete the
 * range through the editing pipeline instead.
 */
export const cutCharRange = (
  element: Element,
  start: number,
  end: number,
): boolean => {
  if (end <= start) return false;
  if (element.closest(".notion-code-block")) {
    const text = element.textContent || "";
    navigator.clipboard.writeText(text.slice(start, end)).catch(() => {});
    return deleteCharRange(element, start, end);
  }
  if (!selectCharRange(element, start, end)) return false;
  return document.execCommand("cut");
};

/**
 * Set cursor position within an element
 */
export const setCursorPosition = (element: Element, index: number) => {
  // Never rest inside a multi-unit character (emoji): snap to its start.
  index = charBoundsAt(element.textContent || "", index).start;
  // Any caret placement Vimtion makes (h/l/w/x in the line, or G / paragraph
  // motions that set the caret directly on another line) becomes the position
  // to protect, so the guard never reverts Vimtion's own moves. The guard
  // window still counts from the last navigation.
  if (navGuard) {
    navGuard = { element, offset: index, at: navGuard.at };
  }
  const childNodes = Array.from(element.childNodes);

  // Handle empty elements (no child nodes or only empty text)
  if (childNodes.length === 0 || (element.textContent?.length || 0) === 0) {
    const range = document.createRange();
    const selection = window.getSelection();

    // Select the element itself for empty lines
    range.selectNodeContents(element);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    updateBlockCursor();
    return;
  }

  let i = 0;
  for (const node of childNodes) {
    const nodeLength = node.textContent?.length || 0;
    const isInRange = index >= i && index <= i + nodeLength;
    if (isInRange && node.nodeType === Node.ELEMENT_NODE) {
      setCursorPosition(node as Element, index - i);
      break;
    }
    if (isInRange) {
      const range = document.createRange();
      const selection = window.getSelection();

      // Clamp the offset to be within the node's length
      const offset = Math.min(index - i, nodeLength);
      range.setStart(node, offset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      updateBlockCursor();
      break;
    }
    i += nodeLength;
  }
};

// ---------------------------------------------------------------------------
// Navigation guard
// ---------------------------------------------------------------------------
// Vimtion follows the DOM selection (reconcileFromSelection on selectionchange,
// the selection tier of refreshLines) to notice caret moves it did not make.
// But right after a Vimtion navigation Notion often moves the caret again,
// asynchronously: its click handling in table cells puts it back in the
// previous cell, leaving a code block it jumps to the block after it (or to
// column 0), and during held-key repeat a late selectionchange reports an
// older line. Following those undid the motion just made (tables moved every
// other press, k out of a code block landed below it, held j dropped presses).
// So remember where the last navigation put the caret; for a short window a
// selection elsewhere — with no mouse press since — is stray: put it back.
let navGuard: { element: Element; offset: number; at: number } | null = null;
let lastMouseDownAt = 0;
let lastUserScrollAt = 0;
document.addEventListener(
  "mousedown",
  () => {
    lastMouseDownAt = Date.now();
  },
  true,
);
// Wheel / touch scrolls are the user's, never Notion catching up with the caret.
const noteUserScroll = () => {
  lastUserScrollAt = Date.now();
};
document.addEventListener("wheel", noteUserScroll, { capture: true, passive: true });
document.addEventListener("touchmove", noteUserScroll, { capture: true, passive: true });
const NAV_GUARD_MS = 400;

/** Record a caret placement made by a Vimtion navigation (j/k/gg/G...). */
export const markNavigation = (element: Element, offset: number): void => {
  navGuard = { element, offset, at: Date.now() };
};

/** Forget the guard (undo/redo: Notion's caret placement is the truth). */
export const clearNavigationGuard = (): void => {
  navGuard = null;
};

/**
 * ms since the last guarded navigation (Infinity if none / cleared, or if the
 * user has scrolled by wheel/touch since — that scroll is theirs to keep).
 */
export const msSinceNavigation = (): number => {
  if (!navGuard || lastUserScrollAt >= navGuard.at) return Infinity;
  return Date.now() - navGuard.at;
};

/**
 * True when the selection (leaf, and optionally offset within it) is not where
 * the last navigation put the caret, within the guard window, in normal mode,
 * with no mouse press since — i.e. Notion's async shuffle, not user intent.
 */
export const isStrayCaret = (leaf: Element | null, offset?: number): boolean => {
  if (!navGuard || !leaf) return false;
  if (window.vim_info.mode !== "normal") return false;
  if (Date.now() - navGuard.at > NAV_GUARD_MS) return false;
  if (lastMouseDownAt >= navGuard.at) return false;
  if (!navGuard.element.isConnected) return false;
  if (leaf !== navGuard.element && !navGuard.element.contains(leaf)) return true;
  return offset !== undefined && offset !== navGuard.offset;
};

/** Put the caret back where the last navigation placed it. */
export const reassertNavigation = (): void => {
  if (navGuard) setCursorPosition(navGuard.element, navGuard.offset);
};
