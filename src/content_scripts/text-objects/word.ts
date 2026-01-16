/**
 * Word text object functions
 */

export const getInnerWordBounds = (text: string, pos: number): [number, number] => {
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

export const getAroundWordBounds = (text: string, pos: number): [number, number] => {
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
  if (
    end ===
    start + (pos - start) + (text.slice(pos).match(/^\w+/)?.[0].length || 0)
  ) {
    while (start > 0 && /\s/.test(text[start - 1])) {
      start--;
    }
  }

  return [start, end];
};
