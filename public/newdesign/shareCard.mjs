// shareCard.mjs — the share card (spec 2026-07-13): a member's own activity
// rendered as a story-ready 1080×1920 branded PNG and fired through the OS
// share sheet AS A FILE, so Instagram offers Stories (the Strava pattern).
//
// CANONICAL COPY (web-parity spec 2026-07-13, the dashSignals pattern — one
// implementation, three consumers): the website shells load this file as a
// native ES module (→ window.ShapeShareCard), the mobile app imports it from
// ../../public/newdesign/, and the Node tests import it directly.
//
// Canvas-drawn on purpose — never a DOM screenshot (fonts, CORS-tainted
// images, and paper themes make screenshots unreliable). The card is
// FIXED-DARK brand grammar on every paper (launch precedent). The model
// builds from the SAME `a` card shape the feed uses, so the image can never
// disagree with the card. Honest-absent throughout: a stat that doesn't
// exist renders NOTHING — no zeros, no placeholders.
//
// Pure, unit-tested helpers (tests/share-card.test.mjs): bsShareCardModel,
// bsHeroStatIndex, bsWrapText, bsFitRoute. The draw + share orchestration
// are browser-only.

import { bsMealMenuLines } from './mealShare.mjs';

// ── Pure: the card model ─────────────────────────────────────────────────────
// Trims + validates what the card/detail page already computed. Never invents:
// absent fields stay absent; stat rows with an empty value are dropped.
export function bsShareCardModel({
  who = '', tierLine = '', title = '', heroStat = null, stats = [],
  delta = '', meal = null, routePoints = null, dateLine = '',
} = {}) {
  const cleanRow = (r) => Array.isArray(r) && String(r[1] ?? '').trim()
    ? [String(r[0] ?? '').trim(), String(r[1]).trim()] : null;
  const hero = cleanRow(heroStat);
  const rows = (Array.isArray(stats) ? stats : []).map(cleanRow).filter(Boolean)
    // The hero never repeats in the small rows.
    .filter((r) => !hero || r[0] !== hero[0] || r[1] !== hero[1])
    .slice(0, 3);
  const type = meal ? 'meal' : (String(delta || '').trim() ? 'pr' : 'workout');
  const pts = (Array.isArray(routePoints) && routePoints.length >= 2)
    ? routePoints.filter((p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
    : null;
  return {
    type,
    who: String(who || '').trim(),
    tierLine: String(tierLine || '').trim().toUpperCase(),
    title: String(title || '').trim(),
    heroStat: hero,
    stats: rows,
    delta: String(delta || '').trim() || null,
    meal: meal || null,
    routePoints: pts && pts.length >= 2 ? pts : null,
    dateLine: String(dateLine || '').trim(),
  };
}

// ── Pure: hero-stat promotion ────────────────────────────────────────────────
// The ONE promotion rule both surfaces share (the mobile feed card's original
// `_primIdx`): runs lead with distance, lifts with load; fallback = the first
// value that reads as a measurement (digits + a unit); else the first stat.
export function bsHeroStatIndex(stats, { isRun = false } = {}) {
  const rows = Array.isArray(stats) ? stats : [];
  const pat = isRun ? /dist/i : /load|weight/i;
  let i = rows.findIndex((r) => Array.isArray(r) && pat.test(String(r[0] || '')));
  if (i < 0) i = rows.findIndex((r) => Array.isArray(r) && /\d/.test(String(r[1])) && /(lb|kg|mi|km)\b/i.test(String(r[1])));
  return i < 0 ? 0 : i;
}

// ── Pure: greedy word wrap with a caller-supplied measurer ───────────────────
// measure(text) → width. The last permitted line is ellipsized when the text
// overflows maxLines.
export function bsWrapText(text, maxWidth, measure, maxLines = 2) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  // A single token wider than maxWidth ellipsizes to fit — no emitted line may
  // ever measure past the card's column.
  const fit = (w) => {
    if (measure(w) <= maxWidth) return w;
    let cut = w;
    while (cut && measure(`${cut}…`) > maxWidth) cut = cut.slice(0, -1).trimEnd();
    return `${cut}…`;
  };
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) { line = fit(w); continue; }
    const probe = `${line} ${w}`;
    if (measure(probe) <= maxWidth) { line = probe; continue; }
    lines.push(line);
    line = fit(w);
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) { lines.push(line); line = ''; }
  if (line || lines.length > maxLines) {
    // Overflowed — ellipsize the final kept line.
    let last = lines[maxLines - 1] || '';
    while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd();
    lines.length = maxLines;
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

// ── Pure: aspect-fit route points into a card viewport ──────────────────────
// Points arrive as [x, y] pairs in the server's normalized space (the same
// pairs the feed's polyline draws). Returns scaled+centered pairs, or null
// when the route has no spread (a single spot never draws a fake line).
export function bsFitRoute(points, box) {
  const xs = points.map((p) => Number(p[0]));
  const ys = points.map((p) => Number(p[1]));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX, spanY = maxY - minY;
  if (spanX <= 0 && spanY <= 0) return null;
  const scale = Math.min(box.w / (spanX || 1e-9), box.h / (spanY || 1e-9));
  const offX = box.x + (box.w - spanX * scale) / 2;
  const offY = box.y + (box.h - spanY * scale) / 2;
  return points.map((p) => [offX + (Number(p[0]) - minX) * scale, offY + (Number(p[1]) - minY) * scale]);
}

// ── Browser: draw ────────────────────────────────────────────────────────────
const W = 1080, H = 1920, PAD = 96;
const CREAM = '#f2ede4', TEAL = '#34d6c5', TEAL_DEEP = '#0ac5a8';
const MONO = `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`;
const DISPLAY = `'Space Grotesk', 'Helvetica Neue', Arial, sans-serif`;
const dim = (a) => `rgba(242,237,228,${a})`;

function drawGround(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b161c'); g.addColorStop(0.48, '#070b11'); g.addColorStop(1, '#03050b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W / 2, -H * 0.08, 0, W / 2, -H * 0.08, H * 0.75);
  r.addColorStop(0, 'rgba(52,214,197,0.14)'); r.addColorStop(1, 'rgba(52,214,197,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
}

function drawMark(ctx, x, y, s) {
  const p = (pts, fill, stroke) => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => { const cx = x + (px / 100) * s, cy = y + (py / 100) * s; i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1.5, s * 0.016); ctx.lineJoin = 'round'; ctx.stroke(); }
  };
  ctx.save();
  ctx.shadowColor = 'rgba(46,224,196,0.45)'; ctx.shadowBlur = s * 0.3;
  p([[20, 40], [20, 88], [56, 64]], TEAL_DEEP, '#ffffff');
  p([[80, 12], [80, 60], [44, 36]], '#ffffff', TEAL_DEEP);
  ctx.restore();
}

const mono = (px, weight = 700) => `${weight} ${px}px ${MONO}`;
const disp = (px, weight = 700) => `${weight} ${px}px ${DISPLAY}`;

function eyebrow(ctx, text, x, y, color = dim(0.55)) {
  ctx.font = mono(26, 800); ctx.fillStyle = color;
  ctx.fillText(String(text).toUpperCase().split('').join(' '), x, y);
}

function rule(ctx, y, alpha = 0.2) {
  ctx.fillStyle = dim(alpha); ctx.fillRect(PAD, y, W - PAD * 2, 2);
}

export function bsDrawShareCard(ctx, model) {
  drawGround(ctx);
  ctx.textBaseline = 'alphabetic';

  // Masthead: mark + wordmark, rule beneath.
  drawMark(ctx, PAD, 108, 96);
  ctx.font = mono(40, 700); ctx.fillStyle = CREAM;
  ctx.fillText('S H A P E', PAD + 128, 178);
  rule(ctx, 250);

  // Author register.
  let y = 360;
  if (model.who) { ctx.font = disp(58, 700); ctx.fillStyle = CREAM; ctx.fillText(model.who, PAD, y); y += 52; }
  if (model.tierLine) { eyebrow(ctx, model.tierLine, PAD, y, dim(0.55)); y += 30; }
  y += 60;

  // Title (≤2 wrapped lines).
  ctx.font = disp(76, 700); ctx.fillStyle = CREAM;
  const titleLines = bsWrapText(model.title, W - PAD * 2, (s) => ctx.measureText(s).width, 2);
  titleLines.forEach((ln) => { ctx.fillText(ln, PAD, y); y += 86; });
  y += 24;

  if (model.type === 'meal' && model.meal) {
    // THE PLATE — kcal hero + dot-leader macro rows + stamp/attribution.
    if (model.meal.kcal != null) {
      eyebrow(ctx, 'Calories', PAD, y); y += 26;
      const figure = String(model.meal.kcal);
      ctx.font = disp(170, 700); ctx.fillStyle = CREAM;
      ctx.fillText(figure, PAD, y + 150);
      const figW = ctx.measureText(figure).width;
      ctx.font = mono(34, 700); ctx.fillStyle = dim(0.5);
      ctx.fillText('KCAL', PAD + figW + 24, y + 150);
      y += 220;
    }
    const rows = bsMealMenuLines(model.meal);
    rows.forEach(([l, v]) => {
      ctx.font = disp(44, 500); ctx.fillStyle = dim(0.88); ctx.fillText(l, PAD, y);
      ctx.font = mono(38, 700); ctx.fillStyle = dim(0.88);
      const vw = ctx.measureText(v).width;
      ctx.fillText(v, W - PAD - vw, y);
      ctx.save();
      ctx.strokeStyle = dim(0.3); ctx.lineWidth = 3; ctx.setLineDash([3, 14]);
      ctx.font = disp(44, 500);
      const lw = ctx.measureText(l).width;
      ctx.beginPath(); ctx.moveTo(PAD + lw + 28, y - 12); ctx.lineTo(W - PAD - vw - 28, y - 12); ctx.stroke();
      ctx.restore();
      y += 84;
    });
    const stamp = model.meal.planned === true ? 'As planned' : model.meal.planned === false ? 'Adjusted' : null;
    const stampLine = [stamp, model.meal.portion ? `${model.meal.portion}×` : null].filter(Boolean).join(' · ');
    const attribution = model.meal.coach ? `From ${model.meal.coach}'s plan` : model.meal.recipeId ? 'Kitchen Card recipe' : null;
    if (stampLine || attribution) {
      y += 10; rule(ctx, y, 0.16); y += 54;
      if (stampLine) eyebrow(ctx, stampLine, PAD, y, dim(0.55));
      if (attribution) {
        ctx.font = mono(26, 800); const aw = ctx.measureText(String(attribution).toUpperCase().split('').join(' ')).width;
        eyebrow(ctx, attribution, W - PAD - aw, y, dim(0.55));
      }
    }
  } else {
    // Workout / PR — hero figure, small stat registers, optional route.
    if (model.heroStat) {
      eyebrow(ctx, model.heroStat[0], PAD, y); y += 26;
      ctx.font = disp(150, 700); ctx.fillStyle = CREAM; ctx.fillText(model.heroStat[1], PAD, y + 134);
      y += 200;
    }
    if (model.delta) {
      ctx.font = mono(40, 800); ctx.fillStyle = TEAL;
      ctx.save(); ctx.shadowColor = 'rgba(46,224,196,0.4)'; ctx.shadowBlur = 18;
      ctx.fillText(model.delta.toUpperCase(), PAD, y); ctx.restore();
      y += 84;
    }
    if (model.stats.length) {
      const colW = (W - PAD * 2) / model.stats.length;
      model.stats.forEach(([l, v], i) => {
        const x = PAD + i * colW;
        eyebrow(ctx, l, x, y);
        ctx.font = disp(56, 700); ctx.fillStyle = CREAM; ctx.fillText(v, x, y + 76);
      });
      y += 160;
    }
    if (model.routePoints) {
      const box = { x: PAD, y: y + 20, w: W - PAD * 2, h: Math.min(560, H - 320 - (y + 20)) };
      const fit = box.h > 120 ? bsFitRoute(model.routePoints, box) : null;
      if (fit) {
        ctx.save();
        ctx.strokeStyle = TEAL; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(46,224,196,0.45)'; ctx.shadowBlur = 22;
        ctx.beginPath();
        fit.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
        ctx.restore();
        const dot = (p, fill) => { ctx.beginPath(); ctx.arc(p[0], p[1], 12, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
        dot(fit[0], CREAM); dot(fit[fit.length - 1], TEAL);
      }
    }
  }

  // Footer: rule · date left · site right.
  rule(ctx, H - 190);
  if (model.dateLine) eyebrow(ctx, model.dateLine, PAD, H - 118, dim(0.45));
  ctx.font = mono(26, 800); ctx.fillStyle = dim(0.45);
  const site = 'THESHAPECOMMUNITY.COM';
  ctx.fillText(site, W - PAD - ctx.measureText(site).width, H - 118);
}

// ── Browser: render + share orchestration ────────────────────────────────────
// Returns { ok, mode: 'shared' | 'downloaded' | 'aborted', reason? }. Abort is
// silent by contract; the caller toasts real failures honestly.
export async function bsShareCardImage(model) {
  try {
    try {
      await Promise.all([
        document.fonts.load(`700 76px ${DISPLAY}`),
        document.fonts.load(`800 26px ${MONO}`),
      ]);
    } catch (e) { /* system fallbacks draw fine */ }
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, reason: 'no_canvas' };
    bsDrawShareCard(ctx, model);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return { ok: false, reason: 'no_blob' };
    const file = new File([blob], `shape-${model.type}-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return { ok: true, mode: 'shared' }; }
      catch (e) { if (e && e.name === 'AbortError') return { ok: true, mode: 'aborted' }; }
    }
    // Desktop / no file-share support → download the PNG.
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url; el.download = file.name;
    document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, mode: 'downloaded' };
  } catch (e) {
    return { ok: false, reason: 'render_failed' };
  }
}
