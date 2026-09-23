import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/TrainerApp.html#clients' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const React = require('react');
const ReactDOM = require('react-dom');
const { createRoot } = require('react-dom/client');
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const DashSignals = require('../public/newdesign/dashSignals.js');
const compile = (file) => babel.transformSync(readFileSync(new URL('../public/newdesign/' + file, import.meta.url), 'utf8'), { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
const Card = ({ children }) => React.createElement('section', null, children);
const { CKCoachNote, ckNoteDraftKey, ckSaveNoteDocument } = new Function('React', 'Card', compile('coachClientDetail.jsx') + '\nreturn { CKCoachNote, ckNoteDraftKey, ckSaveNoteDocument };')(React, Card);
const { useDashboard, _dashRecordFromLive } = new Function('React', 'DashSignals', compile('dashData.jsx') + '\nreturn { useDashboard, _dashRecordFromLive };')(React, DashSignals);
const colours = { unknown: '#999999', green: '#7bbf5a', amber: '#d8a23a', red: '#e0644b', new: '#2ee0c4' };
const { DashClientDrawer, DashRosterTable } = new Function('React', 'ReactDOM', 'DashSignals', 'DASH_SEV_COLORS', 'useRememberedSet', 'DashPill', 'dashClientHref', 'dashMessageClient', 'dashRelDay', compile('dashRoster.jsx') + '\nreturn { DashClientDrawer, DashRosterTable };')(
  React, ReactDOM, DashSignals, colours, () => [[], () => {}], ({ children }) => React.createElement('span', null, children), () => null, () => {}, () => null,
);
globalThis.fetch = async () => ({ ok: false });
const act = React.act;
const host = () => { const el = document.createElement('div'); document.body.appendChild(el); return el; };
async function mount(Component, props) {
  const el = host(), root = createRoot(el);
  await act(async () => { root.render(React.createElement(Component, props)); });
  return { el, root, update: (next) => act(async () => root.render(React.createElement(Component, next))), close: () => act(async () => { root.unmount(); el.remove(); }) };
}
const click = (el) => act(async () => el.click());
const typeNote = async (el, text) => act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(el, text);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const NOW = new Date('2026-09-18T12:00:00Z');
const record = (extra = {}) => ({ profile: { id: 'one', name: 'Client One', isNew: false }, progressRead: { state: 'ready', checkedAt: NOW.toISOString() }, ...extra });
const row = (rec) => DashSignals.getTriageFeed('trainer', [rec], NOW)[0];

test('the live mapper distinguishes a pending overview from a failed read', () => {
  const client = { id: 'one', name: 'Client One' };
  assert.equal(row(_dashRecordFromLive(client, null)).progress.state, 'loading');
  assert.equal(row(_dashRecordFromLive(client, null, {})).progress.state, 'unavailable');
  assert.equal(row(_dashRecordFromLive(client, {}, {})).progress.state, 'insufficient');
});

test('dashboard retry refetches a failed overview and keeps the time of its last successful read', async () => {
  let release, fail = false, overviewCalls = 0, latest;
  window.shapeDb = { getSession: async () => ({}), getUserGoals: async () => ({}) };
  globalThis.fetch = async (url) => {
    if (url.endsWith('/shared-overview')) {
      overviewCalls++;
      if (fail) throw new Error('offline');
      const data = await new Promise((resolve) => { release = resolve; });
      return { ok: true, json: async () => data };
    }
    const data = url.endsWith('/clients') ? { isTrainer: true, clients: [{ id: 'one', name: 'Client One' }] } : { isTrainer: true, kpis: {} };
    return { ok: true, json: async () => data };
  };
  function DashboardProbe() { latest = useDashboard('trainer'); return React.createElement('div', null, latest.triage[0]?.progress.state); }
  const m = await mount(DashboardProbe, {});
  assert.equal(m.el.textContent, 'loading');
  await act(async () => release({ scoreHistory: { weeks: [{ weekOf: new Date().toISOString().slice(0, 10), points: 80 }] } }));
  assert.equal(m.el.textContent, 'ready');
  const checkedAt = latest.triage[0].progress.checkedAt;
  assert.ok(checkedAt);
  fail = true;
  await act(async () => window.dispatchEvent(new CustomEvent('shape:coach-progress-refresh', { detail: { clientId: 'one' } })));
  assert.equal(overviewCalls, 2);
  assert.equal(m.el.textContent, 'unavailable');
  assert.equal(latest.triage[0].severity, 'unknown');
  assert.equal(latest.triage[0].progress.checkedAt, checkedAt);
  await m.close();
  globalThis.fetch = async () => ({ ok: false });
});

test('unavailable, loading and insufficient overviews never become green; recent observed progress can', () => {
  for (const state of ['loading', 'unavailable']) {
    const reading = row(record({ progressRead: { state } }));
    assert.equal(reading.severity, 'unknown');
    assert.equal(reading.progress.state, state);
    assert.deepEqual(reading.flags, []);
  }
  assert.equal(row(record()).progress.state, 'insufficient');
  assert.equal(row(record({ shapeScoreHistory: [{ weekOf: '2026-06-01', points: 80 }] })).severity, 'unknown');
  assert.equal(row(record({ shapeScoreHistory: [{ weekOf: '2026-09-14', points: 80 }] })).severity, 'green');
  const attention = row(record({ streaks: { current: 0, best: 10 }, progressRead: { state: 'unavailable' } }));
  assert.equal(attention.severity, 'amber', 'availability must not erase known attention signals');
});

test('drawer uses a viewport portal, contains focus, closes on Escape and restores its opener', async () => {
  const opener = document.createElement('button'); document.body.appendChild(opener); opener.focus();
  let m;
  m = await mount(DashClientDrawer, { row: row(record()), role: 'trainer', onClose: () => m.root.render(null) });
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog);
  assert.equal(m.el.contains(dialog), false, 'dialog must escape filtered roster-card ancestors');
  assert.ok(dialog.parentElement.parentElement === document.body, 'the dialog is portaled straight into the body');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, 'Client One');
  assert.ok(dialog.contains(document.activeElement));
  assert.equal(opener.inert, true);
  const buttons = [...dialog.querySelectorAll('button:not([disabled]),a[href]')];
  buttons.at(-1).focus();
  await act(async () => document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  assert.ok(document.activeElement === buttons[0], 'Tab off the last control wraps to the first');
  await act(async () => document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  assert.ok(document.activeElement === buttons.at(-1), 'Shift+Tab off the first control wraps to the last');
  await act(async () => document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  assert.ok(!document.querySelector('[role="dialog"]'), 'Escape closes the drawer');
  assert.ok(document.activeElement === opener, 'focus returns to the control that opened the drawer');
  assert.equal(opener.getAttribute('aria-hidden'), null);
  await m.close(); opener.remove();
});

test('open roster drawer follows enriched records and unknown progress is excluded from On track', async () => {
  const initial = row(record({ progressRead: { state: 'loading' } }));
  const props = { triage: [initial], role: 'trainer', filter: 'all', query: '' };
  const m = await mount(DashRosterTable, props);
  await click(m.el.querySelector('[role="button"]'));
  assert.match(document.querySelector('[role="dialog"]').textContent, /Loading progress/);
  const fresh = row(record({ shapeScoreHistory: [{ weekOf: '2026-09-14', points: 80 }], coachNotes: [{ text: 'Updated while open', on: '2026-09-18' }] }));
  await m.update({ ...props, triage: [fresh] });
  assert.match(document.querySelector('[role="dialog"]').textContent, /Updated while open/);
  assert.match(document.querySelector('[role="dialog"]').textContent, /On track/);
  await click(document.querySelector('[aria-label="Close"]'));
  await m.update({ ...props, filter: 'ontrack' });
  assert.ok(!m.el.querySelector('[role="button"]'), 'a record whose progress is unknown must not be listed under On track');
  await m.close();
});

function noteBackend() {
  window.localStorage.clear();
  let uid = 'coach-a', doc = { one: { text: 'Saved baseline', updatedAt: NOW.toISOString() } }, saves = [], saveImpl = async () => ({ ok: true });
  const write = async (next) => { saves.push(next); const result = await saveImpl(); if (result && !result.error) doc = structuredClone(next); return result; };
  window.shapeDb = { getSession: async () => ({}), getUser: async () => ({ id: uid }), getUserGoals: async () => structuredClone(doc), client: { from: (table) => {
    assert.equal(table, 'user_goals');
    return { update: ({ data }) => {
      const filters = {};
      const query = { eq: (key, value) => { filters[key] = value; return query; }, select: async () => {
        if (filters.user_id !== uid) return { error: 'account changed' };
        assert.equal(filters.kind, 'coach_client_notes');
        if (filters.data !== JSON.stringify(doc)) return { data: [] };
        const res = await write(data); return res.error ? res : { data: [{ user_id: uid }] };
      } }; return query;
    }, insert: async () => ({ error: { code: '23505' } }) };
  } } };
  return { saves, user: (next) => { uid = next; }, doc: (next) => { doc = next; }, fail: () => { saveImpl = async () => ({ error: 'offline' }); }, defer: () => { let resolve; saveImpl = () => new Promise((r) => { resolve = r; }); return () => resolve({ ok: true }); } };
}

test('note document writes bind their owner and refuse a concurrent whole-document change', async () => {
  const backend = noteBackend();
  const db = window.shapeDb;
  const base = await db.getUserGoals('coach_client_notes');
  backend.doc({ ...base, two: { text: 'Written on a second device' } });
  assert.deepEqual(await ckSaveNoteDocument(db, 'coach-a', base, { one: { text: 'My draft' } }), { conflict: true });
  assert.equal(backend.saves.length, 0, 'another client note would have been overwritten');
  backend.user('coach-b');
  assert.ok((await ckSaveNoteDocument(db, 'coach-a', {}, { one: { text: 'My draft' } })).error);
  assert.equal(backend.saves.length, 0);
});

test('private drafts survive client switches and remounts without leaking to another account', async () => {
  const backend = noteBackend();
  let m = await mount(CKCoachNote, { clientId: 'one', accent: '#2ee0c4' });
  await typeNote(m.el.querySelector('textarea'), 'Follow up on technique');
  assert.match(m.el.textContent, /not yet saved to your account/);
  assert.equal(JSON.parse(window.localStorage.getItem(ckNoteDraftKey('coach-a', 'one'))).text, 'Follow up on technique');
  await m.update({ clientId: 'two', accent: '#2ee0c4' });
  assert.equal(m.el.querySelector('textarea').value, '');
  await m.update({ clientId: 'one', accent: '#2ee0c4' });
  assert.equal(m.el.querySelector('textarea').value, 'Follow up on technique');
  await m.close();
  backend.user('coach-b');
  m = await mount(CKCoachNote, { clientId: 'one', accent: '#2ee0c4' });
  assert.equal(m.el.querySelector('textarea').value, 'Saved baseline');
  await m.close();
});

test('failed note save keeps the recoverable draft and successful save removes it only after acknowledgement', async () => {
  const backend = noteBackend();
  const m = await mount(CKCoachNote, { clientId: 'one', accent: '#2ee0c4' });
  await typeNote(m.el.querySelector('textarea'), 'New note');
  backend.fail();
  await click(m.el.querySelector('button'));
  assert.match(m.el.textContent, /Couldn't save/);
  assert.ok(window.localStorage.getItem(ckNoteDraftKey('coach-a', 'one')));
  const finish = backend.defer();
  await click(m.el.querySelector('button'));
  assert.match(m.el.textContent, /Saving/);
  assert.ok(window.localStorage.getItem(ckNoteDraftKey('coach-a', 'one')));
  await act(async () => finish());
  assert.match(m.el.textContent, /Saved/);
  assert.equal(window.localStorage.getItem(ckNoteDraftKey('coach-a', 'one')), null);
  await m.close();
});

test('note save refuses an account switch or an unseen newer saved note', async () => {
  const backend = noteBackend();
  const m = await mount(CKCoachNote, { clientId: 'one', accent: '#2ee0c4' });
  await typeNote(m.el.querySelector('textarea'), 'My draft');
  backend.doc({ one: { text: 'Newer saved note' } });
  await click(m.el.querySelector('button'));
  assert.equal(backend.saves.length, 0);
  assert.match(m.el.textContent, /Newer saved note/);
  assert.equal(m.el.querySelector('textarea').value, 'My draft');
  backend.user('coach-b');
  await click([...m.el.querySelectorAll('button')].find((b) => b.textContent.includes('Replace')));
  assert.equal(backend.saves.length, 0);
  assert.match(m.el.textContent, /account changed/);
  await m.close();
});

test('unsaved note navigation requires a choice and leaves its draft intact', async () => {
  noteBackend();
  const m = await mount(CKCoachNote, { clientId: 'one', accent: '#2ee0c4' });
  await typeNote(m.el.querySelector('textarea'), 'Leave draft');
  const link = document.createElement('a'); link.href = '#programs'; m.el.appendChild(link);
  const messages = [];
  window.confirm = (message) => { messages.push(message); return false; };
  const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.match(messages[0], /keep the draft on this device/);
  assert.ok(window.localStorage.getItem(ckNoteDraftKey('coach-a', 'one')));
  await m.close();
});
