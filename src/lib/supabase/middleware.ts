// Supabase session refresh + portal route gating — runs on every request
// via proxy.ts. Reads the auth cookies, refreshes the session if needed,
// writes updated cookies back, and gates the private portal pages.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type PortalRole = 'client' | 'trainer' | 'nutritionist';

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
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
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

  // ---- Portal route gating -------------------------------------------------
  const requiredRole = portalRoleForPath(request.nextUrl.pathname);
  if (requiredRole) {
    // Carry any refreshed auth cookies onto whatever response we return.
    const redirectTo = (pathname: string) => {
      const url = request.nextUrl.clone();
      url.pathname = pathname;
      url.search = '';
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    };

    if (!user) {
      // Not signed in — send to the login page.
      return redirectTo('/newdesign/Login.html');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, roles')
      .eq('id', user.id)
      .maybeSingle();

    const ownedRoles: string[] =
      Array.isArray(profile?.roles) && profile.roles.length
        ? profile.roles
        : profile?.role
          ? [profile.role]
          : ['client'];
    const activeRole = (profile?.role as PortalRole | undefined) ?? 'client';

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
