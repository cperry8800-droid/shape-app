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
  // coach (own clients), routed by discipline upstream (getTriageFeed(role,…))
  client_red:    { audience: 'coach',  priority: 'high', route: 'client',  defaultOn: true },
  client_amber:  { audience: 'coach',  priority: 'med',  route: 'client',  defaultOn: true },
};

const PRIORITY_RANK = { high: 3, med: 2, low: 1 };
const DAY = 86400000;

export const DEFAULT_PREFS = {
  enabled: true,
  tone: 'supportive',
  maxPerDay: 4,            // immediate (non-digest) cap; the rest digest
  quietStart: 22,         // local hour [0-23] inclusive
  quietEnd: 7,            // local hour exclusive
  tz: 'UTC',
  channels: { inApp: true, push: true, email: false },
  types: {},              // { [type]: false } to opt out; absent = default on
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
export function inQuietHours(now, prefs) {
  const start = Number.isFinite(prefs.quietStart) ? prefs.quietStart : 22;
  const end = Number.isFinite(prefs.quietEnd) ? prefs.quietEnd : 7;
  if (start === end) return false;
  const h = localHour(now, prefs.tz);
  return start < end ? (h >= start && h < end) : (h >= start || h < end);
}
function typeOn(prefs, type) {
  const def = NOTIFY_TYPES[type] ? NOTIFY_TYPES[type].defaultOn : true;
  const v = prefs && prefs.types ? prefs.types[type] : undefined;
  return v === undefined ? def : v !== false;
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

// CLIENT — from a directive + evaluateClient flags + check-in state + coach events.
export function clientCandidates(input) {
  const { directive, flags = [], checkinDueThisWeek, coachEvents = [], goals = [], tone } = input;
  const out = [];

  // (AI2) the ONE move — only when it's actionable (not a green/on-track read).
  if (directive && directive.action && nonEmpty(directive.action.label)) {
    const line = nonEmpty(directive.line) ? directive.line : '';
    const sig = `${directive.verdict || ''}|${directive.action.label}|${(directive.cited || []).join(',')}`;
    out.push({ type: 'directive', key: 'self', sig, priority: 'high', ctx: { line, reason: directive.reason } });
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
  if (checkinDueThisWeek === true || byKey.checkin_overdue) {
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

// ── the gate: dedup → opt-out → quiet hours / cap → digest ──────────────────
// candidates: from clientCandidates / coachCandidates. Returns the immediate
// sends, a single optional digest, the per-channel hints, and the nextState.
export function decideNotifications({ candidates = [], last = {}, prefs = {}, now = new Date(), audience = 'client' }) {
  const P = { ...DEFAULT_PREFS, ...prefs, channels: { ...DEFAULT_PREFS.channels, ...(prefs.channels || {}) }, types: { ...(prefs.types || {}) } };
  const today = ymd(now, P.tz);
  const state = {
    date: last.date === today ? today : today,
    sentToday: last.date === today ? (last.sentToday || 0) : 0,
    types: { ...(last.types || {}) },
    coachClients: { ...(last.coachClients || {}) },
    pendingDigest: Array.isArray(last.pendingDigest) ? last.pendingDigest.slice() : [],
  };

  if (P.enabled === false) {
    return { send: [], digest: null, nextState: state, suppressed: candidates.map((c) => ({ type: c.type, reason: 'disabled' })) };
  }

  const quiet = inQuietHours(now, P);
  const hadPending = (Array.isArray(last.pendingDigest) ? last.pendingDigest.length : 0) > 0;
  const send = [];
  const suppressed = [];

  // newest-relevant first
  const ranked = candidates.slice().sort((a, b) => (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));

  for (const c of ranked) {
    if (!typeOn(P, c.type)) { suppressed.push({ type: c.type, reason: 'opted_out' }); continue; }
    if (!nonEmpty(c.title)) { suppressed.push({ type: c.type, reason: 'empty' }); continue; }

    // dedup: per (type+key) signature
    const sigKey = `${c.type}:${c.key}`;
    const prevSig = state.types[sigKey] && state.types[sigKey].sig;
    if (prevSig === c.sig) { suppressed.push({ type: c.type, reason: 'duplicate' }); continue; }

    const item = { type: c.type, title: c.title, body: c.body, route: c.route, data: c.data || {}, priority: c.priority };

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

    item.channels = { inApp: P.channels.inApp !== false, push: P.channels.push !== false, email: false };
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
      channels: { inApp: P.channels.inApp !== false, push: P.channels.push !== false, email: P.channels.email === true },
    };
    state.pendingDigest = [];
  }

  return { send, digest, nextState: state, suppressed };
}
