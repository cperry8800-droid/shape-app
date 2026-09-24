import { normalizeWorkoutPlan, normalizeWorkoutDetail, builderToOutlineBlocks, videoUrl } from '../../../public/newdesign/workoutDocument.mjs';
import { bsAssignMonday, bsAssignIso } from './planOutline.mjs';

const copy = (value) => JSON.parse(JSON.stringify(value));

export function knownWorkoutAverage(rows, snakeKey, camelKey) {
  const values = (rows || []).filter((row) => row.completed !== false).map((row) => row[snakeKey] ?? row[camelKey])
    .filter((value) => value != null && value !== '' && Number.isFinite(Number(value))).map(Number);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

// One classification for both fetched rows and a just-saved row. In particular,
// a website template has no legacy buildType until the normalizer supplies it.
export function coachWorkoutLibrary(rows) {
  const plans = (Array.isArray(rows) ? rows : []).filter((p) => p && p.kind !== 'meal_plan').map(normalizeWorkoutPlan);
  return {
    all: plans,
    plans: plans.filter((p) => p.detail.buildType === 'plan'),
    workouts: plans.filter((p) => p.detail.buildType === 'workout'),
    programs: plans.filter((p) => p.detail.buildType !== 'plan' && p.detail.buildType !== 'workout'),
  };
}

export function duplicateWorkoutPlan(plan, name) {
  return {
    kind: 'program', published: false, name: name || `${plan.name} (copy)`,
    meta: plan.meta || '', price: plan.price || null,
    detail: copy(normalizeWorkoutDetail(plan.detail, { name: plan.name })),
  };
}

// Clips already attached anywhere in the coach's own library are reusable.
// Walk both shapes so a clip is available before its legacy plan is edited.
export function coachWorkoutVideos(plans) {
  const found = new Map();
  const add = (value, name) => {
    const url = videoUrl(value);
    if (!url || found.has(url)) return;
    found.set(url, { url, type: 'video', name: (value && value.name) || name || 'Exercise video' });
  };
  for (const p of Array.isArray(plans) ? plans : []) {
    const detail = p?.detail || {};
    add(detail.builder?.video, (p.name || 'Program')+' · Introduction');
    for (const media of detail.media || []) if (media?.type === 'video') add(media, p.name);
    for (const block of detail.blocks || []) add(block?.video, block?.name || block?.text || p.name);
    for (const week of detail.builder?.weeks || []) for (const day of week.days || []) {
      add(day.video, (day.name || 'Workout')+' · Walkthrough');
      for (const block of day.blocks || []) for (const row of block.rows || []) add(row.video, row.name || p.name);
    }
  }
  return [...found.values()];
}

export function coachWorkoutDraftKey(uid, id, type) {
  return `shape.coach.workout-draft.v1:${encodeURIComponent(uid || 'preview')}:${encodeURIComponent(id || `new-${type || 'program'}`)}`;
}

export function groupWorkoutUpdates(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const date = new Date(`${row.scheduledDate}T00:00:00`);
    if (!row.clientId || !Number.isFinite(date.getTime())) throw new Error('A future workout is missing its client or date. Reload the preview.');
    const key = `${row.clientId}:${bsAssignIso(bsAssignMonday(date))}`;
    if (!groups.has(key)) groups.set(key, { clientId: row.clientId, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}

export function workoutAssignmentsHaveExercises(rows) {
  return Array.isArray(rows) && rows.length > 0 && rows.every((row) => row.payload?.exercises?.length > 0 && row.payload.exercises.every((exercise) => String(exercise.name || '').trim()));
}

export async function persistCoachWorkout(gateway, plan) {
  if (!gateway?.create || (plan.id && !gateway.update)) throw new Error('Library is unavailable. Your draft is still here.');
  const detail = normalizeWorkoutDetail(plan.detail, { name: plan.name });
  if (!detail.builder.outlineOnly) detail.blocks = builderToOutlineBlocks(detail.builder);
  const body = { kind: 'program', name: plan.name, meta: plan.meta || `${detail.builder.weeks.length} weeks`, price: plan.price ?? null, detail, ...(plan.expectedOwnerId ? { expectedOwnerId: plan.expectedOwnerId } : {}), ...(typeof plan.published === 'boolean' ? { published: plan.published } : plan.id ? {} : { published: false }) };
  const saved = plan.id
    ? await gateway.update({ ...body, id: plan.id, expectedRevision: detail.revision ?? 0 })
    : await gateway.create({ ...body, ...(plan.creationId ? { id: plan.creationId } : {}) });
  if (!saved?.id) throw new Error('Could not save. Your draft is still here.');
  return normalizeWorkoutPlan(saved);
}
