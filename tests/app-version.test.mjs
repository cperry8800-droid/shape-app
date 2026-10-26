// The "please update" check, and the one version number both stores ship.
//
// The installed app carries its screens in the binary, so an old build keeps calling today's
// server until its owner updates it. src/lib/app-version.mjs names the oldest version each
// store may run; GET /api/app/version answers it; BSUpdateGate.jsx, mounted here in jsdom,
// covers the app when the answer is 'required' and shows a dismissible card for 'recommended'.
//
// The version is mobile-app/package.json's. Android's versionCode was a fixed 1, so Google
// Play would have refused every upload after the first; the iOS MARKETING_VERSION was a
// typed-in 1.0 nothing kept in step with the app's own 0.1.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { loadRealModule } from './helpers/load-real-module.mjs';
import {
  APP_MIN_VERSION, APP_RECOMMENDED_VERSION, PLAY_STORE_URL,
  parseAppVersion, compareAppVersions, appUpdateFor, appStoreUrlFrom,
} from '../src/lib/app-version.mjs';
import { bsAppVersionPath, bsAppUpdateFrom, bsStoreUrl, BS_UPDATE_DISMISSED_KEY } from '../mobile-app/src/services/appUpdate.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const APP_VERSION = JSON.parse(read('mobile-app/package.json')).version;

test('versions compare by number, and anything unreadable compares as nothing', () => {
  assert.deepEqual(parseAppVersion('1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseAppVersion('1.2'), [1, 2, 0]);
  for (const bad of ['', '1', 'v1.2.3', '1.2.3-beta', '1.2.3.4', null, undefined, 12]) assert.equal(parseAppVersion(bad), null, String(bad));
  assert.equal(compareAppVersions('1.10.0', '1.9.0'), 1, 'numbers, not strings');
  assert.equal(compareAppVersions('1.0', '1.0.0'), 0);
  assert.equal(compareAppVersions('0.9.9', '1.0.0'), -1);
  assert.equal(compareAppVersions('1.0.0', 'garbage'), null);
});

test('an update is required only for a version known to be below the minimum', () => {
  const policy = { min: { ios: '1.2.0', android: '1.1.0' }, recommended: { ios: '1.3.0', android: null } };
  assert.equal(appUpdateFor('ios', '1.1.9', policy), 'required');
  assert.equal(appUpdateFor('ios', '1.2.0', policy), 'recommended');
  assert.equal(appUpdateFor('ios', '1.3.0', policy), 'none');
  assert.equal(appUpdateFor('android', '1.0.5', policy), 'required', 'each store has its own minimum');
  assert.equal(appUpdateFor('android', '1.1.0', policy), 'none', 'no recommended version is no nudge');
  for (const [platform, version] of [['web', '0.0.1'], ['ios', ''], ['ios', 'junk'], ['', '0.1.0']]) {
    assert.equal(appUpdateFor(platform, version, policy), 'none', `${platform} ${version}: a lock-out never comes from not knowing`);
  }
});

test('the app built from this tree is never told to update itself', () => {
  assert.ok(parseAppVersion(APP_VERSION), `mobile-app/package.json version ${APP_VERSION} isn't a version`);
  for (const platform of ['ios', 'android']) {
    assert.ok(parseAppVersion(APP_MIN_VERSION[platform]), platform);
    assert.equal(appUpdateFor(platform, APP_VERSION), 'none', `${platform}: a minimum or recommended version above ${APP_VERSION} locks out the newest build`);
    const rec = APP_RECOMMENDED_VERSION[platform];
    if (rec) assert.ok(compareAppVersions(rec, APP_MIN_VERSION[platform]) >= 0, `${platform}: recommended below the minimum`);
  }
});

test('the App Store page comes only from a real lookup result', () => {
  assert.equal(appStoreUrlFrom({ resultCount: 1, results: [{ trackViewUrl: 'https://apps.apple.com/us/app/shape/id123?uo=4' }] }), 'https://apps.apple.com/us/app/shape/id123?uo=4');
  assert.equal(appStoreUrlFrom({ resultCount: 0, results: [] }), null, 'not live on the App Store yet');
  assert.equal(appStoreUrlFrom({ results: [{ trackViewUrl: 'https://evil.example/app' }] }), null);
  assert.equal(appStoreUrlFrom(null), null);
});

// The route, run as it ships.
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const appVersion = await import('../src/lib/app-version.mjs');
async function route(policy) {
  const mod = await loadRealModule(join(ROOT, 'src/app/api/app/version/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/app-version.mjs', { ...appVersion, ...policy }]]),
  });
  return async (qs) => {
    const res = await mod.GET(new Request(`https://theshapecommunity.com/api/app/version?${qs}`));
    return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() };
  };
}
function stubFetch(answer) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (answer instanceof Error) throw answer;
    return { ok: true, json: async () => answer };
  };
  return calls;
}

test('GET /api/app/version answers the rule, and asks Apple only for an iPhone that must update', async () => {
  const strict = {
    appUpdateFor: (p, v) => appVersion.appUpdateFor(p, v, { min: { ios: '2.0.0', android: '2.0.0' }, recommended: { ios: null, android: null } }),
  };
  const get = await route(strict);
  let calls = stubFetch({ resultCount: 1, results: [{ trackViewUrl: 'https://apps.apple.com/us/app/shape/id42' }] });
  let r = await get('platform=ios&version=1.0.0');
  assert.equal(r.status, 200);
  assert.equal(r.cache, 'no-store');
  assert.deepEqual(r.body, { update: 'required', storeUrl: 'https://apps.apple.com/us/app/shape/id42', recommendedVersion: null });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/itunes\.apple\.com\/lookup\?bundleId=com\.theshapecommunity\.app&country=us$/);

  calls = stubFetch(new Error('offline'));
  r = await get('platform=ios&version=1.0.0');
  assert.deepEqual(r.body, { update: 'required', storeUrl: null, recommendedVersion: null }, 'a failed lookup still says update');

  calls = stubFetch({});
  r = await get('platform=android&version=1.0.0');
  assert.deepEqual(r.body, { update: 'required', storeUrl: PLAY_STORE_URL, recommendedVersion: null });
  r = await get('platform=ios&version=2.0.0');
  assert.deepEqual(r.body, { update: 'none', storeUrl: null, recommendedVersion: null });
  r = await get('version=1.0.0');
  assert.equal(r.body.update, 'none', 'no platform');
  assert.equal(calls.length, 0, 'Apple is asked only when an iPhone has to update');

  const nudge = await route({
    APP_RECOMMENDED_VERSION: { ios: null, android: '1.4.0' },
    appUpdateFor: (p, v) => appVersion.appUpdateFor(p, v, { min: { ios: '1.0.0', android: '1.0.0' }, recommended: { ios: null, android: '1.4.0' } }),
  });
  r = await nudge('platform=android&version=1.3.0');
  assert.deepEqual(r.body, { update: 'recommended', storeUrl: PLAY_STORE_URL, recommendedVersion: '1.4.0' });

  const live = await route({});
  r = await live(`platform=ios&version=${APP_VERSION}`);
  assert.equal(r.body.update, 'none', 'today\'s rule leaves this build alone');
  // force-dynamic is fetchCache 'force-no-store': it would ask Apple on every check (Codex on #2472).
  const src = readFileSync(join(ROOT, 'src/app/api/app/version/route.ts'), 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /export const (dynamic|fetchCache) =/);
  assert.match(src, /next: \{ revalidate: 3600 \}/);
});

test('the app blocks only on an explicit "required", and knows where the store is', () => {
  assert.equal(bsAppVersionPath('ios', '1.0.0'), '/api/app/version?platform=ios&version=1.0.0');
  for (const bad of [null, 'required', 42, {}, { update: 'REQUIRED' }, { update: 'soon' }, { update: 'recommended' }]) {
    assert.equal(bsAppUpdateFrom(bad).update, 'none', JSON.stringify(bad));
  }
  assert.deepEqual(bsAppUpdateFrom({ update: 'required', storeUrl: 'https://apps.apple.com/app/id1' }), { update: 'required', storeUrl: 'https://apps.apple.com/app/id1', recommendedVersion: '' });
  assert.equal(bsAppUpdateFrom({ update: 'required', storeUrl: 'javascript:alert(1)' }).storeUrl, '', 'only an https page is opened');
  assert.deepEqual(bsAppUpdateFrom({ update: 'recommended', recommendedVersion: '1.2.0', storeUrl: null }), { update: 'recommended', storeUrl: '', recommendedVersion: '1.2.0' });
  assert.equal(bsStoreUrl('ios', 'https://apps.apple.com/x', '123456789'), 'https://apps.apple.com/x', 'the server\'s first');
  assert.equal(bsStoreUrl('ios', '', '123456789'), 'https://apps.apple.com/app/id123456789', 'then the id Codemagic baked in');
  assert.equal(bsStoreUrl('ios', '', ''), '', 'an iPhone that knows neither names the store');
  assert.equal(bsStoreUrl('ios', '', 'not-an-id'), '');
  assert.equal(bsStoreUrl('android', '', ''), PLAY_STORE_URL);
});

// ── The screen, mounted ──────────────────────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="bs-phone-surface"></div></body></html>', { url: 'https://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__SHAPE_VERSION__ = '1.0.0';
globalThis.__VITE_ENV__ = { VITE_APP_STORE_ID: '' };

const React = require_('react');
const { createRoot } = require_('react-dom/client');
const cap = { native: true, platform: 'ios' };
const tr = (key, opts) => (opts && opts.defaultValue) || key;
const BSUpdateGate = (await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSUpdateGate.jsx'), {
  registry: new Map([
    ['react', React],
    ['react-dom', require_('react-dom')],
    ['@capacitor/core', { Capacitor: { isNativePlatform: () => cap.native, getPlatform: () => cap.platform } }],
    ['../i18n/index.js', { useTr: () => ({ tr }) }],
  ]),
})).default;

const settle = async () => { for (let i = 0; i < 6; i++) await React.act(() => new Promise((r) => setTimeout(r, 0))); };
async function mount(answer, { native = true, platform = 'ios' } = {}) {
  cap.native = native;
  cap.platform = platform;
  const asked = [];
  window.ShapeApi = {
    fetch: async (path) => {
      asked.push(path);
      if (answer instanceof Error) throw answer;
      if (answer && answer.status) return { ok: false, status: answer.status, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => answer };
    },
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(BSUpdateGate)); });
  await settle();
  const surface = document.getElementById('bs-phone-surface');
  return {
    asked,
    gate: () => surface.querySelector('[data-bs-update]'),
    buttons: () => [...surface.querySelectorAll('[data-bs-update] button')],
    unmount: () => React.act(() => { root.unmount(); host.remove(); }),
  };
}

test('the screen: "required" covers the app with one way on, the store', async () => {
  // The app behind it, in the same surface: inert while the screen shows (Codex on #2472).
  const behind = document.createElement('div');
  behind.innerHTML = '<button id="behind">Home</button>';
  document.getElementById('bs-phone-surface').appendChild(behind);
  const ui = await mount({ update: 'required', storeUrl: 'https://apps.apple.com/us/app/shape/id42' });
  assert.equal(behind.hasAttribute('inert'), true, 'the app underneath can still be reached by keyboard');
  assert.equal(document.activeElement, ui.buttons()[0], 'the Update button has the focus');
  assert.deepEqual(ui.asked, ['/api/app/version?platform=ios&version=1.0.0'], 'asks with the build\'s own version');
  assert.equal(ui.gate().dataset.bsUpdate, 'required');
  assert.equal(ui.gate().getAttribute('role'), 'alertdialog');
  assert.match(ui.gate().textContent, /Update Shape to keep going\./);
  assert.equal(ui.buttons().length, 1, 'no way past it but the store');
  assert.match(ui.buttons()[0].textContent, /Update now/);
  ui.unmount();
  assert.equal(behind.hasAttribute('inert'), false, 'the app is given back when the screen goes');
  behind.remove();

  const noStore = await mount({ update: 'required', storeUrl: null });
  assert.equal(noStore.buttons().length, 0, 'an iPhone with no App Store page has no dead button');
  assert.match(noStore.gate().textContent, /Open the App Store and update Shape\./);
  noStore.unmount();

  const android = await mount({ update: 'required', storeUrl: null }, { platform: 'android' });
  assert.equal(android.buttons().length, 1, 'Android always knows its Play page');
  android.unmount();
});

test('the screen: nothing on a failed check, an unknown answer, "none", or the hosted /m/', async () => {
  for (const answer of [new Error('offline'), { status: 500 }, { update: 'none' }, { update: 'mandatory' }, null]) {
    const ui = await mount(answer);
    assert.equal(ui.gate(), null, JSON.stringify(answer && answer.message || answer));
    ui.unmount();
  }
  const web = await mount({ update: 'required', storeUrl: 'https://apps.apple.com/x' }, { native: false });
  assert.equal(web.asked.length, 0, 'the hosted /m/ never asks');
  assert.equal(web.gate(), null);
  web.unmount();
});

test('the screen: "recommended" is a card the member can put off until a newer version', async () => {
  localStorage.clear();
  const ui = await mount({ update: 'recommended', recommendedVersion: '1.1.0', storeUrl: PLAY_STORE_URL }, { platform: 'android' });
  assert.equal(ui.gate().dataset.bsUpdate, 'recommended');
  const later = ui.buttons().find((b) => /Not now/.test(b.textContent));
  await React.act(async () => { later.dispatchEvent(new window.Event('click', { bubbles: true })); });
  assert.equal(ui.gate(), null);
  assert.equal(localStorage.getItem(BS_UPDATE_DISMISSED_KEY), '1.1.0');
  ui.unmount();

  const again = await mount({ update: 'recommended', recommendedVersion: '1.1.0', storeUrl: PLAY_STORE_URL }, { platform: 'android' });
  assert.equal(again.gate(), null, 'stays put off on the next launch');
  again.unmount();
  const newer = await mount({ update: 'recommended', recommendedVersion: '1.2.0', storeUrl: PLAY_STORE_URL }, { platform: 'android' });
  assert.ok(newer.gate(), 'a newer recommended version asks again');
  newer.unmount();
  const required = await mount({ update: 'required', storeUrl: PLAY_STORE_URL }, { platform: 'android' });
  assert.equal(required.gate().dataset.bsUpdate, 'required', 'putting off a nudge never puts off a required update');
  required.unmount();
});

test('the shell mounts the screen over every stage', () => {
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /^import BSUpdateGate from '\.\/BSUpdateGate\.jsx';$/m);
  assert.match(main, /\n        <BSUpdateGate \/>\n      <\/BSPhone>/, 'inside BSPhone, after every stage');
});

test('both stores take the version from mobile-app/package.json', () => {
  const gradle = read('mobile-app/android/app/build.gradle');
  assert.match(gradle, /def shapeVersion = new groovy\.json\.JsonSlurper\(\)\.parse\(file\('\.\.\/\.\.\/package\.json'\)\)\.version/);
  assert.match(gradle, /versionName shapeVersion\n/);
  assert.match(gradle, /def shapeVersionCode = \(System\.getenv\('SHAPE_VERSION_CODE'\) \?: '1'\)\.toInteger\(\)/);
  assert.match(gradle, /versionCode shapeVersionCode\n/);
  assert.doesNotMatch(gradle, /versionCode \d|versionName "/, 'no typed-in version left');

  // Every Android build gets a versionCode higher than the last: Play refuses any other.
  const android = read('.github/workflows/android-build.yml');
  const stamp = 'export SHAPE_VERSION_CODE=$(( $(date -u +%s) / 60 ))';
  for (const task of ['assembleDebug', 'assembleRelease']) {
    const at = android.indexOf(`./gradlew ${task}`);
    assert.ok(at > 0, task);
    assert.ok(android.lastIndexOf(stamp, at) > android.lastIndexOf('- name:', at), `${task} runs with SHAPE_VERSION_CODE set in its own step`);
  }

  // iOS: Codemagic stamps MARKETING_VERSION from package.json and checks both configurations took it.
  const cm = read('codemagic.yaml');
  assert.match(cm, /VERSION=\$\(node -p "require\('\.\.\/\.\.\/package\.json'\)\.version"\)/);
  assert.match(cm, /perl -pi -e "s\/MARKETING_VERSION = \[\^;\]\+;\/MARKETING_VERSION = \$VERSION;\/g" App\.xcodeproj\/project\.pbxproj/);
  assert.match(cm, /\[ "\$\(grep -c "MARKETING_VERSION = \$VERSION;" App\.xcodeproj\/project\.pbxproj\)" -eq 2 \]/);
  assert.match(cm, /export VITE_APP_STORE_ID="\$\{APP_STORE_APP_ID:-\}"\n\s+npm run build/);
  const pbx = read('mobile-app/ios/App/App.xcodeproj/project.pbxproj');
  assert.equal((pbx.match(/MARKETING_VERSION = [^;]+;/g) || []).length, 2, 'the stamp expects two configurations');
  assert.match(read('mobile-app/ios/App/App/Info.plist'), /<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/);
});
