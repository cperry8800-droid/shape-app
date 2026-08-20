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
  if (d.lever) return d.lever === 'checkin' || d.move === 'check_in';
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
  // ⚠ A SURVIVING ITEM STILL STANDS BEHIND THE STAMP. A queued item carries no key — both
  // shapes the purge can match are built with the single key 'self', so a held directive
  // that is NOT the check-in shares the purged one's dedup entry. Clearing it would let
  // the same directive be rebuilt and queued a SECOND time while the first still waits.
  if (kept.some((k) => k && k.type === item.type)) return;
  const prefix = `${item.type}:`;
  for (const k of Object.keys(types)) if (k.startsWith(prefix)) delete types[k];
}

// CLIENT — from a directive + evaluateClient flags + check-in state + coach events.
export function clientCandidates(input) {
  const { directive, flags = [], checkinDueThisWeek, checkinOptedOut = false, coachEvents = [], goals = [], tone } = input;
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
    if (!(checkinOptedOut && (lever === 'checkin' || moveKind === 'check_in'))) {
      const line = nonEmpty(directive.line) ? directive.line : '';
      const sig = `${directive.verdict || ''}|${directive.action.label}|${(directive.cited || []).join(',')}`;
      out.push({ type: 'directive', key: 'self', sig, priority: 'high', ctx: { line, reason: directive.reason }, data: { move: moveKind, lever } });
    }
  }

  const byKey = {};
  for (const f of flags) if (f && f.key) byKey[f.key] = f;

  if (byKey.streak_broken) out.push({ type: 'streak_broken', key: 'self', sig: 'broken', priority: 'low', ctx: { habit: byKey.streak_broken.habit, reason: byKey.streak_broken.reason } });
  if (byKey.score_drop)    out.push({ type: 'score_drop',    key: 'self', sig: byKey.score_drop.reason || 'drop', priority: 'med', ctx: { reason: byKey.score_drop.reason } });
  if (byKey.goal_slip) {
    const g = goals[0] || {};
    out.push({ type: 'goal_slip', key: 'self', sig: byKey.goal_slip.reason || 'slip', priority: 'med', ctx: { goalLabel: g.label, reason: byKey.goal_slip.reason } });
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
    out.push({ type: 'checkin_due', key: 'self', sig: 'due', priority: 'med', ctx: {} });
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
export function decideNotifications({ candidates = [], last = {}, prefs = {}, now = new Date(), audience = 'client', checkinOptedOut = false }) {
  const P = { ...DEFAULT_PREFS, ...prefs, matrix: { ...(prefs.matrix || {}) } };
  const today = ymd(now, P.tz);
  const state = {
    date: today,
    sentToday: last.date === today ? (last.sentToday || 0) : 0,
    types: { ...(last.types || {}) },
    coachClients: { ...(last.coachClients || {}) },
    // ⚠ A HELD ITEM OUTLIVES THE PREFERENCE THAT ALLOWED IT. Anything deferred by quiet
    // hours or the daily cap sits here across runs and is re-emitted WITHOUT being rebuilt,
    // so a check-in queued before the member opted out would still be delivered after.
    // Suppressing at the candidate stops the rebuild and does nothing about the queue.
    pendingDigest: Array.isArray(last.pendingDigest) ? last.pendingDigest.slice() : [],
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
    const prevSig = state.types[sigKey] && state.types[sigKey].sig;
    if (prevSig === c.sig) { suppressed.push({ type: c.type, reason: 'duplicate' }); continue; }

    const item = { type: c.type, title: c.title, body: c.body, route: c.route, data: c.data || {}, priority: c.priority, channels: ch };

    const overCap = state.sentToday >= (P.maxPerDay || DEFAULT_PREFS.maxPerDay);
    const lowPri = c.priority === 'low';
    // quiet hours OR over the daily cap OR low-priority → roll into the digest.
    if (quiet || overCap || lowPri) {
      state.pendingDigest.push({ ...item, at: +now });
      state.types[sigKey] = { sig: c.sig, at: +now };
      if (audience === 'coach' && c._severity) state.coachClients[c.key] = c._severity;
      suppressed.push({ type: c.type, reason: quiet ? 'quiet_hours' : overCap ? 'capped' : 'low_priority_digest' });
      continue;
    }

    send.push(item);
    state.sentToday += 1;
    state.types[sigKey] = { sig: c.sig, at: +now };
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
    state.pendingDigest = [];
  }

  return { send, digest, nextState: state, suppressed };
}
