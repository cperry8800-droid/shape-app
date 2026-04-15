// Shape — first-time login empty state.
// If the logged-in user has no real activity yet (no sessions booked,
// no profile metadata filled), zero out the hardcoded demo stats on the
// client / trainer / nutritionist dashboards so they see a clean slate.
//
// Safe on pages without stats — it just no-ops if no matching nodes exist.
// Opt out on a specific element by adding data-keep-demo.
(function () {
  // Numeric stat selectors → replaced with "0"
  var ZERO_SELECTORS = [
    '.progress-stat-number',
    '.cp-stat-value',
    '.activity-stat-num',
    '.nd-profile-stat-value',
    '.td-cal-day-count',
    '.tp-display-value',
    '.tp-stat',
    '.wlib-kpi .val',
    '.wlib-readiness-stat',
    '.macro-value',
    '.water-count span:first-child',
    '.nd-home-cal-count'
  ];
  // Delta / trend lines → hidden (no up/down arrows for brand-new accounts)
  var HIDE_SELECTORS = [
    '.wlib-kpi .delta',
    '.progress-stat-change',
    '.cp-stat-change'
  ];

  function isNumericText(t) {
    return /[0-9]/.test(t || '');
  }

  function zeroOut(root) {
    ZERO_SELECTORS.forEach(function (sel) {
      root.querySelectorAll(sel).forEach(function (el) {
        if (el.hasAttribute('data-keep-demo')) return;
        var txt = (el.textContent || '').trim();
        if (!isNumericText(txt)) return;
        // Preserve a suffix like "g", "%", "/mo" if present.
        if (/%$/.test(txt))            el.textContent = '0%';
        else if (/g$/.test(txt))       el.textContent = '0g';
        else if (/^\$/.test(txt))      el.textContent = '$0';
        else if (/cal/i.test(txt))     el.textContent = '0';
        else                           el.textContent = '0';
      });
    });
    HIDE_SELECTORS.forEach(function (sel) {
      root.querySelectorAll(sel).forEach(function (el) {
        if (el.hasAttribute('data-keep-demo')) return;
        el.style.display = 'none';
      });
    });
    // Macro grams specifically
    ['macroProtein','macroCarbs','macroFat'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = '0g';
    });
    ['macroCalories','waterCount','statWorkouts','statMinutes','statStreak','statCalories','statFriends']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.textContent = '0';
      });
  }

  async function isNewUser(session) {
    try {
      if (!window.shapeDb || !window.shapeDb.client) return true;
      // New if they have zero sessions as client OR provider.
      var c = window.shapeDb.client;
      var res = await c.from('sessions')
        .select('id', { count: 'exact', head: true })
        .or('client_id.eq.' + session.user.id + ',provider_id.eq.' + session.user.id);
      if (res && typeof res.count === 'number') return res.count === 0;
      return true;
    } catch (e) {
      return true;
    }
  }

  async function run() {
    for (var i = 0; i < 20 && !window.shapeDb; i++) {
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    if (!window.shapeDb) return;
    var session = await window.shapeDb.getSession();
    if (!session) return; // logged-out / demo banner handles it
    var fresh = await isNewUser(session);
    if (!fresh) return;
    document.body.classList.add('shape-empty-state');
    zeroOut(document);
    // Re-apply after tab switches / late renders.
    setTimeout(function () { zeroOut(document); }, 400);
    setTimeout(function () { zeroOut(document); }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  window.shapeEmptyState = { refresh: run };
})();
