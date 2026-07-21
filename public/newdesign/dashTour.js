/* Website spotlight tour adapter. Loads after spotlightTour.js (window.SpotlightTour)
   and supabase.js (window.shapeDb). Each dashboard shell calls ShapeDashTour.init(role).

   Trigger (2026-07-16 rework): auto-shows ONCE per account on the FIRST signed-in visit
   to a dashboard — not gated on account age. Accounts are created in the app, so most
   members first reach the web dashboard days later; the old <24h created_at window meant
   the tour effectively never fired. Seen-state lives in DEDICATED user_goals keys
   (web_client_onboarding / web_coach_onboarding) so the web tour can never suppress the
   MOBILE app tour: saveUserGoals REPLACES the whole doc for a key, and the old code wrote
   { tourSeen } into the same client_onboarding doc the app reads. markSeen fires the
   moment the tour is actually ON SCREEN (start(), after the engine mounts) AND again in
   onDone — never on arm, so a failed engine load still can't burn the auto-show, but a
   finale CTA that navigates away can no longer lose the flag (the 2026-07-21 fix: an
   async-only onDone write was killed by the unload → the tour re-showed every login). */
(function () {
  var ACCENT = { client: '#2ee0c4', trainer: '#0a8f87', nutritionist: '#a07a2e' };
  // Dedicated web keys — NEVER write the app's client_onboarding / coach_onboarding
  // docs from here (replace-semantics would clobber the app tour's own seen flag).
  var GOAL_KEY = { client: 'web_client_onboarding', trainer: 'web_coach_onboarding', nutritionist: 'web_coach_onboarding' };

  function q(key) { return function () { return document.querySelector('[data-tour="' + key + '"]'); }; }
  function go(slug) { return function () { window.location.hash = '#' + slug; }; }

  // The floating chat launcher (globalChatButton.js) — not a route, so the step
  // anchors the button itself; when it's absent the engine centers the card.
  function chatBtn() { return document.getElementById('shape-global-chat-button'); }

  function clientSteps() {
    return [
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Welcome', title: 'Welcome to Shape.', body: 'A quick tour of everything in your dashboard — about a minute.' },
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Today', title: 'Your day, at a glance.', body: 'Your next move and the day’s plan lead here.' },
      { navigate: go('progress'), anchor: q('webtab-progress'), fallback: q('webtab-progress'), eyebrow: 'Progress', title: 'Trends & PRs.', body: 'Weight, strength, sleep, volume — your whole picture, charted.' },
      { navigate: go('workouts'), anchor: q('hero-workouts'), fallback: q('webtab-workouts'), eyebrow: 'Workouts', title: 'Your training.', body: 'Today’s session and your program live here.' },
      { navigate: go('nutrition'), anchor: q('hero-nutrition'), fallback: q('webtab-nutrition'), eyebrow: 'Nutrition', title: 'Meals & macros.', body: 'Your plan for the day, logged in a tap.' },
      { navigate: go('nutrition'), anchor: q('hero-grocery'), fallback: q('webtab-nutrition'), eyebrow: 'Grocery', title: 'Grocery lists.', body: 'Your week’s meals become a shopping list, sorted by aisle — send it to Instacart.' },
      { navigate: go('library'), anchor: q('webtab-library'), fallback: q('webtab-library'), eyebrow: 'Library', title: 'Everything you save.', body: 'Workouts, plans, recipes and grocery lists you keep — in one place.' },
      { navigate: go('team'), anchor: q('webtab-team'), fallback: q('webtab-team'), eyebrow: 'Team', title: 'Your coaches.', body: 'Your trainer and nutritionist — message or book them in a tap.' },
      { navigate: go('community'), anchor: q('hero-community'), fallback: q('webtab-community'), eyebrow: 'Community', title: 'The feed.', body: 'See what the community is doing and cheer them on.' },
      { anchor: chatBtn, eyebrow: 'Chat', title: 'Messages.', body: 'Coaches, friends and channels — plus Nora, Shape’s concierge, any time.' },
      { navigate: go('habits'), anchor: q('hero-habits'), fallback: q('webtab-habits'), eyebrow: 'Habits', title: 'Daily habits.', body: 'Small things that add up — each one feeds your Shape Score.' },
      { navigate: go('score'), anchor: q('hero-score'), fallback: q('webtab-score'), eyebrow: 'Score', title: 'Your Shape Score.', body: 'The one number that tells the truth, read every week.' },
      { navigate: go('goal'), anchor: q('webtab-goal'), fallback: q('webtab-goal'), eyebrow: 'Goal', title: 'What you’re shaping toward.', body: 'Targets, milestones and your ETA — the contract you set with yourself.' },
      { navigate: go('profile'), anchor: q('hero-profile'), fallback: q('webtab-profile'), eyebrow: 'You', title: 'Your profile.', body: 'Your living profile — climb, signals and standing.' },
      { navigate: go('today'), anchor: q('webtab-today'), fallback: q('webtab-today'), final: true, ctaLabel: 'Open Shape Radio →', eyebrow: 'Last stop', title: 'Shape Radio.', body: 'Ad-free workout mixes, curated by BPM. Free with your membership — or tap Done to stay here.', onCta: function () { window.location.href = '/newdesign/Radio.html'; } },
    ];
  }
  function coachSteps(role) {
    var plans = role === 'trainer' ? 'programs' : 'plans';
    var plansLabel = role === 'trainer' ? 'Programs' : 'Plans';
    return [
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Welcome', title: 'Your coaching tools.', body: 'A quick tour of your dashboard — about 30 seconds.' },
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Today', title: 'Who needs you.', body: 'Your day leads with the clients who need attention.' },
      { navigate: go('schedule'), anchor: q('webtab-schedule'), fallback: q('webtab-schedule'), eyebrow: 'Schedule', title: 'Your week.', body: 'Sessions, consults and availability — the calendar runs your day.' },
      { navigate: go('clients'), anchor: q('hero-clients'), fallback: q('webtab-clients'), eyebrow: 'Clients', title: 'Your roster.', body: 'Every client, sorted by who’s on track and who’s slipping.' },
      { navigate: go(plans), anchor: q('hero-' + plans), fallback: q('webtab-' + plans), eyebrow: plansLabel, title: 'Build & sell.', body: 'Create ' + plansLabel.toLowerCase() + ', assign them, and sell them in the marketplace.' },
      { navigate: go('business'), anchor: q('hero-business'), fallback: q('webtab-business'), eyebrow: 'Business', title: 'Your practice.', body: 'Revenue, payouts and clients at a glance.' },
      { navigate: go('community'), anchor: q('hero-community'), fallback: q('webtab-community'), eyebrow: 'Community', title: 'The feed.', body: 'Stay close to clients and the wider community.' },
      { anchor: chatBtn, eyebrow: 'Chat', title: 'Messages.', body: 'Clients, co-coaches and channels — plus Nora for anything Shape.' },
      { navigate: go('profile'), anchor: q('hero-profile'), fallback: q('webtab-profile'), eyebrow: 'You', title: 'Your standing.', body: 'Your coach profile, payouts and Shape Score.' },
    ];
  }

  function stepsFor(role) { return role === 'client' ? clientSteps() : coachSteps(role); }

  // Per-role AND per-account seen flag: a client walkthrough must not suppress a
  // coach's onboarding in the same browser profile, and Account A completing the
  // tour must not suppress Account B's on a shared browser (CodeRabbit, #1755).
  // The legacy unscoped key ('shape.webTourSeen.<role>') is still HONORED as seen
  // — browsers that completed the pre-rework tour shouldn't be re-toured — but no
  // longer written.
  function seenKey(role, uid) { return 'shape.webTourSeen.' + role + '.' + uid; }
  function legacySeenKey(role) { return 'shape.webTourSeen.' + role; }
  // uid = the account the tour was ARMED for (the auto-show eligibility check).
  // Persistence aborts when the active account no longer matches — a shared browser
  // switching accounts in another tab mid-tour must not stamp Account B's flags for
  // Account A's tour (CodeRabbit, #1755). The replay path passes no uid (it is
  // user-initiated, so the account completing IS the account that started).
  function markSeen(role, uid) {
    // SYNCHRONOUS localStorage first when the armed account is known — the fix
    // for the tour re-appearing on every login: the finale CTA navigates
    // (window.location.href) and the unload killed an async-only write before
    // it ever ran, so nothing was ever persisted. The key is uid-scoped, so
    // stamping the armed account is correct even if the session changed since.
    if (uid) { try { localStorage.setItem(seenKey(role, uid), '1'); } catch (e) {} }
    try {
      Promise.resolve(window.shapeDb && window.shapeDb.getUser && window.shapeDb.getUser()).then(function (u) {
        if (!u) return;
        if (uid && u.id !== uid) return; // account switched mid-tour — don't persist the cloud flag
        try { window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals(GOAL_KEY[role], { tourSeen: true, at: new Date().toISOString() }); } catch (e) {}
        try { localStorage.setItem(seenKey(role, u.id), '1'); } catch (e) {}
      }).catch(function () {});
    } catch (e) {}
  }

  function start(role, uid) {
    if (!window.SpotlightTour) return;
    window.SpotlightTour.start(stepsFor(role), { root: document.body, accent: ACCENT[role] || ACCENT.client, isLight: false, onDone: function () { markSeen(role, uid); } });
    // The engine mounts its overlay synchronously, so reaching this line means
    // the tour is ON SCREEN — persist seen NOW, not only in onDone (the second
    // half of the re-show fix: the cloud write gets the whole tour's duration
    // to land instead of racing a page unload at the finale). The original
    // worry — a failed engine LOAD burning the auto-show — can't happen here:
    // window.SpotlightTour demonstrably exists. Trade-off: a reload mid-tour no
    // longer re-offers automatically; the replay path (Settings → Take a tour)
    // covers that, and an endless re-show is far worse than a missed re-offer.
    markSeen(role, uid);
  }

  // The engine (spotlightTour.js) loads as a module and may not be ready when the
  // auto-show timer fires; wait for window.SpotlightTour so a new-account auto-show
  // doesn't silently no-op. (The replay path is user-initiated, so it's always ready.)
  function startWhenReady(role, uid) {
    var tries = 0;
    (function tick() {
      if (window.SpotlightTour) { start(role, uid); return; }
      if (tries++ > 60) return;   // ~6s ceiling, then give up rather than spin
      setTimeout(tick, 100);
    })();
  }

  function init(role) {
    window.addEventListener('shape:startTour', function () { start(role); });
    // Auto-show once per account: first signed-in dashboard visit, not seen by THIS
    // account on this browser (localStorage fast-path) or anywhere (the dedicated
    // cloud flag). Failure split: auth unresolved → fail CLOSED (can't confirm a
    // signed-in member; the next visit retries), goals read failed after auth
    // confirmed → fail OPEN like the mobile tours (worst case a seen member gets a
    // one-tap-skippable repeat, never a lost first-run).
    (function () {
      var db = window.shapeDb;
      if (!db || !db.getUser) return;
      Promise.resolve(db.getUser()).then(function (u) {
        if (!u) return; // signed-out demo view — no tour
        try {
          if (localStorage.getItem(seenKey(role, u.id)) === '1') return;
          if (localStorage.getItem(legacySeenKey(role)) === '1') return; // pre-rework completion
        } catch (e) {}
        var goals = db.getUserGoals ? Promise.resolve(db.getUserGoals(GOAL_KEY[role])).catch(function () { return null; }) : Promise.resolve(null);
        return goals.then(function (d) {
          if (d && d.tourSeen) {
            try { localStorage.setItem(seenKey(role, u.id), '1'); } catch (e) {} // sync this browser
            return;
          }
          // Seen is marked when the tour actually renders (inside start()) and
          // again in onDone — never HERE, so a failed engine load doesn't
          // consume the auto-show.
          setTimeout(function () { startWhenReady(role, u.id); }, 900); // let the first route render
        });
      }).catch(function () {});
    })();
  }

  window.ShapeDashTour = { init: init, start: start };
})();
