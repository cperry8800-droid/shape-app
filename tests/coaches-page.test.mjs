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

// ⚠ THE FRAME'S RATIO AND THE FILES' OWN SIZE ARE TWO NUMBERS THAT HAVE TO AGREE,
// AND NOTHING FAILS WHEN THEY DRIFT. `CoFrame` declares `aspectRatio: "1440 / 860"`
// over captures that are 1440x900, with `object-fit: cover` — so the browser scales
// to fill and crops exactly 40px off the bottom, which is the chrome the shots carry.
// Re-capture at a different height and the crop silently becomes something else: the
// page still renders, the images still load, every other test still passes, and the
// frames are simply wrong. Only comparing the declared ratio against the actual files
// can see it, so that is what this does — reading both from source rather than from
// two numbers typed here, which would go stale the same way.
function jpegDims(buf) {
  // The marker chain, walked rather than scanned: the bytes FF C0 occur constantly
  // inside EXIF and embedded thumbnails, so a scan lands in a thumbnail and reports
  // its size as the photo's. Segments are skipped by their declared length.
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (i + 3 >= buf.length) return null;
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15, minus DHT (C4), DNL (C8) and DAC (CC), which share the range.
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (i + 9 > buf.length) return null;
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (len < 2) return null; // a zero length is how a walker is made to spin
    i += 2 + len;
  }
  return null;
}

test('the frame crops the captures by the amount it means to', () => {
  const ratio = /aspectRatio:\s*"(\d+)\s*\/\s*(\d+)"/.exec(PAGE);
  assert.ok(ratio, 'CoFrame no longer declares an aspect ratio in the shape this reads');
  const declared = Number(ratio[1]) / Number(ratio[2]);

  const files = readdirSync(path.join(ND, 'coaches')).filter((f) => f.endsWith('.jpg'));
  assert.ok(files.length >= 10, 'read only ' + files.length + ' captures — the sweep stopped matching');

  const sizes = new Set();
  for (const f of files) {
    const d = jpegDims(readFileSync(path.join(ND, 'coaches', f)));
    assert.ok(d, f + ': could not read its dimensions — not a JPEG this walker understands');
    sizes.add(d.w + 'x' + d.h);
  }
  cropFault(sizes, declared);
});

// The rule, lifted out so a control can drive it. ⚠ THE MUTATION ROUND IS WHY: inline,
// relaxing `sizes.size === 1` to `>= 1` SURVIVED — the ten captures are uniform today,
// so a weakened check still passes on correct data and the suite cannot tell you it
// stopped measuring anything. The repo has no mixed-size fixture and should not grow
// ten more JPEGs to get one, so the control hands the same function a synthetic set.
function cropFault(sizes, declared) {
  // One geometry for all of them, or the same frame crops each one differently.
  assert.equal(sizes.size, 1, 'the captures are not all one size: ' + [...sizes].join(', '));
  const [w, h] = [...sizes][0].split('x').map(Number);
  const cropped = h - w / declared;
  assert.ok(cropped >= 0, 'the frame is TALLER than the captures, so cover would crop the sides instead: ' + cropped.toFixed(1) + 'px');
  // 40px of chrome is what the shots carry. A tolerance rather than an equality,
  // because a re-capture is allowed to differ by a pixel of rounding — but not by
  // enough to eat a row of the dashboard.
  assert.ok(cropped <= 60, 'the frame would crop ' + cropped.toFixed(1) + 'px off ' + h + 'px — more than the chrome the captures carry');
}

test('the crop rule fires on the shapes the repo does not currently contain', () => {
  const ratio = 1440 / 860;
  // A control first: the real geometry must PASS, or every assertion below is just a
  // function that refuses everything.
  assert.doesNotThrow(() => cropFault(new Set(['1440x900']), ratio));
  // A mixed set — the case that survives when the size check is relaxed.
  assert.throws(() => cropFault(new Set(['1440x900', '1440x960']), ratio), /not all one size/);
  // Captures TALLER than the frame expects: cover then crops the sides, not the chrome.
  assert.throws(() => cropFault(new Set(['1440x1400']), ratio), /more than the chrome/);
  // Captures SHORTER than the frame: cover crops the sides instead, and the dashboard
  // loses its left or right edge rather than its bottom strip.
  assert.throws(() => cropFault(new Set(['1440x700']), ratio), /crop the sides/);
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
  // ⚠ MONTHS, because the first version of this list enumerated week-shapes and
  // called itself derived. Codex found two live claims it could not see — both coach
  // pages promised a book would migrate "within the first month" — which is the same
  // outcome window one unit up. An enumeration is not a proof that the enumeration is
  // complete, and the only honest repair is to widen the unit rather than add the two
  // sentences that happened to be found.
  [/\b(in|within|during) the first (month|two months|2 months|few (weeks|months))\b/i,
   'a promise about when an outcome lands',
   'Most trainers migrate their book within the first month.'],
  // And the immediacy form, which carries no number at all: "the moment", "instantly",
  // "right away" promise a turnaround just as concretely as a figure does.
  [/\b(the moment|as soon as|instantly|right away|immediately)\b[^.]{0,40}\bapprov/i,
   'a promise that approval activates instantly',
   "Your dashboard opens the moment you're approved."],
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
    // ⚠ QUOTED SPEECH IS OUT OF SCOPE, AND THE LINE IS DRAWN STRUCTURALLY RATHER THAN
    // BY EXEMPTING THE ONE SENTENCE THAT TRIPPED IT. `coach.jsx` carries a testimonial
    // reading "paid for itself in the first month" — a claim ATTRIBUTED to a named
    // coach, where these patterns are about what Shape says in its own voice. It is a
    // real honest-data question (that coach is one of the invented marketplace
    // personas, and the preview-cast ruling is already an open owner call), but it is
    // a different question from the one the owner settled here, and answering it by
    // deleting a testimonial would be this PR widening itself.
    const body = stripComments(read(f)).replace(/\bquote:\s*"(?:[^"\\]|\\.)*"/g, 'quote: ""');
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
