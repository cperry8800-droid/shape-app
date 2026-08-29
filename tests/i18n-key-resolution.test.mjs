// Every catalog key the LAUNCH FLOW asks for must exist in `en`.
//
// ⚠ WHY THIS SURFACE SPECIFICALLY. These call sites pass no `defaultValue` — the
// ESM modules import `useTr` and call `tr('login.fieldName')` bare — so a typo
// does not fall back to English, it renders the RAW KEY. On the cold open. On the
// sign-up form. It is the loudest possible failure in the least forgiving place,
// and nothing catches it today: `tsc` sees a string, the parse-check sees a
// string, and the catalog parity gate only compares the twelve locales AGAINST
// `en` — a key absent from `en` is absent everywhere and parity is satisfied.
// (That is not hypothetical: `home:lead.{energy,hunger,hydration}.*` shipped with
// no entry in ANY locale, `en` included, and the parity gate stayed green.)
//
// ⚠ AND IT PINS THE OTHER DIRECTION TOO — a key authored in thirteen catalogs
// that nothing reads is thirteen strings of translation work for a screen that
// does not exist, which is exactly what this cut deleted from `BSSplash`.
//
// The walk is an AST walk, not a regex: the real call sites use ternaries
// (`tr(isCreate ? 'login.eyebrowJoin' : 'login.eyebrowSignIn')`) and a
// concatenation over a literal array (`tr('paywall.feat.' + k)`), and a text
// scan reads both as unresolvable. Anything the walk genuinely cannot resolve is
// COUNTED and asserted at zero, so the guard can never pass by seeing nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as babelParser from '@babel/parser';

// The launch flow: the shell that renders before the app, and the telegram body
// it hands to the member. Both call the translator with no defaultValue.
const FILES = [
  'mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx',
  'mobile-app/src/services/dailyWire.mjs',
];
// `useTr('onboarding')` in the shell; the wire prefixes every key explicitly.
const DEFAULT_NS = 'onboarding';
const CATS = new Map();

function catalog(ns) {
  if (!CATS.has(ns)) {
    const p = `mobile-app/src/i18n/catalogs/en/${ns}.json`;
    CATS.set(ns, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
  }
  return CATS.get(ns);
}

function split(key) {
  const i = key.indexOf(':');
  return i < 0 ? [DEFAULT_NS, key] : [key.slice(0, i), key.slice(i + 1)];
}

function parse(file) {
  return babelParser.parse(fs.readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: ['jsx'],
  });
}

// Collect the first argument of every tr()/T() call. `T` is the wire's injected
// translator wrapper — same contract, and it carries the English as its second
// argument, so a miss there degrades rather than shows a key. Included anyway:
// a key it asks for and `en` lacks is a key twelve locales will never receive.
function collect(node, out, unresolved) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) collect(n, out, unresolved); return; }
  if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier'
      && (node.callee.name === 'tr' || node.callee.name === 'T')) {
    const a = node.arguments[0];
    if (!a) {
      unresolved.push('(no argument)');
    } else if (a.type === 'StringLiteral') {
      out.exact.add(a.value);
    } else if (a.type === 'ConditionalExpression'
               && a.consequent.type === 'StringLiteral' && a.alternate.type === 'StringLiteral') {
      out.exact.add(a.consequent.value);
      out.exact.add(a.alternate.value);
    } else if (a.type === 'BinaryExpression' && a.operator === '+') {
      // `tr('paywall.feat.' + k)` and `T('home:lead.' + lever + '.head', …)` — the
      // middle is computed, so pin the FAMILY by its literal ends. A `+` chain
      // nests to the LEFT, so flatten it before reading the first/last part;
      // reading `a.left` alone sees a BinaryExpression and resolves nothing.
      const parts = [];
      (function flatten(n) {
        if (n.type === 'BinaryExpression' && n.operator === '+') { flatten(n.left); flatten(n.right); }
        else parts.push(n);
      })(a);
      const head = parts[0], tail = parts[parts.length - 1];
      if (head && head.type === 'StringLiteral') {
        out.prefixes.add(head.value);
        // a literal tail pins the family tighter: `lead.` + X + `.head` must match
        // a real key, not merely some key starting with `lead.`
        if (parts.length > 1 && tail.type === 'StringLiteral') out.spans.add([head.value, tail.value].join('\u0000'));
      } else {
        unresolved.push(`BinaryExpression with no literal head at line ${a.loc ? a.loc.start.line : '?'}`);
      }
    } else {
      unresolved.push(`${a.type} at line ${a.loc ? a.loc.start.line : '?'}`);
    }
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    collect(node[k], out, unresolved);
  }
}

function walk() {
  const out = { exact: new Set(), prefixes: new Set(), spans: new Set() };
  const unresolved = [];
  for (const f of FILES) collect(parse(f), out, unresolved);
  return { out, unresolved };
}

test('every launch-flow key resolves in the en catalog', () => {
  const { out, unresolved } = walk();
  assert.equal(unresolved.length, 0,
    `unresolvable translator argument(s) — teach the walk this shape rather than \
deleting the assertion: ${unresolved.join(', ')}`);

  const missing = [];
  for (const key of [...out.exact].sort()) {
    const [ns, k] = split(key);
    const cat = catalog(ns);
    if (!cat) { missing.push(`${key}  (no en/${ns}.json)`); continue; }
    if (!(k in cat)) missing.push(key);
  }
  for (const pre of [...out.prefixes].sort()) {
    const [ns, k] = split(pre);
    const cat = catalog(ns);
    if (!cat) { missing.push(`${pre}*  (no en/${ns}.json)`); continue; }
    if (!Object.keys(cat).some((x) => x.startsWith(k))) missing.push(`${pre}*  (no key with this prefix)`);
  }
  for (const span of [...out.spans].sort()) {
    const [pre, suf] = span.split('\u0000');
    const [ns, k] = split(pre);
    const cat = catalog(ns);
    if (!cat) { missing.push(`${pre}*${suf}  (no en/${ns}.json)`); continue; }
    if (!Object.keys(cat).some((x) => x.startsWith(k) && x.endsWith(suf))) {
      missing.push(`${pre}*${suf}  (no key matching this family)`);
    }
  }
  assert.deepEqual(missing, [], `launch-flow keys absent from en: ${missing.join(', ')}`);

  // Guard the guard: a walk that stops matching call sites would report a clean
  // run over nothing at all. The launch shell + wire carry ~100 distinct keys.
  assert.ok(out.exact.size >= 90,
    `resolved only ${out.exact.size} keys — the walk stopped seeing call sites`);
  assert.ok(out.prefixes.size >= 2, 'a concatenated key family stopped being seen');
  assert.ok(out.spans.size >= 1, 'the prefix+suffix family (home:lead.*.head) stopped being seen');
});

test('the paywall feature family is fully authored, not partially', () => {
  // `tr('paywall.feat.' + k)` maps a literal array; a missing member renders the
  // raw key inside the members-wall list, mid-sentence.
  const src = fs.readFileSync(FILES[0], 'utf8');
  const m = src.match(/\[([^\]]*)\]\s*\.map\(\(k\)\s*=>\s*tr\('paywall\.feat\.'/);
  assert.ok(m, 'the paywall feature list stopped being a mapped literal array');
  const suffixes = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.ok(suffixes.length >= 6, `expected the full feature list, saw ${suffixes.length}`);
  const cat = catalog('onboarding');
  const absent = suffixes.filter((s) => !(`paywall.feat.${s}` in cat));
  assert.deepEqual(absent, [], `paywall.feat.* missing from en: ${absent.join(', ')}`);
});

// ── The same rule, one surface over: the live session player ─────────────────
//
// ⚠ WHY A SECOND WALK RATHER THAN ANOTHER ENTRY IN `FILES`. The launch shell
// binds `useTr('onboarding')`, so its bare keys carry an implicit namespace;
// `iosAppBroadsheetClient.jsx` binds `useShapeTr()` and every one of its ~1,380
// keys is fully qualified. Folding the two into one list would make DEFAULT_NS
// mean two different things and quietly mis-resolve whichever surface lost.
//
// ⚠ AND THE ASSERTION IS SCOPED TO THE FATAL CLASS, NOT TO EVERY CALL. A call
// that passes a `defaultValue` degrades to English on a miss — visible to nobody,
// recoverable, and 1,300 of this file's keys are that shape. A call with NO
// defaultValue renders the RAW KEY, mid-session, on a screen a member is holding
// while they lift. Measured at the time of writing, the no-defaultValue set is
// exactly the session player's 79 keys and it resolves completely; the
// defaultValue-bearing set carries six pre-existing `home:*` misses that fall
// back to their English argument. Those are registered, not gated here — pulling
// them into this assertion would make a guard about raw-key rendering fail for
// strings that render perfectly.
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

function bareKeys(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) bareKeys(n, out); return; }
  if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier'
      && node.callee.name === 'tr' && node.arguments.length) {
    const opts = node.arguments[1];
    const carriesDefault = opts && opts.type === 'ObjectExpression'
      && opts.properties.some((p) => p.key && (p.key.name === 'defaultValue' || p.key.value === 'defaultValue'));
    if (!carriesDefault) {
      // ternaries are the real shape here (`tr(running ? 'a' : 'b')`)
      const lits = (function ends(a) {
        if (!a) return [];
        if (a.type === 'StringLiteral') return [a.value];
        if (a.type === 'ConditionalExpression') return [...ends(a.consequent), ...ends(a.alternate)];
        return [];
      })(node.arguments[0]);
      for (const k of lits) out.add(k);
    }
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    bareKeys(node[k], out);
  }
}

test('every no-defaultValue key in the client module resolves in en', () => {
  const out = new Set();
  bareKeys(parse(CLIENT), out);

  const missing = [];
  for (const key of [...out].sort()) {
    const i = key.indexOf(':');
    if (i < 0) { missing.push(`${key}  (unqualified — useShapeTr needs ns:key)`); continue; }
    const cat = catalog(key.slice(0, i));
    if (!cat) { missing.push(`${key}  (no en/${key.slice(0, i)}.json)`); continue; }
    if (!(key.slice(i + 1) in cat)) missing.push(key);
  }
  assert.deepEqual(missing, [],
    `keys with no defaultValue absent from en — these render the RAW KEY: ${missing.join(', ')}`);

  // Guard the guard: a walk that stopped matching would report clean over nothing.
  assert.ok(out.size >= 70, `resolved only ${out.size} bare keys — the walk stopped seeing call sites`);
});

test('the session player authors no key it does not read', () => {
  // The other direction. A `player.*` key nothing asks for is thirteen strings of
  // translation work for a line no member can reach — exactly what cut 1 deleted
  // from BSSplash. Computed families are pinned by their literal prefix.
  const out = new Set();
  bareKeys(parse(CLIENT), out);
  const src = fs.readFileSync(CLIENT, 'utf8');
  const prefixes = [...src.matchAll(/tr\('session:(player\.[a-zA-Z.]*)' \+/g)].map((m) => m[1]);
  assert.ok(prefixes.length >= 1, 'the computed vibe family stopped being seen');

  const asked = new Set([...out].filter((k) => k.startsWith('session:player.')).map((k) => k.slice('session:'.length)));
  const cat = catalog('session');
  const orphans = Object.keys(cat)
    .filter((k) => k.startsWith('player.'))
    .filter((k) => !asked.has(k) && !prefixes.some((p) => k.startsWith(p)));
  assert.deepEqual(orphans, [], `authored but never read: ${orphans.join(', ')}`);
});

test('the session vibe family is fully authored, not partially', () => {
  // ⚠ THE ORPHAN TEST ABOVE CANNOT SEE THIS, AND MUTATION-TESTING IS WHAT SAID SO.
  // `tr('session:player.vibe.' + key)` maps a literal array, so the family is
  // pinned by its PREFIX in both directions — deleting `player.vibe.ok` leaves the
  // prefix satisfied by its two siblings and every assertion green, while the
  // middle button renders the raw key. Same shape, same fix, as the paywall
  // feature list one surface over: read the ids out of the array itself.
  const src = fs.readFileSync(CLIENT, 'utf8');
  const m = src.match(/\{\[(\[[^\]]*\](?:,\s*\[[^\]]*\])*)\]\.map\(\(\[key, c\]\) => \{\s*const label = tr\('session:player\.vibe\.' \+ key\)/);
  assert.ok(m, 'the vibe list stopped being a mapped literal array of ids');
  // every quoted member, then drop the colour literals — a `[^'#]` first-char
  // class does NOT work here: it rejects '#4fd18b' at its opening quote and the
  // engine then pairs that quote with the next one, capturing the `], [` between.
  const ids = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).filter((x) => !x.startsWith('#'));
  assert.ok(ids.length >= 3, `expected the full vibe list, saw ${ids.length}`);
  const cat = catalog('session');
  const absent = ids.filter((s) => !(`player.vibe.${s}` in cat));
  assert.deepEqual(absent, [], `player.vibe.* missing from en: ${absent.join(', ')}`);
});

// ── The keys must resolve at RUNTIME, not merely exist in a JSON file ─────────
//
// ⚠ THIS CUT NEWLY DEPENDS ON THE `ns:key` FORM. The launch shell reads three
// keys out of other namespaces rather than minting a seventh copy
// (`settings:action.signOut`, `coach:role.trainer|nutritionist`) and the wire
// prefixes all sixteen of its own. That form only works because `nsSeparator` is
// left at its i18next default of `':'` — set it to `false` and every one of those
// nineteen calls silently renders the RAW KEY on the cold open, with the catalogs
// still perfectly valid and every other gate in this repo still green.
//
// So this drives the real i18next + ICU runtime with the app's own options.
import i18next from 'i18next';
import ICU from 'i18next-icu';

const NAMESPACES = ['common', 'onboarding', 'settings', 'score', 'home', 'profile', 'session',
  'feed', 'marketplace', 'radio', 'calendar', 'habits', 'store', 'coach', 'cycle', 'cook'];

function buildI18n(lng) {
  const resources = {};
  for (const l of ['en', lng]) {
    resources[l] = {};
    for (const n of NAMESPACES) {
      const p = `mobile-app/src/i18n/catalogs/${l}/${n}.json`;
      if (fs.existsSync(p)) resources[l][n] = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  }
  const inst = i18next.createInstance();
  // KEEP IN SYNC with initI18n() in mobile-app/src/i18n/index.js — the source
  // assertion below fails if that block drifts from these values.
  inst.use(ICU).init({
    lng, fallbackLng: 'en', supportedLngs: ['en', lng], ns: NAMESPACES, defaultNS: 'common',
    resources, keySeparator: false, interpolation: { escapeValue: false },
    returnNull: false, returnEmptyString: false, initImmediate: false,
  });
  return inst;
}

test('the cross-namespace and ICU forms resolve through the real runtime', () => {
  const inst = buildI18n('es');
  const tr = inst.getFixedT(null, 'onboarding');   // what useTr('onboarding') returns
  const raw = (k, out) => out === k || out === k.split(':').pop();

  // Reused shipped keys — already translated in es today, so a raw result here
  // means the ns: form stopped resolving, not that a translation is pending.
  for (const k of ['dob.label', 'coach:role.trainer', 'coach:role.nutritionist', 'settings:action.signOut']) {
    const out = tr(k);
    assert.ok(!raw(k, out), `${k} rendered the raw key — the ns:key form stopped resolving`);
  }

  // This cut's own keys resolve (in en until the twelve locales land, in es after).
  const en = buildI18n('en').getFixedT(null, 'onboarding');
  for (const k of ['login.fieldName', 'paywall.feat.byo', 'onboarding:wire.closer', 'home:lead.energy.head']) {
    assert.ok(!raw(k, en(k)), `${k} rendered the raw key`);
  }

  // Interpolation + ICU plural actually run.
  assert.match(en('paywall.join', { price: '$5' }), /\$5/, 'the price stopped interpolating');
  assert.notEqual(en('onboarding:wire.streak', { n: 1 }), en('onboarding:wire.streak', { n: 4 }),
    'wire.streak stopped selecting a plural branch');

  // Guard the guard: an unknown key MUST come back raw, or "not raw" proves nothing.
  assert.ok(raw('no.such.key.anywhere', en('no.such.key.anywhere')),
    'an unknown key stopped rendering raw — the raw check is meaningless');
});

test('the app init still uses the option values this test mirrors', () => {
  const src = fs.readFileSync('mobile-app/src/i18n/index.js', 'utf8');
  assert.match(src, /keySeparator:\s*false/, 'keySeparator changed');
  assert.match(src, /defaultNS:\s*'common'/, 'defaultNS changed');
  assert.match(src, /returnEmptyString:\s*false/, 'returnEmptyString changed');
  // The load-bearing one: an explicit nsSeparator would break every `ns:key` call.
  assert.doesNotMatch(src, /nsSeparator/,
    'initI18n now sets nsSeparator — every cross-namespace key in the launch flow depends on the default ":"');
});

// ─────────────────────────────────────────────────────────────────────────────
// A PARAMETER NAMED `tr` THAT IS NOT THE TRANSLATOR.
//
// `getTracks().forEach(tr => tr.stop())` binds `tr` to a MediaStreamTrack, so
// every tr() inside that callback is a TypeError — and parse, tsc, the suite
// AND the mobile build all pass on it, because the shadow is only wrong once
// the enclosing component actually holds a translator. This repo has met the
// class twice: a playlist `list.map((tr, i) => …)` in 2026-07-16, and three
// MediaStreamTrack callbacks that had to be renamed before the meal logger
// could be localized at all.
//
// ⚠ THE RULE IS THE POSITION, NOT THE NAME. Injecting the translator as a
// parameter is the SANCTIONED pattern for module-scope non-hook helpers —
// `bsCyclePhaseLabel(tr, phase)`, `_bsLedgerLabel(tr, row)`, and the pros
// module's `coachTr` all do it, because a helper outside a component cannot
// hold a hook. Banning the name outright would forbid the good pattern.
//
// So the guard flags a `tr` parameter only on a function passed AS AN ARGUMENT
// to a call — `.forEach(tr => …)`, `.map((tr, i) => …)` — which is the trap and
// nothing else: there `tr` is whatever the caller iterates, never the
// translator. A helper the file DEFINES keeps its injected `tr` whether it is
// written as a declaration or an arrow, so the honest pattern cannot be
// mis-flagged into someone weakening this test.
test('no callback parameter shadows the translator', () => {
  const files = [
    'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx',
    'mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx',
    'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx',
    'mobile-app/src/broadsheet/iosAppBroadsheetHabits.jsx',
    'mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx',
    'mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx',
    'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx',
  ];
  const shadows = [];
  let callbacks = 0;   // guard-the-guard: this walk must actually visit some

  const hasTrParam = (node) =>
    (node.params || []).some((p) => p.type === 'Identifier' && p.name === 'tr');

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const ast = babelParser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const seen = new Set();
    (function walk(n) {
      if (!n || typeof n !== 'object' || seen.has(n)) return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (!n.type) return;
      seen.add(n);
      // A function sitting in a call's ARGUMENT list is a callback.
      if (n.type === 'CallExpression' || n.type === 'OptionalCallExpression') {
        for (const a of n.arguments || []) {
          if (a && (a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression')) {
            callbacks += 1;
            if (hasTrParam(a)) shadows.push(`${file}:${a.loc && a.loc.start.line}`);
          }
        }
      }
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
        walk(n[k]);
      }
    })(ast.program);
  }

  assert.ok(callbacks > 1500,
    `the walk visited only ${callbacks} callbacks — it is not reaching the tree it claims to audit`);
  assert.deepEqual(shadows, [],
    `a callback parameter named "tr" shadows the translator at:\n  ${shadows.join('\n  ')}\n` +
    'Rename the parameter to what it actually is (track, rung, row). Every tr() inside ' +
    'such a callback is a TypeError that parse, tsc, the suite and the build all pass on.');
});
