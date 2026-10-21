// Every engine reason a member can lead with, said in the member's words (rulings 11 and 13,
// docs/REVIEW-2026-10-19-morning-checkin.md §6). The engine keeps its English reason for what has
// no locale (the push and the bell row it leaves) and carries the figures the reason was built
// from in the member's directive.evidence; Home and the Shape Daily splash say the same thing from
// them through BSCheckinCard.jsx bsCiLeadReason, in the app's language and the member's units.
// A coach's directive keeps { key, avg, n } and every coach row, alert and reason stays byte for
// byte. The energy, hunger and sleep reads (#2409) are pinned in dash-vitals-triage, checkin-card
// and daily-wire; this file covers the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { clientCandidates, coachCandidates, memberMoveLine, decideNotifications, habitReminderCandidates } from '../src/lib/ai/notifications.mjs';
import { makeMemberCopy, memberLocaleCode } from '../src/lib/ai/memberTranslator.mjs';
import { bsUnitsMetric } from '../mobile-app/src/services/leadReason.mjs';
import { speakableDirective } from '../src/lib/ai/tone.mjs';
import { bsWireLines } from '../mobile-app/src/services/dailyWire.mjs';
import { ACTIVE_LOCALES } from '../mobile-app/src/i18n/locales.mjs';

const require = createRequire(import.meta.url);
const { buildDirective, evaluateClient, getTriageFeed, goalsFromDoc } = require('../public/newdesign/dashSignals.js');
const ROOT = path.resolve('.');
const appRequire = createRequire(path.join(ROOT, 'mobile-app/package.json'));
const React = appRequire('react');
const CARD = await loadRealModule(path.join(ROOT, 'mobile-app/src/broadsheet/BSCheckinCard.jsx'), { registry: new Map([['react', React], ['react-dom', appRequire('react-dom')]]) });

// The app's real catalogs through i18next with ICU, as the app initialises it.
const i18next = appRequire('i18next');
const ICU = appRequire('i18next-icu');
const cat = (loc, ns) => JSON.parse(fs.readFileSync(path.join(ROOT, `mobile-app/src/i18n/catalogs/${loc}/${ns}.json`), 'utf8'));
const resources = {};
for (const loc of ACTIVE_LOCALES) resources[loc] = { home: cat(loc, 'home'), onboarding: cat(loc, 'onboarding') };
const i18n = i18next.createInstance();
await i18n.use(ICU.default || ICU).init({ lng: 'en', fallbackLng: 'en', ns: ['common', 'onboarding', 'home'], defaultNS: 'common', keySeparator: false, interpolation: { escapeValue: false }, returnNull: false, returnEmptyString: false, resources });

// The card reads the locale and the units preference at call time, as the app has them on window.
let intl = 'en';
let units = 'imperial';
const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', { value: { ShapeI18n: { intlLocale: () => intl }, ShapeUnits: { get: () => units } }, configurable: true, writable: true });
test.after(() => { if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow); else delete globalThis.window; });

// Home's translator in a locale: the card's 'home:' keys resolve as Home's useShapeTr resolves them.
const trIn = (loc) => i18n.getFixedT(loc, 'home');
const say = (dir, loc = 'en', u = 'imperial') => { intl = loc; units = u; return CARD.bsCiLeadReason(dir, trIn(loc)); };

// Thursday: a single missed week is "due" from Thursday on (CHECKIN_GRACE_DAYS).
const NOW = new Date('2026-10-22T12:00:00');
const DAY = 86400000;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ago = (days) => iso(new Date(NOW.getTime() - days * DAY));
const hist = (pairs) => pairs.map(([d, v]) => ({ on: ago(d), value: v }));
const SLIP = [[21, 180], [14, 178], [7, 176], [0, 176]]; // a flat week: the ETA moves 16 days later
const LOST = [[21, 180], [14, 178], [7, 176], [0, 181]]; // a reversed week: the ETA is lost
const goal = (label, pairs, id = 'g1') => ({ id, label, metric: 'weight', unit: 'lb', target: 170, start: 180, setBy: 'trainer', history: hist(pairs) });
const me = (over) => ({ profile: { id: 'u1', name: 'You' }, ...over });
const untitledWeight = (pairs, title) => goalsFromDoc({ overall: { title, target: 170, start: 180, unit: 'lb', weighIns: hist(pairs) } });

// Every member reason the engine gives: the record, the engine's English (unchanged, byte for
// byte), the evidence it carries, and the sentence the real en catalog says from it.
const CASES = [
  { name: 'streak_broken', rec: me({ streaks: { current: 0, best: 9 } }), lever: 'training',
    reason: 'Streak broken — was 9 days',
    evidence: { key: 'streak_broken', avg: null, n: null, best: 9 },
    en: 'Your streak broke. Your longest run in the last 30 days was 9 days.' },
  // A check-in dated mid-week names its Monday, as the engine's reason does.
  { name: 'checkin_overdue, one week', rec: me({ checkIn: { lastWeekOf: '2026-10-14' } }), lever: 'checkin',
    reason: 'Check-in due — last was week of 2026-10-12',
    evidence: { key: 'checkin_overdue', avg: null, n: null, missedWeeks: 1, lastWeekOf: '2026-10-12' },
    en: 'Your weekly check-in is due. The last one was for the week of October 12.' },
  { name: 'checkin_overdue, weeks', rec: me({ checkIn: { lastWeekOf: '2026-09-28' } }), lever: 'checkin',
    reason: 'No check-in for 3 weeks',
    evidence: { key: 'checkin_overdue', avg: null, n: null, missedWeeks: 3, lastWeekOf: '2026-09-28' },
    en: 'No weekly check-in for 3 weeks.' },
  { name: 'checkin_overdue, first', rec: me({ checkIn: { lastWeekOf: null } }), lever: 'checkin',
    reason: "Hasn't completed a first check-in",
    evidence: { key: 'checkin_overdue', avg: null, n: null, first: true },
    en: "You haven't sent a first weekly check-in yet." },
  { name: 'goal_slip, a named goal', rec: me({ goals: [goal('Lean by summer', SLIP)] }), lever: 'goal',
    reason: '“Lean by summer” slipped — the projected finish moved 16 days later this week',
    evidence: { key: 'goal_slip', avg: null, n: null, goal: 'Lean by summer', untitled: false, days: 16 },
    en: '“Lean by summer” slipped. Its projected finish moved 16 days later this week.' },
  { name: 'goal_slip, a named goal lost its date', rec: me({ goals: [goal('Lean by summer', LOST)] }), lever: 'goal',
    reason: '“Lean by summer” lost its projected date — the pace flattened this week',
    evidence: { key: 'goal_slip', avg: null, n: null, goal: 'Lean by summer', untitled: false, lost: true },
    en: '“Lean by summer” lost its projected date. The pace flattened this week.' },
  // The member's own weight goal with no title: the engine's English stand-in is never quoted.
  { name: 'goal_slip, the untitled weight goal', rec: me({ goals: untitledWeight(SLIP) }), lever: 'goal',
    reason: '“Goal weight” slipped — the projected finish moved 16 days later this week',
    evidence: { key: 'goal_slip', avg: null, n: null, goal: null, untitled: true, days: 16 },
    en: 'Your goal weight slipped. Its projected finish moved 16 days later this week.' },
  { name: 'goal_slip, the untitled weight goal lost its date', rec: me({ goals: untitledWeight(LOST) }), lever: 'goal',
    reason: '“Goal weight” lost its projected date — the pace flattened this week',
    evidence: { key: 'goal_slip', avg: null, n: null, goal: null, untitled: true, lost: true },
    en: 'Your goal weight lost its projected date. The pace flattened this week.' },
  // A titled self-set goal is the member's own name, quoted.
  { name: 'goal_slip, a titled weight goal', rec: me({ goals: untitledWeight(SLIP, 'Summer cut') }), lever: 'goal',
    reason: '“Summer cut” slipped — the projected finish moved 16 days later this week',
    evidence: { key: 'goal_slip', avg: null, n: null, goal: 'Summer cut', untitled: false, days: 16 },
    en: '“Summer cut” slipped. Its projected finish moved 16 days later this week.' },
  { name: 'hydration_low', rec: me({ vitals: { hydration: { avg7L: 1.04, targetL: 2.5, n: 5 } } }), lever: 'hydration',
    reason: 'Averaging 1L of a 2.5L water target — a glass with each meal closes most of it',
    evidence: { key: 'hydration_low', avg: null, n: 5, avgL: 1.04, targetL: 2.5 },
    en: 'On days you logged water, you averaged 35 oz of your 85 oz target. A glass with each meal closes most of it.' },
  // food_gap and score_drop cannot reach the member's own record today (it carries no food-log
  // rollup and no score history), but Home has a head for both levers, so they are said too.
  { name: 'food_gap, an empty week', rec: me({ profile: { id: 'u1', name: 'You', joinedAt: '2026-01-01' }, foodLogs: { lastLoggedOn: null, daysLogged7d: 0 } }), lever: 'nutrition',
    reason: 'No food logs in the last week',
    evidence: { key: 'food_gap', avg: null, n: null, lastWeek: true },
    en: 'No food logged in the last week.' },
  { name: 'food_gap, days', rec: me({ profile: { id: 'u1', name: 'You', joinedAt: '2026-01-01' }, foodLogs: { lastLoggedOn: '2026-10-15', daysLogged7d: 0 } }), lever: 'nutrition',
    reason: 'No food logs in 7 days',
    evidence: { key: 'food_gap', avg: null, n: null, days: 7, sinceJoined: false },
    en: 'No food logged in 7 days.' },
  { name: 'food_gap, since joining', rec: me({ profile: { id: 'u1', name: 'You', joinedAt: '2026-10-17' }, foodLogs: { lastLoggedOn: '2026-10-10', daysLogged7d: 0 } }), lever: 'nutrition',
    reason: 'No food logs in the 5 days since they joined',
    evidence: { key: 'food_gap', avg: null, n: null, days: 5, sinceJoined: true },
    en: 'No food logged in the 5 days since you joined.' },
  { name: 'score_drop', rec: me({ shapeScoreHistory: [{ weekOf: '2026-10-05', points: 80 }, { weekOf: '2026-10-12', points: 68 }] }), lever: 'score',
    reason: 'Shape Score down 12 pts week-over-week',
    evidence: { key: 'score_drop', avg: null, n: null, drop: 12 },
    en: 'Your Shape Score is 12 lower than the week before.' },
  // (Last, so the indices the push test names stay put.) A title of only spaces is no name: the member hears the untitled weight goal's line, while the
  // reason coaches read keeps the label as saved (review on this PR).
  { name: 'goal_slip, a blank-titled weight goal', rec: me({ goals: untitledWeight(SLIP, '   ') }), lever: 'goal',
    reason: '“   ” slipped — the projected finish moved 16 days later this week',
    evidence: { key: 'goal_slip', avg: null, n: null, goal: null, untitled: true, days: 16 },
    en: 'Your goal weight slipped. Its projected finish moved 16 days later this week.' },
];
const dirOf = (c, role = 'client') => buildDirective(c.rec, NOW, role);

test("the engine's member reasons are unchanged, and the member's directive carries their figures", () => {
  for (const c of CASES) {
    const d = dirOf(c);
    assert.equal(d.source, 'engine', c.name);
    assert.equal(d.lever, c.lever, c.name);
    assert.equal(d.reason, c.reason, `${c.name}: the engine's English moved, and the push and the bell say it`);
    assert.equal(d.read.oneThingNow, c.reason, c.name);
    assert.deepEqual(d.evidence, c.evidence, c.name);
    // The figures sit beside key, avg and n, never over them.
    const flag = evaluateClient(c.rec, NOW, 'client').flags.find((f) => f.key === c.evidence.key);
    assert.ok(flag && flag.figures, `${c.name}: the flag carries no figures`);
    for (const k of ['key', 'avg', 'n']) assert.equal(k in flag.figures, false, `${c.name}: a figure is named ${k}`);
    // Numbers and plain values only, so the figures survive JSON (a lost goal date is never Infinity).
    assert.deepEqual(JSON.parse(JSON.stringify(d.evidence)), c.evidence, `${c.name}: the evidence does not survive JSON`);
  }
});

test("Home says each reason from its figures through the real en catalog", () => {
  for (const c of CASES) {
    const s = say(dirOf(c));
    assert.equal(s, c.en, c.name);
    assert.notEqual(s, c.reason, `${c.name}: Home said the engine's English`);
    // Ruling 11: no scale, no "/10", no points.
    assert.doesNotMatch(s, /\/\s?10|\bpoints?\b|\bpts\b/i, c.name);
  }
});

test('every locale says every reason, with nothing of the ICU or the engine left in it', () => {
  for (const loc of ACTIVE_LOCALES) {
    for (const c of CASES) {
      for (const u of ['metric', 'imperial']) {
        const s = say(dirOf(c), loc, u);
        assert.equal(typeof s, 'string', `${loc} ${c.name}`);
        assert.ok(s.trim().length > 10, `${loc} ${c.name}: ${s}`);
        assert.doesNotMatch(s, /[{}#]|undefined|NaN|lead\.reason/, `${loc} ${c.name}: ${s}`);
        assert.notEqual(s, c.reason, `${loc} ${c.name}: the engine's English`);
        assert.doesNotMatch(s, /\/\s?10/, `${loc} ${c.name}`);
        const fig = c.evidence;
        // The figure is in it, in the locale's digits.
        for (const k of ['best', 'days', 'drop']) if (typeof fig[k] === 'number') assert.ok(s.includes(String(fig[k])), `${loc} ${c.name}: no ${fig[k]} in ${s}`);
        if (fig.missedWeeks >= 2) assert.ok(s.includes(String(fig.missedWeeks)), `${loc} ${c.name}: ${s}`);
        if (typeof fig.goal === 'string') assert.ok(s.includes(fig.goal), `${loc} ${c.name}: the goal's own name is gone: ${s}`);
        if (fig.untitled === true) assert.ok(!s.includes('Goal weight'), `${loc} ${c.name}: the engine's stand-in name was quoted: ${s}`);
      }
    }
  }
  // Spot checks of the grammar the ICU plurals carry.
  const weeks = (n) => ({ source: 'engine', reason: 'x', evidence: { key: 'checkin_overdue', avg: null, n: null, missedWeeks: n, lastWeekOf: '2026-01-05' } });
  assert.equal(say(weeks(2), 'ru'), 'Нет недельного чек-ина уже 2 недели.');
  assert.equal(say(weeks(5), 'ru'), 'Нет недельного чек-ина уже 5 недель.');
  assert.equal(say(weeks(21), 'uk'), 'Немає тижневого чек-іну вже 21 тиждень.');
  assert.equal(say(weeks(3), 'de'), 'Seit 3 Wochen kein wöchentlicher Check-in.');
  // The Monday the reason names is said as a date in the member's language.
  const due = dirOf(CASES[1]);
  assert.equal(say(due, 'de'), 'Dein wöchentlicher Check-in ist fällig. Der letzte war für die Woche vom 12. Oktober.');
  assert.equal(say(due, 'es'), 'Tu check-in semanal está pendiente. El último fue de la semana del 12 de octubre.');
  assert.equal(say(due, 'ru'), 'Пора отправить недельный чек-ин. Последний был за неделю с 12 октября.');
  // A goal's own name keeps its words, set in the locale's quotes.
  assert.match(say(dirOf(CASES[4]), 'de'), /^„Lean by summer“ ist abgerutscht\. .* um 16 Tage nach hinten verschoben\.$/);
  assert.match(say(dirOf(CASES[4]), 'fr'), /^« Lean by summer » a pris du retard\./);
});

test("water is said in the member's units, read when it is said", () => {
  const water = (avg7L, targetL) => buildDirective(me({ vitals: { hydration: { avg7L, targetL, n: 5 } } }), NOW, 'client');
  const d = water(1.04, 2.5);
  assert.equal(say(d, 'en', 'metric'), 'On days you logged water, you averaged 1 L of your 2.5 L target. A glass with each meal closes most of it.');
  assert.equal(say(d, 'en', 'imperial'), 'On days you logged water, you averaged 35 oz of your 85 oz target. A glass with each meal closes most of it.');
  // The target as the water line shows it (to the centilitre); the average to the decilitre, as the
  // engine rounds it; the locale's decimal sign.
  const q = water(1.06, 2.25);
  assert.equal(q.lever, 'hydration', 'the fixture is no longer a low-water week');
  assert.equal(say(q, 'en', 'metric'), 'On days you logged water, you averaged 1.1 L of your 2.25 L target. A glass with each meal closes most of it.');
  assert.match(say(q, 'de', 'metric'), /im Schnitt 1,1 L deines Ziels von 2,25 L\./);
  assert.match(say(q, 'de', 'imperial'), /im Schnitt 36 oz deines Ziels von 76 oz\./);
  // The same directive follows a change of the setting, with nothing cached.
  units = 'metric';
  const tr = trIn('en');
  intl = 'en';
  const first = CARD.bsCiLeadReason(q, tr);
  units = 'imperial';
  assert.notEqual(CARD.bsCiLeadReason(q, tr), first);
  // No preference to read is the app's own default, imperial (iosAppBroadsheet.jsx ShapeUnits).
  const saved = globalThis.window.ShapeUnits;
  try {
    delete globalThis.window.ShapeUnits;
    assert.match(CARD.bsCiLeadReason(q, tr), /36 oz of your 76 oz target/);
  } finally { globalThis.window.ShapeUnits = saved; }
});

test("a coach's own reason, a key the app does not know, and a figure that is not what its rule makes are said as they came", () => {
  const engine = (evidence, reason = 'the engine said it') => ({ source: 'engine', lever: 'checkin', reason, cited: [evidence.key], evidence: { avg: null, n: null, ...evidence } });
  // Ruling 13: a coach's override is never reworded, whatever evidence rides on it.
  const coach = { source: 'coach', lever: 'checkin', reason: 'Send it by Sunday, Sam', cited: ['coach override'], evidence: { key: 'checkin_overdue', avg: null, n: null, missedWeeks: 3, lastWeekOf: '2026-09-28' } };
  assert.equal(say(coach, 'de'), 'Send it by Sunday, Sam');
  // The engine's own override path: a coach directive carries no evidence at all.
  const real = buildDirective(me({ checkIn: { lastWeekOf: '2026-09-28' }, coachDirective: { lever: 'checkin', reason: 'We talk Friday' } }), NOW, 'client');
  assert.equal(real.source, 'coach');
  assert.equal('evidence' in real, false);
  assert.equal(say(real, 'de'), 'We talk Friday');
  // A key the app has no words for.
  assert.equal(say(engine({ key: 'contact_gap', days: 6 }, 'No contact in 6 days')), 'No contact in 6 days');
  assert.equal(say(engine({ key: 'plan_due', days: 2 }, 'Week 1 was set')), 'Week 1 was set');
  // An engine lead with no evidence (the milder sleep read, on pace) reads as written.
  assert.equal(say({ source: 'engine', lever: 'sleep', reason: 'Sleep is stalling recovery; tonight, lights out by 11.' }), 'Sleep is stalling recovery; tonight, lights out by 11.');
  // Figures that are missing, or not what the rule makes: the engine's English, never an invented line.
  for (const ev of [
    { key: 'streak_broken' }, { key: 'streak_broken', best: '9' }, { key: 'streak_broken', best: 2.5 }, { key: 'streak_broken', best: 0 },
    { key: 'checkin_overdue' }, { key: 'checkin_overdue', missedWeeks: 1 }, { key: 'checkin_overdue', missedWeeks: 1, lastWeekOf: '2026-13-40' },
    { key: 'checkin_overdue', missedWeeks: 1, lastWeekOf: '12/10/2026' }, { key: 'checkin_overdue', missedWeeks: 1.5, lastWeekOf: '2026-10-12' },
    { key: 'checkin_overdue', missedWeeks: '3' }, { key: 'checkin_overdue', first: 'yes' },
    { key: 'goal_slip', days: 9 }, { key: 'goal_slip', goal: '   ', days: 9 }, { key: 'goal_slip', goal: 'Run 5k', days: Infinity },
    { key: 'goal_slip', goal: 'Run 5k', days: 0 }, { key: 'goal_slip', goal: 'Run 5k' }, { key: 'goal_slip', untitled: 'true', days: 9 },
    { key: 'hydration_low', avgL: 1 }, { key: 'hydration_low', avgL: 1, targetL: 0 }, { key: 'hydration_low', avgL: NaN, targetL: 2 },
    { key: 'hydration_low', avgL: '1', targetL: 2 }, { key: 'hydration_low', avgL: -1, targetL: 2 },
    { key: 'food_gap' }, { key: 'food_gap', days: null }, { key: 'food_gap', lastWeek: 'true' },
    { key: 'score_drop' }, { key: 'score_drop', drop: 0 }, { key: 'score_drop', drop: NaN },
  ]) {
    assert.equal(say(engine(ev, 'as the engine said it')), 'as the engine said it', JSON.stringify(ev));
  }
  // The vitals path is unchanged: a hydration lead whose evidence holds an average and no figures.
  assert.equal(say({ source: 'engine', lever: 'hydration', reason: 'Water is behind', evidence: { key: 'hydration_low', avg: 1.2, n: 4 } }), 'Water is behind');
});

test("a coach's directive, row and alert are unchanged: the figures stay on the member's side", () => {
  for (const c of CASES) {
    if (c.lever === 'hydration') continue; // never a coach flag (owner ruling)
    for (const role of ['trainer', 'nutritionist', 'dietitian']) {
      const d = dirOf(c, role);
      assert.equal(d.reason, c.reason, `${role} ${c.name}`);
      assert.deepEqual(d.evidence, { key: c.evidence.key, avg: null, n: null }, `${role} ${c.name}: a coach's directive carries the member's figures`);
      const [row] = getTriageFeed(role, [{ userId: 'c1', ...c.rec, profile: { ...c.rec.profile, name: 'Ana' } }], NOW);
      assert.equal(row.reasons[0], c.reason, `${role} ${c.name}`);
      assert.equal(row.flags[0].reason, c.reason, `${role} ${c.name}`);
      assert.equal('figures' in row.flags[0], false, `${role} ${c.name}: a triage row carries the figures`);
      assert.deepEqual(row.directive.evidence, { key: c.evidence.key, avg: null, n: null }, `${role} ${c.name}`);
    }
  }
  // The coach alert for a three-week check-in, as notify-core builds it, byte for byte.
  const rec = { userId: 'c1', profile: { name: 'Ana' }, checkIn: { lastWeekOf: '2026-09-28' } };
  const rows = getTriageFeed('trainer', [rec], NOW).map((r) => ({ clientId: r.client.userId, clientName: r.client.profile.name, severity: r.severity, reason: r.reasons[0] || '', flags: r.flags }));
  const [alert] = coachCandidates({ triageRows: rows, lastSeverity: {}, providerRole: 'trainer' });
  assert.equal(alert.body, 'No check-in for 3 weeks');
  assert.equal(alert.sig, 'red:No check-in for 3 weeks');
});

// The server's translator: the same catalogs through memberTranslator.mjs, the set-up notify-core runs.
const copyFor = makeMemberCopy(Object.fromEntries(ACTIVE_LOCALES.map((l) => [l, { home: cat(l, 'home') }])));

// The same steps as notify-core.candidatesFor (TypeScript, so not loadable here). The push is also
// the bell row the app shows word for word. `copy` is the member's language and units (memberCopy);
// without one, the notices are the engine's English, as before.
const pushes = (rec, copy, { strip = false, tone = 'supportive' } = {}) => {
  const directive = buildDirective(rec, NOW, 'client');
  const d = strip ? { ...directive, evidence: undefined } : directive;
  const line = memberMoveLine(d, { tr: copy?.tr, locale: copy?.locale, metric: copy?.metric, tone });
  const { flags } = evaluateClient(rec, NOW, 'client');
  const fl = strip ? flags.map(({ figures, ...f }) => f) : flags;
  return clientCandidates({ directive: { ...d, line }, flags: fl, goals: rec.goals || [], now: NOW, tone, tr: copy?.tr, locale: copy?.locale, metric: copy?.metric });
};

test("without the member's language the push is the engine's English, as before, and never reads the evidence", () => {
  for (const c of CASES) {
    // The figures change nothing an English push says or signs.
    assert.deepEqual(pushes(c.rec, null), pushes(c.rec, null, { strip: true }), c.name);
    const d = dirOf(c);
    assert.equal(memberMoveLine(d, { tone: 'direct' }), speakableDirective(d, 'direct'), c.name);
  }
  const body = (c, type = 'directive') => pushes(c.rec, null).find((x) => x.type === type);
  assert.equal(body(CASES[9]).body, "Water is behind. Averaging 1L of a 2.5L water target — a glass with each meal closes most of it. When you're ready, log a glass of water.");
  assert.equal(body(CASES[2]).body, "Check-in due. No check-in for 3 weeks. When you're ready, send your weekly check-in.");
  assert.equal(body(CASES[0]).body, "Train today. Streak broken — was 9 days. When you're ready, open today's session.");
  assert.match(body(CASES[0], 'streak_broken').sig, /^Streak broken — was 9 days:/);
  assert.equal(body(CASES[4], 'goal_slip').body, 'The pace dipped a little — a small adjust brings the date back. “Lean by summer” slipped — the projected finish moved 16 days later this week');
});

// ⚠ THE PUSH SAYS HOME'S LEAD (owner, 2026-10-21: "fix the push and bell row wording too"). The
// expected line is built from the app's own translator and the card's real bsCiLeadReason, so the
// server's translator, the shared module and Home are held to one sentence in every locale and both
// units.
test("the member's push and bell row say Home's lead, in every locale and both units", () => {
  for (const loc of ACTIVE_LOCALES) {
    for (const u of ['imperial', 'metric']) {
      const copy = copyFor(loc, u === 'metric');
      for (const c of CASES) {
        const d = dirOf(c);
        const push = pushes(c.rec, copy).find((x) => x.type === 'directive');
        const home = `${trIn(loc)(`home:lead.${d.lever}.head`)} ${say(d, loc, u)}`;
        assert.equal(push.body, home, `${loc} ${u} ${c.name}`);
        assert.equal(push.title, trIn(loc)('home:push.moveTitle'), `${loc} ${c.name}`);
        // Ruling 11 and the reasons this replaced: no scale, no ISO date, no engine English.
        assert.doesNotMatch(push.body, /\/\s?10|\b\d{4}-\d{2}-\d{2}\b|week-over-week|since they joined|Streak broken —/, `${loc} ${c.name}: ${push.body}`);
        if (c.lever === 'hydration') {
          assert.match(push.body, u === 'metric' ? /\d L\b/ : /\d oz\b/, `${loc} ${u}: ${push.body}`);
          assert.doesNotMatch(push.body, u === 'metric' ? /\boz\b/ : /\d L\b/, `${loc} ${u}: ${push.body}`);
        }
        // The language never changes what a notice signs: a member who switches is not sent it again.
        assert.deepEqual(pushes(c.rec, copy).map((x) => [x.type, x.key, x.sig, x.data]), pushes(c.rec, null).map((x) => [x.type, x.key, x.sig, x.data]), `${loc} ${c.name}`);
      }
    }
  }
  // Two lines, said out: the water in ounces and in litres, the check-in's Monday as a date.
  const en = pushes(CASES[9].rec, copyFor('en', false)).find((x) => x.type === 'directive');
  assert.equal(en.body, 'Drink more water today. On days you logged water, you averaged 35 oz of your 85 oz target. A glass with each meal closes most of it.');
  const de = pushes(CASES[1].rec, copyFor('de', true)).find((x) => x.type === 'directive');
  assert.equal(de.body, 'Sende deinen wöchentlichen Check-in. Dein wöchentlicher Check-in ist fällig. Der letzte war für die Woche vom 12. Oktober.');
  assert.equal(pushes(CASES[9].rec, copyFor('de', true)).find((x) => x.type === 'directive').body,
    'Trink heute mehr Wasser. ' + say(dirOf(CASES[9]), 'de', 'metric'));
});

test('the goal-slip and Score-dip notices name their reason as Home does, in the member\'s language', () => {
  for (const loc of ACTIVE_LOCALES) {
    const copy = copyFor(loc, false);
    for (const tone of ['supportive', 'direct']) {
      const goal = pushes(CASES[4].rec, copy, { tone }).find((x) => x.type === 'goal_slip');
      const reason = say(dirOf(CASES[4]), loc);
      const frame = tone === 'direct' ? 'goalDirect' : 'goalSupportive';
      assert.equal(goal.title, trIn(loc)('home:push.goalTitle'), loc);
      assert.equal(goal.body, trIn(loc)(`home:push.${frame}`, { reason }).trim(), `${loc} ${tone}`);
      const score = pushes(CASES[13].rec, copy, { tone }).find((x) => x.type === 'score_drop');
      const why = say(dirOf(CASES[13]), loc);
      assert.equal(score.title, trIn(loc)('home:push.scoreTitle'), loc);
      assert.equal(score.body, tone === 'direct' ? why : trIn(loc)('home:push.scoreSupportive', { reason: why }).trim(), `${loc} ${tone}`);
    }
  }
  // The title no longer names the member's first goal, which need not be the one that slipped.
  const two = me({ goals: [goal('Run a 10K', [[21, 30], [14, 29], [7, 28], [0, 27]], 'g0'), goal('Lean by summer', SLIP)] });
  const slip = pushes(two, copyFor('en', false)).find((x) => x.type === 'goal_slip');
  assert.equal(slip.title, 'Your goal pace eased off');
  assert.match(slip.body, /“Lean by summer” slipped\./);
});

// Every notice the layer writes for a member, in both tones: the English the code carries is the en
// catalog's, word for word, so a member in English reads the same whichever path wrote it; and every
// other language says it from its own catalog, as the app's translator does.
test("every member notice is in the member's language, and its English is the catalog's", () => {
  const input = (copy, tone) => ({
    directive: { lever: 'checkin', verdict: 'Check-in due', reason: 'x', action: { kind: 'check_in', label: 'Send your weekly check-in' }, cited: ['checkin_overdue'], line: 'LINE' },
    // Flags without figures, so the goal and Score reasons are the engine's words on both paths.
    flags: [{ key: 'streak_broken', reason: 'Streak broken — was 9 days' }, { key: 'score_drop', reason: 'Down 12' }, { key: 'goal_slip', reason: 'Slipped' }],
    checkinDueThisWeek: true,
    coachEvents: [
      { kind: 'message', id: 'm1', coach: 'Ana', preview: 'See you Friday' }, { kind: 'message', id: 'm2' },
      { kind: 'cosign', id: 'c1', coach: 'Ana', activity: 'run' }, { kind: 'cosign', id: 'c2' },
    ],
    now: NOW, tone, tr: copy?.tr, locale: copy?.locale,
  });
  const named = { key: 'streak_broken', habit: 'Water', reason: 'Streak broken — was 9 days' };
  const reminders = [{ habitId: 'h1', label: 'Take vitamins', at: '09:00', days: [0, 1, 2, 3, 4, 5, 6], tz: 'UTC' }, { habitId: 'h2', label: '', at: '09:00', days: [0, 1, 2, 3, 4, 5, 6], tz: 'UTC' }];
  const all = (copy, tone) => [
    ...clientCandidates(input(copy, tone)),
    ...clientCandidates({ directive: null, flags: [named], now: NOW, tone, tr: copy?.tr }),
    ...habitReminderCandidates({ reminders, doneToday: [], now: NOW, tone, tr: copy?.tr }),
  ].map((x) => [x.type, x.title, x.body]);
  const digest = (copy, n) => {
    const pending = Array.from({ length: n }, (_, i) => ({ type: 'streak_broken', title: `T${i}`, body: '', route: 'habits', data: {}, channels: { push: true }, sig: `s${i}`, key: `k${i}`, at: +NOW - 3600000 }));
    return decideNotifications({ candidates: [], last: { pendingDigest: pending }, prefs: { tz: 'UTC', quietStart: 23, quietEnd: 6 }, now: NOW, audience: 'client', tr: copy?.tr }).digest;
  };
  for (const tone of ['supportive', 'direct']) {
    assert.deepEqual(all(copyFor('en', false), tone), all(null, tone), `${tone}: the code's English is not the en catalog's`);
  }
  for (const n of [1, 5]) assert.deepEqual(digest(copyFor('en', false), n), digest(null, n), `a digest of ${n}`);
  const types = all(null, 'supportive').map(([t]) => t);
  for (const t of ['directive', 'checkin_due', 'goal_slip', 'score_drop', 'streak_broken', 'coach_message', 'coach_cosign', 'habit_reminder']) assert.ok(types.includes(t), `${t} is not covered`);
  for (const loc of ACTIVE_LOCALES) {
    const tr = trIn(loc);
    const es = all(copyFor(loc, false), 'supportive');
    const keyed = new Map(es.map(([t, title, body], i) => [`${t}${i}`, { title, body }]));
    assert.equal(keyed.size, es.length);
    // Spot the frames against the app's translator, key by key.
    const find = (type, nth = 0) => es.filter(([t]) => t === type)[nth];
    assert.deepEqual(find('directive').slice(1), [tr('home:push.moveTitle'), 'LINE'], loc);
    assert.deepEqual(find('checkin_due').slice(1), [tr('home:push.checkinTitle'), tr('home:push.checkinSupportive')], loc);
    assert.deepEqual(find('coach_message', 0).slice(1), [tr('home:push.noteTitle', { coach: 'Ana' }), 'See you Friday'], loc);
    assert.deepEqual(find('coach_message', 1).slice(1), [tr('home:push.noteTitleAnon'), tr('home:push.noteBody')], loc);
    assert.deepEqual(find('coach_cosign', 0).slice(1), [tr('home:push.cosignTitle', { coach: 'Ana', activity: 'run' }), tr('home:push.cosignSupportive')], loc);
    assert.deepEqual(find('coach_cosign', 1).slice(1), [tr('home:push.cosignTitleAnon', { activity: tr('home:push.cosignActivity') }), tr('home:push.cosignSupportive')], loc);
    assert.deepEqual(find('streak_broken', 0).slice(1), [tr('home:push.streakTitle'), tr('home:push.streakSupportive')], loc);
    assert.deepEqual(find('streak_broken', 1).slice(1), [tr('home:push.streakTitleHabit', { habit: 'Water' }), tr('home:push.streakSupportive')], loc);
    assert.deepEqual(find('habit_reminder', 0).slice(1), [tr('home:push.habitTitle', { label: 'Take vitamins' }), tr('home:push.habitSupportive')], loc);
    assert.deepEqual(find('habit_reminder', 1).slice(1), [tr('home:push.habitTitle', { label: tr('home:push.habitAnon') }), tr('home:push.habitSupportive')], loc);
    const direct = all(copyFor(loc, false), 'direct');
    assert.deepEqual(direct.filter(([t]) => t === 'checkin_due')[0].slice(1), [tr('home:push.checkinTitle'), tr('home:push.checkinDirect')], loc);
    assert.equal(direct.filter(([t]) => t === 'score_drop')[0][2], 'Down 12', `${loc}: a direct Score dip says its reason alone`);
    const d5 = digest(copyFor(loc, false), 5);
    assert.equal(d5.title, tr('home:push.digestTitle', { count: 5 }), loc);
    assert.equal(d5.body, `T0 · T1 · T2 ${tr('home:push.digestMore', { count: 2 })}`, loc);
    // No placeholder or ICU left anywhere.
    for (const [t, title, body] of [...es, ...direct, [d5.type, d5.title, d5.body]]) assert.doesNotMatch(`${title} ${body}`, /[{}]/, `${loc} ${t}`);
  }
  // A coach's digest is in the coach's language too ("fix the other server notices wording too").
  const pending = [1, 2].map((i) => ({ type: 'client_red', title: `T${i}`, body: '', route: 'client', data: {}, channels: { push: true }, sig: `s${i}`, key: `k${i}`, at: +NOW - 3600000 }));
  const coach = decideNotifications({ candidates: [], last: { pendingDigest: pending }, prefs: { tz: 'UTC', quietStart: 23, quietEnd: 6 }, now: NOW, audience: 'coach', tr: copyFor('es', false).tr }).digest;
  assert.equal(coach.title, trIn('es')('home:push.digestTitle', { count: 2 }));
  assert.notEqual(coach.title, '2 updates for you');
});

// ⚠ THE SHAMING GUARD READS ENGLISH (tone.mjs containsShaming), AND A PUSH IT TRIPS IS SENT BLANK.
// Pidgin's "You never log food" is "you haven't", not a reproach, but the guard read "you never" and
// emptied the body, so the catalog says it as the English does ("No food log…"). Every line a
// member's notice can say, in every language, is held clear of it.
test("no line a member's notice can say trips the shaming guard, in any language", async () => {
  const { containsShaming } = await import('../src/lib/ai/tone.mjs');
  for (const loc of ACTIVE_LOCALES) {
    const home = cat(loc, 'home');
    for (const [k, v] of Object.entries(home)) {
      if (!/^(push\.|lead\.|checkin\.(week|e\d|h\d|hm$|hOnly$))/.test(k)) continue;
      assert.equal(containsShaming(v), false, `${loc} ${k}: ${v}`);
    }
  }
});

// ⚠ A HELD NOTICE IS TITLED IN THE LANGUAGE ITS DIGEST GOES OUT IN (Codex on #2418). A notice held
// for quiet hours or the cap was titled when it was queued; a member who changed language in between,
// or one with English items held from before notices were translated, read a translated digest
// heading over titles in the old language.
test('a held notice is titled again in the language its digest goes out in', () => {
  const de = copyFor('de', false);
  const es = copyFor('es', false);
  const QUIET = new Date('2026-10-22T23:30:00Z');
  const LATER = new Date('2026-10-23T09:00:00Z');
  const prefs = { tz: 'UTC', quietStart: 22, quietEnd: 7 };
  const held = [
    ...clientCandidates({ directive: { lever: 'checkin', verdict: 'Check-in due', reason: 'x', action: { kind: 'check_in', label: 'Send' }, cited: ['checkin_overdue'], line: 'L' }, flags: [{ key: 'streak_broken', reason: 'r' }, { key: 'score_drop', reason: 'Down 12' }], checkinDueThisWeek: true, coachEvents: [{ kind: 'message', id: 'm1', coach: 'Ana', preview: 'Hi' }], now: QUIET, tone: 'supportive', tr: de.tr }),
    ...habitReminderCandidates({ reminders: [{ habitId: 'h1', label: 'Vitamine', at: '00:00', days: [0, 1, 2, 3, 4, 5, 6], tz: 'UTC' }], doneToday: [], now: QUIET, tone: 'supportive', tr: de.tr }),
  ];
  // Quiet hours: everything is held, titled in German.
  const first = decideNotifications({ candidates: held, last: {}, prefs, now: QUIET, audience: 'client', tr: de.tr });
  assert.equal(first.send.length, 0);
  assert.ok(first.nextState.pendingDigest.length >= 5);
  for (const i of first.nextState.pendingDigest) assert.ok(i.titleCopy && i.titleCopy.key.startsWith('home:push.'), `${i.type} holds no key`);
  // The member switches to Spanish; the digest goes out in Spanish, every title with it.
  const out = decideNotifications({ candidates: [], last: first.nextState, prefs, now: LATER, audience: 'client', tr: es.tr });
  const tr = trIn('es');
  const titles = first.nextState.pendingDigest.slice(0, 3).map((i) => tr(i.titleCopy.key, i.titleCopy.vars || undefined));
  assert.equal(out.digest.title, tr('home:push.digestTitle', { count: first.nextState.pendingDigest.length }));
  assert.equal(out.digest.body, `${titles.join(' · ')} ${tr('home:push.digestMore', { count: first.nextState.pendingDigest.length - 3 })}`);
  for (const t of titles) assert.ok(!Object.values(cat('de', 'home')).includes(t) || Object.values(cat('es', 'home')).includes(t), `a German title rode into the Spanish digest: ${t}`);
  // The member's own words stay theirs: the habit's name and the coach's.
  const named = first.nextState.pendingDigest.filter((i) => i.type === 'habit_reminder' || i.type === 'coach_message');
  assert.deepEqual(named.map((i) => i.titleCopy.vars), named.map((i) => (i.type === 'habit_reminder' ? { label: 'Vitamine' } : { coach: 'Ana' })));
  // An English item held before titles carried a key: a fixed title is said again, any other kept.
  const legacy = [
    { type: 'checkin_due', title: 'Your weekly check-in is ready', body: '', route: 'checkin', data: {}, channels: { push: true }, sig: 'due:W', key: 'self', at: +QUIET },
    { type: 'goal_slip', title: 'Your Lean by summer pace eased off', body: '', route: 'goal', data: {}, channels: { push: true }, sig: 'g', key: 'self', at: +QUIET },
    { type: 'habit_reminder', title: 'Time for: Walk', body: '', route: 'habits', data: {}, channels: { push: true }, sig: 'h', key: 'h1', at: +QUIET },
  ];
  const old = decideNotifications({ candidates: [], last: { pendingDigest: legacy }, prefs, now: LATER, audience: 'client', tr: es.tr });
  assert.equal(old.digest.body, `${tr('home:push.checkinTitle')} · ${tr('home:push.goalTitle')} · Time for: Walk`);
  // Without a translator, the stored titles as they were.
  const plain = decideNotifications({ candidates: [], last: { pendingDigest: legacy }, prefs, now: LATER, audience: 'client' });
  assert.equal(plain.digest.body, 'Your weekly check-in is ready · Your Lean by summer pace eased off · Time for: Walk');
  // A title that holds a translated default is not held to its key, and keeps its text.
  const anon = habitReminderCandidates({ reminders: [{ habitId: 'h2', label: '', at: '00:00', days: [0, 1, 2, 3, 4, 5, 6], tz: 'UTC' }], doneToday: [], now: QUIET, tone: 'supportive', tr: de.tr });
  assert.equal('titleCopy' in anon[0], false);
});

test("the member's language and units, as the server reads them", () => {
  assert.equal(memberLocaleCode({ locale: 'es' }), 'es');
  assert.equal(memberLocaleCode({ locale: 'pt-BR' }), 'pt-BR');
  assert.equal(memberLocaleCode({ locale: 'ar' }), 'en', 'a language the app does not ship yet reads as English');
  for (const doc of [{}, null, undefined, { locale: 7 }, { locale: '' }]) assert.equal(memberLocaleCode(doc), 'en');
  assert.equal(copyFor('xx', false).code, 'en');
  // ⚠ TWIN: the app's ShapeUnits normalises the same stored value (iosAppBroadsheet.jsx bsNormalizeUnits).
  const src = fs.readFileSync(path.join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), 'utf8');
  const m = /function bsNormalizeUnits\(v\) \{\n\s*return (.+) \? 'metric' : 'imperial';\n\}/.exec(src);
  assert.ok(m, 'bsNormalizeUnits moved');
  const app = new Function('v', `return ${m[1]};`);
  for (const v of ['Imperial · lb / mi', 'Metric · kg / km', 'metric', 'Metric', 'kg', 'km', 'imperial', 'lb', '', null, undefined, 0]) {
    assert.equal(bsUnitsMetric(v), app(v), String(v));
  }
});

test('the notify routes say a member\'s notices in their language and units, and a coach\'s alerts in theirs', () => {
  const core = fs.readFileSync(path.join(ROOT, 'src/lib/ai/notify-core.ts'), 'utf8');
  assert.match(core, /const line = Notify\.memberMoveLine\(directive, \{ tr: copy\?\.tr, locale: copy\?\.locale, metric: copy\?\.metric, tone: opts\.tone \}\);/);
  assert.match(core, /tr: copy\?\.tr,\n\s*locale: copy\?\.locale,\n\s*metric: copy\?\.metric,\n\s*\}\)\);/);
  assert.match(core, /habitReminderCandidates\(\{[^}]*tr: opts\.copy\?\.tr \}\)/);
  assert.match(core, /return copyFor\(memberLocaleCode\(localeDoc\), bsUnitsMetric\(settings && settings\.units\)\);/);
  assert.doesNotMatch(core, /speakableDirective/, 'the member push is built from the engine English again');
  for (const rel of ['src/app/api/ai/notify/route.ts', 'src/app/api/ai/notify/cron/route.ts']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(src, /readUserGoal\([^)]*'app_locale'\)/, rel);
    assert.match(src, /const copy = memberCopy\(localeDoc, settings\);/, rel);
    assert.match(src, /candidatesFor\(snapshot, \{.*\bthresholds, copy \}\)/, rel);
    assert.match(src, /decideAndClaim\([^;{]*\{[^}]*tr: copy\?\.tr \}/, rel);
  }
  // The server bundles a catalog for exactly the languages the app ships.
  const cats = fs.readFileSync(path.join(ROOT, 'src/lib/ai/memberCatalogs.ts'), 'utf8');
  const bundled = [...cats.matchAll(/catalogs\/([^/]+)\/home\.json'/g)].map((x) => x[1]);
  assert.deepEqual([...bundled].sort(), [...ACTIVE_LOCALES].sort());
  const keyed = [...cats.matchAll(/^  '([^']+)': \{ home: /gm)].map((x) => x[1]);
  assert.deepEqual([...keyed].sort(), [...ACTIVE_LOCALES].sort());
});

// The splash passes Home's helper as bsWireLines' opts.reason (iosAppBroadsheetMain.jsx, pinned in
// daily-wire.test.mjs), so for the same directive it says Home's sentence after the same head.
test('the Shape Daily splash says the sentence Home says, for every reason, in every locale', () => {
  const DAY0 = { signedIn: true, name: 'Q', training: { hasWorkout: false }, score: null, nutrition: null, streak: 0, coach: null };
  for (const loc of ACTIVE_LOCALES) {
    for (const c of CASES) {
      const d = dirOf(c);
      const home = say(d, loc, 'metric');
      intl = loc; units = 'metric';
      const tr = i18n.getFixedT(loc, 'onboarding');
      const lines = bsWireLines(DAY0, d, { tr, locale: loc, reason: (dir) => CARD.bsCiLeadReason(dir, tr) });
      const hot = (lines.find((l) => l.hot) || {}).text;
      const head = trIn(loc)(`home:lead.${d.lever}.head`).toLocaleUpperCase(loc);
      assert.equal(hot, `${head} — ${home.toLocaleUpperCase(loc)}`, `${loc} ${c.name}`);
    }
  }
});
