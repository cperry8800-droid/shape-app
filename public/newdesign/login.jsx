// Login — centered card over spotlight bg. Routes on submit to the role's dashboard.
// Uses PAPER/INK/TEAL from pageShell.jsx.

const LOGIN_DESTS = {
  client: "ClientDashboard.html",
  trainer: "TrainerDashboard.html",
  nutritionist: "NutritionistDashboard.html",
  shape_radio: "Radio.html",
};

function LoginMark() {
  return (
    <a href="index.html" aria-label="Club Shape home" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Logo variant="white" height={42} />
    </a>
  );
}

const EmailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2"/>
    <path d="M3 7l9 6 9-6"/>
  </svg>
);

function normalizePhoneE164(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/[^\d]/g, "");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return "+1" + digits;
  return "+" + digits;
}

function LoginCard() {
  const [method, setMethod] = React.useState("email"); // 'email' | 'phone'
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [role, setRole] = React.useState("client");
  const [remember, setRemember] = React.useState(true);
  const [showPass, setShowPass] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState("");

  // Cloudflare Turnstile (CAPTCHA) — bot protection on the auth requests. No-op
  // until a site key is set (window.SHAPE_TURNSTILE_SITEKEY in /supabase.js).
  // We block submit until a token exists, then pass it to Supabase Auth, which
  // verifies it server-side (must be enabled in Dashboard → Auth → Attack
  // Protection with the matching TURNSTILE_SECRET_KEY).
  const captchaOn = typeof window !== "undefined" && window.ShapeTurnstile && window.ShapeTurnstile.enabled();
  const [captchaToken, setCaptchaToken] = React.useState("");
  // If the Cloudflare human-check can't load/connect (outage, a network, or an
  // extension blocking challenges.cloudflare.com), degrade open so login is never
  // hard-blocked forever on "confirming you're human…".
  const [captchaUnavailable, setCaptchaUnavailable] = React.useState(false);
  const captchaRef = React.useRef(null);
  const captchaIdRef = React.useRef(null);
  // Mirror the latest token to a ref so the grace-period timer can read it.
  const captchaTokenRef = React.useRef("");
  React.useEffect(() => { captchaTokenRef.current = captchaToken; }, [captchaToken]);
  // The widget is hidden at the phone code-entry step. Track whether its container
  // is currently mounted so that, when we leave and return (e.g. "Change number"),
  // we tear down the spent single-use widget and render a FRESH challenge — instead
  // of skipping the render and re-submitting an already-consumed token.
  const captchaVisible = captchaOn && !(method === "phone" && otpSent);
  React.useEffect(() => {
    if (!captchaVisible) {
      if (captchaIdRef.current != null) { window.ShapeTurnstile.remove(captchaIdRef.current); captchaIdRef.current = null; }
      setCaptchaToken("");
      return;
    }
    if (!captchaRef.current || captchaIdRef.current != null) return;
    setCaptchaUnavailable(false);
    let alive = true;
    // Dark, and the card's full width (Turnstile's 300px minimum still holds).
    window.ShapeTurnstile.render(captchaRef.current, setCaptchaToken, { theme: "dark", size: "flexible" }).then((id) => {
      if (!alive) return;
      captchaIdRef.current = id;
      if (id == null) setCaptchaUnavailable(true); // the Turnstile script never loaded
    });
    // The widget can mount but never return a token (its error-callback fires when
    // Cloudflare is unreachable) — fall open after a short grace period.
    const failTimer = setTimeout(() => { if (alive && !captchaTokenRef.current) setCaptchaUnavailable(true); }, 7000);
    return () => { alive = false; clearTimeout(failTimer); };
  }, [captchaVisible]);
  // Tokens are single-use — clear after a failed attempt so a retry re-solves.
  const resetCaptcha = () => { setCaptchaToken(""); if (captchaIdRef.current != null) window.ShapeTurnstile.reset(captchaIdRef.current); };

  // Bridge a Supabase session into Next.js cookies, then route to the dashboard.
  const finishLogin = async (session) => {
    if (session && session.access_token) {
      await fetch('/api/auth/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }),
      }).catch(() => {});
    }
    // First confirmed login after a WEBSITE signup must provision the account,
    // exactly like the mobile app's signIn: the website signup creates the auth
    // user but NO public.profiles row (there's no DB trigger, and set_my_username
    // only UPDATEs an existing row), so create it here from the signup metadata,
    // persist the DOB (→ the over_18 trigger), then claim the pending @username.
    // All best-effort + non-blocking, and ONLY create when missing — never clobber
    // an existing profile (coach / mobile-created accounts log in here too).
    try {
      const u = session && session.user;
      const sb = window.shapeDb && window.shapeDb.client;
      if (sb && u && u.id) {
        const meta = u.user_metadata || {};
        let row = null;
        try {
          const res = await sb.from('profiles').select('id, username, role, date_of_birth').eq('id', u.id).maybeSingle();
          row = (res && res.data) || null;
        } catch (e) {}
        // Provision ONLY from a genuine website-signup's metadata (full_name +
        // role + username + date_of_birth, all set by signup.jsx). Never fabricate
        // a profile with a placeholder name / assumed role / no DOB for a login
        // that didn't come through the website signup (e.g. a phone-OTP user, or an
        // account that should already have a server-created profile) — that would
        // mint junk client rows and skip the DOB/18+ gate. Otherwise leave it be.
        const isWebsiteSignup = !!(meta.full_name && meta.role && meta.username && meta.date_of_birth);
        if (!row && isWebsiteSignup) {
          try {
            // Role is FIXED to client — NEVER copy meta.role/meta.roles. The profiles
            // INSERT policy only checks auth.uid() = id, so honoring client-supplied
            // role metadata would let anyone self-mint a trainer/nutritionist profile.
            // Coaches are provisioned server-side via the /api/apply approval flow.
            await sb.from('profiles').upsert({
              id: u.id,
              email: u.email,
              full_name: meta.full_name,
              role: 'client',
              roles: ['client'],
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
          } catch (e) {}
        }
        if (meta.date_of_birth && (!row || !row.date_of_birth)) {
          try { await sb.from('profiles').update({ date_of_birth: meta.date_of_birth }).eq('id', u.id); } catch (e) {}
        }
        if (meta.username && (!row || !row.username)) {
          try { await sb.rpc('set_my_username', { p_username: String(meta.username).replace(/^@/, '') }); } catch (e) {}
        }
      }
    } catch (e) {}
    let nextDashboard = role === 'shape_radio' ? '/newdesign/Radio.html'
      : role === 'trainer' ? '/newdesign/TrainerDashboard.html'
      : role === 'nutritionist' ? '/newdesign/NutritionistDashboard.html'
      : '/newdesign/ClientDashboard.html';
    try {
      // Mirrors src/lib/safe-redirect.mjs (safeReturnPath), restated because a browser-babel
      // module cannot import it. The leading-slash test alone lets `/\evil.example` through, and
      // browsers normalise the backslash into a protocol-relative, off-site redirect; control
      // characters are stripped by the URL parser, so they are rejected too.
      const next = new URLSearchParams(window.location.search).get('next');
      if (next && next.startsWith('/') && !next.startsWith('//') && next.charAt(1) !== '\\'
          && !/[\x00-\x1f\x7f]/.test(next)) nextDashboard = next;
    } catch (e) {}
    // The first sign-in after a confirmed email goes back where sign-up was sent from: the
    // confirmation link carries no ?next=, so signup.jsx kept it in this browser
    // (suRememberNext, two days). Only the account that signed up reads it, once, and it is then
    // forgotten; another account on the same browser leaves it be (Codex on #2399). A ?next= on the
    // address wins, and it is held to the same same-site rule.
    try {
      const kept = JSON.parse(localStorage.getItem('shape.signupNext') || 'null');
      const fresh = !!kept && Date.now() - Number(kept.at) < 2 * 86400000;
      const mine = !!(kept && kept.uid && session && session.user && session.user.id === kept.uid);
      if (kept && (!fresh || mine)) localStorage.removeItem('shape.signupNext');
      const back = fresh && mine ? String(kept.next || '') : '';
      if (!new URLSearchParams(window.location.search).get('next') && back.startsWith('/') && !back.startsWith('//')
          && back.charAt(1) !== '\\' && !/[\x00-\x1f\x7f]/.test(back)) nextDashboard = back;
    } catch (e) {}
    window.location.href = nextDashboard;
  };

  // Phone — request the SMS code.
  const sendPhoneOtp = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrMsg("");
    const sb = window.shapeDb && window.shapeDb.client;
    if (!sb) { setErrMsg("Auth is still loading. Try again in a second."); return; }
    const e164 = normalizePhoneE164(phone);
    if (!e164 || e164.length < 8) { setErrMsg("Enter a valid phone number, e.g. +1 555 123 4567."); return; }
    if (captchaOn && !captchaToken && !captchaUnavailable) { setErrMsg("Just a moment — confirming you're human…"); return; }
    setPhone(e164);
    setSubmitting(true);
    const otpOpts = { shouldCreateUser: true };
    if (captchaOn && captchaToken) otpOpts.captchaToken = captchaToken;
    const { error } = await sb.auth.signInWithOtp({ phone: e164, options: otpOpts });
    setSubmitting(false);
    if (error) { if (captchaOn) resetCaptcha(); setErrMsg(error.message || "Could not send the code."); return; }
    setOtpSent(true);
  };
  // Phone — verify the code.
  const verifyPhoneOtp = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrMsg("");
    const sb = window.shapeDb && window.shapeDb.client;
    if (!sb) { setErrMsg("Auth is still loading."); return; }
    if (!otp.trim()) { setErrMsg("Enter the code we texted you."); return; }
    setSubmitting(true);
    const { data, error } = await sb.auth.verifyOtp({ phone: normalizePhoneE164(phone), token: otp.trim(), type: 'sms' });
    if (error || !data.session) { setErrMsg(error ? error.message : "That code didn't work."); setSubmitting(false); return; }
    await finishLogin(data.session);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrMsg("");
    if (captchaOn && !captchaToken && !captchaUnavailable) { setErrMsg("Just a moment — confirming you're human…"); return; }
    setSubmitting(true);
    try {
      const sb = window.shapeDb && window.shapeDb.client;
      if (!sb) {
        setErrMsg("Auth is still loading. Try again in a second.");
        setSubmitting(false);
        return;
      }
      // The field accepts an email OR a Shape username — resolve a username to
      // its login email first (get_email_for_username RPC). A leading @ is
      // stripped; anything containing @ beyond position 0 is treated as email.
      let loginEmail = String(email || "").trim();
      const unameCandidate = loginEmail.charAt(0) === "@" ? loginEmail.slice(1) : (loginEmail.indexOf("@") === -1 ? loginEmail : null);
      if (unameCandidate) {
        let resolved;
        // Resolve via the rate-limited server route (get_email_for_username is
        // service-role-only now — no anon username->email enumeration).
        try {
          const rr = await fetch("/api/auth/resolve-username", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: unameCandidate }) });
          resolved = rr.ok ? ((await rr.json().catch(() => ({}))).email ?? null) : undefined;
        } catch (err2) { resolved = undefined; }
        if (resolved === null) { setErrMsg("No account with that username — check the spelling or sign in with your email."); setSubmitting(false); return; }
        if (resolved) loginEmail = resolved;
      }
      const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail, password, options: (captchaOn && captchaToken) ? { captchaToken } : {} });
      if (error || !data.session) {
        if (captchaOn) resetCaptcha();
        setErrMsg(error ? error.message : "Could not sign in.");
        setSubmitting(false);
        return;
      }
      await finishLogin(data.session);
    } catch (err) {
      console.error('[login] unexpected', err);
      setErrMsg("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const submitLabel = submitting ? "Working…" : method === "phone" ? (otpSent ? "Verify & sign in →" : "Text me a code →") : "Log in →";

  return (
    <div className="lgA-card">
      <div aria-hidden className="lgA-edge" />
      <div className="lgA-eyebrow">Welcome back</div>
      <h1 className="lgA-title">Log in to <em>Shape</em>.</h1>
      <p className="lgA-sub">Pick up where you left off. Your coaches, your plans, your progress.</p>

      {/* Email / Phone method toggle */}
      <LoginSeg ariaLabel="Sign in with" value={method}
        options={[["email", "Email"], ["phone", "Phone"]]}
        onChange={(v) => { setMethod(v); setErrMsg(""); setOtpSent(false); setOtp(""); }} />

      {/* Form */}
      <form onSubmit={method === "phone" ? (otpSent ? verifyPhoneOtp : sendPhoneOtp) : submit} className="lgA-form">
        {method === "phone" ? (
          <>
            <div className="lgA-field">
              <label className="lgA-label" htmlFor="phone">Phone</label>
              <input id="phone" className="lgA-input" type="tel" autoComplete="tel" required value={phone} disabled={otpSent} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
            </div>
            {otpSent && (
              <div className="lgA-field">
                <label className="lgA-label" htmlFor="otp">6-digit code</label>
                <input id="otp" className="lgA-input lgA-otp" type="text" inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="••••••" />
                <button type="button" className="lgA-textbtn" onClick={() => { setOtpSent(false); setOtp(""); setErrMsg(""); }}>← Change number</button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="lgA-field">
              <label className="lgA-label" htmlFor="email">Email or username</label>
              <input id="email" className="lgA-input" type="text" autoComplete="username" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com or your.handle" />
            </div>

            <div className="lgA-field">
              <div className="lgA-labelrow">
                <label className="lgA-label" htmlFor="password">Password</label>
                <a href="/forgot-password" className="lgA-link">Forgot?</a>
              </div>
              <div className="lgA-pw">
                <input id="password" className="lgA-input" type={showPass ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={{ paddingRight: 64 }} />
                <button type="button" className="lgA-reveal" onClick={() => setShowPass(s => !s)}>
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Role (dev switcher for prototype) */}
        <div className="lgA-field">
          <div className="lgA-label" id="login-role-label">Log in as</div>
          <LoginSeg labelledBy="login-role-label" value={role}
            options={[["client", "Client"], ["trainer", "Trainer"], ["nutritionist", "Nutritionist"]]}
            onChange={(v) => setRole(v)} />
        </div>

        <label className="lgA-check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember me for 30 days</span>
        </label>

        {errMsg ? (
          <div role="alert" className="lgA-err">{errMsg}</div>
        ) : null}

        {/* Turnstile bot challenge — hidden at the phone code-entry step (verify needs no token).
            Falls open if it can't load/connect, so it can't lock anyone out. Its theme and size go
            through ShapeTurnstile.render's render parameters (the effect above). */}
        {captchaOn && !(method === "phone" && otpSent) ? (
          <div className="lgA-captcha">
            <div ref={captchaRef} style={{ minHeight: captchaUnavailable ? 0 : 65, display: captchaUnavailable ? "none" : "block" }} />
            {captchaUnavailable ? (
              <div className="lgA-note">Couldn't load the human-check — you can still sign in.</div>
            ) : null}
          </div>
        ) : null}

        <button type="submit" className="lgA-submit" disabled={submitting} style={{ cursor: submitting ? "wait" : "pointer" }}>{submitLabel}</button>
      </form>

      <div className="lgA-foot">
        <span>New to Shape?</span>
        <a href="Landing.html">Create an account →</a>
      </div>
    </div>
  );
}

// A segmented control: one sliding thumb under a row of buttons. Used for the email/phone
// method and the role, so both read as the same calm control and the only solid fill on the
// card is the submit button.
function LoginSeg({ options, value, onChange, labelledBy, ariaLabel }) {
  const i = Math.max(0, options.findIndex(([v]) => v === value));
  return (
    <div role="group" aria-labelledby={labelledBy} aria-label={ariaLabel} className="lg-seg" style={{ "--n": options.length, "--i": i }}>
      <span aria-hidden className="lg-seg-thumb" />
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} className="lg-seg-btn" onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

// Option A, "Spotlight glass": the card stands right of centre, where the photograph's beam lands. Pseudo-classes
// (focus, autofill, hover) and the phone layout need a stylesheet, so the look lives here.
function LoginStyles() {
  return <style>{`
.lgA-page{position:relative;min-height:100vh;display:flex;flex-direction:column;overflow:hidden;font-family:${sans};color:#f2ede4}
.lgA-head{position:relative;z-index:10;padding:26px 72px}
.lgA-row{max-width:1320px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px}
.lgA-back{font-family:${sans};font-size:13px;color:rgba(242,237,228,.7);white-space:nowrap;transition:color .15s}
.lgA-back:hover{color:#f2ede4}
.lgA-main{position:relative;z-index:10;flex:1;display:flex;align-items:center;padding:4px 72px 40px}
.lgA-mainrow{width:100%;max-width:1320px;margin:0 auto;display:flex;justify-content:center}
.lgA-sitefoot{position:relative;z-index:10;padding:18px 72px 28px;font-family:${mono};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(242,237,228,.5)}
.lgA-sitefoot .lgA-row{flex-wrap:wrap}
.lgA-legal{display:flex;gap:24px}
.lgA-sitefoot a:hover{color:#f2ede4}

.lgA-card{position:relative;width:100%;max-width:408px;margin-left:clamp(0px,30vw,520px);padding:30px 32px 24px;border-radius:18px;
  background:linear-gradient(180deg,rgba(18,16,14,.66) 0%,rgba(10,9,8,.74) 100%);
  backdrop-filter:blur(22px) saturate(1.15);-webkit-backdrop-filter:blur(22px) saturate(1.15);
  border:1px solid rgba(242,237,228,.12);
  box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 40px 120px rgba(0,0,0,.6),0 8px 24px rgba(0,0,0,.35)}
.lgA-edge{position:absolute;top:-1px;left:28px;right:28px;height:1px;background:linear-gradient(90deg,transparent,#34d6c5 30%,#34d6c5 70%,transparent);opacity:.8}
.lgA-eyebrow{font-family:${mono};font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:#34d6c5;margin-bottom:12px}
.lgA-title{font-family:${serif};font-size:38px;font-weight:400;letter-spacing:-.025em;line-height:1.02;margin:0 0 8px;color:#f2ede4}
.lgA-title em{font-style:italic;font-weight:400;color:#34d6c5}
.lgA-sub{font-family:${sans};font-size:14px;line-height:1.5;color:rgba(242,237,228,.62);margin:0 0 20px;max-width:32ch}
.lgA-form{display:flex;flex-direction:column;gap:16px;margin-top:20px}
.lgA-field{display:flex;flex-direction:column}
.lgA-labelrow{display:flex;justify-content:space-between;align-items:baseline}
.lgA-label{display:block;font-family:${sans};font-size:13px;font-weight:500;color:rgba(242,237,228,.78);margin-bottom:7px}
.lgA-link{font-family:${sans};font-size:12.5px;color:rgba(242,237,228,.55);transition:color .15s}
.lgA-link:hover{color:#34d6c5}
.lgA-input{width:100%;height:46px;padding:0 15px;border-radius:11px;background:#110f0e;border:1px solid rgba(242,237,228,.14);color:#f2ede4;
  font-family:${sans};font-size:15px;caret-color:#34d6c5;transition:border-color .15s,box-shadow .15s}
.lgA-input::placeholder{color:rgba(242,237,228,.32)}
.lgA-input:hover{border-color:rgba(242,237,228,.24)}
.lgA-input:focus{outline:none;border-color:#34d6c5;box-shadow:0 0 0 3px rgba(52,214,197,.18)}
.lgA-input:disabled{opacity:.6}
.lgA-input:-webkit-autofill,.lgA-input:-webkit-autofill:hover{-webkit-text-fill-color:#f2ede4;-webkit-box-shadow:0 0 0 60px #110f0e inset;box-shadow:0 0 0 60px #110f0e inset;transition:background-color 99999s}
.lgA-input:-webkit-autofill:focus{-webkit-box-shadow:0 0 0 60px #110f0e inset,0 0 0 3px rgba(52,214,197,.18);box-shadow:0 0 0 60px #110f0e inset,0 0 0 3px rgba(52,214,197,.18)}
.lgA-otp{letter-spacing:.3em;font-size:18px}
.lgA-pw{position:relative}
.lgA-reveal{position:absolute;right:6px;top:50%;transform:translateY(-50%);height:34px;padding:0 12px;border:0;border-radius:8px;background:transparent;
  font-family:${sans};font-size:12.5px;font-weight:500;color:rgba(242,237,228,.55);cursor:pointer}
.lgA-reveal:hover{color:#f2ede4;background:rgba(242,237,228,.06)}
.lgA-textbtn{align-self:flex-start;margin-top:10px;padding:0;border:0;background:transparent;font-family:${sans};font-size:12.5px;color:rgba(242,237,228,.6);cursor:pointer}
.lgA-textbtn:hover{color:#f2ede4}

.lg-seg{position:relative;display:grid;grid-template-columns:repeat(var(--n),1fr);padding:3px;border-radius:12px;background:#0d0c0b;border:1px solid rgba(242,237,228,.1)}
.lg-seg-thumb{position:absolute;top:3px;bottom:3px;left:3px;width:calc((100% - 6px) / var(--n));transform:translateX(calc(100% * var(--i)));border-radius:9px;
  background:linear-gradient(180deg,rgba(242,237,228,.13),rgba(242,237,228,.08));box-shadow:0 0 0 1px rgba(242,237,228,.12) inset,0 2px 6px rgba(0,0,0,.35);transition:transform .28s cubic-bezier(.3,.7,.2,1)}
.lg-seg-btn{position:relative;z-index:1;height:34px;padding:0 8px;border:0;background:transparent;border-radius:9px;font-family:${sans};font-size:13px;font-weight:500;
  color:rgba(242,237,228,.55);cursor:pointer;transition:color .2s}
.lg-seg-btn:hover{color:rgba(242,237,228,.85)}
.lg-seg-btn[aria-pressed="true"]{color:#f2ede4}

.lgA-check{display:flex;gap:10px;align-items:center;cursor:pointer;font-family:${sans};font-size:13px;color:rgba(242,237,228,.72);user-select:none}
.lgA-check input{appearance:none;-webkit-appearance:none;flex:none;width:18px;height:18px;margin:0;border-radius:5px;border:1px solid rgba(242,237,228,.28);background:#110f0e;cursor:pointer;
  display:grid;place-content:center;transition:background .15s,border-color .15s}
.lgA-check input::after{content:"";width:10px;height:10px;background:no-repeat center/contain url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2.5 6.2l2.3 2.3 4.7-5' fill='none' stroke='%2304110f' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>");transform:scale(0);transition:transform .15s}
.lgA-check input:checked{background:#34d6c5;border-color:#34d6c5}
.lgA-check input:checked::after{transform:scale(1)}

.lgA-err{padding:11px 14px;border-radius:10px;background:rgba(226,96,96,.1);border:1px solid rgba(226,96,96,.32);color:#ec8c8c;font-family:${sans};font-size:13px;line-height:1.45}
.lgA-captcha{display:flex;flex-direction:column;align-items:stretch}
.lgA-captcha iframe{border-radius:8px}
.lgA-note{font-family:${sans};font-size:12px;color:rgba(242,237,228,.5)}
.lgA-submit{margin-top:2px;height:48px;border:0;border-radius:11px;background:#34d6c5;color:#04110f;font-family:${sans};font-size:15px;font-weight:600;letter-spacing:.01em;
  box-shadow:0 10px 30px rgba(52,214,197,.22),0 1px 0 rgba(255,255,255,.35) inset;transition:background .15s,transform .15s,box-shadow .15s}
.lgA-submit:hover{background:#4ce4d4;box-shadow:0 14px 36px rgba(52,214,197,.3),0 1px 0 rgba(255,255,255,.35) inset}
.lgA-submit:active{transform:translateY(1px) scale(.995)}
.lgA-submit:disabled{opacity:.7}
.lgA-card :focus-visible{outline:2px solid #34d6c5;outline-offset:2px}
.lgA-card .lgA-input:focus-visible{outline:none}
.lgA-foot{margin-top:20px;padding-top:16px;border-top:1px solid rgba(242,237,228,.1);display:flex;justify-content:center;gap:8px;flex-wrap:wrap;font-family:${sans};font-size:13.5px;color:rgba(242,237,228,.55)}
.lgA-foot a{color:#f2ede4;font-weight:500;transition:color .15s}
.lgA-foot a:hover{color:#34d6c5}

@media (max-width:1100px){.lgA-card{margin-left:0}}
@media (max-width:640px){
  .lgA-head{padding:18px 20px}
  .lgA-mark .shape-brand-logo{height:36px!important}
  .lgA-main{padding:12px 16px 28px;align-items:flex-start}
  .lgA-card{padding:28px 20px 20px;border-radius:16px}
  .lgA-title{font-size:34px}
  .lgA-sitefoot{padding:16px 20px 28px}
  .lgA-sitefoot .lgA-row{flex-direction:column;align-items:flex-start;gap:12px}
}
/* Turnstile is 300px at its narrowest; under 360px the card leaves it less, so the card takes more of the
   screen and the widget's row borrows the card's side padding (a 304px card at 320 gives it 302px). */
@media (max-width:359px){.lgA-main{padding-left:8px;padding-right:8px}.lgA-captcha{margin-left:-20px;margin-right:-20px}}
`}</style>;
}

function LoginPage() {
  return (
    <div className="lgA-page">
      <LoginStyles />
      {/* Background */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        backgroundImage: "url('/login%20page%201.webp')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        zIndex: 0,
      }} />
      {/* Darken the edges and the left, so the card in the light on the right reads first */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(ellipse 60% 70% at 74% 52%, rgba(0,0,0,0) 0%, rgba(5,4,3,0.25) 62%, rgba(5,4,3,0.6) 100%)",
        zIndex: 1,
      }} />
      {/* Grain */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.95  0 0 0 0 0.93  0 0 0 0 0.89  0 0 0 0.04 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        opacity: 0.35,
        mixBlendMode: "overlay",
        pointerEvents: "none",
        zIndex: 2,
      }} />

      {/* Top bar */}
      <header className="lgA-head">
        <div className="lgA-row">
          <span className="lgA-mark"><LoginMark /></span>
          <a href="index.html" className="lgA-back">← Back to home</a>
        </div>
      </header>

      <main className="lgA-main">
        <div className="lgA-mainrow">
          <LoginCard />
        </div>
      </main>

      {/* Footer */}
      <footer className="lgA-sitefoot">
        <div className="lgA-row">
          <span>© 2026 Shape</span>
          <div className="lgA-legal">
            <a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/help">Help</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<LoginPage />);
