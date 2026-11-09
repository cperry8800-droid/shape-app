// Mutation spec for "See the example" (tests/dash-example.test.mjs): a signed-in coach's example
// dashboard is the signed-out preview, made by signing the tab out (dashExample.js): /api/me says
// nobody, every other /api/ request and every Supabase request is answered 401 before it leaves, only
// signing out goes through, and supabase.js gives the tab a client with no stored session. The shells
// show it ungated, the band says it's the example and offers the way back, and the link shows only
// where a coach's own roster was read and is empty, and in Settings.
// Data: every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/dash-example-2026-11-09.mutations.mjs --fail-on-skipped
const EX = 'public/newdesign/dashExample.js';
const SUPA = 'public/supabase.js';
const TA = 'public/newdesign/TrainerApp.html';
const NA = 'public/newdesign/NutritionistApp.html';
const TODAY = 'public/newdesign/dashToday.jsx';
const ROSTER = 'public/newdesign/dashRoster.jsx';
const TCP = 'public/newdesign/trainerClientsPage.jsx';
const NCP = 'public/newdesign/nutritionistClientsPage.jsx';
const SET = 'public/newdesign/coachSettings.jsx';
const SHELL = 'public/newdesign/pageShell.jsx';

export default {
  test: 'node --test tests/dash-example.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The switch
    { name: 'switch: always on', file: EX,
      find: 'on = window.sessionStorage.getItem(KEY) === "1";', replace: 'on = true;' },
    { name: 'switch: any ?example value turns it on', file: EX,
      find: 'on = window.sessionStorage.getItem(KEY) === "1";', replace: 'on = asked != null || window.sessionStorage.getItem(KEY) === "1";' },
    { name: 'switch: ?example=1 is not kept for the tab', file: EX,
      find: 'if (asked === "1") window.sessionStorage.setItem(KEY, "1");', replace: 'if (false) window.sessionStorage.setItem(KEY, "1");' },
    { name: 'switch: ?example=0 does not turn it off', file: EX,
      find: 'else if (asked === "0") window.sessionStorage.removeItem(KEY);', replace: 'else if (false) window.sessionStorage.removeItem(KEY);' },
    { name: 'switch: the address drops the rest of the query', file: EX,
      find: 'var params = new URLSearchParams(window.location.search);', replace: 'var params = new URLSearchParams("");' },
    { name: 'switch: the address drops the tab', file: EX,
      find: 'return window.location.pathname + (q ? "?" + q : "") + window.location.hash;', replace: 'return window.location.pathname + (q ? "?" + q : "");' },
    { name: 'switch: enter does not keep it', file: EX,
      find: '    try { window.sessionStorage.setItem(KEY, "1"); } catch (e) {}\n    window.location.assign', replace: '    window.location.assign' },
    { name: 'switch: leave does not clear it', file: EX,
      find: '    try { window.sessionStorage.removeItem(KEY); } catch (e) {}\n    window.location.replace', replace: '    window.location.replace' },
    { name: 'switch: on, but fetch is never wrapped', file: EX,
      find: 'if (!on || typeof window.fetch !== "function") return;', replace: 'if (true) return;' },
    // ── What leaves the tab
    { name: 'tab: /api/me is asked for real', file: EX,
      find: '    if (own && url.pathname === "/api/me") return answer(200, { user: null });\n', replace: '' },
    { name: 'tab: /api/me answers someone', file: EX,
      find: 'return answer(200, { user: null });', replace: 'return answer(200, { user: {} });' },
    { name: 'tab: all of /api/auth/ goes through (the cookie bridge signs the tab back in)', file: EX,
      find: 'return path === "/api/auth/signout" || (path === "/api/auth/session" && method === "DELETE");', replace: 'return path.indexOf("/api/auth/") === 0;' },
    { name: 'tab: any method on /api/auth/session goes through', file: EX,
      find: '(path === "/api/auth/session" && method === "DELETE")', replace: '(path === "/api/auth/session")' },
    { name: 'tab: signing out by DELETE is blocked', file: EX,
      find: '(path === "/api/auth/session" && method === "DELETE")', replace: '(false)' },
    { name: 'tab: the method is never read', file: EX,
      find: 'var method = String((init && init.method) || (input && typeof input === "object" && input.method) || "GET").toUpperCase();', replace: 'var method = "GET";' },
    { name: 'tab: the method\'s case is kept', file: EX,
      find: '|| "GET").toUpperCase();', replace: '|| "GET");' },
    { name: 'tab: writes go through', file: EX,
      find: 'if (own && url.pathname.indexOf("/api/") === 0) return answer(401', replace: 'if (own && method === "GET" && url.pathname.indexOf("/api/") === 0) return answer(401' },
    { name: 'tab: the account\'s reads answer 200 empty', file: EX,
      find: 'return answer(401, { error: "Authentication required." });', replace: 'return answer(200, {});' },
    { name: 'tab: Supabase requests go through', file: EX,
      find: '    if (/(^|\\.)supabase\\.co$/i.test(url.hostname)) return answer(401, { message: "Authentication required." });\n', replace: '' },
    { name: 'tab: another origin\'s /api/ is answered here', file: EX,
      find: 'var own = url.origin === window.location.origin;', replace: 'var own = true;' },
    { name: 'tab: a Request object\'s address is not read', file: EX,
      find: 'input && typeof input.url === "string" ? input.url : String(input);', replace: 'String(input);' },
    // ── supabase.js
    { name: 'supabase: the example is ignored', file: SUPA,
      find: 'var dashExample = !!(window.ShapeDashExample && window.ShapeDashExample.on);', replace: 'var dashExample = false;' },
    { name: 'supabase: every tab is the example', file: SUPA,
      find: 'var dashExample = !!(window.ShapeDashExample && window.ShapeDashExample.on);', replace: 'var dashExample = true;' },
    { name: 'supabase: the example client keeps a session', file: SUPA,
      find: "      persistSession: false,\n      autoRefreshToken: false,", replace: "      persistSession: true,\n      autoRefreshToken: false," },
    { name: 'supabase: the example client refreshes tokens', file: SUPA,
      find: "      persistSession: false,\n      autoRefreshToken: false,", replace: "      persistSession: false,\n      autoRefreshToken: true," },
    { name: 'supabase: the example client reads the coach\'s stored session', file: SUPA,
      find: "storageKey: 'shape.auth.example'", replace: "storageKey: 'shape.auth'" },
    // ── The shells
    { name: 'trainer shell: the gate sends the example to sign in', file: TA,
      find: '  if (window.ShapeDashExample && window.ShapeDashExample.on) return;\n', replace: '' },
    { name: 'nutritionist shell: the gate sends the example to sign in', file: NA,
      find: '  if (window.ShapeDashExample && window.ShapeDashExample.on) return;\n', replace: '' },
    { name: 'trainer shell: the switch is not loaded', file: TA,
      find: '<script src="dashExample.js"></script>\n', replace: '' },
    { name: 'nutritionist shell: the switch is not loaded', file: NA,
      find: '<script src="dashExample.js"></script>\n', replace: '' },
    // ── The band and the link
    { name: 'band: the example reads as the signed-out preview', file: TODAY,
      find: '  const example = dashExampleOn();', replace: '  const example = false;' },
    { name: 'band: Back to my dashboard does nothing', file: TODAY,
      find: 'onClick={() => window.ShapeDashExample.leave()}', replace: 'onClick={() => {}}' },
    { name: 'band: the switch is never read', file: TODAY,
      find: 'function dashExampleOn() {\n  return typeof window !== "undefined" && !!(window.ShapeDashExample && window.ShapeDashExample.on);', replace: 'function dashExampleOn() {\n  return false;' },
    { name: 'link: shows inside the example', file: TODAY,
      find: '|| !window.ShapeDashExample || window.ShapeDashExample.on) return null;', replace: '|| !window.ShapeDashExample) return null;' },
    { name: 'link: shows where the shell has no switch', file: TODAY,
      find: 'if (typeof window === "undefined" || !window.ShapeDashExample || window.ShapeDashExample.on) return null;', replace: 'if (typeof window === "undefined") return null;' },
    { name: 'link: does not open the example', file: TODAY,
      find: 'onClick={() => window.ShapeDashExample.enter()}', replace: 'onClick={() => {}}' },
    { name: 'Today: offered to a coach with clients', file: TODAY,
      find: 'noClients={source === "live" && Array.isArray(clients) && clients.length === 0}', replace: 'noClients={source === "live"}' },
    { name: 'Today: offered over an unread roster', file: TODAY,
      find: 'noClients={source === "live" && Array.isArray(clients) && clients.length === 0}', replace: 'noClients={Array.isArray(clients) && clients.length === 0}' },
    { name: 'Today: never offered', file: TODAY,
      find: '{noClients && typeof DashExampleLink === "function"', replace: '{false && typeof DashExampleLink === "function"' },
    { name: 'Clients: never offered', file: ROSTER,
      find: '{live && typeof DashExampleLink === "function" && <>', replace: '{false && typeof DashExampleLink === "function" && <>' },
    { name: 'Clients (trainer): the roster is never live', file: TCP,
      find: 'unread={unread} live={source === "live"}', replace: 'unread={unread} live={false}' },
    { name: 'Clients (nutritionist): the roster is never live', file: NCP,
      find: 'unread={unread} live={source === "live"}', replace: 'unread={unread} live={false}' },
    { name: 'Settings: the card shows inside the example', file: SET,
      find: '{live && typeof DashExampleLink === "function" && window.ShapeDashExample && !window.ShapeDashExample.on && (', replace: '{live && typeof DashExampleLink === "function" && window.ShapeDashExample && (' },
    { name: 'Settings: the card shows signed out', file: SET,
      find: '{live && typeof DashExampleLink === "function" && window.ShapeDashExample && !window.ShapeDashExample.on && (', replace: '{typeof DashExampleLink === "function" && window.ShapeDashExample && !window.ShapeDashExample.on && (' },
    // ── The header
    { name: 'header: Log in shows in the example', file: SHELL,
      find: '{!(window.ShapeDashExample && window.ShapeDashExample.on) && <a href="/newdesign/Login.html" style={quietLink}>Log in</a>}', replace: '<a href="/newdesign/Login.html" style={quietLink}>Log in</a>' },
    { name: 'header: Get started shows in the example', file: SHELL,
      find: '{!(window.ShapeDashExample && window.ShapeDashExample.on) && <a href="/newdesign/Landing.html" style={ctaBtn}>Get started</a>}', replace: '<a href="/newdesign/Landing.html" style={ctaBtn}>Get started</a>' },
    { name: 'header: the phone menu offers sign-in in the example', file: SHELL,
      find: ') : (window.ShapeDashExample && window.ShapeDashExample.on) ? null : (', replace: ') : (' },
  ],
};
