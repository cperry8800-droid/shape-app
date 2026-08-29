// The static-site mirror must ANSWER IDENTICALLY to the canonical module.
//
// public/newdesign/sentryInit.js carries its own copy of the user-context
// derivation because that surface has no bundler — it is plain files compiled
// in-browser by Babel — and so cannot import src/lib/sentry-context.mjs. Two
// implementations of one rule is a drift hazard, so this gate runs BOTH over a
// shared vector table plus a deterministic fuzz sweep and fails on the first
// disagreement. Same shape as tests/age-derive-mirror.test.mjs, which exists
// for the identical reason (public/age-derive.js ⇄ src/lib/age-derive.mjs).
//
// ⚠ BEHAVIOURAL, NOT TEXTUAL, and the reason is a defect this suite already
// shipped once: a previous guard for the age rule asserted a REGEX over source
// text, which passed on a file that merely contained the expression somewhere
// else and — worse — PINNED every surface to the spelling the canonical rule
// had already been rewritten to abandon. Assert what the code ANSWERS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { bsSentryUser, BS_SENTRY_DENIED_KEYS } from '../src/lib/sentry-context.mjs';

// Evaluate the classic script the way a browser would. It guards on
// window.SHAPE_SENTRY_DSN and returns immediately without one, so the DSN is
// stubbed; window.Sentry is stubbed because the file refuses to proceed
// without a usable SDK, and fetch is stubbed so the module-level init cannot
// reach the network from a test.
const MIRROR = (() => {
  const src = readFileSync(new URL('../public/newdesign/sentryInit.js', import.meta.url), 'utf8');
  const sandbox = {
    console: { warn() {}, error() {} },
    window: {
      SHAPE_SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      location: { pathname: '/newdesign/ClientApp.html' },
      Sentry: { init() {}, setUser() {} },
      fetch: () => Promise.resolve({ ok: false }),
    },
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'public/newdesign/sentryInit.js' });
  const api = sandbox.window.ShapeSentryUser;
  assert.ok(api && typeof api.bsSentryUser === 'function',
    'sentryInit.js did not register window.ShapeSentryUser.bsSentryUser');
  return api;
})();

// ⚠ CROSS-REALM NORMALISATION, and it is the minimum that works. The mirror's
// result is constructed inside the vm context, so its prototype is THAT realm's
// Object.prototype — and assert/strict's deepEqual compares prototypes, so two
// structurally identical objects fail. Spreading into a host literal changes the
// prototype and NOTHING else: every key and value is preserved exactly, unlike a
// JSON round-trip, which would silently drop an `undefined` value and could hide
// a real difference. null/undefined pass through untouched.
const plain = (v) => (v === null || typeof v !== 'object' ? v : { ...v });

// Every shape the canonical module's own contract calls out, so a mirror that
// silently dropped the roles array or the fallback id fails HERE by name, not
// only in the fuzz sweep where the failure would read as noise.
const VECTORS = [
  [null, undefined],
  [undefined, undefined],
  [{}, undefined],
  [{ id: 'u1' }, undefined],
  [{ id: 'u1', roles: [] }, undefined],
  [{ id: 'u1', roles: ['client'] }, undefined],
  [{ id: 'u1', roles: ['trainer'] }, undefined],
  [{ id: 'u1', roles: ['dietitian'] }, undefined],           // nutrition discipline, still a coach
  [{ id: 'u1', roles: ['nutritionist', 'trainer'] }, undefined], // dual-role — must not collapse
  [{ id: 'u1', roles: ['trainer', 'nutritionist'] }, undefined], // …and must sort to the same string
  [{ id: 'u1', role: 'trainer' }, undefined],                 // legacy singular fallback
  [{ id: 'u1', roles: [], role: 'nutritionist' }, undefined], // empty array falls back to role
  [{ id: 'u1', roles: ['trainer'], role: 'client' }, undefined], // array wins over the legacy field
  [{ id: 'u1', roles: ['', null, 'trainer', 42] }, undefined], // non-strings dropped
  [{ roles: ['trainer'] }, 'auth-id'],                        // id from the authenticated fallback
  [{ id: '', roles: ['trainer'] }, 'auth-id'],                // empty id → fallback
  [{ id: 'row-id' }, 'auth-id'],                              // the row's own id wins
  [{ id: 'u1' }, ''],                                          // empty fallback is not an id
  [{ id: 42 }, undefined],                                     // non-string id → null
  [[], undefined],                                             // an array is not a profile
  ['nope', undefined],
];

test('the mirror answers identically on every named vector', () => {
  for (const [profile, fallback] of VECTORS) {
    const want = bsSentryUser(profile, fallback);
    const got = MIRROR.bsSentryUser(profile, fallback);
    assert.deepEqual(plain(got), plain(want),
      `disagreement on ${JSON.stringify({ profile, fallback })}`);
  }
});

// ⚠ NEVER THROWS is half the canonical contract — it runs while Sentry is
// building a report for a DIFFERENT crash, so a throw here would replace that
// error with a stack pointing at the derivation. A throwing getter is the
// documented case; both sides must swallow it identically.
test('a throwing profile yields null on both sides, never an exception', () => {
  const mk = () => ({
    get id() { throw new Error('boom'); },
    roles: ['trainer'],
  });
  assert.equal(bsSentryUser(mk(), undefined), null);
  assert.equal(MIRROR.bsSentryUser(mk(), undefined), null);

  const mkRoles = () => ({ id: 'u1', get roles() { throw new Error('boom'); } });
  assert.equal(bsSentryUser(mkRoles(), undefined), null);
  assert.equal(MIRROR.bsSentryUser(mkRoles(), undefined), null);
});

// The point of the whole module: no PII may cross, whatever is handed in.
// bsSentryUser hand-builds its result and never spreads, so this holds by
// construction — pinned so a future edit that reaches for a spread fails here.
test('no denied key survives into either result', () => {
  const profile = { id: 'u1', roles: ['trainer'] };
  for (const k of BS_SENTRY_DENIED_KEYS) profile[k] = 'SECRET';
  for (const out of [bsSentryUser(profile, undefined), MIRROR.bsSentryUser(profile, undefined)]) {
    assert.ok(out, 'expected a context');
    for (const k of BS_SENTRY_DENIED_KEYS) {
      assert.ok(!(k in out), `denied key ${k} leaked into the context`);
    }
    assert.deepEqual(Object.keys(out).sort(), ['id', 'is_coach', 'roles']);
  }
});

// Deterministic fuzz — a seeded LCG, never Math.random, so a failure is
// reproducible and a green run is not luck.
test('the mirror agrees across a deterministic fuzz sweep', () => {
  let seed = 0x5f3759df;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const ROLE_POOL = ['client', 'trainer', 'nutritionist', 'dietitian', 'admin', '', 'TRAINER', 'Trainer'];
  const ID_POOL = ['u1', 'u2', '', null, undefined, 42, {}];

  for (let i = 0; i < 4000; i++) {
    const n = Math.floor(rnd() * 4);
    const roles = Array.from({ length: n }, () => pick(ROLE_POOL));
    const profile = {};
    if (rnd() > 0.15) profile.id = pick(ID_POOL);
    if (rnd() > 0.3) profile.roles = roles;
    if (rnd() > 0.5) profile.role = pick(ROLE_POOL);
    const fallback = pick(ID_POOL);
    const want = bsSentryUser(profile, fallback);
    const got = MIRROR.bsSentryUser(profile, fallback);
    assert.deepEqual(plain(got), plain(want),
      `fuzz disagreement at i=${i} on ${JSON.stringify({ profile, fallback })}`);
  }
});

// ⚠ THE CALL-SITE INVARIANT, and it exists because the first cut of this wave
// got it wrong. `<SentryUser>` must hand `bsSentryUser` the RAW profile fields —
// both the `roles` array and the legacy singular `role` — never a pre-picked
// one. `profiles.roles` is `NOT NULL DEFAULT '{}'::text[]`, so an EMPTY array is
// the column's default (2 of the 4 live accounts sit there today with a real
// `role`), and `rolesOf` falls back on `arr && arr.length` — hand it only the
// empty array and it has nothing to fall back TO, so a trainer reports
// `roles: ''` / `is_coach: false`: a coach recorded as not a coach.
//
// This asserts what the call sites ANSWER — "did you pass both inputs?" — not
// how any derivation is spelled, which is the distinction the age-guard
// post-mortem in this file's header is about. A page that passes the id alone
// is fine and deliberate (an admin board has no profile row); passing `roles`
// WITHOUT `role` is the shape that silently drops the fallback.
test('every SentryUser call site that passes roles also passes role', async () => {
  const { parse } = await import('@babel/parser');
  const files = ['src/app/dashboard/layout.tsx', 'src/app/console/page.tsx', 'src/app/warroom/page.tsx'];
  let sites = 0;
  for (const rel of files) {
    const src = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node.type === 'JSXOpeningElement' && node.name?.name === 'SentryUser') {
        sites++;
        const names = node.attributes
          .filter((a) => a.type === 'JSXAttribute')
          .map((a) => a.name?.name);
        assert.ok(names.includes('id'), `${rel}: <SentryUser> without an id`);
        if (names.includes('roles')) {
          assert.ok(names.includes('role'),
            `${rel}: <SentryUser roles=…> must also pass role — a pre-picked empty roles array drops the legacy fallback`);
        }
      }
      for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
        walk(node[k]);
      }
    };
    walk(ast.program.body);
  }
  // Guard the guard: if the element is ever renamed, this must fail loudly
  // rather than pass by finding nothing to check.
  assert.ok(sites >= 3, `expected at least 3 <SentryUser> call sites, found ${sites}`);
});

// The exact shape the component builds, driven through the real derivation: the
// empty-array-plus-legacy-role case must still resolve the coach.
test('an empty roles array with a legacy singular role still resolves the coach', () => {
  const ctx = bsSentryUser({ id: 'u1', roles: [], role: 'trainer' }, 'u1');
  assert.equal(ctx.roles, 'trainer');
  assert.equal(ctx.is_coach, true);
  const mirrored = MIRROR.bsSentryUser({ id: 'u1', roles: [], role: 'trainer' }, 'u1');
  assert.deepEqual({ ...mirrored }, ctx);
});
