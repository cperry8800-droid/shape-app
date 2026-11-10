// Mutation spec for where a person's own coach application stands (2026-11-09): the stage rule and the
// one-to-show pick (src/lib/application-status.mjs), the route that reads it with the admin client
// (src/app/api/me/application/route.ts), and the app's read and Settings row
// (services/shapeBackend.js, iosAppBroadsheetClient.jsx). Every mutation must be killed.
//   node scripts/mutate.mjs --spec tests/mutations/application-status-2026-11-09.mutations.mjs --fail-on-skipped
const LIB = 'src/lib/application-status.mjs';
const ROUTE = 'src/app/api/me/application/route.ts';
const BACKEND = 'mobile-app/src/services/shapeBackend.js';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

export default {
  test: 'node --test tests/application-status-route.test.mjs tests/app-coaches-tab.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    // ── the stage ──
    { name: 'a rejection reads as approved', file: LIB, find: "  if (status === 'rejected') return 'not_approved';", replace: "  if (status === 'rejected') return 'approved';" },
    { name: 'a withdrawn application reads as open', file: LIB, find: "  if (status === 'withdrawn') return 'withdrawn';", replace: '' },
    { name: 'a background check is claimed with none asked for', file: LIB, find: "  if (OPEN.has(status) && (check === 'requested' || check === 'needs_review' || check === 'clear')) return 'background_check';", replace: "  if (OPEN.has(status)) return 'background_check';" },
    { name: 'a reviewer opening it is not shown', file: LIB, find: "  if (status === 'in_review') return 'in_review';", replace: '' },

    // ── the one to show: the caller's own only ──
    { name: "someone else's row is picked", file: LIB, find: "  const mine = (Array.isArray(rows) ? rows : []).filter((r) => r && String(r.email || '').trim().toLowerCase() === mail);", replace: "  const mine = (Array.isArray(rows) ? rows : []).filter((r) => r);" },
    { name: 'the address is matched case-sensitively', file: LIB, find: "  const mine = (Array.isArray(rows) ? rows : []).filter((r) => r && String(r.email || '').trim().toLowerCase() === mail);", replace: "  const mine = (Array.isArray(rows) ? rows : []).filter((r) => r && String(r.email || '').trim() === mail);" },
    { name: 'a client-written account id is ownership again', file: LIB, find: "  const mine = (Array.isArray(rows) ? rows : []).filter((r) => r && String(r.email || '').trim().toLowerCase() === mail);", replace: "  const mine = (Array.isArray(rows) ? rows : []).filter((r) => r && (String(r.email || '').trim().toLowerCase() === mail || (r.details && r.details.user_id)));" },
    { name: 'a decided one shows over an open one', file: LIB, find: "  const row = open[0] || mine.slice().sort(newest)[0];", replace: '  const row = mine.slice().sort(newest)[0];' },
    { name: 'an open one claims a decision date', file: LIB, find: "    decidedAt: OPEN.has(String(row.status)) ? null : (row.reviewed_at || null),", replace: '    decidedAt: row.reviewed_at || null,' },

    // ── the route ──
    { name: 'a signed-out caller is answered', file: ROUTE, find: "  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });", replace: '' },
    { name: 'a failed read answers "no application"', file: ROUTE, find: "  if (results.some((r) => r.error)) return privateJson({ error: 'Could not read your application.', code: 'unavailable' }, { status: 503 });", replace: '' },
    { name: 'an open application past the newest ten is not read', file: ROUTE, find: "    newest(scoped().in('status', OPEN_STATUSES)),\n", replace: '' },
    { name: 'the answer may be cached', file: ROUTE, find: "const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };", replace: "const PRIVATE_HEADERS = { 'Cache-Control': 'public, max-age=60' };" },

    // ── the app ──
    { name: 'a refused read is the plain Apply door', file: BACKEND, find: "    if (!res.ok) return { unavailable: true };", replace: '    if (!res.ok) return null;' },
    { name: 'a network failure is the plain Apply door', file: BACKEND, find: "  } catch (e) {\n    return { unavailable: true };\n  }\n}", replace: "  } catch (e) {\n    return null;\n  }\n}" },
    { name: 'the row reads a failed read as none', file: CLIENT, find: "  if (app && app.unavailable) return { title, summary: tr('settings:coachApply.unavailable',", replace: "  if (false) return { title, summary: tr('settings:coachApply.unavailable'," },
    { name: 'in review reads as a background check', file: CLIENT, find: "    : st === 'in_review' ? { text: tr('settings:coachApply.inReview', { defaultValue: 'In review' }), color: amber }", replace: "    : st === 'in_review' ? { text: tr('settings:coachApply.backgroundCheck', { defaultValue: 'Background check' }), color: amber }" },
    { name: 'a decided application still promises a wait', file: CLIENT, find: "    st === 'submitted' || st === 'in_review' || st === 'background_check' ? tr('settings:coachApply.usually',", replace: "    st ? tr('settings:coachApply.usually'," },
    { name: 'a not-approved application is lit', file: CLIENT, find: "{ text: tr('settings:coachApply.notApproved', { defaultValue: 'Not approved' }), color: unlit, lit: false }", replace: "{ text: tr('settings:coachApply.notApproved', { defaultValue: 'Not approved' }), color: unlit }" },
    { name: 'a coach is offered the application', file: CLIENT, find: "  const coachAppRow = (isCoachRole || accountIsCoach) ? null", replace: '  const coachAppRow = false ? null' },
  ],
};
