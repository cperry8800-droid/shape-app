/* Where people tap on the website: the browser half.
 *
 * A classic-script COPY of src/lib/click-capture.mjs (the website's pages are classic scripts and
 * cannot import an ES module); tests/click-capture.test.mjs runs both over the same cases and
 * fails on any difference. Change a rule there and here together. What is counted, and why a row's
 * text never becomes a label, is written out in that file.
 *
 * pageShell.jsx loads this on every page it draws; the pages without it load it themselves. Taps
 * are counted per page and sent together to /api/analytics/clicks, only when the visitor's consent
 * allows it (the same rule as the sign-up source: GPC and a Reject always stop it, and in the EEA
 * and the UK nothing is counted until the banner is accepted).
 */
(function (root) {
  'use strict';
  if (!root || !root.document || root.shapeClickCapture) return;

  var LABEL_MAX = 48;
  var PAGE_MAX = 80;
  var BATCH_MAX = 40;
  var COUNT_MAX = 50;
  var FLUSH_MS = 15000;
  var MAX_DEPTH = 8;
  var MAX_TEXT_NODES = 200;
  var UNNAMED = { link: '[link]', tab: '[tab]', button: '[button]', row: '[row]' };
  var ROLES = {
    button: 'button', link: 'link', tab: 'tab', menuitem: 'button', menuitemcheckbox: 'button',
    menuitemradio: 'button', option: 'row', 'switch': 'button', checkbox: 'button', radio: 'button',
    treeitem: 'row', gridcell: 'row', row: 'row'
  };
  var INPUT_BUTTONS = ['button', 'submit', 'reset', 'checkbox', 'radio', 'image'];
  var UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  var EMAIL_G = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
  var NUMBER_G = /\d+(?:[.,:]\d+)*/g;
  var LETTER = /\p{L}/u;
  // The EEA and the UK by device time zone: every Europe/* zone (slightly over-inclusive, which
  // fails safe), plus the EEA's zones outside Europe/* (the Canaries, Madeira, the Azores, Ceuta,
  // Cyprus, Iceland, Svalbard, and France's outermost regions; Codex on #2334). One list, written
  // out in five files; tests/consent-region.test.mjs holds them equal.
  var CONSENT_REGION_RE = /^(?:Europe\/|(?:Atlantic\/(?:Canary|Madeira|Azores|Reykjavik|Jan_Mayen)|Africa\/Ceuta|Asia\/(?:Nicosia|Famagusta)|Arctic\/Longyearbyen|America\/(?:Guadeloupe|Martinique|Cayenne|Marigot)|Indian\/(?:Reunion|Mayotte))$)/;

  function attr(el, name) {
    try {
      var v = el && el.getAttribute ? el.getAttribute(name) : null;
      return v == null ? null : String(v);
    } catch (e) { return null; }
  }

  function tagOf(el) {
    return String((el && el.tagName) || '').toUpperCase();
  }

  function cleanLabel(value) {
    var s = String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(EMAIL_G, '@')
      .replace(NUMBER_G, '#')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length > LABEL_MAX) s = s.slice(0, LABEL_MAX - 1).replace(/\s+$/, '') + '…';
    return s;
  }

  function cleanPage(value) {
    return String(value == null ? '' : value)
      .split(/[?#]/)[0]
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(UUID_G, ':id')
      .replace(/\/\d+(?=\/|$)/g, '/:n')
      .trim()
      .slice(0, PAGE_MAX);
  }

  function isField(el) {
    var tag = tagOf(el);
    if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') return true;
    if (tag === 'INPUT') return INPUT_BUTTONS.indexOf(String(attr(el, 'type') || 'text').toLowerCase()) < 0;
    var editable = attr(el, 'contenteditable');
    return editable != null && editable.toLowerCase() !== 'false';
  }

  function controlKind(el) {
    if (attr(el, 'data-track') != null) return 'button';
    var role = String(attr(el, 'role') || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ROLES, role)) return ROLES[role];
    var tag = tagOf(el);
    if (tag === 'A') return attr(el, 'href') != null ? 'link' : '';
    if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
    if (tag === 'INPUT' && INPUT_BUTTONS.indexOf(String(attr(el, 'type') || '').toLowerCase()) >= 0) return 'button';
    return '';
  }

  function safePointer(isPointer, el) {
    try { return isPointer(el) === true; } catch (e) { return false; }
  }

  function clickTarget(start, isPointer) {
    var el = start && start.nodeType === 3 ? start.parentElement : start;
    if (!el || !el.tagName) return null;
    var control = null;
    var depth = 0;
    var node;
    for (node = el; node; node = node.parentElement, depth += 1) {
      if (attr(node, 'data-no-track') != null) return null;
      if (control || depth >= MAX_DEPTH) continue;
      if (isField(node) || tagOf(node) === 'LABEL') return null;
      if (controlKind(node)) control = { el: node, kind: controlKind(node) };
    }
    if (control) return control;
    if (typeof isPointer !== 'function') return null;
    depth = 0;
    for (node = el; node && depth < MAX_DEPTH; node = node.parentElement, depth += 1) {
      if (!safePointer(isPointer, node)) continue;
      var top = node;
      while (top.parentElement && depth < MAX_DEPTH && safePointer(isPointer, top.parentElement)) {
        top = top.parentElement;
        depth += 1;
      }
      return tagOf(top) === 'BODY' || tagOf(top) === 'HTML' ? null : { el: top, kind: 'row' };
    }
    return null;
  }

  function ownText(el) {
    var holders = [];
    var parts = [];
    var stack = [el];
    var seen = 0;
    while (stack.length && seen < MAX_TEXT_NODES) {
      var node = stack.pop();
      seen += 1;
      if (node.nodeType === 3) {
        var text = String(node.nodeValue == null ? node.textContent || '' : node.nodeValue);
        var holder = node.parentElement || el;
        if (LETTER.test(text) && holders.indexOf(holder) < 0) holders.push(holder);
        parts.push(text);
        continue;
      }
      if (node.nodeType !== 1 && node !== el) continue;
      var tag = tagOf(node);
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || tag === 'TEMPLATE') continue;
      var kids = node.childNodes ? Array.prototype.slice.call(node.childNodes) : [];
      for (var i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
    }
    if (holders.length > 1) return null;
    var raw = parts.join('').replace(/\s+/g, ' ').trim();
    return raw.length > LABEL_MAX ? null : cleanLabel(raw);
  }

  function controlLabel(target) {
    if (!target || !target.el) return '';
    var el = target.el;
    var names = ['data-track', 'aria-label', 'title'];
    for (var i = 0; i < names.length; i++) {
      var v = cleanLabel(attr(el, names[i]));
      if (v) return v;
    }
    if (tagOf(el) === 'INPUT') {
      var type = String(attr(el, 'type') || '').toLowerCase();
      if (type !== 'checkbox' && type !== 'radio') return cleanLabel(attr(el, 'value')) || UNNAMED.button;
      var label = el.labels && el.labels[0];
      return (label && ownText(label)) || UNNAMED.button;
    }
    var text = ownText(el);
    if (text === null) return UNNAMED.row;
    return text || UNNAMED[target.kind] || UNNAMED.button;
  }

  function addClick(buffer, page, label) {
    var p = cleanPage(page);
    var t = cleanLabel(label);
    if (!p || !t) return false;
    var key = p + '\u0001' + t;
    var row = buffer.get(key);
    if (row) row.n = Math.min(COUNT_MAX, row.n + 1);
    else buffer.set(key, { page: p, target: t, n: 1 });
    return true;
  }

  function takeBatch(buffer) {
    var rows = [];
    buffer.forEach(function (r) {
      if (rows.length < BATCH_MAX) rows.push({ page: r.page, target: r.target, n: r.n });
    });
    buffer.clear();
    return rows;
  }

  function trackingAllowed(opts) {
    var o = opts || {};
    if (o.gpc) return false;
    if (o.consent === 'reject') return false;
    if (o.consent === 'accept') return true;
    if (!o.timeZone) return false;
    return !CONSENT_REGION_RE.test(o.timeZone);
  }

  var rules = {
    LABEL_MAX: LABEL_MAX, PAGE_MAX: PAGE_MAX, BATCH_MAX: BATCH_MAX, COUNT_MAX: COUNT_MAX, UNNAMED: UNNAMED,
    cleanLabel: cleanLabel, cleanPage: cleanPage, controlKind: controlKind, clickTarget: clickTarget,
    controlLabel: controlLabel, addClick: addClick, takeBatch: takeBatch, trackingAllowed: trackingAllowed
  };
  root.shapeClickCapture = rules;

  // ── The page glue ─────────────────────────────────────────────────────────
  function allowedHere() {
    var consent = null;
    try { consent = root.localStorage.getItem('shape.consent.v1'); } catch (e) { consent = null; }
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
    var gpc = false;
    try { gpc = root.navigator && root.navigator.globalPrivacyControl === true; } catch (e) { gpc = false; }
    return trackingAllowed({ consent: consent, gpc: gpc, timeZone: tz });
  }

  function send(body) {
    try {
      // The signed-in session's cookie goes with it, so the server can tell a member from a visitor.
      root.fetch('/api/analytics/clicks', {
        method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).catch(function () {});
    } catch (e) {}
  }

  var buffer = new Map();
  var timer = null;
  function isPointer(el) { return root.getComputedStyle(el).cursor === 'pointer'; }
  function flush() {
    if (timer) { root.clearTimeout(timer); timer = null; }
    var rows = takeBatch(buffer);
    if (rows.length) send({ surface: 'web', clicks: rows });
  }
  try {
    root.document.addEventListener('click', function (e) {
      try {
        if (!allowedHere()) return;
        var target = clickTarget(e.target, isPointer);
        if (!target || !addClick(buffer, root.location.pathname, controlLabel(target))) return;
        if (buffer.size >= BATCH_MAX) flush();
        else if (!timer) timer = root.setTimeout(flush, FLUSH_MS);
      } catch (err) {}
    }, { capture: true, passive: true });
    root.document.addEventListener('visibilitychange', function () {
      if (root.document.visibilityState === 'hidden') flush();
    });
    root.addEventListener('pagehide', flush);
  } catch (e) {}
})(typeof window !== 'undefined' ? window : null);
