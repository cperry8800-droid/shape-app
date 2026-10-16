// Email for what belongs in an inbox, and a tier-up notice (owner, 2026-10-16: "Important types
// only"; for the rest "dont show period. save those other ones for notifications"; "for email
// include welcome email and when you tier up").
//
// Email is offered for coach messages, waitlist invites, tier-ups and a coach's waiting list. Every
// other type shows no Email switch and never emails. A coach's chat message and a tier-up are
// written by the database, so the push webhook emails them; this runs the real webhook against a
// fake database, row by row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { EMAIL_TYPES, EMAIL_ON_BY_DEFAULT, isEmailType, PHONE_ONLY_TYPES } from '../public/newdesign/notificationSurfaces.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

test('email is offered for the four types the owner chose, and a tier-up starts on', () => {
  assert.deepEqual([...EMAIL_TYPES].sort(), ['coach_message', 'tier_up', 'waitlist_invite', 'waitlist_join']);
  assert.deepEqual([...EMAIL_ON_BY_DEFAULT], ['tier_up']);
  for (const t of EMAIL_TYPES) assert.ok(!PHONE_ONLY_TYPES.includes(t), t + ' is emailed and kept off the website');
});

// ── the settings pages ─────────────────────────────────────────────────────────────────────────
const listIn = (src, name) => {
  const m = new RegExp('const ' + name + ' = \\[([^\\]]*)\\];').exec(src);
  assert.ok(m, name + ' moved');
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
};

test("the website's copies are the shared list, split by who sees each row", () => {
  const member = read('public/newdesign/clientMeSettings.jsx');
  const coach = read('public/newdesign/coachSettings.jsx');
  const memberEmail = listIn(member, 'NP_EMAIL_TYPES');
  const coachEmail = listIn(coach, 'CST_EMAIL_TYPES');
  assert.deepEqual([...memberEmail, ...coachEmail].sort(), [...EMAIL_TYPES].sort(), 'a website copy drifted from notificationSurfaces.mjs');
  assert.deepEqual(listIn(member, 'NP_EMAIL_ON'), [...EMAIL_ON_BY_DEFAULT]);
  // Each emailable type is a row on the page that offers it.
  for (const t of memberEmail) assert.match(member, new RegExp('\\["' + t + '", "'), t + ' has no row on the member page');
  for (const t of coachEmail) assert.match(coach, new RegExp('\\["' + t + '", "'), t + ' has no row on the coach page');
  assert.match(member, /\["tier_up", "Tier ups", "When you reach a new Shape Score tier"\],/);
});

test('a row email is not offered for shows no Email switch, on the website and in the app', () => {
  const member = read('public/newdesign/clientMeSettings.jsx');
  assert.match(member, /NP_CHANNELS\.map\(\(\[k, l\]\) => \(k === "email" && !NP_EMAIL_TYPES\.includes\(type\)\r?\n\s+\? <span key=\{k\} aria-hidden="true" style=\{\{ width: 52 \}\} \/>/);
  assert.match(member, /const chOn = \(type, ch\) => \{[^\n]*: npDefault\(type, ch\); \};/, 'the member page defaults a tier-up email off');
  assert.match(member, /if \(next === npDefault\(type, ch\)\) \{/, 'turning a tier-up email back on stores an override instead of clearing it');
  const coach = read('public/newdesign/coachSettings.jsx');
  assert.match(coach, /CST_CHANNELS\.map\(\(\[ch\]\) => \(ch === "email" && !CST_EMAIL_TYPES\.includes\(type\)\r?\n\s+\? <td key=\{ch\} style=\{\{ padding: "10px 8px" \}\} aria-hidden="true" \/>/);
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(app, /import \{ isEmailType, emailOnByDefault \} from '\.\.\/\.\.\/\.\.\/public\/newdesign\/notificationSurfaces\.mjs';/);
  assert.match(app, /_NP_CHANNELS\.map\(\(\[k, l\]\) => \(k === 'email' && !isEmailType\(type\)\r?\n\s+\? <span key=\{k\} aria-hidden="true" style=\{\{ width: 44, flexShrink: 0 \}\} \/>/);
  assert.match(app, /const chDefault = \(type, ch\) => \(ch === 'email' \? emailOnByDefault\(type\) : _NP_DEF_CH\[ch\]\);/);
  assert.match(app, /\['tier_up', 'Tier ups', 'When you reach a new Shape Score tier'\]/);
});

// ── the push webhook emails the rows the database writes ──────────────────────────────────────
// notification_settings and notification_preferences as stored; `earlier` is how many rows of the
// same kind the last hour holds besides this one.
function fakeAdmin({ settings = null, prefs = {}, earlier = 0, fail = null, email = 'member@example.com' } = {}) {
  const queries = [];
  const admin = {
    queries,
    auth: { admin: { getUserById: async () => ({ data: { user: { email } }, error: null }) } },
    from(table) {
      const q = { table, ops: [] };
      queries.push(q);
      const res = () => {
        if (fail === table) return { data: null, count: null, error: { message: 'down' } };
        if (table === 'notification_settings') return { data: settings, error: null };
        if (table === 'notification_preferences') {
          const type = (q.ops.filter((o) => o[0] === 'eq' && o[1] === 'type')[0] || [])[2];
          return { data: prefs[type] || [], error: null };
        }
        if (table === 'notifications') return { data: null, count: earlier, error: null };
        return { data: null, error: null };
      };
      const b = new Proxy({}, {
        get(_, op) {
          if (op === 'then') return (ok, no) => Promise.resolve(res()).then(ok, no);
          if (op === 'maybeSingle') return async () => res();
          return (...args) => { q.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
  return admin;
}

const st = { admin: null, pushes: [], emails: [], pushReady: true, sendOk: true };
const route = await loadRealModule(join(ROOT, 'src/app/api/push/dispatch/route.ts'), {
  typescript: true,
  registry: new Map([
    ['next/server', nextServer],
    ['@/lib/supabase/admin', { createAdminClient: () => st.admin }],
    ['@/lib/push', { pushConfigured: () => st.pushReady, sendPushToUser: async (_a, userId, p) => { st.pushes.push({ userId, ...p }); } }],
    ['@/lib/email', { sendEmail: async (m) => { st.emails.push(m); return st.sendOk ? { ok: true } : { ok: false, error: 'resend_500' }; } }],
    ['@/lib/ai/notifications.mjs', await import('../src/lib/ai/notifications.mjs')],
  ]),
});
process.env.PUSH_WEBHOOK_SECRET = 'test-secret';
const post = async (admin, record, { pushReady = true } = {}) => {
  st.admin = admin; st.pushes.length = 0; st.emails.length = 0; st.pushReady = pushReady;
  const errLog = console.error; console.error = () => {};
  try {
    const res = await route.POST(new Request('https://shape.test/api/push/dispatch', {
      method: 'POST', headers: { 'x-push-secret': 'test-secret', 'content-type': 'application/json' }, body: JSON.stringify({ record }),
    }));
    const body = await res.json();
    return { skipped: body.skipped || null, pushed: st.pushes.length, emailed: st.emails.map((m) => m.to) };
  } finally { console.error = errLog; }
};
const TIER = { id: 'n-1', user_id: 'u-1', type: 'tier_up', title: 'You reached Form', body: 'Your Form rewards are waiting in the Shape Store.', route: 'score', data: { tier: 'Form', dedupe: 'tier:Form' } };
const COACH_MSG = { id: 'n-2', user_id: 'u-1', type: 'message', title: 'New message', body: 'Sam: see you at 6', route: 'messages', data: { conversationId: 'c-1', providerRole: 'trainer', side: 'client' } };
const emailOn = (type) => ({ [type]: [{ channel: 'email', enabled: true }] });

test('a tier-up is emailed and pushed by default, and the email says what was reached', async () => {
  const a = fakeAdmin();
  assert.deepEqual(await post(a, TIER), { skipped: null, pushed: 1, emailed: ['member@example.com'] });
  const mail = st.emails[0];
  assert.equal(mail.subject, 'You reached Form');
  assert.match(mail.text, /Your Form rewards are waiting in the Shape Store\./);
  assert.match(mail.text, /Settings → Notifications/, 'the email does not say how to turn it off');
  // The cooldown read is this kind of row EMAILED in the last hour, other than this one: a row that
  // was never emailed (quiet hours, switch off) does not hold the next one back (Codex on #2387).
  const [cool, stamp] = a.queries.filter((q) => q.table === 'notifications');
  assert.deepEqual(cool.ops.find((o) => o[0] === 'neq'), ['neq', 'id', 'n-1']);
  assert.deepEqual(cool.ops.filter((o) => o[0] === 'eq'), [['eq', 'user_id', 'u-1'], ['eq', 'type', 'tier_up']]);
  const since = cool.ops.find((o) => o[0] === 'gte');
  assert.equal(since[1], 'data->>emailed_at', 'the cooldown counts rows, not emails sent');
  assert.ok(Math.abs(Date.now() - 3600_000 - Date.parse(since[2])) < 60_000, 'the cooldown is not one hour');
  // The sent email stamps its own row, keeping what the row already carried.
  const upd = stamp.ops.find((o) => o[0] === 'update');
  assert.ok(upd, 'a sent email is not recorded');
  assert.deepEqual({ ...upd[1].data, emailed_at: 'x' }, { ...TIER.data, emailed_at: 'x' });
  assert.ok(Math.abs(Date.now() - Date.parse(upd[1].data.emailed_at)) < 60_000);
  assert.deepEqual(stamp.ops.find((o) => o[0] === 'eq'), ['eq', 'id', 'n-1']);
});

test('a send that fails is not recorded as sent, so the next notice can still email', async () => {
  st.sendOk = false;
  try {
    const a = fakeAdmin();
    assert.deepEqual((await post(a, TIER)).emailed, ['member@example.com'], 'the send was not attempted');
    assert.ok(!a.queries.some((q) => q.ops.some((o) => o[0] === 'update')), 'a failed send was stamped as sent');
  } finally { st.sendOk = true; }
});

test('a tier-up email answers its switch, mute and quiet hours', async () => {
  assert.deepEqual((await post(fakeAdmin({ prefs: { tier_up: [{ channel: 'email', enabled: false }] } }), TIER)).emailed, [], 'turned off');
  // Muted with no quiet window saved, so mute alone has to stop it (unsaved quiet hours default to
  // 22:00-07:00, which would hide a missing mute check at night).
  assert.deepEqual((await post(fakeAdmin({ settings: { muted: true, quiet_start: 0, quiet_end: 0, tz: 'UTC' } }), TIER)).emailed, [], 'muted');
  const night = { muted: false, quiet_start: 0, quiet_end: 0, tz: 'UTC' };
  // quiet_start === quiet_end is "no quiet hours"; a window covering every hour is 0 to 24.
  assert.deepEqual((await post(fakeAdmin({ settings: night }), TIER)).emailed, ['member@example.com'], 'no quiet window, still sent');
  // A two-hour quiet window starting this hour, so the check holds at any time of day.
  const hour = new Date().getUTCHours();
  const quiet = { muted: false, quiet_start: hour, quiet_end: (hour + 2) % 24, tz: 'UTC' };
  assert.deepEqual((await post(fakeAdmin({ settings: quiet }), TIER)).emailed, [], 'inside quiet hours');
  assert.deepEqual((await post(fakeAdmin({ earlier: 1 }), TIER)).emailed, [], 'a second tier-up email inside the hour');
  assert.deepEqual((await post(fakeAdmin({ fail: 'notification_preferences' }), TIER)).emailed, [], 'unreadable preferences send nothing');
  assert.deepEqual((await post(fakeAdmin({ fail: 'notifications' }), TIER)).emailed, [], 'an unreadable cooldown sends nothing');
  assert.deepEqual((await post(fakeAdmin({ email: '' }), TIER)).emailed, [], 'no address');
});

test("a coach's message is emailed only when the member turned it on, and a burst is one email", async () => {
  assert.deepEqual((await post(fakeAdmin(), COACH_MSG)).emailed, [], 'emailed without being asked');
  assert.deepEqual(await post(fakeAdmin({ prefs: emailOn('coach_message') }), COACH_MSG), { skipped: null, pushed: 1, emailed: ['member@example.com'] });
  const a = fakeAdmin({ prefs: emailOn('coach_message') });
  await post(a, COACH_MSG);
  assert.deepEqual(a.queries.find((q) => q.table === 'notifications').ops.find((o) => o[0] === 'eq' && o[1] === 'data->>side'), ['eq', 'data->>side', 'client'],
    "a member's own direct messages count against their coach's email");
  assert.deepEqual((await post(fakeAdmin({ prefs: emailOn('coach_message'), earlier: 3 }), COACH_MSG)).emailed, [], 'every message of a burst emailed');
  // A coach reading their client's message, and a member's direct message, have no Email switch.
  for (const side of ['coach', undefined]) {
    const row = { ...COACH_MSG, data: { ...COACH_MSG.data, side } };
    assert.deepEqual((await post(fakeAdmin({ prefs: { message: [{ channel: 'email', enabled: true }] } }), row)).emailed, [], 'side ' + side);
  }
});

test('a row whose writer already decided its email, and a type email is not offered for, are never emailed here', async () => {
  const stamped = { ...TIER, type: 'waitlist_invite', data: { channels: { inapp: true, push: true, email: false } } };
  assert.deepEqual((await post(fakeAdmin({ prefs: emailOn('waitlist_invite') }), stamped)).emailed, [], 'notify.ts decided, and it is emailed twice');
  const sent = { ...stamped, data: { channels: { inapp: true, push: true, email: true } } };
  assert.deepEqual((await post(fakeAdmin({ prefs: emailOn('waitlist_invite') }), sent)).emailed, [], 'notify.ts already emailed it');
  for (const type of ['meal_prep', 'reminder_water', 'ai_streak_broken', 'session_booked', 'workout']) {
    const a = fakeAdmin({ prefs: emailOn(type) });
    assert.deepEqual((await post(a, { ...TIER, type, data: {} })).emailed, [], type);
    assert.ok(!a.queries.some((q) => q.table === 'notifications'), type + ' read the cooldown for an email it never sends');
  }
});

test('email does not wait on push being set up', async () => {
  assert.deepEqual(await post(fakeAdmin(), TIER, { pushReady: false }), { skipped: 'fcm_not_configured', pushed: 0, emailed: ['member@example.com'] });
});

test('the decision itself: only offered types, and a trigger row only', async () => {
  const a = fakeAdmin();
  assert.deepEqual(await route.emailDecision(a, TIER, 'tier_up'), { send: true });
  assert.deepEqual(await route.emailDecision(a, TIER, 'meal_prep'), { send: false, why: 'not_offered' });
  assert.deepEqual(await route.emailDecision(a, { ...TIER, id: undefined }, 'tier_up'), { send: false, why: 'no_record' });
  assert.ok(isEmailType('tier_up') && !isEmailType('ai_coach_message'));
});

// ── the tier-up notice ─────────────────────────────────────────────────────────────────────────
test('award_tier_bonuses writes one tier-up notice, for the highest tier the call newly reached', () => {
  const sql = read('supabase-migrations/2026-10-16-tier-up-notice.sql');
  const fn = sql.slice(sql.indexOf('create or replace function public.award_tier_bonuses()'), sql.indexOf('$$;', sql.indexOf('as $$')) + 3);
  // The tier is recorded only when its bonus row is new: a tier is announced once.
  assert.match(fn, /if v_ins > 0 then v_award := v_award \+ v_bonus\[i\]; v_new := v_names\[i\]; end if;/);
  // One notice after the loop, for the highest (the loop climbs), opening the Score page.
  assert.match(fn, /end loop;\n\n[\s\S]*if v_new is not null then\n\s+begin\n\s+insert into public\.notifications \(user_id, type, title, body, route, data\)\n\s+values \(v_uid, 'tier_up', 'You reached ' \|\| v_new,\n\s+'Your ' \|\| v_new \|\| ' rewards are waiting in the Shape Store\.', 'score',\n\s+jsonb_build_object\('tier', v_new, 'dedupe', 'tier:' \|\| v_new\)\)\n\s+on conflict do nothing;/);
  // A notice that cannot be written never costs the bonus.
  assert.match(fn, /exception when others then\n\s+raise warning/);
  // Otherwise the function is the 2026-10-12 one.
  const before = read('supabase-migrations/2026-10-12-shape-score-fixes.sql');
  const old = before.slice(before.indexOf('create or replace function public.award_tier_bonuses()'), before.indexOf('$$;', before.indexOf('create or replace function public.award_tier_bonuses()')) + 3);
  const strip = (s) => s.replace(/\n\s*v_new\s+text;/, '').replace(' v_new := v_names[i];', '').replace(/\n\n  -- The tier-up notice\.[\s\S]*?\n  end if;\n/, '\n');
  assert.equal(strip(fn), old, 'award_tier_bonuses changed beyond the notice');
  assert.match(sql, /security definer\nset search_path = public, pg_temp/);
  assert.match(sql, /p\.prosrc like '%''tier_up''%'/, 'the guard does not prove the notice is there');
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
});

test('a tier-up opens the Score page on every surface', async () => {
  const R = await import('../public/newdesign/notificationRoutes.mjs');
  assert.ok(R.routeAudience('score'), 'score is not a route');
  assert.match(read('public/newdesign/pageShell.jsx'), /score: "ClientScore\.html",/);
});
