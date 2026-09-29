// Keyboard and screen-reader focus for the cook screen and the sheets over it.
//
// The cook screen is one full-screen dialog over the app, and a sheet (every step, leave the
// cook) is a second dialog over the cook screen. `aria-modal` alone neither moves focus nor holds
// it (Copilot, two rounds on #2179). A sheet with no autofocus target left focus on the button that
// opened it, so Escape never reached the sheet and Tab walked the cook screen behind it. And the
// cook screen replaces the page it was opened from, taking the "Cook this" button with it, so focus
// fell to <body> and the next Tab could land in the app underneath.
//
// Three rules, one for each failure:
//  · OPEN moves focus in: to the control the dialog names (`data-bsck-initial`), else the dialog
//    itself, which then announces its own label.
//  · WHILE OPEN, everything beside the dialog is `inert` (the app under the cook screen, the cook
//    screen under a sheet), and Tab wraps at the dialog's edges.
//  · CLOSE gives focus back: to the element that had it, or, when the cook screen replaced that
//    element's page, to the button now standing where it stood (`data-bsck-door`).
//
// ⚠ THE PAGE-LEVEL WRAP IS CONDITIONAL, AND THAT IS WHAT KEEPS THE WEBSITE USABLE. The website shows
// the cook screen inside an iframe of the app, where it is the whole document with nothing under it.
// Wrapping Tab there would stop a keyboard user from ever leaving the iframe for the page around it,
// which is a keyboard trap (WCAG 2.1.2). So the cook screen wraps only when it covers something in
// its own document; a sheet always wraps, because it can always be closed from inside.
//
// DOM only, no React, so every rule is driven in jsdom rather than argued.

const TABBABLE = [
  'a[href]', 'area[href]', 'button', 'input', 'select', 'textarea', 'summary', 'iframe',
  'audio[controls]', 'video[controls]', '[contenteditable]:not([contenteditable="false"])', '[tabindex]',
].join(',');
// Beside a dialog but part of it, so never made inert: its own scrim (a tap on it closes the sheet),
// and a live region, which keeps announcing (a timer that ran out) while the sheet is open.
const KEEP = '[data-bsck-scrim],[role="status"],[role="alert"],[aria-live]';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'META']);
const DOOR = /^[a-z][a-z-]*$/;
// Node.DOCUMENT_POSITION_PRECEDING / _FOLLOWING, spelt out so the module needs no DOM globals.
const PRECEDING = 2;
const FOLLOWING = 4;

const safeMatches = (el, sel) => { try { return !!(el && el.matches && el.matches(sel)); } catch { return false; } };
const inInert = (el) => !!(el && el.closest && el.closest('[inert]'));
const isPage = (doc, el) => !el || el === doc.body || el === doc.documentElement;

// Every control Tab can reach inside `container`, in document order.
export function bsCkTabbables(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return [];
  // A control drawn nowhere (display:none) is out of the tab order. jsdom has no layout (every rect
  // list is empty), so the check only runs where the container itself was laid out.
  const laidOut = typeof container.getClientRects === 'function' && container.getClientRects().length > 0;
  return Array.from(container.querySelectorAll(TABBABLE)).filter((el) => {
    if (safeMatches(el, ':disabled')) return false;
    if (el.tagName === 'INPUT' && String(el.type).toLowerCase() === 'hidden') return false;
    const ti = el.getAttribute('tabindex');
    if (ti != null && ti.trim() !== '' && Number(ti) < 0) return false;
    if (el.closest('[inert],[hidden]')) return false;
    if (laidOut && el.getClientRects().length === 0) return false;
    return true;
  });
}

const focusEl = (el) => {
  if (!el || typeof el.focus !== 'function') return false;
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  return !!el.ownerDocument && el.ownerDocument.activeElement === el;
};

// Tab inside `container`: at the first or last control, go round to the other end; from anywhere
// outside it (focus lost to <body>, or left behind a sheet), come back in. Anywhere else the browser
// moves focus itself, so radio groups and the like keep their own arrow-key rules. Returns the
// element focused, or null when the browser was left to it.
export function bsCkTabKey(e, container) {
  if (!e || e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey || !container) return null;
  const doc = container.ownerDocument;
  const active = doc ? doc.activeElement : null;
  const list = bsCkTabbables(container);
  const go = (el) => { e.preventDefault(); return focusEl(el) ? el : null; };
  if (!list.length) return go(container);
  const first = list[0];
  const last = list[list.length - 1];
  const inside = !!active && active !== container && container.contains(active);
  if (!inside) return go(e.shiftKey ? last : first);
  const i = list.indexOf(active);
  if (i >= 0) {
    if (e.shiftKey && i === 0) return go(last);
    if (!e.shiftKey && i === list.length - 1) return go(first);
    return null;
  }
  // Focus is on something inside that Tab itself cannot reach (tabindex -1): go round only when
  // nothing lies ahead of it in the direction of travel.
  const ahead = list.some((el) => (active.compareDocumentPosition(el) & (e.shiftKey ? PRECEDING : FOLLOWING)) !== 0);
  return ahead ? null : go(e.shiftKey ? last : first);
}

// ── inert, counted ──
// Counted per element: when a sheet's cook screen hands over to the next dish, the new screen holds
// the app before the old one lets go, and the app must stay inert through the hand-over. An element
// that was already inert before we held it is left inert when we let go.
const HELD = new WeakMap();
function holdInert(el) {
  const r = HELD.get(el);
  if (r) { r.n += 1; return; }
  const had = el.hasAttribute('inert');
  HELD.set(el, { n: 1, had });
  if (!had) el.setAttribute('inert', '');
}
function dropInert(el) {
  const r = HELD.get(el);
  if (!r) return;
  r.n -= 1;
  if (r.n > 0) return;
  HELD.delete(el);
  if (!r.had) el.removeAttribute('inert');
}

// ── the stack of open dialogs, and the one Tab listener for all of them ──
const STACK = [];
let listening = null;
function onKeyDown(e) {
  if (!e || e.key !== 'Tab') return;
  const top = [...STACK].reverse().find((m) => m.node.isConnected);
  if (!top || !top.wrap) return;
  const doc = top.node.ownerDocument;
  const active = doc.activeElement;
  // Focus in something that is not a cook dialog (a prompt the app put on top of it) is not ours
  // to move.
  if (!isPage(doc, active) && !STACK.some((m) => m.node.isConnected && m.node.contains(active))) return;
  bsCkTabKey(e, top.node);
}
function listen(doc) {
  if (listening === doc || !doc || typeof doc.addEventListener !== 'function') return;
  if (listening) listening.removeEventListener('keydown', onKeyDown, true);
  listening = doc;
  doc.addEventListener('keydown', onKeyDown, true);
}
function unlistenIfIdle() {
  if (STACK.length || !listening) return;
  listening.removeEventListener('keydown', onKeyDown, true);
  listening = null;
}

// Hold `node` as the open dialog: make its siblings inert and put it on top of the Tab stack.
// `always` wraps Tab even when nothing beside it was made inert (a sheet). Returns the release, safe
// to call twice.
export function bsCkHold(node, { always = false } = {}) {
  if (!node || !node.parentNode) return () => {};
  const held = Array.from(node.parentNode.children || []).filter((el) => el !== node
    && !el.contains(node) && !SKIP_TAGS.has(el.tagName) && !safeMatches(el, KEEP));
  held.forEach(holdInert);
  const entry = { node, wrap: always || held.length > 0 };
  STACK.push(entry);
  listen(node.ownerDocument);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const i = STACK.lastIndexOf(entry);
    if (i >= 0) STACK.splice(i, 1);
    held.forEach(dropInert);
    unlistenIfIdle();
  };
}

// Move focus into a dialog that just opened, unless it is already there (the dialog itself or a
// control inside it). Only when this document has focus: the website's iframe opens its cook screen
// as the page loads, and must not pull focus off the page around it.
export function bsCkFocusInto(container) {
  const doc = container && container.ownerDocument;
  if (!doc || !container.isConnected) return null;
  if (typeof doc.hasFocus === 'function' && !doc.hasFocus()) return null;
  const active = doc.activeElement;
  if (active && container.contains(active)) return active;
  const pick = container.querySelector('[data-bsck-initial]');
  if (pick && !inInert(pick) && focusEl(pick)) return pick;
  return focusEl(container) ? container : null;
}

// What had focus when a dialog was asked to open: the element, and the door it was, if it was one.
// Read while the page that holds it is still on screen.
export function bsCkFocusOwner(doc) {
  const el = doc ? doc.activeElement : null;
  if (!doc || isPage(doc, el)) return { el: null, door: null };
  const doorEl = el.closest ? el.closest('[data-bsck-door]') : null;
  const door = doorEl ? doorEl.getAttribute('data-bsck-door') : null;
  return { el, door: door && DOOR.test(door) ? door : null };
}

// Give focus back when a dialog closes: to the element that had it, else the door that stands where
// it stood. Only when focus has nowhere better to be: still on the page (the dialog took it with it
// when it went), inside the dialog that is closing, or on `idle` — the cook screen itself, which a
// tap on a sheet's scrim focuses on the way to closing the sheet (the nearest focusable ancestor).
export function bsCkGiveBack(owner, { doc, from = null, idle = null } = {}) {
  if (!doc || !owner) return null;
  if (typeof doc.hasFocus === 'function' && !doc.hasFocus()) return null;
  const active = doc.activeElement;
  const free = isPage(doc, active) || (idle != null && active === idle)
    || (from != null && from.isConnected && from.contains(active));
  if (!free) return null;
  const usable = (el) => !!el && el.isConnected && !inInert(el) && !safeMatches(el, ':disabled');
  if (usable(owner.el) && focusEl(owner.el)) return owner.el;
  if (owner.door) {
    const door = doc.querySelector(`[data-bsck-door="${owner.door}"]`);
    if (usable(door) && focusEl(door)) return door;
  }
  return null;
}

// Keep focus right for one cook screen across renders. `s` is the screen's own state; call after
// every commit with the screen's current node (null once it is gone). The sheet is whichever
// `[data-bsck-sheet]` is open inside the screen.
export function bsCkModalSync(s, root) {
  if (root !== s.root) {
    sheetSync(s, null);
    if (s.rootHold) { s.rootHold(); s.rootHold = null; }
    s.root = root || null;
    if (root) {
      s.rootHold = bsCkHold(root);
      bsCkFocusInto(root);
    }
  }
  sheetSync(s, root && typeof root.querySelector === 'function' ? root.querySelector('[data-bsck-sheet]') : null);
}
function sheetSync(s, sheet) {
  if ((sheet || null) === (s.sheet || null)) return;
  const doc = (sheet || s.sheet || s.root || {}).ownerDocument;
  if (s.sheet) {
    const was = s.sheet;
    if (s.sheetHold) s.sheetHold();
    s.sheet = null;
    s.sheetHold = null;
    // Back to what opened the sheet, else into the cook screen, never out to <body>.
    if (!bsCkGiveBack(s.sheetOwner, { doc, from: was, idle: s.root }) && s.root && doc && isPage(doc, doc.activeElement)) {
      bsCkFocusInto(s.root);
    }
    s.sheetOwner = null;
  }
  if (sheet) {
    s.sheetOwner = bsCkFocusOwner(doc);
    s.sheet = sheet;
    s.sheetHold = bsCkHold(sheet, { always: true });
    bsCkFocusInto(sheet);
  }
}
