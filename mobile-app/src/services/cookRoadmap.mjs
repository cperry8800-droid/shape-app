import { BS_ORCH } from './cookOrchestrator.mjs';
const stepMinutes = meta => Number.isFinite(meta?.min) && meta.min > 0 ? meta.min : BS_ORCH.activeStepMin;
const rowState = (done, skipped, current, holds, now) => ({
  state: holds.some(h => h.endsAt > now) ? 'holding' : done ? 'done' : skipped ? 'skipped' : current ? 'current' : 'upcoming',
  current,
  done,
  remaining: Math.max(0, ...holds.map(h => (h.endsAt - now) / 60000)),
});

// Read-only projections: opening the roadmap never moves a cursor or starts a timer.
export function bsSoloRoadmap(cookable, { phase, stepIdx, visited = {}, skippedSteps = {}, timers = [], now = Date.now() }, prep = null) {
  const items = prep?.items?.length ? prep.items : [{ key: 'solo', cookable }];
  const active = prep?.items?.length ? prep.index : 0;
  return items.flatMap((item, dishIndex) => {
    const here = dishIndex === active;
    const saved = here ? { visited, skippedSteps } : prep?.progress?.[item.key];
    const holds = here ? timers : (prep?.carried || []).filter(h => h.dishIndex === dishIndex);
    return item.cookable.steps.map((text, i) => ({
      id: `${item.key}:${i}`, dish: item.cookable.title, step: i + 1, text,
      min: stepMinutes(item.cookable.stepMeta?.[i]),
      timed: Number.isFinite(item.cookable.stepMeta?.[i]?.min) && item.cookable.stepMeta[i].min > 0,
      ...rowState(!!saved?.visited?.[i], !!saved?.skippedSteps?.[i], here && phase === 'method' && i === stepIdx,
        holds.filter(h => h.stepIdx === i), now),
    }));
  });
}

export function bsBoardRoadmap(timeline, cursor, timers = [], now = Date.now()) {
  return timeline.map((event, i) => ({
    id: `${event.iid}:${event.stepIndex}`, dish: event.title, step: event.stepIndex + 1,
    text: event.text, min: stepMinutes(event), timed: Number.isFinite(event.min) && event.min > 0, at: event.at, station: event.station,
    ...rowState(i < cursor, false, i === cursor, timers.filter(h => !h.soft && h.iid === event.iid &&
      (h.recipeStep != null ? h.recipeStep === event.stepIndex : h.stepIndex === i)), now),
  }));
}

export function bsRoadmapPercent(rows) {
  const total = rows.reduce((n, r) => n + r.min, 0);
  const earned = rows.reduce((n, r) => n + (r.done ? Math.max(0, r.min - r.remaining) : 0), 0);
  return bsVisibleCookPercent(total ? earned / total * 100 : 0, rows);
}

export function bsVisibleCookPercent(percent, rows) {
  const unfinished = rows.some(r => r.state !== 'done');
  return Math.max(0, Math.min(unfinished ? 99 : 100, Math.round(Number(percent) || 0)));
}
