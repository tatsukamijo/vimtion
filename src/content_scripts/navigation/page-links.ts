/**
 * Page blocks in the page (sub-pages and links to pages): j / k stop on them
 * like on database rows.
 *
 * They hold no editable text, so they are not lines. Moving past one, the
 * cursor highlights it while the caret stays on the line above it: j / k move
 * on (back to the lines around it past either end), Enter opens the page
 * (Shift+Enter in a new tab), dd cuts the block (p puts it back), Esc
 * leaves. Motions to elsewhere (gg, G, { }, /, Ctrl+d ...) leave and run as
 * usual; other editing keys do nothing, since the line they would edit is not
 * the one highlighted.
 */

import { currentSurface } from "../core/dom-utils";
import { payloadOf, writeClipboard } from "../core/clipboard";
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
let pendingD = false;

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
  pendingD = false;
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

/**
 * Highlight the page block `blockId` (coming back to the page it was opened
 * from). Returns the caret's line index (the line above it), or -1.
 */
export const enterPageLinkModeOn = (blockId: string): number => {
  const block = pageLinks().find((b) => b.dataset.blockId === blockId);
  if (!block) return -1;
  const { lines } = window.vim_info;
  for (let idx = lines.length - 1; idx >= 0; idx--) {
    if (after(lines[idx].element, block)) {
      if (!linksAfterLine(idx).includes(block)) return -1;
      anchor = lines[idx].element;
      anchorBlockId = anchor.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null;
      show(block);
      return idx;
    }
  }
  return -1;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const until = async <T>(find: () => T | null | undefined, ms: number): Promise<T | null> => {
  for (let waited = 0; ; waited += 30) {
    const found = find();
    if (found) return found;
    if (waited >= ms) return null;
    await sleep(30);
  }
};

const hover = (x: number, y: number) => {
  const target = document.elementFromPoint(x, y);
  if (!target) return;
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    pointerType: "mouse",
    isPrimary: true,
    pointerId: 1,
  };
  target.dispatchEvent(new PointerEvent("pointerover", init));
  target.dispatchEvent(new MouseEvent("mouseover", init));
  target.dispatchEvent(new PointerEvent("pointermove", init));
  target.dispatchEvent(new MouseEvent("mousemove", init));
};

/**
 * Cut a page block, as Notion's own block cut does (the page goes along and
 * comes back with a paste). Notion takes no synthetic keys for a block and
 * maps any selection inside it onto the next line, so: hover the block for
 * its drag handle, click the handle (Notion selects the block and opens its
 * menu), and cut. True when the block is gone.
 */
const cutPageBlock = async (block: HTMLElement): Promise<boolean> => {
  const r = block.getBoundingClientRect();
  // The handle shows when the pointer comes onto the block from elsewhere.
  hover(r.left + 2, Math.max(0, r.top - 40));
  await sleep(50);
  // On its left edge, before the icon (not the title: that shows the page's
  // preview; and the handle only comes for the left part of a wide block).
  hover(r.left + 4, r.top + r.height / 2);
  const handle = await until(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>('[role="button"]')).find((h) => {
        if (!h.querySelector("svg.dragHandle")) return false;
        const hr = h.getBoundingClientRect();
        return hr.width > 0 && hr.right <= r.left + 8 && hr.top < r.bottom && hr.bottom > r.top;
      }),
    600,
  );
  if (!handle) return false;
  handle.click();
  // The menu (its search box takes the focus).
  const menu = await until(() => document.querySelector('[role="option"] svg.trash'), 800);
  if (!menu) return false;
  const data = new DataTransfer();
  (document.activeElement ?? document).dispatchEvent(
    new ClipboardEvent("cut", { clipboardData: data, bubbles: true, cancelable: true }),
  );
  const gone = await until(() => (block.isConnected ? null : true), 800);
  if (!gone) {
    // Close the menu again.
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }),
    );
    return false;
  }
  // A block: p puts it back as a line, below the cursor's line.
  window.vim_info.yank_type = "line";
  if (data.types.length > 0) await writeClipboard(payloadOf(data)).catch(() => {});
  return true;
};

/** "Page 2/3" for the status bar ("" when no page block is highlighted). */
export const pageLinkStatusText = (): string => {
  if (!inPageLinkMode() || !item) return "";
  const links = pageLinks();
  return `Page ${links.indexOf(item) + 1}/${links.length}`;
};

export interface PageLinkKeyContext {
  /** Typed keys wait while a block is cut. */
  beginBusy: () => void;
  endBusy: () => void;
  /**
   * After a cut: the lines changed; the caret goes back on the line of the
   * block `blockId` (or `fallback`). Returns that line's index.
   */
  afterCut: (blockId: string | null, fallback: number) => number;
  /** Leave downwards: onto the line `idx` (the one after the blocks). */
  leaveDown: (idx: number) => void;
  /** Leave upwards: onto the line `idx` (the one before the blocks). */
  leaveUp: (idx: number) => void;
  updateInfoContainer: () => void;
  /** Before leaving the page for another (Back restores the cursor on the block `pageLinkId`). */
  saveCursorPosition: (pageLinkId: string | null) => void;
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
  const d = pendingD;
  pendingD = false;

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
      const id = item.dataset.blockId ?? null;
      exitPageLinkMode();
      if (link) {
        if (!e.shiftKey) ctx.saveCursorPosition(id);
        navigateToLink(link, e.shiftKey, ctx.updateInfoContainer);
      }
      break;
    }
    case "d": {
      if (!d) {
        pendingD = true;
        break;
      }
      // dd: cut the block, then on to the block now in its place (else the
      // line after the blocks), as dd goes on to the next line.
      const block = item;
      const anchorId = anchorBlockId;
      ctx.beginBusy();
      cutPageBlock(block)
        .then((cut) => {
          if (!cut) return;
          // (The highlight may have ended meanwhile: its block is gone.)
          const at = ctx.afterCut(anchorId, idx);
          if (at === -1) return;
          anchor = window.vim_info.lines[at].element;
          anchorBlockId = anchorId;
          const rest = linksAfterLine(at);
          if (i !== -1 && i < rest.length) {
            show(rest[i]);
          } else {
            exitPageLinkMode();
            ctx.leaveDown(at + 1);
          }
        })
        .catch(() => {})
        .finally(() => {
          ctx.updateInfoContainer();
          ctx.endBusy();
        });
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
