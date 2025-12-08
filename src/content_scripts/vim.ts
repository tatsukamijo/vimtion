/**
 * Vimtion - Vim keybindings for Notion
 *
 * Copyright (c) 2024 Tatsuya Kamijo
 * Copyright (c) 2020 Luke Ingalls
 *
 * Licensed under ISC License
 * See LICENSE file for details
 */

const createInfoContainer = () => {
  const { vim_info } = window;
  const infoContainer = document.createElement("div");
  infoContainer.classList.add("vim-info-container");
  const mode = document.createElement("div");
  mode.innerText = getModeText(vim_info.mode);
  mode.classList.add("vim-mode");
  infoContainer.appendChild(mode);
  document.body.appendChild(infoContainer);
};

const createBlockCursor = () => {
  const cursor = document.createElement("div");
  cursor.classList.add("vim-block-cursor");
  cursor.style.display = "none";
  document.body.appendChild(cursor);
  return cursor;
};

const updateBlockCursor = () => {
  const { vim_info } = window;
  let blockCursor = document.querySelector(".vim-block-cursor") as HTMLDivElement;

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
  const rect = range.getBoundingClientRect();

  // For empty lines, use the element's bounding rect
  if (rect.width === 0 && rect.height === 0) {
    const currentElement = vim_info.lines[vim_info.active_line]?.element;
    if (currentElement) {
      const elementRect = currentElement.getBoundingClientRect();
      blockCursor.style.display = "block";
      blockCursor.style.left = `${elementRect.left + window.scrollX}px`;
      blockCursor.style.top = `${elementRect.top + window.scrollY}px`;
      blockCursor.style.height = `${elementRect.height || 20}px`;
      return;
    }
    blockCursor.style.display = "none";
    return;
  }

  // Position the block cursor
  blockCursor.style.display = "block";
  blockCursor.style.left = `${rect.left + window.scrollX}px`;
  blockCursor.style.top = `${rect.top + window.scrollY}px`;
  blockCursor.style.height = `${rect.height || 20}px`;
};

const jumpToNextWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  let pos = currentCursorPosition;

  // Skip current word (alphanumeric characters)
  while (pos < text.length && /\w/.test(text[pos])) {
    pos++;
  }

  // Skip non-word characters (spaces, punctuation)
  while (pos < text.length && !/\w/.test(text[pos])) {
    pos++;
  }

  // If we reached end of line, move to next line
  if (pos >= text.length && vim_info.active_line < vim_info.lines.length - 1) {
    setActiveLine(vim_info.active_line + 1);
    const nextElement = vim_info.lines[vim_info.active_line].element;
    setCursorPosition(nextElement, 0);
    vim_info.desired_column = 0;
    return;
  }

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

const jumpToPreviousWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // If at beginning of line, move to end of previous line
  if (currentCursorPosition === 0) {
    if (vim_info.active_line > 0) {
      setActiveLine(vim_info.active_line - 1);
      const prevElement = vim_info.lines[vim_info.active_line].element;
      const prevLineLength = prevElement.textContent?.length || 0;
      setCursorPosition(prevElement, prevLineLength);
      vim_info.desired_column = prevLineLength;
    }
    return;
  }

  let pos = currentCursorPosition - 1;

  // Skip non-word characters (spaces, punctuation) backwards
  while (pos > 0 && !/\w/.test(text[pos])) {
    pos--;
  }

  // Skip current word backwards
  while (pos > 0 && /\w/.test(text[pos - 1])) {
    pos--;
  }

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

const jumpToEndOfWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  let pos = currentCursorPosition;

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
  if (pos < currentCursorPosition) pos = currentCursorPosition; // Don't move backward

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

const jumpToEndOfWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  let pos = currentCursorPosition;

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
  if (pos < currentCursorPosition) pos = currentCursorPosition; // Don't move backward

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

const jumpToNextWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  let pos = currentCursorPosition;

  // Skip non-whitespace characters
  while (pos < text.length && !/\s/.test(text[pos])) {
    pos++;
  }

  // Skip whitespace
  while (pos < text.length && /\s/.test(text[pos])) {
    pos++;
  }

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

const jumpToPreviousWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  if (currentCursorPosition === 0) return;

  let pos = currentCursorPosition - 1;

  // Skip whitespace backwards
  while (pos > 0 && /\s/.test(text[pos])) {
    pos--;
  }

  // Skip non-whitespace backwards to find WORD start
  while (pos > 0 && !/\s/.test(text[pos - 1])) {
    pos--;
  }

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

const jumpToLineStart = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;

  setCursorPosition(currentElement, 0);
  vim_info.desired_column = 0;
};

const jumpToLineEnd = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const lineLength = currentElement.textContent?.length || 0;

  setCursorPosition(currentElement, lineLength);
  vim_info.desired_column = lineLength;
};

const findCharForward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Search for character after current position
  const foundIndex = text.indexOf(char, currentPos + 1);
  if (foundIndex !== -1) {
    setCursorPosition(currentElement, foundIndex);
    vim_info.desired_column = foundIndex;
  } else {
  }
};

const findCharBackward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Search for character before current position
  const foundIndex = text.lastIndexOf(char, currentPos - 1);
  if (foundIndex !== -1) {
    setCursorPosition(currentElement, foundIndex);
    vim_info.desired_column = foundIndex;
  } else {
  }
};

const tillCharForward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Search for character after current position, but stop one before it
  const foundIndex = text.indexOf(char, currentPos + 1);
  if (foundIndex !== -1) {
    const targetPos = foundIndex - 1;
    setCursorPosition(currentElement, targetPos);
    vim_info.desired_column = targetPos;
  } else {
  }
};

const tillCharBackward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Search for character before current position, but stop one after it
  const foundIndex = text.lastIndexOf(char, currentPos - 1);
  if (foundIndex !== -1) {
    const targetPos = foundIndex + 1;
    setCursorPosition(currentElement, targetPos);
    vim_info.desired_column = targetPos;
  } else {
  }
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
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
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
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    currentElement.dispatchEvent(enterEvent);

    // After Enter, cursor is on the new line below
    // We need to move the cursor back up to the empty line we just created
    setTimeout(() => {
      const arrowUpEvent = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        code: 'ArrowUp',
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
    document.execCommand('cut');
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
  const newText = text.slice(0, currentCursorPosition - 1) + text.slice(currentCursorPosition);
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
    document.execCommand('delete');
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

const getCursorIndex = () => {
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

const getModeText = (mode: "insert" | "normal" | "visual" | "visual-line") => {
  return `-- ${mode.toUpperCase()} --`;
};

const setCursorPosition = (element: Element, index: number) => {

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
    const isInRange = index >= i && index <= i + node.textContent.length;
    if (isInRange && node.nodeType === Node.ELEMENT_NODE) {
      setCursorPosition(node as Element, index - i);
      break;
    }
    if (isInRange) {
      const range = document.createRange();
      const selection = window.getSelection();

      range.setStart(node, index - i);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      updateBlockCursor();
      break;
    }
    i += node.textContent.length;
  }
};

const handleClick = (e: MouseEvent) => {
  const { vim_info } = window;

  // Only handle clicks in normal mode
  if (vim_info.mode !== "normal") {
    return;
  }

  // Find which line was clicked
  const target = e.target as HTMLElement;
  const clickedElement = target.closest('[contenteditable="true"]') as HTMLDivElement;

  if (!clickedElement) {
    return;
  }

  // Find the line index
  const lineIndex = vim_info.lines.findIndex((line: any) => line.element === clickedElement);

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
        null
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
  } else {
    insertReducer(e);
  }
};

const initVimInfo = () => {
  const vim_info = {
    active_line: 0,
    cursor_position: 0,
    desired_column: 0, // Remember cursor column for j/k navigation
    lines: [] as any,
    mode: "normal" as "normal" | "insert" | "visual" | "visual-line",
    visual_start_line: 0,
    visual_start_pos: 0,
    pending_operator: null as "y" | "d" | "c" | "yi" | "di" | "ci" | "ya" | "da" | "ca" | "vi" | "va" | "g" | "f" | "F" | "t" | "T" | "df" | "dF" | "dt" | "dT" | "cf" | "cF" | "ct" | "cT" | null, // For commands like yy, dd, gg, ff, df, etc.
    undo_count: 0, // Track number of native undo operations in current group
    in_undo_group: false, // Whether we're currently in a grouped operation
  };
  window.vim_info = vim_info;
};

const insertReducer = (e: KeyboardEvent) => {
  switch (e.key) {
    case "Escape":
      e.preventDefault();
      e.stopPropagation();
      window.vim_info.mode = "normal";
      updateInfoContainer();
      break;
    default:
      break;
  }
  return;
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

const clearAllBackgroundColors = () => {
  // Clear background colors from ALL contenteditable elements in the document
  const allEditableElements = document.querySelectorAll("[contenteditable=true]");
  allEditableElements.forEach((elem) => {
    (elem as HTMLElement).style.backgroundColor = '';
  });
};

const startVisualLineMode = () => {
  const { vim_info } = window;

  vim_info.mode = "visual-line";
  vim_info.visual_start_line = vim_info.active_line;
  vim_info.visual_start_pos = 0; // Not used in line mode, but set for consistency

  updateVisualLineSelection();
  updateInfoContainer();
};

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
  const [firstLine, lastLine] = startLine <= endLine
    ? [startLine, endLine]
    : [endLine, startLine];

  // Highlight all lines in range
  for (let i = firstLine; i <= lastLine; i++) {
    const element = vim_info.lines[i].element;
    element.style.backgroundColor = 'rgba(102, 126, 234, 0.3)';
  }

  // Set range to cover all lines from first to last
  const firstElement = vim_info.lines[firstLine].element;
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

  selection?.removeAllRanges();
  selection?.addRange(range);
};

// Helper function to set range in an element
const setRangeInElement = (range: Range, element: Node, start: number, end: number) => {
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

  const [selStart, selEnd] = startPos <= currentPos
    ? [startPos, Math.min(currentPos + 1, lineLength)]  // Include character under cursor, but don't exceed line length
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

const visualReducer = (e: KeyboardEvent): boolean => {
  const { vim_info } = window;

  // Allow Notion shortcuts with Cmd (macOS) or Alt modifier keys
  // Note: Ctrl is reserved for Vim shortcuts (Ctrl+d, Ctrl+u, etc.)
  if (e.metaKey || e.altKey) {
    return false;
  }

  // Handle pending text object operators
  if (vim_info.pending_operator === "vi") {
    // Visual inner text object
    if (e.key === "w") {
      visualSelectInnerWord();
      vim_info.pending_operator = null;
      return true;
    }
    vim_info.pending_operator = null;
    return true;
  } else if (vim_info.pending_operator === "va") {
    // Visual around text object
    if (e.key === "w") {
      visualSelectAroundWord();
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
    case "d":
    case "x":
      deleteVisualLineSelection();
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
  const nextLine = vim_info.active_line + 1;

  if (nextLine >= vim_info.lines.length) return;

  vim_info.active_line = nextLine;
  updateVisualLineSelection();
  updateInfoContainer();
};

const visualLineMoveCursorUp = () => {
  const { vim_info } = window;
  const prevLine = vim_info.active_line - 1;

  if (prevLine < 0) return;

  vim_info.active_line = prevLine;
  updateVisualLineSelection();
  updateInfoContainer();
};

const deleteVisualLineSelection = () => {
  const { vim_info } = window;

  const startLine = vim_info.visual_start_line;
  const endLine = vim_info.active_line;

  // Determine the range of lines to delete
  const [firstLine, lastLine] = startLine <= endLine
    ? [startLine, endLine]
    : [endLine, startLine];

  // Collect text from all lines for clipboard
  const textLines: string[] = [];
  for (let i = firstLine; i <= lastLine; i++) {
    textLines.push(vim_info.lines[i].element.textContent || '');
  }
  const clipboardText = textLines.join('\n');

  // Copy to clipboard
  navigator.clipboard.writeText(clipboardText).catch(err => {
    console.error('[Vim-Notion] Failed to copy to clipboard:', err);
  });

  // Clear background highlights from all elements before deletion
  clearAllBackgroundColors();

  // Get all blocks to delete
  const blocksToDelete: Element[] = [];

  for (let i = firstLine; i <= lastLine; i++) {
    const element = vim_info.lines[i].element;
    const block = element.closest('[data-block-id]') || element.parentElement?.parentElement;
    if (block && !blocksToDelete.includes(block)) {
      blocksToDelete.push(block);
    }
  }

  if (blocksToDelete.length === 0) {
    vim_info.mode = "normal";
    updateInfoContainer();
    return;
  }

  // Switch to insert mode temporarily
  vim_info.mode = "insert";

  // Start undo group for multi-line deletion
  vim_info.in_undo_group = true;
  vim_info.undo_count = blocksToDelete.length;

  // Delete each block one by one from last to first to maintain indices
  deleteBlocksSequentially(blocksToDelete.slice().reverse(), firstLine);

  function deleteBlocksSequentially(blocks: Element[], targetLine: number) {
    if (blocks.length === 0) {
      // All blocks deleted, restore normal mode and update cursor
      vim_info.mode = "normal";
      vim_info.in_undo_group = false;
      window.getSelection()?.removeAllRanges();

      setTimeout(() => {
        refreshLines();
        const newActiveLine = Math.max(0, Math.min(targetLine, vim_info.lines.length - 1));
        if (vim_info.lines.length > 0) {
          setActiveLine(newActiveLine);
        }
        updateInfoContainer();
      }, 100);
      return;
    }

    const block = blocks[0];
    const element = block.querySelector('[contenteditable="true"]') as HTMLElement;

    if (!element) {
      // Skip this block and continue
      deleteBlocksSequentially(blocks.slice(1), targetLine);
      return;
    }

    // Select the content
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Focus and delete
    element.focus();

    setTimeout(() => {
      // Delete content
      const deleteEvent = new KeyboardEvent('keydown', {
        key: 'Delete',
        code: 'Delete',
        keyCode: 46,
        which: 46,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(deleteEvent);

      // Delete empty block
      setTimeout(() => {
        const backspaceEvent = new KeyboardEvent('keydown', {
          key: 'Backspace',
          code: 'Backspace',
          keyCode: 8,
          which: 8,
          bubbles: true,
          cancelable: true,
        });
        element.dispatchEvent(backspaceEvent);

        // Continue with next block
        setTimeout(() => {
          deleteBlocksSequentially(blocks.slice(1), targetLine);
        }, 10);
      }, 10);
    }, 10);
  }
};

const yankVisualSelection = () => {
  const { vim_info } = window;

  // Use execCommand('copy') to copy to clipboard without deleting
  document.execCommand('copy');

  vim_info.mode = "normal";
  window.getSelection()?.removeAllRanges();
  updateInfoContainer();
};

const yankVisualLineSelection = () => {
  const { vim_info } = window;

  // Use execCommand('copy') to copy to clipboard without deleting
  document.execCommand('copy');

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
    const newText = text.slice(0, pastePosition) + clipboardText + text.slice(pastePosition);
    currentElement.textContent = newText;

    // Move cursor to end of pasted text
    const newCursorPosition = pastePosition + clipboardText.length - 1;
    setCursorPosition(currentElement, newCursorPosition);
    vim_info.desired_column = newCursorPosition;
  } catch (err) {
    console.error('[Vim-Notion] Failed to paste:', err);
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
    const newText = text.slice(0, currentCursorPosition) + clipboardText + text.slice(currentCursorPosition);
    currentElement.textContent = newText;

    // Move cursor to end of pasted text
    const newCursorPosition = currentCursorPosition + clipboardText.length - 1;
    setCursorPosition(currentElement, newCursorPosition);
    vim_info.desired_column = newCursorPosition;
  } catch (err) {
    console.error('[Vim-Notion] Failed to paste:', err);
  }
};

const yankCurrentLine = async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";

  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error('[Vim-Notion] Failed to yank:', err);
  }
};

const yankToNextWord = async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  let pos = currentCursorPosition;

  // Skip current word (alphanumeric characters)
  while (pos < text.length && /\w/.test(text[pos])) {
    pos++;
  }

  // Skip non-word characters (spaces, punctuation)
  while (pos < text.length && !/\w/.test(text[pos])) {
    pos++;
  }

  const yankedText = text.slice(currentCursorPosition, pos);

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error('[Vim-Notion] Failed to yank:', err);
  }
};

const yankToEndOfLine = async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const yankedText = text.slice(currentCursorPosition);

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error('[Vim-Notion] Failed to yank:', err);
  }
};

const yankToBeginningOfLine = async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const yankedText = text.slice(0, currentCursorPosition);

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error('[Vim-Notion] Failed to yank:', err);
  }
};

const getInnerWordBounds = (text: string, pos: number): [number, number] => {
  let start = pos;
  let end = pos;

  // If not on a word character, return empty range
  if (!/\w/.test(text[pos])) {
    return [pos, pos];
  }

  // Find start of word
  while (start > 0 && /\w/.test(text[start - 1])) {
    start--;
  }

  // Find end of word
  while (end < text.length && /\w/.test(text[end])) {
    end++;
  }

  return [start, end];
};

const getAroundWordBounds = (text: string, pos: number): [number, number] => {
  let start = pos;
  let end = pos;

  // If not on a word character, return empty range
  if (!/\w/.test(text[pos])) {
    return [pos, pos];
  }

  // Find start of word
  while (start > 0 && /\w/.test(text[start - 1])) {
    start--;
  }

  // Find end of word
  while (end < text.length && /\w/.test(text[end])) {
    end++;
  }

  // Include trailing whitespace if present
  while (end < text.length && /\s/.test(text[end])) {
    end++;
  }

  // If no trailing whitespace, include leading whitespace instead
  if (end === start + (pos - start) + (text.slice(pos).match(/^\w+/)?.[0].length || 0)) {
    while (start > 0 && /\s/.test(text[start - 1])) {
      start--;
    }
  }

  return [start, end];
};

const yankInnerWord = async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const [start, end] = getInnerWordBounds(text, currentCursorPosition);
  const yankedText = text.slice(start, end);

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error('[Vim-Notion] Failed to yank:', err);
  }
};

const deleteCurrentLine = async () => {
  const { vim_info } = window;
  const currentLineIndex = vim_info.active_line;
  const currentElement = vim_info.lines[currentLineIndex].element;

  // Copy line content to clipboard
  const lineText = currentElement.textContent || '';
  navigator.clipboard.writeText(lineText).catch(err => {
    console.error('[Vim-Notion] Failed to copy to clipboard:', err);
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
    const deleteEvent = new KeyboardEvent('keydown', {
      key: 'Delete',
      code: 'Delete',
      keyCode: 46,
      which: 46,
      bubbles: true,
      cancelable: true,
    });

    currentElement.dispatchEvent(deleteEvent);

    // After deleting content, press Backspace to delete the empty block
    setTimeout(() => {
      const backspaceEvent = new KeyboardEvent('keydown', {
        key: 'Backspace',
        code: 'Backspace',
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

        const newActiveLine = Math.max(0, Math.min(currentLineIndex - 1, vim_info.lines.length - 1));
        if (vim_info.lines.length > 0) {
          setActiveLine(newActiveLine);
        }
      }, 50);
    }, 20);
  }, 10);
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

    document.execCommand('cut');
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

const deleteInnerWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const [start, end] = getInnerWordBounds(text, currentCursorPosition);
  const deletedText = text.slice(start, end);

  // Copy to clipboard (Vim's delete yanks)
  navigator.clipboard.writeText(deletedText).catch(err => {
    console.error('[Vim-Notion] Failed to copy to clipboard:', err);
  });

  const newText = text.slice(0, start) + text.slice(end);
  currentElement.textContent = newText;

  setCursorPosition(currentElement, start);
  vim_info.desired_column = start;
};

// Helper function to find matching brackets/quotes
const findMatchingBrackets = (text: string, cursorPos: number, openChar: string, closeChar: string): [number, number] | null => {
  // Find the opening bracket before cursor
  let openIndex = -1;
  let closeIndex = -1;
  let depth = 0;

  // Search backward for opening bracket
  for (let i = cursorPos; i >= 0; i--) {
    if (text[i] === closeChar) {
      depth++;
    } else if (text[i] === openChar) {
      if (depth === 0) {
        openIndex = i;
        break;
      }
      depth--;
    }
  }

  // If not found backward, search forward
  if (openIndex === -1) {
    depth = 0;
    for (let i = cursorPos; i < text.length; i++) {
      if (text[i] === closeChar) {
        depth++;
      } else if (text[i] === openChar) {
        if (depth === 0) {
          openIndex = i;
          break;
        }
        depth--;
      }
    }
  }

  if (openIndex === -1) return null;

  // Search forward for matching closing bracket
  depth = 0;
  for (let i = openIndex + 1; i < text.length; i++) {
    if (text[i] === openChar) {
      depth++;
    } else if (text[i] === closeChar) {
      if (depth === 0) {
        closeIndex = i;
        break;
      }
      depth--;
    }
  }

  if (closeIndex === -1) return null;

  return [openIndex, closeIndex];
};

const deleteInnerBracket = (openChar: string, closeChar: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const result = findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);
  if (!result) return;

  const [openIndex, closeIndex] = result;
  const deletedText = text.slice(openIndex + 1, closeIndex);

  // Copy to clipboard (Vim's delete yanks)
  navigator.clipboard.writeText(deletedText).catch(err => {
    console.error('[Vim-Notion] Failed to copy to clipboard:', err);
  });

  const newText = text.slice(0, openIndex + 1) + text.slice(closeIndex);
  currentElement.textContent = newText;

  setCursorPosition(currentElement, openIndex + 1);
  vim_info.desired_column = openIndex + 1;
};

const deleteAroundBracket = (openChar: string, closeChar: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const result = findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);
  if (!result) return;

  const [openIndex, closeIndex] = result;
  const deletedText = text.slice(openIndex, closeIndex + 1);

  // Copy to clipboard (Vim's delete yanks)
  navigator.clipboard.writeText(deletedText).catch(err => {
    console.error('[Vim-Notion] Failed to copy to clipboard:', err);
  });

  const newText = text.slice(0, openIndex) + text.slice(closeIndex + 1);
  currentElement.textContent = newText;

  setCursorPosition(currentElement, openIndex);
  vim_info.desired_column = openIndex;
};

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

const changeInnerWord = () => {
  deleteInnerWord();
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const yankAroundWord = async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const [start, end] = getAroundWordBounds(text, currentCursorPosition);
  const yankedText = text.slice(start, end);

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error('[Vim-Notion] Failed to yank:', err);
  }
};

const deleteAroundWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const [start, end] = getAroundWordBounds(text, currentCursorPosition);
  const deletedText = text.slice(start, end);

  // Copy to clipboard (Vim's delete yanks)
  navigator.clipboard.writeText(deletedText).catch(err => {
    console.error('[Vim-Notion] Failed to copy to clipboard:', err);
  });

  const newText = text.slice(0, start) + text.slice(end);
  currentElement.textContent = newText;

  setCursorPosition(currentElement, start);
  vim_info.desired_column = start;
};

const changeAroundWord = () => {
  deleteAroundWord();
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const changeInnerBracket = (openChar: string, closeChar: string) => {
  deleteInnerBracket(openChar, closeChar);
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const changeAroundBracket = (openChar: string, closeChar: string) => {
  deleteAroundBracket(openChar, closeChar);
  window.vim_info.mode = "insert";
  updateInfoContainer();
};

const yankInnerBracket = (openChar: string, closeChar: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const result = findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);
  if (!result) return;

  const [openIndex, closeIndex] = result;
  const textToYank = text.slice(openIndex + 1, closeIndex);
  navigator.clipboard.writeText(textToYank);
};

const yankAroundBracket = (openChar: string, closeChar: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const result = findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);
  if (!result) return;

  const [openIndex, closeIndex] = result;
  const textToYank = text.slice(openIndex, closeIndex + 1);
  navigator.clipboard.writeText(textToYank);
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
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
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
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
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
  document.execCommand('cut');

  vim_info.mode = "normal";
  window.getSelection()?.removeAllRanges();
  updateInfoContainer();
};

const getCursorIndexInElement = (element: Element): number => {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }

  const range = selection.getRangeAt(0);
  let i = 0;

  const checkElementNode = (el: Element): boolean => {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (checkElementNode(node as Element)) {
          return true;
        }
        continue;
      }
      if (node.isSameNode(range.startContainer)) {
        i += range.startOffset;
        return true;
      }
      i += node.textContent?.length || 0;
    }
    return false;
  };

  checkElementNode(element);
  return i;
};

const moveCursorBackwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);


  // If at beginning of line, move to end of previous line
  if (currentCursorPosition === 0) {
    if (vim_info.active_line > 0) {
      setActiveLine(vim_info.active_line - 1);
      const prevElement = vim_info.lines[vim_info.active_line].element;
      const prevLineLength = prevElement.textContent?.length || 0;
      setCursorPosition(prevElement, prevLineLength);
      vim_info.desired_column = prevLineLength;
    }
    return;
  }

  const newPosition = currentCursorPosition - 1;
  setCursorPosition(currentElement, newPosition);
  vim_info.desired_column = newPosition; // Remember this column
};

const moveCursorForwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const lineLength = currentElement.textContent?.length || 0;


  // If at end of line, move to next line
  if (currentCursorPosition >= lineLength) {
    if (vim_info.active_line < vim_info.lines.length - 1) {
      setActiveLine(vim_info.active_line + 1);
      const nextElement = vim_info.lines[vim_info.active_line].element;
      setCursorPosition(nextElement, 0);
      vim_info.desired_column = 0;
    }
    return;
  }

  const newPosition = currentCursorPosition + 1;
  setCursorPosition(currentElement, newPosition);
  vim_info.desired_column = newPosition; // Remember this column
};

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
      openLineBelow();
      return true;
    case "O":
      openLineAbove();
      return true;
    case "h":
      moveCursorBackwards();
      return true;
    case "j":
      setActiveLine(active_line + 1);
      return true;
    case "k":
      setActiveLine(active_line - 1);
      return true;
    case "l":
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

// Find the actual scrollable element in Notion's DOM
const findScrollableContainer = (): HTMLElement => {
  // The main content scroller is inside .notion-frame
  // We need to find the scroller that contains our editable elements
  const { vim_info } = window;

  // Get the current active element to find its scroll container
  const activeElement = vim_info.lines[vim_info.active_line]?.element;

  if (activeElement) {
    // Walk up the DOM tree to find the scrollable container
    let parent = activeElement.parentElement;
    while (parent) {
      if (parent.classList.contains('notion-scroller') &&
          parent.scrollHeight > parent.clientHeight) {
        return parent;
      }
      parent = parent.parentElement;
    }
  }

  // Fallback: find .notion-scroller within .notion-frame (not in sidebar)
  const frame = document.querySelector('.notion-frame');
  if (frame) {
    const scroller = frame.querySelector('.notion-scroller') as HTMLElement;
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      return scroller;
    }
  }

  return document.documentElement;
};

// Scroll by a fraction of the viewport height and move cursor to first visible line
const scrollAndMoveCursor = (pageAmount: number) => {
  const { vim_info } = window;

  const scrollContainer = findScrollableContainer();
  const scrollAmount = window.innerHeight * pageAmount;
  const currentScroll = scrollContainer === document.documentElement ? window.scrollY : scrollContainer.scrollTop;
  const newScroll = Math.max(0, currentScroll + scrollAmount);

  // Perform smooth scroll on the correct container
  if (scrollContainer === document.documentElement) {
    window.scrollTo({
      top: newScroll,
      behavior: 'smooth'
    });
  } else {
    scrollContainer.scrollTo({
      top: newScroll,
      behavior: 'smooth'
    });
  }

  // Wait for scroll to complete, then update cursor position
  setTimeout(() => {
    refreshLines();
    const firstVisibleLine = getFirstVisibleLine();

    // Just update the active line index and cursor position without clicking
    vim_info.active_line = firstVisibleLine;
    vim_info.desired_column = 0;

    const targetElement = vim_info.lines[firstVisibleLine]?.element;
    if (targetElement) {
      setCursorPosition(targetElement, 0);
      targetElement.focus();
    }
  }, 150); // Slightly longer delay for smooth scroll to progress
};

// Jump to top of document (gg)
const jumpToTop = () => {
  const { vim_info } = window;
  const scrollContainer = findScrollableContainer();

  // Scroll to top
  if (scrollContainer === document.documentElement) {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  } else {
    scrollContainer.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  // Wait for scroll, then set cursor to first line
  setTimeout(() => {
    refreshLines();
    vim_info.active_line = 0;
    vim_info.desired_column = 0;

    const targetElement = vim_info.lines[0]?.element;
    if (targetElement) {
      setCursorPosition(targetElement, 0);
      targetElement.focus();
    }
  }, 150);
};

// Jump to bottom of document (G)
const jumpToBottom = () => {
  const { vim_info } = window;
  const scrollContainer = findScrollableContainer();

  // Scroll to bottom
  const maxScroll = scrollContainer === document.documentElement
    ? document.documentElement.scrollHeight - window.innerHeight
    : scrollContainer.scrollHeight - scrollContainer.clientHeight;

  if (scrollContainer === document.documentElement) {
    window.scrollTo({
      top: maxScroll,
      behavior: 'smooth'
    });
  } else {
    scrollContainer.scrollTo({
      top: maxScroll,
      behavior: 'smooth'
    });
  }

  // Wait for scroll, then set cursor to last line
  setTimeout(() => {
    refreshLines();
    const lastLine = vim_info.lines.length - 1;
    vim_info.active_line = lastLine;
    vim_info.desired_column = 0;

    const targetElement = vim_info.lines[lastLine]?.element;
    if (targetElement) {
      setCursorPosition(targetElement, 0);
      targetElement.focus();
    }
  }, 150);
};

const setActiveLine = (idx: number) => {
  const {
    vim_info: { lines, desired_column },
  } = window;
  let i = idx;

  if (idx >= lines.length) i = lines.length - 1;
  if (i < 0) i = 0;


  // Update the active line index
  window.vim_info.active_line = i;

  // Click and focus the new line
  lines[i].element.click();
  lines[i].element.focus();

  // Set cursor to desired column, or end of line if line is shorter
  const lineLength = lines[i].element.textContent?.length || 0;
  const targetColumn = Math.min(desired_column, lineLength);
  setCursorPosition(lines[i].element, targetColumn);

};

const refreshLines = () => {
  const { vim_info } = window;
  const allEditableElements = Array.from(
    document.querySelectorAll("[contenteditable=true]")
  ) as HTMLDivElement[];

  // Store the current active element to find its new index later
  const currentActiveElement = vim_info.lines[vim_info.active_line]?.element;

  // Find new elements that aren't in our lines array yet
  const existingElements = new Set(vim_info.lines.map(line => line.element));
  const newElements = allEditableElements.filter(elem => !existingElements.has(elem));

  if (newElements.length > 0) {

    // Add event listeners to new elements
    newElements.forEach(elem => {
      elem.addEventListener("keydown", handleKeydown, true);
      elem.addEventListener("click", handleClick, true);
    });
  }

  // Rebuild lines array in DOM order
  vim_info.lines = allEditableElements.map(elem => ({
    cursor_position: 0,
    element: elem,
  }));

  // Update active line index to match the current active element
  if (currentActiveElement) {
    const newIndex = vim_info.lines.findIndex(line => line.element === currentActiveElement);
    if (newIndex !== -1) {
      vim_info.active_line = newIndex;
    }
  }

};

const setLines = (f: HTMLDivElement[]) => {
  const { vim_info } = window;

  vim_info.lines = f.map((elem) => ({
    cursor_position: 0,
    element: elem as HTMLDivElement,
  }));

  // Add event listeners to ALL lines at once
  vim_info.lines.forEach((line, index) => {
    line.element.addEventListener("keydown", handleKeydown, true);
    line.element.addEventListener("click", handleClick, true);
  });

  // Set initial active line
  setActiveLine(vim_info.active_line || 0);

  // Set up MutationObserver to detect new lines
  const observer = new MutationObserver(() => {
    refreshLines();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

};

const updateInfoContainer = () => {
  const mode = document.querySelector(".vim-mode") as HTMLDivElement;
  const { vim_info } = window;
  mode.innerText = `${getModeText(vim_info.mode)} | Line ${vim_info.active_line + 1}/${vim_info.lines.length}`;

  // Update body class for cursor styling
  document.body.classList.remove("vim-normal-mode", "vim-insert-mode", "vim-visual-mode", "vim-visual-line-mode");

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
};

(() => {
  console.log("[Vim-Notion] Extension loading...");
  initVimInfo();
  createInfoContainer();
  // Set initial cursor style for normal mode
  document.body.classList.add("vim-normal-mode");

  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const f = Array.from(
      document.querySelectorAll("[contenteditable=true]")
    );

    if (f.length > 0) {
      clearInterval(poll);
      setLines(f as HTMLDivElement[]);
      console.log("[Vim-Notion] Setup complete!");
    }

    if (attempts > 40) {
      clearInterval(poll);
      console.error("[Vim-Notion] Timed out waiting for editable elements");
    }
  }, 250);
})();
