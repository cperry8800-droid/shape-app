// Mutation spec for the coach Today follow-up (the owner's answers to #2628, 2026-11-06): the next
// payout's read from Stripe and its states (the route, src/lib/stripe.ts loadStripe, coachForecast.js
// moneyFrom, the card), shared clients in Needs you, and the earlier Today kept as its own saved
// dashboard (a one-time change to every coach's saved layouts). Every mutation must be killed. From
// the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-today-followup-2026-11-06.mutations.mjs --fail-on-skipped
const ROUTE = 'src/app/api/coach/next-payout/route.ts';
const STRIPE = 'src/lib/stripe.ts';
const FORECAST = 'public/newdesign/coachForecast.js';
const TODAY = 'public/newdesign/dashToday.jsx';
const GRID = 'public/newdesign/dashGrid.jsx';

export default {
  test: 'node --test tests/coach-next-payout.test.mjs tests/dash-today-board.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    // ── the route ──
    { name: 'route: a nutritionist reads the trainers table', file: ROUTE, find: "{ trainer: 'trainers', nutritionist: 'nutritionists' }", replace: "{ trainer: 'trainers', nutritionist: 'trainers' }" },
    { name: 'route: any role is read', file: ROUTE, find: "if (!table) return privateJson({ error: 'Ask for a trainer or nutritionist payout.' }, { status: 400 });", replace: '' },
    { name: 'route: an inherited key is a role', file: ROUTE, find: 'Object.prototype.hasOwnProperty.call(LISTING_TABLE, role) ? LISTING_TABLE[role] : null', replace: 'LISTING_TABLE[role] || null' },
    { name: 'route: an auth outage reads as signed out', file: ROUTE, find: 'if (!isMeasuredSignedOut(authErr)) {', replace: 'if (false) {' },
    { name: 'route: any listing, not the caller\'s', file: ROUTE, find: ".eq('owner_id', user.id)", replace: '' },
    { name: 'route: a failed listing read is "no listing"', file: ROUTE, find: "    return privateJson({ error: 'Could not read your listing.' }, { status: 500 });\n", replace: '' },
    { name: 'route: no account reads as connected', file: ROUTE, find: "if (!listing.stripe_account_id || listing.stripe_account_status !== 'active') {", replace: "if (!listing.stripe_account_id) {" },
    { name: 'route: an inactive account reads as connected', file: ROUTE, find: "if (!listing.stripe_account_id || listing.stripe_account_status !== 'active') {", replace: "if (listing.stripe_account_status !== 'active' && !listing.stripe_account_id) {" },
    { name: 'route: Stripe down reads as no payout', file: ROUTE, find: 'if (summary.error) return privateJson({ isProvider: true, connected: true, error: true });', replace: '' },
    { name: 'route: the currency is assumed', file: ROUTE, find: 'currency: next.currency,', replace: "currency: 'usd'," },
    { name: 'route: cached and shared', file: ROUTE, find: "const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };", replace: "const PRIVATE_HEADERS = { 'Cache-Control': 'public, max-age=60' };" },

    // ── the Stripe read (the Business page's) ──
    { name: 'stripe: payouts read on the platform, not the coach\'s account', file: STRIPE, find: 'stripe.payouts.list({ limit: 12 }, { stripeAccount: accountId }),', replace: 'stripe.payouts.list({ limit: 12 }),' },
    { name: 'stripe: the arrival date left in seconds', file: STRIPE, find: 'arrivalDate: p.arrival_date ? p.arrival_date * 1000 : null,', replace: 'arrivalDate: p.arrival_date,' },
    { name: 'stripe: a failed read is an empty account', file: STRIPE, find: "return { connected: true, error: true, status: accountStatus ?? 'error',", replace: "return { connected: true, status: accountStatus ?? 'error'," },

    // ── which payout is next (coachForecast.js moneyFrom) ──
    { name: 'next: a paid or cancelled payout is next', file: FORECAST, find: '(p.status === "in_transit" || p.status === "pending")', replace: '(p.status !== "failed")' },
    { name: 'next: the latest, not the soonest', file: FORECAST, find: '.sort((a, b) => (a.arrivalDate || Infinity) - (b.arrivalDate || Infinity))[0]', replace: '.sort((a, b) => (b.arrivalDate || 0) - (a.arrivalDate || 0))[0]' },

    // ── the card's read and states ──
    { name: 'card: a failed answer read as its body', file: TODAY, find: 'if (status !== 200 || !body || typeof body !== "object") return { state: "unread" };', replace: 'if (!body || typeof body !== "object") return { state: "unread" };' },
    { name: 'card: no listing reads as "set payouts up"', file: TODAY, find: '  if (body.isProvider !== true) return { state: "unread" };\n', replace: '' },
    { name: 'card: Stripe down reads as no payout', file: TODAY, find: 'if (body.connected !== true || body.error) return { state: "unread" };', replace: 'if (body.error) return { state: "none" };' },
    { name: 'card: an answer without `next` reads as none', file: TODAY, find: 'if (n === null) return { state: "none" };', replace: 'if (n == null) return { state: "none" };' },
    { name: 'card: an amount that is not a number prints', file: TODAY, find: '!Number.isFinite(n.amountCents) || ', replace: '' },
    { name: 'card: every currency counts cents', file: TODAY, find: 'const digits = DASH_ZERO_DECIMAL.includes(cur) ? 0 : DASH_THREE_DECIMAL.includes(cur) ? 3 : 2;', replace: 'const digits = 2;' },
    { name: 'card: the arrival day printed as an instant in the coach\'s zone', file: TODAY, find: 'Z.formatDate(noon, { zone: "UTC", ...fields })', replace: 'Z.formatDate(arrivalMs, { zone: tz, ...fields })' },
    { name: 'card: today is UTC\'s, not the coach\'s', file: TODAY, find: 'const today = Z ? Z.dayKey(now, tz) : dashLocalDate(new Date(now));', replace: 'const today = new Date(now).toISOString().slice(0, 10);' },
    { name: 'card: tomorrow is yesterday', file: TODAY, find: 'if (diff === 1) return "arrives tomorrow";', replace: 'if (diff === -1) return "arrives tomorrow";' },
    { name: 'card: the model drops the coach\'s zone', file: TODAY, find: 'if (read) payout = dashPayoutView(read, ctx && ctx.zone, now);', replace: 'if (read) payout = dashPayoutView(read, null, now);' },
    { name: 'card: the setup link opens Business\'s overview', file: TODAY, find: 'dashLinkedTab("business", role, { section: "money" })', replace: 'dashTabHref("business", role)' },
    { name: 'card: the preview is handed a read', file: TODAY, find: 'return live ? (read || { state: "loading" }) : null;', replace: 'return read || { state: "loading" };' },
    { name: 'card: the payout is read on a page that is not live', file: TODAY, find: 'useDashNextPayout(role, ownReads)', replace: 'useDashNextPayout(role, true)' },
    { name: 'card: the sample\'s payout flashes while the page loads', file: TODAY, find: 'dashMoneyModel(live, kpiCtx, source === "demo", source == null ? { state: "loading" } : payoutRead)', replace: 'dashMoneyModel(live, kpiCtx, source !== "live", payoutRead)' },
    { name: 'card: no read claims payouts aren\'t set up', file: TODAY, find: '  else payout = { state: "unread" };\n  return { recurring, payout, live: !!live };', replace: '  else payout = { state: "setup" };\n  return { recurring, payout, live: !!live };' },
    { name: 'card: the halves never stack', file: TODAY, find: '"repeat(auto-fit, minmax(" + DASH_MONEY_CELL + "px, 1fr))"', replace: '"minmax(0,1fr) minmax(0,1fr)"' },
    { name: 'card: the read asks another route', file: TODAY, find: '"/api/coach/next-payout?role=" + encodeURIComponent(role)', replace: '"/api/" + encodeURIComponent(role) + "/analytics"' },

    // ── shared clients in Needs you ──
    { name: 'shared: the joint note stands where a screening read was', file: TODAY, find: 'shared = !lead || slip.includes(lead)', replace: 'shared = true' },
    { name: 'shared: a listed joint client is pulled forward', file: TODAY, find: 'for (const [id, j] of jointById) if (!listed.has(id)) add("week", j.client, { row: null });', replace: 'for (const [id, j] of jointById) add("week", j.client, { row: null });' },
    { name: 'shared: an unlisted joint client is dropped', file: TODAY, find: 'for (const [id, j] of jointById) if (!listed.has(id)) add("week", j.client, { row: null });', replace: '' },
    { name: 'shared: an entry without a co-coach is shared', file: TODAY, find: 'if (id != null && j.coCoach && j.coCoach.role && !jointById.has(id)) jointById.set(id, j);', replace: 'if (id != null && !jointById.has(id)) jointById.set(id, j);' },
    { name: 'shared: the joint note goes to the client', file: TODAY, find: '    if (it.joint) {\n      setNoteFail(null);', replace: '    if (false) {\n      setNoteFail(null);' },
    { name: 'shared: the chip is not drawn', file: TODAY, find: '{it.shared && sharedChip(it)}', replace: '' },
    { name: 'shared: a refused joint note says nothing', file: TODAY, find: '.then((ok) => { if (!ok) setNoteFail(say); }', replace: '.then((ok) => {}' },
    { name: 'shared: the preview\'s note asks the route', file: TODAY, find: 'const say = real ? whose + " couldn\'t be opened just now." : whose + " opens on a live account.";', replace: 'const say = whose + " couldn\'t be opened just now.";' },
    { name: 'shared: a folded shared client goes unsaid', file: TODAY, find: 'if (fold.shared > 0) parts.push(fold.shared + " shared");', replace: '' },
    { name: 'shared: the page hands Needs you no joint attention', file: TODAY, find: 'feed={triage} joint={joint} role={role}', replace: 'feed={triage} role={role}' },

    // ── the earlier Today, kept as its own dashboard ──
    { name: 'earlier: copied again once marked', file: GRID, find: 'if (mark && typeof mark === "object" && mark[role]) return false;', replace: '' },
    { name: 'earlier: a six-widget layout is copied', file: GRID, find: 'return !keys.some((k) => DG_SIX_ONLY.includes(k));', replace: 'return true;' },
    { name: 'earlier: an empty layout is copied', file: GRID, find: 'if (!items.length && !lists.some((l) => l.length)) return false;', replace: '' },
    { name: 'earlier: an inactive board read as the active one', file: GRID, find: 'const current = library.boards.find((b) => b.id === library.active) || library.boards[0];\n  return (doc && doc[role]) ||', replace: 'const current = library.boards[library.boards.length - 1];\n  return (doc && doc[role]) ||' },
    { name: 'earlier: at the cap the copy is forced', file: GRID, find: 'if (library.boards.length >= 20) return doc;', replace: '' },
    { name: 'earlier: a taken name is reused', file: GRID, find: 'if (!taken.has(base.toLowerCase())) return base;', replace: 'return base;' },
    { name: 'earlier: the copy is verbatim, its old cards hidden', file: GRID, find: '  next = dgBoardEdit(next, role, { type: "tab", board: id, tab: "today", layout: dgEarlierTodayTab(copy && copy.tabs ? copy.tabs.today : null, role) });\n', replace: '' },
    { name: 'earlier: the queues keep their old key', file: GRID, find: 'const DG_EARLIER_RENAMED = { needs: "queues" };', replace: 'const DG_EARLIER_RENAMED = {};' },
    { name: 'earlier: a hidden `needs` keeps its old key', file: GRID, find: 'for (const k of oldHidden) { const r = rename(k);', replace: 'for (const k of oldHidden) { const r = k;' },
    { name: 'earlier: a layout naming `needsyou` is copied', file: GRID, find: 'const DG_SIX_ONLY = ["brief", "upnext", "glance", "money", "needsyou", "timeline", "queues"];', replace: 'const DG_SIX_ONLY = ["brief", "upnext", "glance", "money", "timeline", "queues"];' },
    { name: 'earlier: the new Needs you is left on the copy', file: GRID, find: 'const DG_EARLIER_OFF = ["brief", "glance", "money", "needsyou"];', replace: 'const DG_EARLIER_OFF = ["brief", "glance", "money", "needs"];' },
    { name: 'earlier: a card the coach hid comes back', file: GRID, find: 'if (!oldHidden.has(k) && (k !== "roster" || role === "nutritionist")) add(rename(k));', replace: 'if (k !== "roster" || role === "nutritionist") add(rename(k));' },
    { name: 'earlier: the copy becomes the active board', file: GRID, find: '  next = dgBoardEdit(next, role, { type: "switch", id: prev });\n', replace: '' },
    { name: 'earlier: the active board keeps the old layout', file: GRID, find: '  next = dgBoardEdit(next, role, { type: "tab", board: prev, tab: "today", layout: {} });\n', replace: '' },
    { name: 'earlier: no mark', file: GRID, find: 'return { ...next, [DG_EARLIER_MARK]: { ...mark, [role]: id } };', replace: 'return next;' },
    { name: 'earlier: the preview or a signed-out page copies', file: GRID, find: 'if (!keep || tab !== "today" || !store || !store.uid || typeof store.read !== "function") return false;', replace: 'if (!keep || tab !== "today" || !store || typeof store.read !== "function") return false;' },
    { name: 'earlier: a read not back copies', file: GRID, find: 'return !!(state && state.loaded && dgEarlierTodayDue(state.doc, role));', replace: 'return !!(state && dgEarlierTodayDue(state.doc, role));' },
    { name: 'earlier: DashGrid never runs it', file: GRID, find: 'if (!dgEarlierTodayGate(store, role, keepEarlierToday, tab)) return;', replace: 'if (true) return;' },
    { name: 'earlier: the coach Today does not ask for it', file: TODAY, find: '      dockCatalog\n      keepEarlierToday\n', replace: '      dockCatalog\n' },
  ],
};
