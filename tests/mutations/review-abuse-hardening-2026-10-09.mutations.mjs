// Mutation spec for the abuse and integrity half of the 2026-10-08 review's app code (M1, M2,
// M3, M4, M10, M11). Each mutation breaks one clause; tests/review-abuse-hardening.test.mjs, the
// store-credit webhook tests and the definer audit must notice every one. The Postgres halves of
// M4 (the trigger, the slug rule under a real insert) are not mutated here: the runner does not
// run Postgres, and the replica run recorded in the PR is their test.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/review-abuse-hardening-2026-10-09.mutations.mjs --fail-on-skipped
const MW = 'src/lib/supabase/middleware.ts';
const CONTACT = 'src/app/api/contact/route.ts';
const PAGE = 'public/contact.html';
const RULES = 'public/newdesign/bookingRules.mjs';
const BOOKING = 'src/lib/session-booking.ts';
const CONSULT = 'src/app/api/consultation/route.ts';
const REQUEST = 'src/app/api/sessions/request/route.ts';
const REVIEWS = 'src/app/api/coaches/reviews/route.ts';
const MIG = 'supabase-migrations/2026-10-09-coach-reviews-require-relationship.sql';
const RETRY = 'src/lib/db-retryable.ts';
const WEBHOOK = 'src/app/api/stripe/webhook/route.ts';
const TURNSTILE = 'src/lib/turnstile.ts';
const LIMITS = 'src/lib/ai/noraLimits.ts';

export default {
  test: 'node --test tests/review-abuse-hardening.test.mjs tests/store-credit-reservation.test.mjs tests/definer-grants.test.mjs tests/schedule-step3.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── M1 ──
    { name: 'a token that fails verification still names its own bucket', file: MW,
      find: '    if (error || !data) return null;\n    const sub = (data.claims as { sub?: unknown } | undefined)?.sub;',
      replace: "    const sub = (data?.claims as { sub?: unknown } | undefined)?.sub ?? (JSON.parse(Buffer.from(token.split('.')[1] || 'e30', 'base64').toString()) as { sub?: string }).sub;" },
    { name: 'a verification that throws trusts the token', file: MW,
      find: '  } catch {\n    return null;\n  }\n}\n\nfunction dashboardFor',
      replace: "  } catch {\n    return (JSON.parse(Buffer.from(token.split('.')[1] || 'e30', 'base64').toString()) as { sub?: string }).sub ?? null;\n  }\n}\n\nfunction dashboardFor" },
    // ── M2 ──
    { name: 'the contact route skips the bot check', file: CONTACT,
      find: "  if (!(await verifyTurnstile(body.captchaToken ?? body.turnstileToken, ip))) {\n    return NextResponse.json({ error: 'Captcha check failed — please retry.' }, { status: 400 });\n  }\n",
      replace: '' },
    { name: 'the auto-reply echoes the message again', file: CONTACT,
      find: "    `We got your message${c.subject ? ` about \"${c.subject}\"` : ''} and someone from the Shape team will get back to you within 1–2 business days.`,",
      replace: "    `We got your message${c.subject ? ` about \"${c.subject}\"` : ''} and someone from the Shape team will get back to you within 1–2 business days.`,\n    '',\n    c.message," },
    { name: 'the page submits without a token', file: PAGE,
      find: '      if (captchaOn && !captchaToken) {',
      replace: '      if (false) {' },
    { name: 'the widget is reset only after a success (a failed insert keeps the spent token)', file: PAGE,
      find: "        form.reset();\n      } catch(err){\n        showToast('Network error. Please check your connection and try again.', true);\n      } finally {\n        resetCaptcha();\n",
      replace: "        form.reset();\n        resetCaptcha();\n      } catch(err){\n        showToast('Network error. Please check your connection and try again.', true);\n      } finally {\n" },
    { name: 'a reset keeps the spent token in the form', file: PAGE,
      find: "      captchaToken = '';\n      try { window.ShapeTurnstile.reset(captchaWidget); } catch (e) {}",
      replace: "      try { window.ShapeTurnstile.reset(captchaWidget); } catch (e) {}" },
    // ── M3 ──
    { name: 'the cap is a hundred', file: RULES,
      find: 'export const OPEN_REQUESTS_CAP = 20;',
      replace: 'export const OPEN_REQUESTS_CAP = 100;' },
    { name: "the trigger's open_requests refusal reads as an unknown error", file: RULES,
      find: '  const m = /^booking_rule:(notice|time_off|buffer|daily_limit|open_requests)$/.exec(String(error.message ?? \'\').trim());',
      replace: '  const m = /^booking_rule:(notice|time_off|buffer|daily_limit)$/.exec(String(error.message ?? \'\').trim());' },
    { name: 'past requests count as open', file: BOOKING,
      find: "    .eq('status', 'requested')\n    .gt('scheduled_at', new Date(args.nowMs ?? Date.now()).toISOString());",
      replace: "    .eq('status', 'requested');" },
    { name: 'a failed count reads as none open', file: BOOKING,
      find: '  if (error) return { ok: false };\n  return { ok: true, count: Number(count ?? 0) };',
      replace: '  return { ok: true, count: error ? 0 : Number(count ?? 0) };' },
    { name: 'the consultation route stops refusing at the cap', file: CONSULT,
      find: "  if (open.count >= OPEN_REQUESTS_CAP) {\n    return NextResponse.json({ error: openRequestsMessage(OPEN_REQUESTS_CAP), code: 'open_requests' }, { status: 409 });\n  }\n  let coachEmail",
      replace: '  let coachEmail' },
    { name: 'the member request route stops refusing at the cap', file: REQUEST,
      find: "  if (open.count >= OPEN_REQUESTS_CAP) {\n    return NextResponse.json({ error: openRequestsMessage(OPEN_REQUESTS_CAP), code: 'open_requests' }, { status: 409 });\n  }\n  const meta",
      replace: '  const meta' },
    // ── M4 ──
    { name: 'the route writes before it asks', file: REVIEWS,
      find: "  if (allowed !== true) {\n    return NextResponse.json(\n      { error: 'You can review a coach once you have subscribed to them or had a session with them.', code: 'relationship_required' },\n      { status: 403 }\n    );\n  }\n  const payload",
      replace: '  const payload' },
    { name: 'a database without the function publishes unchecked', file: REVIEWS,
      find: "  if (allowedErr) {\n    console.error('coach review relationship check failed:', allowedErr);\n    return NextResponse.json({ error: 'Reviews are unavailable just now. Please try again later.' }, { status: 503 });\n  }",
      replace: "  if (allowedErr) {\n    console.error('coach review relationship check failed:', allowedErr);\n  }" },
    { name: 'a pending subscription is a relationship', file: MIG,
      find: "           and s.status not in ('pending', 'incomplete', 'incomplete_expired')\n",
      replace: '' },
    { name: 'an expired never-paid checkout is a relationship', file: MIG,
      find: "           and s.status not in ('pending', 'incomplete', 'incomplete_expired')\n",
      replace: "           and s.status not in ('pending', 'incomplete')\n" },
    { name: 'a future session is a relationship', file: MIG,
      find: "           and x.status in ('confirmed', 'completed')\n           and x.scheduled_at < now()\n",
      replace: "           and x.status in ('confirmed', 'completed')\n" },
    { name: 'anon can ask the relationship function (its revoke is dropped)', file: MIG,
      find: 'revoke all on function public.coach_review_allowed(text, text) from anon;\n',
      replace: '' },
    { name: 'the relationship function reads a caller-named account', file: MIG,
      find: 'create or replace function public.coach_review_allowed(p_slug text, p_kind text)\nreturns boolean',
      replace: 'create or replace function public.coach_review_allowed(p_slug text, p_kind text, p_user uuid default null)\nreturns boolean' },
    { name: 'the trigger only fires on insert, so a re-point to another coach is unchecked', file: MIG,
      find: 'create trigger coach_reviews_require_relationship\n  before insert or update on public.coach_reviews',
      replace: 'create trigger coach_reviews_require_relationship\n  before insert on public.coach_reviews' },
    // ── M10 ──
    { name: 'a unique violation is retried for three days', file: RETRY,
      find: "const RETRYABLE_SQLSTATE_CLASSES = new Set(['08', '53', '57', '40']);",
      replace: "const RETRYABLE_SQLSTATE_CLASSES = new Set(['08', '53', '57', '40', '23']);" },
    { name: 'a PostgREST timeout is not retried', file: RETRY,
      find: "const RETRYABLE_PGRST = new Set(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003']);",
      replace: "const RETRYABLE_PGRST = new Set(['PGRST000', 'PGRST001', 'PGRST002']);" },
    { name: 'any error with a message is retried', file: RETRY,
      find: '  if (typeof e.message === \'string\' && NETWORK_RE.test(e.message)) return true;',
      replace: '  if (typeof e.message === \'string\') return true;' },
    { name: 'the webhook acknowledges a transient purchase failure with 200', file: WEBHOOK,
      find: "            if (isRetryableDbError(purchaseErr)) {\n              return NextResponse.json({ received: false, retry: true, error: 'purchase record not written' }, { status: 503 });\n            }\n",
      replace: '' },
    { name: 'the webhook acknowledges a thrown network failure with 200', file: WEBHOOK,
      find: '    if (isRetryableDbError(err)) {\n      return NextResponse.json({ received: false, retry: true, handlerError: true }, { status: 503 });\n    }\n',
      replace: '' },
    // ── M11 ──
    { name: 'Turnstile fails open again', file: TURNSTILE,
      find: '  } catch {\n    return false;\n  }\n}',
      replace: '  } catch {\n    return true;\n  }\n}' },
    { name: 'a 5xx from Cloudflare passes', file: TURNSTILE,
      find: '    if (!res.ok) return false;\n',
      replace: '' },
    { name: 'the cookie never expires on the server', file: LIMITS,
      find: '  if (!Number.isFinite(at) || at > now + 5 * 60 * 1000 || now - at > VISITOR_COOKIE_LIFE_MS) return null;',
      replace: '  if (!Number.isFinite(at)) return null;' },
    { name: 'the issue time is not under the signature', file: LIMITS,
      find: '  return secret() ? `${id}.${at}.${await mac(`${id}.${at}`)}` : `${id}.${at}`;',
      replace: '  return secret() ? `${id}.${at}.${await mac(id)}` : `${id}.${at}`;' },
    { name: 'a changed issue time still verifies', file: LIMITS,
      find: '  const want = await mac(`${id}.${at}`);',
      replace: '  const want = await mac(`${id}.${atRaw.length}`);' },
  ],
};
