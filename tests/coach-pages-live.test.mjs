// What the coach pages' redesign must keep (Codex on #2458):
// - Today moves with the clock. Up next, the ticker's countdown, the NOW line and the signed-out
//   demo's done rows read the time at render, so the page re-renders on each minute while it stays
//   open, and clears its timers when it goes.
// - The calendar read follows the week the strip shows, so a new week at Sunday midnight reloads it.
// - To do holds five rows: paid sessions share the budget, and the rest open in place.
// - The Programs page's one search covers every list on it, the signed-in workout clips included.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PROS = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', import.meta.url), 'utf8');
const body = (name, next) => {
  const start = PROS.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const end = PROS.indexOf(`function ${next}(`, start);
  assert.ok(end > start, `${next} not found after ${name}`);
  return PROS.slice(start, end);
};

test('Today re-renders on each minute and clears its timers on unmount', () => {
  const today = body('BSProToday', 'BSTrainerToday');
  const effect = today.match(/useEffectBSP\(\(\) => \{\s*let every = null;[\s\S]*?\}, \[\]\);/);
  assert.ok(effect, 'no minute-tick effect in BSProToday');
  assert.match(effect[0], /setMinuteTick\(\(n\) => n \+ 1\)/);
  assert.match(effect[0], /setInterval\(\(\) => setMinuteTick\(\(n\) => n \+ 1\), 60000\)/);
  assert.match(effect[0], /60000 - \(Date\.now\(\) % 60000\)/, 'the first tick lands on the next minute');
  assert.match(effect[0], /clearTimeout\(first\)/);
  assert.match(effect[0], /clearInterval\(every\)/);
});

test('the library search filters the signed-in workout clips, with the same miss line as the rows', () => {
  const programs = body('BSTrainerPrograms', 'BSNutritionistApp');
  const block = programs.slice(programs.indexOf('const clips = coachWorkoutVideos(serverPlans);'));
  assert.match(block, /const shownClips = clips\.filter\(\(c\) => libMatch\(c\.name\)\);/);
  assert.match(block, /\{!shownClips\.length && libSearchMiss\}/);
  assert.match(block, /\{shownClips\.map\(/);
  assert.doesNotMatch(block.slice(0, block.indexOf('</div>\n          );')), /\{clips\.map\(/, 'the unfiltered clips still render');
});

test('the calendar read is keyed to the week the strip shows', () => {
  const today = body('BSProToday', 'BSTrainerToday');
  assert.match(today, /const calendarWeek = _ds\(bsProWeek\(\)\.dates\[0\]\);/);
  assert.match(today, /\}, \[isNutri, calendarReload, calendarOwner, calendarWeek\]\);/);
});

test('To do: paid sessions share the five-row budget and the rest open in place', () => {
  const today = body('BSProToday', 'BSTrainerToday');
  assert.match(today, /const paidShown = showAllPaid \? toScheduleList : toScheduleList\.slice\(0, TODO_MAX\);/);
  assert.match(today, /const todoShown = triageRows\.slice\(0, Math\.max\(0, TODO_MAX - paidShown\.length\)\);/);
  assert.match(today, /\{toSchedule !== false && paidShown\.map\(\(p\) => \(/);
  assert.match(today, /\{paidMore > 0 && <button type="button" onClick=\{\(\) => setShowAllPaid\(true\)\}/);
  assert.doesNotMatch(today, /toSchedule\.map\(/, 'every paid row still renders');
});
