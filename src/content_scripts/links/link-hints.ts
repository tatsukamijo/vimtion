/**
 * Link Hints System (Vimium-style link navigation)
 * Implements gl command for keyboard-based link navigation
 */

import type { LinkHint } from "../types";
import { currentSettings } from "../state";
import { updateBlockCursor } from "../cursor";
import {
  disableNotionUnsavedWarning,
  restoreNotionUnsavedWarning,
} from "../notion";

/**
 * Enter link-hint mode and display hints for all visible links
 * Requires updateInfoContainer to be passed in (vim.ts dependency)
 */
export const enterLinkHintMode = (updateInfoContainer: () => void) => {
  // Check if link hints feature is enabled
  if (!currentSettings.linkHintsEnabled) {
    return;
  }

  const { vim_info } = window;

  // Switch to link-hint mode
  vim_info.mode = "link-hint";
  vim_info.link_hint_input = "";

  // Detect all links in the document
  const links = detectAllLinks();

  if (links.length === 0) {
    // No links found, exit immediately
    vim_info.mode = "normal";
    updateInfoContainer();
    return;
  }

  // Generate hints for each link
  const hints = generateHints(links.length);

  // Create and display hint overlays
  vim_info.link_hints = [];
  links.forEach((link, index) => {
    const hint = hints[index];
    const overlay = createHintOverlay(link, hint);
    vim_info.link_hints.push({ link, hint, overlay });
  });

  updateInfoContainer();
};

/**
 * Create hint overlay element positioned at link location
 */
export const createHintOverlay = (
  link: HTMLElement,
  hint: string,
): HTMLElement => {
  const overlay = document.createElement("div");
  overlay.className = "vim-link-hint";
  overlay.textContent = hint;
  overlay.style.cssText = `
    position: fixed;
    background: ${currentSettings.hintBackgroundColor};
    color: ${currentSettings.hintTextColor};
    font-family: inherit;
    font-size: ${currentSettings.hintFontSize}px;
    font-weight: bold;
    padding: 2px 5px;
    border-radius: 2px;
    z-index: 99999;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    text-transform: lowercase;
    pointer-events: none;
  `;

  // Position overlay at top-left of link. A table row's hint goes over the
  // page icon at the start of its title cell, leaving the title readable.
  const rect = (isAnchor(link) ? link : collectionItemTarget(link)).getBoundingClientRect();
  const cell = isAnchor(link) ? null : link.querySelector(".notion-table-view-cell");
  overlay.style.top = `${rect.top}px`;
  overlay.style.left = `${cell ? cell.getBoundingClientRect().left : rect.left}px`;

  document.body.appendChild(overlay);
  return overlay;
};

/**
 * Remove all hint overlays from the page
 */
export const removeAllHintOverlays = () => {
  const { vim_info } = window;
  vim_info.link_hints.forEach(({ overlay }) => {
    overlay.remove();
  });
  vim_info.link_hints = [];
};

/**
 * Filter visible hints based on user input and navigate if exact match
 * Requires updateInfoContainer to be passed in (vim.ts dependency)
 */
export const filterHintsByInput = (
  input: string,
  shiftKey: boolean,
  updateInfoContainer: () => void,
) => {
  const { vim_info } = window;
  let matchedHint: LinkHint | null = null;

  vim_info.link_hints.forEach(({ hint, overlay }) => {
    if (hint.startsWith(input)) {
      // Show this hint
      overlay.style.display = "block";

      // Highlight only the matched portion
      if (input.length > 0) {
        const matched = hint.substring(0, input.length);
        const remaining = hint.substring(input.length);
        overlay.innerHTML = `<span style="color: ${currentSettings.hintMatchedColor}">${matched}</span><span style="color: ${currentSettings.hintTextColor}">${remaining}</span>`;
      } else {
        overlay.textContent = hint;
        overlay.style.color = currentSettings.hintTextColor;
      }

      // Check for exact match
      if (hint === input) {
        matchedHint = vim_info.link_hints.find((h) => h.hint === hint)!;
      }
    } else {
      // Hide non-matching hints
      overlay.style.display = "none";
    }
  });

  // If we have an exact match, navigate to it
  if (matchedHint) {
    const { link } = matchedHint as LinkHint;
    if (isAnchor(link)) navigateToLink(link, shiftKey, updateInfoContainer);
    else openCollectionItem(link, shiftKey, updateInfoContainer);
  }
};

/**
 * Navigate to a link (same tab or new tab)
 * Handles both external links and Notion block links
 * Requires updateInfoContainer to be passed in (vim.ts dependency)
 */
export const navigateToLink = (
  link: HTMLAnchorElement,
  openInNewTab: boolean = false,
  updateInfoContainer: () => void,
) => {
  const { vim_info } = window;

  // Exit link-hint mode first
  removeAllHintOverlays();
  vim_info.mode = "normal";
  updateInfoContainer();

  // Check if this is a block link (same page anchor)
  const extractPageId = (url: string) => {
    const match = url.match(/([a-f0-9]{32})(\?|#|$)/);
    return match ? match[1] : null;
  };

  const linkPageId = extractPageId(link.href);
  const currentPageId = extractPageId(window.location.href);
  const isBlockLink = link.href.includes("#") && linkPageId === currentPageId;

  // Note: cursor position is saved when entering link hint mode (gl command)
  // or when pressing Shift+H/L, not here

  // Disable unsaved changes warning before any navigation
  disableNotionUnsavedWarning();

  if (openInNewTab) {
    // Open link in new tab
    window.open(link.href, "_blank");
    // Restore immediately for new tab
    restoreNotionUnsavedWarning();
  } else {
    // Use click() for all navigation to let Notion handle it naturally
    // Remove target attribute to force same-tab navigation
    const originalTarget = link.target;
    link.target = "";

    // Delay click slightly to ensure suppression flag is set
    setTimeout(() => {
      link.click();
      link.target = originalTarget;
    }, 10);

    // Reset flag after navigation
    setTimeout(() => {
      restoreNotionUnsavedWarning();
    }, 100);

    // For block links, update cursor position after navigation
    if (isBlockLink) {
      const blockId = link.href.split("#")[1].split("?")[0];

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
              if (document.contains(vim_info.lines[actualIndex].element)) {
                updateBlockCursor();
              }
            }
          }
        }
      }, 300);
    }
  }
};

const isAnchor = (el: HTMLElement): el is HTMLAnchorElement =>
  el instanceof HTMLAnchorElement;

/** Database rows (table / list views) and cards (board / gallery). */
const COLLECTION_ITEM = ".notion-collection-item";

/**
 * What to click to open a database page: the title text in a table row
 * (clicking another cell would edit it), the item itself elsewhere.
 */
const collectionItemTarget = (item: HTMLElement): HTMLElement => {
  const cell = item.querySelector<HTMLElement>(".notion-table-view-cell");
  if (!cell) return item;
  const leaves = Array.from(cell.querySelectorAll<HTMLElement>("*")).filter(
    (e) =>
      e.childElementCount === 0 &&
      (e.textContent || "").trim() !== "" &&
      e.getBoundingClientRect().width > 0,
  );
  return leaves[0] ?? cell;
};

/** Notion page URL of a database item (its block id is the page id). */
const collectionItemUrl = (item: HTMLElement): string | null => {
  const id = item.dataset.blockId;
  return id ? `${window.location.origin}/${id.replace(/-/g, "")}` : null;
};

/**
 * Open a database page with the row's own "Open" button, which Notion shows
 * on hover and which follows the database's "open pages in" setting (side
 * peek, center peek or full page). Notion ignores script clicks on the title
 * itself. With Shift, or if there is no button, open the page by its URL.
 */
export const openCollectionItem = (
  item: HTMLElement,
  openInNewTab: boolean,
  updateInfoContainer: () => void,
) => {
  const { vim_info } = window;
  removeAllHintOverlays();
  vim_info.mode = "normal";
  updateInfoContainer();

  const url = collectionItemUrl(item);
  if (openInNewTab) {
    if (url) window.open(url, "_blank");
    return;
  }
  const target = collectionItemTarget(item);
  const box = target.getBoundingClientRect();
  const at = { bubbles: true, clientX: box.left + 1, clientY: box.top + box.height / 2, view: window };
  target.dispatchEvent(new PointerEvent("pointerover", at));
  target.dispatchEvent(new MouseEvent("mouseover", at));
  target.dispatchEvent(new PointerEvent("pointermove", at));
  target.dispatchEvent(new MouseEvent("mousemove", at));
  disableNotionUnsavedWarning();
  setTimeout(() => {
    // The innermost one: Notion nests a wrapper with the same text.
    const open = Array.from(item.querySelectorAll<HTMLElement>('[role="button"]'))
      .filter(
        (b) => (b.textContent || "").trim().toLowerCase() === "open" && b.getBoundingClientRect().width > 0,
      )
      .pop();
    if (open) open.click();
    else if (url) window.location.assign(url);
    target.dispatchEvent(new MouseEvent("mouseout", at));
  }, 50);
  setTimeout(() => {
    restoreNotionUnsavedWarning();
  }, 150);
};

const inViewport = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
};

/**
 * Detect all visible links in the document (content, sidebar, and other
 * areas), plus the database rows and cards on screen, which have no <a>.
 */
export const detectAllLinks = (): HTMLElement[] => {
  const links: HTMLElement[] = [];

  // Strategy 1: Find all <a> tags with href in the main content area
  const contentEditableLinks = document.querySelectorAll<HTMLAnchorElement>(
    "[data-content-editable-root] a[href]",
  );
  contentEditableLinks.forEach((link) => links.push(link));

  // Strategy 2: Find sidebar links using multiple selectors for robustness
  const sidebarSelectors = [
    ".notion-sidebar a[href]",
    "[data-sidebar] a[href]",
    ".notion-frame-sidebar a[href]",
    "aside a[href]",
    '[role="navigation"] a[href]',
  ];

  let sidebarLinkCount = 0;
  sidebarSelectors.forEach((selector) => {
    const sidebarLinks = document.querySelectorAll<HTMLAnchorElement>(selector);
    sidebarLinks.forEach((link) => {
      // Only add if not already in the list (avoid duplicates)
      if (!links.includes(link)) {
        links.push(link);
        sidebarLinkCount++;
      }
    });
  });

  // Strategy 3: Find all other links in the document
  const allLinks = document.querySelectorAll<HTMLAnchorElement>("a[href]");
  let otherLinkCount = 0;
  allLinks.forEach((link) => {
    // Only add if not already in the list
    if (!links.includes(link)) {
      links.push(link);
      otherLinkCount++;
    }
  });

  // Strategy 4: database rows and cards (no <a>; a long database would add
  // hundreds, so only those on screen).
  document.querySelectorAll<HTMLElement>(COLLECTION_ITEM).forEach((item) => {
    // Board / gallery cards that are links already have a hint.
    if (item.closest("a[href]") || item.querySelector("a[href]")) return;
    if (item.dataset.blockId && inViewport(item)) {
      links.push(item);
    }
  });

  // Filter out invisible links (zero dimensions or off-screen)
  const visibleLinks = links.filter((link) => {
    const rect = link.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  // Sort links by position: top to bottom, left to right
  visibleLinks.sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();

    // First compare top position
    if (Math.abs(rectA.top - rectB.top) > 5) {
      // 5px tolerance for same line
      return rectA.top - rectB.top;
    }

    // If on same line, compare left position
    return rectA.left - rectB.left;
  });

  return visibleLinks;
};

/**
 * Generate shortest unique hint labels for links
 * Uses custom character set from settings
 */
export const generateHints = (count: number): string[] => {
  const chars = currentSettings.hintCharacters; // Use custom hint characters from settings
  const hints: string[] = [];

  if (count === 0 || chars.length === 0) return hints;

  // Calculate required hint length to avoid prefix conflicts
  // All hints must have the same length to be prefix-free
  const hintLength = Math.ceil(Math.log(count) / Math.log(chars.length));

  for (let i = 0; i < count; i++) {
    let hint = "";
    let num = i;

    // Generate hint with fixed length
    for (let j = 0; j < hintLength; j++) {
      hint = chars[num % chars.length] + hint;
      num = Math.floor(num / chars.length);
    }

    hints.push(hint);
  }

  return hints;
};
