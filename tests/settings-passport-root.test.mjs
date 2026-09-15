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

// ── THE CODEX ROUND ON fcbf5c3 ── four P2s, every one verified against the source
// before it was acted on, and every one a claim the Passport's identity card newly
// makes. Each is replayed here as a guard, because the instrument that would
// otherwise be reached for CANNOT SEE THEM: `BSSettings` is PARTIAL to the i18n
// surface ratchet over exactly ONE string (its `'AB'` initials placeholder), and the
// Nora labels below live in a local `const sections = [...]` object literal — that
// walk's own documented blind shape. The ratchet's columns therefore read the same
// before and after the fix, which is not evidence of anything. These are.

// The `Nora’s voice` entry of the `sections` table, taken whole from its title line
// to the close of its `rows` array. Comment-stripped through the SHARED helper: this
// repo has paid four times for a locally re-derived stripper opening a lazy `/* */`
// span on an `image/*` string.
function noraSection() {
  const clean = stripComments(src);
  const i = clean.indexOf("title: 'Nora’s voice',");
  assert.ok(i > 0, 'the Nora section is gone, or its title literal moved — findSec addresses it by that exact string');
  const j = clean.indexOf('\n    },', i);
  assert.ok(j > i, 'could not find the end of the Nora section');
  return clean.slice(i, j);
}

test('every Nora row is keyed, because this PR is what made them reachable', () => {
  const sec = noraSection();
  // Vacuity first: a matcher that has stopped matching reports a clean sweep for
  // ever, which is the failure this file is least able to notice.
  const rows = [...sec.matchAll(/\{ l: /g)];
  assert.ok(rows.length >= 5, `expected the five Nora rows, found ${rows.length}`);

  // Every label and every right-hand reading goes through the translator. A bare
  // string here is English shipped to twelve locales on a door that did not exist
  // before this change.
  const bareLabel = [...sec.matchAll(/\b([lr]): '([^']+)'/g)].map(m => `${m[1]}: '${m[2]}'`);
  assert.deepEqual(bareLabel, [], 'a Nora row label or reading is a bare English literal again');

  for (const k of ['nora.speakReplies', 'nora.tone', 'nora.voice', 'nora.preview',
                   'nora.previewMeta', 'nora.memory', 'nora.memoryMeta']) {
    assert.ok(sec.includes(`settings:${k}`), `the Nora rows no longer use settings:${k}`);
  }

  // Both segmented rows carry localized segment labels — `renderRows` prints the raw
  // option token unless `segLabels` is supplied, so a keyed LABEL above an English
  // ON/OFF pair is half a fix.
  const segRows = [...sec.matchAll(/segmented: PREF_OPTIONS\.\w+/g)];
  assert.equal(segRows.length, 2, 'the Nora segmented rows changed shape');
  assert.equal([...sec.matchAll(/segLabels: \[/g)].length, 2,
    'a Nora segmented row lost its segLabels and now prints its raw English token');
});

test('the Nora section title stays a literal, because it is an address and not copy', () => {
  // The control for the test above: `findSec('Nora’s voice')` matches on this exact
  // string, so "translate every string in the section" is the WRONG generalisation —
  // it would make the section unfindable and the pane would render nothing at all.
  assert.ok(src.includes("title: 'Nora’s voice',"), 'the Nora section title was translated — findSec can no longer address it');
  assert.ok(src.includes("findSec('Nora’s voice')"), 'nothing addresses the Nora section any more');
  assert.ok(src.includes("tr('settings:section.nora'"), 'the heading a member reads is no longer translated');
});

// The exact source span of a top-level component, by AST rather than by scanning
// for the next `\nfunction ` — this module declares components BOTH ways, so a
// text scan from `function BSSettings` runs 181k characters past its end and every
// count taken over it is a count of half the file. Caught by this guard reporting
// two score readings on a tree that has one.
function componentSrc(name) {
  let span = null;
  for (const n of ast.program.body) {
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) span = [n.start, n.end];
    if (n.type === 'VariableDeclaration') {
      for (const d of n.declarations) {
        if (d.id.type === 'Identifier' && d.id.name === name && d.init) span = [d.init.start, d.init.end];
      }
    }
  }
  assert.ok(span, `there is no top-level ${name}`);
  // ⚠ COMMENT-STRIPPED, OR A COUNT COUNTS ITS OWN RATIONALE. The first run of the
  // score guard below reported TWO `_bsUseLiveScore(` calls on a tree with one: the
  // second "call" was the sentence in the module explaining which call had been
  // retired. Through the SHARED stripper, never a locally re-derived one.
  return stripComments(src.slice(span[0], span[1]));
}

test('Settings takes ONE score reading, and it is the role-aware one', () => {
  // Codex P2: the identity card rendered `settingsScore.tier` from a
  // `_bsUseLiveScore(SHAPE_SCORE_PROFILES.client)` hardcoded to the CLIENT ladder,
  // while the same component already had a role-aware `scoreProfile` — and hands
  // THAT one to BSShapeScorePage. A coach would have read one tier on the card and
  // another on the page it opens.
  assert.ok(!/\bsettingsScore\b/.test(src), 'the second, client-only score reading is back');
  const settings = componentSrc('BSSettings');
  assert.ok(settings.length > 50_000 && settings.length < 200_000,
    `the BSSettings span measured ${settings.length} chars — the extractor is reading the wrong thing`);
  assert.equal([...settings.matchAll(/_bsUseLiveScore\(/g)].length, 1,
    'BSSettings takes more than one score reading again — two readings is the defect');
  assert.ok(/_bsUseLiveScore\(SHAPE_SCORE_PROFILES\[_scoreRoleKey\]/.test(settings),
    'the one reading is no longer role-aware');
  assert.ok(/tier: scoreProfile\.tier/.test(settings), 'the tier line stopped reading the role-aware profile');
  assert.ok(/bsTierColor\(scoreProfile\.tier\)/.test(settings), 'the tier DOT stopped reading the role-aware profile');
});

test('an unread subscription is never reported as an inactive membership', () => {
  // Codex P2: `plan` is null while /api/stripe/subscription is in flight AND for ever
  // after a failed read (the non-ok arm sets nothing, the .catch swallows). Folding
  // null into the inactive case told a paying member "MEMBERSHIP INACTIVE" under
  // their own name on every open.
  const clean = stripComments(src);
  const i = clean.indexOf('const statusLine = isCoachRole');
  assert.ok(i > 0, 'the identity card has no status line');
  // ⚠ THE WHOLE STATEMENT, NOT UP TO THE FIRST `;` AFTER A NAMED ARM. The fix moved
  // `plan.notMember` to the TOP of the chain, so a slice ending there stopped before
  // the arm this test is named for and failed on a correct tree.
  const line = clean.slice(i, clean.indexOf('const sub = ', i));
  assert.ok(line.length > 200 && line.includes('plan.inactive'),
    'the statusLine extractor is no longer reading the whole statement');

  assert.ok(/const planKnown = plan != null;/.test(clean), 'the read/unread distinction is gone');
  // ⚠ NOT `[^:]*` — `tr('settings:plan.inactive'` CONTAINS a colon, so the obvious
  // character class can never reach the thing it is looking for and the guard fails
  // on a correct tree.
  assert.ok(/planKnown \? tr\('settings:plan\.inactive'/.test(line),
    'the inactive claim is no longer gated on the plan having actually been read');
  // Signed-out still settles, and that is a fact about the SESSION rather than about
  // the unread plan — you cannot hold a subscription with no account. Without this
  // the fix would trade a false claim for a lost true one.
  assert.ok(/!signedIn\s*\n?\s*\? tr\('settings:plan\.notMember'/.test(line),
    'a signed-out visitor stopped reading "Not a member", which is true for them');
});

test('the identity card prints a handle only when the member actually has one', () => {
  // Codex P2: with no account username and no saved handle the initializer
  // synthesizes one from the display name — and bsMyName() itself falls back to the
  // email local-part — so the card presented a handle nobody claimed.
  const clean = stripComments(src);
  assert.ok(/const \[handleKnown, setHandleKnown\] = useStateBSC\(!!_myUsername\);/.test(clean),
    'handleKnown is gone, or no longer seeds from the account’s real username');
  assert.ok(/const sub = \[handleKnown \? identity\.handle : ''/.test(clean),
    'the card prints identity.handle unconditionally again');
  assert.ok(/if \('handle' in d\) setHandleKnown\(!!d\.handle\);/.test(clean),
    'a saved client_identity handle no longer marks the handle as the member’s');
  // And the write, or the guard lasts exactly one save: saveEdit persists the whole
  // draft, so a synthesized handle used to land in client_identity and be read back
  // as claimed on the next load.
  assert.ok(/if \(!handleKnown\) delete patch\.handle;/.test(clean),
    'saveEdit persists a synthesized handle again, which launders it into a claimed one');
});
