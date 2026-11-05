// The coach's bell, grouped by what the coach does with each notice (owner, 2026-11-05: "Group it into
// Needs you / Good news / FYI, with one action per notice", and "show how each notice reached the
// coach"). PURE: no React, no DOM, no fetch. Loads as a plain <script> (window.CoachBell) and through
// require() in Node (tests/coach-bell.test.mjs). The panel itself is coachBellList.jsx.
//
//   groupOf(n)                 'needs' | 'good' | 'fyi'
//   actionOf(n)                the one action a row offers: accept (a session request), review (a
//                              check-in), message (a client the engine flagged, or a client's win, with
//                              Nora's draft), or null (the row itself opens what it is about)
//   deliveryOf(n, delivery)    how it reached the coach: the bell, the phone, an email, and whether
//                              quiet hours held it (waiting now, or sent when the night ended)
//   footerOf(delivery)         "Phone today 3 of your 4 · Quiet 10 pm – 7 am"
//   summaryOf(groups)          "3 need you, 3 are good news, 4 are for your information."
// The AI layer writes its notices as `ai_<type>` (notify-core deliver); they group by the type after it.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoachBell = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NEEDS = {
    client_red: 1, booking_request: 1, checkin_submitted: 1, session_paid: 1, listing_request: 1, credential_changes: 1,
  };
  var GOOD = {
    new_client: 1, payment: 1, client_win: 1, credential_verified: 1, waitlist_join: 1, tier_up: 1,
  };
  var GROUPS = [['needs', 'Needs you'], ['good', 'Good news'], ['fyi', 'For your information']];

  function baseType(n) {
    var t = String((n && n.type) || '');
    return t.indexOf('ai_') === 0 ? t.slice(3) : t;
  }
  function dataOf(n) { return n && n.data && typeof n.data === 'object' ? n.data : {}; }

  function groupOf(n) {
    var t = baseType(n);
    var d = dataOf(n);
    // A client (side 'coach', not the care team) or a co-coach writing to you waits on a reply.
    if (t === 'message') return d.side === 'coach' ? 'needs' : 'fyi';
    if (NEEDS[t]) return 'needs';
    if (GOOD[t]) return 'good';
    return 'fyi';
  }

  function clientIdOf(n) {
    var d = dataOf(n);
    var id = d.clientId || d.client_id;
    return typeof id === 'string' && id ? id : null;
  }

  function actionOf(n) {
    var t = baseType(n);
    var d = dataOf(n);
    if (t === 'booking_request' && typeof d.sessionId === 'string' && d.sessionId) {
      return { kind: 'accept', label: 'Accept', sessionId: d.sessionId };
    }
    if (t === 'checkin_submitted' && clientIdOf(n)) return { kind: 'review', label: 'Review check-in', clientId: clientIdOf(n) };
    if ((t === 'client_red' || t === 'client_amber' || t === 'client_win') && clientIdOf(n)) {
      return { kind: 'message', label: 'Message', clientId: clientIdOf(n), draftKind: t === 'client_win' ? 'win' : 'checkin' };
    }
    return null;
  }

  // The hour in a zone, and whether an hour falls in a [start, end) window that may wrap midnight.
  function hourIn(at, tz) {
    try { return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hour: '2-digit', hour12: false }).format(at), 10) % 24; }
    catch (e) { return at.getUTCHours(); }
  }
  function inWindow(h, start, end) {
    if (start === end) return false;
    return start < end ? (h >= start && h < end) : (h >= start || h < end);
  }
  function hourLabel(h) {
    var x = ((Number(h) % 24) + 24) % 24;
    if (x === 0) return '12 am';
    if (x === 12) return '12 pm';
    return x < 12 ? x + ' am' : (x - 12) + ' pm';
  }

  // `delivery` is /api/notifications/delivery's answer (or null when it could not be read).
  function deliveryOf(n, delivery) {
    var d = dataOf(n);
    var ch = d.channels && typeof d.channels === 'object' ? d.channels : null;
    var muted = !!(delivery && delivery.muted);
    var phone = !muted && !(ch && ch.push === false);
    var out = { bell: true, phone: phone, email: !!d.emailed_at, held: null };
    if (!phone) return out;
    if (typeof d.held_at === 'string' && d.held_at) {
      out.held = { waiting: true, until: delivery && delivery.quiet ? hourLabel(delivery.quiet.end) : null };
      return out;
    }
    // Reminders a person set are never held (dispatch heldByQuietHours); everything else that landed in
    // quiet hours waited for the morning.
    var q = delivery && delivery.quiet;
    var at = n && n.createdAt ? new Date(n.createdAt) : null;
    if (q && at && isFinite(at.getTime()) && String(n.type || '').indexOf('reminder_') !== 0 && inWindow(hourIn(at, q.tz), q.start, q.end)) {
      out.held = { waiting: false, until: hourLabel(q.end) };
    }
    return out;
  }

  function deliveryText(v) {
    var parts = ['Bell'];
    if (v.phone) parts.push(v.held ? (v.held.waiting ? 'phone after quiet hours' + (v.held.until ? ' (' + v.held.until + ')' : '') : 'phone at ' + v.held.until + ', held overnight') : 'phone');
    if (v.email) parts.push('email');
    return parts.join(' · ');
  }

  function footerOf(delivery) {
    if (!delivery) return null;
    var bits = [];
    if (delivery.muted) bits.push('Everything is muted');
    else if (typeof delivery.pushedToday === 'number') bits.push('Phone today ' + delivery.pushedToday + ' of your ' + delivery.cap);
    if (delivery.quiet) bits.push('Quiet ' + hourLabel(delivery.quiet.start) + ' – ' + hourLabel(delivery.quiet.end));
    else if (!delivery.muted) bits.push('No quiet hours (no time zone on your profile)');
    return bits.join(' · ');
  }

  function groupRows(rows) {
    var out = { needs: [], good: [], fyi: [] };
    (rows || []).forEach(function (n) { out[groupOf(n)].push(n); });
    return out;
  }

  function summaryOf(groups) {
    var n = groups.needs.length, g = groups.good.length, f = groups.fyi.length;
    var parts = [];
    if (n) parts.push(n + (n === 1 ? ' needs you' : ' need you'));
    if (g) parts.push(g + (g === 1 ? ' is good news' : ' are good news'));
    if (f) parts.push(f + (f === 1 ? ' is for your information' : ' are for your information'));
    if (!parts.length) return '';
    var last = parts.pop();
    return (parts.length ? parts.join(', ') + ' and ' + last : last) + '.';
  }

  return {
    GROUPS: GROUPS, groupOf: groupOf, actionOf: actionOf, deliveryOf: deliveryOf, deliveryText: deliveryText,
    footerOf: footerOf, groupRows: groupRows, summaryOf: summaryOf, hourLabel: hourLabel, _baseType: baseType,
  };
});
