import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWorkoutPlan, normalizeWorkoutDetail, builderToAssignmentRows, builderToOutlineBlocks} from '../public/newdesign/workoutDocument.mjs';

const video='https://example.com/squat.mp4';
test('legacy app workout becomes a lossless shared coach document',()=>{
  const plan=normalizeWorkoutPlan({id:'same-id',kind:'program',name:'Lower',detail:{buildType:'workout',note:'Keep it easy',blocks:[{text:'Back squat — 3 × 8 · 135 lb',video,cue:'Brace',rest:'90s',tempo:'3010',group:'A'}]}});
  const row=plan.detail.builder.weeks[0].days[0].blocks[0].rows[0];
  assert.equal(plan.id,'same-id');assert.equal(plan.detail.note,'Keep it easy');
  assert.equal(row.loadType,'lb');assert.equal(row.load,135);assert.equal(row.video,video);
  const sent=builderToAssignmentRows(plan.detail.builder,{id:plan.id,name:plan.name,revision:7},'2026-09-21')[0];
  assert.equal(sent.payload.exercises[0].load,'135 lb');assert.equal(sent.payload.exercises[0].video,video);
  assert.equal(sent.payload.exercises[0].cue,'Brace');assert.equal(sent.payload.exercises[0].group,'A');
  assert.equal(sent.payload.template.version,7);
  assert.equal(builderToOutlineBlocks(plan.detail.builder)[0].video,video);
});
test('weekday calendar preserves rest days across DST and weeks',()=>{
  const detail=normalizeWorkoutDetail({builder:{version:2,weeks:[{days:[{name:'Upper',weekday:0,blocks:[]},{name:'Lower',weekday:3,blocks:[]}]},{days:[{name:'Upper',weekday:0,blocks:[]}]}]}});
  assert.deepEqual(builderToAssignmentRows(detail.builder,null,'2026-10-26').map(x=>x.scheduledDate),['2026-10-26','2026-10-29','2026-11-02']);
});
test('legacy phase outlines never turn into fake exercises',()=>{
  const detail=normalizeWorkoutDetail({blocks:[{text:'Week 1 — Base'},{text:'Week 4 — Peak'}]});
  assert.equal(detail.builder.outlineOnly,true);
  assert.equal(builderToOutlineBlocks(detail.builder).length,0);
  assert.equal(detail.blocks[1].text,'Week 4 — Peak');
});
test('normalization is idempotent, retains instructions and removes unsafe video URLs',()=>{
  const detail=normalizeWorkoutDetail({blocks:[{text:'Squat — 3 × 5',video:'javascript:alert(1)'}]});
  assert.deepEqual(normalizeWorkoutDetail(detail),detail);
  assert.equal(detail.builder.weeks[0].days[0].blocks[0].rows[0].video,'');
});
test('assignment is a detached snapshot and retains explicit session load capture',()=>{
  const detail=normalizeWorkoutDetail({blocks:[{text:'Squat — 3 × 5',video}]});
  const day=detail.builder.weeks[0].days[0];Object.assign(day,{plannedMinutes:45,plannedRpe:7,loadCapture:'per_session'});
  const out=builderToAssignmentRows(detail.builder,{id:'p'},'2026-09-21');
  assert.equal(out[0].payload.plannedMinutes,45);assert.equal(out[0].plannedRpe,7);
  day.blocks[0].rows[0].video='https://example.com/changed.mp4';
  assert.equal(out[0].payload.exercises[0].video,video);
});

test('legacy AMRAP and timed prescriptions round-trip as reps, never as loads',()=>{
  for (const [text,expected] of [['Pull-up — 3 × AMRAP','AMRAP'],['Plank — 3 × 30s','30s'],['Carry — 4 × 45 sec','45 sec'],['Split squat — 3 × 8 each','8 each'],['Hold — 2 × 1 min','1 min']]) {
    const detail=normalizeWorkoutDetail({blocks:[{text,video,cue:'Keep form'}]});
    const row=detail.builder.weeks[0].days[0].blocks[0].rows[0];
    assert.equal(row.reps,expected);assert.equal(row.loadText,'');
    const assigned=builderToAssignmentRows(detail.builder,null,'2026-09-21')[0].payload.exercises[0];
    assert.equal(assigned.reps,expected);assert.equal(assigned.video,video);assert.equal(assigned.cue,'Keep form');assert.equal(assigned.load,'');
    assert.equal(builderToOutlineBlocks(detail.builder)[0].reps,expected);
  }
});

test('mixed legacy phase, weekday and note outlines never become weekday-named exercises',()=>{
  const blocks=[{text:'Week 1 — Base',note:'Coach phase note'},{text:'Mon — Upper',plannedMinutes:45,plannedRpe:7},{text:'Tue — Lower',video},{text:'Thu — Upper'},{text:'Keep one rep in reserve'}];
  const detail=normalizeWorkoutDetail({buildType:'program',blocks});
  assert.equal(detail.builder.outlineOnly,true);
  assert.equal(detail.builder.weeks[0].days.length,3);
  assert.equal(builderToOutlineBlocks(detail.builder).length,0);
  assert.deepEqual(detail.blocks,blocks);
  const phase=normalizeWorkoutDetail({blocks:[{text:'Week 1 — Base'},{text:'Week 4 — Peak'},{text:'Coach instructions'}]});
  assert.equal(phase.builder.outlineOnly,true);
  assert.equal(builderToOutlineBlocks(phase.builder).length,0);
  assert.equal(phase.blocks[2].text,'Coach instructions');
});
