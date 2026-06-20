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
