// tests/home-workout-preview-day.test.mjs
//
// The workout preview Home opens from Team reads the day it was opened for (Codex P1 on #2599). Team follows
// the day picked in This week (owner, 2026-11-04: "the change in weekly date should adjust activities on home
// page"), so a session picked on another day opens a preview of that day. The preview's date line read
// new Date() and always said "Today", so a Saturday session opened on a Wednesday read "Today · Wed".
// The page is BSWorkoutDetail.jsx's since the owner's B redrew it (2026-11-04); the client opens it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, loadCarved, drive, SRC } from './helpers/broadsheet-mount.mjs';

// The client module first: it publishes the globals the page reads at call time (the corner, the library).
await loadBroadsheet(['BSSession']);
const { BSWorkoutDetail } = await loadCarved('BSWorkoutDetail.jsx');
const CLIENT = readFileSync(SRC, 'utf8');

const WORKOUT = { title: 'Long run', time: '08:00', sub: '45 min', detail: { meta: '45 min · Z2' } };
const dateLine = (d) => d.text.match(/(Today · )?[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} · \d{1,2}:\d{2}/);

test('a session opened for another day reads that day, with no Today', () => {
  const now = new Date();
  const other = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
  const d = drive(BSWorkoutDetail, { workout: WORKOUT, day: other, onBack() {} });
  const line = dateLine(d);
  assert.ok(line, `a date line (got ${d.text.slice(0, 200)})`);
  assert.equal(line[1], undefined, 'no Today on another day');
  assert.match(line[0], new RegExp(`\\b${other.getDate()} · `), 'the day it was opened for');
});

test('today\'s session, and a preview opened with no day, still read Today', () => {
  const now = new Date();
  for (const day of [null, new Date(now.getFullYear(), now.getMonth(), now.getDate())]) {
    const line = dateLine(drive(BSWorkoutDetail, { workout: WORKOUT, day, onBack() {} }));
    assert.ok(line && line[1] === 'Today · ', 'Today');
    assert.match(line[0], new RegExp(`\\b${now.getDate()} · `));
  }
});

test('Home opens Team\'s preview with the picked day, and Your move\'s with today', () => {
  assert.match(CLIENT, /onStart: \(\) => setShowWorkoutPreview\(\{ workout: pw, day: pickDate \}\),/, 'Team hands the picked day');
  assert.match(CLIENT, /<BSWorkoutDetail workout=\{shownWorkout\} day=\{pv \? pv\.day : null\}/, 'the preview gets it');
  // Codex P2 on #2599: Move session from another day's preview opens the calendar on that day, not today.
  assert.match(CLIENT, /onMove=\{\(\) => \{ setShowWorkoutPreview\(false\); goCalendar\?\.\(pv && pv\.day \? pv\.day : undefined\); \}\}/, 'Move session keeps the day');
  assert.match(CLIENT, /\[tr\('home:lead\.workout\.cta', \{ defaultValue: "I'll train today →" \}\), \(\) => setShowWorkoutPreview\(true\)\]/, 'Your move is today\'s');
});
