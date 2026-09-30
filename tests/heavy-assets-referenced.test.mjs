// Every heavy binary the repo tracks must be named by something — a page, a module, a
// stylesheet, a doc — or it is weight every checkout and every deploy upload pays for
// while nothing serves it. (History keeps them: a full clone still carries the removed
// files in its pack, and only checkouts, shallow clones and deploy uploads got lighter.) Measured 2026-09-30, before the trim: 160 tracked binaries over
// 200 KB, and 324 tracked files (485,300,667 bytes, 71% of the tracked tree) that
// nothing served or read — two whole directories of design mockups and their runtime
// copies (`mobile-app/public-runtime/`, `mobile-app/design-mockups/`: 271 files, 252 MB),
// eleven PNGs at the repository root (63 MB; Next serves `public/`, not the root), and
// 42 files under `public/` and `output/` (170 MB) — 38 that no page names and 4 that a page
// names only by pointing at another copy. A session's `git add -A` swept them in; this
// keeps them from coming back one upload at a time.
//
// The rule is in tests/helpers/heavy-assets.mjs and is deliberately loose (see its
// header). Two things follow from that, and both are pinned here rather than assumed:
//  - what it cannot see is a name that matches a DIFFERENT copy (55 of the 324 files were
//    like that), so the directories, the four stray copies and the repository root are
//    pinned by path (last test), not by name;
//  - a loose rule is only worth having if it can still say "no", so the first half of
//    this file drives it on fixtures — a name a build composes still counts, prose and a
//    look-alike do not, a binary is never evidence — and the second half runs it on the
//    tree.
//
// ⚠ THE RULE IS ABOUT BYTES, NOT AESTHETICS. A referenced 12 MB PNG is a performance
// question for the page that references it, not this test's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MIN_BYTES, FLOOR, GUARD_FILES, CHANGELOG,
  isHeavy, looksBinary, inCorpus, decodeEscapes, referencesOf, findOrphans, staleKeeps, assertScanSane, scanTree, strays,
  duplicateGroups, groupKey, unallowedDuplicates, staleDuplicates,
} from './helpers/heavy-assets.mjs';

const ROOT = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '..');

// A heavy binary nothing names but which stays on purpose, with the reason. An entry is a
// decision somebody has to write down; the test below fails on one that has gone stale.
// ⚠ THESE THREE WERE LISTED AS "WANTED" AT THE TRIM AND NOTHING NAMES ANY OF THEM: the
// loose rule this replaced kept them alive on a stem that was prose (`login page`,
// `Trainer dash` inside "Trainer dashboard") or a sibling (`directionB.jsx` names the
// `(1)` copy, which IS referenced and stays). They are here so the doubt is on the record
// instead of hidden inside the rule; the owner decides whether they go.
const KEEP_UNREFERENCED = new Map([
  ['public/login page.png', 'kept at the 2026-09-30 trim as wanted, but nothing names it — "login page" occurs only as prose; the live login background is `public/login page 1.png`'],
  ['public/Trainer dash.png', 'kept at the 2026-09-30 trim as wanted, but nothing names it — the pages say "Trainer dashboard", and the live dashboard background is `public/trainer dash 1.png`'],
  ['public/Make_the_lines_202604170430.png', 'kept at the 2026-09-30 trim as wanted, but nothing names it — `public/newdesign/directionB.jsx` names the `(1)` sibling, a different file that stays because it is referenced'],
]);

// Directories that must not come back: design mockups and the runtime copies of them,
// 252 MB across 271 files, referenced by nothing (no page, script, workflow or config
// names either directory) and not part of any build — Vite's publicDir is
// `mobile-app/public`, and the mobile bundle came out byte-identical without them.
const GONE_DIRS = ['mobile-app/public-runtime/', 'mobile-app/design-mockups/'];

// Four copies under `public/` that were removed for the same reason and that the name rule
// also could not see: each shares its basename with a page's reference to a DIFFERENT
// file — `/Pricing.png` is `public/Pricing.png`, not the 8 MB copies in `intro/` and
// `newdesign/`; the legacy /mobile pages ask for `assets/store-bg.png` and
// `assets/radio-bg.png`, and neither `public/mobile/store-bg.png` nor `public/radio-bg.png`
// is in the `assets/` directory those pages resolve to (`public/mobile/assets/` does not
// exist).
const GONE_FILES = ['public/intro/Pricing.png', 'public/newdesign/Pricing.png', 'public/mobile/store-bg.png', 'public/radio-bg.png'];

// Byte-identical heavy binaries that stay on purpose, keyed by the group (its sorted paths joined
// with ' = '), with the reason. ⚠ THE NAME RULE CANNOT SEE A COPY: seventy of the files removed at
// the trim were byte-identical to a file a page does request. Each group here is a decision.
const MIRROR = 'the mobile app serves its own publicDir (mobile-app/public, copied whole into public/m/) and the website serves public/, so each root needs the file at its own path';
const ALLOWED_DUPLICATES = new Map([
  ['mobile-app/public/demo-avatar.png = public/demo-avatar.png', MIRROR],
  ['mobile-app/public/nora-avatar.png = public/nora-avatar.png', MIRROR],
  ['mobile-app/public/nora/placeholder.vrm = public/nora/placeholder.vrm', MIRROR],
  ['mobile-app/public/shape-logo.png = public/SHAPE-logo-teal-white.png = public/logo.png = public/shape-logo-new-teal-white.png',
    'one logo requested under four names (the mobile app asks for shape-logo.png, the site for the other three); folding them is a rename job for the pages that ask, not a delete'],
]);

// The rule, on fixtures. Corpus entries are decoded the way `scanTree` decodes them.
const corp = (files) => Object.entries(files).map(([file, text]) => [file, decodeEscapes(text)]);

test('a basename is named only where it stands alone', () => {
  const at = (asset, text) => referencesOf(asset, corp({ 'p.html': text }));
  assert.deepEqual(at('public/a/image.png', '<img src="/a/image.png">'), ['p.html']);
  assert.deepEqual(at('public/a/image.png', "url('image.png?v=2')"), ['p.html'], 'a query string after the name is still the name');
  assert.deepEqual(at('public/a/image.png', '<img src="/a/bg-image.png">'), [], 'bg-image.png is another file');
  assert.deepEqual(at('public/a/logo.png', '<img src="shape-logo.png">'), [], 'shape-logo.png is another file');
  assert.deepEqual(at('public/a/logo.png', 'logo.pngx'), [], 'a longer extension is another file');
  assert.deepEqual(at('public/a/Logo.png', '<img src="/a/logo.png">'), [], 'the host is case-sensitive, so a mention in the wrong case serves nothing');
  assert.deepEqual(referencesOf('public/a/one.svg', [['public/a/one.svg', 'one.svg']]), [], 'a file does not vouch for itself');
});

test('an escaped mention counts — spaces and parentheses alike', () => {
  assert.deepEqual(referencesOf('public/Home page 2.png', corp({ 'a.html': "url('/Home%20page%202.png')" })), ['a.html']);
  // The trap the first census fell into: encodeURIComponent leaves parentheses alone, the
  // pages write %28 and %29, and the file was called unreferenced.
  assert.deepEqual(
    referencesOf('public/Make_the_lines_202604170430 (1).png', corp({ 'a.jsx': "url('/Make_the_lines_202604170430%20%281%29.png')" })),
    ['a.jsx'],
  );
  assert.equal(decodeEscapes('100%'), '100%', 'a lone percent sign is left alone');
  assert.equal(decodeEscapes('a%zzb'), 'a%zzb', 'a malformed escape is left alone');
  assert.equal(decodeEscapes('%C3'), '%C3', 'an escape that is not valid UTF-8 is left alone, not thrown on');
});

test('a stem counts as a quoted literal — never as prose, a sibling, or a plain word', () => {
  const at = (asset, text) => referencesOf(asset, corp({ 'a.js': text }));
  // A name a build composes: the stem is a literal, the extension is added at run time.
  assert.deepEqual(at('public/radio-bg.png', "const n = 'radio-bg'; load(n + '.png')"), ['a.js']);
  assert.deepEqual(at('public/radio-bg.png', 'load(`/img/radio-bg`)'), ['a.js'], 'a path-delimited literal counts');
  assert.deepEqual(at('public/radio-bg.png', "url('/radio-bg.jpg')"), [], 'another extension is another file');
  assert.deepEqual(at('public/radio-bg.png', 'the radio-bg photo'), [], 'prose is not a literal');
  assert.deepEqual(at('public/login page.png', 'Click "Forgot password?" on the login page. Enter'), [], 'the phrase "login page" is prose');
  assert.deepEqual(at('public/Trainer dash.png', '<Eyebrow>Trainer dashboard</Eyebrow>'), [], 'a stem inside a longer word is not a literal');
  assert.deepEqual(
    at('public/Make_the_lines_202604170430.png', "url('/Make_the_lines_202604170430%20%281%29.png')"),
    [],
    'the (1) copy is a different file',
  );
  assert.deepEqual(at('public/Pricing.png', "title: 'Pricing'"), [], 'a quoted plain word is a label, not a file stem');
  assert.deepEqual(at('public/beat-6.mp4', "const n = 'beat-6'"), [], 'a stem of six characters or fewer is a number or a word');
  assert.deepEqual(at('public/image.png', "const n = 'image'"), [], 'a stem of six characters or fewer is a number or a word');
});

test('the changelog and the guard itself are not evidence', () => {
  // Spelled out, not read from GUARD_FILES: a list that shrinks must not shrink its own test.
  for (const f of [
    'docs/WORKLOG.md', 'docs/WORKLOG-ARCHIVE-2026-09.md', 'docs/WORKLOG-ARCHIVE-2026-06-cycles-2-5.md',
    'tests/heavy-assets-referenced.test.mjs', 'tests/helpers/heavy-assets.mjs', 'tests/mutations/heavy-assets.mutations.mjs',
  ]) {
    assert.equal(inCorpus(f), false, `${f} names assets to record or test them, so it must not keep one alive`);
  }
  for (const f of ['docs/HANDOFF-2026-09-01.md', 'docs/REVIEW-2026-09-15-login-box.md', 'marketing/shape-radio-launch-cut.md', 'tests/other.test.mjs', 'WORKLOG.md']) {
    assert.equal(inCorpus(f), true, `${f} is a real pointer and stays in the corpus`);
  }
});

test('a binary is never evidence, a heavy one is found, and a missing file is skipped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-assets-'));
  try {
    const put = (rel, data) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), data); };
    put('page.html', '<img src="a/big.png">');
    put('docs/WORKLOG.md', 'deleted ghost.png today');
    // A binary that happens to contain a file name: a NUL byte makes it binary.
    put('blob.bin', Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from('ghost.png')]));
    put('a/big.png', Buffer.concat([Buffer.from([0]), Buffer.alloc(MIN_BYTES - 1)]));
    put('a/almost.png', Buffer.concat([Buffer.from([0]), Buffer.alloc(MIN_BYTES - 2)]));
    const { texts, heavy, binaries } = scanTree(dir, ['page.html', 'docs/WORKLOG.md', 'blob.bin', 'a/big.png', 'a/almost.png', 'never-existed.png']);
    assert.deepEqual(texts.map(([f]) => f), ['page.html'], 'only a text file that counts is in the corpus');
    assert.deepEqual(heavy, ['a/big.png'], 'a binary of exactly MIN_BYTES is heavy; one byte less is not');
    assert.equal(binaries, 3, 'every binary is counted, heavy or not, and a missing file is not');
    assert.deepEqual(referencesOf('a/big.png', texts), ['page.html']);
    assert.deepEqual(referencesOf('ghost.png', texts), [], 'neither the binary nor the changelog names it as far as the guard is concerned');
    assert.equal(looksBinary(Buffer.from('plain text')), false);
    assert.equal(looksBinary(Buffer.from([65, 0, 66])), true);
    // The sniff reads only the head, as git does: a NUL after it does not make a file binary.
    assert.equal(looksBinary(Buffer.concat([Buffer.alloc(8000, 65), Buffer.from([0])])), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the size threshold is inclusive and 200 KB', () => {
  assert.equal(MIN_BYTES, 200 * 1024);
  assert.equal(isHeavy(MIN_BYTES), true);
  assert.equal(isHeavy(MIN_BYTES - 1), false);
});

test('an orphan is found, a vouched-for file is not, and a stale vouch is reported', () => {
  const heavy = ['public/a.png', 'public/b.png', 'public/c.png'];
  const corpus = corp({ 'p.html': '<img src="a.png">', 'q.html': 'nothing here' });
  assert.deepEqual(findOrphans(heavy, corpus), ['public/b.png', 'public/c.png']);
  assert.deepEqual(findOrphans(heavy, corpus, new Map([['public/b.png', 'why']])), ['public/c.png']);
  const stale = staleKeeps(
    new Map([['public/gone.png', 'x'], ['public/a.png', 'y'], ['public/b.png', 'z']]),
    ['public/a.png', 'public/b.png'],
    corpus,
  );
  assert.equal(stale.length, 2, `expected the untracked entry and the referenced entry, got ${JSON.stringify(stale)}`);
  assert.ok(stale.some((s) => s.startsWith('public/gone.png is not tracked')));
  assert.ok(stale.some((s) => s.startsWith('public/a.png is referenced now')));
});

test('a file back in a removed directory, a removed file, or a heavy binary at the root is found by path', () => {
  const dirs = ['mobile-app/public-runtime/', 'mobile-app/design-mockups/'];
  const paths = ['public/intro/Pricing.png', 'public/radio-bg.png'];
  const files = ['mobile-app/public-runtime/a.png', 'mobile-app/design-mockups/b.png', 'mobile-app/public/c.png', 'login-bg.png', 'public/radio-bg.png', 'public/Pricing.png', 'README.md'];
  assert.deepEqual(strays(files, ['login-bg.png', 'public/x.png'], { dirs, paths }), {
    back: ['mobile-app/public-runtime/a.png', 'mobile-app/design-mockups/b.png', 'public/radio-bg.png'],
    rootHeavy: ['login-bg.png'],
  });
  assert.deepEqual(strays(['mobile-app/public/c.png', 'public/Pricing.png'], ['public/x.png'], { dirs, paths }), { back: [], rootHeavy: [] });
  assert.deepEqual(strays(files, [], {}), { back: [], rootHeavy: [] }, 'with nothing pinned nothing is reported');
});

test('two heavy binaries with the same bytes are found, and a lone one is not', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-dups-'));
  try {
    const put = (rel, fill) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), Buffer.concat([Buffer.from([0]), Buffer.alloc(MIN_BYTES, fill)])); };
    put('a/one.png', 1);
    put('b/two.png', 1);
    put('c/three.png', 2);
    const heavy = ['a/one.png', 'b/two.png', 'c/three.png'];
    const groups = duplicateGroups(dir, heavy);
    assert.deepEqual(groups, [['a/one.png', 'b/two.png']], 'same bytes under two names is one group; a different file is not in it');
    assert.deepEqual(duplicateGroups(dir, ['a/one.png', 'c/three.png']), [], 'two different files are not duplicates');
    assert.deepEqual(unallowedDuplicates(groups, new Map()), groups);
    assert.deepEqual(unallowedDuplicates(groups, new Map([[groupKey(groups[0]), 'why']])), [], 'a listed group is excused');
    assert.deepEqual(staleDuplicates(new Map([[groupKey(groups[0]), 'why']]), groups), []);
    assert.equal(staleDuplicates(new Map([['x.png = y.png', 'why']]), groups).length, 1, 'an entry for a group that is gone is stale');
    // The key is order-independent, so the allow-list reads the way the failure does.
    assert.equal(groupKey(['b/two.png', 'a/one.png']), 'a/one.png = b/two.png');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable index refuses rather than reporting the tree clean', () => {
  assert.throws(() => tracked(() => []), /returned nothing/);
});

test('a scan that reads too little is refused rather than reported clean', () => {
  const some = (texts, binaries) => ({ texts: new Array(texts).fill(0), binaries });
  assert.throws(() => assertScanSane(some(0, 0)), /tracked text files/);
  assert.throws(() => assertScanSane(some(FLOOR.texts, 0)), /binary files/);
  assert.throws(() => assertScanSane(some(FLOOR.texts - 1, FLOOR.binaries)), /tracked text files/);
  assert.throws(() => assertScanSane(some(FLOOR.texts, FLOOR.binaries - 1)), /binary files/);
  assert.doesNotThrow(() => assertScanSane(some(FLOOR.texts, FLOOR.binaries)));
});

// The tree. The listing comes from git, like the repo's other sweeps, so build output and
// untracked scratch files cannot appear; an empty listing REFUSES rather than reporting
// clean, because a scan of nothing finds no orphans.
const gitTracked = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
// `list` is a parameter ONLY so the refusal is reachable from a test: a live repo never
// returns an empty index, and a branch nothing can reach is one a later reader deletes.
function tracked(list = gitTracked) {
  const files = list();
  assert.ok(files.length > 0, 'git ls-files returned nothing — the guard cannot scan, so it refuses rather than report the tree clean');
  return files;
}
const FILES = tracked();
const SCAN = scanTree(ROOT, FILES);

test('the scan sees the tree — it cannot pass by reading nothing or by matching everything', () => {
  assertScanSane(SCAN);
  // Too permissive: a name nothing mentions must still read as unreferenced on the real corpus.
  assert.deepEqual(referencesOf('public/zz-not-a-real-asset-7f3a91c2.png', SCAN.texts), []);
  const corpusFiles = SCAN.texts.map(([f]) => f);
  assert.ok(!corpusFiles.some((f) => GUARD_FILES.includes(f) || CHANGELOG.test(f)), 'the changelog or the guard leaked into the corpus');
});

test('every tracked binary over 200 KB is named by a tracked text file, or listed with a reason', () => {
  const orphans = findOrphans(SCAN.heavy, SCAN.texts, KEEP_UNREFERENCED);
  const bytes = orphans.reduce((sum, f) => sum + fs.statSync(path.join(ROOT, f)).size, 0);
  assert.deepEqual(
    orphans,
    [],
    `${orphans.length} heavy files (${(bytes / 1024 / 1024).toFixed(1)} MB) are named by nothing:\n  ${orphans.join('\n  ')}\n\n` +
      'Delete them, reference them from the page that shows them, or add them to KEEP_UNREFERENCED with the reason. ' +
      'If a page composes the name at run time (a template literal such as `/dir/${role}-${tab}.jpg`), no literal names the file: ' +
      'list it in KEEP_UNREFERENCED and name the composing file in the reason.',
  );
});

test('no heavy binary is a byte-for-byte copy of another, unless the copy is listed with a reason', () => {
  const groups = duplicateGroups(ROOT, SCAN.heavy);
  const loose = unallowedDuplicates(groups, ALLOWED_DUPLICATES);
  assert.deepEqual(
    loose,
    [],
    `${loose.length} groups of heavy binaries are byte-identical:\n  ${loose.map(groupKey).join('\n  ')}\n\n` +
      'Delete the copy nothing requests at its own path, or add the group to ALLOWED_DUPLICATES with the reason it stays.',
  );
  assert.deepEqual(staleDuplicates(ALLOWED_DUPLICATES, groups), []);
});

test('the keep list holds no stale entry', () => {
  assert.deepEqual(staleKeeps(KEEP_UNREFERENCED, FILES, SCAN.texts), []);
});

test('the mockup directories, the four stray copies and the repository root stay free of them', () => {
  // ⚠ NOT COVERED BY THE NAME RULE, and that is why this test exists: 55 of the files
  // removed from these places had a basename another page mentioned. The legacy /mobile
  // pages ask for `assets/login-bg.png` and the like — a directory that has never existed —
  // so each root copy read as referenced while nothing could serve it.
  assert.deepEqual(GONE_DIRS, ['mobile-app/public-runtime/', 'mobile-app/design-mockups/'], 'the pinned directories changed');
  assert.equal(GONE_FILES.length, 4, 'the pinned files changed');
  const { back, rootHeavy } = strays(FILES, SCAN.heavy, { dirs: GONE_DIRS, paths: GONE_FILES });
  assert.deepEqual(back, [], `${back.length} files are tracked again — removed on 2026-09-30 as unreferenced; if a build needs one, reference it from that build:\n  ${back.slice(0, 10).join('\n  ')}`);
  assert.deepEqual(rootHeavy, [], `heavy binaries at the repository root are served by nothing (Next serves public/): ${rootHeavy.join(', ')}`);
});
