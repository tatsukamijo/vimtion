/**
 * Info Container UI Module
 * Manages the Vim mode indicator displayed on screen
 */

import { updateBlockCursor } from "../cursor";

/**
 * Bridge: mirror a sanitized snapshot of vim_info to document.body.dataset
 * so test harnesses running in the page's MAIN world (e.g., Playwright's
 * page.evaluate) can read state. The content script's `window.vim_info`
 * lives in Chrome's ISOLATED world and is otherwise unreachable from there.
 *
 * Side-effect-only: never read by extension code. Guaranteed to be a primitive
 * JSON string — never includes element references or anything heavy.
 */
export const syncVimInfoToDOM = (): void => {
  const { vim_info } = window;
  if (!vim_info || !vim_info.lines) return;
  document.body.dataset.vimtionState = JSON.stringify({
    mode: vim_info.mode,
    active_line: vim_info.active_line,
    cursor_position: vim_info.cursor_position,
    lines_length: vim_info.lines.length,
    pending_operator: vim_info.pending_operator,
  });
};

/**
 * Get formatted mode text for display
 */
export const getModeText = (
  mode: "insert" | "normal" | "visual" | "visual-line" | "link-hint",
): string => {
  return `-- ${mode.toUpperCase()} --`;
};

/**
 * Create the info container DOM element on page load
 */
export const createInfoContainer = () => {
  const { vim_info } = window;
  const infoContainer = document.createElement("div");
  infoContainer.classList.add("vim-info-container");
  const mode = document.createElement("div");
  mode.innerText = getModeText(vim_info.mode);
  mode.classList.add("vim-mode");
  infoContainer.appendChild(mode);
  document.body.appendChild(infoContainer);
};

/**
 * Update info container to reflect current mode and position
 * Also updates body classes for cursor styling and refreshes block cursor
 */
export const updateInfoContainer = () => {
  const mode = document.querySelector(".vim-mode") as HTMLDivElement;
  const { vim_info } = window;
  mode.innerText = `${getModeText(vim_info.mode)} | Line ${vim_info.active_line + 1}/${vim_info.lines.length}`;

  // Update body class for cursor styling
  document.body.classList.remove(
    "vim-normal-mode",
    "vim-insert-mode",
    "vim-visual-mode",
    "vim-visual-line-mode",
  );

  if (vim_info.mode === "normal") {
    document.body.classList.add("vim-normal-mode");
  } else if (vim_info.mode === "visual") {
    document.body.classList.add("vim-visual-mode");
  } else if (vim_info.mode === "visual-line") {
    document.body.classList.add("vim-visual-line-mode");
  } else {
    document.body.classList.add("vim-insert-mode");
  }

  // Update block cursor position
  updateBlockCursor();

  // Mirror state to DOM dataset for test harness consumption.
  syncVimInfoToDOM();
};
