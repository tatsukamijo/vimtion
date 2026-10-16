#!/usr/bin/env node
/**
 * Vimtion live driver — server half.
 *
 * Keeps ONE logged-in Chromium (with the freshly built dist/ loaded as an
 * unpacked extension) alive between commands, so an agent (or a human) can
 * drive Notion step by step from the shell via `tools/notion-driver/vt`.
 *
 * Why a long-lived server instead of more Playwright specs: bug hunting is
 * exploratory and stateful (press keys → look → press more). Relaunching the
 * browser and reloading Notion per step costs ~10s and destroys the state
 * that reproduces the bug.
 *
 * Endpoints (localhost only):  POST /cmd  {"cmd": "...", ...args}  → JSON
 * See tools/notion-driver/README.md for the command list.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DIST = path.join(ROOT, "dist");
const SRC_PROFILE = path.join(ROOT, "test", "auth", ".user-data");
const PORT = Number(process.env.VT_PORT || 9333);
// One profile / state file / output dir per port, so several drivers (e.g.
// parallel bug-hunting agents) can run at once without sharing a page.
const PROFILE = path.join(HERE, `.profile-${PORT}`);
const STATE_FILE = path.join(HERE, `.state-${PORT}.json`);
const OUT_DIR = path.join(HERE, "out", String(PORT));
const HEADLESS = process.argv.includes("--headless");

// ---------------------------------------------------------------------------
// env / persistent state
// ---------------------------------------------------------------------------

function loadEnv() {
  const p = path.join(ROOT, "test", ".env");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    const eq = t.indexOf("=");
    if (t && !t.startsWith("#") && eq > 0) out[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return out;
}
const ENV = loadEnv();

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { fixtures: [] };
  }
}
function writeState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

/**
 * The driver uses its own copy of a login profile so it can run while
 * `npm test` holds test/auth/.user-data (Chromium locks a profile dir).
 * New ports are seeded from the default port's profile when it exists (it is
 * the one most recently logged in), else from the Playwright auth profile.
 * Caches are skipped: they are ~900MB per profile and not needed for login.
 */
const SEED_PROFILE = path.join(HERE, ".profile-9333");
const CACHE_DIRS = /(^|\/)(Cache|Code Cache|GPUCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache|GrShaderCache|GraphiteDawnCache|ShaderCache|CacheStorage|ScriptCache|component_crx_cache|optimization_guide_model_store|Safe Browsing)(\/|$)|Singleton(Lock|Socket|Cookie)$/;

function ensureProfile() {
  if (fs.existsSync(PROFILE)) return;
  const src = PROFILE !== SEED_PROFILE && fs.existsSync(SEED_PROFILE) ? SEED_PROFILE : SRC_PROFILE;
  if (!fs.existsSync(src)) {
    throw new Error(
      "No login profile. Run `PW_HEADLESS=false npm run test:setup-auth` once to log in to Notion.",
    );
  }
  fs.cpSync(src, PROFILE, {
    recursive: true,
    filter: (p) => !CACHE_DIRS.test(path.relative(src, p)),
  });
}

let context = null;
let page = null;
let cdp = null;
/** contextId of the extension's isolated world in the main frame. */
let isoContextId = null;
let mainFrameId = null;
const consoleBuf = [];

/**
 * Chrome persists "disabled" for an unpacked extension whose directory vanished
 * while it was running (e.g. `npm run build` does `rm -rf dist`). Drop our
 * extension's saved entry before each launch so --load-extension re-registers
 * it cleanly; nothing else in the profile is touched.
 */
function forgetDistExtensionState() {
  for (const name of ["Preferences", "Secure Preferences"]) {
    const f = path.join(PROFILE, "Default", name);
    if (!fs.existsSync(f)) continue;
    try {
      const prefs = JSON.parse(fs.readFileSync(f, "utf8"));
      const settings = prefs.extensions?.settings || {};
      const macs = prefs.protection?.macs?.extensions?.settings || {};
      let changed = false;
      for (const [id, v] of Object.entries(settings)) {
        if (v && v.path === DIST) {
          delete settings[id];
          delete macs[id];
          changed = true;
        }
      }
      if (changed) fs.writeFileSync(f, JSON.stringify(prefs));
    } catch {
      // Unreadable prefs: leave them to Chrome.
    }
  }
}

async function launch() {
  ensureProfile();
  forgetDistExtensionState();
  context = await chromium.launchPersistentContext(PROFILE, {
    channel: "chromium",
    headless: HEADLESS,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      "--no-first-run",
      "--disable-blink-features=AutomationControlled",
    ],
    ignoreDefaultArgs: ["--disable-component-extensions-with-background-pages"],
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  page = context.pages()[0] || (await context.newPage());
  await attachPage(page);
}

async function attachPage(p) {
  page = p;
  cdp = await context.newCDPSession(page);
  isoContextId = null;
  cdp.on("Runtime.executionContextCreated", ({ context: c }) => {
    const aux = c.auxData || {};
    if (aux.type === "isolated" && /vimtion/i.test(c.name)) {
      if (!mainFrameId || aux.frameId === mainFrameId) isoContextId = c.id;
    }
  });
  cdp.on("Runtime.executionContextDestroyed", ({ executionContextId }) => {
    if (executionContextId === isoContextId) isoContextId = null;
  });
  cdp.on("Runtime.executionContextsCleared", () => {
    isoContextId = null;
  });
  const tree = await cdp.send("Page.getFrameTree");
  mainFrameId = tree.frameTree.frame.id;
  await cdp.send("Runtime.enable");
  page.on("console", (m) => {
    consoleBuf.push(`[${m.type()}] ${m.text()}`);
    if (consoleBuf.length > 500) consoleBuf.shift();
  });
  page.on("pageerror", (e) => consoleBuf.push(`[pageerror] ${e.message}`));
}

/** Evaluate an expression inside Vimtion's isolated world (sees window.vim_info). */
async function evalIso(expression) {
  for (let i = 0; i < 40 && !isoContextId; i++) await sleep(100);
  if (!isoContextId) throw new Error("Vimtion isolated world not found (extension not injected?)");
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    contextId: isoContextId,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Page preparation
// ---------------------------------------------------------------------------

/** Remove Vimtion's own notification overlays and Notion promo dialogs. */
async function clearOverlays() {
  await page
    .evaluate(() => {
      document
        .querySelectorAll(
          ".vimtion-update-notification, .vimtion-notification-overlay, .vimtion-vimium-warning",
        )
        .forEach((el) => el.remove());
      // Notion marketing / onboarding modals: click their close button if any.
      document
        .querySelectorAll('[role="dialog"] [aria-label="Close"], .notion-dialog [aria-label="Close"]')
        .forEach((b) => b.click());
    })
    .catch(() => {});
}

async function openUrl(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1500 * attempt);
    }
  }
  if (/\/(login|signup)/.test(page.url())) {
    throw new Error(
      "Notion session expired (redirected to login). Run `PW_HEADLESS=false npm run test:setup-auth`, then `vt clean --all`.",
    );
  }
  await page.waitForSelector(".vim-mode", { timeout: 30_000 });
  await page.waitForSelector('[data-content-editable-leaf="true"]', { timeout: 30_000 });
  await sleep(800);
  await clearOverlays();
  // Notion modals sometimes mount late; one more pass.
  await sleep(700);
  await clearOverlays();
  // Escape: closes any remaining Notion popup and puts Vimtion in normal mode.
  await page.keyboard.press("Escape");
  await sleep(300);
  // Make sure the editor (not the body) owns focus so Vimtion's reducers fire.
  await evalIso(`(() => {
    const vi = window.vim_info;
    if (!vi || !vi.lines.length) return;
    const el = vi.lines[vi.active_line]?.element;
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  })()`).catch(() => {});
  await waitUntilSettled();
  return snapshot();
}

/**
 * Wait until Vimtion's line cache stops changing. Keys sent while Notion is
 * still hydrating the page get lost or land on the wrong line, which made
 * setup navigation non-deterministic right after `fixture`/`refixture`.
 */
async function waitUntilSettled(timeoutMs = 5000) {
  let prev = "";
  let stable = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const sig = await evalIso(
      `(() => { const v = window.vim_info; return v ? v.mode + ":" + v.lines.length + ":" + v.active_line + ":" + document.querySelectorAll('[contenteditable="true"]').length : ""; })()`,
    ).catch(() => "");
    stable = sig && sig === prev ? stable + 1 : 0;
    prev = sig;
    if (stable >= 3) return;
    await sleep(200);
  }
}

// ---------------------------------------------------------------------------
// Fixture pages (Notion API)
// ---------------------------------------------------------------------------

/**
 * Compact fixture spec, one block per line:
 *   # / ## / ###     heading 1/2/3          - text     bulleted list
 *   1. text          numbered list          [ ] / [x]  to-do
 *   > text           quote                  ! text     callout
 *   >> text          toggle                 ---        divider
 *   ```lang ... ```  code block (multi-line)
 *   (empty line)     empty paragraph        anything else → paragraph
 * Indent by 2 spaces per level to nest under the previous list/todo/toggle item.
 */
function parseFixture(spec) {
  // Inline formatting: **bold**, *italic*, `code` (not inside code blocks).
  const rt = (t, plain = false) => {
    if (!t) return [];
    if (plain) return [{ type: "text", text: { content: t } }];
    const out = [];
    const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
    let last = 0;
    let m;
    while ((m = re.exec(t))) {
      if (m.index > last) out.push({ type: "text", text: { content: t.slice(last, m.index) } });
      const annotations = m[1] ? { bold: true } : m[2] ? { italic: true } : { code: true };
      out.push({ type: "text", text: { content: m[1] || m[2] || m[3] }, annotations });
      last = m.index + m[0].length;
    }
    if (last < t.length) out.push({ type: "text", text: { content: t.slice(last) } });
    return out;
  };
  const root = [];
  const stack = [{ indent: -1, children: root }];
  const rawLines = spec.replace(/\r/g, "").split("\n");
  // Drop one leading/trailing blank line from heredocs.
  if (rawLines[0] === "") rawLines.shift();
  if (rawLines[rawLines.length - 1] === "") rawLines.pop();

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const indent = Math.floor((raw.match(/^ */)[0].length) / 2);
    const line = raw.trim();
    let block;
    let m;
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || "plain text";
      const body = [];
      while (++i < rawLines.length && rawLines[i].trim() !== "```") body.push(rawLines[i]);
      block = { type: "code", code: { rich_text: rt(body.join("\n"), true), language: lang } };
    } else if (line === "---") block = { type: "divider", divider: {} };
    else if ((m = line.match(/^(#{1,3}) (.*)$/))) {
      const t = `heading_${m[1].length}`;
      block = { type: t, [t]: { rich_text: rt(m[2]) } };
    } else if ((m = line.match(/^- (.*)$/)))
      block = { type: "bulleted_list_item", bulleted_list_item: { rich_text: rt(m[1]) } };
    else if ((m = line.match(/^\d+\. (.*)$/)))
      block = { type: "numbered_list_item", numbered_list_item: { rich_text: rt(m[1]) } };
    else if ((m = line.match(/^\[( |x)\] ?(.*)$/)))
      block = { type: "to_do", to_do: { rich_text: rt(m[2]), checked: m[1] === "x" } };
    else if ((m = line.match(/^>> (.*)$/)))
      block = { type: "toggle", toggle: { rich_text: rt(m[1]) } };
    else if ((m = line.match(/^> (.*)$/))) block = { type: "quote", quote: { rich_text: rt(m[1]) } };
    else if ((m = line.match(/^! (.*)$/)))
      block = {
        type: "callout",
        callout: { rich_text: rt(m[1]), icon: { type: "emoji", emoji: "💡" } },
      };
    else block = { type: "paragraph", paragraph: { rich_text: rt(line) } };
    block.object = "block";

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    parent.children.push(block);
    const body = block[block.type];
    if (["bulleted_list_item", "numbered_list_item", "to_do", "toggle", "quote", "callout", "paragraph"].includes(block.type)) {
      stack.push({
        indent,
        get children() {
          body.children = body.children || [];
          return body.children;
        },
      });
    }
  }
  return root;
}

async function notionApi(method, p, body) {
  if (!ENV.NOTION_API_KEY) throw new Error("NOTION_API_KEY missing in test/.env");
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.notion.com${p}`, {
      method,
      headers: {
        Authorization: `Bearer ${ENV.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    const json = await res.json();
    if (!res.ok) throw new Error(`Notion API ${res.status}: ${json.message}`);
    return json;
  }
  throw new Error("Notion API: retries exhausted");
}

async function createFixture(spec, title) {
  const children = parseFixture(spec);
  const created = await notionApi("POST", "/v1/pages", {
    parent: { page_id: ENV.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: "text", text: { content: title } }] } },
    children,
  });
  const st = readState();
  // Archive older fixtures so the parent page doesn't fill up (keep last 5).
  st.fixtures.push(created.id);
  while (st.fixtures.length > 5) {
    const old = st.fixtures.shift();
    notionApi("PATCH", `/v1/pages/${old}`, { archived: true }).catch(() => {});
  }
  st.lastFixture = { id: created.id, url: created.url, spec };
  writeState(st);
  return created;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const NAMED = {
  esc: "Escape", escape: "Escape", cr: "Enter", enter: "Enter", return: "Enter",
  bs: "Backspace", backspace: "Backspace", del: "Delete", tab: "Tab", space: " ",
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown", lt: "<",
};
const SHIFTED = '~!@#$%^&*()_+{}|:"<>?';

/**
 * Parse Vim key notation into Playwright key chords.
 *   "dw"  "<Esc>"  "<C-d>"  "<S-CR>"  "<D-z>" (Cmd)  "<M-x>"/"<A-x>" (Alt)
 */
function parseKeys(seq) {
  const out = [];
  for (let i = 0; i < seq.length; i++) {
    const ch = seq[i];
    if (ch === "<") {
      const end = seq.indexOf(">", i);
      if (end > i + 1) {
        const inner = seq.slice(i + 1, end);
        const parts = inner.split("-");
        const keyPart = parts.pop() || "-";
        const mods = parts.map((m) => ({ c: "Control", s: "Shift", m: "Alt", a: "Alt", d: "Meta" })[m.toLowerCase()]);
        if (mods.every(Boolean) && (keyPart.length === 1 || NAMED[keyPart.toLowerCase()])) {
          const key = keyPart.length === 1 ? keyPart : NAMED[keyPart.toLowerCase()];
          out.push(chord(key, mods));
          i = end;
          continue;
        }
      }
    }
    out.push(chord(ch, []));
  }
  return out;
}

/** Real keyboards set shiftKey for capitals/symbols; make the chord say so. */
function chord(key, mods) {
  const m = [...mods];
  if (key.length === 1 && (/[A-Z]/.test(key) || SHIFTED.includes(key)) && !m.includes("Shift")) {
    m.push("Shift");
  }
  return [...m, key === " " ? "Space" : key].join("+");
}

async function pressKeys(seq, delay) {
  const chords = parseKeys(seq);
  for (const c of chords) {
    await page.keyboard.press(c);
    if (delay) await sleep(delay);
  }
  return chords;
}

/** OS-style autorepeat: one keydown, N-1 autoRepeat keydowns, one keyup. */
async function holdKey(key, repeats, intervalMs = 30) {
  const k = key.length === 1 ? key : NAMED[key.toLowerCase()] || key;
  const code = /^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : k;
  const vk = /^[a-z]$/i.test(k) ? k.toUpperCase().charCodeAt(0) : 0;
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  const text = k.length === 1 ? { text: k, unmodifiedText: k } : {};
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base, ...text });
  if (text.text) await cdp.send("Input.dispatchKeyEvent", { type: "char", ...base, ...text });
  for (let i = 1; i < repeats; i++) {
    await sleep(intervalMs);
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base, ...text, autoRepeat: true });
    if (text.text) await cdp.send("Input.dispatchKeyEvent", { type: "char", ...base, ...text, autoRepeat: true });
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

// ---------------------------------------------------------------------------
// Snapshot: vim_info truth vs DOM truth, side by side
// ---------------------------------------------------------------------------

const SNAPSHOT_JS = `(() => {
  const vi = window.vim_info;
  if (!vi) return { error: "window.vim_info missing in isolated world" };
  const live = Array.from(document.querySelectorAll('[contenteditable="true"]'));
  const leafOf = (n) => {
    if (!n) return null;
    const el = n.nodeType === 1 ? n : n.parentElement;
    return el ? el.closest('[contenteditable="true"]') : null;
  };
  const offsetIn = (leaf, node, off) => {
    if (!leaf || !node) return -1;
    if (node.nodeType === 1) {
      // Element-anchored selection: count text before child #off.
      let n = 0;
      const w = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
      let t;
      const stop = node.childNodes[off] || null;
      while ((t = w.nextNode())) {
        if (stop && (stop === t || (stop.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING))) break;
        if (!stop && !node.contains(t) && (node.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
        n += t.textContent.length;
      }
      return n;
    }
    let n = 0;
    const w = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) {
      if (t === node) return n + off;
      n += t.textContent.length;
    }
    return off;
  };
  const sel = window.getSelection();
  const aLeaf = leafOf(sel && sel.anchorNode);
  const fLeaf = leafOf(sel && sel.focusNode);
  const vimEl = vi.lines[vi.active_line] ? vi.lines[vi.active_line].element : null;
  const lineIdx = (el) => (el ? vi.lines.findIndex((l) => l.element === el) : -1);
  const blockType = (el) => {
    const b = el && el.closest('[data-block-id]');
    if (!b) return "?";
    const c = Array.from(b.classList).find((x) => /^notion-.*-block$/.test(x));
    return c ? c.replace(/^notion-|-block$/g, "") : "?";
  };

  // Which line is the rendered block-cursor overlay sitting on?
  const cur = document.querySelector(".vim-block-cursor");
  let overlay = null;
  if (cur) {
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let hit = -1;
    vi.lines.forEach((l, i) => {
      const lr = l.element.getBoundingClientRect();
      if (cy >= lr.top && cy <= lr.bottom && cx >= lr.left - 4 && cx <= lr.right + 12) {
        if (hit === -1 || vi.lines[hit].element.contains(l.element)) hit = i;
      }
    });
    overlay = { line: hit, visible: r.width > 0 && getComputedStyle(cur).display !== "none" };
  }

  const domLine = lineIdx(aLeaf);
  const domCol = offsetIn(aLeaf, sel && sel.anchorNode, sel ? sel.anchorOffset : 0);
  const focusLine = lineIdx(fLeaf);
  const focusCol = offsetIn(fLeaf, sel && sel.focusNode, sel ? sel.focusOffset : 0);

  const problems = [];
  const visual = vi.mode === "visual" || vi.mode === "visual-line";
  const caretLine = visual ? focusLine : domLine;
  if (!vimEl) problems.push("active_line out of range");
  else if (!vimEl.isConnected) problems.push("vim active element detached from DOM");
  if (vi.lines.some((l) => !l.element.isConnected)) problems.push("stale (detached) elements in lines[]");
  if (vi.lines.length !== live.length) problems.push("lines.length " + vi.lines.length + " != live editables " + live.length);
  if (vi.mode === "normal" && vimEl && caretLine !== vi.active_line)
    problems.push("DOM caret on line " + caretLine + " but vim active_line=" + vi.active_line);
  // Column truth is the DOM selection (vim_info.cursor_position is mostly unused),
  // so only flag a caret that sits past the end of a non-empty line in normal mode.
  if (vi.mode === "normal" && vimEl && caretLine === vi.active_line) {
    const len = vimEl.textContent.length;
    if (len > 0 && domCol > len - 1) problems.push("normal-mode caret past last char (col " + domCol + ", len " + len + ")");
  }
  if (vi.mode === "normal" && overlay && overlay.visible && overlay.line !== vi.active_line)
    problems.push("block-cursor overlay on line " + overlay.line + " but active_line=" + vi.active_line);
  const ae = document.activeElement;
  if (vi.mode === "normal" && vimEl && !(ae === vimEl || vimEl.contains(ae) || (ae && ae.contains(vimEl))))
    problems.push("document.activeElement is not the active line (" + (document.activeElement && document.activeElement.tagName) + ")");

  const statusEl = document.querySelector(".vim-mode");
  return {
    mode: vi.mode,
    pending: vi.pending_operator,
    vim: { line: vi.active_line, col: vi.cursor_position, desired: vi.desired_column },
    dom: { line: domLine, col: domCol, focusLine, focusCol, collapsed: sel ? sel.isCollapsed : null },
    visualStart: visual ? { line: vi.visual_start_line, col: vi.visual_start_pos } : undefined,
    overlay,
    status: statusEl ? statusEl.textContent.trim() : null,
    nLines: vi.lines.length,
    problems,
    lines: vi.lines.map((l, i) => ({
      i,
      type: blockType(l.element),
      text: l.element.textContent,
    })),
  };
})()`;

async function snapshot() {
  return evalIso(SNAPSHOT_JS);
}

/** Render a snapshot as a compact human/agent-readable text block. */
function render(s, { window: win = 4, all = false } = {}) {
  if (s.error) return `ERROR: ${s.error}`;
  const out = [];
  out.push(
    `mode=${s.mode}${s.pending ? ` pending=${s.pending}` : ""}  vim=L${s.vim.line} (desired C${s.vim.desired})  ` +
      `dom=L${s.dom.line}:C${s.dom.col}${s.dom.collapsed === false ? ` focus=L${s.dom.focusLine}:C${s.dom.focusCol}` : ""}  ` +
      `overlay=L${s.overlay ? s.overlay.line : "-"}  lines=${s.nLines}  status="${s.status}"`,
  );
  if (s.visualStart) out.push(`visual start=L${s.visualStart.line}:C${s.visualStart.col}`);
  const lo = all ? 0 : Math.max(0, s.vim.line - win);
  const hi = all ? s.lines.length - 1 : Math.min(s.lines.length - 1, s.vim.line + win);
  for (let i = lo; i <= hi; i++) {
    const l = s.lines[i];
    let text = l.text.replace(/\n/g, "⏎");
    if (text.length > 120 && i !== s.vim.line) text = `${text.slice(0, 117)}...`;
    if (i === s.vim.line) {
      const c = Math.min(s.dom.line === s.vim.line ? s.dom.col : 0, text.length);
      text = `${text.slice(0, c)}[${text[c] ?? " "}]${text.slice(c + 1)}`;
    }
    const marks = `${i === s.vim.line ? ">" : " "}${i === s.dom.line ? "^" : " "}`;
    out.push(`${marks}${String(i).padStart(3)} ${l.type.padEnd(10).slice(0, 10)}| ${text}`);
  }
  out.push(s.problems.length ? `PROBLEMS: ${s.problems.join(" | ")}` : "ok: vim/DOM/overlay in sync");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function withSeries(seriesMs, opts) {
  if (!seriesMs || !seriesMs.length) {
    await sleep(opts.settle ?? 250);
    const s = await snapshot();
    return { snapshot: s, text: render(s, opts) };
  }
  const frames = [];
  let t0 = 0;
  for (const t of seriesMs) {
    await sleep(Math.max(0, t - t0));
    t0 = t;
    const s = await snapshot();
    frames.push({ t, snapshot: s });
  }
  const last = frames[frames.length - 1].snapshot;
  const text = frames
    .map((f) => {
      const s = f.snapshot;
      return `@${String(f.t).padStart(4)}ms vim=L${s.vim.line} dom=L${s.dom.line}:C${s.dom.col} overlay=L${s.overlay ? s.overlay.line : "-"} mode=${s.mode}${s.problems.length ? `  ⚠ ${s.problems.join(" | ")}` : ""}`;
    })
    .concat(["", render(last, opts)])
    .join("\n");
  return { frames, snapshot: last, text };
}

const commands = {
  async ping() {
    return { text: `ok ${page.url()}` };
  },

  async open({ url }) {
    const target = url || ENV.NOTION_TEST_PAGE_URL;
    const s = await openUrl(target);
    return { snapshot: s, text: render(s) };
  },

  async fixture({ spec, title }) {
    const created = await createFixture(spec, title || "vt fixture");
    await sleep(500);
    const s = await openUrl(created.url);
    return { url: created.url, snapshot: s, text: `fixture: ${created.url}\n${render(s, { all: true })}` };
  },

  /** Re-create the most recent fixture from its spec (fresh, unedited page). */
  async refixture() {
    const st = readState();
    if (!st.lastFixture) throw new Error("no previous fixture");
    return commands.fixture({ spec: st.lastFixture.spec });
  },

  // Default 30ms between keys ≈ fast human typing / OS autorepeat. 0ms bursts
  // are a stress test (they drop keys today) — pass --delay 0 explicitly.
  async keys({ keys, delay = 30, series, each, settle, all }) {
    if (each) {
      const chords = parseKeys(keys);
      const lines = [];
      let s;
      for (const c of chords) {
        await page.keyboard.press(c);
        await sleep(settle ?? 150);
        s = await snapshot();
        lines.push(
          `${c.padEnd(10)} vim=L${s.vim.line} dom=L${s.dom.line}:C${s.dom.col} mode=${s.mode}${s.pending ? `(${s.pending})` : ""}${s.problems.length ? `  ⚠ ${s.problems.join(" | ")}` : ""}`,
        );
      }
      return { snapshot: s, text: `${lines.join("\n")}\n\n${render(s, { all })}` };
    }
    await pressKeys(keys, delay);
    return withSeries(series, { settle, all });
  },

  async hold({ key, count = 10, interval = 30, series, settle }) {
    await holdKey(key, count, interval);
    return withSeries(series, { settle });
  },

  /**
   * Real mouse input (CDP Input.dispatchMouseEvent, like a human's mouse).
   * Targets: "x,y" viewport coords, or {text, at} = the block line whose text
   * contains `text`, at char offset `at` within that text (default 0).
   */
  async mouse({ action = "click", from, to, steps = 12, modifiers }) {
    const resolve = async (t) => {
      if (/^\d+,\d+$/.test(t)) {
        const [x, y] = t.split(",").map(Number);
        return { x, y };
      }
      const [text, atStr] = t.split("@");
      return page.evaluate(
        ({ text: needle, at }) => {
          const leaves = Array.from(document.querySelectorAll('[contenteditable="true"]'))
            .filter((e) => !e.querySelector('[contenteditable="true"]'));
          const leaf = leaves.find((e) => (e.textContent || "").includes(needle));
          if (!leaf) throw new Error(`no line containing "${needle}"`);
          const idx = (leaf.textContent || "").indexOf(needle) + at;
          const w = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
          let n = 0;
          let t2;
          while ((t2 = w.nextNode())) {
            if (idx <= n + t2.data.length) {
              const r = document.createRange();
              const off = Math.min(idx - n, t2.data.length - 1);
              r.setStart(t2, Math.max(0, off));
              r.setEnd(t2, Math.max(0, off) + (t2.data.length ? 1 : 0));
              const b = r.getBoundingClientRect();
              // Just inside the char's left edge: a click there puts the caret BEFORE
              // the char (clicking its middle can land on either side).
              return { x: b.left + Math.min(2, b.width / 4), y: b.top + b.height / 2 };
            }
            n += t2.data.length;
          }
          const b = leaf.getBoundingClientRect();
          return { x: b.left + 4, y: b.top + b.height / 2 };
        },
        { text, at: Number(atStr || 0) },
      );
    };
    const mods = (modifiers || "").split("+").filter(Boolean);
    for (const m of mods) await page.keyboard.down(m);
    const a = await resolve(from);
    if (action === "click") await page.mouse.click(a.x, a.y);
    else if (action === "dblclick") await page.mouse.dblclick(a.x, a.y);
    else if (action === "move") await page.mouse.move(a.x, a.y, { steps });
    else if (action === "drag") {
      const b = await resolve(to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps });
      await page.mouse.up();
    }
    for (const m of mods.reverse()) await page.keyboard.up(m);
    await sleep(250);
    const s = await snapshot();
    return { snapshot: s, text: render(s) };
  },

  /** Insert literal text (use in insert mode). */
  async type({ text, delay = 20 }) {
    await page.keyboard.type(text, { delay });
    await sleep(200);
    const s = await snapshot();
    return { snapshot: s, text: render(s) };
  },

  async state({ all }) {
    const s = await snapshot();
    return { snapshot: s, text: render(s, { all }) };
  },

  async shot({ file, full }) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const p = file || path.join(OUT_DIR, `shot-${Date.now()}.png`);
    await page.screenshot({ path: p, fullPage: !!full });
    return { text: p };
  },

  async eval({ js, world = "main" }) {
    const v = world === "iso" ? await evalIso(js) : await page.evaluate(js);
    return { value: v, text: JSON.stringify(v, null, 2) };
  },

  async console({ pattern, clear }) {
    const re = pattern ? new RegExp(pattern) : null;
    const msgs = consoleBuf.filter((m) => !re || re.test(m));
    if (clear) consoleBuf.length = 0;
    return { text: msgs.slice(-80).join("\n") || "(no console messages)" };
  },

  async clipboard() {
    const v = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR ${e.message}`);
    return { text: JSON.stringify(v) };
  },

  /**
   * Rebuild dist/ and relaunch the browser on the same page so the new build
   * is loaded. (chrome.runtime.reload() on a --load-extension extension does
   * not re-inject content scripts, so a relaunch is the reliable path.)
   */
  async reload({ nobuild }) {
    const url = page.url();
    // Close the browser BEFORE building: the build deletes dist/, and Chrome
    // disables a running unpacked extension whose files disappear.
    await context.close().catch(() => {});
    if (!nobuild) {
      try {
        // Parcel's cache intermittently drops entries from the multi-entry
        // content_scripts build (dist/ ends up without vim.js and the
        // extension silently stops injecting), so always build cold.
        fs.rmSync(path.join(ROOT, ".parcel-cache"), { recursive: true, force: true });
        execSync("npm run build", { cwd: ROOT, stdio: "pipe" });
      } catch (e) {
        await launch();
        await openUrl(url).catch(() => {});
        return { text: `BUILD FAILED\n${e.stdout}\n${e.stderr}` };
      }
      const required = ["manifest.json", "background.js", "content_scripts/vim.js", "content_scripts/vim.css"];
      const missing = required.filter((f) => !fs.existsSync(path.join(DIST, f)));
      if (missing.length) {
        await launch();
        return { text: `BUILD INCOMPLETE: dist/ is missing ${missing.join(", ")}` };
      }
    }
    await launch();
    const s = await openUrl(url);
    return { snapshot: s, text: `reloaded${nobuild ? "" : " (rebuilt)"}\n${render(s)}` };
  },
};

// ---------------------------------------------------------------------------
// HTTP server (serialised: one command at a time)
// ---------------------------------------------------------------------------

let queue = Promise.resolve();

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/cmd") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    queue = queue.then(async () => {
      let out;
      try {
        const args = JSON.parse(body || "{}");
        if (args.cmd === "shutdown") {
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ text: "bye" }));
          await context.close().catch(() => {});
          server.close();
          process.exit(0);
        }
        const fn = commands[args.cmd];
        if (!fn) throw new Error(`unknown cmd ${args.cmd}`);
        out = await fn(args);
      } catch (e) {
        out = { error: String(e && e.stack ? e.stack : e) };
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(out));
    });
  });
});

await launch();
server.listen(PORT, "127.0.0.1", () => {
  console.log(`vimtion driver listening on 127.0.0.1:${PORT} (${HEADLESS ? "headless" : "headed"})`);
});
