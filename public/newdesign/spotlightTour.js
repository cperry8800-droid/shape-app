// Interactive guided spotlight tour — framework-agnostic. Dims a root container, cuts a
// spotlight around each step's target element, and shows a coachmark with Back/Next/Skip +
// progress dots. Used by the mobile broadsheet (root = #bs-phone-surface) and the website
// (root = document.body, Phase B). Pure geometry lives in spotlightGeom.mjs.
import { cutoutRect, coachmarkPos, stepBounds } from './spotlightGeom.mjs';

const PAD = 8;

// Escape dynamic step text before it goes into the coachmark innerHTML. Step copy is
// authored by us today, but this keeps the rendering injection-safe if a step field
// ever carries user-influenced content.
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

export function startTour(steps, opts = {}) {
  const root = opts.root || document.body;
  const accent = opts.accent || '#2ee0c4';
  const ink = opts.isLight ? '#14110d' : '#f4eedf';
  const paper = opts.isLight ? '#f4eedf' : '#1a1714';
  const rootPos0 = root.style.position;
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Layers: a dim box that uses a huge box-shadow as the "mask" around a transparent cutout.
  const layer = el('div', `position:absolute;inset:0;z-index:99999;`);
  const cut = el('div', `position:absolute;border-radius:12px;box-shadow:0 0 0 9999px rgba(8,10,12,0.66);transition:${reduce ? 'none' : 'all .28s cubic-bezier(.2,.7,.2,1)'};pointer-events:none`);
  const ring = el('div', `position:absolute;border-radius:14px;border:1.5px solid ${accent};box-shadow:0 0 22px -2px ${accent}88;transition:${reduce ? 'none' : 'all .28s cubic-bezier(.2,.7,.2,1)'};pointer-events:none`);
  const card = el('div', `position:absolute;width:280px;max-width:84%;background:${paper};color:${ink};border:1px solid ${accent}44;border-radius:16px;padding:18px 18px 14px;box-shadow:0 24px 60px -20px rgba(0,0,0,.7);font-family:system-ui,-apple-system,sans-serif;transition:${reduce ? 'none' : 'top .28s, left .28s'}`);
  // The card IS the tour's dialog: the dim layer blocks the page beneath it, so a
  // screen reader / keyboard user should be scoped to the card.
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Product tour');
  cut.setAttribute('aria-hidden', 'true');
  ring.setAttribute('aria-hidden', 'true');
  layer.append(cut, ring, card);
  root.appendChild(layer);

  const prevFocus = typeof document !== 'undefined' ? document.activeElement : null;
  let i = 0, destroyed = false;
  const cardSize = () => ({ w: card.offsetWidth || 280, h: card.offsetHeight || 150 });
  const focusables = () => Array.from(card.querySelectorAll('button')).filter((b) => b.offsetParent !== null);

  // Escape dismisses (a modal contract); Tab cycles within the card so focus can't
  // wander into the dimmed, pointer-blocked page behind it.
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); finish(); return; }
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
    try { root.style.position = rootPos0; } catch (_) {}
    // Hand focus back to whatever the user was on before the tour opened.
    try { if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch (_) {}
  }
  function finish() { teardown(); if (opts.onDone) opts.onDone(); }

  async function show() {
    if (destroyed) return;
    const step = steps[i];
    try { if (step.navigate) await step.navigate(); } catch (_) {}
    if (destroyed) return;
    let target = await waitFor(step.anchor);
    if (!target && step.fallback) { try { target = step.fallback(); } catch (_) {} }
    if (destroyed) return;

    // Bring the anchor into view BEFORE measuring — an anchor below the fold (e.g.
    // hero-habits on a filled Home) would otherwise spotlight offscreen. The dim
    // layer swallows pointer events, so the user can't scroll it back out from under
    // us; instant behavior keeps the measure deterministic (and honors reduced motion).
    if (target && target.scrollIntoView) {
      try { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' }); } catch (_) {}
      await nextFrames();
      if (destroyed) return;
    }

    const rr = root.getBoundingClientRect();
    renderCard(step);
    if (target) {
      const b = target.getBoundingClientRect();
      const t = { x: b.left - rr.left, y: b.top - rr.top, w: b.width, h: b.height };
      const co = cutoutRect(t, PAD);
      Object.assign(cut.style, { left: co.x + 'px', top: co.y + 'px', width: co.w + 'px', height: co.h + 'px', display: 'block' });
      Object.assign(ring.style, { left: (co.x - 2) + 'px', top: (co.y - 2) + 'px', width: (co.w + 4) + 'px', height: (co.h + 4) + 'px', display: 'block' });
      const p = coachmarkPos(t, { x: 0, y: 0, w: rr.width, h: rr.height }, cardSize());
      Object.assign(card.style, { top: p.top + 'px', left: p.left + 'px' });
    } else {
      // No target → no cutout; full dim + centered card.
      cut.style.display = 'none'; ring.style.display = 'none';
      const s = cardSize();
      Object.assign(card.style, { top: Math.round(rr.height / 2 - s.h / 2) + 'px', left: Math.round(rr.width / 2 - s.w / 2) + 'px' });
    }
  }

  function renderCard(step) {
    const b = stepBounds(i, steps.length);
    // Name the dialog by its step so a screen reader announces what changed on advance.
    card.setAttribute('aria-label', step.title || 'Product tour');
    const dots = steps.map((_, k) => `<span style="width:${k === i ? 18 : 6}px;height:6px;border-radius:3px;background:${k === i ? accent : ink + '40'};transition:width .2s;display:inline-block;margin-right:5px"></span>`).join('');
    const nextLabel = step.final ? (step.ctaLabel || 'Open →') : (b.isLast ? 'Done' : 'Next →');
    card.innerHTML =
      `${step.eyebrow ? `<div style="font:600 10px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:${accent};margin-bottom:8px">${esc(step.eyebrow)}</div>` : ''}` +
      `<div style="font:600 19px/1.2 Georgia,serif;margin-bottom:7px">${esc(step.title)}</div>` +
      `<div style="font-size:13.5px;line-height:1.5;opacity:.82;margin-bottom:14px">${esc(step.body)}</div>` +
      `<div style="display:flex;align-items:center;justify-content:space-between">` +
        `<div>${dots}</div>` +
        `<div style="display:flex;gap:8px">` +
          `${b.canBack ? `<button data-st="back" style="background:none;border:1px solid ${ink}33;color:${ink};border-radius:999px;padding:7px 14px;font-size:12.5px;cursor:pointer">Back</button>` : ''}` +
          `<button data-st="next" style="background:${accent};border:none;color:#06231f;border-radius:999px;padding:7px 16px;font-size:12.5px;font-weight:600;cursor:pointer">${esc(nextLabel)}</button>` +
        `</div>` +
      `</div>` +
      `<button data-st="skip" aria-label="Skip" style="position:absolute;top:10px;right:12px;background:none;border:none;color:${ink};opacity:.5;font-size:18px;line-height:1;cursor:pointer">×</button>`;
    const next = card.querySelector('[data-st="next"]');
    next.onclick = () => { if (step.final) { try { step.onCta && step.onCta(); } catch (_) {} finish(); } else if (b.isLast) finish(); else { i++; show(); } };
    const back = card.querySelector('[data-st="back"]'); if (back) back.onclick = () => { if (i > 0) { i--; show(); } };
    card.querySelector('[data-st="skip"]').onclick = finish;
    // Pull focus into the dialog. innerHTML above destroyed the old buttons, so
    // activeElement has fallen back to <body> — this runs on first show and on every
    // step change, and is a no-op re-focus on a resize re-render.
    if (next && !card.contains(document.activeElement)) { try { next.focus({ preventScroll: true }); } catch (_) {} }
  }

  const onResize = () => show();
  window.addEventListener('resize', onResize);
  const _td = teardown; teardown = () => { window.removeEventListener('resize', onResize); _td(); };

  show();
  return { destroy: teardown };
}

if (typeof window !== 'undefined') window.SpotlightTour = { start: startTour };
