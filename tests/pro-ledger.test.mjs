import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsProMin, bsProHourLabel, bsProGapLabel, bsProDurationFromSub,
  bsProDayShape, bsProAttentionBudget, bsProLeadVerdict,
} from '../mobile-app/src/services/proLedger.mjs';

test('bsProMin parses HH:MM and rejects junk', () => {
  assert.equal(bsProMin('07:00'), 420);
  assert.equal(bsProMin('13:05'), 785);
  assert.equal(bsProMin('—'), null);
  assert.equal(bsProMin('25:00'), null);
  assert.equal(bsProMin(null), null);
});

test('bsProHourLabel renders 12h ledger labels', () => {
  assert.equal(bsProHourLabel('07:00'), '7A');
  assert.equal(bsProHourLabel('08:30'), '8:30');
  assert.equal(bsProHourLabel('13:00'), '1P');
  assert.equal(bsProHourLabel('12:00'), '12P');
});

test('bsProGapLabel floors both ends to 12h hours', () => {
  assert.equal(bsProGapLabel(12 * 60, 14 * 60), '12 – 2 · OPEN');
});

test('bsProDurationFromSub parses "· 60m"-style embedded durations', () => {
  assert.equal(bsProDurationFromSub('Lower Pull · 60m'), 60);
  assert.equal(bsProDurationFromSub('Conditioning · 45m'), 45);
  assert.equal(bsProDurationFromSub('Form check · 6 clips'), null);
  assert.equal(bsProDurationFromSub(null), null);
});

const BK = (time, client, extra = {}) => ({ time, title: client, client, ...extra });

test('dayShape: gaps ≥90min only, default 60min duration', () => {
  const d = bsProDayShape([BK('07:00', 'A'), BK('08:30', 'B'), BK('12:00', 'C')]);
  assert.equal(d.gaps.length, 1);                      // 9:30→12:00 = 150min; 8:00→8:30 = 30min ignored
  assert.equal(d.gaps[0].startMin, 9 * 60 + 30);
  assert.equal(d.gaps[0].endMin, 12 * 60);
});

test('dayShape: openHours needs ≥2 bookings, sums whole hours of ≥60min gaps', () => {
  assert.equal(bsProDayShape([BK('07:00', 'A')]).openHours, null);
  const d = bsProDayShape([BK('07:00', 'A'), BK('10:00', 'B', { durationMin: 60 }), BK('13:30', 'C')]);
  assert.equal(d.openHours, 4);                        // 8:00→10:00 (120) + 11:00→13:30 (150) = 270 → 4h
});

test('dayShape: countdown skips done, formats <60m and ≥60m, DAY CLEAR after last', () => {
  const rows = [BK('07:00', 'Alex Rivera', { state: 'done' }), BK('10:00', 'Riley Kim')];
  assert.equal(bsProDayShape(rows, { h: 9, m: 12 }).countdown, '48M UNTIL RILEY');
  assert.equal(bsProDayShape(rows, { h: 7, m: 30 }).countdown, '2H 30M UNTIL RILEY');
  assert.equal(bsProDayShape(rows, { h: 11, m: 0 }).countdown, 'DAY CLEAR');
});

const TR = (name, severity, directive, clientId) => ({ name, severity, directive, clientId });

test('budget: lead is rank #1 and never re-listed; anchors by clientId or EXACT name', () => {
  const triage = [TR('Riley Kim', 'red', 'read the week', 'u1'), TR('Casey Lee', 'amber', 'weekend gap', 'u2'), TR('Drew', 'amber', 'checkin', null)];
  const bookings = [BK('10:00', 'Riley Kim', { clientId: 'u1' }), BK('13:00', 'Casey Lee'), BK('14:30', 'Andrew Park')];
  const b = bsProAttentionBudget(triage, bookings);
  assert.equal(b.lead.name, 'Riley Kim');
  assert.equal(b.leadAnchor, 0);
  assert.equal(b.inline.length, 1);                    // Casey by exact name
  assert.equal(b.inline[0].bookingIdx, 1);
  assert.equal(b.wires.length, 1);                     // 'Drew' must NOT substring-match 'Andrew Park'
  assert.equal(b.wires[0].name, 'Drew');
  assert.equal(b.demoted.length, 0);
});

test('budget: caps inline+wires at max, overflow demotes in rank order', () => {
  const triage = [TR('L', 'red', 'x'), TR('A', 'amber', 'x'), TR('B', 'amber', 'x'), TR('C', 'new', 'x'), TR('D', 'new', 'x')];
  const b = bsProAttentionBudget(triage, [], 3);
  assert.equal(b.wires.length, 3);
  assert.deepEqual(b.demoted.map((x) => x.name), ['D']);
});

test('lead verdicts: top-flag, bookings-only, clear-day; null when signed out', () => {
  assert.equal(bsProLeadVerdict({ signedIn: false, sessions: 3 }), null);
  assert.equal(bsProLeadVerdict({ signedIn: true, sessions: 8, firstLabel: '7A', top: TR('Riley Kim', 'red', 'Logs quiet 3 days — read the week before the refeed.') }),
    'Riley Kim first — Logs quiet 3 days — read the week before the refeed.');
  assert.equal(bsProLeadVerdict({ signedIn: true, sessions: 2, firstLabel: '7A', top: null }), '2 sessions — first at 7A.');
  assert.equal(bsProLeadVerdict({ signedIn: true, sessions: 0, firstLabel: null, top: null }), 'Nothing booked, nobody flagged — a clear day.');
});
