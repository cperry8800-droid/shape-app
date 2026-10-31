// tests/coach-programs-calm.test.mjs
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

test('one tone for every row\'s length square, an ink outline', () => {
  const sw = fn('function bsProSwatch(');
  assert.match(sw, /const tone = \{ bg: 'transparent', fg: t\.INK, line: t\.INK \};/);
  assert.doesNotMatch(sw, /#07706a|#d8a23a|tones\[/, 'a square takes a colour by turn again');
  assert.doesNotMatch(PROS, /function bsProBand\(/, 'the role band is back');
  const row = fn('function BSProCatRow(');
  assert.match(row, /border: sw\.line \? `1\.5px solid \$\{sw\.line\}` : 0/);
  assert.match(row, /border: `1px solid \$\{t\.RULE\}`, background: 'transparent', cursor: 'pointer', fontFamily: BS_PRO_SANS, fontSize: 13, fontWeight: 700, color: t\.INK/, 'Assign is outlined in the rule, not the role');
});

test('the actions, the search and the filter are ink and hairlines, not fills of the role or tan', () => {
  const create = fn('function bsProCreateButtons(');
  assert.match(create, /data-create="nora"[^\n]*background: t\.INK, color: t\.PAPER,/);
  const search = fn('function bsProLibrarySearch(');
  assert.match(search, /border: `1px solid \$\{t\.RULE\}`, background: 'transparent'/);
  assert.doesNotMatch(search, /PAPER2/);
  const filter = fn('function bsProTypoIndex(');
  assert.match(filter, /border: `1px solid \$\{t\.RULE\}`, background: 'transparent' \}\}>/);
  assert.match(filter, /background: on \? t\.INK : 'transparent', boxShadow: 'none'/, 'the pick in ink, as the Wall\'s chips');
  assert.match(filter, /color: on \? t\.PAPER : t\.INK70/);
});

test('Most popular is an outlined card with its tile in ink; Enrolled faces are the paper\'s tones', () => {
  const feat = fn('function BSProFeaturedPlan(');
  assert.match(feat, /data-featured-plan="" onClick=\{onOpen\} style=\{\{ marginTop: 10, borderRadius: 16, border: `1px solid \$\{t\.RULE\}`, background: 'transparent'/);
  assert.match(feat, /gridRow: '1 \/ span 2', width: 56, height: 56, borderRadius: 12, background: t\.INK, color: t\.PAPER,/);
  const enr = fn('function bsProEnrolledRow(');
  assert.match(enr, /background: t\.PAPER2, color: t\.INK, border: `2px solid \$\{t\.PAPER\}`/);
  assert.doesNotMatch(enr, /background: col\b/, 'a colour per face');
  const lead = fn('function bsProFeatureLead(');
  assert.doesNotMatch(lead, /fontStyle: 'italic'|bsProBand/, 'the sample\'s top workout keeps its rust band or italic word');
});
