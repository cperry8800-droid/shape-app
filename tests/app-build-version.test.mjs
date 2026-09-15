// Which build am I running? Settings answered that TWICE and rendered NEITHER.
//
//   <BSFooter left="Shape v2.4.0" right="Build 2026.04" />   — BSFooter is
//       `function BSFooter() { return null; }`, so every prop it is handed reaches
//       no screen at all.
//   { title: 'About', meta: 'v6.38.2', rows: [...] }         — the sections array is
//       consumed as `findSec(title).rows`; `.meta` is read by nothing.
//
// Two typed-in numbers, disagreeing with each other and with package.json's 0.1.0,
// neither of them visible. A member contacting support had nothing to quote. This
// pins the replacement: ONE number, measured from the build, rendered once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as babelParser from '@babel/parser';
import { loadBroadsheet, ROOT, SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const { bsBuildLabel } = await loadBroadsheet(['bsBuildLabel']);

// The define and the env var are what a bundler inlines; the harness compiles the
// module with `import.meta` rewritten to __VITE_IMPORTMETA__, so both are reachable
// here exactly as a build would supply them.
function withBuild({ version, sha }, fn) {
  const hadV = '__SHAPE_VERSION__' in globalThis, prevV = globalThis.__SHAPE_VERSION__;
  const prevEnv = globalThis.__VITE_IMPORTMETA__.env;
  if (version === undefined) delete globalThis.__SHAPE_VERSION__; else globalThis.__SHAPE_VERSION__ = version;
  globalThis.__VITE_IMPORTMETA__.env = { ...prevEnv, VITE_SHAPE_RELEASE: sha };
  try { return fn(); } finally {
    globalThis.__VITE_IMPORTMETA__.env = prevEnv;
    if (hadV) globalThis.__SHAPE_VERSION__ = prevV; else delete globalThis.__SHAPE_VERSION__;
  }
}

test('the version comes from the build, and the commit rides along only when there is one', () => {
  // A Vercel build: scripts/build-m.sh exports VITE_SHAPE_RELEASE from the commit.
  assert.equal(withBuild({ version: '1.4.2', sha: 'abcdef1234567890' }, bsBuildLabel), '1.4.2 · abcdef1');
  // Android CI, Codemagic and a local build have no commit to state, so none is stated.
  assert.equal(withBuild({ version: '1.4.2', sha: '' }, bsBuildLabel), '1.4.2');
  assert.equal(withBuild({ version: '1.4.2', sha: undefined }, bsBuildLabel), '1.4.2');
});

test('outside a bundler it claims nothing rather than inventing a build', () => {
  assert.equal(withBuild({ version: undefined, sha: 'abcdef1' }, bsBuildLabel), '',
    'with no define there is no version to state — and a commit alone is not a version');
  assert.equal(withBuild({ version: '', sha: 'abcdef1' }, bsBuildLabel), '');
});

test('the define is real, and it is read from package.json rather than typed', () => {
  // ⚠ STRUCTURAL, because the obvious text assertions cannot tell the two apart:
  // a config that reads package.json into a variable and then inlines the LITERAL
  // '2.4.0' still contains both `readFileSync(...package.json)` and
  // `__SHAPE_VERSION__: JSON.stringify(`. Mutation-proven — that exact swap survived
  // the first round. What has to hold is that the value handed to the define is the
  // IDENTIFIER the package.json read produced.
  const cfgSrc = readFileSync(join(ROOT, 'mobile-app', 'vite.config.ts'), 'utf8');
  const cfg = babelParser.parse(cfgSrc, { sourceType: 'module', plugins: ['typescript'] });
  let defineArg = null, readVars = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'ObjectProperty' && n.key && n.key.name === '__SHAPE_VERSION__') defineArg = n.value;
    if (n.type === 'VariableDeclarator' && n.id && n.id.name && n.init
        && /readFileSync[\s\S]*package\.json/.test(cfgSrc.slice(n.init.start, n.init.end))) readVars.add(n.id.name);
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(cfg.program);
  assert.ok(defineArg, 'vite.config.ts must define __SHAPE_VERSION__ — nothing else inlines the version');
  assert.equal(defineArg.type, 'CallExpression');
  assert.equal(cfgSrc.slice(defineArg.callee.start, defineArg.callee.end), 'JSON.stringify',
    'the define must be a JSON-encoded value, or Vite inlines a bare identifier');
  const [arg] = defineArg.arguments;
  assert.equal(arg && arg.type, 'Identifier', 'the version must be a READ value, never a literal typed here');
  assert.ok(readVars.has(arg.name), `__SHAPE_VERSION__ is fed by ${arg.name}, which is not read from package.json`);
  // And the value it inlines today is a real version, so the row cannot render
  // something a member would read as a placeholder.
  const pkg = JSON.parse(readFileSync(join(ROOT, 'mobile-app', 'package.json'), 'utf8'));
  assert.match(String(pkg.version || ''), /^\d+\.\d+/, 'package.json must carry the version the app will show');
});

test('the About section renders the build, and it is the only version claim left', () => {
  const src = readFileSync(SRC, 'utf8');
  const ast = babelParser.parse(src, { sourceType: 'module', plugins: ['jsx'] });

  // Structural, not spelled: the About section's rows must contain a row whose value
  // is a CALL to bsBuildLabel. A string there — of any wording — is the defect.
  let about = null;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'ObjectExpression') {
      const title = n.properties.find((p) => p.key && p.key.name === 'title' && p.value && p.value.value === 'About');
      if (title) about = n;
    }
    for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'start' && k !== 'end') walk(n[k]);
  })(ast.program.body);
  assert.ok(about, 'the About section must still exist — this guard cannot pass vacuously');
  assert.ok(!about.properties.some((p) => p.key && p.key.name === 'meta'),
    'a section `meta` is read by nothing; a version there renders nowhere');
  const aboutSrc = src.slice(about.start, about.end);
  assert.match(aboutSrc, /bsBuildLabel\(\)/, 'the About rows must carry the measured build');

  // And nothing anywhere in the module may type a version out by hand again.
  //
  // ⚠ SCOPED BY THE AST, NOT BY A PATTERN, because a version literal and SVG path
  // data are the same characters: `v6.38.2` — the exact string this replaces — IS
  // valid path grammar (vertical-lineto 6.38, then .2), so a text scan that excludes
  // "things that look like paths" excludes the defect it exists to catch, and one
  // that does not excludes nothing and drowns in the module's 88 icon paths. The
  // only honest discriminator is POSITION: path data is the value of a `d` attribute.
  const VERSION = /\bv?\d+\.\d+\.\d+\b/;
  const BUILD_STAMP = /\bbuild\s+\d{4}/i;
  const claims = [];
  let scanned = 0;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'JSXAttribute' && n.name && n.name.name === 'd') return;
    if (n.type === 'StringLiteral' || n.type === 'TemplateElement') {
      const v = n.type === 'StringLiteral' ? n.value : n.value.cooked;
      if (typeof v === 'string') { scanned += 1; if (VERSION.test(v) || BUILD_STAMP.test(v)) claims.push(v.slice(0, 60)); }
    }
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(ast.program);
  assert.ok(scanned > 10000, `the literal walk found only ${scanned} strings — it stopped matching, so it proves nothing`);
  assert.deepEqual(claims, [], 'a hand-typed version or build stamp is back in the module');
  // The rule is proven able to fire, on the three literals this PR retired.
  for (const retired of ['Shape v2.4.0', 'Build 2026.04', 'v6.38.2']) {
    assert.ok(VERSION.test(retired) || BUILD_STAMP.test(retired), `the ban would not catch ${retired}`);
  }
  assert.ok(!stripComments(src).includes('left="Shape v'), 'the footer claim is gone, props and all');
});

test('every shipping pipeline stamps the commit this label promises', () => {
  // ⚠ CODEX, P3, AND THE COMMENT WAS THE DEFECT. `bsBuildLabel`'s header first said
  // an Android, Codemagic or local build carried no commit — reasoned from
  // build-m.sh alone, without opening the native workflows. All three shipping
  // pipelines set VITE_SHAPE_RELEASE themselves, so a member on ANY real build can
  // quote the commit, and only a plain local build shows the version alone.
  //
  // Derived from the workflows rather than restated, so the claim is CHECKED: drop
  // the stamp from a pipeline and this fails, instead of the comment quietly
  // becoming false again.
  const sets = (file, pattern) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    assert.match(src, pattern, `${file} no longer stamps VITE_SHAPE_RELEASE — the version label's claim is now false`);
  };
  // Vercel, the hosted /m/ bundle.
  sets('scripts/build-m.sh', /export VITE_SHAPE_RELEASE=.*VERCEL_GIT_COMMIT_SHA/);
  // Android: BOTH jobs — the debug APK and the signed one that actually ships.
  const android = readFileSync(join(ROOT, '.github/workflows/android-build.yml'), 'utf8');
  const stamps = android.split(/VITE_SHAPE_RELEASE:\s*\$\{\{\s*github\.sha\s*\}\}/).length - 1;
  assert.equal(stamps, 2, `android-build.yml stamps ${stamps} of its 2 build jobs`);
  // Codemagic, the iOS TestFlight build.
  sets('codemagic.yaml', /export VITE_SHAPE_RELEASE=/);
});

test('the row is omitted rather than shown empty when there is no build to name', () => {
  // A "Version" label over a blank value reads as a build that could not be
  // identified. Outside a bundler there is no version, so there is no row.
  const src = stripComments(readFileSync(SRC, 'utf8'));
  assert.match(src, /\.\.\.\(bsBuildLabel\(\)\s*\?\s*\[\{[^]*?\}\]\s*:\s*\[\]\)/,
    'the version row must be gated on there being a version at all');
});
