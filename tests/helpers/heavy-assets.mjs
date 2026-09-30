// The rule behind tests/heavy-assets-referenced.test.mjs, kept apart so the guard can be
// driven on fixtures: a guard that has never been shown to fail is a claim, not a check.
// Everything here is pure except `scanTree`, which reads the files it is handed.
//
// WHAT "REFERENCED" MEANS. A heavy binary is referenced when a tracked TEXT file names
// it — by basename, or by a stem a build could compose the name from. The rule is
// deliberately loose (it cannot resolve a path, and a path-exact resolver false-alarms on
// dynamic names), so what it catches is "nobody even names this file": 73 heavy files,
// 201 MiB, on the tree it was written for. What it cannot catch is a name that matches a
// DIFFERENT copy, and the rest of that trim was exactly that: `login-bg.png` at the
// repository root was "referenced" by `url('assets/login-bg.png')` in a page whose
// `assets/` directory does not exist. That class is pinned by directory instead
// (GONE_DIRS in the test), not by this rule.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Tracked binaries at or above this size are checked. Below it a stray image is a
// nuisance, not a tax.
export const MIN_BYTES = 200 * 1024;
export const isHeavy = (bytes) => bytes >= MIN_BYTES;

// Text vs binary is decided by CONTENT, the way git decides it (`git grep -I`): a NUL
// byte in the first 8000 bytes. A file-extension list goes stale the day a new type
// lands, and every type it omits reads as "nothing references this".
export const SNIFF_BYTES = 8000;
export const looksBinary = (head) => head.subarray(0, SNIFF_BYTES).includes(0);

// ⚠ THE CORPUS LEAVES OUT WHAT ONLY TALKS ABOUT THE ASSETS, and each exclusion is here
// because counting it defeats the guard:
//  - the changelog and its archives record what shipped and what was deleted, BY NAME,
//    so the entry announcing a removal would keep the file alive the day a session's
//    `git add -A` brings it back — the exact case this guard exists for;
//  - the guard's own files name assets in comments and fixtures for the same reason.
// Everything else counts, docs included: a recipe or a handoff that points at a file is
// a real pointer, and dropping docs would flag generated media the marketing log lists.
export const CHANGELOG = /^docs\/WORKLOG(?:-ARCHIVE-[^/]+)?\.md$/;
export const GUARD_FILES = [
  'tests/heavy-assets-referenced.test.mjs',
  'tests/helpers/heavy-assets.mjs',
  'tests/mutations/heavy-assets.mutations.mjs',
];
export const inCorpus = (file) => !CHANGELOG.test(file) && !GUARD_FILES.includes(file);

// Read every escape as the character it stands for, so `%20`, `%28` and `%29` all match
// the file they name. ⚠ `encodeURIComponent` leaves parentheses alone, and the pages that
// name `Make_the_lines_202604170430 (1).png` write `%281%29`: the escape rule this
// replaced (space only) called that file unreferenced, and it was the one deletion the
// first census got wrong. Invalid sequences are left as written.
export const decodeEscapes = (text) =>
  text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try { return decodeURIComponent(run); } catch { return run; }
  });

const WORD = /[A-Za-z0-9_-]/;
const indicesOf = (text, needle) => {
  const at = [];
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) at.push(i);
  return at;
};

// A basename is named only where it stands alone: `image.png` is not named by
// `bg-image.png`, and `logo.png` is not named by `shape-logo.png`.
export const namesBasename = (text, base) =>
  indicesOf(text, base).some((i) => {
    const before = text[i - 1], after = text[i + base.length];
    return (before === undefined || !WORD.test(before)) && (after === undefined || !WORD.test(after));
  });

// A stem stands in for a name composed at run time (`'radio-bg' + '.png'`), so it counts
// only as a quoted or path-delimited literal. ⚠ Three things it must NOT count, all
// measured on the tree it was written for: prose (`the login page` kept
// `login page.png`; `Trainer dashboard` kept `Trainer dash.png`), a sibling written with
// another extension or suffix (`Make_the_lines_… (1).png` kept the file without the
// `(1)`), and a quoted plain word (`'Pricing'` is a label, not a file). So a stem must be
// long enough (6 characters or fewer are numbers and ordinary words: `image`, `beat-6`)
// and must LOOK like a file stem — a separator or a digit in it.
export const STEM_MIN = 7;
export const STEM_SHAPE = /[-_0-9 ]/;
const STEM_OPEN = new Set(["'", '"', '`', '/', '(']);
const STEM_CLOSE = new Set(["'", '"', '`', '/', ')', '?', '#', ',']);
export const namesStem = (text, stem) =>
  stem.length >= STEM_MIN &&
  STEM_SHAPE.test(stem) &&
  indicesOf(text, stem).some((i) => STEM_OPEN.has(text[i - 1]) && STEM_CLOSE.has(text[i + stem.length]));

// Which corpus files name `asset`. Case-sensitive on purpose: the host's filesystem is, so
// a reference in the wrong case serves nothing there.
const stemOf = (base) => base.replace(/\.[A-Za-z0-9]+$/, '');
const names = (asset, base, stem) => ([file, text]) =>
  file !== asset && (namesBasename(text, base) || namesStem(text, stem));
export function referencesOf(asset, corpus) {
  const base = asset.split('/').pop();
  return corpus.filter(names(asset, base, stemOf(base))).map(([file]) => file);
}
// The same question with an early exit — an orphan costs a full scan, a referenced file
// stops at its first mention, which is what keeps the guard at a few seconds.
export function isReferenced(asset, corpus) {
  const base = asset.split('/').pop();
  return corpus.some(names(asset, base, stemOf(base)));
}

// Heavy binaries nobody names and nobody vouched for. `keep` maps a path to the reason
// it stays although nothing names it — an entry is a decision someone wrote down.
export const findOrphans = (heavy, corpus, keep = new Map()) =>
  heavy.filter((file) => !keep.has(file) && !isReferenced(file, corpus));

// A keep-list entry that names an untracked file, or one that is now referenced, is a
// reason nobody needs; left in place it would excuse the next file with that name.
export function staleKeeps(keep, tracked, corpus) {
  const stale = [];
  for (const [file, why] of keep) {
    if (!tracked.includes(file)) stale.push(`${file} is not tracked (reason it had: ${why})`);
    else if (isReferenced(file, corpus)) stale.push(`${file} is referenced now — drop it from the keep list`);
  }
  return stale;
}

// What must not come back, by PATH, because the name rule cannot see it: every file under
// a removed directory, any named file that was removed, and any heavy binary at the
// repository root (Next serves `public/`, not the root, so nothing there is served
// whatever a page's text says).
export function strays(files, heavy, { dirs = [], paths = [] } = {}) {
  return {
    back: [...dirs.flatMap((dir) => files.filter((file) => file.startsWith(dir))), ...paths.filter((file) => files.includes(file))],
    rootHeavy: heavy.filter((file) => !file.includes('/')),
  };
}

// A scan that reads nothing would make every check above pass or fail for the wrong
// reason, so the scan refuses to be used below these floors. About half of what the tree
// held after the trim (2,095 text files, 336 binaries of any size). ⚠ The floor is on ALL
// binaries, not on heavy ones: a floor on the heavy count would turn red the day someone
// compresses the page backgrounds, which is the outcome this guard wants.
export const FLOOR = { texts: 1000, binaries: 150 };
export function assertScanSane({ texts, binaries }, floor = FLOOR) {
  if (texts.length < floor.texts) throw new Error(`only ${texts.length} tracked text files were read (floor ${floor.texts}) — the file listing or the text/binary sniff broke`);
  if (binaries < floor.binaries) throw new Error(`only ${binaries} binary files were found (floor ${floor.binaries}) — the file listing or the text/binary sniff broke`);
}

// Split `files` (repo-relative paths under `root`) into the text corpus and the heavy
// binaries, counting every binary on the way. Only the first SNIFF_BYTES of a file are read
// to classify it; a binary is never read whole. A tracked file the working tree no longer
// has (a deletion not yet staged) is skipped, not an error.
export function scanTree(root, files) {
  const texts = [];
  const heavy = [];
  let binaries = 0;
  for (const file of files) {
    const abs = path.join(root, file);
    let size, head;
    try {
      const fd = fs.openSync(abs, 'r');
      try {
        size = fs.fstatSync(fd).size;
        head = Buffer.alloc(Math.min(SNIFF_BYTES, size));
        fs.readSync(fd, head, 0, head.length, 0);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      continue;
    }
    if (looksBinary(head)) {
      binaries++;
      if (isHeavy(size)) heavy.push(file);
      continue;
    }
    if (inCorpus(file)) texts.push([file, decodeEscapes(fs.readFileSync(abs, 'utf8'))]);
  }
  // Pages and modules first: the answer never depends on the order, but a served asset's
  // first mention is nearly always in `public/` or `src/`, and `isReferenced` stops there.
  const served = (file) => /^(?:public|src|mobile-app\/src)\//.test(file);
  texts.sort(([a], [b]) => Number(served(b)) - Number(served(a)));
  return { texts, heavy, binaries };
}

// ⚠ A COPY UNDER ANOTHER NAME IS INVISIBLE TO THE NAME RULE. Seventy of the 324 files removed
// at the trim were byte-identical to a file a page DOES request, and the name rule read
// them as referenced because they shared its basename (`login-bg.png` at the repository
// root, a mockup copy of `Pricing.png`). So the rule also compares BYTES: two tracked heavy
// binaries with the same content are a decision somebody has to write down.
export function duplicateGroups(root, heavy) {
  const by = new Map();
  for (const rel of heavy) {
    const sha = createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
    by.set(sha, [...(by.get(sha) || []), rel]);
  }
  return [...by.values()].filter((g) => g.length > 1).map((g) => g.sort());
}
// A group is named by its sorted paths, so the allow-list reads the way the failure does.
export const groupKey = (group) => [...group].sort().join(' = ');
export const unallowedDuplicates = (groups, allowed) => groups.filter((g) => !allowed.has(groupKey(g)));
// An entry for a group that is no longer a duplicate would excuse the next copy of that file.
export function staleDuplicates(allowed, groups) {
  const live = new Set(groups.map(groupKey));
  return [...allowed.keys()].filter((key) => !live.has(key)).map((key) => `${key} is no longer a duplicate — drop it from ALLOWED_DUPLICATES`);
}
