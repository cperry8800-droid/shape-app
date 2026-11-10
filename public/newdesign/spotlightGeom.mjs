// Pure geometry for the spotlight tour. Imported by spotlightTour.js (the engine) AND
// tests/spotlight-geom.test.mjs. All rects are {x,y,w,h} in root-local coordinates.

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// The spotlight hole: the target inflated by `pad` on every side (size never negative).
export function cutoutRect(t, pad = 8) {
  return { x: t.x - pad, y: t.y - pad, w: Math.max(0, t.w + pad * 2), h: Math.max(0, t.h + pad * 2) };
}

// Place the coachmark card relative to the target — prefer below, flip above when there
// isn't room, and clamp inside the root.
export function coachmarkPos(target, root, card, gap = 14) {
  const below = target.y + target.h + gap;
  const above = target.y - gap - card.h;
  const fitsBelow = below + card.h <= root.h;
  const side = fitsBelow ? 'below' : (above >= 0 ? 'above' : 'below');
  const rawTop = side === 'below' ? below : above;
  const top = clamp(rawTop, 8, Math.max(8, root.h - card.h - 8));
  const left = clamp(target.x + target.w / 2 - card.w / 2, 8, Math.max(8, root.w - card.w - 8));
  return { top, left, side };
}

export function stepBounds(i, total) {
  return { isFirst: i <= 0, isLast: i >= total - 1, canBack: i > 0, canNext: i < total - 1 };
}

// Below this root width the card stops floating beside its target and docks across the
// visible width, at the bottom, or at the top when the target sits in the lower half, so it
// never covers the control it is pointing at on a phone.
export const DOCK_BELOW = 560;

// The docked card: `vis` is the part of the root on screen ({y, h} in root coordinates; a
// website root is the whole page, so only a window of it shows), `target` the lit element
// (or null for a centred step). Returns { top, left, width }.
export function dockPos(target, vis, rootW, card, margin = 8) {
  const width = Math.max(0, rootW - margin * 2);
  const low = vis.y + margin;
  const high = Math.max(low, vis.y + vis.h - card.h - margin);
  const lower = target ? target.y + target.h / 2 > vis.y + vis.h / 2 : false;
  return { top: lower ? low : high, left: margin, width };
}

// The steps a tour actually shows: a step whose `when()` says the account doesn't have the
// feature is left out (the empty-state version is its own step), and one whose `when` throws
// is shown, since a step that can't be checked is better offered than lost.
export function visibleSteps(steps) {
  return (Array.isArray(steps) ? steps : []).filter((s) => {
    if (!s) return false;
    if (typeof s.when !== 'function') return true;
    try { return !!s.when(); } catch (_) { return true; }
  });
}
