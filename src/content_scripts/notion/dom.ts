/**
 * Notion DOM helper functions
 */

// Helper function to check if an element is inside a code block
export const isInsideCodeBlock = (element: Element): boolean => {
  // Notion code blocks typically have a specific structure
  // Check if the element or its parents have code-related selectors
  const codeContainer =
    element.closest('[class*="code"]') ||
    element.closest("code") ||
    element.closest("pre");
  const isCodeBlock = !!codeContainer;

  return isCodeBlock;
};

// Helper function to get all contenteditable lines within the same code block
export const getCodeBlockLines = (element: Element): Element[] => {
  const codeContainer =
    element.closest('[class*="code"]') || element.closest("[data-block-id]");
  if (!codeContainer) return [];

  return Array.from(codeContainer.querySelectorAll('[contenteditable="true"]'));
};

// Get the block type of an element from its closest [data-block-id] ancestor
export const getBlockType = (element: HTMLElement): string => {
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

// Check if a line is a paragraph boundary (empty line)
export const isParagraphBoundary = (lineIndex: number): boolean => {
  const { vim_info } = window;

  if (lineIndex < 0 || lineIndex >= vim_info.lines.length) {
    return false;
  }

  const line = vim_info.lines[lineIndex];

  // Empty line is a paragraph boundary
  return line.element.textContent?.trim() === "";
};
