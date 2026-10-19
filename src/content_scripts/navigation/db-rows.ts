/**
 * Databases: a row cursor, opening rows, new rows, and stepping through the
 * rows of the page open in a side peek.
 *
 * Database rows are not lines (they hold no editable text until a cell is
 * edited), so j / k pass over a database. In row mode the cursor stays on the
 * database's title line while a highlighted row takes the keys: j / k move
 * between rows (past either end back to the lines around the database),
 * Enter opens the row (Shift+Enter in a new tab), o / O add a row, Esc leaves.
 */

import { openCollectionItem } from "../links/link-hints";

const ITEM = ".notion-collection-item";
const DATABASE = ".notion-collection_view-block";
const ROW_CLASS = "vim-row-cursor";
const BODY_CLASS = "vim-row-mode";

let row: HTMLElement | null = null;
/** The database's title line (the cursor's line while in row mode). */
let titleLine: Element | null = null;

const rowsOf = (database: Element): HTMLElement[] =>
  Array.from(database.querySelectorAll<HTMLElement>(ITEM)).filter(
    (r) => !!r.dataset.blockId && r.getBoundingClientRect().height > 0,
  );

/**
 * The database block holding `el`. Notion nests two elements with the same
 * block id (the title sits in the inner one, the rows only in the outer one),
 * so take the outermost.
 */
const databaseOf = (el: Element | null | undefined): Element | null => {
  let database = el?.closest(DATABASE) ?? null;
  while (database) {
    const outer = database.parentElement?.closest<HTMLElement>(DATABASE);
    if (!outer || outer.dataset.blockId !== (database as HTMLElement).dataset.blockId) break;
    database = outer;
  }
  return database;
};

/** Whether `line` is a database's title (with or without visible rows). */
export const isDatabaseLine = (line: Element | undefined): boolean => !!databaseOf(line);

/** The database whose title `line` is (null for any other line). */
export const databaseOfLine = (line: Element | undefined): Element | null => {
  const database = databaseOf(line);
  return database && rowsOf(database).length > 0 ? database : null;
};

export const inRowMode = (): boolean => {
  if (row && !row.isConnected) exitRowMode();
  return row !== null;
};

const show = (next: HTMLElement) => {
  row?.classList.remove(ROW_CLASS);
  row = next;
  row.classList.add(ROW_CLASS);
  document.body.classList.add(BODY_CLASS);
  // Scroll to the title cell: the whole row is wider than a split view, and
  // bringing it into view would also scroll the table sideways.
  (row.querySelector(".notion-table-view-cell") ?? row).scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
};

export const exitRowMode = () => {
  row?.classList.remove(ROW_CLASS);
  row = null;
  titleLine = null;
  document.body.classList.remove(BODY_CLASS);
};

/** Enter the rows of the database titled by `line`, on its first / last row. */
export const enterRowMode = (line: Element, at: "first" | "last"): boolean => {
  const database = databaseOfLine(line);
  if (!database) return false;
  const rows = rowsOf(database);
  titleLine = line;
  show(at === "first" ? rows[0] : rows[rows.length - 1]);
  return true;
};

/** "Row 2/5" for the status bar ("" outside row mode). */
export const rowStatusText = (): string => {
  if (!inRowMode() || !row) return "";
  const database = databaseOf(row);
  const rows = database ? rowsOf(database) : [];
  return `Row ${rows.indexOf(row) + 1}/${rows.length}`;
};

/**
 * Add a page to `database` with its "New" button, which opens the new page
 * (in a side peek by default) with its title focused; continue in insert
 * mode there.
 */
export const newRow = (database: Element, onOpened: () => void): boolean => {
  // (onOpened runs about 500ms later; the caller holds typeahead until then.)
  // The blue "New" button (its label is translated, its container is not);
  // the dropdown arrow beside it is the button with an icon.
  const button =
    Array.from(
      database.querySelectorAll<HTMLElement>('.notion-collection-view-item-add [role="button"]'),
    ).find((b) => !b.querySelector("svg") && b.getBoundingClientRect().width > 0) ?? null;
  if (!button) return false;
  button.click();
  setTimeout(onOpened, 500);
  return true;
};

export interface RowKeyContext {
  /** Index of `el` in vim_info.lines (-1 if gone). */
  lineIndex: (el: Element) => number;
  setActiveLine: (idx: number) => void;
  updateInfoContainer: () => void;
  enterInsertAfterNewRow: () => void;
  /** Continue in the side peek once it shows the page `blockId`. */
  afterPeekOpens: (blockId: string) => void;
  beginBusy: () => void;
  endBusy: () => void;
}

/**
 * Handle a normal-mode key in row mode. Returns true when the key was used;
 * false when row mode ended and the key should run as usual.
 */
export const handleRowKey = (e: KeyboardEvent, ctx: RowKeyContext): boolean => {
  if (!inRowMode() || !row) return false;
  // Shift / Ctrl ... on their own (before Shift+Enter, O) keep row mode.
  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return true;
  const database = databaseOf(row);
  const rows = database ? rowsOf(database) : [];
  const i = rows.indexOf(row);
  const title = titleLine;
  const titleIndex = title ? ctx.lineIndex(title) : -1;

  switch (e.key) {
    case "j":
      if (i !== -1 && i + 1 < rows.length) {
        show(rows[i + 1]);
      } else {
        exitRowMode();
        if (titleIndex !== -1) ctx.setActiveLine(titleIndex + 1);
      }
      ctx.updateInfoContainer();
      return true;
    case "k":
      if (i > 0) {
        show(rows[i - 1]);
      } else {
        exitRowMode();
        if (titleIndex !== -1) ctx.setActiveLine(titleIndex);
      }
      ctx.updateInfoContainer();
      return true;
    case "Enter": {
      const target = row;
      exitRowMode();
      openCollectionItem(target, e.shiftKey, ctx.updateInfoContainer);
      if (!e.shiftKey && target.dataset.blockId) ctx.afterPeekOpens(target.dataset.blockId);
      return true;
    }
    case "o":
    case "O":
      exitRowMode();
      ctx.beginBusy();
      if (!database || !newRow(database, () => {
        ctx.enterInsertAfterNewRow();
        ctx.endBusy();
      })) {
        ctx.endBusy();
      }
      ctx.updateInfoContainer();
      return true;
    case "Escape":
      exitRowMode();
      ctx.updateInfoContainer();
      return true;
    default:
      // Any other command leaves row mode and runs on the title line.
      exitRowMode();
      return false;
  }
};

/** The row of the page shown in the side peek (?p=<id> in the URL). */
const peekedRow = (): HTMLElement | null => {
  const id = new URLSearchParams(window.location.search).get("p");
  if (!id) return null;
  const uuid = id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  return document.querySelector<HTMLElement>(`${ITEM}[data-block-id="${uuid}"]`);
};

/**
 * Back on the page from a side peek: the cursor goes to the row of the page
 * that was open, in row mode. Returns the database title's line index, or -1
 * when that row is not on this page.
 */
export const returnToPeekedRow = (lines: { element: Element }[]): number => {
  const item = peekedRow();
  const database = databaseOf(item);
  if (!item || !database) return -1;
  const idx = lines.findIndex((l) => databaseOf(l.element) === database);
  if (idx === -1) return -1;
  titleLine = lines[idx].element;
  show(item);
  return idx;
};

/**
 * Ctrl+j / Ctrl+k: open the next / previous row of the database page shown
 * in the side peek (the peeked page is ?p=<id> in the URL).
 */
export const stepPeekedRow = (step: 1 | -1, updateInfoContainer: () => void): string | null => {
  const item = peekedRow();
  const database = databaseOf(item);
  if (!item || !database) return null;
  const rows = rowsOf(database);
  const next = rows[rows.indexOf(item) + step];
  if (!next || !next.dataset.blockId) return null;
  openCollectionItem(next, false, updateInfoContainer);
  return next.dataset.blockId;
};

/** Whether the side peek shows a database row of this page. */
export const hasPeekedRow = (): boolean => !!databaseOf(peekedRow());
