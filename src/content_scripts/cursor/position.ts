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
 * Select characters [start, end) of `element` as the document selection,
 * spanning text-node / formatting boundaries correctly.
 * Returns false when the element has no text to select.
 */
export const selectCharRange = (
  element: Element,
  start: number,
  end: number,
): boolean => {
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
