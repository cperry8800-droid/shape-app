// Mutation round for tests/heavy-assets-referenced.test.mjs and its rule in
// tests/helpers/heavy-assets.mjs. Every mutation breaks ONE thing the guard depends on;
// a survivor is a gap in the guard's own fixtures, not a fact about the tree.
//
//   node scripts/mutate.mjs --spec tests/mutations/heavy-assets.mutations.mjs
//
// The groups follow the failure they stand for: the size line, the reference rule (name,
// escape, stem), the corpus, the scan, the floors, and the path pins.

const H = 'tests/helpers/heavy-assets.mjs';
const T = 'tests/heavy-assets-referenced.test.mjs';

export default {
  test: 'node --test tests/heavy-assets-referenced.test.mjs',
  timeoutMs: 120000,
  mutations: [
    // ── the size line ─────────────────────────────────────────────────────────
    { name: 'threshold: 200 KB becomes 200 MB', file: H,
      find: 'export const MIN_BYTES = 200 * 1024;', replace: 'export const MIN_BYTES = 200 * 1024 * 1024;' },
    { name: 'threshold: the boundary becomes exclusive', file: H,
      find: 'export const isHeavy = (bytes) => bytes >= MIN_BYTES;', replace: 'export const isHeavy = (bytes) => bytes > MIN_BYTES;' },

    // ── the reference rule: names ─────────────────────────────────────────────
    { name: 'name: a longer name ending the same way counts (no boundary before)', file: H,
      find: '(before === undefined || !WORD.test(before)) && ', replace: '' },
    { name: 'name: a longer extension counts (no boundary after)', file: H,
      find: ' && (after === undefined || !WORD.test(after))', replace: '' },
    { name: 'name: a file vouches for itself', file: H,
      find: 'file !== asset && ', replace: '' },
    { name: 'name: any() becomes all() in the early exit', file: H,
      find: 'return corpus.some(names(asset, base, stemOf(base)));', replace: 'return corpus.every(names(asset, base, stemOf(base)));' },

    // ── the reference rule: escapes ───────────────────────────────────────────
    { name: 'escape: nothing is decoded', file: H,
      find: `  text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try { return decodeURIComponent(run); } catch { return run; }
  });`,
      replace: '  text;' },
    { name: 'escape: only %20 is decoded (the first census)', file: H,
      find: 'text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {', replace: 'text.replace(/%20/g, (run) => {' },
    { name: 'escape: a malformed escape throws', file: H,
      find: 'try { return decodeURIComponent(run); } catch { return run; }', replace: 'return decodeURIComponent(run);' },
    { name: 'escape: the scan reads raw text', file: H,
      find: "texts.push([file, decodeEscapes(fs.readFileSync(abs, 'utf8'))]);", replace: "texts.push([file, fs.readFileSync(abs, 'utf8')]);" },

    // ── the reference rule: stems ─────────────────────────────────────────────
    { name: 'stem: dropped altogether', file: H,
      find: '(namesBasename(text, base) || namesStem(text, stem))', replace: 'namesBasename(text, base)' },
    { name: 'stem: any occurrence counts, prose included (the first census)', file: H,
      find: 'indicesOf(text, stem).some((i) => STEM_OPEN.has(text[i - 1]) && STEM_CLOSE.has(text[i + stem.length]));', replace: 'text.includes(stem);' },
    { name: 'stem: a plain quoted word counts', file: H,
      find: '  STEM_SHAPE.test(stem) &&\n', replace: '' },
    { name: 'stem: no minimum length', file: H,
      find: 'stem.length >= STEM_MIN &&', replace: '' },
    { name: 'stem: a closing dot counts (a sibling extension)', file: H,
      find: `const STEM_CLOSE = new Set(["'", '"', '\`', '/', ')', '?', '#', ',']);`, replace: `const STEM_CLOSE = new Set(["'", '"', '\`', '/', ')', '?', '#', ',', '.']);` },

    // ── the corpus ────────────────────────────────────────────────────────────
    { name: 'corpus: the changelog counts', file: H,
      find: 'export const inCorpus = (file) => !CHANGELOG.test(file) && !GUARD_FILES.includes(file);', replace: 'export const inCorpus = (file) => !GUARD_FILES.includes(file);' },
    { name: 'corpus: the archives count', file: H,
      find: 'export const CHANGELOG = /^docs\\/WORKLOG(?:-ARCHIVE-[^/]+)?\\.md$/;', replace: 'export const CHANGELOG = /^docs\\/WORKLOG\\.md$/;' },
    { name: 'corpus: the guard names its own assets', file: H,
      find: 'export const inCorpus = (file) => !CHANGELOG.test(file) && !GUARD_FILES.includes(file);', replace: 'export const inCorpus = (file) => !CHANGELOG.test(file);' },
    { name: 'corpus: the wrong directory is excluded (public/ instead of the changelog)', file: H,
      find: 'export const inCorpus = (file) => !CHANGELOG.test(file) && !GUARD_FILES.includes(file);', replace: 'export const inCorpus = (file) => !/^public\\//.test(file) && !GUARD_FILES.includes(file);' },
    { name: 'corpus: the guard file list loses one entry', file: H,
      find: "  'tests/mutations/heavy-assets.mutations.mjs',\n", replace: '' },

    // ── the scan ──────────────────────────────────────────────────────────────
    { name: 'scan: every file reads as text (binary content is evidence)', file: H,
      find: 'export const looksBinary = (head) => head.subarray(0, SNIFF_BYTES).includes(0);', replace: 'export const looksBinary = () => false;' },
    { name: 'scan: the sniff reads one byte past git\'s 8000', file: H,
      find: 'export const SNIFF_BYTES = 8000;', replace: 'export const SNIFF_BYTES = 8001;' },
    { name: 'scan: a heavy binary is not recorded', file: H,
      find: 'if (isHeavy(size)) heavy.push(file);', replace: '' },
    { name: 'scan: the corpus ignores its exclusions', file: H,
      find: 'if (inCorpus(file)) texts.push(', replace: 'if (true) texts.push(' },
    { name: 'scan: a file missing from the working tree is an error', file: H,
      find: '    } catch {\n      continue;\n    }', replace: '    } catch (e) {\n      throw e;\n    }' },
    // PROVEN NO-OP: the sort only moves pages and modules to the front so `isReferenced`
    // reaches a mention sooner. Every answer is a `some`/`filter` over the whole corpus,
    // so no output depends on the order; only the run time does.
    { name: 'scan: the served-first ordering is dropped', file: H, expectSurvive: true,
      find: 'texts.sort(([a], [b]) => Number(served(b)) - Number(served(a)));', replace: '' },

    // ── orphans and vouching ──────────────────────────────────────────────────
    { name: 'orphans: the keep list is ignored', file: H,
      find: '!keep.has(file) && ', replace: '' },
    { name: 'vouch: an untracked entry is not reported', file: H,
      find: 'if (!tracked.includes(file)) stale.push(', replace: 'if (false) stale.push(' },
    { name: 'vouch: a now-referenced entry is not reported', file: H,
      find: 'else if (isReferenced(file, corpus)) stale.push(', replace: 'else if (false) stale.push(' },

    // ── the floors ────────────────────────────────────────────────────────────
    { name: 'floor: both floors go to zero', file: H,
      find: 'export const FLOOR = { texts: 1000, binaries: 150 };', replace: 'export const FLOOR = { texts: 0, binaries: 0 };' },
    { name: 'floor: the text-file check is removed', file: H,
      find: 'if (texts.length < floor.texts) throw new Error(', replace: 'if (false) throw new Error(' },
    { name: 'floor: the binary-count check is removed', file: H,
      find: 'if (binaries < floor.binaries) throw new Error(', replace: 'if (false) throw new Error(' },
    { name: 'scan: binaries are not counted', file: H,
      find: '      binaries++;\n', replace: '' },

    // ── the path pins ─────────────────────────────────────────────────────────
    { name: 'pins: nothing is checked under a removed directory', file: H,
      find: 'back: [...dirs.flatMap((dir) => files.filter((file) => file.startsWith(dir))), ...paths.filter((file) => files.includes(file))],',
      replace: 'back: [...paths.filter((file) => files.includes(file))],' },
    { name: 'pins: a removed file is not checked', file: H,
      find: 'back: [...dirs.flatMap((dir) => files.filter((file) => file.startsWith(dir))), ...paths.filter((file) => files.includes(file))],',
      replace: 'back: [...dirs.flatMap((dir) => files.filter((file) => file.startsWith(dir)))],' },
    { name: 'pins: a heavy binary at the root is not found', file: H,
      find: "rootHeavy: heavy.filter((file) => !file.includes('/')),", replace: 'rootHeavy: [],' },
    { name: 'pins: the removed-directory list is emptied', file: T,
      find: "const GONE_DIRS = ['mobile-app/public-runtime/', 'mobile-app/design-mockups/'];", replace: 'const GONE_DIRS = [];' },
    { name: 'pins: the removed-file list is emptied', file: T,
      find: "const GONE_FILES = ['public/intro/Pricing.png', 'public/newdesign/Pricing.png', 'public/mobile/store-bg.png', 'public/radio-bg.png'];", replace: 'const GONE_FILES = [];' },
    { name: 'pins: the index refusal is removed', file: T,
      find: "  assert.ok(files.length > 0, 'git ls-files returned nothing — the guard cannot scan, so it refuses rather than report the tree clean');\n", replace: '' },

    // ── the byte rule (a copy under another name) ─────────────────────────────
    { name: 'duplicates: nothing is ever reported', file: H,
      find: '  return [...by.values()].filter((g) => g.length > 1).map((g) => g.sort());', replace: '  return [];' },
    { name: 'duplicates: a lone file counts as a group', file: H,
      find: '.filter((g) => g.length > 1)', replace: '.filter((g) => g.length > 0)' },
    { name: 'duplicates: the path is hashed, not the bytes', file: H,
      find: ".update(fs.readFileSync(path.join(root, rel)))", replace: '.update(rel)' },
    { name: 'duplicates: the allow-list is ignored', file: T,
      find: 'const loose = unallowedDuplicates(groups, ALLOWED_DUPLICATES);', replace: 'const loose = unallowedDuplicates(groups, new Map());' },
    { name: 'duplicates: a stale allow-list entry is tolerated', file: T,
      find: 'const ALLOWED_DUPLICATES = new Map([\n', replace: "const ALLOWED_DUPLICATES = new Map([\n  ['public/gone-a.png = public/gone-b.png', 'stale'],\n" },
    { name: 'duplicates: a group is keyed by an unsorted list', file: H,
      find: 'export const groupKey = (group) => [...group].sort().join(\' = \');', replace: 'export const groupKey = (group) => [...group].join(\' = \');' },
  ],
};
