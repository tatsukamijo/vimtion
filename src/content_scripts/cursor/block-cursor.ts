/**
 * Block cursor rendering for normal mode
 */

import { isInsideCodeBlock } from "../notion";

export const createBlockCursor = () => {
  const cursor = document.createElement("div");
  cursor.classList.add("vim-block-cursor");
  cursor.style.display = "none";
  document.body.appendChild(cursor);
  return cursor;
};

export const updateBlockCursor = () => {
  const { vim_info } = window;
  let blockCursor = document.querySelector(
    ".vim-block-cursor",
  ) as HTMLDivElement;

  if (!blockCursor) {
    blockCursor = createBlockCursor();
  }

  if (vim_info.mode !== "normal") {
    blockCursor.style.display = "none";
    return;
  }

  // Get current cursor position
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    blockCursor.style.display = "none";
    return;
  }

  const range = selection.getRangeAt(0);
  let rect = range.getBoundingClientRect();

  // For empty lines or lines with only newline, we need special handling
  if (rect.width === 0 && rect.height === 0) {
    const currentElement = vim_info.lines[vim_info.active_line]?.element;
    if (!currentElement) {
      blockCursor.style.display = "none";
      return;
    }

    // Check if inside a code block
    const inCodeBlock = isInsideCodeBlock(currentElement);

    if (inCodeBlock) {
      // Try a non-mutating measurement first: span an adjacent character's
      // range. For an interior caret (offset > 0 or offset < length), one
      // of the neighbour spans gives a real rect we can position from. This
      // avoids the zws round-trip below \u2014 Notion's PrismJS-based code-block
      // highlighter cascades childList mutations on every text change, so a
      // refresh-driven re-entry through this function would loop on any
      // 0/0 caret position.
      try {
        if (
          range.startContainer &&
          range.startContainer.nodeType === Node.TEXT_NODE
        ) {
          const textNode = range.startContainer as Text;
          const offset = range.startOffset;
          const textLen = textNode.textContent?.length ?? 0;

          let neighbourRect: DOMRect | null = null;
          let useTrailingEdge = false;
          if (offset > 0) {
            const r = document.createRange();
            r.setStart(textNode, offset - 1);
            r.setEnd(textNode, offset);
            const rr = r.getBoundingClientRect();
            if (rr.height > 0) {
              neighbourRect = rr;
              useTrailingEdge = true;
            }
          }
          if (!neighbourRect && offset < textLen) {
            const r = document.createRange();
            r.setStart(textNode, offset);
            r.setEnd(textNode, offset + 1);
            const rr = r.getBoundingClientRect();
            if (rr.height > 0) {
              neighbourRect = rr;
            }
          }

          if (neighbourRect) {
            const left = useTrailingEdge
              ? neighbourRect.right
              : neighbourRect.left;
            blockCursor.style.display = "block";
            blockCursor.style.left = `${left + window.scrollX}px`;
            blockCursor.style.top = `${neighbourRect.top + window.scrollY}px`;
            blockCursor.style.height = `${neighbourRect.height}px`;
            return;
          }
        }
      } catch (e) {
        // Fall through to zws / elementRect handling
      }

      // Empty code-block line \u2014 temporarily insert a zero-width space to
      // get a measurable rect. Reachable only when the leaf has no
      // characters around the caret, so PrismJS has nothing to recompute
      // and the mutation cascade that would loop here doesn't fire.
      try {
        if (
          range.startContainer &&
          range.startContainer.nodeType === Node.TEXT_NODE
        ) {
          const textNode = range.startContainer as Text;
          const offset = range.startOffset;

          // Insert a zero-width space temporarily
          const zws = "\u200B";
          const originalText = textNode.textContent || "";
          textNode.textContent =
            originalText.slice(0, offset) + zws + originalText.slice(offset);

          // Create a range around the zero-width space
          const tempRange = document.createRange();
          tempRange.setStart(textNode, offset);
          tempRange.setEnd(textNode, offset + 1);

          const tempRect = tempRange.getBoundingClientRect();

          // Remove the zero-width space
          textNode.textContent = originalText;

          // Restore the selection
          range.setStart(textNode, offset);
          range.setEnd(textNode, offset);

          // If we got a valid rect, use it
          if (tempRect.height > 0) {
            blockCursor.style.display = "block";
            blockCursor.style.left = `${tempRect.left + window.scrollX}px`;
            blockCursor.style.top = `${tempRect.top + window.scrollY}px`;
            blockCursor.style.height = `${tempRect.height}px`;
            return;
          }
        }
      } catch (e) {
        // Fall through to default handling
      }
    }

    // Default: use element rect (for normal blocks or if code block handling failed)
    const elementRect = currentElement.getBoundingClientRect();
    blockCursor.style.display = "block";
    blockCursor.style.left = `${elementRect.left + window.scrollX}px`;
    blockCursor.style.top = `${elementRect.top + window.scrollY}px`;
    blockCursor.style.height = `${elementRect.height || 20}px`;
    return;
  }

  // Position the block cursor
  blockCursor.style.display = "block";
  blockCursor.style.left = `${rect.left + window.scrollX}px`;
  blockCursor.style.top = `${rect.top + window.scrollY}px`;
  blockCursor.style.height = `${rect.height || 20}px`;
};
