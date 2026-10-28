// Where people tap, on the website and in the app (owner, 2026-10-28: "add to admin page where
// user/members click on website/app"). The rules, in one place: the app runs this module
// (mobile-app/src/services/analytics.js), the website runs a classic-script copy
// (public/click-capture.js; tests/click-capture.test.mjs runs both over the same cases and fails
// on any difference), and /api/analytics/clicks cleans every batch again with cleanBatch.
//
// WHAT IS COUNTED. A tap on a button, a link, a tab or anything else drawn to be tapped adds one
// to (page, label) for the day. The server adds the surface and who was tapping (a visitor, a
// member or a coach) and keeps daily totals only (ui_click_counts): no account, device or address
// is stored with a count, and nothing typed is ever read.
//
// THE LABEL is the control's own name: data-track, else aria-label, else title, else its text.
// Digits become # ("3 new" and "12 new" are one button) and an email address becomes @. Text is
// used only when it is short and sits in one place: a row or a card (a name over a last message,
// a client over a status) has text in several, and is counted by its kind alone ("[row]"), so a
// person's name or words in a list never become a label. Anything inside [data-no-track], and any
// field a person types in, is not counted at all.

export const LABEL_MAX = 48;
export const PAGE_MAX = 80;
/** Distinct (page, label) pairs one batch carries; a fuller buffer is sent at once. */
export const BATCH_MAX = 40;
/** Taps one pair counts in one batch. */
export const COUNT_MAX = 50;
/** How long taps wait to be sent together (they go sooner when the page is hidden or left). */
export const FLUSH_MS = 15000;
/** How far up from the tapped element a control is looked for. */
const MAX_DEPTH = 8;
/** How many nodes inside a control are read for its text. */
const MAX_TEXT_NODES = 200;

/** The labels of a control with no name of its own, by its kind. */
export const UNNAMED = { link: '[link]', tab: '[tab]', button: '[button]', row: '[row]' };

const ROLES = {
  button: 'button', link: 'link', tab: 'tab', menuitem: 'button', menuitemcheckbox: 'button',
  menuitemradio: 'button', option: 'row', switch: 'button', checkbox: 'button', radio: 'button',
  treeitem: 'row', gridcell: 'row', row: 'row',
};
const INPUT_BUTTONS = ['button', 'submit', 'reset', 'checkbox', 'radio', 'image'];
const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_G = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const NUMBER_G = /\d+(?:[.,:]\d+)*/g;
const LETTER = /\p{L}/u;

function attr(el, name) {
  try {
    const v = el && el.getAttribute ? el.getAttribute(name) : null;
    return v == null ? null : String(v);
  } catch {
    return null;
  }
}

function tagOf(el) {
  return String((el && el.tagName) || '').toUpperCase();
}

/** A label as it is counted: one line, digits as #, an address as @, at most LABEL_MAX long. */
export function cleanLabel(value) {
  let s = String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(EMAIL_G, '@')
    .replace(NUMBER_G, '#')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > LABEL_MAX) s = `${s.slice(0, LABEL_MAX - 1).trimEnd()}…`;
  return s;
}

/** A page as it is counted: the path or screen name, without its query, ids as :id. */
export function cleanPage(value) {
  return String(value == null ? '' : value)
    .split(/[?#]/)[0]
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(UUID_G, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:n')
    .trim()
    .slice(0, PAGE_MAX);
}

/** Whether `el` is a field a person types or chooses in: a tap there is not a tap on a control. */
function isField(el) {
  const tag = tagOf(el);
  if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') return true;
  if (tag === 'INPUT') return !INPUT_BUTTONS.includes(String(attr(el, 'type') || 'text').toLowerCase());
  const editable = attr(el, 'contenteditable');
  return editable != null && editable.toLowerCase() !== 'false';
}

/** The kind of control `el` is ('link', 'tab', 'button', 'row'), or '' when it is none. */
export function controlKind(el) {
  if (attr(el, 'data-track') != null) return 'button';
  const role = String(attr(el, 'role') || '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ROLES, role)) return ROLES[role];
  const tag = tagOf(el);
  if (tag === 'A') return attr(el, 'href') != null ? 'link' : '';
  if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
  if (tag === 'INPUT' && INPUT_BUTTONS.includes(String(attr(el, 'type') || '').toLowerCase())) return 'button';
  return '';
}

/**
 * The control a tap landed on: the nearest button, link or other control within a few steps of
 * `start`, else the outermost of the nearest elements that show a pointing hand (the app's rows
 * are often plain elements with a click handler). Null for a tap in a field, inside
 * [data-no-track], or on nothing tappable. `isPointer(el)` says whether an element shows the
 * pointing hand; the page passes getComputedStyle's cursor.
 */
export function clickTarget(start, isPointer) {
  let el = start && start.nodeType === 3 ? start.parentElement : start;
  if (!el || !el.tagName) return null;
  let control = null;
  let depth = 0;
  for (let node = el; node; node = node.parentElement, depth += 1) {
    if (attr(node, 'data-no-track') != null) return null;
    if (control || depth >= MAX_DEPTH) continue;
    // A tap on a <label> is sent on to its field or checkbox, which is counted (or not) then.
    if (isField(node) || tagOf(node) === 'LABEL') return null;
    if (controlKind(node)) control = { el: node, kind: controlKind(node) };
  }
  if (control) return control;
  if (typeof isPointer !== 'function') return null;
  depth = 0;
  for (let node = el; node && depth < MAX_DEPTH; node = node.parentElement, depth += 1) {
    if (!safePointer(isPointer, node)) continue;
    // The cursor is inherited, so the element that set it is the outermost one still showing it.
    let top = node;
    while (top.parentElement && depth < MAX_DEPTH && safePointer(isPointer, top.parentElement)) {
      top = top.parentElement;
      depth += 1;
    }
    return tagOf(top) === 'BODY' || tagOf(top) === 'HTML' ? null : { el: top, kind: 'row' };
  }
  return null;
}

function safePointer(isPointer, el) {
  try {
    return isPointer(el) === true;
  } catch {
    return false;
  }
}

/**
 * A control's text as its label; '' when it has none, and null when it has too much to be a
 * control's name: words in more than one element (a row or a card), or more than LABEL_MAX.
 */
function ownText(el) {
  const holders = new Set();
  const parts = [];
  const stack = [el];
  let seen = 0;
  while (stack.length && seen < MAX_TEXT_NODES) {
    const node = stack.pop();
    seen += 1;
    if (node.nodeType === 3) {
      const text = String(node.nodeValue == null ? node.textContent || '' : node.nodeValue);
      if (LETTER.test(text)) holders.add(node.parentElement || el);
      parts.push(text);
      continue;
    }
    if (node.nodeType !== 1 && node !== el) continue;
    const tag = tagOf(node);
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || tag === 'TEMPLATE') continue;
    const kids = node.childNodes ? Array.from(node.childNodes) : [];
    for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
  }
  if (holders.size > 1) return null;
  const raw = parts.join('').replace(/\s+/g, ' ').trim();
  return raw.length > LABEL_MAX ? null : cleanLabel(raw);
}

/**
 * What a control is counted as: its own name, else its short text, else its kind ("[button]");
 * a control with more text than a name (a row or a card) is "[row]".
 */
export function controlLabel(target) {
  if (!target || !target.el) return '';
  const { el, kind } = target;
  for (const name of ['data-track', 'aria-label', 'title']) {
    const v = cleanLabel(attr(el, name));
    if (v) return v;
  }
  if (tagOf(el) === 'INPUT') {
    const type = String(attr(el, 'type') || '').toLowerCase();
    if (type !== 'checkbox' && type !== 'radio') return cleanLabel(attr(el, 'value')) || UNNAMED.button;
    const label = el.labels && el.labels[0];
    return (label && ownText(label)) || UNNAMED.button;
  }
  const text = ownText(el);
  if (text === null) return UNNAMED.row;
  return text || UNNAMED[kind] || UNNAMED.button;
}

/** Adds one tap on (page, label) to a buffer (a Map). */
export function addClick(buffer, page, label) {
  const p = cleanPage(page);
  const t = cleanLabel(label);
  if (!p || !t) return false;
  const key = `${p}\u0001${t}`;
  const row = buffer.get(key);
  if (row) row.n = Math.min(COUNT_MAX, row.n + 1);
  else buffer.set(key, { page: p, target: t, n: 1 });
  return true;
}

/** The buffer's taps as a batch's rows, emptying it. */
export function takeBatch(buffer) {
  const rows = [...buffer.values()].slice(0, BATCH_MAX).map((r) => ({ page: r.page, target: r.target, n: r.n }));
  buffer.clear();
  return rows;
}

/** A batch as the server keeps it ({ surface, rows }), or null when it holds nothing to count. */
export function cleanBatch(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const surface = b.surface === 'web' || b.surface === 'app' ? b.surface : '';
  if (!surface || !Array.isArray(b.clicks)) return null;
  const merged = new Map();
  for (const raw of b.clicks.slice(0, BATCH_MAX)) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const page = cleanPage(r.page);
    const target = cleanLabel(r.target);
    const n = Math.min(COUNT_MAX, Math.max(0, Math.floor(Number(r.n) || 0)));
    if (!page || !target || !n) continue;
    const key = `${page}\u0001${target}`;
    const row = merged.get(key);
    if (row) row.n = Math.min(COUNT_MAX, row.n + n);
    else merged.set(key, { page, target, n });
  }
  return merged.size ? { surface, rows: [...merged.values()] } : null;
}

/**
 * Starts counting taps on a page. `surface` is 'web' or 'app'; `page()` names where the tap
 * landed; `allowed()` is the consent rule, asked at each tap so a choice made on the banner holds
 * at once; `send(body)` posts a batch and never throws. Once per window; returns { flush }.
 */
export function startClickCapture({ win, surface, page, allowed, send }) {
  if (!win || !win.document || win.__shapeClickCapture) return null;
  win.__shapeClickCapture = true;
  const buffer = new Map();
  let timer = null;
  const isPointer = (el) => win.getComputedStyle(el).cursor === 'pointer';
  const flush = () => {
    if (timer) {
      win.clearTimeout(timer);
      timer = null;
    }
    const rows = takeBatch(buffer);
    if (!rows.length) return;
    try {
      send({ surface, clicks: rows });
    } catch {
      // Counting never gets in the way of the page.
    }
  };
  win.document.addEventListener(
    'click',
    (e) => {
      try {
        if (!allowed()) return;
        const target = clickTarget(e.target, isPointer);
        if (!target || !addClick(buffer, page(), controlLabel(target))) return;
        if (buffer.size >= BATCH_MAX) flush();
        else if (!timer) timer = win.setTimeout(flush, FLUSH_MS);
      } catch {
        // Counting never gets in the way of the page.
      }
    },
    { capture: true, passive: true },
  );
  win.document.addEventListener('visibilitychange', () => {
    if (win.document.visibilityState === 'hidden') flush();
  });
  win.addEventListener('pagehide', flush);
  return { flush };
}
