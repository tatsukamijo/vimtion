/**
 * Bracket and quote text object functions
 */

// Helper function to find matching quotes (where open and close are the same)
export const findMatchingQuotes = (
  text: string,
  cursorPos: number,
  quoteChar: string,
): [number, number] | null => {
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
export const findMatchingBrackets = (
  text: string,
  cursorPos: number,
  openChar: string,
  closeChar: string,
): [number, number] | null => {
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
