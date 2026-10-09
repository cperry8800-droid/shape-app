// Which database or network failures a Stripe webhook should be RETRIED for (M10 of the
// 2026-10-08 review).
//
// The webhook used to acknowledge every handler failure with 200, so that one permanently bad
// event could never drag the endpoint into a failing state. The cost was the other case: a
// TRANSIENT failure on the purchase or subscription upsert (the rows entitlements are read from)
// left a charged customer with no entitlement and no retry; recovery was someone reading logs.
//
// The split this module draws: a failure that will read the same way tomorrow (a constraint, a
// missing column, bad data, a refused grant) is acknowledged and logged, as before; one that is
// about the connection, the server, a lock or a timeout is answered 5xx, and Stripe retries the
// event for up to three days. Permanent failures are the default: an error this module does not
// recognise is NOT retried, so a new permanent shape can never turn into a three-day loop.
//
// SQLSTATE classes (the first two characters of a five-character Postgres code):
//   08  connection exception            53  insufficient resources (too many connections, disk)
//   57  operator intervention (cancelled, admin shutdown)   40  transaction rollback (deadlock,
//                                                                serialization failure)
// PostgREST's own codes for the same conditions: PGRST000 (could not connect), PGRST001
// (internal), PGRST002 (schema cache could not load), PGRST003 (request timed out).
// A thrown fetch failure (the Supabase client reached nothing) is retryable too.

const RETRYABLE_SQLSTATE_CLASSES = new Set(['08', '53', '57', '40']);
const RETRYABLE_PGRST = new Set(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003']);
const NETWORK_RE = /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|socket hang up|network error|request timed out|timed out|timeout/i;

export function isRetryableDbError(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== 'object' || depth > 3) return false;
  const e = err as { code?: unknown; message?: unknown; name?: unknown; status?: unknown; cause?: unknown };
  const code = typeof e.code === 'string' ? e.code.trim() : '';
  if (code && RETRYABLE_PGRST.has(code)) return true;
  if (/^[0-9A-Z]{5}$/.test(code) && RETRYABLE_SQLSTATE_CLASSES.has(code.slice(0, 2))) return true;
  if (typeof e.status === 'number' && e.status >= 500 && e.status <= 599) return true;
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  if (typeof e.message === 'string' && NETWORK_RE.test(e.message)) return true;
  if (e.cause && typeof e.cause === 'object') return isRetryableDbError(e.cause, depth + 1);
  return false;
}
