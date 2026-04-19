// Login — centered card over spotlight bg. Routes on submit to the role's dashboard.
// Uses PAPER/INK/TEAL from pageShell.jsx.

const LOGIN_DESTS = {
  client: "ClientDashboard.html",
  trainer: "TrainerDashboard.html",
  nutritionist: "NutritionistDashboard.html",
};

function LoginMark() {
  return (
    <a href="Landing.html" aria-label="Shape home" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Logo variant="white" size={40} />
    </a>
  );
}

function SocialButton({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: "100%",
      background: "rgba(242,237,228,0.05)",
      border: "1px solid rgba(242,237,228,0.12)",
      color: INK,
      padding: "12px 14px",
      borderRadius: 8,
      fontFamily: sans,
      fontSize: 14,
      fontWeight: 500,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      transition: "background 0.15s ease, border-color 0.15s ease",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(242,237,228,0.09)"; e.currentTarget.style.borderColor = "rgba(242,237,228,0.2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(242,237,228,0.05)"; e.currentTarget.style.borderColor = "rgba(242,237,228,0.12)"; }}
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

function LoginCard() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState("client");
  const [remember, setRemember] = React.useState(true);
  const [showPass, setShowPass] = React.useState(false);

  const submit = (e) => {
    e.preventDefault();
    window.location.href = LOGIN_DESTS[role] || LOGIN_DESTS.client;
  };

  const fieldWrap = { position: "relative" };
  const inputStyle = {
    width: "100%",
    background: "rgba(15,13,12,0.6)",
    border: "1px solid rgba(242,237,228,0.14)",
    color: INK,
    padding: "14px 16px",
    borderRadius: 8,
    fontFamily: sans,
    fontSize: 14.5,
    transition: "border-color 0.15s ease, background 0.15s ease",
  };
  const labelStyle = { display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)", marginBottom: 9 };

  return (
    <div style={{
      width: "100%",
      maxWidth: 440,
      background: "rgba(18,14,12,0.78)",
      backdropFilter: "blur(20px) saturate(1.2)",
      WebkitBackdropFilter: "blur(20px) saturate(1.2)",
      border: "1px solid rgba(242,237,228,0.1)",
      borderRadius: 16,
      padding: "44px 44px 36px",
      boxShadow: "0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,220,150,0.04) inset",
    }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Welcome back</div>
      <h1 style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 10px", lineHeight: 1.02 }}>
        Log in to <em style={{ fontStyle: "italic", color: TEAL }}>Shape</em>.
      </h1>
      <p style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.6)", margin: "0 0 32px", lineHeight: 1.55 }}>Pick up where you left off. Your coaches, your plans, your progress.</p>

      {/* Social buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 22 }}>
        <SocialButton icon={<GoogleIcon />} label="Google" />
        <SocialButton icon={<AppleIcon />} label="Apple" />
      </div>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "4px 0 24px" }}>
        <div style={{ flex: 1, height: 1, background: "rgba(242,237,228,0.1)" }} />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.4)" }}>Or with email</span>
        <div style={{ flex: 1, height: 1, background: "rgba(242,237,228,0.1)" }} />
      </div>

      {/* Form */}
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <label style={labelStyle} htmlFor="email">Email</label>
          <div style={fieldWrap}>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = TEAL; e.currentTarget.style.background = "rgba(15,13,12,0.8)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(242,237,228,0.14)"; e.currentTarget.style.background = "rgba(15,13,12,0.6)"; }} />
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label style={labelStyle} htmlFor="password">Password</label>
            <a href="#" style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.6)", marginBottom: 9 }}>Forgot?</a>
          </div>
          <div style={fieldWrap}>
            <input id="password" type={showPass ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={{ ...inputStyle, paddingRight: 52 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = TEAL; e.currentTarget.style.background = "rgba(15,13,12,0.8)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(242,237,228,0.14)"; e.currentTarget.style.background = "rgba(15,13,12,0.6)"; }} />
            <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, padding: "6px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", cursor: "pointer" }}>
              {showPass ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {/* Role (dev switcher for prototype) */}
        <div>
          <label style={labelStyle}>Log in as</label>
          <div style={{ display: "flex", gap: 6, background: "rgba(15,13,12,0.6)", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 999, padding: 4 }}>
            {[
              ["client", "Client"],
              ["trainer", "Trainer"],
              ["nutritionist", "Nutritionist"],
            ].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setRole(v)} style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 999,
                background: role === v ? INK : "transparent",
                color: role === v ? PAPER : "rgba(242,237,228,0.7)",
                border: 0,
                fontFamily: sans,
                fontSize: 12.5,
                fontWeight: role === v ? 500 : 400,
                cursor: "pointer",
                transition: "background 0.2s ease",
              }}>{l}</button>
            ))}
          </div>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", marginTop: 2 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: TEAL, margin: 0 }} />
          <span style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.75)" }}>Remember me for 30 days</span>
        </label>

        <button type="submit" style={{
          marginTop: 8,
          padding: "15px 20px",
          borderRadius: 8,
          background: INK,
          color: PAPER,
          border: 0,
          fontFamily: sans,
          fontSize: 14.5,
          fontWeight: 500,
          cursor: "pointer",
          letterSpacing: "0.01em",
          transition: "transform 0.15s ease",
        }}
          onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.99)"}
          onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
        >Log in →</button>
      </form>

      <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)" }}>
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
        backgroundImage: "url('assets/login-bg.png')",
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
      <header style={{ position: "relative", zIndex: 10, padding: "26px 40px" }}>
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
      <footer style={{ position: "relative", zIndex: 10, padding: "20px 40px 30px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <span>© 2026 Shape</span>
          <div style={{ display: "flex", gap: 24 }}>
            <a href="#">Privacy</a><a href="#">Terms</a><a href="#">Help</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<LoginPage />);
