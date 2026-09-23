import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

async function api(path, results = {}, user = { id: 'coach-a' }) {
  const calls = [];
  const db = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table) {
      const q = {};
      for (const method of ['select','eq','gte','lte','in','not','order','limit','maybeSingle']) q[method] = (...args) => { calls.push([table,method,...args]); return q; };
      q.then = (resolve,reject) => Promise.resolve(results[table] || { data: [], error: null }).then(resolve,reject);
      return q;
    },
    rpc: async () => ({ data: [] }),
  };
  const json = (body, init) => Response.json(body, { status: init?.status || 200 });
  const registry = new Map([
    ['next/server',{NextResponse:{json}}],
    ['@/lib/request-auth',{clientForRequest:async()=>db,currentUser:async()=>user}],
    ['@/lib/supabase/server',{createClient:async()=>db}],
    ['@/lib/require-membership',{requireMembership:async()=>null}],
    ['@/lib/request-utils',{readJson:async()=>({ok:false,response:json({}, {status:400})}),dbError:()=>json({error:'unavailable'},{status:500})}],
    ['@/lib/access-guards.mjs',{isSessionReschedulable:()=>false}],
    ['@/lib/time',{normalizeZone:(zone)=>zone || null}],
  ]);
  const route = await loadRealModule(fileURLToPath(new URL('../src/app/api/'+path+'/route.ts',import.meta.url)),{typescript:true,registry});
  return { route, calls };
}
const req=(path)=>new Request('https://shape.test/api/'+path);
const own={data:{id:42,timezone:'America/New_York'}};
const booking={id:'booking',provider_role:'trainer',scheduled_at:'2026-09-23T13:00:00Z',duration_min:45,status:'confirmed'};

test('capacity is restricted to the caller-owned provider and preserves booking instants',async()=>{
  const {route,calls}=await api('calendar',{trainers:own,sessions:{data:[booking]}});
  const response=await route.GET(req('calendar?capacityRole=trainer'));
  assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.bookingsReadable,true);assert.equal(body.events[0].scheduledAt,booking.scheduled_at);assert.equal(body.events[0].durationMin,45);
  assert.ok(calls.some(c=>c.join('|')==='trainers|eq|owner_id|coach-a'));
  assert.ok(calls.some(c=>c.join('|')==='sessions|eq|provider_id|42'));
  assert.ok(calls.some(c=>c.join('|')==='sessions|eq|provider_role|trainer'));
  assert.ok(!calls.some(c=>c[0]==='client_workouts'));
});
test('capacity never turns missing providers, failed or capped booking reads into free time',async()=>{
  for(const results of [{trainers:{data:null}}, {trainers:own,sessions:{data:null,error:{message:'offline'}}}, {trainers:own,sessions:{data:Array(1000).fill(booking)}}]) {
    const {route}=await api('calendar',results);assert.equal((await route.GET(req('calendar?capacityRole=trainer'))).status,503);
  }
  const {route}=await api('calendar');assert.equal((await route.GET(req('calendar?capacityRole=client'))).status,400);
});
test('signed-out capacity requests do not query data',async()=>{
  const {route,calls}=await api('calendar',{},null);assert.equal((await route.GET(req('calendar?capacityRole=trainer'))).status,401);assert.deepEqual(calls,[]);
});
test('availability resolves this account explicitly and reports read failures',async()=>{
  const {route,calls}=await api('my-availability',{trainers:own,provider_availability:{error:{message:'offline'},data:null}});
  assert.equal((await route.GET(req('my-availability?role=trainer'))).status,503);
  assert.ok(calls.some(c=>c.join('|')==='trainers|eq|owner_id|coach-a'));
});
for(const role of ['trainer','nutritionist']) {
  const table=role==='trainer'?'trainers':'nutritionists';
  test(role+' messages reject read failures instead of showing no replies',async()=>{
    for(const results of [{[table]:{error:{message:'offline'}}},{[table]:own,conversations:{error:{message:'offline'}}},{[table]:own,conversations:{data:[{id:'conv'}]},messages:{error:{message:'offline'}}}]) {
      const {route}=await api(role+'/messages',results);assert.equal((await route.GET()).status,500);
    }
  });
  test(role+' replies distinguish a current message from a truncated conversation',async()=>{
    const at='2026-09-23T13:00:00Z';
    const {route,calls}=await api(role+'/messages',{[table]:own,conversations:{data:[{id:'fresh',last_message_at:at},{id:'missing',last_message_at:at}]},messages:{data:[{id:'m2',conversation_id:'fresh',sender_id:'client-a',created_at:at},{id:'m1',conversation_id:'fresh',sender_id:'coach-a',created_at:'2026-09-22T13:00:00Z'}]}});
    const body=await (await route.GET()).json();assert.equal(body.threads[0].latestKnown,true);assert.equal(body.threads[0].messages.at(-1).mine,false);assert.equal(body.threads[1].latestKnown,false);
    assert.ok(calls.some(c=>c[0]==='messages'&&c[1]==='order'&&c[2]==='created_at'&&c[3].ascending===false));
  });
}
