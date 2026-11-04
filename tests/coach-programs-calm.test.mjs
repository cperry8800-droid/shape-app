// tests/coach-programs-calm.test.mjs
//
// Redrawn in direction A, the Instrument (owner, 2026-11-03): From scratch on the deck, the kinds as tabs,
// Most popular as a plate with one block in the role's heat, and the rows as a numbered ledger. The rule
// below still holds: one ink, the teal for links and text actions, the role's colour in one place.
//
// The coach Programs page in one ink, the teal kept for links (owner, 2026-10-31, of the trainer's
// Programs page: "too many colors here. I dont like the design here"). It had a rust Draft with Nora,
// a tan search field and filter track, a rust week tile on a tan card, the rows' squares in rust, ink,
// teal and amber by turn, rust-outlined Assign, and a colour per face in Enrolled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PROS = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', import.meta.url), 'utf8');
const fn = (head) => { const at = PROS.indexOf(head); assert.ok(at > 0, head); return PROS.slice(at, PROS.indexOf('\n}\n', at)); };

test('a row is a ledger row: led by its number, its actions teal text, no colour of the role', () => {
  // Direction A (owner, 2026-11-03) took the length squares off the rows; the length is in the row's facts.
  const sw = fn('function bsProSwatch(');
  assert.match(sw, /const tone = \{ bg: 'transparent', fg: t\.INK, line: t\.INK \};/);
  assert.doesNotMatch(sw, /#07706a|#d8a23a|tones\[/, 'a square takes a colour by turn again');
  assert.doesNotMatch(PROS, /function bsProBand\(/, 'the role band is back');
  const row = fn('function BSProCatRow(');
  assert.match(row, /<span style=\{bsProLedgerNo\(t\)\}>\{bsProNo\(index\)\}<\/span>/, 'a row is led by its number');
  assert.match(row, /const tealText = t\.isLight \? '#07706a' : '#34d6c5';/);
  assert.doesNotMatch(row, /background: heat|color: heat|border: `[^`]*heat/, 'a row takes the role\'s colour');
  assert.doesNotMatch(row, /bsProSwatch/, 'the coloured square is back on the rows');
});

test('From scratch, the search and the tabs are ink and hairlines, not fills of the role or tan', () => {
  const create = fn('function bsProCreateButton(');
  assert.match(create, /data-create="scratch"[^\n]*border: `1px solid \$\{t\.INK30\}`, background: 'transparent'/);
  // Nora drafts from the masthead's ✦, not a line on the page (owner, 2026-11-04).
  assert.doesNotMatch(PROS, /data-create="nora"|coach:plans\.draftWithNora/, 'Nora\'s draft line is back on Programs or Plans');
  const search = fn('function bsProLibrarySearch(');
  assert.match(search, /border: `1px solid \$\{t\.RULE\}`, background: 'transparent'/);
  assert.doesNotMatch(search, /PAPER2/);
  const filter = fn('function bsProTypoIndex(');
  assert.match(filter, /borderBottom: `1px solid \$\{t\.RULE\}`/, 'the tabs sit on a hairline');
  assert.match(filter, /borderBottom: `2px solid \$\{on \? \(heat \|\| t\.INK\) : 'transparent'\}`/, 'the pick underlined');
  assert.match(filter, /color: on \? t\.INK : t\.INK70/);
  assert.doesNotMatch(filter, /background: on \?/, 'a filled pick');
});

test('Most popular is the plate: one block in the role\'s heat, the rest on the raised paper; Enrolled faces are the paper\'s tones', () => {
  const feat = fn('function BSProFeaturedPlan(');
  assert.match(feat, /data-featured-plan="" onClick=\{onOpen\} style=\{\{ marginTop: 18, display: 'grid', gridTemplateColumns: '72px minmax\(0, 1fr\)', background: t\.PAPER2, clipPath:/);
  assert.equal((feat.match(/background: heat\b/g) || []).length, 1, 'the length block, and nothing else, in the heat');
  const enr = fn('function bsProEnrolledRow(');
  assert.match(enr, /background: t\.PAPER2, color: t\.INK, border: `2px solid \$\{t\.PAPER\}`/);
  assert.doesNotMatch(enr, /background: col\b/, 'a colour per face');
  const lead = fn('function bsProFeatureLead(');
  assert.doesNotMatch(lead, /fontStyle: 'italic'|bsProBand/, 'the sample\'s top workout keeps its rust band or italic word');
});
