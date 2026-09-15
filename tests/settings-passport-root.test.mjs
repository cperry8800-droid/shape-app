// The Passport root — the owner's pick, 2026-09-14 ("i like the passport" →
// "go with passport"), built from docs/REVIEW-2026-09-14-settings-page.md.
//
// THE MEASUREMENT IT ANSWERS: on the shipped build the Settings root scrolled
// 2,376 px, the member's own sections began 1,420 px down, and the page was headed
// "More · 12 sections" — one of whose twelve cards was itself called More. Thirteen
// hub cards for a client and ten for a coach become six tiles (seven for a coach)
// plus three Also rows.
//
// ⚠ WHAT THIS FILE IS FOR IS THE ONE THING FEWER DOORS CAN GET WRONG: LOSING A ROW.
// Six doors carry eleven sections, so the panes compose WHOLE sections rather than
// hand-picked subsets, and the assertions below are about reachability — not about
// how any of it looks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as babelParser from '@babel/parser';
import { SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const src = readFileSync(SRC, 'utf8');
const ast = babelParser.parse(src, { sourceType: 'module', plugins: ['jsx'] });

// Every `{detail === '<name>' && …}` block in the module, by name, taking the
// LARGEST span for each so a composed pane is measured whole.
function panes() {
  const out = new Map();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'LogicalExpression' && n.operator === '&&'
        && n.left.type === 'BinaryExpression' && n.left.operator === '==='
        && n.left.left.type === 'Identifier' && n.left.left.name === 'detail'
        && typeof n.left.right.value === 'string') {
      const k = n.left.right.value;
      const prev = out.get(k);
      if (!prev || (n.end - n.start) > (prev[1] - prev[0])) out.set(k, [n.start, n.end]);
    }
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(ast.program);
  return out;
}

// The doors on the root: every `detail: '<name>'` inside the tile and Also lists.
// ⚠ PER ROLE, NOT UNIONED, AND THE MUTATION ROUND IS WHY. `passportTiles` is a role
// ternary and the two arms differ; a union made the coverage test below pass on a
// tree where the CLIENT's Training & nutrition door had lost the Preferences section,
// because the COACH's Preferences tile still reached it. A door only one role has is
// not a door for the other.
function doorsIn(declName, role) {
  const i = src.indexOf(`const ${declName} = `);
  assert.ok(i > 0, `there is no ${declName} — the Passport root has no doors`);
  let body = src.slice(i, src.indexOf('\n  ];', i) + 5);
  if (role) {
    const split = body.split('\n  ] : [');
    assert.equal(split.length, 2, `${declName} is no longer a role ternary`);
    body = role === 'coach' ? split[0] : split[1];
  }
  return [...body.matchAll(/detail: '([a-z]+)'/g)].map(m => m[1]);
}

// Which sections a given set of doors actually renders, following one hop of
// setDetail (Cycle keeps its own hand-rendered pane and is reached from Health).
function sectionsReachableFrom(doors) {
  const p = panes();
  const reach = new Set(doors);
  for (const name of [...reach]) {
    const span = p.get(name);
    if (!span) continue;
    for (const m of src.slice(span[0], span[1]).matchAll(/setDetail\('([a-z]+)'\)/g)) reach.add(m[1]);
  }
  const out = new Set();
  for (const name of reach) {
    const span = p.get(name);
    if (!span) continue;
    for (const m of src.slice(span[0], span[1]).matchAll(/findSec\('([^']+)'\)/g)) out.add(m[1]);
  }
  return out;
}

// The three sections a coach's settings have never carried: a member's own training
// and eating preferences, and the Stripe customer portal for a $5 membership a coach
// does not pay (owner: "Its free to join for coaches").
const COACH_EXCLUDED = ['Nutrition', 'Training', 'Membership & billing'];

// Every section declared in `sections`, by the title findSec looks it up by.
// ⚠ FROM THE AST, NOT A LINE REGEX. Four of the eleven entries are written inline
// — `{ title: 'Training', meta: '', rows: trainingRows }` — so a `^\s*title: '…'$`
// scan sees SEVEN and reports a clean sweep over a corpus missing the sections most
// likely to be lost. Its own vacuity floor is what caught that.
function declaredSections() {
  let arr = null;
  (function walk(n) {
    if (!n || typeof n !== 'object' || arr) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'VariableDeclarator' && n.id.name === 'sections' && n.init && n.init.type === 'ArrayExpression') { arr = n.init; return; }
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(ast.program);
  assert.ok(arr, 'there is no `const sections = [...]` — this file is measuring nothing');
  return arr.elements.filter(Boolean).map((el) => {
    const prop = (el.properties || []).find(pr => pr.key && pr.key.name === 'title');
    return prop && prop.value.type === 'StringLiteral' ? prop.value.value : null;
  }).filter(Boolean);
}

test('every tile and Also row opens a pane that exists', () => {
  const p = panes();
  const doors = [...doorsIn('passportTiles'), ...doorsIn('alsoRows')];
  assert.ok(doors.length >= 9, `only ${doors.length} doors found — the parse stopped matching`);
  for (const d of doors) {
    assert.ok(p.has(d), `the ${d} tile opens a pane that does not exist — a door onto nothing`);
  }
});

test('and every section the app declares is rendered by one of them, FOR EACH ROLE', () => {
  // ⚠ THE ASSERTION THE WHOLE CHANGE RESTS ON. Eleven sections, six doors: the only
  // thing standing between that and a lost row is that each pane composes WHOLE
  // sections through findSec. A section nothing looks up is a screenful of settings
  // no member can reach, and `findSec` returns `{ rows: [] }` for a miss — so the
  // failure is a silently empty pane, never an error.
  const declared = declaredSections();
  assert.ok(declared.length >= 10, `only ${declared.length} sections parsed — the scan stopped matching`);

  const client = sectionsReachableFrom([...doorsIn('passportTiles', 'client'), ...doorsIn('alsoRows')]);
  const lostForClient = declared.filter(s => !client.has(s));
  assert.deepEqual(lostForClient, [], `a member can reach NO pane rendering: ${lostForClient.join(', ')}`);

  const coach = sectionsReachableFrom([...doorsIn('passportTiles', 'coach'), ...doorsIn('alsoRows')]);
  const lostForCoach = declared.filter(s => !COACH_EXCLUDED.includes(s) && !coach.has(s));
  assert.deepEqual(lostForCoach, [], `a coach can reach NO pane rendering: ${lostForCoach.join(', ')}`);
  // And the exclusions are exclusions, not an accident nobody checked.
  for (const s of COACH_EXCLUDED) {
    assert.ok(declared.includes(s), `${s} is not a section any more — this exclusion list is stale`);
  }
});

test('and the Cycle pane, which is hand-rendered, keeps a door of its own', () => {
  // Cycle cannot be composed — it is real toggles with async consent writes, not
  // renderRows — so it keeps its pane and Health & devices carries the door. It had
  // its own root card before the Passport; losing that card without adding this row
  // would have stranded the whole cycle surface.
  const p = panes();
  const health = p.get('health');
  assert.ok(health, 'there is no health pane');
  assert.match(src.slice(health[0], health[1]), /setDetail\('cycle'\)/,
    'nothing routes to the Cycle pane any more — its card is gone and no door replaced it');
});

test('the Online switch is the one others can see, not the member’s own view of the rail', () => {
  // ⚠ TWO SETTINGS, OPPOSITE CLAIMS, AND THE WRONG ONE READS AS THE RIGHT ONE.
  // `onlineRail` is the member's own view of Community's online row — its own
  // description says "Hiding it changes only your view — it never changes whether
  // others can see you online". A switch labelled Online wired to that would tell a
  // member they were hidden while everyone could still see them. `onlineVisible` is
  // the one that means what the label says.
  const i = src.indexOf("tr('settings:quick.online'");
  assert.ok(i > 0, 'there is no Online quick switch');
  const cell = stripComments(src.slice(i - 400, i + 700));
  assert.ok(cell.includes('onlineVisible'), 'the Online switch does not read onlineVisible');
  assert.ok(!cell.includes('onlineRail'),
    'the Online switch is wired to onlineRail — that changes only the member’s own view, so the label would be a lie');
});

test('and every quick switch writes through the module’s one writer', () => {
  // `setPref` carries the mirror write, the live Home/feed re-render and the presence
  // broadcast. A bare state write here is a switch that looks like it worked.
  const i = src.indexOf("tr('settings:passport.quick'");
  assert.ok(i > 0, 'the quick-switch row is gone');
  const row = stripComments(src.slice(i, src.indexOf('</div>', src.indexOf('<QuickSwitch', i) + 2000)));
  assert.equal((row.match(/<QuickSwitch/g) || []).length, 3, 'there are not three quick switches');
  assert.equal((row.match(/setPref\(/g) || []).length, 2, 'the two preference switches must both go through setPref');
  assert.match(row, /setRadioPreference\(/, 'the radio switch must go through the radio provider');
});

test('the plan card and the status line are both role-gated, or they contradict each other', () => {
  // The card offered EVERY role the $5 member plan — captured on the Trainer preview
  // during the 2026-09-14 review, against the owner's standing ruling that coaches
  // join free. Gating one and not the other would put the identity card and the
  // Account pane one tap apart in disagreement.
  assert.match(src, /const planCard = isCoachRole \? null :/,
    'the plan card is not role-gated — a coach is being offered the member plan');
  const i = src.indexOf('const statusLine = isCoachRole');
  assert.ok(i > 0, 'the identity card’s status line is not role-gated');
  const line = src.slice(i, i + 900);
  assert.match(line, /profile:role\.(trainer|nutritionist)/, 'a coach’s status line does not name their role');
  assert.match(line, /settings:plan\.(inactive|notMember)/, 'a member’s status line does not state their membership');
  // And the billing rows the Account pane composes are gated the same way: every one
  // of them opens the Stripe CUSTOMER portal, which manages a member's subscription.
  // A coach joins free, so composing them in unguarded would have ADDED three dead
  // controls to a role that never had a Billing card — a composition meant to lose
  // nothing, quietly gaining something.
  const acct = src.indexOf("{detail === 'account' && (<>");
  assert.ok(acct > 0, 'the account pane is gone');
  const pane = src.slice(acct, acct + 2200);
  const bill = pane.indexOf("findSec('Membership & billing')");
  assert.ok(bill > 0, 'the Account pane no longer composes the billing section');
  assert.match(pane.slice(0, bill).split('\n').slice(-8).join('\n'), /!isCoachRole/,
    'the billing rows are not member-gated — a coach is offered a customer portal with no customer');
});

test('the identity card prints a city only when the member supplied one', () => {
  // `identity.location` seeds to the demo persona's 'Brooklyn, NY' for EVERY account.
  // Until the Passport it rendered only inside the edit form, where a value you can
  // overwrite is not a claim; on the card it is one.
  assert.match(src, /locationKnown \? identity\.location : ''/,
    'the card prints identity.location unconditionally — that is a fabricated home town for every member who never set one');
  // ⚠ THE SECOND CALL SITE, NOT THE FIRST. Two places read `client_identity`;
  // indexOf found the other one, and the assertion failed on source that was right.
  const i = src.indexOf("setIdentity(prev => ({ ...prev, ...d }))");
  assert.ok(i > 0, 'the client_identity hydrate is gone');
  const hydrate = src.slice(i, i + 400);
  assert.match(hydrate, /'location' in d/, 'nothing learns whether the saved identity actually carried a location');
});

test('the tiles are squared and chamfered, on the owner’s note', () => {
  // Owner, 2026-09-14: "give the boxes a more square edgy look". The chamfer is the
  // house polygon thirteen other surfaces already clip with, named once here.
  assert.match(src, /const BS_CHAMFER = 'polygon\(0 0, calc\(100% - 11px\) 0, 100% 11px, 100% 100%, 0 100%\)'/,
    'the house chamfer is not defined');
  for (const c of ['PassportTile', 'QuickSwitch']) {
    const i = src.indexOf(`const ${c} = `);
    assert.ok(i > 0, `${c} is gone`);
    const body = src.slice(i, i + 1600);
    assert.match(body, /clipPath: BS_CHAMFER/, `${c} is not chamfered`);
    assert.match(body, /borderRadius: 3/, `${c} is not squared — the owner asked for edgy, not rounded`);
  }
});

test('a coach gets Preferences, never a Training & nutrition door they never had', () => {
  // The coach card list has never carried the Training or Nutrition sections — those
  // are a member's own training and eating preferences. Composing them into a coach's
  // tile would ADD two sections their settings have never had.
  const i = src.indexOf('const passportTiles = isCoachRole ? [');
  const both = src.slice(i, src.indexOf('\n  ];', i));
  const [coach, client] = both.split('\n  ] : [');
  assert.ok(coach && client, 'passportTiles is no longer a role ternary');
  assert.ok(!coach.includes("detail: 'trainnutri'"), 'a coach is offered Training & nutrition — sections their settings have never had');
  assert.ok(client.includes("detail: 'trainnutri'"), 'a member lost the Training & nutrition door');
  assert.ok(coach.includes("detail: 'practice'"), 'a coach lost Your practice');
  assert.ok(!client.includes("detail: 'practice'"), 'a member is offered a coach’s practice settings');
});
