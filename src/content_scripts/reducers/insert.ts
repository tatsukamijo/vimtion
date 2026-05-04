/**
 * Insert Mode Reducer
 *
 * Handles keyboard events in insert mode.
 * Insert mode delegates most editing to Notion's native editing but implements:
 * - Escape key to exit to normal mode
 * - "jk" sequence to exit to normal mode (Vim-style escape alternative)
 *
 * The jk-escape model is "commit-on-second-key": pressing `j` is suppressed
 * (preventDefault) and a timer is started; if `k` arrives before the timer
 * fires, we cancel the timer and switch to normal mode without ever
 * committing the `j` character. Any other key cancels the timer, inserts
 * the suppressed `j`, then lets the new key proceed normally. This removes
 * the typing-speed pressure of the previous insert-then-undo-on-k model
 * (which required `k` within ~200ms or the user saw `j` linger as text).
 */

export interface InsertReducerDeps {
  updateInfoContainer: () => void;
  JK_TIMEOUT_MS: number;
}

export const createInsertReducer = (deps: InsertReducerDeps) => {
  const { updateInfoContainer, JK_TIMEOUT_MS } = deps;

  // Closure-local pending-j state. When non-null, a suppressed `j`
  // keystroke is awaiting either a follow-up `k` (→ exit to normal) or
  // the timer firing (→ commit `j` as a literal character). Any other
  // key path cancels the timer and commits `j` first.
  let pendingJTimer: number | null = null;

  // Insert the suppressed `j` at the current caret. Skipped if the user
  // has already left insert mode (e.g. clicked elsewhere) so the orphan
  // doesn't land in an unrelated block.
  const commitPendingJ = (): void => {
    if (pendingJTimer === null) return;
    clearTimeout(pendingJTimer);
    pendingJTimer = null;
    if (window.vim_info.mode === "insert") {
      document.execCommand("insertText", false, "j");
    }
  };

  // Drop the suppressed `j` without committing — used when `k` arrives
  // (jk-escape) or Escape is pressed (user is exiting anyway).
  const cancelPendingJ = (): void => {
    if (pendingJTimer === null) return;
    clearTimeout(pendingJTimer);
    pendingJTimer = null;
  };

  return (e: KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        cancelPendingJ();
        window.vim_info.mode = "normal";
        updateInfoContainer();
        break;
      case "j":
        // If a previous `j` is still pending (user typed `jj`), commit
        // the first one before suppressing the second.
        if (pendingJTimer !== null) commitPendingJ();
        e.preventDefault();
        e.stopPropagation();
        pendingJTimer = window.setTimeout(() => {
          pendingJTimer = null;
          if (window.vim_info.mode === "insert") {
            document.execCommand("insertText", false, "j");
          }
        }, JK_TIMEOUT_MS);
        break;
      case "k":
        if (pendingJTimer !== null) {
          // jk-escape: cancel the suppressed `j` and exit to normal
          // without committing either character.
          e.preventDefault();
          e.stopPropagation();
          cancelPendingJ();
          window.vim_info.mode = "normal";
          updateInfoContainer();
        }
        // Otherwise let `k` insert normally.
        break;
      default:
        // Any other key while `j` is pending: commit `j` first so the
        // sequence shows up in document order, then let the new key
        // proceed through Notion's normal input pipeline.
        if (pendingJTimer !== null) commitPendingJ();
        break;
    }
    return;
  };
};
