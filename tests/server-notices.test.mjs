// Every server notice in its reader's language (owner, 2026-10-21: "fix the other server notices
// wording too"). The notifications row keeps the English its writer wrote: the website shows it, and
// so does every English reader. A writer stores its copy beside it (`data.copy`, keys under notice:),
// a database trigger's row is matched by its fixed English (triggerCopy), and the app's bell, push
// dispatch (push and email) and the preference-aware email say it again from the `notice` catalog
// (mobile-app/src/services/noticeCopy.mjs). Driven here: the renderer against the real catalogs
// through the server's own translator, the trigger shapes against the migrations that write them, the
// writers' keys against the catalog, and push dispatch end to end with the real reader-copy module.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { ACTIVE_LOCALES, intlLocaleOf } from '../mobile-app/src/i18n/locales.mjs';
import * as Translator from '../src/lib/ai/memberTranslator.mjs';
import { np, atTime, onDay, usdOf, phrase, listOf, weekdayOf, sayPart, triggerCopy, noticeText } from '../mobile-app/src/services/noticeCopy.mjs';
import { habitWatchText, habitWatchCopy } from '../src/lib/habit-watch.mjs';
import { bsPrepReminderText, bsPrepReminderCopy } from '../mobile-app/src/services/prepAhead.mjs';
import { containsShaming } from '../src/lib/ai/tone.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(join(ROOT, f), 'utf8');
const cat = (loc, ns) => JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/${ns}.json`));
const CATS = Object.fromEntries(ACTIVE_LOCALES.map((l) => [l, { home: cat(l, 'home'), notice: cat(l, 'notice') }]));
const copyFor = Translator.makeMemberCopy(CATS);
const EN = cat('en', 'notice');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

// Say a stored part in a language, through the server's translator.
const sayIn = (loc, part) => { const c = copyFor(loc, false); return sayPart(part, c.tr, c.locale); };

// ── the renderer ─────────────────────────────────────────────────────────────────────────────────
test('each stored value is said in the reader\'s language: a time on its clock, a day, an amount, a phrase, a list, a weekday', () => {
  const at = '2026-10-23T16:30:00Z';
  // On the writer's clock: 9:30 AM in Los Angeles, said in Spanish.
  const es = sayIn('es', np('session.booked.body', { when: atTime(at, 'America/Los_Angeles') }));
  const want = new Intl.DateTimeFormat('es', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).format(new Date(at));
  assert.ok(es.includes(want), es);
  assert.notEqual(es, sayIn('en', np('session.booked.body', { when: atTime(at, 'America/Los_Angeles') })));
  // With no zone it is UTC, and says so, as the English did.
  assert.match(sayIn('en', np('session.booked.body', { when: atTime(at) })), /UTC/);
  // With the weekday, when the writer named one (a session request).
  assert.match(sayIn('de', np('session.request.body', { client: 'Cara', when: atTime(at, 'Europe/Berlin', true) })), /Fr\./);
  // A calendar day, short and long, never shifted by a zone.
  assert.equal(sayIn('en', np('week.body', { count: 3, day: onDay('2026-10-19') })), '3 sessions updated for the week of Oct 19');
  assert.equal(sayIn('en', np('credential.insurance.body', { date: onDay('2026-11-01', 'long') })), 'Your liability insurance expires November 1, 2026. Renew and re-upload your COI to keep your Verified badge.');
  // An amount in cents, in the reader's way of writing money.
  assert.equal(sayIn('en', np('receipt.title', { amount: usdOf(4999) })), 'Payment received: $49.99');
  assert.equal(sayIn('de', np('receipt.title', { amount: usdOf(4999) })), CATS.de.notice['receipt.title'].replace('{amount}', new Intl.NumberFormat('de', { style: 'currency', currency: 'USD' }).format(49.99)));
  // A phrase of the catalog's own, nested; a list joined as the language joins; a weekday by number.
  const reasons = listOf(['workout', 'checkin', 'habit'].map((k) => phrase('score.reason.' + k)));
  assert.equal(sayIn('en', np('score.dip.body', { points: 12, reasons })), "12 pts came off for a skipped workout, last week's check-in, and a broken habit streak. No worries — jump back in and you'll earn it right back.");
  assert.equal(sayIn('en', np('prep.days.body', { count: 2, slot: phrase('prep.slot.lunch'), days: listOf([weekdayOf(0), weekdayOf(2)]) })), 'Make 2 tonight, for lunch on Monday and Wednesday.');
  assert.match(sayIn('fr', np('prep.days.body', { count: 2, slot: phrase('prep.slot.lunch'), days: listOf([weekdayOf(0), weekdayOf(2)]) })), /lundi et mercredi/);
});

test('anything the renderer cannot say leaves the stored English', () => {
  const tr = copyFor('es', false).tr;
  const row = (copy) => ({ type: 'session_booked', title: 'Session booked', body: 'Your coach booked a session with you on Oct 23, 9:30 AM.', data: { copy } });
  const english = { title: 'Session booked', body: 'Your coach booked a session with you on Oct 23, 9:30 AM.' };
  // A key the catalog lacks, an unreadable time, a missing var, a list with a hole, a broken part.
  for (const copy of [
    { title: np('session.nope.title'), body: np('session.nope.body') },
    { title: ['session.booked.title', null], body: np('session.booked.body', { when: atTime('not a date') }) },
    { title: [42], body: np('session.booked.body') },
    { title: 'session.booked.title', body: np('score.dip.body', { points: 3, reasons: listOf([phrase('score.reason.workout'), null]) }) },
  ]) {
    const said = noticeText(row(copy), tr, { english: false, locale: 'es' });
    // Each part stands alone: one that says is said, one that cannot keeps its English.
    assert.equal(said.body, english.body, JSON.stringify(copy));
  }
  assert.equal(noticeText(row({ title: np('session.nope.title') }), tr, { english: false, locale: 'es' }).title, 'Session booked');
  // A part that is said, beside one that is not.
  const half = noticeText(row({ title: np('session.booked.title'), body: np('session.booked.body', { when: atTime('nope') }) }), tr, { english: false, locale: 'es' });
  assert.deepEqual(half, { title: CATS.es.notice['session.booked.title'], body: english.body });
  // A translator that throws, or answers with the key, or with braces still in it.
  for (const bad of [() => { throw new Error('x'); }, (k) => k, () => 'Hola {name}']) {
    assert.deepEqual(noticeText(row({ title: np('session.booked.title') }), bad, { english: false, locale: 'es' }), english);
  }
});

test('English is said as stored, and so is an AI notice and a row with no copy', () => {
  const tr = copyFor('es', false).tr;
  const row = { type: 'waitlist_join', title: 'New waiting-list request', body: 'Someone joined your waiting list.', data: { copy: { title: np('waitlist.join.title'), body: np('waitlist.join.body') } } };
  assert.deepEqual(noticeText(row, tr, { english: true, locale: 'en' }), { title: row.title, body: row.body });
  assert.deepEqual(noticeText(row, tr, {}), { title: row.title, body: row.body }, 'English unless the caller says otherwise');
  assert.deepEqual(noticeText(row, null, { english: false }), { title: row.title, body: row.body });
  assert.deepEqual(noticeText(row, tr, { english: false, locale: 'es' }), { title: CATS.es.notice['waitlist.join.title'], body: CATS.es.notice['waitlist.join.body'] });
  // The AI layer's rows are already in their reader's language (notifications.mjs).
  const ai = { ...row, type: 'ai_directive' };
  assert.deepEqual(noticeText(ai, tr, { english: false, locale: 'es' }), { title: row.title, body: row.body });
  // A row whose copy is absent and whose English no trigger writes: as written.
  assert.deepEqual(noticeText({ type: 'reminder_custom', title: 'Stretch', body: '' }, tr, { english: false, locale: 'es' }), { title: 'Stretch', body: '' });
  // A writer's own words with no body copy keep them: a coach's notes under a translated title.
  const notes = noticeText({ type: 'credential_changes', title: 'Credential review — a quick fix needed', body: 'Upload the back of the card.', data: { copy: { title: np('credential.changes.title') } } }, tr, { english: false, locale: 'es' });
  assert.deepEqual(notes, { title: CATS.es.notice['credential.changes.title'], body: 'Upload the back of the card.' });
});

// ── rows a database trigger writes ───────────────────────────────────────────────────────────────
const TRIGGER_ROWS = [
  [{ type: 'message', title: 'New message', body: 'Sam: see you at 6' }, { title: np('message.title') }, 'notify_on_new_message', "'New message'"],
  [{ type: 'workout', title: 'New workout from your coach', body: 'Leg day' }, { title: np('workout.title') }, 'notify_on_client_workout', "'New workout from your coach'"],
  [{ type: 'workout', title: 'New exercise from your coach', body: 'Goblet squat' }, { title: np('exercise.title') }, 'notify_on_pushed_item', "'New exercise from your coach'"],
  [{ type: 'workout', title: 'Your week from your coach', body: '3 sessions updated for the week of Oct 19', data: { sessions: 3, weekStartISO: '2026-10-19' } }, { title: np('week.title'), body: np('week.body', { count: 3, day: onDay('2026-10-19') }) }, 'publish_client_week', "'Your week from your coach'"],
  [{ type: 'program', title: 'New training program from your coach', body: 'Base block' }, { title: np('program.title') }, 'notify_on_program_assignment', "'New training program from your coach'"],
  [{ type: 'grocery', title: 'Grocery list ready', body: 'Ana Ruiz loaded your meal plan into grocery lists — Costco' }, { title: np('grocery.ready.title'), body: np('grocery.ready.bodyList', { coach: 'Ana Ruiz', list: 'Costco' }) }, 'notify_grocery_list', "'Grocery list ready'"],
  [{ type: 'grocery', title: 'Grocery list ready', body: 'Your coach loaded your meal plan into grocery lists' }, { title: np('grocery.ready.title'), body: np('grocery.ready.bodyAnon', {}) }, null, null],
  [{ type: 'grocery', title: 'New meal + grocery items', body: 'Oats' }, { title: np('grocery.items.title') }, 'notify_on_pushed_item', "'New meal + grocery items'"],
  [{ type: 'cosign', title: 'Ana co-signed your run', body: '' }, { title: np('cosign.title', { coach: 'Ana', activity: phrase('activity.run') }) }, 'post_coach_cosign', "' co-signed your '"],
  [{ type: 'cosign', title: 'Ana co-signed your pilates', body: '' }, { title: np('cosign.title', { coach: 'Ana', activity: 'pilates' }) }, null, null],
  [{ type: 'follow', title: 'Sam Lee started following you', body: '' }, { title: np('follow.started', { name: 'Sam Lee' }) }, 'toggle_follow', "' started following you'"],
  [{ type: 'follow_request', title: 'Sam Lee requested to follow you', body: '' }, { title: np('follow.requested', { name: 'Sam Lee' }) }, 'toggle_follow', "' requested to follow you'"],
  [{ type: 'follow_accept', title: 'Sam Lee accepted your follow request', body: '' }, { title: np('follow.accepted', { name: 'Sam Lee' }) }, 'respond_follow_request', "' accepted your follow request'"],
  [{ type: 'tier_up', title: 'You reached Form', body: 'Your Form rewards are waiting in the Shape Store.', data: { tier: 'Form' } }, { title: np('tier.title', { tier: 'Form' }), body: np('tier.body', { tier: 'Form' }) }, 'award_tier_bonuses', "'You reached '"],
];

test('a trigger\'s row is read by its fixed English, and the English is the trigger\'s', () => {
  const migrations = fs.readdirSync(join(ROOT, 'supabase-migrations')).filter((f) => f.endsWith('.sql')).map((f) => read(`supabase-migrations/${f}`)).join('\n');
  for (const [row, want, fn, english] of TRIGGER_ROWS) {
    const got = triggerCopy(row);
    // The grocery anon body carries an empty vars object; compare what it says.
    assert.deepEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(want)), row.title);
    // Every catalog's English says what the trigger wrote.
    const en = noticeText(row, copyFor('en', false).tr, { english: false, locale: 'en' });
    assert.equal(en.title, row.title, `en ${row.title}`);
    if (want.body) assert.equal(en.body, row.body, `en ${row.body}`);
    if (fn) {
      assert.ok(migrations.includes(fn), `${fn} is not in supabase-migrations`);
      assert.ok(migrations.includes(english), `${english} is not what any migration writes`);
    }
  }
  // English the trigger didn't write, or a type it doesn't own, is said as written.
  for (const row of [
    { type: 'message', title: 'Message from Ana' },
    { type: 'workout', title: 'Your plan changed' },
    { type: 'cosign', title: 'Ana liked your run' },
    { type: 'tier_up', title: 'You reached Form', data: {} },
    { type: 'tier_up', title: 'You reached Form', data: { tier: 'Peak' } },
    { type: 'session_booked', title: 'Session booked' },
  ]) assert.equal(triggerCopy(row), null, JSON.stringify(row));
  // A grocery body without its coach, or a week whose count or start can't be read, keeps its English
  // body under the title.
  assert.deepEqual(triggerCopy({ type: 'grocery', title: 'Grocery list ready', body: 'loaded your meal plan into grocery lists' }), { title: np('grocery.ready.title') });
  assert.deepEqual(triggerCopy({ type: 'workout', title: 'Your week from your coach', data: { sessions: 'x' } }), { title: np('week.title') });
  // The co-sign activities are the ones the app logs (home:push.cosign's list), each in the catalog.
  for (const a of ['workout', 'run', 'swim', 'cycle', 'ride', 'walk', 'hike', 'strength', 'recovery', 'yoga']) {
    assert.deepEqual(triggerCopy({ type: 'cosign', title: `Ana co-signed your ${a}` }).title[1].activity, phrase('activity.' + a));
  }
});

test('a trigger\'s row is said in every language, the names in it as written', () => {
  for (const loc of ACTIVE_LOCALES) {
    const c = copyFor(loc, false);
    for (const [row, want] of TRIGGER_ROWS) {
      const said = noticeText(row, c.tr, { english: false, locale: c.locale });
      // Said from the catalog, not left as written (Pidgin's "New message" is the English word for word).
      assert.equal(said.title, sayPart(want.title, c.tr, c.locale), `${loc}: ${row.title}`);
      if (want.body) assert.equal(said.body, sayPart(want.body, c.tr, c.locale), `${loc}: ${row.body}`);
      for (const name of ['Ana Ruiz', 'Sam Lee', 'Costco']) if (`${row.title} ${row.body}`.includes(name)) assert.ok(`${said.title} ${said.body}`.includes(name), `${loc}: ${name} lost from ${row.title}`);
      assert.doesNotMatch(`${said.title} ${said.body}`, /[{}]/, `${loc} ${row.title}`);
    }
  }
});

// ── the writers ──────────────────────────────────────────────────────────────────────────────────
// Each file that stores copy, and the keys it builds from parts (a template the scan below can't read).
const WRITERS = [
  'src/app/api/cron/reminders/route.ts', 'src/app/api/cron/prep-reminders/route.ts', 'mobile-app/src/services/prepAhead.mjs',
  'src/lib/habit-watch.mjs', 'src/app/api/cron/habit-watch/route.ts', 'src/app/api/waitlist/invite/route.ts', 'src/app/api/waitlist/join/route.ts',
  'src/lib/capacity-reopen.ts', 'src/app/api/sessions/request/route.ts', 'src/app/api/consultation/route.ts', 'src/app/api/sessions/manage/route.ts',
  'src/lib/refund-session.ts', 'src/lib/payment-notices.ts', 'src/lib/coach-thread.ts', 'src/lib/session-emails.ts',
  'src/app/api/cron/score-accountability/route.ts', 'src/app/dashboard/credentials/actions.ts', 'src/app/api/cron/credential-expiry/route.ts',
  'src/lib/workout-share.ts', 'src/app/api/nutritionist/meal-plan/route.ts', 'src/lib/ai/notifications.mjs', 'src/app/api/push/dispatch/route.ts',
  'mobile-app/src/services/noticeCopy.mjs',
];
const BUILT = [
  ...['weighIn', 'checkin', 'morning', 'water', 'photo', 'custom'].flatMap((k) => [`reminder.${k}.title`, `reminder.${k}.body`]),
  ...['confirmed', 'declined', 'moved', 'cancelled'].flatMap((k) => [`session.${k}.title`, `session.${k}.body`]),
  ...['bodyThread', 'bodyThreadPay', 'bodyNoThread', 'bodyNoThreadPay'].map((k) => `client.new.${k}`),
  ...['Trainer', 'Nutritionist', 'TrainerAnon', 'NutritionistAnon'].map((k) => `client.shared.body${k}`),
  ...['FirstAnon', 'First', 'RenewalAnon', 'Renewal'].map((k) => `receipt.coaching${k}`), 'receipt.product', 'receipt.productAnon',
  ...['workout', 'checkin', 'habit'].map((k) => `score.reason.${k}`),
  ...['breakfast', 'lunch', 'snack', 'dinner', 'meal', 'meals'].map((k) => `prep.slot.${k}`),
  ...['workout', 'run', 'swim', 'cycle', 'ride', 'walk', 'hike', 'strength', 'recovery', 'yoga'].map((k) => `activity.${k}`),
  ...['red', 'amber'].flatMap((k) => [`coach.${k}.title`, `coach.${k}.titleAnon`, `coach.${k}.body`]),
  'session.cancelledMany.title', 'session.cancelledMany.body', 'session.movedMany.title', 'session.movedMany.body',
  ...['body', 'bodyAnon', 'bodyList', 'bodyListAnon'].map((k) => `grocery.ready.${k}`),
];

test('every key a writer names is in the catalog, and every catalog key is named', () => {
  const named = new Set(BUILT);
  for (const f of WRITERS) {
    const src = read(f);
    for (const m of src.matchAll(/\b(?:np|phrase)\(\s*'([A-Za-z.]+)'/g)) named.add(m[1]);
    for (const m of src.matchAll(/'notice:([A-Za-z.]+)'/g)) named.add(m[1]);
    // A key picked by a ternary inside the call: np(x ? 'a.b' : 'a.c', …).
    for (const m of src.matchAll(/\b(?:np|phrase)\(\s*[^()]*?\?\s*'([a-z][A-Za-z]*\.[A-Za-z.]+)'\s*:\s*'([a-z][A-Za-z]*\.[A-Za-z.]+)'/g)) { named.add(m[1]); named.add(m[2]); }
  }
  const prefixes = [...named].filter((k) => k.endsWith('.'));
  const keys = [...named].filter((k) => !k.endsWith('.'));
  for (const k of keys) assert.ok(k in EN, `${k} is named by a writer but not in en/notice.json`);
  for (const p of prefixes) assert.ok(Object.keys(EN).some((k) => k.startsWith(p)), `no key under ${p}`);
  for (const k of Object.keys(EN)) assert.ok(named.has(k), `${k} is in en/notice.json but nothing says it`);
});

test('each writer stores its copy beside the English it writes', () => {
  const has = (f, re) => assert.match(read(f), re, f);
  has('src/app/api/cron/reminders/route.ts', /data: \{[^\n]*copy: c\.copy/);
  has('src/app/api/cron/prep-reminders/route.ts', /copy: bsPrepReminderCopy\(groups\),/);
  has('src/app/api/cron/habit-watch/route.ts', /const copy = habitWatchCopy\(\{ ownerName: nameOf\.get\(n\.ownerId\), habitName: n\.name, type: n\.type \}\);/);
  has('src/app/api/cron/habit-watch/route.ts', /dedupe: habitWatchDedupe\(n\.habitId, n\.day\), copy \}/);
  has('src/lib/payment-notices.ts', /copy: memberReceiptCopy\(p, coach\.name\)/);
  has('src/lib/payment-notices.ts', /copy: coachRenewalCopy\(p, client\)/);
  has('src/app/api/cron/score-accountability/route.ts', /reasons: listOf\(dippedKinds\.map\(\(k\) => phrase\('score\.reason\.' \+ k\)\)\)/);
  // coach-thread's notices take their copy as createNotification's third argument, so the data the
  // coach-thread tests pin stays as it was.
  const thread = read('src/lib/coach-thread.ts');
  for (const k of ['client.new.title', 'client.shared.title', 'welcome.title', 'payment.product.title', 'session.paidCoach.title', 'session.paid.title', 'session.paid.titleAnon']) {
    assert.match(thread, new RegExp(`np\\('${k.replace(/\./g, '\\.')}'`), k);
  }
  assert.doesNotMatch(thread, /data: \{[^\n]*\bcopy:/);
  // notify.ts carries a writer's copy into the row's data.
  const notify = read('src/lib/notify.ts');
  assert.match(notify, /export async function createNotification\(client: SupabaseClient, n: NewNotification, copy\?: NoticeCopy \| null\)/);
  assert.match(notify, /export async function createPreferredNotification\(\s*admin: SupabaseClient,\s*n: PreferredNotification,\s*copy\?: NoticeCopy \| null,\s*\)/);
  assert.match(notify, /export type PreferredNotification = NewNotification & \{ type: string; quiet\?: boolean; claimPush\?: \(\) => Promise<boolean> \};/);
});

test('a writer\'s copy says, in English, what its English says', () => {
  const en = (c) => {
    const t = copyFor('en', false);
    return { title: c.title ? sayPart(c.title, t.tr, 'en') : null, body: c.body ? sayPart(c.body, t.tr, 'en') : null };
  };
  for (const args of [
    { ownerName: 'Cara Diaz', habitName: 'Water', type: 'build' },
    { ownerName: 'Cara', habitName: 'No sugar', type: 'avoid' },
    { ownerName: '', habitName: '', type: 'build' },
  ]) assert.deepEqual(en(habitWatchCopy(args)), habitWatchText(args), JSON.stringify(args));
  // Prep: one recipe for one meal, and several recipes. (A recipe made for several days says its
  // weekdays in full in the catalog, "Monday", where the stored English shortens them.)
  const OATS = 'Overnight oats';
  for (const groups of [
    [{ title: OATS, meals: [{ dow: 1, slot: 'BREAKFAST' }] }],
    [{ title: OATS, meals: [{ dow: 0, slot: 'BREAKFAST' }, { dow: 1, slot: 'BREAKFAST' }] }, { title: 'Chia pudding', meals: [{ dow: 0, slot: 'SNACK' }] }],
  ]) {
    const text = bsPrepReminderText(groups);
    const said = en(bsPrepReminderCopy(groups));
    assert.equal(said.title, text.title);
    assert.equal(said.body.replace(', and ', ' and '), text.body);
  }
  const days = en(bsPrepReminderCopy([{ title: OATS, meals: [{ dow: 0, slot: 'LUNCH' }, { dow: 2, slot: 'LUNCH' }] }]));
  assert.equal(days.body, 'Make 2 tonight, for lunch on Monday and Wednesday.');
  assert.equal(bsPrepReminderCopy([]), null);
});

test('every notice reads cleanly in every language: no brace left, no shaming, the names kept', () => {
  const SAMPLE = {
    name: 'Cara', habit: 'Water', coach: 'Ana Ruiz', client: 'Sam Lee', recipe: 'Overnight oats', title: 'Overnight oats',
    when: atTime('2026-10-23T16:30:00Z', 'America/New_York'), day: onDay('2026-10-19'), date: onDay('2026-11-01', 'long'),
    amount: usdOf(4999), points: 12, reasons: listOf([phrase('score.reason.workout'), phrase('score.reason.checkin')]),
    slot: phrase('prep.slot.dinner'), days: listOf([weekdayOf(0), weekdayOf(4)]), list: 'Costco', what: phrase('payment.aProgram'),
    topic: 'Knee pain', state: 'CA', tier: 'Form', activity: phrase('activity.hike'), site: 'theshapecommunity.com',
  };
  const argsOf = (v) => [...new Set([...v.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]))];
  for (const loc of ACTIVE_LOCALES) {
    const notice = CATS[loc].notice;
    assert.deepEqual(Object.keys(notice), Object.keys(EN), `${loc}: keys or their order drifted from en`);
    for (const key of Object.keys(EN)) {
      const vars = Object.fromEntries(argsOf(EN[key]).map((a) => [a, a === 'count' ? 3 : SAMPLE[a]]));
      for (const n of argsOf(EN[key]).includes('count') ? [1, 3, 22] : [null]) {
        const said = sayIn(loc, np(key, n == null ? vars : { ...vars, count: n }));
        assert.ok(said, `${loc} ${key} says nothing`);
        assert.doesNotMatch(said, /[{}]/, `${loc} ${key}`);
        assert.equal(containsShaming(said), false, `${loc} ${key}: ${said}`);
        for (const a of ['name', 'coach', 'client', 'habit', 'recipe', 'topic', 'state', 'list']) {
          if (a in vars) assert.ok(said.includes(SAMPLE[a]), `${loc} ${key} drops {${a}}: ${said}`);
        }
      }
    }
  }
});

// ── who reads what ───────────────────────────────────────────────────────────────────────────────
const fakeGoals = (doc, { fail = false } = {}) => ({
  from(table) {
    const ops = [];
    const b = {
      select: (...a) => { ops.push(['select', ...a]); return b; },
      eq: (...a) => { ops.push(['eq', ...a]); return b; },
      maybeSingle: async () => {
        if (fail) return { data: null, error: { message: 'down' } };
        assert.equal(table, 'user_goals');
        assert.deepEqual(ops.filter((o) => o[0] === 'eq').map((o) => o[1]).sort(), ['kind', 'user_id']);
        assert.deepEqual(ops.find((o) => o[0] === 'eq' && o[1] === 'kind'), ['eq', 'kind', 'app_locale']);
        return { data: doc ? { data: doc } : null, error: null };
      },
    };
    return b;
  },
});

const readerCopyMod = await loadRealModule(join(ROOT, 'src/lib/reader-copy.ts'), {
  typescript: true,
  registry: new Map([
    ['@/lib/ai/memberTranslator.mjs', Translator],
    ['@/lib/ai/memberCatalogs', { MEMBER_HOME_CATALOGS: CATS }],
  ]),
});

test('a notice is read in its reader\'s stored language, and in English when none is stored or the read fails', async () => {
  const { readerCopy } = readerCopyMod;
  assert.equal((await readerCopy(fakeGoals({ locale: 'de' }), 'u-1')).code, 'de');
  const pt = await readerCopy(fakeGoals({ locale: 'pt-BR' }), 'u-1');
  assert.deepEqual([pt.code, pt.locale], ['pt-BR', intlLocaleOf('pt-BR')]);
  for (const doc of [null, { locale: 'xx' }, { locale: 7 }, 'de']) assert.equal((await readerCopy(fakeGoals(doc), 'u-1')).code, 'en', JSON.stringify(doc));
  assert.equal((await readerCopy(fakeGoals({ locale: 'de' }, { fail: true }), 'u-1')).code, 'en');
  assert.equal((await readerCopy({ from() { throw new Error('boom'); } }, 'u-1')).code, 'en');
  // The server bundles a notice catalog for exactly the languages the app ships.
  const cats = read('src/lib/ai/memberCatalogs.ts');
  assert.deepEqual([...cats.matchAll(/catalogs\/([^/]+)\/notice\.json'/g)].map((x) => x[1]).sort(), [...ACTIVE_LOCALES].sort());
  assert.match(read('src/lib/ai/memberTranslator.mjs'), /ns: \['home', 'notice'\],/);
  assert.match(read('mobile-app/src/i18n/index.js'), /const NS = \[[^\]]*'notice'\];/);
});

// Push dispatch, end to end, with the real reader-copy: the push and the email in the reader's words.
function dispatchAdmin({ locale = null, emailOn = false } = {}) {
  return {
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'member@example.com' } }, error: null }) } },
    from(table) {
      const ops = [];
      const res = () => {
        if (table === 'user_goals') {
          const kind = (ops.find((o) => o[0] === 'eq' && o[1] === 'kind') || [])[2];
          return { data: kind === 'app_locale' && locale ? { data: { locale } } : null, error: null };
        }
        if (table === 'notification_preferences') return { data: emailOn ? [{ channel: 'email', enabled: true }] : [], error: null };
        if (table === 'notifications') return { data: null, count: 0, error: null };
        return { data: null, error: null };
      };
      const b = new Proxy({}, {
        get(_, op) {
          if (op === 'then') return (ok, no) => Promise.resolve(res()).then(ok, no);
          if (op === 'maybeSingle' || op === 'single') return async () => res();
          return (...args) => { ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
}
const st = { admin: null, pushes: [], emails: [] };
const dispatch = await loadRealModule(join(ROOT, 'src/app/api/push/dispatch/route.ts'), {
  typescript: true,
  registry: new Map([
    ['next/server', nextServer],
    ['@/lib/supabase/admin', { createAdminClient: () => st.admin }],
    ['@/lib/time', await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true })], ['@/lib/push', { pushConfigured: () => true, sendPushToUser: async (_a, userId, p) => { st.pushes.push({ userId, ...p }); } }],
    ['@/lib/email', { sendEmail: async (m) => { st.emails.push(m); return { ok: true }; } }],
    ['@/lib/ai/notifications.mjs', await import('../src/lib/ai/notifications.mjs')],
    ['@/lib/reader-copy', readerCopyMod],
  ]),
});
process.env.PUSH_WEBHOOK_SECRET = 'test-secret';
const post = async (admin, record) => {
  st.admin = admin; st.pushes.length = 0; st.emails.length = 0;
  const errLog = console.error; console.error = () => {};
  try {
    await dispatch.POST(new Request('https://shape.test/api/push/dispatch', {
      method: 'POST', headers: { 'x-push-secret': 'test-secret', 'content-type': 'application/json' }, body: JSON.stringify({ record }),
    }));
  } finally { console.error = errLog; }
};

test('push dispatch pushes and emails a notice in its reader\'s language, and English as written', async () => {
  const TIER = { id: 'n-1', user_id: 'u-1', type: 'tier_up', title: 'You reached Form', body: 'Your Form rewards are waiting in the Shape Store.', route: 'score', data: { tier: 'Form', dedupe: 'tier:Form' } };
  const es = (k, vars) => sayIn('es', np(k, vars));
  await post(dispatchAdmin({ locale: 'es', emailOn: true }), TIER);
  assert.equal(st.pushes.length, 1);
  assert.equal(st.pushes[0].title, es('tier.title', { tier: 'Form' }));
  assert.equal(st.pushes[0].body, es('tier.body', { tier: 'Form' }));
  assert.equal(st.emails.length, 1);
  assert.equal(st.emails[0].subject, es('tier.title', { tier: 'Form' }));
  assert.ok(st.emails[0].html.includes(CATS.es.notice['email.manage']), 'the email\'s frame is in Spanish too');
  assert.ok(st.emails[0].text.includes(es('tier.body', { tier: 'Form' })));
  // English: byte for byte what the row says.
  await post(dispatchAdmin({ locale: null, emailOn: true }), TIER);
  assert.equal(st.pushes[0].title, TIER.title);
  assert.equal(st.pushes[0].body, TIER.body);
  assert.equal(st.emails[0].subject, TIER.title);
  assert.ok(st.emails[0].html.includes('Change which emails you get in Settings → Notifications.'));
  // A writer's copy, in German.
  const JOIN = { id: 'n-3', user_id: 'u-2', type: 'waitlist_join', title: 'New waiting-list request', body: 'Someone joined your waiting list.', route: 'waitlist', data: { providerRole: 'trainer', providerId: 7, copy: { title: np('waitlist.join.title'), body: np('waitlist.join.body') } } };
  await post(dispatchAdmin({ locale: 'de' }), JOIN);
  assert.deepEqual([st.pushes[0].title, st.pushes[0].body], [CATS.de.notice['waitlist.join.title'], CATS.de.notice['waitlist.join.body']]);
  // A message's body is the sender's own words, in any language.
  const MSG = { id: 'n-2', user_id: 'u-1', type: 'message', title: 'New message', body: 'Sam: see you at 6', route: 'messages', data: { conversationId: 'c-1', providerRole: 'trainer', side: 'client' } };
  await post(dispatchAdmin({ locale: 'ru' }), MSG);
  assert.deepEqual([st.pushes[0].title, st.pushes[0].body], [CATS.ru.notice['message.title'], 'Sam: see you at 6']);
});

test('the bell, the push, the email and the preference-aware email all say it through noticeText', () => {
  const bell = read('mobile-app/src/broadsheet/BSNotifications.jsx');
  assert.match(bell, /import \{ noticeText \} from '\.\.\/services\/noticeCopy\.mjs';/);
  assert.match(bell, /return noticeText\(n, tr, \{ english: !code \|\| code === 'en', locale \}\);/);
  assert.match(bell, /const said = bsNoticeRow\(n, tr\);/);
  assert.match(bell, />\{said\.title\}<\/span>/);
  assert.match(bell, /\{said\.body \? <span[^>]*>\{said\.body\}<\/span> : null\}/);
  const notify = read('src/lib/notify.ts');
  assert.match(notify, /return noticeText\(\{ type: n\.type, title: n\.title, body: n\.body \|\| '', data: n\.data \|\| \{\} \}, copy\.tr, \{ english: false, locale: copy\.locale \}\);/);
  const dispatchSrc = read('src/app/api/push/dispatch/route.ts');
  assert.match(dispatchSrc, /const t = noticeText\(record, copy\.tr, \{ english: false, locale: copy\.locale \}\);/);
  assert.match(dispatchSrc, /if \(copy\.code === 'en'\) return plain;/);
});
