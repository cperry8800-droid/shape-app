// Shape Radio's listening stats (owner, 2026-10-30: "do we have any tracking for shape radio?", then
// "Yes build it"): the players' beats (public/newdesign/radioListening.mjs, on the website and in the
// app), the route that records them, the migration's rules, and the admin Overview's Radio tab.
// Run: node --test tests/radio-listening.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as L from '../public/newdesign/radioListening.mjs';
import * as R from '../src/lib/admin-radio.mjs';
import * as overview from '../src/lib/admin-overview.mjs';
import * as clicks from '../src/lib/admin-clicks.mjs';
import { trackingAllowed } from '../src/lib/signup-source.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
// The views compile to React.createElement with no import of their own.
globalThis.React = React;
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ── The players' beats ───────────────────────────────────────────────────────────────────
function clock() {
  let t = 1_000_000;
  const intervals = new Map();
  let next = 1;
  return {
    now: () => t,
    advance(ms) { t += ms; },
    timers: {
      setInterval(fn, ms) { const id = next++; intervals.set(id, { fn, ms }); return id; },
      clearInterval(id) { intervals.delete(id); },
    },
    intervals,
    fire() { for (const { fn } of [...intervals.values()]) fn(); },
  };
}
function beats({ allowed = () => true, send } = {}) {
  const c = clock();
  const sent = [];
  const b = L.createRadioListening({ surface: 'app', send: send || ((body) => sent.push(body)), allowed, now: c.now, timers: c.timers });
  return { b, c, sent };
}

test('a listen: a start beat, one a minute, an end with what played since the last', () => {
  const { b, c, sent } = beats();
  b.playing();
  assert.deepEqual(sent, [{ surface: 'app', seconds: 0 }], 'the start counts the tune-in, with no time yet');
  assert.equal([...c.intervals.values()][0].ms, L.RADIO_BEAT_MS);
  assert.equal(L.RADIO_BEAT_MS, 60_000);
  b.playing();
  assert.equal(sent.length, 1, 'playing again after a stall is the same listen');
  c.advance(60_000); c.fire();
  c.advance(61_400); c.fire();
  c.advance(20_000);
  b.stopped();
  assert.deepEqual(sent.slice(1), [{ surface: 'app', seconds: 60 }, { surface: 'app', seconds: 61 }, { surface: 'app', seconds: 20, end: true }]);
  assert.equal(c.intervals.size, 0, 'the minute beat stops with the stream');
  b.stopped(); c.fire();
  assert.equal(sent.length, 4, 'nothing more once stopped');
  assert.equal(b.listening(), false);
  b.playing();
  assert.deepEqual(sent.at(-1), { surface: 'app', seconds: 0 }, 'playing again is a new tune-in');
});

test('consent: nothing is sent without it, and a Reject mid-listen stops the beats, the end included', () => {
  const off = beats({ allowed: () => false });
  off.b.playing();
  off.c.advance(60_000); off.c.fire(); off.b.stopped();
  assert.deepEqual(off.sent, []);
  assert.equal(off.c.intervals.size, 0);
  let ok = true;
  const mid = beats({ allowed: () => ok });
  mid.b.playing();
  ok = false;
  mid.c.advance(60_000); mid.c.fire();
  mid.c.advance(5_000); mid.b.stopped();
  assert.deepEqual(mid.sent, [{ surface: 'app', seconds: 0 }]);
  assert.equal(mid.c.intervals.size, 0);
  // A send that throws never stops the player's own handlers.
  const bad = beats({ send: () => { throw new Error('offline'); } });
  assert.doesNotThrow(() => { bad.b.playing(); bad.c.fire(); bad.b.stopped(); });
});

test('the consent rule: the sign-up source\'s, read from the device; no rule counts nothing', () => {
  const win = (consent, gpc = false) => ({ localStorage: { getItem: () => consent }, navigator: { globalPrivacyControl: gpc } });
  assert.equal(L.listeningAllowed(win('accept'), trackingAllowed), true);
  assert.equal(L.listeningAllowed(win('reject'), trackingAllowed), false);
  assert.equal(L.listeningAllowed(win('accept', true), trackingAllowed), false, 'Global Privacy Control outranks an Accept');
  assert.equal(L.listeningAllowed(win('accept'), undefined), false, 'the rule\'s script not loaded');
  assert.equal(L.listeningAllowed(null, trackingAllowed), false);
  assert.equal(L.listeningAllowed({ get localStorage() { throw new Error('blocked'); }, navigator: {} }, () => true), true, 'unreadable storage is no choice');
  assert.equal(L.listeningAllowed(win('accept'), () => { throw new Error('x'); }), false);
  // It hands the rule exactly what trackingAllowed reads.
  let seen = null;
  L.listeningAllowed(win('accept', true), (o) => { seen = o; return true; });
  assert.deepEqual(Object.keys(seen).sort(), ['consent', 'gpc', 'timeZone']);
  assert.equal(seen.consent, 'accept');
  assert.equal(seen.gpc, true);
});

test('an audio element: a start when it plays; an end when it pauses, ends, fails, loses its source or the page goes', () => {
  for (const stop of ['pause', 'ended', 'error', 'emptied', 'pagehide']) {
    const audio = new EventTarget();
    audio.paused = false;
    const win = new EventTarget();
    const c = clock();
    const sent = [];
    L.attachRadioListening(audio, { surface: 'web', send: (b) => sent.push(b), allowed: () => true, now: c.now, timers: c.timers }, win);
    audio.dispatchEvent(new Event('playing'));
    c.advance(30_000);
    (stop === 'pagehide' ? win : audio).dispatchEvent(new Event(stop));
    assert.deepEqual(sent, [{ surface: 'web', seconds: 0 }, { surface: 'web', seconds: 30, end: true }], stop);
  }
  // A page restored from the back-forward cache, still playing, starts a listen again.
  const audio = new EventTarget();
  audio.paused = false;
  const win = new EventTarget();
  const sent = [];
  L.attachRadioListening(audio, { surface: 'web', send: (b) => sent.push(b), allowed: () => true, timers: clock().timers }, win);
  win.dispatchEvent(new Event('pageshow'));
  assert.equal(sent.length, 1);
  audio.paused = true;
  const quiet = new EventTarget();
  const none = [];
  L.attachRadioListening(audio, { surface: 'web', send: (b) => none.push(b), allowed: () => true, timers: clock().timers }, quiet);
  quiet.dispatchEvent(new Event('pageshow'));
  assert.equal(none.length, 0, 'a paused one does not');
});

test('both players count: the app on its radio audio, the website on its own, each with the session', () => {
  const app = read('mobile-app/src/services/shapeBackend.js');
  const audioFn = app.slice(app.indexOf('  function audio() {'), app.indexOf('  // ⚠ The station route is SIGNED-IN ONLY'));
  assert.match(audioFn, /attachRadioListening\(el, \{\n\s+surface: 'app',\n\s+allowed: \(\) => listeningAllowed\(window, trackingAllowed\),/);
  // Through the app's API fetch: its base in front and the live Bearer token, so the server knows the account.
  assert.match(audioFn, /shapeApiFetch\(RADIO_LISTEN_PATH, \{ method: 'POST', keepalive: true,/);
  assert.match(app, /^import \{ attachRadioListening, listeningAllowed, RADIO_LISTEN_PATH \} from '\.\.\/\.\.\/\.\.\/public\/newdesign\/radioListening\.mjs';$/m);
  assert.match(app, /^import \{ captureFromWindow, sourceFromWindow, trackingAllowed \} from '\.\.\/\.\.\/\.\.\/src\/lib\/signup-source\.mjs';$/m);

  const web = read('public/newdesign/radioInstrument.jsx');
  const made = web.slice(web.indexOf('      audio = new Audio();'), web.indexOf('      audioRef.current = audio;'));
  assert.match(made, /rdCountListening\(audio\);\n$/, 'attached where the element is made, once');
  const glue = web.slice(web.indexOf('function rdCountListening('), web.indexOf('function useRadioStation('));
  assert.match(glue, /surface: "web"/);
  assert.match(glue, /RL\.listeningAllowed\(window, window\.shapeClickCapture && window\.shapeClickCapture\.trackingAllowed\)/);
  assert.match(glue, /headers\.Authorization = "Bearer " \+ live\.access_token/);
  assert.match(glue, /credentials: "include", keepalive: true/);
  // click-capture.js publishes the rule the website reads (its equality with the module's is
  // tests/click-capture.test.mjs's and tests/consent-region.test.mjs's).
  assert.match(read('public/click-capture.js'), /trackingAllowed: trackingAllowed\n\s+\};\n\s+root\.shapeClickCapture = rules;/);
  const html = read('public/newdesign/Radio.html');
  assert.match(html, /<script type="module">import \* as RL from "\/newdesign\/radioListening\.mjs\?v=[0-9a-f]{10}"; window\.ShapeRadioListening = RL;<\/script>/);
  assert.ok(html.indexOf('radioListening.mjs') < html.indexOf('src="radioInstrument.jsx'), 'the module is handed over before the player loads');
  assert.equal(L.RADIO_LISTEN_PATH, '/api/analytics/radio-listen');
});

// ── The route ────────────────────────────────────────────────────────────────────────────
async function loadRoute({ user = null, rpcError = null } = {}) {
  const calls = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/analytics/radio-listen/route.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/gpc', await loadRealModule(join(ROOT, 'src/lib/gpc.ts'), { typescript: true })],
      ['@/lib/request-auth', { currentUser: async () => user }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true })],
      ['@/lib/supabase/admin', { createAdminClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: 60, error: rpcError }; } }) }],
    ]),
  });
  return { route, calls };
}
const post = (body, headers = {}) =>
  new Request('https://theshapecommunity.com/api/analytics/radio-listen', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('route: a beat is recorded with the account; the answer is always 204', async () => {
  const { route, calls } = await loadRoute({ user: { id: 'u-1' } });
  assert.equal((await route.POST(post({ surface: 'app', seconds: 59.6 }))).status, 204);
  assert.equal((await route.POST(post({ surface: 'web', seconds: 12, end: true }))).status, 204);
  const tz = process.env.ADMIN_TIMEZONE || 'America/New_York';
  assert.deepEqual(calls, [
    { name: 'record_radio_listen', args: { p_user: 'u-1', p_surface: 'app', p_seconds: 60, p_end: false, p_tz: tz } },
    { name: 'record_radio_listen', args: { p_user: 'u-1', p_surface: 'web', p_seconds: 12, p_end: true, p_tz: tz } },
  ]);
});

test('route: no account, Global Privacy Control or junk records nothing; a failed store is still 204', async () => {
  const visitor = await loadRoute();
  assert.equal((await visitor.route.POST(post({ surface: 'web', seconds: 0 }))).status, 204);
  assert.equal(visitor.calls.length, 0, 'the stream is members only: a beat with no account is not a listener');
  const { route, calls } = await loadRoute({ user: { id: 'u-1' } });
  assert.equal((await route.POST(post({ surface: 'app', seconds: 0 }, { 'sec-gpc': '1' }))).status, 204);
  for (const body of ['not json', [], null, { surface: 'tv', seconds: 1 }, { surface: 'app' }, { surface: 'app', seconds: -1 },
    { surface: 'app', seconds: 86401 }, { surface: 'app', seconds: '60' }, { surface: 'app', seconds: null }, `{"surface":"app","seconds":1,"x":"${'y'.repeat(2000)}"}`]) {
    assert.equal((await route.POST(post(body))).status, 204);
  }
  assert.equal(calls.length, 0);
  const failing = await loadRoute({ user: { id: 'u-1' }, rpcError: { message: 'function record_radio_listen does not exist' } });
  assert.equal((await failing.route.POST(post({ surface: 'app', seconds: 0 }))).status, 204);
  assert.equal(failing.calls.length, 1);
  // Only `true` ends a listen.
  await route.POST(post({ surface: 'app', seconds: 5, end: 'yes' }));
  assert.equal(calls[0].args.p_end, false);
});

test('route: it reads the caller through request-auth, so the installed app\'s Bearer token counts', () => {
  const src = stripComments(read('src/app/api/analytics/radio-listen/route.ts'));
  assert.match(src, /import \{ currentUser \} from '@\/lib\/request-auth';/);
  assert.doesNotMatch(src, /@\/lib\/supabase\/server/);
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/analytics\/radio-listen', 'POST'\],/);
});

// ── The migration ────────────────────────────────────────────────────────────────────────
test('migration: daily totals hold no account; the live note does, and only while listening', () => {
  const code = read('supabase-migrations/2026-10-30-radio-listening.sql').replace(/--.*$/gm, '');
  assert.match(code, /^\s*begin;/m);
  assert.match(code, /commit;\s*$/);
  const cols = (t) => [...(new RegExp(`create table if not exists public\\.${t} \\(([\\s\\S]*?)\\n\\);`).exec(code)[1]).matchAll(/^\s+(\w+)\s/gm)].map((m) => m[1]);
  assert.deepEqual(cols('radio_listen_days'), ['day', 'surface', 'audience', 'tune_ins', 'seconds', 'primary']);
  assert.deepEqual(cols('radio_listen_peaks'), ['day', 'listeners', 'at']);
  assert.deepEqual(cols('radio_listen_live'), ['listener', 'surface', 'audience', 'last_beat']);
  assert.match(code, /listener\s+uuid\s+primary key references auth\.users \(id\) on delete cascade/, 'a deleted account takes its note with it');
  for (const t of ['radio_listen_days', 'radio_listen_peaks', 'radio_listen_live']) {
    assert.match(code, new RegExp(`alter table public\\.${t} enable row level security;`), t);
    assert.match(code, new RegExp(`revoke all on table public\\.${t} from public, anon, authenticated;`), t);
  }
  assert.doesNotMatch(code, /create policy/, 'no policy: nobody reads it through the API');
  for (const sig of ['record_radio_listen\\(uuid, text, integer, boolean, text\\)', 'admin_radio_stats\\(integer, text\\)']) {
    assert.match(code, new RegExp(`revoke all on function public\\.${sig} from public, anon, authenticated;`), sig);
    assert.match(code, new RegExp(`grant execute on function public\\.${sig} to service_role;`), sig);
  }
  assert.match(code, /to_regprocedure\('public\.ui_click_day\(text\)'\) is null then\s+raise exception/, 'says which migration it needs');
  assert.match(code, /do \$guard\$/);
});

test('migration: a listener counts once, and never for more time than has passed', () => {
  const code = read('supabase-migrations/2026-10-30-radio-listening.sql').replace(/--.*$/gm, '');
  const fn = code.slice(code.indexOf('create or replace function public.record_radio_listen('), code.indexOf('create or replace function public.admin_radio_stats('));
  assert.match(fn, /if p_user is null or p_surface is null or p_surface not in \('web', 'app'\) then\s+return 0;/);
  assert.match(fn, /_rate_limit_bump\('fn:radio_listen:' \|\| p_user::text, 6, 60\)/);
  assert.match(fn, /delete from public\.radio_listen_live where last_beat < now\(\) - interval '30 minutes';/);
  // The first beat is the tune-in, and only when this account's note is new.
  assert.match(fn, /on conflict \(listener\) do nothing;\s+get diagnostics v_tune_in = row_count;/);
  assert.match(fn, /if coalesce\(p_end, false\) then\s+return 0;\s+end if;/, 'an end for a listen never seen adds nothing');
  assert.match(fn, /if v_audience is null then\s+return 0;/, 'no profile, no count');
  // A later beat: what the player says, never more than the time since this account's last beat (+2 s) or 10 minutes.
  assert.match(fn, /v_credit := least\(\s+greatest\(coalesce\(p_seconds, 0\), 0\),\s+floor\(extract\(epoch from \(now\(\) - v_last\)\)\)::integer \+ 2,\s+600\s+\);/);
  assert.match(fn, /if coalesce\(p_end, false\) then\s+delete from public\.radio_listen_live where listener = p_user;/, 'the note goes when the listen ends');
  // A trainer or a nutritionist is a coach (dietitians are nutritionists), as the tap counts read them.
  assert.match(fn, /when 'trainer' = any\(coalesce\(p\.roles, '\{\}'\)\) or 'nutritionist' = any\(coalesce\(p\.roles, '\{\}'\)\)\s+or p\.role in \('trainer', 'nutritionist'\) then 'coach'\s+else 'member'/);
  assert.match(fn, /where last_beat > now\(\) - interval '150 seconds'/);
  assert.match(fn, /where excluded\.listeners > pk\.listeners;/, 'a peak only ever rises');
  const stats = code.slice(code.indexOf('create or replace function public.admin_radio_stats('));
  assert.match(stats, /least\(greatest\(coalesce\(p_days, 30\), 1\), 365\)/);
  assert.match(stats, /l\.last_beat > now\(\) - interval '150 seconds'/, 'listening now is the same window');
  assert.doesNotMatch(stats, /listener[^s_]/, 'the console never reads an account');
});

test('purge: the daily rows after 12 months, a quiet note after 30 minutes', () => {
  const src = read('src/app/api/cron/analytics-purge/route.ts');
  assert.match(src, /from\('radio_listen_days'\)\.delete\(\)\.lt\('day', cutoff\.slice\(0, 10\)\)/);
  assert.match(src, /from\('radio_listen_peaks'\)\.delete\(\)\.lt\('day', cutoff\.slice\(0, 10\)\)/);
  assert.match(src, /from\('radio_listen_live'\)\.delete\(\)\.lt\('last_beat', new Date\(Date\.now\(\) - 30 \* 60 \* 1000\)\.toISOString\(\)\)/);
  assert.match(src, /\[clicks, listening, peaks, live\]\.map/, 'each one\'s failure is reported');
});

// ── The page's shaping ───────────────────────────────────────────────────────────────────
const STATS = {
  from: '2026-10-24', to: '2026-10-30', days: 7,
  tune_ins: 8, seconds: 9000,
  by_surface: { app: { tune_ins: 6, seconds: 6750 }, web: { tune_ins: 2, seconds: 2250 } },
  by_audience: { member: { tune_ins: 7, seconds: 8100 }, coach: { tune_ins: 1, seconds: 900 } },
  daily: [{ day: '2026-10-29', tune_ins: 3, seconds: 3000, peak: 2 }, { day: '2026-10-30', tune_ins: 5, seconds: 6000, peak: 3 }],
  peak: { listeners: 3, at: '2026-10-30T23:42:00Z', day: '2026-10-30' },
  now: { listeners: 2, web: 1, app: 1 },
};

test('admin-radio: the period, its link and the call', () => {
  assert.deepEqual(R.radioFilters({}), { days: 30 });
  assert.deepEqual(R.radioFilters({ days: '7' }), { days: 7 });
  assert.deepEqual(R.radioFilters({ days: ['90', '7'] }), { days: 90 });
  assert.deepEqual(R.radioFilters({ days: '365' }), { days: 30 });
  assert.equal(R.radioHref({ days: 30 }), '/admin?view=radio');
  assert.equal(R.radioHref({ days: 30 }, { days: 7 }), '/admin?view=radio&days=7');
  assert.deepEqual(R.radioStatsArgs({ days: 90 }, 'America/New_York'), { p_days: 90, p_tz: 'America/New_York' });
});

test('admin-radio: a listen\'s length as people say it', () => {
  assert.equal(R.listenTime(0), 'none');
  assert.equal(R.listenTime('x'), 'none');
  assert.equal(R.listenTime(45), 'under a minute');
  assert.equal(R.listenTime(89), '1 min');
  assert.equal(R.listenTime(2700), '45 min');
  assert.equal(R.listenTime(3599), '1 h 00 min');
  assert.equal(R.listenTime(11100), '3 h 05 min');
  assert.equal(R.listenTime(3600 * 1200), '1,200 h 00 min');
});

test('admin-radio: the summary, and an empty or broken answer reads as none', () => {
  const s = R.radioSummary(STATS);
  assert.equal(s.tuneIns, 8);
  assert.equal(s.seconds, 9000);
  assert.equal(s.average, 1125);
  assert.deepEqual(s.surfaces, { app: { tuneIns: 6, seconds: 6750 }, web: { tuneIns: 2, seconds: 2250 } });
  assert.deepEqual(s.audiences.coach, { tuneIns: 1, seconds: 900 });
  assert.deepEqual(s.daily[1], { day: '2026-10-30', tune_ins: 5, minutes: 100, peak: 3 });
  assert.deepEqual(s.peak, { listeners: 3, at: '2026-10-30T23:42:00Z', day: '2026-10-30' });
  assert.deepEqual(s.now, { listeners: 2, web: 1, app: 1 });
  assert.equal(R.listenShare(6750, 9000), '75%');
  assert.equal(R.listenShare(1, 0), '');
  const empty = R.radioSummary(null);
  assert.equal(empty.tuneIns, 0);
  assert.equal(empty.average, 0, 'no tune-ins: no average');
  assert.equal(R.radioSummary({ seconds: 120 }).average, 0, 'time without a tune-in (a listen begun before the period) has no average');
  assert.equal(empty.peak, null);
  assert.deepEqual(empty.daily, []);
  assert.equal(R.radioSummary({ peak: { listeners: 0 } }).peak, null, 'a peak of nobody is none');
  assert.equal(R.radioSummary({ tune_ins: 'NaN', daily: 'x', by_surface: 3 }).surfaces.app.seconds, 0);
});

// ── The Overview's Radio view ────────────────────────────────────────────────────────────
async function renderView({ searchParams = {}, result }) {
  const ui = await loadRealModule(join(ROOT, 'src/app/admin/ui.tsx'), { typescript: true });
  const link = { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) };
  const clicksView = await loadRealModule(join(ROOT, 'src/app/admin/ClicksView.tsx'), {
    typescript: true,
    registry: new Map([['next/link', link], ['@/lib/admin-overview.mjs', overview], ['@/lib/admin-clicks.mjs', clicks], ['./ui', ui]]),
  });
  const view = await loadRealModule(join(ROOT, 'src/app/admin/RadioView.tsx'), {
    typescript: true,
    registry: new Map([['@/lib/admin-overview.mjs', overview], ['@/lib/admin-radio.mjs', R], ['./ClicksView', clicksView], ['./ui', ui]]),
  });
  return renderToStaticMarkup(React.createElement(view.default, { filters: R.radioFilters(searchParams), result }));
}
const shown = (data) => ({ data, missing: false, failed: false });

test('view: listening now, the totals, the splits and the days', async () => {
  const html = await renderView({ searchParams: { days: '7' }, result: shown(STATS) });
  for (const want of ['How Shape Radio is listened to', 'Listening now', '1 in the app · 1 on the website', 'Tune-ins', '2 h 30 min',
    'Average listen', '19 min', 'Most at once', 'In the app', '75% of the time · 6 tune-ins', 'Coaches', '10% of the time · 1 tune-in<',
    'Minutes listened a day', 'Tune-ins a day', 'most at once 3', 'How listening is counted']) {
    assert.ok(html.includes(want), want);
  }
  assert.ok(html.includes('href="/admin?view=radio&amp;days=7" aria-current="page"'), 'the open period is marked');
  assert.ok(html.includes('href="/admin?view=radio"'), 'the default period links without a query');
  assert.ok(!/NaN|undefined/.test(html));
});

test('view: nobody yet, a missing migration and a failed read each say so', async () => {
  const none = await renderView({ result: shown({ ...STATS, tune_ins: 0, seconds: 0, daily: [], peak: null, now: {} }) });
  assert.ok(none.includes('Nobody has listened in these days yet.'));
  assert.ok(none.includes('Nobody right now') && none.includes('No listening yet'));
  assert.ok(!none.includes('Minutes listened a day'));
  const missing = await renderView({ result: { data: null, missing: true, failed: false } });
  assert.ok(missing.includes('2026-10-30-radio-listening.sql'));
  assert.ok(!missing.includes('Listening now'));
  const failed = await renderView({ result: { data: STATS, missing: false, failed: true } });
  assert.ok(failed.includes('could not be loaded') && !failed.includes('2 h 30 min'), 'a failed read shows nothing it read');
});

test('view: a tab on the Overview, read only when open', () => {
  assert.deepEqual(overview.OVERVIEW_VIEWS.find((v) => v.key === 'radio'), { key: 'radio', label: 'Radio', sections: [], blurb: 'Who listens to Shape Radio, and for how long' });
  assert.equal(overview.viewHref('radio'), '/admin?view=radio');
  const page = read('src/app/admin/page.tsx');
  assert.match(page, /clicks \|\| radio \? Promise\.resolve\(\{ stats: null, missing: false, failed: false \}\) : loadStats\(\),/);
  assert.match(page, /radio \? loadRadio\(radioView\) : Promise\.resolve\(null\),/);
  assert.match(page, /rpc\('admin_radio_stats', radioStatsArgs\(filters, TIMEZONE\)\)/);
  assert.match(page, /\{radioResult && <RadioView filters=\{radioView\} result=\{radioResult\} \/>\}/);
});

// ── What the policy says ─────────────────────────────────────────────────────────────────
test('privacy: §10 lists the listening counts, §7 says GPC stops them, and the policy is re-dated', async () => {
  const privacy = read('public/privacy.html');
  const s10 = privacy.slice(privacy.indexOf('<section class="section" id="s6">'), privacy.indexOf('</section>', privacy.indexOf('id="s6"')));
  assert.match(s10, /<strong>Analytics — Shape Radio listening:<\/strong> when you play Shape Radio on this website or in the app/);
  for (const promise of ['daily totals, split only by website or app and by member or coach', 'we keep a note that your account is listening',
    'it is deleted when you stop, or within a day', 'No account, device identifier or IP address is kept with a count', 'nothing about what was playing',
    'Global Privacy Control', 'not until you accept our cookie banner', 'kept for 12 months']) {
    assert.ok(s10.includes(promise), promise);
  }
  assert.match(privacy, /with GPC on, they keep no record of the link that brought you, count no taps or Shape Radio listening, and send none of our own usage stats/);
  const legal = await loadRealModule(join(ROOT, 'src/lib/legal-acceptance.ts'), { typescript: true, registry: new Map([['@/lib/supabase/admin', {}]]) }).catch(() => null);
  const versions = legal ? legal.PRIVACY_VERSIONS : JSON.parse(/PRIVACY_VERSIONS: readonly string\[\] = (\[[^\]]*\])/.exec(read('src/lib/legal-acceptance.ts'))[1].replace(/'/g, '"'));
  assert.ok(versions.at(-1) > '2026-10-29', 'a new privacy text is a new version');
});
