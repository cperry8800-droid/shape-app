// tests/member-mornings.test.mjs
//
// Nora reads the mornings (docs/REVIEW-2026-10-19-morning-checkin.md §3.9, rulings 17 and 18):
// src/lib/ai/memberMornings.mjs DRIVEN against a table-driven fake of the query builder, as it ships.
//
// What this holds:
//   • words only: no stored 1-10 value, no average of one, no "/10" in anything she is handed;
//   • the caller's own rows only (every query filters on the caller's id);
//   • hunger only with a nutritionist, and hidden when that read fails;
//   • the member's local day, never a row after it;
//   • ONE NUMBER WITH HOME AND YOUR MORNINGS: the series is the progress route's own (the real route
//     runs here on a stub client), readiness is morningReadinessForDay with the card's usual night,
//     the patterns are morningPatternsFor, and every sentence is what the real card and page say,
//     in the en catalog's words through the app's own ICU translator.
//
// The runtime is pinned to a zone with a clock change, so a day shifted through UTC would show.
process.env.TZ = 'America/New_York';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import * as MM from '../src/lib/ai/memberMornings.mjs';
import { morningReadinessForDay } from '../mobile-app/src/services/morningReadiness.mjs';
import { morningPatternsFor, mpShift, MP_SINCE } from '../mobile-app/src/services/morningPatterns.mjs';

const { readMornings, readMorningFacts, mmSeries, mmHM, mmMostly, mmTodayRead, mmTodayReadText, mmHeadline, mmDirection, mmWhoSees, mmPatternWords } = MM;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const React = require_('react');
const registry = new Map([['react', React], ['react-dom', require_('react-dom')]]);
const CARD = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCheckinCard.jsx'), { registry });
registry.set('./BSCheckinCard.jsx', CARD);
const PAGE = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSYourMornings.jsx'), { registry });

// The en catalog behind the app's own ICU translator, as tests/your-mornings.test.mjs mounts the page.
const EN = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/home.json'), 'utf8'));
const appRequire = createRequire(join(ROOT, 'mobile-app/package.json'));
const i18next = appRequire('i18next');
const ICU = appRequire('i18next-icu');
const i18n = i18next.createInstance();
await i18n.use(ICU.default || ICU).init({
  lng: 'en', fallbackLng: 'en', ns: ['home'], defaultNS: 'home', keySeparator: false,
  interpolation: { escapeValue: false }, resources: { en: { home: EN } },
});
// The modules' own translator: the catalog's string, or the defaultValue when it has none.
const tr = (key, opts) => { const v = i18n.t(key, opts); return v == null || v === key ? (opts?.defaultValue ?? key) : v; };
const WORDS = CARD.bsCiWords(tr);
const BAND = CARD.bsCiBandWords(tr);

// ── The progress route, as it ships, on a stub client (tests/progress-sleep-source.test.mjs) ──
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
let routeRows = [];
const stubClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
  from: (table) => {
    const rows = table === 'daily_health_snapshot' ? routeRows : [];
    const q = {
      select: () => q, eq: () => q, neq: () => q, in: () => q, gte: () => q, lte: () => q, lt: () => q, gt: () => q,
      order: () => q, limit: () => q, not: () => q, is: () => q, or: () => q, filter: () => q,
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return q;
  },
  rpc: async () => ({ data: null, error: { message: 'not applied' } }),
};
const lib = (f) => loadRealModule(join(ROOT, 'src/lib', f), { typescript: true });
const [time, setLoad, e1rm, recovery, localDay] = await Promise.all([lib('time.ts'), lib('set-load.ts'), lib('e1rm.ts'), lib('recovery-readiness.ts'), lib('local-day.ts')]);
const PROGRESS = await loadRealModule(join(ROOT, 'src/app/api/client/progress/route.ts'), {
  typescript: true,
  registry: new Map([
    ['next/server', nextServer], ['@/lib/time', time], ['@/lib/set-load', setLoad], ['@/lib/e1rm', e1rm],
    ['@/lib/local-day', localDay], ['@/lib/recovery-readiness', recovery],
    ['@/lib/require-membership', { requireMembership: async () => null }],
    ['@/lib/supabase/server', { createClient: async () => stubClient }],
    ['@/lib/request-auth', { clientForRequest: async () => stubClient, currentUser: async () => ({ id: 'u-1' }) }],
  ]),
});
// The series the app gets for these rows (the route reads newest first).
async function routeSeries(rows) {
  routeRows = rows.slice().sort((a, b) => (a.snapshot_date < b.snapshot_date ? 1 : -1));
  const body = await (await PROGRESS.GET(new Request(`https://shape.test/api/client/progress?date=${TODAY}`))).json();
  return body.series;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const U = 'member-1';
// 10 a.m. in New York on Sunday 20 December 2026: two months of mornings after MP_SINCE.
const NOW = new Date('2026-12-20T15:00:00Z');
const ZONE = 'America/New_York';
const TODAY = '2026-12-20';
const day = (k) => mpShift(TODAY, -k); // k days before today
const row = (k, fields) => ({ user_id: U, snapshot_date: day(k), ...fields });
const watch = { sleep_hours: 'oura' };

// The fake, with every query's equality filters recorded, so a test can say whose rows each read.
function db({ tables = {}, fail = [] } = {}) {
  const base = fakeSupabase({ tables, fail });
  const queries = [];
  return {
    queries,
    rpc: base.rpc,
    from(table) {
      const chain = base.from(table);
      const q = { table, eq: {}, gte: {}, lte: {} };
      queries.push(q);
      for (const op of ['eq', 'gte', 'lte']) {
        const f = chain[op];
        chain[op] = (col, v) => { q[op][col] = v; return f(col, v); };
      }
      return chain;
    },
  };
}
const subs = (...roles) => roles.map((provider_role, i) => ({ client_id: U, provider_id: i + 1, provider_role, status: 'active' }));
const settings = (data) => [{ user_id: U, kind: 'client_settings', data }];

// A seeded generator, so a failure names its seed.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 90 days of rows with gaps, 0h nights, skips (some with hours after), typed and watch nights, old
// 1-10 values that are no stored word, and watch readings.
function randomRows(seed, { days = 90 } = {}) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const out = [];
  for (let k = 0; k < days; k += 1) {
    if (r() < 0.12) continue;
    const f = {};
    if (r() < 0.8) f.energy = pick([2, 4, 6, 8, 10, 3, 7, 1]);
    if (r() < 0.6) f.sleep_quality = pick([2, 4, 6, 8, 10, 5]);
    if (r() < 0.4) f.hunger = pick([2, 4, 6, 8, 10, 9]);
    const n = r();
    if (n < 0.06) f.sleep_hours = 0;
    else if (n < 0.75) f.sleep_hours = Math.round((4 + r() * 6) * 12) / 12;
    if (f.sleep_hours != null && r() < 0.4) f.sources = { sleep_hours: pick(['oura', 'whoop', 'manual', 'apple_health']) };
    if (r() < 0.12) f.sleep_skipped = true;
    if (r() < 0.3) f.recovery_score = Math.round(30 + r() * 60);
    if (r() < 0.3) f.hrv_ms = Math.round(30 + r() * 50);
    if (r() < 0.3) f.resting_hr = Math.round(48 + r() * 20);
    out.push(row(k, f));
  }
  return out;
}

// ── What the real card and page say for a series, in the en catalog's words ───────────────────

const hm = (h) => CARD.bsCiHM(h, (hh, mm) => (mm == null ? tr('home:checkin.hOnly', { h: hh }) : tr('home:checkin.hm', { h: hh, m: mm })));
const KIND_WORDS = { energy: WORDS.E, rested: WORDS.R, hunger: WORDS.H };
const DIR = {
  energy: { up: 'home:mornings.dirBetter', down: 'home:mornings.dirLower' },
  rested: { up: 'home:mornings.dirBetter', down: 'home:mornings.dirLower' },
  sleep: { up: 'home:mornings.dirLonger', down: 'home:mornings.dirShorter' },
  hunger: { up: 'home:mornings.dirHungrier', down: 'home:mornings.dirLessHungry' },
};
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
function pageCheck(kind, cur, prev) {
  const h = PAGE.bsMorningsHeadline(kind, cur);
  const dir = PAGE.bsMorningsDirection(kind, cur, prev);
  const W = KIND_WORDS[kind];
  const values = cur.filter((d) => (kind === 'sleep' ? Number(d.sleep) > 0 : CARD.bsCiWordIndex(d[kind]) != null)).length;
  const out = { answered: values };
  if (h.key === 'home:mornings.sleepHead') Object.assign(out, { avgNight: hm(Math.round(h.vars.hours * 12) / 12), shortNights: h.vars.short });
  else if (h.key === 'home:mornings.headMostlyWeek' || h.key === 'home:mornings.headMostlyMonth') out.mostDays = W[h.vars.word];
  else if (h.key === 'home:mornings.headMixed') out.range = [W[h.vars.low], W[h.vars.high]];
  else out.notEnough = true;
  if (dir) out.direction = lowerFirst(tr(dir === 'same' ? 'home:mornings.dirSame' : DIR[kind][dir]));
  return out;
}
function pageWindow(series, n, hunger) {
  const cur = CARD.bsCiWindow(series, TODAY, n).map((d) => ({ ...d, usual: CARD.bsCiUsualNight(series, d.iso) }));
  const prev = CARD.bsCiWindow(series, CARD.bsCiShift(TODAY, -n), n);
  const scored = cur.map((d) => morningReadinessForDay(series, d.iso, { usualNight: d.usual })).filter(Boolean);
  return {
    comparedWith: `the ${n} days before`,
    sleep: pageCheck('sleep', cur, prev),
    energy: pageCheck('energy', cur, prev),
    wokeUp: pageCheck('rested', cur, prev),
    ...(hunger ? { hunger: pageCheck('hunger', cur, prev) } : {}),
    readiness: { mornings: scored.length, ...(scored.length ? { average: Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) } : {}) },
  };
}
// A day's words as the page's strip says them: the night's hours (a watch's marked), or Skipped.
function pageDay(d, hunger) {
  const w = (list, v) => { const i = CARD.bsCiWordIndex(v); return i == null ? null : list[i]; };
  const h = d.sleep == null ? NaN : Number(d.sleep);
  const night = Number.isFinite(h) && h >= 0 ? { hours: hm(h), fromWatch: CARD.bsCiWornNight(d) } : d.skipped ? { skipped: true } : null;
  return {
    ...(w(WORDS.E, d.energy) ? { energy: w(WORDS.E, d.energy) } : {}),
    ...(w(WORDS.R, d.rested) ? { wokeUp: w(WORDS.R, d.rested) } : {}),
    ...(night ? { night } : {}),
    ...(hunger && w(WORDS.H, d.hunger) ? { hunger: w(WORDS.H, d.hunger) } : {}),
  };
}
function pageBuiltFrom(r) {
  return [
    r.parts.energy != null ? tr('home:mornings.fromEnergy') : null,
    r.parts.sleep != null ? tr('home:mornings.fromSleep') : null,
    r.parts.rested != null ? tr('home:mornings.fromRested') : null,
    r.usesWatch ? tr('home:mornings.fromWatchReadings') : null,
  ].filter(Boolean);
}
// What we've noticed in the page's keys (BSYourMornings.jsx, part 3).
function pagePattern(p, coached) {
  if (p.key === 'energyAfterShort') {
    return {
      says: tr(p.dir === 'more' ? 'home:mornings.patternShortMore' : 'home:mornings.patternShortLess'),
      counts: tr('home:mornings.patternShortCounts', { low: WORDS.E[1], drained: WORDS.E[0], a: p.short.low, n: p.short.n, b: p.full.low, m: p.full.n }),
      basedOn: tr('home:mornings.patternBasedOn', { n: p.mornings }),
    };
  }
  return {
    says: tr('home:mornings.patternTired'),
    counts: tr('home:mornings.patternTiredCounts', { tired: WORDS.R[1], wrecked: WORDS.R[0], k: p.tired, n: p.n }),
    followUp: tr(coached ? 'home:mornings.patternTiredCoach' : 'home:mornings.patternTiredSelf'),
    basedOn: tr('home:mornings.patternBasedOn', { n: p.mornings }),
  };
}
// Everything get_mornings should say for these rows, from the card, the page and the route.
async function expected(rows, { trainer = false, nutritionist = false, checkinsOn = true, hour = 10 } = {}) {
  const series = await routeSeries(rows);
  const coached = trainer || nutritionist;
  const usual = CARD.bsCiUsualNight(series, TODAY);
  const d = { ...CARD.bsCiDay(series, TODAY), skipped: CARD.bsCiSkippedOn(series, TODAY) };
  const r = morningReadinessForDay(series, TODAY, { usualNight: usual });
  const read = r ? CARD.bsCiTodayReadText(tr, CARD.bsCiTodayRead(d, usual), coached) : null;
  const who = CARD.bsCiWhoSees({ trainer, nutritionist });
  const whoKey = { both: 'home:checkin.whoBoth', trainer: 'home:checkin.whoTrainer', nutritionist: 'home:checkin.whoNutritionist', you: 'home:checkin.whoYou' }[who];
  return {
    ok: true,
    today: {
      date: TODAY,
      asked: hour >= CARD.BS_CI_ASK_FROM_HOUR,
      answered: CARD.bsCiStep(d, d.skipped) === 'done',
      ...pageDay(d, nutritionist),
      ...(r ? { readiness: { score: r.score, band: BAND[r.band], builtFrom: pageBuiltFrom(r) } } : {}),
      ...(read ? { read } : {}),
    },
    last7: pageWindow(series, 7, nutritionist),
    last30: pageWindow(series, 30, nutritionist),
    days: CARD.bsCiWindow(series, TODAY, 7).map((x) => ({ date: x.iso, weekday: new Date(`${x.iso}T12:00`).toLocaleDateString('en-US', { weekday: 'long' }), ...pageDay(x, nutritionist) })),
    patterns: morningPatternsFor(series, TODAY).map((p) => pagePattern(p, coached)),
    hungerAsked: nutritionist,
    checkinsOn,
    whoSees: tr(whoKey),
    whose: MM.MM_WHOSE,
    note: MM.MM_NOTE,
  };
}
function tablesFor(rows, { trainer = false, nutritionist = false, doc } = {}) {
  return {
    daily_health_snapshot: rows,
    subscriptions: [...(trainer ? subs('trainer') : []), ...(nutritionist ? subs('nutritionist') : [])],
    user_goals: doc ? settings(doc) : [],
  };
}

// ⚠ WORDS ONLY. Numbers go out only as readiness (its own 0-100), its average, and counts; every
// word is one of the five per check or a band; nothing reads as a 1-10 figure. "after 6 of 10 full
// nights" is a count of nights, the pattern's own line (§3.6), so it is the one "of 10" allowed.
const NUMERIC_KEYS = new Set(['score', 'average', 'mornings', 'answered', 'shortNights']);
const SCALE = /\/\s?10\b|out of 10\b|of 10\b(?! (?:short|full) nights?\b)/;
function assertWordsOnly(out) {
  const all = new Set([...WORDS.E, ...WORDS.R, ...WORDS.H]);
  const walk = (v, path, key) => {
    if (typeof v === 'number') assert.ok(NUMERIC_KEYS.has(key), `${path} is the number ${v}`);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, k);
    else if (typeof v === 'string' && ['energy', 'wokeUp', 'hunger', 'mostDays', 'range'].includes(key)) assert.ok(all.has(v), `${path} is "${v}", not one of the words`);
  };
  walk(out, 'out', null);
  assert.doesNotMatch(JSON.stringify(out), SCALE);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('get_mornings says every check as the card and Your mornings say it, over a few hundred seeded series', async () => {
  for (let seed = 1; seed <= 240; seed += 1) {
    const trainer = seed % 3 === 0;
    const nutritionist = seed % 2 === 0;
    const rows = randomRows(seed);
    const out = await readMornings(db({ tables: tablesFor(rows, { trainer, nutritionist }) }), U, { now: NOW, zone: ZONE });
    assert.deepEqual(out, await expected(rows, { trainer, nutritionist }), `seed ${seed}`);
    assertWordsOnly(out);
  }
});

test('a morning in words: a watch night, how they woke up, readiness and what it was built from, and the read', async () => {
  const rows = [row(0, { energy: 8, sleep_quality: 8, sleep_hours: 7 + 10 / 60, sources: watch }), row(1, { energy: 6, sleep_hours: 7.5 }), row(2, { energy: 4, sleep_skipped: true })];
  const out = await readMornings(db({ tables: tablesFor(rows, { trainer: true }) }), U, { now: NOW, zone: ZONE });
  assert.equal(out.ok, true);
  assert.deepEqual(Object.keys(out.today), ['date', 'asked', 'answered', 'energy', 'wokeUp', 'night', 'readiness', 'read']);
  assert.equal(out.today.energy, 'Good');
  assert.equal(out.today.wokeUp, 'Rested');
  assert.deepEqual(out.today.night, { hours: '7h 10', fromWatch: true });
  assert.equal(out.today.answered, true);
  assert.deepEqual(out.today.readiness.builtFrom, ['your energy', 'your sleep', 'how you woke up']);
  assert.match(out.today.readiness.band, /^(Ready|Steady|Take it easy|Run down)$/);
  assert.equal(out.today.read, "Ready for today's plan.");
  // Yesterday typed, the day before skipped: the strip's words.
  assert.deepEqual(out.days.slice(-3).map((d) => d.night), [{ skipped: true }, { hours: '7h 30', fromWatch: false }, { hours: '7h 10', fromWatch: true }]);
  assert.deepEqual(out.days.slice(-3).map((d) => d.weekday), ['Friday', 'Saturday', 'Sunday']);
  assert.equal(out.whoSees, 'Your trainer sees your answers.');
  assert.equal(out.hungerAsked, false);
  assert.equal(out.checkinsOn, true);
  assert.equal(out.note, 'Words only. Readiness is a guide from their own answers, not a medical reading; coaches do not see readiness or these patterns.');
  for (const k of ['last7', 'last30']) assert.deepEqual(Object.keys(out[k]), ['comparedWith', 'sleep', 'energy', 'wokeUp', 'readiness'], k);
  assert.deepEqual(out.last7.sleep, { answered: 2, notEnough: true });
  assert.deepEqual(out.last7.energy, { answered: 3, range: ['Low', 'Good'] });
  assertWordsOnly(out);
});

test('a skip answers the night: hours win over it, and readiness is never told it was built from sleep it did not have', async () => {
  const skipped = await readMornings(db({ tables: tablesFor([row(0, { energy: 4, sleep_skipped: true })]) }), U, { now: NOW, zone: ZONE });
  assert.equal(skipped.today.answered, true);
  assert.deepEqual(skipped.today.night, { skipped: true });
  assert.deepEqual(skipped.today.readiness.builtFrom, ['your energy']);
  assert.equal(skipped.today.read, 'A low morning. Keep training easy today.');
  // A watch's sync after the skip: its hours are the night.
  const later = await readMornings(db({ tables: tablesFor([row(0, { energy: 4, sleep_skipped: true, sleep_hours: 5, sources: watch })]) }), U, { now: NOW, zone: ZONE });
  assert.deepEqual(later.today.night, { hours: '5h', fromWatch: true });
  assert.equal(later.today.read, 'Short night, low morning. Keep training easy and aim for bed earlier.');
  // Energy alone leaves the night open, so the morning is not answered (the card's rule).
  const open = await readMornings(db({ tables: tablesFor([row(0, { energy: 8 })]) }), U, { now: NOW, zone: ZONE });
  assert.equal(open.today.answered, false);
  assert.ok(!('night' in open.today));
  // A typed night and hours a check-in typed over a watch's: neither is the watch's.
  for (const sources of [null, {}, { sleep_hours: 'manual' }]) {
    const t = await readMornings(db({ tables: tablesFor([row(0, { energy: 8, sleep_hours: 8, sources })]) }), U, { now: NOW, zone: ZONE });
    assert.deepEqual(t.today.night, { hours: '8h', fromWatch: false }, JSON.stringify(sources));
  }
});

test('0h nights are left out of the average night, its short nights and the count, as Your mornings leaves them out', async () => {
  const rows = [0, 1, 2, 3, 4, 5, 6].map((k) => row(k, { energy: 8, sleep_hours: k % 2 ? 0 : 8, sources: k % 2 ? watch : null }));
  const out = await readMornings(db({ tables: tablesFor(rows) }), U, { now: NOW, zone: ZONE });
  assert.deepEqual(out.last7.sleep, { answered: 4, avgNight: '8h', shortNights: 0 });
  // The strip still shows the watch's 0h night as the page does: a night, the shortest there is.
  assert.deepEqual(out.days[5].night, { hours: '0h', fromWatch: true });
});

test('⚠ HUNGER ONLY WITH A NUTRITIONIST: a trainer-only member with hunger history hears none of it, nor one whose coaching read failed', async () => {
  const rows = [0, 1, 2, 3].map((k) => row(k, { energy: 8, hunger: 8, sleep_hours: 8 }));
  const hasHunger = (o) => JSON.stringify(o).includes('"hunger"');
  const nut = await readMornings(db({ tables: tablesFor(rows, { nutritionist: true }) }), U, { now: NOW, zone: ZONE });
  assert.equal(nut.hungerAsked, true);
  assert.equal(nut.today.hunger, 'Hungry');
  assert.deepEqual(nut.last7.hunger, { answered: 4, mostDays: 'Hungry' });
  assert.equal(nut.days[6].hunger, 'Hungry');
  assert.equal(nut.whoSees, 'Your nutritionist sees your answers.');
  const trainer = await readMornings(db({ tables: tablesFor(rows, { trainer: true }) }), U, { now: NOW, zone: ZONE });
  assert.equal(trainer.hungerAsked, false);
  assert.ok(!hasHunger(trainer), 'a trainer-only member hears no hunger');
  const failed = await readMornings(db({ tables: tablesFor(rows, { nutritionist: true }), fail: ['subscriptions'] }), U, { now: NOW, zone: ZONE });
  assert.equal(failed.hungerAsked, false);
  assert.ok(!hasHunger(failed), 'an unread nutritionist link asks nothing');
  assert.equal(failed.coachesUnavailable, true);
  assert.ok(!('whoSees' in failed), 'who sees it is unknown, never "only you"');
  // ...and the read says so, so a missing whoSees is never taken for "no coach" (review on part 3).
  assert.equal(failed.coachesNote, MM.MM_COACHES_UNREAD);
  assert.match(failed.coachesNote, /don't say who sees their answers, and don't say they have no coach/);
  assert.equal(failed.whose, MM.MM_WHOSE);
  assert.match(MM.MM_WHOSE, /never a client's/);
  // No coach at all: only they see it, and the read's follow-up keeps an eye on it.
  const none = await readMornings(db({ tables: tablesFor([row(0, { energy: 2, sleep_hours: 8 })]) }), U, { now: NOW, zone: ZONE });
  assert.equal(none.whoSees, 'Only you see these.');
  assert.equal(none.today.read, 'Low after a full night. If it keeps happening, take it easy and keep an eye on it.');
  const both = await readMornings(db({ tables: tablesFor([row(0, { energy: 2, sleep_hours: 8 })], { trainer: true, nutritionist: true }) }), U, { now: NOW, zone: ZONE });
  assert.equal(both.whoSees, 'Your trainer and nutritionist see your answers.');
  assert.equal(both.today.read, 'Low after a full night. If it keeps happening, tell your coach.');
});

test('What we\'ve noticed: the patterns morningPatternsFor finds, in the page\'s words, with the follow-up', async () => {
  // 60 mornings from today back: 12 short nights, 9 of them Low, and 24 full ones, 3 Low and 14 of
  // them waking Tired.
  const rows = [];
  for (let k = 0; k < 36; k += 1) {
    const short = k < 12;
    const low = short ? k < 9 : k < 15;
    rows.push(row(k, { energy: low ? 4 : 8, sleep_hours: short ? 5 : 8, sleep_quality: !short && k < 26 ? 4 : 8 }));
  }
  const series = await routeSeries(rows);
  const want = morningPatternsFor(series, TODAY);
  assert.deepEqual(want.map((p) => p.key), ['energyAfterShort', 'tiredAfterFull'], 'the fixture holds both');
  const self = await readMornings(db({ tables: tablesFor(rows) }), U, { now: NOW, zone: ZONE });
  assert.deepEqual(self.patterns, [
    { says: 'Low mornings come more often after a short night.', counts: 'Low or Drained after 9 of 12 short nights, and after 3 of 24 full nights.', basedOn: 'Based on 36 mornings.' },
    { says: 'You often wake up tired after a full night.', counts: 'Tired or Wrecked after 14 of 24 full nights.', followUp: 'If it keeps happening, take it easy and keep an eye on it.', basedOn: 'Based on 24 mornings.' },
  ]);
  const coached = await readMornings(db({ tables: tablesFor(rows, { trainer: true }) }), U, { now: NOW, zone: ZONE });
  assert.equal(coached.patterns[1].followUp, 'If it keeps happening, tell your coach.');
  assert.deepEqual(self.patterns, want.map((p) => pagePattern(p, false)));
  // Mornings before MP_SINCE never count (#2407): the same mornings, dated to end the day before it.
  const shift = Math.round((Date.parse(TODAY) - Date.parse(MP_SINCE)) / 864e5) + 1;
  const before = rows.map((r) => ({ ...r, snapshot_date: mpShift(r.snapshot_date, -shift) }));
  assert.ok(before.every((r) => r.snapshot_date < MP_SINCE));
  const early = await readMornings(db({ tables: tablesFor(before) }), U, { now: new Date(`${mpShift(MP_SINCE, -1)}T15:00:00Z`), zone: ZONE });
  assert.equal(early.last30.energy.answered, 30, 'the mornings are read');
  assert.deepEqual(early.patterns, [], 'and none of them counts');
  // The singular, which the house gate never reaches but the words still say right.
  assert.equal(mmPatternWords({ key: 'tiredAfterFull', tired: 1, n: 1, mornings: 1 }).counts, 'Tired or Wrecked after 1 of 1 full night.');
  assert.equal(mmPatternWords({ key: 'tiredAfterFull', tired: 1, n: 1, mornings: 1 }).basedOn, 'Based on 1 morning.');
  assert.equal(mmPatternWords({ key: 'other' }), null);
});

test('the day is the member\'s: bounded at their today, never a row after it, and asked from 4 a.m. there', async () => {
  // 10 p.m. on the 20th in New York is the 21st in UTC.
  const late = new Date('2026-12-21T03:00:00Z');
  const sb = db({ tables: tablesFor([row(0, { energy: 8, sleep_hours: 8 }), { user_id: U, snapshot_date: '2026-12-21', energy: 2, sleep_hours: 3 }]) });
  const out = await readMornings(sb, U, { now: late, zone: ZONE });
  assert.equal(out.today.date, '2026-12-20');
  assert.equal(out.today.energy, 'Good', "the UTC day's row is tomorrow's, never read");
  assert.equal(out.days[6].date, '2026-12-20');
  const snap = sb.queries.find((q) => q.table === 'daily_health_snapshot');
  assert.equal(snap.lte.snapshot_date, '2026-12-20');
  assert.equal(snap.gte.snapshot_date, mpShift('2026-12-20', -89), '90 days, today included');
  assert.equal(out.today.asked, true);
  // 3:30 a.m. in New York: last night has not been slept, so nothing is asked yet.
  const early = await readMornings(db({ tables: tablesFor([]) }), U, { now: new Date('2026-12-20T08:30:00Z'), zone: ZONE });
  assert.equal(early.today.asked, false);
  const four = await readMornings(db({ tables: tablesFor([]) }), U, { now: new Date('2026-12-20T09:00:00Z'), zone: ZONE });
  assert.equal(four.today.asked, true);
  // No zone, or one Intl doesn't know: UTC's day and hour.
  const utc = await readMornings(db({ tables: tablesFor([]) }), U, { now: late, zone: 'Mars/Base' });
  assert.equal(utc.today.date, '2026-12-21');
  assert.equal(utc.today.asked, false);
});

test('⚠ THE CALLER\'S OWN ROWS: every query filters on their id, and another member\'s rows never come back', async () => {
  const other = { user_id: 'other', snapshot_date: TODAY, energy: 2, sleep_hours: 3 };
  const tables = { ...tablesFor([row(0, { energy: 8, sleep_hours: 8 }), other], { nutritionist: true }) };
  tables.subscriptions.push({ client_id: 'other', provider_id: 9, provider_role: 'trainer', status: 'active' });
  tables.user_goals.push({ user_id: 'other', kind: 'client_settings', data: { dailyCheckin: 'Off' } });
  for (const read of [readMornings, readMorningFacts]) {
    const sb = db({ tables });
    const out = await read(sb, U, { now: NOW, zone: ZONE });
    assert.ok(sb.queries.length >= 2, read.name);
    for (const q of sb.queries) assert.ok(q.eq.user_id === U || q.eq.client_id === U, `${read.name}: ${q.table} filters on the caller`);
    assert.deepEqual(sb.queries.map((q) => q.table).sort(), (read === readMornings ? ['daily_health_snapshot', 'subscriptions', 'user_goals'] : ['daily_health_snapshot', 'user_goals']), read.name);
    const today = read === readMornings ? out.today : out;
    assert.equal(today.energy, 'Good', read.name);
    assert.equal(out.checkinsOn, true, read.name);
    if (read === readMornings) assert.equal(out.whoSees, 'Your nutritionist sees your answers.');
  }
  // Nothing here reaches for a service-role client.
  const src = stripComments(readFileSync(join(ROOT, 'src/lib/ai/memberMornings.mjs'), 'utf8'));
  assert.doesNotMatch(src, /createAdminClient|service[_-]?role|supabase\/admin/i);
});

test('an unreadable snapshot is ok:false, never "no mornings"; the Check-ins setting reads as the app reads it', async () => {
  assert.deepEqual(await readMornings(db({ fail: ['daily_health_snapshot'] }), U, { now: NOW, zone: ZONE }), { ok: false });
  assert.equal(await readMorningFacts(db({ fail: ['daily_health_snapshot'] }), U, { now: NOW, zone: ZONE }), null);
  const on = async (doc, fail = []) => (await readMornings(db({ tables: tablesFor([], { doc }), fail }), U, { now: NOW, zone: ZONE })).checkinsOn;
  assert.equal(await on(undefined), true, 'no settings row is on');
  assert.equal(await on({ units: 'Metric' }), true, 'a row without the key is on');
  assert.equal(await on({ dailyCheckin: 'On' }), true);
  assert.equal(await on({ dailyCheckin: true }), true);
  assert.equal(await on({ dailyCheckin: 'Off' }), false);
  assert.equal(await on({ dailyCheckin: false }), false);
  assert.equal(await on({ dailyCheckin: 'Off' }, ['user_goals']), null, 'a failed read is unknown, never on or off');
  // An empty history is honest: nothing answered, every check short of answers, no patterns.
  const empty = await readMornings(db({ tables: tablesFor([]) }), U, { now: NOW, zone: ZONE });
  assert.deepEqual(empty.today, { date: TODAY, asked: true, answered: false });
  assert.deepEqual(empty.last7.energy, { answered: 0, notEnough: true });
  assert.deepEqual(empty.last7.readiness, { mornings: 0 });
  assert.deepEqual(empty.patterns, []);
  assert.equal(empty.days.length, 7);
});

test('readMorningFacts: today only, light, in words: no read, no built-from, no hunger, 45 days read', async () => {
  const rows = [row(0, { energy: 10, sleep_quality: 2, hunger: 8, sleep_hours: 6.5, sources: watch, recovery_score: 70 }), ...[1, 2, 3, 4, 5].map((k) => row(k, { sleep_hours: 7.5, recovery_score: 60 }))];
  const sb = db({ tables: tablesFor(rows, { nutritionist: true }) });
  const f = await readMorningFacts(sb, U, { now: NOW, zone: ZONE });
  const full = await readMornings(db({ tables: tablesFor(rows, { nutritionist: true }) }), U, { now: NOW, zone: ZONE });
  assert.deepEqual(f, {
    date: TODAY, asked: true, answered: true, energy: 'Great', wokeUp: 'Wrecked', night: { hours: '6h 30', fromWatch: true },
    readiness: { score: full.today.readiness.score, band: full.today.readiness.band }, checkinsOn: true,
  });
  const snap = sb.queries.find((q) => q.table === 'daily_health_snapshot');
  assert.equal(snap.gte.snapshot_date, mpShift(TODAY, -44));
  assert.equal(snap.lte.snapshot_date, TODAY);
  assertWordsOnly(f);
});

test('⚠ READINESS IS HOME\'S NUMBER: morningReadinessForDay over the progress route\'s series with the card\'s usual night', async () => {
  for (let seed = 500; seed < 560; seed += 1) {
    const rows = randomRows(seed);
    const series = await routeSeries(rows);
    const out = await readMornings(db({ tables: tablesFor(rows) }), U, { now: NOW, zone: ZONE });
    const r = morningReadinessForDay(series, TODAY, { usualNight: CARD.bsCiUsualNight(series, TODAY) });
    assert.equal(out.today.readiness ? out.today.readiness.score : null, r ? r.score : null, `seed ${seed}`);
    // And the facts block says the same number.
    const f = await readMorningFacts(db({ tables: tablesFor(rows) }), U, { now: NOW, zone: ZONE });
    assert.deepEqual(f.readiness || null, r ? { score: r.score, band: BAND[r.band] } : null, `seed ${seed}`);
  }
});

test('the series is the progress route\'s own, key for key', async () => {
  for (let seed = 900; seed < 940; seed += 1) {
    const rows = randomRows(seed);
    const route = await routeSeries(rows);
    const mine = mmSeries(rows);
    for (const k of Object.keys(mine)) assert.deepEqual(mine[k], route[k], `seed ${seed}: ${k}`);
  }
});

test('the server\'s copies of the card\'s and the page\'s text rules equal the real ones', () => {
  const r = rng(77);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  for (let i = 0; i < 400; i += 1) {
    const n = pick([3, 5, 7, 8, 14, 30]);
    const mk = () => Array.from({ length: n }, (_, j) => ({
      iso: mpShift(TODAY, j - n + 1),
      energy: r() < 0.7 ? pick([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 0, -1]) : null,
      rested: r() < 0.6 ? pick([2, 4, 6, 8, 10, 7]) : null,
      hunger: r() < 0.5 ? pick([2, 4, 6, 8, 10]) : null,
      sleep: r() < 0.7 ? pick([0, 3.5, 5.75, 6, 6.5, 7, 7.25, 8, 9.9, 12]) : null,
      usual: pick([3, 6.5, 7, 7.5, 8, 9, 12, undefined]),
    }));
    const cur = mk();
    const prev = mk();
    for (const kind of ['sleep', 'energy', 'rested', 'hunger', 'steps']) {
      assert.deepEqual(mmHeadline(kind, cur), PAGE.bsMorningsHeadline(kind, cur), `headline ${kind} #${i}`);
      assert.equal(mmDirection(kind, cur, prev), PAGE.bsMorningsDirection(kind, cur, prev), `direction ${kind} #${i}`);
    }
    const values = cur.map((d) => d.energy);
    assert.equal(mmMostly(values), CARD.bsCiMostly(values), `mostly #${i}`);
    const today = cur[cur.length - 1];
    const usual = today.usual;
    assert.equal(mmTodayRead(today, usual), CARD.bsCiTodayRead(today, usual), `read #${i}`);
    const h = r() * 13;
    assert.equal(mmHM(h), CARD.bsCiHM(h), `hm ${h}`);
  }
  for (const key of ['shortLow', 'fullLow', 'low', 'shortOk', 'ready', 'nope', null]) {
    for (const coached of [true, false]) assert.equal(mmTodayReadText(key, coached), CARD.bsCiTodayReadText(tr, key, coached), `${key} ${coached}`);
  }
  for (const trainer of [true, false, null]) {
    for (const nutritionist of [true, false, null]) assert.equal(mmWhoSees({ trainer, nutritionist }), CARD.bsCiWhoSees({ trainer, nutritionist }));
  }
  assert.equal(mmWhoSees(null), CARD.bsCiWhoSees(null));
  assert.equal(mmHM(null), CARD.bsCiHM(null));
  assert.equal(mmHM(7.999), '8h');
});

test('the English words are the en catalog\'s, and so is every sentence Nora is handed', () => {
  assert.deepEqual(MM.MM_WORDS.energy, [0, 1, 2, 3, 4].map((i) => EN[`checkin.e${i}`]));
  assert.deepEqual(MM.MM_WORDS.hunger, [0, 1, 2, 3, 4].map((i) => EN[`checkin.h${i}`]));
  assert.deepEqual(MM.MM_WORDS.rested, [0, 1, 2, 3, 4].map((i) => EN[`checkin.r${i}`]));
  assert.deepEqual(MM.MM_BANDS, { ready: EN['mornings.bandReady'], steady: EN['mornings.bandSteady'], easy: EN['mornings.bandEasy'], low: EN['mornings.bandLow'] });
  assert.deepEqual(MM.MM_BUILT_FROM, { energy: EN['mornings.fromEnergy'], sleep: EN['mornings.fromSleep'], rested: EN['mornings.fromRested'], watch: EN['mornings.fromWatchReadings'] });
  assert.deepEqual(MM.MM_READ_TEXT, {
    shortLow: EN['checkin.readShortLow'], fullLowCoach: EN['checkin.readFullLowCoach'], fullLow: EN['checkin.readFullLow'],
    low: EN['checkin.readLow'], shortOk: EN['checkin.readShortOk'], ready: EN['checkin.readReady'],
  });
  // Who sees this, as §3.4 says it now (ruling 18): coaches see the answers.
  assert.deepEqual(MM.MM_WHO, { both: EN['checkin.whoBoth'], trainer: EN['checkin.whoTrainer'], nutritionist: EN['checkin.whoNutritionist'], you: EN['checkin.whoYou'] });
  assert.match(MM.MM_WHO.both, /see your answers\.$/);
  // Each pattern line against the page's keys through ICU, at both plurals' edges.
  for (const [a, n, b, m] of [[5, 9, 3, 21], [8, 8, 0, 8], [1, 1, 1, 1]]) {
    for (const dir of ['more', 'less']) {
      const p = { key: 'energyAfterShort', dir, short: { low: a, n }, full: { low: b, n: m }, mornings: n + m };
      assert.deepEqual(mmPatternWords(p), pagePattern(p, false));
    }
    for (const coached of [true, false]) {
      const p = { key: 'tiredAfterFull', tired: a, n, mornings: n };
      assert.deepEqual(mmPatternWords(p, { coached }), pagePattern(p, coached));
    }
  }
});

test('the module is the caller\'s rows in words: no "/10" in its source, and only pure imports', () => {
  const src = readFileSync(join(ROOT, 'src/lib/ai/memberMornings.mjs'), 'utf8');
  assert.doesNotMatch(src, /\/\s?10\b|of 10\b/, 'the module writes a 1-10 figure');
  const imports = [...src.matchAll(/^import [^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['../../../mobile-app/src/services/morningPatterns.mjs', '../../../mobile-app/src/services/morningReadiness.mjs', '../coach-trajectory.mjs', './noraContext.mjs', './notifications.mjs']);
  assert.doesNotMatch(stripComments(src), /\bwindow\b|document\.|fetch\(/);
});

test('⚠ COACHES GAIN NOTHING: no coach read imports the mornings, readiness or the patterns', () => {
  const coachToday = readFileSync(join(ROOT, 'src/lib/ai/coachToday.mjs'), 'utf8');
  assert.doesNotMatch(coachToday, /memberMornings|morningReadiness|morningPatterns/);
  const reads = readFileSync(join(ROOT, 'src/lib/ai/memberReads.mjs'), 'utf8');
  const snapshot = reads.slice(reads.indexOf('export async function readClientSnapshot'), reads.indexOf('// ─── account'));
  assert.ok(snapshot.length > 200, 'readClientSnapshot found');
  assert.doesNotMatch(snapshot, /readiness|morning|energy|sleep_quality/i);
  assert.doesNotMatch(reads, /memberMornings|morningReadiness|morningPatterns/);
  // The route offers get_mornings with the member reads, never among the coach tools.
  const route = readFileSync(join(ROOT, 'src/app/api/support/chat/route.ts'), 'utf8');
  const coachTools = route.slice(route.indexOf('const COACH_TOOLS = ['), route.indexOf('\n];', route.indexOf('const COACH_TOOLS = [')));
  assert.ok(coachTools.includes('get_client_snapshot'), 'COACH_TOOLS found');
  assert.doesNotMatch(coachTools, /get_mornings/);
  const memberTools = route.slice(route.indexOf('const MEMBER_READ_TOOLS = ['), route.indexOf('\n];', route.indexOf('const MEMBER_READ_TOOLS = [')));
  assert.match(memberTools, /name: 'get_mornings'[^\n]*parameters: NO_ARGS, strict: true \}/);
});
