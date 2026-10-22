/**
 * Page blocks in the page (sub-pages and links to pages): j / k stop on them
 * like on database rows.
 *
 * They hold no editable text, so they are not lines. Moving past one, the
 * cursor highlights it while the caret stays on the line above it: j / k move
 * on (back to the lines around it past either end), Enter opens the page
 * (Shift+Enter in a new tab), Esc leaves. Motions to elsewhere (gg, G, { },
 * /, Ctrl+d ...) leave and run as usual; editing keys do nothing, since the
 * line they would edit is not the one highlighted.
 */

import { currentSurface } from "../core/dom-utils";
import { navigateToLink } from "../links/link-hints";

const BLOCK = ".notion-page-block, .notion-alias-block";
const OVERLAY_CLASS = "vim-page-link-cursor";
const BODY_CLASS = "vim-page-link-mode";

/** Keys that leave the page link and run on the line as usual. */
const PASS_THROUGH = ["g", "G", "{", "}", "/", "?", "n", "N", "H", "L", ":"];

let item: HTMLElement | null = null;
/** The line above the highlighted block (the caret's line meanwhile). */
let anchor: Element | null = null;
let anchorBlockId: string | null = null;

const linkOf = (block: Element): HTMLAnchorElement | null => block.querySelector<HTMLAnchorElement>("a[href]");

/**
 * The page's page blocks, top to bottom. The page's own title is a page
 * block too (with editable text); blocks inside a database are its rows.
 */
const pageLinks = (): HTMLElement[] => {
  const root = currentSurface();
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(BLOCK)).filter(
    (b) =>
      !b.querySelector('[contenteditable="true"]') &&
      !!linkOf(b) &&
      !b.closest(".notion-collection_view-block") &&
      b.getBoundingClientRect().height > 0,
  );
};

/** Whether `b` comes after `a` in the page (and neither holds the other). */
const after = (a: Node, b: Node): boolean =>
  !a.contains(b) && !b.contains(a) && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/** The page blocks between line `idx` and the next line. */
const linksAfterLine = (idx: number): HTMLElement[] => {
  const { lines } = window.vim_info;
  const line = lines[idx]?.element;
  if (!line) return [];
  const next = lines[idx + 1]?.element;
  return pageLinks().filter((b) => after(line, b) && (!next || after(b, next)));
};

// The highlight is a box drawn over the block: Notion reverts any change
// made to the page's own elements (a class or an attribute on the block).
let overlay: HTMLDivElement | null = null;

const place = () => {
  if (!item || !overlay) return;
  if (!item.isConnected) {
    // Notion re-rendered the block: the same block again, by its block id.
    const id = item.dataset.blockId;
    const again = id ? pageLinks().find((b) => b.dataset.blockId === id) : undefined;
    if (!again) return;
    item = again;
  }
  const r = item.getBoundingClientRect();
  // Only the part inside the page's scroll area (not over its header).
  const view = item.closest(".notion-scroller")?.getBoundingClientRect();
  const top = Math.max(r.top, view?.top ?? r.top);
  const bottom = Math.min(r.bottom, view?.bottom ?? r.bottom);
  overlay.style.display = bottom > top ? "block" : "none";
  overlay.style.left = `${r.left}px`;
  overlay.style.width = `${r.width}px`;
  overlay.style.top = `${top}px`;
  overlay.style.height = `${Math.max(0, bottom - top)}px`;
};

const show = (next: HTMLElement) => {
  item = next;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;
    document.body.appendChild(overlay);
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
  }
  document.body.classList.add(BODY_CLASS);
  item.scrollIntoView({ block: "nearest" });
  place();
};

export const exitPageLinkMode = () => {
  item = null;
  anchor = null;
  anchorBlockId = null;
  if (overlay) {
    overlay.remove();
    overlay = null;
    document.removeEventListener("scroll", place, true);
    window.removeEventListener("resize", place);
  }
  document.body.classList.remove(BODY_CLASS);
};

export const inPageLinkMode = (): boolean => {
  if (item && !item.isConnected) {
    // Notion re-rendered the block: find it again by its block id.
    const id = item.dataset.blockId;
    const again = id ? pageLinks().find((b) => b.dataset.blockId === id) : undefined;
    if (again) {
      item = again;
      place();
    } else {
      exitPageLinkMode();
    }
  }
  return item !== null;
};

/** The caret's line index (found again by its block when Notion re-rendered it). */
const anchorIndex = (): number => {
  const { lines } = window.vim_info;
  if (anchor && !anchor.isConnected) {
    const id = anchorBlockId;
    const again = id ? lines.find((l) => l.element.closest("[data-block-id]")?.getAttribute("data-block-id") === id) : undefined;
    anchor = again?.element ?? null;
  }
  return anchor ? lines.findIndex((l) => l.element === anchor) : -1;
};

/**
 * Highlight the first / last page block between line `idx` and the next
 * line; false when there is none.
 */
export const enterPageLinkMode = (idx: number, at: "first" | "last"): boolean => {
  const links = linksAfterLine(idx);
  if (links.length === 0) return false;
  anchor = window.vim_info.lines[idx].element;
  anchorBlockId = anchor.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null;
  show(at === "first" ? links[0] : links[links.length - 1]);
  return true;
};

/** "Page 2/3" for the status bar ("" when no page block is highlighted). */
export const pageLinkStatusText = (): string => {
  if (!inPageLinkMode() || !item) return "";
  const links = pageLinks();
  return `Page ${links.indexOf(item) + 1}/${links.length}`;
};

export interface PageLinkKeyContext {
  /** Leave downwards: onto the line `idx` (the one after the blocks). */
  leaveDown: (idx: number) => void;
  /** Leave upwards: onto the line `idx` (the one before the blocks). */
  leaveUp: (idx: number) => void;
  updateInfoContainer: () => void;
  /** Before leaving the page for another (Back restores the cursor). */
  saveCursorPosition: () => void;
}

/**
 * Handle a normal-mode key with a page block highlighted. Returns true when
 * the key was used; false when the highlight ended and the key should run as
 * usual.
 */
export const handlePageLinkKey = (e: KeyboardEvent, ctx: PageLinkKeyContext): boolean => {
  if (!inPageLinkMode() || !item) return false;
  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return true;
  const idx = anchorIndex();
  const links = idx === -1 ? [] : linksAfterLine(idx);
  const i = links.indexOf(item);

  switch (e.key) {
    case "j":
    case "ArrowDown":
      if (i !== -1 && i + 1 < links.length) {
        show(links[i + 1]);
      } else {
        exitPageLinkMode();
        if (idx !== -1) ctx.leaveDown(idx + 1);
      }
      break;
    case "k":
    case "ArrowUp":
      if (i > 0) {
        show(links[i - 1]);
      } else {
        exitPageLinkMode();
        if (idx !== -1) ctx.leaveUp(idx);
      }
      break;
    case "Enter": {
      const link = linkOf(item);
      exitPageLinkMode();
      if (link) {
        if (!e.shiftKey) ctx.saveCursorPosition();
        navigateToLink(link, e.shiftKey, ctx.updateInfoContainer);
      }
      break;
    }
    case "Escape":
      exitPageLinkMode();
      break;
    default:
      if (PASS_THROUGH.includes(e.key)) {
        exitPageLinkMode();
        ctx.updateInfoContainer();
        return false;
      }
      // Editing keys: the caret's line is not the highlighted block.
      break;
  }
  ctx.updateInfoContainer();
  return true;
};
