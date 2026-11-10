// Interactive guided spotlight tour — framework-agnostic. Dims a root container, cuts a
// spotlight around each step's target element, and shows a card with the guide's name, how far
// along it is, Back / Next and a visible Skip. Used by the mobile broadsheet (root =
// #bs-phone-surface) and the website (root = document.body). Pure geometry lives in
// spotlightGeom.mjs.
//
// A step: { anchor, fallback, navigate, when, eyebrow, title, body, points, altLabel, onAlt,
// final, ctaLabel, onCta }. `when()` leaves a step out for an account that hasn't the feature;
// `points` lists what can be done there. Options: root, accent, isLight, paper, ink, onAccent,
// fonts { display, body, mono }, labels (the card's own words, translated by the caller),
// skipNote (where to take the tour again, said once it is skipped), notify (the caller's own
// toast for that note), onDone(reason), where reason is 'finished' or 'skipped'.
import { cutoutRect, coachmarkPos, stepBounds, dockPos, visibleSteps, DOCK_BELOW } from './spotlightGeom.mjs';

const PAD = 8;
const CARD_W = 340;

// The card's own words. A caller in another language passes `labels`; `progress` is a function so
// the caller can put the numbers where its language wants them.
const LABELS = {
  next: 'Next →', back: 'Back', done: 'Done', skip: 'Skip tour', close: 'Close the tour',
  progress: (n, total) => `${n} of ${total}`,
};

// Escape dynamic step text before it goes into the card's innerHTML. Step copy is authored by us
// today, but this keeps the rendering injection-safe if a step field ever carries
// user-influenced content.
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function el(tag, css, html) { const n = document.createElement(tag); if (css) n.style.cssText = css; if (html != null) n.innerHTML = html; return n; }
function waitFor(getter, ms = 1200) {
  return new Promise((res) => {
    const t0 = Date.now();
    (function tick() { let e = null; try { e = getter(); } catch (_) {} if (e) return res(e); if (Date.now() - t0 > ms) return res(null); requestAnimationFrame(tick); })();
  });
}
// Two frames: one for the scroll/layout to apply, one for it to settle before we
// measure. getBoundingClientRect right after scrollIntoView reads the OLD position.
function nextFrames() { return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); }

// ⚠ NEVER `${colour}33`: appending a hex alpha to a value that may be a var()
// token drops the whole CSS declaration. stAlpha() composes rgba() instead — and
// keeps a paper token as rgba(var(--x-rgb, r,g,b), a), the same shape
// pageShell.jsx's ssAlpha emits, so a tokenised accent still follows the paper.
// Hex digits are EXTRACTED, never parseInt'd off the raw string (a token is not
// digits; NaN >> 16 is 0, which is a valid black).
function stAlpha(h, a) {
  const s = String(h || '');
  const m = /#([0-9a-f]{6})/i.exec(s);
  if (!m) return s;
  const n = parseInt(m[1], 16);
  const t = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  const tok = s.match(/var\(\s*(--[\w-]+)\s*,/);
  return tok ? `rgba(var(${tok[1]}-rgb, ${t}), ${a})` : `rgba(${t},${a})`;
}

// While a tour is on screen <html> carries data-guide-open, and anything marked data-guide-wait
// (the app's Nora hint, the Radio prompt) is hidden until it ends, so nothing draws over the card.
let openCount = 0;
function markOpen(on) {
  try {
    const html = document.documentElement;
    openCount = Math.max(0, openCount + (on ? 1 : -1));
    if (openCount > 0) html.setAttribute('data-guide-open', '');
    else html.removeAttribute('data-guide-open');
    if (!document.getElementById('shape-guide-wait-css') && document.head) {
      const st = document.createElement('style');
      st.id = 'shape-guide-wait-css';
      st.textContent = 'html[data-guide-open] [data-guide-wait]{visibility:hidden!important}';
      document.head.appendChild(st);
    }
  } catch (_) {}
}

// One tour at a time: a second start (Settings' Take the tour pressed while one runs) replaces it.
let active = null;

export function startTour(stepsIn, opts = {}) {
  if (active) { try { active.destroy(); } catch (_) {} active = null; }
  const steps = visibleSteps(stepsIn);
  if (!steps.length) return { destroy() {} };
  const root = opts.root || document.body;
  const accent = opts.accent || (opts.isLight ? '#0a8f87' : '#2ee0c4');
  // The card's own palette: the light paper is the dashboard's builder white
  // (#ffffff / #15211e), the dark one its previous dark card. Both are literals
  // rather than tokens because this module also runs where dash.css is absent.
  // A caller with a palette of its own (the website's Night skin) passes `paper`, `ink` and
  // `onAccent` with its accent; the app passes none.
  const ink = opts.ink || (opts.isLight ? '#15211e' : '#f4eedf');
  const paper = opts.paper || (opts.isLight ? '#ffffff' : '#1a1714');
  // On the accent fill the label is white on the light teal and near-black on
  // the bright dark teal — either way the pair clears AA.
  const onAccent = opts.onAccent || (opts.isLight ? '#ffffff' : '#06231f');
  const L = { ...LABELS, ...(opts.labels || {}) };
  const F = {
    // The website's own type (dash.css; each fallback is that token's dark-paper value, as
    // tests/newdesign-paper-tokens.test.mjs holds every var(--sh-*) to). The app passes its own.
    display: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)",
    body: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)",
    mono: "var(--sh-font-mono, 'JetBrains Mono', 'JetBrains Mono Fallback', monospace)",
    ...(opts.fonts || {}),
  };
  const rootPos0 = root.style.position;
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = reduce ? 'none' : 'all .28s cubic-bezier(.2,.7,.2,1)';

  // Layers: a dim box that uses a huge box-shadow as the "mask" around a transparent cutout.
  const layer = el('div', `position:absolute;inset:0;z-index:99999;`);
  const cut = el('div', `position:absolute;border-radius:12px;box-shadow:0 0 0 9999px rgba(8,10,12,0.66);transition:${ease};pointer-events:none`);
  const ring = el('div', `position:absolute;border-radius:14px;border:1.5px solid ${accent};box-shadow:0 0 22px -2px ${stAlpha(accent, 0.53)};transition:${ease};pointer-events:none`);
  const card = el('div', `position:absolute;box-sizing:border-box;width:${CARD_W}px;max-width:calc(100% - 16px);background:${paper};color:${ink};border:1px solid ${stAlpha(accent, 0.27)};border-radius:16px;padding:16px 16px 14px;box-shadow:0 24px 60px -20px rgba(0,0,0,.7);font-family:${F.body};transition:${reduce ? 'none' : 'top .28s, left .28s'}`);
  // The card IS the tour's dialog: the dim layer blocks the page beneath it, so a
  // screen reader / keyboard user should be scoped to the card.
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Product tour');
  card.setAttribute('data-guide-card', '');
  cut.setAttribute('aria-hidden', 'true');
  ring.setAttribute('aria-hidden', 'true');
  layer.append(cut, ring, card);
  root.appendChild(layer);
  markOpen(true);

  const prevFocus = typeof document !== 'undefined' ? document.activeElement : null;
  let i = 0, destroyed = false, gen = 0;
  const cardSize = () => ({ w: card.offsetWidth || CARD_W, h: card.offsetHeight || 170 });
  const focusables = () => Array.from(card.querySelectorAll('button')).filter((b) => b.offsetParent !== null);

  // Escape skips (a modal contract); ← and → step through it; Tab cycles within the card so focus
  // can't wander into the dimmed, pointer-blocked page behind it.
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); skip(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      e.preventDefault();
      if (e.key === 'ArrowLeft') { if (i > 0) { i -= 1; show(); } return; }
      // → never follows a finale's link off the page: only its own button does that.
      if (steps[i] && steps[i].final) return;
      if (i >= steps.length - 1) finish(); else { i += 1; show(); }
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey);

  function teardown() {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('keydown', onKey);
    layer.remove();
    markOpen(false);
    if (active === handle) active = null;
    try { root.style.position = rootPos0; } catch (_) {}
    // Hand focus back to whatever the user was on before the tour opened.
    try { if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch (_) {}
  }
  // onDone is isolated so a throwing persistence/close handler can't abort a
  // caller — critically the finale, where step.onCta() (navigation) runs right
  // after finish(): an onDone error must never swallow the CTA.
  function finish(reason = 'finished') { teardown(); if (opts.onDone) { try { opts.onDone(reason); } catch (_) {} } }
  // Skipping ends the tour like finishing it (it is seen; it never comes back on its own), and
  // then says where to take it again.
  function skip() {
    finish('skipped');
    if (opts.skipNote) note(opts.skipNote);
  }
  function note(text) {
    if (typeof opts.notify === 'function') { try { opts.notify(text); return; } catch (_) {} }
    try {
      const fixed = root === document.body;
      const t = el('div', `position:${fixed ? 'fixed' : 'absolute'};left:50%;bottom:${fixed ? 84 : 96}px;transform:translateX(-50%);z-index:99999;max-width:min(420px, calc(100% - 32px));box-sizing:border-box;background:${paper};color:${ink};border:1px solid ${stAlpha(accent, 0.35)};border-radius:12px;padding:12px 16px;font:500 13.5px/1.45 ${F.body};box-shadow:0 18px 40px -18px rgba(0,0,0,.6)`);
      t.setAttribute('role', 'status');
      t.setAttribute('data-guide-note', '');
      t.textContent = text;
      root.appendChild(t);
      setTimeout(() => { try { t.remove(); } catch (_) {} }, 6000);
    } catch (_) {}
  }

  // The visible window of the root, in root coordinates: a website root is the whole page, so
  // only part of it is on screen.
  function visibleWindow(rr) {
    const vh = (typeof window !== 'undefined' && window.innerHeight) || rr.height;
    const y = Math.max(0, -rr.top);
    const h = Math.max(0, Math.min(rr.height - y, vh - Math.max(0, rr.top)));
    return { y, h: h || rr.height };
  }
  function docked(rr) { return rr.width < DOCK_BELOW; }

  // No target → no cutout; full dim + centered card. Shared by the no-anchor
  // branch and the catch fallback so the two copies can't drift.
  function centerCard() {
    cut.style.display = 'none'; ring.style.display = 'none';
    const rr = root.getBoundingClientRect();
    const vis = visibleWindow(rr);
    if (docked(rr)) { placeDocked(null, rr, vis); return; }
    card.style.width = CARD_W + 'px';
    const s = cardSize();
    Object.assign(card.style, { top: Math.round(vis.y + vis.h / 2 - s.h / 2) + 'px', left: Math.round(rr.width / 2 - s.w / 2) + 'px' });
  }
  function placeDocked(t, rr, vis) {
    const first = dockPos(t, vis, rr.width, cardSize());
    card.style.width = first.width + 'px';
    // The width just changed the card's height: place it again on the new size.
    const p = dockPos(t, vis, rr.width, cardSize());
    Object.assign(card.style, { top: p.top + 'px', left: p.left + 'px' });
  }

  async function show() {
    if (destroyed) return;
    // Serialize overlapping invocations: Next/Back/resize can call show() while a
    // prior one is still awaiting (navigate → anchor wait → frame settle). Each run
    // captures its own step index + a generation token; a run that's been superseded
    // bails at the next checkpoint so it can never paint a stale step's geometry.
    const myGen = ++gen;
    const idx = i;
    const step = steps[idx];
    const stale = () => destroyed || myGen !== gen;
    try {
      try { if (step.navigate) await step.navigate(); } catch (_) {}
      if (stale()) return;
      // `wait`: a step that first opens another page gives its data longer to arrive.
      let target = step.anchor ? await waitFor(step.anchor, step.wait || 1200) : null;
      if (!target && step.fallback) { try { target = step.fallback(); } catch (_) {} }
      if (stale()) return;

      // Bring the anchor into view BEFORE measuring — an anchor below the fold (e.g.
      // hero-habits on a filled Home) would otherwise spotlight offscreen. The dim
      // layer swallows pointer events, so the user can't scroll it back out from under
      // us; instant behavior keeps the measure deterministic (and honors reduced motion).
      if (target && target.scrollIntoView) {
        try { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' }); } catch (_) {}
        await nextFrames();
        if (stale()) return;
      }

      renderCard(step, idx);
      if (target) {
        const rr = root.getBoundingClientRect();
        const b = target.getBoundingClientRect();
        const t = { x: b.left - rr.left, y: b.top - rr.top, w: b.width, h: b.height };
        const co = cutoutRect(t, PAD);
        Object.assign(cut.style, { left: co.x + 'px', top: co.y + 'px', width: co.w + 'px', height: co.h + 'px', display: 'block' });
        Object.assign(ring.style, { left: (co.x - 2) + 'px', top: (co.y - 2) + 'px', width: (co.w + 4) + 'px', height: (co.h + 4) + 'px', display: 'block' });
        if (docked(rr)) {
          placeDocked(t, rr, visibleWindow(rr));
        } else {
          card.style.width = CARD_W + 'px';
          const p = coachmarkPos(t, { x: 0, y: 0, w: rr.width, h: rr.height }, cardSize());
          Object.assign(card.style, { top: p.top + 'px', left: p.left + 'px' });
        }
      } else {
        centerCard();
      }
    } catch (_) {
      // A stuck overlay is the worst failure mode — a full dim with a dead card
      // reads as "the app froze". On ANY unexpected error, fall back to the
      // centered card so Next / Done / Skip / Escape always stay live.
      if (stale()) return;
      try { renderCard(step, idx); centerCard(); } catch (_) { teardown(); }
    }
  }

  function btn(st, label, primary, extra = '') {
    const base = `font:${primary ? 600 : 500} 13px/1 ${F.body};border-radius:999px;padding:10px 16px;min-height:40px;cursor:pointer;white-space:nowrap;`;
    const look = primary
      ? `background:${accent};border:none;color:${onAccent};`
      : `background:none;border:1px solid ${stAlpha(ink, 0.22)};color:${ink};`;
    return `<button type="button" data-st="${st}" style="${base}${look}${extra}">${esc(label)}</button>`;
  }

  function renderCard(step, idx = i) {
    const b = stepBounds(idx, steps.length);
    const many = steps.length > 1;
    // Name the dialog by its step so a screen reader announces what changed on advance.
    card.setAttribute('aria-label', step.title || 'Product tour');
    const counter = many ? esc(L.progress(idx + 1, steps.length)) : '';
    const bar = many
      ? `<div aria-hidden="true" style="display:grid;grid-template-columns:repeat(${steps.length},1fr);gap:3px;margin:10px 0 12px">${steps.map((_, k) => `<span style="height:3px;border-radius:2px;background:${k <= idx ? accent : stAlpha(ink, 0.16)}"></span>`).join('')}</div>`
      : '<div style="height:10px"></div>';
    const nextLabel = step.final ? (step.ctaLabel || L.next) : (b.isLast ? L.done : L.next);
    // A step can offer another way on (`altLabel` + `onAlt`): the Welcome step's "Set up with Nora"
    // (src/lib/ai/accountSetup.mjs). It ends the tour first, like the finale's CTA, then runs.
    const alt = step.altLabel && typeof step.onAlt === 'function';
    const points = Array.isArray(step.points) && step.points.length
      ? `<ul style="margin:0 0 14px;padding:0;display:grid;gap:4px">${step.points.map((p) => `<li style="list-style:none;display:grid;grid-template-columns:14px 1fr;gap:6px;font-size:13px;line-height:1.45;opacity:.86"><span aria-hidden="true" style="color:${accent};font-weight:700">→</span><span>${esc(p)}</span></li>`).join('')}</ul>`
      : '';
    // Skip is spelled out on every step but the last, whose Done does the same.
    const skipText = !b.isLast
      ? `<button type="button" data-st="cancel" style="background:none;border:none;padding:10px 2px;min-height:40px;font:500 12.5px/1 ${F.body};color:${ink};opacity:.7;text-decoration:underline;text-underline-offset:3px;cursor:pointer;white-space:nowrap">${esc(L.skip)}</button>`
      : '<span></span>';
    card.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:20px;padding-right:30px">` +
        `<div style="font:700 10px/1.3 ${F.mono};letter-spacing:.14em;text-transform:uppercase;color:${accent}">${esc(step.eyebrow || '')}${counter ? `<span style="color:${ink};opacity:.55">${step.eyebrow ? ' · ' : ''}${counter}</span>` : ''}</div>` +
      `</div>` +
      bar +
      `<div style="font:600 19px/1.22 ${F.display};margin-bottom:7px">${esc(step.title)}</div>` +
      `<div style="font-size:13.5px;line-height:1.5;opacity:.84;margin-bottom:${points ? 10 : 14}px">${esc(step.body)}</div>` +
      points +
      `${alt ? `<button data-st="alt" style="display:block;width:100%;margin:0 0 14px;background:none;border:1px solid ${accent};color:${accent};border-radius:999px;padding:10px 14px;min-height:40px;font-size:12.5px;font-weight:600;cursor:pointer;text-align:center">${esc(step.altLabel)}</button>` : ''}` +
      `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">` +
        skipText +
        `<div style="display:flex;gap:8px;margin-left:auto">` +
          `${b.canBack ? btn('back', L.back, false) : ''}` +
          `${step.final && step.ctaLabel ? btn('done', L.done, false) : ''}` +
          btn('next', nextLabel, true) +
        `</div>` +
      `</div>` +
      `<button type="button" data-st="skip" aria-label="${esc(L.close)}" style="position:absolute;top:8px;right:8px;width:34px;height:34px;border-radius:50%;background:none;border:none;color:${ink};opacity:.55;font-size:20px;line-height:1;cursor:pointer">×</button>`;
    const next = card.querySelector('[data-st="next"]');
    // Final-step order matters: finish() FIRST (teardown + onDone persistence),
    // THEN the CTA — onCta typically navigates (window.location.href), and
    // navigating before onDone runs is how the "tour re-appears forever" bug
    // happened (the unload killed the seen-flag write mid-flight).
    next.onclick = () => { if (step.final) { finish(); try { step.onCta && step.onCta(); } catch (_) {} } else if (b.isLast) finish(); else { i = idx + 1; show(); } };
    const back = card.querySelector('[data-st="back"]'); if (back) back.onclick = () => { if (idx > 0) { i = idx - 1; show(); } };
    // The other way on: the tour is over (its seen flag written) before the step's own action runs.
    const other = card.querySelector('[data-st="alt"]'); if (other) other.onclick = () => { finish(); try { step.onAlt(); } catch (_) {} };
    // A final step with a navigating CTA also gets a plain Done — ending the
    // tour must never REQUIRE leaving the page.
    const done = card.querySelector('[data-st="done"]'); if (done) done.onclick = () => finish();
    // The × on the last step is that step's Done: nothing is left to skip.
    card.querySelector('[data-st="skip"]').onclick = b.isLast ? () => finish() : skip;
    const cancel = card.querySelector('[data-st="cancel"]'); if (cancel) cancel.onclick = skip;
    // Pull focus into the dialog. innerHTML above destroyed the old buttons, so
    // activeElement has fallen back to <body> — this runs on first show and on every
    // step change, and is a no-op re-focus on a resize re-render.
    if (next && !card.contains(document.activeElement)) { try { next.focus({ preventScroll: true }); } catch (_) {} }
  }

  const onResize = () => show();
  window.addEventListener('resize', onResize);
  const _td = teardown; teardown = () => { window.removeEventListener('resize', onResize); _td(); };

  const handle = { destroy: teardown };
  active = handle;
  show();
  return handle;
}

if (typeof window !== 'undefined') window.SpotlightTour = { start: startTour };
