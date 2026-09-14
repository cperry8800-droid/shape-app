// The Coaches page, and the promises the site no longer makes.
//
// Owner, 2026-09-14: "on the current coaches page when signed out, i want a
// preview of that new page giving previews of the coaches dashboard they will
// have access to and use once an account is created" — so Coaches.html is a
// public page whose subject is the dashboard, built from real captures.
//
// And, in the same breath: "remove the from application to first client in under
// 2 weeks. dont want to gurantee anything like that yet." That second ruling is
// the larger half of this file, because it is the one a later edit can quietly
// undo: the sweep at the bottom bans the CLASS across every coach-facing page,
// not the four sentences that happened to carry it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './helpers/strip-comments.mjs';

const ND = path.dirname(fileURLToPath(new URL('../public/newdesign/x', import.meta.url)));
const read = (f) => readFileSync(path.join(ND, f), 'utf8');

const PAGE = read('coaches.jsx');
const HTML = read('Coaches.html');

// The tour table, lifted from the page rather than restated here — a restated
// copy is a second thing to keep in step, and it would go on passing after the
// page stopped agreeing with it.
// ⚠ BRACE-MATCHED, NOT A LAZY SPAN. `/\{[\s\S]*?\n\};/` looks right and stops at
// the first `};` it can reach, which here is a nested one — the same class of
// broken extractor tests/helpers/strip-comments.mjs exists to stop being written
// a fourth time. An extractor that silently takes the wrong slice reports on
// source that is not there.
function braceBlock(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, 'could not find ' + marker + ' in coaches.jsx');
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(marker + ' is unbalanced');
}

const CO_TOUR = new Function('return ' + braceBlock(PAGE, 'const CO_TOUR =') + ';')();

test('the tour is real — these tests cannot pass vacuously', () => {
  assert.deepEqual(Object.keys(CO_TOUR), ['trainer', 'nutri']);
  for (const role of Object.keys(CO_TOUR)) {
    assert.equal(CO_TOUR[role].tabs.length, 5, role + ' does not offer five dashboard pages');
  }
});

test('the page is wired up and carries the shared nav', () => {
  assert.ok(/pageShell\.jsx/.test(HTML), 'Coaches.html does not load the shared header');
  assert.ok(/coaches\.jsx/.test(HTML), 'Coaches.html does not load its own module');
  assert.ok(/<div id="site-footer">/.test(HTML), 'Coaches.html has no footer mount');
});

test('every frame the tour names is a capture that exists', () => {
  // ⚠ A MISSING JPG IS A BROKEN IMAGE ON THE PAGE WHOSE WHOLE POINT IS THE
  // PICTURES. The filename is built from role + tab in CoFrame, so the name the
  // table implies is derived here the same way rather than listed.
  const seen = new Set();
  for (const [role, cfg] of Object.entries(CO_TOUR)) {
    for (const tab of cfg.tabs) {
      const file = `coaches-dash-${role}-${tab.file}.jpg`;
      assert.ok(existsSync(path.join(ND, 'coaches', file)), 'the tour names a capture that is not in the repo: ' + file);
      seen.add(file);
    }
  }
  // And nothing orphaned the other way: a capture nobody renders is dead weight
  // in the deploy, and the likeliest cause is a tab that was renamed in the table.
  const onDisk = readdirSync(path.join(ND, 'coaches')).filter((f) => f.endsWith('.jpg'));
  assert.deepEqual(onDisk.filter((f) => !seen.has(f)), [], 'a capture in public/newdesign/coaches is rendered by nothing');
  assert.equal(seen.size, 10, 'expected ten captures, the tour names ' + seen.size);
});

test('the frame carries its own label, not a caption near it', () => {
  // ⚠ These are the signed-out demo practice: real screens, invented numbers. An
  // unlabelled picture of invented figures on a marketing page is the honest-data
  // defect this repo post-mortems — and a caption further down the page does not
  // travel with the image when it is screenshotted, shared or scrolled past.
  const frame = /function CoFrame\(([\s\S]*?)\n}/.exec(PAGE);
  assert.ok(frame, 'CoFrame is gone — the label may have gone with it');
  assert.match(frame[1], /Example account/, 'CoFrame no longer stamps the capture it renders');
  // Every image on this page goes through CoFrame, so the label cannot be
  // bypassed by rendering an <img> directly.
  const stripped = stripComments(PAGE);
  const imgs = [...stripped.matchAll(/<img\b/g)].length;
  assert.equal(imgs, 1, 'expected exactly one <img> (CoFrame\'s); found ' + imgs + ' — a frame may render unlabelled');
});

test('both roles and every tab are reachable', () => {
  for (const [role, cfg] of Object.entries(CO_TOUR)) {
    assert.ok(cfg.label, role + ' has no switch label');
    for (const tab of cfg.tabs) {
      assert.ok(tab.name && tab.body && Array.isArray(tab.list) && tab.list.length,
        `${role}/${tab.key} is missing its name, body or bullet list`);
    }
  }
  // The one place the two roles legitimately differ: a trainer writes Programs,
  // a nutritionist writes Plans, and the capture filename follows the tab.
  assert.equal(CO_TOUR.trainer.tabs[3].name, 'Programs');
  assert.equal(CO_TOUR.nutri.tabs[3].name, 'Plans');
  assert.equal(CO_TOUR.nutri.tabs[3].file, 'plans');
});

// ── the promises the site no longer makes ───────────────────────────────────
// ⚠ DERIVED, NOT LISTED. The build spec named four sentences; sweeping the class
// found six, and the two it missed were the closing CTA on each page — the line a
// coach reads immediately before applying. An enumeration is a list the next page
// silently fails to join.
const COACH_FACING = readdirSync(ND)
  .filter((f) => f.endsWith('.jsx'))
  .filter((f) => {
    const s = read(f);
    return /Signup(Trainer|Nutritionist)\.html/.test(s) && /application/i.test(s);
  });

// ⚠ EACH PATTERN IS PAIRED WITH THE SENTENCE IT WAS WRITTEN FOR, and the test
// below proves every one still catches its own. A ban whose regex has quietly
// stopped matching passes on a page that carries the promise — which is the
// failure mode of every ban, and the reason the retired copy is kept here rather
// than deleted with the lines it came from.
const PROMISES = [
  [/under (two|2) weeks/i, 'a promise about how long the whole path takes',
   'From application to first client in under two weeks.'],
  [/\b(in|within|during) the first (week|two weeks|2 weeks)\b/i, 'a promise about when clients arrive',
   'New client inquiries land in your inbox within the first week.'],
  [/usually book within/i, 'a promise about when clients arrive',
   'First consults usually book within the first two weeks.'],
  [/\b2\s*[–—-]\s*3\s*days\b/i, 'a promise about our own review turnaround',
   'Review in 2–3 days'],
  [/hear back within/i, 'a promise about our own review turnaround',
   "We review every application personally — you'll hear back within 2–3 days."],
];

test('every ban still catches the sentence it was written for', () => {
  // The positive control. Without it a typo'd pattern reports a clean sweep
  // forever, and the page it is guarding can say whatever it likes.
  for (const [re, why, retired] of PROMISES) {
    assert.match(retired, re, 'the ban for ' + why + ' no longer matches its own retired copy');
  }
  // And the patterns must not fire on the copy that legitimately stayed: the
  // step cards still say how long the applicant's own form takes.
  for (const [re] of PROMISES) {
    assert.doesNotMatch('Apply in 10 minutes', re, 'a ban fires on the effort estimate that stayed');
    assert.doesNotMatch('Set up your storefront in 1–2 hrs', re, 'a ban fires on setup effort');
  }
});

test('the sweep has a corpus — it cannot pass by matching nothing', () => {
  assert.ok(COACH_FACING.length >= 3, 'the coach-facing sweep found only ' + COACH_FACING.length + ' pages');
  for (const f of ['coach.jsx', 'nutritionist.jsx', 'coaches.jsx']) {
    assert.ok(COACH_FACING.includes(f), f + ' fell out of the coach-facing corpus');
  }
});

test('no coach-facing page guarantees a timing', () => {
  // Comments are stripped because coaches.jsx quotes the owner's ruling verbatim
  // — a rationale that names the banned phrase must not trip the ban it explains.
  //
  // ⚠ "Apply in 10 minutes" is deliberately NOT banned. It says how long the
  // applicant's own form takes, which Shape controls and can be checked; the six
  // patterns above are promises about an OUTCOME or about our own turnaround.
  // Whether that line should go too is an open owner call, so this test takes no
  // position on it rather than pinning it either way.
  for (const f of COACH_FACING) {
    const body = stripComments(read(f));
    for (const [re, why] of PROMISES) {
      const hit = re.exec(body);
      assert.equal(hit, null, `${f} makes ${why}: “${hit && hit[0]}”`);
    }
  }
});

test('the step cards state no duration they cannot keep', () => {
  // The review step's `time:` chip carried the same guarantee as its title, so
  // removing the title alone would have left the promise on screen in 10.5px mono.
  for (const f of ['coach.jsx', 'nutritionist.jsx']) {
    const body = stripComments(read(f));
    const steps = [...body.matchAll(/time: "([^"]+)"/g)].map((m) => m[1]);
    assert.ok(steps.length >= 2, f + ': the step table stopped matching — the sweep is reading nothing');
    for (const t of steps) {
      assert.ok(!/day|week|month/i.test(t), `${f}: a step card still promises “${t}”`);
    }
  }
  // And the chip is skipped rather than rendered empty, so a step with no honest
  // figure says so by absence instead of leaving a styled box with nothing in it.
  for (const f of ['coach.jsx', 'nutritionist.jsx']) {
    assert.match(read(f), /\{s\.time \? <div/, f + ': the time chip renders unconditionally again');
  }
});
