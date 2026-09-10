// CSV export for the coach dashboard (review 2026-09-09, R12).
//
// PURE module: no React, no DOM, no fetch. Loads as a plain <script> in the
// browser (exposes window.DashExport) and via require() in Node, so every rule
// below is driven by tests/coach-export.test.mjs rather than eyeballed.
//
// ⚠ THE WHOLE POINT IS THAT A SPREADSHEET IS READ WITHOUT THE PAGE AROUND IT.
// On screen a blank cell sits next to a column header and a legend; in a CSV
// opened three weeks later in someone's accountant's spreadsheet it is a number
// or it is nothing, and there is no tooltip to explain which. So:
//
//   • "we could not read it" is an EMPTY CELL, never 0. A subscriptions read
//     that failed renders `mrrCents: null` on every row; writing 0.00 there
//     would tell a coach their whole roster pays nothing.
//   • a measured zero IS written as 0.00 — a client on no paid plan is a real
//     answer about a real client.
//   • money is written in MAJOR UNITS with two decimals and no symbol, because
//     a currency symbol makes the column text in every spreadsheet.
//   • dates are ISO (YYYY-MM-DD), which is the only format that sorts.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DashExport = api;
})(typeof window !== "undefined" ? window : null, function () {
  var DAY = 86400000;

  // ⚠ RFC 4180 QUOTING, AND THE LEADING-CHARACTER RULE IS NOT PEDANTRY.
  // A client legitimately named "=Marcus" or a note beginning with "+" is
  // executed as a FORMULA by Excel, Sheets and LibreOffice on open — the
  // injection class CSV exports are known for. Prefixing with an apostrophe
  // inside a quoted field neutralises it and is what every spreadsheet shows
  // as the plain text.
  function cell(v) {
    if (v == null) return "";                     // unknown — an empty cell, never a zero
    var s = String(v);
    if (s === "") return "";
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function rowLine(cells) {
    var out = [];
    for (var i = 0; i < cells.length; i++) out.push(cell(cells[i]));
    return out.join(",");
  }

  // ⚠ CRLF AND A BOM. Excel on Windows reads a bare-LF file as one long line,
  // and without a UTF-8 BOM it renders a name like "Zoë" as mojibake — the two
  // defects a coach would report as "the export is broken".
  function toCsv(header, rows) {
    var lines = [rowLine(header)];
    for (var i = 0; i < rows.length; i++) lines.push(rowLine(rows[i]));
    return "\ufeff" + lines.join("\r\n") + "\r\n";
  }

  // Cents → major units, two decimals, no symbol. Null stays null so `cell`
  // renders the empty string: an unreadable figure must not become 0.00.
  function money(cents) {
    if (cents == null || !isFinite(Number(cents))) return null;
    return (Math.round(Number(cents)) / 100).toFixed(2);
  }

  function isoDay(v) {
    if (!v) return null;
    var t = new Date(v).getTime();
    if (!isFinite(t)) return null;
    return new Date(t).toISOString().slice(0, 10);
  }

  // Whole days between a join date and `now`. Null when there is no date —
  // "we don't know when they joined" is not "they joined today".
  function tenureDays(joinedAt, now) {
    var j = joinedAt ? new Date(joinedAt).getTime() : NaN;
    if (!isFinite(j)) return null;
    var at = (now instanceof Date ? now : new Date()).getTime();
    return Math.max(0, Math.floor((at - j) / DAY));
  }

  // The words the Business page already uses, so a coach reading both sees one
  // vocabulary. An origin this build does not recognise is passed THROUGH
  // rather than relabelled — a stamped value is a fact, and renaming it in an
  // accounting export would be the export lying about the record.
  var ORIGIN_LABELS = {
    marketplace: "Marketplace",
    coach_invite: "Coach invite",
    coach_link: "Coach link",
  };
  function originLabel(origin) {
    if (!origin) return null;
    return Object.prototype.hasOwnProperty.call(ORIGIN_LABELS, origin) ? ORIGIN_LABELS[origin] : origin;
  }

  var STATUS_LABELS = { new: "New", eyes: "Needs eyes", ontrack: "On track" };

  var ROSTER_HEADER = [
    "Name", "Status", "MRR", "Platform fee", "Net to you",
    "Origin", "Joined", "Tenure (days)", "Last session",
  ];

  // `clients` are the unified records `useDashboard(role)` yields, so this reads
  // the same rows the roster table draws — an export that re-fetched could
  // disagree with the screen it was taken from.
  function rosterRows(clients, now) {
    var at = now instanceof Date ? now : new Date();
    var out = [];
    var list = Array.isArray(clients) ? clients : [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i] || {};
      var p = c.profile || {};
      var pay = c.payments || {};
      var mrr = pay.mrrCents == null ? null : pay.mrrCents;
      var fee = pay.feeCents == null ? null : pay.feeCents;
      // ⚠ NET IS ONLY COMPUTED WHEN BOTH HALVES ARE KNOWN. Treating an absent
      // fee as zero would publish gross as net in the one column a coach would
      // paste into their books.
      var net = mrr != null && fee != null ? mrr - fee : null;
      out.push([
        p.name || null,
        STATUS_LABELS[p.status] || p.status || null,
        money(mrr),
        money(fee),
        money(net),
        originLabel(pay.origin),
        isoDay(pay.joinedAt),
        tenureDays(pay.joinedAt, at),
        isoDay(pay.lastSessionAt),
      ]);
    }
    return out;
  }

  function rosterCsv(clients, now) {
    return toCsv(ROSTER_HEADER, rosterRows(clients, now));
  }

  // ⚠ GROSS AND NET ARE SEPARATE COLUMNS ON BOTH HALVES, AND THE TOTAL IS NET+NET.
  // The first cut of this summed `mrrNetCents + oneTimeCents` under a header reading
  // "Total net" — subscription revenue after the platform fee plus one-time revenue
  // BEFORE it. `buildTrajectory` carries `oneTimeNetCents` for exactly this reason and
  // the mistake was mine for not reading it. A column called net that is partly gross
  // is the kind of number a coach pays tax on.
  var REVENUE_HEADER = [
    "Month", "Active clients", "Joined", "Left",
    "MRR gross", "MRR net", "One-time gross", "One-time net", "Total net",
  ];

  // The trajectory is ISO-WEEK buckets (src/lib/coach-trajectory.mjs); a coach's
  // accountant wants months. Weeks are assigned to the month their MONDAY falls
  // in — a week straddling a boundary belongs to one month or the other and
  // splitting it would invent daily figures the series does not carry.
  //
  // ⚠ ACTIVE CLIENTS IS THE LAST WEEK OF THE MONTH, NOT A SUM. Summing a
  // headcount across weeks multiplies the practice by four; joins and departures
  // ARE events and do sum. Two different kinds of number in one table is exactly
  // where a naive rollup goes wrong.
  function revenueRows(trajectory) {
    var weeks = trajectory && Array.isArray(trajectory.weeks) ? trajectory.weeks : [];
    // ⚠ A FAILED PURCHASES READ IS NOT ZERO ONE-TIME REVENUE. Both analytics routes
    // build the trajectory with `purchases: purchasesRes.data ?? []`, so an RLS change,
    // a schema drift or a timeout produces a series of honest-looking zeroes — and
    // writing those into a coach's accounting file is the claim that no one-time
    // revenue existed. The routes carry the flag; the cells stay EMPTY, and so does
    // Total net, because a total that silently omits one leg understates the year.
    var oneTimeUnknown = !!(trajectory && trajectory.oneTimeUnknown);
    var order = [];
    var byMonth = {};
    for (var i = 0; i < weeks.length; i++) {
      var w = weeks[i] || {};
      var day = isoDay(w.weekOf);
      if (!day) continue;
      var key = day.slice(0, 7);
      if (!Object.prototype.hasOwnProperty.call(byMonth, key)) {
        byMonth[key] = { month: key, active: null, joined: 0, left: 0, grossCents: null, netCents: null,
                         oneTimeCents: 0, oneTimeNetCents: 0, lastDay: null };
        order.push(key);
      }
      var m = byMonth[key];
      m.joined += Number(w.added) || 0;
      m.left += Number(w.ended) || 0;
      m.oneTimeCents += Number(w.oneTimeCents) || 0;
      m.oneTimeNetCents += Number(w.oneTimeNetCents) || 0;
      if (m.lastDay == null || day > m.lastDay) {
        m.lastDay = day;
        m.active = w.active == null ? null : Number(w.active);
        // ⚠ `mrrGrossCents`, WHICH IS WHAT THE SERIES ACTUALLY CALLS IT. An earlier cut
        // read `w.mrrCents` — a field that does not exist — so every MRR cell in the
        // export was silently empty, and the hand-written fixture that "proved" it right
        // had invented the same name. The guard drives `buildTrajectory` now.
        m.grossCents = w.mrrGrossCents == null ? null : Number(w.mrrGrossCents);
        m.netCents = w.mrrNetCents == null ? null : Number(w.mrrNetCents);
      }
    }
    order.sort();
    // ⚠ NO ZERO-FILL BEFORE THE PRACTICE EXISTED. `buildTrajectory` returns a FIXED
    // 104-week window, so a coach who took their first client in June 2026 gets nearly
    // two years of leading weeks at zero — and in a spreadsheet "2024-10 · 0.00" is not
    // an absence, it is the claim that they traded that month and earned nothing.
    // Empty months INSIDE the series are kept: those are real, and a gap in the middle
    // of an accounting export would be worse than a zero.
    var first = 0;
    while (first < order.length) {
      var f = byMonth[order[first]];
      // ⚠ AND THE TRIM MUST NOT WEIGH A LEG IT CANNOT READ: with one-time unknown, a
      // month whose ONLY activity was a purchase is indistinguishable from an empty one,
      // so the trim leans on the legs that are known and keeps a month it is unsure of.
      if ((f.active || 0) > 0 || f.joined > 0 || f.left > 0 || (f.grossCents || 0) > 0
          || (!oneTimeUnknown && f.oneTimeCents > 0)) break;
      first += 1;
    }
    var out = [];
    for (var k = first; k < order.length; k++) {
      var r = byMonth[order[k]];
      var total = (r.netCents == null || oneTimeUnknown) ? null : r.netCents + r.oneTimeNetCents;
      out.push([r.month, r.active, r.joined, r.left, money(r.grossCents), money(r.netCents),
                oneTimeUnknown ? null : money(r.oneTimeCents),
                oneTimeUnknown ? null : money(r.oneTimeNetCents),
                money(total)]);
    }
    return out;
  }

  function revenueCsv(trajectory) {
    return toCsv(REVENUE_HEADER, revenueRows(trajectory));
  }

  // `roster-2026-09-10.csv` — the date is in the name because a coach exporting
  // monthly ends up with a folder of them and "roster (3).csv" tells them nothing.
  function fileName(kind, now) {
    var at = now instanceof Date ? now : new Date();
    var d = isFinite(at.getTime()) ? at : new Date();
    return kind + "-" + d.toISOString().slice(0, 10) + ".csv";
  }

  return {
    cell: cell, toCsv: toCsv, money: money, isoDay: isoDay, tenureDays: tenureDays,
    originLabel: originLabel, fileName: fileName,
    ROSTER_HEADER: ROSTER_HEADER, REVENUE_HEADER: REVENUE_HEADER,
    rosterRows: rosterRows, rosterCsv: rosterCsv,
    revenueRows: revenueRows, revenueCsv: revenueCsv,
  };
});
