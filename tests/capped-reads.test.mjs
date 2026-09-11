// Every capped read in the API must keep the NEWEST rows — repo-wide, derived.
//
// ⚠ THE DEFECT THIS CLOSES WAS LIVE IN EIGHT PLACES AT ONCE, and it is invisible until a
// real account outgrows the cap. `.order(col, { ascending: true }).limit(N)` keeps the
// OLDEST N rows, so past N:
//
//   · the coach dashboard's "sessions this week" and "upcoming" both read 0 FOREVER, the
//     calendar showed rows from years ago, and the client pulse listed people who left;
//   · a member's booked sessions came back with `upcoming` empty however many they had;
//   · their goal trend never showed this year (a daily logger passes 104 rows in three
//     months);
//   · the manage screen could not reach a single session still needing action;
//   · a long coach thread opened on messages from a year ago;
//   · and the calendar dropped every UNDATED workout — the "Home shows my plan but the
//     calendar is empty" defect that file's own comment says was already fixed once.
//
// ⚠ AND ASCENDING IS NOT ALWAYS WRONG, which is why this is not a blanket rule. Five reads
// are correct as they stand: a window already bounded to the future (radio rooms, the
// trainer adjust plan), a deterministic "the account's primary provider row" (lead boosts,
// Stripe Connect), and an incremental message poll, where the OLDEST rows after `since`
// are the ones that close the gap. Each says so at the site with a `capped-read-ok:`
// marker, so the exemption is a decision somebody wrote down rather than a silent pass.
//
// The corpus is DERIVED from the route files, so a query added later is covered with
// nobody remembering this test exists. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = fileURLToPath(new URL('../src/app/api/', import.meta.url));

function routeFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

// `.order('col', { ascending: X, … })` … `.limit(N)` — same line or across lines, with
// comment lines allowed between, and X may be a computed expression rather than a literal.
const PAIR = new RegExp(
  "\\.order\\(\\s*'([a-z_]+)'\\s*,\\s*\\{[^{}]*ascending:\\s*([A-Za-z_$][\\w$]*)[^{}]*\\}\\s*\\)" +
  "(?:\\s|//[^\\n]*\\n)*" +
  "\\.limit\\(\\s*([A-Za-z_$][\\w$]*|\\d+)\\s*\\)",
  'g'
);

function capped() {
  const rows = [];
  for (const file of routeFiles(API)) {
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    for (const m of src.matchAll(PAIR)) {
      const line = src.slice(0, m.index).split('\n').length;
      // the marker sits with the query, in the comment block above it
      const back = lines.slice(Math.max(0, line - 17), line).join('\n');
      rows.push({
        where: path.relative(API, file) + ':' + line,
        col: m[1], asc: m[2], cap: m[3],
        exempt: back.includes('capped-read-ok:'),
      });
    }
  }
  return rows;
}

test('the sweep found a corpus — a scan of nothing cannot pass', () => {
  const rows = capped();
  assert.ok(rows.length >= 40, 'expected the API\'s capped reads, found ' + rows.length);
  // and it can actually see the two spellings that exist
  assert.ok(rows.some((r) => /^\d+$/.test(r.cap)), 'no literal cap found — the pattern stopped matching');
  assert.ok(rows.some((r) => !/^\d+$/.test(r.cap)), 'no NAMED cap found — the pattern only accepts digits again');
});

test('every capped read keeps the NEWEST rows, or says at the site why it must not', () => {
  const offenders = capped().filter((r) => r.asc !== 'false' && !r.exempt);
  assert.deepEqual(
    offenders.map((r) => r.where + " order('" + r.col + "', ascending: " + r.asc + ").limit(" + r.cap + ")"),
    [],
    'these keep the OLDEST rows: flip the order, or add a `capped-read-ok:` note saying why ascending is right'
  );
});

test('the exemptions are the five that were checked, and each is deliberate', () => {
  // ⚠ NOT AN ALLOWLIST THE GUARD ENFORCES — it enforces the marker. This asserts the
  // marker has not been sprinkled around to quiet the sweep: a sixth one is a decision
  // somebody has to make, and making it means coming here.
  const marked = capped().filter((r) => r.exempt).map((r) => r.where.replace(/:\d+$/, ''));
  assert.deepEqual([...new Set(marked)].sort(), [
    'conversations/[id]/messages/route.ts',
    'lead-boosts/route.ts',
    'radio/rooms/route.ts',
    'stripe/connect-account/route.ts',
    'trainer/adjust/route.ts',
  ]);
});

test('the reads that were flipped re-sort for their consumers rather than returning reversed', () => {
  // A consumer that reads ascending and is handed a reversed array is a different bug in
  // the same place — the coach calendar is returned UNSORTED unless the shared-coach
  // branch runs, so leaving it reversed would simply have shown it backwards.
  const reads = (f) => readFileSync(path.join(API, f), 'utf8');
  for (const f of ['trainer/dashboard/route.ts', 'nutritionist/dashboard/route.ts']) {
    assert.match(reads(f), /const rows = \(\(sessions \?\? \[\]\) as SessionRow\[\]\)\s*\n\s*\.slice\(\)\s*\n\s*\.sort\(/, f);
  }
  const client = reads('client/dashboard/route.ts');
  assert.match(client, /const bookedRows = \(bookedAll \?\? \[\]\)\s*\n\s*\.slice\(\)\s*\n\s*\.sort\(/);
  assert.match(client, /weighIns: \(weighRows \?\? \[\]\)\.slice\(\)\.reverse\(\)/);
  assert.match(reads('sessions/manage/route.ts'), /const rows = \(\(data \?\? \[\]\) as SessionRow\[\]\)\s*\n\s*\.slice\(\)\s*\n\s*\.sort\(/);
  assert.match(reads('calendar/route.ts'), /const planRows = \(\(cwRows \?\? \[\]\) as CwRow\[\]\)\.slice\(\)\.sort\(/);
  // the message route reverses ONLY the cold load — an incremental poll is already ascending
  assert.match(reads('conversations/[id]/messages/route.ts'), /const messages = incremental \? \(data \?\? \[\]\) : \(data \?\? \[\]\)\.slice\(\)\.reverse\(\);/);
});

test('a capped count is reported as capped, not shipped as a total', () => {
  for (const f of ['trainer/dashboard/route.ts', 'nutritionist/dashboard/route.ts']) {
    const src = readFileSync(path.join(API, f), 'utf8');
    assert.match(src, /totalCapped = rows\.length >= SESSION_CAP;/, f);
    assert.match(src, /kpis: \{[^}]*totalCapped[^}]*\}/, f + ': the flag is computed and never sent');
  }
});

test('the calendar keeps its UNDATED workouts when the cap bites', () => {
  // nullsFirst: false on a descending read would drop exactly the rows the slotting below
  // exists for — the undated ones Home shows on the current week.
  const src = readFileSync(path.join(API, 'calendar/route.ts'), 'utf8');
  assert.match(src, /\.order\('scheduled_date', \{ ascending: false, nullsFirst: true \}\)/);
});

// ── the re-sorts are EXECUTED, not described ────────────────────────────────
// A guard that only pins the spelling of a comparator says nothing about what it does to
// a reversed array — and the calendar's is the one with real null handling in it.
function liftSort(file, anchor) {
  const src = readFileSync(path.join(API, file), 'utf8');
  const at = src.indexOf(anchor);
  assert.ok(at > 0, anchor + ' moved in ' + file);
  const open = src.indexOf('.sort(', at);
  assert.ok(open > at, 'no .sort( after ' + anchor);
  let depth = 0, end = -1;
  for (let i = src.indexOf('(', open + 5); i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > 0, 'unbalanced .sort( in ' + file);
  const body = src.slice(src.indexOf('(', open + 5) + 1, end);
  assert.ok(body.length > 20, 'lifted a stub: ' + body);
  // strip the TS annotations the comparators carry, so the body runs as plain JS
  return new Function('return (' + body.replace(/:\s*CwRow/g, '') + ');')();
}

test('the session re-sorts turn a newest-first read back into ascending', () => {
  const cmp = liftSort('client/dashboard/route.ts', 'const bookedRows =');
  const desc = ['2026-03-01', '2026-02-01', '2026-01-01'].map((d) => ({ scheduled_at: d + 'T10:00:00Z' }));
  assert.deepEqual(desc.slice().sort(cmp).map((r) => r.scheduled_at.slice(0, 10)),
    ['2026-01-01', '2026-02-01', '2026-03-01']);
  // an unparseable stamp must not throw or reorder the readable ones around it
  const messy = [{ scheduled_at: '2026-03-01T10:00:00Z' }, { scheduled_at: 'nonsense' }, { scheduled_at: '2026-01-01T10:00:00Z' }];
  assert.doesNotThrow(() => messy.slice().sort(cmp));
});

test('the calendar re-sort keeps dated rows ascending and UNDATED ones last, in read order', () => {
  const cmp = liftSort('calendar/route.ts', 'const planRows =');
  const rows = [
    { id: 'u1', scheduled_date: null },
    { id: 'd2', scheduled_date: '2026-03-01' },
    { id: 'u2', scheduled_date: null },
    { id: 'd1', scheduled_date: '2026-01-01' },
  ];
  assert.deepEqual(rows.slice().sort(cmp).map((r) => r.id), ['d1', 'd2', 'u1', 'u2']);
});
