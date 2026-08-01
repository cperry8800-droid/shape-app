// src/lib/supabase/call-rpc.mjs
//
// One wrapper for every Supabase RPC call — not annotated call sites. See
// call-rpc.d.ts for the exported type. Module shape: a pure-ish `.mjs` (the
// one side effect is the Sentry report) plus a hand-written `.d.ts`, the
// `console-triage.mjs` pattern — chosen over a bare `.mjs` (guardrail-health.mjs)
// because callers care about the client/return shape being typed, and over an
// `.mjs` + `.ts` re-export twin (platform-fee) because nothing here needs an
// extensionless `@/lib/...` import path — both existing RPC call sites already
// import their neighbours with the literal `.mjs` extension (see
// `guardrail-health.mjs`'s own import in the cron route).
//
// ⚠ A DENIED OR MISSING RPC RESOLVES; IT DOES NOT REJECT. PostgREST errors
// arrive as `{ error }` on a RESOLVED promise — a revoked grant, an absent
// function, an unwhitelisted event all land here, never in a catch block. A
// plain `try/catch` around `client.rpc(...)` never fires for any of them. This
// exact trap is documented at `src/lib/week-publish-server.ts:201-206`: a
// failed `track_event` call there "would disappear without even the intended
// log — silently corrupting the flag-rate data" §10.2 needs. This wrapper
// inspects the resolved `error` explicitly, so the trap closes for every
// caller that routes through it, not just the one that was audited by hand.
//
// ⚠ ONE WRAPPER, NOT ANNOTATED CALL SITES. The next person to add an RPC call
// only gets this protection if they call `callRpc` instead of `client.rpc`
// directly — annotating individual callers after the fact is exactly how this
// kind of guard rots: it protects only the sites someone remembered to touch.
//
// ⚠ RETURNS THE RESULT UNCHANGED, both on error and on success — this is a
// drop-in replacement at any call site: `client.rpc(name, args)` becomes
// `callRpc(client, name, args)` and nothing else about the caller's code needs
// to change.
//
// ⚠ DEFAULT IMPORT, NOT `import * as Sentry` — DO NOT "TIDY" THIS.
// Under Node's native ESM loader, `import * as Sentry from '@sentry/nextjs'`
// comes back with `captureException` and `captureMessage` UNDEFINED: the SDK is
// CJS, and cjs-module-lexer only statically detects a subset of its exports
// (`init` and `default` resolve; the capture functions do not). Verified
// empirically on this repo's Node (v24.14.1). The default import carries the
// full SDK under BOTH `node --test` and Next's bundler, so it is the only form
// that works everywhere this module runs.
//
// This matters because the sibling file `src/app/api/cron/guardrail-health/
// route.ts` legitimately uses `import * as Sentry` — that one only ever runs
// through Next's bundler, where the namespace form is fine. Harmonizing the two
// files on the namespace style would silently break reporting here, with no
// error and no test failure: `Sentry.captureException` would just be undefined
// inside a try/catch that swallows the resulting TypeError. The wrapper would
// go on returning results perfectly while reporting nothing at all.
import Sentry from '@sentry/nextjs';

/**
 * Awaits `client.rpc(name, args)`. On a RESOLVED `{ error }`, reports it to
 * Sentry tagged with the RPC name, then returns the result unchanged either
 * way.
 *
 * A genuine rejection (the client throwing, the promise rejecting) is NOT
 * caught here — it propagates exactly as `client.rpc(name, args)` would on
 * its own, so any try/catch a caller already has around the call keeps
 * working unmodified. That is not this wrapper's trap: a rejection already
 * reaches a `catch` block, which is precisely what a resolved `{ error }`
 * does not.
 *
 * @param {{ rpc(name: string, args?: Record<string, unknown>): PromiseLike<{data:any,error:any}> }} client
 * @param {string} name
 * @param {Record<string, unknown>} [args]
 * @returns {Promise<{data:any, error:any}>}
 */
export async function callRpc(client, name, args) {
  const result = await client.rpc(name, args);
  if (result && result.error) {
    // ⚠ A throw from the reporting call itself must never cost the caller its
    // result. Sentry's own contract is that `captureException` against a
    // disabled SDK (no DSN — the state before an account exists) is a no-op,
    // but that is deliberately not trusted blindly here: this catch is caught
    // and swallowed, not re-raised, the same "total function" discipline as
    // `bsSentryUser` in `sentry-context.mjs:38-46` — a throw while reporting
    // one failure must never turn into a second, worse one for the caller.
    try {
      Sentry.captureException(result.error, { tags: { rpc: name } });
    } catch {
      // deliberately empty — see the comment above.
    }
  }
  return result;
}
