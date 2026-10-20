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
  // A paid session (fix 3c): the coach's notice is coachPaid's, on the calendar in the listing's
  // role; the webhook's nameless payment notice is gone.
  assert.match(read('src/lib/coach-thread.ts'), /type: 'session_paid',[\s\S]{0,300}route: 'schedule',\n\s+data: \{ dedupe: `paid:\$\{a\.checkoutId\}`, clientId: a\.clientId, conversationId: out\.conversationId, providerRole: a\.providerRole \},/);
  assert.doesNotMatch(read('src/app/api/stripe/webhook/route.ts'), /createNotification|route: 'sessions'/);
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
  sessions: ['sessions'], train: ['train'], eat: ['eat'], score: ['score'], checkin: ['checkin'], today: ['today'], goal: ['goal'],
  habits: ['habits'], progress: ['progress'], feed: ['feed'], community: ['community'],
  profile: ['profile', { actorId: 'u-2' }], person: ['person', { actorId: 'u-3' }], settings: ['settings'],
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
  // A friend's habit names the person, and a push carries them in the route (Codex on #2413).
  assert.equal(R.canonicalRoute('person', { actorId: 'u-3' }), 'person:u-3');
  assert.deepEqual(page('person', { actorId: 'u-3' }), ['shape:openPage', { page: 'person', id: 'u-3', role: null, fromNotification: true }]);
  assert.equal(R.parseRoute('person'), null, 'a person route that names no one opens nothing');
  assert.equal(R.parseRoute('person:'), null);
});

test('a person route opens that person, never the reader\'s own profile, in all three shells', () => {
  // A follow opens the member's own profile, where requests are answered; a friend's habit opens
  // the friend (Codex on #2413: it rode the follow's route and opened the reader's Me tab).
  const member = pageEffect(CLIENT, '⚠ EVERY OTHER NOTIFICATION LANDS HERE');
  assert.match(member, /case 'person': clear\(\); setNotifPerson\(d\.id \|\| null\); return;/);
  // Back goes through the history its opening pushed, and any step back closes it, so it never
  // leaves a back that lands where the member already is.
  assert.match(CLIENT, /const personOverlay = notifPerson \? <BSNotifiedPerson userId=\{notifPerson\} onClose=\{\(\) => \{ if \(!navBack\(\)\) setNotifPerson\(null\); \}\} \/> : null;/);
  assert.equal((CLIENT.match(/\{personOverlay\}/g) || []).length, 3, 'every return of the member shell renders it');
  assert.match(CLIENT, /const navResolve = \(loc\) => \{\n\s*if \(!loc\) return;\n[^\n]*\n\s*setNotifPerson\(null\);/, 'a step back closes it');
  assert.ok(CLIENT.indexOf('const [notifPerson, setNotifPerson]') < CLIENT.indexOf('const navResolve = (loc) => {'), 'declared before the resolver reads it');
  for (const name of ['function BSTrainerAppInner(', 'function BSNutritionistAppInner(']) {
    const shellSrc = PROS.slice(PROS.indexOf(name), PROS.indexOf(name) + 30000);
    // A coach session can run without the client module that draws it, so it is loaded first.
    assert.match(pageEffect(shellSrc, '⚠ EVERY OTHER NOTIFICATION LANDS HERE'), /case 'person': clear\(\); bsProOpenPerson\(d\.id, setNotifPerson\); return;/, name);
    assert.match(shellSrc, /const takeover = \(el\) => \(<>\{el\}\{settingsOverlay\}\{searchOverlay\}\{noraSheet\}\{personOverlay\}<\/>\);/, name);
    assert.match(shellSrc, /\{searchOverlay\}\n\s*\{personOverlay\}/, `${name}: the main return renders it`);
    assert.match(shellSrc, /onClose: \(\) => \{ if \(!navBack\(\)\) setNotifPerson\(null\); \}/, `${name}: Back goes through the history`);
    assert.match(shellSrc, /const navResolve = \(loc\) => \{\n\s*if \(!loc\) return;\n[^\n]*\n\s*setNotifPerson\(null\);/, `${name}: a step back closes it`);
    assert.match(shellSrc, CLOSES_ON_NAV, `${name}: any other navigation closes it`);
  }
  assert.match(CLIENT, CLOSES_ON_NAV, 'the member app: any other navigation closes it');
  assert.match(PROS, /function bsProOpenPerson\(id, setNotifPerson\) \{\n\s*if \(!id\) return;\n\s*if \(typeof window !== 'undefined' && window\.BSNotifiedPerson\) \{ setNotifPerson\(id\); return; \}\n\s*import\('\.\/iosAppBroadsheetClient\.jsx'\)\.then\(\(\) => setNotifPerson\(id\)\)/, 'a coach-only session loads the client module first');
});

const CLOSES_ON_NAV = /const close = \(e\) => \{ if \(bsClosesPerson\(e\)\) setNotifPerson\(null\); \};\n\s*BS_NAV_EVENTS\.forEach\(\(n\) => window\.addEventListener\(n, close\)\);/;

test('a notified person closes on every route the router fires and every header control, but not on its own route', () => {
  // Codex on #2413: in the coach apps Home, a client and a conversation moved only the page under it.
  for (const ev of ['shape:goHome', 'shape:openConversation', 'shape:openClient', 'shape:openMarket', 'shape:openPrep', 'shape:openPage', 'shape:openSearch', 'shape:openNora', 'shape:openProfile']) {
    assert.ok(ROUTER.BS_NAV_EVENTS.includes(ev), ev);
  }
  const ev = (type, detail) => ({ type, detail });
  assert.equal(ROUTER.bsClosesPerson(ev('shape:openPage', { page: 'person', id: 'u-3' })), false, 'opening a person does not close it');
  assert.equal(ROUTER.bsClosesPerson(ev('shape:openPage', { page: 'train' })), true);
  assert.equal(ROUTER.bsClosesPerson(ev('shape:goHome')), true);
  assert.equal(ROUTER.bsClosesPerson(ev('shape:openConversation', { conversationId: 'c-1' })), true);
  // Every shell event that opens a screen is in the list, read from the shells themselves.
  const opens = new Set();
  for (const src of [CLIENT, PROS]) {
    for (const m of src.matchAll(/window\.addEventListener\('(shape:(?:go|open|start|cook|meal|edit|pro)[A-Za-z]+)'/g)) opens.add(m[1]);
  }
  // shape:cookreads says the cook-mode reads changed; it opens nothing.
  const notNav = new Set(['shape:cookreads']);
  assert.ok(opens.size >= 20, `the scan found the shells' events: ${[...opens].join(', ')}`);
  for (const e of opens) if (!notNav.has(e)) assert.ok(ROUTER.BS_NAV_EVENTS.includes(e), `${e} opens a screen and is not in BS_NAV_EVENTS`);
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
    checkin: { route: 'checkin' }, today: { route: 'today' }, goal: { route: 'goal' }, habits: { route: 'habits' }, progress: { route: 'progress' },
    feed: { route: 'feed' }, community: { route: 'community' }, profile: { route: 'profile', data: { actorId: 'u-2' } },
    person: { route: 'person', data: { actorId: 'u-3' } }, settings: { route: 'settings' },
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

test('the AI layer\'s coach-message notice is the member\'s side, so a coach app hands it to the member app (Fable on #2372)', async () => {
  const N = await import('../src/lib/ai/notifications.mjs');
  const out = N.clientCandidates({ coachEvents: [{ kind: 'message', id: 'm-1', conversationId: 'c-9', coach: 'Sam', preview: 'Nice week' }] });
  const msg = out.find((c) => c.type === 'coach_message');
  assert.ok(msg, out.map((c) => c.type).join(','));
  assert.equal(msg.data.side, 'client');
  const route = R.canonicalRoute(msg.route, msg.data);
  assert.equal(route, 'chat:client:c-9');
  const p = R.parseRoute(route);
  const detail = { conversationId: p.id, side: p.side, role: p.role, fromNotification: true };
  assert.equal(ROUTER.bsChatOwner(detail, 'trainer'), 'client');
  assert.equal(ROUTER.bsChatOwner(detail, 'client'), null);
});

test('a thread names the side its recipient is on, and opens in the app that holds it (Codex on #2372)', async () => {
  // An account that coaches and is coached: the route carries the side, and the listing's role.
  assert.equal(R.canonicalRoute('messages', { conversationId: 'c-1', providerRole: 'trainer', side: 'client' }), 'chat:client:c-1');
  assert.equal(R.canonicalRoute('messages', { conversationId: 'c-1', providerRole: 'nutritionist', side: 'coach' }), 'chat:coach:nutritionist:c-1');
  assert.equal(R.canonicalRoute('messages', { conversationId: 'c-1', careTeam: true, side: 'coach' }), 'chat:coach:c-1');
  assert.equal(R.canonicalRoute('messages', { conversationId: 'dm-1' }), 'chat:dm-1', 'no side: as before');
  // A sender that names the thread itself keeps the side its data carries (Fable on #2372): the hire
  // alert writes "chat:<id>", and the route came back as it went in, side and listing dropped.
  assert.equal(R.canonicalRoute('chat:c-1', { conversationId: 'c-1', providerRole: 'trainer', side: 'coach' }), 'chat:coach:trainer:c-1');
  assert.equal(R.canonicalRoute('chat:c-1', { side: 'client' }), 'chat:client:c-1');
  assert.equal(R.canonicalRoute('chat:c-1', { conversationId: 'c-1' }), 'chat:c-1', 'no side: as it came');
  assert.equal(R.canonicalRoute('chat:coach:trainer:c-1', { side: 'client' }), 'chat:coach:trainer:c-1', 'a route that already names its side is kept');
  assert.deepEqual(R.parseRoute('chat:client:c-1'), { kind: 'chat', id: 'c-1', role: null, side: 'client' });
  assert.deepEqual(R.parseRoute('chat:coach:trainer:c-1'), { kind: 'chat', id: 'c-1', role: 'trainer', side: 'coach' });
  assert.deepEqual(R.parseRoute('chat:c-1'), { kind: 'chat', id: 'c-1', role: null });
  assert.equal(R.parseRoute('chat:client:trainer:c-1'), null, 'a member side names no listing');
  // Which app opens it.
  const saved = globalThis.window;
  globalThis.window = { ShapeAuth: { getCachedState: () => ({ profile: { roles: ['client', 'nutritionist'] } }) } };
  try {
    const own = (side, role) => ({ conversationId: 'c-1', side, role, fromNotification: true });
    assert.equal(ROUTER.bsChatOwner(own('client', null), 'trainer'), 'client', 'their own coach writes: the member app');
    assert.equal(ROUTER.bsChatOwner(own('client', null), 'client'), null);
    assert.equal(ROUTER.bsChatOwner(own('coach', 'nutritionist'), 'trainer'), 'nutritionist', 'the other listing\'s client');
    assert.equal(ROUTER.bsChatOwner(own('coach', 'trainer'), 'trainer'), null);
    assert.equal(ROUTER.bsChatOwner(own('coach', 'trainer'), 'client'), 'trainer');
    assert.equal(ROUTER.bsChatOwner(own('coach', null), 'client'), 'nutritionist', 'the care team: the account\'s coach app');
    assert.equal(ROUTER.bsChatOwner(own('coach', null), 'trainer'), null, 'any coach app holds the care team');
    assert.equal(ROUTER.bsChatOwner({ conversationId: 'c-1', side: 'client' }, 'trainer'), null, 'only a notification switches apps');
    assert.equal(ROUTER.bsChatOwner({ conversationId: 'c-1', fromNotification: true }, 'trainer'), null, 'no side: opened where it is');
  } finally { globalThis.window = saved; }
  // A hand-over replays the same route in the other app.
  assert.equal(ROUTER.bsRouteFor('chat', { conversationId: 'c-1', side: 'coach', role: 'nutritionist' }), 'chat:coach:nutritionist:c-1');
  // Every shell asks before it opens a notified thread, with its own role.
  const hand = (role) => new RegExp(`if \\(!d\\.conversationId && !d\\.channel && !d\\.support\\) return;\\n(?:\\s*//[^\\n]*\\n)*\\s*const owner = bsChatOwner\\(d, '${role}'\\);\\n\\s*if \\(owner\\) \\{ bsHandOver\\(bsRouteFor\\('chat', d\\), owner, setTweak\\); return; \\}`);
  assert.match(CLIENT, hand('client'));
  assert.match(PROS, hand('trainer'));
  assert.match(PROS, hand('nutritionist'));
});

test('a credential notice opens the website\'s editor from the app; the profile there is read only (Codex on #2372)', () => {
  for (const page of ['Trainer', 'Nutritionist']) {
    assert.match(PROS, new RegExp(`case 'credentials':\\n\\s+if \\(window\\.ShapeSite\\?\\.open\\) \\{ window\\.ShapeSite\\.open\\('/newdesign/${page}App\\.html#profile'\\); return; \\}`), page);
  }
  const backend = read('mobile-app/src/services/shapeBackend.js');
  assert.match(backend, /window\.ShapeSite = \{ open: openWebsitePage \};/);
  assert.match(backend, /function openAdminConsole\(\) \{ openWebsitePage\('\/admin'\); \}/);
  // The website's editor is where the route takes a coach (DASH_INBOX_COACH_TABS.credentials).
  assert.match(read('public/newdesign/pageShell.jsx'), /credentials: "profile", waitlist: "profile",/);
});

test('the website opens a coach-only notice on the account\'s coach side, from its member side too (Codex on #2372)', () => {
  const shell = read('public/newdesign/pageShell.jsx');
  const fn = shell.slice(shell.indexOf('const DASH_INBOX_ROUTES = {'), shell.indexOf('// ⚠ A SHAPE CHECK, NOT A TRUST FALL.'));
  const lib = new Function('window', `${fn}; return { dashInboxHref, dashAccountCoachRole, dashInboxConversation };`)({});
  const h = lib.dashInboxHref;
  // A coach using the website as a member: the certifications, the digest and a client alert open
  // their coach shell, in the account's coach role when the row names none.
  assert.equal(h({ route: 'credentials' }, 'client', 'trainer'), 'TrainerApp.html#profile');
  assert.equal(h({ route: 'clients' }, 'client', 'nutritionist'), 'NutritionistApp.html#clients');
  assert.equal(h({ route: 'client', data: { clientId: 'u-1', providerRole: 'trainer' } }, 'client', null), 'TrainerApp.html#client/u-1', 'the row\'s own role');
  assert.equal(h({ route: 'client', data: { clientId: 'u-1' } }, 'client', 'nutritionist'), 'NutritionistApp.html#client/u-1');
  assert.equal(h({ route: 'credentials' }, 'client', null), null, 'a member who coaches nothing has no coach page');
  assert.equal(h({ route: 'credentials' }, 'trainer', 'nutritionist'), 'TrainerApp.html#profile', 'on a coach dashboard, that dashboard\'s role');
  // The account's coach role, trainer first.
  assert.equal(lib.dashAccountCoachRole({ role: 'client', roles: ['client', 'nutritionist'] }), 'nutritionist');
  assert.equal(lib.dashAccountCoachRole({ role: 'client', roles: ['client', 'nutritionist', 'trainer'] }), 'trainer');
  assert.equal(lib.dashAccountCoachRole({ role: 'client', roles: ['client'] }), null);
  assert.equal((shell.match(/<DashInbox signedIn=\{!!authUser\} role=\{authUser && authUser\.role\} roles=\{authUser && authUser\.roles\} inbox=\{inbox\} \/>/g) || []).length, 2, 'both headers hand the inbox the account\'s roles');
  assert.match(shell, /function DashInbox\(\{ signedIn, role, roles, inbox \}\) \{\n[^\n]*\n  const accountCoach = dashAccountCoachRole\(\{ role, roles \}\);/);
  assert.match(shell, /const href = dashInboxHref\(n, role, accountCoach\);/);
  // A thread route with its side reads back to the thread.
  for (const r of ['chat:client:c-1', 'chat:coach:c-1', 'chat:coach:trainer:c-1', 'chat:c-1']) assert.equal(lib.dashInboxConversation({ route: r }), 'c-1', r);
});

// ── 5. The push itself ─────────────────────────────────────────────────────────────────────────
test('a push answers the recipient\'s preferences, whichever way the row was written', async () => {
  const nextServer = require('next/server');
  const NOTIFY = await import('../src/lib/ai/notifications.mjs');
  const st = { admin: null, sent: [] };
  const route = await loadRealModule(join(ROOT, 'src/app/api/push/dispatch/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => st.admin }],
      ['@/lib/push', { pushConfigured: () => true, sendPushToUser: async (_a, userId, p) => { st.sent.push({ userId, ...p }); } }],
      ['@/lib/email', { sendEmail: async () => ({ ok: true }) }],
      ['@/lib/ai/notifications.mjs', NOTIFY],
    ]),
  });
  // notification_settings for the recipient; notification_preferences rows by type, as stored.
  const admin = ({ settings = null, prefs = {}, fail = false } = {}) => ({
    from: (table) => {
      const eqs = {};
      const q = { select: () => q, eq: (c, v) => { eqs[c] = v; return q; } };
      const res = () => (fail ? { data: null, error: { message: 'down' } }
        : { data: table === 'notification_settings' ? settings : (prefs[eqs.type] || []), error: null });
      q.maybeSingle = async () => res();
      q.then = (ok, no) => Promise.resolve(res()).then(ok, no);
      return q;
    },
  });
  const noon = new Date('2026-10-15T12:00:00Z');
  const night = new Date('2026-10-15T23:30:00Z');
  const gate = (a, now = noon) => route.pushAllowed(a, 'u-1', 'message', now);
  const pushOff = (type) => ({ [type]: [{ channel: 'push', enabled: false }] });
  assert.deepEqual(await gate(admin()), { ok: true }, 'nobody saved anything: pushed');
  assert.deepEqual(await gate(admin(), night), { ok: true }, 'no saved settings: the 22:00 UTC default does not silence an American evening');
  assert.deepEqual(await gate(admin({ settings: { muted: true } })), { ok: false, why: 'muted' });
  assert.deepEqual(await gate(admin({ prefs: pushOff('message') })), { ok: false, why: 'push_channel_off' });
  assert.deepEqual(await gate(admin({ prefs: { message: [{ channel: 'inapp', enabled: false }] } })), { ok: true }, 'another channel off');
  const saved = { muted: false, quiet_start: 22, quiet_end: 7, tz: 'America/New_York' };
  assert.deepEqual(await gate(admin({ settings: saved }), new Date('2026-10-16T03:00:00Z')), { ok: false, why: 'quiet_hours' }, '23:00 in New York');
  assert.deepEqual(await gate(admin({ settings: saved }), noon), { ok: true }, '08:00 in New York');
  assert.deepEqual(await gate(admin({ fail: true })), { ok: false, why: 'preferences_unreadable' }, 'a failed read sends nothing');

  // ── The route itself, row by row (Codex on #2372) ──
  process.env.PUSH_WEBHOOK_SECRET = 'test-secret';
  const post = async (a, record) => {
    st.admin = a; st.sent.length = 0;
    const res = await route.POST(new Request('https://shape.test/api/push/dispatch', {
      method: 'POST', headers: { 'x-push-secret': 'test-secret', 'content-type': 'application/json' }, body: JSON.stringify({ record }),
    }));
    const body = await res.json();
    return { skipped: body.skipped || null, sent: st.sent.length };
  };
  const msg = (side) => ({ user_id: 'u-1', type: 'message', title: 'New message', route: 'messages', data: { conversationId: 'c-1', providerRole: 'trainer', side } });
  // "Coach messages" off: the member's coach writing is not pushed; the same switch says nothing
  // about a coach's client writing, or a member's direct message.
  assert.deepEqual(await post(admin({ prefs: pushOff('coach_message') }), msg('client')), { skipped: 'push_channel_off', sent: 0 });
  assert.deepEqual(await post(admin({ prefs: pushOff('coach_message') }), msg('coach')), { skipped: null, sent: 1 });
  assert.deepEqual(await post(admin({ prefs: pushOff('coach_message') }), { user_id: 'u-1', type: 'message', title: 'New message', route: 'messages', data: { conversationId: 'dm-1' } }), { skipped: null, sent: 1 });
  // "Co-signs" off: the database's cosign row.
  assert.deepEqual(await post(admin({ prefs: pushOff('coach_cosign') }), { user_id: 'u-1', type: 'cosign', title: 'Co-signed', route: 'community', data: {} }), { skipped: 'push_channel_off', sent: 0 });
  // A row that stamped its own channels is still asked: muted means muted.
  const stamped = { user_id: 'u-1', type: 'credential_changes', title: 'Update your credentials', route: 'credentials', data: { channels: { inapp: true, push: true, email: false } } };
  assert.deepEqual(await post(admin({ settings: { muted: true } }), stamped), { skipped: 'muted', sent: 0 });
  assert.deepEqual(await post(admin(), stamped), { skipped: null, sent: 1 });
  // A row the writer marked in-app only is never pushed.
  assert.deepEqual(await post(admin(), { ...stamped, data: { channels: { inapp: true, push: false } } }), { skipped: 'push_channel_off', sent: 0 });
  // A reminder the recipient set for this hour is not held by their quiet hours; mute still holds it.
  const allNight = { muted: false, quiet_start: 0, quiet_end: 23, tz: 'UTC' };
  const reminder = { user_id: 'u-1', type: 'reminder_water', title: 'Water', route: 'habits', data: { channels: { inapp: true, push: true, email: false }, reminderId: 'r-1' } };
  const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super('2026-10-15T05:00:00Z'); } static now() { return RealDate.parse('2026-10-15T05:00:00Z'); } };
  try {
    assert.deepEqual(await post(admin({ settings: allNight }), reminder), { skipped: null, sent: 1 }, 'their own 05:00 reminder');
    assert.deepEqual(await post(admin({ settings: allNight }), msg('client')), { skipped: 'quiet_hours', sent: 0 }, 'anything else at 05:00');
    assert.deepEqual(await post(admin({ settings: { ...allNight, muted: true } }), reminder), { skipped: 'muted', sent: 0 });
  } finally { globalThis.Date = RealDate; }
  assert.equal(route.preferenceTypeFor('message', { side: 'client' }), 'coach_message');
  assert.equal(route.preferenceTypeFor('waitlist_invite', {}), 'waitlist_invite');
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
