import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsLaunchRoute, bsDailyStamp, bsAfterBeat,
  bsWireDirective, bsWireLines, BS_LEVER_HEADS,
  bsWireTraining, bsWireCoachNote, bsWireNutrition,
} from '../mobile-app/src/services/dailyWire.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

// ── bsLaunchRoute — the warm-relaunch decision ─────────────────────────────
test('launchRoute: same uid + same day + cached member → app', () => {
  assert.equal(bsLaunchRoute({ stamp: 'u1:2026-07-10', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'app');
});
test('launchRoute: different day → beat', () => {
  assert.equal(bsLaunchRoute({ stamp: 'u1:2026-07-09', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
});
test('launchRoute: different uid → beat (no cross-account skip)', () => {
  assert.equal(bsLaunchRoute({ stamp: 'u2:2026-07-10', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
});
test('launchRoute: no membership cache → beat', () => {
  assert.equal(bsLaunchRoute({ stamp: 'u1:2026-07-10', uid: 'u1', todayLocal: '2026-07-10', memberCached: false }), 'beat');
});
test('launchRoute: no stamp / malformed stamp → beat', () => {
  assert.equal(bsLaunchRoute({ stamp: undefined, uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
  assert.equal(bsLaunchRoute({ stamp: 'no-separator', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
  assert.equal(bsLaunchRoute({ stamp: ':2026-07-10', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
  assert.equal(bsLaunchRoute({ stamp: 'u1:', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
});
test('launchRoute: missing uid or day → beat', () => {
  assert.equal(bsLaunchRoute({ stamp: 'u1:2026-07-10', uid: null, todayLocal: '2026-07-10', memberCached: true }), 'beat');
  assert.equal(bsLaunchRoute({ stamp: 'u1:2026-07-10', uid: 'u1', todayLocal: null, memberCached: true }), 'beat');
});
test('launchRoute: no args → beat (safe default)', () => {
  assert.equal(bsLaunchRoute(), 'beat');
});
test('dailyStamp: builds "<uid>:<day>" and round-trips through launchRoute', () => {
  const s = bsDailyStamp('abc', '2026-07-10');
  assert.equal(s, 'abc:2026-07-10');
  assert.equal(bsLaunchRoute({ stamp: s, uid: 'abc', todayLocal: '2026-07-10', memberCached: true }), 'app');
});

// ── bsAfterBeat — post-beat routing ────────────────────────────────────────
test('afterBeat: no locale → language picker regardless of membership', () => {
  assert.equal(bsAfterBeat({ allowed: true, hasLocale: false }), 'lang');
  assert.equal(bsAfterBeat({ allowed: false, hasLocale: false }), 'lang');
});
test('afterBeat: locale + allowed → daily; locale + not allowed → gate', () => {
  assert.equal(bsAfterBeat({ allowed: true, hasLocale: true }), 'daily');
  assert.equal(bsAfterBeat({ allowed: false, hasLocale: true }), 'gate');
});

// ── bsWireDirective — mirror of Home's gate ────────────────────────────────
test('wireDirective: real lever + action + verdict → head + reason', () => {
  const d = bsWireDirective({ lever: 'checkin', action: { label: 'x' }, verdict: 'Check-in due', reason: 'Check-in due' });
  assert.deepEqual(d, { head: BS_LEVER_HEADS.checkin, reason: 'Check-in due' });
});
test('wireDirective: null / no action / lever none / verdict — → null', () => {
  assert.equal(bsWireDirective(null), null);
  assert.equal(bsWireDirective({ lever: 'checkin', verdict: 'x' }), null); // no action
  assert.equal(bsWireDirective({ lever: 'none', action: { label: 'x' }, verdict: 'x' }), null);
  assert.equal(bsWireDirective({ lever: 'checkin', action: { label: 'x' }, verdict: '—' }), null);
});
test('wireDirective: lever Home does not lead with (sleep / contact) → null', () => {
  assert.equal(bsWireDirective({ lever: 'sleep', action: { label: 'x' }, verdict: 'Sleep is the lever', reason: 'r' }), null);
  assert.equal(bsWireDirective({ lever: 'contact', action: { label: 'x' }, verdict: 'Reconnect', reason: 'r' }), null);
});

// ── bsWireLines — signed-out sentinel ──────────────────────────────────────
test('wireLines: null digest → null (signed-out sentinel)', () => {
  assert.equal(bsWireLines(null, null), null);
});
test('wireLines: signedIn !== true → null (never a member briefing)', () => {
  assert.equal(bsWireLines({ signedIn: false, name: 'Quinn' }, null), null);
  assert.equal(bsWireLines({ name: 'Quinn' }, null), null);
});

// ── bsWireLines — full member day ──────────────────────────────────────────
const FULL = {
  signedIn: true, name: 'Quinn',
  training: { hasWorkout: true, title: 'Upper Pull', time: '17:45', durationMin: 52, moveCount: 6, coach: 'Jordan' },
  score: { score: 1284, tier: 'Tempo', delta: 15 },
  nutrition: { cal: 1820, calTarget: 2100, protein: 96, proteinTarget: 140 },
  streak: 6,
  coach: { who: 'Jordan', text: 'Leave two in the tank on the last set.', at: null },
};

test('wireLines: full day assembles session/directive/numbers/coach + END closer', () => {
  const dir = { lever: 'checkin', action: { label: 'x' }, verdict: 'Check-in due', reason: 'Check-in due' };
  const lines = bsWireLines(FULL, dir);
  const texts = lines.map(l => l.text);
  // session leads (title has a short-enough head to fold in time; extras only if <=26)
  assert.ok(texts[0].startsWith('UPPER PULL 5:45 PM'));
  assert.ok(texts.some(t => t === 'WITH JORDAN'));
  // directive is teal-marked and reads head — reason (uppercased)
  const hot = lines.find(l => l.hot);
  assert.ok(hot && hot.text.includes('SEND YOUR WEEKLY CHECK-IN'));
  // numbers fragments present
  assert.ok(texts.some(t => t.includes('SCORE 1,284 UP 15')));
  assert.ok(texts.some(t => t.includes('PROTEIN 96 OF 140')));
  assert.ok(texts.some(t => t.includes('STREAK 6 DAYS')));
  // coach note
  assert.ok(texts.some(t => t.startsWith('JORDAN: LEAVE TWO IN THE TANK')));
  // session day closes with the explicit reply line, terminated END
  const last = lines[lines.length - 1];
  assert.equal(last.text, 'REPLY BY SHOWING UP');
  assert.equal(last.end, true);
  assert.equal(last.sep, false);
  // every non-final line keeps STOP (sep true)
  for (let i = 0; i < lines.length - 1; i++) assert.equal(lines[i].sep, true);
});

test('wireLines: rest day (plan, no session) reads the honest rest line, no directive/coach', () => {
  const lines = bsWireLines({ signedIn: true, name: 'Q', training: { hasWorkout: false }, score: null, nutrition: null, streak: 0, coach: null }, null);
  const texts = lines.map(l => l.text);
  assert.deepEqual(texts, ['REST DAY ON THE BOOKS']);
  // the only line terminates END (no session-day closer)
  assert.equal(lines[0].end, true);
  assert.equal(lines[0].sep, false);
});

test('wireLines: no plan reads the two honest no-session lines', () => {
  const lines = bsWireLines({ signedIn: true, name: 'Q', training: null, score: null, nutrition: null, streak: 0, coach: null }, null);
  const texts = lines.map(l => l.text);
  assert.deepEqual(texts, ['NO SESSION ON THE WIRE', 'FIND YOUR COACH INSIDE']);
  assert.equal(lines[0].sep, true);
  assert.equal(lines[1].end, true);
});

test('wireLines: numbers fragments join one line — no fabrication when a leg is null', () => {
  // score present but delta 0 (no "UP"); protein without a target; no streak
  const lines = bsWireLines({ signedIn: true, name: 'Q', training: { hasWorkout: false }, score: { score: 900, delta: 0 }, nutrition: { protein: 80, proteinTarget: null }, streak: 0, coach: null }, null);
  const numLine = lines.map(l => l.text).find(t => t.includes('SCORE'));
  assert.equal(numLine, 'SCORE 900 · PROTEIN 80G');         // no "UP" on delta 0, targetless protein, no streak
  assert.ok(!lines.some(l => l.text.includes('STREAK')));   // omitted
});

test('wireLines: directive omitted when the engine has no real lever', () => {
  const lines = bsWireLines(FULL, { lever: 'none', verdict: '—' });
  assert.ok(!lines.some(l => l.hot));
});

test('wireLines: session without coach/time still assembles a clean head', () => {
  const lines = bsWireLines({ signedIn: true, name: 'Q', training: { hasWorkout: true, title: 'Zone 2 Run' }, score: null, nutrition: null, streak: 0, coach: null }, null);
  assert.equal(lines[0].text, 'ZONE 2 RUN');
  // no WITH line, session-day closer still appended
  assert.ok(lines.some(l => l.text === 'REPLY BY SHOWING UP'));
});

// ── LOCALIZATION ───────────────────────────────────────────────────────────
// The telegram body is the launch's most-read screen and it lives OUTSIDE the
// walked broadsheet directory, so the i18n surface inventory cannot see it: a
// refactor that drops the translator would leave every member reading their day
// in English while BSSplash still measured as fully covered. These pin the seam.

test('wireLines: every line routes through the translator when one is supplied', () => {
  const seen = [];
  const tr = (key, opts) => { seen.push(key); return 'XX:' + key; };
  const lines = bsWireLines(
    { signedIn: true, name: 'Q',
      training: { hasWorkout: false },
      score: { score: 1284, delta: 15 },
      nutrition: { protein: 96, proteinTarget: 140 },
      streak: 6,
      coach: { who: 'Jordan', text: 'Leave two in the tank' } },
    { lever: 'checkin', action: { label: 'x' }, verdict: 'Check-in due', reason: 'Check-in due' },
    { tr, locale: 'en' },
  );
  const texts = lines.map(l => l.text);
  // rest-day line, the numbers line and the coach note all came from the catalog
  assert.ok(texts.includes('XX:onboarding:wire.restDay'));
  assert.ok(texts.some(t => t.includes('XX:onboarding:wire.scoreUp')));
  assert.ok(texts.some(t => t.includes('XX:onboarding:wire.proteinOf')));
  assert.ok(texts.some(t => t.includes('XX:onboarding:wire.streak')));
  assert.ok(texts.some(t => t.startsWith('XX:onboarding:wire.coachNote')));
  // NOT one English literal survived on a translated run
  assert.ok(!texts.some(t => t.includes('REST DAY') || t.includes('PROTEIN 96')));
});

test('wireLines: the directive head reads the SAME key Home leads with', () => {
  // One catalog key for both surfaces, or the splash and the Home lead can
  // disagree about the day's move in every locale but English.
  const seen = [];
  const lines = bsWireLines(
    { signedIn: true, name: 'Q', training: { hasWorkout: false }, score: null, nutrition: null, streak: 0, coach: null },
    { lever: 'nutrition', action: { label: 'x' }, verdict: 'Log a meal', reason: null },
    { tr: (key) => { seen.push(key); return key === 'home:lead.nutrition.head' ? 'LOG A MEAL TODAY.' : 'x'; }, locale: 'en' },
  );
  assert.ok(seen.includes('home:lead.nutrition.head'));
  assert.ok(lines.some(l => l.hot && l.text === 'LOG A MEAL TODAY.'));
});

test('wireLines: a missing/throwing translator falls back to the shipped English', () => {
  const boom = () => { throw new Error('catalog unavailable'); };
  const lines = bsWireLines(FULL, null, { tr: boom, locale: 'en' });
  assert.ok(lines.some(l => l.text === 'REPLY BY SHOWING UP'));
  // an empty translation is treated as absent, never rendered as a blank line
  const empty = bsWireLines(FULL, null, { tr: () => '', locale: 'en' });
  assert.ok(empty.every(l => l.text && l.text.trim()));
});

test('wireLines: the clock follows the locale, not a baked-in AM/PM', () => {
  const at = (loc) => bsWireLines(
    { signedIn: true, name: 'Q', training: { hasWorkout: true, title: 'Row', time: '17:45' }, score: null, nutrition: null, streak: 0, coach: null },
    null, loc ? { locale: loc } : undefined,
  )[0].text;
  assert.ok(at(null).includes('5:45 PM'));   // no locale → the pinned ASCII form
  assert.ok(at('en-US').includes('5:45'));   // 12-hour locale keeps the meridiem
  assert.ok(at('de-DE').includes('17:45'));  // 24-hour locale never gets an English AM/PM
  assert.ok(!at('de-DE').includes('PM'));
});

// ── THE WIRING, not just the module ────────────────────────────────────────
// Every test above supplies its own translator, so they all pass with the real
// call site unwired — the "an unwired caller looks perfectly plausible" trap.
// These read the shipped source instead.
test('BSSplash actually hands bsWireLines the translator + locale', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx', 'utf8');
  assert.match(src, /bsWireLines\(dg, dg && dg\.directive, \{ tr, locale, reason: \(dir\) => bsCiLeadReason\(dir, tr\) \}\)/,
    'the telegram lost its translator, or says the engine\'s English reason instead of Home\'s');
  // and the translator it passes is genuinely the hook's, not a stray global:
  // a bare `useTr` identifier reads as a global to a static walk and throws
  // ReferenceError on the first frame of the cold open.
  assert.match(src, /import \{[^}]*\buseTr\b[^}]*\} from '\.\.\/i18n\/index\.js'/,
    'useTr is used in the launch shell but never imported');
  assert.match(src, /const \{ tr, locale \} = useTr\('onboarding'\)/,
    'BSSplash must resolve both tr and locale — the locale drives the clock convention');
  // The reason is Home's own helper, imported from the card, never a copy of its rule.
  const code = stripComments(src);
  assert.match(code, /^import \{ bsCiLeadReason \} from '\.\/BSCheckinCard\.jsx';$/m,
    'the splash calls bsCiLeadReason without importing it from the card');
  assert.equal(code.split('bsCiLeadReason(').length - 1, 1, 'the splash says the reason somewhere other than its one call');
  assert.doesNotMatch(code, /^(?:export )?function bsCiLeadReason\(/m, 'the splash carries its own copy of the lead reason');
});

// ── THE REASON, IN THE MEMBER'S WORDS (rulings 11 and 13) ──────────────────
// The engine's own reason is English. Home says its energy, hunger and sleep reads through the
// card's words (bsCiLeadReason), and the splash passes the same helper as opts.reason.
const VITALS_DAY = { signedIn: true, name: 'Q', training: { hasWorkout: false }, score: null, nutrition: null, streak: 0, coach: null };
const energyLow = (avg, reason = 'Your energy has been low on average this week — a lighter session still counts') => ({
  source: 'engine', lever: 'energy', verdict: 'Ease off', action: { kind: 'ease_load', label: 'Take today lighter' },
  reason, cited: ['energy_low'], evidence: { key: 'energy_low', avg, n: 4 },
});
const hotOf = (lines) => (lines.find((l) => l.hot) || {}).text;

test('wireLines: opts.reason says the reason, after the same head', () => {
  const dir = energyLow(3.2);
  const seen = [];
  const said = 'Your energy has been low on average this week. A lighter session still counts.';
  const lines = bsWireLines(VITALS_DAY, dir, { reason: (d) => { seen.push(d); return said; } });
  assert.equal(hotOf(lines), 'TAKE TODAY LIGHTER. — YOUR ENERGY HAS BEEN LOW ON AVERAGE THIS WEEK. A LIGHTER SESSION STILL COUNTS.');
  // It is handed the directive itself, once.
  assert.equal(seen.length, 1);
  assert.equal(seen[0], dir);
  // The head is the one it reads without a reason: only the words after the dash change.
  const bare = hotOf(bsWireLines(VITALS_DAY, dir));
  assert.equal(bare, 'TAKE TODAY LIGHTER. — YOUR ENERGY HAS BEEN LOW ON AVERAGE THIS WEEK — A LIGHTER SESSION STILL COUNTS');
  assert.equal(hotOf(lines).split(' — ')[0], bare.split(' — ')[0]);
  // Through a translator, the catalog's directive line gets the reason as its {reason}.
  const vars = [];
  const tr = (key, o) => { if (key === 'onboarding:wire.directive') vars.push(o); return o && o.defaultValue; };
  bsWireLines(VITALS_DAY, dir, { tr, locale: 'en', reason: () => said });
  assert.equal(vars.length, 1);
  assert.equal(vars[0].head, 'TAKE TODAY LIGHTER.');
  assert.equal(vars[0].reason, said.toUpperCase());
  // A directive with no reason of its own still takes the one opts.reason says.
  assert.equal(hotOf(bsWireLines(VITALS_DAY, energyLow(3.2, null), { reason: () => said })), 'TAKE TODAY LIGHTER. — ' + said.toUpperCase());
  // The directive gate is unchanged: no lead, no reason asked for.
  let asked = 0;
  assert.ok(!bsWireLines(VITALS_DAY, { lever: 'none', verdict: '—' }, { reason: () => { asked += 1; return 'x'; } }).some((l) => l.hot));
  assert.equal(asked, 0);
});

test('wireLines: a reason that is not a non-empty string, or throws, keeps the engine\'s', () => {
  const dir = energyLow(3.2);
  const engine = hotOf(bsWireLines(VITALS_DAY, dir));
  for (const r of [null, undefined, '', '   ', 42, {}, ['x'], true]) {
    assert.equal(hotOf(bsWireLines(VITALS_DAY, dir, { reason: () => r })), engine, `reason ${JSON.stringify(r)} replaced the engine's`);
  }
  assert.equal(hotOf(bsWireLines(VITALS_DAY, dir, { reason: () => { throw new Error('no catalog'); } })), engine);
  // Not a function: ignored.
  assert.equal(hotOf(bsWireLines(VITALS_DAY, dir, { reason: 'Say this' })), engine);
  // And with no reason anywhere the line is the head alone, as before.
  assert.equal(hotOf(bsWireLines(VITALS_DAY, energyLow(3.2, null), { reason: () => '' })), 'TAKE TODAY LIGHTER.');
  // A padded answer is said without its padding.
  assert.equal(hotOf(bsWireLines(VITALS_DAY, dir, { reason: () => '  Easy does it.  ' })), 'TAKE TODAY LIGHTER. — EASY DOES IT.');
});

test('wireLines: the reason is upper-cased in the locale, as every other line is', () => {
  const dir = energyLow(3.2);
  const said = 'Bu hafta enerjin ortalama olarak düşük.';
  const tr = hotOf(bsWireLines(VITALS_DAY, dir, { locale: 'tr', reason: () => said }));
  assert.ok(tr.endsWith(' — BU HAFTA ENERJİN ORTALAMA OLARAK DÜŞÜK.'), tr);
  // Without a locale it is the plain upper-casing (dotless I).
  assert.ok(hotOf(bsWireLines(VITALS_DAY, dir, { reason: () => said })).includes('ENERJIN'));
});

// The real helper, the real catalogs, and a translator bound to 'onboarding' as BSSplash's
// useTr('onboarding') is, so the card's 'home:' keys resolve the way they do on the splash.
test('the splash line through the real bsCiLeadReason: the card\'s words in the app\'s language, a coach\'s reason as written', async () => {
  const { createRequire } = await import('node:module');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const ROOT = path.resolve('.');
  const appRequire = createRequire(path.join(ROOT, 'mobile-app/package.json'));
  const React = appRequire('react');
  const CARD = await loadRealModule(path.join(ROOT, 'mobile-app/src/broadsheet/BSCheckinCard.jsx'), { registry: new Map([['react', React], ['react-dom', appRequire('react-dom')]]) });
  const i18next = appRequire('i18next');
  const ICU = appRequire('i18next-icu');
  const cat = (loc, ns) => JSON.parse(fs.readFileSync(path.join(ROOT, `mobile-app/src/i18n/catalogs/${loc}/${ns}.json`), 'utf8'));
  const resources = {};
  for (const loc of ['en', 'de', 'tr']) resources[loc] = { home: cat(loc, 'home'), onboarding: cat(loc, 'onboarding') };
  const i18n = i18next.createInstance();
  await i18n.use(ICU.default || ICU).init({ lng: 'en', fallbackLng: 'en', ns: ['common', 'onboarding', 'home'], defaultNS: 'common', keySeparator: false, interpolation: { escapeValue: false }, resources });

  // bsCiLower reads the app's Intl locale at call time, which the splash has.
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let intl = 'en';
  Object.defineProperty(globalThis, 'window', { value: { ShapeI18n: { intlLocale: () => intl } }, configurable: true, writable: true });
  try {
    const splash = (dir, locale) => {
      intl = locale;
      const tr = i18n.getFixedT(locale, 'onboarding');
      return hotOf(bsWireLines(VITALS_DAY, dir, { tr, locale, reason: (d) => CARD.bsCiLeadReason(d, tr) }));
    };
    const en = splash(energyLow(3.2), 'en');
    assert.equal(en, 'TAKE TODAY LIGHTER. — YOUR ENERGY HAS BEEN LOW ON AVERAGE THIS WEEK. A LIGHTER SESSION STILL COUNTS.');
    // In German the head and the reason are both the catalog's; nothing of the engine's English is left.
    const de = splash(energyLow(3.2), 'de');
    assert.equal(de, 'GEH ES HEUTE LOCKERER AN. — DEINE ENERGIE WAR DIESE WOCHE IM SCHNITT NIEDRIG. EINE LEICHTERE EINHEIT ZÄHLT AUCH.');
    assert.doesNotMatch(de, /YOUR ENERGY|LIGHTER SESSION/);
    // Turkish: the catalog's words, upper-cased with the dotted İ.
    assert.equal(splash(energyLow(3.2), 'tr'), 'BUGÜNÜ DAHA HAFİF GEÇİR. — BU HAFTA ENERJİN ORTALAMA OLARAK DÜŞÜK. DAHA HAFİF BİR SEANS DA SAYILIR.');
    // Hunger and sleep, the other two flags Home says in the card's words.
    const hunger = { source: 'engine', lever: 'hunger', verdict: 'Fuel up', action: { kind: 'log_meal', label: 'x' }, reason: 'Hunger has averaged 8.4/10 this week', cited: ['hunger_high'], evidence: { key: 'hunger_high', avg: 8.4, n: 4 } };
    assert.equal(splash(hunger, 'en'), "EAT A REAL MEAL TODAY. — YOU'VE BEEN STARVING BETWEEN MEALS ON AVERAGE THIS WEEK. THE PLAN MAY BE RUNNING LIGHT ON FUEL.");
    const sleep = { source: 'engine', lever: 'sleep', verdict: 'Sleep is the lever', action: { kind: 'log_sleep', label: 'x' }, reason: 'Sleep has averaged 5.5h this week', cited: ['sleep_low'], evidence: { key: 'sleep_low', avg: 5.5, n: 4 } };
    assert.equal(splash(sleep, 'en'), 'GET TO BED EARLIER TONIGHT. — SHORT ON SLEEP THIS WEEK: 5H 30 A NIGHT.');
    assert.equal(splash(sleep, 'de'), 'GEH HEUTE FRÜHER INS BETT. — WENIG SCHLAF DIESE WOCHE: 5 STD. 30 PRO NACHT.');
    // Ruling 11: never the 1-10 scale, a "/10" or "points".
    for (const s of [en, de, splash(hunger, 'de')]) assert.doesNotMatch(s, /\/\s?10|\bPOINTS\b|PUNKTE/);
    // Ruling 13: a coach's own reason is never reworded, only set in the wire's capitals.
    const coach = { source: 'coach', lever: 'energy', verdict: 'Coach says', action: { kind: 'ease_load', label: 'x' }, reason: 'Keep it easy, we push Friday', cited: ['coach override'], evidence: { key: 'energy_low', avg: 3.2, n: 4 } };
    assert.equal(splash(coach, 'de'), 'GEH ES HEUTE LOCKERER AN. — KEEP IT EASY, WE PUSH FRIDAY');
    // Any other engine lead, and a flag with no average, reads as it came.
    const checkin = { source: 'engine', lever: 'checkin', verdict: 'Check-in due', action: { kind: 'check_in', label: 'x' }, reason: 'Your weekly check-in is due', cited: ['checkin_due'], evidence: { key: 'checkin_due', avg: null, n: null } };
    assert.equal(splash(checkin, 'en'), 'SEND YOUR WEEKLY CHECK-IN. — YOUR WEEKLY CHECK-IN IS DUE');
    assert.equal(splash(energyLow(null), 'en'), 'TAKE TODAY LIGHTER. — YOUR ENERGY HAS BEEN LOW ON AVERAGE THIS WEEK — A LIGHTER SESSION STILL COUNTS');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
  }
});

// ⚠ THE TWO NOTES ON WHO KEEPS THE ENGINE'S ENGLISH SAY THE SAME THING. The card's note on
// bsCiLeadReason and the engine's on MEMBER_VITALS_WORDS each name what has no locale. The splash
// says the card's words now (the test above), so neither may list it there, or the next editor
// takes the splash's opts.reason for dead weight (review on this PR: the card's note still read
// "the push, the bell, the splash").
test('the card\'s and the engine\'s notes agree: the push and the bell row keep the English, the splash says the card\'s words', async () => {
  const fs = await import('node:fs');
  // The run of // lines right above the anchor, joined into one sentence.
  const noteAbove = (file, anchor) => {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const at = lines.findIndex((l) => l.includes(anchor));
    assert.ok(at > 0, `${anchor} is not in ${file}`);
    let from = at;
    while (from > 0 && /^\s*\/\//.test(lines[from - 1])) from -= 1;
    return lines.slice(from, at).map((l) => l.replace(/^\s*\/\/\s?/, '')).join(' ');
  };
  const notes = {
    card: noteAbove('mobile-app/src/broadsheet/BSCheckinCard.jsx', 'export function bsCiLeadReason('),
    engine: noteAbove('public/newdesign/dashSignals.js', 'var MEMBER_VITALS_WORDS = {'),
  };
  for (const [who, note] of Object.entries(notes)) {
    const keeps = note.match(/has no locale:?\s*\(?([^.)]*)/);
    assert.ok(keeps, `the ${who} note no longer says what has no locale`);
    assert.match(keeps[1], /\bpush\b/, `${who}: ${keeps[1]}`);
    assert.match(keeps[1], /\bbell\b/, `${who}: ${keeps[1]}`);
    assert.doesNotMatch(keeps[1], /splash/i, `the ${who} note lists the splash as having no locale: ${keeps[1]}`);
    assert.match(note, /Shape Daily splash/, `the ${who} note no longer says the splash says the card's words`);
  }
  // The card's note names the way the splash gets its words, the call the BSSplash test pins.
  assert.match(notes.card, /bsWireLines' opts\.reason in iosAppBroadsheetMain\.jsx/);
  assert.match(notes.engine, /BSCheckinCard\.jsx bsCiLeadReason/);
});

test('the card Main now imports reads no window while it is evaluated, and imports neither shell', async () => {
  // Main evaluates the card before the client module has published any window global, so a
  // read at the card's module top would capture undefined (React #130 on first open).
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const CARD_SRC = path.resolve('mobile-app/src/broadsheet/BSCheckinCard.jsx');
  const appRequire = createRequire(path.resolve('mobile-app/package.json'));
  const reads = [];
  const recorder = new Proxy({}, {
    get: (_t, prop) => { reads.push(String(prop)); return undefined; },
    has: (_t, prop) => { reads.push(String(prop)); return false; },
  });
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true });
  let mod;
  try {
    mod = await loadRealModule(CARD_SRC, { registry: new Map([['react', appRequire('react')], ['react-dom', appRequire('react-dom')]]) });
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
  }
  assert.equal(typeof mod.bsCiLeadReason, 'function');
  assert.deepEqual(reads, [], `the card read window.${reads.join(', window.')} while it was being evaluated`);
  const imports = [...stripComments(fs.readFileSync(CARD_SRC, 'utf8')).matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.ok(!imports.some((s) => /iosAppBroadsheet(Main|Client|Pros)/.test(s)), `the card imports a shell module: ${imports.join(', ')}`);
});

// ── The digest legs — which of the member's data reaches the telegram ───────
// Wednesday 2026-10-21, 7am local. Its week runs Mon 10-19 … Sun 10-25.
const WED = new Date(2026, 9, 21, 7, 0);
const wk = (over) => ({ id: over.id, title: over.title, exercises: [{ name: 'x' }], scheduledDate: null, repeatDow: null, selfAuthored: false, coach: null, ...over });
const planOf = (workouts) => ({ training: { hasPlan: workouts.length > 0, coach: 'First Trainer', workouts } });

test('wireTraining: a rest day with a dated plan reads as a rest day, not Monday\'s session', () => {
  const plan = planOf([wk({ id: 'mon', title: 'Lower', scheduledDate: '2026-10-19' }), wk({ id: 'fri', title: 'Upper', scheduledDate: '2026-10-23' })]);
  assert.deepEqual(bsWireTraining(plan, WED), { hasWorkout: false });
  // …and the rest line is what the member reads.
  const lines = bsWireLines({ signedIn: true, training: bsWireTraining(plan, WED), score: null, nutrition: null, streak: 0, coach: null }, null);
  assert.deepEqual(lines.map((l) => l.text), ['REST DAY ON THE BOOKS']);
});

test('wireTraining: today\'s dated session, with the coach who wrote it', () => {
  const plan = planOf([wk({ id: 'mon', title: 'Lower', scheduledDate: '2026-10-19', coach: 'Ana' }), wk({ id: 'wed', title: 'Pull', scheduledDate: '2026-10-21', coach: 'Ben', time: '17:45', durationMin: 45 })]);
  assert.deepEqual(bsWireTraining(plan, WED), { title: 'Pull', time: '17:45', durationMin: 45, moveCount: 1, coach: 'Ben', hasWorkout: true });
});

test('wireTraining: a weekly repeat lands only on its own weekdays', () => {
  const plan = planOf([wk({ id: 'r', title: 'Run', repeatDow: [0, 2], selfAuthored: true })]); // Mon + Wed
  assert.equal(bsWireTraining(plan, WED).title, 'Run');
  assert.deepEqual(bsWireTraining(plan, new Date(2026, 9, 22, 7, 0)), { hasWorkout: false }); // Thursday
});

test('wireTraining: undated sessions fill the week from Monday, as Train lays them out', () => {
  const plan = planOf([wk({ id: 'a', title: 'A' }), wk({ id: 'b', title: 'B' })]);
  assert.deepEqual(bsWireTraining(plan, WED), { hasWorkout: false }); // A on Mon, B on Tue, Wed open
  assert.equal(bsWireTraining(plan, new Date(2026, 9, 20, 7, 0)).title, 'B'); // Tuesday
});

test('wireTraining: a session the member wrote names no coach, whoever leads the plan', () => {
  const plan = planOf([wk({ id: 'wed', title: 'Mine', scheduledDate: '2026-10-21', selfAuthored: true })]);
  assert.equal(bsWireTraining(plan, WED).coach, null);
});

test('wireTraining: no plan is null (the no-session lines), and a dated row from another week is not today', () => {
  assert.equal(bsWireTraining(null, WED), null);
  assert.equal(bsWireTraining({ training: { hasPlan: false, workouts: [] } }, WED), null);
  assert.deepEqual(bsWireTraining(planOf([wk({ id: 'n', title: 'Next', scheduledDate: '2026-10-28' })]), WED), { hasWorkout: false });
});

test('wireTraining and Train read the same slotting', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8');
  assert.match(src, /const slots = bsSlotWeek\(workouts, monday\);/, 'Train no longer slots its week through bsSlotWeek');
  assert.match(fs.readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx', 'utf8'), /return bsWireTraining\(plan\);/);
});

const thread = (over) => ({ as_coach: false, who: 'Jordan', provider_role: 'trainer', updatedAt: '2026-10-20T10:00:00Z', messages: [], last: 'New conversation', ...over });

test('wireCoachNote: the coach\'s own last written line, never the member\'s or a placeholder', () => {
  const t1 = thread({ messages: [{ coach: true, t: 'Leave two in the tank.' }, { coach: false, me: true, t: 'Will do!' }], last: 'Will do!' });
  assert.deepEqual(bsWireCoachNote([t1]), { who: 'Jordan', role: 'trainer', text: 'Leave two in the tank.', at: '2026-10-20T10:00:00Z' });
  // No coach message at all: no note (the thread's `last` is the member's, or a placeholder).
  assert.equal(bsWireCoachNote([thread({ messages: [{ coach: false, me: true, t: 'Hi coach' }], last: 'Hi coach' })]), null);
  assert.equal(bsWireCoachNote([thread({})]), null);
  // A voice note with no text gives way to the coach's last written line.
  const t2 = thread({ messages: [{ coach: true, t: 'Eat before you lift.' }, { coach: true, t: '', audio: 'x.m4a' }] });
  assert.equal(bsWireCoachNote([t2]).text, 'Eat before you lift.');
});

test('wireCoachNote: the newest thread wins; a thread held as the coach is skipped', () => {
  const older = thread({ who: 'Ana', updatedAt: '2026-10-18T10:00:00Z', messages: [{ coach: true, t: 'Old' }] });
  const newer = thread({ who: 'Ben', updatedAt: '2026-10-20T10:00:00Z', messages: [{ coach: true, t: 'New' }] });
  const mine = thread({ as_coach: true, updatedAt: '2026-10-21T10:00:00Z', messages: [{ coach: true, t: 'To my client' }] });
  assert.equal(bsWireCoachNote([older, mine, newer]).who, 'Ben');
  assert.equal(bsWireCoachNote(null), null);
});

test('wireNutrition: only today\'s row reaches the telegram', () => {
  const ana = { ticker: { cal_target: 2100, protein_target: 140, protein_g: 150 } };
  assert.deepEqual(bsWireNutrition({ today: { date: '2026-10-21', calories: 1200, protein: 96 } }, ana, WED), { cal: 1200, calTarget: 2100, protein: 96, proteinTarget: 140 });
  // The newest row is Monday's: nothing logged today, so no protein line (and not the ticker's 150 either).
  assert.equal(bsWireNutrition({ today: { date: '2026-10-19', calories: 2000, protein: 150 } }, ana, WED), null);
  // Today's row with no meal on it (a Morning check-in made it).
  assert.equal(bsWireNutrition({ today: { date: '2026-10-21', calories: null, protein: null } }, ana, WED), null);
  assert.equal(bsWireNutrition(null, ana, WED), null);
});
