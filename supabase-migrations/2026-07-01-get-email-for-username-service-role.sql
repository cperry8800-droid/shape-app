-- get_email_for_username: server-route only — AUTHZ-P2-email-enum
-- (docs/SECURITY-AUDIT-2026-06-30.md §2b).
--
-- The function returns auth.users.email for a given username and was EXECUTE-able
-- by anon (username login resolves @handle -> email pre-auth). That let anyone
-- bulk-enumerate the username->email map with no rate limit.
--
-- Fix: revoke from public/anon/authenticated and grant only service_role. The new
-- POST /api/auth/resolve-username route calls it via the service role and is
-- throttled by the proxy's /api/auth rate limit (5 / 15 min per IP). The login
-- clients (mobile shapeBackend.js + web newdesign login.jsx) now call that route
-- instead of the RPC.
--
-- DEPLOY TOGETHER with the client changes (the old direct-RPC path stops working
-- for anon once revoked). Safe pre-launch (no shipped native installs yet).
-- Idempotent.

revoke execute on function public.get_email_for_username(text) from public, anon, authenticated;
grant  execute on function public.get_email_for_username(text) to service_role;

-- Verify after apply (expect anon=f authenticated=f service_role=t):
--   select has_function_privilege('anon',
--     'public.get_email_for_username(text)'::regprocedure, 'EXECUTE');
