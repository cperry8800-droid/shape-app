// Coach forecast — the math behind the Business page's Plan tab (owner, 2026-10-17:
// "forecast on business"; design E).
//
// PURE module: no React, no DOM, no fetch. Loads as a plain <script> in the browser
// (exposes window.CoachForecast) and via require() in Node, so every figure the Plan
// tab prints is unit-tested (tests/coach-forecast.test.mjs).
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
  //   → { adds, churn, days, fromFirst, added, ended, avgActive }; adds and churn are null when
  //     there is too little history to say. `days` is the span the rates are taken over.
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
    const none = { adds: null, churn: null, days: 0, fromFirst: false, added: 0, ended: 0, avgActive: 0 };
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
    if (!inWindow.length || histDays < PACE_MIN_DAYS) return { ...none, days, fromFirst };
    const months = histDays / MONTH_DAYS;
    const added = inWindow.reduce((s, w) => s + (w.added || 0), 0);
    const ended = inWindow.reduce((s, w) => s + (w.ended || 0), 0);
    const avgActive = inWindow.reduce((s, w) => s + (w.active || 0), 0) / inWindow.length;
    return {
      adds: added / months,
      churn: avgActive > 0 ? clamp01(ended / avgActive / months) : null,
      days, fromFirst, added, ended, avgActive,
    };
  }

  // What a client is worth: the average stay at this churn, and the net over it.
  function lifetime({ netPerClientCents, churn }) {
    const c = num(churn);
    const v = num(netPerClientCents);
    if (c == null || c <= 0 || v == null) return null;
    return { months: 1 / c, valueCents: v / c };
  }

  return { FEE_RATE, PACE_DAYS, netOf, earn, forecast, earnedOver, monthsTo, paceFrom, lifetime };
});
