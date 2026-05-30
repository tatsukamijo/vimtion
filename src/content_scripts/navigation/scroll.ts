/**
 * Scroll and viewport navigation (Ctrl+d, Ctrl+u, Ctrl+f, Ctrl+b, gg, G)
 */

import { setCursorPosition } from "../cursor";
import { setActiveLine } from "../core/line-management";

export const findScrollableContainer = (): HTMLElement => {
  // The main content scroller is inside .notion-frame
  // We need to find the scroller that contains our editable elements
  const { vim_info } = window;

  // Get the current active element to find its scroll container
  const activeElement = vim_info.lines[vim_info.active_line]?.element;

  if (activeElement) {
    // Walk up the DOM tree to find the scrollable container
    let parent = activeElement.parentElement;
    while (parent) {
      if (
        parent.classList.contains("notion-scroller") &&
        parent.scrollHeight > parent.clientHeight
      ) {
        return parent;
      }
      parent = parent.parentElement;
    }
  }

  // Fallback: find .notion-scroller within .notion-frame (not in sidebar)
  const frame = document.querySelector(".notion-frame");
  if (frame) {
    const scroller = frame.querySelector(".notion-scroller") as HTMLElement;
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      return scroller;
    }
  }

  return document.documentElement;
};

// Reposition the viewport so the active line sits at a vertical anchor —
// implements Vim's `z` reposition family: "center" → zz, "start" → zt,
// "end" → zb. Uses scrollIntoView (the same mechanism the visual-line
// auto-nudge relies on) so it walks up to Notion's real scroll container.
// `behavior: "instant"` matches Vim's immediate reposition with no smooth lag.
export const scrollActiveLineTo = (
  block: "center" | "start" | "end",
): void => {
  const { vim_info } = window;
  const el = vim_info.lines[vim_info.active_line]?.element as
    | HTMLElement
    | undefined;
  if (!el || typeof el.scrollIntoView !== "function") return;
  el.scrollIntoView({ block, behavior: "instant" as ScrollBehavior });
};

// Scroll by a fraction of the viewport height
// Cursor position will be automatically updated by scroll event listener
export const scrollAndMoveCursor = (pageAmount: number) => {
  const scrollContainer = findScrollableContainer();
  const scrollAmount = window.innerHeight * pageAmount;
  const currentScroll =
    scrollContainer === document.documentElement
      ? window.scrollY
      : scrollContainer.scrollTop;
  const newScroll = Math.max(0, currentScroll + scrollAmount);

  // Perform instant scroll on the correct container
  if (scrollContainer === document.documentElement) {
    window.scrollTo({
      top: newScroll,
      behavior: "auto",
    });
  } else {
    scrollContainer.scrollTo({
      top: newScroll,
      behavior: "auto",
    });
  }
  // Note: Cursor position update is handled by scroll event listener
};

// Jump to top of document (gg)
// Note: Wraps updateInfoContainer function which is passed from vim.ts
export function createJumpToTop(updateInfoContainer: () => void) {
  return () => {
    const { vim_info } = window;
    const scrollContainer = findScrollableContainer();

    // Scroll to top
    if (scrollContainer === document.documentElement) {
      window.scrollTo({
        top: 0,
        behavior: "auto",
      });
    } else {
      scrollContainer.scrollTo({
        top: 0,
        behavior: "auto",
      });
    }

    // Explicitly set cursor to first line (don't rely on scroll event listener).
    // Route through setActiveLine so its wrapper-skip handles the case where
    // lines[0] is the page-title editor wrapper — without it, gg would set
    // active_line=0 (wrapper) while the DOM cursor lands on the H1 leaf.
    setTimeout(() => {
      vim_info.desired_column = 0;
      setActiveLine(0);
      updateInfoContainer();
    }, 10);
  };
}

// Jump to bottom of document (G)
// Note: Wraps refreshLines and updateInfoContainer functions which are passed from vim.ts
export function createJumpToBottom(
  refreshLines: () => void,
  updateInfoContainer: () => void,
) {
  return () => {
    const { vim_info } = window;
    const scrollContainer = findScrollableContainer();

    // Scroll to bottom
    const maxScroll =
      scrollContainer === document.documentElement
        ? document.documentElement.scrollHeight - window.innerHeight
        : scrollContainer.scrollHeight - scrollContainer.clientHeight;

    if (scrollContainer === document.documentElement) {
      window.scrollTo({
        top: maxScroll,
        behavior: "auto",
      });
    } else {
      scrollContainer.scrollTo({
        top: maxScroll,
        behavior: "auto",
      });
    }

    // Explicitly set cursor to last line (don't rely on scroll event listener)
    setTimeout(() => {
      refreshLines();
      const lastLine = vim_info.lines.length - 1;
      vim_info.active_line = lastLine;
      vim_info.desired_column = 0;

      const targetElement = vim_info.lines[lastLine]?.element;
      if (targetElement) {
        setCursorPosition(targetElement, 0);
        targetElement.focus({ preventScroll: true });
        updateInfoContainer();
      }
    }, 10);
  };
}
