import test from 'node:test';
import assert from 'node:assert/strict';
import { bsScoreStanding, bsPeakCheckpoint } from '../mobile-app/src/services/scoreStanding.mjs';

const TIERS = [
  { name: 'Raw', range: '0+' },
  { name: 'Tempo', range: '750+' },
  { name: 'Form', range: '2,000+' },
  { name: 'Peak', range: '5,000+' },
  { name: 'Legend', range: '15,000+' },
];

test('mid-tier: 1,284 in Tempo -> 43% of the 750->2,000 lane', () => {
  const s = bsScoreStanding(TIERS, 'Tempo', 1284);
  assert.equal(s.laneIndex, 1);
  assert.equal(s.laneCount, 5);
  assert.equal(s.curThr, 750);
  assert.equal(s.nextThr, 2000);
  assert.equal(s.pct, 43);
  assert.equal(s.toNext, 716);
  assert.equal(s.topTier, false);
  assert.equal(s.atRisk, false);
  assert.equal(s.nextName, 'Form');
});

test('exact threshold: 2,000 sits at Form lane start (frac 0)', () => {
  const s = bsScoreStanding(TIERS, 'Form', 2000);
  assert.equal(s.laneIndex, 2);
  assert.equal(s.frac, 0);
  assert.equal(s.toNext, 3000);
});

test('top tier: Legend -> full bar, no next', () => {
  const s = bsScoreStanding(TIERS, 'Legend', 21000);
  assert.equal(s.laneIndex, 4);
  assert.equal(s.topTier, true);
  assert.equal(s.frac, 1);
  assert.equal(s.pct, 100);
  assert.equal(s.toNext, 0);
  assert.equal(s.nextName, '');
});

test('at-risk: rank below the current (high-water) tier floor -> frac clamps to 0', () => {
  // Tier held at Tempo (never demotes) but the rank slipped under 750.
  const s = bsScoreStanding(TIERS, 'Tempo', 600);
  assert.equal(s.laneIndex, 1);
  assert.equal(s.atRisk, true);
  assert.equal(s.frac, 0);
});

test('top tier but below floor (high-water Legend, penalised) -> empty, at-risk', () => {
  const s = bsScoreStanding(TIERS, 'Legend', 12000);
  assert.equal(s.laneIndex, 4);
  assert.equal(s.topTier, true);
  assert.equal(s.atRisk, true);
  assert.equal(s.frac, 0);
  assert.equal(s.pct, 0);
  assert.equal(s.toNext, 0);
});

test('coach ladder names resolve the same way', () => {
  const COACH = [
    { name: 'Certified', range: '0+' },
    { name: 'Pro', range: '750+' },
    { name: 'Elite', range: '2,000+' },
    { name: 'Master', range: '5,000+' },
    { name: 'Icon', range: '15,000+' },
  ];
  const s = bsScoreStanding(COACH, 'Pro', 1000);
  assert.equal(s.laneIndex, 1);
  assert.equal(s.nextName, 'Elite');
  assert.equal(s.curThr, 750);
});

test('malformed / missing tier name -> laneIndex 0, no crash', () => {
  const s = bsScoreStanding(TIERS, 'Nonsense', 1284);
  assert.equal(s.laneIndex, 0);
  assert.equal(Number.isFinite(s.frac), true);
});

test('empty tiers -> safe zeros', () => {
  const s = bsScoreStanding([], 'Tempo', 1284);
  assert.equal(s.laneIndex, 0);
  assert.equal(s.laneCount, 0);
  assert.equal(s.topTier, true); // nothing above -> treat as top
});

test('peak checkpoint: only inside the Peak lane, reached at 10k, null elsewhere', () => {
  const tiers = [
    { name: 'Raw', range: '0+' }, { name: 'Tempo', range: '750+' },
    { name: 'Form', range: '2,000+' }, { name: 'Peak', range: '5,000+' },
    { name: 'Legend', range: '15,000+' },
  ];
  const below = bsPeakCheckpoint(tiers, 'Peak', 8200);
  assert.equal(below.reached, false);
  assert.equal(below.toGo, 1800);
  assert.ok(Math.abs(below.laneFrac - 0.5) < 1e-9);          // 10k is halfway through 5k→15k
  const above = bsPeakCheckpoint(tiers, 'Peak', 12000);
  assert.equal(above.reached, true);
  assert.equal(above.toGo, 0);
  assert.equal(bsPeakCheckpoint(tiers, 'Form', 2500), null);  // other lanes: no marker
  assert.equal(bsPeakCheckpoint(tiers, 'Legend', 16000), null); // top tier: no marker
  assert.equal(bsPeakCheckpoint(tiers, 'Raw', 100), null);
});
