// A coach opening the app cold. The shell picks a role bundle from the stored role, and the coach
// bundle (iosAppBroadsheetPros.jsx) reads the CLIENT module's globals from window when it loads:
// BSFacetAvatar, BSClientChat, BSSettings, BSPublicProfile, the Score and Store pages. The coach
// bundle used to load only the feature modules, so a cold start as a trainer or nutritionist
// rendered an undefined component on Today and showed "Something went wrong" (React #130). It only
// worked when the member preview had loaded the client module first.
//
// The loaders are run here for real, lifted out of iosAppBroadsheetMain.jsx with their dynamic
// imports recorded, so the test reads the order the modules actually load in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'mobile-app/src/broadsheet');
const MAIN = readFileSync(join(DIR, 'iosAppBroadsheetMain.jsx'), 'utf8');

// The source of one top-level function, by brace count (these bodies hold no braces in strings).
function fnSource(name) {
  let at = MAIN.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `no ${name} in iosAppBroadsheetMain.jsx`);
  if (MAIN.slice(at - 6, at) === 'async ') at -= 6;
  let depth = 0;
  for (let i = MAIN.indexOf('{', at); i < MAIN.length; i += 1) {
    if (MAIN[i] === '{') depth += 1;
    else if (MAIN[i] === '}') { depth -= 1; if (depth === 0) return MAIN.slice(at, i + 1); }
  }
  throw new Error(`${name} never closes`);
}

// The real loaders, with `import()` swapped for a recorder that resolves (or fails) on demand.
function loaders(fail = () => false) {
  const order = [];
  const imp = (p) => { order.push(p.replace('./', '')); return fail(p) ? Promise.reject(new Error(`boom ${p}`)) : Promise.resolve({}); };
  const code = ['_bsChunkRecover', 'loadClientBundle', 'loadProsBundle', 'ensureRoleBundle'].map(fnSource).join('\n').replace(/\bimport\(/g, '__imp(');
  // eslint-disable-next-line no-new-func
  const api = new Function('__imp', 'window', `let _clientBundlePromise = null; let _prosBundlePromise = null;\n${code}\nreturn { loadClientBundle, loadProsBundle, ensureRoleBundle };`)(imp, { sessionStorage: { getItem: () => '1', setItem() {} }, location: { reload() {} } });
  return { ...api, order };
}

const FEATURES = ['iosAppBroadsheetCalendar.jsx', 'iosAppBroadsheetProviderApply.jsx', 'iosAppBroadsheetMarketplace.jsx', 'iosAppBroadsheetWidgets.jsx', 'iosAppBroadsheetHabits.jsx'];

for (const role of ['trainer', 'nutritionist', 'dietitian']) {
  test(`a cold start as a ${role} loads the client module before the coach module`, async () => {
    const { ensureRoleBundle, order } = loaders();
    await ensureRoleBundle(role);
    assert.ok(order.includes('iosAppBroadsheetClient.jsx'), 'the client module never loads for a coach');
    assert.equal(order[order.length - 1], 'iosAppBroadsheetPros.jsx', 'the coach module loads last');
    assert.ok(order.indexOf('iosAppBroadsheetClient.jsx') < order.indexOf('iosAppBroadsheetPros.jsx'));
    // The feature modules still come before the client module, which reads their globals at load.
    for (const f of FEATURES) assert.ok(order.indexOf(f) < order.indexOf('iosAppBroadsheetClient.jsx'), `${f} after the client module`);
  });
}

test('a member still loads only the client bundle', async () => {
  const { ensureRoleBundle, order } = loaders();
  await ensureRoleBundle('client');
  assert.deepEqual(order, [...FEATURES, 'iosAppBroadsheetClient.jsx']);
});

test('the client module loads once, whichever role asks first', async () => {
  const { loadClientBundle, loadProsBundle, order } = loaders();
  await loadClientBundle();
  await loadProsBundle();
  await loadProsBundle();
  assert.equal(order.filter((p) => p === 'iosAppBroadsheetClient.jsx').length, 1);
  assert.equal(order.filter((p) => p === 'iosAppBroadsheetPros.jsx').length, 1);
});

test('a client module that fails to load fails the coach bundle too, and a retry loads it again', async () => {
  let failing = true;
  const { loadProsBundle, order } = loaders((p) => failing && p.includes('Client'));
  await assert.rejects(loadProsBundle(), /boom/);
  assert.ok(!order.includes('./iosAppBroadsheetPros.jsx') && !order.includes('iosAppBroadsheetPros.jsx'), 'the coach module loaded without the client module');
  failing = false;
  await loadProsBundle();
  assert.equal(order[order.length - 1], 'iosAppBroadsheetPros.jsx');
});

test('the coach module does read the client module\'s components from window at load', () => {
  const pros = readFileSync(join(DIR, 'iosAppBroadsheetPros.jsx'), 'utf8');
  const client = readFileSync(join(DIR, 'iosAppBroadsheetClient.jsx'), 'utf8');
  const taken = pros.match(/const \{([\s\S]*?)\} = window;/)[1].split(',').map((s) => s.trim()).filter(Boolean);
  // What the client module itself puts on window, in its Object.assign(window, { … }) blocks.
  const given = new Set([...client.matchAll(/Object\.assign\(window, \{([\s\S]*?)\}\);/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(':')[0].trim())).filter(Boolean));
  const fromClient = taken.filter((n) => given.has(n));
  for (const n of ['BSClientChat', 'BSSettings', 'BSContactPage', 'BSTermsPage']) assert.ok(fromClient.includes(n), `${n} no longer comes from the client module`);
});
