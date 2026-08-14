// Session-cookie options for every @supabase/ssr client that WRITES auth
// cookies (middleware + server). One definition so the two writers can never
// disagree.
//
// maxAge: the SDK default is 400 days — a stolen cookie stays valid for over a
// year. 30 days instead: the middleware re-issues the cookie on every request,
// so an active member's session rolls forward indefinitely; only a device that
// hasn't touched the app for 30 days signs out.
//
// httpOnly: the SDK defaults to false so its BROWSER client can read the
// cookie — but this app has no browser Supabase client (src/lib/supabase/
// client.ts has zero importers; the static site keeps its own localStorage
// session and the /api/auth/session bridge sets cookies server-side). With no
// legitimate script reader, httpOnly:true takes the session cookie out of
// reach of any XSS on the origin. If a browser-side Supabase client is ever
// introduced, it cannot read the session until this is revisited.
export const SHAPE_SESSION_COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 30,
  httpOnly: true,
} as const;
