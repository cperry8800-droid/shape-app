# Remediation — SECURITY-AUDIT-2026-06-30 · All P1 + P2

Scope: the P1s + P2s from [SECURITY-AUDIT-2026-06-30.md](SECURITY-AUDIT-2026-06-30.md).
Each fix is on its own `fix/*` branch off `origin/main` (`b8672856`), one finding/cluster per branch, no merges, nothing pushed to `main`. `public/newdesign/**` untouched. Full suite: **359/359 tests pass**; `tsc --noEmit` clean on every branch.

> **Migrations are applied by the OWNER on Supabase** (repo convention) — they are NOT auto-applied. Verification SQL is in each migration footer + the checklist below.

## Fixed

| Finding | Sev | Branch (commit) | Files | Fix | Test | Re-check |
|---|---|---|---|---|---|---|
| AUTHZ-P2-oauth-redirect | P2 | `fix/authz-oauth-redirect` (`7bc7378c`) | `src/lib/safe-redirect.mjs` (new), `integrations/[provider]/authorize/route.ts`, `…/callback/route.ts`, `tests/safe-redirect.test.mjs`, `package.json` | New `safeReturnPath()` same-origin guard; applied where `?return=` is read in authorize + inside the callback `redirectBack` sink. | ✅ `tests/safe-redirect.test.mjs` (4 cases; fails pre-fix — module absent) | FIXED |
| AUTHZ-P2-console-idor | P2 | `fix/authz-console-idor` (`119bf2f0`) | `trainer/console/route.ts`, `nutritionist/console/route.ts`, `supabase-migrations/2026-06-30-coach-console-write-scope.sql` | Route re-checks `is_coach_on_client(clientId)` before focus/addItem/groceryNote; RLS split into owner-scoped SUD + `is_discipline_coach_on_client` INSERT. | ⚠️ gate is a DB RPC + RLS — no in-repo route/DB harness; verify SQL in migration footer | FIXED (code) · NEEDS-OWNER (apply migration) |
| AUTHZ-P2-program-idor | P2 | `fix/authz-program-idor` (`6bde3aa0`) | `program-tools/templates/route.ts`, `supabase-migrations/2026-06-30-coach-program-assignment-write-scope.sql` | Route reuses `unauthorizedAssignTargets` vs active subscribers; RLS split + `is_discipline_coach_on_client` INSERT. | ✅ gate logic (`unauthorizedAssignTargets`) covered by `tests/access-guards.test.mjs` | FIXED (code) · NEEDS-OWNER (apply migration) |
| AUTHZ-P1-fulfillment-pii | P1 | `fix/authz-rpc-grants` (`c2fc2fd5`) | `supabase-migrations/2026-06-30-rpc-authz-hardening.sql` | `REVOKE EXECUTE … FROM public, anon, authenticated` on `admin_list_store_fulfillment` (+ grant service_role). | ⚠️ DB grant — verify with `has_function_privilege` | NEEDS-OWNER (apply migration) |
| AUTHZ-P2-mark-fulfilled | P2 | `fix/authz-rpc-grants` (`c2fc2fd5`) | ↑ same migration | Revoke `admin_mark_store_fulfilled` from anon/authenticated. | ⚠️ DB grant | NEEDS-OWNER |
| AUTHZ-P2-consume-credit | P2 | `fix/authz-rpc-grants` (`c2fc2fd5`) | ↑ same migration | Revoke `consume_store_credit` from anon/authenticated (called only by the Stripe webhook via service-role). | ⚠️ DB grant | NEEDS-OWNER |
| AUTHZ-P2-metric-bypass | P2 | `fix/authz-rpc-grants` (`c2fc2fd5`) | ↑ same migration | Prepend `if auth.uid() is null then raise '42501'` to `set_metric_source` (body else verbatim). | ⚠️ DB function; verify anon call now raises | NEEDS-OWNER |
| AUTHZ-P2-program-bypass | P2 | `fix/authz-rpc-grants` (`c2fc2fd5`) | ↑ same migration | Same anon reject prepended to `set_program_detail`. | ⚠️ DB function | NEEDS-OWNER |
| AUTHZ-P1-store-credit | P1 | `fix/authz-store-pricing` (`0b218882`) | `supabase-migrations/2026-06-30-store-server-authoritative-pricing.sql` | New `store_catalogue` table (authoritative cost/credit/kind/locked); `redeem_store_item` looks it up and IGNORES client `p_cost`/`p_credit_cents`/`p_credit_kind`; rejects unknown/locked. | ⚠️ DB function + money — **verify on a Supabase branch DB before production** | NEEDS-OWNER |
| AUTHZ-P2-redeem-order | P2 | `fix/authz-store-pricing` (`0b218882`) | ↑ same migration | `redeem_store_order` looks up per-line cost/kind from `store_catalogue`, ignores client `cost`. | ⚠️ DB function | NEEDS-OWNER |
| AUTHZ-P2-claim-jack | P2 | `fix/authz-claim-provider` (`65a0ce19`) | `dashboard/claim/actions.ts`, `supabase-migrations/2026-06-30-claim-provider-service-role.sql` | `claim_provider_row` → 3-arg service-role-only (explicit `p_owner_id`); route calls it via `createAdminClient`. | ⚠️ DB grant | FIXED (code) · NEEDS-OWNER (apply migration) |

## Bounced (not fixed — needs an owner decision)

| Finding | Sev | Why not fixed here |
|---|---|---|
| AUTHZ-P2-email-enum (`get_email_for_username`) | P2 | The RPC is called **pre-auth by `anon`** during username login from **both** `mobile-app/src/services/shapeBackend.js` **and** `public/newdesign/login.jsx`. The proper fix (move the lookup behind a rate-limited server route + revoke anon EXECUTE) requires editing `public/newdesign/login.jsx`, which is **flag-only per repo rule** (must not be modified). **Owner decision:** either (a) accept the residual (email↔username disclosure is inherent to anon username-login), or (b) approve a `POST /api/auth/resolve-username` route (rate-limited by the proxy) + update the web + mobile login clients + revoke `get_email_for_username` from anon. Not doable without touching newdesign. |

## OWNER / dashboard checklist

**Apply these migrations on Supabase (order-independent except where noted), then run the footer verification:**
1. `2026-06-30-rpc-authz-hardening.sql` — revokes + null-guards. Verify: `has_function_privilege('anon', 'public.admin_list_store_fulfillment()'::regprocedure, 'EXECUTE')` → `f`.
2. `2026-06-30-store-server-authoritative-pricing.sql` — **test on a branch DB first** (money). Verify: `select count(*) from store_catalogue` → 19; a `redeem_store_item` with a bogus `p_cost`/`p_credit_cents` now charges the catalogue cost + mints only the catalogue credit. **Keep `store_catalogue` in sync with `src/lib/store-catalogue.ts`.**
3. `2026-06-30-coach-console-write-scope.sql` + `2026-06-30-coach-program-assignment-write-scope.sql` — RLS splits (deploy the matching route code too, though the routes fail-safe).
4. `2026-06-30-claim-provider-service-role.sql` — **deploy WITH `fix/authz-claim-provider` code** (brief admin-only claim gap between apply + deploy).

**Re-verify the whole SECDEF surface after applying (mirrors the audit's live check):**
```sql
select p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authd
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('admin_list_store_fulfillment','admin_mark_store_fulfilled',
    'consume_store_credit','claim_provider_row');   -- expect anon=f authd=f
```

**No secret rotation required** — the audit found no exposed secrets (only the by-design publishable key). No git-history scrub needed.

## Self-check
- Every selected P1/P2 is fixed-with-branch or explicitly bounced (email-enum → newdesign/owner). ✅
- No unselected findings touched; no pushes to `main`; `public/newdesign/**` untouched. ✅
- Function-body migrations copied verbatim via `pg_get_functiondef` (only the guard/lookup added). ✅
