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
      // For code blocks on empty lines, temporarily insert a zero-width space to get the cursor position
      try {
        if (range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
          const textNode = range.startContainer as Text;
          const offset = range.startOffset;

          // Insert a zero-width space temporarily
          const zws = '\u200B';
          const originalText = textNode.textContent || '';
          textNode.textContent = originalText.slice(0, offset) + zws + originalText.slice(offset);

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

// Move cursor down within a code block (handles multi-line code blocks)
const moveCursorDownInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Find current line start
  let lineStart = text.lastIndexOf('\n', currentPos - 1);
  if (lineStart === -1) lineStart = -1; // Before first character

  // Find current line end (next newline)
  let lineEnd = text.indexOf('\n', currentPos);
  if (lineEnd === -1) {
    // Already on last line of code block, move to next block
    setActiveLine(vim_info.active_line + 1);
    return;
  }

  // Column position in current line
  const columnInLine = currentPos - lineStart - 1;

  // Next line starts after the newline
  const nextLineStart = lineEnd + 1;

  // Find next line end
  let nextLineEnd = text.indexOf('\n', nextLineStart);
  if (nextLineEnd === -1) nextLineEnd = text.length;

  // Calculate target position in next line
  const nextLineLength = nextLineEnd - nextLineStart;
  const targetColumn = Math.min(vim_info.desired_column, nextLineLength);
  const targetPos = nextLineStart + targetColumn;

  setCursorPosition(currentElement, targetPos);
};

// Move cursor up within a code block
const moveCursorUpInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Find current line start
  let lineStart = text.lastIndexOf('\n', currentPos - 1);

  if (lineStart === -1) {
    // Already on first line of code block, move to previous block
    setActiveLine(vim_info.active_line - 1);
    return;
  }

  // Find previous line start
  let prevLineStart = text.lastIndexOf('\n', lineStart - 1);
  if (prevLineStart === -1) prevLineStart = -1; // Before first character

  // Previous line is between prevLineStart and lineStart
  const prevLineLength = lineStart - prevLineStart - 1;
  const targetColumn = Math.min(vim_info.desired_column, prevLineLength);
  const targetPos = prevLineStart + 1 + targetColumn;

  setCursorPosition(currentElement, targetPos);
};

// Move cursor left within a code block, wrapping to previous line if at start
const moveCursorBackwardsInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // If at very beginning of code block, can't go back
  if (currentPos === 0) {
    return;
  }

  // Just move back one character
  const newPos = currentPos - 1;
  setCursorPosition(currentElement, newPos);
  vim_info.desired_column = newPos;
};

// Move cursor right within a code block, wrapping to next line if at end
const moveCursorForwardsInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);
  const textLength = text.length;

  // If at very end of code block, can't go forward
  if (currentPos >= textLength) {
    return;
  }

  // Just move forward one character
  const newPos = currentPos + 1;
  setCursorPosition(currentElement, newPos);
  vim_info.desired_column = newPos;
};

// Open line below in code block (o command)
const openLineBelowInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Find the end of the current line (next \n or end of text)
  let lineEnd = text.indexOf('\n', currentPos);
  if (lineEnd === -1) lineEnd = text.length;

  // Move cursor to end of current line
  setCursorPosition(currentElement, lineEnd);

  // Insert a newline character using execCommand (works better in contenteditable)
  document.execCommand('insertText', false, '\n');

  // Switch to insert mode
  vim_info.mode = "insert";
  updateInfoContainer();
};

// Open line above in code block (O command)
const openLineAboveInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Find the start of the current line (previous \n or start of text)
  let lineStart = text.lastIndexOf('\n', currentPos - 1);
  lineStart = lineStart === -1 ? 0 : lineStart + 1;

  // Move cursor to start of current line
  setCursorPosition(currentElement, lineStart);

  // Insert a newline character
  document.execCommand('insertText', false, '\n');

  // Move cursor back to the newly created empty line
  setCursorPosition(currentElement, lineStart);

  // Switch to insert mode
  vim_info.mode = "insert";
  updateInfoContainer();
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

  // Check if we're in a code block
  const firstElement = vim_info.lines[firstLine].element;
  const inCodeBlock = isInsideCodeBlock(firstElement);

  if (inCodeBlock && firstLine === lastLine) {
    // Special handling for code blocks: select lines from visual_start_pos to current cursor position
    const currentElement = firstElement;
    const text = currentElement.textContent || "";
    const startPos = vim_info.visual_start_pos;
    // Use visual_end_pos if it exists, otherwise get from cursor
    const endPos = vim_info.visual_end_pos !== undefined ? vim_info.visual_end_pos : getCursorIndexInElement(currentElement);

    // Determine the range of positions to select
    const [selStart, selEnd] = startPos <= endPos ? [startPos, endPos] : [endPos, startPos];

    // Find the line boundaries for the start position
    let lineStart = text.lastIndexOf('\n', selStart - 1);
    lineStart = lineStart === -1 ? 0 : lineStart + 1;

    // Find the line boundaries for the end position
    let lineEnd = text.indexOf('\n', selEnd);
    if (lineEnd === -1) lineEnd = text.length;

    // Don't set background color for code blocks - we'll rely on the selection highlight only
    // (setting backgroundColor would highlight the entire code block element)

    // Use TreeWalker to find the correct text nodes and positions
    // This handles the case where text is split across multiple nodes
    const walker = document.createTreeWalker(
      currentElement,
      NodeFilter.SHOW_TEXT,
      null
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
    for (let i = firstLine; i <= lastLine; i++) {
      const element = vim_info.lines[i].element;
      element.style.backgroundColor = 'rgba(102, 126, 234, 0.3)';
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

const visualSelectInnerBracket = (openChar: string, closeChar: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // Use different function for quotes (where open === close)
  const result = openChar === closeChar
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
  const result = openChar === closeChar
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
    if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") {
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
    }
    vim_info.pending_operator = null;
    return true;
  } else if (vim_info.pending_operator === "va") {
    // Ignore modifier keys (Shift, Ctrl, Alt, Meta)
    if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") {
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
      const text = currentElement.textContent || '';
      // Use the saved visual_end_pos if it exists, otherwise get from cursor
      const cursorPos = vim_info.visual_end_pos !== undefined ? vim_info.visual_end_pos : getCursorIndexInElement(currentElement);

      // Find the next newline after current position
      const nextNewline = text.indexOf('\n', cursorPos);

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
      const text = currentElement.textContent || '';
      // Use the saved visual_end_pos if it exists, otherwise get from cursor
      const cursorPos = vim_info.visual_end_pos !== undefined ? vim_info.visual_end_pos : getCursorIndexInElement(currentElement);

      // Find the current line's start
      let currentLineStart = text.lastIndexOf('\n', cursorPos - 1);
      currentLineStart = currentLineStart === -1 ? 0 : currentLineStart + 1;

      // If we're at the first line of the code block, try to move to previous block
      if (currentLineStart === 0 && cursorPos < text.indexOf('\n')) {
        const prevLine = vim_info.active_line - 1;
        if (prevLine >= 0) {
          vim_info.active_line = prevLine;
          delete vim_info.visual_end_pos; // Clear saved position when leaving code block
          const prevElement = vim_info.lines[prevLine].element;
          const prevInCodeBlock = isInsideCodeBlock(prevElement);
          if (prevInCodeBlock) {
            const prevText = prevElement.textContent || '';
            // Move to the last line of the previous code block
            const lastNewline = prevText.lastIndexOf('\n');
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
        let prevLineStart = text.lastIndexOf('\n', currentLineStart - 2);
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

// Helper function to dispatch Delete and Backspace events to delete a block
const deleteBlockWithKeyboardEvents = (element: HTMLElement, delay: number = 0) => {
  setTimeout(() => {
    // Check if element is still in the document
    if (!document.contains(element)) {
      return;
    }

    // Select entire content
    const range = document.createRange();
    range.selectNodeContents(element);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    // Focus and delete with Delete key
    element.focus();

    // Dispatch Delete key event to delete content
    const deleteEvent = new KeyboardEvent('keydown', {
      key: 'Delete',
      code: 'Delete',
      keyCode: 46,
      which: 46,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(deleteEvent);

    // After deleting content, dispatch Backspace to delete the empty block
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
    }, 20);
  }, delay);
};

// Helper function to change (delete and enter insert mode) lines within a code block
const changeCodeBlockLines = (firstLine: number, lastLine: number) => {
  const { vim_info } = window;

  // Delete content of each line individually using Selection API
  for (let i = lastLine; i >= firstLine; i--) {
    const element = vim_info.lines[i].element as HTMLElement;

    console.log('[changeCodeBlockLines] Changing line', i, element);

    // Select all content in the line
    const range = document.createRange();
    range.selectNodeContents(element);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Delete the content
    document.execCommand('delete');
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

  // Clear background highlights from all elements IMMEDIATELY
  clearAllBackgroundColors();
  // Clear selection to remove any browser highlighting
  window.getSelection()?.removeAllRanges();

  // Group consecutive lines by their element (code blocks share the same element)
  const lineGroups: { start: number; end: number; isCodeBlock: boolean; element: HTMLElement }[] = [];
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
        element: currentGroupElement
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
    element: currentGroupElement
  });

  // Start undo group for multi-line deletion
  vim_info.in_undo_group = true;
  vim_info.undo_count = lastLine - firstLine + 1;

  // Delete content for each group (in reverse order to maintain indices)
  // Use a sequential approach with delays for normal blocks to avoid DOM errors
  let currentDelay = 10;

  for (let groupIdx = lineGroups.length - 1; groupIdx >= 0; groupIdx--) {
    const group = lineGroups[groupIdx];

    if (group.isCodeBlock) {
      // Code block - delete the entire code block element
      deleteBlockWithKeyboardEvents(group.element, 0);
    } else {
      // Normal lines - delete content AND the blocks themselves
      // Delete from last to first to maintain indices
      for (let i = group.end; i >= group.start; i--) {
        const element = vim_info.lines[i].element;
        deleteBlockWithKeyboardEvents(element, currentDelay);
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

    const newActiveLine = Math.max(0, Math.min(firstLine, vim_info.lines.length - 1));
    if (vim_info.lines.length > 0) {
      setActiveLine(newActiveLine);
      const element = vim_info.lines[newActiveLine].element;
      setCursorPosition(element, 0);
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

  // Clear background highlights from all elements IMMEDIATELY
  clearAllBackgroundColors();
  // Clear selection to remove any browser highlighting
  window.getSelection()?.removeAllRanges();

  // Force another clear on next frame
  requestAnimationFrame(() => {
    clearAllBackgroundColors();
  });

  // Group consecutive lines by their element (code blocks share the same element)
  const lineGroups: { start: number; end: number; isCodeBlock: boolean; element: HTMLElement }[] = [];
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
        element: currentGroupElement
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
    element: currentGroupElement
  });

  // If selection is entirely within a single code block, use changeCodeBlockLines
  if (lineGroups.length === 1 && lineGroups[0].isCodeBlock) {
    changeCodeBlockLines(firstLine, lastLine);
    return;
  }

  // If selection is a single normal line, just clear and enter insert mode
  if (lineGroups.length === 1 && !lineGroups[0].isCodeBlock && firstLine === lastLine) {
    const element = vim_info.lines[firstLine].element as HTMLElement;

    // Select all content
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Delete content
    document.execCommand('delete');

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
        document.execCommand('delete');
      }
    }
  }

  // Now delete all lines except the first
  const linesToDelete: number[] = [];
  for (let i = lastLine; i > firstLine; i--) {
    linesToDelete.push(i);
  }

  deleteExtraLinesSequentially(linesToDelete, firstLine);

  function deleteExtraLinesSequentially(lineIndices: number[], targetLine: number) {
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
          document.execCommand('delete');

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
    const block = element.closest('[data-block-id]') || element.parentElement?.parentElement;

    if (!block) {
      deleteExtraLinesSequentially(lineIndices.slice(1), targetLine);
      return;
    }

    const editableElement = block.querySelector('[contenteditable="true"]') as HTMLElement;
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
      const deleteEvent = new KeyboardEvent('keydown', {
        key: 'Delete',
        code: 'Delete',
        keyCode: 46,
        which: 46,
        bubbles: true,
        cancelable: true,
      });
      editableElement.dispatchEvent(deleteEvent);

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
  vim_info.pending_operator = null;
  updateInfoContainer();
};

const deleteCurrentLine = async () => {
  const { vim_info } = window;
  const currentLineIndex = vim_info.active_line;
  const currentElement = vim_info.lines[currentLineIndex].element;

  // Check if we're inside a code block
  const inCodeBlock = isInsideCodeBlock(currentElement);

  if (inCodeBlock) {
    // For code blocks, delete only the line content, not the block itself
    const text = currentElement.textContent || '';
    const cursorPos = getCursorIndexInElement(currentElement);

    // Find the start and end of the current line
    let lineStart = text.lastIndexOf('\n', cursorPos - 1);
    lineStart = lineStart === -1 ? 0 : lineStart + 1;

    let lineEnd = text.indexOf('\n', cursorPos);
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
    const originalLineStart = text.lastIndexOf('\n', cursorPos - 1);
    const actualLineStart = originalLineStart === -1 ? 0 : originalLineStart + 1;
    const originalLineEnd = text.indexOf('\n', cursorPos);
    const actualLineEnd = originalLineEnd === -1 ? text.length : originalLineEnd;
    const lineText = text.substring(actualLineStart, actualLineEnd);
    navigator.clipboard.writeText(lineText).catch(err => {
      console.error('[Vim-Notion] Failed to copy to clipboard:', err);
    });

    // Temporarily switch to insert mode
    vim_info.mode = "insert";

    // Select the line content using TreeWalker
    const walker = document.createTreeWalker(
      currentElement,
      NodeFilter.SHOW_TEXT,
      null
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
        document.execCommand('delete');

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
  vim_info.pending_operator = null;
  updateInfoContainer();
};

// Helper function to find matching quotes (where open and close are the same)
const findMatchingQuotes = (text: string, cursorPos: number, quoteChar: string): [number, number] | null => {
  // Support both regular quotes and smart quotes (typographic quotes)
  // Notion uses various quote characters inconsistently
  let allQuoteChars: string[];

  if (quoteChar === '"') {
    // All possible double quote characters
    allQuoteChars = ['"', "\u201C", "\u201D"]; // " " "
  } else if (quoteChar === "'") {
    // All possible single quote characters
    allQuoteChars = ["'", "\u2018", "\u2019"]; // ' ' '
  } else {
    allQuoteChars = [quoteChar];
  }

  // Find all quote positions in the text
  const quotePositions: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (allQuoteChars.includes(text[i])) {
      quotePositions.push(i);
    }
  }

  if (quotePositions.length < 2) {
    return null;
  }

  // Pair quotes sequentially: positions 0-1, 2-3, 4-5, etc.
  // This mimics Vim's behavior where quotes toggle between open/close
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < quotePositions.length - 1; i += 2) {
    pairs.push([quotePositions[i], quotePositions[i + 1]]);
  }

  if (pairs.length === 0) {
    return null;
  }

  // Try to find an enclosing pair (cursor is inside quotes)
  for (const [openIndex, closeIndex] of pairs) {
    if (cursorPos > openIndex && cursorPos <= closeIndex) {
      return [openIndex, closeIndex];
    }
  }

  // If not inside a pair, find the next pair after cursor
  for (const [openIndex, closeIndex] of pairs) {
    if (openIndex >= cursorPos) {
      return [openIndex, closeIndex];
    }
  }

  return null;
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

  // Use different function for quotes (where open === close)
  const result = openChar === closeChar
    ? findMatchingQuotes(text, currentCursorPosition, openChar)
    : findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);

  if (!result) {
    vim_info.pending_operator = null;
    updateInfoContainer();
    return;
  }

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
  vim_info.pending_operator = null;
  updateInfoContainer();
};

const deleteAroundBracket = (openChar: string, closeChar: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // Use different function for quotes (where open === close)
  const result = openChar === closeChar
    ? findMatchingQuotes(text, currentCursorPosition, openChar)
    : findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);

  if (!result) {
    vim_info.pending_operator = null;
    updateInfoContainer();
    return;
  }

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
  vim_info.pending_operator = null;
  updateInfoContainer();
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
  vim_info.pending_operator = null;
  updateInfoContainer();
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
  vim_info.pending_operator = null;
  updateInfoContainer();
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

  // Use different function for quotes (where open === close)
  const result = openChar === closeChar
    ? findMatchingQuotes(text, currentCursorPosition, openChar)
    : findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);

  if (!result) {
    vim_info.pending_operator = null;
    updateInfoContainer();
    return;
  }

  const [openIndex, closeIndex] = result;
  const textToYank = text.slice(openIndex + 1, closeIndex);
  navigator.clipboard.writeText(textToYank);
  vim_info.pending_operator = null;
  updateInfoContainer();
};

const yankAroundBracket = (openChar: string, closeChar: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // Use different function for quotes (where open === close)
  const result = openChar === closeChar
    ? findMatchingQuotes(text, currentCursorPosition, openChar)
    : findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);

  if (!result) {
    vim_info.pending_operator = null;
    updateInfoContainer();
    return;
  }

  const [openIndex, closeIndex] = result;
  const textToYank = text.slice(openIndex, closeIndex + 1);
  navigator.clipboard.writeText(textToYank);
  vim_info.pending_operator = null;
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

// Helper function to check if an element is inside a code block
const isInsideCodeBlock = (element: Element): boolean => {
  // Notion code blocks typically have a specific structure
  // Check if the element or its parents have code-related selectors
  const codeContainer = element.closest('[class*="code"]') || element.closest('code') || element.closest('pre');
  const isCodeBlock = !!codeContainer;

  return isCodeBlock;
};

// Helper function to get all contenteditable lines within the same code block
const getCodeBlockLines = (element: Element): Element[] => {
  const codeContainer = element.closest('[class*="code"]') || element.closest('[data-block-id]');
  if (!codeContainer) return [];

  return Array.from(codeContainer.querySelectorAll('[contenteditable="true"]'));
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
      // In code blocks, use custom line opening to stay within the block
      if (vim_info.lines[active_line] && isInsideCodeBlock(vim_info.lines[active_line].element)) {
        openLineBelowInCodeBlock();
        return true;
      }
      openLineBelow();
      return true;
    case "O":
      // In code blocks, use custom line opening to stay within the block
      if (vim_info.lines[active_line] && isInsideCodeBlock(vim_info.lines[active_line].element)) {
        openLineAboveInCodeBlock();
        return true;
      }
      openLineAbove();
      return true;
    case "h":
      // In code blocks, use custom navigation to stay within the block
      if (vim_info.lines[active_line] && isInsideCodeBlock(vim_info.lines[active_line].element)) {
        moveCursorBackwardsInCodeBlock();
        return true;
      }
      moveCursorBackwards();
      return true;
    case "j":
      // In code blocks, move cursor down within the block
      if (vim_info.lines[active_line] && isInsideCodeBlock(vim_info.lines[active_line].element)) {
        moveCursorDownInCodeBlock();
        return true;
      }
      setActiveLine(active_line + 1);
      return true;
    case "k":
      // In code blocks, move cursor up within the block
      if (vim_info.lines[active_line] && isInsideCodeBlock(vim_info.lines[active_line].element)) {
        moveCursorUpInCodeBlock();
        return true;
      }
      setActiveLine(active_line - 1);
      return true;
    case "l":
      // In code blocks, use custom navigation to stay within the block
      if (vim_info.lines[active_line] && isInsideCodeBlock(vim_info.lines[active_line].element)) {
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

  // Save the old active_line BEFORE updating it
  const previousActiveLine = window.vim_info.active_line;

  // Update the active line index
  window.vim_info.active_line = i;

  const targetElement = lines[i].element;

  // Check if we're inside a code block
  const inCodeBlock = isInsideCodeBlock(targetElement);

  // For code blocks, avoid .click() as it triggers Notion's internal logic
  // that can cause cursor to jump outside the block
  if (inCodeBlock) {
    // Only use setCursorPosition() for code blocks - no click or focus
    // Don't call focus() or click() - just set cursor position directly

    // For code blocks, we need to position the cursor on the correct line
    // If moving up (idx < previous active_line), go to the last line of the code block
    // If moving down (idx > previous active_line), go to the first line
    const text = targetElement.textContent || "";
    const lines = text.split('\n');
    const movingUp = i < previousActiveLine;

    let cursorPosition = 0;
    if (movingUp) {
      // Moving up: go to the last line
      for (let j = 0; j < lines.length - 1; j++) {
        cursorPosition += lines[j].length + 1; // +1 for newline
      }
      // Add desired column on the last line
      const lastLineLength = lines[lines.length - 1].length;
      cursorPosition += Math.min(desired_column, lastLineLength);
    } else {
      // Moving down: go to the first line at desired column
      const firstLineLength = lines[0].length;
      cursorPosition = Math.min(desired_column, firstLineLength);
    }

    setCursorPosition(targetElement, cursorPosition);
  } else {
    // For normal blocks, use click() and focus() as before
    targetElement.click();
    targetElement.focus();

    // Set cursor to desired column, or end of line if line is shorter
    const lineLength = targetElement.textContent?.length || 0;
    const targetColumn = Math.min(desired_column, lineLength);
    setCursorPosition(targetElement, targetColumn);
  }
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
