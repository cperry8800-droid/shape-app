// Pure helpers for the wire-launch: the warm-relaunch route decision, the
// post-beat stage routing, and the "telegram" line assembly for the member's
// Shape Daily briefing. No React, no window, no theme — so the honesty rules
// (a missing digest leg omits its line; signed-out is null, never a fabricated
// member briefing) stay unit-tested. The directive words are shared with the
// Home lead (BS_LEVER_HEADS) so the two surfaces cannot drift.
// Spec: docs/superpowers/specs/2026-07-10-splash-wire-briefing-design.md

// ── Warm-relaunch route ───────────────────────────────────────────────────
// The briefing is a morning ritual, not a toll: a same-local-day reopen by a
// known member skips straight to the app. `stamp` is the persisted
// "<uid>:<localDay>" seen-marker; `memberCached` is the cached membership flag
// (window.ShapeMembership / localStorage 'shape.member'). Everything else → the
// wire beat. The stamp is uid-scoped, so a same-day account switch never
// inherits another member's skip.
export function bsLaunchRoute({ stamp, uid, todayLocal, memberCached } = {}) {
  if (!memberCached) return 'beat';
  if (!uid || !todayLocal) return 'beat';
  if (typeof stamp !== 'string' || stamp.indexOf(':') < 0) return 'beat';
  const sep = stamp.indexOf(':');
  const su = stamp.slice(0, sep);
  const sd = stamp.slice(sep + 1);
  if (!su || !sd) return 'beat';
  return su === String(uid) && sd === String(todayLocal) ? 'app' : 'beat';
}

// The seen-stamp value written when a member's telegram enters the app.
export function bsDailyStamp(uid, todayLocal) {
  return String(uid == null ? '' : uid) + ':' + String(todayLocal == null ? '' : todayLocal);
}

// ── Post-beat routing ─────────────────────────────────────────────────────
// First run (no stored locale) → the language picker; an allowed member → the
// telegram; otherwise → the membership gate. Mirrors the cosmos splash's old
// onDone routing plus the gate's member auto-advance.
export function bsAfterBeat({ allowed, hasLocale } = {}) {
  if (!hasLocale) return 'lang';
  return allowed ? 'daily' : 'gate';
}

// ── The directive line — one computation, shared with Home ─────────────────
// Lever → head words. Home's engineMove map reads these as its tr() defaults,
// so the splash and the Home lead can never say a different move. Only the
// levers Home leads with are here; any other lever (sleep, contact, unmapped)
// omits the directive — exactly as Home's map does.
export const BS_LEVER_HEADS = {
  checkin: 'Send your weekly check-in.',
  training: 'Keep the streak alive.',
  nutrition: 'Log a meal today.',
  goal: 'Your goal pace slipped.',
  score: 'Grab a win today.',
};

// Turn the engine directive into the telegram's teal line, mirroring Home's
// gate: a real action + a real lever (not 'none') + a real verdict (not '—'),
// and a lever Home actually leads with. Returns { head, reason } or null.
export function bsWireDirective(dir) {
  if (!dir) return null;
  if (!dir.action || !dir.lever || dir.lever === 'none' || dir.verdict === '—') return null;
  const head = BS_LEVER_HEADS[dir.lever];
  if (!head) return null;
  return { head: head, reason: dir.reason || null };
}

// ── The telegram lines ─────────────────────────────────────────────────────
function f8(v) { return v == null || v === '' ? null : v; }

// 12-hour clock for an "HH:MM" string (mirrors bsDigestTime12; local so the
// module stays dependency-free and testable).
function time12(hhmm) {
  const mm = String(hhmm == null ? '' : hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!mm) return null;
  let h = parseInt(mm[1], 10);
  const min = mm[2];
  if (h < 0 || h > 23) return null;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + min + ' ' + ap;
}

function up(s) { return String(s).toUpperCase(); }

// Assemble the ordered wire lines from the digest + the resolved directive.
// SIGNED-OUT CONTRACT: null when the digest is absent OR digest.signedIn is not
// true — the caller renders the invite edition instead. A member digest with
// missing legs is the honest-omission path (each absent leg drops its line),
// never conflated with signed-out.
// Returns [{ text, hot }] — `hot` marks the teal directive line.
export function bsWireLines(digest, directive) {
  if (!digest || digest.signedIn !== true) return null;
  const lines = [];
  const tr = digest.training;
  const sc = digest.score;
  const nu = digest.nutrition;
  const co = digest.coach;
  const streak = Number(digest.streak) || 0;
  const isSessionDay = !!(tr && tr.hasWorkout);

  // 1) Session line
  if (isSessionDay) {
    let head = up(tr.title || 'Workout');
    const time = time12(tr.time);
    if (time) head += ' ' + up(time);
    // fold move count / duration in only when the line stays short
    const extras = [];
    if (tr.durationMin) extras.push(tr.durationMin + ' MIN');
    if (tr.moveCount) extras.push(tr.moveCount + (tr.moveCount === 1 ? ' MOVE' : ' MOVES'));
    if (extras.length && head.length <= 26) head += ' ' + extras.join(' ');
    lines.push({ text: head, sep: true });
    if (f8(tr.coach)) lines.push({ text: 'WITH ' + up(tr.coach), sep: true });
  } else if (tr) {
    // plan exists but no session today → rest day
    lines.push({ text: 'REST DAY ON THE BOOKS', sep: true });
  } else {
    // no plan at all
    lines.push({ text: 'NO SESSION ON THE WIRE', sep: true });
    lines.push({ text: 'FIND YOUR COACH INSIDE', sep: true });
  }

  // 2) Directive (teal) — the one accent
  const d = bsWireDirective(directive);
  if (d) {
    const txt = d.reason ? up(d.head) + ' — ' + up(d.reason) : up(d.head);
    lines.push({ text: txt, sep: true, hot: true });
  }

  // 3) Numbers line — fragments only when the datum exists
  const nums = [];
  if (sc && sc.score != null) nums.push('SCORE ' + Number(sc.score).toLocaleString('en-US') + (sc.delta > 0 ? ' UP ' + sc.delta : ''));
  if (nu && nu.protein != null) nums.push(nu.proteinTarget != null ? 'PROTEIN ' + nu.protein + ' OF ' + nu.proteinTarget : 'PROTEIN ' + nu.protein + 'G');
  if (streak > 0) nums.push('STREAK ' + streak + (streak === 1 ? ' DAY' : ' DAYS'));
  if (nums.length) lines.push({ text: nums.join(' · '), sep: true });

  // 4) Coach note (optional)
  if (co && f8(co.text)) {
    const who = up(co.who || 'COACH');
    const clamped = String(co.text).length > 70 ? String(co.text).slice(0, 69).trim() + '…' : String(co.text);
    lines.push({ text: who + ': ' + up(clamped), sep: true });
  }

  if (!lines.length) return null;

  // 5) Closer — the last rendered line terminates END (session day gets the
  // explicit "reply by showing up" closer); every prior line keeps STOP.
  const closer = isSessionDay ? { text: 'REPLY BY SHOWING UP', sep: false, end: true } : null;
  if (closer) lines.push(closer);
  else { lines[lines.length - 1] = Object.assign({}, lines[lines.length - 1], { sep: false, end: true }); }

  return lines;
}
