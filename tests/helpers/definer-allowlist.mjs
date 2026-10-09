// The accounting for anon-executable SECURITY DEFINER functions: which ones the model reports,
// which the allow-list names, and whether each claim the allow-list makes holds against the
// function's latest body.
//
// WHY A CLASS VOCABULARY. A definer runs with its owner's rights, so one that anon can execute
// is safe only if its own body decides who gets what. The audit cannot prove "safe", but it can
// refuse to let a function be anon-reachable UNEXPLAINED: every one must say why, in one of
// these terms, and where a term is checkable the check runs against the body.
//
// ⚠ A PRESENCE CHECK IS NOT A PROOF. `auth.uid()` in the body says the author reached for the
// gate, not that every path honours it. That is why the note is required and read by a person, and
// why the checker verifies the claim in the strongest form a machine can: the token has to be in
// CODE position (a comment or a string that mentions it does not count).
//
// ⚠ AND A GATE CAN BE PRESENT AND SKIPPED. `if v_uid <> auth.uid() and not is_coach_on_client(v_uid)
// then return null` reads as a coach gate and is never taken for a signed-out caller: auth.uid() is
// NULL, `x <> NULL` is NULL, and an IF on NULL falls through. The repo shipped that three times
// (set_metric_source and set_program_detail, fixed 2026-06-30; get_health_sources, found by review of
// this audit), and a presence check passes every one. So every entry is also run through the
// NULL-logic guard (nullLogicFlags in definer-model.mjs, which says exactly what it flags and what
// clears it), and a flagged body is a problem unless the entry carries a written, FINGERPRINTED
// acknowledgement (`nullLogic: { fingerprint, why }`): the fingerprint is of the body, so editing the
// function re-opens the question instead of leaving a stale reason standing. A function whose gate
// really is skipped is a registered finding of kind `gate-skipped-for-anon`, and the checker requires
// the guard to STILL flag it, so a finding cannot outlive its fix.

import {
  definerRpcFns, anonExecutable, pgTempPinned, overloads, bodyUsesAuthUid, bodyCalls, nullLogicFlags, bodyFingerprint,
} from './definer-model.mjs';

export const CLASSES = {
  'self-gated-auth-uid':
    'The body evaluates auth.uid() and scopes every read and write to the caller, or refuses when the caller is not the subject, owner, coach or follower it requires. A signed-out caller has a NULL uid and falls through to the refusal or the empty result. CHECKED: auth.uid() appears in code position in the latest body, and the NULL-logic guard finds no comparison against it that a NULL uid skips.',
  'coach-gated':
    'The rows returned, or the effect, are conditioned on is_coach_on_client(...) or is_discipline_coach_on_client(...). CHECKED: a call to one of the two appears in code position in the latest body, and the NULL-logic guard finds no comparison against auth.uid() that a NULL uid skips (a coach gate written as `v <> auth.uid() and not is_coach_on_client(v)` is never taken for anon).',
  'rate-limit-guard':
    'The function IS a rate-limit primitive, granted to anon on purpose so signed-out callers can be throttled. CHECKED: the body calls _rate_limit_bump.',
  'public-by-design':
    'Returns data the product shows to signed-out visitors. NOT checkable from the body, so it needs a note that says what is exposed and why that is intended, and an `anonGrant` that says whether anon was granted EXECUTE by name ("explicit", the intent is on the record) or reaches it only through the default ACL ("default-only"). CHECKED: that claim against the migrations.',
};

const COACH_HELPERS = ['is_coach_on_client', 'is_discipline_coach_on_client'];
const RATE_LIMIT_HELPERS = ['_rate_limit_bump'];
const MIN_NOTE = 20;
const MIN_PUBLIC_NOTE = 60;
const FINDING_FIELDS = ['exposed', 'notFixedHere', 'ownerCall'];

/** What a registered finding claims about the body, and what the checker verifies of it. */
export const FINDING_KINDS = {
  'anon-executable-no-gate':
    'The body shows no gate at all. CHECKED: no auth.uid(), no coach helper and no rate-limit helper in code position.',
  'gate-skipped-for-anon':
    'The body HAS a gate and it is skipped for a signed-out caller (NULL logic). CHECKED: the NULL-logic guard still flags the latest body, so the finding goes stale the moment the function is fixed.',
};
const PIN_FIELDS = ['why', 'notFixedHere', 'ownerCall'];

const isText = (s, min = 1) => typeof s === 'string' && s.trim().length >= min;

/** Which mechanical gates a function's body shows, for messages and for the finding check. */
export function gatesOf(fn) {
  return {
    authUid: bodyUsesAuthUid(fn),
    coach: COACH_HELPERS.some((h) => bodyCalls(fn, h)),
    rateLimit: RATE_LIMIT_HELPERS.some((h) => bodyCalls(fn, h)),
  };
}

/**
 * The NULL-logic problems for one ENTRY: a flagged body needs a valid acknowledgement, and an
 * acknowledgement needs a flagged body it still describes.
 */
function nullLogicProblems(name, ack, fn) {
  const { flags } = nullLogicFlags(fn);
  const has = ack !== undefined && ack !== null;
  if (!flags.length) return has ? [`${name}: stale \`nullLogic\` acknowledgement: the NULL-logic guard flags nothing in its latest body any more — delete it`] : [];
  if (!has) {
    const fix = fn.language === 'sql'
      ? 'a language sql body cannot hold a reject: rewrite it in plpgsql with `if auth.uid() is null then raise exception ...; end if;` first, or, if the comparison only filters rows that a NULL uid drops, acknowledge it'
      : 'put an `if auth.uid() is null then raise exception ...; end if;` first, or, if an anonymous caller cannot reach the comparison, acknowledge it';
    return [`${name}: ${flags.map((f) => f.reason).join('; ')} — ${fix} with \`nullLogic: { fingerprint: "${bodyFingerprint(fn)}", why: "..." }\` in the entry, the reason written out`];
  }
  if (typeof ack !== 'object') return [`${name}: \`nullLogic\` must be { fingerprint, why }`];
  const out = [];
  if (!isText(ack.why, MIN_PUBLIC_NOTE)) out.push(`${name}: \`nullLogic.why\` needs a real reason (at least ${MIN_PUBLIC_NOTE} characters) saying why an anonymous caller cannot get past the comparison`);
  const now = bodyFingerprint(fn);
  if (ack.fingerprint !== now) out.push(`${name}: the body changed since its \`nullLogic\` acknowledgement was written (body ${fn.file}:${fn.line} is fingerprint ${now}, acknowledged ${ack.fingerprint}) — re-read it, then update the fingerprint`);
  return out;
}

const gateWords = (g) => [g.authUid && 'auth.uid()', g.coach && 'a coach helper', g.rateLimit && 'a rate-limit helper'].filter(Boolean).join(' + ') || 'no gate at all';
export const grantOf = (fn) => (fn.anonGrantSite ? 'explicit' : 'default-only');

/** The names anon can execute among non-trigger SECURITY DEFINER functions in `public`, per the model. */
export const anonReachableNames = (model) => [...new Set(definerRpcFns(model).filter(anonExecutable).map((f) => f.name))].sort();

/**
 * Problems (strings) in `allow` against `model`; empty means the allow-list is exactly right.
 * `allow` is { entries, registeredFindings, registeredPinFindings, fixedAfterCapture? }.
 */
export function checkAllowlist(model, allow) {
  const problems = [];
  const entries = allow && typeof allow.entries === 'object' && allow.entries ? allow.entries : null;
  const findings = Array.isArray(allow?.registeredFindings) ? allow.registeredFindings : null;
  const pins = Array.isArray(allow?.registeredPinFindings) ? allow.registeredPinFindings : null;
  if (!entries || !findings || !pins) return ['the allow-list must have `entries` (object), `registeredFindings` (array) and `registeredPinFindings` (array)'];

  // The audit and the allow-list are name-level, so two signatures under one name would be
  // conflated: a gated overload could vouch for an ungated one. Refuse rather than merge.
  for (const o of overloads(model)) {
    problems.push(`overload: ${o.name} has ${o.sigs.length} signatures (${o.sigs.map((s) => `(${s})`).join(' and ')}); the allow-list is name-level, so give the overloads separate entries before allowing this`);
  }

  const reachable = anonReachableNames(model);
  const byName = new Map();
  for (const f of definerRpcFns(model)) byName.set(f.name, f);
  const findingNames = findings.map((f) => f?.name);
  const entryNames = Object.keys(entries);

  for (const name of reachable) {
    // An OWN key only: `name in entries` is also true for everything on Object.prototype, so an anon-executable
    // function called `constructor`, `toString` or `valueOf` (all valid function names) would count as classified.
    const inEntries = Object.hasOwn(entries, name);
    const inFindings = findingNames.includes(name);
    if (!inEntries && !inFindings) {
      const skipped = nullLogicFlags(byName.get(name)).flags;
      problems.push(`missing from the allow-list: ${name} is anon-executable and shows ${gateWords(gatesOf(byName.get(name)))}${skipped.length ? ` (but its gate is skipped for anon: ${skipped.map((f) => f.reason).join('; ')})` : ''} — classify it in tests/fixtures/definer-anon-allowlist.json, or revoke EXECUTE from anon`);
    }
  }
  for (const name of new Set([...entryNames, ...findingNames])) {
    if (!reachable.includes(name)) problems.push(`stale: ${name} is not an anon-executable SECURITY DEFINER function in the model (revoked, dropped, renamed or now a trigger) — delete its entry`);
  }
  for (const name of entryNames) {
    if (findingNames.includes(name)) problems.push(`${name} is both an entry and a registered finding; a registered finding must not also sit as a normal entry`);
  }
  if (new Set(findingNames).size !== findingNames.length) problems.push('a registered finding is listed twice');

  // The search_path pin, read over every definer in `public` (trigger functions included: a trigger
  // definer is just as exposed to a planted pg_temp relation). Checked at the end; computed here
  // because a `fixedAfterCapture` item can be a pin fix.
  const unpinned = [...model.fns.values()].filter((f) => f.schema === 'public' && f.definer && !pgTempPinned(f)).map((f) => f.name).sort();
  const pinNames = pins.map((p) => p?.name);

  // `fixedAfterCapture`: fixed by a migration dated after the last live capture. The migrations no
  // longer make it anon-executable, or now pin it (checked here); the capture still shows it open
  // or unpinned until the owner applies the migration and it is captured again, which is the live
  // diff's business (definer-live.mjs). Each item says what the list said before the fix: `wasEntry`
  // or `wasFinding` for an anon exposure, `wasPinFinding` for a search_path pin.
  const fixed = allow?.fixedAfterCapture === undefined ? [] : allow.fixedAfterCapture;
  if (!Array.isArray(fixed)) problems.push('`fixedAfterCapture` must be an array');
  else {
    const seenFixed = new Set();
    for (const f of fixed) {
      if (!f || typeof f !== 'object' || !isText(f.name)) { problems.push('a fixedAfterCapture item has no name'); continue; }
      if (seenFixed.has(f.name)) problems.push(`${f.name}: listed twice in fixedAfterCapture`);
      seenFixed.add(f.name);
      if (!isText(f.fixedBy, 3) || !model.files.includes(f.fixedBy)) problems.push(`${f.name}: fixedAfterCapture needs \`fixedBy\`, the migration file that fixes it (got ${JSON.stringify(f.fixedBy)})`);
      if (!isText(f.fix, MIN_NOTE)) problems.push(`${f.name}: fixedAfterCapture needs \`fix\` (what the migration changed)`);
      const before = ['wasEntry', 'wasFinding', 'wasPinFinding'].filter((k) => !!f[k]);
      if (before.length !== 1) problems.push(`${f.name}: fixedAfterCapture needs exactly one of \`wasEntry\`, \`wasFinding\` or \`wasPinFinding\` (what the allow-list said before the fix)`);
      if ((f.wasFinding && f.wasFinding.name !== f.name)) problems.push(`${f.name}: \`wasFinding\` names ${JSON.stringify(f.wasFinding.name)}`);
      if ((f.wasPinFinding && f.wasPinFinding.name !== f.name)) problems.push(`${f.name}: \`wasPinFinding\` names ${JSON.stringify(f.wasPinFinding.name)}`);
      if (f.wasPinFinding) {
        // A pin fix: the model must hold the function as a definer in public and pin it now. Its
        // anon-reachability is not this item's claim (a pinned function can still be an entry).
        const isDefiner = [...model.fns.values()].some((x) => x.schema === 'public' && x.definer && x.name === f.name);
        if (!isDefiner) problems.push(`${f.name}: listed as pinned by ${f.fixedBy}, but the model has no SECURITY DEFINER function of that name in public`);
        else if (unpinned.includes(f.name)) problems.push(`${f.name}: listed as pinned by ${f.fixedBy}, but the model still leaves its search_path without pg_temp — the fix did not land`);
        if (pinNames.includes(f.name)) problems.push(`${f.name}: in fixedAfterCapture and also in registeredPinFindings`);
      } else {
        if (reachable.includes(f.name)) problems.push(`${f.name}: listed as fixed by ${f.fixedBy}, but the model still has it anon-executable — the fix did not land`);
        if (Object.hasOwn(entries, f.name) || findingNames.includes(f.name)) problems.push(`${f.name}: in fixedAfterCapture and also in entries or registeredFindings`);
      }
    }
  }

  for (const name of entryNames) {
    const e = entries[name];
    const fn = byName.get(name);
    if (!fn || !reachable.includes(name)) continue; // already reported as stale
    if (!e || typeof e !== 'object') { problems.push(`${name}: entry is not an object`); continue; }
    if (!Object.hasOwn(CLASSES, e.class)) { problems.push(`${name}: class "${e.class}" is not one of ${Object.keys(CLASSES).join(', ')}`); continue; }
    if (!isText(e.note, e.class === 'public-by-design' ? MIN_PUBLIC_NOTE : MIN_NOTE)) {
      problems.push(`${name}: needs a real note (at least ${e.class === 'public-by-design' ? MIN_PUBLIC_NOTE : MIN_NOTE} characters) saying what it does or exposes`);
    }
    const g = gatesOf(fn);
    if (e.class === 'self-gated-auth-uid' && !g.authUid) problems.push(`${name}: claimed self-gated-auth-uid but its latest body (${fn.file}:${fn.line}) does not evaluate auth.uid() in code`);
    if (e.class === 'coach-gated' && !g.coach) problems.push(`${name}: claimed coach-gated but its latest body (${fn.file}:${fn.line}) calls neither is_coach_on_client nor is_discipline_coach_on_client`);
    if (e.class === 'rate-limit-guard' && !g.rateLimit) problems.push(`${name}: claimed rate-limit-guard but its latest body (${fn.file}:${fn.line}) does not call _rate_limit_bump`);
    if (e.class === 'public-by-design') {
      if (e.anonGrant !== 'explicit' && e.anonGrant !== 'default-only') problems.push(`${name}: public-by-design needs anonGrant "explicit" or "default-only"`);
      else if (e.anonGrant !== grantOf(fn)) problems.push(`${name}: claims anonGrant "${e.anonGrant}" but the migrations say "${grantOf(fn)}"${fn.anonGrantSite ? ` (granted at ${fn.anonGrantSite})` : ' (no `grant ... to anon` stands)'}`);
    }
    problems.push(...nullLogicProblems(name, e.nullLogic, fn));
  }

  for (const f of findings) {
    const fn = byName.get(f?.name);
    if (!f || typeof f !== 'object' || !isText(f.name)) { problems.push('a registered finding has no name'); continue; }
    for (const field of FINDING_FIELDS) if (!isText(f[field], MIN_NOTE)) problems.push(`${f.name}: registered finding needs \`${field}\``);
    if (!isText(f.discoveredBy, 3)) problems.push(`${f.name}: registered finding needs \`discoveredBy\` (who found it)`);
    if (!Object.hasOwn(FINDING_KINDS, f.kind)) problems.push(`${f.name}: finding kind "${f.kind}" is not one of ${Object.keys(FINDING_KINDS).join(', ')}`);
    if (!fn || !reachable.includes(f.name)) continue; // stale, reported above
    const g = gatesOf(fn);
    if (f.kind === 'anon-executable-no-gate') {
      // A finding of this kind is a claim of NO gate. If the body has grown one, the finding is
      // out of date and the function belongs in `entries` with the class that now holds.
      if (g.authUid || g.coach || g.rateLimit) problems.push(`${f.name}: registered as ungated but its latest body (${fn.file}:${fn.line}) now shows ${gateWords(g)} — move it to entries`);
    } else if (f.kind === 'gate-skipped-for-anon') {
      // The claim is that the gate is THERE and does not hold for anon, and it is checked by the
      // same guard that would refuse the function as an ordinary entry. Once the body is fixed the
      // guard is silent and the finding must go.
      if (nullLogicFlags(fn).flags.length === 0) problems.push(`${f.name}: registered as gate-skipped-for-anon but the NULL-logic guard no longer flags its latest body (${fn.file}:${fn.line}) — it is fixed, so move it to entries`);
    }
    if (f.anonGrant !== grantOf(fn)) problems.push(`${f.name}: registered anonGrant "${f.anonGrant}" but the migrations say "${grantOf(fn)}"`);
  }

  // The search_path pin (`unpinned`, computed above). Every definer in `public` must end its
  // search_path in pg_temp, or be registered.
  for (const name of unpinned) if (!pinNames.includes(name)) problems.push(`unregistered unpinned definer: ${name} does not end its search_path in pg_temp — pin it (alter function ... set search_path = public, pg_temp) or register it in registeredPinFindings`);
  for (const p of pins) {
    if (!p || !isText(p.name)) { problems.push('a registered pin finding has no name'); continue; }
    for (const field of PIN_FIELDS) if (!isText(p[field], MIN_NOTE)) problems.push(`${p.name}: pin finding needs \`${field}\``);
    if (!isText(p.declaredAt, 3)) problems.push(`${p.name}: pin finding needs \`declaredAt\` (file:line of the clause)`);
    if (!unpinned.includes(p.name)) problems.push(`stale pin finding: ${p.name} is pinned (or is not a definer) in the model — delete it`);
  }
  return problems;
}
