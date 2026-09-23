import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const babel=require('next/dist/compiled/babel/core'),preset=require('next/dist/compiled/babel/preset-react');
const source=readFileSync(new URL('../public/newdesign/dashToday.jsx',import.meta.url),'utf8');
const shared=readFileSync(new URL('../public/newdesign/dashData.jsx',import.meta.url),'utf8');
const reviewHelper=shared.slice(shared.indexOf('function dashCheckinReviewed('),shared.indexOf('// The unit a bound metric'));
const code=reviewHelper + babel.transformSync(source,{presets:[preset]}).code;
const api=new Function('window','serif','sans',code+';return {dashCapacity,dashSetupSteps,dashReplyRows,dashCheckinRows};')({},'serif','sans');
const sig=require('../public/newdesign/dashSignals.js');
const MONDAY=new Date(2026,8,21,0);

test('check-ins are oldest first; receiving is not reviewing and edits reopen a review',()=>{
  const client={profile:{id:'a',name:'Alex'},checkins:[{week_of:'2026-09-21',wins:'More sleep'},{week_of:'2026-09-14',wins:'Training'}]};
  const rows=api.dashCheckinRows([client],{});assert.equal(rows.length,2);assert.equal(rows[0].week,'2026-09-14');
  const reviews={[rows[0].week]:{a:{reviewedAt:'2026-09-22',checkinSignature:rows[0].signature}}};
  assert.equal(api.dashCheckinRows([client],reviews).length,1);
  client.checkins[1].wins='Edited';assert.equal(api.dashCheckinRows([client],reviews).length,2);
  assert.equal(api.dashCheckinRows([{profile:{id:'b',name:'Other'},checkins:[{week_of:'2026-09-14',wins:'Training'}]}],reviews).length,1);
});
test('setup distinguishes explicit intake completion, shared absence, and unreadable steps',()=>{
  const steps=api.dashSetupSteps({progressRead:{state:'ready'},payments:{sessionCount:0},checkins:[]},false);
  assert.deepEqual(steps.map((s)=>s.done),[false,false,null,false]);
  const done=api.dashSetupSteps({payments:{sessionCount:1},program:{name:'Block'},checkins:[{}]},true);
  assert.deepEqual(done.map((s)=>s.done),[true,true,true,true]);
  assert.deepEqual(api.dashSetupSteps({},false).map((s)=>s.done),[false,null,null,null]);
});
test('replies use the latest message sender, not unread status, and sort by waiting time',()=>{
  const rows=api.dashReplyRows([
    {id:'answered',unread:8,messages:[{mine:false,createdAt:'2026-09-20'},{mine:true,createdAt:'2026-09-21'}]},
    {id:'recent',unread:0,messages:[{mine:false,createdAt:'2026-09-23'}]},
    {id:'old',messages:[{mine:false,createdAt:'2026-09-20'}]},
    {id:'unknown',messages:[]},
  ]);assert.deepEqual(rows.map((r)=>r.id),['old','recent']);
});
test('capacity unions overlapping working hours and bookings, and reports real gaps',()=>{
  const slots=[{weekday:1,start_minute:540,duration_min:120},{weekday:1,start_minute:600,duration_min:120}];
  const events=[{date:'2026-09-21',time:'09:30',durationMin:60,kind:'SESSION'}, {date:'2026-09-21',time:'10:00',durationMin:60,kind:'SESSION'}];
  const out=api.dashCapacity(events,slots,MONDAY);
  assert.equal(out.available,180);assert.equal(out.booked,90);assert.equal(out.free,90);
  assert.deepEqual(out.days[0].free,[[540,570],[660,720]]);
});
test('capacity refuses to infer a duration and ignores canceled/non-booking events',()=>{
  const slots=[{weekday:1,start_minute:540,duration_min:120}];
  const out=api.dashCapacity([
    {date:'2026-09-21',time:'09:30',durationMin:null,kind:'SESSION'},
    {date:'2026-09-21',time:'10:00',durationMin:60,kind:'SESSION',status:'cancelled'},
    {date:'2026-09-21',time:'10:00',durationMin:60,kind:'WORKOUT'},
  ],slots,MONDAY);assert.equal(out.unreadable,1);assert.equal(out.booked,0);
});
test('week ahead separates own booked minutes from shared coach events',()=>{
  const out=sig.dashWeekAhead([
    {date:'2026-09-21',time:'09:00',kind:'TRAINING',durationMin:45},
    {date:'2026-09-21',time:'10:00',kind:'NUTRITION',durationMin:30,sharedCoach:true},
  ],MONDAY);assert.equal(out.days[0].count,2);assert.equal(out.days[0].bookedMin,45);
  assert.equal(sig.dashWeekAhead([{date:'2026-09-21',kind:'TRAINING'}],MONDAY).days[0].bookedMin,null);
});
test('revenue exposes the complete list and a known-only gross denominator',()=>{
  const clients=Array.from({length:9},(_,i)=>({profile:{id:'c'+i,name:'Client '+i},payments:{mrrCents:i===8?null:1000,feeCents:150}}));
  const out=sig.dashRevenueByClient(clients);assert.equal(out.rows.length,5);assert.equal(out.allRows.length,8);assert.equal(out.sumCents,8000);assert.equal(out.unknown,1);
  assert.equal(out.allRows[0].share,1/8);assert.equal(out.allRows[0].feeCents,150);
});
test('program queue recognizes paused source status and keeps estimated overdue/next-plan details',()=>{
  const p={profile:{id:'a',name:'Alex'},program:{name:'Block',week:12,weeks:12,status:'active',estimatedEndAt:'2026-09-20T00:00:00Z',overdue:true,nextAssigned:'Next block'}};
  const out=sig.dashProgramsEnding([p,{profile:{id:'b'},program:{status:'paused',week:null,weeks:12}}]);
  assert.equal(out.paused,1);assert.equal(out.soon[0].endDate,'2026-09-20');assert.equal(out.soon[0].overdue,true);assert.equal(out.soon[0].nextAssigned,'Next block');
});
test('mover comparison dates come from completed weeks while current points retain their week',()=>{
  const out=sig.dashTopMovers([{profile:{id:'a',name:'Alex'},shapeScoreHistory:[{weekOf:'2026-09-07',points:40},{weekOf:'2026-09-14',points:60},{weekOf:'2026-09-21',points:20,partial:true}]}]);
  assert.equal(out.up[0].delta,20);assert.equal(out.up[0].points,20);assert.equal(out.up[0].compareFrom,'2026-09-07');assert.equal(out.up[0].compareTo,'2026-09-14');assert.equal(out.up[0].weekOf,'2026-09-21');
});

 test('existing Week reviews close the queue without losing the old schema',()=>{
  const c={profile:{id:'a',name:'Alex'},checkins:[{week_of:'2026-09-21',created_at:'2026-09-21T09:00:00Z'}]};
  const reviews={'2026-09-21':{a:{reviewedAt:'2026-09-21T10:00:00Z',note:'Private note'}}};
  assert.equal(api.dashCheckinRows([c],reviews).length,0);
  c.checkins[0].updated_at='2026-09-22T10:00:00Z';
  assert.equal(api.dashCheckinRows([c],reviews).length,1);
 });
 test('capacity carries overnight sessions into the next working day',()=>{
  const out=api.dashCapacity([{date:'2026-09-20',time:'23:30',durationMin:90,kind:'SESSION'}],[{weekday:1,start_minute:0,duration_min:120}],MONDAY);
  assert.equal(out.booked,60);assert.equal(out.free,60);assert.deepEqual(out.days[0].free,[[60,120]]);
 });

test('capacity counts only remaining working time today',()=>{
  const out=api.dashCapacity([{date:'2026-09-21',time:'09:00',durationMin:60,kind:'SESSION'}],[{weekday:1,start_minute:540,duration_min:300}],new Date(2026,8,21,12,30));
  assert.equal(out.available,90);assert.equal(out.booked,0);assert.deepEqual(out.days[0].free,[[750,840]]);
});

test('capacity intersects real instants through fall-back and spring-forward clock changes',()=>{
  const before=process.env.TZ;process.env.TZ='America/New_York';
  try {
    const slots=[{weekday:0,start_minute:0,duration_min:240}];
    const fall=api.dashCapacity([{scheduledAt:'2026-11-01T01:30:00-04:00',durationMin:90,kind:'SESSION'}],slots,new Date(2026,10,1));
    assert.equal(fall.available,300);assert.equal(fall.booked,90);assert.equal(fall.free,210);assert.equal(fall.days[0].clockChange,true);
    const spring=api.dashCapacity([{scheduledAt:'2026-03-08T01:30:00-05:00',durationMin:90,kind:'SESSION'}],slots,new Date(2026,2,8));
    assert.equal(spring.available,180);assert.equal(spring.booked,90);assert.equal(spring.free,90);
  } finally { if(before==null) delete process.env.TZ;else process.env.TZ=before; }
});
