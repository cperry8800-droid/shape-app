// Fetches real trainers / nutritionists from Supabase and renders bookable cards.
// Mount point: <div id="shapeRealProviders" data-role="trainer|nutritionist"></div>
// Requires supabase.js + booking.js to be loaded already.
(function () {
  var STYLE =
    '<style>' +
    '#shapeRealProviders{font-family:Inter,system-ui,sans-serif;margin:48px 0;}' +
    '.rp-head{text-align:center;margin-bottom:28px;}' +
    '.rp-head .tag{display:inline-block;font-size:0.66rem;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;color:var(--text-muted,#888);margin-bottom:8px;}' +
    '.rp-head h2{font-size:clamp(1.5rem,3vw,2.2rem);font-weight:300;letter-spacing:-0.03em;margin:0;}' +
    '.rp-head p{font-size:0.92rem;color:var(--text-muted,#888);font-weight:300;margin-top:8px;}' +
    '.rp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;}' +
    '.rp-card{background:var(--bg-card,#161616);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:22px 22px;transition:all 0.2s;}' +
    '.rp-card:hover{border-color:var(--text,#fff);}' +
    '.rp-avatar{width:52px;height:52px;border-radius:50%;background:#2dd4bf;color:#0a0a0a;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:1.1rem;margin-bottom:14px;}' +
    '.rp-name{font-size:1.1rem;font-weight:500;letter-spacing:-0.01em;margin-bottom:4px;}' +
    '.rp-role{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted,#888);margin-bottom:16px;}' +
    '.rp-book{width:100%;padding:11px 16px;background:var(--text,#fff);color:var(--bg,#0a0a0a);border:none;border-radius:999px;font-size:0.84rem;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity 0.2s;}' +
    '.rp-book:hover{opacity:0.85;}' +
    '.rp-empty{text-align:center;padding:30px;font-size:0.9rem;color:var(--text-muted,#888);}' +
    '</style>';

  function initials(name) {
    return (name || '?').split(/\s+/).map(function (p) { return p[0]; }).slice(0, 2).join('').toUpperCase();
  }

  async function mount() {
    var el = document.getElementById('shapeRealProviders');
    if (!el) return;
    var role = el.getAttribute('data-role') || 'trainer';

    for (var i = 0; i < 20 && !window.shapeDb; i++) {
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    if (!window.shapeDb || !window.shapeDb.client) { el.innerHTML = ''; return; }

    var res = await window.shapeDb.client
      .from('profiles')
      .select('id, full_name, role')
      .eq('role', role)
      .order('created_at', { ascending: false });

    var rows = (res && res.data) || [];
    var heading = role === 'trainer' ? 'Shape trainers' : 'Shape nutritionists';
    var sub = role === 'trainer'
      ? 'Book a session with a real Shape coach.'
      : 'Book a session with a real Shape nutritionist.';

    var html = STYLE +
      '<div class="rp-head"><span class="tag">Live on Shape</span><h2>' + heading + '</h2><p>' + sub + '</p></div>';

    if (!rows.length) {
      html += '<div class="rp-empty">No providers yet. Be the first — <a href="' +
        (role === 'trainer' ? 'signup-trainer.html' : 'signup-nutritionist.html') +
        '" style="color:var(--text);">apply now</a>.</div>';
      el.innerHTML = html;
      return;
    }

    html += '<div class="rp-grid">';
    rows.forEach(function (p) {
      var name = p.full_name || 'Shape ' + role;
      html +=
        '<div class="rp-card">' +
          '<div class="rp-avatar">' + initials(name) + '</div>' +
          '<div class="rp-name">' + escapeHtml(name) + '</div>' +
          '<div class="rp-role">' + role + '</div>' +
          '<button class="rp-book" data-id="' + p.id + '" data-name="' + escapeHtml(name) + '">Book a session</button>' +
        '</div>';
    });
    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll('.rp-book').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!window.shapeBook) { alert('Booking not loaded.'); return; }
        var session = await window.shapeDb.getSession();
        if (!session) {
          alert('Please log in or sign up as a client to book a session.');
          window.location.href = 'login.html';
          return;
        }
        window.shapeBook.open({
          providerId: btn.getAttribute('data-id'),
          providerRole: role,
          providerName: btn.getAttribute('data-name')
        });
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
  window.shapeRealProviders = { refresh: mount };
})();
