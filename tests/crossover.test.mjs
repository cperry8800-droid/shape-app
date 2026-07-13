// THE CROSSOVER (spec 2026-07-13) — deterministic vectors for the exact
// statistic: floors (span + per-side days), the 12pp + 1.65·SE gate, the
// [6.5, 7) sleep exclusion band, missing-value handling, and both
// directions. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DashSignals = require("../public/newdesign/dashSignals.js");
const { crossoverRead } = DashSignals;

// Build a run of consecutive days starting 2026-06-01. `mk(i)` decides each
// day's fields; every day schedules 1 work habit unless overridden.
const days = (n, mk) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10);
  return { d, workHabitScheduled: 1, workHabitDone: 0, trained: false, sleepHours: null, ...mk(i) };
});

test("a strong training association fires with the exact gap", () => {
  // 28 days, alternating: trained days complete the habit (14/14), rest days
  // rarely do (2/14) — gap ≈ +86pp, far past 12pp and 1.65·SE.
  const r = crossoverRead(days(28, (i) => (i % 2 === 0
    ? { trained: true, workHabitDone: 1 }
    : { trained: false, workHabitDone: i < 4 ? 1 : 0 })));
  assert.ok(r.training);
  assert.equal(r.training.gap, 86);
  assert.equal(r.training.nA, 14);
  assert.equal(r.training.nB, 14);
  assert.equal(r.sleep, null); // no sleep data anywhere → sleep comparison silent
});

test("floors: a short span or a thin side returns null (renders nothing)", () => {
  // 20-day span — one day under the 21-day floor.
  const short = crossoverRead(days(20, (i) => ({ trained: i % 2 === 0, workHabitDone: i % 2 === 0 ? 1 : 0 })));
  assert.equal(short.training, null);
  // 28 days but only 5 trained days — under the 8-per-side floor.
  const thin = crossoverRead(days(28, (i) => ({ trained: i < 5, workHabitDone: i < 5 ? 1 : 0 })));
  assert.equal(thin.training, null);
});

test("the statistical gate: a small gap never fires, even over a long span", () => {
  // 40 days, 20/20 split, completion 60% vs 55% — a 5pp gap is honest noise.
  const r = crossoverRead(days(40, (i) => (i % 2 === 0
    ? { trained: true, workHabitDone: (i / 2) % 5 < 3 ? 1 : 0 }      // 12/20 = 60%
    : { trained: false, workHabitDone: ((i - 1) / 2) % 20 < 11 ? 1 : 0 }))); // 11/20 = 55%
  assert.equal(r.training, null);
});

test("sleep bands: [6.5, 7) is excluded; missing sleep only skips the sleep read", () => {
  // 30 days: long sleepers complete (10/10), short sleepers don't (1/10);
  // 5 days sit in the exclusion band and 5 have no sleep data — none of
  // those 10 may enter the comparison.
  const r = crossoverRead(days(30, (i) => {
    if (i < 10) return { sleepHours: 7.5, workHabitDone: 1 };
    if (i < 20) return { sleepHours: 6, workHabitDone: i === 10 ? 1 : 0 };
    if (i < 25) return { sleepHours: 6.7, workHabitDone: 1 }; // separation band — excluded
    return { sleepHours: null, workHabitDone: 1 };            // missing — excluded
  }));
  assert.ok(r.sleep);
  assert.equal(r.sleep.nA, 10); // long side counts ONLY the ≥7h days
  assert.equal(r.sleep.nB, 10); // short side counts ONLY the <6.5h days
  assert.equal(r.sleep.gap, 90);
});

test("both directions report; days without a scheduled work habit never enter", () => {
  // Rest days complete MORE than training days → a negative gap, reported
  // neutrally. 10 extra days with nothing scheduled must change nothing.
  const base = days(28, (i) => (i % 2 === 0
    ? { trained: true, workHabitDone: 0 }
    : { trained: false, workHabitDone: 1 }));
  const noise = days(10, () => ({ workHabitScheduled: 0, trained: true, workHabitDone: 0 }));
  const r = crossoverRead(base.concat(noise));
  assert.ok(r.training);
  assert.equal(r.training.gap, -100);
});

test("empty/garbage input is a silent null pair", () => {
  assert.deepEqual(crossoverRead(null), { training: null, sleep: null });
  assert.deepEqual(crossoverRead([{ workHabitScheduled: 1 }]), { training: null, sleep: null }); // no date
});

test("crossoverCopy binds the computed numbers into shared wording (no drift)", () => {
  const { crossoverCopy } = DashSignals;
  const rows = crossoverCopy({ training: { gap: 34, pA: 80, pB: 46, nA: 12, nB: 12 }, sleep: { gap: -15, pA: 50, pB: 65, nA: 10, nB: 9 } });
  assert.equal(rows.length, 2);
  assert.ok(rows[0].text.includes("34 pts more often on days you train"));
  assert.equal(rows[0].sub, "Training days 80% · rest days 46%");
  assert.ok(rows[1].text.includes("15 pts more often on short-sleep days"));
  assert.ok(rows[1].text.startsWith("They land")); // training row introduced the subject
  // A sleep-only read spells the subject out — no dangling pronoun.
  const solo = crossoverCopy({ training: null, sleep: { gap: 20, pA: 70, pB: 50, nA: 10, nB: 10 } });
  assert.equal(solo.length, 1);
  assert.ok(solo[0].text.startsWith("Your work habits land"));
  assert.deepEqual(crossoverCopy({ training: null, sleep: null }), []);
  assert.deepEqual(crossoverCopy(null), []);
});
