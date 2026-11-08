// Client colours: a client's colour is their current Shape Score tier's (the owner, 2026-11-06:
// "client colors should match their current tier in shape score", then "client colors dont
// change"), and the small fixed maps for calendar kinds and program types. Status is always a
// labelled chip, never a colour alone: red, gold and green are tiers here too. Pure: no DOM, no
// storage, no network.
//
// CANONICAL here; the website loads it as `window.ShapeClientColors` (TrainerApp.html,
// NutritionistApp.html) and mobile-app/src/services/clientColors.mjs re-exports it for the
// app and for Node tests.
//
// ⚠ A CLIENT'S COLOUR IS THEIR TIER'S, EXACTLY, ON EVERY PAPER. The five are tierColors.jsx's
// member ladder (the app's BS_TIER_COLORS holds the same), at the rank thresholds the Score page
// and the database use (award_tier_bonuses, /api/client/score: 0, 750, 2,000, 5,000, 15,000 rank
// points, the high-water mark of points earned without Store purchases or tier bonuses). A
// colour changes only when the client's tier does, and the tier never comes down.
// tests/client-tier-colours.test.mjs holds the three in step.
//
// ⚠ THE COLOUR GOES ON A MARK, NEVER ON THE NAME. Peak and Legend read about 1.5:1 as text on
// White, so the name stays in the page's ink and the tier is drawn as a gem or a dot beside it
// (`.sh-tier-mark` in dash.css), with the tier in words for hover and assistive tech
// ("Form tier"). A mark keeps 3:1 against its paper (non-text contrast): where the exact colour
// falls under that, dash.css gives the mark a thin neutral ring instead of changing its colour.
// tests/dash-depth.test.mjs measures every pair against dash.css itself.
//
// ⚠ AN UNKNOWN TIER IS NO TIER, NEVER RAW. A score not read yet, a read that failed, a client
// with no reading, the preview's client without one: every helper answers null, and the caller
// keeps its plain ink and draws no colour. Only a number of points (or a tier's name) is a tier.

/** The member ladder, lowest first. `key` is stable: store or compare that, never an index. */
export const MEMBER_TIERS = Object.freeze([
  Object.freeze({ key: 'raw', label: 'Raw', min: 0, color: '#5fa96e' }),
  Object.freeze({ key: 'tempo', label: 'Tempo', min: 750, color: '#d8a23a' }),
  Object.freeze({ key: 'form', label: 'Form', min: 2000, color: '#e0463c' }),
  Object.freeze({ key: 'peak', label: 'Peak', min: 5000, color: '#8fe3e6' }),
  Object.freeze({ key: 'legend', label: 'Legend', min: 15000, color: '#34d6c5' }),
]);

/** Which value each paper (`<html data-paper>`) takes. White is the default, with no attribute. */
export const PAPER_TONE = Object.freeze({ white: 'light', bone: 'light', dark: 'dark', carbon: 'dark', night: 'dark', glass: 'dark' });

/** 'light' or 'dark' for a paper name; anything unknown or empty is White, the default. */
export function paperTone(paper) {
  return PAPER_TONE[String(paper || '').trim().toLowerCase()] || 'light';
}

// A tier from rank points (a finite number, 0 or more) or from a tier's name ('form', 'Form').
// Anything else, null and NaN and a negative number and a numeric string included, is no tier.
function tierOf(v) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return null;
    let t = null;
    for (const x of MEMBER_TIERS) if (v >= x.min) t = x;
    return t;
  }
  if (typeof v === 'string') {
    const k = v.trim().toLowerCase();
    return MEMBER_TIERS.find((x) => x.key === k) || null;
  }
  return null;
}

/**
 * A client's tier from their rank points or a tier's name: { key, label, min, color, title },
 * where `color` is the tier's own on every paper and `title` the tier in words ("Form tier").
 * null when the tier is unknown, so the caller keeps its plain ink rather than claim Raw.
 */
export function clientTier(pointsOrTier) {
  const t = tierOf(pointsOrTier);
  return t ? { key: t.key, label: t.label, min: t.min, color: t.color, title: t.label + ' tier' } : null;
}

/**
 * The inline custom property for dash.css's `.sh-tier-mark` (`--tier-mark`, the tier's colour),
 * or null for an unknown tier. The mark also takes `data-tier`, which is how dash.css rings it on
 * a paper where the colour alone would not keep 3:1.
 */
export function clientTierVars(pointsOrTier) {
  const t = tierOf(pointsOrTier);
  return t ? { '--tier-mark': t.color } : null;
}

// ── Calendar kinds ──────────────────────────────────────────────────────────────────────────
// A session is drawn in its client's tier colour; the other kinds have their own, and every
// block also says its kind in words. Check-ins azure, consults gold, time off hatched in a
// neutral (cockpit). The azure is the paper's own sky; the gold one step deeper than --sh-gold,
// which reads 3.8:1 on Bone's ground. ⚠ Consult's dark gold is Tempo's colour and the azure
// sits near Peak's: the kind's label, never the colour, tells a consult from a Tempo session.
export const CALENDAR_KINDS = Object.freeze({
  session: Object.freeze({ key: 'session', label: 'Session', fromClient: true }),
  checkin: Object.freeze({ key: 'checkin', label: 'Check-in', light: '#1b5f8a', dark: '#7ed4ff' }),
  consult: Object.freeze({ key: 'consult', label: 'Consult', light: '#79570b', dark: '#d8a23a' }),
  timeoff: Object.freeze({ key: 'timeoff', label: 'Time off', light: '#535e5b', dark: '#aaa49c', hatch: true }),
});

/**
 * A calendar block's colour: { key, label, light, dark, color, hatch }. A session takes its
 * client's tier colour (`clientTier`: rank points or a tier's name), the same on every paper,
 * with `tier` and `title` beside it; null when that tier is unknown. An unknown kind is null.
 */
export function calendarKindColor(kind, paper, clientTierOrPoints) {
  const k = CALENDAR_KINDS[kind];
  if (!k) return null;
  if (k.fromClient) {
    const t = clientTier(clientTierOrPoints);
    return t ? { key: k.key, label: k.label, light: t.color, dark: t.color, color: t.color, tier: t.key, title: t.title, hatch: false } : null;
  }
  return { key: k.key, label: k.label, light: k.light, dark: k.dark, color: paperTone(paper) === 'dark' ? k.dark : k.light, hatch: !!k.hatch };
}

// ── Program types ───────────────────────────────────────────────────────────────────────────
// The cockpit's plan types, each with its own colour: Cut tangerine, Maintain mint, Build
// violet, Race azure, Intake slate. These are a plan's TYPE, not a status, and they appear on
// plan covers and calendar spans, never beside a client's colour as the only cue.
export const PROGRAM_TYPES = Object.freeze({
  cut: Object.freeze({ key: 'cut', label: 'Cut', hue: 'tangerine', light: '#964702', dark: '#f99e65' }),
  maintain: Object.freeze({ key: 'maintain', label: 'Maintain', hue: 'mint', light: '#1a6650', dark: '#79dbb2' }),
  build: Object.freeze({ key: 'build', label: 'Build', hue: 'violet', light: '#5b3cc0', dark: '#ac90f8' }),
  race: Object.freeze({ key: 'race', label: 'Race', hue: 'azure', light: '#1b5f8a', dark: '#7ed4ff' }),
  intake: Object.freeze({ key: 'intake', label: 'Intake', hue: 'slate', light: '#4f5f71', dark: '#b0c0d1' }),
});

/** A program type's colour: { key, label, hue, light, dark, color }, or null for an unknown type. */
export function programTypeColor(type, paper) {
  const t = PROGRAM_TYPES[String(type || '').trim().toLowerCase()];
  return t ? { ...t, color: paperTone(paper) === 'dark' ? t.dark : t.light } : null;
}
