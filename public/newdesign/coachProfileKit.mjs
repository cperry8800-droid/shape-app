// The website's coach profile in the app profile's design (coachProfileWeb.jsx): everything it reads
// that is not React. Loaded once per page as window.ShapeCoachKit (MemberProfile.html and the coach
// dashboards' Profile pages), and imported as-is by tests/web-coach-profile.test.mjs.
//
// What it shares with the app rather than copies: the studio kit, the coach's work (programs, workout
// videos, the studio's lit pieces, plate notes), the words for a coach (coachPronoun), the sample
// trainer and nutritionist pages, and the profile doc's own cleaners (profileCustom). Each of those is
// canonical in public/newdesign and the app imports it through mobile-app/src/services.
//
// What it has of its own:
//   · the coach's paper and accent as colours (bsCoachPalette). The app keeps these tables inside
//     makePalette in iosAppBroadsheet.jsx, a window-globals module the website cannot import, so they
//     are restated here and tests/web-coach-profile.test.mjs pins them to the app's, value for value;
//   · a coach's community posts as the cards the profile's tabs read (bsCoachCardFromRow): the app
//     builds those from its own post model (bsProfileCardFromPost), the website has the raw rows;
//   · the rows of one day on the Day tab (bsCoachDayRows).
export {
  STUDIO_KIT, STUDIO_WORDS, bsStudioSvg, bsStudioRoom, bsStudioSpot, bsStudioDrawOrder, bsStudioFrame, BS_STUDIO_W, BS_STUDIO_H,
} from './studioKit.mjs';
export { bsCoachPrograms, bsWorkoutVideos, bsStudioWork, bsWorkPaid, bsWorkPrice, bsPlateNoteDays, energySplit } from './coachWork.mjs';
export { bsCoachPronoun, bsCoachFirstName } from './coachPronoun.mjs';
export { bsTrainerDemo, bsTrainerSampleOf } from './trainerDemo.mjs';
export { bsNutritionistDemo, bsNutritionistSampleOf } from './nutritionistDemo.mjs';
export {
  bsProfileLook, bsProfileCover, bsProfileStudio, bsProfileKitchen, bsProfileAbout, bsProfilePrompts, bsProfileLinkable,
  bsProfileLinkHref, bsProfileLinkText, bsPromptLabel, bsProfileBizCard, BS_PROFILE_LINK_KEYS,
} from './profileCustom.mjs';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ── The coach's colours ──────────────────────────────────────────────────────────────────────
// The app's paper stocks and accents (iosAppBroadsheet.jsx makePalette), value for value.
export const BS_COACH_PAPERS = Object.freeze({
  light:     { paper: '#f5f0e6', paper2: '#ede6d6', paper3: '#e3dac4', ink: '#0f0e0c', inkRGB: '15,14,12',    light: true  },
  white:     { paper: '#ffffff', paper2: '#f4f4f5', paper3: '#e8e8ea', ink: '#0f0f10', inkRGB: '15,15,16',    light: true  },
  dark:      { paper: '#0f0e0c', paper2: '#181612', paper3: '#221d18', ink: '#f5f0e6', inkRGB: '245,240,230', light: false },
  teal:      { paper: '#063d34', paper2: '#0a4f43', paper3: '#106456', ink: '#f1ece0', inkRGB: '241,236,224', light: false },
  manila:    { paper: '#d9c089', paper2: '#cfb47a', paper3: '#c2a466', ink: '#221806', inkRGB: '34,24,6',     light: true  },
  blueprint: { paper: '#0a2a52', paper2: '#0f3461', paper3: '#163f72', ink: '#dbe7ff', inkRGB: '219,231,255', light: false },
  carbon:    { paper: '#000000', paper2: '#1c1f24', paper3: '#2a2e35', ink: '#c9cfd6', inkRGB: '201,207,214', light: false },
  steel:     { paper: '#c2c7cd', paper2: '#b4b9bf', paper3: '#a3a9b0', ink: '#15181c', inkRGB: '21,24,28',    light: true,  metallic: true },
  bone:      { paper: '#ece4d3', paper2: '#e2d8c2', paper3: '#d4c8ad', ink: '#1a160e', inkRGB: '26,22,14',    light: true  },
  oxblood:   { paper: '#3a1418', paper2: '#481a1f', paper3: '#5a2128', ink: '#f0dfd2', inkRGB: '240,223,210', light: false },
  sage:      { paper: '#d4d9c6', paper2: '#c8cdb6', paper3: '#b7bda3', ink: '#1b2015', inkRGB: '27,32,21',    light: true  },
  forest:    { paper: '#0f231a', paper2: '#163021', paper3: '#1e3d2a', ink: '#e3efe2', inkRGB: '227,239,226', light: false },
  slate:     { paper: '#212834', paper2: '#2b3340', paper3: '#36404e', ink: '#dce4ef', inkRGB: '220,228,239', light: false },
  plum:      { paper: '#251630', paper2: '#311e40', paper3: '#3e2752', ink: '#ebdff2', inkRGB: '235,223,242', light: false },
  rose:      { paper: '#ead9d7', paper2: '#e1cbc8', paper3: '#d4b8b4', ink: '#241014', inkRGB: '36,16,20',    light: true  },
  mist:      { paper: '#dde4e9', paper2: '#d1dae1', paper3: '#c1ccd5', ink: '#121a20', inkRGB: '18,26,32',    light: true  },
  cocoa:     { paper: '#241812', paper2: '#2e2018', paper3: '#3a2a20', ink: '#efe2d3', inkRGB: '239,226,211', light: false },
  midnight:  { paper: '#0e1226', paper2: '#151a33', paper3: '#1d2342', ink: '#e3e7f7', inkRGB: '227,231,247', light: false },
});
export const BS_COACH_ACCENTS = Object.freeze({
  blue:  { light: '#1c4ed8', dark: '#5b8df9' },
  amber: { light: '#c8881a', dark: '#e3a544' },
  rust:  { light: '#a8331b', dark: '#e06547' },
  green: { light: '#2f6b3a', dark: '#5fb16e' },
  teal:  { light: '#0a8f87', dark: '#34d6c5' },
  violet:{ light: '#6d3fc4', dark: '#a78bfa' },
  rose:  { light: '#b8285f', dark: '#f2749f' },
  white: { light: '#ffffff', dark: '#ffffff' },
  black: { light: '#000000', dark: '#000000' },
});
const rgbOf = (hex) => { const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lumOf = (rgb) => {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastOf = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/**
 * The page's colours from the coach's look (profile_custom.look, already through bsProfileLook):
 * their paper and accent, a nutritionist painted amber and a trainer teal until they pick (the app's
 * BSTrainerProfile defaults). { isLight, PAPER, PAPER2, PAPER3, PAPER_BG, INK, inkRGB, ACCENT, ON_ACCENT, RUST, GREEN }.
 */
export function bsCoachPalette(look, role = 'trainer') {
  const lk = isObj(look) ? look : {};
  const P = BS_COACH_PAPERS[lk.paper] || BS_COACH_PAPERS.dark;
  const isLight = P.light;
  const key = BS_COACH_ACCENTS[lk.accent] ? lk.accent : (role === 'nutritionist' ? 'amber' : 'teal');
  let ACCENT = BS_COACH_ACCENTS[key][isLight ? 'light' : 'dark'];
  // The mono accents (black and white) are one hex for both stocks; on a paper of the same tone they
  // flip to the readable side, as the app's do.
  const accRGB = rgbOf(ACCENT), paperRGB = rgbOf(P.paper);
  if (accRGB && paperRGB && contrastOf(accRGB, paperRGB) < 1.6) ACCENT = isLight ? '#000000' : '#ffffff';
  const PAPER_BG = P.metallic
    ? `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 24%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0.18) 100%), ${P.paper}`
    : P.paper;
  return {
    isLight, PAPER: P.paper, PAPER2: P.paper2, PAPER3: P.paper3, PAPER_BG, INK: P.ink, inkRGB: P.inkRGB,
    ACCENT, ON_ACCENT: bsOnColor(ACCENT),
    RUST: BS_COACH_ACCENTS.rust[isLight ? 'light' : 'dark'], GREEN: BS_COACH_ACCENTS.green[isLight ? 'light' : 'dark'],
  };
}
/** Text on a fill of this colour: near-black on a light fill, white on a dark one (the app's onColor). */
export function bsOnColor(hex) {
  const rgb = rgbOf(hex);
  return rgb && lumOf(rgb) > 0.36 ? '#0b0d0c' : '#ffffff';
}

// ── The words for a coach ────────────────────────────────────────────────────────────────────
/** "Her day" / "Work with him" / "Their kitchen", or by first name (the app's `words`). */
export function bsCoachWords(pron, first) {
  const name = String(first || '').trim() || 'Coach';
  const by = { her: ['Her day', 'Work with her', 'Her kitchen'], him: ['His day', 'Work with him', 'His kitchen'], them: ['Their day', 'Work with them', 'Their kitchen'] }[pron];
  const [day, work, kitchen] = by || [`${name}'s day`, `Work with ${name}`, `${name}'s kitchen`];
  return { day, work, kitchen };
}

// ── A coach's posts as the profile's cards ───────────────────────────────────────────────────
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const httpsUrl = (u) => (typeof u === 'string' && u.length <= 2048 && /^https:\/\/[^\s]+$/i.test(u) ? u : null);
// A post's media is user-supplied: only https (or a same-origin path) reaches an <img> or a link.
const safeMedia = (u) => { const s = String(u == null ? '' : u).trim(); if (!s) return null; if (/^\/[^/\\]/.test(s)) return s; return httpsUrl(s); };
const mn = (v) => { if (v === undefined || v === null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; };
const GENERIC_TITLE = /^(workout|photo|video|link|note|article|meal|milestone)$/i;
const RUNLIKE = /run|jog|ride|bike|cycl|cardio|walk|hike|row|swim/i;

/** "12m" · "3h" · "2d" · "5w" · "4mo" · "1y" since an ISO time, or '' (the living profile's lvRelTime). */
export function bsCoachAgo(iso, now = Date.now()) {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd';
  if (s < 86400 * 30) return Math.floor(s / 86400 / 7) + 'w';
  if (s < 86400 * 365) return Math.floor(s / 86400 / 30) + 'mo';
  return Math.floor(s / 86400 / 365) + 'y';
}

// The sets a session logged (the live logger's set logs) or a run's splits, as the replay steps.
function breakdownOf(m) {
  const sl = Array.isArray(m.setLogs) ? m.setLogs.filter((s) => isObj(s) && s.completed !== false).slice(0, 60) : [];
  if (sl.length) {
    const moves = [...new Set(sl.map((s) => clean(s.moveName, 60)).filter(Boolean))];
    const multi = moves.length > 1;
    const rows = sl.map((s) => {
      const load = clean(s.actualLoad || s.targetLoad, 24), reps = clean(s.actualReps || s.targetReps, 24);
      const val = load && reps ? `${load} × ${reps}` : (load || reps || '—');
      const set = Number.isFinite(Number(s.setNumber)) ? Number(s.setNumber) : null;
      const label = multi ? [clean(s.moveName, 60), set != null ? `Set ${set}` : ''].filter(Boolean).join(' · ') : (set != null ? `Set ${set}` : 'Set');
      const rpe = Number(s.rpe);
      return [label, val, Number.isFinite(rpe) && rpe > 0 ? `RPE ${rpe}` : ''];
    });
    return { label: multi ? 'Working sets' : `${moves[0] || 'Working'} · sets`, rows };
  }
  const splits = Array.isArray(m.splits) ? m.splits : (Array.isArray(m.laps) ? m.laps : []);
  if (splits.length) {
    return {
      label: 'Splits',
      rows: splits.slice(0, 14).filter(isObj).map((s, i) => [clean(s.label, 30) || `Split ${i + 1}`, clean(s.pace || s.time || s.value || s.split, 24) || '—', clean(s.note, 40) || (Number(s.hr) > 0 ? `${Math.round(Number(s.hr))} bpm` : '')]),
    };
  }
  return null;
}

/**
 * One community_posts row (id, title, note, activity_type, metrics, privacy, photo_url,
 * source_provider, created_at) as the card the profile reads:
 *   { key, postId, kind, typeLabel, title, body, ago, created_at, vis, photo, video, link, stats, breakdown, meal }
 * `kind` is meal | session | run | workout | photo | video | link | note | milestone. Null for a row
 * the profile does not show: a plain text post with nothing the composer marked (the app's rule,
 * bsProfileCardFromPost). Nothing is invented: a figure the row does not carry is left out.
 */
export function bsCoachCardFromRow(row, now = Date.now()) {
  if (!isObj(row)) return null;
  const m = isObj(row.metrics) ? row.metrics : {};
  const photo = safeMedia(row.photo_url);
  const video = httpsUrl(m.video_url);
  const link = isObj(m.link) && safeMedia(m.link.url) ? { url: safeMedia(m.link.url), title: clean(m.link.title, 80) } : null;
  const ws = Array.isArray(m.workoutStats) ? m.workoutStats.filter(isObj) : [];
  const at = String(row.activity_type || '').toLowerCase();
  const breakdown = breakdownOf(m);
  const isMeal = m.kind === 'meal';
  const isActivity = isMeal || m.kind === 'workout' || m.kind === 'milestone' || ws.length > 0 || !!row.source_provider || !!breakdown
    || !!(isObj(m.route) && Array.isArray(m.route.points) && m.route.points.length);
  if (!isActivity && !(m.kind || photo || video || link)) return null;
  const kind = isMeal ? 'meal'
    : m.kind === 'milestone' ? 'milestone'
      : isActivity ? (breakdown && breakdown.label !== 'Splits' ? 'session' : RUNLIKE.test(at) ? 'run' : 'workout')
        : video ? 'video' : (m.kind === 'link' || link) ? 'link' : photo ? 'photo' : 'note';
  const LABEL = { meal: 'Meal', milestone: 'Milestone', session: 'Workout', run: 'Run', workout: 'Workout', video: 'Video', link: 'Link', photo: 'Photo', note: 'Note' };
  const raw = clean(row.title, 120);
  const title = raw && !GENERIC_TITLE.test(raw) ? raw
    : isMeal ? 'Logged a meal' : kind === 'milestone' ? 'Career milestone' : kind === 'run' ? 'Logged a run' : isActivity ? 'Logged a workout' : LABEL[kind];
  const stats = ws.map((s) => [clean(s.label || s.k || s.key, 30), clean(s.value != null ? s.value : s.v, 30)]).filter((r) => r[0] && r[1]).slice(0, 3);
  return {
    key: row.id != null ? `post-${row.id}` : `post-${clean(row.created_at, 40)}`,
    postId: row.id != null ? String(row.id) : null,
    kind, typeLabel: LABEL[kind], title, body: clean(row.note, 1200),
    ago: bsCoachAgo(row.created_at, now), created_at: row.created_at || null,
    vis: String(row.privacy || '').toLowerCase(),
    photo, video, link, stats, breakdown,
    meal: isMeal ? { kcal: mn(m.kcal), p: mn(m.p), c: mn(m.c), f: mn(m.f), recipeId: typeof m.recipeId === 'string' ? clean(m.recipeId, 80) : '' } : null,
  };
}

// ── One day on the Day tab ───────────────────────────────────────────────────────────────────
/**
 * The rows of one local day: the open times (`open`, BookingSlots.buildSlots' { iso, ms } slots)
 * that start on it, and the busy time (`busy`, /api/availability's { start, end, kind }) that
 * overlaps it, said only as busy, by time. Local midnight to local midnight, so a clock-change day
 * keeps its own hours; today starts now, so time already over is not part of it.
 *   → [{ kind: 'open', at, slot } | { kind: 'busy'|'away', at, end }]
 */
export function bsCoachDayRows({ open = [], busy = [], day, now = Date.now() }) {
  const d = day instanceof Date ? day : new Date(day);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const rows = [];
  for (const s of (Array.isArray(open) ? open : [])) {
    const t = Number.isFinite(s && s.ms) ? s.ms : Date.parse(s && s.iso);
    if (Number.isFinite(t) && t >= dayStart && t < dayEnd && t > now) rows.push({ kind: 'open', at: t, slot: s });
  }
  for (const b of (Array.isArray(busy) ? busy : [])) {
    const s = Date.parse(b && b.start), e = Date.parse(b && b.end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    if (!(e > dayStart && s < dayEnd) || e <= now) continue;
    rows.push({ kind: b.kind === 'time_off' ? 'away' : 'busy', at: Math.max(s, dayStart), end: Math.min(e, dayEnd) });
  }
  return rows.sort((a, b) => a.at - b.at);
}
