// Every API route the app calls answers the installed app, not only the website.
//
// ⚠ EIGHTEEN OF THEM READ THE CALLER FROM THE COOKIE ALONE. The installed app calls
// theshapecommunity.com from its own origin with `Authorization: Bearer <token>` and no
// cookie, so the edge gate let the request through on the token and the route then asked
// the cookie client who was signed in, got nobody, and answered 401. The app reads a 401
// as "no data" or "could not save":
//   · the launch telegram (Shape Wire) lost its score, streak and protein lines;
//   · the Score page, the weekly commitment, the grocery list, planned meals, lifts, the
//     coach team, the Train numbers and the weekly readout came back empty;
//   · a coach's grocery lists and soundtracks never loaded or saved, the coach rings read
//     "not a coach", and a shared-client thread never opened;
//   · the date-of-birth check answered 401, which the 18+ gate reads as "nothing owed",
//     so the installed app never asked anyone for a date.
// All of it only in the native build: the hosted /m/ is same-origin and carries the
// cookie, so none of it showed there.
//
// `src/lib/request-auth.ts` reads the Bearer token when there is one and the cookie
// otherwise. Both corpora are derived (the /api/client folder, and every route path the
// app's source names), so a route added later is covered with nobody remembering this.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const API = join(ROOT, 'src/app/api');
const APP = join(ROOT, 'mobile-app/src');

const walk = (dir, keep) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  if (statSync(p).isDirectory()) return name === 'i18n' ? [] : walk(p, keep);
  return keep(name) ? [p] : [];
});
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (f) => stripComments(readFileSync(f, 'utf8'));
const pathOf = (f) => '/' + relative(join(ROOT, 'src/app'), dirname(f)).split('\\').join('/');

const ROUTES = walk(API, (n) => n === 'route.ts');
const APP_SRC = walk(APP, (n) => /\.(jsx?|mjs)$/.test(n)).map(read).join('\n');

// A route the app opens as a PAGE rather than fetching. On the web the session is bridged
// to the cookie first (bridgeSessionToApi); the installed app goes through the in-app
// browser handoff (openIntegrationHandoff), so neither carries a Bearer header here.
const OPENED_AS_PAGE = new Set(['/api/integrations/[provider]/authorize']);

// Reads the caller from the cookie and nothing else.
function cookieOnly(code) {
  return /from '@\/lib\/supabase\/server'/.test(code)
    && /\.auth\.getUser\(\)/.test(code)
    && !/from '@\/lib\/request-auth'/.test(code)
    && !/headers\.get\(\s*['"]authorization['"]\s*\)/i.test(code);
}

function appCalls(path) {
  const pattern = path.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(/\\\[[^\]]+\\\]|\[[^\]]+\]/g, "[^'\"`?/]+");
  return new RegExp(pattern + "(?![\\w/-])").test(APP_SRC);
}

test('both corpora are real', () => {
  assert.ok(ROUTES.length > 150, `only ${ROUTES.length} routes under src/app/api`);
  const called = ROUTES.filter((f) => appCalls(pathOf(f)));
  assert.ok(called.length > 60, `the app seems to call only ${called.length} routes; the path matcher is broken`);
  assert.ok(appCalls('/api/client/score') && appCalls('/api/coach/grocery-lists'), 'two known app calls were not found');
  assert.ok(!appCalls('/api/me'), '/api/me is a website route; a prefix of /api/me/... must not count as a call');
});

test('no route the app calls reads the signed-in caller from the cookie alone', () => {
  const bad = ROUTES
    .filter((f) => !OPENED_AS_PAGE.has(pathOf(f)) && appCalls(pathOf(f)))
    .filter((f) => cookieOnly(read(f)))
    .map((f) => relative(ROOT, f));
  assert.deepEqual(bad, [], 'these answer the installed app 401 — use clientForRequest/currentUser from @/lib/request-auth');
});

test('every member route under /api/client resolves the member through request-auth', () => {
  for (const f of ROUTES.filter((r) => r.startsWith(join(API, 'client') + '/'))) {
    const code = read(f);
    const rel = relative(ROOT, f);
    assert.doesNotMatch(code, /from '@\/lib\/supabase\/server'/, `${rel} imports the cookie-only client`);
    if (!/export async function (GET|POST|PUT|PATCH|DELETE)\b/.test(code)) continue;
    assert.match(code, /\b(currentUser|userLookupForRequest)\(request\)/, `${rel} never resolves the member from the request`);
  }
});

test('the page-opened exemption still names a real route', () => {
  for (const p of OPENED_AS_PAGE) {
    assert.ok(ROUTES.some((f) => pathOf(f) === p), `${p} no longer exists; drop it from OPENED_AS_PAGE`);
  }
});
