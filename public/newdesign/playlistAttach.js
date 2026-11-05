// The Playlists page's Attach view, on the coach's real data (owner, 2026-11-05: "The Attach matrix is a
// hard-coded demo list for every coach, and clicks aren't saved"). PURE: no React, no DOM, no fetch.
// Loads as a plain <script> (window.PlaylistAttach) and through require() in Node
// (tests/playlist-attach.test.mjs). The view is playlistAttach.jsx.
//
// Two ways a playlist reaches a client, both already wired for members:
//   · SENT to clients: coach_soundtracks.attached entries { kind: 'client', clientId } or
//     { kind: 'all_clients' } (2026-10-11-coach-playlists-for-clients.sql), with the row's role. The
//     member's app and website read them through get_my_coach_playlists: a trainer's on Train, a
//     nutritionist's cooking playlists on Eat.
//   · ON A PROGRAM DAY (a trainer): the builder's day.playlist, copied into each assigned workout's
//     payload (workoutDocument.js builderToAssignmentRows). It carries the playlist's link, so the
//     member's workout card opens it in their own Spotify or Apple Music. A template change reaches
//     clients already on the program through "Update future assignments", as any template edit does.
//
//   sendState(attached)                  { all, clients: Set }
//   toggleSend(attached, target)         the attached array with `target` ('all' or a client id) flipped;
//                                        a workout or plan entry ({ id, kind, name }) is kept as it is
//   dayPlaylist(row)                     what a program day carries for a coach_soundtracks row
//   dayHas(day, row)                     whether a day plays that playlist (by id; a day saved before ids
//                                        rode along matches by name)
//   programDays(plans, usage)            every day of every program: { planId, w, d, name, program, clients }
//   setDayPlaylist(detail, w, d, row)    the program's detail with that day's playlist set (row) or
//                                        cleared (null)
//   safeLink(url)                        an https Spotify or Apple Music link, else null

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlaylistAttach = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function list(a) { return Array.isArray(a) ? a.filter(function (e) { return e && typeof e === 'object'; }) : []; }

  function sendState(attached) {
    var out = { all: false, clients: new Set() };
    list(attached).forEach(function (e) {
      if (e.kind === 'all_clients') out.all = true;
      if (e.kind === 'client' && typeof e.clientId === 'string' && UUID.test(e.clientId)) out.clients.add(e.clientId.toLowerCase());
    });
    return out;
  }

  function toggleSend(attached, target, name) {
    var rows = list(attached);
    if (target === 'all') {
      var on = rows.some(function (e) { return e.kind === 'all_clients'; });
      rows = rows.filter(function (e) { return e.kind !== 'all_clients'; });
      if (!on) rows.push({ id: 'all_clients', kind: 'all_clients', name: 'All clients' });
      return rows;
    }
    var id = String(target || '').toLowerCase();
    if (!UUID.test(id)) return rows;
    var has = rows.some(function (e) { return e.kind === 'client' && String(e.clientId || '').toLowerCase() === id; });
    rows = rows.filter(function (e) { return !(e.kind === 'client' && String(e.clientId || '').toLowerCase() === id); });
    if (!has) rows.push({ id: 'client:' + id, kind: 'client', clientId: id, name: String(name || '').slice(0, 160) });
    return rows;
  }

  function safeLink(url) {
    var u = String(url || '').trim();
    return /^https:\/\/(open\.spotify\.com|music\.apple\.com)\//i.test(u) && u.length <= 500 ? u : null;
  }

  function dayPlaylist(row) {
    if (!row || !row.name) return null;
    var tracks = Number(row.tracks) || 0;
    var meta = [tracks ? tracks + ' tracks' : '', row.duration && row.duration !== '—' ? String(row.duration) : ''].filter(Boolean).join(' · ');
    var out = { name: String(row.name).slice(0, 160), meta: meta };
    if (typeof row.id === 'string' && UUID.test(row.id)) out.id = row.id;
    var link = safeLink(row.url);
    if (link) { out.url = link; out.provider = row.provider === 'apple' ? 'apple' : 'spotify'; }
    return out;
  }

  function dayHas(day, row) {
    var p = day && day.playlist;
    if (!p || !row) return false;
    if (p.id) return p.id === row.id;
    return !!p.name && p.name === row.name;
  }

  function programDays(plans, usage) {
    var out = [];
    (Array.isArray(plans) ? plans : []).forEach(function (plan) {
      var b = plan && plan.detail && plan.detail.builder;
      if (!b || !Array.isArray(b.weeks)) return;
      var u = usage && plan.id && usage[plan.id];
      var clients = u ? Number(u.clients) || 0 : 0;
      b.weeks.forEach(function (week, w) {
        (week && Array.isArray(week.days) ? week.days : []).forEach(function (day, d) {
          out.push({
            planId: plan.id, w: w, d: d, day: day,
            name: (b.weeks.length > 1 ? 'Week ' + (w + 1) + ' · ' : '') + (day.name || 'Day ' + (d + 1)),
            program: plan.name || 'Program', clients: clients,
          });
        });
      });
    });
    return out;
  }

  function setDayPlaylist(detail, w, d, row) {
    var copy = JSON.parse(JSON.stringify(detail || {}));
    var day = copy.builder && copy.builder.weeks && copy.builder.weeks[w] && copy.builder.weeks[w].days && copy.builder.weeks[w].days[d];
    if (!day) return null;
    day.playlist = row ? dayPlaylist(row) : null;
    return copy;
  }

  return { sendState: sendState, toggleSend: toggleSend, safeLink: safeLink, dayPlaylist: dayPlaylist, dayHas: dayHas, programDays: programDays, setDayPlaylist: setDayPlaylist };
});
