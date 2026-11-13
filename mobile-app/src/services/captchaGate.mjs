// What an auth request does about the human check (Cloudflare Turnstile) at the moment it is asked
// for. Pure, so tests/login-captcha-wait.test.mjs drives the sign-in form's own rule.
//
// ⚠ A TAP BEFORE THE TOKEN IS A REQUEST, NOT A MISTAKE (owner, 2026-11-13, a screenshot of sign-in
// held on "Just a moment — confirming you're human…": "login not working"). The form used to answer a
// tap that came before Turnstile's token with that line and drop the tap, so the member had to guess
// when to tap again; and a check that failed (an error, an expiry) left no token and nothing that
// started a new one, so the line stayed for good. Now the tap waits: the request goes as soon as the
// token arrives. A check that fails, or gives no token within BS_CAPTCHA_WAIT_MS, says so, and the
// next tap starts a fresh check.

/** How long a waiting request gives the check before it is told the check did not finish. */
export const BS_CAPTCHA_WAIT_MS = 20000;

/**
 * `go` sends now (no check here, or its token is in); `wait` holds the request until the token
 * arrives; `retry` starts a fresh check first (the last one failed), then holds the request.
 */
export function bsCaptchaStep({ captchaOn, token, failed }) {
  if (!captchaOn || token) return 'go';
  return failed ? 'retry' : 'wait';
}
