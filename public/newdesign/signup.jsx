// Signup — multi-role. Reads ?role= from query, defaults to "client".
// Roles: client, trainer, nutritionist, radio

const ROLE_CONFIG = {
  client: {
    kicker: "Start training with Shape",
    titleLeft: "Train with the best coaches - one platform.",
    perks: [
      "Access every trainer and nutritionist",
      "Workout + meal plans in one app",
      "Direct messaging with your coaches",
      "Cancel any subscription anytime",
      "Shape Radio included free",
    ],
    formTitle: "Create your client profile",
    steps: ["Personal", "Goals", "Health intake", "Preferences"],
    submitLabel: "Create profile",
    doneTitle: "You're in.",
    doneBody: "Your client profile is ready. Jump into the marketplace and find your first coach.",
    doneCta: { label: "Go to dashboard", href: "ClientDashboard.html" },
  },
  trainer: {
    kicker: "Grow your training business",
    titleLeft: "Build a training business that pays recurring. Your brand, your pricing, your clients.",
    perks: [
      "Free to join — no upfront costs",
      "Set your own pricing",
      "Publish programs and sessions",
      "Weekly payouts, instant if you want",
      "Shape handles billing & marketing",
    ],
    formTitle: "Apply as a trainer",
    steps: ["Personal", "Credentials", "Specialty", "Availability & pricing"],
    submitLabel: "Submit application",
    doneTitle: "Application submitted.",
    doneBody: "Our team will review your credentials and reach out within 2–3 business days.",
    doneCta: { label: "Back to home", href: "get-started.html" },
  },
  nutritionist: {
    kicker: "Build a nutrition practice",
    titleLeft: "Coach clients on what they eat. Earn recurring revenue. Keep your license clean.",
    perks: [
      "Free to join — no upfront costs",
      "Set your own pricing",
      "Meal plan builder + macro tools",
      "Weekly payouts, instant if you want",
      "Shape handles billing & marketing",
    ],
    formTitle: "Apply as a nutritionist",
    steps: ["Personal", "Credentials", "Specialty", "Availability & pricing"],
    submitLabel: "Submit application",
    doneTitle: "Application submitted.",
    doneBody: "Our team will review your credentials and reach out within 2–3 business days.",
    doneCta: { label: "Back to home", href: "get-started.html" },
  },
  radio: {
    kicker: "Shape Radio",
    titleLeft: "Here for the vibes. Ad-free workout mixes, BPM-tagged, built for training.",
    perks: [
      "Ad-free workout mixes",
      "BPM-tagged stations",
      "Offline downloads",
      "Live DJ sets from residents",
      "Included free with Shape membership",
    ],
    formTitle: "Start listening",
    steps: ["Create account", "Your vibe"],
    submitLabel: "Start listening",
    doneTitle: "Tuned in.",
    doneBody: "Your Radio account is ready. Press play.",
    doneCta: { label: "Open Radio", href: "Radio.html" },
  },
};

// -------------- Utility styles --------------
const labelStyle = { display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)", marginBottom: 8 };
const inputStyle = { width: "100%", background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 8, padding: "12px 14px", color: INK, fontFamily: sans, fontSize: 14, outline: "none" };
const selectStyle = { ...inputStyle, appearance: "none", WebkitAppearance: "none", backgroundImage: "linear-gradient(45deg, transparent 48%, rgba(242,237,228,0.5) 48% 52%, transparent 52%), linear-gradient(-45deg, transparent 48%, rgba(242,237,228,0.5) 48% 52%, transparent 52%)", backgroundSize: "6px 6px, 6px 6px", backgroundPosition: "right 16px top 50%, right 10px top 50%", backgroundRepeat: "no-repeat", paddingRight: 36 };

function Field({ label, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function TextInput(props) { return <input type="text" style={inputStyle} {...props} />; }
function Select({ options, ...rest }) {
  return (
    <select style={selectStyle} {...rest}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{ padding: "10px 16px", borderRadius: 999, border: `1px solid ${on ? TEAL : "rgba(242,237,228,0.15)"}`, background: on ? "rgba(30,192,168,0.12)" : "transparent", color: on ? INK : "rgba(242,237,228,0.75)", fontFamily: sans, fontSize: 13, cursor: "pointer", fontWeight: on ? 500 : 400 }}>{children}</button>
  );
}

function Check({ on, onClick, children }) {
  return (
    <label onClick={onClick} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", padding: "6px 0" }}>
      <span style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${on ? TEAL : "rgba(242,237,228,0.25)"}`, background: on ? TEAL : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
        {on && <span style={{ color: PAPER, fontSize: 12, fontWeight: 700 }}>✓</span>}
      </span>
      <span style={{ fontFamily: sans, fontSize: 13.5, color: "rgba(242,237,228,0.8)", lineHeight: 1.5 }}>{children}</span>
    </label>
  );
}

// -------------- Step bodies --------------

function ClientPersonal({ v, set }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <Field label="First name"><TextInput value={v.firstName || ""} onChange={e => set({ firstName: e.target.value })} /></Field>
      <Field label="Last name"><TextInput value={v.lastName || ""} onChange={e => set({ lastName: e.target.value })} /></Field>
      <Field label="Email" span={2}><TextInput type="email" value={v.email || ""} onChange={e => set({ email: e.target.value })} /></Field>
      <Field label="Password" span={2}><TextInput type="password" value={v.password || ""} onChange={e => set({ password: e.target.value })} placeholder="At least 8 characters" /></Field>
    </div>
  );
}

function ClientGoals({ v, set }) {
  const goals = ["Lose weight", "Build muscle", "Improve endurance", "Increase flexibility", "General fitness"];
  const exp = ["Beginner", "Intermediate", "Advanced"];
  const freq = ["1-2 times per week", "3-4 times per week", "5-6 times per week", "Daily"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <Field label="What is your primary fitness goal?">
        <Select value={v.goal || "Lose weight"} onChange={e => set({ goal: e.target.value })} options={goals} />
      </Field>
      <Field label="Experience level">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {exp.map(x => <Chip key={x} on={v.experience === x} onClick={() => set({ experience: x })}>{x}</Chip>)}
        </div>
      </Field>
      <Field label="How often do you work out?">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {freq.map(x => <Chip key={x} on={v.frequency === x} onClick={() => set({ frequency: x })}>{x}</Chip>)}
        </div>
      </Field>
    </div>
  );
}

function ClientHealth({ v, set }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", margin: 0, lineHeight: 1.55 }}>This intake helps your coach keep you safe and tailor your program. Your answers stay private.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label="Date of birth"><TextInput type="date" value={v.dob || ""} onChange={e => set({ dob: e.target.value })} /></Field>
        <Field label="Biological sex"><Select value={v.sex || "Prefer not to say"} onChange={e => set({ sex: e.target.value })} options={["Prefer not to say", "Female", "Male"]} /></Field>
      </div>
      <Field label="Injuries or physical limitations"><TextInput placeholder="e.g. lower back sensitivity, recovering from ACL" value={v.injuries || ""} onChange={e => set({ injuries: e.target.value })} /></Field>
      <Field label="Medical conditions or medications"><TextInput placeholder="Optional" value={v.medical || ""} onChange={e => set({ medical: e.target.value })} /></Field>
      <Field label="Dietary restrictions or allergies"><TextInput placeholder="Optional" value={v.diet || ""} onChange={e => set({ diet: e.target.value })} /></Field>
      <Field label="Emergency contact (name & phone)"><TextInput value={v.emergency || ""} onChange={e => set({ emergency: e.target.value })} /></Field>
      <Field label="Accountability style">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {["Hands-off — check in when I need help", "Balanced — weekly check-ins", "High-touch — daily messages & reminders"].map(x => (
            <Chip key={x} on={v.accountability === x} onClick={() => set({ accountability: x })}>{x}</Chip>
          ))}
        </div>
      </Field>
      <Check on={v.waiver} onClick={() => set({ waiver: !v.waiver })}>I confirm I am physically able to begin a new exercise program, and I'll consult my doctor if unsure.</Check>
    </div>
  );
}

function ClientPrefs({ v, set }) {
  const interests = ["Personal training", "Nutrition coaching", "AI workout generator", "Group classes"];
  const toggleInterest = (x) => {
    const cur = v.interests || [];
    set({ interests: cur.includes(x) ? cur.filter(y => y !== x) : [...cur, x] });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Field label="What are you most interested in?">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {interests.map(x => <Chip key={x} on={(v.interests || []).includes(x)} onClick={() => toggleInterest(x)}>{x}</Chip>)}
        </div>
      </Field>
      <Field label="Budget per month (optional)">
        <Select value={v.budget || "Optional"} onChange={e => set({ budget: e.target.value })} options={["Optional", "Under $25/mo", "$25 – $50/mo", "$50 – $100/mo", "$100+/mo"]} />
      </Field>
      <Check on={v.tos} onClick={() => set({ tos: !v.tos })}>I agree to the <a href="#" style={{ color: TEAL, textDecoration: "underline", textUnderlineOffset: 2 }}>Terms of Service</a> and <a href="#" style={{ color: TEAL, textDecoration: "underline", textUnderlineOffset: 2 }}>Privacy Policy</a>.</Check>
    </div>
  );
}

// ---- Trainer / Nutritionist ----

function ProPersonal({ v, set, roleNoun }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <Field label="First name"><TextInput value={v.firstName || ""} onChange={e => set({ firstName: e.target.value })} /></Field>
      <Field label="Last name"><TextInput value={v.lastName || ""} onChange={e => set({ lastName: e.target.value })} /></Field>
      <Field label="Email"><TextInput type="email" value={v.email || ""} onChange={e => set({ email: e.target.value })} /></Field>
      <Field label="Phone"><TextInput type="tel" value={v.phone || ""} onChange={e => set({ phone: e.target.value })} /></Field>
      <Field label="City, State / Country" span={2}><TextInput value={v.city || ""} onChange={e => set({ city: e.target.value })} placeholder="e.g. Brooklyn, NY · USA" /></Field>
      <Field label="Time zone"><TextInput value={v.tz || ""} onChange={e => set({ tz: e.target.value })} placeholder="e.g. America/New_York" /></Field>
      <Field label="Social handles (optional)"><TextInput value={v.social || ""} onChange={e => set({ social: e.target.value })} placeholder="@handle, ig.com/..." /></Field>
      <Field label={`Short bio — why you got into ${roleNoun}`} span={2}>
        <textarea value={v.bio || ""} onChange={e => set({ bio: e.target.value })} style={{ ...inputStyle, minHeight: 96, resize: "vertical", fontFamily: sans }} />
      </Field>
    </div>
  );
}

function ProCredentials({ v, set, kind }) {
  const isTrainer = kind === "trainer";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label={isTrainer ? "Primary certification" : "License type"}><TextInput value={v.cert || ""} onChange={e => set({ cert: e.target.value })} placeholder={isTrainer ? "NASM, ACE, NSCA, CSCS..." : "RD, RDN, LDN, CNS..."} /></Field>
        <Field label={isTrainer ? "Expiration / renewal" : "License state + number"}><TextInput value={v.certExp || ""} onChange={e => set({ certExp: e.target.value })} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label="Degree / school"><TextInput value={v.edu || ""} onChange={e => set({ edu: e.target.value })} placeholder={isTrainer ? "BS Kinesiology — UT Austin" : "MS Nutrition — NYU"} /></Field>
        <Field label="Years coaching"><Select value={v.years || "1-2 years"} onChange={e => set({ years: e.target.value })} options={["1-2 years", "3-5 years", "5-10 years", "10+ years"]} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label="Liability insurance"><Select value={v.insurance || "Yes"} onChange={e => set({ insurance: e.target.value })} options={["Yes", "No", "In progress"]} /></Field>
        <Field label="Previous platforms (optional)"><TextInput value={v.prev || ""} onChange={e => set({ prev: e.target.value })} placeholder="Trainerize, MyFitnessPal Pro..." /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label={isTrainer ? "Proof of certification" : "Proof of license"}>
          <FileStub label="Upload PDF or image" />
        </Field>
        <Field label="Insurance document"><FileStub label="Upload PDF or image" /></Field>
      </div>
      <Check on={v.verify} onClick={() => set({ verify: !v.verify })}>I understand my credentials may be verified by Shape's trust team.</Check>
    </div>
  );
}

function FileStub({ label }) {
  return (
    <div style={{ ...inputStyle, padding: "14px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
      <span style={{ color: "rgba(242,237,228,0.55)" }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: TEAL, letterSpacing: "0.1em", textTransform: "uppercase" }}>Browse →</span>
    </div>
  );
}

function ProSpecialty({ v, set, kind }) {
  const trainerSpecs = ["Strength & Powerlifting", "HIIT & Fat Loss", "At-home Workouts", "Cardio & Endurance", "Functional Fitness", "Bodybuilding", "Sports Performance", "Mobility", "Run coaching"];
  const nutriSpecs = ["Weight management", "Sports nutrition", "Plant-based", "Gut health", "Hormonal health", "Pre/postnatal", "Endurance fueling", "Clinical / medical"];
  const specs = kind === "trainer" ? trainerSpecs : nutriSpecs;
  const populations = kind === "trainer"
    ? ["Beginners", "Women 30-50", "Men 40+", "Postnatal", "Athletes", "Seniors", "Rehab", "Youth"]
    : ["Endurance athletes", "Strength athletes", "Weight loss", "Clinical conditions", "Plant-based", "Postnatal", "Youth"];
  const toggle = (key, val) => {
    const cur = v[key] || [];
    set({ [key]: cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val] });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Field label="Primary specialty">
        <Select value={v.primary || specs[0]} onChange={e => set({ primary: e.target.value })} options={specs} />
      </Field>
      <Field label="Secondary specialties">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {specs.map(s => <Chip key={s} on={(v.secondary || []).includes(s)} onClick={() => toggle("secondary", s)}>{s}</Chip>)}
        </div>
      </Field>
      <Field label="Populations you work best with">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {populations.map(s => <Chip key={s} on={(v.populations || []).includes(s)} onClick={() => toggle("populations", s)}>{s}</Chip>)}
        </div>
      </Field>
      <Field label="Coaching style (one sentence)">
        <TextInput value={v.style || ""} onChange={e => set({ style: e.target.value })} placeholder={kind === "trainer" ? "Data-driven, warm, no shouting" : "Evidence-based, no restriction, real food"} />
      </Field>
    </div>
  );
}

function ProAvailability({ v, set, kind }) {
  const noun = kind === "trainer" ? "clients" : "clients";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label={`Max ${noun} you can take`}><TextInput type="number" value={v.maxClients || ""} onChange={e => set({ maxClients: e.target.value })} placeholder="e.g. 25" /></Field>
        <Field label="Accepting new clients">
          <Select value={v.accepting || "Yes"} onChange={e => set({ accepting: e.target.value })} options={["Yes", "Waitlist", "Not yet"]} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label={kind === "trainer" ? "Offer 1-on-1 sessions" : "Offer 1-on-1 consults"}>
          <Select value={v.oneOnOne || "Yes"} onChange={e => set({ oneOnOne: e.target.value })} options={["Yes", "No"]} />
        </Field>
        <Field label="Response time commitment">
          <Select value={v.response || "Within 24 hours"} onChange={e => set({ response: e.target.value })} options={["Within 12 hours", "Within 24 hours", "Within 48 hours"]} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label={kind === "trainer" ? "Monthly subscription ($/mo)" : "Monthly plan ($/mo)"}>
          <TextInput type="number" value={v.subPrice || ""} onChange={e => set({ subPrice: e.target.value })} placeholder={kind === "trainer" ? "280" : "320"} />
        </Field>
        <Field label={kind === "trainer" ? "Single session ($)" : "Single consult ($)"}>
          <TextInput type="number" value={v.sessionPrice || ""} onChange={e => set({ sessionPrice: e.target.value })} placeholder={kind === "trainer" ? "55" : "150"} />
        </Field>
      </div>
      <Field label="Offer free intro">
        <Select value={v.intro || "15-minute free intro"} onChange={e => set({ intro: e.target.value })} options={["15-minute free intro", "30-minute free intro", "No free intro"]} />
      </Field>

      <div style={{ paddingTop: 14, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)", marginBottom: 4 }}>Agreements</div>
        <Check on={v.tos} onClick={() => set({ tos: !v.tos })}>I agree to the <a href="#" style={{ color: TEAL }}>{kind === "trainer" ? "Trainer" : "Nutritionist"} Agreement</a> and <a href="#" style={{ color: TEAL }}>Terms of Service</a>.</Check>
        <Check on={v.conduct} onClick={() => set({ conduct: !v.conduct })}>I agree to Shape's <a href="#" style={{ color: TEAL }}>code of conduct</a>.</Check>
        <Check on={v.bgcheck} onClick={() => set({ bgcheck: !v.bgcheck })}>I consent to an optional background check (builds trust with clients).</Check>
      </div>
    </div>
  );
}

function RadioAccount({ v, set }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <Field label="First name"><TextInput value={v.firstName || ""} onChange={e => set({ firstName: e.target.value })} /></Field>
      <Field label="Last name"><TextInput value={v.lastName || ""} onChange={e => set({ lastName: e.target.value })} /></Field>
      <Field label="Email" span={2}><TextInput type="email" value={v.email || ""} onChange={e => set({ email: e.target.value })} /></Field>
      <Field label="Password" span={2}><TextInput type="password" value={v.password || ""} onChange={e => set({ password: e.target.value })} /></Field>
    </div>
  );
}

function RadioVibe({ v, set }) {
  const vibes = ["High-BPM cardio", "Strength lifts", "Hip-hop", "House & techno", "Indie & alt", "Ambient & focus", "Latin", "Afrobeat"];
  const toggle = (x) => {
    const cur = v.vibes || [];
    set({ vibes: cur.includes(x) ? cur.filter(y => y !== x) : [...cur, x] });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Field label="Pick a few stations to start">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {vibes.map(x => <Chip key={x} on={(v.vibes || []).includes(x)} onClick={() => toggle(x)}>{x}</Chip>)}
        </div>
      </Field>
      <Check on={v.tos} onClick={() => set({ tos: !v.tos })}>I agree to the <a href="#" style={{ color: TEAL }}>Terms of Service</a> and <a href="#" style={{ color: TEAL }}>Privacy Policy</a>.</Check>
      <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", lineHeight: 1.55 }}>
        Radio is free with a <span style={{ color: INK, fontWeight: 500 }}>Shape membership ($5/mo)</span>. You can upgrade anytime from settings.
      </div>
    </div>
  );
}

// -------------- Main form --------------

function SignupForm({ role }) {
  const cfg = ROLE_CONFIG[role];
  const [step, setStep] = React.useState(0);
  const [values, setValues] = React.useState({});
  const [done, setDone] = React.useState(false);
  const set = (patch) => setValues(v => ({ ...v, ...patch }));

  const totalSteps = cfg.steps.length;
  const isLast = step === totalSteps - 1;

  const body = (() => {
    if (role === "client") {
      return [
        <ClientPersonal v={values} set={set} />,
        <ClientGoals v={values} set={set} />,
        <ClientHealth v={values} set={set} />,
        <ClientPrefs v={values} set={set} />,
      ][step];
    }
    if (role === "trainer" || role === "nutritionist") {
      return [
        <ProPersonal v={values} set={set} roleNoun={role === "trainer" ? "coaching" : "nutrition"} />,
        <ProCredentials v={values} set={set} kind={role} />,
        <ProSpecialty v={values} set={set} kind={role} />,
        <ProAvailability v={values} set={set} kind={role} />,
      ][step];
    }
    if (role === "radio") {
      return [
        <RadioAccount v={values} set={set} />,
        <RadioVibe v={values} set={set} />,
      ][step];
    }
    return null;
  })();

  if (done) {
    return (
      <div style={{ padding: "60px 48px", textAlign: "left", background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: TEAL, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><path d="M5 13.5l5 5 11-11" stroke={PAPER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h2 style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.025em", fontWeight: 400, margin: "0 0 12px", lineHeight: 1 }}>{cfg.doneTitle}</h2>
        <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.7)", margin: "0 0 32px", lineHeight: 1.55, maxWidth: 500 }}>{cfg.doneBody}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <a href={cfg.doneCta.href} style={{ padding: "14px 24px", borderRadius: 8, background: INK, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, textDecoration: "none", display: "inline-block" }}>{cfg.doneCta.label}</a>
          <a href="get-started.html" style={{ padding: "14px 24px", borderRadius: 8, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", fontFamily: sans, fontSize: 14, textDecoration: "none", display: "inline-block" }}>Back to landing</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, padding: "40px 44px 36px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL }}>Step {step + 1} of {totalSteps}</div>
        <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.55)" }}>{cfg.steps[step]}</div>
      </div>
      <h2 style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.025em", fontWeight: 400, margin: "0 0 28px", lineHeight: 1.05 }}>{cfg.formTitle}</h2>

      {/* Progress */}
      <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
        {cfg.steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? TEAL : "rgba(242,237,228,0.1)" }} />
        ))}
      </div>

      <div>{body}</div>

      <div style={{ marginTop: 36, display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          style={{ padding: "12px 18px", borderRadius: 8, background: "transparent", color: step === 0 ? "rgba(242,237,228,0.3)" : INK, border: "1px solid rgba(242,237,228,0.15)", fontFamily: sans, fontSize: 13, cursor: step === 0 ? "default" : "pointer" }}>
          ← Back
        </button>
        <button
          type="button"
          onClick={() => isLast ? setDone(true) : setStep(step + 1)}
          style={{ padding: "14px 24px", borderRadius: 8, background: INK, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          {isLast ? cfg.submitLabel : "Continue"}
        </button>
      </div>
    </div>
  );
}

// -------------- Page shell --------------

function SignupPage({ role }) {
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.client;
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh" }}>
      {/* Minimal header */}
      <header style={{ padding: "24px 40px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="get-started.html" aria-label="Shape"><Logo variant="white" size={40} /></a>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <span style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.55)" }}>Already have an account?</span>
            <a href="Login.html" style={{ fontFamily: sans, fontSize: 13, color: INK, fontWeight: 500, borderBottom: `1.5px solid ${TEAL}`, paddingBottom: 3 }}>Log in</a>
          </div>
        </div>
      </header>

      <main style={{ padding: "60px 40px 80px" }}>
        <div style={{ maxWidth: 1220, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 64, alignItems: "start" }}>
          {/* Left — pitch */}
          <aside style={{ position: "sticky", top: 100 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>{cfg.kicker}</div>
            <h1 style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 1.02 }}>{cfg.titleLeft}</h1>
            <ul style={{ listStyle: "none", padding: 0, margin: "32px 0 0", display: "flex", flexDirection: "column", gap: 12 }}>
              {cfg.perks.map(p => (
                <li key={p} style={{ fontFamily: sans, fontSize: 14.5, color: "rgba(242,237,228,0.8)", display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ color: TEAL }}>→</span>{p}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 40, fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.45)" }}>
              <a href="get-started.html" style={{ color: "rgba(242,237,228,0.55)" }}>← Back to profile selection</a>
            </div>
          </aside>

          {/* Right — form */}
          <div><SignupForm role={role} /></div>
        </div>
      </main>

      <footer style={{ padding: "30px 40px", borderTop: "1px solid rgba(242,237,228,0.08)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <span>© 2026 Shape</span>
          <div style={{ display: "flex", gap: 24 }}>
            <a href="#">Privacy</a><a href="#">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Determine role: prefer window.__SIGNUP_ROLE (set by HTML), then ?role=, then default client.
const role = window.__SIGNUP_ROLE || new URLSearchParams(window.location.search).get("role") || "client";
ReactDOM.createRoot(document.getElementById("root")).render(<SignupPage role={role} />);
