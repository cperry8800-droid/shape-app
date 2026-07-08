import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BS_STARTER_SESSIONS,
  BS_STARTER_PROGRAMS,
  bsStarterProgram,
  bsValidSessionShape,
  bsValidProgramShape,
} from '../mobile-app/src/services/starterTemplates.mjs';

test('sessions: 10 valid shapes, unique ids', () => {
  assert.equal(BS_STARTER_SESSIONS.length, 10);
  assert.ok(BS_STARTER_SESSIONS.every(bsValidSessionShape), 'every session validates');
  assert.equal(new Set(BS_STARTER_SESSIONS.map((s) => s.id)).size, 10, 'ids unique');
});

test('sessions: each move is a lift (sets+reps) or a segment (seg)', () => {
  for (const s of BS_STARTER_SESSIONS) {
    for (const m of s.moves) {
      const isLift = m.sets != null && m.reps != null;
      const isSeg = typeof m.seg === 'string' && m.seg.length > 0;
      assert.ok(isLift || isSeg, `${s.id} move "${m.name}" is a lift or a segment`);
    }
  }
});

test('programs: 6 valid shapes with a build() fn and unique ids', () => {
  assert.equal(BS_STARTER_PROGRAMS.length, 6);
  assert.ok(BS_STARTER_PROGRAMS.every((p) => typeof p.build === 'function'));
  assert.equal(new Set(BS_STARTER_PROGRAMS.map((p) => p.id)).size, 6);
  for (const p of BS_STARTER_PROGRAMS) {
    assert.ok(bsValidProgramShape(bsStarterProgram(p.id, p.defaultWeeks)), `${p.id} builds a valid schedule`);
  }
});

test('marathon: default 16 weeks, taper — final long run shorter than peak', () => {
  const p = BS_STARTER_PROGRAMS.find((x) => x.id === 'marathon');
  assert.equal(p.defaultWeeks, 16);
  const sched = bsStarterProgram('marathon', 16);
  assert.equal(sched.weeks.length, 16);
  const longMiOf = (wk) =>
    Math.max(
      0,
      ...sched.weeks[wk].days.flatMap((d) =>
        d.moves.map((m) => Number((String(m.seg || '').match(/(\d+)\s*mi/) || [])[1]) || 0),
      ),
    );
  assert.ok(longMiOf(15) < longMiOf(12), 'final long run < peak long run (taper)');
  assert.ok(longMiOf(12) > longMiOf(0), 'peak long run > week-1 long run (build)');
});

test('bsStarterProgram clamps weeks to 1..26 and null for unknown id', () => {
  assert.equal(bsStarterProgram('marathon', 40).weeks.length, 26);
  assert.equal(bsStarterProgram('marathon', 0).weeks.length, 1);
  assert.equal(bsStarterProgram('marathon', -5).weeks.length, 1);
  assert.equal(bsStarterProgram('nope', 8), null);
});

test('every program day carries dow 0..6 and a title', () => {
  for (const p of BS_STARTER_PROGRAMS) {
    const sched = bsStarterProgram(p.id, p.defaultWeeks);
    for (const wk of sched.weeks) {
      for (const d of wk.days) {
        assert.ok(Number.isInteger(d.dow) && d.dow >= 0 && d.dow <= 6, `${p.id} dow in range`);
        assert.ok(typeof d.title === 'string' && d.title.length > 0, `${p.id} day has a title`);
      }
    }
  }
});

test('hyrox: a day mixes a lift row and a segment row', () => {
  const sched = bsStarterProgram('hyrox', 8);
  const anyMixedDay = sched.weeks
    .flatMap((wk) => wk.days)
    .some((d) => d.moves.some((m) => m.seg) && d.moves.some((m) => m.sets != null));
  assert.ok(anyMixedDay, 'at least one hyrox day mixes lift + segment rows');
});

test('triathlon: rotates swim / bike / run disciplines and has a brick', () => {
  const sched = bsStarterProgram('tri-sprint', 12);
  const titles = sched.weeks.flatMap((wk) => wk.days.map((d) => d.title.toLowerCase())).join(' ');
  assert.ok(/swim/.test(titles) && /bike|ride/.test(titles) && /run/.test(titles), 'all three disciplines present');
  assert.ok(/brick/.test(titles), 'has a brick day');
});
