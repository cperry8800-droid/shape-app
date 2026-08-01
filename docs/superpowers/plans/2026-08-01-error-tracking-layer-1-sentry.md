# Error Tracking Layer 1 (Sentry) Implementation Plan

> ⚠ **SUPERSEDED IN PART — read this before following any step below.** This is the
> as-written build contract, kept as the historical record. Review rounds on the PR
> corrected three things it gets wrong, and following the plan verbatim would
> reintroduce two of them:
>
> 1. **Four projects and eight env vars, not three and six.** The static website is its
>    own release stream (`SHAPE_SITE_SENTRY_DSN`), and the mobile source-map upload needs
>    `SENTRY_PROJECT_MOBILE`. The env block in Task 2 Step 7 is incomplete.
> 2. **The static-site DSN is injected by `scripts/build-newdesign.mjs` at deploy, NOT
>    assigned in `pageShell.jsx`.** The plan's approach could never have been activated:
>    that surface has no bundler, so nothing there can read an env var, and no file ever
>    assigned the global. It also reached only 69 of 76 pages.
> 3. **Mobile source maps must actually be uploaded.** The plan generated them and had
>    `build-m.sh` strip them with nothing in between, so every mobile stack trace would
>    have arrived minified. `@sentry/vite-plugin` now uploads during the Vite build.
>
> `docs/WORKLOG.md` (2026-08-01) carries the authoritative account.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crash and exception reporting across all three runtimes, wired so it activates the
moment the owner supplies DSNs — and is completely inert until then.

**Architecture:** One Sentry org, three projects, three SDKs. A shared pure module builds the
user context and release string so all three surfaces tag events identically. All Supabase
RPC failures report through **one wrapper** rather than annotated call sites. The
`reportAlerts` seam left by Layer 2 is swapped from `console.error` to Sentry.

**Tech Stack:** `@sentry/nextjs` (Next pages + all 156 API routes), `@sentry/capacitor` +
`@sentry/react` (the `/m/` Capacitor app), `@sentry/browser` (static `public/newdesign/`).

**Spec:** [`docs/superpowers/specs/2026-07-31-error-tracking-design.md`](../specs/2026-07-31-error-tracking-design.md) (approved 2026-07-31)

## Global Constraints

- ⚠ **NO DSN EXISTS YET. Every surface must be INERT and BUILD-SAFE with the env vars
  absent.** `Sentry.init({ dsn: '' })` disables the SDK — rely on that, never on a
  conditional import. **A missing `SENTRY_*` var must never fail a build or throw at
  runtime.** This is the single most important property of the whole plan: it ships to
  production before the account exists.
- ⚠ **The mobile app is CAPACITOR, not React Native.** `mobile-app/package.json` is
  `"name": "shape-capacitor"`; there is no `react-native` dependency anywhere.
  `@sentry/wizard -i reactNative` matches nothing here — **do not run any wizard.**
- ⚠ **NO PII.** `id` plus two tags only: `roles` (sorted, comma-joined) and `is_coach`.
  **Never** email, name, phone, or `stripe_customer_id`. #1851 restricted exactly those
  fields at the database; shipping them to a third party would undo it.
- ⚠ **`roles` is an ARRAY, not a string.** `public/supabase.js:83` reads `profile.roles`
  with singular `profile.role` as a legacy fallback, and `dietitian` is an alias for
  `nutritionist`. Dual-role accounts are real. **Reuse `isCoachRole` / `COACH_ROLES` from
  `src/lib/roles.mjs`** — do not re-derive the role vocabulary.
- **Release = the git SHA**, identical across web and mobile, so one deploy's errors
  correlate. `VERCEL_GIT_COMMIT_SHA` on the web side; the same value injected into
  `scripts/build-m.sh`.
- **Source maps:** `sourcemap: 'hidden'` on the `/m/` build only. The website needs none —
  `scripts/build-newdesign.mjs` does JSX transform with **no minification**.
- Line endings LF, zero NUL bytes on every file touched. Verify before every commit.
- Stage by **explicit path** on every commit. Never `git commit -a`.
- Test runner: `npm test` (`node --test "tests/**/*.test.mjs"`). Suite is **1384** at plan time.

---

### Task 1: The shared context module

Everything that decides *what tags an event carries* lives here, pure and tested, so all
three surfaces agree and the rules are verifiable without a browser or a DSN.

**Files:**
- Create: `src/lib/sentry-context.mjs`
- Test: `tests/sentry-context.test.mjs`

**Interfaces:**
- Consumes: `COACH_ROLES`, `isCoachRole` from `src/lib/roles.mjs`
- Produces:
  - `bsSentryUser(profile) -> {id, roles, is_coach} | null`
  - `bsSentryRelease(env) -> string|undefined`
  - `BS_SENTRY_DENIED_KEYS: string[]`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/sentry-context.test.mjs
// Pure Sentry tagging rules: what a user context may and may not carry.
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsSentryUser, bsSentryRelease, BS_SENTRY_DENIED_KEYS } from '../src/lib/sentry-context.mjs';

test('a client profile yields id, empty roles and is_coach false', () => {
  const u = bsSentryUser({ id: 'u1', roles: [], role: 'client' });
  assert.equal(u.id, 'u1');
  assert.equal(u.is_coach, false);
  assert.equal(u.roles, 'client');
});

test('roles come from the ARRAY, sorted and comma-joined', () => {
  const u = bsSentryUser({ id: 'u2', roles: ['trainer', 'nutritionist'] });
  assert.equal(u.roles, 'nutritionist,trainer');
  assert.equal(u.is_coach, true);
});

test('the legacy singular role is the fallback when the array is absent', () => {
  const u = bsSentryUser({ id: 'u3', role: 'trainer' });
  assert.equal(u.roles, 'trainer');
  assert.equal(u.is_coach, true);
});

test('dietitian counts as a coach — it is an alias for nutritionist', () => {
  const u = bsSentryUser({ id: 'u4', roles: ['dietitian'] });
  assert.equal(u.is_coach, true);
});

test('a dual-role account keeps BOTH roles visible', () => {
  const u = bsSentryUser({ id: 'u5', roles: ['nutritionist', 'trainer'] });
  assert.equal(u.roles, 'nutritionist,trainer', 'a boolean would erase this distinction');
});

test('⚠ PII is never emitted, whatever the profile carries', () => {
  const u = bsSentryUser({
    id: 'u6', roles: ['client'],
    email: 'a@b.c', full_name: 'Real Name', phone: '+1', date_of_birth: '1990-01-01',
    stripe_customer_id: 'cus_x', location: 'London', username: 'handle',
  });
  assert.deepEqual(Object.keys(u).sort(), ['id', 'is_coach', 'roles']);
  for (const k of BS_SENTRY_DENIED_KEYS) {
    assert.equal(k in u, false, `${k} must never reach Sentry`);
  }
});

test('no id means no user context at all, rather than a partial one', () => {
  assert.equal(bsSentryUser({ roles: ['client'] }), null);
  assert.equal(bsSentryUser(null), null);
  assert.equal(bsSentryUser('nope'), null);
});

test('junk roles never throw and never fabricate a coach', () => {
  assert.equal(bsSentryUser({ id: 'u7', roles: [null, 42, {}] }).is_coach, false);
  assert.equal(bsSentryUser({ id: 'u8', roles: 'not-an-array' }).is_coach, false);
});

test('release prefers the explicit var, then the Vercel SHA, else undefined', () => {
  assert.equal(bsSentryRelease({ SHAPE_RELEASE: 'abc123' }), 'abc123');
  assert.equal(bsSentryRelease({ VERCEL_GIT_COMMIT_SHA: 'def456' }), 'def456');
  assert.equal(bsSentryRelease({}), undefined, 'undefined, never a fake value');
  assert.equal(bsSentryRelease({ VERCEL_GIT_COMMIT_SHA: '' }), undefined);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- --test-name-pattern="PII is never emitted"`
Expected: FAIL — `Cannot find module '../src/lib/sentry-context.mjs'`

- [ ] **Step 3: Implement**

```javascript
// src/lib/sentry-context.mjs
//
// What a Sentry event is allowed to say about a person. Pure — no SDK import, no
// network, no env read except through an explicitly passed object, so the rules
// are testable without a DSN.
//
// ⚠ NO PII, and this is not a style preference. #1851 restricted `profiles`
// email/phone/date_of_birth/location/stripe_customer_id at the DATABASE because
// they were readable by any signed-in member. Shipping the same fields to a
// third-party service would undo that at a different layer.
import { isCoachRole } from './roles.mjs';

/** Named so a reviewer can grep for them, and so a test can assert their absence. */
export const BS_SENTRY_DENIED_KEYS = [
  'email', 'full_name', 'name', 'phone', 'date_of_birth', 'location',
  'stripe_customer_id', 'username', 'ip_address',
];

/**
 * The roles a profile carries, as a sorted array of strings.
 *
 * ⚠ `roles` is an ARRAY and `role` is the legacy singular fallback — see
 * `public/supabase.js:83`. A dual-role account is real, so this must not collapse
 * to one value.
 */
function rolesOf(profile) {
  const arr = Array.isArray(profile.roles) ? profile.roles : null;
  const list = arr && arr.length ? arr : (profile.role ? [profile.role] : []);
  return list.filter((r) => typeof r === 'string' && r).sort();
}

/**
 * The user context for an event, or null.
 *
 * ⚠ Returns null rather than a partial object when there is no id: a user context
 * without an identifier groups unrelated people together, which is worse than none.
 */
export function bsSentryUser(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const id = typeof profile.id === 'string' && profile.id ? profile.id : null;
  if (!id) return null;

  const roles = rolesOf(profile);
  return {
    id,
    roles: roles.join(','),
    // The common filter. `roles` keeps the detail; this keeps the query short.
    is_coach: roles.some((r) => isCoachRole(r)),
  };
}

/**
 * The release string. Identical on web and mobile so one deploy's errors correlate
 * — without it, joining a mobile crash to a server error means comparing clocks.
 *
 * ⚠ Returns undefined rather than a placeholder when unknown. A fabricated release
 * silently merges every unversioned deploy into one bucket.
 */
export function bsSentryRelease(env) {
  const e = env && typeof env === 'object' ? env : {};
  const v = e.SHAPE_RELEASE || e.VERCEL_GIT_COMMIT_SHA || '';
  return typeof v === 'string' && v ? v : undefined;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all new tests pass; the pre-existing suite still passes.

- [ ] **Step 5: Verify and commit**

```bash
perl -pi -e 's/\r\n/\n/g' src/lib/sentry-context.mjs tests/sentry-context.test.mjs
perl -e 'local $/; for (@ARGV) { open F,"<:raw",$_; $d=<F>; die "NUL/CR in $_\n" if $d=~/[\x00\r]/ } print "clean\n"' src/lib/sentry-context.mjs tests/sentry-context.test.mjs
git add src/lib/sentry-context.mjs tests/sentry-context.test.mjs
git commit -m "feat(sentry): the pure tagging rules — id, roles, is_coach, and nothing else"
```

---

### Task 2: Next.js — pages and all 156 API routes

**Files:**
- Create: `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`
- Create: `src/instrumentation-client.ts`
- Modify: `next.config.ts` (wrap with `withSentryConfig`)
- Modify: `.env.example`
- Modify: `package.json` (add `@sentry/nextjs`)

**Interfaces:**
- Consumes: `bsSentryRelease` from `@/lib/sentry-context.mjs`
- Produces: server + client Sentry initialised for the Next runtime; `Sentry` importable in any route.

- [ ] **Step 1: Install**

```bash
npm install --save @sentry/nextjs
```

⚠ **Do NOT run `npx @sentry/wizard`.** It rewrites config files and assumes a DSN exists.

- [ ] **Step 2: Server config**

Create `sentry.server.config.ts`:

```typescript
// Server-side Sentry for Next route handlers and RSC.
// ⚠ An absent DSN DISABLES the SDK — that is the supported way to ship this before
// the account exists. Never guard with a conditional import; the module graph must
// stay identical with and without the env var.
import * as Sentry from '@sentry/nextjs';
import { bsSentryRelease } from '@/lib/sentry-context.mjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  release: bsSentryRelease(process.env),
  environment: process.env.VERCEL_ENV || 'development',
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
```

⚠ `sendDefaultPii: false` is load-bearing — `true` attaches IP addresses and request headers.

- [ ] **Step 3: Edge config**

Create `sentry.edge.config.ts` with the identical body (the edge runtime is initialised separately).

- [ ] **Step 4: Register both**

Create `instrumentation.ts`:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('../sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config');
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
```

- [ ] **Step 5: Client config**

Create `src/instrumentation-client.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';
import { bsSentryRelease } from '@/lib/sentry-context.mjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  release: bsSentryRelease({ SHAPE_RELEASE: process.env.NEXT_PUBLIC_SHAPE_RELEASE }),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
  tracesSampleRate: 0,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Step 6: Wrap the Next config**

Modify `next.config.ts` — read it first and preserve every existing option. Wrap the final
export:

```typescript
import { withSentryConfig } from '@sentry/nextjs';
// ... existing config unchanged ...
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // ⚠ Without an auth token the plugin SKIPS the upload and warns. It must not fail
  // the build — this ships before the account exists.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
```

- [ ] **Step 7: Document the env vars**

Append to `.env.example`:

```dotenv
# Error tracking (Layer 1). ALL OPTIONAL — absent means the SDK is disabled, which is
# the supported state until the Sentry org exists. Nothing fails without them.
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

- [ ] **Step 8: Prove it builds with NO env vars set**

Run: `npx tsc --noEmit` → clean
Run: `npm run build` → must succeed with every `SENTRY_*` unset.
⚠ **This is the acceptance test for the whole task.** If the build needs a DSN, the task failed.

- [ ] **Step 9: Verify and commit** (LF/NUL, then `git add` the exact files above)

---

### Task 3: The `/m/` Capacitor app

**Files:**
- Modify: `mobile-app/package.json` (add `@sentry/capacitor`, `@sentry/react`)
- Create: `mobile-app/src/sentry.mjs`
- Modify: `mobile-app/src/main.jsx` (or the app entry — find it, do not assume)
- Modify: `mobile-app/vite.config.*` (`sourcemap: false` → `'hidden'`)
- Modify: `scripts/build-m.sh` (inject the release)

- [ ] **Step 1: Install**

```bash
cd mobile-app && npm install --save @sentry/capacitor @sentry/react
```

⚠ Capacitor pairs the native layer with the **browser** SDK — this is the documented setup,
not a workaround.

- [ ] **Step 2: The init module**

Create `mobile-app/src/sentry.mjs`:

```javascript
// Sentry for the /m/ broadsheet. Capacitor wraps a WebView, so this is the browser
// SDK on a thin native layer — NOT React Native.
//
// ⚠ Inert without a DSN, deliberately: this ships before the org exists.
import * as Sentry from '@sentry/capacitor';
import * as SentrySibling from '@sentry/react';

export function bsInitSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN || '';
  Sentry.init({
    dsn,
    release: import.meta.env.VITE_SHAPE_RELEASE || undefined,
    environment: import.meta.env.MODE || 'development',
    tracesSampleRate: 0,
    sendDefaultPii: false,
  }, SentrySibling.init);
}

/** Apply the user context. Pass null on sign-out — a stale user mislabels every later event. */
export function bsSetSentryUser(user) {
  Sentry.setUser(user || null);
}
```

- [ ] **Step 3: Call it at the entry point**

Find the app entry (`mobile-app/src/main.jsx` or equivalent — **read the directory, do not
assume the filename**) and call `bsInitSentry()` as the first statement, before React mounts,
so a crash during mount is captured.

- [ ] **Step 4: Hidden source maps**

Modify `mobile-app/vite.config.*` line ~59. Replace `sourcemap: false` and **rewrite the
comment above it** — the existing one explains why maps were off, and leaving it would
contradict the code:

```javascript
    // Hidden sourcemaps: generated for Sentry upload, but NO sourceMappingURL is
    // emitted, so nothing is publicly reachable. The original objection to maps was
    // that they published ~5 MB of source at a public URL — hidden maps answer that
    // exactly, and without them every mobile stack trace is unreadable.
    sourcemap: 'hidden',
```

- [ ] **Step 5: Inject the release into the mobile build**

Modify `scripts/build-m.sh` — read it first. Export `VITE_SHAPE_RELEASE` from
`VERCEL_GIT_COMMIT_SHA` before the Vite build so mobile and web share one release string.

- [ ] **Step 6: Prove the mobile build still works with no DSN**

Run: `cd mobile-app && VITE_BASE=/m/ npm run build`
Expected: succeeds; `dist/` contains `.map` files and **no** `sourceMappingURL` comment in
the emitted JS. Verify both:

```bash
ls mobile-app/dist/assets/*.map | head -3
grep -rl "sourceMappingURL" mobile-app/dist/assets/*.js | head -3   # expect NO output
```

- [ ] **Step 7: Verify and commit**

---

### Task 4: The static website

**Files:**
- Modify: `public/newdesign/pageShell.jsx` (shared by 69 pages — one hook covers them all)
- Create: `public/newdesign/sentryInit.js`

⚠ **Do NOT edit 69 pages.** `pageShell.jsx` is shared; a per-page sweep would make a
70-file PR that CodeRabbit auto-skips (>50 files = no review at all).

- [ ] **Step 1: The loader**

Create `public/newdesign/sentryInit.js` as a plain, dependency-free script that no-ops when
`window.SHAPE_SENTRY_DSN` is unset. ⚠ **Do not add a bundler to this surface** — these pages
are served as static files with in-browser Babel; use Sentry's CDN loader via a `<script>`
tag, guarded so an absent DSN skips the fetch entirely.

- [ ] **Step 2: Hook it into the shared shell**

Modify `pageShell.jsx` to include the loader once. Keep the diff to that one file.

- [ ] **Step 3: Verify**

Run: `node scripts/build-newdesign.mjs` → succeeds.
Load a page locally with no DSN configured → **no network request to Sentry**, no console error.

- [ ] **Step 4: Verify and commit**

---

### Task 5: Instrumentation — the RPC wrapper and the alert seam

**Files:**
- Create: `src/lib/supabase/call-rpc.ts`
- Modify: `src/app/api/cron/guardrail-health/route.ts` (`reportAlerts` body only)
- Modify: `src/lib/week-publish-server.ts` (the publish route)
- Test: `tests/call-rpc.test.mjs`

- [ ] **Step 1: The wrapper**

`callRpc(client, name, args)` awaits `client.rpc(name, args)`, and on a returned error
reports to Sentry tagged with the RPC name, then returns the result unchanged.

⚠ **PostgREST errors arrive as `{ error }` on a RESOLVED promise, not a rejection.** A
try/catch alone never fires for the most likely failure — a revoked grant, a missing
function, an unwhitelisted event. The wrapper must inspect the resolved error explicitly.
This exact trap is documented at `src/lib/week-publish-server.ts:201`.

⚠ **One wrapper, not annotated call sites.** Annotating individually is where this rots —
the next new caller silently doesn't get it.

- [ ] **Step 2: Swap the alert seam**

In `route.ts`, change **only the body** of `reportAlerts` to call
`Sentry.captureMessage(a.message, { level, tags: { alert: 'guardrail-health', check: a.check } })`,
**keeping the existing `console.error`** so findings still reach Vercel logs when the DSN is
absent. Update the comment, which currently says Sentry does not exist yet.

- [ ] **Step 3: Tests, then verify and commit**

Test that a resolved `{ error }` is reported and that a success is not. `npm test` must pass.

---

### Task 6: Records and owner runbook

**Files:**
- Modify: `docs/WORKLOG.md` (Latest pointer + dated entry)
- Modify: `src/lib/warroom.ts` (the error-tracking section)

- [ ] **Step 1: Write the entry**

It must state, in the house voice:
- Layer 1 is **installed but INERT** — no DSN, so the SDKs are disabled and **nothing is
  being captured yet**. ⚠ Do not write this as "error tracking is live".
- The exact owner steps: create org + 3 projects; supply `SENTRY_DSN`,
  `NEXT_PUBLIC_SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`,
  `SENTRY_AUTH_TOKEN`; **redeploy** (Vercel injects env vars at build time).
- ⚠ **The alert rules are a SEPARATE owner step, and without them this notifies nobody.**
  Two rules: an issue rule filtered on tag `alert` = `guardrail-health`, and a cron-monitor
  rule on missed check-in. An issue rule does not cover a missed check-in.
- ⚠ **Verification is required, not optional**: fire a test event on each surface and confirm
  it arrives **symbolicated**, tagged with the right release and roles — and confirm a
  **notification actually reaches the inbox**. An issue appearing in Sentry is not evidence
  anyone was told.
- The `/m/` build now emits hidden source maps, reversing the earlier `sourcemap: false`
  decision, and why that answers the original objection.

- [ ] **Step 2: Verify and commit**

---

## Owner actions after this plan

| # | Action | Without it |
|---|---|---|
| 1 | Create the Sentry org + 3 projects | The SDKs stay disabled; nothing is captured |
| 2 | Supply the DSNs + auth token, then **redeploy** | Same — env vars are injected at build time |
| 3 | **Create both alert rules** | Events are filed and **nobody is notified** |
| 4 | Fire a test event per surface and confirm a notification arrives | No evidence any of it works |
| 5 | Set `HEARTBEAT_PING_URL` (Layer 2, still outstanding) | Nothing notices if the cron stops |

⚠ **Items 3 and 4 are the difference between error tracking existing and error tracking
working.** `captureMessage` files an issue; it does not page anyone.
