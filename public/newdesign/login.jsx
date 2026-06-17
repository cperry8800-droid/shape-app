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
    <a href="Landing.html" aria-label="Shape home" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Logo variant="white" size={28} />
    </a>
  );
}

function SocialButton({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: "100%",
      background: "rgba(8,7,6,0.72)",
      border: "1px solid rgba(242,237,228,0.18)",
      color: INK,
      padding: "11px 12px",
      borderRadius: 6,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      transition: "background 0.15s ease, border-color 0.15s ease",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(15,13,12,0.88)"; e.currentTarget.style.borderColor = "rgba(242,237,228,0.36)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(8,7,6,0.72)"; e.currentTarget.style.borderColor = "rgba(242,237,228,0.18)"; }}
    >
      {icon}<span>{label}</span>
    </button>
  );
}

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16.1 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2c-1.9 1.3-4.3 2.1-7.3 2.1-5.3 0-9.7-3.1-11.3-7.6l-6.5 5c3.4 6.6 10.1 10.9 17.8 10.9z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.3 5.2C41.2 36 44 30.4 44 24c0-1.3-.1-2.4-.4-3.5z"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={INK} aria-hidden>
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);

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
  const captchaRef = React.useRef(null);
  const captchaIdRef = React.useRef(null);
  React.useEffect(() => {
    if (!captchaOn || !captchaRef.current || captchaIdRef.current != null) return;
    window.ShapeTurnstile.render(captchaRef.current, setCaptchaToken).then((id) => { captchaIdRef.current = id; });
  }, [captchaOn]);
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
    let nextDashboard = role === 'shape_radio' ? '/newdesign/Radio.html'
      : role === 'trainer' ? '/newdesign/TrainerDashboard.html'
      : role === 'nutritionist' ? '/newdesign/NutritionistDashboard.html'
      : '/newdesign/ClientDashboard.html';
    try {
      const next = new URLSearchParams(window.location.search).get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) nextDashboard = next;
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
    if (captchaOn && !captchaToken) { setErrMsg("Just a moment — confirming you're human…"); return; }
    setPhone(e164);
    setSubmitting(true);
    const otpOpts = { shouldCreateUser: true };
    if (captchaOn) otpOpts.captchaToken = captchaToken;
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
    if (captchaOn && !captchaToken) { setErrMsg("Just a moment — confirming you're human…"); return; }
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
        try { const r = await sb.rpc("get_email_for_username", { p_username: unameCandidate }); resolved = r && r.data; } catch (err2) { resolved = undefined; }
        if (resolved === null) { setErrMsg("No account with that username — check the spelling or sign in with your email."); setSubmitting(false); return; }
        if (resolved) loginEmail = resolved;
      }
      const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail, password, options: captchaOn ? { captchaToken } : {} });
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

  const fieldWrap = { position: "relative" };
  const inputStyle = {
    width: "100%",
    background: "rgba(8,7,6,0.76)",
    border: "1px solid rgba(242,237,228,0.2)",
    color: INK,
    padding: "13px 14px",
    borderRadius: 6,
    fontFamily: sans,
    fontSize: 14.5,
    transition: "border-color 0.15s ease, background 0.15s ease",
  };
  const labelStyle = { display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(242,237,228,0.66)", marginBottom: 8, fontWeight: 700 };

  return (
    <div style={{
      width: "100%",
      maxWidth: 360,
      background: "linear-gradient(180deg, rgba(10,9,8,0.45) 0%, rgba(11,10,9,0.40) 100%)",
      backdropFilter: "blur(14px) saturate(1.05)",
      WebkitBackdropFilter: "blur(14px) saturate(1.05)",
      border: "1px solid rgba(242,237,228,0.16)",
      borderRadius: 10,
      padding: "26px 26px 22px",
      boxShadow: "0 28px 90px rgba(0,0,0,0.56), 0 0 0 1px rgba(255,255,255,0.02) inset",
      position: "relative",
    }}>
      <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, borderTopLeftRadius: 10, borderTopRightRadius: 10, background: `linear-gradient(90deg, transparent 0%, ${TEAL} 16%, ${TEAL} 84%, transparent 100%)`, opacity: 0.62 }} />
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Welcome back</div>
      <h1 style={{ fontFamily: serif, fontSize: 52, letterSpacing: "-0.03em", fontWeight: 500, margin: "0 0 10px", lineHeight: 0.96 }}>
        Log in to <em style={{ fontStyle: "italic", color: "transparent", WebkitTextStroke: "1.4px #f2ede4" }}>Shape</em>.
      </h1>
      <p style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.68)", margin: "0 0 28px", lineHeight: 1.5 }}>Pick up where you left off. Your coaches, your plans, your progress.</p>

      {/* Social buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 22 }}>
        <SocialButton icon={<GoogleIcon />} label="Google" />
        <SocialButton icon={<AppleIcon />} label="Apple" />
      </div>

      {/* Email / Phone method toggle */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, background: "rgba(8,7,6,0.76)", border: "1px solid rgba(242,237,228,0.2)", borderRadius: 7, padding: 4, marginBottom: 18 }}>
        {[["email", "Email"], ["phone", "Phone"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => { setMethod(v); setErrMsg(""); setOtpSent(false); setOtp(""); }} style={{
            padding: "9px 10px", borderRadius: 5, border: 0,
            background: method === v ? INK : "transparent", color: method === v ? PAPER : "rgba(242,237,228,0.7)",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
            fontWeight: method === v ? 700 : 500, cursor: "pointer",
          }}>{l}</button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={method === "phone" ? (otpSent ? verifyPhoneOtp : sendPhoneOtp) : submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {method === "phone" ? (
          <>
            <div>
              <label style={labelStyle} htmlFor="phone">Phone</label>
              <div style={fieldWrap}>
                <input id="phone" type="tel" autoComplete="tel" required value={phone} disabled={otpSent} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" style={{ ...inputStyle, opacity: otpSent ? 0.6 : 1 }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = TEAL; }} onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(242,237,228,0.2)"; }} />
              </div>
            </div>
            {otpSent && (
              <div>
                <label style={labelStyle} htmlFor="otp">6-digit code</label>
                <div style={fieldWrap}>
                  <input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="••••••" style={{ ...inputStyle, letterSpacing: "0.3em", fontSize: 18 }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = TEAL; }} onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(242,237,228,0.2)"; }} />
                </div>
                <button type="button" onClick={() => { setOtpSent(false); setOtp(""); setErrMsg(""); }} style={{ marginTop: 8, background: "transparent", border: 0, padding: 0, color: "rgba(242,237,228,0.6)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>← Change number</button>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label style={labelStyle} htmlFor="email">Email or username</label>
              <div style={fieldWrap}>
                <input id="email" type="text" autoComplete="username" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com or your.handle" style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = TEAL; e.currentTarget.style.background = "rgba(10,9,8,0.95)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(242,237,228,0.2)"; e.currentTarget.style.background = "rgba(8,7,6,0.76)"; }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label style={labelStyle} htmlFor="password">Password</label>
                <a href="/forgot-password" style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.6)", marginBottom: 9 }}>Forgot?</a>
              </div>
              <div style={fieldWrap}>
                <input id="password" type={showPass ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={{ ...inputStyle, paddingRight: 52 }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = TEAL; e.currentTarget.style.background = "rgba(10,9,8,0.95)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(242,237,228,0.2)"; e.currentTarget.style.background = "rgba(8,7,6,0.76)"; }} />
                <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, padding: "6px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.58)", cursor: "pointer" }}>
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Role (dev switcher for prototype) */}
        <div>
          <label style={labelStyle}>Log in as</label>
          <div style={{ display: "flex", gap: 6, background: "rgba(8,7,6,0.76)", border: "1px solid rgba(242,237,228,0.2)", borderRadius: 7, padding: 4 }}>
            {[
              ["client", "Client"],
              ["trainer", "Trainer"],
              ["nutritionist", "Nutritionist"],
            ].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setRole(v)} style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 5,
                background: role === v ? INK : "transparent",
                color: role === v ? PAPER : "rgba(242,237,228,0.7)",
                border: 0,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: role === v ? 700 : 500,
                cursor: "pointer",
                transition: "background 0.2s ease",
              }}>{l}</button>
            ))}
          </div>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", marginTop: 2 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: TEAL, margin: 0 }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.75)" }}>Remember me for 30 days</span>
        </label>

        {errMsg ? (
          <div style={{ marginTop: 4, padding: "10px 14px", borderRadius: 6, background: "rgba(220,80,80,0.1)", border: "1px solid rgba(220,80,80,0.3)", color: "#e27a7a", fontFamily: sans, fontSize: 13 }}>{errMsg}</div>
        ) : null}

        {/* Turnstile bot challenge — hidden at the phone code-entry step (verify needs no token). */}
        {captchaOn && !(method === "phone" && otpSent) ? (
          <div ref={captchaRef} style={{ minHeight: 65 }} />
        ) : null}

        <button type="submit" disabled={submitting} style={{
          marginTop: 8,
          padding: "14px 20px",
          borderRadius: 6,
          background: INK,
          color: PAPER,
          border: 0,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          cursor: submitting ? "wait" : "pointer",
          opacity: submitting ? 0.7 : 1,
          transition: "transform 0.15s ease",
        }}
          onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.99)"}
          onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
        >{submitting ? "Working…" : method === "phone" ? (otpSent ? "Verify & sign in →" : "Text me a code →") : "Log in →"}</button>
      </form>

      <div style={{ marginTop: 26, paddingTop: 18, borderTop: "1px solid rgba(242,237,228,0.14)", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)" }}>
        <span>New to Shape?</span>
        <a href="Landing.html" style={{ color: INK, fontWeight: 500, borderBottom: `1.5px solid ${TEAL}`, paddingBottom: 2 }}>Create an account →</a>
      </div>
    </div>
  );
}

function LoginPage() {
  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", fontFamily: sans, color: INK }}>
      {/* Background */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        backgroundImage: "url('/login%20page%201.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        zIndex: 0,
      }} />
      {/* Subtle darkening gradient on the left to lift card legibility if shifted */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(ellipse 70% 60% at 70% 40%, rgba(0,0,0,0) 0%, rgba(5,4,3,0.2) 70%, rgba(5,4,3,0.5) 100%)",
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
      <header style={{ position: "relative", zIndex: 10, padding: "26px 72px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <LoginMark />
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <a href="Landing.html" style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.7)" }}>← Back to home</a>
          </div>
        </div>
      </header>

      {/* Centered card */}
      <main style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px 80px", minHeight: "calc(100vh - 180px)" }}>
        <LoginCard />
      </main>

      {/* Footer */}
      <footer style={{ position: "relative", zIndex: 10, padding: "20px 72px 30px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <span>© 2026 Shape</span>
          <div style={{ display: "flex", gap: 24 }}>
            <a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/help">Help</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<LoginPage />);
