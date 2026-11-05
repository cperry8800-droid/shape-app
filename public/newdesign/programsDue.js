// "Programs due", said as what Shape does (owner decision A, 2026-11-05: "10 clients need next week's
// program · 8 have checked in · 2 waiting on a check-in", each name opening the builder; no draft-then-
// send step: a program is live on the client's calendar the moment it is assigned).
//
// PURE: no React, no DOM, no fetch. Loads as a plain <script> (window.ProgramsDue) and through require()
// in Node (tests/programs-due.test.mjs). The line on the Programs page is programsDueLine.jsx.
//
//   nextWeekOf(today)                 the Monday and Sunday after `today`'s week (YYYY-MM-DD)
//   programsDue({ clients, queue, plans, readable })
//     clients   the roster records (useDashboard): a client counts when they are on a plan
//               (payments.onPlan is not false), the Clients page's own count
//     queue     the programming queue (DashSignals.buildProgrammingQueue): 'ready' = this week's
//               check-in is in, 'blocked' = waiting on one; a client not in it has no readable check-in
//     plans     next week's published workouts of the coach's clients (/api/calendar clientPlans)
//     readable  whether that read was whole; when it wasn't, nothing is claimed (null)
//   → { need: [{ id, name, state: 'checked' | 'waiting' | 'unknown' }], checked, waiting, unknown } | null
// A client with any published workout next week has next week's program; everyone else on a plan needs
// one. Checked-in first, then waiting, then unread, by name.

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProgramsDue = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DAY = 86400000;
  function ymd(d) { return d.toISOString().slice(0, 10); }

  function nextWeekOf(today) {
    var t = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today) ? new Date(today + 'T12:00:00Z') : new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12));
    var dow = (t.getUTCDay() + 6) % 7;
    var monday = new Date(t.getTime() + (7 - dow) * DAY);
    return { start: ymd(monday), end: ymd(new Date(monday.getTime() + 6 * DAY)) };
  }

  var RANK = { checked: 0, waiting: 1, unknown: 2 };
  function programsDue(input) {
    var i = input || {};
    if (i.readable === false) return null;
    var has = {};
    (Array.isArray(i.plans) ? i.plans : []).forEach(function (p) { if (p && p.clientId) has[String(p.clientId)] = true; });
    var stateOf = {};
    (Array.isArray(i.queue) ? i.queue : []).forEach(function (r) {
      var id = r && r.client && r.client.profile && r.client.profile.id;
      if (id) stateOf[String(id)] = r.state === 'ready' ? 'checked' : 'waiting';
    });
    var need = [];
    (Array.isArray(i.clients) ? i.clients : []).forEach(function (c) {
      var id = c && c.profile && c.profile.id;
      if (!id || /^demo-/.test(String(id))) return;
      if (c.payments && c.payments.onPlan === false) return;
      if (has[String(id)]) return;
      need.push({ id: String(id), name: String(c.profile.name || 'Client'), state: stateOf[String(id)] || 'unknown' });
    });
    need.sort(function (a, b) { return RANK[a.state] - RANK[b.state] || a.name.localeCompare(b.name); });
    var count = function (s) { return need.filter(function (x) { return x.state === s; }).length; };
    return { need: need, checked: count('checked'), waiting: count('waiting'), unknown: count('unknown') };
  }

  // The line: "10 clients need next week's program · 8 have checked in · 2 waiting on a check-in".
  function dueLine(d) {
    if (!d) return null;
    var n = d.need.length;
    if (!n) return "Everyone on a plan has next week's program.";
    var parts = [n + (n === 1 ? " client needs next week's program" : " clients need next week's program")];
    if (d.checked) parts.push(d.checked + (d.checked === 1 ? ' has checked in' : ' have checked in'));
    if (d.waiting) parts.push(d.waiting + ' waiting on a check-in');
    if (d.unknown) parts.push(d.unknown + " check-in" + (d.unknown === 1 ? '' : 's') + " not read");
    return parts.join(' · ');
  }

  return { nextWeekOf: nextWeekOf, programsDue: programsDue, dueLine: dueLine };
});
