// One footer, three renderings.
//
// ⚠ THIS FILE EXISTS FOR THE REASON tests/site-nav.test.mjs EXISTS. The two nav
// bars drifted into two different designs because nothing compared them. The
// footers had done the same, worse, in three places — measured 2026-09-14 before
// this guard was written:
//   · the homepage carried "The app" and "Shape Store" and NO link to
//     Coaches.html, the coaches' own pitch page;
//   · it headed its second group "For coaches" where the shared one said "For
//     trainers" — over a group containing nutritionists either way;
//   · it put the legal links under Support where the shared one put them under
//     Company;
//   · GetApp carried a four-item Product list against the shared seven;
//   · and all three linked "Press" at `Team.html#press`, which is the CLIENT'S
//     "My Team" page and has no `id="press"` anywhere on it.
//
// The shared component is the source of truth; the two static pages hand-write a
// copy because they cannot import a React component at build time. This compares
// all three, by label AND by target, group by group.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ND = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'newdesign');
const PUB = path.join(ND, '..');
const read = (f) => readFileSync(path.join(ND, f), 'utf8');
const SHELL = read('pageShell.jsx');
const INDEX = read('index.html');
const GETAPP = read('GetApp.html');

// A target's identity for comparison. The three legitimately spell the same
// destination differently — the static pages write `/newdesign/Marketplace.html`,
// the component writes `Marketplace.html` — so ONE prefix is normalised away and
// nothing else.
//
// ⚠ IT USED TO STRIP THROUGH THE LAST SLASH, WHICH MADE DIFFERENT DESTINATIONS
// COMPARE EQUAL. `/old/Marketplace.html` and even
// `https://example.com/Marketplace.html` both reduced to `Marketplace.html`, so a
// static copy that drifted to another directory or another ORIGIN still matched
// the shared table and passed the whole suite — and the existence check below
// only ever opens SHARED's own targets, so nothing else would have caught it.
// Root-relative `/x.html` keeps its slash: those are real site-root paths (the
// legal pages), distinct from a sibling `x.html`, and collapsing them would hide
// that drift too.
const target = (href) => String(href || '').trim().replace(/^\/newdesign\//, '');
const deent = (s) => String(s).replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();

// ── the source of truth, lifted from the component ──────────────────────────
function sharedTable() {
  const i = SHELL.indexOf('["Product",');
  assert.ok(i > 0, 'the shared footer table is gone — this guard is reading nothing');
  const blk = SHELL.slice(i, SHELL.indexOf('].map(([h, items])', i));
  const groups = [...blk.matchAll(/\["([^"]+)",\s*\[(.*?)\]\],/gs)].map(([, head, items]) => [
    head,
    [...items.matchAll(/\["([^"]+)", "([^"]+)"\]/g)].map((m) => [deent(m[1]), m[2]]),
  ]);
  assert.ok(groups.length >= 4, 'parsed only ' + groups.length + ' groups from the shared footer');
  return groups;
}
const SHARED = sharedTable();

// ── the two hand-written copies ─────────────────────────────────────────────
function staticTable(src, footRe, headRe) {
  const m = footRe.exec(src);
  assert.ok(m, 'no footer matched ' + footRe);
  const foot = m[0];
  const out = [];
  const heads = [...foot.matchAll(headRe)];
  for (let i = 0; i < heads.length; i++) {
    const from = heads[i].index + heads[i][0].length;
    const to = i + 1 < heads.length ? heads[i + 1].index : foot.length;
    out.push([
      deent(heads[i][1]),
      [...foot.slice(from, to).matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
        .map((a) => [deent(a[2].replace(/<[^>]*>/g, '')), a[1]]),
    ]);
  }
  return out;
}
const COPIES = [
  ['index.html', staticTable(INDEX, /<footer class="ft">[\s\S]*?<\/footer>/, /<h5>([^<]+)<\/h5>/g)],
  ['GetApp.html', staticTable(GETAPP, /<footer class="ga-footer">[\s\S]*?<\/footer>/, /class="ga-footer-head">([^<]+)<\/div>/g)],
];

test('all three footers carry the same groups, labels and targets', () => {
  for (const [name, copy] of COPIES) {
    assert.deepEqual(copy.map(([h]) => h), SHARED.map(([h]) => h),
      name + ' has different footer groups than the shared footer');
    for (let g = 0; g < SHARED.length; g++) {
      assert.deepEqual(copy[g][1].map(([l]) => l), SHARED[g][1].map(([l]) => l),
        `${name} · ${SHARED[g][0]}: different labels`);
      assert.deepEqual(copy[g][1].map(([, h]) => target(h)), SHARED[g][1].map(([, h]) => target(h)),
        `${name} · ${SHARED[g][0]}: same labels, different destinations`);
    }
  }
});

// ⚠ A FOOTER IS READ BY PEOPLE WHO ARE NOT SIGNED IN. Three links used to point
// at dashboard pages — every one a redirect stub into a shell that sends a
// measured signed-out visitor to Login.html since the sign-in gate shipped. They
// were dead ends for the footer's entire audience. Derived, not listed: any
// target whose body is a location.replace into one of the three shells fails.
test('no footer link sends a signed-out visitor to a sign-in gate', () => {
  let checked = 0;
  for (const [, items] of SHARED) {
    for (const [label, href] of items) {
      const f = target(href);
      if (!f.endsWith('.html')) continue;
      const p = path.join(ND, f);
      if (!existsSync(p)) continue;
      checked++;
      const body = readFileSync(p, 'utf8');
      // Two ways a target gates a signed-out visitor, and the second is the one
      // this check used to miss. A legacy tab page is a stub that redirects into
      // a shell; a SHELL redirects to Login itself. Matching only the stub shape
      // meant a footer pointing straight at ClientApp.html — the most obvious
      // way to write this link wrong — passed, and the equality and existence
      // tests pass too, so the stated invariant was not enforced at all.
      const stub = /location\.replace\(\s*["'`](Client|Trainer|Nutritionist)App\.html/.exec(body);
      assert.ok(!stub, `"${label}" → ${f} is a redirect stub into ${stub && stub[1]}App.html, which bounces a signed-out visitor to Login`);
      const gate = /location\.replace\([^)]*Login\.html/.test(body);
      assert.ok(!gate, `"${label}" → ${f} sends a signed-out visitor to Login.html itself — a footer link may not be account-gated`);
    }
  }
  assert.ok(checked >= 10, 'only ' + checked + ' targets checked — the sweep stopped matching');
});

test('every footer target exists, and every anchor it names is real', () => {
  for (const [, items] of SHARED) {
    for (const [label, href] of items) {
      const [file, hash] = String(href).split('#');
      const p = file.startsWith('/') ? path.join(PUB, file.slice(1)) : path.join(ND, file);
      assert.ok(existsSync(p), `"${label}" → ${href} is not a file in the repo`);
      if (hash) {
        // ⚠ "Press" pointed at Team.html#press in all three footers and Team.html
        // has no id="press" — a dead anchor lands the visitor at the top of a page
        // that is not about press, with nothing to tell them the link failed.
        const body = readFileSync(p, 'utf8');
        assert.ok(new RegExp(`id=["']${hash}["']`).test(body),
          `"${label}" → ${href} names an anchor that does not exist on ${file}`);
      }
    }
  }
});

// ⚠ THESE FOUR HAVE NO OTHER LINK. Measured when the nav's dropdowns were
// retired: nothing else in public/newdesign points at them, so the footer is the
// only thing standing between them and being reachable by typed URL alone.
test('the footer still carries the pages nothing else links', () => {
  const linked = new Set(SHARED.flatMap(([, items]) => items.map(([, h]) => target(h))));
  for (const orphan of ['Coach.html', 'Nutritionist.html', 'Client.html', 'Recipes.html']) {
    assert.ok(linked.has(orphan), orphan + ' left the footer, and nothing else on the site links it');
  }
});

// ⚠ THE COMMENT ABOVE THE FOOTER TABLE CLAIMS SOME OF THOSE PAGES HAVE NO OTHER
// LINK, AND A CLAIM ABOUT THE NAV GOES STALE WHEN THE NAV MOVES. It has now been
// wrong twice: #2069 promoted Client.html to the `Members` tab and nothing
// noticed, so the file carried a measurement that had been false since the day
// before; this PR promotes Recipes.html to the `Kitchen` tab and the comment is
// corrected in the same diff. This asserts the two it still names are absent
// from the nav table — promote one and this fails, naming the comment, instead
// of leaving a wrong reason sitting where the next reader decides whether a
// footer link is load bearing.
//
// ⚠ AND THE TWO CHECKS ABOVE THE ASSERTIONS CATCH DIFFERENT FAILURES — neither
// is belt-and-braces, which was measured rather than assumed. A nav parser that
// stops matching ENTIRELY reports every page as absent and passes both
// assertions vacuously; the pages that ARE in the nav are the controls that
// catch it. A parser that still works but sees only PART of the table passes
// those controls — Client.html is the second entry — while the pages it never
// reaches read as absent for the wrong reason; only the size floor catches that.
// Proven by mutation both ways: truncate the match list to three and the floor
// alone fails; remove the floor as well and it goes green on a parse reading a
// fifth of the nav.
//
// ⚠ AND THE SECOND CONTROL STRICTLY STRENGTHENS IT RATHER THAN DUPLICATING THE
// FIRST. Recipes.html is the FOURTH quoted target, so a parse that reaches it has
// read twice as much of the table as one that only reaches Client.html — the two
// controls bracket the truncation the floor is aimed at instead of sitting on top
// of each other.
test('the pages the footer comment calls footer-only are really not in the nav', () => {
  const i = SHELL.indexOf('const SHAPE_NAV_GROUPS');
  assert.ok(i > 0, 'SHAPE_NAV_GROUPS not found — this guard is reading nothing');
  const table = SHELL.slice(i, SHELL.indexOf('\n];', i));
  const navTargets = new Set([...table.matchAll(/href:\s*"([^"]+)"/g)].map((m) => target(m[1])));
  assert.ok(navTargets.size >= 5, 'parsed only ' + navTargets.size + ' nav targets — the parser stopped matching');

  for (const [page, tab] of [['Client.html', 'Members'], ['Recipes.html', 'Kitchen']]) {
    assert.ok(navTargets.has(page),
      page + ' is the ' + tab + ' tab and must parse as present — if it does not, this guard cannot see a nav link at all');
  }

  for (const only of ['Coach.html', 'Nutritionist.html']) {
    assert.ok(!navTargets.has(only),
      only + ' is in the nav now, so the footer comment calling it footer-only is false — correct the comment above FOOTER TABLE in pageShell.jsx');
  }
});

// ⚠ NOT A PIXEL PIN — A FLOOR. The owner asked for the bottom-left logo to be
// bigger; it was 26px. This asserts it did not quietly go back, without freezing
// a design decision at one exact number.
test('the homepage footer logo is not back to its old size', () => {
  const h = /\.ft \.logo\{height:(\d+)px/.exec(INDEX);
  assert.ok(h, 'the homepage footer logo rule is gone');
  assert.ok(Number(h[1]) >= 40, 'the homepage footer logo is back down to ' + h[1] + 'px');
});

// The whole point is "same on each page", so the sweep has to know how many
// pages there are and that each gets one.
test('every page still carries a footer', () => {
  const pages = readdirSync(ND).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length >= 70, 'only ' + pages.length + ' pages found');
  const without = [];
  for (const p of pages) {
    const s = readFileSync(path.join(ND, p), 'utf8');
    if (/<footer[\s>]/i.test(s)) continue;
    const mods = [...s.matchAll(/src="([\w.\-]+\.jsx)/g)].map((m) => m[1]);
    const has = mods.some((m) => existsSync(path.join(ND, m)) && /<footer|<Footer\b/.test(readFileSync(path.join(ND, m), 'utf8')));
    if (!has) without.push(p);
  }
  // ⚠ NOT ZERO — MEASURED. Four pages render no footer at all, and each is a
  // deliberate bare surface rather than an oversight: two public coach profile
  // shells, a playlist page and the consultation booking flow. Pinned as a list
  // so a FIFTH page losing its footer fails, without pretending these four are
  // fixed.
  assert.deepEqual(without.sort(), ['ClientPlaylists.html', 'NutritionistPublic.html', 'TrainerPublic.html', 'consultation.html'],
    'the set of pages with no footer changed: ' + without.join(', '));
});

// ⚠ THIS IS THE GUARD AGAINST TWELVE PAGES PRINTING THE FOOTER TWICE, and it is
// deliberately an ABSENCE check rather than a count. `pageShell.jsx` used to
// auto-mount a second <Footer /> into any page carrying this div, in a root of
// its own, without ever asking whether the page already had one — and all twelve
// that opted in did. Driven in Chromium on Marketplace before the fix: two
// .shape-footer-grid at y 5090 and y 5621, the logo, "Join the community" and
// all four link groups printed back to back. The mount is retired; the div is
// inert, so a page adding one now gets NOTHING from it while looking like it
// opted into something.
//
// ⚠ AND A COUNT IS NOT AVAILABLE FROM SOURCE, which is worth writing down because
// the obvious fix here is to write one. Counting <Footer /> across a page and the
// modules it loads over-reports by 3-4x on the dashboard pages: ClientDashboard
// loads both dashClient.jsx and trainerDashboard.jsx, each of which renders a
// footer for a branch the other page takes, and nothing in the text says which
// one runs. A counter like that reports 66 pages broken on a tree where the real
// number is zero. The number of footers a page RENDERS is a browser question;
// the assertion below is the source question that actually has an answer.
test('no page opts into the retired footer auto-mount', () => {
  const pages = readdirSync(ND).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length >= 70, 'only ' + pages.length + ' pages found');
  const optIn = pages.filter((p) => /id="site-footer"/.test(readFileSync(path.join(ND, p), 'utf8')));
  assert.deepEqual(optIn, [],
    'these pages carry <div id="site-footer">, which nothing mounts any more: ' + optIn.join(', '));
  assert.ok(!/mountSiteFooter|getElementById\('site-footer'\)/.test(SHELL),
    'the footer auto-mount is back in pageShell.jsx — it rendered a second footer on every page that opted in');
});
