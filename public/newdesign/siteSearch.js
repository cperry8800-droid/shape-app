/* Shape — live site search for standalone (non-React) pages.
   Mirrors pageShell.jsx's <SiteSearch>: the same search_shape_people RPC the app
   uses (by name / @handle / goal keywords), a Nora concierge hit that opens the
   chat Help tab, rows that link to each person's public profile with the facet
   gem avatar, and the same signed-in / signed-out empty states. Wires any
   .nav-search (or [data-site-search]) trigger to open the overlay.

   Lazy-loads the Supabase client (window.shapeDb) itself if the page didn't
   include supabase.js, so it works anywhere. __openChat (globalChatButton.js) is
   optional — used only for the Nora hit. search_shape_people is granted to
   authenticated only, so signed-out visitors get the "sign in to search" prompt,
   identical to the rest of the site. */
(function () {
  if (typeof window === 'undefined' || window.__shapeSiteSearch) return;
  window.__shapeSiteSearch = true;

  var TEAL = '#0ac5a8';
  var SANS = "'Space Grotesk', sans-serif";
  var SERIF = "'Fraunces', serif";
  var MONO = "'JetBrains Mono', monospace";
  var SS_TIERS = [[15000, '#e879a6'], [5000, '#a78bfa'], [2000, '#34d6c5'], [750, '#d8a23a'], [0, '#5fa96e']];
  function tierColor(p) { p = Number(p) || 0; for (var i = 0; i < SS_TIERS.length; i++) { if (p >= SS_TIERS[i][0]) return SS_TIERS[i][1]; } return '#5fa96e'; }
  function roleLabel(r) { return r === 'trainer' ? 'Trainer' : r === 'nutritionist' ? 'Nutritionist' : 'Member'; }
  function roleColor(r) { return r === 'trainer' ? '#c0533b' : r === 'nutritionist' ? '#a07a2e' : TEAL; }
  function initials(name) { return String(name || '?').split(' ').map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shade(hex, f) { var h = String(hex || '#888').replace('#', ''); var s = h.length === 3 ? h.split('').map(function (x) { return x + x; }).join('') : h; var n = parseInt(s, 16); return 'rgb(' + Math.round(((n >> 16) & 255) * f) + ',' + Math.round(((n >> 8) & 255) * f) + ',' + Math.round((n & 255) * f) + ')'; }

  // Facet gem avatar (rotated rounded-square, tier gradient, counter-rotated
  // content) — matches the marketplace / living-profile / app avatar.
  function facet(photo, ini, color, size) {
    size = size || 38;
    if (!/^#[0-9a-fA-F]{3,8}$/.test(String(color))) color = '#5fa96e'; // never interpolate an unvalidated color into the style string
    var inset = Math.max(2, Math.round(size * 0.055));
    var inner = photo
      ? '<img src="' + esc(photo) + '" alt="" style="position:absolute;width:152%;height:152%;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-45deg);object-fit:cover" />'
      : '<span style="transform:rotate(-45deg);font-family:' + SERIF + ';font-weight:500;font-size:' + (size * 0.4) + 'px;color:#f2ede4;line-height:1">' + esc(ini) + '</span>';
    return '<span style="width:' + size + 'px;height:' + size + 'px;flex-shrink:0;position:relative;display:inline-grid;place-items:center">' +
      '<span style="position:absolute;inset:0;transform:rotate(45deg);border-radius:27%;background:linear-gradient(135deg,' + color + ',' + shade(color, 0.5) + ');box-shadow:0 5px 16px ' + color + '55,inset 1px 1px 2px rgba(255,255,255,0.35)">' +
        '<span style="position:absolute;inset:0;border-radius:27%;background:linear-gradient(135deg,rgba(255,255,255,0.28),transparent 42%)"></span>' +
        '<span style="position:absolute;inset:' + inset + 'px;border-radius:23%;overflow:hidden;background:#0f0c0a;display:grid;place-items:center">' + inner + '</span>' +
      '</span>' +
    '</span>';
  }

  // Lazy-load window.shapeDb (CDN + /supabase.js) so search works on any page.
  var _db = null;
  function ensureDb() {
    if (window.shapeDb && window.shapeDb.client) return Promise.resolve(window.shapeDb);
    if (_db) return _db;
    function load(src) {
      return new Promise(function (res, rej) {
        var ex = document.querySelector('script[data-ssdb="' + src + '"]');
        if (ex) { ex.addEventListener('load', function () { res(); }); ex.addEventListener('error', rej); return; }
        var s = document.createElement('script'); s.src = src; s.async = true; s.setAttribute('data-ssdb', src);
        // SRI on the pinned, immutable supabase-js vendor bundle (matches the static
        // <script integrity> tags); /supabase.js is our own mutable same-origin wrapper.
        if (src.indexOf('/vendor/supabase-js-') === 0) { s.integrity = 'sha384-nD3dwv4+ZqdYnmZKe/249ImlV04om7xTCcsoSeQYI+RO+XlKPoqAWaJR1M5SJH9p'; s.crossOrigin = 'anonymous'; }
        s.onload = function () { res(); }; s.onerror = rej; document.head.appendChild(s);
      });
    }
    _db = (window.supabase && window.supabase.createClient ? Promise.resolve() : load('/vendor/supabase-js-2.108.2.umd.js'))
      .then(function () { return (window.shapeDb && window.shapeDb.client) ? null : load('/supabase.js'); })
      .then(function () { return (window.shapeDb && window.shapeDb.client) ? window.shapeDb : null; })
      .catch(function (e) { try { console.error("[shape] Supabase bundle failed to load", e); } catch (_) {} return null; });
    return _db;
  }

  var overlay = null, input = null, resultsEl = null, debounceId = null, signedIn = false, seq = 0;

  function build() {
    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:120;background:rgba(0,0,0,0.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);overflow-y:auto;padding:12vh 18px 40px;display:none';
    overlay.innerHTML =
      '<div style="max-width:540px;margin:0 auto;background:#16130f;border:1px solid rgba(242,237,228,0.12);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,0.55);padding:18px 18px 12px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between">' +
          '<div style="font-family:' + SANS + ';font-size:21px;font-weight:700;letter-spacing:-0.02em;color:#f2ede4">Search Shape<span style="color:' + TEAL + '">.</span></div>' +
          '<button class="ss-close" type="button" aria-label="Close search" style="background:transparent;border:0;color:rgba(242,237,228,0.5);cursor:pointer;font-family:' + MONO + ';font-size:14px;font-weight:700;padding:4px;line-height:1">✕</button>' +
        '</div>' +
        '<input class="ss-input" type="text" autocomplete="off" placeholder="Search names, @handles, goals…" style="width:100%;box-sizing:border-box;margin-top:12px;padding:11px 2px;border:0;border-bottom:1px solid rgba(242,237,228,0.2);border-radius:0;background:transparent;color:#f2ede4;font-family:' + SANS + ';font-size:16px;outline:none" />' +
        '<div class="ss-results" style="padding:10px 0 6px"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    input = overlay.querySelector('.ss-input');
    resultsEl = overlay.querySelector('.ss-results');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.ss-close').addEventListener('click', close);
    input.addEventListener('input', onInput);
    renderIdle();
  }

  function open() {
    if (!overlay) build();
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    ensureDb().then(detectSession);
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
  }
  function close() {
    if (!overlay) return;
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    input.value = '';
    renderIdle();
    if (debounceId) { clearTimeout(debounceId); debounceId = null; }
    seq++; // invalidate any in-flight search so it can't render into the closed overlay
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay && overlay.style.display === 'block') close(); });

  function detectSession() {
    try {
      var c = window.shapeDb && window.shapeDb.client;
      if (c && c.auth && c.auth.getSession) {
        c.auth.getSession().then(function (r) { signedIn = !!(r && r.data && r.data.session); }).catch(function () {});
      }
    } catch (e) {}
  }

  function renderIdle() {
    resultsEl.innerHTML = '<div style="padding:12px 12px 8px;font-family:' + SANS + ';font-size:13.5px;color:rgba(242,237,228,0.5)">Find anyone on Shape — members, coaches, or Nora for help.</div>';
  }

  function noraHit(needle) {
    needle = needle.toLowerCase();
    if (!needle) return false;
    if ('nora'.indexOf(needle) !== -1) return true;
    return ['concierge', 'support', 'help', 'assistant'].some(function (w) { return w.indexOf(needle) === 0; });
  }

  function onInput() {
    var query = input.value.trim().replace(/^@/, '');
    seq++; // each keystroke supersedes any in-flight search
    if (debounceId) clearTimeout(debounceId);
    if (!query) { renderIdle(); return; }
    resultsEl.innerHTML = '<div style="padding:12px 12px 8px;font-family:' + MONO + ';font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(242,237,228,0.45)">Searching…</div>';
    debounceId = setTimeout(function () { run(query); }, 250);
  }

  function run(query) {
    var mine = seq;
    var nh = noraHit(query.toLowerCase());
    ensureDb().then(function (db) {
      if (mine !== seq) return; // a newer query (or close) superseded this one
      var c = db && db.client;
      if (!c || !c.rpc) { renderProblem(nh, false); return; }
      c.rpc('search_shape_people', { p_q: query, p_limit: 12 })
        .then(function (r) {
          if (mine !== seq) return;
          if (!r.error) signedIn = true; // a successful RPC means we're authenticated — keep the empty state honest
          // ⚠ A REFUSAL IS NOT AN EMPTY RESULT, AND IT IS NOT A SIGN-OUT EITHER.
          // Past the per-member ceiling the RPC raises PT429 (see
          // 2026-08-29-search-rate-limit.sql). Rendering that as the empty state
          // tells a member a real person does not exist; leaving `signedIn` false
          // — which is what an error used to do here — tells a member who IS
          // signed in to sign in. Matched on the CODE, never the message.
          if (r.error) { renderProblem(nh, r.error.code === 'PT429'); return; }
          render(Array.isArray(r.data) ? r.data : [], nh, query);
        })
        .catch(function (e) {
          if (mine !== seq) return;
          renderProblem(nh, !!(e && e.code === 'PT429'));
        });
    });
  }

  // The honest could-not-answer states. A refusal and a failure are different, and
  // BOTH differ from "nobody matched" — rendering either as the empty state tells a
  // member a real person is not on Shape, on evidence we never had.
  function renderProblem(nh, isLimited) {
    render([], nh, '', isLimited
      ? 'Searching a little fast — give it a moment and try again.'
      : 'Couldn\u2019t search just now — check your connection and try again.');
  }

  function render(rows, nh, query, notice) {
    var html = '';
    if (nh) {
      html +=
        '<button class="ss-nora" type="button" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;cursor:pointer;background:transparent;border:0;width:100%;text-align:left">' +
          facet('/nora-avatar.png', 'N', TEAL, 38) +
          '<span style="min-width:0;flex:1">' +
            '<span style="display:block;font-family:' + MONO + ';font-size:8.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:' + TEAL + '">Shape’s Concierge · always online</span>' +
            '<span style="display:block;margin-top:2px;font-family:' + SANS + ';font-size:15px;font-weight:600;color:#f2ede4">Nora</span>' +
          '</span>' +
          '<span style="font-family:' + MONO + ';font-size:12px;color:rgba(242,237,228,0.4)">›</span>' +
        '</button>';
    }
    if (notice) {
      html += '<div style="padding:12px 12px 8px;font-family:' + SANS + ';font-size:13.5px;color:rgba(242,237,228,0.55)">' + esc(notice) + '</div>';
    } else if (rows.length === 0 && !nh) {
      html += '<div style="padding:12px 12px 8px;font-family:' + SANS + ';font-size:13.5px;color:rgba(242,237,228,0.55)">' +
        (signedIn
          ? 'Nothing on Shape matches “' + esc(query) + '”. <a href="/newdesign/Marketplace.html" style="color:' + TEAL + ';text-decoration:none">Browse coaches →</a>'
          : 'Sign in to search every member &amp; coach on Shape. <a href="/newdesign/Login.html" style="color:' + TEAL + ';text-decoration:none">Log in →</a>') +
        '</div>';
    }
    rows.forEach(function (p) {
      html +=
        '<a href="/newdesign/MemberProfile.html?u=' + encodeURIComponent(p.id) + '" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;text-decoration:none">' +
          facet(p.avatar, initials(p.full_name), tierColor(p.points), 38) +
          '<span style="min-width:0;flex:1">' +
            '<span style="display:block;font-family:' + MONO + ';font-size:8.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:' + roleColor(p.role) + '">' + esc(roleLabel(p.role)) + '</span>' +
            '<span style="display:block;margin-top:2px;font-family:' + SANS + ';font-size:15px;font-weight:600;color:#f2ede4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p.full_name) + '</span>' +
          '</span>' +
          '<span style="font-family:' + MONO + ';font-size:12px;color:rgba(242,237,228,0.4)">›</span>' +
        '</a>';
    });
    resultsEl.innerHTML = html;

    var nora = resultsEl.querySelector('.ss-nora');
    if (nora) {
      nora.addEventListener('click', function () {
        close();
        try { if (window.__openChat) window.__openChat('Nora', 'support'); else window.location.href = '/newdesign/Community.html'; } catch (e) {}
      });
    }
    Array.prototype.forEach.call(resultsEl.querySelectorAll('a, button.ss-nora'), function (el) {
      el.addEventListener('mouseenter', function () { el.style.background = 'rgba(242,237,228,0.05)'; });
      el.addEventListener('mouseleave', function () { el.style.background = 'transparent'; });
    });
  }

  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-search, [data-site-search]'), function (btn) {
      if (btn.__ssWired) return;
      btn.__ssWired = true;
      btn.addEventListener('click', function (e) { e.preventDefault(); open(); });
    });
  }
  if (document.readyState !== 'loading') wire();
  else document.addEventListener('DOMContentLoaded', wire);
})();
