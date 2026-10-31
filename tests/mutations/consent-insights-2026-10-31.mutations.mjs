// Mutation spec for the website's page views waiting for consent (public/consent-insights.js,
// src/components/ConsentAnalytics.tsx), the consent banner standing clear of the chat launcher
// (public/consent-banner.js), and every gated page loading the banner (the shell's loader, the
// pages without the shell, the Next layout), and the receipt for a page without the browser client
// (/api/consent/banner). Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/consent-insights-2026-10-31.mutations.mjs --fail-on-skipped
const G = 'public/consent-insights.js', N = 'src/components/ConsentAnalytics.tsx', B = 'public/consent-banner.js', S = 'public/newdesign/pageShell.jsx';
const C = 'src/components/GlobalChatButton.tsx', R = 'src/app/api/consent/banner/route.ts';
export default {
  test: 'node --test tests/consent-insights.test.mjs tests/consent-region.test.mjs tests/consent-banner-pages.test.mjs tests/consent-banner-route.test.mjs',
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
    { name: 'the banner does not say it was answered', file: B, find: '        try { window.dispatchEvent(new CustomEvent("shape:consent", { detail: choice })); } catch (e) {}\n', replace: '' },
    { name: 'the launcher is never lifted', file: B, find: '      html.classList.add("shape-consent-open");\n', replace: '' },
    { name: 'the launcher stays lifted after an answer', file: B, find: 'if (bar.parentNode) bar.parentNode.removeChild(bar); unlift(); };', replace: 'if (bar.parentNode) bar.parentNode.removeChild(bar); };' },
    { name: 'the bar\'s height is never set', file: B, find: '      function lift() { try { html.style.setProperty("--shape-consent-h", bar.offsetHeight + "px"); } catch (e) {} }\n', replace: '      function lift() {}\n' },
    // ── Every gated page can show it (Codex on #2530) ──
    { name: 'the banner runs again when loaded twice', file: B, find: '  if (typeof document === "undefined" || window.__shapeConsentBanner) return;\n  window.__shapeConsentBanner = true;\n', replace: '  if (typeof document === "undefined") return;\n' },
    { name: 'the shell never loads the banner', file: S, find: '    document.head.appendChild(s);\n  } catch (e) {}\n})();\n\n// ── Checkout notices', replace: '  } catch (e) {}\n})();\n\n// ── Checkout notices' },
    { name: 'the shell loads it beside a page\'s own', file: S, find: '    if (document.querySelector(\'script[src="/consent-banner.js"]\')) return;\n', replace: '' },
    { name: 'the help page has no banner', file: 'public/help.html', find: '<script defer src="/consent-banner.js"></script>\n', replace: '' },
    { name: 'the 404 has no banner', file: 'public/404.html', find: '<script defer src="/consent-banner.js"></script>\n', replace: '' },
    { name: 'the Next app has no banner', file: N, find: '{consentBannerHidden(pathname) ? null : <Script src="/consent-banner.js" strategy="afterInteractive" />}', replace: '' },
    { name: 'the banner shows over the app\'s in-app browser', file: N, find: "  return p === '/connect' || p.startsWith('/connect/');", replace: '  return false;' },
    { name: 'a page under a /connect-like path loses it', file: N, find: "p.startsWith('/connect/')", replace: "p.startsWith('/connect')" },
    { name: 'the Next launcher is not lifted', file: C, find: '        id="shape-global-chat-button"\n', replace: '' },
    // ── The receipt where there is no browser client (Codex on #2530) ──
    { name: 'the banner sends no receipt without the browser client', file: B, find: '      if (!(db && db.client && db.client.auth)) return logByRoute(kind, granted, text);', replace: '      if (!(db && db.client && db.client.auth)) return Promise.resolve(false);' },
    { name: 'GPC is not logged without the browser client', file: B, find: '            if (!asked) logByRoute("gpc_optout", true, GPC_TEXT);\n', replace: '' },
    { name: 'GPC is logged on every page', file: B, find: '            if (!asked) logByRoute("gpc_optout", true, GPC_TEXT);', replace: '            logByRoute("gpc_optout", true, GPC_TEXT);' },
    { name: 'the route takes any kind', file: R, find: "  if (typeof b.kind !== 'string' || !KINDS.has(b.kind)) return null;", replace: "  if (typeof b.kind !== 'string') return null;" },
    { name: 'the route takes any text length', file: R, find: '  if (!text || text.length > TEXT_LIMIT) return null;', replace: '  if (!text) return null;' },
    { name: 'the route takes a form post', file: R, find: "  if (!/^application\\/json\\b/i.test(request.headers.get('content-type') || '')) {", replace: '  if (false) {' },
    { name: 'the route writes for a visitor not signed in', file: R, find: '  if (!user) return NextResponse.json({ logged: false }, { status: 401 });', replace: '' },
    { name: 'the route logs GPC every time', file: R, find: "      if (data && data.length) return NextResponse.json({ logged: true });", replace: '' },
    { name: 'the route says logged on a failed write', file: R, find: "    if (error) throw error;\n    return NextResponse.json({ logged: true });", replace: "    return NextResponse.json({ logged: true });" },
  ],
};
