// Where a scheduled run starts among the n people it works through, so runs that meet their time limit
// reach everyone over the next runs: the hourly Nora job (/api/ai/notify/cron) and the daily Score
// job (/api/cron/score-accountability). `period` counts the runs (hours since 1970, or days).
//
// Each run moves on by the golden ratio of the list, a sequence whose starts spread evenly: with
// 1,000 of 10,000 reached a run, everyone is reached within 13 runs (10 at the least).
// ⚠ NOT ONE PLACE FURTHER EACH RUN (Codex on #2476). With 1,000 of 10,000 reached in a run, that re-read
// nearly the same 1,000 the next time, and the last people waited some 9,000 runs.
const GOLDEN = (Math.sqrt(5) - 1) / 2;

export function rotationStart(period, n) {
  return n > 0 ? Math.floor(((period * GOLDEN) % 1) * n) % n : 0;
}

// The list from that start, wrapping round.
export function rotated(list, period) {
  const start = rotationStart(period, list.length);
  return list.slice(start).concat(list.slice(0, start));
}
