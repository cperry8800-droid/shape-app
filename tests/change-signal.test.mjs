// tests/change-signal.test.mjs
//
// The notification row as the change signal (P7; owner, 2026-11-05: "the website and app need to fully
// communicate", and "clients workouts and programs should automatically get sent to app… they shouldnt
// have to manually push send to phone"). A coach's publish already writes a `workout` notice, a meal
// plan a `meal_plan` notice, a session change a `session_*` notice and a message a `message` notice,
// and `notifications` is in supabase_realtime. Pinned here:
//   - which screens each notice is about (changeScopesOf);
//   - a burst of notices is one read (createChangeBatcher), and the foreground or a reconnect is "*";
//   - the announcement reaches only the screens it names, and the hook's number moves only for those;
//   - the realtime feed announces what lands for its own account, and "*" after a dropped channel;
//   - the app feeds its one notifications subscription into the batcher and reads again in the
//     foreground; Home, Train, Eat, the thread list and the coach screens read on their scopes;
//   - the website's five live pages start the feed, and its readers read on their scopes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL, CHANGE_BATCH_MS, CHANGE_SCOPES, SHAPE_CHANGE_EVENT, FOREGROUND_MIN_AWAY_MS,
  announceChange, changeConcerns, changeRevHook, changeScopesOf, createChangeBatcher, foregroundGate, onShapeChange, startChangeFeed, startWebsiteChangeFeed,
} from '../public/newdesign/changeSignal.mjs';
import * as appReexport from '../mobile-app/src/services/changeSignal.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (p) => stripComments(read(p));
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/' });

test('the app re-exports the one module', () => {
  assert.equal(appReexport.changeScopesOf, changeScopesOf);
  assert.equal(appReexport.createChangeBatcher, createChangeBatcher);
});

test('each notice is about the screens that show what it changed, and nothing else', () => {
  assert.deepEqual(changeScopesOf({ type: 'workout' }), ['training']);
  assert.deepEqual(changeScopesOf({ type: 'program' }), ['training']);
  assert.deepEqual(changeScopesOf({ type: 'meal_plan' }), ['meals']);
  assert.deepEqual(changeScopesOf({ type: 'grocery' }), ['meals']);
  for (const t of ['session_booked', 'session_confirmed', 'session_cancelled', 'session_rescheduled', 'session_declined', 'session_paid', 'booking_request', 'intro_followup']) {
    assert.deepEqual(changeScopesOf({ type: t }), ['sessions'], t);
  }
  // A session notice added later (a member's cancel, P5) is about sessions too.
  assert.deepEqual(changeScopesOf({ type: 'session_member_cancelled' }), ['sessions']);
  assert.deepEqual(changeScopesOf({ type: 'message', data: { side: 'client' } }), ['messages']);
  assert.deepEqual(changeScopesOf({ type: 'checkin_submitted' }), ['checkins']);
  assert.deepEqual(changeScopesOf({ type: 'new_client' }), ['clients']);
  for (const t of ['ai_client_red', 'payment_receipt', 'follow', 'credential_verified', 'score_accountability']) {
    assert.deepEqual(changeScopesOf({ type: t }), [], t);
  }
  assert.deepEqual(changeScopesOf(null), []);
  assert.deepEqual(changeScopesOf({}), []);
  // A returned list is the caller's: changing it never changes the table.
  const a = changeScopesOf({ type: 'workout' });
  a.push('meals');
  assert.deepEqual(changeScopesOf({ type: 'workout' }), ['training']);
});

test('a burst of notices is one read with every scope in it; "*" swallows its batch', () => {
  const timers = [];
  const emitted = [];
  const b = createChangeBatcher((s) => emitted.push(s), {
    delayMs: 50,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  assert.equal(b.push([]), false, 'nothing usable starts no timer');
  assert.equal(b.push(['nonsense']), false);
  assert.equal(timers.length, 0);
  b.push(['training']);
  b.push(['training']);
  b.push(['meals']);
  assert.equal(timers.length, 1, 'one timer for the burst');
  assert.equal(timers[0].ms, 50);
  assert.deepEqual(emitted, [], 'nothing before the timer');
  timers[0].fn();
  assert.deepEqual(emitted, [['training', 'meals']]);
  b.push(['sessions']);
  b.push([ALL]);
  b.push(['messages']);
  b.flush();
  assert.deepEqual(emitted[1], [ALL]);
  b.flush();
  assert.equal(emitted.length, 2, 'an empty flush emits nothing');
  b.stop();
  assert.equal(b.push(['training']), false, 'stopped');
  assert.equal(CHANGE_BATCH_MS > 0 && CHANGE_BATCH_MS <= 2000, true);
});

test('a listener that throws never stops the next batch', () => {
  let calls = 0;
  const b = createChangeBatcher(() => { calls += 1; throw new Error('boom'); }, { delayMs: 0, setTimer: () => 1, clearTimer: () => {} });
  b.push(['training']);
  b.flush();
  b.push(['meals']);
  b.flush();
  assert.equal(calls, 2);
});

test('an announcement reaches the screens it names; "*" reaches every screen', () => {
  const w = dom.window;
  const heard = [];
  const off = onShapeChange(['training'], (d) => heard.push(d), w);
  assert.equal(announceChange(['meals'], w), true);
  assert.deepEqual(heard, []);
  announceChange(['meals', 'training'], w, 'notice');
  assert.equal(heard.length, 1);
  assert.deepEqual(heard[0].scopes, ['meals', 'training']);
  assert.equal(heard[0].reason, 'notice');
  announceChange([ALL], w, 'foreground');
  assert.equal(heard.length, 2);
  assert.equal(heard[1].reason, 'foreground');
  off();
  announceChange([ALL], w);
  assert.equal(heard.length, 2, 'unsubscribed');
  assert.equal(announceChange([], w), false);
  assert.equal(announceChange(['training'], null), false);
  // A bare event of the same name names nothing.
  const off2 = onShapeChange(['training'], (d) => heard.push(d), w);
  w.dispatchEvent(new w.Event(SHAPE_CHANGE_EVENT));
  assert.equal(heard.length, 2);
  off2();
  assert.equal(changeConcerns(['messages'], ['sessions', 'messages']), true);
  assert.equal(changeConcerns([ALL], ['sessions']), true);
  assert.equal(changeConcerns(['sessions'], []), false);
  assert.ok(CHANGE_SCOPES.includes('training') && !CHANGE_SCOPES.includes(ALL));
});

test('the hook, mounted: its number moves on its own scopes only, and it lets go on unmount', async () => {
  const prev = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    const React = require_('react');
    const { createRoot } = require_('react-dom/client');
    const { act } = React;
    const useRev = changeRevHook(React);
    const seen = [];
    function Probe() { seen.push(useRev(['training', 'sessions'])); return null; }
    const el = dom.window.document.createElement('div');
    const root = createRoot(el);
    await act(async () => { root.render(React.createElement(Probe)); });
    assert.equal(seen[seen.length - 1], 0);
    await act(async () => { announceChange(['meals'], dom.window); });
    assert.equal(seen[seen.length - 1], 0, 'not its scope');
    await act(async () => { announceChange(['sessions'], dom.window); });
    assert.equal(seen[seen.length - 1], 1);
    await act(async () => { announceChange([ALL], dom.window); });
    assert.equal(seen[seen.length - 1], 2);
    await act(async () => { root.unmount(); });
    const n = seen.length;
    announceChange([ALL], dom.window);
    assert.equal(seen.length, n, 'unmounted');
  } finally {
    globalThis.window = prev.window;
    globalThis.document = prev.document;
  }
});

test('the foreground reads again only after a real absence', () => {
  assert.equal(foregroundGate(null, 1000), false, 'never hidden');
  assert.equal(foregroundGate(0, FOREGROUND_MIN_AWAY_MS - 1), false);
  assert.equal(foregroundGate(0, FOREGROUND_MIN_AWAY_MS), true);
  assert.equal(foregroundGate(5, 5 + 60_000, 30_000), true);
});

function fakeClient() {
  const ch = { handlers: [], status: null, removed: false };
  const client = {
    channels: [],
    channel(name) {
      ch.name = name;
      const chain = {
        on(kind, filter, fn) { ch.handlers.push({ kind, filter, fn }); return chain; },
        subscribe(cb) { ch.status = cb; return chain; },
      };
      client.channels.push(chain);
      return chain;
    },
    removeChannel() { ch.removed = true; },
  };
  return { client, ch };
}

test('the feed announces what lands for its own account, and "*" after the channel dropped', async () => {
  const w = dom.window;
  const { client, ch } = fakeClient();
  const heard = [];
  const off = onShapeChange(['training', 'sessions'], (d) => heard.push(d), w);
  const stop = startChangeFeed({ client, userId: 'u1', target: w, delayMs: 5 });
  assert.equal(ch.handlers.length, 1);
  assert.equal(ch.handlers[0].filter.table, 'notifications');
  assert.equal(ch.handlers[0].filter.event, 'INSERT');
  assert.equal(ch.handlers[0].filter.filter, 'user_id=eq.u1');
  ch.status('SUBSCRIBED');
  ch.handlers[0].fn({ new: { user_id: 'u1', type: 'workout' } });
  ch.handlers[0].fn({ new: { user_id: 'u1', type: 'workout' } });
  ch.handlers[0].fn({ new: { user_id: 'someone-else', type: 'session_booked' } });
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(heard.length, 1, 'one read for the burst');
  assert.deepEqual(heard[0].scopes, ['training']);
  // The channel drops and comes back: anything written meanwhile never arrives, so everything reads.
  ch.status('CHANNEL_ERROR');
  ch.status('SUBSCRIBED');
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(heard.length, 2);
  assert.deepEqual(heard[1].scopes, [ALL]);
  assert.equal(heard[1].reason, 'reconnect');
  stop();
  assert.equal(ch.removed, true);
  off();
  assert.equal(typeof startChangeFeed({ client: null, userId: 'u1' }), 'function', 'no client, a no-op stop');
  assert.equal(typeof startChangeFeed({ client, userId: '' }), 'function', 'no account, a no-op stop');
});

test('the website feed starts once per page, on the signed-in account', async () => {
  const { client, ch } = fakeClient();
  const authCbs = [];
  client.auth = { onAuthStateChange: (cb) => authCbs.push(cb) };
  const w = { shapeDb: { client, getUser: async () => ({ id: 'u9' }) }, dispatchEvent() {}, CustomEvent: dom.window.CustomEvent };
  const h = await startWebsiteChangeFeed(w);
  assert.ok(h && typeof h.stop === 'function');
  assert.equal(ch.handlers[0].filter.filter, 'user_id=eq.u9');
  assert.equal(await startWebsiteChangeFeed(w), h, 'once per page');
  assert.equal(authCbs.length, 1);
  assert.equal(await startWebsiteChangeFeed({}, { tries: 2, everyMs: 1 }), null, 'no account client');
  h.stop();
});

test('a page without /supabase.js waits for pageShell\'s loader, and bridges the cookie session', async () => {
  const { client, ch } = fakeClient();
  client.auth = { onAuthStateChange: () => {} };
  const order = [];
  const db = { client, getSession: async () => { order.push('session'); }, getUser: async () => { order.push('user'); return { id: 'u7' }; } };
  const w = { dispatchEvent() {}, CustomEvent: dom.window.CustomEvent };
  setTimeout(() => { w.shapeEnsureDb = async () => db; }, 5);
  const h = await startWebsiteChangeFeed(w, { tries: 50, everyMs: 2 });
  assert.ok(h);
  assert.deepEqual(order, ['session', 'user']);
  assert.equal(ch.handlers[0].filter.filter, 'user_id=eq.u7');
  h.stop();
});

test('the app feeds its one notifications subscription into the batcher, and reads again in the foreground', () => {
  const main = code('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /from '\.\.\/services\/changeSignal\.mjs'/);
  // The notice feeds the batcher before the toast's own checks, so a switched-off toast still refreshes.
  assert.match(main, /window\.ShapeNotifications\.subscribe\(\(n\) => \{\s*if \(n\) changes\.push\(changeScopesOf\(n\)\);\s*if \(!n \|\| !n\.title\) return;/);
  assert.match(main, /createChangeBatcher\(\(scopes\) => \{[\s\S]{0,200}ShapeMetrics\?\.invalidate[\s\S]{0,120}announceChange\(scopes, window, 'notice'\)/);
  assert.match(main, /changes\.stop\(\)/);
  // Only one subscribe to the notifications channel in the shell (a second would get the joined channel back).
  assert.equal((main.match(/ShapeNotifications\.subscribe\(/g) || []).length, 1);
  assert.match(main, /foregroundGate\(hiddenAt, Date\.now\(\)\)[\s\S]{0,300}ShapeMetrics\?\.invalidate[\s\S]{0,200}announceChange\(\[BS_CHANGE_ALL\], window, 'foreground'\)/);
});

test('Home, Train, Eat, the thread list and the coach screens read on their scopes', () => {
  const client = code('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /const useBSChangeRev = changeRevHook\(React\);/);
  assert.match(client, /const homeChangeRev = useBSChangeRev\(\['training', 'meals', 'sessions', 'goals'\]\);/);
  // Home's plan read, its engine move, the check-in, the ticker and the score read again.
  assert.ok((client.match(/\}, \[homeChangeRev\]\);/g) || []).length >= 4);
  assert.match(client, /refreshAnalytics\(\); \}, \[refreshAnalytics, homeChangeRev\]\)/);
  // Train reads again leaving the member's day where it is.
  assert.match(client, /const trainChangeRev = useBSChangeRev\(\['training'\]\);\s*React\.useEffect\(\(\) => \{ if \(trainChangeRev\) loadPlan\(\{ keepDay: true \}\); \}, \[trainChangeRev\]\);/);
  assert.match(client, /if \(!keepDay\) setDay\(bsWeekdayIdx\(\)\)/);
  // Eat: the plan past the cache, the title swaps and the day plan.
  assert.match(client, /const eatChangeRev = useBSChangeRev\(\['meals'\]\);/);
  assert.match(client, /if \(eatPlanReads \|\| eatChangeRev\) window\.ShapeMetrics\?\.invalidate\?\.\(\);/);
  assert.match(client, /\}, \[eatPlanReads, eatChangeRev\]\);/);
  assert.match(client, /if \(!eatChangeRev\) setDay\(bsWeekdayIdx\(\)\)/);
  assert.ok((client.match(/\}, \[eatChangeRev\]\);/g) || []).length >= 2, 'the swaps and the day plan');
  // The declaration comes before every effect that names it (a const read before it is declared throws).
  const decl = client.indexOf("const eatChangeRev = useBSChangeRev");
  assert.ok(decl > 0 && decl < client.indexOf('}, [eatChangeRev]);'));
  assert.match(client, /const threadsChangeRev = useBSChangeRev\(\['messages', 'clients'\]\);\s*React\.useEffect\(\(\) => \{ loadCoachThreads\(\); \}, \[loadCoachThreads, threadsChangeRev\]\);/);
  const pros = code('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(pros, /const calendarChangeRev = useBSProChangeRev\(\['sessions'\]\);/);
  assert.match(pros, /\}, \[isNutri, calendarReload, calendarOwner, calendarWeek, calendarChangeRev\]\);/);
  assert.match(pros, /const changeRev = useBSProChangeRev\(\['clients', 'checkins', 'messages', 'sessions'\]\);/);
  assert.match(pros, /S\.triageLive\(role, \{ force: reload > 0 \|\| quiet \}\)/);
  assert.match(pros, /\}, \[role, uid, reload, changeRev\]\);/);
  const cal = code('mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx');
  assert.match(cal, /React\.useEffect\(\(\) => \{ loadMonth\(\); \}, \[loadMonth, calChangeRev\]\);/);
});

test('the website: five live pages start the feed, and its readers read on their scopes', () => {
  const tag = '<script type="module">import * as CS from "/newdesign/changeSignal.mjs"; window.ShapeChange = CS; CS.startWebsiteChangeFeed(window);</script>';
  for (const page of ['ClientApp.html', 'TrainerApp.html', 'NutritionistApp.html', 'TrainerMessages.html', 'NutritionistMessages.html']) {
    const html = read('public/newdesign/' + page);
    assert.ok(html.includes(tag), page);
    // Before the page's scripts, so it runs first in the deferred order (build-newdesign.mjs).
    assert.ok(html.indexOf(tag) < html.indexOf('src="pageShell.jsx'), page);
  }
  const data = code('public/newdesign/dashData.jsx');
  assert.match(data, /function useDashChangeRev\(scopes\)/);
  assert.match(data, /window\.ShapeChange/);
  assert.match(data, /client: \["training", "meals", "sessions", "checkins", "goals"\]/);
  assert.match(data, /if \(!changeRev\) return;\s*_dashCache\.clear\(\);\s*setRefreshKey\(\(v\) => v \+ 1\);/);
  assert.match(code('public/newdesign/dashTrain.jsx'), /useDashChangeRev\(\["training"\]\)[\s\S]{0,120}if \(trainChangeRev\) setReloadTick/);
  assert.match(code('public/newdesign/dashNutri.jsx'), /useDashChangeRev\(\["meals"\]\)[\s\S]{0,120}if \(nutriChangeRev\) setReloadTick/);
});
