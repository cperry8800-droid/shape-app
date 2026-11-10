// Mutation spec for the tours and guides (owner, 2026-11-10): the engine's Skip tour, its note and
// its other guards (public/newdesign/spotlightTour.js), the docked geometry (spotlightGeom.mjs), the
// coach guides and the progress they write to the account (public/newdesign/dashTour.js), the
// website's Guide button and Settings card, and the app's tour (the Build door, the Coaches stop, the
// Radio box, Settings → Take the tour, the translated card). The progress is account data, read,
// merged and written back, so every guard on it is broken here once and a test must notice.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/tour-guides-2026-11-10.mutations.mjs --fail-on-skipped
const TOUR = 'public/newdesign/spotlightTour.js';
const GEOM = 'public/newdesign/spotlightGeom.mjs';
const DASH = 'public/newdesign/dashTour.js';
const SHELL = 'public/newdesign/trainerDashboard.jsx';
const EXTRAS = 'public/newdesign/dashProfileExtras.jsx';
const CSS = 'public/newdesign/dash.css';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const HINT = 'mobile-app/src/broadsheet/BSNoraHint.jsx';

export default {
  test: 'node --test tests/dash-guides.test.mjs tests/spotlight-geom.test.mjs tests/nora-account-setup-surfaces.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── Progress: the account's copy ──
    { name: 'the merge keeps the latest day', file: DASH, find: "return !a ? (b || null) : !b ? a : (String(a) <= String(b) ? a : b);", replace: "return !a ? (b || null) : !b ? a : (String(a) <= String(b) ? b : a);" },
    { name: "the merge drops the other copy's ticks", file: DASH, find: '[a.chapters, b.chapters].forEach(', replace: '[a.chapters].forEach(' },
    { name: 'an empty value is a tick', file: DASH, find: 'if (c[k]) out.chapters[k] = earliest(out.chapters[k], c[k]);', replace: 'out.chapters[k] = earliest(out.chapters[k], c[k]);' },
    { name: 'a failed read writes anyway', file: DASH, find: "        if (remote == null || UID !== uid) return;\n        var merged", replace: "        if (UID !== uid) return;\n        var merged" },
    { name: 'the write is not bound to the account', file: DASH, find: 'db.saveUserGoals(GUIDE_KEY, merged, { expectedUserId: uid })', replace: 'db.saveUserGoals(GUIDE_KEY, merged)' },
    { name: 'the write skips the read', file: DASH, find: 'var merged = mergeProgress(remote, PROG);', replace: 'var merged = PROG;' },
    { name: "one role's tick is the other's (a coach with both listings)", file: DASH, find: "function tickKey(role, key) { return role + ':' + key; }", replace: 'function tickKey(role, key) { return key; }' },
    { name: 'a skipped guide is ticked', file: DASH, find: "o.onDone = function (reason) { if (reason === 'finished') {", replace: 'o.onDone = function (reason) { if (true) {' },
    // ── The coach guides ──
    { name: 'a member gets the coach guides', file: DASH, find: '    if (!isCoach(role)) return null;\n    var all = coachGuides(role);', replace: '    var all = coachGuides(role);' },
    { name: 'the Score page has no guide', file: DASH, find: "routes: ['goal', 'score']", replace: "routes: ['goal']" },
    { name: 'the welcome loses its way back to the guides', file: DASH, find: "final: true, ctaLabel: 'See all guides →', onCta: openGuideList,", replace: 'final: true, onCta: openGuideList,' },
    { name: 'skipping the welcome says nothing', file: DASH, find: '      skipNote: isCoach(role) ? SKIP_NOTE.coach : SKIP_NOTE.client,\n', replace: '' },
    { name: 'Settings cannot replay the welcome', file: DASH, find: "window.addEventListener('shape:startTour', function () { start(role); });", replace: '' },
    { name: 'a client file guide starts from Settings', file: DASH, find: "var startable = g.key !== 'client' || here === 'client';", replace: 'var startable = true;' },
    { name: 'the Guide button opens the welcome', file: SHELL, find: 'onClick={() => T.startGuide(g.key)}', replace: 'onClick={() => T.start("trainer")}' },
    { name: 'the Settings list starts nothing', file: EXTRAS, find: 'onClick={() => start(g.key)}', replace: 'onClick={() => {}}' },
    { name: 'the chat launcher covers the docked card', file: CSS, find: 'html[data-guide-open] #shape-global-chat-button { z-index: 99990 !important; }', replace: '' },
    // ── The engine ──
    { name: 'Skip tour is never drawn', file: TOUR, find: 'const skipText = !b.isLast', replace: 'const skipText = false' },
    { name: 'skipping reads as finishing', file: TOUR, find: "    finish('skipped');\n", replace: '    finish();\n' },
    { name: 'skipping says nothing', file: TOUR, find: '    if (opts.skipNote) note(opts.skipNote);\n', replace: '' },
    { name: "the last step's × skips", file: TOUR, find: "onclick = b.isLast ? () => finish() : skip;", replace: 'onclick = skip;' },
    { name: 'Escape finishes instead of skipping', file: TOUR, find: "if (e.key === 'Escape') { e.preventDefault(); skip(); return; }", replace: "if (e.key === 'Escape') { e.preventDefault(); finish(); return; }" },
    { name: 'a step the account lacks is shown', file: TOUR, find: 'const steps = visibleSteps(stepsIn);', replace: 'const steps = stepsIn;' },
    { name: "the caller's words are ignored", file: TOUR, find: 'const L = { ...LABELS, ...(opts.labels || {}) };', replace: 'const L = { ...LABELS };' },
    { name: "→ follows a finale's link", file: TOUR, find: '      if (steps[i] && steps[i].final) return;\n', replace: '' },
    { name: 'two tours stack', file: TOUR, find: '  if (active) { try { active.destroy(); } catch (_) {} active = null; }\n', replace: '' },
    { name: 'the open mark stays after the tour', file: TOUR, find: "    if (openCount > 0) html.setAttribute('data-guide-open', '');\n    else html.removeAttribute('data-guide-open');", replace: "    html.setAttribute('data-guide-open', '');" },
    { name: 'nothing waits for the tour', file: TOUR, find: "st.textContent = 'html[data-guide-open] [data-guide-wait]{visibility:hidden!important}';", replace: "st.textContent = '';" },
    // ── Geometry ──
    { name: 'the docked card ignores its target', file: GEOM, find: 'const lower = target ? target.y + target.h / 2 > vis.y + vis.h / 2 : false;', replace: 'const lower = false;' },
    { name: 'the docked card ignores the scroll', file: GEOM, find: 'const low = vis.y + margin;', replace: 'const low = margin;' },
    { name: 'a step whose check throws is hidden', file: GEOM, find: 'try { return !!s.when(); } catch (_) { return true; }', replace: 'try { return !!s.when(); } catch (_) { return false; }' },
    // ── The app ──
    { name: 'the Build door has no anchor', file: APP, find: '<div data-tour="hero-build" style={{ padding: `2px ${t.padX}px 40px` }}>', replace: '<div style={{ padding: `2px ${t.padX}px 40px` }}>' },
    { name: 'Train lights the tab, not the Build door', file: APP, find: "fallback: () => q('hero-build')() || q('tab-train')(),", replace: "fallback: q('tab-train')," },
    { name: 'the Radio stop lights the Home tab again', file: APP, find: "anchor: () => root.querySelector('[data-bs-now-playing]'), fallback: q('tab-home'), final: true", replace: "anchor: q('tab-home'), fallback: q('tab-home'), final: true" },
    { name: 'the Coaches stop is gone', file: APP, find: "      { navigate: go('market'), anchor: q('tab-market'),", replace: "      { navigate: go('home'), anchor: q('tab-market')," },
    { name: 'Settings → Take the tour does nothing', file: APP, find: "r: tr('settings:about.tourMeta', { defaultValue: 'Start' }), action: () => { try { window.dispatchEvent(new Event('shape:startTour')); } catch (e) {} } },", replace: "r: tr('settings:about.tourMeta', { defaultValue: 'Start' }), action: () => {} }," },
    { name: "the member card is English", file: APP, find: 'fonts: bsTourFonts(t), labels: bsTourLabels(tr),', replace: 'fonts: bsTourFonts(t),' },
    { name: "the coach card is English", file: PROS, find: 'labels: window.bsTourLabels ? window.bsTourLabels(tr) : undefined,', replace: '' },
    { name: 'the Nora hint draws over the card', file: HINT, find: '<div role="note" data-guide-wait="" style={{', replace: '<div role="note" style={{' },
  ],
};
