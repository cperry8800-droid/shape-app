// Shape Radio is a radio station, not a training accessory.
//
// Owner, 2026-09-16: "I dont want shape radio to be marketed as 'built for
// movement.' I just want it to be a radio station with great music that users have
// accesss to with membership." That is a STANDING ruling about how Radio is sold,
// not a one-off copy edit — so it gets a guard rather than a sweep.
//
// ⚠ A LITERAL GREP CANNOT ENFORCE IT, WHICH IS THE WHOLE REASON THIS RENDERS FIRST.
// index.html carried `<h2>Music built for <em>movement.</em></h2>` — the banned
// phrase verbatim, on the front page — and no literal match can see it, because the
// <em> runs through the middle of the string. Measured on 2026-09-16: rendering
// first found 45 lines where the literal grep found 7.
//
// ⚠ AND A RENDERER IS ONLY HALF OF IT: THE PATTERN LIST IS THE OTHER HALF. The same
// Radio card's subline still read "One channel, tuned to your session." nine lines
// below the headline that had just been rewritten — the identical pitch, missed
// because the phrase was not in the ban list rather than because it was hidden by a
// tag (Codex, on PR #2114). That is the finding this file exists to stop repeating.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from './helpers/strip-comments.mjs';

// Each entry is a shape the retired pitch takes, with the sentence it was written
// for. The name is what a failure prints, so it names the RULE and not the regex.
const BANNED = [
  [/(mixed|built|made)\s+for\s+movement/i, '"mixed / built / made for movement"'],
  [/music\s+built\s+for\b/i, '"music built for …"'],
  // ⚠ ANCHORED ON THE END OF THE CLAUSE, and that is not fussiness. A bare
  // /while you move/ also matches "it stays put while you move between tabs" — a
  // comment about TAB STATE. The retired prompt ended the sentence there ("Want
  // music while you move?"); the false positive continues into "between". My own
  // keep-list below is what caught this, which is the whole reason to carry one.
  [/while\s+you\s+move\s*(?:[?!.,]|$)/i, '"while you move?"'],
  [/tuned\s+to\s+your\s+(session|workout|training)/i, '"tuned to your session"'],
  [/curated\s+by\s+(bpm|tempo)/i, '"curated by BPM"'],
  [/tempo\s+of\s+your\s+(session|workout)/i, '"the tempo of your session"'],
  [/workout\s+mixes/i, '"workout mixes"'],
  [/synced\s+to\s+your\s+program/i, '"synced to your program"'],
  [/match(es|ing)?\s+the\s+tempo\s+of/i, '"matches the tempo of …"'],
];

// ⚠ THE BPM MATCHING ITSELF IS NOT BANNED, AND THE DISTINCTION IS THE READING OF THE
// RULING. The Signal Field's heart-rate match is a SHIPPED FEATURE; the owner asked
// to stop marketing Radio AS movement music, not to delete it. So these patterns
// catch the pitch ("tuned to your session", "curated by BPM") and deliberately not a
// neutral description of the feature. A ruling about a pitch is not a ruling about
// the product it is pitching.

// Retired explorations: real files, but loaded only by the print / exploration
// boards, which is this repo's own measured position (pageShell.jsx). They are
// skipped here AND the skip is asserted below, so it cannot silently go stale.
const RETIRED_EXPLORATIONS = ['directionA.jsx', 'directionB.jsx', 'directionC.jsx'];
const EXPLORATION_BOARDS = [
  'index-explorations.html',
  'index-print.html',
  'Shape Redesign.html',
  'Shape Redesign-print.html',
];

// Render markup to the string a READER sees: a tag, an entity or a JSX spacer
// running through the middle of a phrase must not hide it.
function render(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\{\s*(["'])\s*\1\s*\}/g, ' ') // JSX {" "} / {' '} spacer containers
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ');
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(html|jsx|js|mjs)$/.test(e.name) && !RETIRED_EXPLORATIONS.includes(e.name)) out.push(p);
  }
  return out;
}

function canonicalFiles() {
  const files = walk('public/newdesign');
  // the app's own shipped Radio copy, in every locale — the pitch lived in the
  // catalogs too (radio:prompt.titleAccent, onboarding:tour.radio.body)
  const catRoot = 'mobile-app/src/i18n/catalogs';
  if (fs.existsSync(catRoot)) {
    for (const loc of fs.readdirSync(catRoot)) {
      for (const ns of ['radio', 'onboarding', 'settings', 'pricing']) {
        const p = path.join(catRoot, loc, `${ns}.json`);
        if (fs.existsSync(p)) files.push(p);
      }
    }
  }
  return files;
}

test('Radio is not marketed as movement music anywhere in the canonical live set', () => {
  const files = canonicalFiles();
  // ⚠ VACUITY: a sweep that scanned nothing passes. This is the live website surface
  // plus 13 locales of the app's Radio copy; if it collapses, the zero below is a
  // fact about the walk rather than about the product.
  assert.ok(files.length > 100, `the sweep found only ${files.length} files — it is no longer reading the canonical set`);

  const hits = [];
  for (const f of files) {
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    src.split('\n').forEach((line, i) => {
      const r = render(line);
      for (const [re, name] of BANNED) {
        if (re.test(r)) hits.push(`${f}:${i + 1}  ${name}\n      ${r.trim().slice(0, 120)}`);
      }
    });
  }
  assert.equal(hits.length, 0, `Radio is still being sold as movement music:\n    ${hits.join('\n    ')}`);
});

test('the sweep can actually see the phrases it bans', () => {
  // ⚠ GUARD-THE-GUARD. Every assertion above is a ZERO, and a zero is a fact about
  // the renderer and the pattern list until both are proven able to fire. Each
  // fixture is a line that was REALLY LIVE in this repo, not an invented one.
  const live = [
    ['<h2>Music built for <em>movement.</em></h2>', 'the homepage headline a literal grep could not see'],
    ['<div class="trk">One channel, tuned to your session.</div>', 'the homepage Radio card subline Codex found'],
    ['Want music{" "}<em>while you move?</em>', 'the ask-prompt, split by a JSX spacer container'],
    ['<p>Mixed for&nbsp;movement.</p>', 'an entity through the middle of the phrase'],
    ['"body": "Ad-free workout mixes, curated by BPM"', 'the onboarding tour line'],
    ['Each track&rsquo;s BPM syncs &mdash; matches the tempo of your session', 'the GetApp RADIO step'],
  ];
  for (const [raw, why] of live) {
    const r = render(raw);
    assert.ok(BANNED.some(([re]) => re.test(r)), `the sweep no longer sees ${why}: rendered as ${JSON.stringify(r)}`);
  }

  // ...and does NOT fire on copy that is deliberately kept. The founder's letter
  // says "the music that moves you" and a coach bio talks about movement; neither is
  // Radio marketing, and a guard that swept them up would be pinning a word rather
  // than a pitch.
  const keep = [
    'the music that moves you',
    'It stays put while you move between tabs, but a fresh app load',
    'a coach who has spent fifteen years studying human movement',
    'Radio streams in the background whenever the app is open.',
  ];
  for (const s of keep) {
    const r = render(s);
    assert.ok(!BANNED.some(([re]) => re.test(r)), `the sweep fires on copy that is deliberately kept: ${JSON.stringify(s)}`);
  }
});

test('the retired explorations the sweep skips are still only loaded by the exploration boards', () => {
  // ⚠ THE SKIP IS ASSERTED, NOT TAKEN ON TRUST. directionA/B/C.jsx still carry the
  // retired pitch and are deliberately out of scope — but only because nothing a
  // visitor reaches loads them. Wire one into a live page and this fails, which is
  // the moment the exclusion stops being true rather than the moment someone notices.
  const loaders = [];
  for (const f of walk('public/newdesign')) {
    if (!f.endsWith('.html')) continue;
    const base = path.basename(f);
    const src = fs.readFileSync(f, 'utf8');
    if (RETIRED_EXPLORATIONS.some((d) => src.includes(d)) && !EXPLORATION_BOARDS.includes(base)) loaders.push(f);
  }
  assert.deepEqual(loaders, [], `a retired exploration is loaded by a live page, so its copy is reachable: ${loaders.join(', ')}`);

  // ⚠ VACUITY: if the exploration files were renamed or deleted, the check above
  // passes for the wrong reason — nothing references a file that is not there.
  for (const d of RETIRED_EXPLORATIONS) {
    assert.ok(fs.existsSync(path.join('public/newdesign', d)), `${d} is gone — drop it from RETIRED_EXPLORATIONS rather than leaving a skip for a file that does not exist`);
  }
});
