/**
 * Typeahead while an async edit runs.
 *
 * Block deletion (dd, Vd) cuts blocks over ~150ms of awaited Notion round
 * trips, with mode temporarily "insert" so Notion's synthetic events pass
 * through. A key typed in that window (ddj, ddx at typing speed) went to the
 * insert reducer and was lost, and a click was ignored and then overridden by
 * the edit's final cursor placement. Vim queues typeahead; so do we: while
 * busy, real keys and clicks are deferred and replayed in order afterwards.
 */

export type Deferred =
  | { kind: "key"; event: KeyboardEvent }
  | { kind: "click"; range: Range };

// A stuck edit must never swallow input forever.
const MAX_BUSY_MS = 3000;

let depth = 0;
let since = 0;
// How long Notion needs after the edit before replayed keys act (see
// beginBusy); the largest asked for since input started queuing.
let settleMs = 0;
let pending: Deferred[] = [];
let flush: (items: Deferred[], settleMs: number) => void = () => {};

export const setBusyFlush = (
  fn: (items: Deferred[], settleMs: number) => void,
): void => {
  flush = fn;
};

const release = (): void => {
  depth = 0;
  const settle = settleMs;
  settleMs = 0;
  if (pending.length === 0) return;
  const items = pending;
  pending = [];
  flush(items, settle);
};

export const isBusy = (): boolean => {
  if (depth > 0 && Date.now() - since > MAX_BUSY_MS) release();
  return depth > 0;
};

/**
 * Start an async edit. `settle` is how long to wait after it ends before
 * replaying queued input (Notion is still committing a block cut for ~100ms;
 * a cursor move needs nothing).
 */
export const beginBusy = (settle = 100): void => {
  if (depth === 0) since = Date.now();
  depth++;
  settleMs = Math.max(settleMs, settle);
};

/** End the edit; replays deferred input once no edit is running. */
export const endBusy = (): void => {
  depth = Math.max(0, depth - 1);
  if (depth === 0) release();
};

/** Nesting depth (replay holds 1 itself; >1 means a replayed edit runs). */
export const busyDepth = (): number => depth;

export const deferInput = (item: Deferred): void => {
  pending.push(item);
};
