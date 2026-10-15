// Client-onboarding review, fix 3b: a real intro (H6, M18), and the coach's own lengths.
//   - A coach's confirm emails the member the time, the call link and a calendar invite: the booking
//     email promised "a second email with the call link once they accept", and nothing sent one.
//   - Completing an intro sends one follow-up (in the app and by email) unless the member already
//     subscribes to that coach.
//   - The website's chat no longer answers for anyone: a message goes somewhere real or says it did
//     not, and a coach opened from their profile gets the first message through /api/messages/direct.
//   - "Book intro" on a coach's profile books the intro (the consultation page), and the app's intro
//     booking says what happened instead of a thread nobody received.
//   - The intro's length is the coach's: the booking pages read it and send it back as a cross-check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

async function loadEmails({ stored = true } = {}) {
  const sent = { notifications: [], emails: [], ics: [] };
  const emails = await loadRealModule(join(ROOT, 'src/lib/coach-application-emails.ts'), { typescript: true });
  const mod = await loadRealModule(join(ROOT, 'src/lib/session-emails.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/notify', { createNotification: async (_c, n) => { sent.notifications.push(n); return stored; } }],
      ['@/lib/email', {
        buildIcs: (a) => { sent.ics.push(a); return 'ICS:' + a.uid; },
    calendarOrganizerEmail: () => 'no-reply@theshapecommunity.com',
        sendEmail: async (e) => { sent.emails.push(e); return { ok: true }; },
      }],
      ['@/lib/coach-application-emails', emails],
      ['@supabase/supabase-js', {}],
    ]),
  });
  return { mod, sent };
}

function fakeAdmin({ subs = [], subsError = null, coach = { name: 'Tom Trainer', owner_id: 'coach-1' } } = {}) {
  const users = { 'member-1': 'cara@example.com', 'coach-1': 'tom@example.com' };
  return {
    from(table) {
      const q = {
        select: () => q, eq: () => q, in: () => q, limit: () => Promise.resolve(table === 'subscriptions' ? { data: subs, error: subsError } : { data: [], error: null }),
        maybeSingle: async () => ({ data: table === 'trainers' || table === 'nutritionists' ? coach : null, error: null }),
      };
      return q;
    },
    auth: { admin: { getUserById: async (id) => ({ data: { user: users[id] ? { email: users[id] } : null } }) } },
  };
}

const SESSION = {
  id: 's-1', client_id: 'member-1', client_email: 'booking@example.com', client_name: 'Cara Diaz',
  provider_id: 7, provider_role: 'trainer', type: 'video', scheduled_at: '2026-10-20T14:00:00.000Z',
  duration_min: 30, meeting_url: 'https://meet.shape.test/s-1', topic: 'Getting started', status: 'confirmed', intro: true,
};

test('confirm: the member is emailed the time, the call link and an invite, once', async () => {
  const { mod, sent } = await loadEmails();
  const out = await mod.afterSessionStep(fakeAdmin(), { action: 'confirm', session: SESSION, previousStatus: 'requested', when: 'Tue, Oct 20, 10:00 AM EDT' });
  assert.deepEqual(out, { emailed: true, followedUp: false });
  assert.equal(sent.emails.length, 1);
  const e = sent.emails[0];
  assert.equal(e.to, 'cara@example.com', 'the account\'s address, not the one typed on the booking');
  assert.equal(e.subject, 'Confirmed: your session with Tom Trainer');
  assert.match(e.text, /Tue, Oct 20, 10:00 AM EDT · 30-minute video session/);
  assert.match(e.text, /https:\/\/meet\.shape\.test\/s-1/);
  assert.match(e.html, /Join the call/);
  assert.match(e.text, /Topic: Getting started/);
  // The booking's own invite uid (the session id; buildIcs adds the domain), as an update.
  assert.equal(e.ics, 'ICS:s-1');
  assert.equal(sent.ics[0].sequence, 1);
  // The booking invite's organizer, not the coach's own address (Codex on #2370): a calendar
  // matches an update on the uid and the organizer, and the coach's email is theirs.
  assert.equal(sent.ics[0].organizerEmail, 'no-reply@theshapecommunity.com');
  assert.equal(sent.ics[0].organizerName, 'Tom Trainer');
  assert.doesNotMatch(JSON.stringify(sent.ics[0]), /tom@example\.com/);
  assert.deepEqual([sent.ics[0].durationMin, sent.ics[0].attendeeEmail, sent.ics[0].location], [30, 'cara@example.com', 'https://meet.shape.test/s-1']);
  assert.equal(sent.ics[0].start.toISOString(), SESSION.scheduled_at);
  // A repeat confirm sends nothing.
  const again = await mod.afterSessionStep(fakeAdmin(), { action: 'confirm', session: SESSION, previousStatus: 'confirmed', when: 'x' });
  assert.deepEqual(again, { emailed: false, followedUp: false });
  assert.equal(sent.emails.length, 1);
  // No call link yet: the email says how they will meet instead of a button to nowhere.
  const { mod: m2, sent: s2 } = await loadEmails();
  await m2.afterSessionStep(fakeAdmin(), { action: 'confirm', session: { ...SESSION, meeting_url: null }, previousStatus: 'requested', when: 'Tue' });
  assert.doesNotMatch(s2.emails[0].html, /Join the call/);
  assert.match(s2.emails[0].text, /Tom Trainer will share how you'll meet in your thread on Shape\./);
  // No account address: the booking's.
  const { mod: m3, sent: s3 } = await loadEmails();
  await m3.afterSessionStep(fakeAdmin(), { action: 'confirm', session: { ...SESSION, client_id: 'member-9' }, previousStatus: 'requested', when: 'Tue' });
  assert.equal(s3.emails[0].to, 'booking@example.com');
});

test('complete: one follow-up after an intro, for a member who has not subscribed', async () => {
  const { mod, sent } = await loadEmails();
  const out = await mod.afterSessionStep(fakeAdmin(), { action: 'complete', session: { ...SESSION, status: 'completed' }, previousStatus: 'confirmed', when: '' });
  assert.deepEqual(out, { emailed: false, followedUp: true });
  assert.equal(sent.notifications.length, 1);
  const n = sent.notifications[0];
  assert.deepEqual([n.userId, n.type, n.route], ['member-1', 'intro_followup', 'coach:trainer:7']);
  assert.deepEqual(n.data, { dedupe: 'intro:s-1', providerRole: 'trainer', providerId: 7 });
  assert.equal(n.title, 'How was your intro with Tom Trainer?');
  assert.equal(sent.emails.length, 1);
  assert.match(sent.emails[0].text, /\/trainers\/7\b/);
  // Already subscribed: nothing to suggest.
  const { mod: m2, sent: s2 } = await loadEmails();
  await m2.afterSessionStep(fakeAdmin({ subs: [{ id: 'sub-1' }] }), { action: 'complete', session: SESSION, previousStatus: 'confirmed', when: '' });
  assert.deepEqual([s2.notifications.length, s2.emails.length], [0, 0]);
  // The subscription read failed: nothing, rather than nudging a subscriber.
  const { mod: m3, sent: s3 } = await loadEmails();
  await m3.afterSessionStep(fakeAdmin({ subsError: { message: 'down' } }), { action: 'complete', session: SESSION, previousStatus: 'confirmed', when: '' });
  assert.deepEqual([s3.notifications.length, s3.emails.length], [0, 0]);
  // A second complete: the dedupe row exists (not stored), so no second email.
  const { mod: m4, sent: s4 } = await loadEmails({ stored: false });
  const twice = await m4.afterSessionStep(fakeAdmin(), { action: 'complete', session: SESSION, previousStatus: 'confirmed', when: '' });
  assert.deepEqual([twice.followedUp, s4.emails.length], [false, 0]);
  // Not an intro (a coach's own session): no follow-up.
  const { mod: m5, sent: s5 } = await loadEmails();
  await m5.afterSessionStep(fakeAdmin(), { action: 'complete', session: { ...SESSION, intro: false }, previousStatus: 'confirmed', when: '' });
  assert.deepEqual([s5.notifications.length, s5.emails.length], [0, 0]);
  // Nothing else sends, and nothing throws.
  const { mod: m6, sent: s6 } = await loadEmails();
  for (const action of ['decline', 'cancel', 'reschedule']) await m6.afterSessionStep(fakeAdmin(), { action, session: SESSION, previousStatus: 'requested', when: '' });
  assert.deepEqual([s6.notifications.length, s6.emails.length], [0, 0]);
  const broken = { from() { throw new Error('boom'); }, auth: { admin: { getUserById: async () => { throw new Error('boom'); } } } };
  assert.deepEqual(await m6.afterSessionStep(broken, { action: 'complete', session: SESSION, previousStatus: 'confirmed', when: '' }), { emailed: false, followedUp: false });
});

test('an intro is the booking /api/consultation marked, whatever its length', async () => {
  const { mod } = await loadEmails();
  assert.equal(mod.isIntro({ intro: true, duration_min: 45, type: 'video' }), true);
  assert.equal(mod.isIntro({ intro: false, duration_min: 15, type: 'video' }), false, 'a coach\'s own 15-minute session is not an intro');
  // Only a row read before the column existed falls back to the old mark.
  assert.equal(mod.isIntro({ duration_min: 15, type: 'video' }), true);
  assert.equal(mod.isIntro({ duration_min: 30, type: 'video' }), false);
  assert.equal(mod.coachProfileLink('nutritionist', 9, 'https://x.test'), 'https://x.test/nutritionists/9');
});

// ── The website's chat ───────────────────────────────────────────────────────────────────────────
test('website chat: no reply is written for anyone, and every send says whether it went', () => {
  const src = read('public/newdesign/chatWidget.jsx');
  const code = stripComments(src);
  assert.doesNotMatch(code, /pickReply/, 'the scripted peer replies are gone');
  assert.doesNotMatch(code, /Good question — let me pull that up/);
  const send = src.slice(src.indexOf('  const send = (forceText, opts = {}) => {'), src.indexOf('// ── Voice input for Nora'));
  // A stored thread posts and settles the message it added.
  assert.match(send, /if \(convId\) \{\s+post\(`\/api\/conversations\/\$\{encodeURIComponent\(convId\)\}\/messages`, \{ body: text \}\)\s+\.then\(\(r\) => settle\(r\.failed \? \{ failed: r\.failed \} : \{\}\)\);\s+return;\s+\}/);
  // A coach opened from their profile: the first message opens the real thread and keeps its id.
  assert.match(send, /if \(provider\) \{\s+post\("\/api\/messages\/direct", \{ providerRole: provider\.role, providerId: provider\.id, message: text \}\)\s+\.then\(\(r\) => settle\(r\.failed \? \{ failed: r\.failed \} : \{ conversationId: r\.data && r\.data\.conversationId \}\)\);\s+return;\s+\}/);
  // Anything else (a seeded thread, a local channel) says it was not sent.
  assert.match(send, /if \(!isSupport\) \{\s+settle\(\{ failed: "Not sent\. This conversation isn\\u2019t connected to anyone yet\." \}\);\s+return;\s+\}/);
  // A refused or failed request is "not sent", with the server's own words when it has some.
  assert.match(send, /if \(!res\.ok\) return \{ failed: \(data && \(data\.message \|\| data\.error\)\) \|\| "It didn\\u2019t go through\. Try again\." \};/);
  assert.match(send, /return \{ failed: "No connection\. Try again\." \};/);
  // The outcome is drawn under the message.
  assert.match(src, /\{m\.me && \(m\.failed \|\| m\.pending\) && \(/);
  assert.match(src, /\{m\.failed \? "Not sent \\u00b7 " \+ m\.failed : "Sending\\u2026"\}/);
  // Opening a coach carries them into the fresh thread.
  assert.match(src, /\.\.\.\(descriptor\.providerRole && Number\(descriptor\.providerId\) > 0\s+\? \{ providerRole: descriptor\.providerRole, providerId: Number\(descriptor\.providerId\) \} : \{\}\),/);
});

test('website chat: a message this page sent is shown once when the poll brings it back', () => {
  const src = read('public/newdesign/chatWidget.jsx');
  const at = src.indexOf('let local = t.messages;');
  const block = src.slice(at, src.indexOf('const merged = since', at));
  // Run the merge step on its own: the local copy of a sent message drops when its stored copy arrives.
  const merge = new Function('t', 'mapped', 'since', `${block}; return local;`);
  const t = { messages: [{ t: 'old', me: false }, { t: 'hi', me: true, lid: 'l1' }, { t: 'failed one', me: true, lid: 'l2', failed: 'x' }] };
  assert.deepEqual(merge(t, [{ t: 'hi', me: true }], 'since').map((m) => m.t), ['old', 'failed one']);
  assert.deepEqual(merge(t, [{ t: 'hi', me: false }], 'since').map((m) => m.t), ['old', 'hi', 'failed one'], 'only the member\'s own');
  assert.equal(merge(t, [{ t: 'failed one', me: true }], 'since').length, 3, 'a failed one is never matched');
});

test('a coach\'s profile books the intro on the consultation page, and messages the coach for real', () => {
  const src = read('public/newdesign/livingShared.jsx');
  assert.match(src, /\{provId \? <a href=\{"\/newdesign\/consultation\.html\?type=" \+ listingRole \+ "&id=" \+ encodeURIComponent\(provId\) \+ "&name=" \+ encodeURIComponent\(d\.name \|\| ""\)\} data-book-intro=""/);
  assert.doesNotMatch(src, /<button onClick=\{openChat\}[^>]*>Book intro/, 'Book intro no longer opens the chat');
  assert.match(src, /window\.__openChat\(\{ who: d\.name, \.\.\.\(provId \? \{ providerRole: listingRole, providerId: provId, role: listingRole === "nutritionist" \? "Nutritionist" : "Trainer" \} : \{\}\) \}\)/);
  assert.match(src, /\{provId \? <button type="button" onClick=\{openChat\} data-message-coach=""/);
});

// ── The intro's length on the booking pages ──────────────────────────────────────────────────────
test('the booking page lays the times out for the coach\'s length and sends it back', () => {
  const html = read('public/newdesign/consultation.html');
  assert.match(html, /const len = Number\(data\.rules && data\.rules\.consultMin\);\s+introMin = Number\.isInteger\(len\) && len >= 5 && len <= 240 \? len : 15;/);
  assert.match(html, /now: new Date\(\), days: 28, sessionMin: introMin,/);
  assert.match(html, /durationMin: introMin,/);
  // Read again from nothing (tests/intro-times-refresh.test.mjs drives the page).
  assert.match(html, /if \(data\.code === 'length_changed'\) \{ selectedIso = null; updateConfirmation\(\); loadAvailability\(\); \}/);
  assert.doesNotMatch(html, /15-minute|15 min · video/, 'no line still promises 15 minutes');
  assert.match(html, /you’ll get the call link once they confirm/, 'a request, not "set"');
});

test('the app books the intro at the coach\'s length and says it was requested, not that a thread started', () => {
  const m = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  assert.match(m, /const minutes = Number\.isInteger\(len\) && len >= 5 && len <= 240 \? len : 15;\s+setIntroMin\(minutes\);/);
  assert.match(m, /sessionMin: minutes \}\)\);/);
  assert.match(m, /topic: 'Free intro call',\s+durationMin: introMin,\s+\}\);/);
  assert.doesNotMatch(m, /writeShapeCoachThread\(coach, tr\('marketplace:thread\.bookedIntro'/, 'no thread kept on the phone');
  assert.doesNotMatch(m, /Thanks for reaching out\. I will reply here\./, 'no reply in the coach\'s name');
  assert.doesNotMatch(m, /messageSavedLocal', \{ defaultValue: 'Message saved locally' \}\),\s+body: tr\('marketplace:listing\.messageErrorBody'/, 'a failed send is not "saved locally"');
  const backend = read('mobile-app/src/services/shapeBackend.js');
  assert.match(backend, /\.\.\.\(Number\.isInteger\(durationMin\) \? \{ durationMin \} : \{\}\),/);
  for (const locale of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${locale}/marketplace.json`));
    for (const key of ['listing.slotBodyLength', 'listing.requested', 'listing.bookedRequestBody', 'listing.messageNotSent', 'listing.messageNotSentBody']) {
      assert.ok(cat[key] && cat[key].trim(), `${locale}: ${key}`);
    }
    assert.match(cat['listing.slotBodyLength'], /\{minutes\}/, locale);
    assert.match(cat['listing.bookedRequestBody'], /\{minutes\}/, locale);
    assert.match(cat['listing.messageNotSentBody'], /\{error\}/, locale);
  }
});

test('the app takes a changed intro length: the times are read again and the member picks one (Codex on #2370)', () => {
  const backend = read('mobile-app/src/services/shapeBackend.js');
  const book = backend.slice(backend.indexOf('async function submitConsultationBooking('), backend.indexOf('async function submitConsultationBooking(') + 4000);
  assert.match(book, /if \(d\?\.code\) err\.code = d\.code;\s+if \(Number\.isInteger\(d\?\.durationMin\)\) err\.durationMin = d\.durationMin;\s+throw err;/, 'the route\'s code reaches the screen');
  const market = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  const at = market.indexOf("if (error?.code === 'length_changed') {");
  assert.ok(at > 0);
  const branch = market.slice(at, market.indexOf('return;', at));
  assert.match(branch, /if \(Number\.isInteger\(error\.durationMin\)\) setIntroMin\(error\.durationMin\);/);
  assert.match(branch, /setAvailEpoch\(\(n\) => n \+ 1\);/, 'the times are read again');
  assert.match(branch, /stale: true,/);
  assert.match(market, /\}, \[saleProviderId, saleProviderRole, availEpoch\]\);/, 'the availability read follows the epoch');
  // A stale request offers no retry: the same length would be refused forever.
  assert.match(market, /\{!isMessage && !action\.done && !action\.stale && \(\s+<button type="button" onClick=\{\(\) => onConfirm\(action\)\}/);
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/marketplace.json`));
    assert.ok(cat['listing.lengthChanged'], loc);
    assert.match(cat['listing.lengthChangedBody'], /\{name\}[\s\S]*\{minutes\}|\{minutes\}[\s\S]*\{name\}/, loc);
  }
});

test('the app offers a live coach only their times at the current length, and says when it cannot read them (Codex on #2370)', () => {
  const market = stripComments(read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx'));
  const eff = market.slice(market.indexOf("if (!saleProviderId || !window.ShapeCoachAvailability?.get) { setRealAvail(null); return undefined; }"), market.indexOf('}, [saleProviderId, saleProviderRole, availEpoch]);'));
  // Every read starts from nothing, skips the cache after the first, and a failure is said.
  assert.match(eff, /setRealAvail\(null\);\s+setAvailState\('loading'\);/);
  assert.match(eff, /\.get\(saleProviderRole, saleProviderId, availEpoch > 0 \? \{ fresh: true \} : undefined\)/);
  assert.match(eff, /if \(!d \|\| !Array\.isArray\(d\.slots\)\) \{ setAvailState\('failed'\); return; \}/);
  assert.match(eff, /\.catch\(\(\) => \{ if \(on\) setAvailState\('failed'\); \}\);/);
  assert.match(eff, /setAvailState\('ready'\);/);
  // A live coach whose times are not in is never shown the preview pattern, anywhere it renders.
  assert.match(market, /const timesPending = liveTimes && realAvail == null;/);
  assert.match(market, /: \(liveTimes \? \[\] : expandPreviewSlots\(\)\);/, 'the open-this-week rows');
  assert.match(market, /open=\{realAvail != null \? realAvail : \(liveTimes \? \[\] : expandPreviewSlots\(\)\)\} demo=\{!liveTimes && realAvail == null\} note=\{timesNote\} onRetry=\{timesPending && availState === 'failed' \? retryTimes : null\}/, 'the calendar');
  assert.match(market, /if \(timesPending\) \{ setShowCal\(true\); return; \}\n    if \(realAvail != null\) \{/, 'Book the intro holds no preview time');
  assert.match(market, /\{timesPending && availState === 'failed' \? <button type="button" onClick=\{retryTimes\}/);
  assert.match(market, /\{note\}\{onRetry \? <button type="button" onClick=\{onRetry\}/);
  // The minute's cache is skipped on request.
  const backend = read('mobile-app/src/services/shapeBackend.js');
  assert.match(backend, /async function coachAvailabilityGet\(role, id, \{ fresh = false \} = \{\}\) \{/);
  assert.match(backend, /if \(!fresh && hit && Date\.now\(\) - hit\.at < 60000\) return hit\.data;/);
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/marketplace.json`));
    assert.match(cat['listing.timesLoading'], /\{name\}/, loc);
    assert.match(cat['listing.timesFailed'], /\{name\}/, loc);
    assert.ok(cat['listing.tryAgain'], loc);
  }
});

test('the app offers Mark complete once a session has started, as the website and the route do (Codex on #2370)', () => {
  const cal = stripComments(read('mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx'));
  assert.match(cal, /const sessionStarted = Number\.isFinite\(Date\.parse\(event\.scheduledAt\)\) && Date\.parse\(event\.scheduledAt\) <= Date\.now\(\);/);
  assert.match(cal, /: event\.status === 'confirmed' && sessionStarted\s+\? <button onClick=\{\(\) => runSessionAction\('complete',/);
  assert.equal((cal.match(/runSessionAction\('complete'/g) || []).length, 1, 'one way to complete from the sheet');
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /\{isCoach && s\.status === 'confirmed' && Date\.parse\(s\.scheduledAt\) <= Date\.now\(\) && <Btn label="Mark done"/);
  assert.equal((client.match(/act\(s\.id, 'complete'\)/g) || []).length, 1);
  // The website's own gate (tests/schedule-step2.test.mjs drives it).
  assert.match(read('public/newdesign/dashSchedule.jsx'), /\{confirmed && <button type="button" disabled=\{busy \|\| !started\}/);
});

test('a coach books a session of any length they type, 5 minutes to 4 hours', () => {
  const src = read('public/newdesign/dashSchedule.jsx');
  assert.match(src, /const DSC_LENGTH_MIN = 5;\nconst DSC_LENGTH_MAX = 240;/);
  assert.match(src, /const dscLengthOk = \(v\) => \{ const n = Number\(v\); return String\(v\)\.trim\(\) !== "" && Number\.isInteger\(n\) && n >= DSC_LENGTH_MIN && n <= DSC_LENGTH_MAX; \};/);
  // (A paid session is booked once: no weekly run for it, fix 3c.)
  assert.match(src, /const blocked = busy \|\| !row \|\| v\.past \|\| !!v\.clash \|\| tooMany \|\| durBad \|\| \(paidOnly && weekly\);/);
  // The length booked is the one on screen; tests/schedule-step2.test.mjs drives it.
  assert.match(src, /const dur = durText === "" \? pillDur : \(dscLengthOk\(durText\) \? Number\(durText\) : null\);\n  const durBad = dur == null;/);
  const route = read('src/app/api/sessions/manage/route.ts');
  assert.match(route, /const SESSION_MIN_LENGTH = 5;\nconst SESSION_MAX_LENGTH = 240;/);
});

test('an invite update keeps the booking\'s uid and says it is an update', async () => {
  const { buildIcs } = await loadRealModule(join(ROOT, 'src/lib/email.ts'), { typescript: true });
  const base = { uid: 's-1', start: new Date('2026-10-20T14:00:00Z'), durationMin: 30, summary: 'S', description: 'D', organizerEmail: 'o@x.test', organizerName: 'O', attendeeEmail: 'a@x.test', attendeeName: 'A' };
  const first = buildIcs(base).split('\r\n');
  const update = buildIcs({ ...base, sequence: 1 }).split('\r\n');
  assert.ok(first.includes('UID:s-1@theshapecommunity.com'));
  assert.ok(update.includes('UID:s-1@theshapecommunity.com'), 'the same event');
  assert.equal(first.some((l) => l.startsWith('SEQUENCE:')), false, 'the booking\'s invite is the original');
  assert.ok(update.includes('SEQUENCE:1'), 'the confirmation replaces it');
  // The booking's invite is written under the session id, which is what the confirmation reuses.
  assert.match(read('src/app/api/consultation/route.ts'), /buildIcs\(\{\s+uid: inserted\.id,/);
  // Both invites name the same organizer, from one helper.
  assert.match(read('src/app/api/consultation/route.ts'), /const ORGANIZER_EMAIL = calendarOrganizerEmail\(\);/);
  assert.match(read('src/lib/session-emails.ts'), /organizerEmail: calendarOrganizerEmail\(\),/);
});

test('the intro length is read as the coach set it, 15 when they have not, and refused when unreadable', async () => {
  const time = await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true });
  const owned = await loadRealModule(join(ROOT, 'src/lib/owned-provider.ts'), { typescript: true, registry: new Map([['@/lib/time', time], ['@supabase/supabase-js', {}]]) });
  const sb = await loadRealModule(join(ROOT, 'src/lib/session-booking.ts'), { typescript: true, registry: new Map([['@/lib/owned-provider', owned], ['@supabase/supabase-js', {}]]) });
  const db = (answer) => ({ from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => answer }; return q; } });
  assert.equal(await sb.readIntroLength(db({ data: { consult_min: 45 }, error: null }), 'trainer', 7), 45);
  assert.equal(await sb.readIntroLength(db({ data: null, error: null }), 'trainer', 7), 15, 'no rules row');
  assert.equal(await sb.readIntroLength(db({ data: { buffer_min: 10 }, error: null }), 'trainer', 7), 15, 'a row from before the column');
  assert.equal(await sb.readIntroLength(db({ data: null, error: { code: '42P01', message: 'relation "provider_booking_rules" does not exist' } }), 'trainer', 7), 15, 'no table yet');
  // ⚠ A FAILED READ IS NOT 15: booking 15 minutes for a coach who chose 45 is a wrong appointment.
  assert.equal(await sb.readIntroLength(db({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }), 'trainer', 7), null);
});
