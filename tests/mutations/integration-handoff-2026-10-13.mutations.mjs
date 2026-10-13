// Mutation spec for the installed app's integration handoff (2026-10-13): each mutation undoes one
// guard, and tests/integration-handoff.test.mjs must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/integration-handoff-2026-10-13.mutations.mjs --fail-on-skipped
const LIB = 'src/lib/integration-handoff.ts';
const ROUTE = 'src/app/api/integrations/handoff/route.ts';
const AUTHORIZE = 'src/app/api/integrations/[provider]/authorize/route.ts';
const PAGE = 'src/app/connect/[provider]/page.tsx';
const DEV_TOKEN = 'src/app/api/integrations/apple-music/developer-token/route.ts';
const CONNECT = 'src/app/api/integrations/apple-music/connect/route.ts';
const BACKEND = 'mobile-app/src/services/shapeBackend.js';
const INTEGRATIONS = 'mobile-app/src/broadsheet/BSIntegrationsPage.jsx';

export default {
  test: 'node --test tests/integration-handoff.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    // ── the token ──
    { name: 'a token for one provider reads for another', file: LIB,
      find: "  if (!UUID_RE.test(uid) || prov !== provider || ",
      replace: "  if (!UUID_RE.test(uid) || " },
    { name: 'an expired token still reads', file: LIB,
      find: '  if (Number(expRaw) * 1000 < now) return null;\n  return sameHex(mac(s, `${uid}.${prov}.${expRaw}`), sig) ? uid : null;',
      replace: '  return sameHex(mac(s, `${uid}.${prov}.${expRaw}`), sig) ? uid : null;' },
    { name: 'the signature is not checked', file: LIB,
      find: '  return sameHex(mac(s, `${uid}.${prov}.${expRaw}`), sig) ? uid : null;',
      replace: '  return uid;' },
    { name: 'a post from another site is allowed', file: LIB,
      find: '    return allowed.has(origin);\n',
      replace: '    return true;\n' },
    { name: 'a post that names no origin is allowed', file: LIB,
      find: "  return request.headers.get('sec-fetch-site') === 'same-origin';\n",
      replace: "  return request.headers.get('sec-fetch-site') !== 'cross-site';\n" },
    // ── the routes ──
    { name: 'a visitor gets a link', file: ROUTE,
      find: "  if (!user) return NextResponse.json({ error: 'Sign in before connecting an app.' }, { status: 401, headers: NO_STORE });\n",
      replace: "  if (!user) return NextResponse.json({ url: null }, { headers: NO_STORE });\n" },
    { name: 'a provider with no credentials gets a link', file: ROUTE,
      find: '    if (!cfg || !getClientCredentials(cfg)) {',
      replace: '    if (!cfg) {' },
    { name: 'authorize takes a post from another site', file: AUTHORIZE,
      find: '  if (!handoffPostAllowed(request)) {',
      replace: '  if (false) {' },
    { name: 'a GET with a link connects the link\'s member', file: AUTHORIZE,
      find: '  const returnTo = safeReturnPath(new URL(request.url).searchParams.get(\'return\'), DEFAULT_RETURN_TO);\n  return startAuthorize(request, cfg, creds, user.id, returnTo);',
      replace: '  const returnTo = safeReturnPath(new URL(request.url).searchParams.get(\'return\'), DEFAULT_RETURN_TO);\n  const linked = readHandoff(new URL(request.url).searchParams.get(\'handoff\'), cfg.id);\n  return startAuthorize(request, cfg, creds, linked ?? user.id, returnTo);' },
    { name: 'a bad link still starts the provider', file: AUTHORIZE,
      find: '  if (!uid) {\n    const done',
      replace: '  if (false) {\n    const done' },
    { name: 'the Continue is posted on to the provider (307)', file: AUTHORIZE,
      find: '  return startAuthorize(request, cfg, creds, uid, CONNECT_DONE_PATH, 303);',
      replace: '  return startAuthorize(request, cfg, creds, uid, CONNECT_DONE_PATH);' },
    { name: 'the app\'s browser returns to the website, not the done page', file: AUTHORIZE,
      find: '  return startAuthorize(request, cfg, creds, uid, CONNECT_DONE_PATH, 303);',
      replace: "  return startAuthorize(request, cfg, creds, uid, DEFAULT_RETURN_TO, 303);" },
    // ── the page and its Continue ──
    { name: 'the page offers Continue without naming the account', file: PAGE,
      find: "  if (authUser.error || !email) {",
      replace: "  if (false) {" },
    { name: 'Continue goes somewhere other than the authorize route', file: PAGE,
      find: '        <form method="post" action={`/api/integrations/${provider}/authorize`}>',
      replace: '        <form method="post" action={`/api/integrations/${provider}/callback`}>' },
    // ── Apple Music ──
    { name: 'the developer token takes any provider\'s link', file: DEV_TOKEN,
      find: "  const user = presentsHandoff(request) ? handoffUserFromRequest(request, 'apple_music') : await currentUser(request);",
      replace: "  const user = presentsHandoff(request) ? (handoffUserFromRequest(request, 'apple_music') ?? handoffUserFromRequest(request, 'whoop')) : await currentUser(request);" },
    { name: 'the developer token falls back to the browser\'s session past a refused link', file: DEV_TOKEN,
      find: "  const user = presentsHandoff(request) ? handoffUserFromRequest(request, 'apple_music') : await currentUser(request);",
      replace: "  const user = handoffUserFromRequest(request, 'apple_music') ?? (await currentUser(request));" },
    { name: 'the connect route takes any provider\'s link', file: CONNECT,
      find: "  const user = presentsHandoff(request) ? handoffUserFromRequest(request, 'apple_music') : await resolveUser(request);",
      replace: "  const user = presentsHandoff(request) ? (handoffUserFromRequest(request, 'apple_music') ?? handoffUserFromRequest(request, 'strava')) : await resolveUser(request);" },
    { name: 'the browser\'s session wins over the link on the connect route', file: CONNECT,
      find: "  const user = presentsHandoff(request) ? handoffUserFromRequest(request, 'apple_music') : await resolveUser(request);",
      replace: "  const user = (await resolveUser(request)) ?? handoffUserFromRequest(request, 'apple_music');" },
    { name: 'a link is presented whatever the request carries', file: LIB,
      find: "  return request.headers.get('x-shape-handoff') !== null;",
      replace: "  return true;" },
    // ── the app ──
    { name: 'the installed app navigates its WebView to authorize again', file: BACKEND,
      find: '  if (_isNative) return openIntegrationHandoff(cleanProvider);\n',
      replace: '' },
    { name: 'Apple Music runs MusicKit in the WebView again', file: BACKEND,
      find: "  if (_isNative) return openIntegrationHandoff('apple_music');\n",
      replace: '' },
    { name: 'a browser that never opened keeps its listener', file: BACKEND,
      find: "    // The browser never opened, so it never closes: take the listener back, or the next connect fires two.\n    try { handle && handle.remove && handle.remove(); } catch (e) {}\n",
      replace: "    // The browser never opened, so it never closes: take the listener back, or the next connect fires two.\n" },
    { name: 'closing the browser does not reload the page', file: BACKEND,
      find: "      try { window.dispatchEvent(new Event('shape:integrations-changed')); } catch (e) {}\n",
      replace: '' },
    { name: 'a handoff is toasted as connected', file: INTEGRATIONS,
      find: '      if (result && (result.handoff || result.redirected)) return;\n',
      replace: '' },
  ],
};
