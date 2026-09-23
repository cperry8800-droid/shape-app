import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { BS_HR_FRESH_MS, bsReadWorkoutView, bsSaveWorkoutView, bsCollectHr, bsCloseHr, bsHrFresh, bsHrSummary, bsHrSensorSamples, bsHrChart } from '../mobile-app/src/services/workoutExperience.mjs';

test('view preference survives a new reader and never follows another account', () => {
  const rows = new Map(), storage = { getItem: k => rows.get(k), setItem: (k,v) => rows.set(k,v) };
  assert.equal(bsReadWorkoutView(storage, 'a'), null);
  assert.equal(bsSaveWorkoutView(storage, 'a', 'guided'), true);
  assert.equal(bsReadWorkoutView(storage, 'a'), 'guided');
  assert.equal(bsReadWorkoutView(storage, 'b'), null);
  assert.equal(bsSaveWorkoutView(storage, 'a', 'unknown'), false);
  assert.equal(bsSaveWorkoutView({ setItem() { throw Error('quota'); } }, 'a', 'log'), false);
});

test('freshness, disconnection, stale samples and explicit gaps describe only recorded HR', () => {
  const start=1700000000000, rows=[];
  bsCollectHr(rows, { bpm:120 }, start);
  bsCollectHr(rows, { bpm:140 }, start+1000);
  assert.equal(bsCollectHr(rows, { bpm:140, t:start+1000 }, start+1001), false, 'duplicate event is not a second sample');
  for(const bpm of [null, 0, -1, Infinity, NaN, '120']) assert.equal(bsCollectHr(rows, {bpm}, start+2000), false);
  assert.equal(bsCollectHr(rows, {bpm:120,t:start}, start+BS_HR_FRESH_MS), false);
  bsCollectHr(rows, {connected:false}, start+2000);
  bsCollectHr(rows, {bpm:130}, start+10000);
  bsCloseHr(rows, start+11000);
  const summary=bsHrSummary(rows,start,start+20000);
  assert.deepEqual([summary.avg,summary.max,summary.samples,summary.coveredSeconds,summary.coveragePercent],[130,140,3,3,15]);
  assert.equal(bsHrFresh({bpm:130,t:start,connected:true},start+14999),true);
  assert.equal(bsHrFresh({bpm:130,t:start,connected:true},start+15000),false);
  assert.equal(bsHrFresh({bpm:130,t:start,connected:false},start+100),false);
  assert.equal(bsHrSummary([],start,start+20000),null);
  const saved=bsHrSensorSamples(rows,start,start+20000);
  assert.equal(saved[2].payload.gapBefore,true);
  assert.equal(bsHrChart(saved,start,start+20000).length,2,'no line across the short disconnect');
});

test('a ten-hour HR timeline fits the actual atomic RPC and retains peaks, troughs, time bounds and gaps', () => {
  const start=1700000000000, rows=Array.from({length:36000},(_,i)=>({t:start+i*1000,bpm:110+i%30}));
  rows[119].bpm=190; rows[197].bpm=72; rows[500].until=rows[500].t;
  const saved=bsHrSensorSamples(rows,start,start+36000000);
  const sql=readFileSync(new URL('../supabase-migrations/2026-09-18-workout-session-atomic-save.sql',import.meta.url),'utf8');
  const limit=Number(sql.match(/jsonb_array_length\(p_samples\) > (\d+)/)[1]);
  assert.ok(saved.length+1<=limit, 'leave room for backend summary');
  assert.equal(Math.max(...saved.map(s=>s.value)),190);
  assert.equal(Math.min(...saved.map(s=>s.value)),72);
  assert.equal(saved[0].sampledAt,new Date(start).toISOString());
  assert.equal(saved.at(-1).sampledAt,new Date(rows.at(-1).t).toISOString());
  assert.equal(bsHrChart(saved,start,start+36000000).length,2);
  assert.equal(bsHrSummary(rows,start,start+36000000).samples,36000);
});

test('private coach timeline reader paginates beyond the API default and rejects account changes', async () => {
  const src=readFileSync(new URL('../mobile-app/src/services/shapeBackend.js',import.meta.url),'utf8');
  const code=src.slice(src.indexOf('async function listWorkoutSensorSamples('),src.indexOf("// A NUTRITIONIST'S review queue"));
  const calls=[], state={user:{id:'coach'}}, data=Array.from({length:1250},(_,id)=>({id}));
  let swap=false;
  const api={ from(table) { assert.equal(table,'workout_sensor_samples'); return this; }, select(){return this},eq(key,value){calls.push([key,value]);return this},order(){return this},async range(from,to){calls.push([from,to]);if(swap)state.user.id='another';return {data:data.slice(from,to+1)}} };
  const ctx={state,supabase:api};vm.createContext(ctx);vm.runInContext(code+'; this.read=listWorkoutSensorSamples;',ctx);
  const id='21f8bf71-2faa-4934-b027-72bc192a9421';
  assert.equal((await ctx.read(id)).data.length,1250);
  assert.deepEqual(calls.filter(c=>typeof c[0]==='number'),[[0,499],[500,999],[1000,1499]]);
  assert.ok(calls.some(c=>c[0]==='session_id'&&c[1]===id));
  await assert.rejects(ctx.read('bad-id'),/Invalid workout/);
  swap=true;await assert.rejects(ctx.read(id),/Account changed/);
});

test('BLE readings carry actual measurement time; disconnect and setup failure clear state', async () => {
  const src = readFileSync(new URL('../mobile-app/src/services/hrm.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replaceAll('export ', '');
  const events = []; let receive, disconnected, fail = false;
  const ble = { initialize: async () => {}, requestDevice: async () => ({ deviceId: 'sample-device' }), connect: async (_id, fn) => { disconnected = fn; },
    startNotifications: async (_id, _s, _c, fn) => { if (fail) throw Error('notifications failed'); receive = fn; },
    stopNotifications: async () => {}, disconnect: async () => {} };
  const ctx = { Date, Capacitor: { isNativePlatform: () => true }, window: { dispatchEvent: e => events.push(e.detail) }, CustomEvent: class { constructor(_name, opts) { this.detail = opts.detail; } }, ble };
  vm.createContext(ctx); vm.runInContext(src + '; loadBle = async () => ble; this.connect = hrmConnect; this.read = hrmReading;', ctx);
  await ctx.connect();
  const data = new DataView(new ArrayBuffer(3)); data.setUint8(0, 1); data.setUint16(1, 130, true);
  receive(data); const reading = ctx.read();
  assert.equal(reading.bpm, 130); assert.equal(reading.connected, true); assert.ok(Number.isFinite(reading.t));
  assert.equal(events.at(-1).t, reading.t);
  await disconnected(); assert.equal(ctx.read().bpm, null); assert.equal(ctx.read().t, null); assert.equal(events.at(-1).connected, false);
  receive(data); assert.equal(ctx.read().bpm, null, 'late notification cannot revive a disconnected device');
  fail = true; await assert.rejects(ctx.connect(), /notifications failed/); assert.equal(ctx.read().connected, false);
});

test('every workout view choice and description exists in every shipped locale', () => {
  for (const locale of ['de','en','es','fr','ha','id','it','pcm','pt-BR','ru','tr','uk','vi']) {
    const cat = JSON.parse(readFileSync(new URL('../mobile-app/src/i18n/catalogs/' + locale + '/session.json', import.meta.url), 'utf8'));
    for (const view of ['focus','log','guided']) for (const suffix of ['', 'Help']) assert.equal(typeof cat['player.view.' + view + suffix], 'string', locale + '/' + view + suffix);
  }
});
