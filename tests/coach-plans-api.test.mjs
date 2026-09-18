import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as document from '../public/newdesign/workoutDocument.mjs';

const plan = { id: '67b9d583-02a5-4d39-9832-dea025bad1e3', name: 'Upper', kind: 'program', meta: null, price: null, published: false, detail: { revision: 2, builder: { weeks: [{days:[{id:'upper',name:'Upper',blocks:[{kind:'main',rows:[{id:'press',name:'Press',sets:3,reps:8,video:'https://example.com/press.mp4'}]}]}]}] } } };
async function api(results, { user = {id:'coach-a'}, assignments = false } = {}) {
  const calls=[];
  const db={from(table){const query={};calls.push(['from',table]);for(const method of ['select','insert','update','delete','eq','in','gt','is','order','limit'])query[method]=(...args)=>{calls.push([method,...args]);return query;};
    query.then=(resolve,reject)=>Promise.resolve(results.shift() || {data:null,error:null}).then(resolve,reject);
    query.single=()=>query;query.maybeSingle=()=>query;return query;}};
  const registry=new Map([
    ['next/server',{NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),{status:init?.status || 200,headers:{'Content-Type':'application/json'}})}}],
    ['@/lib/request-auth',{clientForRequest:async()=>db,currentUser:async()=>user}],
    ['@/lib/request-utils',{readJson:async request=>({ok:true,data:await request.json()}),dbError:()=>new Response('{}',{status:500})}],
    ['../../../../../public/newdesign/workoutDocument.mjs',document],
    ['../../../../../../public/newdesign/workoutDocument.mjs',document],
  ]);
  const path=assignments?'../src/app/api/coach/plans/assignments/route.ts':'../src/app/api/coach/plans/route.ts';
  return {route:await loadRealModule(fileURLToPath(new URL(path,import.meta.url)),{typescript:true,registry}),calls};
}
const request=(method,body)=>new Request('https://shape.test/api/coach/plans',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('coach plan routes reject unauthenticated reads and writes',async()=>{
  const {route}=await api([],{user:null});
  assert.equal((await route.GET(new Request('https://shape.test/api/coach/plans'))).status,401);
  assert.equal((await route.POST(request('POST',{name:'Upper'}))).status,401);
});
test('library reads normalize old mobile plans and remain owner scoped',async()=>{
  const {route,calls}=await api([{data:[{...plan,detail:{blocks:[{text:'Press — 3 × 8 · 20 lb',video:'https://example.com/press.mp4'}]}}]}]);
  const body=await (await route.GET(new Request('https://shape.test/api/coach/plans?kind=program'))).json();
  assert.equal(body.ownerId,'coach-a');
  assert.equal(body.plans[0].detail.builder.weeks[0].days[0].blocks[0].rows[0].video,'https://example.com/press.mp4');
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='owner_id'&&c[2]==='coach-a'));
});
test('an account switch rejects an open draft before any database write',async()=>{
  const {route,calls}=await api([]);
  for(const method of ['POST','PATCH'])assert.equal((await route[method](request(method,{name:'Upper',id:plan.id,expectedOwnerId:'coach-b'}))).status,409);
  assert.equal(calls.length,0);
});
test('stale revisions cannot overwrite a newer workout',async()=>{
  const {route,calls}=await api([{data:plan}]);
  assert.equal((await route.PATCH(request('PATCH',{id:plan.id,expectedRevision:1,detail:{builder:{weeks:[]}}}))).status,409);
  assert.ok(!calls.some(c=>c[0]==='update'));
});
test('revision comparison is also applied atomically to the update',async()=>{
  const {route,calls}=await api([{data:plan},{data:null}]);
  assert.equal((await route.PATCH(request('PATCH',{id:plan.id,expectedRevision:2,name:'Upper revised'}))).status,409);
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='detail->>revision'&&c[2]==='2'));
  assert.equal(calls.find(c=>c[0]==='update')[1].detail.revision,3);
});
test('meal plan editors keep their existing patch contract',async()=>{
  const meal={...plan,kind:'meal_plan',detail:{mealBuilder:{goal:'gain'}}};
  const {route,calls}=await api([{data:meal},{data:meal}]);
  assert.equal((await route.PATCH(request('PATCH',{id:plan.id,detail:{mealBuilder:{goal:'maintain'}}}))).status,200);
  assert.ok(!calls.find(c=>c[0]==='update')[1].detail.builder);
});
test('retrying a committed new UUID succeeds only for the same full plan',async()=>{
  const body={...plan,detail:{builder:plan.detail.builder},expectedOwnerId:'coach-a'};
  const inserted={...plan,detail:{...document.normalizeWorkoutDetail(body.detail,{name:'Upper'}),revision:1}};
  const {route}=await api([{error:{code:'23505'}},{data:inserted}]);
  assert.equal((await route.POST(request('POST',body))).status,200);
  const changed=await api([{error:{code:'23505'}},{data:{...inserted,published:true}}]);
  assert.equal((await changed.route.POST(request('POST',body))).status,409);
});
test('future preview excludes logged/overridden days and retains calendar and video',async()=>{
  const make=(id,payload={})=>({id,client_id:'client',scheduled_date:'2026-09-24',title:'Old title',description:'Client-specific cue',kind:'template',payload:{template:{id:plan.id,week:1,day:1,dayId:'upper'},...payload}});
  const {route,calls}=await api([{data:plan},{data:[{id:'trainer'}]},{data:[make('clean'),make('logged'),make('override',{overrides:true})],count:3},{data:[{client_workout_id:'logged'}],count:1}],{assignments:true});
  const response=await route.GET(new Request(`https://shape.test/api/coach/plans/assignments?id=${plan.id}&today=2026-09-18`));
  assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.assignments.length,1);assert.equal(body.skipped,2);
  assert.equal(body.assignments[0].scheduledDate,'2026-09-24');
  assert.equal(body.assignments[0].payload.exercises[0].video,'https://example.com/press.mp4');
  assert.deepEqual(body.assignments[0].before,{id:'clean',title:'Old title',description:'Client-specific cue',kind:'template',scheduled_date:'2026-09-24',payload:make('clean').payload,exercises:[]});
  assert.ok(calls.some(c=>c[0]==='gt'&&c[1]==='scheduled_date'&&c[2]==='2026-09-18'));
});
test('future preview fails closed when completed-workout verification is truncated',async()=>{
  const {route}=await api([{data:plan},{data:[{id:'trainer'}]},{data:[{id:'row'}],count:1},{data:[],count:1}],{assignments:true});
  assert.equal((await route.GET(new Request(`https://shape.test/api/coach/plans/assignments?id=${plan.id}`))).status,500);
});
