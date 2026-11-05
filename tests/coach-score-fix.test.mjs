// The coach score counts sessions that have happened and programs that are published (2026-11-05).
//
// ⚠ TWO TERMS COUNTED THE WRONG ROWS. Session completion divided the completed sessions by every
// session scheduled from 90 days ago on (upcoming, cancelled and declined ones included), and
// "Programs published" counted client_workouts rows: every assigned day for every client. Now:
//   completion = completed / (completed + missed), over the 90 days up to now, where missed is a
//                confirmed session nobody marked complete a day after it was due;
//   programs   = the trainer's published programs in their library (coach_plans), single-day
//                workouts left out.
// The route runs for real over a fake database; the migration's two functions are read for the same
// terms; and the Score pages' note shows for 30 days from the fix, the website's and the app's dates
// held equal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const COACH = { id: '33333333-3333-4333-8333-333333333333' };
const OTHER = '44444444-4444-4444-8444-444444444444';
const H = 3600_000, DAY = 24 * H;
const at = (msAgo) => new Date(Date.now() - msAgo).toISOString();

async function score(tables, { role = 'trainer', fail = [] } = {}) {
  const db = fakeSupabase({ tables, fail });
  const ts = (p, registry = new Map()) => loadRealModule(join(ROOT, p), { typescript: true, registry });
  const route = await ts('src/app/api/coach/score/route.ts', new Map([
    ['next/server', nextServer],
    ['@/lib/request-auth', { clientForRequest: async () => db, userLookupForRequest: async () => ({ user: COACH, error: null }) }],
    ['@/lib/auth-lookup', await ts('src/lib/auth-lookup.ts')],
    ['@/lib/read-all-by-id', await ts('src/lib/read-all-by-id.ts')],
    ['@/lib/coach-trajectory.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href)],
  ]));
  const err = console.error; console.error = () => {};
  try {
    const res = await route.GET(new Request(`https://shape.test/api/coach/score?role=${role}`));
    return { status: res.status, body: await res.json(), calls: db._calls };
  } finally { console.error = err; }
}

const sess = (status, msAgo, o = {}) => ({ id: 's' + Math.random(), provider_id: 7, provider_role: 'trainer', status, scheduled_at: at(msAgo), ...o });
const plan = (o = {}) => ({ id: 'p' + Math.random(), owner_id: COACH.id, kind: 'program', published: true, detail: { buildType: 'program' }, ...o });
// A trainer with three clients, the past three months of sessions, a library and a calendar.
const PRACTICE = () => ({
  trainers: [{ id: 7, owner_id: COACH.id }],
  nutritionists: [{ id: 9, owner_id: COACH.id }],
  subscriptions: ['c1', 'c2', 'c3'].map((c, i) => ({ id: 'u' + i, client_id: c, provider_id: 7, provider_role: 'trainer', status: 'active' })),
  sessions: [
    sess('completed', 5 * DAY), sess('completed', 20 * DAY), sess('completed', 60 * DAY),   // kept
    sess('confirmed', 3 * DAY),                                                           // missed: unmarked, three days on
    sess('confirmed', 2 * H),                                                             // an hour ago: not missed yet
    sess('confirmed', -2 * DAY), sess('requested', -5 * DAY),                             // still ahead
    sess('cancelled', 10 * DAY), sess('declined', 12 * DAY), sess('requested', 15 * DAY), // never held
    sess('completed', 100 * DAY),                                                         // before the 90 days
    sess('completed', 5 * DAY, { provider_id: 8 }),                                       // another listing's
  ],
  coach_plans: [
    plan(), plan({ detail: { buildType: 'plan' } }), plan({ detail: {} }),    // three programs
    plan({ detail: { buildType: 'workout' } }),                               // one day: a workout
    plan({ published: false }),                                               // a draft
    plan({ kind: 'meal_plan', detail: { buildType: 'program' } }),            // a nutrition plan
    plan({ owner_id: OTHER }),                                                // someone else's
  ],
  // One 12-week, three-day program assigned to one client: 36 rows, which the old term counted.
  client_workouts: Array.from({ length: 36 }, (_, i) => ({ id: 'w' + i, trainer_id: 7, client_id: 'c1', status: 'published' })),
});

test('completion is kept over held, and held is completed plus missed: nothing ahead, nothing never held', async () => {
  const r = await score(PRACTICE());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const done = r.body.breakdown.find((b) => b.label === 'Session completion');
  assert.equal(done.sub, '75% · last 90d', 'three kept of four held; the old count was 3 of 10, 30%');
  assert.equal(done.points, 750);
});

test('programs published are the library\'s published programs, not the assigned days', async () => {
  const r = await score(PRACTICE());
  const progs = r.body.breakdown.find((b) => b.label === 'Programs published');
  assert.equal(progs.sub, '3 live', 'a program, a plan and an older row with no buildType; never 36 assigned days');
  assert.equal(progs.points, 240);
  assert.ok(!r.calls.some((c) => c.table === 'client_workouts'), 'the assigned days are not read at all');
  assert.equal(r.body.total, 150 + 750 + 240);
  assert.equal(r.body.current_tier, 'Pro', 'the old formula put this practice at 3,330, an Elite');
});

test('a coach with only upcoming sessions has no completion yet, not a low one', async () => {
  const t = PRACTICE();
  t.sessions = [sess('confirmed', -1 * DAY), sess('confirmed', -8 * DAY), sess('requested', -3 * DAY)];
  const r = await score(t);
  assert.equal(r.body.breakdown.find((b) => b.label === 'Session completion').sub, '0% · last 90d');
  // ... and one kept session is 100%, however many are booked ahead.
  t.sessions.push(sess('completed', 2 * DAY));
  assert.equal((await score(t)).body.breakdown.find((b) => b.label === 'Session completion').sub, '100% · last 90d');
});

test('a nutritionist\'s score reads no programs; a failed read of the library is a failed score, not 0', async () => {
  const t = PRACTICE();
  t.sessions = t.sessions.map((s) => ({ ...s, provider_role: 'nutritionist', provider_id: s.provider_id === 7 ? 9 : s.provider_id }));
  const n = await score(t, { role: 'nutritionist' });
  assert.equal(n.status, 200);
  assert.deepEqual(n.body.breakdown.map((b) => b.label), ['Active clients', 'Session completion']);
  assert.ok(!n.calls.some((c) => c.table === 'coach_plans'));
  assert.equal(n.body.breakdown[1].sub, '75% · last 90d');
  const failed = await score(PRACTICE(), { fail: ['coach_plans'] });
  assert.equal(failed.status, 500);
});

// ── The migration ──
const SQL = readFileSync(join(ROOT, 'supabase-migrations/2026-11-05-coach-score-past-sessions.sql'), 'utf8');
const code = SQL.replace(/--[^\n]*/g, '');
const body = (name) => {
  const from = code.indexOf(`create or replace function public.${name}(`);
  assert.ok(from >= 0, name);
  return code.slice(from, code.indexOf('$function$;', from));
};

test('the directory and the leaderboard count the same past sessions and published programs', () => {
  for (const name of ['get_coach_scores', 'shape_coach_score_parts']) {
    const b = body(name);
    // Past sessions: the 90 days up to now; completed, or confirmed and unmarked a day after.
    assert.match(b, /and s\.scheduled_at >= \(now\(\) - interval '90 days'\)\s+and s\.scheduled_at < now\(\)/, name);
    assert.match(b, /count\(\*\) filter \(where s\.status = 'completed'\s+or \(s\.status = 'confirmed' and s\.scheduled_at < now\(\) - interval '24 hours'\)\) as total/, name);
    assert.match(b, /count\(\*\) filter \(where s\.status = 'completed'\) as completed/, name);
    // Published programs, by the listing's owner.
    assert.match(b, /join public\.coach_plans p on p\.owner_id = (t|l)\.owner_id/, name);
    assert.match(b, /and p\.kind = 'program'\s+and p\.published\s+and coalesce\(p\.detail->>'buildType', 'program'\) <> 'workout'/, name);
    assert.doesNotMatch(b, /client_workouts/, name + ': still counts assigned days');
    // The clients term and the formula are unchanged.
    assert.match(b, /count\(distinct coalesce\(s\.client_id::text, 'sub:' \|\| s\.id::text\)\)\s+filter \(where s\.status in \('active', 'trialing', 'past_due'\)\) as active_clients/, name);
    assert.match(b, /set search_path = public, pg_temp/, name);
  }
  assert.match(body('get_coach_scores'), /round\(\(sess\.completed::numeric \/ sess\.total\) \* 100\) \* 10\s+else 0\s+end\s+\+ coalesce\(progs\.n, 0\) \* 80/);
  assert.match(body('shape_coach_score_parts'), /active_clients \* 50 \+ completion_pct \* 10 \+ programs \* 80/);
  assert.match(body('get_coach_scores'), /language plpgsql\s+stable\s+security definer/);
  assert.doesNotMatch(body('shape_coach_score_parts'), /security definer/);
  assert.doesNotMatch(code, /^\s*(grant|revoke|drop function|alter function)\b/im, 'create or replace keeps owner and grants');
  assert.match(code, /^begin;/m);
  assert.match(code, /do \$check\$[\s\S]*does not count past sessions only[\s\S]*does not count published programs[\s\S]*\$check\$;\s*commit;/);
});

test('the route keeps the same terms, and says where its twin lives', () => {
  const route = readFileSync(join(ROOT, 'src/app/api/coach/score/route.ts'), 'utf8');
  assert.match(route, /KEEP IN SYNC with supabase-migrations\/2026-11-05-coach-score-past-sessions\.sql/);
  assert.match(route, /const SCORE_MISSED_AFTER_MS = 24 \* 3600 \* 1000;/, 'the same day of grace as the SQL');
  assert.match(route, /\.eq\('status', 'completed'\)\s+\.gte\('scheduled_at', since90Iso\)\s+\.lt\('scheduled_at', nowIso\)/);
  assert.match(route, /\.eq\('status', 'confirmed'\)\s+\.gte\('scheduled_at', since90Iso\)\s+\.lt\('scheduled_at', graceIso\)/);
  assert.match(route, /\.from\('coach_plans'\)[\s\S]{0,200}\.eq\('kind', 'program'\)\s+\.eq\('published', true\)\s+\.or\('detail->>buildType\.is\.null,detail->>buildType\.neq\.workout'\)/);
});

// ── The note on the Score pages ──
const LB = readFileSync(join(ROOT, 'public/newdesign/leaderboards.jsx'), 'utf8');
const webOn = /const COACH_SCORE_FIX_ON = "(\d{4}-\d{2}-\d{2})";/.exec(LB)[1];
const lift = (text, name) => { const a = text.indexOf('function ' + name + '('); const rest = text.slice(a); return rest.slice(0, rest.search(/\n(?:function |const |\/\/ )/)); };
const coachScoreFixNote = new Function('COACH_SCORE_FIX_ON', 'COACH_SCORE_FIX_DAYS', lift(LB, 'coachScoreFixNote') + '\nreturn coachScoreFixNote;')(webOn, Number(/const COACH_SCORE_FIX_DAYS = (\d+);/.exec(LB)[1]));
const app = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSScoreFixNote.jsx'), { registry: new Map([['react', require_('react')]]) });

test('the website and the app date the fix to the same day', () => {
  assert.equal(app.BS_SCORE_FIX_ON, webOn);
  assert.equal(app.BS_SCORE_FIX_DAYS, 30);
});

test('the note shows for 30 days from the fix, and says what changed in the coach\'s role', () => {
  const start = Date.parse(webOn + 'T00:00:00Z');
  const day = new Date(start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  assert.equal(coachScoreFixNote('trainer', start), `We corrected how Score counts sessions and programs on ${day}. Your score may have moved.`);
  assert.equal(coachScoreFixNote('nutritionist', start + 29 * DAY), `We corrected how Score counts sessions on ${day}. Your score may have moved.`);
  assert.equal(coachScoreFixNote('trainer', start - 1), null, 'not before');
  assert.equal(coachScoreFixNote('trainer', start + 30 * DAY), null, 'gone after 30 days');
  assert.equal(app.bsScoreFixShown(start), true);
  assert.equal(app.bsScoreFixShown(start + 30 * DAY - 1), true);
  assert.equal(app.bsScoreFixShown(start + 30 * DAY), false);
  assert.equal(app.bsScoreFixShown(start - 1), false);
});

test('the app\'s line says the date in the app\'s language, and nothing outside the 30 days', () => {
  const React = require_('react');
  const { renderToStaticMarkup } = require_('react-dom/server');
  const hadWindow = 'window' in globalThis;
  const saved = globalThis.window;
  const start = Date.parse(webOn + 'T00:00:00Z');
  const t = { HAIR: '#ccc', DISPLAY: 'serif', INK70: '#333' };
  const text = (props) => renderToStaticMarkup(React.createElement(app.BSScoreFixNote, { t, ...props })).replace(/<[^>]+>/g, '');
  try {
    // No catalog loaded: the English default, its {date} filled in.
    globalThis.window = {};
    const en = new Date(start).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    assert.equal(text({ role: 'trainer', now: start + DAY }), `We corrected how Score counts sessions and programs on ${en}. Your score may have moved.`);
    assert.equal(text({ role: 'nutritionist', now: start + DAY }), `We corrected how Score counts sessions on ${en}. Your score may have moved.`);
    assert.equal(text({ role: 'trainer', now: start + 30 * DAY }), '', 'gone after 30 days');
    // A German coach: the catalog's line, the date in German.
    const de = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/de/score.json'), 'utf8'));
    globalThis.window = {
      ShapeLocale: { get: () => 'de' },
      ShapeI18n: { t: (key, o) => (key === 'score:coach.fixNote' ? de['coach.fixNote'].replace('{date}', o.date) : key) },
    };
    const deDate = new Date(start).toLocaleDateString('de', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    assert.equal(text({ role: 'trainer', now: start + DAY }), de['coach.fixNote'].replace('{date}', deDate));
  } finally {
    if (hadWindow) globalThis.window = saved; else delete globalThis.window;
  }
});

test('both Score pages print it on a coach\'s own score only; the app prints it under the breakdown', () => {
  for (const [page, role] of [['trainerScorePage.jsx', 'trainer'], ['nutritionistScorePage.jsx', 'nutritionist']]) {
    const src = readFileSync(join(ROOT, 'public/newdesign', page), 'utf8');
    assert.ok(src.includes(`const fixNote = read.state === "ok" && typeof coachScoreFixNote === "function" ? coachScoreFixNote("${role}") : null;`), page);
    assert.match(src, /\{fixNote && <div role="note" data-score-fix/, page);
  }
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /import \{ BSScoreFixNote \} from '\.\/BSScoreFixNote\.jsx';/);
  assert.match(client, /\{profile\.live && <BSScoreFixNote role=\{profile\.coachRole\} t=\{t\} \/>\}/);
});

test('the app\'s line is in all 13 languages, each with its date', () => {
  const langs = ['en', 'de', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi'];
  for (const l of langs) {
    const cat = JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/${l}/score.json`), 'utf8'));
    for (const k of ['coach.fixNote', 'coach.fixNoteNutri']) {
      assert.equal(typeof cat[k], 'string', `${l} ${k}`);
      assert.match(cat[k], /\{date\}/, `${l} ${k} names the date`);
    }
    if (l !== 'en') assert.notEqual(cat['coach.fixNote'], JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/score.json'), 'utf8'))['coach.fixNote'], l + ' is translated');
  }
});
