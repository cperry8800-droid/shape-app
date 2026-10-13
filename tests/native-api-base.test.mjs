// The installed app's API base (VITE_API_BASE_URL). Its WebView has no same origin to call
// (https://localhost on Android, capacitor://localhost on iOS), so shapeBackend.js and push.js
// read the base from the build; unset, every /api call in a native build had nothing to call.
// Each pipeline that builds the app's web bundle sets it; the hosted /m/ build does not, since it
// is served from the site and calls it same-origin.
// Run: node --test tests/native-api-base.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const SITE = 'https://theshapecommunity.com';

test('every Android job that builds the app bundle sets the API base', () => {
  const steps = read('.github/workflows/android-build.yml').split(/\n\s+- name: /);
  const builds = steps.filter((s) => /\n\s+run: npm run build\n/.test(s));
  assert.equal(builds.length, 2, 'the debug and release jobs each build the bundle');
  for (const step of builds) {
    assert.match(step, new RegExp(`\\n\\s+VITE_API_BASE_URL: ${SITE.replace(/[./]/g, '\\$&')}\\n`), step.split('\n')[0]);
  }
});

test('the TestFlight build exports the API base before it builds', () => {
  const yaml = read('codemagic.yaml');
  const at = yaml.indexOf(`export VITE_API_BASE_URL="${SITE}"`);
  assert.ok(at > 0, 'codemagic.yaml exports it');
  const build = yaml.indexOf('npm run build', at);
  assert.ok(build > at && !yaml.slice(at, build).includes('script: |'), 'in the same script, before npm run build');
});

test('the app reads it, the server answers the app, and the hosted /m/ build calls its own origin', () => {
  assert.match(read('mobile-app/src/services/shapeBackend.js'), /const _apiEnvBase = \(import\.meta\.env\.VITE_API_BASE_URL \|\| ''\)/);
  assert.match(read('mobile-app/src/services/push.js'), /import\.meta\.env\.VITE_API_BASE_URL/);
  const cors = read('src/lib/native-cors.ts');
  assert.match(cors, /NATIVE_APP_ORIGINS: readonly string\[\] = \['capacitor:\/\/localhost', 'https:\/\/localhost'\]/, 'both app origins are answered');
  assert.doesNotMatch(read('scripts/build-m.sh'), /VITE_API_BASE_URL/, 'the hosted /m/ build stays same-origin');
});

// The shipping connectProvider, evaluated with the names it reads.
function connectProviderWith(scope) {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const start = src.indexOf('async function connectProvider(');
  const end = src.indexOf('async function connectWhoop(', start);
  assert.ok(start >= 0 && end > start, 'connectProvider must stay where this test reads it');
  const keys = Object.keys(scope);
  return new Function(...keys, `${src.slice(start, end)}\nreturn connectProvider;`)(...keys.map((k) => scope[k]));
}

test('the installed app does not send a member to the website to connect WHOOP, Strava or Spotify (Codex, #2332)', async () => {
  // The authorize route reads the website's cookie session, which the app's WebView never has,
  // so the trip would end on "sign in". With the API base set the app must still refuse.
  const run = async (native) => {
    const calls = [];
    const connect = connectProviderWith({
      apiBaseUrl: SITE,
      _isNative: native,
      state: { session: { access_token: 'a', refresh_token: 'r' } },
      bridgeSessionToApi: async () => { calls.push('bridge'); return { bridged: true }; },
      window: { location: { assign: (url) => calls.push(url) } },
    });
    let error = null;
    try { await connect('whoop'); } catch (e) { error = e; }
    return { calls, error };
  };
  const app = await run(true);
  assert.deepEqual(app.calls, [], 'no bridge and no navigation from the installed app');
  assert.match(String(app.error?.message), /theshapecommunity\.com/);
  const web = await run(false);
  assert.equal(web.error, null);
  assert.deepEqual(web.calls, ['bridge', `${SITE}/api/integrations/whoop/authorize?return=${encodeURIComponent('/newdesign/GetApp.html')}`], 'the hosted /m/ build still connects');
});
