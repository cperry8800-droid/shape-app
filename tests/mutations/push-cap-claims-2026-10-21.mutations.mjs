// Mutation spec for the daily push cap's places claimed in the database (owner, 2026-10-21: "yes
// build the cap reservation"): the migration (supabase-migrations/2026-10-21-push-cap-claims.sql),
// the claim and release (src/lib/push-cap.ts), the engine's claim and second decision
// (decideAndClaim, src/lib/ai/notify-core.ts, with dailyCap and pushCount in notifications.mjs),
// both engine routes, and the habit cron's claim per notice, asked for in notify.ts only once the
// notice is known to push. Every mutation must be killed. The
// migration's mutations are read by its shape test only; its behaviour, the race above all, was
// run against Postgres 16 (the PR records how). Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/push-cap-claims-2026-10-21.mutations.mjs --fail-on-skipped
const SQL = 'supabase-migrations/2026-10-21-push-cap-claims.sql';
const CAP = 'src/lib/push-cap.ts';
const GATE = 'src/lib/ai/notifications.mjs';
const CORE = 'src/lib/ai/notify-core.ts';
const LIVE = 'src/app/api/ai/notify/route.ts';
const CRON = 'src/app/api/ai/notify/cron/route.ts';
const HABIT = 'src/app/api/cron/habit-watch/route.ts';
const NOTIFY = 'src/lib/notify.ts';

export default {
  test: 'node --test tests/ai-notify-daily-cap.test.mjs tests/habit-watch.test.mjs tests/notify-preferred.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The migration ──
    { name: 'no lock: two claims count the same rows', file: SQL, find: "  perform pg_advisory_xact_lock(hashtextextended('shape.push_cap:' || p_user::text, 0));\n", replace: '' },
    { name: "other senders' places are not counted", file: SQL, find: 'p_cap::bigint - v_used - v_held', replace: 'p_cap::bigint - v_used' },
    { name: 'a lapsed claim still holds its places', file: SQL, find: '  delete from public.push_cap_claims c where c.user_id = p_user and c.expires_at <= now();\n', replace: '' },
    { name: 'a claim lapses after five hours', file: SQL, find: "now() + interval '5 minutes'", replace: "now() + interval '5 hours'" },
    { name: 'every notice counts as a push', file: SQL, find: "    and n.data -> 'channels' ->> 'push' = 'true'\n", replace: '' },
    { name: "yesterday's pushes count today", file: SQL, find: '    and (n.created_at at time zone v_tz)::date = v_today;', replace: ';' },
    { name: 'the function runs as its owner', file: SQL, find: 'language plpgsql security invoker set search_path', replace: 'language plpgsql security definer set search_path' },
    { name: 'members may claim places', file: SQL, find: 'to service_role;\n\ncomment on table', replace: 'to service_role, authenticated;\n\ncomment on table' },
    { name: 'the table is left open to members', file: SQL, find: 'revoke all on public.push_cap_claims from public, anon, authenticated;', replace: 'revoke all on public.push_cap_claims from public, anon;' },

    // ── The claim and its release ──
    { name: 'more places than asked are taken', file: CAP, find: 'granted: Math.min(granted, want) }', replace: 'granted }' },
    { name: 'a failed claim grants everything', file: CAP, find: "sending on the count as read:', error.message);\n      return null;", replace: "sending on the count as read:', error.message);\n      return { id: null, granted: want };" },
    { name: 'a failed claim refuses every push', file: CAP, find: "sending on the count as read:', error.message);\n      return null;", replace: "sending on the count as read:', error.message);\n      return { id: null, granted: 0 };" },
    { name: 'a negative grant is read as a claim', file: CAP, find: ' || granted < 0) {', replace: ') {' },
    { name: 'a fractional grant is read as a claim', file: CAP, find: '!Number.isInteger(granted)', replace: '!Number.isFinite(granted)' },
    { name: 'nothing wanted still asks', file: CAP, find: "  if (!userId || !(want > 0)) return { id: null, granted: 0 };\n", replace: '' },
    { name: 'no zone is sent as blank', file: CAP, find: "p_tz: tz || 'UTC'", replace: 'p_tz: tz' },
    { name: 'a release deletes every claim', file: CAP, find: ".delete().eq('id', claim.id)", replace: '.delete()' },
    { name: 'a claim with no id is released anyway', file: CAP, find: '  if (!claim || !claim.id) return;', replace: '  if (!claim) return;' },

    // ── The engine ──
    { name: 'nothing to push still claims', file: CORE, find: '  if (want < 1) return { decided, claim: null };\n', replace: '' },
    { name: 'a short grant keeps the first decision', file: CORE, find: '  return { decided: Notify.decideNotifications({ ...input, pushedToday: cap - claim.granted }), claim };', replace: '  return { decided, claim };' },
    { name: 'the second decision counts the grant as the day', file: CORE, find: 'pushedToday: cap - claim.granted', replace: 'pushedToday: claim.granted' },
    { name: 'the claim is under the default cap, not the person', file: CORE, find: '  const cap = Notify.dailyCap(input.prefs);', replace: '  const cap = 4;' },
    { name: 'the claim asks for the whole cap', file: CORE, find: '{ tz: capTz, cap, want }', replace: '{ tz: capTz, cap, want: cap }' },
    { name: "the claim is on UTC's day", file: CORE, find: '{ tz: capTz, cap, want }', replace: "{ tz: 'UTC', cap, want }" },
    { name: 'an item without channels counts as no push', file: GATE, find: '!!(i && (i.channels ? i.channels.push : true))', replace: '!!(i && i.channels && i.channels.push)' },
    { name: 'a digest is never counted', file: GATE, find: ' + (digest && pushes(digest) ? 1 : 0);', replace: ';' },
    { name: 'a zero cap is a cap of zero', file: GATE, find: 'return (prefs && prefs.maxPerDay) || DEFAULT_PREFS.maxPerDay;', replace: 'return (prefs && prefs.maxPerDay) ?? DEFAULT_PREFS.maxPerDay;' },

    // ── The routes ──
    { name: 'the live route never releases its claim', file: LIVE, find: '    await releasePushClaim(admin, claim);\n', replace: '' },
    { name: 'the cron releases before it delivers', file: CRON, find: "    try {\n      if (items.length) { await deliver(admin, userId, items); delivered += items.length; }\n    } finally {\n      // The notices have landed and count themselves now.\n      await releasePushClaim(admin, claim);\n    }", replace: "    await releasePushClaim(admin, claim);\n    if (items.length) { await deliver(admin, userId, items); delivered += items.length; }" },
    { name: "the live route claims on the member's own client", file: LIVE, find: 'await decideAndClaim(admin, actor.user.id,', replace: 'await decideAndClaim(actor.supabase, actor.user.id,' },
    { name: "the cron claims on the settings' day", file: CRON, find: 'tr: copy?.tr }, prefs.capTz);', replace: 'tr: copy?.tr }, prefs.tz);' },

    // ── The habit cron ──
    { name: 'the habit cron claims nothing', file: HABIT, find: '        claimPush,\n', replace: '' },
    { name: 'a refused place still pushes', file: HABIT, find: '        if (!claim || claim.granted >= 1) return true;', replace: '        return true;' },
    { name: 'a failed claim refuses the push', file: HABIT, find: '        if (!claim || claim.granted >= 1) return true;', replace: '        if (claim && claim.granted >= 1) return true;' },
    { name: 'a refused place stays counted', file: HABIT, find: "        if (reserved) { reserved = false; pushed.set(n.watcherId, (pushed.get(n.watcherId) || 1) - 1); }", replace: '        if (reserved) { reserved = false; }' },
    { name: 'the habit cron claims under the default cap', file: HABIT, find: '{ tz: tzOf(n.watcherId), cap, want: 1 }', replace: '{ tz: tzOf(n.watcherId), cap: DAILY_CAP, want: 1 }' },
    { name: "the habit cron claims on UTC's day", file: HABIT, find: '{ tz: tzOf(n.watcherId), cap, want: 1 }', replace: "{ tz: 'UTC', cap, want: 1 }" },
    { name: 'the habit cron never releases', file: HABIT, find: '      await releasePushClaim(admin, claim);\n', replace: '' },

    // ── The place is asked for only for a notice that pushes (Codex on #2420) ──
    { name: 'a place is asked for before the switches say it pushes', file: NOTIFY, find: '    if (channels.push && given.claimPush && !(await given.claimPush()))', replace: '    if (given.claimPush && !(await given.claimPush()))' },
    { name: 'a refused place still pushes from notify', file: NOTIFY, find: "    if (channels.push && given.claimPush && !(await given.claimPush())) { channels.push = false; channels.email = false; }\n", replace: '' },
    { name: 'a refused place still emails', file: NOTIFY, find: '    if (channels.push && given.claimPush && !(await given.claimPush())) { channels.push = false; channels.email = false; }', replace: '    if (channels.push && given.claimPush && !(await given.claimPush())) { channels.push = false; }' },
  ],
};
