// Did the auth server tell us this request is signed out, or did we fail to ask it?
//
// ⚠ getUser() RESOLVES { user: null, error } FOR AN OUTAGE EXACTLY AS IT DOES FOR A VISITOR WITH
// NO SESSION. auth-js turns a dead network or an auth-server 5xx into an AuthRetryableFetchError
// and hands it back with a null user, so a route that reads `!user` alone as "signed out" answers
// 401 to a signed-in coach whenever the auth server can't be reached. The coach Business page
// (public/newdesign/dashBusiness.jsx) reads a 401 from its analytics route as "show the preview",
// so an outage showed a signed-in coach the preview's payouts, renewals and plan (review of #2394).
// The two analytics routes answer 503 instead, which the page reads as an unread state.
//
// ⚠ AN ALLOW-LIST OF REAL ANSWERS, NOT A DENY-LIST OF FAILURES, for /api/me's reason (Codex on
// #2064; that route keeps its own copy, which tests/api-me-third-state.test.mjs lifts from its
// source). Only no error, no token at all, or a token the auth server checked and refused is
// signed out. A 5xx, a 429, a dead socket or an error nobody anticipated is a read that did not
// finish, so the next unforeseen error fails toward "couldn't read", not toward the preview.
import { isAuthSessionMissingError } from '@supabase/supabase-js';

export function isMeasuredSignedOut(error: unknown): boolean {
  if (!error) return true; // a clean read that found nobody
  if (isAuthSessionMissingError(error)) return true; // no token was presented
  const status = (error as { status?: unknown }).status;
  // The token was presented, checked, and refused.
  return status === 401 || status === 403;
}
