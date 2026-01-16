/**
 * Motion change operators
 * Handles changing (delete + enter insert mode) text based on motion commands
 */

import { getCursorIndexInElement, setCursorPosition } from "../cursor";
import { isParagraphBoundary } from "../notion";
import { deleteNormalBlockWithKeyboardEvents } from "../core/dom-utils";

/**
 * Dependencies for motion change operators
 */
export interface MotionChangeDeps {
  refreshLines: () => void;
  updateInfoContainer: () => void;
  deleteToNextWord: () => void;
  deleteToEndOfLine: () => void;
  deleteToBeginningOfLine: () => void;
  deleteFindCharForward: (char: string) => void;
  deleteFindCharBackward: (char: string) => void;
  deleteTillCharForward: (char: string) => void;
  deleteTillCharBackward: (char: string) => void;
}

/**
 * Change current line (clear content and enter insert mode)
 */
export const createChangeCurrentLine =
  (deps: Pick<MotionChangeDeps, "updateInfoContainer">) => () => {
    const { updateInfoContainer } = deps;
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;

    currentElement.textContent = "";
    setCursorPosition(currentElement, 0);
    vim_info.desired_column = 0;
    vim_info.mode = "insert";
    updateInfoContainer();
  };

/**
 * Change to next word (delete to next word + enter insert mode)
 */
export const createChangeToNextWord =
  (deps: Pick<MotionChangeDeps, "deleteToNextWord" | "updateInfoContainer">) =>
  () => {
    const { deleteToNextWord, updateInfoContainer } = deps;
    deleteToNextWord();
    window.vim_info.mode = "insert";
    updateInfoContainer();
  };

/**
 * Change to end of line (delete to end + enter insert mode)
 */
export const createChangeToEndOfLine =
  (deps: Pick<MotionChangeDeps, "deleteToEndOfLine" | "updateInfoContainer">) =>
  () => {
    const { deleteToEndOfLine, updateInfoContainer } = deps;
    deleteToEndOfLine();
    window.vim_info.mode = "insert";
    updateInfoContainer();
  };

/**
 * Change to beginning of line (delete to beginning + enter insert mode)
 */
export const createChangeToBeginningOfLine =
  (
    deps: Pick<
      MotionChangeDeps,
      "deleteToBeginningOfLine" | "updateInfoContainer"
    >,
  ) =>
  () => {
    const { deleteToBeginningOfLine, updateInfoContainer } = deps;
    deleteToBeginningOfLine();
    window.vim_info.mode = "insert";
    updateInfoContainer();
  };

/**
 * Change to previous paragraph (delete to previous paragraph + enter insert mode)
 */
export const createChangeToPreviousParagraph =
  (deps: Pick<MotionChangeDeps, "refreshLines" | "updateInfoContainer">) =>
  () => {
    const { refreshLines, updateInfoContainer } = deps;
    const { vim_info } = window;
    const currentLine = vim_info.active_line;
    const currentElement = vim_info.lines[currentLine].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);

    // Find the target paragraph boundary
    let targetLine = currentLine;
    while (targetLine > 0 && isParagraphBoundary(targetLine)) {
      targetLine--;
    }
    while (targetLine > 0 && !isParagraphBoundary(targetLine - 1)) {
      targetLine--;
    }
    // Now targetLine is at the first line of the previous paragraph
    // Move up one more to land on the blank line above it (Vim behavior)
    // But only if there is a blank line above
    if (targetLine > 0 && isParagraphBoundary(targetLine - 1)) {
      targetLine--;
    }

    // Collect text for clipboard
    const lines: string[] = [];
    const currentText = currentElement.textContent || "";
    lines.push(currentText.slice(0, currentCursorPosition));
    for (let i = currentLine - 1; i >= targetLine; i--) {
      const lineText = vim_info.lines[i].element.textContent || "";
      lines.unshift(lineText);
    }
    const clipboardText = lines.join("\n");
    navigator.clipboard.writeText(clipboardText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    // If changing across multiple lines
    if (currentLine !== targetLine) {
      vim_info.mode = "insert";
      let currentDelay = 10;
      // Delete all lines between current and target
      for (let i = currentLine - 1; i >= targetLine; i--) {
        const element = vim_info.lines[i].element;
        deleteNormalBlockWithKeyboardEvents(element, currentDelay);
        currentDelay += 50;
      }
      // After deleting, clear current line from cursor backward and enter insert mode
      setTimeout(() => {
        const text = currentElement.textContent || "";
        const newText = text.slice(currentCursorPosition);
        currentElement.textContent = newText;
        setCursorPosition(currentElement, 0);
        vim_info.desired_column = 0;
        setTimeout(() => {
          refreshLines();
          updateInfoContainer();
        }, 50);
      }, currentDelay + 50);
    } else {
      // Same line - delete text and enter insert mode
      const text = currentElement.textContent || "";
      const newText = text.slice(currentCursorPosition);
      currentElement.textContent = newText;
      setCursorPosition(currentElement, 0);
      vim_info.desired_column = 0;
      vim_info.mode = "insert";
      updateInfoContainer();
    }
  };

/**
 * Change to next paragraph (delete to next paragraph + enter insert mode)
 */
export const createChangeToNextParagraph =
  (deps: Pick<MotionChangeDeps, "refreshLines" | "updateInfoContainer">) =>
  () => {
    const { refreshLines, updateInfoContainer } = deps;
    const { vim_info } = window;
    const currentLine = vim_info.active_line;
    const maxLine = vim_info.lines.length - 1;
    const currentElement = vim_info.lines[currentLine].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);

    // Find the target paragraph boundary
    let targetLine = currentLine;
    while (targetLine < maxLine && isParagraphBoundary(targetLine)) {
      targetLine++;
    }
    while (targetLine < maxLine && !isParagraphBoundary(targetLine + 1)) {
      targetLine++;
    }
    if (targetLine < maxLine) {
      targetLine++;
    }

    // Collect text for clipboard
    const lines: string[] = [];
    const currentText = currentElement.textContent || "";
    lines.push(currentText.slice(currentCursorPosition));
    for (let i = currentLine + 1; i <= targetLine; i++) {
      const lineText = vim_info.lines[i].element.textContent || "";
      lines.push(lineText);
    }
    const clipboardText = lines.join("\n");
    navigator.clipboard.writeText(clipboardText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    // If changing across multiple lines
    if (currentLine !== targetLine) {
      vim_info.mode = "insert";
      let currentDelay = 10;
      // Delete all lines between current and target
      for (let i = currentLine + 1; i <= targetLine; i++) {
        const element = vim_info.lines[i].element;
        deleteNormalBlockWithKeyboardEvents(element, currentDelay);
        currentDelay += 50;
      }
      // After deleting, clear current line from cursor forward and enter insert mode
      setTimeout(() => {
        const text = currentElement.textContent || "";
        const newText = text.slice(0, currentCursorPosition);
        currentElement.textContent = newText;
        setCursorPosition(currentElement, currentCursorPosition);
        vim_info.desired_column = currentCursorPosition;
        setTimeout(() => {
          refreshLines();
          updateInfoContainer();
        }, 50);
      }, currentDelay + 50);
    } else {
      // Same line - delete text from cursor to end and enter insert mode
      const text = currentElement.textContent || "";
      const newText = text.slice(0, currentCursorPosition);
      currentElement.textContent = newText;
      setCursorPosition(currentElement, currentCursorPosition);
      vim_info.desired_column = currentCursorPosition;
      vim_info.mode = "insert";
      updateInfoContainer();
    }
  };

/**
 * Change (find char forward) - delete to and including char, then enter insert mode
 */
export const createChangeFindCharForward =
  (
    deps: Pick<
      MotionChangeDeps,
      "deleteFindCharForward" | "updateInfoContainer"
    >,
  ) =>
  (char: string) => {
    const { deleteFindCharForward, updateInfoContainer } = deps;
    deleteFindCharForward(char);
    window.vim_info.mode = "insert";
    updateInfoContainer();
  };

/**
 * Change (find char backward) - delete from and including char, then enter insert mode
 */
export const createChangeFindCharBackward =
  (
    deps: Pick<
      MotionChangeDeps,
      "deleteFindCharBackward" | "updateInfoContainer"
    >,
  ) =>
  (char: string) => {
    const { deleteFindCharBackward, updateInfoContainer } = deps;
    deleteFindCharBackward(char);
    window.vim_info.mode = "insert";
    updateInfoContainer();
  };

/**
 * Change (till char forward) - delete till (not including) char, then enter insert mode
 */
export const createChangeTillCharForward =
  (
    deps: Pick<
      MotionChangeDeps,
      "deleteTillCharForward" | "updateInfoContainer"
    >,
  ) =>
  (char: string) => {
    const { deleteTillCharForward, updateInfoContainer } = deps;
    deleteTillCharForward(char);
    window.vim_info.mode = "insert";
    updateInfoContainer();
  };

/**
 * Change (till char backward) - delete from after char, then enter insert mode
 */
export const createChangeTillCharBackward =
  (
    deps: Pick<
      MotionChangeDeps,
      "deleteTillCharBackward" | "updateInfoContainer"
    >,
  ) =>
  (char: string) => {
    const { deleteTillCharBackward, updateInfoContainer } = deps;
    deleteTillCharBackward(char);
    window.vim_info.mode = "insert";
    updateInfoContainer();
  };
