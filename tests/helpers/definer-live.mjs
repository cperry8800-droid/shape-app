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
// What the CHECKED-IN fixture can say about the second line is less than the query can: it lists
// non-trigger names, and its `definersWithoutPgTemp` is one carried-over sentence whose coverage of
// trigger definers is not recorded. tests/definer-live-agreement.test.mjs says so in its header.

import { definerRpcFns, anonExecutable, pgTempPinned } from './definer-model.mjs';

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

  return {
    liveNames: liveAll.size,
    modelNames: byName.size,
    compared: agree + drift.filter((d) => d.kind === 'anon-mismatch').length,
    agree, agreeAnon, agreeNoAnon,
    drift: drift.sort((a, b) => (a.kind + a.name < b.kind + b.name ? -1 : 1)),
    pinAgree: liveUnpinned.size === modelUnpinned.size && [...liveUnpinned].every((n) => modelUnpinned.has(n)),
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
  return {
    allow: { ...allow, entries, registeredFindings: keep(allow.registeredFindings), registeredPinFindings: allow.registeredPinFindings ?? [] },
    pending: [...new Set(pending)].sort(),
  };
}
