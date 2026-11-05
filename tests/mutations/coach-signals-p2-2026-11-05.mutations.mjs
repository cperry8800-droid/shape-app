// Mutation spec for P2 (2026-11-05): one engine everywhere, plus coach actions — the new signals, the
// coach-action table and the member drafts, dismiss and snooze, the care team's routing, joint
// attention and the shared input builder (public/newdesign/dashSignals.js); the alert memory that
// forgets a recovered client (src/lib/ai/notifications.mjs); the id and context the push reads
// (src/lib/ai/notify-core.ts); Nora's and the app's paths onto the builder; the reply-wait leg.
// Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-signals-p2-2026-11-05.mutations.mjs --fail-on-skipped
const SIG = 'public/newdesign/dashSignals.js';
const NOTE = 'src/lib/ai/notifications.mjs';
const CORE = 'src/lib/ai/notify-core.ts';
const NORA = 'src/lib/ai/coachToday.mjs';
const APP = 'mobile-app/src/services/shapeSignals.js';
const LEGS = 'src/lib/coach-client-legs.mjs';

export default {
  test: 'node --test tests/coach-actions.test.mjs tests/coach-alert-memory.test.mjs tests/coach-signals-surfaces.test.mjs tests/dash-signals.test.mjs tests/dash-triage-routing.test.mjs tests/dash-vitals-triage.test.mjs tests/ai-notifications.test.mjs tests/nora-coach-today.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── missed sessions ──
    { name: 'missed: the threshold itself does not flag', file: SIG, find: 'if (!(missed >= THRESHOLDS.MISSED_SESSIONS)) return null;', replace: 'if (!(missed > THRESHOLDS.MISSED_SESSIONS)) return null;' },
    { name: 'missed: no evidence floor', file: SIG, find: 'planned < THRESHOLDS.MISSED_MIN_PLANNED) return null;', replace: 'planned < 0) return null;' },
    { name: 'missed: a sole nutritionist is not told', file: SIG, find: 'if ((disciplineForRole(role) === "training" || !hasPro(c, "trainer")) && (f = ruleMissedSessions(c))) flags.push(f);', replace: 'if (disciplineForRole(role) === "training" && (f = ruleMissedSessions(c))) flags.push(f);' },
    { name: 'missed: every nutritionist is told', file: SIG, find: 'if ((disciplineForRole(role) === "training" || !hasPro(c, "trainer")) && (f = ruleMissedSessions(c))) flags.push(f);', replace: 'if ((f = ruleMissedSessions(c))) flags.push(f);' },

    // ── a check-in waiting ──
    { name: 'checkin: an unread review state counts as unreviewed', file: SIG, find: 'if (!latest || latest.reviewed !== false || typeof latest.weekOf !== "string") return null;', replace: 'if (!latest || latest.reviewed === true || typeof latest.weekOf !== "string") return null;' },
    { name: 'checkin: an old one still waits', file: SIG, find: 'if (age < 0 || age > 7) return null;', replace: 'if (age < 0 || age > 14) return null;' },
    { name: 'checkin: a 2 is not low', file: SIG, find: 'var low = CHECKIN_RATINGS[i][2] === "hi" ? v <= THRESHOLDS.CHECKIN_RATING_LOW : v >= 6 - THRESHOLDS.CHECKIN_RATING_LOW;', replace: 'var low = CHECKIN_RATINGS[i][2] === "hi" ? v < THRESHOLDS.CHECKIN_RATING_LOW : v >= 6 - THRESHOLDS.CHECKIN_RATING_LOW;' },
    { name: 'checkin: a 4 on stress is not low', file: SIG, find: 'var low = CHECKIN_RATINGS[i][2] === "hi" ? v <= THRESHOLDS.CHECKIN_RATING_LOW : v >= 6 - THRESHOLDS.CHECKIN_RATING_LOW;', replace: 'var low = CHECKIN_RATINGS[i][2] === "hi" ? v <= THRESHOLDS.CHECKIN_RATING_LOW : v > 6 - THRESHOLDS.CHECKIN_RATING_LOW;' },
    { name: 'checkin: an off-scale rating is read', file: SIG, find: 'if (v == null || v < 1 || v > 5) continue;', replace: 'if (v == null) continue;' },
    { name: 'checkin: a question alone does not flag', file: SIG, find: 'if (!lows.length && !asked) return null;', replace: 'if (!lows.length) return null;' },

    // ── a reply waiting ──
    { name: 'reply: the threshold itself does not flag', file: SIG, find: 'if (!(hours >= THRESHOLDS.REPLY_WAIT_HOURS)) return null;', replace: 'if (!(hours > THRESHOLDS.REPLY_WAIT_HOURS)) return null;' },
    { name: "reply: the trainer's thread for every role", file: SIG, find: 'var since = own ? toDate(rw[own]) : null;', replace: 'var since = toDate(rw.trainer);' },
    { name: 'reply leg: a system message ends the walk', file: LEGS, find: '      if (m.sender_id == null) continue;', replace: '      if (m.sender_id == null) break;' },
    { name: "reply leg: the coach's reply does not end it", file: LEGS, find: "      if (String(m.sender_id) !== String(clientId)) break;", replace: "      if (String(m.sender_id) !== String(clientId)) continue;" },

    // ── a program ending ──
    { name: 'program: the next block lined up still flags', file: SIG, find: 'p.status === "paused" || p.nextAssigned) return null;', replace: 'p.status === "paused") return null;' },
    { name: 'program: a long-over block flags', file: SIG, find: 'if (left > THRESHOLDS.PROGRAM_END_DAYS || left < -THRESHOLDS.PROGRAM_ENDED_DAYS) return null;', replace: 'if (left > THRESHOLDS.PROGRAM_END_DAYS) return null;' },
    { name: 'program: the last week does not flag', file: SIG, find: 'if (wk == null || total == null || total <= 0 || wk < total) return null;', replace: 'if (wk == null || total == null || total <= 0 || wk <= total) return null;' },

    // ── payment retrying, plan ending, recovery ──
    { name: "payment: the status alone does not say it", file: SIG, find: 'var retrying = (pay && (pay.paymentRetrying === true || pay.status === "past_due")) || (c.profile && c.profile.paymentRetrying === true);', replace: 'var retrying = (pay && pay.paymentRetrying === true) || (c.profile && c.profile.paymentRetrying === true);' },
    { name: "payment: the app's profile mark does not say it", file: SIG, find: 'var retrying = (pay && (pay.paymentRetrying === true || pay.status === "past_due")) || (c.profile && c.profile.paymentRetrying === true);', replace: 'var retrying = (pay && (pay.paymentRetrying === true || pay.status === "past_due"));' },
    { name: 'plan ending: an uncancelled plan flags', file: SIG, find: 'if (!pay || pay.cancelAtPeriodEnd !== true) return null;', replace: 'if (!pay) return null;' },
    { name: 'plan ending: any end date flags', file: SIG, find: 'if (left < 0 || left > THRESHOLDS.PLAN_END_DAYS) return null;', replace: 'if (left < 0) return null;' },
    { name: 'recovery: no evidence floor', file: SIG, find: 'if (avg == null || n == null || n < THRESHOLDS.RECOVERY_MIN_DAYS) return null;', replace: 'if (avg == null || n == null || n < 1) return null;' },
    { name: 'recovery: the line itself does not flag', file: SIG, find: 'if (!(avg <= THRESHOLDS.RECOVERY_LOW)) return null;', replace: 'if (!(avg < THRESHOLDS.RECOVERY_LOW)) return null;' },
    { name: 'the new signals reach the member view', file: SIG, find: '    var coachView = disciplineForRole(role) !== "general";\n    if (coachView) {', replace: '    var coachView = disciplineForRole(role) !== "general";\n    if (true) {' },

    // ── severity ──
    { name: 'severity counts routed flags', file: SIG, find: 'var counted = (coachView ? flags.filter(function (fl) { return tagFlag(fl, role, c).owned; }) : flags)', replace: 'var counted = (flags)' },
    { name: 'the quiet payment flag colours the row', file: SIG, find: '      .filter(function (fl) { return !QUIET_FLAGS[fl.key]; });', replace: '      .filter(function (fl) { return true; });' },
    { name: 'the soft flags tip a row red', file: SIG, find: 'var hard = counted.filter(function (fl) { return !SOFT_FLAGS[fl.key]; });', replace: 'var hard = counted;' },
    { name: 'a set-aside overdue check-in still turns red', file: SIG, find: 'else if (ciFlag && counted.indexOf(ciFlag) >= 0 && ciFlag.missedWeeks >= THRESHOLDS.CHECKIN_RED_WEEKS) severity = "red";', replace: 'else if (ciFlag && ciFlag.missedWeeks >= THRESHOLDS.CHECKIN_RED_WEEKS) severity = "red";' },

    // ── the care team's routing ──
    { name: 'a sole trainer does not own the nutrition reads', file: SIG, find: 'var soleTrainer = disciplineForRole(role) === "training" && !hasPro(c, "nutritionist");', replace: 'var soleTrainer = false;' },
    { name: 'a sole trainer sees the nutrition reads twice', file: SIG, find: 'if (disciplineForRole(role) !== "nutrition" && hasPro(c, "nutritionist")) {', replace: 'if (disciplineForRole(role) !== "nutrition") {' },
    { name: 'a partial care team claims an absent discipline', file: SIG, find: 'if (o.careTeamPartial === true) {', replace: 'if (false) {' },
    { name: 'the coach is their own co-coach', file: SIG, find: 'if (!m.isMe && typeof m.userId === "string" && m.userId) co.push(', replace: 'if (typeof m.userId === "string" && m.userId) co.push(' },

    // ── dismiss and snooze ──
    { name: 'a dismissal hides nothing', file: SIG, find: 'if (isDismissed(c.dismissals, fl, now)) { dismissed.push(fl); return false; }', replace: 'if (false) { dismissed.push(fl); return false; }' },
    { name: 'a dismissal outlives its episode', file: SIG, find: 'if (!d || d.key !== flag.key || typeof d.sig !== "string" || d.sig !== flag.sig) continue;', replace: 'if (!d || d.key !== flag.key) continue;' },
    { name: 'a snooze never runs out', file: SIG, find: 'if (!u || u.getTime() <= at) continue;', replace: 'if (!u) continue;' },
    { name: 'an unreadable snooze hides forever', file: SIG, find: 'if (!u || u.getTime() <= at) continue;', replace: 'if (u && u.getTime() <= at) continue;' },
    { name: 'a routed flag cannot be set aside', file: SIG, find: 'return out.filter(function (x) { return !isDismissed(c.dismissals, x, now); });', replace: 'return out;' },
    { name: "one client's dismissal hides another's", file: SIG, find: 'if (byClient) out.dismissals = id && byClient[id] ? byClient[id] : [];', replace: 'if (byClient) out.dismissals = [].concat.apply([], Object.keys(byClient).map(function (k) { return byClient[k]; }));' },
    { name: 'the tagged flag drops its episode', file: SIG, find: '      sig: f.sig || null,', replace: '      sig: null,' },

    // ── the lead, the actions, the drafts, the brief ──
    { name: 'a routed flag leads', file: SIG, find: 'var owned = (row && Array.isArray(row.flags) ? row.flags : []).filter(function (f) { return f && f.owned !== false; });', replace: 'var owned = (row && Array.isArray(row.flags) ? row.flags : []).filter(function (f) { return !!f; });' },
    { name: 'one action for every role', file: SIG, find: 'var v = (disc === "nutrition" && base.nutrition) || (disc === "training" && base.training) || base;', replace: 'var v = base;' },
    { name: 'every action carries a client draft', file: SIG, find: 'var draft = v.draft ? memberDraft(key, rec, role, flag) : null;', replace: 'var draft = memberDraft(key, rec, role, flag);' },
    { name: 'never written to reads "been a while"', file: SIG, find: 'if ((hello && hello.done === false) || (flag && (flag.sig === "hello" || flag.sig === "never"))) return', replace: 'if (hello && hello.done === false) return' },
    { name: 'the brief names a green row', file: SIG, find: 'return r && (r.severity === "red" || r.severity === "amber") && r.lead;', replace: 'return r && r.lead;' },

    // ── joint attention ──
    { name: 'joint attention without a co-coach', file: SIG, find: '      if (!coCoach) continue;\n', replace: '' },
    { name: 'any co-coach is the other side', file: SIG, find: 'if (want ? xr === want : (xr === "trainer" || xr === "nutritionist")) return', replace: 'if (xr === "trainer" || xr === "nutritionist") return' },

    // ── the builder, the snapshot, the reviews ──
    { name: 'a reviewed check-in by signature always counts', file: SIG, find: 'if (review.checkinSignature) return textHash(review.checkinSignature) === latest.hash;', replace: 'if (review.checkinSignature) return true;' },
    { name: 'a review before the check-in counts', file: SIG, find: 'return !latest.submittedAt || latest.submittedAt <= review.reviewedAt;', replace: 'return true;' },
    { name: 'the snapshot has no id the route reads', file: SIG, find: '    if (id) out.userId = id;\n', replace: '' },
    { name: 'a zero is a night of sleep', file: SIG, find: '.filter(function (v) { return v != null && v > 0; }) : [];', replace: '.filter(function (v) { return v != null; }) : [];' },

    // ── the alert memory ──
    { name: 'the memory never forgets', file: NOTE, find: "    if (sev !== 'red' && sev !== 'amber') delete out[id];\n", replace: '' },
    { name: 'easing to amber is not remembered', file: NOTE, find: "    else if (out[id] === 'red' && sev === 'amber') out[id] = 'amber';\n", replace: '' },
    { name: 'the decision never settles the memory', file: NOTE, find: "coachClients: audience === 'coach' ? settleCoachMemory(last.coachClients, seen) : { ...(last.coachClients || {}) },", replace: "coachClients: { ...(last.coachClients || {}) }," },
    { name: "a recovered client's stamps stay", file: NOTE, find: "      for (const id of clear) { delete state.types[`client_red:${id}`]; delete state.types[`client_amber:${id}`]; }\n", replace: '' },
    { name: "a recovered client's held alert still goes", file: NOTE, find: "      state.pendingDigest = state.pendingDigest.filter((i) => !(i && (i.type === 'client_red' || i.type === 'client_amber') && clear.has(i.key)));\n", replace: '' },
    { name: "an eased client's red stamp stays", file: NOTE, find: "    for (const id of Object.keys(seen)) if (seen[id] === 'amber' && prev[id] === 'red') delete state.types[`client_red:${id}`];\n", replace: '' },
    { name: 'routed-only rows count as alerting', file: NOTE, find: "    const owned = (row.flags || []).some((f) => f && f.owned !== false);", replace: '    const owned = true;' },
    { name: "the push says the first owned flag, not Today's lead", file: NOTE, find: "const reason = (row.lead && row.lead.reason) || (ownedFlags[0] && ownedFlags[0].reason) || row.reason || '';", replace: "const reason = (ownedFlags[0] && ownedFlags[0].reason) || row.reason || '';" },

    // ── the push's reads ──
    { name: "the route cannot read the app's ids", file: CORE, find: "const v = r.userId ?? r.id ?? (r.profile && typeof r.profile === 'object' ? r.profile.id : null);", replace: 'const v = r.userId ?? r.id;' },
    { name: "the push ignores the fresh dismissals", file: CORE, find: 'const clients = opts.coachContext ? engine.attachCoachContext(raw, opts.coachContext, role) : raw;', replace: 'const clients = raw;' },
    { name: 'the push does not report who it saw', file: CORE, find: '      coachSeen: Notify.coachSeen(rows),', replace: '      coachSeen: {},' },

    // ── Nora and the app on the builder ──
    { name: "Nora skips the overview", file: NORA, find: '      if (ov) { read += 1; return { client: c, ov }; }', replace: '' },
    { name: "Nora ignores the coach's dismissals", file: NORA, find: 'engine.attachCoachContext(group.map((x) => recordFor(x, role)), ctx, role)', replace: 'group.map((x) => recordFor(x, role))' },
    { name: "the app ignores the coach's tuning", file: APP, find: 'call(e.getTriageFeed, role, withCtx, undefined, thresholds || undefined)', replace: 'call(e.getTriageFeed, role, withCtx)' },
    { name: 'the app skips the overview', file: APP, find: '    if (built) return built;\n', replace: '' },
  ],
};
