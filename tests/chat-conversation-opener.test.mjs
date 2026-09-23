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
function opener() {
  const threads = [
    [{who:'Alex',conversationId:'another-client'}, {who:'Alex',conversationId:'member-dm'}],
    [{who:'Alex',conversationId:'coach-thread'}],
  ];
  const state = {open:false, tab:0, active:[0,0], drafts:['Existing draft',''], threads};
  const context = {window:{}, tabs:[{id:'friends'},{id:'team'}], threadsByTab:threads, tabIdx:0, dirtyRef:{current:false},
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
