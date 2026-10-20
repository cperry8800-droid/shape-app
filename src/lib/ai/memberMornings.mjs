// Nora reads the mornings (docs/REVIEW-2026-10-19-morning-checkin.md §3.9, rulings 17 and 18): the
// member's OWN Morning check-in in words. `readMornings` is the get_mornings tool (today, the last 7
// and 30 days per check as Your mornings says them, readiness's average, What we've noticed) and
// `readMorningFacts` is today's morning for the facts block every member turn carries.
//
// Plain ESM with the supabase client injected, as memberReads.mjs is, so node:test drives the exact
// logic the chat route runs against a table-driven fake.
//
// ⚠ THE CALLER'S OWN ROWS, ON THE CALLER'S OWN CLIENT. A coach's RLS client can read a subscriber's
// daily_health_snapshot rows (providers_read_subscriber_snapshots), so a reader that took an id
// would hand a coach a client's raw answers and readiness. Every query here filters on `uid`, and the
// route passes reads.uid from a tool with no arguments; never a service-role client.
//
// ⚠ WORDS ONLY. A stored 1-10 value, or an average of them, never leaves this module: an answer
// becomes its word by mrWordIndex (the card's one rule, ruling 11) and goes out as the word. A prompt
// rule alone does not stop a model quoting a figure it was handed. The numbers that do go out are
// readiness (0-100, its own scale), hours as "7h 10", and counts.
//
// ⚠ ONE NUMBER WITH HOME AND YOUR MORNINGS. The series is built from the rows by the progress route's
// own rules (src/app/api/client/progress/route.ts), readiness is morningReadinessForDay with the
// card's usual night, and the patterns are morningPatternsFor: the modules the card and the page run.
//
// ⚠ COPIES OF THE PAGE'S AND THE CARD'S TEXT RULES, NOT IMPORTS: BSCheckinCard.jsx and
// BSYourMornings.jsx import React and read window, so a route can't import them. mmMostly,
// mmTodayRead, mmTodayReadText, mmValues, mmHeadline, mmDirection, mmWhoSees and mmHM are their
// bsCiMostly, bsCiTodayRead, bsCiTodayReadText, bsMorningsValues, bsMorningsHeadline,
// bsMorningsDirection, bsCiWhoSees and bsCiHM, held equal to the real modules by
// tests/member-mornings.test.mjs, as the English words are held to the en catalog.
//
// ⚠ ENGLISH, THE en CATALOG'S WORDS. Nora answers in the app's language and says the word in it
// herself, so her word can differ from the card's in another language (§7, still open).
//
// ⚠ HUNGER ONLY WITH A NUTRITIONIST (ruling 6), by the plan route's rule: an open subscription with
// provider_role 'nutritionist'. A read that fails hides it, as Your mornings hides it.
//
// ⚠ THE MEMBER'S LOCAL DAY. Today is dayIn(now, zone), and the route passes the device's zone, the
// one the check-in row is keyed to. Nothing dated after today is read.
//
// ⚠ COACHES GET NOTHING FROM HERE (ruling 17). Readiness and the patterns are only the member's
// (ruling 18): no coach tool imports this module.

import { dayIn, validZone } from './noraContext.mjs';
// The server twin of the app's bsDailyCheckinOn: absent is on, only false or 'Off' is off.
import { dailyCheckinOn } from './notifications.mjs';
// The coach↔client relationship the plan route reads (active, trialing, past_due).
import { OPEN_SUB_STATUSES } from '../coach-trajectory.mjs';
import { mrWordIndex, morningReadinessForDay } from '../../../mobile-app/src/services/morningReadiness.mjs';
import { mpIndex, mpDay, mpDays, mpShift, mpUsualNight, mpShortNight, morningPatternsFor } from '../../../mobile-app/src/services/morningPatterns.mjs';

// The card asks from 4 a.m. local (BS_CI_ASK_FROM_HOUR): before it, last night has not been slept.
export const MM_ASK_FROM_HOUR = 4;
// get_mornings reads 90 days: the patterns' 60 and the 30-day window's 30 before it, with the 14
// nights before each day for its usual night and readiness's 30-day baseline. The facts read 45:
// today, its 14 nights and its baseline.
export const MM_READ_DAYS = 90;
export const MM_FACT_DAYS = 45;
// Your mornings' BS_MORNINGS_MIN, BS_MORNINGS_SAME_POINTS and BS_MORNINGS_SAME_MINUTES: a headline or
// a direction needs 3 answered days, and a move under half a word (1 point on the stored scale) or
// under 20 minutes a night is "About the same".
const MM_MIN = 3;
const MM_SAME_POINTS = 1;
const MM_SAME_MINUTES = 20;
const MM_KINDS = ['sleep', 'energy', 'rested', 'hunger'];
const MM_COLUMNS = 'snapshot_date, energy, hunger, sleep_hours, sleep_quality, sleep_skipped, sources, recovery_score, hrv_ms, resting_hr';

// ── The words: the en catalog's (home.json checkin.e0-r4, mornings.band*) ──────────────────────

export const MM_WORDS = Object.freeze({
  energy: Object.freeze(['Drained', 'Low', 'OK', 'Good', 'Great']),
  hunger: Object.freeze(['Not hungry', 'A little', 'Normal', 'Hungry', 'Starving']),
  rested: Object.freeze(['Wrecked', 'Tired', 'OK', 'Rested', 'Fresh']),
});
export const MM_BANDS = Object.freeze({ ready: 'Ready', steady: 'Steady', easy: 'Take it easy', low: 'Run down' });
// What a readiness score was built from (home:mornings.fromEnergy … fromWatchReadings).
export const MM_BUILT_FROM = Object.freeze({ energy: 'your energy', sleep: 'your sleep', rested: 'how you woke up', watch: "your watch's readings" });
// Today's read (home:checkin.read*), the card's sentence for the morning's answers.
export const MM_READ_TEXT = Object.freeze({
  shortLow: 'Short night, low morning. Keep training easy and aim for bed earlier.',
  fullLowCoach: 'Low after a full night. If it keeps happening, tell your coach.',
  fullLow: 'Low after a full night. If it keeps happening, take it easy and keep an eye on it.',
  low: 'A low morning. Keep training easy today.',
  shortOk: 'Short night, but you feel fine. Go by how the warm-up feels.',
  ready: "Ready for today's plan.",
});
// Who sees this (§3.4, ruling 18; home:checkin.whoBoth … whoYou): coaches see the answers, and
// readiness and the patterns are only the member's.
export const MM_WHO = Object.freeze({
  both: 'Your trainer and nutritionist see your answers.',
  trainer: 'Your trainer sees your answers.',
  nutritionist: 'Your nutritionist sees your answers.',
  you: 'Only you see these.',
});
// Which way a check moved, said for what it is (home:mornings.dir*), lower-cased for a record.
const MM_DIR = {
  energy: { up: 'better', down: 'lower' },
  rested: { up: 'better', down: 'lower' },
  sleep: { up: 'longer', down: 'shorter' },
  hunger: { up: 'hungrier', down: 'less hungry' },
};
export const MM_NOTE = 'Words only. Readiness is a guide from their own answers, not a medical reading; coaches do not see readiness or these patterns.';

// ── The card's and the page's rules, copied (see the header) ────────────────────────────────────

// Hours as hours and minutes, in whole minutes first so 7.999h reads 8h: "7h 10", "8h". bsCiHM.
export function mmHM(h) {
  const n = h == null ? NaN : Number(h);
  if (!Number.isFinite(n)) return '—';
  const total = Math.round(n * 60);
  const hh = Math.floor(total / 60);
  const mm = String(total % 60).padStart(2, '0');
  return total % 60 ? `${hh}h ${mm}` : `${hh}h`;
}

// The word (0..4) more than half of at least three answered values had, else null. bsCiMostly.
export function mmMostly(values) {
  const idx = (values || []).map(mrWordIndex).filter((i) => i != null);
  if (idx.length < MM_MIN) return null;
  const counts = [0, 0, 0, 0, 0];
  for (const i of idx) counts[i] += 1;
  const best = counts.indexOf(Math.max(...counts));
  return counts[best] * 2 > idx.length ? best : null;
}

// Today's read: 'shortLow' | 'fullLow' | 'low' | 'shortOk' | 'ready', null until energy is in.
// bsCiTodayRead.
export function mmTodayRead(today, usual) {
  if (!today) return null;
  const i = mrWordIndex(today.energy);
  if (i == null) return null;
  const short = mpShortNight(today.sleep, usual);
  if (i <= 1) return short == null ? 'low' : short ? 'shortLow' : 'fullLow';
  return short ? 'shortOk' : 'ready';
}

// The read's sentence; `coached`: a trainer or a nutritionist, who a low morning after a full night
// is told to tell. bsCiTodayReadText in English.
export function mmTodayReadText(key, coached) {
  if (key === 'fullLow') return coached ? MM_READ_TEXT.fullLowCoach : MM_READ_TEXT.fullLow;
  return key === 'shortLow' || key === 'low' || key === 'shortOk' || key === 'ready' ? MM_READ_TEXT[key] : null;
}

// A check's answered values over a window: hours over 0 for sleep, stored values with a word for the
// rest (an old value over 10 counts as 10, as its word does). bsMorningsValues.
export function mmValues(kind, days) {
  return (Array.isArray(days) ? days : [])
    .map((d) => Number(d != null && typeof d === 'object' ? d[kind] : d))
    .filter((n) => (kind === 'sleep' ? Number.isFinite(n) && n > 0 : mrWordIndex(n) != null))
    .map((n) => (kind === 'sleep' ? n : Math.min(10, n)));
}

// 'up' | 'down' | 'same' against the window before, or null with under 3 answers in either.
// bsMorningsDirection.
export function mmDirection(kind, cur, prev) {
  if (!MM_KINDS.includes(kind)) return null;
  const a = mmValues(kind, cur);
  const b = mmValues(kind, prev);
  if (a.length < MM_MIN || b.length < MM_MIN) return null;
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  if (kind === 'sleep') {
    const minutes = Math.round((mean(a) - mean(b)) * 60);
    return Math.abs(minutes) < MM_SAME_MINUTES ? 'same' : minutes > 0 ? 'up' : 'down';
  }
  const points = Math.round((mean(a) - mean(b)) * 1e6) / 1e6;
  return Math.abs(points) < MM_SAME_POINTS ? 'same' : points > 0 ? 'up' : 'down';
}

// A check's headline as the page's key and values. bsMorningsHeadline.
export function mmHeadline(kind, days) {
  if (!MM_KINDS.includes(kind)) return null;
  const list = Array.isArray(days) ? days : [];
  if (kind === 'sleep') {
    const nights = list.filter((d) => d && Number.isFinite(Number(d.sleep)) && Number(d.sleep) > 0);
    if (nights.length < MM_MIN) return { key: 'home:mornings.headMore', vars: { n: MM_MIN - nights.length } };
    const hours = nights.reduce((s, d) => s + Number(d.sleep), 0) / nights.length;
    const short = nights.filter((d) => mpShortNight(d.sleep, d.usual)).length;
    return { key: 'home:mornings.sleepHead', vars: { hours, short } };
  }
  const values = mmValues(kind, list);
  if (values.length < MM_MIN) return { key: 'home:mornings.headMore', vars: { n: MM_MIN - values.length } };
  const most = mmMostly(values);
  if (most != null) return { key: list.length > 7 ? 'home:mornings.headMostlyMonth' : 'home:mornings.headMostlyWeek', vars: { word: most } };
  const idx = values.map(mrWordIndex);
  return { key: 'home:mornings.headMixed', vars: { low: Math.min(...idx), high: Math.max(...idx) } };
}

// 'both' | 'trainer' | 'nutritionist' | 'you', or null while either role is unknown. bsCiWhoSees.
export function mmWhoSees(coaching) {
  if (!coaching || coaching.trainer == null || coaching.nutritionist == null) return null;
  if (coaching.trainer && coaching.nutritionist) return 'both';
  if (coaching.trainer) return 'trainer';
  if (coaching.nutritionist) return 'nutritionist';
  return 'you';
}

// ── The series, by the progress route's rules ──────────────────────────────────────────────────

// The rows as /api/client/progress sends them: { date, value } points per metric, oldest first, a
// null left out and a 0h night kept. sleepFromDevice is a night a watch wrote (sources.sleep_hours
// names a device, not 'manual'), sleepSkipped a night skipped on the day's row.
export function mmSeries(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r.snapshot_date === 'string')
    .slice().sort((a, b) => (a.snapshot_date < b.snapshot_date ? -1 : a.snapshot_date > b.snapshot_date ? 1 : 0));
  const col = (k) => list.filter((r) => r[k] != null).map((r) => ({ date: r.snapshot_date, value: Number(r[k]) }));
  return {
    energy: col('energy'),
    hunger: col('hunger'),
    sleep: col('sleep_hours'),
    sleepQuality: col('sleep_quality'),
    sleepFromDevice: list.filter((r) => {
      const by = r.sources && typeof r.sources === 'object' && typeof r.sources.sleep_hours === 'string' ? r.sources.sleep_hours : '';
      return r.sleep_hours != null && by !== '' && by !== 'manual';
    }).map((r) => ({ date: r.snapshot_date, value: 1 })),
    sleepSkipped: list.filter((r) => r.sleep_skipped === true).map((r) => ({ date: r.snapshot_date, value: 1 })),
    recovery: col('recovery_score'),
    hrv: col('hrv_ms'),
    restingHr: col('resting_hr'),
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────────

async function leg(promise) {
  try {
    const r = await promise;
    if (r && r.error) return { ok: false, data: null };
    return { ok: true, data: r ? r.data ?? null : null };
  } catch {
    return { ok: false, data: null };
  }
}

const snapshotRows = (sb, uid, from, to) => leg(sb.from('daily_health_snapshot').select(MM_COLUMNS)
  .eq('user_id', uid).gte('snapshot_date', from).lte('snapshot_date', to).order('snapshot_date', { ascending: true }));
const settingsRow = (sb, uid) => leg(sb.from('user_goals').select('data').eq('user_id', uid).eq('kind', 'client_settings').maybeSingle());

// The Check-ins setting: true or false by the app's rule (a missing row or key is on), null when the
// read failed.
function checkinsOnOf(settings) {
  if (!settings.ok) return null;
  const doc = settings.data && typeof settings.data === 'object' && settings.data.data && typeof settings.data.data === 'object' ? settings.data.data : null;
  return doc && 'dailyCheckin' in doc ? dailyCheckinOn(doc.dailyCheckin) : true;
}

// The hour at `now` in `zone` (UTC for a zone Intl doesn't know, as dayIn reads it).
function hourIn(now, zone) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: validZone(zone) || 'UTC', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now).find((x) => x.type === 'hour');
    const h = Number(p && p.value);
    return Number.isFinite(h) ? h % 24 : 0;
  } catch {
    return 0;
  }
}

const weekdayOf = (iso) => new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const wordOf = (kind, v) => { const i = mrWordIndex(v); return i == null ? null : MM_WORDS[kind][i]; };
const plural = (n, one, other) => `${n} ${n === 1 ? one : other}`;

// A day's night as the page's strip shows it: its hours (a watch's 0h included) and whether a watch
// wrote them, else a skip. Hours win over a skip.
function nightOf(d) {
  const h = d.sleep == null ? NaN : Number(d.sleep);
  if (Number.isFinite(h) && h >= 0) return { hours: mmHM(h), fromWatch: !!d.device };
  return d.skipped ? { skipped: true } : null;
}

// One morning in words: only the answers it has.
function dayWords(d, { hunger }) {
  const night = nightOf(d);
  const energy = wordOf('energy', d.energy);
  const wokeUp = wordOf('rested', d.rested);
  const h = hunger ? wordOf('hunger', d.hunger) : null;
  return { ...(energy ? { energy } : {}), ...(wokeUp ? { wokeUp } : {}), ...(night ? { night } : {}), ...(h ? { hunger: h } : {}) };
}

// The parts a score counted (morningReadiness's `parts`), named as Your mornings names them.
function builtFrom(r) {
  return [
    r.parts.energy != null ? MM_BUILT_FROM.energy : null,
    r.parts.sleep != null ? MM_BUILT_FROM.sleep : null,
    r.parts.rested != null ? MM_BUILT_FROM.rested : null,
    r.usesWatch ? MM_BUILT_FROM.watch : null,
  ].filter(Boolean);
}

// Today's morning: asked from 4 a.m., answered once its energy is in and its night has hours or a
// skip (the card's bsCiStep, the reminder's rule), and readiness as Home's done line shows it.
function todayRecord(ix, series, todayIso, hour, { hunger, coached, detail }) {
  const d = mpDay(ix, todayIso);
  const usual = mpUsualNight(ix, todayIso);
  const r = morningReadinessForDay(series, todayIso, { usualNight: usual });
  const read = r && detail ? mmTodayReadText(mmTodayRead(d, usual), coached) : null;
  return {
    date: todayIso,
    asked: hour >= MM_ASK_FROM_HOUR,
    answered: d.energy != null && (d.sleep != null || d.skipped),
    ...dayWords(d, { hunger }),
    ...(r ? { readiness: { score: r.score, band: MM_BANDS[r.band], ...(detail ? { builtFrom: builtFrom(r) } : {}) } } : {}),
    ...(read ? { read } : {}),
  };
}

// A check over a window, as Your mornings' section says it: the word most days had, or the range, or
// the average night and how many were short; too few answers; and the direction.
function checkRecord(kind, cur, prev) {
  const h = mmHeadline(kind, cur);
  const dir = mmDirection(kind, cur, prev);
  const out = { answered: mmValues(kind, cur).length };
  const W = MM_WORDS[kind];
  if (h.key === 'home:mornings.sleepHead') Object.assign(out, { avgNight: mmHM(Math.round(h.vars.hours * 12) / 12), shortNights: h.vars.short });
  else if (h.key === 'home:mornings.headMostlyWeek' || h.key === 'home:mornings.headMostlyMonth') out.mostDays = W[h.vars.word];
  else if (h.key === 'home:mornings.headMixed') out.range = [W[h.vars.low], W[h.vars.high]];
  else out.notEnough = true;
  if (dir) out.direction = dir === 'same' ? 'about the same' : MM_DIR[kind][dir];
  return out;
}

// The `n` days ending today against the `n` before them, and readiness's average over the mornings
// it scored (Your mornings' "Averaging {score} over {n} mornings").
function windowRecord(ix, series, todayIso, n, { hunger }) {
  const cur = mpDays(ix, todayIso, n);
  const prev = mpDays(ix, mpShift(todayIso, -n), n);
  const scored = cur.map((d) => morningReadinessForDay(series, d.iso, { usualNight: d.usual })).filter(Boolean);
  return {
    comparedWith: `the ${n} days before`,
    sleep: checkRecord('sleep', cur, prev),
    energy: checkRecord('energy', cur, prev),
    wokeUp: checkRecord('rested', cur, prev),
    ...(hunger ? { hunger: checkRecord('hunger', cur, prev) } : {}),
    readiness: { mornings: scored.length, ...(scored.length ? { average: Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) } : {}) },
  };
}

// What we've noticed, as the page says it: the lead, the counts, the follow-up and how many mornings.
export function mmPatternWords(p, { coached } = {}) {
  if (p && p.key === 'energyAfterShort') {
    return {
      says: p.dir === 'more' ? 'Low mornings come more often after a short night.' : 'Low mornings come less often after a short night.',
      counts: `Low or Drained after ${p.short.low} of ${plural(p.short.n, 'short night', 'short nights')}, and after ${p.full.low} of ${plural(p.full.n, 'full night', 'full nights')}.`,
      basedOn: `Based on ${plural(p.mornings, 'morning', 'mornings')}.`,
    };
  }
  if (p && p.key === 'tiredAfterFull') {
    return {
      says: 'You often wake up tired after a full night.',
      counts: `Tired or Wrecked after ${p.tired} of ${plural(p.n, 'full night', 'full nights')}.`,
      followUp: coached ? 'If it keeps happening, tell your coach.' : 'If it keeps happening, take it easy and keep an eye on it.',
      basedOn: `Based on ${plural(p.mornings, 'morning', 'mornings')}.`,
    };
  }
  return null;
}

/**
 * get_mornings: the member's own Morning check-in in words. { ok: false } when the snapshot read
 * fails; a failed coaching read hides hunger and says so (coachesUnavailable), a failed settings
 * read leaves checkinsOn null.
 * @param {any} sb
 * @param {string} uid
 * @param {{ now?: Date, zone?: string | null }} [opts] `zone`: the device's, the day the row is keyed to.
 */
export async function readMornings(sb, uid, { now = new Date(), zone } = {}) {
  const today = dayIn(now, zone);
  const [snap, subs, settings] = await Promise.all([
    snapshotRows(sb, uid, mpShift(today, -(MM_READ_DAYS - 1)), today),
    leg(sb.from('subscriptions').select('provider_role').eq('client_id', uid).in('status', OPEN_SUB_STATUSES)),
    settingsRow(sb, uid),
  ]);
  if (!snap.ok) return { ok: false };
  const series = mmSeries(snap.data);
  const ix = mpIndex(series);
  const roles = subs.ok ? (Array.isArray(subs.data) ? subs.data : []).map((r) => r && r.provider_role) : null;
  const coaching = roles ? { trainer: roles.includes('trainer'), nutritionist: roles.includes('nutritionist') } : { trainer: null, nutritionist: null };
  const hunger = coaching.nutritionist === true;
  const coached = coaching.trainer === true || coaching.nutritionist === true;
  const who = mmWhoSees(coaching);
  return {
    ok: true,
    today: todayRecord(ix, series, today, hourIn(now, zone), { hunger, coached, detail: true }),
    last7: windowRecord(ix, series, today, 7, { hunger }),
    last30: windowRecord(ix, series, today, 30, { hunger }),
    days: mpDays(ix, today, 7).map((d) => ({ date: d.iso, weekday: weekdayOf(d.iso), ...dayWords(d, { hunger }) })),
    patterns: morningPatternsFor(ix, today).map((p) => mmPatternWords(p, { coached })).filter(Boolean),
    hungerAsked: hunger,
    checkinsOn: checkinsOnOf(settings),
    ...(who ? { whoSees: MM_WHO[who] } : {}),
    ...(subs.ok ? {} : { coachesUnavailable: true }),
    note: MM_NOTE,
  };
}

/**
 * Today's morning for the facts block: { date, asked, answered, energy?, wokeUp?, night?,
 * readiness?: { score, band }, checkinsOn }, or null when the snapshot read fails.
 * @param {any} sb
 * @param {string} uid
 * @param {{ now?: Date, zone?: string | null }} [opts]
 */
export async function readMorningFacts(sb, uid, { now = new Date(), zone } = {}) {
  const today = dayIn(now, zone);
  const [snap, settings] = await Promise.all([
    snapshotRows(sb, uid, mpShift(today, -(MM_FACT_DAYS - 1)), today),
    settingsRow(sb, uid),
  ]);
  if (!snap.ok) return null;
  const series = mmSeries(snap.data);
  return { ...todayRecord(mpIndex(series), series, today, hourIn(now, zone), { hunger: false, coached: false, detail: false }), checkinsOn: checkinsOnOf(settings) };
}
