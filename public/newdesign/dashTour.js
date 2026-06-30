/* Website spotlight tour adapter. Loads after spotlightTour.js (window.SpotlightTour)
   and supabase.js (window.shapeDb). Each dashboard shell calls ShapeDashTour.init(role). */
(function () {
  var ACCENT = { client: '#2ee0c4', trainer: '#0a8f87', nutritionist: '#a07a2e' };
  var GOAL_KEY = { client: 'client_onboarding', trainer: 'coach_onboarding', nutritionist: 'coach_onboarding' };

  // Mirror of tourTrigger.mjs shouldAutoShowTour (the .mjs is the tested source).
  function shouldAutoShow(createdAtISO, seen, nowMs, maxAgeHours) {
    if (seen) return false;
    if (!createdAtISO) return false;
    var t = Date.parse(createdAtISO);
    if (!isFinite(t)) return false;
    var ageHours = (nowMs - t) / 3600000;
    return ageHours >= 0 && ageHours < (maxAgeHours || 24);
  }

  function q(key) { return function () { return document.querySelector('[data-tour="' + key + '"]'); }; }
  function go(slug) { return function () { window.location.hash = '#' + slug; }; }

  function clientSteps() {
    return [
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Welcome', title: 'Welcome to Shape.', body: 'A quick tour of your dashboard — about 30 seconds.' },
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Today', title: 'Your day, at a glance.', body: 'Your next move and the day’s plan lead here.' },
      { navigate: go('workouts'), anchor: q('hero-workouts'), fallback: q('webtab-workouts'), eyebrow: 'Workouts', title: 'Your training.', body: 'Today’s session and your program live here.' },
      { navigate: go('nutrition'), anchor: q('hero-nutrition'), fallback: q('webtab-nutrition'), eyebrow: 'Nutrition', title: 'Meals & macros.', body: 'Your plan for the day, logged in a tap.' },
      { navigate: go('nutrition'), anchor: q('hero-grocery'), fallback: q('webtab-nutrition'), eyebrow: 'Grocery', title: 'Grocery lists.', body: 'Your week’s meals become a shopping list, sorted by aisle.' },
      { navigate: go('habits'), anchor: q('hero-habits'), fallback: q('webtab-habits'), eyebrow: 'Habits', title: 'Daily habits.', body: 'Small things that add up — each one feeds your Shape Score.' },
      { navigate: go('score'), anchor: q('hero-score'), fallback: q('webtab-score'), eyebrow: 'Score', title: 'Your Shape Score.', body: 'The one number that tells the truth, read every week.' },
      { navigate: go('community'), anchor: q('hero-community'), fallback: q('webtab-community'), eyebrow: 'Community', title: 'The feed.', body: 'See what the community is doing and cheer them on.' },
      { navigate: go('profile'), anchor: q('hero-profile'), fallback: q('webtab-profile'), eyebrow: 'You', title: 'Your profile.', body: 'Your living profile — climb, signals and standing.' },
      { navigate: go('today'), anchor: q('webtab-today'), fallback: q('webtab-today'), final: true, ctaLabel: 'Open Shape Radio →', eyebrow: 'Last stop', title: 'Shape Radio.', body: 'Ad-free workout mixes, curated by BPM. Free with your membership.', onCta: function () { window.location.href = '/newdesign/Radio.html'; } },
    ];
  }
  function coachSteps(role) {
    var plans = role === 'trainer' ? 'programs' : 'plans';
    var plansLabel = role === 'trainer' ? 'Programs' : 'Plans';
    return [
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Welcome', title: 'Your coaching tools.', body: 'A quick tour of your dashboard — about 30 seconds.' },
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Today', title: 'Who needs you.', body: 'Your day leads with the clients who need attention.' },
      { navigate: go('clients'), anchor: q('hero-clients'), fallback: q('webtab-clients'), eyebrow: 'Clients', title: 'Your roster.', body: 'Every client, sorted by who’s on track and who’s slipping.' },
      { navigate: go(plans), anchor: q('hero-' + plans), fallback: q('webtab-' + plans), eyebrow: plansLabel, title: 'Build & sell.', body: 'Create ' + plansLabel.toLowerCase() + ', assign them, and sell them in the marketplace.' },
      { navigate: go('business'), anchor: q('hero-business'), fallback: q('webtab-business'), eyebrow: 'Business', title: 'Your practice.', body: 'Revenue, payouts and clients at a glance.' },
      { navigate: go('community'), anchor: q('hero-community'), fallback: q('webtab-community'), eyebrow: 'Community', title: 'The feed.', body: 'Stay close to clients and the wider community.' },
      { navigate: go('profile'), anchor: q('hero-profile'), fallback: q('webtab-profile'), eyebrow: 'You', title: 'Your standing.', body: 'Your coach profile, payouts and Shape Score.' },
    ];
  }

  function stepsFor(role) { return role === 'client' ? clientSteps() : coachSteps(role); }

  // Per-role seen flag: a client walkthrough must not suppress a coach's onboarding
  // (or vice-versa) in the same browser profile.
  function seenKey(role) { return 'shape.webTourSeen.' + role; }
  function markSeen(role) {
    try { localStorage.setItem(seenKey(role), '1'); } catch (e) {}
    try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals(GOAL_KEY[role], { tourSeen: true, at: new Date().toISOString() }); } catch (e) {}
  }

  function start(role) {
    if (!window.SpotlightTour) return;
    window.SpotlightTour.start(stepsFor(role), { root: document.body, accent: ACCENT[role] || ACCENT.client, isLight: false, onDone: function () { markSeen(role); } });
  }

  // The engine (spotlightTour.js) loads as a module and may not be ready when the
  // auto-show timer fires; wait for window.SpotlightTour so a new-account auto-show
  // doesn't silently no-op. (The replay path is user-initiated, so it's always ready.)
  function startWhenReady(role) {
    var tries = 0;
    (function tick() {
      if (window.SpotlightTour) { start(role); return; }
      if (tries++ > 60) return;   // ~6s ceiling, then give up rather than spin
      setTimeout(tick, 100);
    })();
  }

  function init(role) {
    window.addEventListener('shape:startTour', function () { start(role); });
    // Auto-show once for new accounts.
    (function () {
      try {
        if (localStorage.getItem(seenKey(role)) === '1') return;
      } catch (e) {}
      Promise.resolve(window.shapeDb && window.shapeDb.getUser && window.shapeDb.getUser()).then(function (u) {
        if (!u || !u.created_at) return;
        if (shouldAutoShow(u.created_at, false, Date.now(), 24)) {
          markSeen(role);            // mark first so a reload can't re-trigger
          setTimeout(function () { startWhenReady(role); }, 900); // let the first route render
        }
      }).catch(function () {});
    })();
  }

  window.ShapeDashTour = { init: init, start: start };
})();
