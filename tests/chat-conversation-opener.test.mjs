import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the real global opener with its state setters: the conversation it
// selects is the ID used by the widget's existing read and send paths.
const source = readFileSync('public/newdesign/chatWidget.jsx', 'utf8');
const start = source.indexOf('    window.__openChat = (arg, tabId) => {');
const end = source.indexOf('    // A deep link could land before this widget mounted', start);
assert.ok(start > 0 && end > start, 'the global opener must remain in this harness');
function opener({ tabs = [{id:'friends'},{id:'team'}], tabIdx = 0, docked = false, threads: given = null } = {}) {
  const threads = given || [
    [{who:'Alex',conversationId:'another-client'}, {who:'Alex',conversationId:'member-dm'}],
    [{who:'Alex',conversationId:'coach-thread'}],
  ];
  const state = {open:false, tab:tabIdx, active:threads.map(() => 0), drafts:threads.map((_, i) => i === 0 ? 'Existing draft' : ''), threads, nora:null};
  const context = {window:{}, tabs, threadsByTab:threads, tabIdx, dirtyRef:{current:false},
    docked, isNoraTab: (t) => !!(t && t.support), setNoraMode: v => state.nora=v,
    setOpen: v => state.open=v, setTabIdx: v => state.tab=v,
    setActiveByTab: fn => state.active=fn(state.active),
    setDraftByTab: fn => state.drafts=fn(state.drafts),
    setThreadsByTab: fn => state.threads=fn(state.threads)};
  vm.runInNewContext(source.slice(start,end),context);
  return {state, open: context.window.__openChat, selected: () => state.threads[state.tab][state.active[state.tab]]};
}

test('explicit conversation IDs win over same-name clients, member DMs and suggested tabs', () => {
  const h=opener(); h.open({who:'Alex',conversationId:'coach-thread',tab:'friends',draft:'Workout feedback'});
  assert.equal(h.selected().conversationId,'coach-thread');
  assert.equal(h.state.drafts[0],'Existing draft');
  assert.equal(h.state.drafts[1],'Workout feedback');
  assert.equal(h.state.threads.flat().length,3);
});

test('an absent exact conversation creates that thread instead of selecting a name match', () => {
  const h=opener(); h.open({who:'Alex',conversationId:'new-coach-thread',tab:'team'});
  assert.equal(h.selected().conversationId,'new-coach-thread');
  assert.equal(h.state.threads.flat().length,4);
});

test('an ID-only deep link opens the exact conversation and legacy name links still work', () => {
  const h=opener(); h.open({conversationId:'coach-thread'});
  assert.equal(h.selected().conversationId,'coach-thread');
  const legacy=opener(); legacy.open('Alex','friends');
  assert.equal(legacy.selected().conversationId,'another-client');
});

test('a coach opened from their profile is found by their listing, never by a shared name (Codex on #2370)', () => {
  // Two threads already called "Alex": a member DM and the coach thread of another trainer.
  const threads = [
    [{who:'Alex Kim',conversationId:'member-dm'}],
    [{who:'Alex Rivera',conversationId:'other-coach',providerRole:'trainer',providerId:9}, {who:'Alex Stone',conversationId:'this-coach',providerRole:'trainer',providerId:7}],
  ];
  // The listing's own thread: selected by role and id.
  const found = opener({threads}); found.open({who:'Alex',providerRole:'trainer',providerId:7,role:'Trainer'});
  assert.equal(found.selected().conversationId,'this-coach');
  // A listing with no thread yet: a new one, carrying the listing, never another "Alex".
  const fresh = opener({threads}); fresh.open({who:'Alex',providerRole:'nutritionist',providerId:7,role:'Nutritionist'});
  assert.equal(fresh.selected().conversationId,null);
  assert.deepEqual([fresh.selected().providerRole, fresh.selected().providerId], ['nutritionist', 7]);
  assert.equal(fresh.state.threads.flat().length,4);
  // A tab hint does not narrow a listing search to a tab without it.
  const hinted = opener({threads}); hinted.open({who:'Alex',providerRole:'trainer',providerId:7,tab:'friends'});
  assert.equal(hinted.selected().conversationId,'this-coach');
  // The loaded coach threads carry the listing they are with.
  assert.match(source, /providerRole: c\.provider_role, providerId: Number\(c\.provider_id\),/);
});

// ── Ask Nora | Chat (owner, 2026-10-07) ─────────────────────────────────────────
const SPLIT = { tabs: [{id:'feed'},{id:'team'},{id:'support', support:true}], threads: [[], [{who:'Maya'}], [{who:'Nora'}]] };

test('opened on the support tab, the widget is in Nora mode on her thread', () => {
  const h = opener(SPLIT); h.open({who:'Nora', tab:'support'});
  assert.equal(h.state.nora, true);
  assert.equal(h.state.tab, 2);
  assert.equal(h.selected().who, 'Nora');
  const legacy = opener(SPLIT); legacy.open('Nora', 'support');
  assert.equal(legacy.state.nora, true, 'the legacy (name, tab) form too');
});

test('opened any other way it is Chat, and never lands on Nora\'s tab', () => {
  const plain = opener({ ...SPLIT, tabIdx: 2 }); plain.open();
  assert.equal(plain.state.nora, false);
  assert.equal(plain.state.tab, 0, 'a plain open whose last tab was Nora\'s moves to the first Chat tab');
  const team = opener(SPLIT); team.open({who:'Maya', tab:'team'});
  assert.equal(team.state.nora, false);
  assert.equal(team.state.tab, 1);
});

test('a popped-out window keeps every tab: no Nora mode there', () => {
  const h = opener({ ...SPLIT, docked: true }); h.open({who:'Nora', tab:'support'});
  assert.equal(h.state.nora, false);
});
