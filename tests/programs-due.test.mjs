// "Programs due", said as what Shape does (owner decision A, 2026-11-05): "10 clients need next week's
// program · 8 have checked in · 2 waiting on a check-in", each name opening the builder. No draft step:
// a program publishes on assign.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);
const PD = require('../public/newdesign/programsDue.js');
const S = require('../public/newdesign/dashSignals.js');

const rec = (id, name, onPlan = true) => ({ profile: { id, name }, payments: { onPlan } });
const q = (id, state) => ({ client: { profile: { id } }, state });

test('next week is the Monday to Sunday after this one', () => {
  assert.deepEqual(PD.nextWeekOf('2026-11-05'), { start: '2026-11-09', end: '2026-11-15' });
  assert.deepEqual(PD.nextWeekOf('2026-11-08'), { start: '2026-11-09', end: '2026-11-15' }, 'a Sunday is still this week');
  assert.deepEqual(PD.nextWeekOf('2026-11-09'), { start: '2026-11-16', end: '2026-11-22' });
});

test('who needs next week\'s program: on a plan, nothing published next week; split by their check-in', () => {
  const clients = [rec('a', 'Ana'), rec('b', 'Ben'), rec('c', 'Cal'), rec('d', 'Dee'), rec('e', 'Eve', false), rec('demo-1', 'Demo'), rec('f', 'Fay')];
  const queue = [q('a', 'ready'), q('b', 'blocked'), q('c', 'ready'), q('d', 'ready')];
  const plans = [{ clientId: 'd', date: '2026-11-10' }];
  const due = PD.programsDue({ clients, queue, plans, readable: true });
  assert.deepEqual(due.need.map((x) => [x.name, x.state]), [['Ana', 'checked'], ['Cal', 'checked'], ['Ben', 'waiting'], ['Fay', 'unknown']]);
  assert.deepEqual([due.checked, due.waiting, due.unknown], [2, 1, 1]);
  assert.equal(PD.dueLine(due), "4 clients need next week's program · 2 have checked in · 1 waiting on a check-in · 1 check-in not read");
  // Everyone covered.
  assert.equal(PD.dueLine(PD.programsDue({ clients: [rec('d', 'Dee')], queue, plans, readable: true })), "Everyone on a plan has next week's program.");
  assert.equal(PD.dueLine(PD.programsDue({ clients: [rec('a', 'Ana')], queue, plans: [], readable: true })), "1 client needs next week's program · 1 has checked in");
  // A calendar read that was cut short claims nothing.
  assert.equal(PD.programsDue({ clients, queue, plans, readable: false }), null);
  assert.equal(PD.dueLine(null), null);
});

test('the Programs page shows the line, names open the builder for that client, and nothing offers to "send"', () => {
  const line = read('public/newdesign/programsDueLine.jsx');
  assert.match(line, /new URLSearchParams\(\{ from: week\.start, to: week\.end, clientPlans: "1", role: "trainer" \}\)/);
  assert.match(line, /dashLinkedTab\("programs", role, \{ client: id \}\)/);
  assert.match(line, /A program is live on the client's calendar as soon as you assign it\./);
  assert.doesNotMatch(line, /\bSend\b/);
  assert.match(read('public/newdesign/dashBuilder.jsx'), /\{typeof window\.ProgramsDueLine==='function'&&<window\.ProgramsDueLine role="trainer" clients=\{clients\} queue=\{queue\} live=\{isLive\}\/>\}/);
  const html = read('public/newdesign/TrainerApp.html');
  assert.ok(html.indexOf('src="programsDue.js"') > 0 && html.indexOf('src="programsDue.js"') < html.indexOf('src="programsDueLine.jsx"'));
  // The Today tile counts the queue, so it says that, and not "due".
  assert.equal(S.dashKpiLabel('due', 'trainer'), 'To program');
  assert.match(read('public/newdesign/dashSignals.js'), /sub: ready \+ " checked in" \+ \(waiting \? " · " \+ waiting \+ " waiting on a check-in" : ""\)/);
  assert.match(read('public/newdesign/dashToday.jsx'), /checked in, ready to program/);
});
