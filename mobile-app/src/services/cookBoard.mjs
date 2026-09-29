// The burners-and-tracks cook screen, as pure functions: where each dish is on the stove
// right now, one lane of blocks per dish on a shared clock, the slice of that clock the
// screen shows, and the time the food is ready. Rendering lives in the client module;
// everything a test needs to reason about is here, so it can be driven without React.
//
// Nothing here invents a fact about the kitchen. A dish is drawn on a burner only when
// the plan says it is there: its own step is on the stove, a timer it started holds the
// stove, or its last step left a pan on the heat that its next step picks up (the same
// sticky rule the planner schedules by). A dish the plan does not place is not drawn.

import { BS_ORCH } from './cookOrchestrator.mjs';

const STATIONS = ['stove', 'oven', 'board', 'off'];
const STICKY = ['stove', 'oven'];

// How many burners and ovens the drawing shows. Past four burners the extra ones are empty
// almost always, and drawing eight rings on a phone leaves no room for the step, so the
// fifth dish on the heat is counted in an overflow line instead of a ring.
export const BS_HOB_MAX = { stove: 4, oven: 2 };

// A step's planned minutes: its authored length, or the planner's stand-in for a hands-on
// step with none. The SAME figure the board weighs progress by, so the drawing and the
// percentage can never disagree about how long a step takes.
export const bsEventMinutes = (e) => (e && typeof e.min === 'number' && e.min > 0 ? e.min : BS_ORCH.activeStepMin);

const pauseOf = (e) => (e && e.passive !== true && typeof e.maxPause === 'number' && Number.isFinite(e.maxPause) && e.maxPause > 0);
const stationsOf = (e) => [e && e.station, ...(e && Array.isArray(e.also) ? e.also : [])].filter((x) => STATIONS.includes(x));
const countOf = (kitchen, station) => {
  const raw = kitchen && kitchen[station];
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

// The ink that reads on a filled colour: whichever of near-black and white has more contrast.
const channel = (hex, i) => parseInt(String(hex).slice(1 + i * 2, 3 + i * 2), 16) / 255;
const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export function bsLuminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(String(hex))) return NaN;
  return 0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 1)) + 0.0722 * lin(channel(hex, 2));
}
export const bsContrast = (a, b) => {
  const la = bsLuminance(a), lb = bsLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
export function bsInkOn(hex) {
  return bsContrast(hex, '#0f0e0c') >= bsContrast(hex, '#ffffff') ? '#0f0e0c' : '#ffffff';
}

// Dish colours. A dish wears its own recipe card's hue, as the approved preview drew it
// (`bsDishColors`); this fixed set is for a dish with no card art (a member's own recipe) and
// for one whose hue would sit too close to a dish already on the screen, because two dishes
// must never share a colour on one screen. Dark papers start from the light set and light
// papers from the dark set; then, because the app ships eighteen papers and a fixed colour
// cannot hold 3:1 against all of them (measured: two of the light set fell to 2.9:1 on
// Manila), every colour is walked toward black or white until it reads against the surface
// it is actually drawn on, and until the step number printed on it reads too.
export const BS_DISH_COLORS = {
  dark: ['#e8b06a', '#7cc4f0', '#b8a0f5', '#8fd07a', '#f29a8c', '#e3d46b'],
  light: ['#8a5a14', '#1d6a96', '#6546ab', '#3b7329', '#a4402f', '#6c5f10'],
};
export const BS_DISH_MIN_CONTRAST = 3.2;
const BS_DISH_INK_CONTRAST = 4.5;
const HEX6 = /^#[0-9a-f]{6}$/i;
const mix = (hex, to, k) => '#' + [0, 1, 2].map((i) => {
  const a = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16), b = parseInt(to.slice(1 + i * 2, 3 + i * 2), 16);
  return Math.round(a + (b - a) * k).toString(16).padStart(2, '0');
}).join('');
// `base` overrides the fixed set: a recipe's own hue, walked for contrast the same way.
export function bsDishColor(i, isLight, surface, base = null) {
  const set = isLight ? BS_DISH_COLORS.light : BS_DISH_COLORS.dark;
  const n = set.length;
  const from = HEX6.test(String(base)) ? String(base).toLowerCase() : set[((Number.isFinite(i) ? Math.floor(i) : 0) % n + n) % n];
  if (!HEX6.test(String(surface))) return from;
  const toward = isLight ? '#000000' : '#ffffff';
  for (let k = 0; k <= 1.0001; k += 0.04) {
    const c = k === 0 ? from : mix(from, toward, k);
    if (bsContrast(c, surface) >= BS_DISH_MIN_CONTRAST && bsContrast(c, bsInkOn(c)) >= BS_DISH_INK_CONTRAST) return c;
  }
  return mix(from, toward, 1);
}

// A recipe card's own hue: the brightest stop of its gradient (the dark ink every card fades
// into is not a hue). The preview's rule; null for a card with no colour in it.
export function bsHeroHue(hero) {
  const stops = (String(hero || '').match(/#[0-9a-f]{6}/gi) || []).filter((c) => c.toLowerCase() !== '#1a1612');
  if (!stops.length) return null;
  return stops.reduce((a, b) => (bsLuminance(b) > bsLuminance(a) ? b : a)).toLowerCase();
}

// How far apart two colours look ("redmean", a cheap stand-in for a perceptual difference).
// Two oranges from two card gradients land near 30; the closest pair of the fixed set, 49.
export function bsColorGap(a, b) {
  if (!HEX6.test(String(a)) || !HEX6.test(String(b))) return Infinity;
  const r1 = channel(a, 0) * 255, r2 = channel(b, 0) * 255;
  const dR = r1 - r2, dG = (channel(a, 1) - channel(b, 1)) * 255, dB = (channel(a, 2) - channel(b, 2)) * 255;
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * dR * dR + 4 * dG * dG + (2 + (255 - rm) / 256) * dB * dB);
}
export const BS_DISH_MIN_GAP = 45;

// Past the fixed set: more hues, a golden-angle step apart round the wheel, each walked for
// contrast like any other colour. The same sequence every time, so a list of dishes keeps its
// colours.
const hslHex = (h, s, l) => {
  const a = s * Math.min(l, 1 - l);
  const f = (k0) => {
    const k = (k0 + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};
const extraDishColor = (k, isLight, surface) =>
  bsDishColor(0, isLight, surface, hslHex((k * 137.508) % 360, isLight ? 0.6 : 0.7, isLight ? 0.32 : 0.7));

// Every dish's colour for one screen, in dish order: its own hue when it has one that reads
// apart from the dishes before it, otherwise the next colour of the fixed set that does. The
// same list of dishes on the same paper always gives the same colours, so a dish keeps its
// colour from the setup screens through the cook.
export function bsDishColors(hues, isLight, surface) {
  const list = Array.isArray(hues) ? hues : [];
  const out = [];
  const apart = (c) => out.every((o) => bsColorGap(o, c) >= BS_DISH_MIN_GAP);
  const nearest = (c) => Math.min(...out.map((o) => bsColorGap(o, c)));
  let next = 0;
  const extra = [];
  const n = BS_DISH_COLORS.dark.length;
  list.forEach((hue, i) => {
    const own = HEX6.test(String(hue)) ? bsDishColor(i, isLight, surface, hue) : null;
    if (own && apart(own)) { out.push(own); return; }
    for (let k = 0; k < n; k++) {
      const c = bsDishColor(next + k, isLight, surface);
      if (apart(c)) { out.push(c); next = next + k + 1; return; }
    }
    // ⚠ PAST THE FIXED SET. This used to fall back to the fixed colour at the dish's own index,
    // so a seventh dish wore the first dish's colour exactly -- and nothing caps a session at six
    // (a week's prep runs past it). The extra hues are tried next, and when none reads apart from
    // every dish already on screen the farthest of them is taken, so no two dishes share a colour
    // outright (Copilot, round 1). The name on each lane and burner stays the dish's identity:
    // past a handful of dishes, colour alone could never carry it.
    // Four extra hues for every dish so far. MEASURED on every paper: sixteen near-identical
    // cards all read apart with four, where two per dish left 3 pairs alike and one left 25.
    // Sized by the dish's place, not the whole list, so adding a dish never recolours the ones
    // before it.
    while (extra.length < 4 * (i + 1)) extra.push(extraDishColor(extra.length, isLight, surface));
    const pool = extra.slice(0, 4 * (i + 1));
    out.push(pool.find(apart) || pool.reduce((best, c) => (nearest(c) > nearest(best) ? c : best)));
  });
  return out;
}

// One lane per dish INSTANCE (`iid`), in the order dishes first appear. Two copies of one
// recipe are two lanes, because they are two pans. Each block is one step at its planned
// minute; `past` and `current` come from the cursor, so the lanes read as far through the
// cook as the step card does.
export function bsTrackLanes(timeline, cursor = 0) {
  const byIid = new Map();
  (Array.isArray(timeline) ? timeline : []).forEach((e, idx) => {
    if (!e) return;
    const key = e.iid ?? e.recipe;
    if (!byIid.has(key)) byIid.set(key, { iid: key, recipe: e.recipe, title: e.title, order: byIid.size, blocks: [] });
    const at = typeof e.at === 'number' && Number.isFinite(e.at) ? e.at : 0;
    // `step` is the dish's own step number from the recipe, which a Serve replan never
    // changes: a running timer is matched to its block by it, because the replan rebuilds
    // the timeline and moves every index after the cursor.
    // `est`: the step carries no authored length, so its block is the planner's stand-in and
    // is drawn fading out — the preview's way of saying "about this long".
    byIid.get(key).blocks.push({ idx, step: e.stepIndex, at, end: at + bsEventMinutes(e), hold: e.passive === true, est: !(typeof e.min === 'number' && e.min > 0), text: String(e.text || ''), past: idx < cursor, current: idx === cursor });
  });
  const lanes = [...byIid.values()];
  for (const lane of lanes) lane.blocks.forEach((b, i) => { b.stepNo = i + 1; b.of = lane.blocks.length; });
  return lanes;
}

// Where "now" sits on the plan's clock, in minutes. With a session clock it is the real time
// since the cook began; without one (an older saved session, a test) it is the planned start
// of the step in front of the cook, which is where that cook is.
export function bsCookNowMin({ anchor, now = Date.now(), timeline, cursor = 0 }) {
  if (typeof anchor === 'number' && Number.isFinite(anchor)) return (now - anchor) / 60000;
  const ev = Array.isArray(timeline) ? timeline[cursor] : null;
  return ev && typeof ev.at === 'number' && Number.isFinite(ev.at) ? ev.at : 0;
}

export function bsPlanEnd(timeline) {
  return (Array.isArray(timeline) ? timeline : []).reduce((m, e) => (e && typeof e.at === 'number' && Number.isFinite(e.at) ? Math.max(m, e.at + bsEventMinutes(e)) : m), 0);
}

// The slice of the clock the tracks show. A phone shows a moving window around now, so the
// blocks stay wide enough to read; a wide screen shows the whole cook, so the eye can see
// where it ends. Never a window that starts before minute zero by more than a little room.
export function bsTrackWindow({ timeline, nowMin, wide = false }) {
  const end = Math.max(bsPlanEnd(timeline), Number.isFinite(nowMin) ? nowMin : 0);
  if (wide) return { from: -1, to: Math.max(end + 2, 10) };
  const from = Math.max(-2, (Number.isFinite(nowMin) ? nowMin : 0) - 6);
  return { from, to: from + 46 };
}

// Ready around: when the last step ends, pushed back by however late the cook is running.
// Lateness is measured against the END of the step in front of them: a cook working through a
// twenty-minute simmer is on time for all twenty minutes, and only one still standing at it
// after that is running late. (Measured against the step's start, the time crept a minute
// later for every minute of honest work and snapped back when the cook moved on.) In Serve
// mode a live replan already knows its table time, and that wins.
export function bsCookFinishAt({ anchor, now = Date.now(), timeline, cursor = 0, serveAt = null }) {
  if (typeof serveAt === 'number' && Number.isFinite(serveAt)) return serveAt;
  const list = Array.isArray(timeline) ? timeline : [];
  if (!list.length) return null;
  const end = bsPlanEnd(list);
  const ev = list[cursor];
  const evAt = ev && typeof ev.at === 'number' && Number.isFinite(ev.at) ? ev.at : end;
  if (typeof anchor === 'number' && Number.isFinite(anchor)) {
    const evEnd = ev ? evAt + bsEventMinutes(ev) : end;
    const late = Math.max(0, (now - anchor) / 60000 - evEnd);
    return anchor + (end + late) * 60000;
  }
  return now + Math.max(0, end - evAt) * 60000;
}

// Who is on the stove, in the oven, on the board and resting, right now. Each slot is
// { iid, recipe, title, kind, timerId?, left?, up? } where kind is 'hold' (a timer it
// started), 'now' (the step in front of the cook) or 'heat' (a pan its last step left on the
// heat, waiting for its next step). `where` names the current step's place for the card.
//
// `current: false` leaves the step in front of the cook OFF the drawing: the screen passes it
// when that step is waiting for its station (another dish's timer still holds it), because a
// step that cannot start is not standing anywhere yet. Drawing it would either double a burner
// or push it into the "more on the heat" line, and both would be claims the plan does not make.
export function bsHobOccupancy({ timeline, cursor = 0, timers = [], now = Date.now(), kitchen = {}, current = true }) {
  const list = Array.isArray(timeline) ? timeline : [];
  const tms = (Array.isArray(timers) ? timers : []).filter((tm) => tm && !tm.soft);
  const cap = { stove: countOf(kitchen, 'stove'), oven: countOf(kitchen, 'oven') };
  const shown = { stove: Math.min(cap.stove, BS_HOB_MAX.stove), oven: Math.min(cap.oven, BS_HOB_MAX.oven) };
  const slots = { stove: [], oven: [], board: [], off: [] };
  const overflow = { stove: 0, oven: 0 };
  const add = (station, occ) => {
    if ((station === 'stove' || station === 'oven') && slots[station].length >= shown[station]) { overflow[station] += 1; return; }
    slots[station].push(occ);
  };
  // A dish fills a station as many times as it has pans there, and no more: its simmer timer
  // and the next step that stirs the same pot are one pan on one burner, not two.
  const need = (stations) => stations.reduce((m, st) => m.set(st, (m.get(st) || 0) + 1), new Map());
  const topUp = (iid, stations, make, onExisting) => {
    for (const [st, n] of need(stations)) {
      const have = slots[st].filter((o) => o.iid === iid);
      have.slice(0, n).forEach(onExisting);
      for (let k = have.length; k < n; k++) add(st, make());
    }
  };
  // 1. Holds: a timer the cook started keeps its station until it is dismissed.
  for (const tm of tms) {
    const up = !(tm.endsAt > now);
    for (const st of stationsOf(tm)) add(st, { iid: tm.iid, recipe: tm.recipeKey, title: tm.title, kind: 'hold', timerId: tm.id, left: up ? 0 : Math.ceil((tm.endsAt - now) / 1000), up });
  }
  // 2. The step in front of the cook, unless it is a window whose own timer is already down.
  const ev = list[cursor];
  const drawCurrent = !!ev && current !== false;
  if (drawCurrent && !tms.some((tm) => tm.iid === ev.iid && tm.stepIndex === cursor)) {
    topUp(ev.iid, stationsOf(ev), () => ({ iid: ev.iid, recipe: ev.recipe, title: ev.title, kind: 'now' }), (o) => { o.now = true; });
  }
  // 3. Pans still on the heat: a dish whose last finished step used the stove or oven, whose
  //    next step has not started, and which no timer already places. The step in front of
  //    the cook counts as started when rule 2 drew it, so its own dish is never placed twice;
  //    when it was left off (waiting for its station), the pan its last step left is still there.
  const lastDone = new Map();
  const hasMore = new Set();
  list.forEach((e, idx) => { if (!e) return; if (idx < cursor) lastDone.set(e.iid, e); else hasMore.add(e.iid); });
  const held = new Set(tms.map((tm) => tm.iid));
  for (const [iid, e] of lastDone) {
    if (!hasMore.has(iid) || held.has(iid) || (drawCurrent && ev.iid === iid) || pauseOf(e)) continue;
    topUp(iid, stationsOf(e).filter((x) => STICKY.includes(x)), () => ({ iid, recipe: e.recipe, title: e.title, kind: 'heat' }), () => {});
  }
  // Where the current step happens, for the card: the numbered burner or oven it stands at.
  let where = null;
  if (drawCurrent) {
    for (const st of stationsOf(ev)) {
      const i = slots[st].findIndex((o) => o.iid === ev.iid);
      if (i >= 0) { where = { station: st, n: i + 1 }; break; }
    }
    if (!where && ev.station) where = { station: ev.station, n: null };
  }
  return { burners: shown.stove, ovens: shown.oven, stove: slots.stove, oven: slots.oven, board: slots.board, off: slots.off, overflow, where };
}
