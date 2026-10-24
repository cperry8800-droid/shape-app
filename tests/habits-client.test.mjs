import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadRealModule } from './helpers/load-real-module.mjs';
const require = createRequire(import.meta.url);
// ⚠ HOME NO LONGER CHECKS A HABIT OFF (the Focus layout, owner 2026-10-11): daily
// habits are one link there, to the habits page. The future-date guard this file
// used to drive on Home's own toggle went with that toggle, so what is pinned now
// is that Home writes no habit at all — a second writer would need its own guard.
test('Home writes no habit: daily habits are a link to the habits page', () => {
  const source = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const home = source.slice(source.indexOf('function BSClientHome('), source.indexOf('function _bsHomeWidgets('));
  assert.ok(home.length > 1000, 'BSClientHome was not found — re-point this guard');
  assert.doesNotMatch(home, /ShapeHabitsData\.action/, 'Home writes a habit again — give it the future-date guard');
  assert.match(home, /<BSFocusLink tour="hero-habits"[\s\S]{0,400}?onOpen=\{\(\) => setHabitsPage\(true\)\}/, 'the daily-habits link no longer opens the habits page');
});
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url:'https://shape.test' });
globalThis.window = dom.window; globalThis.document = window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'); const { createRoot } = require('react-dom/client');
const mod = await loadRealModule(fileURLToPath(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetHabits.jsx',import.meta.url)), {
  registry: new Map([['react',React],['react-dom',require('react-dom')]]),
  appendExports:'export { _bsUseServerHabits, _bsHabitsToday, _bsStreakFromHistory };',
});
let actions;
function Harness() {
  const [habits, setHabits] = React.useState('[]');
  actions = mod._bsUseServerHabits({habits}, (_key,value)=>setHabits(value));
  return React.createElement('div',null,actions.status);
}
test('signed-in read errors never fall back to demo writes; a confirmed retry unlocks actions',async()=>{
  window.ShapeAuth={getCachedState:()=>({user:{id:'a'}})};
  let fail=true, writes=0;
  window.ShapeHabitsData={listStrict:async()=>{if(fail)throw Error('offline');return {habits:[]};},action:async()=>{writes++;return {habit:{id:'new',name:'Read',history:[]}};}};
  const root=createRoot(document.getElementById('root'));
  try {
    await React.act(async()=>root.render(React.createElement(Harness)));
    assert.equal(actions.status,'error');
    assert.equal(await actions.create({name:'Read'}),false); assert.equal(writes,0);
    fail=false; await React.act(async()=>actions.retry());
    await React.act(async()=>actions.create({name:'Read'}));
    assert.equal(actions.habits[0].name,'Read'); assert.equal(writes,1);
  } finally { await React.act(async()=>root.unmount()); }
});
test('rapid check-off taps submit one desired state; a failed save retains the original habit',async()=>{
  window.ShapeAuth={getCachedState:()=>({user:{id:'a'}})};
  let resolve; const calls=[];
  window.ShapeHabitsData={listStrict:async()=>({habits:[{id:'h',name:'Read',history:[]}]}),action:body=>{calls.push(body);return new Promise(r=>{resolve=r;});}};
  const root=createRoot(document.getElementById('root'));
  try {
    await React.act(async()=>root.render(React.createElement(Harness)));
    let pending;
    await React.act(async()=>{ pending=actions.toggle('h'); actions.toggle('h'); });
    assert.equal(calls.length,1); assert.equal(calls[0].action,'set'); assert.equal(calls[0].date,mod._bsHabitsToday());
    assert.deepEqual(actions.habits[0].history,[]);
    await React.act(async()=>{resolve({done:true});await pending;});
    assert.deepEqual(actions.habits[0].history,[mod._bsHabitsToday()]);
    window.ShapeHabitsData.action=async()=>{throw Error('offline');};
    await React.act(async()=>actions.remove('h'));
    assert.equal(actions.habits.length,1);
  } finally { await React.act(async()=>root.unmount()); }
});
test('an account switch discards a late habit response',async()=>{
  let uid='a', resolve;
  window.ShapeAuth={getCachedState:()=>({user:{id:uid}})};
  window.ShapeHabitsData={listStrict:async()=>({habits:[]}),action:()=>new Promise(r=>{resolve=r;})};
  const root=createRoot(document.getElementById('root'));
  try {
    await React.act(async()=>root.render(React.createElement(Harness)));
    let pending; await React.act(async()=>{pending=actions.create({name:'A private habit'});});
    uid='b'; await React.act(async()=>root.render(React.createElement(Harness)));
    await React.act(async()=>{resolve({habit:{id:'a',name:'A private habit'}});await pending;});
    assert.deepEqual(actions.habits,[]);
  } finally { await React.act(async()=>root.unmount()); }
});
test('midnight stays hour zero and reminder database failures propagate',async()=>{
  const source=readFileSync(new URL('../mobile-app/src/services/shapeBackend.js',import.meta.url),'utf8');
  const section=source.slice(source.indexOf('function _localNotifs()'),source.indexOf('// ─── User-set reminders'));
  let scheduled, dbError=null;
  const context=vm.createContext({window:{Capacitor:{Plugins:{LocalNotifications:{cancel:async()=>{},schedule:async data=>{scheduled=data;}}}}},
    state:{user:{id:'a'}},supabase:{from:()=>({upsert:async()=>({error:dbError})})},signOutGen:()=>0,_deviceTz:()=> 'America/New_York'});
  vm.runInContext(section,context);
  await context.setHabitReminder({habitId:'h',time:'00:05',days:[1]});
  assert.equal(scheduled.notifications[0].schedule.on.hour,0);
  assert.equal(scheduled.notifications[0].schedule.on.minute,5);
  dbError=Error('Save failed'); scheduled=null;
  await assert.rejects(context.setHabitReminder({habitId:'h',time:'09:00',days:[1]}),/Save failed/);
  assert.equal(scheduled,null);
});
// Codex P2 on #2437: the charts go on counting a deleted habit's check-offs. A load maps the
// route's `archived` with the day each went; a delete moves the habit across, history and all.
test('deleted habits stay for the charts: from the route, and the moment one is deleted',async()=>{
  window.ShapeAuth={getCachedState:()=>({user:{id:'a'}})};
  const today=mod._bsHabitsToday();
  window.ShapeHabitsData={
    listStrict:async()=>({habits:[{id:'h',name:'Read',history:[today]}],archived:[{id:'g',name:'Water',type:'do',created_at:'2026-09-01T12:00:00Z',archived_at:'2026-10-21T12:00:00',history:['2026-10-20']}]}),
    action:async()=>({ok:true}),
  };
  const root=createRoot(document.getElementById('root'));
  try {
    await React.act(async()=>root.render(React.createElement(Harness)));
    assert.deepEqual(actions.habits.map(h=>h.id),['h'],'today lists only live habits');
    assert.deepEqual(actions.archived.map(h=>[h.id,h.archivedOn,h.history]),[['g','2026-10-21',['2026-10-20']]]);
    await React.act(async()=>actions.remove('h'));
    assert.deepEqual(actions.habits,[]);
    assert.deepEqual(actions.archived.map(h=>[h.id,h.archivedOn,h.history]),[['g','2026-10-21',['2026-10-20']],['h',today,[today]]]);
  } finally { await React.act(async()=>root.unmount()); }
});
