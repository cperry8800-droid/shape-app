// Renders "Become a trainer / nutritionist / client" buttons for roles the
// current user doesn't already hold. Auto-mounts into #shapeAddRole.
(function () {
  var STYLE =
    '<style>' +
    '#shapeAddRole{font-family:Inter,system-ui,sans-serif;}' +
    '.sar-card{background:var(--bg-card,#161616);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:22px 24px;margin:20px 0;}' +
    '.sar-head{font-size:0.82rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#888);margin-bottom:14px;}' +
    '.sar-sub{font-size:0.88rem;color:var(--text-muted,#888);font-weight:300;margin-bottom:16px;line-height:1.5;}' +
    '.sar-btns{display:flex;flex-wrap:wrap;gap:10px;}' +
    '.sar-btn{padding:12px 20px;background:transparent;color:var(--text,#fff);border:1px solid var(--border,rgba(255,255,255,0.15));border-radius:999px;font-size:0.84rem;font-weight:500;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:8px;transition:all 0.2s;}' +
    '.sar-btn:hover{border-color:var(--text,#fff);}' +
    '.sar-btn.primary{background:var(--text,#fff);color:var(--bg,#0a0a0a);border-color:var(--text,#fff);}' +
    '.sar-btn.primary:hover{opacity:0.85;}' +
    '.sar-empty{font-size:0.86rem;color:var(--text-muted,#888);}' +
    '</style>';

  async function mount() {
    var el = document.getElementById('shapeAddRole');
    if (!el) return;
    for (var i = 0; i < 20 && !window.shapeDb; i++) {
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    if (!window.shapeDb) return;
    var session = await window.shapeDb.getSession();
    if (!session) { el.innerHTML = ''; return; }
    var profile = await window.shapeDb.getProfile(session.user.id);
    if (!profile) return;

    var current = Array.isArray(profile.roles) && profile.roles.length
      ? profile.roles
      : (profile.role ? [profile.role] : []);
    var allRoles = ['client','trainer','nutritionist'];
    var missing = allRoles.filter(function (r) { return current.indexOf(r) === -1; });

    // Nothing to offer — hide the widget entirely.
    if (!missing.length) { el.innerHTML = ''; return; }

    var labels = { client: 'Client', trainer: 'Trainer', nutritionist: 'Nutritionist' };
    var descs = {
      client: 'Train with coaches and track your own workouts.',
      trainer: 'Offer programs and coach clients on Shape.',
      nutritionist: 'Build meal plans and coach clients on nutrition.'
    };

    var html = STYLE + '<div class="sar-card">';
    html += '<div class="sar-head">Your Shape roles</div>';
    html += '<div class="sar-sub">You\'re active as: <strong>' +
      current.map(function (r) { return labels[r] || r; }).join(', ') + '</strong>. ' +
      'One account can hold any combination of client, trainer, and nutritionist.</div>';
    html += '<div class="sar-btns">';
    missing.forEach(function (r) {
      html += '<button class="sar-btn primary" data-add="' + r + '" title="' + descs[r] + '">' +
        'Become a ' + labels[r].toLowerCase() + '</button>';
    });
    html += '</div>';
    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var newRole = b.getAttribute('data-add');
        if (!confirm('Add the ' + newRole + ' role to your account? You\'ll be able to switch between roles from the navbar.')) return;
        var originalText = b.textContent;
        b.disabled = true;
        b.textContent = 'Adding...';
        // Hard timeout so the button never gets stuck.
        var timedOut = false;
        var timer = setTimeout(function () {
          timedOut = true;
          alert('Adding role is taking longer than expected. Check the browser console for errors and try again.');
          b.disabled = false;
          b.textContent = originalText;
        }, 8000);
        try {
          var res = await window.shapeDb.addRole(newRole);
          if (timedOut) return;
          clearTimeout(timer);
          if (res && res.error) {
            alert(res.error.message || 'Could not add role.');
            b.disabled = false;
            b.textContent = originalText;
            return;
          }
          window.location.href = window.shapeDb.dashboardFor(newRole);
        } catch (e) {
          clearTimeout(timer);
          console.error('[shape] addRole failed', e);
          alert((e && e.message) || 'Could not add role.');
          b.disabled = false;
          b.textContent = originalText;
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
  window.shapeAddRoleWidget = { refresh: mount };
})();
