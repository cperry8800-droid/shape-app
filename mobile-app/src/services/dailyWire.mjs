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
  // Check-in vitals levers (spec §3A) — observation + one concrete move,
  // never shaming. Home's engineMove map reads these as its tr() defaults.
  energy: 'Take today lighter.',
  hunger: 'Eat a real meal today.',
  hydration: 'Drink more water today.',
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

// Clock time for an "HH:MM" string. With a locale, Intl decides the CONVENTION
// as well as the words — de/fr/ru read 17:45, en reads 5:45 PM — so a 24-hour
// locale never gets an English AM/PM bolted onto its own clock. Without one it
// falls back to the original 12-hour formatter (keeps the module dependency-free
// and its unit vectors exact).
function time12(hhmm, locale) {
  const mm = String(hhmm == null ? '' : hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!mm) return null;
  let h = parseInt(mm[1], 10);
  const min = mm[2];
  if (h < 0 || h > 23) return null;
  if (locale) {
    try {
      // Fixed calendar day — only the clock reads out, so the date is inert.
      const d = new Date(2000, 0, 1, h, parseInt(min, 10));
      const out = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d);
      if (out) return out;
    } catch (e) { /* fall through to the ASCII formatter */ }
  }
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + min + ' ' + ap;
}

// Locale-aware upper-casing — Turkish dotless/dotted i is the classic break, and
// this runs over member-authored data (session titles, coach names). With no
// locale it is byte-identical to the previous toUpperCase().
function up(s, locale) { return locale ? String(s).toLocaleUpperCase(locale) : String(s).toUpperCase(); }

// Assemble the ordered wire lines from the digest + the resolved directive.
// SIGNED-OUT CONTRACT: null when the digest is absent OR digest.signedIn is not
// true — the caller renders the invite edition instead. A member digest with
// missing legs is the honest-omission path (each absent leg drops its line),
// never conflated with signed-out.
// Returns [{ text, hot }] — `hot` marks the teal directive line.
//
// LOCALIZATION. `opts.tr` is the app's translator and `opts.locale` its active
// language; both are OPTIONAL and the module carries the English wording as the
// fallback, so it stays pure, dependency-free and unit-testable exactly as
// before. T(key, en, vars) resolves through the translator when one is supplied
// and otherwise returns `en` — which the caller passes already interpolated, so
// no ICU is ever evaluated on the fallback path.
export function bsWireLines(digest, directive, opts) {
  if (!digest || digest.signedIn !== true) return null;
  const xl = (opts && opts.tr) || null;
  const loc = (opts && opts.locale) || null;
  const T = (key, en, vars) => {
    if (!xl) return en;
    try {
      const v = xl(key, Object.assign({ defaultValue: en }, vars || {}));
      return v == null || v === '' ? en : String(v);
    } catch (e) { return en; }
  };
  const lines = [];
  // ⚠ `tr` here is the digest's TRAINING leg, not a translator — the shadow is
  // pre-existing and load-bearing for the reads below. The translator is `xl`.
  const tr = digest.training;
  const sc = digest.score;
  const nu = digest.nutrition;
  const co = digest.coach;
  const streak = Number(digest.streak) || 0;
  const isSessionDay = !!(tr && tr.hasWorkout);

  // 1) Session line
  if (isSessionDay) {
    let head = up(tr.title || T('onboarding:wire.workout', 'Workout'), loc);
    const time = time12(tr.time, loc);
    if (time) head += ' ' + up(time, loc);
    // fold move count / duration in only when the line stays short
    const extras = [];
    if (tr.durationMin) extras.push(T('onboarding:wire.min', tr.durationMin + ' MIN', { n: tr.durationMin }));
    if (tr.moveCount) extras.push(T('onboarding:wire.moves', tr.moveCount + (tr.moveCount === 1 ? ' MOVE' : ' MOVES'), { n: tr.moveCount }));
    if (extras.length && head.length <= 26) head += ' ' + extras.join(' ');
    lines.push({ text: head, sep: true });
    if (f8(tr.coach)) lines.push({ text: T('onboarding:wire.with', 'WITH ' + up(tr.coach, loc), { coach: up(tr.coach, loc) }), sep: true });
  } else if (tr) {
    // plan exists but no session today → rest day
    lines.push({ text: T('onboarding:wire.restDay', 'REST DAY ON THE BOOKS'), sep: true });
  } else {
    // no plan at all
    lines.push({ text: T('onboarding:wire.noSession', 'NO SESSION ON THE WIRE'), sep: true });
    lines.push({ text: T('onboarding:wire.findCoach', 'FIND YOUR COACH INSIDE'), sep: true });
  }

  // 2) Directive (teal) — the one accent
  const d = bsWireDirective(directive);
  if (d) {
    // The head reads the SAME catalog key Home's engineMove map reads, with the
    // shared BS_LEVER_HEADS English as the default — so the telegram and the
    // Home lead cannot say a different move in ANY locale, not just in English.
    const head = up(T('home:lead.' + directive.lever + '.head', d.head), loc);
    const txt = d.reason ? T('onboarding:wire.directive', head + ' — ' + up(d.reason, loc), { head, reason: up(d.reason, loc) }) : head;
    lines.push({ text: txt, sep: true, hot: true });
  }

  // 3) Numbers line — fragments only when the datum exists
  const nums = [];
  if (sc && sc.score != null) {
    // The score numeral follows the member's language once one is supplied
    // (1.284 in de, 1,284 in en); with no locale it keeps the pinned en-US form.
    const n = Number(sc.score).toLocaleString(loc || 'en-US');
    nums.push(sc.delta > 0
      ? T('onboarding:wire.scoreUp', 'SCORE ' + Number(sc.score).toLocaleString('en-US') + ' UP ' + sc.delta, { score: n, delta: sc.delta })
      : T('onboarding:wire.score', 'SCORE ' + Number(sc.score).toLocaleString('en-US'), { score: n }));
  }
  if (nu && nu.protein != null) {
    nums.push(nu.proteinTarget != null
      ? T('onboarding:wire.proteinOf', 'PROTEIN ' + nu.protein + ' OF ' + nu.proteinTarget, { n: nu.protein, target: nu.proteinTarget })
      : T('onboarding:wire.protein', 'PROTEIN ' + nu.protein + 'G', { n: nu.protein }));
  }
  if (streak > 0) nums.push(T('onboarding:wire.streak', 'STREAK ' + streak + (streak === 1 ? ' DAY' : ' DAYS'), { n: streak }));
  if (nums.length) lines.push({ text: nums.join(' · '), sep: true });

  // 4) Coach note (optional)
  if (co && f8(co.text)) {
    const who = up(co.who || T('onboarding:wire.coachFallback', 'COACH'), loc);
    const clamped = String(co.text).length > 70 ? String(co.text).slice(0, 69).trim() + '…' : String(co.text);
    const body = up(clamped, loc);
    lines.push({ text: T('onboarding:wire.coachNote', who + ': ' + body, { who, text: body }), sep: true });
  }

  if (!lines.length) return null;

  // 5) Closer — the last rendered line terminates END (session day gets the
  // explicit "reply by showing up" closer); every prior line keeps STOP.
  const closer = isSessionDay ? { text: T('onboarding:wire.closer', 'REPLY BY SHOWING UP'), sep: false, end: true } : null;
  if (closer) lines.push(closer);
  else { lines[lines.length - 1] = Object.assign({}, lines[lines.length - 1], { sep: false, end: true }); }

  return lines;
}
