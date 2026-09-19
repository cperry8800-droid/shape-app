export const BS_BATCH_KEY = 'shape.cookBatchResume';
export function bsBatchResume(value, owner, now = Date.now()) {
  if (!value || value.version !== 1 || value.owner !== owner || !Number.isFinite(value.savedAt) || value.savedAt > now || now - value.savedAt > 86400000) return null;
  if (!Number.isFinite(value.anchor) || value.anchor > now || !Array.isArray(value.items) || !value.items.length || value.items.length > 30) return null;
  if (value.items.some(it => !it?.key || !Array.isArray(it.cookable?.steps) || !it.cookable.steps.length)) return null;
  const timeline = value.timeline;
  if (!Array.isArray(timeline) || !timeline.length || timeline.length > 500) return null;
  if (timeline.some(e => !Number.isInteger(e.iid) || !Number.isInteger(e.stepIndex) || e.stepIndex < 0 || !Number.isFinite(e.at) || !value.items.some(it => it.key === e.recipe && it.cookable.steps[e.stepIndex] === e.text))) return null;
  if (!Number.isInteger(value.cursor) || value.cursor < 0 || value.cursor >= timeline.length) return null;
  const timers = (Array.isArray(value.timers) ? value.timers : []).filter(t => Number.isSafeInteger(t?.id) && t.id > 0 && Number.isFinite(t.endsAt) && Number.isFinite(t.total) && t.total > 0 && t.total <= 86400 && t.endsAt <= now + t.total * 1000 && timeline.some(e => e.iid === t.iid && e.recipe === t.recipeKey));
  return { ...value, livePlan: Number.isFinite(value.livePlan?.serveAt) ? { timeline, serveAt: value.livePlan.serveAt, spread: Math.max(0, Number(value.livePlan.spread) || 0) } : null, timers, started: Array.isArray(value.started) ? value.started.filter(x => typeof x === 'string') : [], recorded: Array.isArray(value.recorded) ? value.recorded.filter(x => typeof x === 'string') : [] };
}
export function bsReadBatch(storage, owner, now = Date.now()) {
  try { return bsBatchResume(JSON.parse(storage.getItem(BS_BATCH_KEY)), owner, now); } catch { return null; }
}
export function bsWriteBatch(storage, value, owner, now = Date.now()) {
  try { storage.setItem(BS_BATCH_KEY, JSON.stringify({ ...value, version: 1, owner, savedAt: now })); return true; } catch { return false; }
}
