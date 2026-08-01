// Types for call-rpc.mjs. See that file for the wrapper's full contract and
// the trap it exists to close (a resolved `{ error }`, not a rejection).

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The minimal shape any Supabase-like client needs for `callRpc` to wrap it. */
export interface RpcCapableClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
}

/**
 * Calls `client.rpc(name, args)`, reports a RESOLVED `{ error }` to Sentry
 * (tagged with the RPC name), and returns the result UNCHANGED either way.
 *
 * A rejection is not caught here — it propagates exactly as
 * `client.rpc(name, args)` would on its own.
 */
export function callRpc(
  client: RpcCapableClient,
  name: string,
  args?: Record<string, unknown>,
): Promise<{ data: any; error: any }>;
