/**
 * Vimtion - Vim keybindings for Notion
 *
 * Copyright (c) 2024 Tatsuya Kamijo
 * Copyright (c) 2020 Luke Ingalls
 *
 * Licensed under ISC License
 * See LICENSE file for details
 */

// Import types and state
import type { VimtionSettings, VimLine, LinkHint } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import {
  currentSettings,
  updateCurrentSettings,
  linkSelectionMode,
  availableLinks,
  selectedLinkIndex,
  setLinkSelectionMode,
  setAvailableLinks,
  setSelectedLinkIndex,
  resetLinkSelection,
  lastInsertKey,
  lastInsertKeyTime,
  JK_TIMEOUT_MS,
  setLastInsertKey,
  setLastInsertKeyTime,
  initVimInfo,
} from "./state";

// Import settings functions
import { loadSettings, applySettings, hexToRgba, adjustColor } from "./settings";

// Import text object functions
import { getInnerWordBounds, getAroundWordBounds } from "./text-objects/word";
import { findMatchingQuotes, findMatchingBrackets } from "./text-objects/bracket";

// Import Notion helpers
import {
  isInsideCodeBlock,
  getCodeBlockLines,
  isParagraphBoundary,
  disableNotionUnsavedWarning,
  restoreNotionUnsavedWarning,
  setupBeforeUnloadHandler,
} from "./notion";

// Import cursor functions
import {
  getCursorIndex,
  getCursorIndexInElement,
  setCursorPosition,
  createBlockCursor,
  updateBlockCursor,
  saveCursorPosition,
  restoreCursorPosition,
} from "./cursor";

// Import navigation functions
import {
  moveCursorBackwards,
  moveCursorForwards,
  jumpToLineStart,
  jumpToLineEnd,
  jumpToNextWord,
  jumpToPreviousWord,
  jumpToEndOfWord,
  jumpToEndOfWORD,
  jumpToNextWORD,
  jumpToPreviousWORD,
  jumpToPreviousParagraph,
  jumpToNextParagraph,
  moveCursorDownInCodeBlock,
  moveCursorUpInCodeBlock,
  moveCursorBackwardsInCodeBlock,
  moveCursorForwardsInCodeBlock,
  openLineBelowInCodeBlock,
  openLineAboveInCodeBlock,
  findScrollableContainer,
  scrollAndMoveCursor,
  createJumpToTop,
  createJumpToBottom,
  findCharForward,
  findCharBackward,
  tillCharForward,
  tillCharBackward,
} from "./navigation";

// Import operator helpers and factories
import {
  getInnerParagraphBounds,
  getAroundParagraphBounds,
  createParagraphOperators,
  createWordOperators,
  createBracketOperators,
  createYankCurrentLine,
  createYankToNextWord,
  createYankToEndOfLine,
  createYankToBeginningOfLine,
  createYankToPreviousParagraph,
  createYankToNextParagraph,
} from "./operators";
import type { OperatorDeps } from "./operators";

// Import UI functions
import { createInfoContainer, getModeText, updateInfoContainer } from "./ui/info-container";

// Import link utilities
import {
  highlightSelectedLink,
  clearAllLinkHighlights,
  exitLinkSelectionMode,
  enterLinkHintMode,
  removeAllHintOverlays,
  filterHintsByInput,
  navigateToLink,
  detectAllLinks,
  generateHints,
} from "./links";

// Import core utilities
import {
  clearAllBackgroundColors,
  deleteNormalBlockWithKeyboardEvents,
  deleteCodeBlockWithKeyboardEvents,
  setActiveLine,
  createRefreshLines,
  createSetLines,
} from "./core";

// Get the block type of an element from its closest [data-block-id] ancestor
const getBlockType = (element: HTMLElement): string => {
  const blockElement = element.closest("[data-block-id]");
  if (!blockElement) return "text";

  const className = blockElement.className;

  // Check for each block type
  if (className.includes("notion-header-block")) return "header";
  if (className.includes("notion-sub_header-block")) return "sub_header";
  if (className.includes("notion-sub_sub_header-block"))
    return "sub_sub_header";
  if (className.includes("notion-code-block")) return "code";
  if (className.includes("notion-quote-block")) return "quote";
  if (className.includes("notion-callout-block")) return "callout";
  if (className.includes("notion-bulleted_list-block")) return "bulleted_list";
  if (className.includes("notion-numbered_list-block")) return "numbered_list";
  if (className.includes("notion-to_do-block")) return "to_do";
  if (className.includes("notion-page-block")) return "page";

  return "text"; // Default to text block
};

// Paragraph operators (yank/delete/change × inner/around paragraph) now created via factory below
// This ensures they have access to updateInfoContainer, refreshLines, and setActiveLine

// Visual select inner paragraph
const visualSelectInnerParagraph = (): void => {
  const bounds = getInnerParagraphBounds();
  if (!bounds) {
    return;
  }

  const { vim_info } = window;
  const { startLine, endLine } = bounds;

  // Switch to visual line mode for paragraph selection
  vim_info.mode = "visual-line";
  vim_info.visual_start_line = startLine;
  vim_info.active_line = endLine;

  updateVisualLineSelection();
  updateInfoContainer();
};

// Visual select around paragraph
const visualSelectAroundParagraph = (): void => {
  const bounds = getAroundParagraphBounds();
  if (!bounds) {
    return;
  }

  const { vim_info } = window;
  const { startLine, endLine } = bounds;

  // Switch to visual line mode for paragraph selection
  vim_info.mode = "visual-line";
  vim_info.visual_start_line = startLine;
  vim_info.active_line = endLine;

  updateVisualLineSelection();
  updateInfoContainer();
};

const insertAtLineEnd = () => {
  jumpToLineEnd();
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const insertAtLineStart = () => {
  jumpToLineStart();
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const openLineBelow = () => {
  const { vim_info } = window;

  // Move to end of current line
  jumpToLineEnd();

  // Switch to insert mode first
  vim_info.mode = "insert";
  updateInfoContainer();

  // Then simulate Enter key (in insert mode, so it won't be blocked)
  setTimeout(() => {
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    currentElement.dispatchEvent(enterEvent);

    // Wait for new line to be created, then refresh
    setTimeout(() => {
      refreshLines();
    }, 100);
  }, 0);
};

const openLineAbove = () => {
  const { vim_info } = window;
  const currentLine = vim_info.active_line;

  // Move to beginning of current line
  jumpToLineStart();

  // Switch to insert mode first
  vim_info.mode = "insert";
  updateInfoContainer();

  // Simulate Enter key
  setTimeout(() => {
    const currentElement = vim_info.lines[currentLine].element;
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    currentElement.dispatchEvent(enterEvent);

    // After Enter, cursor is on the new line below
    // We need to move the cursor back up to the empty line we just created
    setTimeout(() => {
      const arrowUpEvent = new KeyboardEvent("keydown", {
        key: "ArrowUp",
        code: "ArrowUp",
        keyCode: 38,
        which: 38,
        bubbles: true,
        cancelable: true,
      });
      document.activeElement?.dispatchEvent(arrowUpEvent);

      // Wait for arrow up to take effect, then refresh
      setTimeout(() => {
        refreshLines();
      }, 50);
    }, 50);
  }, 0);
};

const insertAfterCursor = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const lineLength = currentElement.textContent?.length || 0;

  // Move cursor one position forward (unless at end of line)
  if (currentCursorPosition < lineLength) {
    setCursorPosition(currentElement, currentCursorPosition + 1);
    vim_info.desired_column = currentCursorPosition + 1;
  }

  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const deleteCharacter = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // Don't delete if at end of line
  if (currentCursorPosition >= text.length) return;

  // Select the character at cursor position
  setCursorPosition(currentElement, currentCursorPosition);
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    r.setStart(r.startContainer, r.startOffset);
    r.setEnd(r.startContainer, r.startOffset + 1);
    sel.removeAllRanges();
    sel.addRange(r);

    // Cut to clipboard like vim's 'x' command
    document.execCommand("cut");
  }

  vim_info.desired_column = currentCursorPosition;
};

const deleteCharacterBefore = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // Don't delete if at beginning of line
  if (currentCursorPosition <= 0) return;

  // Delete the character before cursor position
  const newText =
    text.slice(0, currentCursorPosition - 1) +
    text.slice(currentCursorPosition);
  currentElement.textContent = newText;

  // Move cursor back one position
  const newCursorPosition = currentCursorPosition - 1;
  setCursorPosition(currentElement, newCursorPosition);
  vim_info.desired_column = newCursorPosition;
};

const substituteCharacter = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // Don't substitute if at end of line
  if (currentCursorPosition >= text.length) {
    // Just enter insert mode at end of line
    window.vim_info.mode = "insert";
    updateInfoContainer();
    return;
  }

  // Select the character at cursor position
  setCursorPosition(currentElement, currentCursorPosition);
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    r.setStart(r.startContainer, r.startOffset);
    r.setEnd(r.startContainer, r.startOffset + 1);
    sel.removeAllRanges();
    sel.addRange(r);

    // Delete the selection using execCommand
    document.execCommand("delete");
  }

  // Keep cursor at same position and enter insert mode
  vim_info.desired_column = currentCursorPosition;

  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const getActiveLine = () => {
  return window.vim_info.active_line;
};

const getLines = () => {
  return window.vim_info.lines;
};

const handleClick = (e: MouseEvent) => {
  const { vim_info } = window;

  // Only handle clicks in normal mode
  if (vim_info.mode !== "normal") {
    return;
  }

  // Find which line was clicked
  const target = e.target as HTMLElement;
  const clickedElement = target.closest(
    '[contenteditable="true"]',
  ) as HTMLDivElement;

  if (!clickedElement) {
    return;
  }

  // Find the line index
  const lineIndex = vim_info.lines.findIndex(
    (line: any) => line.element === clickedElement,
  );

  if (lineIndex === -1) {
    return;
  }

  // Let the browser handle the click to position the cursor, then update our state
  setTimeout(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      // Get cursor position in the element
      let cursorPos = 0;
      const walker = document.createTreeWalker(
        clickedElement,
        NodeFilter.SHOW_TEXT,
        null,
      );

      let node;
      let found = false;
      while ((node = walker.nextNode())) {
        if (node === range.startContainer) {
          cursorPos += range.startOffset;
          found = true;
          break;
        }
        cursorPos += node.textContent?.length || 0;
      }

      if (found) {
        // Update active line without moving cursor
        vim_info.active_line = lineIndex;
        vim_info.desired_column = cursorPos;
        updateBlockCursor();
      }
    }
  }, 0);
};

const handleKeydown = (e: KeyboardEvent) => {
  const { vim_info } = window;

  if (vim_info.mode === "normal") {
    // Let normalReducer decide if this key should be handled
    const handled = normalReducer(e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  } else if (vim_info.mode === "visual") {
    const handled = visualReducer(e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  } else if (vim_info.mode === "visual-line") {
    const handled = visualLineReducer(e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  } else if (vim_info.mode === "link-hint") {
    const handled = linkHintReducer(e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  } else {
    insertReducer(e);
  }
};

// initVimInfo and jk escape tracking now imported from state module

const insertReducer = (e: KeyboardEvent) => {
  const now = Date.now();

  switch (e.key) {
    case "Escape":
      e.preventDefault();
      e.stopPropagation();
      window.vim_info.mode = "normal";
      updateInfoContainer();
      setLastInsertKey(null);
      break;
    case "j":
      // Track 'j' press
      setLastInsertKey("j");
      setLastInsertKeyTime(now);
      break;
    case "k":
      // Check if 'k' follows 'j' within timeout
      if (lastInsertKey === "j" && now - lastInsertKeyTime < JK_TIMEOUT_MS) {
        e.preventDefault();
        e.stopPropagation();

        // Delete the 'j' character that was just typed
        const currentElement =
          window.vim_info.lines[window.vim_info.active_line]?.element;
        if (currentElement) {
          const selection = window.getSelection();
          const range = document.createRange();

          // Get current cursor position
          const cursorPos = getCursorIndexInElement(currentElement);

          // Create a range that selects the 'j' character (one character back)
          const walker = document.createTreeWalker(
            currentElement,
            NodeFilter.SHOW_TEXT,
            null,
          );

          let currentNode: Text | null = null;
          let currentOffset = 0;

          while ((currentNode = walker.nextNode() as Text | null)) {
            const nodeLength = currentNode.length;
            const nodeEnd = currentOffset + nodeLength;

            // Check if the position for 'j' (cursorPos - 1) falls within this node
            if (cursorPos - 1 >= currentOffset && cursorPos - 1 < nodeEnd) {
              const offsetInNode = cursorPos - 1 - currentOffset;
              range.setStart(currentNode, offsetInNode);
              range.setEnd(currentNode, offsetInNode + 1);
              range.deleteContents();
              break;
            }

            currentOffset = nodeEnd;
          }
        }

        // Switch to normal mode
        window.vim_info.mode = "normal";
        updateInfoContainer();
        setLastInsertKey(null);
      } else {
        setLastInsertKey("k");
        setLastInsertKeyTime(now);
      }
      break;
    default:
      // Reset tracking on any other key
      setLastInsertKey(null);
      break;
  }
  return;
};

const linkHintReducer = (e: KeyboardEvent): boolean => {
  const { vim_info } = window;

  switch (e.key) {
    case "Escape":
      // Exit link-hint mode and return to normal mode
      removeAllHintOverlays();
      vim_info.mode = "normal";
      updateInfoContainer();
      return true;

    default:
      // Handle character input for filtering hints
      const key = e.key.toLowerCase();
      if (key.length === 1 && /[a-z]/.test(key)) {
        vim_info.link_hint_input += key;
        filterHintsByInput(vim_info.link_hint_input, e.shiftKey, updateInfoContainer);
        return true;
      }
      return false;
  }
};

const startVisualMode = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);

  vim_info.mode = "visual";
  vim_info.visual_start_line = vim_info.active_line;
  vim_info.visual_start_pos = currentCursorPosition;

  updateInfoContainer();
};

// clearAllBackgroundColors now imported from core module

const startVisualLineMode = () => {
  const { vim_info } = window;

  vim_info.mode = "visual-line";
  vim_info.visual_start_line = vim_info.active_line;

  // For code blocks, save the cursor position within the element
  const currentElement = vim_info.lines[vim_info.active_line].element;
  if (isInsideCodeBlock(currentElement)) {
    vim_info.visual_start_pos = getCursorIndexInElement(currentElement);
  } else {
    vim_info.visual_start_pos = 0; // Not used in line mode for normal blocks
  }

  updateVisualLineSelection();
  updateInfoContainer();
};

// Notion warning functions and beforeunload handler now imported from notion module
// Setup beforeunload handler
setupBeforeUnloadHandler();

const updateVisualLineSelection = () => {
  const { vim_info } = window;

  if (vim_info.mode !== "visual-line") return;

  // First, clear any previous highlights from all elements
  clearAllBackgroundColors();

  const selection = window.getSelection();
  const range = document.createRange();

  const startLine = vim_info.visual_start_line;
  const endLine = vim_info.active_line;

  // Determine the range of lines to select
  const [firstLine, lastLine] =
    startLine <= endLine ? [startLine, endLine] : [endLine, startLine];

  // Check if we're in a code block
  const firstElement = vim_info.lines[firstLine].element;
  const inCodeBlock = isInsideCodeBlock(firstElement);

  if (inCodeBlock && firstLine === lastLine) {
    // Special handling for code blocks: select lines from visual_start_pos to current cursor position
    const currentElement = firstElement;
    const text = currentElement.textContent || "";
    const startPos = vim_info.visual_start_pos;
    // Get current cursor position and save it to visual_end_pos
    const endPos = getCursorIndexInElement(currentElement);
    vim_info.visual_end_pos = endPos;

    // Determine the range of positions to select
    const [selStart, selEnd] =
      startPos <= endPos ? [startPos, endPos] : [endPos, startPos];

    // Find the line boundaries for the start position
    let lineStart = text.lastIndexOf("\n", selStart - 1);
    lineStart = lineStart === -1 ? 0 : lineStart + 1;

    // Find the line boundaries for the end position
    let lineEnd = text.indexOf("\n", selEnd);
    if (lineEnd === -1) lineEnd = text.length;

    // Don't set background color for code blocks - we'll rely on the selection highlight only
    // (setting backgroundColor would highlight the entire code block element)

    // Use TreeWalker to find the correct text nodes and positions
    // This handles the case where text is split across multiple nodes
    const walker = document.createTreeWalker(
      currentElement,
      NodeFilter.SHOW_TEXT,
      null,
    );

    let currentNode: Text | null = null;
    let currentOffset = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    // Walk through all text nodes to find the positions
    while ((currentNode = walker.nextNode() as Text | null)) {
      const nodeLength = currentNode.length;
      const nodeEnd = currentOffset + nodeLength;

      // Check if lineStart falls within this node
      if (!startNode && lineStart >= currentOffset && lineStart <= nodeEnd) {
        startNode = currentNode;
        startOffset = lineStart - currentOffset;
      }

      // Check if lineEnd falls within this node
      if (!endNode && lineEnd >= currentOffset && lineEnd <= nodeEnd) {
        endNode = currentNode;
        endOffset = lineEnd - currentOffset;
      }

      currentOffset = nodeEnd;

      if (startNode && endNode) break;
    }

    if (startNode && endNode) {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
    } else {
      return; // Don't try to add an invalid range
    }
  } else {
    // Normal handling for regular blocks
    // Highlight all lines in range
    const bgColor = hexToRgba(currentSettings.visualHighlightColor, 0.3);
    for (let i = firstLine; i <= lastLine; i++) {
      const element = vim_info.lines[i].element;
      element.style.backgroundColor = bgColor;
    }

    // Set range to cover all lines from first to last
    const lastElement = vim_info.lines[lastLine].element;

    // For empty lines, we need to select the element itself to show background
    // Check if elements have content
    const firstHasContent = firstElement.childNodes.length > 0;
    const lastHasContent = lastElement.childNodes.length > 0;

    if (firstHasContent && lastHasContent) {
      // Both have content: select from start of first to end of last
      range.setStartBefore(firstElement.firstChild!);
      range.setEndAfter(lastElement.lastChild!);
    } else if (!firstHasContent && !lastHasContent) {
      // Both empty: select the elements themselves
      range.setStart(firstElement, 0);
      range.setEnd(lastElement, 0);
    } else if (!firstHasContent) {
      // First is empty: select first element and content of last
      range.setStart(firstElement, 0);
      range.setEndAfter(lastElement.lastChild!);
    } else {
      // Last is empty: select content of first and last element
      range.setStartBefore(firstElement.firstChild!);
      range.setEnd(lastElement, 0);
    }
  }

  selection?.removeAllRanges();
  selection?.addRange(range);
};

// Helper function to set range in an element
const setRangeInElement = (
  range: Range,
  element: Node,
  start: number,
  end: number,
) => {
  let textOffset = 0;
  let startSet = false;
  let endSet = false;

  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeLength = node.textContent?.length || 0;
      const nodeEnd = textOffset + nodeLength;

      if (!startSet && start >= textOffset && start <= nodeEnd) {
        range.setStart(node, Math.min(start - textOffset, nodeLength));
        startSet = true;
      }
      if (!endSet && end >= textOffset && end <= nodeEnd) {
        range.setEnd(node, Math.min(end - textOffset, nodeLength));
        endSet = true;
      }

      textOffset += nodeLength;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childLength = node.textContent?.length || 0;

      if (!startSet && start < textOffset + childLength) {
        setRangeInElement(range, node, start - textOffset, end - textOffset);
        return;
      }

      textOffset += childLength;
    }
  }
};

const updateVisualSelection = () => {
  const { vim_info } = window;

  if (vim_info.mode !== "visual") return;

  // Only support single-line selection for now
  if (vim_info.active_line !== vim_info.visual_start_line) {
    // For now, don't support multi-line
    return;
  }

  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentPos = vim_info.desired_column;
  const startPos = vim_info.visual_start_pos;

  // Create selection using browser's Selection API
  const selection = window.getSelection();
  const range = document.createRange();

  const lineLength = currentElement.textContent?.length || 0;

  const [selStart, selEnd] =
    startPos <= currentPos
      ? [startPos, Math.min(currentPos + 1, lineLength)] // Include character under cursor, but don't exceed line length
      : [currentPos, Math.min(startPos + 1, lineLength)];

  setRangeInElement(range, currentElement, selStart, selEnd);
  selection?.removeAllRanges();
  selection?.addRange(range);
};

const visualSelectInnerWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const [start, end] = getInnerWordBounds(text, currentCursorPosition);

  // Update visual selection to cover the word
  vim_info.visual_start_pos = start;
  vim_info.desired_column = end - 1; // Position cursor at end of word (inclusive)

  // Update the visual selection
  const range = document.createRange();
  const selection = window.getSelection();

  setRangeInElement(range, currentElement, start, end);
  selection?.removeAllRanges();
  selection?.addRange(range);
};

const visualSelectAroundWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const [start, end] = getAroundWordBounds(text, currentCursorPosition);

  // Update visual selection to cover the word and surrounding whitespace
  vim_info.visual_start_pos = start;
  vim_info.desired_column = end - 1; // Position cursor at end of selection (inclusive)

  // Update the visual selection
  const range = document.createRange();
  const selection = window.getSelection();

  setRangeInElement(range, currentElement, start, end);
  selection?.removeAllRanges();
  selection?.addRange(range);
};

const visualSelectInnerBracket = (openChar: string, closeChar: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // Use different function for quotes (where open === close)
  const result =
    openChar === closeChar
      ? findMatchingQuotes(text, currentCursorPosition, openChar)
      : findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);

  if (!result) {
    return;
  }

  const [openIndex, closeIndex] = result;

  // Select inner content (excluding brackets)
  vim_info.visual_start_pos = openIndex + 1;
  vim_info.desired_column = closeIndex - 1;

  // Update the visual selection
  const range = document.createRange();
  const selection = window.getSelection();

  setRangeInElement(range, currentElement, openIndex + 1, closeIndex);
  selection?.removeAllRanges();
  selection?.addRange(range);
};

const visualSelectAroundBracket = (openChar: string, closeChar: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // Use different function for quotes (where open === close)
  const result =
    openChar === closeChar
      ? findMatchingQuotes(text, currentCursorPosition, openChar)
      : findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);

  if (!result) {
    return;
  }

  const [openIndex, closeIndex] = result;

  // Select including brackets
  vim_info.visual_start_pos = openIndex;
  vim_info.desired_column = closeIndex;

  // Update the visual selection
  const range = document.createRange();
  const selection = window.getSelection();

  setRangeInElement(range, currentElement, openIndex, closeIndex + 1);
  selection?.removeAllRanges();
  selection?.addRange(range);
};

const visualReducer = (e: KeyboardEvent): boolean => {
  const { vim_info } = window;

  // Allow Notion shortcuts with Cmd (macOS) or Alt modifier keys
  // Note: Ctrl is reserved for Vim shortcuts (Ctrl+d, Ctrl+u, etc.)
  if (e.metaKey || e.altKey) {
    return false;
  }

  // Handle pending text object operators
  if (vim_info.pending_operator === "vi") {
    // Ignore modifier keys (Shift, Ctrl, Alt, Meta)
    if (
      e.key === "Shift" ||
      e.key === "Control" ||
      e.key === "Alt" ||
      e.key === "Meta"
    ) {
      return true;
    }

    // Visual inner text object
    switch (e.key) {
      case "w":
        visualSelectInnerWord();
        vim_info.pending_operator = null;
        return true;
      case "(":
      case ")":
      case "b":
        visualSelectInnerBracket("(", ")");
        vim_info.pending_operator = null;
        return true;
      case "[":
      case "]":
        visualSelectInnerBracket("[", "]");
        vim_info.pending_operator = null;
        return true;
      case "{":
      case "}":
      case "B":
        visualSelectInnerBracket("{", "}");
        vim_info.pending_operator = null;
        return true;
      case "'":
        visualSelectInnerBracket("'", "'");
        vim_info.pending_operator = null;
        return true;
      case '"':
        visualSelectInnerBracket('"', '"');
        vim_info.pending_operator = null;
        return true;
      case "<":
      case ">":
        visualSelectInnerBracket("<", ">");
        vim_info.pending_operator = null;
        return true;
      case "`":
        visualSelectInnerBracket("`", "`");
        vim_info.pending_operator = null;
        return true;
      case "/":
        visualSelectInnerBracket("/", "/");
        vim_info.pending_operator = null;
        return true;
      case "*":
        visualSelectInnerBracket("*", "*");
        vim_info.pending_operator = null;
        return true;
      case "p":
        visualSelectInnerParagraph();
        vim_info.pending_operator = null;
        return true;
    }
    vim_info.pending_operator = null;
    return true;
  } else if (vim_info.pending_operator === "va") {
    // Ignore modifier keys (Shift, Ctrl, Alt, Meta)
    if (
      e.key === "Shift" ||
      e.key === "Control" ||
      e.key === "Alt" ||
      e.key === "Meta"
    ) {
      return true;
    }

    // Visual around text object
    switch (e.key) {
      case "w":
        visualSelectAroundWord();
        vim_info.pending_operator = null;
        return true;
      case "(":
      case ")":
      case "b":
        visualSelectAroundBracket("(", ")");
        vim_info.pending_operator = null;
        return true;
      case "[":
      case "]":
        visualSelectAroundBracket("[", "]");
        vim_info.pending_operator = null;
        return true;
      case "{":
      case "}":
      case "B":
        visualSelectAroundBracket("{", "}");
        vim_info.pending_operator = null;
        return true;
      case "'":
        visualSelectAroundBracket("'", "'");
        vim_info.pending_operator = null;
        return true;
      case '"':
        visualSelectAroundBracket('"', '"');
        vim_info.pending_operator = null;
        return true;
      case "<":
      case ">":
        visualSelectAroundBracket("<", ">");
        vim_info.pending_operator = null;
        return true;
      case "`":
        visualSelectAroundBracket("`", "`");
        vim_info.pending_operator = null;
        return true;
      case "/":
        visualSelectAroundBracket("/", "/");
        vim_info.pending_operator = null;
        return true;
      case "*":
        visualSelectAroundBracket("*", "*");
        vim_info.pending_operator = null;
        return true;
      case "p":
        visualSelectAroundParagraph();
        vim_info.pending_operator = null;
        return true;
    }
    vim_info.pending_operator = null;
    return true;
  }

  switch (e.key) {
    case "Escape":
      vim_info.mode = "normal";
      window.getSelection()?.removeAllRanges();
      // Restore cursor position when exiting visual mode
      const currentElement = vim_info.lines[vim_info.active_line].element;
      setCursorPosition(currentElement, vim_info.desired_column);
      updateInfoContainer();
      return true;
    case "h":
      visualMoveCursorBackwards();
      return true;
    case "j":
      // For now, disable j/k in visual mode (single line only)
      return true;
    case "k":
      return true;
    case "l":
      visualMoveCursorForwards();
      return true;
    case "w":
      visualJumpToNextWord();
      return true;
    case "b":
      visualJumpToPreviousWord();
      return true;
    case "e":
      visualJumpToEndOfWord();
      return true;
    case "W":
      visualJumpToNextWORD();
      return true;
    case "B":
      visualJumpToPreviousWORD();
      return true;
    case "E":
      visualJumpToEndOfWORD();
      return true;
    case "0":
      visualJumpToBeginningOfLine();
      return true;
    case "$":
      visualJumpToEndOfLine();
      return true;
    case "i":
      // Set pending operator for inner text object
      vim_info.pending_operator = "vi";
      return true;
    case "a":
      // Set pending operator for around text object
      vim_info.pending_operator = "va";
      return true;
    case "d":
    case "x":
      deleteVisualSelection();
      return true;
    case "y":
      yankVisualSelection();
      return true;
    default:
      return true; // Block other keys
  }
};

const visualLineReducer = (e: KeyboardEvent): boolean => {
  const { vim_info } = window;

  // Allow Notion shortcuts with Cmd (macOS) or Alt modifier keys
  // Note: Ctrl is reserved for Vim shortcuts (Ctrl+d, Ctrl+u, etc.)
  if (e.metaKey || e.altKey) {
    return false;
  }

  switch (e.key) {
    case "Escape":
      // Clear background highlights from all elements
      clearAllBackgroundColors();
      vim_info.mode = "normal";
      window.getSelection()?.removeAllRanges();
      // Clear saved positions
      delete vim_info.visual_end_pos;
      // Restore cursor position when exiting visual-line mode
      const currentElement = vim_info.lines[vim_info.active_line].element;
      if (isInsideCodeBlock(currentElement)) {
        // For code blocks, restore to the saved position
        setCursorPosition(currentElement, vim_info.visual_start_pos);
      } else {
        // For normal blocks, restore to desired column
        setCursorPosition(currentElement, vim_info.desired_column);
      }
      updateInfoContainer();
      return true;
    case "j":
      visualLineMoveCursorDown();
      return true;
    case "k":
      visualLineMoveCursorUp();
      return true;
    case "g":
      // Handle gg command
      if (vim_info.pending_operator === "g") {
        // Second g pressed - jump to first line
        vim_info.active_line = 0;
        updateVisualLineSelection();
        updateInfoContainer();
        vim_info.pending_operator = null;
      } else {
        // First g pressed - wait for second g
        vim_info.pending_operator = "g";
      }
      return true;
    case "G":
      // Jump to last line
      vim_info.active_line = vim_info.lines.length - 1;
      updateVisualLineSelection();
      updateInfoContainer();
      return true;
    case "{":
      // Jump to previous paragraph
      visualLineJumpToPreviousParagraph();
      return true;
    case "}":
      // Jump to next paragraph
      visualLineJumpToNextParagraph();
      return true;
    case "d":
    case "x":
      deleteVisualLineSelection();
      return true;
    case "c":
    case "s":
      changeVisualLineSelection();
      return true;
    case "y":
      yankVisualLineSelection();
      return true;
    default:
      return true; // Block other keys in visual-line mode
  }
};

const visualLineMoveCursorDown = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const inCodeBlock = isInsideCodeBlock(currentElement);

  if (inCodeBlock) {
    // Check if visual-line mode started outside this code block
    const startElement = vim_info.lines[vim_info.visual_start_line].element;
    const startInCodeBlock = isInsideCodeBlock(startElement);
    const startedOutside = !startInCodeBlock || startElement !== currentElement;

    if (startedOutside) {
      // Visual-line started outside this code block - treat entire block as one unit
      // Move directly to next block
      const nextLine = vim_info.active_line + 1;
      if (nextLine < vim_info.lines.length) {
        vim_info.active_line = nextLine;
        delete vim_info.visual_end_pos; // Clear saved position when leaving code block
      }
    } else {
      // Visual-line started inside this code block - navigate line by line
      const text = currentElement.textContent || "";
      // Use the saved visual_end_pos if it exists, otherwise get from cursor
      const cursorPos =
        vim_info.visual_end_pos !== undefined
          ? vim_info.visual_end_pos
          : getCursorIndexInElement(currentElement);

      // Find the next newline after current position
      const nextNewline = text.indexOf("\n", cursorPos);

      if (nextNewline === -1) {
        // No next line in code block - try to move to next block
        const nextLine = vim_info.active_line + 1;
        if (nextLine < vim_info.lines.length) {
          vim_info.active_line = nextLine;
          delete vim_info.visual_end_pos; // Clear saved position when leaving code block
        }
      } else {
        // Move to the beginning of the next line in the code block
        const nextLineStart = nextNewline + 1;
        // Save the new position
        vim_info.visual_end_pos = nextLineStart;
        setCursorPosition(currentElement, Math.min(nextLineStart, text.length));
      }
    }
  } else {
    // Normal block: move to next block
    const nextLine = vim_info.active_line + 1;
    if (nextLine >= vim_info.lines.length) return;
    vim_info.active_line = nextLine;
  }

  updateVisualLineSelection();
  updateInfoContainer();
};

const visualLineMoveCursorUp = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const inCodeBlock = isInsideCodeBlock(currentElement);

  if (inCodeBlock) {
    // Check if visual-line mode started outside this code block
    const startElement = vim_info.lines[vim_info.visual_start_line].element;
    const startInCodeBlock = isInsideCodeBlock(startElement);
    const startedOutside = !startInCodeBlock || startElement !== currentElement;

    if (startedOutside) {
      // Visual-line started outside this code block - treat entire block as one unit
      // Move directly to previous block
      const prevLine = vim_info.active_line - 1;
      if (prevLine >= 0) {
        vim_info.active_line = prevLine;
        delete vim_info.visual_end_pos; // Clear saved position when leaving code block
      }
    } else {
      // Visual-line started inside this code block - navigate line by line
      const text = currentElement.textContent || "";
      // Use the saved visual_end_pos if it exists, otherwise get from cursor
      const cursorPos =
        vim_info.visual_end_pos !== undefined
          ? vim_info.visual_end_pos
          : getCursorIndexInElement(currentElement);

      // Find the current line's start
      let currentLineStart = text.lastIndexOf("\n", cursorPos - 1);
      currentLineStart = currentLineStart === -1 ? 0 : currentLineStart + 1;

      // If we're at the first line of the code block, try to move to previous block
      if (currentLineStart === 0 && cursorPos < text.indexOf("\n")) {
        const prevLine = vim_info.active_line - 1;
        if (prevLine >= 0) {
          vim_info.active_line = prevLine;
          delete vim_info.visual_end_pos; // Clear saved position when leaving code block
          const prevElement = vim_info.lines[prevLine].element;
          const prevInCodeBlock = isInsideCodeBlock(prevElement);
          if (prevInCodeBlock) {
            const prevText = prevElement.textContent || "";
            // Move to the last line of the previous code block
            const lastNewline = prevText.lastIndexOf("\n");
            if (lastNewline !== -1) {
              vim_info.visual_end_pos = lastNewline + 1;
              setCursorPosition(prevElement, lastNewline + 1);
            } else {
              vim_info.visual_end_pos = 0;
              setCursorPosition(prevElement, 0);
            }
          }
        }
      } else if (currentLineStart > 0) {
        // Find the previous line's start
        let prevLineStart = text.lastIndexOf("\n", currentLineStart - 2);
        prevLineStart = prevLineStart === -1 ? 0 : prevLineStart + 1;
        vim_info.visual_end_pos = prevLineStart;
        setCursorPosition(currentElement, prevLineStart);
      }
    }
  } else {
    // Normal block: move to previous block
    const prevLine = vim_info.active_line - 1;
    if (prevLine < 0) return;
    vim_info.active_line = prevLine;
  }

  updateVisualLineSelection();
  updateInfoContainer();
};

const visualLineJumpToPreviousParagraph = (): void => {
  const { vim_info } = window;
  let targetLine = vim_info.active_line;

  // If we're on a blank line, skip backward through all consecutive blank lines
  while (targetLine > 0 && isParagraphBoundary(targetLine)) {
    targetLine--;
  }

  // Now skip backward through the previous paragraph content
  while (targetLine > 0 && !isParagraphBoundary(targetLine - 1)) {
    targetLine--;
  }

  // Now targetLine is at the first line of the previous paragraph
  // Move up one more to land on the blank line above it (Vim behavior)
  // But only if there is a blank line above
  if (targetLine > 0 && isParagraphBoundary(targetLine - 1)) {
    targetLine--;
  }

  // Move to target line
  vim_info.active_line = targetLine;

  // Update visual-line selection
  updateVisualLineSelection();
  updateInfoContainer();
};

const visualLineJumpToNextParagraph = (): void => {
  const { vim_info } = window;
  const maxLine = vim_info.lines.length - 1;
  let targetLine = vim_info.active_line;

  // If we're on a blank line, skip forward through all consecutive blank lines
  while (targetLine < maxLine && isParagraphBoundary(targetLine)) {
    targetLine++;
  }

  // Now skip forward through the next paragraph content
  while (
    targetLine < maxLine &&
    !isParagraphBoundary(targetLine + 1)
  ) {
    targetLine++;
  }

  // Now targetLine is at the last line of the next paragraph
  // Move down one more to land on the blank line below it (Vim behavior)
  // But only if there is a blank line below
  if (targetLine < maxLine && isParagraphBoundary(targetLine + 1)) {
    targetLine++;
  }

  // Move to target line
  vim_info.active_line = targetLine;

  // Update visual-line selection
  updateVisualLineSelection();
  updateInfoContainer();
};

// deleteCodeBlockWithKeyboardEvents now imported from core module

// deleteNormalBlockWithKeyboardEvents now imported from core module

// Helper function to delete lines within a code block (Visual-line mode)
// Returns the cursor position where deletion started
const deleteCodeBlockLines = (firstLine: number, lastLine: number): number => {
  const { vim_info } = window;

  const codeBlockElement = vim_info.lines[firstLine].element;
  const text = codeBlockElement.textContent || "";

  // Use visual_start_pos and visual_end_pos to determine the range
  let startCursorPos = vim_info.visual_start_pos || 0;
  let endCursorPos =
    vim_info.visual_end_pos !== undefined
      ? vim_info.visual_end_pos
      : getCursorIndexInElement(codeBlockElement);

  // Ensure startCursorPos <= endCursorPos
  if (startCursorPos > endCursorPos) {
    [startCursorPos, endCursorPos] = [endCursorPos, startCursorPos];
  }

  // Find line boundaries for deletion
  let deleteStart = text.lastIndexOf("\n", startCursorPos - 1);
  deleteStart = deleteStart === -1 ? 0 : deleteStart + 1;

  let deleteEnd = text.indexOf("\n", endCursorPos);
  if (deleteEnd !== -1) {
    deleteEnd = deleteEnd + 1; // Include the \n
  } else {
    // Last line - check if there's a newline before this line
    if (deleteStart > 0) {
      deleteStart = deleteStart - 1; // Delete the newline before this line instead
    }
    deleteEnd = text.length;
  }

  // Use TreeWalker to find text nodes
  const walker = document.createTreeWalker(
    codeBlockElement,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let currentNode: Text | null = null;
  let currentOffset = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  while ((currentNode = walker.nextNode() as Text | null)) {
    const nodeLength = currentNode.length;
    const nodeEnd = currentOffset + nodeLength;

    if (!startNode && deleteStart >= currentOffset && deleteStart <= nodeEnd) {
      startNode = currentNode;
      startOffset = deleteStart - currentOffset;
    }

    if (!endNode && deleteEnd >= currentOffset && deleteEnd <= nodeEnd) {
      endNode = currentNode;
      endOffset = deleteEnd - currentOffset;
    }

    currentOffset = nodeEnd;
    if (startNode && endNode) break;
  }

  if (startNode && endNode) {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Delete the content
    document.execCommand("delete");
  }

  // Clear selection
  window.getSelection()?.removeAllRanges();

  // Return the position where deletion started
  return deleteStart;
};

// Helper function to change (delete and enter insert mode) lines within a code block
const changeCodeBlockLines = (firstLine: number, lastLine: number) => {
  const { vim_info } = window;

  // Delete content of each line individually using Selection API
  for (let i = lastLine; i >= firstLine; i--) {
    const element = vim_info.lines[i].element as HTMLElement;

    // Select all content in the line
    const range = document.createRange();
    range.selectNodeContents(element);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Delete the content
    document.execCommand("delete");
  }

  // Clear selection
  window.getSelection()?.removeAllRanges();

  // Enter insert mode and move cursor to the first line
  setTimeout(() => {
    refreshLines();
    if (vim_info.lines.length > firstLine) {
      const element = vim_info.lines[firstLine].element as HTMLElement;
      element.focus();
      setCursorPosition(element, 0);
    }
    updateInfoContainer();
  }, 50);
};

const deleteVisualLineSelection = () => {
  const { vim_info } = window;

  // Switch to insert mode temporarily IMMEDIATELY to prevent updateVisualLineSelection from running
  vim_info.mode = "insert";

  const startLine = vim_info.visual_start_line;
  const endLine = vim_info.active_line;

  // Determine the range of lines to delete
  const [firstLine, lastLine] =
    startLine <= endLine ? [startLine, endLine] : [endLine, startLine];

  // Collect text from all lines for clipboard
  const textLines: string[] = [];
  for (let i = firstLine; i <= lastLine; i++) {
    textLines.push(vim_info.lines[i].element.textContent || "");
  }
  const clipboardText = textLines.join("\n");

  // Copy to clipboard
  navigator.clipboard.writeText(clipboardText).catch((err) => {
    console.error("[Vim-Notion] Failed to copy to clipboard:", err);
  });

  // Clear background highlights from all elements IMMEDIATELY
  clearAllBackgroundColors();
  // Clear selection to remove any browser highlighting
  window.getSelection()?.removeAllRanges();

  // Group consecutive lines by their element (code blocks share the same element)
  const lineGroups: {
    start: number;
    end: number;
    isCodeBlock: boolean;
    element: HTMLElement;
  }[] = [];
  let currentGroupStart = firstLine;
  let currentGroupElement = vim_info.lines[firstLine].element;
  let currentGroupIsCodeBlock = isInsideCodeBlock(currentGroupElement);

  for (let i = firstLine + 1; i <= lastLine; i++) {
    const currentElement = vim_info.lines[i].element;

    // Group boundary: different element (even if both are in code blocks, they're different blocks)
    if (currentElement !== currentGroupElement) {
      lineGroups.push({
        start: currentGroupStart,
        end: i - 1,
        isCodeBlock: currentGroupIsCodeBlock,
        element: currentGroupElement,
      });
      currentGroupStart = i;
      currentGroupElement = currentElement;
      currentGroupIsCodeBlock = isInsideCodeBlock(currentElement);
    }
  }

  // Add the last group
  lineGroups.push({
    start: currentGroupStart,
    end: lastLine,
    isCodeBlock: currentGroupIsCodeBlock,
    element: currentGroupElement,
  });

  // Start undo group for multi-line deletion
  vim_info.in_undo_group = true;
  vim_info.undo_count = lastLine - firstLine + 1;

  // Delete content for each group (in reverse order to maintain indices)
  // Use a sequential approach with delays for normal blocks to avoid DOM errors
  let currentDelay = 10;
  let codeBlockCursorPos: number | null = null; // Store cursor position for code block line deletion

  for (let groupIdx = lineGroups.length - 1; groupIdx >= 0; groupIdx--) {
    const group = lineGroups[groupIdx];

    if (group.isCodeBlock) {
      // Check if selection extends beyond this group (selected from outside)
      const selectionExtendsOutside =
        firstLine < group.start || lastLine > group.end;

      if (selectionExtendsOutside) {
        // Selection includes lines outside this code block - delete the whole block
        deleteCodeBlockWithKeyboardEvents(group.element, 0);
      } else {
        // Selection is entirely within this code block - delete only selected lines
        codeBlockCursorPos = deleteCodeBlockLines(group.start, group.end);
      }
    } else {
      // Normal lines - delete content AND the blocks themselves
      // Delete from last to first to maintain indices
      for (let i = group.end; i >= group.start; i--) {
        const element = vim_info.lines[i].element;
        deleteNormalBlockWithKeyboardEvents(element, currentDelay);
        currentDelay += 50; // Add delay for next block
      }
    }
  }

  // Clear selection
  window.getSelection()?.removeAllRanges();

  // Return to normal mode after all deletions complete
  setTimeout(() => {
    vim_info.mode = "normal";
    vim_info.in_undo_group = false;

    refreshLines();
    clearAllBackgroundColors();

    const newActiveLine = Math.max(
      0,
      Math.min(firstLine, vim_info.lines.length - 1),
    );

    if (vim_info.lines.length > 0) {
      setActiveLine(newActiveLine);
      const element = vim_info.lines[newActiveLine].element;

      // Use the stored cursor position for code block line deletion, otherwise use 0
      const cursorPos = codeBlockCursorPos !== null ? codeBlockCursorPos : 0;
      setCursorPosition(element, cursorPos);
    }
    updateInfoContainer();
  }, currentDelay + 100);
};

const changeVisualLineSelection = () => {
  const { vim_info } = window;

  // Switch to insert mode IMMEDIATELY to prevent updateVisualLineSelection from running
  vim_info.mode = "insert";

  const startLine = vim_info.visual_start_line;
  const endLine = vim_info.active_line;

  // Determine the range of lines to change
  const [firstLine, lastLine] =
    startLine <= endLine ? [startLine, endLine] : [endLine, startLine];

  // Collect text from all lines for clipboard
  const textLines: string[] = [];
  for (let i = firstLine; i <= lastLine; i++) {
    textLines.push(vim_info.lines[i].element.textContent || "");
  }
  const clipboardText = textLines.join("\n");

  // Copy to clipboard
  navigator.clipboard.writeText(clipboardText).catch((err) => {
    console.error("[Vim-Notion] Failed to copy to clipboard:", err);
  });

  // Clear background highlights from all elements IMMEDIATELY
  clearAllBackgroundColors();
  // Clear selection to remove any browser highlighting
  window.getSelection()?.removeAllRanges();

  // Force another clear on next frame
  requestAnimationFrame(() => {
    clearAllBackgroundColors();
  });

  // Group consecutive lines by their element (code blocks share the same element)
  const lineGroups: {
    start: number;
    end: number;
    isCodeBlock: boolean;
    element: HTMLElement;
  }[] = [];
  let currentGroupStart = firstLine;
  let currentGroupElement = vim_info.lines[firstLine].element;
  let currentGroupIsCodeBlock = isInsideCodeBlock(currentGroupElement);

  for (let i = firstLine + 1; i <= lastLine; i++) {
    const currentElement = vim_info.lines[i].element;

    // Group boundary: different element (even if both are in code blocks, they're different blocks)
    if (currentElement !== currentGroupElement) {
      lineGroups.push({
        start: currentGroupStart,
        end: i - 1,
        isCodeBlock: currentGroupIsCodeBlock,
        element: currentGroupElement,
      });
      currentGroupStart = i;
      currentGroupElement = currentElement;
      currentGroupIsCodeBlock = isInsideCodeBlock(currentElement);
    }
  }

  // Add the last group
  lineGroups.push({
    start: currentGroupStart,
    end: lastLine,
    isCodeBlock: currentGroupIsCodeBlock,
    element: currentGroupElement,
  });

  // If selection is entirely within a single code block, use changeCodeBlockLines
  if (lineGroups.length === 1 && lineGroups[0].isCodeBlock) {
    changeCodeBlockLines(firstLine, lastLine);
    return;
  }

  // If selection is a single normal line, just clear and enter insert mode
  if (
    lineGroups.length === 1 &&
    !lineGroups[0].isCodeBlock &&
    firstLine === lastLine
  ) {
    const element = vim_info.lines[firstLine].element as HTMLElement;

    // Select all content
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Delete content
    document.execCommand("delete");

    // Clear selection to remove any remaining highlights
    selection?.removeAllRanges();

    // Focus to stay in insert mode (already set above)
    element.focus();

    // Clear again after focus
    requestAnimationFrame(() => {
      clearAllBackgroundColors();
    });

    updateInfoContainer();
    return;
  }

  // For multiple lines or mixed selections: handle each group
  // (mode is already set to "insert" above)
  vim_info.in_undo_group = true;
  vim_info.undo_count = lastLine - firstLine;

  // Change content for each group, then delete all lines except the first
  for (const group of lineGroups) {
    if (group.isCodeBlock) {
      // Code block lines - use changeCodeBlockLines but don't let it change mode
      const savedMode: string = vim_info.mode;
      changeCodeBlockLines(group.start, group.end);
      vim_info.mode = savedMode as any;
    } else {
      // Normal lines - delete content from each line
      for (let i = group.start; i <= group.end; i++) {
        const element = vim_info.lines[i].element;

        // Select all content in the line
        const range = document.createRange();
        range.selectNodeContents(element);

        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        // Delete the content
        document.execCommand("delete");
      }
    }
  }

  // Now delete all lines except the first
  const linesToDelete: number[] = [];
  for (let i = lastLine; i > firstLine; i--) {
    linesToDelete.push(i);
  }

  deleteExtraLinesSequentially(linesToDelete, firstLine);

  function deleteExtraLinesSequentially(
    lineIndices: number[],
    targetLine: number,
  ) {
    if (lineIndices.length === 0) {
      // All extra lines deleted, now clear the first line and enter insert mode
      vim_info.in_undo_group = false;

      setTimeout(() => {
        refreshLines();
        // Clear background colors again after refresh
        clearAllBackgroundColors();

        if (vim_info.lines.length > targetLine) {
          const element = vim_info.lines[targetLine].element as HTMLElement;

          // Select all content
          const range = document.createRange();
          range.selectNodeContents(element);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);

          // Delete content
          document.execCommand("delete");

          // Clear selection to remove any remaining highlights
          selection?.removeAllRanges();

          // Focus to stay in insert mode
          element.focus();
          setActiveLine(targetLine);

          // Clear again after all operations
          requestAnimationFrame(() => {
            clearAllBackgroundColors();
          });
        }
        updateInfoContainer();
      }, 100);
      return;
    }

    const lineIndex = lineIndices[0];
    if (lineIndex >= vim_info.lines.length) {
      deleteExtraLinesSequentially(lineIndices.slice(1), targetLine);
      return;
    }

    const element = vim_info.lines[lineIndex].element;
    const block =
      element.closest("[data-block-id]") ||
      element.parentElement?.parentElement;

    if (!block) {
      deleteExtraLinesSequentially(lineIndices.slice(1), targetLine);
      return;
    }

    const editableElement = block.querySelector(
      '[contenteditable="true"]',
    ) as HTMLElement;
    if (!editableElement) {
      deleteExtraLinesSequentially(lineIndices.slice(1), targetLine);
      return;
    }

    // Select the content
    const range = document.createRange();
    range.selectNodeContents(editableElement);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Focus and delete
    editableElement.focus();

    setTimeout(() => {
      // Delete content
      const deleteEvent = new KeyboardEvent("keydown", {
        key: "Delete",
        code: "Delete",
        keyCode: 46,
        which: 46,
        bubbles: true,
        cancelable: true,
      });
      editableElement.dispatchEvent(deleteEvent);

      // Delete empty block
      setTimeout(() => {
        const backspaceEvent = new KeyboardEvent("keydown", {
          key: "Backspace",
          code: "Backspace",
          keyCode: 8,
          which: 8,
          bubbles: true,
          cancelable: true,
        });
        editableElement.dispatchEvent(backspaceEvent);

        // Continue with next line
        setTimeout(() => {
          deleteExtraLinesSequentially(lineIndices.slice(1), targetLine);
        }, 10);
      }, 10);
    }, 10);
  }
};

const yankVisualSelection = () => {
  const { vim_info } = window;

  // Use execCommand('copy') to copy to clipboard without deleting
  document.execCommand("copy");

  vim_info.mode = "normal";
  window.getSelection()?.removeAllRanges();
  updateInfoContainer();
};

const yankVisualLineSelection = () => {
  const { vim_info } = window;

  // Use execCommand('copy') to copy to clipboard without deleting
  document.execCommand("copy");

  // Clear background highlights from all elements
  clearAllBackgroundColors();

  vim_info.mode = "normal";
  window.getSelection()?.removeAllRanges();
  updateInfoContainer();
};

const pasteAfterCursor = async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const lineLength = currentElement.textContent?.length || 0;

  // Move cursor one position forward (unless at end of line)
  let pastePosition = currentCursorPosition;
  if (currentCursorPosition < lineLength) {
    pastePosition = currentCursorPosition + 1;
  }

  // Set cursor to paste position
  setCursorPosition(currentElement, pastePosition);

  // Try to read from clipboard and insert
  try {
    const clipboardText = await navigator.clipboard.readText();

    // Insert text at cursor position
    const text = currentElement.textContent || "";
    const newText =
      text.slice(0, pastePosition) + clipboardText + text.slice(pastePosition);
    currentElement.textContent = newText;

    // Move cursor to end of pasted text
    const newCursorPosition = pastePosition + clipboardText.length - 1;
    setCursorPosition(currentElement, newCursorPosition);
    vim_info.desired_column = newCursorPosition;
  } catch (err) {
    console.error("[Vim-Notion] Failed to paste:", err);
  }
};

const pasteBeforeCursor = async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);

  // Paste at current cursor position (before cursor)
  setCursorPosition(currentElement, currentCursorPosition);

  try {
    const clipboardText = await navigator.clipboard.readText();

    // Insert text at cursor position
    const text = currentElement.textContent || "";
    const newText =
      text.slice(0, currentCursorPosition) +
      clipboardText +
      text.slice(currentCursorPosition);
    currentElement.textContent = newText;

    // Move cursor to end of pasted text
    const newCursorPosition = currentCursorPosition + clipboardText.length - 1;
    setCursorPosition(currentElement, newCursorPosition);
    vim_info.desired_column = newCursorPosition;
  } catch (err) {
    console.error("[Vim-Notion] Failed to paste:", err);
  }
};


// Delete from cursor to previous paragraph boundary
const deleteToPreviousParagraph = () => {
  const { vim_info } = window;
  const currentLine = vim_info.active_line;
  const currentElement = vim_info.lines[currentLine].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);

  // Find the target paragraph boundary
  let targetLine = currentLine;

  // If we're on a blank line, skip backward through all consecutive blank lines
  while (targetLine > 0 && isParagraphBoundary(targetLine)) {
    targetLine--;
  }

  // Now skip backward through the previous paragraph content
  while (targetLine > 0 && !isParagraphBoundary(targetLine - 1)) {
    targetLine--;
  }

  // Now targetLine is at the first line of the previous paragraph
  // Move up one more to land on the blank line above it (Vim behavior)
  if (targetLine > 0) {
    targetLine--;
  }

  // Collect text from all lines between current and target for clipboard
  const lines: string[] = [];

  // Add partial text from current line (from start to cursor)
  const currentText = currentElement.textContent || "";
  lines.push(currentText.slice(0, currentCursorPosition));

  // Add all lines in between (in reverse order since we're going backward)
  for (let i = currentLine - 1; i >= targetLine; i--) {
    const lineText = vim_info.lines[i].element.textContent || "";
    lines.unshift(lineText);
  }

  const clipboardText = lines.join("\n");

  // Copy to clipboard
  navigator.clipboard.writeText(clipboardText).catch((err) => {
    console.error("[Vim-Notion] Failed to copy to clipboard:", err);
  });

  // If we're deleting across multiple lines
  if (currentLine !== targetLine) {
    // Switch to insert mode temporarily
    vim_info.mode = "insert";

    // Delete all blocks from targetLine to currentLine - 1
    let currentDelay = 10;
    for (let i = currentLine - 1; i >= targetLine; i--) {
      const element = vim_info.lines[i].element;
      deleteNormalBlockWithKeyboardEvents(element, currentDelay);
      currentDelay += 50;
    }

    // Delete partial content from current line (from start to cursor)
    setTimeout(() => {
      const text = currentElement.textContent || "";
      const newText = text.slice(currentCursorPosition);
      currentElement.textContent = newText;
      setCursorPosition(currentElement, 0);
      vim_info.desired_column = 0;

      // Return to normal mode
      setTimeout(() => {
        vim_info.mode = "normal";
        refreshLines();
        updateInfoContainer();
      }, 50);
    }, currentDelay + 50);
  } else {
    // Same line - just delete text from start to cursor
    const text = currentElement.textContent || "";
    const newText = text.slice(currentCursorPosition);
    currentElement.textContent = newText;
    setCursorPosition(currentElement, 0);
    vim_info.desired_column = 0;
  }
};

// Delete from cursor to next paragraph boundary
const deleteToNextParagraph = () => {
  const { vim_info } = window;
  const currentLine = vim_info.active_line;
  const maxLine = vim_info.lines.length - 1;
  const currentElement = vim_info.lines[currentLine].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);

  // Find the target paragraph boundary
  let targetLine = currentLine;

  // If we're on a blank line, skip forward through all consecutive blank lines
  while (targetLine < maxLine && isParagraphBoundary(targetLine)) {
    targetLine++;
  }

  // Now skip forward through the next paragraph content
  while (
    targetLine < maxLine &&
    !isParagraphBoundary(targetLine + 1)
  ) {
    targetLine++;
  }

  // Now targetLine is at the last line of the next paragraph
  // Move down one more to land on the blank line below it (Vim behavior)
  // But only if there is a blank line below
  if (targetLine < maxLine && isParagraphBoundary(targetLine + 1)) {
    targetLine++;
  }

  // Collect text from all lines between current and target for clipboard
  const lines: string[] = [];

  // Add partial text from current line (from cursor to end)
  const currentText = currentElement.textContent || "";
  lines.push(currentText.slice(currentCursorPosition));

  // Add all lines in between
  for (let i = currentLine + 1; i <= targetLine; i++) {
    const lineText = vim_info.lines[i].element.textContent || "";
    lines.push(lineText);
  }

  const clipboardText = lines.join("\n");

  // Copy to clipboard
  navigator.clipboard.writeText(clipboardText).catch((err) => {
    console.error("[Vim-Notion] Failed to copy to clipboard:", err);
  });

  // If we're deleting across multiple lines
  if (currentLine !== targetLine) {
    // Switch to insert mode temporarily
    vim_info.mode = "insert";

    // Delete all blocks from currentLine + 1 to targetLine
    let currentDelay = 10;
    for (let i = targetLine; i > currentLine; i--) {
      const element = vim_info.lines[i].element;
      deleteNormalBlockWithKeyboardEvents(element, currentDelay);
      currentDelay += 50;
    }

    // Delete partial content from current line (from cursor to end)
    setTimeout(() => {
      const text = currentElement.textContent || "";
      const newText = text.slice(0, currentCursorPosition);
      currentElement.textContent = newText;
      setCursorPosition(currentElement, currentCursorPosition);
      vim_info.desired_column = currentCursorPosition;

      // Return to normal mode
      setTimeout(() => {
        vim_info.mode = "normal";
        refreshLines();
        updateInfoContainer();
      }, 50);
    }, currentDelay + 50);
  } else {
    // Same line - just delete text from cursor to end
    const text = currentElement.textContent || "";
    const newText = text.slice(0, currentCursorPosition);
    currentElement.textContent = newText;
    setCursorPosition(currentElement, currentCursorPosition);
    vim_info.desired_column = currentCursorPosition;
  }
};

// Change from cursor to previous paragraph boundary
const changeToPreviousParagraph = () => {
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

// Change from cursor to next paragraph boundary
const changeToNextParagraph = () => {
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
  while (
    targetLine < maxLine &&
    !isParagraphBoundary(targetLine + 1)
  ) {
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

// Text object bounds functions now imported from text-objects module
// Word and bracket operators now created via factories (see below)

const deleteCurrentLine = async () => {
  const { vim_info } = window;
  const currentLineIndex = vim_info.active_line;
  const currentElement = vim_info.lines[currentLineIndex].element;

  // Check if we're inside a code block
  const inCodeBlock = isInsideCodeBlock(currentElement);

  if (inCodeBlock) {
    // For code blocks, delete only the line content, not the block itself
    const text = currentElement.textContent || "";
    const cursorPos = getCursorIndexInElement(currentElement);

    // Find the start and end of the current line
    let lineStart = text.lastIndexOf("\n", cursorPos - 1);
    lineStart = lineStart === -1 ? 0 : lineStart + 1;

    let lineEnd = text.indexOf("\n", cursorPos);
    // Include the newline character in deletion (if it exists)
    if (lineEnd !== -1) {
      lineEnd = lineEnd + 1; // Include the \n
    } else {
      // Last line - check if there's a newline before this line
      if (lineStart > 0) {
        // Delete the newline before this line instead
        lineStart = lineStart - 1;
      }
      lineEnd = text.length;
    }

    // Extract the line text for clipboard (without newlines for clipboard)
    const originalLineStart = text.lastIndexOf("\n", cursorPos - 1);
    const actualLineStart =
      originalLineStart === -1 ? 0 : originalLineStart + 1;
    const originalLineEnd = text.indexOf("\n", cursorPos);
    const actualLineEnd =
      originalLineEnd === -1 ? text.length : originalLineEnd;
    const lineText = text.substring(actualLineStart, actualLineEnd);
    navigator.clipboard.writeText(lineText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    // Temporarily switch to insert mode
    vim_info.mode = "insert";

    // Select the line content using TreeWalker
    const walker = document.createTreeWalker(
      currentElement,
      NodeFilter.SHOW_TEXT,
      null,
    );

    let currentNode: Text | null = null;
    let currentOffset = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    while ((currentNode = walker.nextNode() as Text | null)) {
      const nodeLength = currentNode.length;
      const nodeEnd = currentOffset + nodeLength;

      if (!startNode && lineStart >= currentOffset && lineStart <= nodeEnd) {
        startNode = currentNode;
        startOffset = lineStart - currentOffset;
      }

      if (!endNode && lineEnd >= currentOffset && lineEnd <= nodeEnd) {
        endNode = currentNode;
        endOffset = lineEnd - currentOffset;
      }

      currentOffset = nodeEnd;
      if (startNode && endNode) break;
    }

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);

      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      // Delete the selected content
      setTimeout(() => {
        document.execCommand("delete");

        setTimeout(() => {
          vim_info.mode = "normal";
          // Position cursor at the start of the line (or end of previous line if we deleted content)
          const newCursorPos = lineStart;
          setCursorPosition(currentElement, newCursorPos);
          updateInfoContainer();
        }, 10);
      }, 10);
    }
  } else {
    // For normal blocks, delete the entire block as before
    // Copy line content to clipboard
    const lineText = currentElement.textContent || "";
    navigator.clipboard.writeText(lineText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    // Temporarily switch to insert mode to allow deletion
    const previousMode = vim_info.mode;
    vim_info.mode = "insert";

    // Select entire line content
    const range = document.createRange();
    range.selectNodeContents(currentElement);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    // Focus and delete with Delete key
    (currentElement as HTMLElement).focus();

    setTimeout(() => {
      const deleteEvent = new KeyboardEvent("keydown", {
        key: "Delete",
        code: "Delete",
        keyCode: 46,
        which: 46,
        bubbles: true,
        cancelable: true,
      });

      currentElement.dispatchEvent(deleteEvent);

      // After deleting content, press Backspace to delete the empty block
      setTimeout(() => {
        const backspaceEvent = new KeyboardEvent("keydown", {
          key: "Backspace",
          code: "Backspace",
          keyCode: 8,
          which: 8,
          bubbles: true,
          cancelable: true,
        });

        currentElement.dispatchEvent(backspaceEvent);

        // Return to normal mode and update cursor
        setTimeout(() => {
          vim_info.mode = "normal";
          refreshLines();

          const newActiveLine = Math.max(
            0,
            Math.min(currentLineIndex - 1, vim_info.lines.length - 1),
          );
          if (vim_info.lines.length > 0) {
            setActiveLine(newActiveLine);
          }
        }, 50);
      }, 20);
    }, 10);
  }
};

const deleteToNextWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  let pos = currentCursorPosition;

  // Skip current word
  while (pos < text.length && /\w/.test(text[pos])) {
    pos++;
  }

  // Skip non-word characters
  while (pos < text.length && !/\w/.test(text[pos])) {
    pos++;
  }

  // Select from cursor to pos
  setCursorPosition(currentElement, currentCursorPosition);
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    r.setStart(r.startContainer, r.startOffset);
    r.setEnd(r.startContainer, r.startOffset + (pos - currentCursorPosition));
    sel.removeAllRanges();
    sel.addRange(r);

    document.execCommand("cut");
  }

  vim_info.desired_column = currentCursorPosition;
};

const deleteToEndOfLine = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const newText = text.slice(0, currentCursorPosition);
  currentElement.textContent = newText;

  setCursorPosition(currentElement, currentCursorPosition);
  vim_info.desired_column = currentCursorPosition;
};

const deleteToBeginningOfLine = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const newText = text.slice(currentCursorPosition);
  currentElement.textContent = newText;

  setCursorPosition(currentElement, 0);
  vim_info.desired_column = 0;
};

// Helper function to find matching quotes (where open and close are the same)
// Bracket matching functions now imported from text-objects module

const deleteFindCharForward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  const foundIndex = text.indexOf(char, currentPos + 1);
  if (foundIndex !== -1) {
    // Delete from current position to and including the found character
    const newText = text.slice(0, currentPos) + text.slice(foundIndex + 1);
    currentElement.textContent = newText;
    setCursorPosition(currentElement, currentPos);
    vim_info.desired_column = currentPos;
  } else {
  }
};

const deleteFindCharBackward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  const foundIndex = text.lastIndexOf(char, currentPos - 1);
  if (foundIndex !== -1) {
    // Delete from and including the found character to current position
    const newText = text.slice(0, foundIndex) + text.slice(currentPos);
    currentElement.textContent = newText;
    setCursorPosition(currentElement, foundIndex);
    vim_info.desired_column = foundIndex;
  } else {
  }
};

const deleteTillCharForward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  const foundIndex = text.indexOf(char, currentPos + 1);
  if (foundIndex !== -1) {
    // Delete from current position to before the found character
    const newText = text.slice(0, currentPos) + text.slice(foundIndex);
    currentElement.textContent = newText;
    setCursorPosition(currentElement, currentPos);
    vim_info.desired_column = currentPos;
  }
};

const deleteTillCharBackward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  const foundIndex = text.lastIndexOf(char, currentPos - 1);
  if (foundIndex !== -1) {
    // Delete from after the found character to current position
    const newText = text.slice(0, foundIndex + 1) + text.slice(currentPos);
    currentElement.textContent = newText;
    setCursorPosition(currentElement, foundIndex + 1);
    vim_info.desired_column = foundIndex + 1;
  }
};

const changeFindCharForward = (char: string) => {
  deleteFindCharForward(char);
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const changeFindCharBackward = (char: string) => {
  deleteFindCharBackward(char);
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const changeTillCharForward = (char: string) => {
  deleteTillCharForward(char);
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const changeTillCharBackward = (char: string) => {
  deleteTillCharBackward(char);
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const changeCurrentLine = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;

  currentElement.textContent = "";
  setCursorPosition(currentElement, 0);
  vim_info.desired_column = 0;
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const changeToNextWord = () => {
  deleteToNextWord();
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const changeToEndOfLine = () => {
  deleteToEndOfLine();
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const changeToBeginningOfLine = () => {
  deleteToBeginningOfLine();
  window.vim_info.mode = "insert";
  updateInfoContainer();
};


const undo = () => {
  const { vim_info } = window;

  // Check if we need to undo multiple operations (from grouped deletions)
  const count = vim_info.undo_count > 0 ? vim_info.undo_count : 1;

  // Perform undo operations
  performUndoOperations(count);

  function performUndoOperations(remaining: number) {
    if (remaining <= 0) {
      // All undos complete, reset counter and update cursor
      vim_info.undo_count = 0;

      setTimeout(() => {
        const currentElement = vim_info.lines[vim_info.active_line]?.element;
        if (currentElement) {
          const cursorIndex = getCursorIndexInElement(currentElement);
          vim_info.desired_column = cursorIndex;
          updateBlockCursor();
        }
      }, 50);
      return;
    }

    // Simulate Cmd+Z / Ctrl+Z to trigger Notion's undo
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const event = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      keyCode: 90,
      which: 90,
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);

    // Wait and perform next undo
    setTimeout(() => {
      performUndoOperations(remaining - 1);
    }, 20);
  }
};

const redo = () => {
  const { vim_info } = window;

  // Check if we need to redo multiple operations (from grouped deletions)
  const count = vim_info.undo_count > 0 ? vim_info.undo_count : 1;

  // Perform redo operations
  performRedoOperations(count);

  function performRedoOperations(remaining: number) {
    if (remaining <= 0) {
      // All redos complete, reset counter and update cursor
      vim_info.undo_count = 0;

      setTimeout(() => {
        const currentElement = vim_info.lines[vim_info.active_line]?.element;
        if (currentElement) {
          const cursorIndex = getCursorIndexInElement(currentElement);
          vim_info.desired_column = cursorIndex;
          updateBlockCursor();
        }
      }, 50);
      return;
    }

    // Simulate Cmd+Shift+Z / Ctrl+Shift+Z to trigger Notion's redo
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const event = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      keyCode: 90,
      which: 90,
      shiftKey: true,
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);

    // Wait and perform next redo
    setTimeout(() => {
      performRedoOperations(remaining - 1);
    }, 20);
  }
};

const visualMoveCursorBackwards = () => {
  const { vim_info } = window;

  if (vim_info.desired_column === 0) return;

  vim_info.desired_column--;
  updateVisualSelection();
};

const visualMoveCursorForwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const lineLength = currentElement.textContent?.length || 0;

  if (vim_info.desired_column >= lineLength) return;

  vim_info.desired_column++;
  updateVisualSelection();
};

const visualJumpToNextWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  let pos = vim_info.desired_column;

  // Skip current word (alphanumeric characters)
  while (pos < text.length && /\w/.test(text[pos])) {
    pos++;
  }

  // Skip non-word characters (spaces, punctuation)
  while (pos < text.length && !/\w/.test(text[pos])) {
    pos++;
  }

  vim_info.desired_column = pos;
  updateVisualSelection();
};

const visualJumpToPreviousWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";

  if (vim_info.desired_column === 0) return;

  let pos = vim_info.desired_column - 1;

  // Skip non-word characters (spaces, punctuation) backwards
  while (pos > 0 && !/\w/.test(text[pos])) {
    pos--;
  }

  // Skip current word backwards
  while (pos > 0 && /\w/.test(text[pos - 1])) {
    pos--;
  }

  vim_info.desired_column = pos;
  updateVisualSelection();
};

const visualJumpToEndOfWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  let pos = vim_info.desired_column;

  // Always move at least one character forward
  pos++;

  // Skip non-word characters
  while (pos < text.length && !/\w/.test(text[pos])) {
    pos++;
  }

  // Skip to end of next word
  while (pos < text.length && /\w/.test(text[pos])) {
    pos++;
  }

  pos--; // Move back to last character of the word

  if (pos >= text.length) pos = text.length - 1;
  if (pos < vim_info.desired_column) pos = vim_info.desired_column; // Don't move backward

  vim_info.desired_column = pos;
  updateVisualSelection();
};

const visualJumpToNextWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  let pos = vim_info.desired_column;

  // Skip current WORD (non-whitespace characters)
  while (pos < text.length && !/\s/.test(text[pos])) {
    pos++;
  }

  // Skip whitespace
  while (pos < text.length && /\s/.test(text[pos])) {
    pos++;
  }

  vim_info.desired_column = pos;
  updateVisualSelection();
};

const visualJumpToPreviousWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";

  if (vim_info.desired_column === 0) return;

  let pos = vim_info.desired_column - 1;

  // Skip whitespace backwards
  while (pos > 0 && /\s/.test(text[pos])) {
    pos--;
  }

  // Skip current WORD backwards
  while (pos > 0 && !/\s/.test(text[pos - 1])) {
    pos--;
  }

  vim_info.desired_column = pos;
  updateVisualSelection();
};

const visualJumpToEndOfWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  let pos = vim_info.desired_column;

  // Always move at least one character forward
  pos++;

  // Skip whitespace
  while (pos < text.length && /\s/.test(text[pos])) {
    pos++;
  }

  // Skip to end of next WORD
  while (pos < text.length && !/\s/.test(text[pos])) {
    pos++;
  }

  pos--; // Move back to last character of the WORD

  if (pos >= text.length) pos = text.length - 1;
  if (pos < vim_info.desired_column) pos = vim_info.desired_column; // Don't move backward

  vim_info.desired_column = pos;
  updateVisualSelection();
};

const visualJumpToBeginningOfLine = () => {
  const { vim_info } = window;
  vim_info.desired_column = 0;
  updateVisualSelection();
};

const visualJumpToEndOfLine = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const lineLength = currentElement.textContent?.length || 0;
  vim_info.desired_column = lineLength;
  updateVisualSelection();
};

const deleteVisualSelection = () => {
  const { vim_info } = window;

  if (vim_info.active_line !== vim_info.visual_start_line) {
    // Don't support multi-line delete yet
    return;
  }

  // The selection is already set by updateVisualSelection
  // Use 'cut' to copy to clipboard like vim's 'd' command
  document.execCommand("cut");

  vim_info.mode = "normal";
  window.getSelection()?.removeAllRanges();
  updateInfoContainer();
};

// Notion DOM helper functions now imported from notion module

const handlePendingOperator = (key: string): boolean => {
  const { vim_info } = window;
  const operator = vim_info.pending_operator;

  // Ignore modifier keys - don't clear pending_operator
  if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") {
    return true;
  }

  // Clear pending operator
  vim_info.pending_operator = null;

  if (operator === "f") {
    // Handle f{char} - find character forward
    findCharForward(key);
    return true;
  } else if (operator === "F") {
    // Handle F{char} - find character backward
    findCharBackward(key);
    return true;
  } else if (operator === "t") {
    // Handle t{char} - till character forward
    tillCharForward(key);
    return true;
  } else if (operator === "T") {
    // Handle T{char} - till character backward
    tillCharBackward(key);
    return true;
  } else if (operator === "g") {
    // Handle g commands
    switch (key) {
      case "g":
        jumpToTop();
        return true;
      case "l":
        // Save cursor position before entering link hint mode
        // (so we can restore it when navigating back)
        saveCursorPosition();
        enterLinkHintMode(updateInfoContainer);
        return true;
      default:
        return true;
    }
  } else if (operator === "y") {
    // Handle yank operations
    switch (key) {
      case "y":
        yankCurrentLine();
        return true;
      case "w":
        yankToNextWord();
        return true;
      case "$":
        yankToEndOfLine();
        return true;
      case "0":
        yankToBeginningOfLine();
        return true;
      case "{":
        yankToPreviousParagraph();
        return true;
      case "}":
        yankToNextParagraph();
        return true;
      case "i":
        // yi{motion} - yank inner text object, wait for next key
        vim_info.pending_operator = "yi";
        return true;
      case "a":
        // ya{motion} - yank around text object, wait for next key
        vim_info.pending_operator = "ya";
        return true;
      default:
        return true;
    }
  } else if (operator === "d") {
    // Handle delete operations
    switch (key) {
      case "d":
        deleteCurrentLine();
        return true;
      case "w":
        deleteToNextWord();
        return true;
      case "$":
        deleteToEndOfLine();
        return true;
      case "0":
        deleteToBeginningOfLine();
        return true;
      case "{":
        deleteToPreviousParagraph();
        return true;
      case "}":
        deleteToNextParagraph();
        return true;
      case "f":
        // df{char} - delete find character, wait for next key
        vim_info.pending_operator = "df";
        return true;
      case "F":
        // dF{char} - delete find character backward, wait for next key
        vim_info.pending_operator = "dF";
        return true;
      case "t":
        // dt{char} - delete till character, wait for next key
        vim_info.pending_operator = "dt";
        return true;
      case "T":
        // dT{char} - delete till character backward, wait for next key
        vim_info.pending_operator = "dT";
        return true;
      case "i":
        // di{motion} - delete inner text object, wait for next key
        vim_info.pending_operator = "di";
        return true;
      case "a":
        // da{motion} - delete around text object, wait for next key
        vim_info.pending_operator = "da";
        return true;
      default:
        return true;
    }
  } else if (operator === "c") {
    // Handle change operations (delete and enter insert mode)
    switch (key) {
      case "c":
        changeCurrentLine();
        return true;
      case "w":
        changeToNextWord();
        return true;
      case "$":
        changeToEndOfLine();
        return true;
      case "0":
        changeToBeginningOfLine();
        return true;
      case "{":
        changeToPreviousParagraph();
        return true;
      case "}":
        changeToNextParagraph();
        return true;
      case "f":
        // cf{char} - change find character, wait for next key
        vim_info.pending_operator = "cf";
        return true;
      case "F":
        // cF{char} - change find character backward, wait for next key
        vim_info.pending_operator = "cF";
        return true;
      case "t":
        // ct{char} - change till character, wait for next key
        vim_info.pending_operator = "ct";
        return true;
      case "T":
        // cT{char} - change till character backward, wait for next key
        vim_info.pending_operator = "cT";
        return true;
      case "i":
        // ci{motion} - change inner text object, wait for next key
        vim_info.pending_operator = "ci";
        return true;
      case "a":
        // ca{motion} - change around text object, wait for next key
        vim_info.pending_operator = "ca";
        return true;
      default:
        return true;
    }
  } else if (operator === "df") {
    // Handle df{char} - delete find character forward
    deleteFindCharForward(key);
    return true;
  } else if (operator === "dF") {
    // Handle dF{char} - delete find character backward
    deleteFindCharBackward(key);
    return true;
  } else if (operator === "dt") {
    // Handle dt{char} - delete till character forward
    deleteTillCharForward(key);
    return true;
  } else if (operator === "dT") {
    // Handle dT{char} - delete till character backward
    deleteTillCharBackward(key);
    return true;
  } else if (operator === "cf") {
    // Handle cf{char} - change find character forward
    changeFindCharForward(key);
    return true;
  } else if (operator === "cF") {
    // Handle cF{char} - change find character backward
    changeFindCharBackward(key);
    return true;
  } else if (operator === "ct") {
    // Handle ct{char} - change till character forward
    changeTillCharForward(key);
    return true;
  } else if (operator === "cT") {
    // Handle cT{char} - change till character backward
    changeTillCharBackward(key);
    return true;
  } else if (operator === "yi" || operator === "di" || operator === "ci") {
    // Handle inner text objects
    switch (key) {
      case "w":
        if (operator === "yi") {
          yankInnerWord();
        } else if (operator === "di") {
          deleteInnerWord();
        } else if (operator === "ci") {
          changeInnerWord();
        }
        return true;
      case "(":
      case ")":
      case "b":
        if (operator === "yi") {
          yankInnerBracket("(", ")");
        } else if (operator === "di") {
          deleteInnerBracket("(", ")");
        } else if (operator === "ci") {
          changeInnerBracket("(", ")");
        }
        return true;
      case "[":
      case "]":
        if (operator === "yi") {
          yankInnerBracket("[", "]");
        } else if (operator === "di") {
          deleteInnerBracket("[", "]");
        } else if (operator === "ci") {
          changeInnerBracket("[", "]");
        }
        return true;
      case "{":
      case "}":
      case "B":
        if (operator === "yi") {
          yankInnerBracket("{", "}");
        } else if (operator === "di") {
          deleteInnerBracket("{", "}");
        } else if (operator === "ci") {
          changeInnerBracket("{", "}");
        }
        return true;
      case "'":
        if (operator === "yi") {
          yankInnerBracket("'", "'");
        } else if (operator === "di") {
          deleteInnerBracket("'", "'");
        } else if (operator === "ci") {
          changeInnerBracket("'", "'");
        }
        return true;
      case '"':
        if (operator === "yi") {
          yankInnerBracket('"', '"');
        } else if (operator === "di") {
          deleteInnerBracket('"', '"');
        } else if (operator === "ci") {
          changeInnerBracket('"', '"');
        }
        return true;
      case "<":
      case ">":
        if (operator === "yi") {
          yankInnerBracket("<", ">");
        } else if (operator === "di") {
          deleteInnerBracket("<", ">");
        } else if (operator === "ci") {
          changeInnerBracket("<", ">");
        }
        return true;
      case "`":
        if (operator === "yi") {
          yankInnerBracket("`", "`");
        } else if (operator === "di") {
          deleteInnerBracket("`", "`");
        } else if (operator === "ci") {
          changeInnerBracket("`", "`");
        }
        return true;
      case "/":
        if (operator === "yi") {
          yankInnerBracket("/", "/");
        } else if (operator === "di") {
          deleteInnerBracket("/", "/");
        } else if (operator === "ci") {
          changeInnerBracket("/", "/");
        }
        return true;
      case "*":
        if (operator === "yi") {
          yankInnerBracket("*", "*");
        } else if (operator === "di") {
          deleteInnerBracket("*", "*");
        } else if (operator === "ci") {
          changeInnerBracket("*", "*");
        }
        return true;
      case "p":
        if (operator === "yi") {
          yankInnerParagraph();
        } else if (operator === "di") {
          deleteInnerParagraph();
        } else if (operator === "ci") {
          changeInnerParagraph();
        }
        return true;
      default:
        return true;
    }
  } else if (operator === "ya" || operator === "da" || operator === "ca") {
    // Handle around text objects
    switch (key) {
      case "w":
        if (operator === "ya") {
          yankAroundWord();
        } else if (operator === "da") {
          deleteAroundWord();
        } else if (operator === "ca") {
          changeAroundWord();
        }
        return true;
      case "(":
      case ")":
      case "b":
        if (operator === "ya") {
          yankAroundBracket("(", ")");
        } else if (operator === "da") {
          deleteAroundBracket("(", ")");
        } else if (operator === "ca") {
          changeAroundBracket("(", ")");
        }
        return true;
      case "[":
      case "]":
        if (operator === "ya") {
          yankAroundBracket("[", "]");
        } else if (operator === "da") {
          deleteAroundBracket("[", "]");
        } else if (operator === "ca") {
          changeAroundBracket("[", "]");
        }
        return true;
      case "{":
      case "}":
      case "B":
        if (operator === "ya") {
          yankAroundBracket("{", "}");
        } else if (operator === "da") {
          deleteAroundBracket("{", "}");
        } else if (operator === "ca") {
          changeAroundBracket("{", "}");
        }
        return true;
      case "'":
        if (operator === "ya") {
          yankAroundBracket("'", "'");
        } else if (operator === "da") {
          deleteAroundBracket("'", "'");
        } else if (operator === "ca") {
          changeAroundBracket("'", "'");
        }
        return true;
      case '"':
        if (operator === "ya") {
          yankAroundBracket('"', '"');
        } else if (operator === "da") {
          deleteAroundBracket('"', '"');
        } else if (operator === "ca") {
          changeAroundBracket('"', '"');
        }
        return true;
      case "<":
      case ">":
        if (operator === "ya") {
          yankAroundBracket("<", ">");
        } else if (operator === "da") {
          deleteAroundBracket("<", ">");
        } else if (operator === "ca") {
          changeAroundBracket("<", ">");
        }
        return true;
      case "`":
        if (operator === "ya") {
          yankAroundBracket("`", "`");
        } else if (operator === "da") {
          deleteAroundBracket("`", "`");
        } else if (operator === "ca") {
          changeAroundBracket("`", "`");
        }
        return true;
      case "/":
        if (operator === "ya") {
          yankAroundBracket("/", "/");
        } else if (operator === "da") {
          deleteAroundBracket("/", "/");
        } else if (operator === "ca") {
          changeAroundBracket("/", "/");
        }
        return true;
      case "*":
        if (operator === "ya") {
          yankAroundBracket("*", "*");
        } else if (operator === "da") {
          deleteAroundBracket("*", "*");
        } else if (operator === "ca") {
          changeAroundBracket("*", "*");
        }
        return true;
      case "p":
        if (operator === "ya") {
          yankAroundParagraph();
        } else if (operator === "da") {
          deleteAroundParagraph();
        } else if (operator === "ca") {
          changeAroundParagraph();
        }
        return true;
      default:
        return true;
    }
  }

  return true;
};

const normalReducer = (e: KeyboardEvent): boolean => {
  // Handle specific Ctrl key combinations for page navigation
  if (e.ctrlKey && !e.metaKey && !e.altKey) {
    const key = e.key.toLowerCase();

    // Ctrl+d - half page down
    if (key === "d") {
      scrollAndMoveCursor(0.5);
      return true;
    }

    // Ctrl+u - half page up
    if (key === "u") {
      scrollAndMoveCursor(-0.5);
      return true;
    }

    // Ctrl+f - full page down
    if (key === "f") {
      scrollAndMoveCursor(1.0);
      return true;
    }

    // Ctrl+b - full page up
    if (key === "b") {
      scrollAndMoveCursor(-1.0);
      return true;
    }

    // For other Ctrl combinations, let browser handle them
    return false;
  }

  // Don't handle keys with modifiers (Command, Alt) - let browser handle them
  if (e.metaKey || e.altKey) {
    return false;
  }

  const { vim_info } = window;
  const { active_line, pending_operator } = vim_info;

  // Handle link selection mode
  if (linkSelectionMode) {
    switch (e.key) {
      case "j":
        e.preventDefault();
        e.stopPropagation();
        clearAllLinkHighlights();
        setSelectedLinkIndex((selectedLinkIndex + 1) % availableLinks.length);
        highlightSelectedLink();
        return true;

      case "k":
        e.preventDefault();
        e.stopPropagation();
        clearAllLinkHighlights();
        setSelectedLinkIndex(
          (selectedLinkIndex - 1 + availableLinks.length) %
          availableLinks.length
        );
        highlightSelectedLink();
        return true;

      case "Enter":
        e.preventDefault();
        e.stopPropagation();
        const selectedLink = availableLinks[selectedLinkIndex];
        exitLinkSelectionMode();

        // Check if it's a block link or page link to save cursor position
        const extractPageId = (url: string) => {
          const match = url.match(/([a-f0-9]{32})(\?|#|$)/);
          return match ? match[1] : null;
        };
        const linkPageId = extractPageId(selectedLink.href);
        const currentPageId = extractPageId(window.location.href);
        const isBlockLink =
          selectedLink.href.includes("#") && linkPageId === currentPageId;

        // Save cursor position before navigating (only for page links, not block links)
        // Shift+Enter opens in new tab, so don't save in that case either
        if (!isBlockLink && !e.shiftKey) {
          saveCursorPosition();
        }

        // Disable unsaved changes warning before navigation
        disableNotionUnsavedWarning();

        if (e.shiftKey) {
          // Open in new tab
          window.open(selectedLink.href, "_blank");
          restoreNotionUnsavedWarning();
        } else {
          // Click to navigate
          selectedLink.click();
          setTimeout(() => {
            restoreNotionUnsavedWarning();
          }, 100);

          // For block links, update cursor position after navigation
          if (isBlockLink) {
            const blockId = selectedLink.href.split("#")[1].split("?")[0];

            setTimeout(() => {
              // Try to find the actual block element by its ID
              let blockElement = document.querySelector(
                `[data-block-id="${blockId}"]`,
              );

              // If not found, try with hyphens (UUID format)
              if (!blockElement) {
                const blockIdWithHyphens = blockId.replace(
                  /(.{8})(.{4})(.{4})(.{4})(.{12})/,
                  "$1-$2-$3-$4-$5",
                );
                blockElement = document.querySelector(
                  `[data-block-id="${blockIdWithHyphens}"]`,
                );
              }

              if (blockElement) {
                // Find the leaf element within this block
                const leafElement = blockElement.querySelector(
                  '[data-content-editable-leaf="true"]',
                );

                if (leafElement && document.contains(leafElement)) {
                  // Find this leaf in vim_info.lines
                  const actualIndex = vim_info.lines.findIndex(
                    (line) => line.element === leafElement,
                  );

                  if (actualIndex !== -1) {
                    vim_info.active_line = actualIndex;
                    vim_info.cursor_position = 0;

                    // Ensure the element is still in the document before updating cursor
                    if (
                      document.contains(vim_info.lines[actualIndex].element)
                    ) {
                      updateBlockCursor();
                    }
                  }
                }
              }
            }, 300);
          }
        }

        return true;

      case "d":
        e.preventDefault();
        e.stopPropagation();

        // Delete the block containing the selected link
        const linkToDelete = availableLinks[selectedLinkIndex];
        let blockElement = linkToDelete.closest("[data-block-id]");

        if (blockElement) {
          const editableElement = blockElement.querySelector(
            '[contenteditable="true"]',
          ) as HTMLElement;
          const focusableElement = blockElement.querySelector(
            "[tabindex]",
          ) as HTMLElement;

          if (editableElement) {
            // Normal block with contenteditable
            const range = document.createRange();
            range.selectNodeContents(editableElement);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);

            editableElement.focus();

            setTimeout(() => {
              const deleteEvent = new KeyboardEvent("keydown", {
                key: "Delete",
                code: "Delete",
                keyCode: 46,
                which: 46,
                bubbles: true,
                cancelable: true,
              });

              editableElement.dispatchEvent(deleteEvent);

              setTimeout(() => {
                const backspaceEvent = new KeyboardEvent("keydown", {
                  key: "Backspace",
                  code: "Backspace",
                  keyCode: 8,
                  which: 8,
                  bubbles: true,
                  cancelable: true,
                });

                editableElement.dispatchEvent(backspaceEvent);

                setTimeout(() => {
                  exitLinkSelectionMode();
                }, 50);
              }, 20);
            }, 10);
          } else if (focusableElement) {
            // Special block (like notion-page-block) without contenteditable

            // Clear any existing selection first (critical after tab switch)
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
            }

            // Simulate complete mouse interaction to properly select the block
            const blockEl = blockElement as HTMLElement;
            const rect = blockEl.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            // Mouse enter
            blockEl.dispatchEvent(
              new MouseEvent("mouseenter", {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
              }),
            );

            // Mouse down
            blockEl.dispatchEvent(
              new MouseEvent("mousedown", {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                button: 0,
              }),
            );

            // Mouse up
            blockEl.dispatchEvent(
              new MouseEvent("mouseup", {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                button: 0,
              }),
            );

            // Click
            blockEl.click();

            setTimeout(() => {
              // Dispatch Delete key to delete the selected block
              const deleteEvent = new KeyboardEvent("keydown", {
                key: "Delete",
                code: "Delete",
                keyCode: 46,
                which: 46,
                bubbles: true,
                cancelable: true,
              });

              document.dispatchEvent(deleteEvent);

              setTimeout(() => {
                exitLinkSelectionMode();
              }, 50);
            }, 300);
          }
        }

        return true;

      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        exitLinkSelectionMode();
        return true;

      default:
        // Any other key exits link selection mode
        exitLinkSelectionMode();
        break;
    }
  }

  // If we have a pending operator, handle it
  if (pending_operator) {
    return handlePendingOperator(e.key);
  }

  switch (e.key) {
    case "i":
      window.vim_info.mode = "insert";
      updateInfoContainer();
      return true;
    case "a":
      insertAfterCursor();
      return true;
    case "A":
      insertAtLineEnd();
      return true;
    case "I":
      insertAtLineStart();
      return true;
    case "o":
      // In code blocks, use custom line opening to stay within the block
      if (
        vim_info.lines[active_line] &&
        isInsideCodeBlock(vim_info.lines[active_line].element)
      ) {
        openLineBelowInCodeBlockWrapped();
        return true;
      }
      openLineBelow();
      return true;
    case "O":
      // In code blocks, use custom line opening to stay within the block
      if (
        vim_info.lines[active_line] &&
        isInsideCodeBlock(vim_info.lines[active_line].element)
      ) {
        openLineAboveInCodeBlockWrapped();
        return true;
      }
      openLineAbove();
      return true;

    case "Enter":
      // Check if current line is a TODO item and toggle it
      {
        const currentLine = vim_info.lines[vim_info.active_line];
        const blockElement = currentLine.element.closest("[data-block-id]");

        // Check if this is a TODO block by looking for the checkbox
        const isTodoBlock =
          blockElement?.className.includes("notion-to_do-block");
        const checkbox = blockElement?.querySelector(
          '[data-content-editable-void="true"]',
        );

        if (isTodoBlock && checkbox) {
          // This is a TODO item - toggle the checkbox
          const checkboxInput = checkbox.querySelector(
            'input[type="checkbox"]',
          );

          if (checkboxInput) {
            // Save current cursor position and line index before toggling
            const cursorPos = getCursorIndexInElement(currentLine.element);
            const savedActiveLine = vim_info.active_line;

            const checkboxEl = checkboxInput as HTMLElement;
            const rect = checkboxEl.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            // Simulate complete mouse interaction for reliable toggling
            checkboxEl.dispatchEvent(
              new MouseEvent("mouseenter", {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
              }),
            );

            checkboxEl.dispatchEvent(
              new MouseEvent("mousedown", {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                button: 0,
              }),
            );

            checkboxEl.dispatchEvent(
              new MouseEvent("mouseup", {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                button: 0,
              }),
            );

            checkboxEl.click();

            // Restore cursor position and active line after toggling
            setTimeout(() => {
              // Restore the active line index (may have been changed by events)
              vim_info.active_line = savedActiveLine;

              // Restore cursor position
              setCursorPosition(currentLine.element, cursorPos);
              currentLine.element.focus({ preventScroll: true });
              updateBlockCursor();
              updateInfoContainer();
            }, 10);

            return true; // Handled the Enter key
          }
        }

        // Not a TODO item, continue with link navigation logic
        // Check if current line contains a link
        const currentLineElement =
          vim_info.lines[vim_info.active_line]?.element;
        if (!currentLineElement) {
          return true;
        }

        const linkInCurrentLine = currentLineElement.querySelector("a[href]");

        if (linkInCurrentLine) {
          // Current line has a link - use detectAllLinks() to find closest link
          const allLinks = detectAllLinks();

          if (allLinks.length === 0) {
            return true;
          }

          const currentRect = currentLineElement.getBoundingClientRect();
          const currentY = currentRect.top + currentRect.height / 2;

          // Find the closest link to cursor position
          let closestLink: HTMLAnchorElement | null = null;
          let minDistance = Infinity;

          for (const link of allLinks) {
            const linkRect = link.getBoundingClientRect();
            const linkY = linkRect.top + linkRect.height / 2;
            const distance = Math.abs(linkY - currentY);

            if (distance < minDistance) {
              minDistance = distance;
              closestLink = link;
            }
          }

          if (closestLink) {
            // Helper to extract page ID (using regex like navigateToLink)
            const extractPageId = (url: string) => {
              const match = url.match(/([a-f0-9]{32})(\?|#|$)/);
              return match ? match[1] : null;
            };

            // Use navigateToLink to handle all link types consistently
            // Shift+Enter opens in new tab
            navigateToLink(closestLink, e.shiftKey, updateInfoContainer);

            // For block links, update cursor position after navigation
            const linkPageId = extractPageId(closestLink.href);
            const currentPageId = extractPageId(window.location.href);

            if (
              linkPageId === currentPageId &&
              closestLink.href.includes("#")
            ) {
              // Extract block ID from URL hash
              const blockId = closestLink.href.split("#")[1].split("?")[0];

              setTimeout(() => {
                // Try to find the actual block element by its ID
                let blockElement = document.querySelector(
                  `[data-block-id="${blockId}"]`,
                );

                // If not found, try with hyphens (UUID format)
                if (!blockElement) {
                  const blockIdWithHyphens = blockId.replace(
                    /(.{8})(.{4})(.{4})(.{4})(.{12})/,
                    "$1-$2-$3-$4-$5",
                  );
                  blockElement = document.querySelector(
                    `[data-block-id="${blockIdWithHyphens}"]`,
                  );
                }

                if (blockElement) {
                  // Find the leaf element within this block
                  const leafElement = blockElement.querySelector(
                    '[data-content-editable-leaf="true"]',
                  );

                  if (leafElement && document.contains(leafElement)) {
                    // Find this leaf in vim_info.lines
                    const actualIndex = vim_info.lines.findIndex(
                      (line) => line.element === leafElement,
                    );

                    if (actualIndex !== -1) {
                      vim_info.active_line = actualIndex;
                      vim_info.cursor_position = 0;

                      // Ensure the element is still in the document before updating cursor
                      if (
                        document.contains(vim_info.lines[actualIndex].element)
                      ) {
                        updateBlockCursor();
                      }
                    }
                  }
                }
              }, 300);
            }

            return true;
          }
        }

        // No link in current line - enter link selection mode
        // Find all links in the page (including block links and external URLs)
        const rootElement = vim_info.lines[0]?.element;
        if (
          rootElement &&
          rootElement.getAttribute("data-content-editable-root") === "true"
        ) {
          const currentRect = currentLineElement.getBoundingClientRect();
          const currentY = currentRect.top + currentRect.height / 2;

          // Find all links in root element
          const allRootLinks = Array.from(
            rootElement.querySelectorAll("a[href]"),
          ) as HTMLAnchorElement[];

          // Collect all links (Notion links, block links, and external URLs)
          const allNotionLinks: Array<{
            link: HTMLAnchorElement;
            distance: number;
            y: number;
          }> = [];

          for (const link of allRootLinks) {
            const href = link.href;
            if (href) {
              try {
                const linkRect = link.getBoundingClientRect();
                const linkY = linkRect.top + linkRect.height / 2;
                const distance = Math.abs(linkY - currentY);

                allNotionLinks.push({ link, distance, y: linkY });
              } catch (e) {
                continue;
              }
            }
          }

          if (allNotionLinks.length === 0) {
            return true;
          }

          // Sort by Y position (top to bottom) for j/k navigation
          allNotionLinks.sort((a, b) => a.y - b.y);

          // Find the link closest to current cursor position as initial selection
          let closestIndex = 0;
          let minDistance = Infinity;
          for (let i = 0; i < allNotionLinks.length; i++) {
            if (allNotionLinks[i].distance < minDistance) {
              minDistance = allNotionLinks[i].distance;
              closestIndex = i;
            }
          }

          // Enter selection mode
          setLinkSelectionMode(true);
          setAvailableLinks(allNotionLinks.map((item) => item.link));
          setSelectedLinkIndex(closestIndex);
          highlightSelectedLink();
          return true;
        }
      }
      return true;

    case "h":
      // In code blocks, use custom navigation to stay within the block
      if (
        vim_info.lines[active_line] &&
        isInsideCodeBlock(vim_info.lines[active_line].element)
      ) {
        moveCursorBackwardsInCodeBlock();
        return true;
      }
      moveCursorBackwards();
      return true;
    case "j":
      // In code blocks, move cursor down within the block
      if (
        vim_info.lines[active_line] &&
        isInsideCodeBlock(vim_info.lines[active_line].element)
      ) {
        moveCursorDownInCodeBlock();
        return true;
      }
      setActiveLine(active_line + 1);
      return true;
    case "k":
      // In code blocks, move cursor up within the block
      if (
        vim_info.lines[active_line] &&
        isInsideCodeBlock(vim_info.lines[active_line].element)
      ) {
        moveCursorUpInCodeBlock();
        return true;
      }
      setActiveLine(active_line - 1);
      return true;
    case "l":
      // In code blocks, use custom navigation to stay within the block
      if (
        vim_info.lines[active_line] &&
        isInsideCodeBlock(vim_info.lines[active_line].element)
      ) {
        moveCursorForwardsInCodeBlock();
        return true;
      }
      moveCursorForwards();
      return true;
    case "w":
      jumpToNextWord();
      return true;
    case "b":
      jumpToPreviousWord();
      return true;
    case "e":
      jumpToEndOfWord();
      return true;
    case "E":
      jumpToEndOfWORD();
      return true;
    case "W":
      jumpToNextWORD();
      return true;
    case "B":
      jumpToPreviousWORD();
      return true;
    case "{":
      jumpToPreviousParagraph();
      return true;
    case "}":
      jumpToNextParagraph();
      return true;
    case "0":
      jumpToLineStart();
      return true;
    case "$":
      jumpToLineEnd();
      return true;
    case "x":
      deleteCharacter();
      return true;
    case "X":
      deleteCharacterBefore();
      return true;
    case "s":
      substituteCharacter();
      return true;
    case "v":
      startVisualMode();
      return true;
    case "V":
      startVisualLineMode();
      return true;
    case "p":
      pasteAfterCursor();
      return true;
    case "P":
      pasteBeforeCursor();
      return true;
    case "y":
      window.vim_info.pending_operator = "y";
      return true;
    case "d":
      window.vim_info.pending_operator = "d";
      return true;
    case "D":
      // Delete to end of line (same as d$)
      deleteToEndOfLine();
      return true;
    case "c":
      window.vim_info.pending_operator = "c";
      return true;
    case "C":
      // Change to end of line (same as c$)
      changeToEndOfLine();
      return true;
    case "g":
      window.vim_info.pending_operator = "g";
      return true;
    case "G":
      // Jump to last line
      jumpToBottom();
      return true;
    case "H":
      // Go back in browser history
      // Save cursor position before navigating
      saveCursorPosition();
      // Temporarily disable unsaved changes warning
      disableNotionUnsavedWarning();
      window.history.back();
      // Reset flag immediately after initiating navigation
      setTimeout(() => {
        restoreNotionUnsavedWarning();
      }, 50);
      return true;
    case "L":
      // Go forward in browser history
      // Save cursor position before navigating
      saveCursorPosition();
      // Temporarily disable unsaved changes warning
      disableNotionUnsavedWarning();
      window.history.forward();
      // Reset flag immediately after initiating navigation
      setTimeout(() => {
        restoreNotionUnsavedWarning();
      }, 50);
      return true;
    case "f":
      window.vim_info.pending_operator = "f";
      return true;
    case "F":
      window.vim_info.pending_operator = "F";
      return true;
    case "t":
      window.vim_info.pending_operator = "t";
      return true;
    case "T":
      window.vim_info.pending_operator = "T";
      return true;
    case "u":
      undo();
      return true;
    case "r":
      redo();
      return true;
    case "Tab":
      // Let Notion handle Tab/Shift+Tab for indenting/outdenting bullet points
      return false;
    default:
      // Block all other keys in normal mode (including space, numbers, etc.)
      return true;
  }
};

// Get the first visible line in the viewport
const getFirstVisibleLine = (): number => {
  const { vim_info } = window;

  // Use getBoundingClientRect which gives position relative to viewport
  // A line is visible if its top is within the reasonable viewing area
  const viewportHeight = window.innerHeight;
  const viewportTop = 100; // Account for header
  const viewportBottom = viewportHeight - 100;

  for (let i = 0; i < vim_info.lines.length; i++) {
    const element = vim_info.lines[i].element;
    const rect = element.getBoundingClientRect();

    // Skip if element is too big (likely a container, not an individual line)
    if (rect.height > viewportHeight * 0.8) {
      continue;
    }

    // Check if element's top edge is visible in the middle portion of viewport
    if (rect.top >= viewportTop && rect.top <= viewportBottom) {
      return i;
    }
  }

  return vim_info.active_line; // Fallback to current line if none found
};

// setActiveLine now imported from core module

// refreshLines created via factory below after handleKeydown and handleClick are defined

// Create refreshLines and setLines using factories (must be after handleKeydown and handleClick are defined)
const refreshLines = createRefreshLines({ handleKeydown, handleClick });
const setLines = createSetLines({ handleKeydown, handleClick }, refreshLines);

// Create paragraph operators using factory
const {
  yankInnerParagraph,
  yankAroundParagraph,
  deleteInnerParagraph,
  deleteAroundParagraph,
  changeInnerParagraph,
  changeAroundParagraph,
} = createParagraphOperators({ updateInfoContainer, refreshLines, setActiveLine });

// Create word operators using factory
const {
  yankInnerWord,
  yankAroundWord,
  deleteInnerWord,
  deleteAroundWord,
  changeInnerWord,
  changeAroundWord,
} = createWordOperators({ updateInfoContainer });

// Create bracket operators using factory
const {
  yankInnerBracket,
  yankAroundBracket,
  deleteInnerBracket,
  deleteAroundBracket,
  changeInnerBracket,
  changeAroundBracket,
} = createBracketOperators({ updateInfoContainer });

// Create motion yank operators using factory
const yankCurrentLine = createYankCurrentLine();
const yankToNextWord = createYankToNextWord();
const yankToEndOfLine = createYankToEndOfLine();
const yankToBeginningOfLine = createYankToBeginningOfLine();
const yankToPreviousParagraph = createYankToPreviousParagraph();
const yankToNextParagraph = createYankToNextParagraph();

// Create navigation wrappers that need access to updateInfoContainer and refreshLines
const jumpToTop = createJumpToTop(updateInfoContainer);
const jumpToBottom = createJumpToBottom(refreshLines, updateInfoContainer);

// Wrap code block functions to call updateInfoContainer
const openLineBelowInCodeBlockWrapped = () => {
  openLineBelowInCodeBlock();
  updateInfoContainer();
};

const openLineAboveInCodeBlockWrapped = () => {
  openLineAboveInCodeBlock();
  updateInfoContainer();
};

(() => {
  initVimInfo();
  createInfoContainer();
  // Set initial cursor style for normal mode
  document.body.classList.add("vim-normal-mode");

  // Load settings
  loadSettings();

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync") {
      loadSettings();
    }
  });

  // Clear any saved cursor position for current URL on initial page load
  // (This prevents restoring stale positions from previous sessions)
  try {
    const currentUrl = window.location.href.split("#")[0];
    const savedPositions = sessionStorage.getItem("vimtion_cursor_positions");
    if (savedPositions) {
      const positionsMap: Record<string, any> = JSON.parse(savedPositions);
      if (positionsMap[currentUrl]) {
        delete positionsMap[currentUrl];
        sessionStorage.setItem(
          "vimtion_cursor_positions",
          JSON.stringify(positionsMap),
        );
      }
    }

    // Clear the intentional navigation flag on initial page load (reload)
    sessionStorage.removeItem("vimtion_intentional_navigation");

    // Also reset vim_info.active_line to 0 to ensure clean state
    // (Notion might auto-focus elements during page load, which could set active_line)
    window.vim_info.active_line = 0;
  } catch (e) {
    // Ignore errors
  }

  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const f = Array.from(document.querySelectorAll("[contenteditable=true]"));

    if (f.length > 0) {
      clearInterval(poll);
      setLines(f as HTMLDivElement[]);
    }

    if (attempts > 40) {
      clearInterval(poll);
      console.error("[Vim-Notion] Timed out waiting for editable elements");
    }
  }, 250);

  // Function to reinitialize Vimtion after navigation
  let isReinitializing = false;
  const reinitializeAfterNavigation = () => {
    if (isReinitializing) {
      return;
    }

    isReinitializing = true;

    // Reset active_line to prevent old page state from leaking
    window.vim_info.active_line = 0;

    // Exit link selection mode if active (old page's link references)
    if (linkSelectionMode) {
      exitLinkSelectionMode();
    }

    // Restore focus to Notion after navigation (fixes drag handle visibility)
    const mouseEnterEvent = new MouseEvent("mouseenter", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    document.body.dispatchEvent(mouseEnterEvent);

    // Wait a bit for Notion to render the new page
    setTimeout(() => {
      const editableElements = Array.from(
        document.querySelectorAll("[contenteditable=true]"),
      ) as HTMLDivElement[];

      // Wait for at least 3 elements to ensure page is fully loaded
      // (Notion pages typically have multiple editable blocks)
      if (editableElements.length >= 3) {
        setLines(editableElements);

        // Restore cursor position after navigation (if available)
        // Only restore if this is an intentional navigation (gl, Shift+H/L), not a reload
        const currentUrl = window.location.href.split("#")[0];
        const isIntentionalNavigation =
          sessionStorage.getItem("vimtion_intentional_navigation") === "true";

        if (isIntentionalNavigation) {
          // Clear the flag immediately after reading it
          sessionStorage.removeItem("vimtion_intentional_navigation");
          restoreCursorPosition();
        } else {
          // Clear saved position for current URL since it's a reload
          try {
            const savedPositions = sessionStorage.getItem(
              "vimtion_cursor_positions",
            );
            if (savedPositions) {
              const positionsMap: Record<string, any> =
                JSON.parse(savedPositions);
              if (positionsMap[currentUrl]) {
                delete positionsMap[currentUrl];
                sessionStorage.setItem(
                  "vimtion_cursor_positions",
                  JSON.stringify(positionsMap),
                );
              }
            }
          } catch (e) {
            // Ignore errors
          }
        }

        // Reset flag after a delay to prevent immediate re-initialization
        setTimeout(() => {
          isReinitializing = false;
        }, 500);
      } else if (editableElements.length > 0) {
        // Page is still loading, wait a bit longer
        isReinitializing = false;
        setTimeout(reinitializeAfterNavigation, 200);
      } else {
        // Retry after a longer delay if elements not found yet
        isReinitializing = false;
        setTimeout(reinitializeAfterNavigation, 500);
      }
    }, 300);
  };

  // Listen for scroll events to update cursor position when active line goes off-screen
  let scrollTimeout: number | null = null;
  const handleScroll = () => {
    // Debounce scroll events
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }

    scrollTimeout = setTimeout(() => {
      const { vim_info } = window;

      // Only adjust in normal mode
      if (vim_info.mode !== "normal") {
        return;
      }

      // Check if active line is still visible
      const activeElement = vim_info.lines[vim_info.active_line]?.element;
      if (!activeElement) {
        return;
      }

      const rect = activeElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // If active line is off-screen, move cursor to first visible line
      if (rect.top < 0 || rect.bottom > viewportHeight) {
        const firstVisibleLine = getFirstVisibleLine();

        // Only update if we found a different visible line
        if (firstVisibleLine !== vim_info.active_line) {
          vim_info.active_line = firstVisibleLine;
          vim_info.desired_column = 0;

          const targetElement = vim_info.lines[firstVisibleLine]?.element;
          if (targetElement) {
            setCursorPosition(targetElement, 0);
            // Don't call focus here to avoid triggering scroll
            updateBlockCursor();
            updateInfoContainer();
          }
        }
      } else {
        // Active line is still visible, just update block cursor position
        updateBlockCursor();
      }
    }, 100); // 100ms debounce
  };

  window.addEventListener("scroll", handleScroll, true);

  // Listen for browser history navigation (back/forward buttons, H/L keys)
  window.addEventListener("popstate", () => {
    reinitializeAfterNavigation();
  });

  // Monitor URL changes by polling (for SPA navigation like link clicks)
  // Extract page ID from URL (the part after the last dash before query/hash)
  const extractPageId = (url: string): string | null => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      // Match pattern: /slug-[32 char hex ID] or /[32 char hex ID]
      const match = pathname.match(/([a-f0-9]{32})$/i);
      return match ? match[1] : pathname;
    } catch {
      return null;
    }
  };

  let lastPageId = extractPageId(window.location.href);
  setInterval(() => {
    const currentPageId = extractPageId(window.location.href);
    // Only reinitialize if we actually navigated to a different page
    // Ignore URL changes that are just slug updates (title edits)
    if (currentPageId !== lastPageId) {
      lastPageId = currentPageId;
      reinitializeAfterNavigation();
    }
  }, 500);
})();
