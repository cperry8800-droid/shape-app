import React from 'react';
// The forecast module the website's Business page runs: imported for its side effect, it
// registers window.CoachForecast (as shapeSignals.js does with dashSignals.js). Every figure
// below comes from it, so the app and the website print the same numbers.
import '../../../public/newdesign/coachForecast.js';

// ─── BUSINESS (Me → Business) ────────────────────────────────────────────────
// Owner, 2026-10-17: "We need to create a business page on app for coaches. So have to match
// what is on website but designed for app", placed inside Me: a card on the coach's own Me tab
// (their profile, BSSignalCoachProfile in meMode) opens it, as does Settings → Your practice →
// Payouts. The website's page
// (public/newdesign/dashBusiness.jsx, design E) has five tabs; on a phone they are three:
//
//   Money    your money (Stripe), renewing this week, net a month over 13 weeks
//   Plan     what clients earn you, and the next 12 months against a goal
//   Clients  who joined and left, what a client is worth, the waiting list, who left
//
// Same routes as the website: /api/{role}/analytics (with this week's renewals), the coach's
// listing, and the capacity route for the waiting list. Signed out, it is a preview with
// sample numbers, and says so.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. This file is a static import of
// the pros module, so it evaluates before that module's body runs (BSLeaderboard.jsx has the
// same rule). The components name the globals they need on their first line.
//
// ⚠ EVERY STATE SAYS WHAT IT IS. Loading, could not read, not linked to Stripe, no clients yet
// and the preview are each their own sentence; none of them is drawn as a zero.

// The i18n translator for this module (the self-contained copy every feature module carries).
function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

const CF = () => window.CoachForecast;
const DAY = 86400000;
export const BS_BIZ_TABS = ['money', 'plan', 'clients'];
// How many cancellations the analytics routes send, newest first (their `.limit(12)`).
export const BS_BIZ_CHURN_LIST = 12;

// ⚠ A MEASURED CHURN IS KEPT TO A TENTH OF A POINT, AND NEVER ROUNDS TO 0 (Business sweep
// 2026-10-18). Whole points turned one departure from 70 clients in three months (0.45% a month)
// into "0% leave a month" beside "a client stays about 223 months": the plan lost its attrition
// and the two figures disagreed. The rule is coachForecast.js `churnPct`, which `planStart` (the
// planner's start) and the website's dbzChurnPct read too, so the two pages cannot drift.
export const bsBizChurnPct = (churn) => CF().churnPct(churn);
function intlLocale() {
  try { return window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.() || undefined; } catch (e) { return undefined; }
}
// ⚠ A TENTH IS WRITTEN IN THE COACH'S LANGUAGE, NEVER WITH toFixed. German, French, Turkish and
// most of the 13 write 0,5, and bsBizMoney groups their thousands with a point ($34.687), so a
// toFixed "0.4 %" in the same sentence read as grouping, not a decimal.
// `whole`: a whole value prints without its ",0" (a percentage, the website's dbzPct).
function bizTenth(v, whole) {
  const digits = whole && Number.isInteger(v) ? 0 : 1;
  try { return new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: digits, maximumFractionDigits: 1 }).format(v); } catch (e) { return digits ? v.toFixed(1) : String(v); }
}
// A percentage as the planner prints it: whole when it is whole, else to a tenth.
const pctNum = (p) => bizTenth(p, true);
// ⚠ …AND ITS SIGN WHERE THE COACH'S LANGUAGE PUTS IT, from the catalog, never a '%' appended in
// code. Turkish writes %7,1 and German 7,1 %; the churn slider appended one, an English "7,1%",
// above a note reading "%7,1". business.plan.pct writes the sign as each catalog's own yoursChurn
// and worthFrom do (tests/app-coach-business.test.mjs checks all 13).
const pctText = (tr, p) => tr('coach:business.plan.pct', { defaultValue: '{value}%', value: pctNum(p) });
// New clients a month: always to a tenth ("1,0").
const addsNum = (v) => bizTenth(v, false);
// A rate as the planner's slider prints it: whole dollars, or to the cent when the listing price
// has cents, in the coach's language ("$149.50", German "$149,50"; grouped as bsBizMoney groups).
function rateText(r) {
  const digits = Number.isInteger(r) ? 0 : 2;
  try { return '$' + new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(r); } catch (e) { return '$' + (digits ? r.toFixed(2) : String(r)); }
}

// Whole dollars, as the website prints them.
export function bsBizMoney(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return '—';
  const n = Math.round(Number(cents) / 100);
  try { return '$' + n.toLocaleString(intlLocale()); } catch (e) { return '$' + n; }
}
function bizDate(v, withDay) {
  if (!v) return '—';
  try {
    return new Date(typeof v === 'number' ? v : String(v)).toLocaleDateString(intlLocale(), withDay ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
  } catch (e) { return '—'; }
}
const signedIn = () => { try { return !!window.ShapeAuth?.getCachedState?.()?.user?.id; } catch (e) { return false; } };

// ── The preview (signed out) ────────────────────────────────────────────────
// One small practice, consistent with itself: 26 weeks growing from 8 clients to 12, with the
// departures its churn list shows, payouts that match its net, and renewals from its roster.
export function bsBizDemo(now = Date.now()) {
  const monday = new Date(now); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weeks = [];
  let active = 6;
  for (let i = 25; i >= 0; i--) {
    const k = 25 - i;
    const added = k % 5 === 0 && k > 0 ? 1 : k % 9 === 4 ? 1 : 0;
    const ended = k === 14 || k === 21 ? 1 : 0;
    active += added - ended;
    weeks.push({ weekOf: new Date(monday.getTime() - i * 7 * DAY).toISOString().slice(0, 10), active, added, ended, mrrGrossCents: active * 17500, mrrNetCents: Math.round(active * 17500 * (1 - 0.75 * 0.15)) });
  }
  const names = ['Casey M.', 'Alex R.', 'Jordan P.', 'Sam K.', 'Riley T.', 'Morgan L.', 'Jamie D.', 'Taylor B.', 'Avery S.', 'Quinn H.', 'Drew N.', 'Blake W.'];
  const last = weeks[weeks.length - 1];
  // One row a client, in the routes' shape (origin-attribution.ts folds each client's plans into one
  // row); each holds one plan here. The app lists none of it: the share and the renewals read it.
  const byOrigin = names.slice(0, last.active).map((name, i) => ({
    name, clientId: 'demo-' + (i + 1), kind: 'subscription', origin: i % 4 === 0 ? 'coach_link' : 'marketplace',
    feeBps: i % 4 === 0 ? 0 : 1500, priceCents: 17500, plans: 1, mixedFees: false,
  }));
  return {
    extra: {
      trajectory: { weeks, firstSubAt: new Date(now - 400 * DAY).toISOString() },
      metrics: { activeClients: last.active, mrrNetCents: last.mrrNetCents, mrrGrossCents: last.mrrGrossCents },
      byOrigin,
      // The routes' per-client brought-in share (byoMixOf): the rows are clients, as the routes' are.
      byoMix: { clients: byOrigin.length, brought: byOrigin.filter((r) => r.feeBps === 0).length },
      stripe: {
        connected: true, balanceCents: 61200, pendingCents: 9800,
        payouts: [{ status: 'in_transit', amountCents: 48300, arrivalDate: now + 2 * DAY }],
        schedule: { interval: 'weekly', weeklyAnchor: 'friday', delayDays: 2 },
      },
      renewals: byOrigin.slice(0, 4).map((r, i) => ({ name: r.name, dueAt: new Date(now + (1 + i * 2) * DAY).toISOString(), priceCents: r.priceCents, netCents: Math.round(r.priceCents * (1 - r.feeBps / 10000)), ending: i === 3 })),
      churn: [
        { name: 'Parker G.', startedAt: new Date(now - 230 * DAY).toISOString(), endedAt: new Date(now - 30 * DAY).toISOString(), priceCents: 17500 },
        { name: 'Reese V.', startedAt: new Date(now - 300 * DAY).toISOString(), endedAt: new Date(now - 79 * DAY).toISOString(), priceCents: 17500 },
      ],
    },
    listingMonthly: 175,
    waiting: 3,
  };
}

// ── The reads ───────────────────────────────────────────────────────────────
// { kind: 'demo' | 'loading' | 'live' | 'none' | 'error', extra, listingMonthly, listingRead, listingFailed, waiting }
//   none: signed in, but no listing of this role (the route answers isTrainer: false).
//   error: the read failed (a 500, a refused token, no session, a thrown fetch): never 'loading'
//   for good, and never 'none' (shapeBackend.js getCoachAnalytics throws for each).
// ⚠ THE PREVIEW IS FOR A SIGNED-OUT VIEWER ONLY (the website's Business sweep, #2394, where a
// pending or failed read showed a signed-in coach the preview's figures as their own). Here the
// preview is decided by sign-in alone: a pending read is 'loading', a failed one 'error'.
// `renewals`: the Business page asks for this week's renewals (a Stripe read each); the Me card
// does not. `reload` bumps to read again.
export function useBSCoachBusiness(role, { renewals = false, reload = 0 } = {}) {
  const live = signedIn();
  const [state, setState] = React.useState(() => (live ? { kind: 'loading' } : { kind: 'demo', ...bsBizDemo() }));
  React.useEffect(() => {
    if (!signedIn()) { setState({ kind: 'demo', ...bsBizDemo() }); return undefined; }
    let on = true;
    setState({ kind: 'loading' });
    const api = window.ShapeCoachBusiness;
    if (!api || !api.analytics) { setState({ kind: 'error' }); return undefined; }
    api.analytics({ role, renewals }).then((extra) => {
      if (!on) return;
      setState((s) => ({ ...s, kind: extra ? 'live' : 'none', extra: extra || null }));
    }).catch(() => { if (on) setState((s) => ({ ...s, kind: 'error' })); });
    // The listing price (where the plan's rate starts) and the waiting list: read alongside, each
    // answering on its own. undefined while it loads; null when it could not be read.
    // ⚠ A FAILED LISTING READ IS NOT "NO LISTING PRICE YET" (the website's Business sweep, #2394).
    // `listingFailed` says the price went unread (a refused read, no session to read with, or no
    // listing service), so the Plan says it couldn't read it; an answer with no listing of this
    // role is a read, and is "no listing price yet".
    if (renewals) {
      const get = window.ShapeCoachListing && window.ShapeCoachListing.getMine;
      (get ? get() : Promise.resolve(null)).then((list) => {
        if (!on) return;
        const read = Array.isArray(list);
        const l = read ? list.find((x) => x && x.role === role) : null;
        setState((s) => ({ ...s, listingMonthly: l ? l.monthly : null, listingRead: true, listingFailed: !read }));
      }).catch(() => { if (on) setState((s) => ({ ...s, listingMonthly: null, listingRead: true, listingFailed: true })); });
      const cap = window.ShapeBookings && window.ShapeBookings.getCapacity;
      (cap ? cap({ role }) : Promise.resolve(null)).then((c) => {
        if (on) setState((s) => ({ ...s, waiting: c && typeof c.waiting === 'number' ? c.waiting : null }));
      }).catch(() => { if (on) setState((s) => ({ ...s, waiting: null })); });
    }
    return () => { on = false; };
  }, [role, renewals, reload]);
  return state;
}

// Where the Plan tab starts (coachForecast.js planNumbers, as the website's dbzPlanBase).
// { state: 'loading' | 'unread' | 'ready', ...numbers }
export function bsBizPlanBase(biz, now = Date.now()) {
  const F = CF();
  if (!F) return { state: 'unread' };
  if (biz.kind === 'loading' || (biz.kind === 'live' && !biz.listingRead)) return { state: 'loading' };
  if (biz.kind !== 'live' && biz.kind !== 'demo') return { state: 'unread' };
  // An unread input (listingFailed here; byoMix and the trajectory in the payload) comes back
  // flagged (listingUnread, broughtUnread, pace.unread), and each note below says so.
  const n = F.planNumbers({ extra: biz.extra, listingMonthly: biz.listingMonthly, listingFailed: !!biz.listingFailed, now });
  return n ? { ...n, state: 'ready' } : { state: 'unread' };
}

// ── Pieces ──────────────────────────────────────────────────────────────────
function teal(t) { return t.isLight ? '#0a8f87' : '#34d6c5'; }

function Head({ t, label, right, color }) {
  return (
    <div style={{ marginTop: 26, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${t.RULE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: color || teal(t) }}>{label}</span>
      {right ? <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: t.INK70 || t.INK50, textAlign: 'right' }}>{right}</span> : null}
    </div>
  );
}
function Note({ t, children, style }) {
  return <div style={{ fontFamily: t.BODY || t.DISPLAY, fontSize: 13.5, lineHeight: 1.5, color: t.INK50, ...(style || {}) }}>{children}</div>;
}
function Sentence({ t, children }) {
  return <p style={{ margin: 0, fontFamily: t.DISPLAY, fontSize: 18, lineHeight: 1.4, color: t.INK, letterSpacing: '-0.01em' }}>{children}</p>;
}
function Row({ t, label, sub, value, strike, dim, subColor, last }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'baseline', padding: '12px 0', borderBottom: last ? 0 : `1px solid ${t.HAIR}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK }}>{label}</div>
        {sub ? <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.04em', color: subColor || t.INK50 }}>{sub}</div> : null}
      </div>
      <span style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 600, color: strike || dim ? t.INK50 : t.INK, textDecoration: strike ? 'line-through' : 'none', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}
function Pill({ t, onClick, children, solid, disabled }) {
  const c = teal(t);
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ marginTop: 14, borderRadius: 999, border: `1px solid ${c}`, background: solid ? c : 'transparent', color: solid ? (t.isLight ? '#fff' : '#06231f') : c, padding: '10px 16px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{children}</button>
  );
}

// Stripe's payout schedule, in words.
function scheduleLine(s, tr) {
  if (!s) return null;
  if (s.interval === 'manual') return tr('coach:business.money.scheduleManual', { defaultValue: 'Manual payouts: you start them from Stripe' });
  const day = s.weeklyAnchor ? new Date(Date.UTC(2026, 0, 4 + ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(String(s.weeklyAnchor).toLowerCase()))) : null;
  const dayName = day && !Number.isNaN(day.getTime()) ? day.toLocaleDateString(intlLocale(), { weekday: 'long', timeZone: 'UTC' }) : null;
  const base = s.interval === 'weekly' && dayName
    ? tr('coach:business.money.scheduleWeeklyOn', { defaultValue: 'Paid out weekly, on {day}', day: dayName })
    : s.interval === 'monthly' && s.monthlyAnchor
      ? tr('coach:business.money.scheduleMonthlyOn', { defaultValue: 'Paid out monthly, on day {day}', day: s.monthlyAnchor })
      : s.interval === 'weekly' ? tr('coach:business.money.scheduleWeekly', { defaultValue: 'Paid out weekly' })
        : s.interval === 'monthly' ? tr('coach:business.money.scheduleMonthly', { defaultValue: 'Paid out monthly' })
          : tr('coach:business.money.scheduleDaily', { defaultValue: 'Paid out daily' });
  return s.delayDays != null
    ? tr('coach:business.money.scheduleDelay', { defaultValue: '{schedule}, {days, plural, one {# day} other {# days}} after each charge', schedule: base, days: s.delayDays })
    : base;
}

// ── Money ───────────────────────────────────────────────────────────────────
function MoneyTab({ t, biz, role }) {
  const tr = useShapeTr();
  const extra = biz.extra || {};
  const F = CF();
  const [linking, setLinking] = React.useState(false);
  // ⚠ A SET-UP THAT DIDN'T START SAYS SO (Codex on #2395). A rejected start (the API, the network or the
  // native bridge) was swallowed, and the button went from "Opening Stripe…" back to itself, so the one
  // thing an unlinked coach can do here looked broken. It says what Settings → Your practice says.
  const [linkFailed, setLinkFailed] = React.useState(false);
  const setUp = async () => {
    if (linking) return;
    setLinking(true);
    setLinkFailed(false);
    try {
      const start = window.ShapeConnect && window.ShapeConnect.startOnboarding;
      if (!start) throw new Error('no payout set-up here');
      await start({ role });
    } catch (e) { setLinkFailed(true); }
    setLinking(false);
  };
  const stripe = extra.stripe;
  let money;
  if (!stripe) money = <Note t={t}>{tr('coach:business.money.unread', { defaultValue: "Couldn't read your payouts just now. Nothing is lost; try again in a moment." })}</Note>;
  else if (!stripe.connected) {
    money = (
      <div>
        <Note t={t}>{tr('coach:business.money.notLinked', { defaultValue: "Payouts aren't set up yet. Link a Stripe account and this fills in: what's ready to pay out, what's on its way to your bank, and when." })}</Note>
        <Pill t={t} solid onClick={setUp} disabled={linking}>{linking ? tr('coach:business.money.opening', { defaultValue: 'Opening Stripe…' }) : tr('coach:business.money.setUp', { defaultValue: 'Set up payouts →' })}</Pill>
        {linkFailed ? <Note t={t} style={{ marginTop: 8, color: t.RUST }}>{tr('coach:business.money.setUpFailed', { defaultValue: 'Could not start Stripe payout setup.' })}</Note> : null}
      </div>
    );
  } else if (stripe.error) {
    money = (
      <div>
        <Note t={t}>{tr('coach:business.money.stripeError', { defaultValue: "Couldn't reach Stripe just now. Your balance and payouts are safe there; try again in a moment, or open your Stripe dashboard." })}</Note>
        <Pill t={t} onClick={() => window.ShapeCoachBusiness?.openStripe?.()}>{tr('coach:business.money.openStripe', { defaultValue: 'Open your Stripe ↗' })}</Pill>
      </div>
    );
  } else {
    const m = F.moneyFrom(stripe);
    const today = F.todayFrom(extra);
    const rows = [
      m.onWay ? { k: 'onWay', label: tr('coach:business.money.onWay', { defaultValue: 'On its way to your bank' }), sub: m.next && m.next.arrivalDate ? tr('coach:business.money.arrives', { defaultValue: 'arrives {date}', date: bizDate(m.next.arrivalDate) }) : tr('coach:business.money.notLanded', { defaultValue: 'paid out, not landed yet' }), v: m.onWayCents } : null,
      m.balanceCents != null ? { k: 'ready', label: tr('coach:business.money.ready', { defaultValue: 'Ready to pay out' }), sub: tr('coach:business.money.readySub', { defaultValue: 'in your Stripe balance now' }), v: m.balanceCents } : null,
      m.pendingCents ? { k: 'clearing', label: tr('coach:business.money.clearing', { defaultValue: 'Still clearing' }), sub: tr('coach:business.money.clearingSub', { defaultValue: "new charges Stripe hasn't released yet" }), v: m.pendingCents } : null,
      today && today.mrrNetCents != null ? { k: 'net', label: tr('coach:business.money.netMonth', { defaultValue: "Net a month, at today's clients" }), sub: tr('coach:business.billedFee', { defaultValue: '{billed} billed · {fee} Shape fee', billed: bsBizMoney(today.mrrGrossCents), fee: bsBizMoney((today.mrrGrossCents || 0) - today.mrrNetCents) }), v: today.mrrNetCents } : null,
    ].filter(Boolean);
    const sched = scheduleLine(stripe.schedule, tr);
    money = (
      <div>
        <Sentence t={t}>
          {tr('coach:business.money.coming', { defaultValue: '{amount} is coming to you.', amount: bsBizMoney(m.comingCents) })}
          {m.next && m.next.arrivalDate ? ' ' + tr('coach:business.money.next', { defaultValue: 'The next payout, {amount}, lands {date}.', amount: bsBizMoney(m.next.amountCents), date: bizDate(m.next.arrivalDate) }) : null}
        </Sentence>
        <div style={{ marginTop: 6 }}>{rows.map((r, i) => <Row key={r.k} t={t} label={r.label} sub={r.sub} value={bsBizMoney(r.v)} last={i === rows.length - 1} />)}</div>
        {sched ? <Note t={t} style={{ marginTop: 8 }}>{sched}</Note> : null}
        <Pill t={t} onClick={() => window.ShapeCoachBusiness?.openStripe?.()}>{tr('coach:business.money.openStripe', { defaultValue: 'Open your Stripe ↗' })}</Pill>
      </div>
    );
  }

  // Renewing this week. undefined: not asked; null: the subscriptions could not be read.
  const rows = extra.renewals;
  const sum = F.renewalsSum(rows);
  let renew;
  if (rows === undefined) renew = <Note t={t}>{tr('coach:business.loading', { defaultValue: 'Reading your numbers…' })}</Note>;
  else if (rows === null) renew = <Note t={t}>{tr('coach:business.unreadSubs', { defaultValue: "Couldn't read your subscriptions just now. Nothing is lost; try again in a moment." })}</Note>;
  else if (!rows.length) renew = <Note t={t}>{tr('coach:business.renew.none', { defaultValue: 'No one renews in the next 7 days.' })}</Note>;
  else {
    const unchecked = rows.some((r) => r.ending == null);
    renew = (
      <div>
        {rows.map((r, i) => (
          // ending is three-state: true cancelled, false renews, null not checked (the footnote can't
          // say which, so the row does, dimmed like money not counted but not struck through).
          <Row key={i} t={t} label={r.name} last={i === rows.length - 1} strike={!!r.ending} dim={r.ending == null} subColor={r.ending ? t.RUST : r.ending == null ? t.AMBER : null}
            sub={r.ending ? tr('coach:business.renew.cancelled', { defaultValue: 'Cancelled · ends {date}', date: bizDate(r.dueAt, true) })
              : r.ending == null ? tr('coach:business.renew.notChecked', { defaultValue: '{date} · not checked with Stripe', date: bizDate(r.dueAt, true) })
              : tr('coach:business.renew.due', { defaultValue: '{date} · {price} a month', date: bizDate(r.dueAt, true), price: bsBizMoney(r.priceCents) })}
            value={bsBizMoney(r.netCents)} />
        ))}
        {/* Never "just now": a row past the routes' check cap (RENEWAL_CHECK_CAP, 25) is unchecked on every load. */}
        <Note t={t} style={{ marginTop: 8 }}>
          {tr('coach:business.renew.note', { defaultValue: "Net to you, after Shape's fee." })}
          {unchecked ? ' ' + tr('coach:business.renew.unchecked', { defaultValue: "Some couldn't be checked with Stripe, so they aren't counted above." }) : null}
        </Note>
      </div>
    );
  }

  return (
    <div>
      <Head t={t} label={tr('coach:business.money.head', { defaultValue: 'Your money' })} />
      {money}
      <Head t={t} label={tr('coach:business.renew.head', { defaultValue: 'Renewing this week' })}
        right={sum ? tr('coach:business.renew.sum', { defaultValue: '{count, plural, one {# client} other {# clients}} · {net} net', count: sum.count, net: bsBizMoney(sum.netCents) }) : null} />
      {renew}
      <Head t={t} label={tr('coach:business.weeks.head', { defaultValue: 'Net a month, last 13 weeks' })} />
      <NetWeeks t={t} trajectory={extra.trajectory} />
    </div>
  );
}

// Net a month at the end of each of the last 13 weeks, as bars.
export function BSBizNetBars({ t, weeks, height = 64, labels = true }) {
  const tr = useShapeTr();
  const list = (Array.isArray(weeks) ? weeks : []).slice(-13);
  const max = Math.max(1, ...list.map((w) => w.mrrNetCents || 0));
  const c = teal(t);
  return (
    <div>
      <div role="img" aria-label={tr('coach:business.weeks.aria', { defaultValue: 'Net a month over the last 13 weeks, from {from} to {to}', from: bsBizMoney(list.length ? list[0].mrrNetCents : null), to: bsBizMoney(list.length ? list[list.length - 1].mrrNetCents : null) })}
        style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height }}>
        {list.map((w, i) => (
          <div key={w.weekOf || i} style={{ flex: 1, height: `${Math.max(4, ((w.mrrNetCents || 0) / max) * 100)}%`, borderRadius: 4, background: i === list.length - 1 ? c : `${c}40` }} />
        ))}
      </div>
      {labels && list.length ? (
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', color: t.INK50 }}>
          <span>{bizDate(list[0].weekOf + 'T12:00:00Z')}</span>
          <span>{bsBizMoney(list[list.length - 1].mrrNetCents)}</span>
        </div>
      ) : null}
    </div>
  );
}
function NetWeeks({ t, trajectory }) {
  const tr = useShapeTr();
  if (trajectory === null) return <Note t={t}>{tr('coach:business.unreadSubs', { defaultValue: "Couldn't read your subscriptions just now. Nothing is lost; try again in a moment." })}</Note>;
  if (!trajectory || !Array.isArray(trajectory.weeks) || !trajectory.weeks.length) return <Note t={t}>{tr('coach:business.loading', { defaultValue: 'Reading your numbers…' })}</Note>;
  return <BSBizNetBars t={t} weeks={trajectory.weeks} height={90} />;
}

// ── Plan ────────────────────────────────────────────────────────────────────
function NumberField({ t, label, value, onChange, prefix, suffix, note, max }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, border: `1px solid ${t.RULE}`, borderRadius: 10, padding: '9px 10px', background: t.PAPER2 }}>
        {prefix ? <span style={{ fontFamily: t.MONO, fontSize: 12, color: t.INK50 }}>{prefix}</span> : null}
        <input type="number" inputMode="decimal" min="0" max={max} value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: t.INK, fontFamily: t.MONO, fontSize: 16, fontVariantNumeric: 'tabular-nums' }} />
        {suffix ? <span style={{ fontFamily: t.MONO, fontSize: 12, color: t.INK50 }}>{suffix}</span> : null}
      </span>
      {note ? <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, lineHeight: 1.4 }}>{note}</span> : null}
    </label>
  );
}

// Where the rate starts. An unread listing price is said as unread, with the fallback it started from.
function rateFromNote(base, tr) {
  if (base.rateFrom === 'listing') return tr('coach:business.earn.rateListing', { defaultValue: 'your listing price' });
  if (base.listingUnread) {
    return base.rateFrom === 'average'
      ? tr('coach:business.earn.rateUnreadAverage', { defaultValue: "couldn't read your listing price · your clients' average" })
      : tr('coach:business.earn.rateUnreadDefault', { defaultValue: "couldn't read your listing price · set your own" });
  }
  return base.rateFrom === 'average' ? tr('coach:business.earn.rateAverage', { defaultValue: "your clients' average" })
    : tr('coach:business.earn.rateDefault', { defaultValue: 'no listing price yet · set your own' });
}
// The brought share's note, per client (the routes' byoMix: one client on two plans is one client):
// an unread share (byoMix null) starts at 0% and says so, never as a measured none.
function byoNote(base, tr) {
  if (base.broughtUnread) return tr('coach:business.earn.byoUnread', { defaultValue: "couldn't read who you brought · set your own" });
  return base.byoClients ? tr('coach:business.earn.byoNote', { defaultValue: '0% fee · {brought} of your {clients}', brought: base.brought, clients: base.byoClients }) : tr('coach:business.earn.byoNone', { defaultValue: '0% Shape fee on these' });
}

// "What clients earn you": type a client count and a rate, read the net (the website's DbzEarnZone).
export function BSBizEarn({ t, base }) {
  const tr = useShapeTr();
  const F = CF();
  // A round number above today's count: the question is "what if I had more".
  const [clients, setClients] = React.useState(String(Math.max(20, Math.ceil((base.clients + 1) / 10) * 10)));
  // The rate as it is, to the cent: a $149.50 listing price is not "150 · your listing price"
  // (the sweep after #2394 round 10; the Plan's slider holds it the same way).
  const [rate, setRate] = React.useState(String(base.rateCents / 100));
  const [byo, setByo] = React.useState(String(Math.round(base.byoShare * 100)));
  const n = Math.max(0, Math.round(Number(clients) || 0));
  const e = F.earn({ clients: n, priceCents: Math.round(Math.max(0, Number(rate) || 0) * 100), byoShare: Math.min(100, Math.max(0, Number(byo) || 0)) / 100 });
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
        <NumberField t={t} label={tr('coach:business.earn.clients', { defaultValue: 'Clients' })} value={clients} onChange={setClients} max="999"
          note={tr('coach:business.earn.today', { defaultValue: 'you have {count} today', count: base.clients })} />
        <NumberField t={t} label={tr('coach:business.earn.rate', { defaultValue: 'Monthly rate' })} value={rate} onChange={setRate} prefix="$" max="9999" note={rateFromNote(base, tr)} />
        <NumberField t={t} label={tr('coach:business.earn.byo', { defaultValue: 'Brought by you' })} value={byo} onChange={setByo} suffix="%" max="100"
          note={byoNote(base, tr)} />
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 40, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{bsBizMoney(e.netCents)}</div>
          <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:business.earn.netMonth', { defaultValue: 'net a month' })}</div>
        </div>
        <div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{bsBizMoney(e.yearNetCents)}</div>
          <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:business.earn.year', { defaultValue: 'a year' })}</div>
        </div>
      </div>
      <Note t={t} style={{ marginTop: 8 }}>{tr('coach:business.billedFee', { defaultValue: '{billed} billed · {fee} Shape fee', billed: bsBizMoney(e.grossCents), fee: bsBizMoney(e.feeCents) })}</Note>
      {/* Card processing is the coach's (direct charges, #2403), so the net above is before it. Its
          cost is an ESTIMATE from Stripe's published US prices (CoachForecast.processingCents),
          labelled as one and kept out of the net: the coach's own Stripe pricing decides it. */}
      {e.grossCents > 0 ? (
        <Note t={t} style={{ marginTop: 4 }}>
          <span data-biz-processing="">{tr('coach:business.earn.processing', { defaultValue: 'About {processing} card processing · about {after} a month after it', processing: bsBizMoney(e.processingCents), after: bsBizMoney(e.afterProcessingCents) })}</span>
          <span style={{ display: 'block', marginTop: 3, opacity: 0.8 }}>{tr('coach:business.earn.processingBasis', { defaultValue: "Estimate: Stripe's US card rate, 2.9% + 30¢ a charge, and 0.7% Stripe Billing on subscriptions. Your own Stripe pricing decides the real figure." })}</span>
        </Note>
      ) : null}
    </div>
  );
}

function Slider({ t, label, value, shown, was, min, max, step, onChange, note }) {
  const tr = useShapeTr();
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{label}</span>
        <span style={{ fontFamily: t.MONO, fontSize: 14, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {shown}{was != null ? <span style={{ fontSize: 10.5, color: t.INK50 }}>{' · ' + tr('coach:business.plan.was', { defaultValue: 'was {value}', value: was })}</span> : null}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: teal(t) }} />
      {note ? <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, lineHeight: 1.4 }}>{note}</span> : null}
    </label>
  );
}

// The plan over 24 months on one axis: today's pace (dashed, once a slider moved), the plan, the goal.
function PathsChart({ t, paths, goalCents }) {
  const tr = useShapeTr();
  const W = 340, H = 170, padL = 44, padR = 30, padT = 10, padB = 20, months = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  let max = goalCents || 0;
  for (const p of paths) for (const r of p.f.rows) if (r.m <= months) max = Math.max(max, r.netCents);
  const step = Math.max(1, Math.pow(10, Math.floor(Math.log10(Math.max(1, max / 100)))) * 100);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [0, top / 2, top];
  const x = (m) => padL + (m / months) * plotW;
  const y = (v) => padT + plotH - (Math.max(0, v) / top) * plotH;
  const green = t.GREEN || '#3f9a5c';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', height: 'auto', overflow: 'visible' }} role="img"
      aria-label={tr('coach:business.plan.chartAria', { defaultValue: 'Net a month over the next 24 months: {amount} in 12 months', amount: bsBizMoney(paths[paths.length - 1].f.rows[12].netCents) })}>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={t.HAIR} strokeWidth="1" />
          <text x={padL - 5} y={y(v) + 3} textAnchor="end" fill={t.INK50} fontFamily={t.MONO} fontSize="8.5">{bsBizMoney(v)}</text>
        </g>
      ))}
      {[0, 12, 24].map((m) => (
        <text key={m} x={x(m)} y={H - 4} textAnchor="middle" fill={t.INK50} fontFamily={t.MONO} fontSize="8.5">
          {m === 0 ? tr('coach:business.plan.axisNow', { defaultValue: 'now' }) : tr('coach:business.plan.axisMonths', { defaultValue: '{months} mo', months: m })}
        </text>
      ))}
      {goalCents > 0 ? (
        <g>
          <line x1={padL} x2={W - padR} y1={y(goalCents)} y2={y(goalCents)} stroke={green} strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={W - padR + 4} y={y(goalCents) + 3} fill={green} fontFamily={t.MONO} fontSize="8.5">{tr('coach:business.plan.axisGoal', { defaultValue: 'goal' })}</text>
        </g>
      ) : null}
      {paths.map((p) => (
        <polyline key={p.key} fill="none" stroke={p.color} strokeWidth={p.width} strokeDasharray={p.dash ? '4 3' : undefined} strokeLinejoin="round" strokeLinecap="round"
          points={p.f.rows.filter((r) => r.m <= months).map((r) => x(r.m).toFixed(1) + ',' + y(r.netCents).toFixed(1)).join(' ')} />
      ))}
    </svg>
  );
}

// "Plan the next 12 months" (the website's DbzPlanZone, as one column with the sentence first).
export function BSBizPlan({ t, base }) {
  const tr = useShapeTr();
  const F = CF();
  const known = base.pace.adds != null;
  // coachForecast.js `planStart`: today's pace rounded to the sliders, churn to a tenth (bsBizChurnPct).
  const start = React.useMemo(() => F.planStart(base), [base]);
  const [adds, setAdds] = React.useState(start.adds);
  const [churnPct, setChurnPct] = React.useState(start.churnPct);
  const [rate, setRate] = React.useState(start.rate);
  const [goal, setGoal] = React.useState(start.goal);
  const reset = () => { setAdds(start.adds); setChurnPct(start.churnPct); setRate(start.rate); setGoal(start.goal); };
  const touched = adds !== start.adds || churnPct !== start.churnPct || rate !== start.rate;
  const run = (o) => F.forecast({ clients: base.clients, mrrNetCents: base.mrrNetCents, byoShare: base.byoShare, months: 36, priceCents: Math.round(o.rate * 100), adds: o.adds, churn: o.churnPct / 100 });
  // The rate slider holds the starting rate exactly, to the cent (coachForecast.js `rateRange`,
  // shared with the website's planner).
  const rateRange = F.rateRange(start.rate);
  // ⚠ THE RATE SAYS WHERE IT CAME FROM, AS THE ADDS AND CHURN DO (the sweep after #2394 round 10).
  // A default ($150: no listing price and no clients) or the clients' average started the plan's
  // sentence with nothing on the Plan saying so: the note only ever said today's clients keep the
  // price they joined at. Now it names the source "What clients earn you" names, and keeps that
  // point, briefly.
  const rateNote = tr('coach:business.plan.rateNoteFrom', { defaultValue: "{from} · today's clients keep their price", from: rateFromNote(base, tr) });
  const goalCents = goal * 100;
  const c = teal(t);
  // Until a slider moves, the plan IS today's pace: one line. Once one moves, today's pace stays
  // behind as the dashed line to compare against.
  const compare = known && touched;
  const todayF = compare ? run(start) : null;
  const planF = run({ adds, churnPct, rate });
  const paths = [
    todayF ? { key: 'today', color: t.INK50, width: 2, dash: true, f: todayF } : null,
    { key: 'plan', color: c, width: 3, f: planF },
  ].filter(Boolean);
  const planReach = F.monthsTo(goalCents, planF);
  const todayReach = todayF ? F.monthsTo(goalCents, todayF) : null;
  const goalMoney = bsBizMoney(goalCents);

  // The sentences say what the chart shows, in words (owner: "easy to use and read/understand").
  const lines = [tr('coach:business.plan.lead', { defaultValue: 'You have {count, plural, one {# client} other {# clients}} and net {net} a month.', count: base.clients, net: bsBizMoney(base.mrrNetCents) })];
  if (todayF) lines.push(tr('coach:business.plan.yearBoth', { defaultValue: "At today's pace that becomes {today} a month in a year. With your plan it's {plan}.", today: bsBizMoney(todayF.rows[12].netCents), plan: bsBizMoney(planF.rows[12].netCents) }));
  else if (known) lines.push(tr('coach:business.plan.yearPace', { defaultValue: "At today's pace that becomes {amount} a month in a year.", amount: bsBizMoney(planF.rows[12].netCents) }));
  else lines.push(tr('coach:business.plan.yearPlan', { defaultValue: 'With your plan that becomes {amount} a month in a year.', amount: bsBizMoney(planF.rows[12].netCents) }));
  if (base.mrrNetCents >= goalCents) lines.push(tr('coach:business.plan.goalPast', { defaultValue: "You're already past your {goal} goal.", goal: goalMoney }));
  else if (planReach == null) {
    // A plan that misses the goal for three years either levels off below it, which is why it
    // misses, or is still climbing past it and gets there later; the sentence says which.
    const steady = planF.steadyNetCents;
    lines.push(steady == null
      ? tr('coach:business.plan.goalNever', { defaultValue: "That doesn't reach your {goal} goal within three years.", goal: goalMoney })
      : steady < goalCents
        ? tr('coach:business.plan.goalNeverSteady', { defaultValue: "That doesn't reach your {goal} goal within three years: it levels off near {steady} a month.", goal: goalMoney, steady: bsBizMoney(steady) })
        : tr('coach:business.plan.goalNeverClimbing', { defaultValue: "That doesn't reach your {goal} goal within three years, but it's still climbing, toward {steady} a month.", goal: goalMoney, steady: bsBizMoney(steady) }));
  } else if (todayF && todayReach === planReach) {
    lines.push(tr('coach:business.plan.goalSame', { defaultValue: "You reach your {goal} goal in {months, plural, one {# month} other {# months}}, the same month as at today's pace.", goal: goalMoney, months: planReach }));
  } else if (todayF && todayReach != null) {
    lines.push(tr('coach:business.plan.goalInstead', { defaultValue: 'You reach your {goal} goal in {months, plural, one {# month} other {# months}}, instead of {today, plural, one {# month} other {# months}}.', goal: goalMoney, months: planReach, today: todayReach }));
  } else if (todayF) {
    lines.push(tr('coach:business.plan.goalTodayNever', { defaultValue: "You reach your {goal} goal in {months, plural, one {# month} other {# months}}. Today's pace doesn't, within three years.", goal: goalMoney, months: planReach }));
  } else {
    lines.push(tr('coach:business.plan.goalIn', { defaultValue: 'You reach your {goal} goal in {months, plural, one {# month} other {# months}}.', goal: goalMoney, months: planReach }));
  }
  const when = base.pace.fromFirst ? tr('coach:business.since', { defaultValue: 'after your first week' }) : tr('coach:business.window', { defaultValue: 'over the last 3 months' });
  // An unread history (the trajectory read failed) is not an empty one.
  const noHistory = base.pace.unread
    ? tr('coach:business.plan.noHistoryUnread', { defaultValue: "couldn't read your history just now · set your own" })
    : tr('coach:business.plan.noHistory', { defaultValue: 'no history yet · set your own' });

  return (
    <div>
      <Sentence t={t}>{lines.join(' ')}</Sentence>
      <div style={{ marginTop: 14 }}><PathsChart t={t} paths={paths} goalCents={goalCents} /></div>
      <div style={{ marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: t.INK50 }}>
        <span><span aria-hidden="true" style={{ display: 'inline-block', width: 14, height: 3, background: c, borderRadius: 1, verticalAlign: 2, marginRight: 6 }} />{known && !touched ? tr('coach:business.plan.legendPace', { defaultValue: "Today's pace" }) : tr('coach:business.plan.legendPlan', { defaultValue: 'Your plan' })}</span>
        {todayF ? <span><span aria-hidden="true" style={{ display: 'inline-block', width: 14, borderTop: `2px dashed ${t.INK50}`, verticalAlign: 3, marginRight: 6 }} />{tr('coach:business.plan.legendPace', { defaultValue: "Today's pace" })}</span> : null}
      </div>
      <div style={{ marginTop: 18, display: 'grid', gap: 16 }}>
        <Slider t={t} label={tr('coach:business.plan.adds', { defaultValue: 'New clients a month' })} value={adds} shown={addsNum(adds)} was={adds !== start.adds ? addsNum(start.adds) : null}
          min={0} max={Math.max(10, Math.ceil(start.adds * 3))} step={0.1} onChange={(v) => setAdds(F.round1(v))}
          note={known ? tr('coach:business.plan.yoursAdds', { defaultValue: 'yours: {value} {when}', value: addsNum(start.adds), when }) : noHistory} />
        <Slider t={t} label={tr('coach:business.plan.churn', { defaultValue: 'Monthly churn' })} value={churnPct} shown={pctText(tr, churnPct)} was={churnPct !== start.churnPct ? pctText(tr, start.churnPct) : null}
          min={0} max={Math.max(30, Math.ceil(start.churnPct))} step={0.1} onChange={(v) => setChurnPct(F.round1(v))}
          note={base.pace.churn != null ? tr('coach:business.plan.yoursChurn', { defaultValue: 'yours: {value}% leave a month, {when}', value: pctNum(start.churnPct), when }) : noHistory} />
        <Slider t={t} label={tr('coach:business.plan.rate', { defaultValue: 'Rate for new clients' })} value={rate} shown={rateText(rate)} was={rate !== start.rate ? rateText(start.rate) : null}
          min={rateRange.min} max={rateRange.max} step={rateRange.step} onChange={setRate}
          note={rateNote} />
        <Slider t={t} label={tr('coach:business.plan.goal', { defaultValue: 'Goal · net a month' })} value={goal} shown={goalMoney}
          min={500} max={Math.max(20000, start.goal * 3)} step={250} onChange={setGoal}
          note={tr('coach:business.plan.goalNote', { defaultValue: 'the green dashed line' })} />
      </div>
      {touched || goal !== start.goal ? (
        <button type="button" onClick={reset} style={{ marginTop: 14, background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: c, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>
          {tr('coach:business.plan.reset', { defaultValue: '↺ Back to my numbers' })}
        </button>
      ) : null}
      <Note t={t} style={{ marginTop: 12 }}>
        {tr('coach:business.plan.note', { defaultValue: "A projection from your own numbers, not a promise. Today's clients keep the price they pay now; new clients join at the rate above, after Shape's fee on those who find you here." })}
        {planF.steadyClients != null ? ' ' + tr('coach:business.plan.steady', { defaultValue: 'At this pace it levels off near {count, plural, one {# client} other {# clients}}, where each new one replaces one who leaves.', count: Math.round(planF.steadyClients) }) : null}
      </Note>
    </div>
  );
}

function PlanTab({ t, biz, now }) {
  const tr = useShapeTr();
  const base = bsBizPlanBase(biz, now);
  const body = (fn) => (base.state === 'ready' ? fn() : (
    <Note t={t}>{base.state === 'loading' ? tr('coach:business.loading', { defaultValue: 'Reading your numbers…' }) : tr('coach:business.unreadSubs', { defaultValue: "Couldn't read your subscriptions just now. Nothing is lost; try again in a moment." })}</Note>
  ));
  return (
    <div>
      <Head t={t} label={tr('coach:business.earn.head', { defaultValue: 'What clients earn you' })} right={tr('coach:business.earn.right', { defaultValue: "after Shape's fee · before card processing" })} />
      {body(() => <BSBizEarn t={t} base={base} />)}
      <Head t={t} label={tr('coach:business.plan.head', { defaultValue: 'Plan the next 12 months' })} />
      {body(() => <BSBizPlan t={t} base={base} />)}
    </div>
  );
}

// ── Clients ─────────────────────────────────────────────────────────────────
function ClientsTab({ t, biz, now }) {
  const tr = useShapeTr();
  const F = CF();
  const base = bsBizPlanBase(biz, now);
  const extra = biz.extra || {};
  const when = (pace) => (pace.fromFirst ? tr('coach:business.since', { defaultValue: 'after your first week' }) : tr('coach:business.window', { defaultValue: 'over the last 3 months' }));
  const loading = <Note t={t}>{tr('coach:business.loading', { defaultValue: 'Reading your numbers…' })}</Note>;
  const unread = <Note t={t}>{tr('coach:business.unreadSubs', { defaultValue: "Couldn't read your subscriptions just now. Nothing is lost; try again in a moment." })}</Note>;

  // Joined and left, over the pace's own window.
  let flow;
  if (base.state === 'loading') flow = loading;
  else if (base.state !== 'ready') flow = unread;
  // An unread history is not one under a month old: the coach may have years of clients.
  else if (base.pace.unread) flow = <Note t={t}>{tr('coach:business.clients.flowUnread', { defaultValue: "Couldn't read your subscription history just now, and who joined and left is counted from it. Nothing is lost; try again in a moment." })}</Note>;
  else if (base.pace.adds == null) flow = <Note t={t}>{tr('coach:business.clients.flowNone', { defaultValue: 'This fills in after a month with clients: who joined, who left, and how fast.' })}</Note>;
  else flow = <Sentence t={t}>{tr('coach:business.clients.flow', { defaultValue: '{added, plural, one {# client joined} other {# clients joined}} and {ended, plural, one {# left} other {# left}} {when}.', added: base.pace.added, ended: base.pace.ended, when: when(base.pace) })}</Sentence>;

  // What a client is worth: the average stay at the coach's churn, and the net over it.
  let worth;
  if (base.state === 'loading') worth = loading;
  else if (base.state !== 'ready') worth = unread;
  else {
    const perClient = base.clients > 0 ? base.mrrNetCents / base.clients : null;
    if (base.pace.unread) worth = <Note t={t}>{tr('coach:business.clients.worthUnread', { defaultValue: "Couldn't read your subscription history just now, and the average stay is measured from it. Nothing is lost; try again in a moment." })}</Note>;
    else if (base.pace.churn == null || perClient == null) worth = <Note t={t}>{tr('coach:business.clients.worthNone', { defaultValue: "This fills in after a month with clients: how long a client stays with you on average, and what that's worth." })}</Note>;
    else if (base.pace.churn === 0) worth = <Note t={t}>{tr('coach:business.clients.worthNoneLeft', { defaultValue: "No one has left {when}, so there isn't an average stay to measure yet.", when: when(base.pace) })}</Note>;
    else {
      const lt = F.lifetime({ netPerClientCents: perClient, churn: base.pace.churn });
      worth = (
        <div>
          <Sentence t={t}>{tr('coach:business.clients.worth', { defaultValue: 'A client stays about {months, plural, one {# month} other {# months}} on average, so each one is worth about {value} to you.', months: Math.round(lt.months), value: bsBizMoney(lt.valueCents) })}</Sentence>
          <Note t={t} style={{ marginTop: 6 }}>{tr('coach:business.clients.worthFrom', { defaultValue: 'From {pct}% of clients leaving a month {when}, and {net} net a client a month.', pct: pctNum(bsBizChurnPct(base.pace.churn)), when: when(base.pace), net: bsBizMoney(perClient) })}</Note>
        </div>
      );
    }
  }

  // The waiting list: Shape members, so they found the coach here and 15% comes off.
  // ⚠ ONLY THE LISTING PRICE VALUES THEM (the website's Codex round 7, #2394). base.rateCents falls
  // back to the clients' average or a default when the listing price is unread or unset, and was
  // printed as what these members would pay. The preview is valued at its sample rate.
  const n = biz.waiting;
  const waitRate = biz.kind === 'demo' ? (base.state === 'ready' ? base.rateCents : null) : F.listedCents(biz.listingMonthly);
  let wait;
  if (n === undefined) wait = loading;
  else if (n === null) wait = <Note t={t}>{tr('coach:business.clients.waitUnread', { defaultValue: "Couldn't read your waiting list just now." })}</Note>;
  else if (!n) wait = <Note t={t}>{tr('coach:business.clients.waitNone', { defaultValue: 'No one is waiting. When you mark your listing full, members can join a waiting list.' })}</Note>;
  else {
    const net = waitRate != null ? F.earn({ clients: n, priceCents: waitRate, byoShare: 0 }).netCents : null;
    // No price to value them at: say why, once the listing read has answered.
    const why = net != null || biz.kind !== 'live' || !biz.listingRead ? null
      : biz.listingFailed ? tr('coach:business.clients.waitPriceUnread', { defaultValue: "Couldn't read your listing price just now, so they aren't valued here." })
      : tr('coach:business.clients.waitPriceNone', { defaultValue: "Set a monthly price on your listing to see what they'd bring in." });
    wait = (
      <Sentence t={t}>
        {tr('coach:business.clients.wait', { defaultValue: '{count, plural, one {# person is} other {# people are}} waiting to join you.', count: n })}
        {net != null ? ' ' + tr('coach:business.clients.waitWorth', { defaultValue: "If they join at {rate} a month, that's about {net} a month to you.", rate: bsBizMoney(waitRate), net: bsBizMoney(net) }) : why ? ' ' + why : null}
      </Sentence>
    );
  }

  // Who left, over the pace's own window (the website's churn total has the same one).
  // ⚠ THE WINDOW IS THE PACE'S, IN THE PACE'S WORDS (the website's sweep after #2394 round 10). It was
  // the last 90 days while "What a client is worth" and "Joined and left" above read the pace's
  // window, so one tab could say a client left "over the last 3 months" beside "No one has left in
  // the last 90 days". coachForecast.js `churnWindow` opens the list where the pace opens, and falls
  // back to the last 90 days (and says so) only when there is no pace. The pace is the one the tab's
  // other zones read, at the visit's one moment.
  const churnPace = base.state === 'ready' ? base.pace : extra.trajectory ? F.paceFrom(extra.trajectory, now) : null;
  const churnWin = F.churnWindow(churnPace, now);
  // ⚠ THE LIST STOPS AT BS_BIZ_CHURN_LIST ROWS (the routes' .limit(12)). When every row it holds
  // is inside the window, more may have left than it shows, and a note says so (the website's
  // total reads "12 or more" and "at least" then).
  // ⚠ A NAME THE ROUTE DOESN'T HAVE IS SAID IN THE COACH'S LANGUAGE. The routes sent the English
  // "Former client" in every locale, for a client with no name on file and for a name that couldn't
  // be read alike; they send null now, with `nameUnread` true when the read failed.
  const leftName = (r) => r.name || (r.nameUnread
    ? tr('coach:business.clients.nameUnread', { defaultValue: "Name couldn't be read" })
    : tr('coach:business.clients.leftNoName', { defaultValue: 'Former client' }));
  let left;
  if (extra.churn === null) left = <Note t={t}>{tr('coach:business.clients.leftUnread', { defaultValue: "Couldn't read your cancellations just now." })}</Note>;
  else if (!Array.isArray(extra.churn)) left = loading;
  else {
    // ⚠ DEPARTURES, DECIDED AT THE CLOSE OF THE WEEK EACH PLAN ENDED IN (the website's Codex round 8 and
    // the sweep after round 10 and its review, #2394), as "Joined and left" above counts them: a client
    // who held another plan then hadn't left (departed false), one client's plans ended in one week are
    // one departure whose money adds, and a client who left in two weeks is listed twice
    // (coachForecast.js `departures`). null: the history each one is decided from was unread
    // (departed null), so no one is listed as gone.
    const gone = F.departures(extra.churn, { pace: churnPace, now, cap: BS_BIZ_CHURN_LIST });
    if (!gone) left = <Note t={t}>{tr('coach:business.clients.leftUnsure', { defaultValue: "Couldn't check who still has a plan with you just now, so no one is counted as gone." })}</Note>;
    else {
      const recent = gone.inWindow;
      const full = biz.kind === 'live' && gone.floor;
      const none = churnWin.paced
        ? tr('coach:business.clients.leftNoneWhen', { defaultValue: 'No one has left {when}.', when: when(churnWin) })
        : tr('coach:business.clients.leftNone', { defaultValue: 'No one has left in the last 90 days.' });
      const more = churnWin.paced
        ? tr('coach:business.clients.leftMoreWhen', { defaultValue: 'Only the latest {count} are shown; more may have left {when}.', count: BS_BIZ_CHURN_LIST, when: when(churnWin) })
        : tr('coach:business.clients.leftMore', { defaultValue: 'Only the latest {count} are shown; more may have left in these 90 days.', count: BS_BIZ_CHURN_LIST });
      left = !recent.length ? <Note t={t}>{none}</Note> : (
        <div>
          {recent.map((r, i) => (
            <Row key={i} t={t} label={leftName(r)} last={i === recent.length - 1} subColor={t.RUST}
              sub={tr('coach:business.clients.leftOn', { defaultValue: 'left {date}', date: bizDate(r.endedAt) })}
              value={r.priceCents != null ? tr('coach:business.clients.leftPrice', { defaultValue: '−{price}/mo', price: bsBizMoney(r.priceCents) }) : '—'} />
          ))}
          {full ? <Note t={t} style={{ marginTop: 8 }}>{more}</Note> : null}
        </div>
      );
    }
  }
  const leftHead = churnWin.paced
    ? tr('coach:business.clients.leftHeadWhen', { defaultValue: 'Left {when}', when: when(churnWin) })
    : tr('coach:business.clients.leftHead', { defaultValue: 'Left in the last 90 days' });

  return (
    <div>
      <Head t={t} label={tr('coach:business.clients.flowHead', { defaultValue: 'Joined and left' })} />
      {flow}
      <Head t={t} label={tr('coach:business.clients.worthHead', { defaultValue: 'What a client is worth' })} />
      {worth}
      <Head t={t} label={tr('coach:business.clients.waitHead', { defaultValue: 'Your waiting list' })} />
      {wait}
      <Head t={t} label={leftHead} />
      {left}
    </div>
  );
}

// ── The page ────────────────────────────────────────────────────────────────
export function BSCoachBusinessPage({ role = 'trainer', onBack, tab: initialTab = 'money' }) {
  const { useBS, BSPage, BSDetailHeader, BSFooter } = window;
  const t = useBS();
  const tr = useShapeTr();
  const [reload, setReload] = React.useState(0);
  const biz = useBSCoachBusiness(role, { renewals: true, reload });
  // ⚠ THE PACE IS READ AT ONE MOMENT PER VISIT (the website's planNow, Business sweep
  // 2026-10-18). Its rates are counts over the days to now, so read at each render they moved
  // with the clock: a late answer (the waiting list landing) or a language change re-read
  // "yours" from a later now, so an untouched plan could turn into a moved one, with a "was" and
  // a second line, and the Clients figures shifted under the coach. Try again reads afresh.
  const [readAt, setReadAt] = React.useState(() => Date.now());
  const [tab, setTab] = React.useState(BS_BIZ_TABS.includes(initialTab) ? initialTab : 'money');
  const accent = role === 'nutritionist' ? '#a07a2e' : (t.RUST || '#c0533b');
  const today = biz.kind === 'live' || biz.kind === 'demo' ? CF().todayFrom(biz.extra) : null;
  const labels = {
    money: tr('coach:business.tabMoney', { defaultValue: 'Money' }),
    plan: tr('coach:business.tabPlan', { defaultValue: 'Plan' }),
    clients: tr('coach:business.tabClients', { defaultValue: 'Clients' }),
  };

  let body;
  if (biz.kind === 'loading') body = <Note t={t} style={{ marginTop: 20 }}>{tr('coach:business.loading', { defaultValue: 'Reading your numbers…' })}</Note>;
  else if (biz.kind === 'error') {
    body = (
      <div style={{ marginTop: 20 }}>
        <Note t={t}>{tr('coach:business.error', { defaultValue: "Couldn't read your business figures just now. Nothing is lost." })}</Note>
        <Pill t={t} onClick={() => { setReadAt(Date.now()); setReload((n) => n + 1); }}>{tr('coach:business.retry', { defaultValue: 'Try again' })}</Pill>
      </div>
    );
  } else if (biz.kind === 'none') body = <Note t={t} style={{ marginTop: 20 }}>{tr('coach:business.none', { defaultValue: 'Business fills in once your coach application is approved and your listing is set up.' })}</Note>;
  else {
    body = (
      <div>
        <div role="tablist" style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: `1px solid ${t.RULE}`, borderRadius: 999, padding: 3, gap: 3 }}>
          {BS_BIZ_TABS.map((k) => {
            const on = k === tab;
            return (
              <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)}
                style={{ border: 0, borderRadius: 999, padding: '9px 6px', cursor: 'pointer', background: on ? teal(t) : 'transparent', color: on ? (t.isLight ? '#fff' : '#06231f') : t.INK70 || t.INK50, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {labels[k]}
              </button>
            );
          })}
        </div>
        {tab === 'money' ? <MoneyTab t={t} biz={biz} role={role} /> : tab === 'plan' ? <PlanTab t={t} biz={biz} now={readAt} /> : <ClientsTab t={t} biz={biz} now={readAt} />}
      </div>
    );
  }

  return (
    <BSPage>
      <BSDetailHeader onBack={onBack} kicker={tr('coach:business.kicker', { defaultValue: 'Your practice' })} title={tr('coach:business.title', { defaultValue: 'Business.' })} />
      <div style={{ padding: `0 ${t.padX}px 24px` }}>
        {today ? (
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.04em', color: accent }}>
            {tr('coach:business.todayLine', { defaultValue: '{count, plural, one {# client} other {# clients}} · {net} net a month', count: today.clients, net: bsBizMoney(today.mrrNetCents) })}
          </div>
        ) : null}
        {biz.kind === 'demo' ? <Note t={t} style={{ marginTop: 10 }}>{tr('coach:business.preview', { defaultValue: 'A preview with sample numbers. Sign in as a coach to see yours.' })}</Note> : null}
        {body}
      </div>
      <BSFooter left={tr('coach:business.footer', { defaultValue: 'Business' })} right={labels[tab]} />
    </BSPage>
  );
}

// ── The Me card ─────────────────────────────────────────────────────────────
// Net a month, today's clients and the last 13 weeks, from the same rollup (no renewals: the
// card costs no Stripe reads). Taps through to Business. The eye collapses it to a slim control
// so the money is not on screen; the choice is remembered on this device (the key the old Me
// page's "This month" box used, so a coach who hid that finds this hidden too).
const HIDE_KEY = 'bs_pro_rev_hidden';
export function BSCoachBusinessCard({ role = 'trainer', accent, onOpen }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const [hidden, setHidden] = React.useState(() => { try { return window.localStorage.getItem(HIDE_KEY) === '1'; } catch (e) { return false; } });
  const toggle = () => setHidden((v) => { const nv = !v; try { window.localStorage.setItem(HIDE_KEY, nv ? '1' : '0'); } catch (e) {} return nv; });
  if (hidden) {
    return (
      <button type="button" onClick={toggle} aria-label={tr('coach:business.card.show', { defaultValue: 'Show your figures' })} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 14, border: `1px dashed ${t.RULE}`, background: 'transparent', padding: '14px 16px', cursor: 'pointer' }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:business.card.hidden', { defaultValue: 'Business · hidden' })}</span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, border: `1px solid ${accent}`, borderRadius: 999, padding: '5px 11px' }}>{tr('coach:business.card.showShort', { defaultValue: 'Show' })}</span>
      </button>
    );
  }
  return <BusinessCardBody t={t} role={role} accent={accent} onOpen={onOpen} onHide={toggle} />;
}
// The card's figures, mounted only while it is shown, so a hidden card reads nothing.
function BusinessCardBody({ t, role, accent, onOpen, onHide }) {
  const tr = useShapeTr();
  const biz = useBSCoachBusiness(role, { renewals: false });
  const today = biz.kind === 'live' || biz.kind === 'demo' ? CF().todayFrom(biz.extra) : null;
  const weeks = today && biz.extra && biz.extra.trajectory ? biz.extra.trajectory.weeks : null;
  let line;
  if (biz.kind === 'loading') line = tr('coach:business.loading', { defaultValue: 'Reading your numbers…' });
  else if (biz.kind === 'none') line = tr('coach:business.card.none', { defaultValue: 'Fills in once your listing is set up' });
  else if (!today) line = tr('coach:business.card.unread', { defaultValue: "Couldn't read your numbers. Tap to open Business." });
  else line = tr('coach:business.card.line', { defaultValue: '{count, plural, one {# client} other {# clients}} · payouts, renewals and your plan', count: today.clients });
  // A little smaller (owner, 2026-10-31: "make this a little smaller"): the figure 34px (was 42), the
  // weeks' bars 18px high (were 26) with less room around them, and the card's padding 12px top and
  // bottom (was 14). The eye keeps its 28px, and every line keeps its words.
  return (
    <div data-biz-card="" style={{ border: `1px solid ${accent}33`, borderRadius: 16, background: `linear-gradient(155deg, ${accent}14, ${t.PAPER2} 70%), ${t.PAPER2}`, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={onOpen} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent }}>
          {tr('coach:business.card.eyebrow', { defaultValue: 'Business ›' })}
        </button>
        {/* Owner, 2026-10-18: "the business card should be private, never public". It only ever
            renders on the coach's own Me tab; the marker says so, where an eye reading "Visible"
            looked like a public setting. The eye beside it hides the figures on this phone. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            <span>{tr('coach:business.card.private', { defaultValue: 'Private · only you' })}</span>
          </span>
          <button type="button" onClick={onHide} aria-label={tr('coach:business.card.hide', { defaultValue: 'Hide your figures' })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, border: `1px solid ${accent}`, background: `${accent}1c`, color: accent, padding: 0, cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></svg>
          </button>
        </div>
      </div>
      <button type="button" onClick={onOpen} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: t.INK }}>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span data-biz-figure="" style={{ fontFamily: t.DISPLAY, fontSize: 34, fontWeight: 600, lineHeight: 0.95, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{today ? bsBizMoney(today.mrrNetCents) : '—'}</span>
          <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:business.earn.netMonth', { defaultValue: 'net a month' })}</span>
        </div>
        <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: accent }}>{line}</div>
        {weeks && weeks.length ? <div data-biz-bars="" style={{ marginTop: 10 }}><BSBizNetBars t={t} weeks={weeks} height={18} labels={false} /></div> : null}
        {biz.kind === 'demo' ? <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:business.card.preview', { defaultValue: 'Sample numbers · sign in to see yours' })}</div> : null}
      </button>
    </div>
  );
}
