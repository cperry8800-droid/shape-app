// tests/coach-up-next.test.mjs
//
// The coach Today page's Up next card. Owner, 2026-10-31, of "New: Morgan Liu · Intake call" (the sample, now "New: Marcus Lee", a client on the sample roster) and its
// "Open their file": "this should take you right to the client file", then "also make this a little
// smaller". A booking with no client id (an intake with someone new, the preview's samples) opened the
// Clients list; it now asks the Clients tab for the booked name, which opens the one roster client of
// that name. And the week strip sits right on the schedule it picks (To do above it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PROS = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', import.meta.url), 'utf8');

// The lookup itself, run from its source.
const fnSrc = (() => {
  const at = PROS.indexOf('function bsProRosterByName(');
  assert.ok(at > 0, 'bsProRosterByName is gone');
  return PROS.slice(at, PROS.indexOf('\n}\n', at) + 2);
})();
const bsProRosterByName = new Function(`${fnSrc}; return bsProRosterByName;`)();

test('a booked name opens the one roster client of that name, never a guess', () => {
  const roster = [{ n: 'Morgan Liu', userId: 'u-m' }, { n: 'Priya Singh', userId: 'u-p1' }, { n: 'Priya Singh', userId: 'u-p2' }, { n: 'Riley Kim' }];
  assert.equal(bsProRosterByName(roster, 'Morgan Liu').userId, 'u-m');
  assert.equal(bsProRosterByName(roster, '  morgan liu ').userId, 'u-m', 'case and spaces do not matter');
  assert.equal(bsProRosterByName(roster, 'Priya Singh'), null, 'two of a name: the list, not the wrong file');
  assert.equal(bsProRosterByName(roster, 'Sam Lee'), null, 'not on the roster');
  assert.equal(bsProRosterByName(roster, ''), null);
  assert.equal(bsProRosterByName(null, 'Morgan Liu'), null);
});

test('Open their file asks for the booking\'s client by id, else by name, through both shells and both rosters', () => {
  assert.match(PROS, /const bookingClientName = \(b\) => String\(\(b && \(b\.client \|\| b\.title\)\) \|\| ''\)\.replace\(\/\^\\s\*new:\\s\*\/i, ''\)\.trim\(\);/, 'the "New: " prefix comes off the name');
  assert.match(PROS, /\[tr\('coach:today\.openFile', \{ defaultValue: 'Open their file' \}\), \(\) => openClientFile\(upB\.clientId, bookingClientName\(upB\)\)\]/);
  const open = PROS.slice(PROS.indexOf('const openClientFile = (clientId, clientName'), PROS.indexOf('const messageClient = (clientId, name)'));
  assert.match(open, /if \(clientId\) \{[^\n]*detail: \{ clientId, providerRole: role \}/);
  assert.match(open, /if \(clientName\) \{[^\n]*detail: \{ clientName, providerRole: role \}/);
  assert.match(open, /onWidgetOpen\('clients'\);/, 'with neither, the Clients list as before');
  // Both shells take a name-only request onto the Clients tab.
  assert.equal(PROS.split("if (!clientId && !clientName) return;").length - 1, 2, 'a shell drops a name-only request');
  assert.equal(PROS.split("setOpenClientReq({ clientId: clientId || null, clientName, nonce: Date.now() }); setTab('clients');").length - 1, 2);
  // Another listing's client is routed by id only.
  assert.match(PROS, /if \(clientId && \(other === 'trainer' \|\| other === 'nutritionist'\) && other !== 'trainer'\)/);
  // Both Clients tabs open by id, else by the one client of that name.
  for (const R of ['COACH_CLIENTS', 'NUTRI_CLIENTS']) {
    assert.ok(PROS.includes(`const hit = openRequest.clientId ? ${R}.find((c) => c.userId === openRequest.clientId) : bsProRosterByName(${R}, openRequest.clientName);`), `${R} opens by name`);
  }
});

test('the Up next card is a little smaller, its buttons still 44 to tap', () => {
  const at = PROS.indexOf('<div data-up-next=""');
  const card = PROS.slice(at, PROS.indexOf('{/* TO DO', at));
  assert.match(card, /padding: '12px 14px'/);
  assert.match(card, /fontFamily: BS_PRO_HEAD, fontSize: 17,/, 'the name at 17');
  assert.doesNotMatch(card, /fontSize: 20/);
  const buttons = card.match(/<button [^\n]*/g) || [];
  assert.ok(buttons.length >= 2);
  for (const b of buttons) assert.match(b, /minHeight: 44/, 'a button under 44');
});

test('the week strip sits right on the schedule it picks; To do comes before it', () => {
  const todo = PROS.indexOf('{/* TO DO — paid sessions to book');
  const week = PROS.indexOf('{/* THIS WEEK — the day strip');
  const sched = PROS.indexOf('{/* SCHEDULE — the selected day');
  assert.ok(todo > 0 && week > todo && sched > week, 'To do, then the week strip, then the schedule');
  const between = PROS.slice(week, sched);
  assert.equal((between.match(/<section /g) || []).length, 0, 'nothing between the strip and the schedule');
});

test('the sample trainer\'s week books clients on the sample trainer\'s roster', () => {
  const week = PROS.slice(PROS.indexOf('  const TRAINER_BOOKINGS = {'), PROS.indexOf('  const NUTRI_SCHEDULE = {'));
  const rosterSrc = PROS.slice(PROS.indexOf('function bsTrainerDemoRoster('), PROS.indexOf('function bsNutriDemoRoster('));
  const roster = new Set([...rosterSrc.matchAll(/n: '([^']+)'/g)].map((m) => m[1]));
  const NOT_PEOPLE = new Set(['Open hours', 'Sofia program', 'Block 3 release', 'Tasha Yeo']);
  const titles = [...week.matchAll(/title: '([^']+)'/g)].map((m) => m[1].replace(/^New: /, '').replace(/ · review$/, ''));
  assert.ok(titles.length > 8);
  for (const n of titles) if (!NOT_PEOPLE.has(n)) assert.ok(roster.has(n), `${n} is booked but not on the sample roster, so Open their file can't open them`);
});
