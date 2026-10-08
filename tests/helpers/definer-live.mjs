// Compares the static model with a live-catalog fixture, and says exactly where they differ.
//
// The comparison is at NAME level because the live capture is names only. That is sound while no
// overload exists (the grants test asserts none does): a name is then one function.
//
// ONE SCOPE, stated once and shared by scripts/definer-live-check.sql, scripts/definer-live-diff.mjs
// and this file (they disagreed until this was written down):
//   anon-executability   NON-trigger definers in `public`. A function that returns trigger or
//                        event_trigger cannot be called as an RPC, so its anon grant decides nothing.
//   the search_path pin  ALL definers in `public`, trigger and event-trigger functions included: a
//                        trigger definer is exactly as exposed to a relation planted in pg_temp.
// The checked-in fixture (tests/fixtures/definer-live-2026-10-08.json) carries both lines: the
// non-trigger names by anon-executability, the trigger definers by name (`triggerDefiners`), and
// `definersWithoutPgTemp` over every definer of either kind, read by scripts/definer-live-check.sql.
// A capture also records which migrations dated its own day it had seen (`captureDayFilesApplied`),
// which is how modelAsOfCapture below draws the replay's line; the 2026-09-30 capture carried
// neither, and tests/definer-live-agreement.test.mjs says in its header what that cost.

import { definerRpcFns, anonExecutable, pgTempPinned, replayDir, orderedMigrationFiles, migrationDate } from './definer-model.mjs';

/**
 * Every way the model and the live catalog can disagree:
 *   anon-mismatch   both know the function and disagree on whether anon can execute it
 *   live-only       live has a non-trigger definer no migration creates (made outside the set)
 *   model-only      the migrations create one live does not have (dropped or never applied by hand)
 *   pin-mismatch    the model and live disagree on whether a definer's search_path lacks pg_temp
 * Each drift is { kind, name, live, model }.
 */
export function compareToLive(model, live) {
  const liveAnon = new Set(live.anonExecutable);
  const liveNo = new Set(live.notAnonExecutable);
  const liveAll = new Set([...liveAnon, ...liveNo]);

  const byName = new Map();
  for (const f of definerRpcFns(model)) byName.set(f.name, [...(byName.get(f.name) ?? []), f]);
  const modelAnon = (name) => byName.get(name).some(anonExecutable);

  const drift = [];
  let agree = 0;
  let agreeAnon = 0;
  let agreeNoAnon = 0;
  for (const name of liveAll) {
    if (!byName.has(name)) { drift.push({ kind: 'live-only', name, live: liveAnon.has(name) ? 'anon' : 'no-anon', model: 'absent' }); continue; }
    const l = liveAnon.has(name);
    const m = modelAnon(name);
    if (l === m) { agree++; if (l) agreeAnon++; else agreeNoAnon++; } else drift.push({ kind: 'anon-mismatch', name, live: l ? 'anon' : 'no-anon', model: m ? 'anon' : 'no-anon' });
  }
  for (const name of byName.keys()) if (!liveAll.has(name)) drift.push({ kind: 'model-only', name, live: 'absent', model: modelAnon(name) ? 'anon' : 'no-anon' });

  // The pin: live's list is every definer that lacks pg_temp. Compare it with the model's, over
  // ALL definers in public (trigger functions included: see the scope above), which is what that
  // list is meant to cover. A live-listed name the model has never heard of reads `absent`, not
  // `pinned`: the model has no opinion about a function it does not have.
  const liveUnpinned = new Set(live.definersWithoutPgTemp ?? []);
  const modelDefiners = [...model.fns.values()].filter((f) => f.schema === 'public' && f.definer);
  const modelUnpinned = new Set(modelDefiners.filter((f) => !pgTempPinned(f)).map((f) => f.name));
  const modelKnows = new Set(modelDefiners.map((f) => f.name));
  for (const name of new Set([...liveUnpinned, ...modelUnpinned])) {
    if (liveUnpinned.has(name) !== modelUnpinned.has(name)) {
      drift.push({ kind: 'pin-mismatch', name, live: liveUnpinned.has(name) ? 'unpinned' : 'pinned', model: !modelKnows.has(name) ? 'absent' : modelUnpinned.has(name) ? 'unpinned' : 'pinned' });
    }
  }

  // Trigger definers by name, when the capture lists them (`triggerDefiners`; the 2026-09-30 capture
  // did not). The anon comparison leaves them out on both sides (a trigger cannot be called as an
  // RPC) and the pin comparison above already covers them, so this is the one check that says the
  // model's trigger definers ARE production's: a migration never applied, or a trigger function made
  // or dropped by hand, shows up here and nowhere else.
  let triggersCompared = null;
  if (Array.isArray(live.triggerDefiners)) {
    const liveTrig = new Set(live.triggerDefiners);
    const modelTrig = new Set(modelDefiners.filter((f) => f.trigger).map((f) => f.name));
    triggersCompared = 0;
    for (const name of new Set([...liveTrig, ...modelTrig])) {
      if (liveTrig.has(name) && modelTrig.has(name)) { triggersCompared++; continue; }
      drift.push({ kind: liveTrig.has(name) ? 'trigger-live-only' : 'trigger-model-only', name, live: liveTrig.has(name) ? 'trigger definer' : 'absent', model: modelTrig.has(name) ? 'trigger definer' : 'absent' });
    }
  }

  return {
    liveNames: liveAll.size,
    modelNames: byName.size,
    compared: agree + drift.filter((d) => d.kind === 'anon-mismatch').length,
    agree, agreeAnon, agreeNoAnon,
    drift: drift.sort((a, b) => (a.kind + a.name < b.kind + b.name ? -1 : 1)),
    pinAgree: liveUnpinned.size === modelUnpinned.size && [...liveUnpinned].every((n) => modelUnpinned.has(n)),
    triggersCompared,
  };
}

const keyOf = (d) => `${d.kind}:${d.name}`;

/**
 * Drift not covered by `known` ([{ kind, name, live, model, reason }]), and known entries that
 * are not drifting any more. Both fail the test: a NEW disagreement must be read and explained
 * before it is allowed, and an explanation that no longer applies must be deleted.
 *
 * `capture` ({ capturedOn, ambiguousFiles }) names the migrations dated ON the capture day, which
 * the replay leaves out because a capture has a date and no time. When there are any, a new
 * disagreement may be nothing but that ambiguity (a function such a file creates, or drops, that
 * the capture did or did not see), so the message says the remedy is a fresh capture and not an
 * entry in KNOWN_MODEL_DRIFT, which would record a disagreement that may not exist.
 */
export function checkDrift(cmp, known, capture = null) {
  const problems = [];
  const knownByKey = new Map(known.map((k) => [keyOf(k), k]));
  const actualByKey = new Map(cmp.drift.map((d) => [keyOf(d), d]));
  const ambiguous = capture?.ambiguousFiles ?? [];
  for (const d of cmp.drift) {
    const k = knownByKey.get(keyOf(d));
    if (!k && ambiguous.length) problems.push(`new model/live disagreement: ${d.kind} ${d.name} (live: ${d.live}, model: ${d.model}) — ${ambiguous.length} migration file(s) are dated on the capture day ${capture.capturedOn} (${ambiguous.join(', ')}) and are outside the replay, because the capture records a date and no time, so it is not known whether it saw them; re-capture with scripts/definer-live-check.sql into a new dated fixture before deciding this is drift`);
    else if (!k) problems.push(`new model/live disagreement: ${d.kind} ${d.name} (live: ${d.live}, model: ${d.model}) — read why, then add it to KNOWN_MODEL_DRIFT with the reason, or fix the model`);
    else if (k.live !== d.live || k.model !== d.model) problems.push(`known drift ${d.kind} ${d.name} changed: recorded live=${k.live}/model=${k.model}, now live=${d.live}/model=${d.model}`);
  }
  for (const k of known) {
    if (!actualByKey.has(keyOf(k))) problems.push(`stale known drift: ${k.kind} ${k.name} no longer disagrees — delete it`);
    if (typeof k.reason !== 'string' || k.reason.trim().length < 20) problems.push(`known drift ${k.kind} ${k.name} needs a real reason`);
  }
  return problems;
}

/**
 * The allow-list as it applies to a catalog captured on one day: entries and registered findings
 * for functions that NO migration dated before that day creates are set aside as `pending`, and
 * the rest is returned as `allow` for the live diff.
 *
 * ⚠ WITHOUT THIS EVERY NEW anon-executable DEFINER FAILED ONE TEST OR THE OTHER. The grants test
 * requires an allow-list entry for it from the migrations alone (it has to: that is the check that
 * catches the leak before it ships), and the live diff called that same entry STALE, because a
 * capture taken before the migration existed cannot contain the function. The agreement test's own
 * note already says a function dated on or after the capture "is the grants test's business until
 * the live catalog is captured again"; this is that sentence applied to the allow-list too.
 *
 * ⚠ IT CANNOT HIDE A REAL STALE ENTRY. A name is pending only when the pre-capture model has never
 * heard of it. An entry for a function the old migrations DO create, which production no longer
 * has, is still in `allow` and still fails as stale; and a pending name that turns up in the
 * capture after all is reported by the caller's own assertion, not waved through.
 */
export function allowListAsOfCapture(allow, preCaptureModel) {
  const known = new Set([...preCaptureModel.fns.values()].map((f) => f.name));
  const pending = [];
  const entries = {};
  for (const [name, entry] of Object.entries(allow.entries ?? {})) {
    if (known.has(name)) entries[name] = entry;
    else pending.push(name);
  }
  const keep = (list) => (list ?? []).filter((f) => {
    if (known.has(f?.name)) return true;
    pending.push(f?.name);
    return false;
  });
  // The mirror case: a fix dated after the capture. The capture predates the migration, so what
  // the list said before the fix (`wasEntry` / `wasFinding`) is what it said on that day. A fix the
  // pre-capture migrations already hold stays in `fixedAfterCapture`, and the live diff reports it
  // as applied, which is the signal to delete it.
  const files = new Set(preCaptureModel.files ?? []);
  const restored = [];
  const restoredFindings = [];
  const stillFixed = [];
  for (const f of allow.fixedAfterCapture ?? []) {
    if (!f || files.has(f.fixedBy)) { if (f) stillFixed.push(f); continue; }
    restored.push(f.name);
    if (f.wasEntry) entries[f.name] = f.wasEntry;
    else if (f.wasFinding) restoredFindings.push(f.wasFinding);
  }
  return {
    allow: { ...allow, entries, registeredFindings: [...keep(allow.registeredFindings), ...restoredFindings], fixedAfterCapture: stillFixed, registeredPinFindings: allow.registeredPinFindings ?? [] },
    pending: [...new Set(pending)].sort(),
    restored: restored.sort(),
  };
}

/** The migrations dated the capture day itself (a capture has a date and no time). */
export function captureDayFiles(dir, live) {
  return orderedMigrationFiles(dir).filter((f) => migrationDate(f) === live.capturedOn);
}

/**
 * The capture-day files a capture does NOT record as applied. The replay leaves them out, and a
 * disagreement one of them could explain is ambiguous rather than drift (checkDrift's message).
 */
export function ambiguousCaptureDayFiles(dir, live) {
  const applied = new Set(live.captureDayFilesApplied ?? []);
  return captureDayFiles(dir, live).filter((f) => !applied.has(f));
}

/**
 * The model as of a capture: every migration dated strictly before the capture day, plus the
 * capture-day files the capture records as applied before it was taken (`captureDayFilesApplied`).
 * The record is checked, not trusted: it may name only files dated the capture day (an earlier one
 * is in the window already, a later one did not exist), each must be a migration in the tree
 * (replayDir refuses a name it does not have), and a file the capture did not in fact see leaves
 * functions or grants in the model that live lacks, which the comparison reports as drift.
 */
export function modelAsOfCapture(dir, live) {
  const applied = live.captureDayFilesApplied ?? [];
  for (const f of applied) {
    if (migrationDate(f) !== live.capturedOn) throw new Error(`captureDayFilesApplied names ${f}, which is not dated the capture day ${live.capturedOn}: a file dated earlier is in the replay already, and one dated later did not exist when the capture was taken`);
  }
  return replayDir(dir, { before: live.capturedOn, including: applied });
}
