/* Website spotlight tours and guides. Loads after spotlightTour.js (window.SpotlightTour)
   and supabase.js (window.shapeDb). Each dashboard shell calls ShapeDashTour.init(role).

   Two kinds of tour (owner, 2026-11-10: "have viewing the tutorial once initially, have the option
   to go through it again at a later date ... make sure user has option to cancel tutorial"):
   - The WELCOME: auto-shows ONCE per account on the first signed-in dashboard visit. For a coach it
     is five stops; for a member it is the dashboard tour it always was. Every step has Skip tour,
     and skipping says where to take it again (Settings → Guides for a coach, Settings for a
     member). Replay is Settings' button (the `shape:startTour` event).
   - The GUIDES (coaches): a few steps on one page, pointing at what can be done there. Opened from
     the Guide button beside a page's name (trainerDashboard.jsx, DashGuideButton) or from Settings →
     Guides (dashProfileExtras.jsx, DashGuidesCard). A finished guide is ticked in the account's
     `web_coach_guides` document.

   Trigger (2026-07-16 rework): not gated on account age. Accounts are created in the app, so most
   members first reach the web dashboard days later; the old <24h created_at window meant the tour
   effectively never fired. Seen-state lives in DEDICATED user_goals keys (web_client_onboarding /
   web_coach_onboarding) so the web tour can never suppress the MOBILE app tour: saveUserGoals
   REPLACES the whole doc for a key, and the old code wrote { tourSeen } into the same
   client_onboarding doc the app reads. markSeen fires the moment the tour is actually ON SCREEN
   (start(), after the engine mounts) AND again in onDone — never on arm, so a failed engine load
   still can't burn the auto-show, but a finale CTA that navigates away can no longer lose the flag
   (the 2026-07-21 fix: an async-only onDone write was killed by the unload → the tour re-showed
   every login). */
(function () {
  // The dashboard's paper is stamped on <html data-paper> before first paint
  // (White is the default and stamps nothing; Bone is the other light skin, and
  // every other skin is dark). The tour card follows it, and
  // the client accent is the paper's own teal — the dark paper's bright teal
  // reads at 1.6:1 on white. The light values are dash.css's text tokens
  // (--sh-accent / --sh-gold), which clear 4.5:1 on the card.
  function isDarkPaper() { try { return ['dark', 'carbon', 'night', 'glass'].indexOf(document.documentElement.getAttribute('data-paper')) >= 0; } catch (e) { return false; } }
  var ACCENT_DARK = { client: '#2ee0c4', trainer: '#0a8f87', nutritionist: '#a07a2e' };
  var ACCENT_LIGHT = { client: '#0a7a72', trainer: '#0a7a72', nutritionist: '#86662a' };
  // Night is the low-blue-light skin, so its tour is too: the card, ink, label and accents
  // are Night's own tokens from dash.css (--sh-card, --sh-ink, --sh-deep, --sh-accent and
  // --sh-gold), where any other dark skin's tour keeps the dark teal (Codex, #2481).
  var NIGHT = { paper: '#1e150c', ink: '#f0d4a4', onAccent: '#1c0f02', accent: { client: '#ffa01e', trainer: '#ffa01e', nutritionist: '#e2c25a' } };
  function isNightPaper() { try { return document.documentElement.getAttribute('data-paper') === 'night'; } catch (e) { return false; } }
  // Dedicated web keys — NEVER write the app's client_onboarding / coach_onboarding
  // docs from here (replace-semantics would clobber the app tour's own seen flag).
  var GOAL_KEY = { client: 'web_client_onboarding', trainer: 'web_coach_onboarding', nutritionist: 'web_coach_onboarding' };
  // A coach's guide progress: { welcome, note, chapters: { <role>:<guide>: <day finished> } }. One
  // document for both coach roles, as the welcome's flag is; each role's ticks are its own.
  var GUIDE_KEY = 'web_coach_guides';

  // Where to find the tour again, said when it is skipped.
  var SKIP_NOTE = {
    client: 'Tour skipped. You can take it again any time from Settings.',
    coach: 'Tour skipped. You can take it again any time from Settings → Guides.',
  };

  function isCoach(role) { return role === 'trainer' || role === 'nutritionist'; }
  function q(key) { return function () { return document.querySelector('[data-tour="' + key + '"]'); }; }
  function sel(css) { return function () { return document.querySelector(css); }; }
  // The first match that is laid out: a control drawn twice for two widths (the Guide button,
  // Hours & rules) has one copy hidden.
  function shown(css) {
    return function () {
      var all = document.querySelectorAll(css);
      for (var k = 0; k < all.length; k++) { if (all[k].getClientRects && all[k].getClientRects().length) return all[k]; }
      return null;
    };
  }
  // The element only once it holds something: an empty library grid is a line, not a place.
  function sized(css) {
    return function () { var e = document.querySelector(css); if (!e) return null; var r = e.getBoundingClientRect(); return r.height >= 24 ? e : null; };
  }
  // A button by its words, inside `scope` (the page has no other handle on it).
  function byText(scope, text) {
    return function () {
      var s = scope ? document.querySelector(scope) : document;
      if (!s) return null;
      var els = s.querySelectorAll('button, a');
      for (var k = 0; k < els.length; k++) { if ((els[k].textContent || '').trim() === text) return els[k]; }
      return null;
    };
  }
  // A Settings card by its eyebrow (Settings' cards carry no other handle).
  function eyebrowCard(text) {
    return function () {
      var els = document.querySelectorAll('.dash-eyebrow');
      for (var k = 0; k < els.length; k++) {
        if ((els[k].textContent || '').trim() === text && els[k].getClientRects().length) return els[k].closest('.dash-plate') || els[k].parentElement;
      }
      return null;
    };
  }
  function closest(css, up) { return function () { var e = document.querySelector(css); return e ? (e.closest(up) || e) : null; }; }
  function go(slug) { return function () { window.location.hash = '#' + slug; }; }
  // Open one of a page's own tabs (Business's sections), on that page.
  function openTab(slug, list, label) {
    return function () {
      if ((window.location.hash || '').replace(/^#/, '').split('?')[0] !== slug) window.location.hash = '#' + slug;
      return new Promise(function (res) {
        var tries = 0;
        (function tick() {
          var b = byText('[role="tablist"][aria-label="' + list + '"]', label)();
          if (b) { if (b.getAttribute('aria-selected') !== 'true') b.click(); res(); return; }
          if (tries++ > 30) { res(); return; }
          setTimeout(tick, 80);
        })();
      });
    };
  }

  // The floating chat launcher (globalChatButton.js) — not a route, so the step
  // anchors the button itself; when it's absent the engine centers the card.
  function chatBtn() { return document.getElementById('shape-global-chat-button'); }
  var guideBtn = shown('[data-guide-btn]');

  // "Set up with Nora" (the owner, 2026-09-29: Nora "can fill evreything out for you ... and also setup
  // your account for you"): the Welcome step's other way on. The tour ends, and Nora opens with the ask
  // in her composer for them to send; she asks, drafts one card (set_up_account), and nothing is saved
  // until they confirm it.
  function setUpWithNora(draft) {
    return function () { try { if (window.__openChatTo) window.__openChatTo({ who: 'Nora', tab: 'support', draft: draft }); } catch (e) {} };
  }
  function clientSteps() {
    return [
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Welcome', title: 'Welcome to Shape.', body: 'A quick tour of everything in your dashboard — about a minute. Or let Nora set your account up with you.', altLabel: 'Set up with Nora', onAlt: setUpWithNora('Set up my account with me.') },
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Today', title: 'Your day, at a glance.', body: 'Your next move and the day’s plan lead here.' },
      { navigate: go('progress'), anchor: q('webtab-progress'), fallback: q('webtab-progress'), eyebrow: 'Progress', title: 'Trends & PRs.', body: 'Weight, strength, sleep, volume — your whole picture, charted.' },
      { navigate: go('workouts'), anchor: q('hero-workouts'), fallback: q('webtab-workouts'), eyebrow: 'Workouts', title: 'Your training.', body: 'Today’s session and your program live here.' },
      { navigate: go('nutrition'), anchor: q('hero-nutrition'), fallback: q('webtab-nutrition'), eyebrow: 'Nutrition', title: 'Meals & macros.', body: 'Your plan for the day, logged in a tap.' },
      { navigate: go('nutrition'), anchor: q('hero-grocery'), fallback: q('webtab-nutrition'), eyebrow: 'Grocery', title: 'Grocery lists.', body: 'Your week’s meals become a shopping list, sorted by aisle — send it to Instacart.' },
      { navigate: go('library'), anchor: q('webtab-library'), fallback: q('webtab-library'), eyebrow: 'Library', title: 'Everything you save.', body: 'Workouts, plans, recipes and grocery lists you keep — in one place.' },
      { navigate: go('team'), anchor: q('webtab-team'), fallback: q('webtab-team'), eyebrow: 'Team', title: 'Your coaches.', body: 'Your trainer and nutritionist — message or book them in a tap.' },
      { anchor: chatBtn, eyebrow: 'Chat', title: 'Messages & the Wall.', body: 'The feed, your coaches, friends and channels — plus Nora, Shape’s concierge, any time.' },
      { navigate: go('habits'), anchor: q('hero-habits'), fallback: q('webtab-habits'), eyebrow: 'Habits', title: 'Daily habits.', body: 'Small things that add up — each one feeds your Shape Score.' },
      { navigate: go('score'), anchor: q('hero-score'), fallback: q('webtab-score'), eyebrow: 'Score', title: 'Your Shape Score.', body: 'The one number that tells the truth, read every week.' },
      { navigate: go('goal'), anchor: q('webtab-goal'), fallback: q('webtab-goal'), eyebrow: 'Goal', title: 'What you’re shaping toward.', body: 'Targets, milestones and your ETA — the contract you set with yourself.' },
      { navigate: go('profile'), anchor: q('hero-profile'), fallback: q('webtab-profile'), eyebrow: 'You', title: 'Your profile.', body: 'Your living profile — climb, signals and standing.' },
      { navigate: go('today'), anchor: q('webtab-today'), fallback: q('webtab-today'), final: true, ctaLabel: 'Open Shape Radio →', eyebrow: 'Last stop', title: 'Shape Radio.', body: 'One live channel and your coaches’ playlists, ad-free. Free with your membership — or tap Done to stay here.', onCta: function () { window.location.href = '/newdesign/Radio.html'; } },
    ];
  }

  // ── Coaches ──────────────────────────────────────────────────────────────────────────────────
  // The coach welcome: five stops, the map only. What each page does is its guide's job.
  function coachSteps(role) {
    var plans = role === 'trainer' ? 'Programs' : 'Plans';
    return [
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Welcome', title: 'Your coaching tools.', body: 'Five stops, about a minute. Skip it if you like: it stays in Settings → Guides. Or let Nora set up your profile with you.', altLabel: 'Set up with Nora', onAlt: setUpWithNora('Set up my coach profile with me.') },
      { navigate: go('today'), anchor: sel('section[aria-label="Needs you"]'), fallback: q('hero-today'), eyebrow: 'Today', title: 'Start each day with Needs you.', body: 'Clients who need attention, check-ins to review and replies waiting, one tab apart. It fills in as clients join.' },
      { anchor: sel('.dash-rail-panel'), fallback: q('webtab-today'), eyebrow: 'Your dashboard', title: 'Everything else, one click away.', body: 'Week review, Schedule, Clients, ' + plans + ' and Playlists for your coaching; Business, Goal and Score for the practice; Profile and Settings at the foot.' },
      { anchor: shown('.dash-rail .shape-dash-payout'), fallback: q('webtab-profile'), eyebrow: 'The marketplace', title: 'Get listed.', body: 'Clients can find you on the marketplace once you have a photo, a monthly rate and payouts set up. Your profile shows which you still need; payouts are set up under Business → Money.' },
      { anchor: guideBtn, fallback: chatBtn, final: true, ctaLabel: 'See all guides →', onCta: openGuideList, eyebrow: 'Last stop', title: 'Learn as you go.', body: 'Every page has a Guide button beside its name: a minute on what you can do there. Ask Nora, from the button in the corner, about anything else.' },
    ];
  }

  // The guides, one per page. `routes` are the pages it is the Guide for; its steps open the first.
  // Words follow what each page does today (coaches.jsx holds the same facts for the public page).
  function coachGuides(role) {
    var nutri = role === 'nutritionist';
    var plansRoute = nutri ? 'plans' : 'programs';
    var g = [];
    g.push({ key: 'today', title: 'Today & your widgets', routes: ['today'], steps: [
      { navigate: go('today'), wait: 2500, anchor: sel('.dash-today-now'), fallback: q('hero-today'), eyebrow: 'Today', title: 'Your day, on the left.', body: 'The ' + (nutri ? 'consult' : 'session') + ' up next, what you know about that client and a button to message them, above today’s timeline.' },
      { anchor: sel('section[aria-label="Needs you"]'), fallback: q('dash-widgets'), eyebrow: 'Today', title: 'Needs you.', body: 'One tab each for client attention, new clients’ first 30 days, check-ins to review, replies waiting and ' + (nutri ? 'the plans due next' : 'next week’s programming') + '.' },
      { anchor: sel('.grid-stack-item'), fallback: q('dash-widgets'), eyebrow: 'Today', title: 'Arrange your cards.', body: 'Drag a card by its grip to move it and pull its right edge to resize it. Its ⚙ picks what it shows, and × hides it.' },
      { anchor: q('dash-widgets'), fallback: q('hero-today'), eyebrow: 'Today', title: 'Add widgets, keep dashboards.', body: 'Add or remove widgets here. Save a layout as a dashboard of its own, switch between them, or start from the Coaching preset.' },
    ] });
    g.push({ key: 'week', title: 'Week review', routes: ['week'], steps: [
      { navigate: go('week'), wait: 2500, anchor: sel('section[aria-label="To review"]'), fallback: q('webtab-week'), eyebrow: 'Week', title: 'The end-of-week review.', body: 'Each client’s weekly check-in, one row each. Start review takes you through them one at a time; Mark all reviewed closes the week. Both wake up once check-ins arrive.' },
      { anchor: sel('section[aria-label="What stands out"]'), fallback: q('webtab-week'), eyebrow: 'Week', title: 'What stands out.', body: 'The patterns across the roster’s check-ins this week, pulled out for you.' },
      { anchor: sel('section[aria-label="The roster\'s check-ins"]'), fallback: q('webtab-week'), eyebrow: 'Week', title: 'Every check-in, one table.', body: 'Ratings, the win and the struggle they wrote, what they asked you, and adherence against the week before. Open a row to leave a private note, or reply and mark it reviewed in one go.' },
    ] });
    g.push({ key: 'schedule', title: 'Schedule & your hours', routes: ['schedule'], steps: [
      { navigate: go('schedule'), wait: 2500, anchor: sel('[role="group"][aria-label="View"]'), fallback: sel('[data-schedule-plate]'), eyebrow: 'Schedule', title: 'Day, week or month.', body: 'Clients book inside Shape, into the hours you open, and every booking reads in your own time zone.' },
      { anchor: shown('[data-settings-tab]'), fallback: sel('[data-schedule-plate]'), eyebrow: 'Schedule', title: 'Open your hours.', body: 'Hours & rules holds your weekly open hours, time off, and the booking rules: buffers, notice, sessions a day and the length of a free intro.' },
      { anchor: byText('[data-schedule-plate]', '+ Book'), fallback: sel('[data-schedule-plate]'), eyebrow: 'Schedule', title: 'Book a session.', body: 'Use + Book, or click any empty time on the calendar. A booking can repeat weekly.' },
      { anchor: sel('[data-schedule-plate]'), fallback: q('webtab-schedule'), eyebrow: 'Schedule', title: 'Move a booking.', body: 'Drag a session to a new time. You confirm the move, for that one or the ones after it, and the client is notified.' },
      { anchor: sel('[data-requests]'), fallback: sel('[data-schedule-plate]'), eyebrow: 'Schedule', title: 'Requests and your own calendar.', body: 'Requests to confirm show above the calendar. To see your sessions in Google, Apple or Outlook, copy your calendar feed in Settings. It is read-only.' },
    ] });
    g.push({ key: 'clients', title: 'Clients', routes: ['clients'], steps: [
      { navigate: go('clients'), wait: 2500, anchor: sel('[role="tablist"][aria-label="Which clients"]'), fallback: q('hero-clients'), eyebrow: 'Clients', title: 'Your clients, and shared ones.', body: 'Your own roster, and the clients another coach shares with you.' },
      { anchor: sel('[data-roster-health]'), fallback: q('hero-clients'), eyebrow: 'Clients', title: 'Who needs you, counted.', body: 'Each count is a filter: click one to see just those clients.' },
      { anchor: sel('input[aria-label="Search clients"]'), fallback: q('hero-clients'), eyebrow: 'Clients', title: 'Find, sort, export.', body: 'Search by name, sort any column with a value behind it, and export the roster as a spreadsheet.' },
      { anchor: sel('[data-roster-row]'), fallback: q('hero-clients'), eyebrow: 'Clients', title: 'Open a client.', body: 'A row opens their summary beside the list, with a link to their full file. Invite client and the Live console are at the top of the page.' },
    ] });
    g.push({ key: 'client', title: 'A client’s file', routes: ['client'], from: 'a client’s file', steps: [
      { wait: 2500, anchor: q('hero-client'), eyebrow: 'Client', title: 'One client, one file.', body: 'Their plan, check-ins, trends, measurements and sessions, on one page. Assign a ' + (nutri ? 'plan' : 'program') + ' or message them from the top.' },
      { anchor: sel('textarea[aria-label="Private coach note"]'), fallback: q('hero-client'), eyebrow: 'Client', title: 'Your private note.', body: 'What you are watching, what you told them, what to check next week. It saves with the client’s file, for you.' },
      { anchor: q('hero-client'), eyebrow: 'Client', title: 'Read down the page.', body: (nutri ? 'Macros' : 'Key lifts') + ', the body trend, the latest check-in, their care team, goals, measurements and photos, and the sessions coming up.' },
    ] });
    g.push(nutri ? { key: 'programs', title: 'Meal plans', routes: ['plans'], steps: [
      { navigate: go(plansRoute), wait: 2500, anchor: byText(null, '+ New meal plan'), fallback: q('hero-plans'), eyebrow: 'Plans', title: 'Write a meal plan.', body: 'A week of meals for a goal phase.', points: ['Training, rest and travel days, each with its own meals', 'Drag recipes in from Shape Kitchen; the totals update as you go', 'Assign it from the panel beside the plan, with its grocery list'] },
      { anchor: sel('.dash-lib-top'), fallback: q('hero-plans'), eyebrow: 'Plans', title: 'Who needs a plan.', body: 'The clients whose plan is due next. Assign all takes you through each one with a suggested plan.' },
      { anchor: sized('.dash-lib-grid'), fallback: q('hero-plans'), eyebrow: 'Plans', title: 'Your library.', body: 'Open a card to edit it, or Assign it from the card. Its ⋯ menu uses it as a template or deletes it. With none yet, Nora can draft one.' },
    ] } : { key: 'programs', title: 'Programs', routes: ['programs'], steps: [
      { navigate: go(plansRoute), wait: 2500, anchor: sel('.dbu-library-actions'), fallback: q('hero-programs'), eyebrow: 'Programs', title: 'Write a workout or a program.', body: 'A single day for one session, or a program for a block of weeks. Both open the builder.', points: ['Plan or Sheet view; add days and weeks', 'Copy a day to other weeks, see it as the client will, or draft it with AI', 'Publish puts it on your profile; Assign sends it to clients'] },
      { anchor: sel('.dash-lib-top'), fallback: q('hero-programs'), eyebrow: 'Programs', title: 'Who needs a program next.', body: 'Clients whose program ends next week with nothing after it. Review opens them one by one.' },
      { anchor: sized('.dash-lib-grid'), fallback: q('hero-programs'), eyebrow: 'Programs', title: 'Your library.', body: 'Open a card to edit it, or Assign it from the card. Its ⋯ menu uses it as a template, updates future assignments or deletes it. With none yet, Nora can draft one.' },
    ] });
    var tab = '[role="tablist"][aria-label="Business sections"] [aria-selected="true"]';
    g.push({ key: 'business', title: 'Business & payouts', routes: ['business'], steps: [
      { navigate: go('business'), wait: 2500, anchor: sel('[role="tablist"][aria-label="Business sections"]'), fallback: q('hero-business'), eyebrow: 'Business', title: 'Your practice, five ways.', body: 'Overview, Money, Plan, Growth and Retention. Each is a board of cards you can arrange, like Today.' },
      { navigate: openTab('business', 'Business sections', 'Money'), anchor: sel('[data-dbz-stripe]'), fallback: sel(tab), eyebrow: 'Business · Money', title: 'Get paid.', body: 'Set up payouts with Stripe here. Money also shows when you get paid, your renewals and your payout history as a CSV.' },
      { navigate: openTab('business', 'Business sections', 'Plan'), anchor: sel(tab), fallback: q('hero-business'), eyebrow: 'Business · Plan', title: 'Plan the next 12 months.', body: 'Move your price, client count and churn and see where the practice lands.' },
      { navigate: openTab('business', 'Business sections', 'Growth'), anchor: sel(tab), fallback: q('hero-business'), eyebrow: 'Business · Growth', title: 'Where clients come from.', body: 'The marketplace funnel, where your clients found you, and your profile link to copy and share.' },
      { navigate: openTab('business', 'Business sections', 'Retention'), anchor: sel(tab), fallback: q('hero-business'), eyebrow: 'Business · Retention', title: 'Who stays.', body: 'Who might leave, what a client is worth, how long clients stay and the reasons people gave.' },
    ] });
    g.push({ key: 'profile', title: 'Profile & listing', routes: ['profile'], steps: [
      { navigate: go('profile'), wait: 2500, anchor: q('hero-profile'), fallback: q('webtab-profile'), eyebrow: 'Profile', title: 'What clients see.', body: 'Your public page on the marketplace: credentials, ' + (nutri ? 'practice' : 'coaching') + ' philosophy, plans, reviews and music.' },
      { anchor: sel('[data-edit-profile]'), fallback: q('hero-profile'), eyebrow: 'Profile', title: 'Edit your profile.', body: 'About, highlights, your intro film, the cover and your motto. ' + (nutri ? 'Your kitchen' : 'Your studio') + ', the wall photo and About’s photos are edited in the app, under Make it yours.' },
      { anchor: sel('[data-px-card="rates"]'), fallback: sel('.px-setup'), eyebrow: 'Profile', title: 'Your rate and your listing.', body: 'Set your monthly rate here. The card says what your listing still needs before the marketplace shows it: a rate, payouts and a photo.' },
      { anchor: sel('[data-capacity-card]'), fallback: sel('.px-setup'), eyebrow: 'Profile', title: 'Full? Pause new clients.', body: 'Stop taking new clients while you are full, and open again when you have room.' },
    ] });
    g.push({ key: 'playlists', title: 'Playlists', routes: ['playlists'], steps: [
      { navigate: go('playlists'), wait: 2500, anchor: byText(null, '＋ New playlist'), fallback: sel('[role="tablist"][aria-label="Playlists views"]'), eyebrow: 'Playlists', title: 'Add a playlist.', body: 'Connect your music library, or paste a Spotify or Apple Music link.' },
      { anchor: sel('[role="tablist"][aria-label="Playlists views"]'), fallback: q('webtab-playlists'), eyebrow: 'Playlists', title: 'Library, Attach, Builder.', body: nutri
        ? 'Attach puts playlists on meals in bulk, and the client gets a play button in their kitchen. Builder edits the tracks and notes.'
        : 'Attach puts playlists on program days in bulk, and every client on that program gets a play button on the session. Builder edits the tracks and notes.' },
    ] });
    g.push({ key: 'goal', title: 'Goal & Score', routes: ['goal', 'score'], steps: [
      { navigate: go('goal'), wait: 2500, anchor: sel('[data-cgs-first]'), fallback: byText(null, '+ New goal'), eyebrow: 'Goal', title: 'Set your own targets.', body: 'Clients, revenue, ' + (nutri ? '' : 'programs, ') + 'adherence: each with a date and the pace that gets you there. A goal can read its progress from your live figures.' },
      { navigate: go('score'), wait: 2500, anchor: sel('#score-earn'), fallback: q('webtab-score'), eyebrow: 'Score', title: 'Your coach score.', body: (nutri
        ? 'Added up from your active clients and the sessions they complete.'
        : 'Added up from your active clients, the sessions they complete and the programs you publish.') + ' It ranks you on the marketplace and earns the verified badge.' },
    ] });
    // Settings shows one tab at a time (owner, 2026-11-10), so each stop opens the tab its card is on.
    var setTab = function (label) { return openTab('settings', 'Settings sections', label); };
    g.push({ key: 'settings', title: 'Settings', routes: ['settings'], steps: [
      { navigate: setTab('General'), wait: 2500, anchor: eyebrowCard('Your dashboard opens on'), fallback: q('webtab-settings'), eyebrow: 'Settings', title: 'Your first page.', body: 'Your dashboard opens on the page you pick here.' },
      { navigate: setTab('General'), anchor: sel('[role="radiogroup"][aria-label="Dashboard skin"]'), fallback: q('webtab-settings'), eyebrow: 'Settings', title: 'Pick a skin.', body: 'Light, dark and the rest. Night takes the blue out for late evenings.' },
      { navigate: setTab('Client flags'), anchor: eyebrowCard('Flags · when a client reaches you'), fallback: q('webtab-settings'), eyebrow: 'Settings · Client flags', title: 'When a client is flagged.', body: 'Each number decides when a client is flagged to you. Change any of them for your practice; the House chip puts Shape\'s default back.' },
      { navigate: setTab('Notifications'), anchor: function () { return eyebrowCard('Notifications · what reaches you')() || eyebrowCard('Notifications')(); }, fallback: q('webtab-settings'), eyebrow: 'Settings · Notifications', title: 'Notifications and quiet hours.', body: 'Choose what reaches you. During your quiet hours a notice waits until they end.' },
      { navigate: setTab('Calendar'), anchor: closest('[aria-label="Your calendar feed link"]', '.dash-plate'), fallback: q('webtab-settings'), eyebrow: 'Settings · Calendar', title: 'Your calendar feed.', body: 'Copy this link into Google Calendar, Apple Calendar or Outlook to see your sessions there. It is read-only; Reset makes a new link.' },
      { navigate: setTab('Guides'), anchor: q('dash-guides'), fallback: q('webtab-settings'), eyebrow: 'Settings · Guides', title: 'Guides, any time.', body: 'Every guide is listed here and ticked once you finish it. The welcome tour is here too.' },
    ] });
    g.push({ key: 'chat', title: 'Nora, chat & search', routes: [], steps: [
      { anchor: sel('#shape-global-chat-button .sgc-nora'), fallback: chatBtn, eyebrow: 'Nora', title: 'Ask Nora.', body: 'Ask how anything in Shape works, or have her draft a program or set up your profile; nothing is saved until you confirm. Select text on any page to ask her about it.' },
      { anchor: sel('#shape-global-chat-button .sgc-chat'), fallback: chatBtn, eyebrow: 'Chat', title: 'Messages and the Wall.', body: 'Your clients, co-coaches and channels, and the Wall, the community feed.' },
      { anchor: shown('[aria-label="Search Shape"]'), fallback: chatBtn, eyebrow: 'Search', title: 'Search Shape.', body: 'Find anything from the bar at the top of every page.' },
    ] });
    return g;
  }

  // ── Progress ─────────────────────────────────────────────────────────────────────────────────
  // Two copies of the document (this browser's and the account's) merge without losing a tick:
  // the earliest day a thing was done wins, and nothing is ever unticked by a merge.
  function earliest(a, b) { return !a ? (b || null) : !b ? a : (String(a) <= String(b) ? a : b); }
  function mergeProgress(a, b) {
    a = a && typeof a === 'object' ? a : {};
    b = b && typeof b === 'object' ? b : {};
    var out = { chapters: {} };
    var w = earliest(a.welcome, b.welcome); if (w) out.welcome = w;
    var n = earliest(a.note, b.note); if (n) out.note = n;
    [a.chapters, b.chapters].forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      Object.keys(c).forEach(function (k) { if (c[k]) out.chapters[k] = earliest(out.chapters[k], c[k]); });
    });
    return out;
  }

  var ROLE = null, UID = null, PROG = { chapters: {} };
  // A tick is kept per role: a coach with both listings has a trainer's dashboard and a
  // nutritionist's, whose guides share keys ('programs' is Programs for one and Meal plans for the
  // other) but not their pages, so finishing one must not tick the other (Codex, #2677).
  function tickKey(role, key) { return role + ':' + key; }
  function progLocalKey(uid) { return 'shape.webGuides.' + uid; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function announce() { try { window.dispatchEvent(new Event('shape:guides')); } catch (e) {} }
  function readLocal(uid) { try { return JSON.parse(localStorage.getItem(progLocalKey(uid)) || 'null'); } catch (e) { return null; } }
  function writeLocal(uid, doc) { try { localStorage.setItem(progLocalKey(uid), JSON.stringify(doc)); } catch (e) {} }

  // Read, merge, write back: saveUserGoals replaces the whole document, so a write that skipped the
  // read would drop the ticks made in another browser. Bound to the account the dashboard loaded for;
  // a read that failed writes nothing (the local copy keeps the tick for the next try).
  function recordProgress(patch) {
    PROG = mergeProgress(PROG, patch);
    announce();
    var uid = UID;
    if (!uid) return;
    writeLocal(uid, PROG);
    var db = window.shapeDb;
    if (!db || !db.getUserGoals || !db.saveUserGoals) return;
    try {
      Promise.resolve(db.getUserGoals(GUIDE_KEY, { expectedUserId: uid })).then(function (remote) {
        if (remote == null || UID !== uid) return;
        var merged = mergeProgress(remote, PROG);
        PROG = mergeProgress(PROG, merged);
        writeLocal(uid, PROG);
        return db.saveUserGoals(GUIDE_KEY, merged, { expectedUserId: uid });
      }).catch(function () {});
    } catch (e) {}
  }
  function loadProgress(uid) {
    UID = uid;
    PROG = mergeProgress(PROG, readLocal(uid));
    announce();
    var db = window.shapeDb;
    if (!db || !db.getUserGoals) return Promise.resolve(null);
    // Resolves null when the account's copy couldn't be read: the caller then decides nothing.
    return Promise.resolve(db.getUserGoals(GUIDE_KEY, { expectedUserId: uid })).then(function (remote) {
      if (remote == null || UID !== uid) return null;
      PROG = mergeProgress(PROG, remote); writeLocal(uid, PROG); announce();
      return PROG;
    }).catch(function () { return null; });
  }

  // ── Guides: which one a page has, the list, starting one ─────────────────────────────────────
  function routeNow() { return ((window.location.hash || '').replace(/^#/, '').split('?')[0].split('/')[0] || 'today').toLowerCase(); }
  function guideForRoute(role, route) {
    if (!isCoach(role)) return null;
    var all = coachGuides(role);
    for (var k = 0; k < all.length; k++) { if (all[k].routes.indexOf(route) >= 0) return all[k]; }
    return null;
  }
  function guideHere() {
    var g = guideForRoute(ROLE, routeNow());
    return g ? { key: g.key, title: g.title, done: !!PROG.chapters[tickKey(ROLE, g.key)] } : null;
  }
  function list() {
    if (!isCoach(ROLE)) return [];
    var here = routeNow();
    return coachGuides(ROLE).map(function (g) {
      // A client's file has no address of its own to open from Settings: it is taken from the file.
      var startable = g.key !== 'client' || here === 'client';
      return { key: g.key, title: g.title, steps: g.steps.length, done: !!PROG.chapters[tickKey(ROLE, g.key)], startable: startable,
        hint: startable ? '' : 'Open a client’s file, then press Guide.' };
    });
  }
  function openGuideList() {
    // Settings' Guides tab (Settings shows one tab at a time; the page follows ?section=).
    window.location.hash = '#settings?section=guides';
    var tries = 0;
    (function tick() {
      var card = document.querySelector('[data-tour="dash-guides"]');
      if (card) { try { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {} return; }
      if (tries++ < 40) setTimeout(tick, 100);
    })();
  }
  function cardStyle(role) {
    var dark = isDarkPaper(); var night = isNightPaper();
    var ACCENT = night ? NIGHT.accent : dark ? ACCENT_DARK : ACCENT_LIGHT;
    return {
      root: document.body, accent: ACCENT[role] || ACCENT.client, isLight: !dark,
      paper: night ? NIGHT.paper : undefined, ink: night ? NIGHT.ink : undefined, onAccent: night ? NIGHT.onAccent : undefined,
    };
  }
  function startGuide(key) {
    if (!window.SpotlightTour || !isCoach(ROLE)) return;
    var all = coachGuides(ROLE), g = null;
    for (var k = 0; k < all.length; k++) { if (all[k].key === key) g = all[k]; }
    if (!g) return;
    var o = cardStyle(ROLE);
    var role = ROLE;
    o.onDone = function (reason) { if (reason === 'finished') { var p = { chapters: {} }; p.chapters[tickKey(role, g.key)] = today(); recordProgress(p); } };
    window.SpotlightTour.start(g.steps, o);
  }

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
    // A coach who has seen the welcome needs no "New: guides" note either.
    if (isCoach(role)) recordProgress({ welcome: today(), note: today() });
  }

  function start(role, uid) {
    if (!window.SpotlightTour) return;
    var o = cardStyle(role);
    var dark = isDarkPaper();
    window.SpotlightTour.start(stepsFor(role), {
      root: o.root, accent: o.accent, isLight: !dark,
      paper: o.paper, ink: o.ink, onAccent: o.onAccent,
      skipNote: isCoach(role) ? SKIP_NOTE.coach : SKIP_NOTE.client,
      onDone: function () { markSeen(role, uid); },
    });
    // The engine mounts its overlay synchronously, so reaching this line means
    // the tour is ON SCREEN — persist seen NOW, not only in onDone (the second
    // half of the re-show fix: the cloud write gets the whole tour's duration
    // to land instead of racing a page unload at the finale). The original
    // worry — a failed engine LOAD burning the auto-show — can't happen here:
    // window.SpotlightTour demonstrably exists. Trade-off: a reload mid-tour no
    // longer re-offers automatically; the replay path (Settings → Guides / Take a
    // tour) covers that, and an endless re-show is far worse than a missed re-offer.
    markSeen(role, uid);
  }
  function stepsFor(role) { return role === 'client' ? clientSteps() : coachSteps(role); }

  // A coach who saw the old tour before the guides existed gets one quiet line, once: not the
  // welcome again (owner, 2026-11-10). It never covers the page and goes on its own.
  function showNewNote() {
    if (document.querySelector('[data-guide-new]')) return;
    recordProgress({ note: today() });
    var box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.setAttribute('data-guide-new', '');
    box.setAttribute('data-guide-wait', '');
    box.className = 'dash-guide-new';
    box.innerHTML = '<div class="dash-guide-new-k">New</div><div class="dash-guide-new-t">A guide for every page. Press <b>Guide</b> beside a page’s name to see what you can do there.</div>' +
      '<div class="dash-guide-new-a"><button type="button" data-a="show">Show me</button><button type="button" data-a="x" aria-label="Dismiss">×</button></div>';
    var close = function () { try { box.remove(); } catch (e) {} };
    box.querySelector('[data-a="x"]').onclick = close;
    box.querySelector('[data-a="show"]').onclick = function () { close(); var g = guideHere(); startGuide(g ? g.key : 'today'); };
    document.body.appendChild(box);
    setTimeout(close, 20000);
  }

  // The engine (spotlightTour.js) loads as a module and may not be ready when the
  // auto-show timer fires; wait for window.SpotlightTour so a new-account auto-show
  // doesn't silently no-op. (The replay path is user-initiated, so it's always ready.)
  function startWhenReady(role, uid) {
    var tries = 0;
    (function tick() {
      // Every account's first-run tour, free or paid (owner, 2026-11-10: an account is free, and
      // a free account draws the same dashboard). Only a known minor goes without: ClientApp.html
      // shows them the age page, and a tour over it would point at nothing. Wait for the
      // shell's membership answer (left on window), then decide.
      if (role === 'client') {
        var m = window.__shapeClientMembership;
        if (!m) { if (tries++ > 60) return; setTimeout(tick, 100); return; }
        if (m.signedIn && m.ageRestricted === true) return;
      }
      if (window.SpotlightTour) { start(role, uid); return; }
      if (tries++ > 60) return;   // ~6s ceiling, then give up rather than spin
      setTimeout(tick, 100);
    })();
  }

  function init(role) {
    ROLE = role;
    announce();
    window.addEventListener('shape:startTour', function () { start(role); });
    window.addEventListener('shape:startGuide', function (e) { startGuide(e && e.detail && e.detail.key); });
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
        var progress = isCoach(role) ? loadProgress(u.id) : Promise.resolve(null);
        var seenHere = false;
        try {
          if (localStorage.getItem(seenKey(role, u.id)) === '1') seenHere = true;
          if (localStorage.getItem(legacySeenKey(role)) === '1') seenHere = true; // pre-rework completion
        } catch (e) {}
        var goals = seenHere ? Promise.resolve({ tourSeen: true }) : db.getUserGoals ? Promise.resolve(db.getUserGoals(GOAL_KEY[role])).catch(function () { return null; }) : Promise.resolve(null);
        return goals.then(function (d) {
          if (d && d.tourSeen) {
            try { localStorage.setItem(seenKey(role, u.id), '1'); } catch (e) {} // sync this browser
            // Seen the welcome before the guides existed: say so once, when the account's own
            // progress has been read (never on a read that failed: a repeat note is a nuisance).
            if (isCoach(role)) progress.then(function (p) { if (p && !p.note && !p.welcome) setTimeout(showNewNote, 1500); });
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

  window.ShapeDashTour = {
    init: init, start: start, startGuide: startGuide, guideHere: guideHere, list: list, openGuideList: openGuideList,
    // For the tests (tests/dash-guides.test.mjs): the pure parts, run without a page.
    _test: { mergeProgress: mergeProgress, coachSteps: coachSteps, coachGuides: coachGuides, clientSteps: clientSteps, guideForRoute: guideForRoute },
  };
})();
