// Supabase session refresh + portal route gating — runs on every request
// via proxy.ts. Reads the auth cookies, refreshes the session if needed,
// writes updated cookies back, and gates the private portal pages.

import { createServerClient } from '@supabase/ssr';
import { createClient as createBearerClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { computeMembership, GATE_STAMP_HEADER, GATE_STAMP_VALUE } from '@/lib/membership-core';
import { checkRateLimit, jwtSub } from '@/lib/rate-limit';
import { applyShapeCookieOptions } from '@/lib/supabase/cookie-options';

type PortalRole = 'client' | 'trainer' | 'nutritionist';

// Paid API prefixes gated to Shape members (active sub OR approved coach OR
// admin) — the server-side counterpart to the UI paywall. Self-scoped client
// surfaces + real messaging (the website chat bubble sends via /api/conversations).
// Billing/auth/webhook/public/community-preview/coach/integration-connect routes
// are intentionally NOT gated so join + onboarding + OAuth + the community
// preview keep working.
const GATED_API_PREFIXES = [
  '/api/client',
  '/api/nutrition',
  '/api/ai',
  '/api/insights',
  '/api/calendar',
  '/api/conversations',
  '/api/messages',
];
// Server-to-server routes UNDER a gated prefix that authenticate themselves (a
// secret), so the per-user membership gate must NOT apply (no user session).
const GATE_SKIP = ['/api/ai/notify/cron'];

// ---- Rate limits ----------------------------------------------------------
// AUTH writes (sign-in bridge / sign-out) are the strict brute-force tier;
// every other /api route shares a general per-caller tier. Enforced in the
// proxy, so BOTH the website (cookie) and the app (Bearer / same-origin /m)
// are covered by one chokepoint. Backed by the check_rate_limit RPC.
const AUTH_MAX = 5;
const AUTH_WINDOW_S = 15 * 60; // 5 attempts / 15 min
const API_MAX = 100;
const API_WINDOW_S = 60; // 100 requests / min
// Server-to-server + monitoring endpoints that must not be IP-throttled.
const RATE_LIMIT_SKIP = [
  '/api/stripe/webhook',
  '/api/integrations/garmin/webhook',
  '/api/push/dispatch',
  '/api/health',
  '/api/ai/notify/cron',
];

// Max request body size (App Router has no default). Upload + server-to-server
// batch routes get a larger ceiling; everything else is capped tight. Enforced
// up front via Content-Length; per-route readJson() also caps the real bytes.
const JSON_BODY_MAX = 1_000_000; // 1 MB
const LARGE_BODY_MAX = 30 * 1024 * 1024; // 30 MB
const LARGE_BODY_PREFIXES = [
  '/api/apply',
  '/api/client/progress-photos',
  '/api/nutrition/meal-note',
  '/api/nutrition/voice',
  '/api/ai/transcribe',
  '/api/integrations/garmin/webhook',
];

// Which role a private portal page belongs to, or null if the page is public.
//
// Gated:     /newdesign/Client<X>.html, Trainer<X>.html, Nutritionist<X>.html
//            (e.g. ClientDashboard.html, TrainerClients.html)
// NOT gated: bare overview pages (Client.html / Coach.html / Nutritionist.html),
//            the public coach profiles (TrainerPublic.html,
//            NutritionistPublic.html), and every marketing page (index,
//            Marketplace, Radio, Pricing, ...).
function portalRoleForPath(pathname: string): PortalRole | null {
  if (/\/newdesign\/(TrainerPublic|NutritionistPublic)\.html$/.test(pathname)) return null;
  if (/\/newdesign\/Client[A-Za-z]+\.html$/.test(pathname)) return 'client';
  if (/\/newdesign\/Trainer[A-Za-z]+\.html$/.test(pathname)) return 'trainer';
  if (/\/newdesign\/Nutritionist[A-Za-z]+\.html$/.test(pathname)) return 'nutritionist';
  return null;
}

function dashboardFor(role: PortalRole): string {
  if (role === 'trainer') return '/newdesign/TrainerDashboard.html';
  if (role === 'nutritionist') return '/newdesign/NutritionistDashboard.html';
  return '/newdesign/ClientDashboard.html';
}

export async function updateSession(request: NextRequest) {
  // Forward the request pathname as a header so server components (Nav,
  // Footer) can read it via `headers()` and decide whether to render.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set('x-pathname', request.nextUrl.pathname);
  // The membership-gate stamp is proxy-issued ONLY — strip any incoming value
  // on every request (the matcher covers every gated /api path) so an
  // external caller can never spoof the routes' requireMembership fast path.
  forwardedHeaders.delete(GATE_STAMP_HEADER);
  // Global Privacy Control: recognize the opt-out signal so it's honored
  // platform-wide (CCPA + state laws require this regardless of sale/share).
  if (request.headers.get('sec-gpc') === '1') forwardedHeaders.set('x-gpc-optout', '1');

  let response = NextResponse.next({ request: { headers: forwardedHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: forwardedHeaders } });
          // Policy applied at the WRITE, not via cookieOptions — the SDK
          // overwrites a configured maxAge with its 400-day default.
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, applyShapeCookieOptions(options))
          );
        },
      },
    }
  );

  // IMPORTANT: don't run code between createServerClient and getUser — it must
  // be called immediately so session refresh cookies are set on the response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const apiPath = request.nextUrl.pathname;

  // ---- Request size guard (all API routes) ---------------------------------
  // Reject oversized bodies up front (no App Router default). Route-aware:
  // upload / batch routes get a larger ceiling. Content-Length based; the
  // per-route readJson() caps the real byte count as defense in depth.
  if (apiPath.startsWith('/api/') && request.method !== 'GET' && request.method !== 'OPTIONS') {
    const cl = Number(request.headers.get('content-length') || '0');
    if (cl > 0) {
      const large = LARGE_BODY_PREFIXES.some((p) => apiPath === p || apiPath.startsWith(p + '/'));
      if (cl > (large ? LARGE_BODY_MAX : JSON_BODY_MAX)) {
        return NextResponse.json(
          { error: 'Payload too large.', code: 'payload_too_large' },
          { status: 413, headers: { 'cache-control': 'no-store' } }
        );
      }
    }
  }

  // ---- Rate limiting (all API routes, web + app) ---------------------------
  // Strict brute-force tier for auth writes (5 / 15 min by IP); a general
  // per-caller tier for every other /api route. Signed-in callers are keyed by
  // user id (cookie session OR the Bearer token's sub) so shared NAT IPs aren't
  // collectively throttled; anonymous + auth callers fall back to IP. Fails
  // OPEN (and no-ops until the migration is applied) so it can't take the API
  // down. GET /api/auth/session is a per-page-load session read → general tier.
  if (
    request.method !== 'OPTIONS' &&
    apiPath.startsWith('/api/') &&
    !RATE_LIMIT_SKIP.some((p) => apiPath === p || apiPath.startsWith(p + '/'))
  ) {
    try {
      const fwd = request.headers.get('x-forwarded-for') || '';
      const ip = fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
      const isAuth = apiPath === '/api/auth' || apiPath.startsWith('/api/auth/');
      const strict = isAuth && request.method !== 'GET';
      const max = strict ? AUTH_MAX : API_MAX;
      const windowSec = strict ? AUTH_WINDOW_S : API_WINDOW_S;

      let subject = `ip:${ip}`;
      if (!strict) {
        if (user?.id) {
          subject = `u:${user.id}`;
        } else {
          const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
          const sub = m ? jwtSub(m[1]) : null;
          if (sub) subject = `u:${sub}`;
        }
      }

      const rl = await checkRateLimit(
        supabase as unknown as SupabaseClient,
        `${strict ? 'auth' : 'api'}:${subject}`,
        max,
        windowSec
      );
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Too many requests — please slow down and try again shortly.', code: 'rate_limited' },
          {
            status: 429,
            headers: {
              'Retry-After': String(rl.resetSeconds),
              'X-RateLimit-Limit': String(rl.limit),
              'X-RateLimit-Remaining': String(rl.remaining),
              'cache-control': 'no-store',
            },
          }
        );
      }
    } catch {
      /* fail open — a limiter fault must never take down the API */
    }
  }

  // ---- Paid API member gate ------------------------------------------------
  // Server-side enforcement for the paid client API prefixes. Honors a Bearer
  // token (native app) as well as the cookie session (web). Fails OPEN on any
  // unexpected error so a gate fault can never take down the paid routes.
  if (!GATE_SKIP.includes(apiPath) && GATED_API_PREFIXES.some((p) => apiPath === p || apiPath.startsWith(p + '/'))) {
    try {
      const authHeader = request.headers.get('authorization') || '';
      const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
      let gateUser = user;
      let gateClient: SupabaseClient = supabase as unknown as SupabaseClient;
      if (bearer) {
        const bClient = createBearerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${bearer[1]}` } }, auth: { persistSession: false, autoRefreshToken: false } }
        );
        const { data } = await bClient.auth.getUser(bearer[1]);
        gateUser = data.user ?? null;
        gateClient = bClient;
      }
      if (!gateUser) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
      const { isMember, isKnownMinor } = await computeMembership(gateClient, gateUser.id, gateUser.email ?? null);
      // Shape is 18+, no exceptions. over_18 is derived by a DB trigger from
      // date_of_birth and cannot be self-asserted, so an explicit false is a
      // proven minor: refuse before any paid or personal data route runs. This
      // was previously computed and read by NOTHING — the only age check was
      // client-side at signup, bypassable by calling the API directly.
      if (isKnownMinor) return NextResponse.json({ error: 'Shape is for adults 18 and over.', code: 'age_restricted' }, { status: 403 });
      if (!isMember) return NextResponse.json({ error: 'Shape membership required.', code: 'membership_required' }, { status: 402 });
      // Verified — stamp the request for the route layer so requireMembership
      // (the per-endpoint half of this gate) passes without re-querying.
      // Rebuilding the response drops any cookies Supabase refreshed above,
      // so carry them over (the portal-redirect pattern below).
      forwardedHeaders.set(GATE_STAMP_HEADER, GATE_STAMP_VALUE);
      const stamped = NextResponse.next({ request: { headers: forwardedHeaders } });
      response.cookies.getAll().forEach((cookie) => stamped.cookies.set(cookie));
      response = stamped;
    } catch {
      /* fail open — requireMembership() in the route re-checks when the stamp
         is absent, so a gate fault degrades to the route-layer check, not to
         an open door */
    }
  }

  // ---- Portal route gating -------------------------------------------------
  // Signed-out visitors can preview every page freely (dashboards fall back
  // to mock data). Once signed in, the private portal pages are role-gated:
  // opening a page for a role you don't own redirects to a dashboard you do.
  const requiredRole = portalRoleForPath(request.nextUrl.pathname);
  if (requiredRole && user) {
    // Carry any refreshed auth cookies onto whatever response we return.
    const redirectTo = (pathname: string) => {
      const url = request.nextUrl.clone();
      url.pathname = pathname;
      url.search = '';
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    };

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, roles')
      .eq('id', user.id)
      .maybeSingle();

    const rawRoles: string[] =
      Array.isArray(profile?.roles) && profile.roles.length
        ? profile.roles
        : profile?.role
          ? [profile.role]
          : ['client'];
    // A dietitian (RD/RDN) is a nutrition provider — it OWNS the nutritionist
    // portal (same surfaces/discipline), so it passes the nutritionist gate.
    const ownedRoles = rawRoles.includes('dietitian') && !rawRoles.includes('nutritionist')
      ? [...rawRoles, 'nutritionist'] : rawRoles;
    const rawActive = (profile?.role as string | undefined) ?? 'client';
    const activeRole = (rawActive === 'dietitian' ? 'nutritionist' : rawActive) as PortalRole;

    // Signed in but this page belongs to a role the user doesn't have —
    // send them to a dashboard they DO own. Multi-role users (the required
    // role is in ownedRoles) pass through so the in-app role switcher works.
    if (!ownedRoles.includes(requiredRole)) {
      const STANDARD: readonly PortalRole[] = ['client', 'trainer', 'nutritionist'];
      // Always redirect to a dashboard the user owns — never to a role they
      // lack, which would just bounce back here in an infinite loop.
      const target: PortalRole | undefined =
        STANDARD.includes(activeRole) && ownedRoles.includes(activeRole)
          ? activeRole
          : STANDARD.find((r) => ownedRoles.includes(r));
      if (target) return redirectTo(dashboardFor(target));
      // User owns no standard role — let the request through rather than
      // risk a redirect loop.
    }
  }

  return response;
}
