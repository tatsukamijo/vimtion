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

  if (rect.width === 0 && rect.height === 0) {
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

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

const jumpToPreviousWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  if (currentCursorPosition === 0) return;

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
    console.log("[Vim-Notion] getCursorIndex: No selection");
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
  console.log(`[Vim-Notion] getCursorIndex: ${i}, activeElement:`, document.activeElement);
  return i;
};

const getModeText = (mode: "insert" | "normal" | "visual") => {
  return `-- ${mode.toUpperCase()} --`;
};

const setCursorPosition = (element: Element, index: number) => {
  console.log(`[Vim-Notion] setCursorPosition: setting position ${index} on element:`, element);

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
    console.log(`[Vim-Notion] Cursor set to empty element`);
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
      console.log(`[Vim-Notion] Cursor set to position ${index}`);
      updateBlockCursor();
      break;
    }
    i += node.textContent.length;
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  const { vim_info } = window;
  console.log(`[Vim-Notion] handleKeydown called: key=${e.key}, mode=${vim_info.mode}`);

  if (vim_info.mode === "normal") {
    // Let normalReducer decide if this key should be handled
    const handled = normalReducer(e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log(`[Vim-Notion] Blocked key in normal mode: ${e.key}`);
    }
  } else if (vim_info.mode === "visual") {
    const handled = visualReducer(e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log(`[Vim-Notion] Blocked key in visual mode: ${e.key}`);
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
    mode: "normal" as "normal" | "insert" | "visual",
    visual_start_line: 0,
    visual_start_pos: 0,
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

  // Find the text node and set range
  const setRangeInElement = (element: Node, start: number, end: number) => {
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
          setRangeInElement(node, start - textOffset, end - textOffset);
          return;
        }

        textOffset += childLength;
      }
    }
  };

  const [selStart, selEnd] = startPos <= currentPos
    ? [startPos, currentPos + 1]  // Include character under cursor
    : [currentPos, startPos + 1];

  setRangeInElement(currentElement, selStart, selEnd);
  selection?.removeAllRanges();
  selection?.addRange(range);
};

const visualReducer = (e: KeyboardEvent): boolean => {
  const { vim_info } = window;

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
    case "d":
    case "x":
      deleteVisualSelection();
      return true;
    default:
      return true; // Block other keys
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
    console.log("[Vim-Notion] getCursorIndexInElement: No selection");
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

  console.log(`[Vim-Notion] moveCursorBackwards on line ${vim_info.active_line}, pos ${currentCursorPosition}`);

  if (currentCursorPosition === 0) return;
  const newPosition = currentCursorPosition - 1;
  setCursorPosition(currentElement, newPosition);
  vim_info.desired_column = newPosition; // Remember this column
};

const moveCursorForwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);

  console.log(`[Vim-Notion] moveCursorForwards on line ${vim_info.active_line}, pos ${currentCursorPosition}`);

  if (currentCursorPosition >= (currentElement.textContent?.length || 0))
    return;
  const newPosition = currentCursorPosition + 1;
  setCursorPosition(currentElement, newPosition);
  vim_info.desired_column = newPosition; // Remember this column
};

const normalReducer = (e: KeyboardEvent): boolean => {
  // Don't handle keys with modifiers (Command, Ctrl, Alt) - let browser handle them
  if (e.metaKey || e.ctrlKey || e.altKey) {
    return false;
  }

  const {
    vim_info: { active_line },
  } = window;

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
    case "s":
      substituteCharacter();
      return true;
    case "v":
      startVisualMode();
      return true;
    default:
      // Block all other keys in normal mode (including space, numbers, etc.)
      return true;
  }
};

const setActiveLine = (idx: number) => {
  const {
    vim_info: { lines, desired_column },
  } = window;
  let i = idx;

  if (idx >= lines.length) i = lines.length - 1;
  if (i < 0) i = 0;

  console.log(`[Vim-Notion] setActiveLine: moving to ${i}`);

  // Update the active line index
  window.vim_info.active_line = i;

  // Click and focus the new line
  lines[i].element.click();
  lines[i].element.focus();

  // Set cursor to desired column, or end of line if line is shorter
  const lineLength = lines[i].element.textContent?.length || 0;
  const targetColumn = Math.min(desired_column, lineLength);
  setCursorPosition(lines[i].element, targetColumn);

  console.log(`[Vim-Notion] Active line is now: ${i}, cursor at column ${targetColumn}`);
};

const setLines = (f: HTMLDivElement[]) => {
  const { vim_info } = window;
  console.log(`[Vim-Notion] Setting up ${f.length} lines`);

  vim_info.lines = f.map((elem) => ({
    cursor_position: 0,
    element: elem as HTMLDivElement,
  }));

  // Add event listeners to ALL lines at once
  vim_info.lines.forEach((line, index) => {
    line.element.addEventListener("keydown", handleKeydown, true);
    console.log(`[Vim-Notion] Added event listener to line ${index}`);
  });

  // Set initial active line
  setActiveLine(vim_info.active_line || 0);
  console.log(`[Vim-Notion] Lines setup complete, active line: ${vim_info.active_line}`);
};

const updateInfoContainer = () => {
  const mode = document.querySelector(".vim-mode") as HTMLDivElement;
  const { vim_info } = window;
  mode.innerText = `${getModeText(vim_info.mode)} | Line ${vim_info.active_line + 1}/${vim_info.lines.length}`;

  // Update body class for cursor styling
  document.body.classList.remove("vim-normal-mode", "vim-insert-mode", "vim-visual-mode");

  if (vim_info.mode === "normal") {
    document.body.classList.add("vim-normal-mode");
  } else if (vim_info.mode === "visual") {
    document.body.classList.add("vim-visual-mode");
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
  console.log("[Vim-Notion] Info container created");

  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const f = Array.from(
      document.querySelectorAll("[contenteditable=true]")
    );
    console.log(`[Vim-Notion] Attempt ${attempts}: Found ${f.length} editable elements`);

    if (f.length > 0) {
      clearInterval(poll);
      console.log("[Vim-Notion] Setting up lines...");
      setLines(f as HTMLDivElement[]);
      console.log("[Vim-Notion] Setup complete!");
    }

    if (attempts > 40) {
      clearInterval(poll);
      console.error("[Vim-Notion] Timed out waiting for editable elements");
    }
  }, 250);
})();
