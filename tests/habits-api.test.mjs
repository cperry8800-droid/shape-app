import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

async function api(results, user = {id:'member-a'}) {
  const calls=[];
  const db={from(table){ const q={}; calls.push(['from',table]); for(const method of ['select','insert','upsert','update','delete','eq','gte','is','order']) q[method]=(...args)=>{calls.push([method,...args]);return q;}; q.then=(yes,no)=>Promise.resolve(results.shift() || {data:null,error:null}).then(yes,no); q.single=q.maybeSingle=()=>q;return q; },rpc:async(...args)=>{calls.push(['rpc',...args]); return {error:null};}};
  const authRequests=[];
  const registry=new Map([
    ['next/server',{NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),{status:init?.status || 200})}}],
    ['@/lib/request-auth',{clientForRequest:async request=>{authRequests.push(request.headers.get('authorization'));return db;},currentUser:async()=>user}],
    ['@/lib/require-membership',{requireMembership:async()=>null}],
    ['@/lib/request-utils',{readJson:async request=>({ok:true,data:await request.json()}),dbError:()=>new Response('{}',{status:500})}],
  ]);
  return {route:await loadRealModule(fileURLToPath(new URL('../src/app/api/client/habits/route.ts',import.meta.url)),{typescript:true,registry}),calls,authRequests};
}
const request=body=>new Request('https://shape.test/api/client/habits',{method:'POST',headers:{Authorization:'Bearer native-token','Content-Type':'application/json'},body:JSON.stringify(body)});

test('native habit requests use request-scoped authentication and reject unauthenticated writes',async()=>{
  const {route,authRequests}=await api([],null);
  assert.equal((await route.POST(request({action:'set',id:'h',date:'2026-09-19',done:true}))).status,401);
  assert.deepEqual(authRequests,['Bearer native-token']);
});
test('replaying a completion keeps it done and uses the unique completion constraint',async()=>{
  const {route,calls}=await api([{data:{id:'h'}},{data:{id:'existing'}},{data:null},{data:{id:'existing'}}]);
  const res=await route.POST(request({action:'set',id:'h',date:'2026-09-19',done:true}));
  assert.equal(res.status,200); assert.equal((await res.json()).done,true);
  assert.ok(calls.some(c=>c[0]==='upsert'&&c[2].ignoreDuplicates));
  assert.equal(calls.some(c=>c[0]==='delete'),false);
  assert.ok(calls.some(c=>c[0]==='rpc'&&c[1]==='award_habit'));
});
test('a failed completion read never becomes a write, and invalid calendar days are rejected',async()=>{
  const {route,calls}=await api([{data:{id:'h'}},{error:{message:'offline'}}]);
  assert.equal((await route.POST(request({action:'set',id:'h',date:'2026-09-19',done:true}))).status,500);
  assert.equal(calls.some(c=>c[0]==='upsert'||c[0]==='delete'),false);
  assert.equal((await route.POST(request({action:'set',id:'h',date:'2026-02-31',done:true}))).status,400);
});
test('replaying uncheck on an absent completion remains unchecked',async()=>{
  const {route,calls}=await api([{data:{id:'h'}},{data:null}]);
  assert.equal((await (await route.POST(request({action:'set',id:'h',date:'2026-09-19',done:false}))).json()).done,false);
  assert.equal(calls.some(c=>c[0]==='upsert'),false);
});
// Codex P2 on #2437: deleting keeps past check-offs, so GET sends the habits deleted inside its 90
// days as `archived`, with their check-offs, for the Progress charts; today's list stays live only.
test('GET sends the habits deleted inside the window, with their check-offs, apart from the live ones',async()=>{
  const get=()=>new Request('https://shape.test/api/client/habits',{headers:{Authorization:'Bearer native-token'}});
  const {route,calls}=await api([
    {data:[{id:'h',name:'Read',type:'do',created_at:'2026-09-01T00:00:00Z',archived_at:null}]},
    {data:[{habit_id:'h',done_on:'2026-10-20'},{habit_id:'g',done_on:'2026-10-19'},{habit_id:'g',done_on:'2026-10-18'}]},
    {data:[{id:'g',name:'Water',type:'do',created_at:'2026-09-01T00:00:00Z',archived_at:'2026-10-21T15:00:00Z'}]},
  ]);
  const body=await (await route.GET(get())).json();
  assert.deepEqual(body.habits.map(h=>[h.id,h.history]),[['h',['2026-10-20']]]);
  assert.deepEqual(body.archived.map(h=>[h.id,h.archived_at,h.history]),[['g','2026-10-21T15:00:00Z',['2026-10-18','2026-10-19']]]);
  assert.ok(calls.some(c=>c[0]==='is'&&c[1]==='archived_at'&&c[2]===null),'the live list still leaves deleted habits out');
  const bound=calls.find(c=>c[0]==='gte'&&c[1]==='archived_at');
  assert.ok(bound&&Date.now()-Date.parse(bound[2])>=89*864e5,'only habits deleted inside the 90 days');
  const failed=await api([{data:[]},{data:[]},{error:{message:'offline'}}]);
  assert.equal((await failed.route.GET(get())).status,500,'a failed read of them fails the read, as the others do');
});
