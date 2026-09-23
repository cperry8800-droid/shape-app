import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/newdesign/dashGrid.jsx', import.meta.url), 'utf8');
const core = source.slice(source.indexOf('function dgBoards('), source.indexOf('const dgLayoutStores ='));
const { dgBoards, dgBoardEdit, dgCreateLayoutStore } = new Function(core + ';return {dgBoards,dgBoardEdit,dgCreateLayoutStore};')();
const copy = (v) => JSON.parse(JSON.stringify(v));
const layout = (id) => ({items:[{id,x:0,y:0,w:6,h:30}],hidden:[],added:[],mobileOrder:[id]});
const original = {trainer:{today:layout('schedule'),clients:layout('roster'),business:layout('revenue')},nutritionist:{today:layout('consults')},other:{keep:true}};
const edit = (role, action) => (doc) => dgBoardEdit(doc,role,action);
function fixture(seed = original) {
  let saved = copy(seed), user = 'coach-a', failRead = false, failSave = false;
  const writes = [], tasks = new Map(); let seq = 0, inFlight = 0, maxFlight = 0, hold = null;
  const db = {
    getUser: async () => user ? {id:user} : null,
    getUserGoals: async () => failRead ? null : copy(saved),
    saveUserGoals: async (kind,doc,options) => {
      assert.equal(kind,'dashboard_layout'); assert.equal(options.expectedUserId,'coach-a');
      inFlight++; maxFlight=Math.max(maxFlight,inFlight); writes.push(copy(doc));
      if (hold) await hold;
      inFlight--;
      if (failSave) return {error:{message:'offline'}};
      saved=copy(doc); return {ok:true};
    },
  };
  const timers = {setTimeout:(fn,ms)=>{const id=++seq;tasks.set(id,{fn,ms});return id;},clearTimeout:(id)=>tasks.delete(id)};
  const store=dgCreateLayoutStore('coach-a',db,timers);
  return {store,writes,tasks,db,get saved(){return saved;},get maxFlight(){return maxFlight;},
    setUser:(v)=>user=v,setReadFailure:(v)=>failRead=v,setSaveFailure:(v)=>failSave=v,
    hold:()=>{let release;hold=new Promise((r)=>release=r);return ()=>{hold=null;release();};},
    external:(fn)=>saved=fn(saved)};
}

test('legacy layout becomes the first dashboard without dropping any tab or role',()=>{
  assert.deepEqual(dgBoards(original,'trainer').boards[0].tabs,original.trainer);
  const created=dgBoardEdit(original,'trainer',{type:'create',id:'daily',name:'Daily coaching'});
  assert.deepEqual(created.trainer,original.trainer);
  assert.deepEqual(created.nutritionist,original.nutritionist);
  assert.deepEqual(created.other,original.other);
  assert.equal(dgBoards(created,'trainer').boards.length,2);
  assert.equal(original.savedDashboards,undefined);
});
test('duplicate, rename and switch retain independent desktop, mobile and visibility settings on ALL tabs',()=>{
  let doc=dgBoardEdit(original,'trainer',{type:'create',id:'daily',name:'Daily'});
  doc=dgBoardEdit(doc,'trainer',{type:'tab',board:'daily',tab:'today',layout:{...layout('week'),hidden:['schedule'],added:['week'],mobileOrder:['week','schedule']}});
  doc=dgBoardEdit(doc,'trainer',{type:'tab',board:'daily',tab:'business',layout:layout('payouts')});
  doc=dgBoardEdit(doc,'trainer',{type:'rename',name:'  Business review  '});
  assert.equal(dgBoards(doc,'trainer').boards[1].name,'Business review');
  doc=dgBoardEdit(doc,'trainer',{type:'switch',id:'default'});
  assert.deepEqual(doc.trainer,original.trainer);
  doc=dgBoardEdit(doc,'trainer',{type:'switch',id:'daily'});
  assert.deepEqual(doc.trainer.clients,original.trainer.clients);
  assert.deepEqual(doc.trainer.today.mobileOrder,['week','schedule']);
  assert.equal(doc.trainer.business.items[0].id,'payouts');
});
test('late writes to a previous dashboard never change the currently selected one',()=>{
  let doc=dgBoardEdit(original,'trainer',{type:'create',id:'other',name:'Other'});
  doc=dgBoardEdit(doc,'trainer',{type:'tab',board:'default',tab:'today',layout:layout('notes')});
  assert.equal(doc.trainer.today.items[0].id,'schedule');
  assert.equal(dgBoards(doc,'trainer').boards[0].tabs.today.items[0].id,'notes');
});
test('invalid or duplicate names leave the original document untouched',()=>{
  for (const name of ['', ' '.repeat(2), 'a'.repeat(61), 'MY DASHBOARD']) assert.throws(()=>dgBoardEdit(original,'trainer',{type:'create',id:'new',name}));
  assert.deepEqual(Object.keys(original),['trainer','nutritionist','other']);
});
test('one debounced write combines changes from different tabs and preserves fresh server fields',async()=>{
  const f=fixture();await f.store.load();
  f.store.change(edit('trainer',{type:'tab',board:'default',tab:'today',layout:layout('notes')}));
  f.store.change(edit('trainer',{type:'tab',board:'default',tab:'clients',layout:layout('status')}));
  f.external((doc)=>({...doc,nutritionist:{today:layout('new-consults')}}));
  assert.equal(f.tasks.size,1);assert.equal(f.writes.length,0);
  await f.store.flush();
  assert.equal(f.writes.length,1);assert.equal(f.saved.trainer.today.items[0].id,'notes');
  assert.equal(f.saved.trainer.clients.items[0].id,'status');assert.equal(f.saved.nutritionist.today.items[0].id,'new-consults');
  f.store.change((doc)=>copy(doc));await f.store.flush();assert.equal(f.writes.length,1);
});
test('a delayed write is serialized with a newer change and cannot land last',async()=>{
  const f=fixture();await f.store.load();const release=f.hold();
  f.store.change(edit('trainer',{type:'tab',board:'default',tab:'today',layout:layout('old')}));
  const first=f.store.flush();
  for(let i=0;i<10 && !f.writes.length;i++) await Promise.resolve();
  assert.equal(f.writes.length,1);
  f.store.change(edit('trainer',{type:'tab',board:'default',tab:'today',layout:layout('new')}));
  f.store.flush();assert.equal(f.writes.length,1);release();await first;await f.store.flush();
  assert.equal(f.maxFlight,1);assert.equal(f.saved.trainer.today.items[0].id,'new');assert.equal(f.store.read().status,'saved');
});
test('failure retains the visible draft and retries the latest queued changes',async()=>{
  const f=fixture();await f.store.load();f.setSaveFailure(true);
  f.store.change(edit('trainer',{type:'tab',board:'default',tab:'today',layout:layout('draft')}));
  await f.store.flush();assert.equal(f.store.read().status,'error');assert.equal(f.store.read().doc.trainer.today.items[0].id,'draft');
  assert.ok([...f.tasks.values()].some((t)=>t.ms===1500));
  f.setSaveFailure(false);await f.store.retry();assert.equal(f.saved.trainer.today.items[0].id,'draft');assert.equal(f.store.read().status,'saved');
});
test('failed reads never cause an empty document overwrite',async()=>{
  const f=fixture();f.setReadFailure(true);await f.store.load();assert.equal(f.store.read().loaded,false);
  f.store.change(edit('trainer',{type:'create',id:'new',name:'New'}));await f.store.flush();assert.equal(f.writes.length,0);
  f.setReadFailure(false);await f.store.retry();assert.deepEqual(f.store.read().doc,original);
  f.setReadFailure(true);f.store.change(edit('trainer',{type:'tab',board:'default',tab:'today',layout:layout('draft')}));await f.store.flush();assert.equal(f.writes.length,0);
});
test('a signed-out or different account never receives a queued dashboard document',async()=>{
  for (const user of [null,'coach-b']) {
    const f=fixture();await f.store.load();f.store.change(edit('trainer',{type:'tab',board:'default',tab:'today',layout:layout('private')}));f.setUser(user);await f.store.flush();assert.equal(f.writes.length,0);assert.equal(f.store.read().status,'error');
  }
});
test('preview changes never call a database',async()=>{
  const store=dgCreateLayoutStore(null,{saveUserGoals:()=>assert.fail('preview wrote')});
  store.change(edit('trainer',{type:'create',id:'example',name:'Example'}));await store.flush();assert.equal(store.read().status,'preview');
});

test('retrying a committed create never adds the same dashboard twice',()=>{
  const action={type:'create',id:'daily',name:'Daily',tabs:original.trainer};
  const once=dgBoardEdit(original,'trainer',action);
  const twice=dgBoardEdit(once,'trainer',action);
  assert.deepEqual(twice,once);
});
test('a queued rename remains attached to its original dashboard',()=>{
  let doc=dgBoardEdit(original,'trainer',{type:'create',id:'daily',name:'Daily'});
  doc=dgBoardEdit(doc,'trainer',{type:'switch',id:'default'});
  doc=dgBoardEdit(doc,'trainer',{type:'rename',board:'daily',name:'Coaching'});
  assert.equal(dgBoards(doc,'trainer').boards[0].name,'My dashboard');
  assert.equal(dgBoards(doc,'trainer').boards[1].name,'Coaching');
});
