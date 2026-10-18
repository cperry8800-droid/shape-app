// Coach forecast — the math behind the Business page's Plan tab (owner, 2026-10-17:
// "forecast on business"; design E), on the website and in the app.
//
// PURE module: no React, no DOM, no fetch. Loads as a plain <script> in the browser
// (exposes window.CoachForecast), as a side-effect import in the app's bundle
// (mobile-app/src/broadsheet/BSCoachBusiness.jsx), and via require() in Node, so every
// figure the Plan tab prints is unit-tested (tests/coach-forecast.test.mjs).
//
// Money is in cents throughout and rounded only where it is printed.
//
// ⚠ SHAPE'S FEE IS 15% ON A CLIENT WHO FOUND THE COACH ON SHAPE AND 0% ON ONE THE COACH
// BROUGHT (src/lib/platform-fee.mjs; a guard pins FEE_RATE to PLATFORM_FEE_RATE). Card
// processing is Shape's, so nothing else comes off. Today's clients are never re-priced
// here: the route sends their net from each row's STORED fee, and this module only
// applies the rate to clients who have not joined yet.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CoachForecast = api;
})(typeof window !== "undefined" ? window : null, function () {
  const FEE_RATE = 0.15;
  const DAY_MS = 86400000;
  const MONTH_DAYS = 30.4;
  // How far back the pace is read (about three months), and the least history that
  // counts as a pace at all.
  const PACE_DAYS = 91;
  const PACE_MIN_DAYS = 30;

  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // What one client at `priceCents` a month nets the coach, for a mix where `byoShare`
  // of clients were brought by the coach (0% fee) and the rest found them on Shape.
  function netOf(priceCents, byoShare) {
    const p = Math.max(0, num(priceCents) || 0);
    return p * (1 - (1 - clamp01(num(byoShare) || 0)) * FEE_RATE);
  }

  // "What clients earn you": n clients at one rate, a month and a year.
  function earn({ clients, priceCents, byoShare }) {
    const n = Math.max(0, num(clients) || 0);
    const gross = n * Math.max(0, num(priceCents) || 0);
    const net = n * netOf(priceCents, byoShare);
    return { grossCents: Math.round(gross), netCents: Math.round(net), feeCents: Math.round(gross) - Math.round(net), yearNetCents: Math.round(net * 12) };
  }

  // The next `months` months, one row a month. Row 0 is today.
  //   clients, mrrNetCents — today's practice, at the prices each client pays now
  //   priceCents, byoShare — what a NEW client pays, and the share the coach brings
  //   adds — new clients a month; churn — the share of clients who leave each month
  // Today's clients fade by churn at their own net; new clients join at the new rate
  // and fade by the same churn.
  function forecast({ clients, mrrNetCents, priceCents, byoShare, adds, churn, months = 36 }) {
    const c = clamp01(num(churn) || 0);
    const a = Math.max(0, num(adds) || 0);
    const perNew = netOf(priceCents, byoShare);
    let have = Math.max(0, num(clients) || 0);
    let haveNet = Math.max(0, num(mrrNetCents) || 0);
    let fresh = 0;
    const rows = [{ m: 0, clients: have, netCents: haveNet }];
    for (let m = 1; m <= months; m++) {
      have *= 1 - c; haveNet *= 1 - c;
      fresh = fresh * (1 - c) + a;
      rows.push({ m, clients: have + fresh, netCents: haveNet + fresh * perNew });
    }
    // Where it levels off: past this many clients, each new one only replaces one who
    // leaves. None when nobody leaves (the line keeps climbing).
    const steadyClients = c > 0 ? a / c : null;
    return { rows, perNewCents: perNew, steadyClients, steadyNetCents: steadyClients == null ? null : steadyClients * perNew };
  }

  // The net earned over months 1..n (each month's net a month).
  function earnedOver(f, n = 12) {
    let s = 0;
    for (const r of f.rows) if (r.m >= 1 && r.m <= n) s += r.netCents;
    return s;
  }

  // The first month the net a month reaches the goal: 0 when it already has, null when
  // it does not inside the forecast.
  function monthsTo(goalCents, f) {
    const g = num(goalCents);
    if (g == null || g <= 0) return null;
    const r = f.rows.find((x) => x.netCents >= g - 0.5);
    return r ? r.m : null;
  }

  function mondayOf(ms) {
    const d = new Date(ms);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.getTime();
  }

  // The coach's own pace from the trajectory's weekly buckets (src/lib/coach-trajectory.mjs):
  // new clients a month and the share who leave a month, over about the last three months,
  // or after the practice's first week when that is shorter.
  //   → { adds, churn, days, from, fromFirst, added, ended, avgActive }; adds and churn are null
  //     when there is too little history to say. `days` is the span the rates are taken over, and
  //     `from` where it opens (ms; null with no history), so a page that counts departures over the
  //     same days can open its count there (churnWindow).
  // ⚠ CHURN IS MEASURED AGAINST THE CLIENTS WHO COULD HAVE LEFT, the average headcount over
  // the window, not against the count 30 days ago. One departure in a month with no one at
  // the start would otherwise read as 100%, or as nothing at all.
  // ⚠ THE RATES ARE TAKEN OVER THE DAYS THE COUNTS COVER. The buckets are weeks, so the window
  // opens on a Monday and the counts are divided by the span from there to now.
  // ⚠ THE FIRST WEEK IS THE OPENING ROSTER, NOT A PACE. A coach who brings their clients over
  // brings them all at once: 12 in the first week and 1 since read as 11 new clients a month.
  // So when the first client's week falls inside the window, the window opens the Monday after
  // it, and a month must pass from there before there is a pace (Codex, #2394: a month counted
  // from the Monday before the first client let 27 days pass as one).
  // ⚠ NO FIRST CLIENT IS NO PACE. A practice with no clients yet has no history, which the
  // sliders say; read as three empty months it was "0 a month over the last 3 months".
  function paceFrom(trajectory, now = Date.now()) {
    const none = { adds: null, churn: null, days: 0, from: null, fromFirst: false, added: 0, ended: 0, avgActive: 0 };
    const weeks = trajectory && Array.isArray(trajectory.weeks) ? trajectory.weeks : [];
    if (!weeks.length) return none;
    const first = trajectory.firstSubAt ? new Date(trajectory.firstSubAt).getTime() : NaN;
    if (!Number.isFinite(first)) return none;
    const windowMonday = mondayOf(now - PACE_DAYS * DAY_MS);
    const openingMonday = mondayOf(first);
    const fromFirst = openingMonday >= windowMonday;
    const from = fromFirst ? openingMonday + 7 * DAY_MS : windowMonday;
    const inWindow = weeks.filter((w) => new Date(w.weekOf + "T00:00:00Z").getTime() >= from);
    const histDays = (now - from) / DAY_MS;
    const days = Math.max(0, Math.round(histDays));
    if (!inWindow.length || histDays < PACE_MIN_DAYS) return { ...none, days, from, fromFirst };
    const months = histDays / MONTH_DAYS;
    const added = inWindow.reduce((s, w) => s + (w.added || 0), 0);
    const ended = inWindow.reduce((s, w) => s + (w.ended || 0), 0);
    const avgActive = inWindow.reduce((s, w) => s + (w.active || 0), 0) / inWindow.length;
    return {
      adds: added / months,
      churn: avgActive > 0 ? clamp01(ended / avgActive / months) : null,
      days, from, fromFirst, added, ended, avgActive,
    };
  }

  // ── Who left: the churn list both Business pages print (the routes' `churn` rows) ──
  // How many cancellations the analytics routes send, newest first (their `.limit(12)`), and the
  // window a count falls back to when there is no pace to share.
  const CHURN_LIST = 12;
  const CHURN_DAYS = 90;

  // ⚠ WHO LEFT IS COUNTED OVER THE PACE'S OWN WINDOW, IN THE PACE'S OWN WORDS (the sweep after #2394
  // round 10). "What a client is worth" reads its churn from paceFrom, from the Monday on or before
  // 91 days ago (or the Monday after the first client's week), "over the last 3 months"; the churn
  // list counted from exactly 90 days ago, "in the last 90 days". One tab could then say "1.6% leave
  // a month" beside "None left": a departure on day 92 was in one and not the other. The list now
  // opens where the pace opens whenever the pace has a window (its rates are measured); with no pace
  // (no history, an unread one, under a month of it) it falls back to the last 90 days and says so.
  //   → { from (ms), paced, fromFirst }: paced is true when the window is the pace's, so the page
  //     words it as the pace does ("over the last 3 months" / "after your first week").
  function churnWindow(pace, now = Date.now()) {
    if (pace && pace.adds != null && num(pace.from) != null) return { from: pace.from, paced: true, fromFirst: !!pace.fromFirst };
    return { from: now - CHURN_DAYS * DAY_MS, paced: false, fromFirst: false };
  }

  // The departures in the routes' churn rows, and the ones inside the window.
  //   → null when a row's departure could not be told (`departed` null: the route could not read
  //     the subscription history it is decided from), so no one is counted as gone;
  //   → { list, inWindow, count, lostCents, floor, window } otherwise. `list` is every departure the
  //     rows hold, newest first; `count` and `lostCents` are the ones inside the window.
  // ⚠ A DEPARTURE IS ONE CLIENT LEAVING AT ONE MOMENT, AND ITS MONEY IS EVERY PLAN THAT ENDED THEN (the
  // sweep after #2394 round 10). The count was of people while the money added every row: a client who
  // left in August, came back and left again in October was "1 left" beside both plans' money. The
  // route now decides each row at the moment it ended (`departed`), so the count is of departures:
  // plans one client ended at the same moment are one departure whose prices add, and two separate
  // departures of one client count twice, each with its own money, as the pace's ended count does.
  // A row the route marks `departed: false` (the client held another plan then) is not one. A row with
  // no client id stands alone, as everywhere else that counts clients.
  // ⚠ AND THE LIST STOPS AT `cap` ROWS (the routes' .limit(12)). When every row it holds is inside the
  // window, more may have left than it shows: `floor` says the count is a floor. It is about the
  // route's list, before any row is left out.
  function departures(rows, { pace = null, now = Date.now(), cap = CHURN_LIST } = {}) {
    const all = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (all.some((r) => r.departed === null)) return null;
    const win = churnWindow(pace, now);
    const at = (r) => (r.endedAt ? new Date(r.endedAt).getTime() : NaN);
    const list = [];
    const byMoment = new Map();
    all.forEach((r, i) => {
      if (r.departed === false) return;
      const t = at(r);
      const key = (r.clientId != null ? "c:" + r.clientId : "row:" + i) + "@" + (Number.isFinite(t) ? t : "row:" + i);
      const d = byMoment.get(key);
      if (!d) {
        const first = { name: r.name, clientId: r.clientId == null ? null : r.clientId, startedAt: r.startedAt || null, endedAt: r.endedAt || null, priceCents: r.priceCents == null ? null : Number(r.priceCents) || 0, reason: r.reason || null, plans: 1 };
        byMoment.set(key, first);
        list.push(first);
        return;
      }
      d.plans += 1;
      if (r.priceCents != null) d.priceCents = (d.priceCents || 0) + (Number(r.priceCents) || 0);
      if (r.startedAt && (!d.startedAt || new Date(r.startedAt).getTime() < new Date(d.startedAt).getTime())) d.startedAt = r.startedAt;
      if (!d.reason && r.reason) d.reason = r.reason;
    });
    const inWindow = list.filter((d) => d.endedAt && at(d) >= win.from);
    return {
      list, inWindow,
      count: inWindow.length,
      lostCents: inWindow.reduce((s, d) => s + (d.priceCents || 0), 0),
      floor: all.length >= cap && all.every((r) => r.endedAt && at(r) >= win.from),
      window: win,
    };
  }

  // What a client is worth: the average stay at this churn, and the net over it.
  function lifetime({ netPerClientCents, churn }) {
    const c = num(churn);
    const v = num(netPerClientCents);
    if (c == null || c <= 0 || v == null) return null;
    return { months: 1 / c, valueCents: v / c };
  }

  // ── The figures the website's Business page and the app's both print ──
  // (the app's Business page, owner 2026-10-17: "match what is on website"). Numbers only;
  // each page words them in its own copy.

  // The rate a plan starts from when there is no listing price and no clients to average.
  const DEFAULT_RATE_CENTS = 15000;
  const DEFAULT_ADDS = 1;
  const DEFAULT_CHURN_PCT = 5;
  const round1 = (v) => Math.round(v * 10) / 10;
  // A churn rate (a share a month) as the percentage a page prints and a planner starts from.
  // ⚠ A MEASURED CHURN IS KEPT TO A TENTH OF A POINT, AND NEVER ROUNDS TO 0. Whole points turned
  // one departure from 70 clients in three months (0.45% a month) into "0% leave a month" beside
  // "a client stays about 223 months": the plan lost its attrition and the two figures disagreed.
  const churnPct = (churn) => (churn > 0 ? Math.max(0.1, round1(churn * 100)) : 0);

  // Today's clients and net, from the analytics route's payload: the trajectory's latest week,
  // else its `metrics`. null when neither could be read.
  // ⚠ THE ROUTE'S OWN `metrics` LEAVE OUT A CLIENT WHOSE PAYMENT IS RETRYING (past_due), while the
  // trajectory counts them, as membership does: they still have access and have not left. Read
  // from `metrics`, the Plan said "12 clients" on the page whose Overview said 13 (Business review,
  // 2026-10-17). `metrics` stands in only when the trajectory could not be read.
  function todayFrom(extra) {
    const weeks = extra && extra.trajectory && Array.isArray(extra.trajectory.weeks) ? extra.trajectory.weeks : null;
    const last = weeks && weeks.length ? weeks[weeks.length - 1] : null;
    if (last) return { clients: last.active, mrrNetCents: last.mrrNetCents, mrrGrossCents: last.mrrGrossCents };
    const m = (extra && extra.metrics) || {};
    return m.activeClients == null || m.mrrNetCents == null ? null : { clients: m.activeClients, mrrNetCents: m.mrrNetCents, mrrGrossCents: m.mrrGrossCents };
  }

  // Where a plan starts, from the analytics payload and the coach's listing price (dollars, as
  // /api/coach/listing sends it): today's figures, the rate a new client pays and where it came
  // from ('listing' | 'average' | 'default'), the share of clients the coach brought (the route's
  // byoMix), and the pace. null when today's figures could not be read.
  // ⚠ AN UNREAD INPUT IS SAID AS UNREAD, NEVER AS A MEASUREMENT (Business sweep, #2394). Each one
  // still starts the plan at a stated fallback, and says why:
  //   listingUnread  the listing read failed (`listingFailed`), so the rate is not "no listing
  //                  price yet" but a fallback from an unread price
  //   broughtUnread  byoMix is null (a failed read), so the brought share starts at 0% as a
  //                  default, not as a measured none
  //   pace.unread    the trajectory read failed, so there is no pace and an unread history, not
  //                  an empty one
  // The listing's monthly price in cents, or null when there is none. The waiting list is valued
  // at this alone: the Plan's rate falls back to the clients' average or a default, which is where
  // a slider starts, not what a waiting member would pay (Codex round 7 on #2394).
  function listedCents(listingMonthly) {
    return listingMonthly != null && Number(listingMonthly) > 0 ? Math.round(Number(listingMonthly) * 100) : null;
  }

  function planNumbers({ extra, listingMonthly, listingFailed = false, now = Date.now() }) {
    const m = todayFrom(extra);
    if (!m) return null;
    // ⚠ THE BROUGHT-IN SHARE IS PER CLIENT, NOT PER SUBSCRIPTION ROW (Codex round 5 on #2394). Both
    // analytics routes send byoMix, { clients, brought } counted per client (byoMixOf in
    // src/lib/origin-attribution.ts: one client on two plans is one client). byOrigin has a row per
    // subscription, so counting it read one brought client with two plans beside one from Shape as
    // "2 of your 3" (67%), and the calculators seeded from it overstated take-home.
    const mix = (extra && extra.byoMix) || null;
    const listed = listedCents(listingMonthly);
    const avg = m.clients > 0 && m.mrrGrossCents > 0 ? Math.round(m.mrrGrossCents / m.clients / 500) * 500 : null;
    return {
      clients: m.clients, mrrNetCents: m.mrrNetCents, mrrGrossCents: m.mrrGrossCents,
      rateCents: listed != null ? listed : avg != null ? avg : DEFAULT_RATE_CENTS,
      rateFrom: listed != null ? "listing" : avg != null ? "average" : "default",
      listingUnread: listed == null && !!listingFailed,
      // brought of byoClients: the mix's own count of clients. The routes take it over today's
      // clients by the trajectory's rule (byoMixToday in src/lib/origin-attribution.ts, the sweep
      // after #2394 round 10), so it is the `clients` above whenever the trajectory was read, and
      // both fall back to the active read together when it was not.
      byoShare: mix && mix.clients ? mix.brought / mix.clients : 0,
      brought: mix ? mix.brought : 0, byoClients: mix ? mix.clients : 0,
      broughtUnread: !mix,
      // A failed trajectory read is "no pace", which the sliders say, not a pace of zero; and it is
      // an unread history, not an empty one, which they say too.
      pace: extra && extra.trajectory ? paceFrom(extra.trajectory, now) : { adds: null, churn: null, days: 0, fromFirst: false, unread: true },
    };
  }

  // The planner's starting values, rounded to what its sliders hold, so an untouched plan IS
  // today's pace rather than a near-copy of it. Never clamped to the sliders' usual range: the
  // ranges stretch to the coach's own numbers instead, so "yours" is the figure it measured.
  //   → { adds, churnPct (to a tenth, never 0 for a measured churn: churnPct above), rate (the
  //       base's rate in dollars, to the cent: rateRange below holds it), goal (whole dollars) }
  // ⚠ THE RATE IS THE BASE'S OWN, NEVER ROUNDED TO $5 (the sweep after #2394 round 10). Rounded, a
  // $149 listing price started the plan at $150 beside "What clients earn you"'s "$149 · your
  // listing price", and every row, the year's net and the goal month were figured at a price the
  // coach does not charge, with nothing saying so. Only the coach's own drag changes it.
  function planStart(base) {
    const pace = (base && base.pace) || {};
    return {
      adds: pace.adds != null ? round1(pace.adds) : DEFAULT_ADDS,
      churnPct: pace.churn != null ? churnPct(pace.churn) : DEFAULT_CHURN_PCT,
      rate: base.rateCents > 0 ? base.rateCents / 100 : 5,
      goal: Math.max(1000, Math.ceil(((base.mrrNetCents || 0) / 100) * 1.5 / 500) * 500),
    };
  }

  // The rate slider's range, in dollars, around the plan's starting rate (planStart's `rate`), for
  // the website's planner and the app's alike.
  // ⚠ THE SLIDER HOLDS THE STARTING RATE EXACTLY (the sweep after #2394 round 10). A range input
  // snaps its value to its low end plus a whole number of steps, and this one ran from $20 in $5
  // steps: a $149 listing price could not sit on it, and a drag never came back to it. The step is a
  // dollar, and the low end sits a whole number of dollars below the rate, so $149.50 sits on it too
  // (a drag from it moves in whole dollars). The top is $500, or twice the rate when that is more.
  function rateRange(rate) {
    const cents = Math.max(0, Math.round((num(rate) || 0) * 100));
    const low = Math.min(2000, cents);
    const minCents = cents - Math.floor((cents - low) / 100) * 100;
    return { min: minCents / 100, max: Math.max(500, Math.ceil((cents * 2) / 100)), step: 1 };
  }

  // This week's renewals that will happen: only a row Stripe confirmed (`ending === false`) is
  // money coming in. null when there are no rows to sum, or none could be checked.
  // ⚠ NONE CHECKED IS NO TOTAL (Stripe down, or no key on a preview): a "0 clients · $0" total would
  // read as no renewals beside a list of them. The rows say "not checked"; the header says nothing.
  // All of them cancelled is a checked zero, and says so.
  // How many people the rows belong to: one client with two plans is one client (Codex round 8 on
  // #2394). A row with no client id stands alone, as everywhere else that counts clients.
  function people(rows) {
    return new Set((rows || []).map((r, i) => (r && r.clientId != null ? "c:" + r.clientId : "row:" + i))).size;
  }

  function renewalsSum(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    const sure = rows.filter((r) => r && r.ending === false);
    if (!sure.length && rows.some((r) => !r || r.ending == null)) return null;
    // People, not plans; each plan's net still counts.
    return { count: people(sure), netCents: sure.reduce((s, r) => s + (Number(r.netCents) || 0), 0) };
  }

  // "Your money", from the Stripe summary the analytics route sends (src/lib/stripe.ts loadStripe):
  // what is on its way to the bank (payouts in transit or pending) and the soonest of them to land,
  // what is ready to pay out, and what is still clearing. comingCents is the three together.
  function moneyFrom(stripe) {
    const s = stripe || {};
    const onWay = (Array.isArray(s.payouts) ? s.payouts : []).filter((p) => p && (p.status === "in_transit" || p.status === "pending"));
    const next = onWay.slice().sort((a, b) => (a.arrivalDate || Infinity) - (b.arrivalDate || Infinity))[0] || null;
    const onWayCents = onWay.reduce((t, p) => t + (p.amountCents || 0), 0);
    const balanceCents = s.balanceCents != null ? s.balanceCents : null;
    const pendingCents = s.pendingCents || 0;
    return { onWay: onWay.length, onWayCents, next, balanceCents, pendingCents, comingCents: onWayCents + (balanceCents || 0) + pendingCents };
  }

  return {
    FEE_RATE, PACE_DAYS, DEFAULT_RATE_CENTS, CHURN_LIST, CHURN_DAYS, netOf, earn, forecast, earnedOver, monthsTo, paceFrom, lifetime,
    churnWindow, departures, round1, churnPct, todayFrom, listedCents, planNumbers, planStart, rateRange, people, renewalsSum, moneyFrom,
  };
});
