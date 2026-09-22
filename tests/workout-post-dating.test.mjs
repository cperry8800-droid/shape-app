import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from './helpers/strip-comments.mjs';
import { bsPostActivityStart } from '../mobile-app/src/services/workoutShare.mjs';
import { parse } from '@babel/parser';

// Depth-first walk over a babel AST; `stack` (when given) carries the ancestors
// of the node being visited, so a guard can ask what a write is nested inside.
function walkAst(node, fn, stack) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const c of node) walkAst(c, fn, stack); return; }
  if (typeof node.type !== 'string') return;
  fn(node);
  if (stack) stack.push(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue;
    walkAst(node[k], fn, stack);
  }
  if (stack) stack.pop();
}

// ⚠ WHEN THE WORKOUT HAPPENED AND WHEN THE POST WAS MADE ARE TWO FACTS.
// Every auto-poster used to stamp `community_posts.created_at` at the activity
// START, because the ±20-min cross-source dedup needed both sides in the same
// units. The feed orders by `created_at` desc and caps at 50, and each card
// dates itself by it — so connecting a provider and backfilling a year of
// history produced posts that sorted under 50 newer rows and were never seen,
// on the one screen that exists to show a member their training.
//
// These guards DERIVE their corpus from the routes that call the cross-source
// dedup, so a sixth integration added later is covered with nobody remembering
// this file exists, and they assert they found one — a sweep that silently
// stops matching passes vacuously.

const ROOT = path.resolve(import.meta.dirname, '..');
const API = path.join(ROOT, 'src/app/api/integrations');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const AUTO_POSTERS = walk(API)
  .map((p) => ({ p, src: stripComments(fs.readFileSync(p, 'utf8')) }))
  .filter((f) => f.src.includes('findCrossSourceDuplicate('));

test('the auto-poster corpus is derived and non-empty', () => {
  assert.ok(AUTO_POSTERS.length >= 5, `expected >=5 integration routes that auto-post, found ${AUTO_POSTERS.length} — the sweep below has stopped matching`);
});

test('no auto-poster stamps created_at on a community post', () => {
  for (const { p, src } of AUTO_POSTERS) {
    const rel = path.relative(ROOT, p);
    // `activities.started_at` is a real column and stays; what may not come
    // back is a `created_at:` key in the post payload.
    assert.ok(!/\bcreated_at\s*:/.test(src), `${rel} stamps created_at on a payload again — the feed dates and orders by it, so a backfill would sort under 50 newer rows`);
  }
});

test('every auto-poster stamps the activity start into metrics, normalised', () => {
  for (const { p, src } of AUTO_POSTERS) {
    const rel = path.relative(ROOT, p);
    const m = src.match(/startedAt:\s*activityStartISO\(([^)]+)\)/);
    assert.ok(m, `${rel} does not stamp metrics.startedAt via activityStartISO — the dedup and the card both read it`);
    assert.ok(m[1].trim().length > 0, `${rel} stamps startedAt from nothing`);
  }
});

test('the dedup is handed the ACTIVITY start, never payload.created_at', () => {
  for (const { p, src } of AUTO_POSTERS) {
    const rel = path.relative(ROOT, p);
    const calls = [...src.matchAll(/findCrossSourceDuplicate\(([^)]*\([^)]*\)[^)]*|[^)]*)\)/g)];
    assert.ok(calls.length >= 1, `${rel} lost its findCrossSourceDuplicate call`);
    for (const c of calls) {
      const args = c[1];
      assert.ok(!/created_at/.test(args), `${rel} passes created_at to the dedup — that is now the POST time, so a backfilled workout would be compared against posts made in the last twenty minutes and match nothing`);
      assert.ok(/activityStartISO\(/.test(args), `${rel} does not normalise the start it hands the dedup`);
    }
  }
});

// ── The in-app session poster, same rule ──────────────────────────────────────
const BACKEND = stripComments(fs.readFileSync(path.join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8'));

// ⚠ PARSED, NOT GREPPED, AND THE MUTATION ROUND IS WHY. A first version of
// this asserted on the text `created_at: createdAt` and `mergedMetrics.startedAt
// = _startISO`, and both mutations walked through it: `created_at: activityStart`
// is the same defect under a different name, and `if (false && _startISO)
// mergedMetrics.startedAt = _startISO` leaves the string present and the code
// unreachable. A guard that pins a spelling pins whatever that spelling is
// wrong about.
function createPostFn() {
  const RAW = fs.readFileSync(path.join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const i = RAW.indexOf('async function createCommunityPost(');
  assert.ok(i > 0, 'createCommunityPost is gone');
  // Brace-match from the body's `{`, skipping the parameter list (this one is
  // destructured, so counting from the first `{` returns the signature).
  const open = RAW.indexOf(') {', RAW.indexOf('} = {}', i)) ;
  assert.ok(open > i, 'could not find the body of createCommunityPost');
  let d = 0, end = -1;
  for (let k = open + 2; k < RAW.length; k += 1) {
    if (RAW[k] === '{') d += 1;
    else if (RAW[k] === '}') { d -= 1; if (d === 0) { end = k + 1; break; } }
  }
  assert.ok(end > open, 'could not delimit createCommunityPost');
  const body = RAW.slice(open + 2, end);
  assert.ok(body.length > 3000, `createCommunityPost body read as ${body.length} chars — the matcher is off`);
  return parse(body, { sourceType: 'module', allowReturnOutsideFunction: true });
}

test('the in-app poster builds a payload with NO created_at key', () => {
  const ast = createPostFn();
  let payload = null;
  walkAst(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id?.name === 'payload' && n.init?.type === 'ObjectExpression') payload = n.init;
  });
  assert.ok(payload, 'could not find `const payload = {...}` in createCommunityPost');
  // ⚠ THE WHOLE SUBTREE, NOT `payload.properties`. The original code stamped it
  // as `...(createdAt ? { created_at: createdAt } : {})` — a SpreadElement,
  // which carries no `key`, so reading the top-level property names alone let
  // exactly the likeliest regression back in (the mutation round caught it).
  const keys = [];
  walkAst(payload, (n) => {
    if (n.type !== 'ObjectProperty' && n.type !== 'Property') return;
    const k = n.key && (n.key.name || n.key.value);
    if (k) keys.push(String(k));
  });
  // Vacuity control: a matcher that found some OTHER object would pass the
  // absence check for the wrong reason.
  assert.ok(keys.includes('source_provider') && keys.includes('author_id'), `matched the wrong object: ${keys.join(', ')}`);
  assert.ok(!keys.includes('created_at'), 'createCommunityPost stamps created_at again — that is when the POST was made, and it is what the feed sorts and dates by');
});

test('the in-app poster stamps metrics.startedAt, reachably', () => {
  const ast = createPostFn();
  const gates = [];
  const stack = [];
  walkAst(ast, (n) => {
    if (n.type === 'AssignmentExpression'
      && n.left?.type === 'MemberExpression'
      && n.left.object?.name === 'mergedMetrics'
      && n.left.property?.name === 'startedAt') gates.push(stack.slice());
  }, stack);
  assert.equal(gates.length, 1, `expected exactly one write of mergedMetrics.startedAt, found ${gates.length}`);
  // ⚠ AND IT MUST BE REACHABLE. `if (false && _startISO) …` keeps the source
  // text and retires the feature; a literal operand in any `if` guarding this
  // write is that defect whatever it is spelled.
  for (const n of gates[0]) {
    if (n.type !== 'IfStatement') continue;
    const lits = [];
    walkAst({ type: 'Program', body: [{ type: 'ExpressionStatement', expression: n.test }] }, (x) => {
      if (x.type === 'BooleanLiteral' || x.type === 'NullLiteral' || x.type === 'NumericLiteral') lits.push(x.type);
    });
    assert.equal(lits.length, 0, `the metrics.startedAt write is gated on a literal (${lits.join(', ')}) — present in the source and unreachable`);
  }
});

test('the live session hands its start to the poster as activityStart', () => {
  assert.match(BACKEND, /activityStart:\s*sessionStart/, 'the live session no longer hands its start to the poster');
  assert.ok(!/\bcreatedAt\b/.test(BACKEND), 'a createdAt parameter is back on createCommunityPost — the activity start rides activityStart → metrics.startedAt now');
});

test('both dedup callers run the SHARED pre-filter, so the window cannot drift', () => {
  assert.match(BACKEND, /bsFetchDuplicateCandidates\(/, 'the in-app dedup re-implements its own query again');
  // The old hand-rolled created_at range must not come back beside it.
  assert.ok(!/\.gte\('created_at',\s*new Date\(s\s*-\s*w\)/.test(BACKEND), 'the in-app dedup is back on a raw created_at range');
  const SERVER = stripComments(fs.readFileSync(path.join(ROOT, 'src/lib/workout-share.ts'), 'utf8'));
  assert.match(SERVER, /fetchDuplicateCandidates\(/, 'the server dedup re-implements its own query again');
});

// ── The cards date by the workout ─────────────────────────────────────────────
const CLIENT = stripComments(fs.readFileSync(path.join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8'));

test('the mapper carries the activity time and the cards date by it', () => {
  assert.match(BACKEND, /activity_at:\s*bsPostActivityStart\(row\)/, 'communityPostFromRow no longer carries activity_at');
  // Every site that dates a community post by created_at must prefer the
  // activity time. Scoped to the argument so the declaration (`iso`) and the PR
  // ledger's own `m.postedAt` — a different object entirely — are not swept in.
  const agos = [...CLIENT.matchAll(/bsAgoShort\(([^)]*)\)/g)]
    .map((m) => m[1].trim())
    .filter((a) => /created_at/.test(a));
  assert.ok(agos.length >= 3, `expected >=3 card models dating by a post's created_at, found ${agos.length} — this sweep has stopped matching`);
  for (const a of agos) {
    assert.ok(/activity_at/.test(a), `a card dates itself by \`${a}\` — after the created_at change that is when the post SYNCED, so a backfilled run reads "2h ago" about a workout from March`);
  }
});

// ⚠ THE WEBSITE CARRIES ITS OWN COPY OF THE RULE, BECAUSE IT HAS TO. The
// newdesign pages are classic scripts with no module loader, so they cannot
// import workoutShare.mjs. This drives BOTH implementations over the same
// vectors rather than comparing their text — an equivalent rewrite passes and
// a real divergence fails.
test('the website copy of the activity-date rule matches the shared one', () => {
  const FEED = fs.readFileSync(path.join(ROOT, 'public/newdesign/communityFeed.jsx'), 'utf8');
  const i = FEED.indexOf('const cfActivityAt = (row) => {');
  assert.ok(i > 0, 'communityFeed.jsx no longer declares cfActivityAt');
  const end = FEED.indexOf('\n    };', i);
  assert.ok(end > i, 'could not delimit cfActivityAt');
  const body = FEED.slice(i, end + '\n    };'.length).replace(/^\s*const cfActivityAt = /, '');
  // eslint-disable-next-line no-new-func
  const cfActivityAt = new Function(`return (${body.replace(/;\s*$/, '')})`)();

  const V = [
    { metrics: { startedAt: '2026-03-14T08:00:00.000Z' }, created_at: '2026-09-21T22:00:00Z' },
    { metrics: { provider: 'whoop' }, created_at: '2026-03-14T08:00:00Z' },
    { metrics: { startedAt: 'soon' }, created_at: '2026-03-14T08:00:00Z' },
    { metrics: { startedAt: '   ' }, created_at: '2026-03-14T08:00:00Z' },
    { metrics: { startedAt: 123 }, created_at: '2026-03-14T08:00:00Z' },
    { created_at: '2026-03-14T08:00:00Z' },
    { created_at: 'nope' },
    { metrics: null, created_at: null },
    {},
    null,
  ];
  for (const v of V) {
    assert.equal(cfActivityAt(v), bsPostActivityStart(v), `website rule diverged on ${JSON.stringify(v)}`);
  }
  assert.match(FEED, /time:\s*since\(cfActivityAt\(p\)\)/, 'the website card dates itself by created_at again');
});
