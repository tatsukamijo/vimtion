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

const getModeText = (mode: "insert" | "normal" | "visual" | "visual-line") => {
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
  } else if (vim_info.mode === "visual-line") {
    const handled = visualLineReducer(e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log(`[Vim-Notion] Blocked key in visual-line mode: ${e.key}`);
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
    pending_operator: null as "y" | "d" | "c" | null, // For commands like yy, dd, etc.
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

  const selection = window.getSelection();
  const range = document.createRange();

  const startLine = vim_info.visual_start_line;
  const endLine = vim_info.active_line;

  // Determine the range of lines to select
  const [firstLine, lastLine] = startLine <= endLine
    ? [startLine, endLine]
    : [endLine, startLine];

  // Set range to cover all lines from first to last
  const firstElement = vim_info.lines[firstLine].element;
  const lastElement = vim_info.lines[lastLine].element;

  // Select from the beginning of the first line to the end of the last line
  range.setStartBefore(firstElement.firstChild || firstElement);
  range.setEndAfter(lastElement.lastChild || lastElement);

  selection?.removeAllRanges();
  selection?.addRange(range);
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

  const lineLength = currentElement.textContent?.length || 0;

  const [selStart, selEnd] = startPos <= currentPos
    ? [startPos, Math.min(currentPos + 1, lineLength)]  // Include character under cursor, but don't exceed line length
    : [currentPos, Math.min(startPos + 1, lineLength)];

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
    case "y":
      yankVisualSelection();
      return true;
    default:
      return true; // Block other keys
  }
};

const visualLineReducer = (e: KeyboardEvent): boolean => {
  const { vim_info } = window;

  switch (e.key) {
    case "Escape":
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

  // Use execCommand('cut') to delete and copy to clipboard
  document.execCommand('cut');

  vim_info.mode = "normal";
  window.getSelection()?.removeAllRanges();
  updateInfoContainer();
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
  const currentElement = vim_info.lines[vim_info.active_line].element;

  // Select entire line
  const range = document.createRange();
  range.selectNodeContents(currentElement);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  // Cut to clipboard
  document.execCommand('cut');
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

  const newText = text.slice(0, start) + text.slice(end);
  currentElement.textContent = newText;

  setCursorPosition(currentElement, start);
  vim_info.desired_column = start;
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

const undo = () => {
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
};

const redo = () => {
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

const handlePendingOperator = (key: string): boolean => {
  const { vim_info } = window;
  const operator = vim_info.pending_operator;

  console.log(`[Vim-Notion] handlePendingOperator: operator=${operator}, key=${key}`);

  // Ignore modifier keys - don't clear pending_operator
  if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") {
    console.log('[Vim-Notion] Ignoring modifier key');
    return true;
  }

  // Clear pending operator
  vim_info.pending_operator = null;

  if (operator === "y") {
    // Handle yank operations
    switch (key) {
      case "y":
        console.log('[Vim-Notion] Executing yy');
        yankCurrentLine();
        return true;
      case "w":
        console.log('[Vim-Notion] Executing yw');
        yankToNextWord();
        return true;
      case "$":
        console.log('[Vim-Notion] Executing y$');
        yankToEndOfLine();
        return true;
      case "0":
        console.log('[Vim-Notion] Executing y0');
        yankToBeginningOfLine();
        return true;
      case "i":
        // yi{motion} - yank inner text object, wait for next key
        vim_info.pending_operator = "yi";
        return true;
      default:
        console.log('[Vim-Notion] Invalid motion, canceling');
        return true;
    }
  } else if (operator === "d") {
    // Handle delete operations
    switch (key) {
      case "d":
        console.log('[Vim-Notion] Executing dd');
        deleteCurrentLine();
        return true;
      case "w":
        console.log('[Vim-Notion] Executing dw');
        deleteToNextWord();
        return true;
      case "$":
        console.log('[Vim-Notion] Executing d$');
        deleteToEndOfLine();
        return true;
      case "0":
        console.log('[Vim-Notion] Executing d0');
        deleteToBeginningOfLine();
        return true;
      case "i":
        // di{motion} - delete inner text object, wait for next key
        vim_info.pending_operator = "di";
        return true;
      default:
        console.log('[Vim-Notion] Invalid motion, canceling');
        return true;
    }
  } else if (operator === "c") {
    // Handle change operations (delete and enter insert mode)
    switch (key) {
      case "c":
        console.log('[Vim-Notion] Executing cc');
        changeCurrentLine();
        return true;
      case "w":
        console.log('[Vim-Notion] Executing cw');
        changeToNextWord();
        return true;
      case "$":
        console.log('[Vim-Notion] Executing c$');
        changeToEndOfLine();
        return true;
      case "0":
        console.log('[Vim-Notion] Executing c0');
        changeToBeginningOfLine();
        return true;
      case "i":
        // ci{motion} - change inner text object, wait for next key
        vim_info.pending_operator = "ci";
        return true;
      default:
        console.log('[Vim-Notion] Invalid motion, canceling');
        return true;
    }
  } else if (operator === "yi" || operator === "di" || operator === "ci") {
    // Handle inner text objects
    switch (key) {
      case "w":
        console.log(`[Vim-Notion] Executing ${operator}w`);
        if (operator === "yi") {
          yankInnerWord();
        } else if (operator === "di") {
          deleteInnerWord();
        } else if (operator === "ci") {
          changeInnerWord();
        }
        return true;
      default:
        console.log('[Vim-Notion] Invalid text object, canceling');
        return true;
    }
  }

  return true;
};

const normalReducer = (e: KeyboardEvent): boolean => {
  // Don't handle keys with modifiers (Command, Ctrl, Alt) - let browser handle them
  if (e.metaKey || e.ctrlKey || e.altKey) {
    return false;
  }

  const { vim_info } = window;
  const { active_line, pending_operator } = vim_info;

  console.log(`[Vim-Notion] normalReducer: key=${e.key}, pending_operator=${pending_operator}`);

  // If we have a pending operator, handle it
  if (pending_operator) {
    console.log(`[Vim-Notion] Handling pending operator: ${pending_operator}${e.key}`);
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
    case "V":
      startVisualLineMode();
      return true;
    case "p":
      pasteAfterCursor();
      return true;
    case "y":
      window.vim_info.pending_operator = "y";
      return true;
    case "d":
      window.vim_info.pending_operator = "d";
      return true;
    case "c":
      window.vim_info.pending_operator = "c";
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

const refreshLines = () => {
  const { vim_info } = window;
  const allEditableElements = Array.from(
    document.querySelectorAll("[contenteditable=true]")
  ) as HTMLDivElement[];

  // Find new elements that aren't in our lines array yet
  const existingElements = new Set(vim_info.lines.map(line => line.element));
  const newElements = allEditableElements.filter(elem => !existingElements.has(elem));

  if (newElements.length > 0) {
    console.log(`[Vim-Notion] Found ${newElements.length} new editable elements`);

    // Add new elements to lines array
    newElements.forEach(elem => {
      vim_info.lines.push({
        cursor_position: 0,
        element: elem,
      });
      elem.addEventListener("keydown", handleKeydown, true);
      console.log(`[Vim-Notion] Added event listener to new line`);
    });

    console.log(`[Vim-Notion] Total lines: ${vim_info.lines.length}`);
  }

  // Remove elements that no longer exist in the DOM
  vim_info.lines = vim_info.lines.filter(line =>
    document.body.contains(line.element)
  );
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

  // Set up MutationObserver to detect new lines
  const observer = new MutationObserver(() => {
    refreshLines();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log("[Vim-Notion] MutationObserver set up to detect new lines");
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
