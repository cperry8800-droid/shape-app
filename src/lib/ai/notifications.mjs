// Proactive notification decision layer — the rules that turn the SAME engine
// events (AI2 directive, AI4 triage) into notifications that reach people when
// the app is closed. It emits NO new advice: the caller passes engine OUTPUTS
// (a directive, evaluateClient flags, getTriageFeed rows) and this decides what
// is worth sending, to whom, how, and — critically — what NOT to send.
//
// Pure & dependency-light (only ./tone.mjs) so node:test runs the exact logic
// the /api/ai/notify route runs. The route supplies real records + persists the
// returned `nextState`; delivery is the existing notifications table (+ push
// webhook) — this layer never writes data and never mutates the user's record.
//
// HARD guardrails encoded here:
//   • HONEST DATA — only real events; a missing signal / "—" yields nothing.
//   • NOT NAGGING — dedup (only new/changed), per-day cap, quiet hours (tz-aware),
//     low-priority + over-cap + quiet-hours items roll into ONE digest. Copy is
//     supportive/directive and never shaming (streak "restart", not "you broke it").
//   • CONTROL — per-type opt-out + per-channel prefs are honored.
//   • INFORMATIONAL ONLY — every item is a title/body + a deep-link route.
//   • ROLE-SCOPED — client items address the client; coach items the coach.

import { normalizeTone, containsShaming } from './tone.mjs';

// type → { audience, priority, route, defaultOn }. Route is the in-app
// deep-link the bell/push opens.
export const NOTIFY_TYPES = {
  // client (own data)
  directive:     { audience: 'client', priority: 'high', route: 'home',    defaultOn: true },
  coach_message: { audience: 'client', priority: 'high', route: 'chat',    defaultOn: true },
  checkin_due:   { audience: 'client', priority: 'med',  route: 'checkin', defaultOn: true },
  goal_slip:     { audience: 'client', priority: 'med',  route: 'goal',    defaultOn: true },
  score_drop:    { audience: 'client', priority: 'med',  route: 'score',   defaultOn: true },
  coach_cosign:  { audience: 'client', priority: 'low',  route: 'feed',    defaultOn: true },
  streak_broken: { audience: 'client', priority: 'low',  route: 'habits',  defaultOn: true },
  habit_reminder:{ audience: 'client', priority: 'med',  route: 'habits',  defaultOn: true },
  // coach (own clients), routed by discipline upstream (getTriageFeed(role,…))
  client_red:    { audience: 'coach',  priority: 'high', route: 'client',  defaultOn: true },
  client_amber:  { audience: 'coach',  priority: 'med',  route: 'client',  defaultOn: true },
  checkin_submitted: { audience: 'coach', priority: 'low', route: 'client', defaultOn: true },
};

export const CHANNELS = ['inapp', 'push', 'email'];
// Default channel matrix: opt-IN for high-value low-frequency types means in-app +
// push on, email off everywhere by default. The per-habit reminder itself is the
// opt-in (no reminders exist until the user makes one), so the TYPE gate is on so
// an enabled reminder actually delivers.
function defaultChannels() { return { inapp: true, push: true, email: false }; }
// Per-type × per-channel resolution: the stored override (prefs.matrix[type])
// wins over the default; a type is OFF entirely when no channel is on.
export function channelsForType(prefs, type) {
  const base = defaultChannels();
  const o = prefs && prefs.matrix && prefs.matrix[type];
  if (o && typeof o === 'object') {
    return { inapp: o.inapp !== undefined ? !!o.inapp : base.inapp, push: o.push !== undefined ? !!o.push : base.push, email: o.email !== undefined ? !!o.email : base.email };
  }
  return base;
}
function anyChannelOn(ch) { return !!(ch.inapp || ch.push || ch.email); }

const PRIORITY_RANK = { high: 3, med: 2, low: 1 };
const DAY = 86400000;

export const DEFAULT_PREFS = {
  muted: false,           // master mute
  tone: 'supportive',
  maxPerDay: 4,           // immediate (non-digest) cap; the rest digest
  quietStart: 22,         // local hour [0-23] inclusive
  quietEnd: 7,            // local hour exclusive
  tz: 'UTC',
  matrix: {},             // { [type]: { inapp, push, email } } overrides; absent = default
};

// ── small helpers ───────────────────────────────────────────────────────────
function ymd(d, tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch { return new Date(d).toISOString().slice(0, 10); }
}

// The Monday of the week `d` falls in, as YYYY-MM-DD. Deliberately UTC rather than the
// member's zone: this only ever bounds how OFTEN a nudge may recur, so a boundary a few
// hours out costs nothing, while a per-member zone would make the same week resolve two
// ways for a member who travels — and re-fire a nudge they already had.
function weekKey(d) {
  const t = new Date(d);
  const day = t.getUTCDay();                       // 0=Sun
  const monday = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

// How long a dedup stamp is kept. `at` was written and never read; it is now what bounds
// the map. Four signature generations at the weekly cadence above.
const DEDUP_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ⚠ AND BY COUNT, because age alone does not bound a list. `habit_reminder` signs
// `habitId:YMD` so one key gains a signature a day, and a `directive:self` signature
// changes with the verdict, label or citations while the cron re-evaluates hourly — inside
// the TTL window a single slot could grow without limit, which is the growth class this
// file is closing. Evicting the OLDEST can only ever cost a re-send of something that many
// distinct signatures ago; keeping them all costs the blob every cron pass rewrites.
export const MAX_SIGS_PER_KEY = 24;

// ⚠ AND A GLOBAL BOUND, because capping each entry leaves the NUMBER of entries free.
// coach_message / coach_cosign key on the event id, so a busy member mints a fresh entry
// per message and only age retires them. The whole blob is `user_goals.data`, which has no
// size constraint, and `writeUserGoal` swallows its upsert error — so an oversized payload
// fails SILENTLY and loses the dedup state entirely, which is a worse outcome than any
// eviction. Newest-first by `at`: the oldest entries are the ones whose signatures are
// closest to ageing out anyway.
const MAX_STAMP_KEYS = 200;

// The digest queue has no natural ceiling either. It drains on the first non-quiet
// evaluation, so reaching this bound means something upstream is already wrong; dropping
// the OLDEST held items is the under-deliver direction this layer chooses everywhere else.
const MAX_PENDING_DIGEST = 50;

function newestSigs(list) {
  const sorted = list.slice().sort((a, b) => a.at - b.at);
  return sorted.slice(-MAX_SIGS_PER_KEY);
}
export function localHour(now, tz) {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hour: '2-digit', hour12: false }).format(now);
    const h = parseInt(s, 10);
    return Number.isFinite(h) ? (h % 24) : new Date(now).getUTCHours();
  } catch { return new Date(now).getUTCHours(); }
}
export function localMinute(now, tz) {
  try { return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', minute: '2-digit' }).format(now), 10) || 0; }
  catch { return new Date(now).getUTCMinutes(); }
}
const _DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function localDow(now, tz) {
  try { const w = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', weekday: 'short' }).format(now); return _DOW[w] != null ? _DOW[w] : new Date(now).getUTCDay(); }
  catch { return new Date(now).getUTCDay(); }
}
export function inQuietHours(now, prefs) {
  const start = Number.isFinite(prefs.quietStart) ? prefs.quietStart : 22;
  const end = Number.isFinite(prefs.quietEnd) ? prefs.quietEnd : 7;
  if (start === end) return false;
  const h = localHour(now, prefs.tz);
  return start < end ? (h >= start && h < end) : (h >= start || h < end);
}
function nonEmpty(s) { return typeof s === 'string' && s.trim().length > 0; }

// ── copy (never shaming; supportive vs direct framing) ──────────────────────
function lower1(s) { const t = String(s || '').trim(); return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; }

function clientCopy(type, ctx, tone) {
  const t = normalizeTone(tone);
  const direct = t === 'direct';
  switch (type) {
    case 'directive':
      // Reuse the engine's own line (verbatim) so notification === in-app text.
      return { title: 'Your move today', body: String(ctx.line || '').trim() };
    case 'coach_message':
      return { title: `${ctx.coach || 'Your coach'} sent you a note`, body: ctx.preview ? String(ctx.preview).slice(0, 140) : 'Open the thread to read it.' };
    case 'checkin_due':
      return { title: 'Your weekly check-in is ready', body: direct ? 'Two minutes to log the week.' : 'Whenever you have two minutes — a quick read on your week helps.' };
    case 'goal_slip':
      return { title: `Your ${ctx.goalLabel || 'goal'} pace eased off`, body: direct ? `Projected date moved out. ${ctx.reason || ''}`.trim() : `The pace dipped a little — a small adjust brings the date back. ${ctx.reason || ''}`.trim() };
    case 'score_drop':
      return { title: 'Your Shape Score dipped this week', body: direct ? `${ctx.reason || ''}`.trim() || 'One thing moves it back.' : `It happens — here's the one thing that moves it back. ${ctx.reason || ''}`.trim() };
    case 'coach_cosign':
      return { title: `${ctx.coach || 'Your coach'} co-signed your ${ctx.activity || 'session'}`, body: direct ? 'Logged.' : 'Nice work — your coach noticed.' };
    case 'streak_broken':
      // Explicitly NOT streak-shaming.
      return { title: `Ready to restart your ${ctx.habit || 'habit'}?`, body: direct ? 'Pick it back up today.' : 'No streak-shaming — just a clean restart whenever you are.' };
    case 'habit_reminder':
      // Gentle + encouraging, NEVER "you still haven't…". Just the cue.
      return { title: `Time for: ${ctx.label || 'your habit'}`, body: direct ? 'Tap to log it.' : 'A quick nudge — tap to check it off.' };
    default:
      return { title: 'Update', body: String(ctx.reason || '') };
  }
}
function coachCopy(type, ctx) {
  const who = ctx.clientName || 'A client';
  const reason = nonEmpty(ctx.reason) ? ctx.reason : '';
  if (type === 'client_red') return { title: `${who} needs you`, body: reason || 'Flagged on your triage.' };
  return { title: `${who} — worth a look`, body: reason || 'Edging amber on your triage.' };
}

// Final guard: we never ship shaming copy. If a body somehow trips the guard,
// drop the body (keep the neutral title) rather than send a guilt-trip.
function sanitize(copy) {
  const out = { title: copy.title, body: copy.body };
  if (containsShaming(out.title)) out.title = 'Update';
  if (containsShaming(out.body)) out.body = '';
  return out;
}

// ── candidate builders (engine outputs → raw candidates) ────────────────────
// A candidate: { type, key, sig, priority, copy, route, data }. `key` makes the
// dedup per-subject (a client id for coach items); `sig` changes only when the
// underlying event genuinely changes.

// The stored `client_settings.dailyCheckin` value, read as a boolean.
//
// ⚠ ON IS THE DEFAULT, AND ABSENCE MEANS ON. An account created before the pref
// existed — or a settings read that simply failed — must never read as opted OUT,
// because that would silently stop a check-in the member never turned off. Only the
// two shapes the settings row actually stores for off are off.
//
// ⚠ TWIN: mobile's `bsDailyCheckinOn` (iosAppBroadsheetClient.jsx) is this same rule
// over this same value. Change one and change both — a drifted copy here means the
// app and the notifications disagree about what the member asked for.
export function dailyCheckinOn(v) { return v !== false && v !== 'Off'; }

// A notification that IS the weekly check-in nudge, in EITHER shape it can take: the
// dedicated `checkin_due` candidate, or the ONE move when the engine's top flag was
// `checkin_overdue`. Keyed on the type and the stamped move kind — never on copy, which
// is translated and edited.
export function isCheckinItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.type === 'checkin_due') return true;
  if (item.type !== 'directive') return false;
  const d = item.data || {};
  // ⚠ THE LEVER IS THE IDENTITY; THE KIND IS ONLY ITS ENGINE-BUILT ALIAS. A coach override
  // carries lever 'checkin' with ANY action kind (sanitizeOverride defaults an omitted one
  // to 'message'), and the kind can never separate them: the engine emits kind 'message'
  // for the CONTACT lever, so "send me your check-in" and "reach out today" are
  // kind-identical. Kind is still honoured for items stamped before the lever was.
  // ⚠ WHEN A LEVER IS PRESENT IT DECIDES ALONE. Keeping the kind as a belt-and-braces `||`
  // let the DERIVED alias override the authoritative field: a coach may set lever 'contact'
  // with kind 'check_in', and that member would lose their coach's actual move to a
  // check-in opt-out. The kind speaks only for directives stamped before the lever was.
  if (d.lever) return d.lever === 'checkin';
  // ⚠ RESIDUAL, ACKNOWLEDGED: an item stamped with a move but NO lever (queued before the
  // lever stamp shipped) cannot be proven not to be a coach check-in override, since a
  // coach may set ANY kind against the checkin lever and 'message' is a legitimate engine
  // kind. Purging every lever-less directive would cost every opted-out member their one
  // move at rollout to spare a rare one, so the kind is trusted here. Bounded to a single
  // evaluation per member: the item is delivered or purged, and never re-queued unstamped.
  const move = d.move;
  if (move) return move === 'check_in';
  // ⚠ NO USABLE MOVE KIND ⇒ UNIDENTIFIABLE ⇒ PURGED, DELIBERATELY. Directives finalized
  // before the stamp existed carry `data: {}` (and a directive whose action carried no
  // kind lands in the same bucket), so an already-queued `checkin_overdue` move is
  // indistinguishable from any other held directive — and the FIRST evaluation after rollout would otherwise send
  // "your move today" to someone who had opted out. Unidentifiable means purged here:
  // we cannot prove it is not the check-in, and losing one held directive once is the
  // under-deliver direction this layer already chooses. Self-limiting — every directive
  // built from now on carries its move kind.
  return true;
}

// A dedup stamp in `state.types` means the candidate was HANDLED — sent, or queued for
// the digest. Purging an item from that queue un-handles it, so the stamp has to be
// released with it: otherwise the rebuilt candidate is suppressed as a duplicate of a
// notification that was never delivered. For `checkin_due` that is PERMANENT — it signs
// itself with the constant 'due', so no later signature can ever break the tie.
function releaseDedup(types, item, kept) {
  // ⚠ THE STAMP IS A SINGLE SLOT PER (type,key) AND THE LAST WRITER OWNS IT. Two directives
  // can be held at once — a changed signature is not a duplicate — and both are built with
  // the key 'self', so a queued item carries no key that would tell them apart. Matching on
  // the SIGNATURE is exact: release the stamp only when it is the purged item's own. A
  // same-type survivor is NOT evidence the stamp is theirs; when the check-in was queued
  // second, the stored signature is the check-in's and holding it back suppresses the
  // rebuilt nudge forever — the very bug this release exists to prevent.
  const prefix = `${item.type}:`;
  const entries = Object.keys(types).filter((k) => k.startsWith(prefix));
  if (nonEmpty(item.sig)) {
    // ⚠ DROP ONLY THE PURGED SIGNATURE. A queued item's signature is never also a delivered
    // one — a candidate already delivered is suppressed before it can be queued — but that
    // is a fact about the SIGNATURE, not about the ENTRY, and an earlier version of this
    // comment confused the two. A legacy queue-time stamp shares its slot with every
    // signature the digest delivered afterwards, so deleting the entry forgets those and
    // re-sends them. Delete the slot only once nothing is left in it.
    for (const k of entries) {
      const all = stampSigs(types[k]);
      const rest = all.filter((x) => x.s !== item.sig);
      if (rest.length === all.length) continue;                    // not this entry's
      if (!rest.length) { delete types[k]; continue; }
      const newest = rest.reduce((a, b) => (b.at > a.at ? b : a));
      types[k] = { sig: newest.s, sigs: rest, at: newest.at };
    }
    return;
  }
  // ⚠ Items queued before the signature stamp shipped cannot be matched, so fall back to
  // the coarse rule: release only when nothing of that type is still held. That is right
  // in the ordinary single-item case and no worse than the bug it replaces in the rare
  // two-directive one — whereas releasing nothing would cost those members the nudge
  // permanently. Self-limiting: every item queued from now on carries its signature.
  if (kept.some((k) => k && k.type === item.type)) return;
  for (const k of entries) delete types[k];
}

// CLIENT — from a directive + evaluateClient flags + check-in state + coach events.
export function clientCandidates(input) {
  const { directive, flags = [], checkinDueThisWeek, checkinOptedOut = false, coachEvents = [], goals = [], now = new Date(), tone } = input;
  const wk = weekKey(now);
  const out = [];

  // (AI2) the ONE move — only when it's actionable (not a green/on-track read).
  // ⚠ THIS IS THE LOUDEST CHECK-IN DOOR, and the easiest to miss. `checkin_overdue` carries
  // the HIGHEST directive priority in the engine (100, escalating with missedWeeks), so for
  // an overdue member the ONE move IS "send your weekly check-in" — a high-priority
  // notification that the `checkin_due` gate below never touches. Suppressed on the ACTION
  // KIND, which maps 1:1 to the checkin lever, so unrelated directives are untouched: the
  // member opted out of a check-in, not out of being told the one thing to do today.
  // ⚠ The move kind is STAMPED into `data` because a deferred copy of this item outlives
  // this function, and the digest purge cannot key on copy — wording is translated.
  if (directive && directive.action && nonEmpty(directive.action.label)) {
    const moveKind = directive.action.kind || '';
    const lever = directive.lever || '';
    // the lever is the identity; the kind is only its engine-built alias, and speaks
    // alone only when there is no lever (see isCheckinItem).
    const isCheckin = lever ? lever === 'checkin' : moveKind === 'check_in';
    if (!(checkinOptedOut && isCheckin)) {
      const line = nonEmpty(directive.line) ? directive.line : '';
      const sig = `${directive.verdict || ''}|${directive.action.label}|${(directive.cited || []).join(',')}`;
      out.push({ type: 'directive', key: 'self', sig: `${sig}|${wk}`, priority: 'high', ctx: { line, reason: directive.reason }, data: { move: moveKind, lever } });
    }
  }

  const byKey = {};
  for (const f of flags) if (f && f.key) byKey[f.key] = f;

  if (byKey.streak_broken) out.push({ type: 'streak_broken', key: 'self', sig: `${byKey.streak_broken.reason || 'broken'}:${wk}`, priority: 'low', ctx: { habit: byKey.streak_broken.habit, reason: byKey.streak_broken.reason } });
  if (byKey.score_drop)    out.push({ type: 'score_drop',    key: 'self', sig: `${byKey.score_drop.reason || 'drop'}:${wk}`, priority: 'med', ctx: { reason: byKey.score_drop.reason } });
  if (byKey.goal_slip) {
    const g = goals[0] || {};
    out.push({ type: 'goal_slip', key: 'self', sig: `${byKey.goal_slip.reason || 'slip'}:${wk}`, priority: 'med', ctx: { goalLabel: g.label, reason: byKey.goal_slip.reason } });
  }
  // due weekly check-in (engine flag OR an explicit "due" signal)
  // ⚠ SPEC §3D — a member who turned Daily check-in OFF is never nudged about it, and
  // that has to hold for the notification paths too: the Home bulletin already honours
  // the pref, but BOTH notify routes recompute from the stored snapshot, which keeps its
  // check-in state after the toggle. The suppression sits HERE because this candidate has
  // TWO doors — the explicit signal and the engine's own flag — and gating a call site
  // would leave the other one firing.
  // ⚠ It suppresses ONLY this candidate. They opted out of a check-in nag, not out of
  // coach messages, streaks or the one move.
  if (!checkinOptedOut && (checkinDueThisWeek === true || byKey.checkin_overdue)) {
    out.push({ type: 'checkin_due', key: 'self', sig: `due:${wk}`, priority: 'med', ctx: {} });
  }
  // coach events (real, server-confirmed) — messages + co-signs
  for (const e of coachEvents) {
    if (!e || !nonEmpty(e.id)) continue;
    if (e.kind === 'message') out.push({ type: 'coach_message', key: e.id, sig: e.id, priority: 'high', ctx: { coach: e.coach, preview: e.preview }, data: { conversationId: e.conversationId || null } });
    else if (e.kind === 'cosign') out.push({ type: 'coach_cosign', key: e.id, sig: e.id, priority: 'low', ctx: { coach: e.coach, activity: e.activity }, data: { postId: e.postId || null } });
  }

  // build copy + route + data, drop honest-empty
  return out.map((c) => finalizeClient(c, tone)).filter(Boolean);
}
function finalizeClient(c, tone) {
  const meta = NOTIFY_TYPES[c.type];
  const copy = sanitize(clientCopy(c.type, c.ctx, tone));
  if (!nonEmpty(copy.title)) return null;
  return { type: c.type, key: c.key, sig: c.sig, priority: c.priority || meta.priority, route: meta.route, data: c.data || {}, title: copy.title, body: copy.body };
}

// COACH — from getTriageFeed(role, clients) rows. Only OWNED red/amber rows
// (routed to THIS pro by discipline) become notifications; the reason is the top
// owned flag. lastSeverity (from state) suppresses re-firing while unchanged.
export function coachCandidates(input) {
  const { triageRows = [], lastSeverity = {} } = input;
  const out = [];
  for (const row of triageRows) {
    if (!row || !nonEmpty(row.clientId)) continue;
    const sev = row.severity;
    if (sev !== 'red' && sev !== 'amber') continue;
    // owned-by-this-pro check: at least one flag this role acts on
    const ownedFlags = (row.flags || []).filter((f) => f && f.owned !== false);
    if (!ownedFlags.length) continue;             // routed to the OTHER pro → not mine
    const prev = lastSeverity[row.clientId];
    if (prev === sev) continue;                   // unchanged → no re-nag
    // only notify on appearance/worsening (green→amber/red, amber→red)
    if (prev === 'red' && sev === 'amber') continue;
    const reason = (ownedFlags[0] && ownedFlags[0].reason) || row.reason || '';
    if (!nonEmpty(reason)) continue;              // honest: no reason → no notification
    const type = sev === 'red' ? 'client_red' : 'client_amber';
    const copy = sanitize(coachCopy(type, { clientName: row.clientName, reason }));
    out.push({ type, key: row.clientId, sig: `${sev}:${reason}`, priority: NOTIFY_TYPES[type].priority, route: 'client', data: { clientId: row.clientId, discipline: ownedFlags[0].discipline || null }, title: copy.title, body: copy.body, _severity: sev });
  }
  return out;
}

// HABIT REMINDERS (user-scheduled, opt-in). A reminder is DUE when today's local
// weekday is in its days AND its local time has been reached (never early), and is
// SUPPRESSED when the habit is already done today or it's snoozed. One candidate
// per due habit; the per-day signature dedups so an hourly cron fires it once. The
// per-channel gate + quiet hours + cap still apply downstream (so multiple habits
// batch into the digest, never spam).
export function habitReminderCandidates(input) {
  const { reminders = [], doneToday = [], now = new Date(), tone } = input;
  const done = new Set((doneToday || []).map((x) => String(x)));
  const out = [];
  for (const r of reminders) {
    if (!r || r.enabled === false || !nonEmpty(r.habitId)) continue;
    if (done.has(String(r.habitId))) continue;                       // suppress: already done today
    if (r.snoozeUntil && +new Date(r.snoozeUntil) > +now) continue;  // suppress: snoozed
    const tz = r.tz || 'UTC';
    const days = Array.isArray(r.days) ? r.days : [];
    if (!days.includes(localDow(now, tz))) continue;                 // not a scheduled day
    const parts = String(r.at || r.atTime || '09:00').split(':');
    const hh = parseInt(parts[0], 10) || 0, mm = parseInt(parts[1], 10) || 0;
    const h = localHour(now, tz), m = localMinute(now, tz);
    if (!(h > hh || (h === hh && m >= mm))) continue;                // time not reached yet (never early)
    const copy = clientCopy('habit_reminder', { label: r.label }, tone);
    out.push({ type: 'habit_reminder', key: r.habitId, sig: `${r.habitId}:${ymd(now, tz)}`, priority: 'med', route: 'habits', data: { habitId: r.habitId }, title: copy.title, body: copy.body });
  }
  return out;
}

// ── the gate: dedup → opt-out → quiet hours / cap → digest ──────────────────
// candidates: from clientCandidates / coachCandidates. Returns the immediate
// sends, a single optional digest, the per-channel hints, and the nextState.
// ⚠ ONE SLOT PER (type,key) CANNOT REMEMBER TWO DELIVERIES — the same single-slot shape
// that caused the orphaned stamps, one layer on. When a single digest delivers two items
// for one key, the second signature overwrote the first and the earlier one read as never
// sent. An entry therefore holds a LIST, and each signature carries its own age so the
// list is bounded by the TTL rather than by how often the key is touched — a plain array
// with one entry timestamp would never expire for a key written every day, which is the
// unbounded growth this file just finished fixing.
// `sig` is kept alongside as the most recent, for entries written before the list existed.
function stampSigs(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.sigs)) return entry.sigs.filter((x) => x && nonEmpty(x.s) && Number.isFinite(x.at));
  return nonEmpty(entry.sig) && Number.isFinite(entry.at) ? [{ s: entry.sig, at: entry.at }] : [];
}

function rememberSig(types, sigKey, sig, now) {
  const live = stampSigs(types[sigKey]).filter((x) => x.s !== sig);
  live.push({ s: sig, at: +now });
  types[sigKey] = { sig, sigs: newestSigs(live), at: +now };
}

function pruneStamps(types, now) {
  const out = {};
  const floor = +now - DEDUP_TTL_MS;
  for (const [k, v] of Object.entries(types || {})) {
    // An undatable stamp is the same unbounded growth, and cannot be shown to be live.
    const live = newestSigs(stampSigs(v).filter((x) => x.at >= floor));
    if (!live.length) continue;
    const newest = live.reduce((a, b) => (b.at > a.at ? b : a));
    out[k] = { sig: newest.s, sigs: live, at: newest.at };
  }
  const keys = Object.keys(out);
  if (keys.length <= MAX_STAMP_KEYS) return out;
  keys.sort((a, b) => out[a].at - out[b].at);
  for (const k of keys.slice(0, keys.length - MAX_STAMP_KEYS)) delete out[k];
  return out;
}

export function decideNotifications({ candidates = [], last = {}, prefs = {}, now = new Date(), audience = 'client', checkinOptedOut = false }) {
  const P = { ...DEFAULT_PREFS, ...prefs, matrix: { ...(prefs.matrix || {}) } };
  const today = ymd(now, P.tz);
  const state = {
    date: today,
    sentToday: last.date === today ? (last.sentToday || 0) : 0,
    // ⚠ PRUNED, OR IT GROWS FOREVER. coach_message / coach_cosign key on the EVENT id, so
    // every message a member ever received left a permanent entry in a user_goals blob
    // read and rewritten on every cron pass. Dropping an entry can only cost a duplicate
    // notification, never a silent loss — and nothing that recurs is dropped: event ids
    // never repeat, and the self-keyed signatures carry the week, so they have already
    // changed several times over by the time one ages out.
    types: pruneStamps(last.types, now),
    coachClients: { ...(last.coachClients || {}) },
    // ⚠ A HELD ITEM OUTLIVES THE PREFERENCE THAT ALLOWED IT. Anything deferred by quiet
    // hours or the daily cap sits here across runs and is re-emitted WITHOUT being rebuilt,
    // so a check-in queued before the member opted out would still be delivered after.
    // Suppressing at the candidate stops the rebuild and does nothing about the queue.
    pendingDigest: (Array.isArray(last.pendingDigest) ? last.pendingDigest : []).slice(-MAX_PENDING_DIGEST),
  };
  if (checkinOptedOut) {
    const kept = [];
    const purged = [];
    for (const i of state.pendingDigest) (isCheckinItem(i) ? purged : kept).push(i);
    state.pendingDigest = kept;
    for (const i of purged) releaseDedup(state.types, i, kept);
  }

  // Master mute — the authoritative kill switch.
  if (P.muted === true) {
    return { send: [], digest: null, nextState: state, suppressed: candidates.map((c) => ({ type: c.type, reason: 'muted' })) };
  }

  const quiet = inQuietHours(now, P);
  // ⚠ AFTER THE PURGE, AND BEFORE THIS CALL'S CANDIDATES. Reading the unfiltered
  // `last.pendingDigest` meant that when every held item was a purged check-in, a new
  // low-priority or over-cap candidate deferred by THIS call fired the digest immediately —
  // defeating the next-evaluation deferral this block documents, and for an over-cap item
  // bypassing the daily cap. `state.pendingDigest` is the filtered queue and nothing has
  // been added to it yet.
  const hadPending = state.pendingDigest.length > 0;
  const send = [];
  const suppressed = [];

  // newest-relevant first
  const ranked = candidates.slice().sort((a, b) => (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));

  for (const c of ranked) {
    // per-type × per-channel gate: a type is OFF entirely when no channel is on.
    const ch = channelsForType(P, c.type);
    if (!anyChannelOn(ch)) { suppressed.push({ type: c.type, reason: 'opted_out' }); continue; }
    if (!nonEmpty(c.title)) { suppressed.push({ type: c.type, reason: 'empty' }); continue; }

    // dedup: per (type+key) signature
    const sigKey = `${c.type}:${c.key}`;
    const delivered = stampSigs(state.types[sigKey]).some((x) => x.s === c.sig);
    // ⚠ THE QUEUE IS THE RECORD FOR A QUEUED ITEM, the stamp only for a DELIVERED one.
    // A stamp written at queue time is a second, redundant record of the same fact, and
    // it is the one that can be orphaned or misattributed when something later removes
    // the item it stood for. Asking the queue directly cannot go stale.
    // ⚠ THE IDENTITY IS (type, KEY, sig) — the stamp path keys on `${type}:${key}`, and this
    // must match it. coachCandidates signs `${severity}:${reason}`, so two DIFFERENT clients
    // in the same state share a signature and differ only by key; matching on type+sig alone
    // dropped the second from the digest and delayed a red client alert. An item queued
    // before the key rode along carries none: matching it on type+sig is the old behaviour,
    // and errs toward suppressing rather than delivering the same nudge twice.
    const queued = state.pendingDigest.some(
      (i) => i && i.type === c.type && i.sig === c.sig && (i.key === undefined || i.key === c.key)
    );
    if (delivered || queued) { suppressed.push({ type: c.type, reason: 'duplicate' }); continue; }

    const item = { type: c.type, title: c.title, body: c.body, route: c.route, data: c.data || {}, priority: c.priority, channels: ch };

    const overCap = state.sentToday >= (P.maxPerDay || DEFAULT_PREFS.maxPerDay);
    const lowPri = c.priority === 'low';
    // quiet hours OR over the daily cap OR low-priority → roll into the digest.
    if (quiet || overCap || lowPri) {
      // ⚠ NOT STAMPED. `sig` and `key` ride along so the queue can answer both the
      // duplicate question above and, on delivery, which stamp to write.
      state.pendingDigest.push({ ...item, sig: c.sig, key: c.key, at: +now });
      if (audience === 'coach' && c._severity) state.coachClients[c.key] = c._severity;
      suppressed.push({ type: c.type, reason: quiet ? 'quiet_hours' : overCap ? 'capped' : 'low_priority_digest' });
      continue;
    }

    send.push(item);
    state.sentToday += 1;
    rememberSig(state.types, sigKey, c.sig, now);
    if (audience === 'coach' && c._severity) state.coachClients[c.key] = c._severity;
  }

  // Emit the digest only OUTSIDE quiet hours, and only for items that were ALREADY
  // waiting from a previous evaluation — so this call's deferrals batch for later
  // rather than firing a second notification immediately. Collapses everything
  // held into ONE supportive summary.
  let digest = null;
  if (!quiet && hadPending && state.pendingDigest.length > 0) {
    const items = state.pendingDigest;
    const n = items.length;
    digest = {
      type: 'digest',
      title: n === 1 ? '1 update for you' : `${n} updates for you`,
      body: items.slice(0, 3).map((i) => i.title).join(' · ') + (n > 3 ? ` +${n - 3} more` : ''),
      route: audience === 'coach' ? 'clients' : 'home',
      data: { items: items.map((i) => ({ type: i.type, route: i.route, data: i.data })) },
      priority: 'low',
      // the digest goes out on the UNION of channels its held items wanted.
      channels: {
        inapp: items.some((i) => i.channels && i.channels.inapp),
        push: items.some((i) => i.channels && i.channels.push),
        email: items.some((i) => i.channels && i.channels.email),
      },
    };
    // DELIVERY is what stamps: these items have now actually reached the member, so the
    // same signature should not come round again. Legacy items carry no sig/key and are
    // skipped — they were stamped at queue time by the deploy that queued them.
    for (const i of items) {
      if (nonEmpty(i.sig) && nonEmpty(i.key)) rememberSig(state.types, `${i.type}:${i.key}`, i.sig, now);
    }
    state.pendingDigest = [];
  }

  return { send, digest, nextState: state, suppressed };
}
