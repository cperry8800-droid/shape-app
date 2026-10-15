// Every notification reaches its screen, on every surface its audience uses (the notification audit,
// 2026-10-15; owner: "should we run a seperate audit on all push notifications?" · "for a closed
// shape app" · "any reviews on push notifications for this PR push to same PR as audit").
//
// ⚠ THIS IS THE GUARD THE ONE-ROUND-PER-SURFACE REVIEWS NEVER HAD. Codex on #2360 found, one review
// round at a time, a route the app's list opened that a push did not, then a coach shell with no
// listener, then a website tab that hid the thread. The audit then found fifteen routes that opened
// nothing anywhere. This file reads every route a sender writes and requires each one to open
// something in the app's router, in each shell its audience uses, and in the website's inbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const R = await import('../public/newdesign/notificationRoutes.mjs');
const ROUTER = await import('../mobile-app/src/broadsheet/bsNotificationRoute.mjs');

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(rel);
  }
  return out;
}

// ── 1. Every route a sender writes is in the table ────────────────────────────────────────────────
// The literal routes in the server's code, plus the ones written at run time or by the database.
const LITERALS = new Set();
for (const rel of walk('src')) {
  for (const m of read(rel).matchAll(/\broute:\s*(['"`])([a-z]+)(?::[^'"`]*)?\1/g)) LITERALS.add(m[2]);
}
const RUNTIME = [
  ['chat', 'src/lib/coach-thread.ts', /route: out\.conversationId \? `chat:\$\{out\.conversationId\}` : 'client'/],
  ['clients', 'src/lib/ai/notifications.mjs', /route: audience === 'coach' \? 'clients' : 'home'/],
  ['prep', 'mobile-app/src/services/prepAhead.mjs', /prep:/],
  ['coach', 'src/app/api/waitlist/invite/route.ts', /route: `coach:\$\{result\.provider_role\}:\$\{result\.provider_id\}`/],
  // The database's own notifications (the latest definition of each trigger).
  ['messages', 'supabase-migrations/2026-10-15-coach-thread.sql', /'New message',[\s\S]{0,80}'messages'/],
  ['train', 'supabase-migrations/2026-07-13-adjust-regeneration.sql', /'train'/],
  ['eat', 'supabase-migrations/2026-06-07-grocery-notification.sql', /'eat'/],
  ['profile', 'supabase-migrations/2026-06-08-follow-requests.sql', /'profile'/],
  ['community', 'supabase-migrations/2026-06-14-coach-cosign.sql', /'community'/],
];

test('every route a sender writes is in the route table', () => {
  for (const [kind, file, re] of RUNTIME) {
    assert.match(read(file), re, `${kind}: its sender moved (${file})`);
    LITERALS.add(kind);
  }
  assert.ok(LITERALS.size >= 20, 'the scan found the senders: ' + [...LITERALS].join(', '));
  for (const kind of LITERALS) assert.ok(R.routeAudience(kind), `"${kind}" is sent and is not in public/newdesign/notificationRoutes.mjs`);
  // And the AI layer's own types.
  const N = read('src/lib/ai/notifications.mjs');
  for (const m of N.matchAll(/route: '([a-z]+)'/g)) assert.ok(R.routeAudience(m[1]), `ai route ${m[1]}`);
});

test('a coach\'s routes say whose they are: the calendar, the certifications and the client alerts', () => {
  // A member's sessions are "sessions"; a coach's booking request and payment are "schedule".
  for (const f of ['src/app/api/consultation/route.ts', 'src/app/api/sessions/request/route.ts']) assert.match(read(f), /type: 'booking_request',[\s\S]{0,200}route: 'schedule',/, f);
  assert.match(read('src/app/api/stripe/webhook/route.ts'), /type: 'payment', title, body, route: 'schedule', data: \{ providerRole:/);
  assert.equal((read('src/app/dashboard/credentials/actions.ts').match(/route: 'credentials',/g) || []).length, 2);
  assert.match(read('src/app/api/cron/credential-expiry/route.ts'), /route: 'credentials',/);
  for (const f of ['src/app/api/sessions/manage/route.ts']) assert.doesNotMatch(read(f), /route: 'schedule'/, 'a member\'s session updates stay "sessions"');
});

// ── 2. A push writes the same route the list opens ─────────────────────────────────────────────────
test('canonicalRoute and parseRoute: the ids a push needs ride in the route, and come back out', () => {
  const C = R.canonicalRoute;
  assert.equal(C('messages', { conversationId: 'c-1' }), 'chat:c-1');
  assert.equal(C('chat', { conversationId: 'c-1' }), 'chat:c-1', 'Nora\'s note in a coach\'s voice');
  assert.equal(C('client', { clientId: 'u-1', providerRole: 'nutritionist' }), 'client:nutritionist:u-1');
  assert.equal(C('client', { clientId: 'u-1', providerRole: 'dietitian' }), 'client:nutritionist:u-1');
  assert.equal(C('client', { clientId: 'u-1' }), 'client:u-1');
  assert.equal(C('schedule', { providerRole: 'trainer' }), 'schedule:trainer');
  assert.equal(C('waitlist', { providerRole: 'nutritionist' }), 'waitlist:nutritionist');
  assert.equal(C('profile', { actorId: 'u-2' }), 'profile:u-2');
  assert.equal(C('feed', { postId: 'p-1' }), 'feed:p-1');
  assert.equal(C('coach:trainer:7', {}), 'coach:trainer:7');
  assert.equal(C('train', null), 'train');
  assert.equal(C('client', { clientId: 'bad id with spaces' }), 'client', 'an id that cannot ride in a route is dropped');
  const P = R.parseRoute;
  assert.deepEqual(P('chat:c-1'), { kind: 'chat', id: 'c-1', role: null });
  assert.deepEqual(P('chat'), { kind: 'messages', id: null, role: null });
  assert.equal(P('chat:'), null);
  assert.deepEqual(P('client:trainer:u-1'), { kind: 'client', id: 'u-1', role: 'trainer' });
  assert.equal(P('client:trainer:'), null);
  assert.deepEqual(P('coach:nutritionist:9'), { kind: 'coach', id: '9', role: 'nutritionist' });
  assert.deepEqual(P('schedule:trainer'), { kind: 'schedule', id: null, role: 'trainer' });
  assert.deepEqual(P('profile:u-2'), { kind: 'profile', id: 'u-2', role: null });
  assert.equal(P('constructor'), null, 'a prototype key is no route');
  assert.equal(P('nope'), null);
  // The push dispatch writes exactly this.
  assert.match(read('src/app/api/push/dispatch/route.ts'), /return canonicalRoute\(record\.route \?\? '', record\.data \?\? null\);/);
});

// ── 3. The app: the router opens every route, and every shell answers it or hands it over ─────────
function routed(route, data) {
  const out = [];
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const saved = [globalThis.window, globalThis.CustomEvent];
  globalThis.window = { dispatchEvent: (e) => out.push([e.type, e.detail]) };
  globalThis.CustomEvent = CustomEvent;
  try { return { ok: ROUTER.bsRouteNotification(route, data), out }; } finally { [globalThis.window, globalThis.CustomEvent] = saved; }
}
const SAMPLE = {
  chat: ['messages', { conversationId: 'c-1' }], messages: ['messages', {}], home: ['home'],
  client: ['client', { clientId: 'u-1', providerRole: 'trainer' }], clients: ['clients'],
  schedule: ['schedule', { providerRole: 'trainer' }], waitlist: ['waitlist', { providerRole: 'trainer' }],
  credentials: ['credentials'], prep: ['prep:overnight-oats'], coach: ['coach:trainer:7'],
  sessions: ['sessions'], train: ['train'], eat: ['eat'], score: ['score'], checkin: ['checkin'], goal: ['goal'],
  habits: ['habits'], progress: ['progress'], feed: ['feed'], community: ['community'],
  profile: ['profile', { actorId: 'u-2' }], settings: ['settings'],
};

test('the router opens every route in the table, from the list and from a push alike', () => {
  for (const kind of Object.keys(R.ROUTES)) {
    assert.ok(SAMPLE[kind], `no sample for ${kind}`);
    const [route, data] = SAMPLE[kind];
    const list = routed(route, data);
    assert.equal(list.ok, true, `${kind} opens nothing`);
    assert.equal(list.out.length, 1, kind);
    assert.deepEqual(routed(R.canonicalRoute(route, data)), list, `${kind}: a push opens what the list opens`);
  }
  const page = (r, d) => routed(r, d).out[0];
  assert.deepEqual(page('schedule', { providerRole: 'nutritionist' }), ['shape:openPage', { page: 'schedule', id: null, role: 'nutritionist', fromNotification: true }]);
  assert.deepEqual(page('coach:trainer:7'), ['shape:openMarket', { role: 'trainer', coachId: 7, fromNotification: true }]);
  assert.deepEqual(page('profile', { actorId: 'u-2' }), ['shape:openPage', { page: 'profile', id: 'u-2', role: null, fromNotification: true }]);
});

// The handlers each shell has, read from its source.
const CLIENT = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const PROS = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
const EVENT = { chat: 'shape:openConversation', prep: 'shape:openPrep', home: 'shape:goHome', client: 'shape:openClient', coach: 'shape:openMarket' };
function pageEffect(src, from) {
  const at = src.indexOf("const open = (e) => {", src.indexOf(from));
  const end = src.indexOf("window.addEventListener('shape:openPage', open);", at);
  assert.ok(at > 0 && end > at, 'the openPage handler moved');
  return src.slice(at, end);
}
const cases = (body) => new Set([...body.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]));

test('the member app opens every member route and hands every coach route to the coach app', () => {
  const body = pageEffect(CLIENT, '⚠ EVERY OTHER NOTIFICATION LANDS HERE');
  const handled = cases(body);
  for (const [kind, audience] of Object.entries(R.ROUTES)) {
    if (EVENT[kind]) { assert.ok(CLIENT.includes(`window.addEventListener('${EVENT[kind]}',`), `member shell: ${EVENT[kind]}`); continue; }
    if (audience === 'coach') { assert.ok(ROUTER.BS_COACH_PAGES.includes(kind), `member shell hands ${kind} to the coach app`); continue; }
    assert.ok(handled.has(kind), `member shell opens ${kind}`);
  }
  assert.match(body, /if \(BS_COACH_PAGES\.includes\(d\.page\)\) \{\s+const role = d\.role \|\| bsAccountCoachRole\(\);\s+if \(d\.fromNotification && role\) bsHandOver\(bsRouteFor\('page', d\), role, setTweak\);/);
  // A client's page belongs to the coach app.
  assert.match(CLIENT, /const toCoach = \(e\) => \{[\s\S]{0,200}if \(d\.fromNotification && d\.clientId && role\) bsHandOver\(bsRouteFor\('client', d\), role, setTweak\);/);
});

test('both coach apps open every coach route and hand every member route to the member app', () => {
  for (const [name, mine] of [['function BSTrainerAppInner(', 'trainer'], ['function BSNutritionistAppInner(', 'nutritionist']]) {
    const shellSrc = PROS.slice(PROS.indexOf(name), PROS.indexOf(name) + 30000);
    const body = pageEffect(shellSrc, '⚠ EVERY OTHER NOTIFICATION LANDS HERE');
    const handled = cases(body);
    for (const [kind, audience] of Object.entries(R.ROUTES)) {
      if (kind === 'chat' || kind === 'home' || kind === 'client') { assert.ok(shellSrc.includes(`window.addEventListener('${EVENT[kind]}',`), `${mine}: ${EVENT[kind]}`); continue; }
      if (kind === 'prep' || kind === 'coach') { assert.ok(shellSrc.includes(`window.addEventListener('${EVENT[kind]}', ${kind === 'prep' ? 'prep' : 'market'});`), `${mine} hands ${kind} to the member app`); continue; }
      if (audience === 'member') { assert.ok(ROUTER.BS_MEMBER_PAGES.includes(kind), `${mine} hands ${kind} to the member app`); continue; }
      assert.ok(handled.has(kind), `${mine} opens ${kind}`);
    }
    // The other listing's calendar, waiting room and certifications go to that role's app.
    assert.match(body, new RegExp(`if \\(d\\.fromNotification && d\\.role && d\\.role !== '${mine}' && \\(d\\.page === 'schedule' \\|\\| d\\.page === 'waitlist' \\|\\| d\\.page === 'credentials'\\)\\) \\{\\s+bsHandOver\\(bsRouteFor\\('page', d\\), d\\.role, setTweak\\);`), mine);
    // Only a notification switches apps: the same events fired inside an app do not.
    assert.match(shellSrc, /const toMember = \(kind\) => \(e\) => \{ if \(e && e\.detail && e\.detail\.fromNotification\) bsHandOver\(bsRouteFor\(kind, e\.detail\), 'client', setTweak\); \};/, mine);
  }
});

test('a hand-over replays in the other app with the route it was given', () => {
  // Every shell replays window.__bsPushRoute once it mounts (#2360); the hand-over leaves the route there.
  const set = [];
  const saved = globalThis.window;
  globalThis.window = {};
  try {
    assert.equal(ROUTER.bsHandOver('schedule:trainer', 'trainer', (k, v) => set.push([k, v])), true);
    assert.equal(globalThis.window.__bsPushRoute, 'schedule:trainer');
  } finally { globalThis.window = saved; }
  assert.deepEqual(set, [['role', 'trainer']]);
  assert.equal(ROUTER.bsRouteFor('page', { page: 'schedule', role: 'trainer' }), 'schedule:trainer');
  assert.equal(ROUTER.bsRouteFor('page', { page: 'profile', id: 'u-2' }), 'profile:u-2');
  assert.equal(ROUTER.bsRouteFor('client', { clientId: 'u-1', providerRole: 'nutritionist' }), 'client:nutritionist:u-1');
  assert.equal(ROUTER.bsRouteFor('coach', { role: 'trainer', coachId: 7 }), 'coach:trainer:7');
  // And each replays it after its listeners are up (three shells).
  assert.equal((CLIENT.match(/if \(pending\) \{ window\.__bsPushRoute = null; replay = setTimeout\(\(\) => bsRouteNotification\(pending\), 0\); \}/g) || []).length, 1);
  assert.equal((PROS.match(/if \(pending\) \{ window\.__bsPushRoute = null; replay = setTimeout\(\(\) => bsRouteNotification\(pending\), 0\); \}/g) || []).length, 2);
});

test('Settings opens on the page a notification asks for, and the notification list has a door', () => {
  assert.match(CLIENT, /const \[showSessions, setShowSessions\] = useStateBSC\(initialPage === 'sessions'\);/);
  assert.match(CLIENT, /const \[showNotifications, setShowNotifications\] = useStateBSC\(initialPage === 'notifications'\);/);
  assert.match(CLIENT, /const \[showHabits, setShowHabits\] = useStateBSC\(initialPage === 'habits'\);/);
  assert.match(CLIENT, /const \[detail, setDetail\] = useStateBSC\(initialPage === 'practice' \? 'practice' : ''\);/);
  assert.match(CLIENT, /\{ l: tr\('settings:notif\.inbox', \{ defaultValue: 'Your notifications' \}\), r: tr\('settings:notif\.inboxMeta', \{ defaultValue: 'Open' \}\), action: \(\) => setShowNotifications\(true\) \},/);
  // A new start page remounts Settings, so one already open goes there.
  assert.match(CLIENT, /<BSSettings\s+key=\{'settings:' \+ settingsStart\}/);
  assert.equal((PROS.match(/<BSSettings key=\{'settings:' \+ settingsStart\}/g) || []).length, 2);
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/settings.json`));
    for (const k of ['notif.inbox', 'notif.inboxMeta']) assert.ok(typeof cat[k] === 'string' && cat[k].trim(), `${loc}: ${k}`);
  }
});

// ── 4. The website ──────────────────────────────────────────────────────────────────────────────
test('the website inbox opens every route for the people who receive it', () => {
  const shell = read('public/newdesign/pageShell.jsx');
  const fn = shell.slice(shell.indexOf('const DASH_INBOX_ROUTES = {'), shell.indexOf('// ⚠ A SHAPE CHECK, NOT A TRUST FALL.'));
  const lib = new Function('window', `${fn}; return { dashInboxHref, dashInboxThreadFor, dashInboxOpensFeed };`)({});
  const opens = (n, role) => !!(lib.dashInboxHref(n, role) || lib.dashInboxThreadFor(n, role) || lib.dashInboxOpensFeed(n));
  const ROW = {
    chat: { route: 'chat:c-1' }, messages: { route: 'messages', data: { conversationId: 'c-1' } }, home: { route: 'home' },
    client: { route: 'client', data: { clientId: 'u-1', providerRole: 'trainer' } }, clients: { route: 'clients' },
    schedule: { route: 'schedule', data: { providerRole: 'trainer' } }, waitlist: { route: 'waitlist', data: { providerRole: 'trainer' } },
    credentials: { route: 'credentials' }, prep: { route: 'prep:overnight-oats' }, coach: { route: 'coach:trainer:7' },
    sessions: { route: 'sessions' }, train: { route: 'train' }, eat: { route: 'eat' }, score: { route: 'score' },
    checkin: { route: 'checkin' }, goal: { route: 'goal' }, habits: { route: 'habits' }, progress: { route: 'progress' },
    feed: { route: 'feed' }, community: { route: 'community' }, profile: { route: 'profile', data: { actorId: 'u-2' } },
    settings: { route: 'settings' },
  };
  for (const [kind, audience] of Object.entries(R.ROUTES)) {
    assert.ok(ROW[kind], kind);
    if (audience !== 'coach') assert.ok(opens(ROW[kind], 'client'), `website, member: ${kind} opens nothing`);
    if (audience !== 'member') assert.ok(opens(ROW[kind], 'trainer'), `website, coach: ${kind} opens nothing`);
  }
  const h = lib.dashInboxHref;
  assert.equal(h({ route: 'schedule', data: { providerRole: 'nutritionist' } }, 'trainer'), 'NutritionistApp.html#schedule');
  assert.equal(h({ route: 'clients' }, 'trainer'), 'TrainerApp.html#clients');
  assert.equal(h({ route: 'credentials' }, 'nutritionist'), 'NutritionistApp.html#profile');
  assert.equal(h({ route: 'home' }, 'trainer'), 'TrainerApp.html#today', 'a coach\'s home is their Today');
  assert.equal(h({ route: 'home' }, 'client'), 'ClientDashboard.html');
  assert.equal(h({ route: 'train' }, 'client'), 'ClientTrain.html');
  assert.equal(h({ route: 'coach:nutritionist:12' }, 'client'), '/nutritionists/12');
  assert.equal(h({ route: 'profile', data: { actorId: 'u-2' } }, 'client'), '/newdesign/MemberProfile.html?u=u-2');
  assert.equal(h({ route: 'chat', data: { conversationId: 'c-1' } }, 'trainer'), '/newdesign/TrainerMessages.html?conversation=c-1', 'Nora\'s note is a message');
  assert.equal(lib.dashInboxThreadFor({ route: 'chat', data: { conversationId: 'c-1' } }, 'client'), 'c-1');
  // Inside the shell of that role, a hash switch.
  const inTrainer = new Function('window', `${fn}; return dashInboxHref;`)({ __shapeCoachShell: 'trainer' });
  assert.equal(inTrainer({ route: 'schedule', data: { providerRole: 'trainer' } }, 'trainer'), '#schedule');
});

// ── 5. The push itself ─────────────────────────────────────────────────────────────────────────
test('a push answers the recipient\'s preferences, whichever way the row was written', async () => {
  const nextServer = require('next/server');
  const NOTIFY = await import('../src/lib/ai/notifications.mjs');
  const route = await loadRealModule(join(ROOT, 'src/app/api/push/dispatch/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/supabase/admin', { createAdminClient: () => null }], ['@/lib/push', {}], ['@/lib/ai/notifications.mjs', NOTIFY]]),
  });
  const admin = ({ settings = null, prefs = [], fail = false } = {}) => ({
    from: (table) => {
      const q = { select: () => q, eq: () => q };
      const res = fail ? { data: null, error: { message: 'down' } } : { data: table === 'notification_settings' ? settings : prefs, error: null };
      q.maybeSingle = async () => res;
      q.then = (ok, no) => Promise.resolve(res).then(ok, no);
      return q;
    },
  });
  const noon = new Date('2026-10-15T12:00:00Z');
  const night = new Date('2026-10-15T23:30:00Z');
  const gate = (a, now = noon) => route.pushAllowed(a, 'u-1', 'message', now);
  assert.deepEqual(await gate(admin()), { ok: true }, 'nobody saved anything: pushed');
  assert.deepEqual(await gate(admin(), night), { ok: true }, 'no saved settings: the 22:00 UTC default does not silence an American evening');
  assert.deepEqual(await gate(admin({ settings: { muted: true } })), { ok: false, why: 'muted' });
  assert.deepEqual(await gate(admin({ prefs: [{ channel: 'push', enabled: false }] })), { ok: false, why: 'push_channel_off' });
  assert.deepEqual(await gate(admin({ prefs: [{ channel: 'inapp', enabled: false }] })), { ok: true }, 'another channel off');
  const saved = { muted: false, quiet_start: 22, quiet_end: 7, tz: 'America/New_York' };
  assert.deepEqual(await gate(admin({ settings: saved }), new Date('2026-10-16T03:00:00Z')), { ok: false, why: 'quiet_hours' }, '23:00 in New York');
  assert.deepEqual(await gate(admin({ settings: saved }), noon), { ok: true }, '08:00 in New York');
  assert.deepEqual(await gate(admin({ fail: true })), { ok: false, why: 'preferences_unreadable' }, 'a failed read sends nothing');
  // Rows that already carry their channels (createPreferredNotification, the AI layer) are not read twice.
  assert.match(read('src/app/api/push/dispatch/route.ts'), /if \(!\(record\.data && record\.data\.channels\)\) \{\s+const gate = await pushAllowed\(admin, record\.user_id, record\.type \?\? 'general'\);/);
});

test('the AI\'s client alerts carry the listing\'s role, so a coach with both opens the right app', async () => {
  const N = await import('../src/lib/ai/notifications.mjs');
  const rows = [{ clientId: 'u-1', clientName: 'Cara', severity: 'red', reason: 'No logs in 5 days', flags: [{ owned: true, discipline: 'nutrition', reason: 'No logs in 5 days' }] }];
  for (const [role, want] of [['trainer', 'trainer'], ['nutritionist', 'nutritionist'], ['dietitian', 'nutritionist']]) {
    const [c] = N.coachCandidates({ triageRows: rows, lastSeverity: {}, providerRole: role });
    assert.equal(c.data.providerRole, want, role);
    assert.equal(R.canonicalRoute(c.route, c.data), `client:${want}:u-1`);
  }
  assert.equal('providerRole' in N.coachCandidates({ triageRows: rows, lastSeverity: {} })[0].data, false);
  assert.match(read('src/lib/ai/notify-core.ts'), /Notify\.coachCandidates\(\{ triageRows: rows, lastSeverity: opts\.lastSeverity, providerRole: role \}\)/);
});

// ── 6. The two Codex findings carried from #2360 ───────────────────────────────────────────────
test('an account that is a coach and a client: a message says which side its recipient is on', () => {
  const sql = read('supabase-migrations/2026-10-15-notification-routes.sql').replace(/--[^\n]*/g, '');
  // The trigger writes side: 'coach' to the listing's owner, 'client' to the thread's client.
  assert.match(sql, /if conv\.client_id is not null and conv\.client_id = new\.sender_id then[\s\S]{0,400}v_side := 'coach';\s+else\s+recipient := conv\.client_id;\s+v_side := 'client';/);
  assert.match(sql, /jsonb_build_object\('providerRole', conv\.provider_role, 'side', v_side\)/);
  // It keeps 2026-10-15-keep-care-team-private.sql's branch: a care-team message reaches the other
  // coaches who still coach the client, never the client.
  assert.match(sql, /if conv\.provider_role is null and conv\.dm_key is null and conv\.client_id is not null then[\s\S]{0,500}and cp\.user_id <> conv\.client_id\s+and exists \(\s+select 1 from public\.subscriptions s\s+where s\.client_id = conv\.client_id\s+and s\.status in \('active', 'trialing'\)[\s\S]{0,200}t\.owner_id = cp\.user_id[\s\S]{0,200}n\.owner_id = cp\.user_id\s+\)\)\s+\)\s+\);\s+return new;/);
  assert.match(sql, /raise exception 'notify_on_new_message lost the care-team branch/);
  assert.match(sql, /raise exception 'notify_on_new_message tells a former coach about a care-team message/);
  // And it replays after that file, whose body it restates.
  const days = readdirSync(join(ROOT, 'supabase-migrations')).filter((f) => f.startsWith('2026-10-15-')).sort();
  assert.ok(days.indexOf('2026-10-15-notification-routes.sql') > days.indexOf('2026-10-15-keep-care-team-private.sql'), days.join(', '));
  assert.ok(days.indexOf('2026-10-15-notification-routes.sql') > days.indexOf('2026-10-15-coach-thread.sql'), days.join(', '));
  assert.match(read('src/lib/coach-thread.ts'), /providerRole: a\.providerRole, side: 'coach' \}/, 'the new-client alert is the coach\'s');
  // The website: a trainer's own coach writes to them; the bubble, not the trainer Messages page.
  const shell = read('public/newdesign/pageShell.jsx');
  const fn = shell.slice(shell.indexOf('const DASH_INBOX_ROUTES = {'), shell.indexOf('// ⚠ A SHAPE CHECK, NOT A TRUST FALL.'));
  const lib = new Function('window', `${fn}; return { dashInboxHref, dashInboxThreadFor };`)({});
  const fromMyCoach = { route: 'messages', data: { conversationId: 'c-1', providerRole: 'nutritionist', side: 'client' } };
  assert.equal(lib.dashInboxThreadFor(fromMyCoach, 'trainer'), 'c-1');
  assert.equal(lib.dashInboxHref(fromMyCoach, 'trainer'), null);
  const fromMyClient = { route: 'messages', data: { conversationId: 'c-2', providerRole: 'trainer', side: 'coach' } };
  assert.equal(lib.dashInboxThreadFor(fromMyClient, 'trainer'), null);
  assert.equal(lib.dashInboxHref(fromMyClient, 'trainer'), '/newdesign/TrainerMessages.html?conversation=c-2');
  // From the member dashboard too, a coach-side message opens the coach page.
  assert.equal(lib.dashInboxHref(fromMyClient, 'client'), '/newdesign/TrainerMessages.html?conversation=c-2');
  // A row written before `side`: the account's role decides, as it did.
  assert.equal(lib.dashInboxThreadFor({ route: 'messages', data: { conversationId: 'c-3' } }, 'client'), 'c-3');
  assert.equal(lib.dashInboxThreadFor({ route: 'messages', data: { conversationId: 'c-3' } }, 'trainer'), null);
});

test('a conversation opened by id is read, however it was opened', () => {
  // A notification, a push or a coach's Message opened the thread by id and never marked it read, so
  // the messages already in it (the welcome included) stayed in dm_unread().
  const at = CLIENT.indexOf('function BSChatThread(');
  const body = CLIENT.slice(at, at + 4000);
  assert.match(body, /React\.useEffect\(\(\) => \{\s+if \(thread\.conversationId\) window\.ShapeUnread\?\.markConversationRead\?\.\(thread\.conversationId\);\s+\}, \[thread\.conversationId\]\);/);
});
