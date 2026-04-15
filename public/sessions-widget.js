// Shape sessions widget — renders upcoming bookings for the current user.
// Auto-mounts into any element with id="shapeSessionsWidget".
// Client view: upcoming sessions with Join button.
// Provider view (trainer/nutritionist): incoming requests with Accept/Decline.
(function () {
  var STYLE =
    '<style>' +
    '#shapeSessionsWidget{font-family:Inter,system-ui,sans-serif;}' +
    '.sw-card{background:var(--bg-card,#161616);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px 22px;margin-bottom:14px;}' +
    '.sw-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px;}' +
    '.sw-title{font-size:0.84rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#888);}' +
    '.sw-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 0;border-top:1px solid var(--border,rgba(255,255,255,0.06));}' +
    '.sw-row:first-of-type{border-top:none;padding-top:0;}' +
    '.sw-row:last-child{padding-bottom:0;}' +
    '.sw-when{font-size:0.82rem;color:var(--text-muted,#888);margin-bottom:2px;}' +
    '.sw-who{font-size:0.98rem;font-weight:500;}' +
    '.sw-meta{font-size:0.74rem;color:var(--text-muted,#888);margin-top:2px;}' +
    '.sw-actions{display:flex;gap:6px;flex-shrink:0;}' +
    '.sw-btn{padding:8px 14px;border-radius:999px;font-size:0.76rem;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid var(--border,rgba(255,255,255,0.15));background:transparent;color:var(--text,#fff);transition:all 0.2s;}' +
    '.sw-btn:hover{border-color:var(--text,#fff);}' +
    '.sw-btn.primary{background:#fff;color:#0a0a0a;border-color:#fff;}' +
    '.sw-btn.primary:hover{opacity:0.85;}' +
    '.sw-btn.danger:hover{border-color:#f87171;color:#f87171;}' +
    '.sw-empty{font-size:0.88rem;color:var(--text-muted,#888);padding:8px 0;}' +
    '.sw-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.64rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-left:6px;}' +
    '.sw-badge.requested{background:rgba(251,191,36,0.15);color:#fbbf24;}' +
    '.sw-badge.confirmed{background:rgba(45,212,191,0.15);color:#2dd4bf;}' +
    '</style>';

  function fmtWhen(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function typeLabel(t) {
    return t === 'video' ? '📹 Video'
      : t === 'phone' ? '📞 Phone'
      : t === 'inperson' ? '🏋️ In person'
      : '💬 Message';
  }

  async function fetchOtherPartyName(userId) {
    if (!window.shapeDb) return '';
    var p = await window.shapeDb.getProfile(userId);
    return (p && p.full_name) || 'Shape user';
  }

  async function renderClient(mount) {
    var res = await window.shapeDb.listSessions({ asClient: true, upcoming: true });
    var rows = (res && res.data) || [];
    if (!rows.length) {
      mount.innerHTML = STYLE +
        '<div class="sw-card"><div class="sw-head"><div class="sw-title">Upcoming sessions</div></div>' +
        '<div class="sw-empty">No sessions booked. Browse <a href="trainers.html" style="color:var(--text);">trainers</a> or <a href="nutritionists.html" style="color:var(--text);">nutritionists</a> to book one.</div></div>';
      return;
    }
    var html = STYLE + '<div class="sw-card"><div class="sw-head"><div class="sw-title">Upcoming sessions</div></div>';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var who = await fetchOtherPartyName(r.provider_id);
      var join = '';
      if (r.status === 'confirmed' && r.meeting_url) {
        join = '<a class="sw-btn primary" href="' + r.meeting_url + '" target="_blank" rel="noopener">Join</a>';
      } else if (r.status === 'confirmed' && r.type === 'phone') {
        join = '<span class="sw-badge confirmed">Confirmed</span>';
      } else {
        join = '<span class="sw-badge requested">Pending</span>';
      }
      html +=
        '<div class="sw-row">' +
          '<div>' +
            '<div class="sw-when">' + fmtWhen(r.scheduled_at) + '</div>' +
            '<div class="sw-who">' + who + '</div>' +
            '<div class="sw-meta">' + typeLabel(r.type) + ' · ' + r.duration_min + ' min' +
              (r.notes ? ' · ' + escapeHtml(r.notes) : '') +
            '</div>' +
          '</div>' +
          '<div class="sw-actions">' + join +
            '<button class="sw-btn danger" data-cancel="' + r.id + '">Cancel</button>' +
          '</div>' +
        '</div>';
    }
    html += '</div>';
    mount.innerHTML = html;
    mount.querySelectorAll('[data-cancel]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Cancel this session?')) return;
        await window.shapeDb.updateSession(b.getAttribute('data-cancel'), { status: 'cancelled' });
        renderClient(mount);
      });
    });
  }

  async function renderProvider(mount, role) {
    var res = await window.shapeDb.listSessions({ asProvider: true });
    var rows = (res && res.data) || [];
    var pending = rows.filter(function (r) { return r.status === 'requested'; });
    var upcoming = rows.filter(function (r) {
      return r.status === 'confirmed' && new Date(r.scheduled_at) >= new Date();
    });

    var html = STYLE;
    // Pending
    html += '<div class="sw-card"><div class="sw-head"><div class="sw-title">Session requests</div></div>';
    if (!pending.length) {
      html += '<div class="sw-empty">No pending requests.</div>';
    } else {
      for (var i = 0; i < pending.length; i++) {
        var r = pending[i];
        var who = await fetchOtherPartyName(r.client_id);
        html +=
          '<div class="sw-row">' +
            '<div>' +
              '<div class="sw-when">' + fmtWhen(r.scheduled_at) + '</div>' +
              '<div class="sw-who">' + who + '</div>' +
              '<div class="sw-meta">' + typeLabel(r.type) + ' · ' + r.duration_min + ' min' +
                (r.client_phone ? ' · ' + escapeHtml(r.client_phone) : '') +
                (r.notes ? ' · ' + escapeHtml(r.notes) : '') +
              '</div>' +
            '</div>' +
            '<div class="sw-actions">' +
              '<button class="sw-btn primary" data-accept="' + r.id + '">Accept</button>' +
              '<button class="sw-btn danger" data-decline="' + r.id + '">Decline</button>' +
            '</div>' +
          '</div>';
      }
    }
    html += '</div>';

    // Upcoming (confirmed)
    html += '<div class="sw-card"><div class="sw-head"><div class="sw-title">Upcoming sessions</div></div>';
    if (!upcoming.length) {
      html += '<div class="sw-empty">No confirmed sessions yet.</div>';
    } else {
      for (var j = 0; j < upcoming.length; j++) {
        var u = upcoming[j];
        var who2 = await fetchOtherPartyName(u.client_id);
        var joinBtn = (u.type === 'video' && u.meeting_url)
          ? '<a class="sw-btn primary" href="' + u.meeting_url + '" target="_blank" rel="noopener">Join</a>'
          : '<span class="sw-badge confirmed">Confirmed</span>';
        html +=
          '<div class="sw-row">' +
            '<div>' +
              '<div class="sw-when">' + fmtWhen(u.scheduled_at) + '</div>' +
              '<div class="sw-who">' + who2 + '</div>' +
              '<div class="sw-meta">' + typeLabel(u.type) + ' · ' + u.duration_min + ' min</div>' +
            '</div>' +
            '<div class="sw-actions">' + joinBtn + '</div>' +
          '</div>';
      }
    }
    html += '</div>';

    mount.innerHTML = html;
    mount.querySelectorAll('[data-accept]').forEach(function (b) {
      b.addEventListener('click', async function () {
        await window.shapeDb.acceptSession(b.getAttribute('data-accept'));
        renderProvider(mount, role);
      });
    });
    mount.querySelectorAll('[data-decline]').forEach(function (b) {
      b.addEventListener('click', async function () {
        await window.shapeDb.updateSession(b.getAttribute('data-decline'), { status: 'declined' });
        renderProvider(mount, role);
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  async function mount() {
    var el = document.getElementById('shapeSessionsWidget');
    if (!el || !window.shapeDb) return;
    for (var i = 0; i < 20 && !window.shapeDb; i++) {
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    var session = await window.shapeDb.getSession();
    if (!session) { el.innerHTML = ''; return; }
    var profile = await window.shapeDb.getProfile(session.user.id);
    if (!profile) return;
    if (profile.role === 'client') renderClient(el);
    else renderProvider(el, profile.role);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
  window.shapeSessionsWidget = { refresh: mount };
})();
