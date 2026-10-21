/**
 * The left sidebar: Ctrl+h from the page highlights an item there, and the
 * keys move through the sidebar until Ctrl+l / Esc go back to the page.
 *
 * Like the database row cursor, the caret stays on the page; a highlighted
 * item takes the keys: j / k (and gg / G, Ctrl+d / Ctrl+u) move, Enter opens
 * it (Shift+Enter a page in a new tab), l / h expand and collapse it.
 */

const SIDEBAR = ".notion-sidebar";
const ITEM_CLASS = "vim-sidebar-cursor";
const BODY_CLASS = "vim-sidebar-mode";

let item: HTMLElement | null = null;
let pendingG = false;

const sidebar = (): HTMLElement | null => {
  const el = document.querySelector<HTMLElement>(SIDEBAR);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Collapsed, Notion keeps it in the DOM off-screen (or as a hover overlay).
  return r.width > 40 && r.right > 40 ? el : null;
};

const visible = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return r.height > 0 && r.width > 0;
};

/**
 * The sidebar's rows, top to bottom: pages (treeitems), and section headers
 * and actions with a label (Recents, Private, View all, Search ...). The
 * small buttons inside a row (expand arrow, "...", "+") are not rows.
 */
const itemsOf = (root: HTMLElement): HTMLElement[] => {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('[role="treeitem"], [role="button"]'),
  ).filter(
    (el) =>
      visible(el) &&
      (el.getAttribute("role") === "treeitem" || (el.textContent ?? "").trim() !== "") &&
      !el.parentElement?.closest('[role="treeitem"]'),
  );
  return candidates.filter((el) => !candidates.some((c) => c !== el && c.contains(el)));
};

const pageIdOf = (href: string): string | null => href.match(/([a-f0-9]{32})(?:[?#]|$)/)?.[1] ?? null;

export const inSidebarMode = (): boolean => {
  if (item && !item.isConnected) {
    // Notion re-renders the list (a page opened, a section expanded): find
    // the item again by its link or label, else leave.
    const root = sidebar();
    const href = item.getAttribute("href");
    const label = (item.textContent ?? "").trim();
    const again = root
      ? itemsOf(root).find((el) =>
          href ? el.getAttribute("href") === href : (el.textContent ?? "").trim() === label,
        )
      : undefined;
    if (again) show(again);
    else exitSidebarMode();
  }
  return item !== null;
};

const show = (next: HTMLElement) => {
  item?.classList.remove(ITEM_CLASS);
  item = next;
  item.classList.add(ITEM_CLASS);
  document.body.classList.add(BODY_CLASS);
  item.scrollIntoView({ block: "nearest" });
};

export const exitSidebarMode = () => {
  item?.classList.remove(ITEM_CLASS);
  item = null;
  pendingG = false;
  document.body.classList.remove(BODY_CLASS);
};

/**
 * Highlight the item of the page open now (else the first page); false when
 * the sidebar is closed.
 */
export const enterSidebarMode = (): boolean => {
  const root = sidebar();
  if (!root) return false;
  const items = itemsOf(root);
  if (items.length === 0) return false;
  const here = pageIdOf(window.location.pathname);
  const current =
    (here && items.find((el) => pageIdOf(el.getAttribute("href") ?? "") === here)) ||
    items.find((el) => el.getAttribute("role") === "treeitem") ||
    items[0];
  show(current);
  return true;
};

/** "Sidebar 3/20" for the status bar ("" outside sidebar mode). */
export const sidebarStatusText = (): string => {
  if (!inSidebarMode() || !item) return "";
  const root = sidebar();
  const items = root ? itemsOf(root) : [];
  return `Sidebar ${items.indexOf(item) + 1}/${items.length}`;
};

/** The expand / collapse control of an item and whether it is expanded. */
const expander = (el: HTMLElement): { button: HTMLElement; expanded: boolean } | null => {
  const own = el.getAttribute("aria-expanded");
  const inner = el.querySelector<HTMLElement>('[role="button"][aria-expanded]');
  if (el.getAttribute("role") === "treeitem" && inner) {
    return { button: inner, expanded: (own ?? inner.getAttribute("aria-expanded")) === "true" };
  }
  if (own !== null) return { button: el, expanded: own === "true" };
  return null;
};

export interface SidebarKeyContext {
  updateInfoContainer: () => void;
  /** Before leaving the page for another (Back restores the cursor). */
  saveCursorPosition: () => void;
}

/**
 * Handle a normal-mode key in sidebar mode. Returns true when sidebar mode
 * took the key (every key while it is on: typing must not reach the page).
 */
export const handleSidebarKey = (e: KeyboardEvent, ctx: SidebarKeyContext): boolean => {
  if (!inSidebarMode() || !item) return false;
  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return true;
  const root = sidebar();
  if (!root) {
    exitSidebarMode();
    ctx.updateInfoContainer();
    return false;
  }
  const items = itemsOf(root);
  const i = items.indexOf(item);
  const moveTo = (n: number) => {
    const next = items[Math.max(0, Math.min(items.length - 1, n))];
    if (next) show(next);
  };
  const g = pendingG;
  pendingG = false;
  const key = e.ctrlKey ? `C-${e.key.toLowerCase()}` : e.key;

  switch (key) {
    case "j":
    case "ArrowDown":
      moveTo(i + 1);
      break;
    case "k":
    case "ArrowUp":
      moveTo(i - 1);
      break;
    case "g":
      if (g) moveTo(0);
      else pendingG = true;
      break;
    case "G":
      moveTo(items.length - 1);
      break;
    case "C-d":
    case "C-u": {
      const r = root.getBoundingClientRect();
      const perScreen = items.filter((el) => {
        const b = el.getBoundingClientRect();
        return b.top >= r.top && b.bottom <= r.bottom;
      }).length;
      const step = Math.max(1, Math.floor(perScreen / 2));
      moveTo(key === "C-d" ? i + step : i - step);
      break;
    }
    case "l":
    case "h": {
      const x = expander(item);
      if (x && x.expanded === (key === "h")) x.button.click();
      break;
    }
    case "Enter": {
      const target = item;
      const href = target.getAttribute("href");
      exitSidebarMode();
      if (e.shiftKey && href) {
        window.open(new URL(href, window.location.href).href, "_blank");
      } else {
        if (href) ctx.saveCursorPosition();
        target.click();
      }
      break;
    }
    case "Escape":
    case "C-l":
    case "C-[":
      exitSidebarMode();
      break;
    default:
      // Anything else is not for the sidebar; it must not edit the page.
      break;
  }
  ctx.updateInfoContainer();
  return true;
};
