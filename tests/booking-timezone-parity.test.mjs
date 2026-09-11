// The browser and server halves of the booking-timezone fix must agree.
//
// ⚠ THERE ARE THREE COPIES OF THE ZONED-INSTANT ALGORITHM AND THE DUPLICATION IS FORCED,
// NOT CHOSEN. public/newdesign/bookingSlots.js is a plain browser <script> on a surface
// with no bundler, so it cannot import src/lib/time.ts; the mobile bundle is a separate
// Vite build that cannot reach the website's public dir; and the consultation route runs
// in Node and can use neither client module. What makes three copies acceptable is this
// file: it drives ALL THREE over the same matrix and requires identical answers, so a
// change made to one and not the others fails here — rather than showing a member one
// time in the app, another on the website, and a third in their confirmation mail, which
// is precisely what this fix was for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const B = require_('../public/newdesign/bookingSlots.js');

// The server half is TypeScript, imported directly — Node strips types natively here,
// and the rest of the suite imports src/lib/*.ts the same way. Importing the REAL module
// is the point: a restatement in this file would test the restatement.
import { instantInZone } from '../src/lib/time.ts';
import { bsInstantInZone, bsIsZone } from '../mobile-app/src/services/coachAvailability.mjs';

const ZONES = [
  'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo',
  'Australia/Sydney', 'Australia/Lord_Howe', 'Pacific/Kiritimati', 'Pacific/Midway',
  'Africa/Lagos', 'America/St_Johns',
];

// Dates chosen to straddle every DST transition the zones above have, plus ordinary days.
const DATES = [
  '2026-01-15', '2026-03-08', '2026-03-29', '2026-04-05', '2026-06-21',
  '2026-09-17', '2026-10-04', '2026-10-25', '2026-11-01', '2026-12-31',
];
const MINUTES = [0, 1, 30, 60, 90, 120, 150, 180, 330, 540, 720, 1020, 1410, 1439];

test('all three zoned-instant implementations agree exactly', () => {
  let compared = 0, refusedBoth = 0;
  for (const zone of ZONES) {
    for (const dateStr of DATES) {
      const [y, mo, d] = dateStr.split('-').map(Number);
      for (const m of MINUTES) {
        const h = Math.floor(m / 60), mi = m % 60;
        const server = instantInZone(y, mo, d, h, mi, zone);
        const mobile = bsInstantInZone(y, mo, d, h, mi, zone);
        const browserIso = B.isoForSlot(dateStr, m, zone);
        const browser = browserIso === null ? NaN : new Date(browserIso).getTime();
        const where = `${zone} ${dateStr} +${m}min`;
        if (Number.isNaN(server) && Number.isNaN(browser) && Number.isNaN(mobile)) {
          refusedBoth++; compared++; continue;
        }
        assert.equal(browser, server, `browser vs server disagreed for ${where}`);
        assert.equal(mobile, server, `mobile vs server disagreed for ${where}`);
        compared++;
      }
    }
  }
  // ⚠ A PARITY SWEEP THAT COMPARED NOTHING PASSES. Assert the matrix was really walked,
  // and that it really reached the spring-forward gap both sides must refuse — without
  // that, two implementations could agree only by both returning null for everything.
  assert.equal(compared, ZONES.length * DATES.length * MINUTES.length);
  assert.ok(refusedBoth > 0, 'the matrix never reached a nonexistent wall time — the round-trip refusal is untested');
});

test('all three refuse a zone no runtime knows', () => {
  for (const bad of ['Not/AZone', 'Area/Nowhere', '', 'Mars/Olympus', null, undefined, 42]) {
    assert.equal(B.isoForSlot('2026-09-17', 540, bad), null, `browser accepted ${JSON.stringify(bad)}`);
    assert.ok(Number.isNaN(instantInZone(2026, 9, 17, 9, 0, bad)), `server accepted ${JSON.stringify(bad)}`);
    assert.ok(Number.isNaN(bsInstantInZone(2026, 9, 17, 9, 0, bad)), `mobile accepted ${JSON.stringify(bad)}`);
    assert.equal(B.isZone(bad), false, `browser isZone accepted ${JSON.stringify(bad)}`);
    assert.equal(bsIsZone(bad), false, `mobile isZone accepted ${JSON.stringify(bad)}`);
  }
});
