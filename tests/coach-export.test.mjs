// CSV export for the coach dashboard (review 2026-09-09, R12).
//
// ⚠ THE RULES HERE ARE ABOUT A FILE READ WITHOUT THE PAGE AROUND IT. On screen an
// empty cell sits under a header with a legend beside it; in a spreadsheet opened
// three weeks later by someone's accountant it is a number or it is nothing, and
// there is no tooltip. So every assertion below is about what a reader of the FILE
// would conclude — and the revenue half is driven against the real `buildTrajectory`
// rather than a fixture, because a fixture that invents a field name tests the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildTrajectory } from '../src/lib/coach-trajectory.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const E = require_('../public/newdesign/dashExport.js');
const ROSTER_SRC = readFileSync(new URL('../src/lib/coach-roster.ts', import.meta.url), 'utf8');
const DATA = readFileSync(new URL('../public/newdesign/dashData.jsx', import.meta.url), 'utf8');
const CHROME = readFileSync(new URL('../public/newdesign/trainerDashboard.jsx', import.meta.url), 'utf8');

const NOW = new Date('2026-09-10T12:00:00Z');
const rows = (csv) => csv.replace(/^﻿/, '').trim().split('\r\n').map((l) => l.split(','));

// ── the file itself ─────────────────────────────────────────────────────────
test('the file opens correctly in a spreadsheet: BOM, CRLF, a header, a trailing newline', () => {
  const csv = E.rosterCsv([], NOW);
  // ⚠ Excel on Windows reads a bare-LF file as ONE LONG LINE, and without a UTF-8 BOM
  // renders "Zoë" as mojibake. Both are what a coach reports as "the export is broken".
  assert.ok(csv.startsWith('﻿'), 'no BOM — non-ASCII names will open as mojibake');
  assert.ok(csv.includes('\r\n'), 'LF line endings');
  assert.ok(csv.endsWith('\r\n'), 'no trailing newline');
  assert.equal(csv.replace(/^﻿/, '').trim(), E.ROSTER_HEADER.join(','));
});

test('a name that a spreadsheet would EXECUTE is neutralised, and still quoted', () => {
  // ⚠ CSV INJECTION IS THE ONE SECURITY BUG AN EXPORT HAS. Excel, Sheets and
  // LibreOffice all evaluate a cell beginning = + - or @ as a formula on open.
  for (const bad of ['=1+1', '+cmd', '-2', '@SUM(A1)', '\tlead']) {
    assert.ok(E.cell(bad).replace(/^"/, '').startsWith("'"), 'not neutralised: ' + bad);
  }
  // a comma, a quote and a newline are quoted per RFC 4180, and doubled inside
  assert.equal(E.cell('Bo, R.'), '"Bo, R."');
  assert.equal(E.cell('He said "hi"'), '"He said ""hi"""');
  assert.equal(E.cell('two\nlines'), '"two\nlines"');
  // both at once: the apostrophe goes INSIDE the quotes, or it quotes the wrong thing
  assert.equal(E.cell('=Bo, R.'), '"\'=Bo, R."');
  // an ordinary name is untouched — a file full of apostrophes would be its own bug
  assert.equal(E.cell('Ada L.'), 'Ada L.');
  assert.equal(E.cell("O'Neill"), "O'Neill");
});

test('unknown is an EMPTY cell and a measured zero is 0.00 — they are never the same', () => {
  // ⚠ THE WHOLE HONEST-DATA DOCTRINE, IN THE ONE PLACE IT CANNOT BE EXPLAINED IN
  // PROSE. `mrrCents: null` means the subscriptions read failed; writing 0.00 there
  // tells a coach their entire roster pays nothing.
  assert.equal(E.money(null), null);
  assert.equal(E.cell(E.money(null)), '');
  assert.equal(E.money(0), '0.00');
  assert.equal(E.money(9900), '99.00');
  assert.equal(E.money(1), '0.01');
  // no currency symbol: a symbol makes the column TEXT in every spreadsheet
  assert.ok(!/[$£€]/.test(E.money(9900)));
});

// ── the roster export ───────────────────────────────────────────────────────
const client = (over) => ({
  profile: { name: 'Ada L.', status: 'ontrack', ...(over.profile || {}) },
  payments: { mrrCents: 9900, feeCents: 1485, origin: 'marketplace',
              joinedAt: '2026-03-01T00:00:00Z', lastSessionAt: '2026-09-08T00:00:00Z', ...(over.payments || {}) },
});

test('a roster row reads the way the table beside it does', () => {
  const [head, r] = rows(E.rosterCsv([client({})], NOW));
  assert.deepEqual(head, E.ROSTER_HEADER);
  assert.deepEqual(r, ['Ada L.', 'On track', '99.00', '14.85', '84.15', 'Marketplace', '2026-03-01', '193', '2026-09-08']);
});

test('an unreadable payments leg leaves MRR, fee, NET and origin blank — not zero', () => {
  const [, r] = rows(E.rosterCsv([client({ payments: { mrrCents: null, feeCents: null, origin: null, joinedAt: null, lastSessionAt: null } })], NOW));
  assert.deepEqual(r, ['Ada L.', 'On track', '', '', '', '', '', '', '']);
});

test('NET is only written when BOTH halves are known', () => {
  // ⚠ TREATING AN ABSENT FEE AS ZERO PUBLISHES GROSS AS NET, in the one column a
  // coach pastes into their books. A pre-migration row has no fee_bps at all.
  const noFee = rows(E.rosterCsv([client({ payments: { mrrCents: 9900, feeCents: null } })], NOW))[1];
  assert.equal(noFee[2], '99.00', 'MRR was dropped along with the fee');
  assert.equal(noFee[3], '', 'an unknown fee was written as a number');
  assert.equal(noFee[4], '', 'net was computed from an unknown fee');
  // a BYO client genuinely pays the coach 0% — that IS measured and is written
  const byo = rows(E.rosterCsv([client({ payments: { mrrCents: 9900, feeCents: 0, origin: 'coach_link' } })], NOW))[1];
  assert.deepEqual(byo.slice(2, 6), ['99.00', '0.00', '99.00', 'Coach link']);
});

test('tenure is null without a join date — "we do not know" is not "joined today"', () => {
  assert.equal(E.tenureDays(null, NOW), null);
  assert.equal(E.tenureDays('not-a-date', NOW), null);
  assert.equal(E.tenureDays('2026-09-10T00:00:00Z', NOW), 0, 'a client who joined today is 0 days, not null');
  assert.equal(E.tenureDays('2026-09-03T12:00:00Z', NOW), 7);
  // a future date does not go negative
  assert.equal(E.tenureDays('2027-01-01T00:00:00Z', NOW), 0);
});

test('an origin this build does not recognise is passed THROUGH, never relabelled', () => {
  // ⚠ A STAMPED ORIGIN IS A FACT ABOUT THE RECORD. Folding an unknown value into
  // "Marketplace" would make the accounting export lie about what happened.
  assert.equal(E.originLabel('marketplace'), 'Marketplace');
  assert.equal(E.originLabel('coach_invite'), 'Coach invite');
  assert.equal(E.originLabel('coach_link'), 'Coach link');
  assert.equal(E.originLabel('partner_2027'), 'partner_2027');
  assert.equal(E.originLabel(null), null);
  assert.equal(E.originLabel('hasOwnProperty'), 'hasOwnProperty', 'a prototype key resolved through Object.prototype');
});

test('the export is the WHOLE roster in page order, and a client is one row', () => {
  const list = [client({ profile: { name: 'A' } }), client({ profile: { name: 'B', status: 'eyes' } }), client({ profile: { name: 'C', status: 'new' } })];
  const r = rows(E.rosterCsv(list, NOW));
  assert.equal(r.length, 4, 'header + 3 rows');
  assert.deepEqual(r.slice(1).map((x) => x[0]), ['A', 'B', 'C']);
  assert.deepEqual(r.slice(1).map((x) => x[1]), ['On track', 'Needs eyes', 'New']);
});

// ── the revenue export, driven against the real series ──────────────────────
const iso = (s) => new Date(s).toISOString();
const TRAJ = () => buildTrajectory({
  now: new Date('2026-09-10T12:00:00Z').getTime(),
  subs: [
    { client_id: 'a', price_cents: 9900, status: 'active', created_at: iso('2026-06-01'), current_period_end: iso('2026-10-01') },
    { client_id: 'b', price_cents: 8200, status: 'active', created_at: iso('2026-08-03'), current_period_end: iso('2026-10-01') },
    { client_id: 'c', price_cents: 5000, status: 'canceled', created_at: iso('2026-06-10'), current_period_end: iso('2026-08-20') },
  ],
  purchases: [{ client_id: 'a', price_cents: 4000, application_fee_cents: 600, created_at: iso('2026-08-12'), status: 'paid' }],
});

test('the revenue export reads the series FIELD NAMES the series actually emits', () => {
  // ⚠ THIS GUARD EXISTS BECAUSE THE FIRST CUT READ `w.mrrCents`, WHICH DOES NOT EXIST.
  // Every MRR cell in the export was silently empty, and the hand-written fixture that
  // "proved" it right had invented the same name. Driving the real builder is the only
  // thing that catches a field rename — a fixture cannot.
  const keys = Object.keys(TRAJ().weeks[0]);
  for (const k of ['weekOf', 'active', 'added', 'ended', 'mrrGrossCents', 'mrrNetCents', 'oneTimeCents', 'oneTimeNetCents']) {
    assert.ok(keys.includes(k), 'the trajectory no longer emits ' + k + ' — the export reads it');
  }
  const r = rows(E.revenueCsv(TRAJ()));
  assert.deepEqual(r[0], E.REVENUE_HEADER);
  for (const line of r.slice(1)) {
    assert.notEqual(line[4], '', 'MRR gross came out empty — the export is reading a field that does not exist');
    assert.notEqual(line[5], '', 'MRR net came out empty');
  }
});

test('TOTAL NET is net plus net — never net plus gross', () => {
  // ⚠ THE FIRST CUT ADDED `mrrNetCents + oneTimeCents`: subscription revenue AFTER the
  // platform fee plus one-time revenue BEFORE it, under a header reading "Total net".
  // A column called net that is partly gross is a number a coach pays tax on.
  const r = rows(E.revenueCsv(TRAJ()));
  const aug = r.find((x) => x[0] === '2026-08');
  assert.ok(aug, 'August is missing from the series');
  assert.equal(aug[6], '40.00', 'one-time gross');
  assert.equal(aug[7], '34.00', 'one-time net — the $6 application fee is not the coach\'s');
  assert.equal(Number(aug[8]).toFixed(2), (Number(aug[5]) + Number(aug[7])).toFixed(2), 'total net is not net + net');
  assert.ok(Number(aug[8]) < Number(aug[5]) + Number(aug[6]), 'total net still includes gross one-time');
});

test('a headcount is the last week of the month; joins and departures SUM', () => {
  // ⚠ SUMMING A HEADCOUNT ACROSS FOUR WEEKS MULTIPLIES THE PRACTICE BY FOUR. Two
  // different kinds of number live in one table and only one of them adds.
  const t = TRAJ();
  const r = rows(E.revenueCsv(t));
  const aug = r.find((x) => x[0] === '2026-08');
  const augWeeks = t.weeks.filter((w) => w.weekOf.slice(0, 7) === '2026-08');
  assert.ok(augWeeks.length >= 4, 'setup: August has fewer than four weeks');
  assert.equal(Number(aug[1]), augWeeks[augWeeks.length - 1].active, 'the headcount is not the last week of the month');
  assert.notEqual(Number(aug[1]), augWeeks.reduce((s, w) => s + w.active, 0), 'the headcount was summed');
  assert.equal(Number(aug[2]), augWeeks.reduce((s, w) => s + w.added, 0), 'joins were not summed');
  assert.equal(Number(aug[3]), augWeeks.reduce((s, w) => s + w.ended, 0), 'departures were not summed');
});

test('no zero months before the practice existed, and interior empties are kept', () => {
  // ⚠ `buildTrajectory` RETURNS A FIXED 104-WEEK WINDOW. Written verbatim, a coach who
  // took their first client in June 2026 gets nearly two years of "0.00" — and in a
  // spreadsheet that is not an absence, it is the claim that they traded and earned
  // nothing. Measured: the raw series starts in 2024.
  const t = TRAJ();
  assert.ok(t.weeks[0].weekOf < '2025-01-01', 'setup: the window no longer starts two years back');
  const r = rows(E.revenueCsv(t));
  assert.equal(r[1][0], '2026-06', 'the export starts before the first subscriber: ' + r[1][0]);
  assert.deepEqual(r.slice(1).map((x) => x[0]), ['2026-06', '2026-07', '2026-08', '2026-09']);
  // a coach with nothing at all gets a header and no claims under it
  const empty = buildTrajectory({ subs: [], purchases: [], now: NOW.getTime() });
  assert.equal(rows(E.revenueCsv(empty)).length, 1, 'an empty practice was written as rows of zeroes');
});

test('a week is assigned to the month its MONDAY falls in, and months come out sorted', () => {
  // Straddling weeks belong to one month or the other; splitting one would invent
  // daily figures the series does not carry.
  const w = (weekOf, over) => ({ weekOf, active: 1, added: 0, ended: 0, mrrGrossCents: 100, mrrNetCents: 85, oneTimeCents: 0, oneTimeNetCents: 0, ...over });
  const r = rows(E.revenueCsv({ weeks: [w('2026-09-07'), w('2026-08-31'), w('2026-07-27')] }));
  assert.deepEqual(r.slice(1).map((x) => x[0]), ['2026-07', '2026-08', '2026-09'], 'out of order, or a straddling week was split');
  // an unparseable weekOf is skipped rather than bucketed under "Invalid Date"
  assert.equal(rows(E.revenueCsv({ weeks: [w('nope'), w('2026-09-07')] })).length, 2);
  assert.equal(rows(E.revenueCsv(null)).length, 1, 'a null trajectory threw or invented rows');
});

test('an unreadable purchases leg leaves the one-time columns EMPTY, never 0.00', () => {
  // ⚠ BOTH ANALYTICS ROUTES BUILD THE TRAJECTORY WITH `purchases: purchasesRes.data ?? []`,
  // so an RLS change, a schema drift or a timeout produces a series of honest-looking
  // zeroes — and writing those into a coach's accounting file is the claim that no
  // one-time revenue existed. The subscription half is real and is still exported; the
  // one-time cells and Total net are the ones that must go blank.
  const t = TRAJ();
  const known = rows(E.revenueCsv(t));
  const unknown = rows(E.revenueCsv({ ...t, oneTimeUnknown: true }));
  const augK = known.find((r) => r[0] === '2026-08');
  const augU = unknown.find((r) => r[0] === '2026-08');
  assert.equal(augK[6], '40.00', 'setup: the known case has no one-time revenue to lose');
  assert.deepEqual(augU.slice(6), ['', '', ''], 'a failed purchases read was exported as 0.00');
  // the subscription half survives — a coach does not lose their MRR because one leg failed
  assert.equal(augU[4], augK[4]);
  assert.equal(augU[5], augK[5]);
  assert.deepEqual(augU.slice(0, 4), augK.slice(0, 4));
  // and every month is blanked, not just the one with a purchase in it
  for (const r of unknown.slice(1)) assert.deepEqual(r.slice(6), ['', '', ''], r[0]);
});

test('the leading trim does not weigh a leg it cannot read', () => {
  // With one-time unknown, a month whose ONLY activity was a purchase is
  // indistinguishable from an empty one — so the trim leans on the known legs.
  const w = (weekOf, over) => ({ weekOf, active: 0, added: 0, ended: 0, mrrGrossCents: 0, mrrNetCents: 0, oneTimeCents: 0, oneTimeNetCents: 0, ...over });
  const weeks = [w('2026-06-01', { oneTimeCents: 5000 }), w('2026-07-06', { active: 2, mrrGrossCents: 1000 })];
  assert.equal(rows(E.revenueCsv({ weeks }))[1][0], '2026-06', 'a purchase-only month was trimmed off the front');
  assert.equal(rows(E.revenueCsv({ weeks, oneTimeUnknown: true }))[1][0], '2026-07',
    'the trim counted a one-time figure it had just been told was unreadable');
});

test('the routes carry the failed purchases read rather than coercing it', () => {
  for (const role of ['trainer', 'nutritionist']) {
    const src = stripComments(readFileSync(new URL('../src/app/api/' + role + '/analytics/route.ts', import.meta.url), 'utf8'));
    assert.match(src, /oneTimeUnknown: !!purchasesRes\.error/, role + ' drops the purchases error into a zero');
    // and the subscriptions error still nulls the whole trajectory — a different rule
    assert.match(src, /subsAllRes\.error\s*\?\s*null/, role);
  }
});

test('an origin is only claimed by a DATED row, and ties resolve the same way twice', () => {
  // ⚠ AN UNDATED ROW NEVER CLAIMS THE ACQUISITION. An earlier cut handed the origin to
  // whichever undated row PostgREST returned first — non-deterministic, and the exact
  // opposite of what its own comment promised.
  const src = stripComments(readFileSync(new URL('../src/lib/coach-roster.ts', import.meta.url), 'utf8'));
  assert.ok(!/else if \(!e\.origin && !e\.originAt\)/.test(src), 'an undated row can claim the origin again');
  assert.match(src, /if \(sub\.created_at\) \{/, 'the origin is assigned outside a dated guard');
  // ties break on the row id, so two rows in the same millisecond resolve identically
  assert.match(src, /String\(sub\.created_at\) \+ '\\u0000' \+ String\(sub\.id \?\? ''\)/);
  assert.match(src, /if \(!e\.originAt \|\| key < e\.originAt\)/);
});

test('the file is named with its date, so a folder of them is readable', () => {
  assert.equal(E.fileName('roster', NOW), 'roster-2026-09-10.csv');
  assert.equal(E.fileName('revenue', NOW), 'revenue-2026-09-10.csv');
});

// ── the wiring ──────────────────────────────────────────────────────────────
test('the roster route carries the fee and the origin, and keeps null distinct from zero', () => {
  const src = stripComments(ROSTER_SRC);
  // ⚠ `select('*')` IS LOAD-BEARING: an explicit `origin, fee_bps` ERRORS the whole
  // query on a pre-migration DB, and by this route's own rule a failed subscriptions
  // read renders "Not shared" on every row.
  assert.match(src, /\.from\('subscriptions'\)\s*\n?\s*\.select\('\*'\)/, 'the roster names columns that may not exist yet');
  assert.match(src, /feeCents: subsUnknown \? null : e\.feeCents/, 'an unreadable read reports a fee of 0');
  assert.match(src, /origin: subsUnknown \? null : e\.origin/);
  // the fee is summed from each row's STORED bps, never re-derived from today's rate
  assert.match(src, /e\.feeCents \+= Math\.round\(\(price \* bps\) \/ 10000\)/);
  assert.ok(!/feeCents.*\|\| 0/.test(src), 'the fee is coerced through || 0 somewhere');
  // and the client record carries them with ?? null, which is the only operator that
  // can tell an unreadable read from a measured zero
  // ⚠ READ AS A BLOCK, NOT A LINE. A sibling guard in dash-roster-columns pinned the
  // single line this leg used to occupy, and wrapping the object over four lines failed
  // a test about something else entirely. The invariant is the operator on each leg.
  const data = stripComments(DATA);
  const at = data.indexOf('payments: {');
  const block = data.slice(at, data.indexOf('}', data.indexOf('origin:', at)) + 1);
  assert.match(block, /feeCents:\s*row\.feeCents\s*\?\?\s*null/,
    'the record coerces the fee — || 0 and ?? null differ on exactly the input that matters');
  assert.match(block, /origin:\s*row\.origin\s*\?\?\s*null/);
  assert.ok(!/feeCents:\s*row\.feeCents\s*\|\|/.test(block));
});

test('the export control is off in the signed-out preview, and says why', () => {
  // ⚠ A CSV LEAVES THE PAGE AND LOSES EVERY LABEL IT HAD. `roster-2026-09-10.csv` full
  // of invented people, opened in a spreadsheet three weeks later, has nothing on it
  // that says so — and CSV has no comment syntax to put it back.
  const src = stripComments(CHROME);
  const fn = src.slice(src.indexOf('function DashExportButton'), src.indexOf('Object.assign(window, { DashShell'));
  assert.match(fn, /const on = !!live;/);
  assert.match(fn, /onClick=\{on \? go : undefined\}/, 'the handler runs regardless of the live flag');
  assert.match(fn, /disabled=\{!on\}/);
  assert.match(fn, /live only/, 'a disabled control with no reason is just a broken button');
  // the object URL is revoked, but not before the download starts
  assert.match(fn, /setTimeout\(\(\) => \{ try \{ URL\.revokeObjectURL\(url\); \}/);
  // a failure is said out loud rather than swallowed into a button that does nothing
  assert.match(fn, /catch \(e\) \{[\s\S]*?setErr\(/);
  for (const [f, key] of [['trainerClientsPage.jsx', 'rosterCsv'], ['nutritionistClientsPage.jsx', 'rosterCsv'], ['dashBusiness.jsx', 'revenueCsv']]) {
    const page = stripComments(readFileSync(new URL('../public/newdesign/' + f, import.meta.url), 'utf8'));
    assert.match(page, new RegExp('window\\.DashExport\\.' + key + '\\('), f + ' does not build a CSV');
    assert.match(page, /live=\{isLive && !!\(extra && extra\.trajectory\)\}|live=\{source === "live"\}/, f + ' exports in the preview');
  }
});

test('every page that renders an export control loads the module it calls', () => {
  const dir = new URL('../public/newdesign/', import.meta.url);
  const { readdirSync } = require_('node:fs');
  const jsx = readdirSync(dir).filter((f) => f.endsWith('.jsx'));
  const users = jsx.filter((f) => /DashExportButton/.test(stripComments(readFileSync(new URL(f, dir), 'utf8')))
    && f !== 'trainerDashboard.jsx');
  assert.ok(users.length >= 3, 'no page module uses the export button — the sweep is looking for the wrong name');
  let checked = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const raw = readFileSync(new URL(f, dir), 'utf8');
    const head = raw.slice(0, raw.toLowerCase().indexOf('</head>') + 7 || 2000);
    if (/location\.replace\(/.test(head)) continue;              // redirect stub, never renders
    if (!users.some((m) => raw.includes(m))) continue;
    checked += 1;
    assert.ok(raw.includes('dashExport.js'), f + ' renders an export control but never loads dashExport.js');
  }
  assert.ok(checked >= 2, 'only ' + checked + ' pages were checked — the sweep scanned nothing');
});
