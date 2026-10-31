// Mutation spec for the website's page views waiting for consent (public/consent-insights.js,
// src/components/ConsentAnalytics.tsx) and the consent banner standing clear of the chat launcher
// (pageShell.jsx). Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/consent-insights-2026-10-31.mutations.mjs --fail-on-skipped
const G = 'public/consent-insights.js', N = 'src/components/ConsentAnalytics.tsx', S = 'public/newdesign/pageShell.jsx';
export default {
  test: 'node --test tests/consent-insights.test.mjs tests/consent-region.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The gate ──
    { name: 'GPC is ignored', file: G, find: '    if (o.gpc) return false;\n', replace: '' },
    { name: 'a Reject is ignored', file: G, find: "    if (o.consent === 'reject') return false;\n", replace: '' },
    { name: 'an Accept is ignored', file: G, find: "    if (o.consent === 'accept') return true;\n", replace: '' },
    { name: 'the EEA and the UK do not wait', file: G, find: '    return !CONSENT_REGION_RE.test(o.timeZone);\n  }\n\n  function allowedHere', replace: '    return true;\n  }\n\n  function allowedHere' },
    { name: 'it loads whatever consent says', file: G, find: '    if (allowedHere()) load();', replace: '    load();' },
    { name: 'the banner\'s Accept is not heard', file: G, find: "    root.addEventListener('shape:consent', check);\n", replace: '' },
    { name: 'another tab\'s Accept is not heard', file: G, find: "    root.addEventListener('storage', function (e) { if (!e || e.key === KEY || e.key === null) check(); });\n", replace: '' },
    { name: 'events are not checked again', file: G, find: "      root.va('beforeSend', function (event) { return allowedHere() ? event : null; });\n", replace: '' },
    { name: 'it loads twice', file: G, find: '    if (loaded) return;\n    loaded = true;\n', replace: '    loaded = true;\n' },
    // ── The Next app ──
    { name: 'the Next app sends every event', file: N, find: '  return allowedOn(window) ? event : null;', replace: '  return event;' },
    // ── The banner ──
    { name: 'the banner does not say it was answered', file: S, find: '        try { window.dispatchEvent(new CustomEvent("shape:consent", { detail: choice })); } catch (e) {}\n', replace: '' },
    { name: 'the launcher is never lifted', file: S, find: '      html.classList.add("shape-consent-open");\n', replace: '' },
    { name: 'the launcher stays lifted after an answer', file: S, find: 'if (bar.parentNode) bar.parentNode.removeChild(bar); unlift(); };', replace: 'if (bar.parentNode) bar.parentNode.removeChild(bar); };' },
    { name: 'the bar\'s height is never set', file: S, find: '      function lift() { try { html.style.setProperty("--shape-consent-h", bar.offsetHeight + "px"); } catch (e) {} }\n', replace: '      function lift() {}\n' },
  ],
};
