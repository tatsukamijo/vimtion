/**
 * Vim's `.`: repeat the last change.
 *
 * The keys of a change are recorded as the user types them: from the
 * command that starts it (x, dw, ciw, o + text + Esc, 3dd, ...) until
 * Vimtion is back in normal mode with nothing pending. `.` replays them
 * through the typeahead queue (core/busy.ts), which already knows how to
 * replay insert-mode text, Backspace / Enter and the jk escape, and paces
 * itself around async edits such as dd and o.
 */

import { beginBusy, endBusy, deferInput, isBusy } from "./busy";
import { inRowMode } from "../navigation/db-rows";
import { inPageLinkMode } from "../navigation/page-links";
import { inSidebarMode } from "../navigation/sidebar";
import { isDocumentEditable } from "./dom-utils";

// Normal-mode keys that start a change. (u / r are undo / redo here, y only
// yanks, v / V start a selection: none of these is repeatable.)
const CHANGE_START = new Set([
  "x", "X", "s", "S", "C", "D", "d", "c", "o", "O", "i", "a", "I", "A", "p", "P",
  "~", "J", ">", "<",
]);

let recording: KeyboardEvent[] | null = null;
let countPrefix: KeyboardEvent[] = [];
let lastChange: KeyboardEvent[] = [];

const idle = (): boolean => {
  const { vim_info } = window;
  return vim_info.mode === "normal" && !vim_info.pending_operator && !isBusy();
};

const plain = (e: KeyboardEvent) => !e.ctrlKey && !e.metaKey && !e.altKey;

/** Finish the change being recorded once Vimtion is idle in normal mode. */
const finishIfIdle = () => {
  if (recording && idle()) {
    if (recording.length > 0) lastChange = recording;
    recording = null;
  }
};

/** Watch a real keydown before Vimtion handles it. */
export const recordKey = (e: KeyboardEvent): void => {
  if (!e.isTrusted || ["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;
  // Only keys typed into the page: not the search bar, a comment box, a
  // database cell or any other Notion field.
  const t = e.target as HTMLElement | null;
  const editable = t?.closest?.('[contenteditable="true"]') ?? null;
  const onPage = t === document.body || (!!editable && isDocumentEditable(editable));
  if (!onPage) return;
  // Keys taken by the database row cursor (o adds a row) are not text edits.
  if (inRowMode() || inSidebarMode() || inPageLinkMode()) return;
  const { vim_info } = window;

  // `.` itself is never part of a change; it closes the one in progress.
  // While dd / x / p run asynchronously Vimtion is briefly in an internal
  // insert state, so for a change that never types text a `.` is the command
  // even then; after i / a / o / c... it is text until Esc.
  const typesText = (keys: KeyboardEvent[]) => {
    const first = keys.find((k) => !/^[0-9]$/.test(k.key));
    return !!first && "iaoOIAsSCc".includes(first.key);
  };
  const dotIsCommand =
    !vim_info.pending_operator &&
    (vim_info.mode === "normal" ||
      (!!recording && recording.length > 0 && !typesText(recording)));
  if (e.key === "." && plain(e) && dotIsCommand) {
    if (recording && recording.length > 0) lastChange = recording;
    recording = null;
    countPrefix = [];
    return;
  }

  finishIfIdle();
  if (recording) {
    recording.push(e);
    return;
  }
  if (vim_info.mode !== "normal" || vim_info.pending_operator || !plain(e)) {
    countPrefix = [];
    return;
  }
  if (/^[1-9]$/.test(e.key) || (e.key === "0" && countPrefix.length > 0)) {
    countPrefix.push(e);
    return;
  }
  if (CHANGE_START.has(e.key)) {
    recording = [...countPrefix, e];
    // A one-key change (x, p) is complete as soon as it ran.
    setTimeout(finishIfIdle, 0);
  }
  countPrefix = [];
};

/** Replay the last change (the `.` command). */
export const repeatLastChange = (): void => {
  if (lastChange.length === 0) return;
  beginBusy(0);
  lastChange.forEach((event) => deferInput({ kind: "key", event }));
  endBusy();
};
