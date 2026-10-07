// #2227 registered it: a program Nora drafts for a named client opens in the app's
// builder through "Open in builder", but Assign then made the coach find that client
// again. The client now rides from the card to the Assign picker. Four links, each
// pinned where it lives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROS = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8');
const APP = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');

test('1 · the card sends the client with the plan', () => {
  assert.ok(APP.includes("new CustomEvent('shape:openCoachPlan', { detail: { planId: open.planId, clientId: open.clientId || null } })"));
});

test('2 · the trainer shell keeps it on the open request', () => {
  assert.ok(PROS.includes("const clientId = typeof e.detail.clientId === 'string' && e.detail.clientId ? e.detail.clientId : null;"));
  assert.ok(PROS.includes('setOpenPlanRequest({ planId, clientId, nonce: Date.now() });'));
});

test('3 · Programs remembers it for that plan, and hands it only to that plan\'s Assign', () => {
  const progs = PROS.slice(PROS.indexOf('function BSTrainerPrograms('));
  assert.ok(progs.includes('if (req.clientId) setAssignPrefer({ planId: row.id, clientId: req.clientId }); setEditingPlan(row);'));
  assert.ok(progs.includes('preferClientUid={assignPrefer && assignPlan.id && assignPrefer.planId === assignPlan.id ? assignPrefer.clientId : null}'),
    'another program\'s Assign starts with nobody picked');
});

test('4 · Assign picks the client only from the coach\'s own roster, once, and never over a choice', () => {
  const page = PROS.slice(PROS.indexOf('function BSProAssignPage('));
  assert.match(page, /^function BSProAssignPage\(\{[^}]*preferClientUid = null[^}]*\}\)/);
  const effect = page.slice(page.indexOf('if (!preferClientUid || picked'), page.indexOf('}, [clientList, preferClientUid]);'));
  // run the effect body against small inputs
  const run = (prefer, picked, list) => {
    let set = null;
    new Function('preferClientUid', 'picked', 'clientList', 'setPicked', effect)(prefer, picked, list, (v) => { set = v; });
    return set;
  };
  const roster = [{ userId: 'a', name: 'Ann' }, { userId: 'b', name: 'Bo' }];
  assert.deepEqual(run('b', null, roster), { userId: 'b', name: 'Bo' });
  assert.equal(run('zz', null, roster), null, 'a client not on the roster is not picked');
  assert.equal(run('b', { userId: 'a' }, roster), null, 'a coach\'s own pick stands');
  assert.equal(run('b', null, null), null, 'nothing before the roster loads');
  assert.equal(run(null, null, roster), null);
});
