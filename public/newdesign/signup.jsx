// Signup — multi-role. Reads ?role= from query, defaults to "client".
// Roles: client, trainer, nutritionist

const ROLE_CONFIG = {
  client: {
    kicker: "Start training with Shape",
    titleLeft: "Train with the best coaches - one marketplace - one platform.",
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
    doneCta: { label: "Back to home", href: "Landing.html" },
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
    doneCta: { label: "Back to home", href: "Landing.html" },
  },
};

// -------------- Utility styles --------------
const labelStyle = { display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)", marginBottom: 8 };
const inputStyle = { width: "100%", background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 8, padding: "12px 14px", color: INK, fontFamily: sans, fontSize: 14, outline: "none" };
const selectStyle = { ...inputStyle, appearance: "none", WebkitAppearance: "none", backgroundImage: "linear-gradient(45deg, transparent 48%, rgba(242,237,228,0.5) 48% 52%, transparent 52%), linear-gradient(-45deg, transparent 48%, rgba(242,237,228,0.5) 48% 52%, transparent 52%)", backgroundSize: "6px 6px, 6px 6px", backgroundPosition: "right 16px top 50%, right 10px top 50%", backgroundRepeat: "no-repeat", paddingRight: 36 };
const proExperienceOptions = ["7-10 years", "10-15 years", "15+ years"];

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
    <button type="button" onClick={onClick} style={{ padding: "10px 16px", borderRadius: 999, border: `1px solid ${on ? TEAL : "rgba(242,237,228,0.15)"}`, background: on ? "rgba(10,197,168,0.12)" : "transparent", color: on ? INK : "rgba(242,237,228,0.75)", fontFamily: sans, fontSize: 13, cursor: "pointer", fontWeight: on ? 500 : 400 }}>{children}</button>
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

// Username — the member's Shape handle (@username). Live availability check
// via the is_username_available RPC (anon-allowed, so it works pre-account).
function UsernameField({ v, set, span = 2 }) {
  const [status, setStatus] = React.useState(null); // null=idle/checking · true · false
  const u = v.username || "";
  React.useEffect(() => {
    if (!u) { setStatus(null); return; }
    if (!/^[a-z0-9][a-z0-9._]{2,19}$/.test(u)) { setStatus(false); return; }
    let dead = false;
    setStatus(null);
    const id = setTimeout(() => {
      const sb = window.shapeDb && window.shapeDb.client;
      if (!sb) { if (!dead) setStatus(true); return; }
      sb.rpc("is_username_available", { p_username: u })
        .then(r => { if (!dead) setStatus(r && r.data === false ? false : true); })
        .catch(() => { if (!dead) setStatus(true); });
    }, 300);
    return () => { dead = true; clearTimeout(id); };
  }, [u]);
  return (
    <Field label="Username — your Shape handle" span={span}>
      <TextInput value={u} onChange={e => set({ username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 20) })} placeholder="your.handle" autoComplete="username" />
      <div style={{ marginTop: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: !u ? "rgba(242,237,228,0.45)" : status === false ? "#ff9b7a" : status ? "#0ac5a8" : "rgba(242,237,228,0.45)" }}>
        {!u ? "Letters · numbers · . _ (3–20 chars)" : status === false ? "Taken or invalid — try another" : status ? `@${u} is yours` : "Checking…"}
      </div>
    </Field>
  );
}

function ClientPersonal({ v, set }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <Field label="First name"><TextInput value={v.firstName || ""} onChange={e => set({ firstName: e.target.value })} /></Field>
      <Field label="Last name"><TextInput value={v.lastName || ""} onChange={e => set({ lastName: e.target.value })} /></Field>
      <UsernameField v={v} set={set} />
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
      <Field label="Prescription medications"><TextInput placeholder="List any you take — or 'None'" value={v.medications || ""} onChange={e => set({ medications: e.target.value })} /></Field>
      <Field label="Other medical conditions"><TextInput placeholder="Optional — e.g. asthma, type 2 diabetes" value={v.medical || ""} onChange={e => set({ medical: e.target.value })} /></Field>
      <Field label="Allergies (food, medication, other)"><TextInput placeholder="List any — or 'None'" value={v.diet || ""} onChange={e => set({ diet: e.target.value })} /></Field>
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
  const interests = ["Personal training", "Nutrition coaching", "Both"];
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
      <Check on={v.tos} onClick={() => set({ tos: !v.tos })}>I agree to the <a href="/terms" style={{ color: TEAL, textDecoration: "underline", textUnderlineOffset: 2 }}>Terms of Service</a> and <a href="/privacy" style={{ color: TEAL, textDecoration: "underline", textUnderlineOffset: 2 }}>Privacy Policy</a>.</Check>
    </div>
  );
}

// ---- Trainer / Nutritionist ----

function ProPersonal({ v, set, roleNoun }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <Field label="First name"><TextInput value={v.firstName || ""} onChange={e => set({ firstName: e.target.value })} /></Field>
      <Field label="Last name"><TextInput value={v.lastName || ""} onChange={e => set({ lastName: e.target.value })} /></Field>
      <UsernameField v={v} set={set} />
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
  const isDietitian = !isTrainer && /dietitian/i.test(v.nutritionType || "");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {!isTrainer && (
        <div>
          <Field label="Professional type" span={2}>
            <Select value={v.nutritionType || "Nutritionist"} onChange={e => set({ nutritionType: e.target.value })} options={["Nutritionist", "Dietitian (RD / RDN)"]} />
          </Field>
          <p style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.6)", margin: "8px 0 0", lineHeight: 1.5 }}>
            {isDietitian
              ? "Registered Dietitians get a verified RD/RDN badge once we confirm your license — same nutrition tools, credentialed."
              : "Are you a Registered Dietitian (RD/RDN)? Select it above for the credentialed profile."}
          </p>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label={isTrainer ? "Primary certification" : isDietitian ? "RD/RDN registration number" : "License type"}><TextInput value={v.cert || ""} onChange={e => set({ cert: e.target.value })} placeholder={isTrainer ? "NASM, ACE, NSCA, CSCS..." : isDietitian ? "RD #, RDN #..." : "RD, RDN, LDN, CNS..."} /></Field>
        <Field label={isTrainer ? "Expiration / renewal" : "License state + number"}><TextInput value={v.certExp || ""} onChange={e => set({ certExp: e.target.value })} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label="Degree / school"><TextInput value={v.edu || ""} onChange={e => set({ edu: e.target.value })} placeholder={isTrainer ? "BS Kinesiology — UT Austin" : "MS Nutrition — NYU"} /></Field>
        <Field label="Years professional experience"><Select value={v.years || "7-10 years"} onChange={e => set({ years: e.target.value })} options={proExperienceOptions} /></Field>
      </div>
      <p style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.68)", margin: 0, lineHeight: 1.55 }}>
        Shape requires a minimum of 5 years of professional {isTrainer ? "training or coaching" : "nutrition coaching or clinical"} experience before a provider profile can go live.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label="Liability insurance"><Select value={v.insurance || "Yes"} onChange={e => set({ insurance: e.target.value })} options={["Yes", "No", "In progress"]} /></Field>
        <Field label="Previous platforms (optional)"><TextInput value={v.prev || ""} onChange={e => set({ prev: e.target.value })} placeholder="Trainerize, MyFitnessPal Pro..." /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label="Resume / CV">
          <FileInput label="Upload PDF, DOC, or image" onChange={file => set({ resumeFile: file || null })} />
        </Field>
        <Field label={isTrainer ? "Proof of certification" : "Proof of license"}>
          <FileInput label="Upload PDF or image" onChange={file => set({ credentialFile: file || null })} />
        </Field>
        <Field label="Insurance document"><FileInput label="Upload PDF or image" onChange={file => set({ insuranceFile: file || null })} /></Field>
      </div>
      {!isTrainer && <NutritionCompliance v={v} set={set} isDietitian={isDietitian} />}
      <Check on={v.verify} onClick={() => set({ verify: !v.verify })}>I understand my credentials may be verified by Shape's trust team.</Check>
    </div>
  );
}

// NC1 — nutrition-provider compliance capture (state licensure + insurance +
// attestations). A dietitian must be licensed in EACH client's state to provide
// individualized (medical) nutrition therapy; we re-check the match on every
// pairing. A nutritionist without a state license is limited to general wellness.
// Engineering controls only — NOT legal advice; production enablement requires
// healthcare-regulatory counsel sign-off.
function NutritionCompliance({ v, set, isDietitian }) {
  const mono = "'JetBrains Mono', monospace";
  const licenses = (Array.isArray(v.licenses) && v.licenses.length) ? v.licenses : [{ state: "", number: "", expires: "" }];
  const setLicense = (i, patch) => set({ licenses: licenses.map((l, idx) => idx === i ? { ...l, ...patch } : l) });
  const addLicense = () => set({ licenses: [...licenses, { state: "", number: "", expires: "" }] });
  const removeLicense = (i) => set({ licenses: licenses.filter((_, idx) => idx !== i) });
  const att = v.attest || {};
  const toggleAtt = (k) => set({ attest: { ...att, [k]: !att[k] } });
  const subLabel = { ...labelStyle, marginBottom: 6 };
  return (
    <div style={{ paddingTop: 16, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 6 }}>Nutrition practice · compliance</div>
        <p style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.62)", margin: 0, lineHeight: 1.5 }}>
          {isDietitian
            ? "To provide individualized (medical) nutrition therapy, you must be licensed in each client's state. Add your CDR registration, state license(s), and liability insurance — Shape re-checks the state match on every client pairing."
            : "Without a state dietitian license you can offer general wellness guidance only — not individualized or clinical nutrition plans. Add a state license below to unlock individualized care for clients in that state."}
        </p>
      </div>
      {isDietitian && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="CDR registration number (RD/RDN)"><TextInput value={v.cdrId || ""} onChange={e => set({ cdrId: e.target.value })} placeholder="e.g. 1234567" /></Field>
          <Field label="Credential type"><Select value={v.rdCredential || "rd"} onChange={e => set({ rdCredential: e.target.value })} options={["rd", "rdn"]} /></Field>
        </div>
      )}
      <div>
        <div style={subLabel}>State license(s) — you may only serve clients in states you are licensed in</div>
        {licenses.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 1fr 150px 30px", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input type="text" value={l.state || ""} onChange={e => setLicense(i, { state: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) })} placeholder="NY" style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.1em" }} aria-label="State" />
            <input type="text" value={l.number || ""} onChange={e => setLicense(i, { number: e.target.value })} placeholder="License number" style={inputStyle} aria-label="License number" />
            <input type="date" value={l.expires || ""} onChange={e => setLicense(i, { expires: e.target.value })} style={inputStyle} aria-label="Expiration" />
            <button type="button" onClick={() => licenses.length > 1 ? removeLicense(i) : setLicense(i, { state: "", number: "", expires: "" })} aria-label="Remove license" style={{ background: "transparent", border: "1px solid rgba(242,237,228,0.14)", borderRadius: 8, color: "rgba(242,237,228,0.6)", cursor: "pointer", height: 38, fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
        ))}
        <button type="button" onClick={addLicense} style={{ background: "transparent", border: "1px dashed rgba(242,237,228,0.18)", borderRadius: 8, color: TEAL, fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 12px", cursor: "pointer" }}>+ Add another state</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Insurance carrier"><TextInput value={v.insCarrier || ""} onChange={e => set({ insCarrier: e.target.value })} placeholder="e.g. HPSO" /></Field>
        <Field label="Policy number"><TextInput value={v.insPolicy || ""} onChange={e => set({ insPolicy: e.target.value })} /></Field>
        <Field label="Insurance expiration"><input type="date" value={v.insExpires || ""} onChange={e => set({ insExpires: e.target.value })} style={inputStyle} aria-label="Insurance expiration" /></Field>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={subLabel}>Attestations (required)</div>
        <Check on={att.independent_contractor} onClick={() => toggleAtt("independent_contractor")}>I am an independent contractor. Shape is a marketplace, not my employer, and does not direct my clinical judgment.</Check>
        <Check on={att.maintains_licensure} onClick={() => toggleAtt("maintains_licensure")}>I will maintain valid licensure in every state where I provide individualized nutrition care, and only accept clients I am licensed to serve.</Check>
        <Check on={att.maintains_insurance} onClick={() => toggleAtt("maintains_insurance")}>I maintain current professional liability (malpractice) insurance.</Check>
        <Check on={att.scope_understood} onClick={() => toggleAtt("scope_understood")}>I understand the difference between general wellness guidance and individualized medical nutrition therapy, and will practice within my scope and license.</Check>
      </div>
    </div>
  );
}

function FileInput({ label, onChange }) {
  return (
    <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" onChange={e => onChange(e.target.files?.[0] || null)} style={{ ...inputStyle, cursor: "pointer", fontSize: 12 }} aria-label={label} />
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
        <Check on={v.tos} onClick={() => set({ tos: !v.tos })}>I agree to the <a href="/terms" style={{ color: TEAL }}>{kind === "trainer" ? "Trainer" : "Nutritionist"} Agreement</a> and <a href="/terms" style={{ color: TEAL }}>Terms of Service</a>.</Check>
        <Check on={v.conduct} onClick={() => set({ conduct: !v.conduct })}>I agree to Shape's <a href="/community" style={{ color: TEAL }}>code of conduct</a>.</Check>
        <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.62)", lineHeight: 1.55, border: "1px solid rgba(242,237,228,0.12)", borderRadius: 10, padding: 12 }}>
          Background checks are required before a provider profile can go live. Shape uses Checkr first; the review team sends the screening invite after application review.
        </div>
        <Check on={v.bgcheck} onClick={() => set({ bgcheck: !v.bgcheck })}>I consent to a required background check through Shape's screening partner before my provider profile can go live.</Check>
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
  const [confirmEmail, setConfirmEmail] = React.useState(false);
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const set = (patch) => setValues(v => ({ ...v, ...patch }));

  const totalSteps = cfg.steps.length;
  const isLast = step === totalSteps - 1;

  // Cloudflare Turnstile (CAPTCHA) — Auth CAPTCHA is enabled, so a tokenless
  // signUp is REJECTED. Mirror login.jsx: render a widget on the client signup's
  // FINAL step, block submit until a token exists, pass it to auth.signUp, and
  // degrade open if the human-check can't load/connect (so it can't hard-block).
  const captchaOn = typeof window !== "undefined" && window.ShapeTurnstile && window.ShapeTurnstile.enabled();
  const [captchaToken, setCaptchaToken] = React.useState("");
  const [captchaUnavailable, setCaptchaUnavailable] = React.useState(false);
  const captchaRef = React.useRef(null);
  const captchaIdRef = React.useRef(null);
  const captchaTokenRef = React.useRef("");
  React.useEffect(() => { captchaTokenRef.current = captchaToken; }, [captchaToken]);
  // Render the widget only on the CLIENT signup's final step (where it's shown).
  const captchaVisible = captchaOn && role === "client" && isLast;
  React.useEffect(() => {
    if (!captchaVisible) {
      if (captchaIdRef.current != null) { window.ShapeTurnstile.remove(captchaIdRef.current); captchaIdRef.current = null; }
      setCaptchaToken("");
      return;
    }
    if (!captchaRef.current || captchaIdRef.current != null) return;
    setCaptchaUnavailable(false);
    let alive = true;
    window.ShapeTurnstile.render(captchaRef.current, setCaptchaToken).then((id) => {
      if (!alive) return;
      captchaIdRef.current = id;
      if (id == null) setCaptchaUnavailable(true); // the Turnstile script never loaded
    });
    const failTimer = setTimeout(() => { if (alive && !captchaTokenRef.current) setCaptchaUnavailable(true); }, 7000);
    return () => { alive = false; clearTimeout(failTimer); };
  }, [captchaVisible]);
  // Tokens are single-use — clear after a failed attempt so a retry re-solves.
  const resetCaptcha = () => { setCaptchaToken(""); if (captchaIdRef.current != null) window.ShapeTurnstile.reset(captchaIdRef.current); };

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
    return null;
  })();

  if (confirmEmail) {
    return (
      <div style={{ padding: "60px 48px", textAlign: "left", background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: TEAL, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><rect x="3" y="6" width="20" height="15" rx="2" stroke={PAPER} strokeWidth="2.2"/><path d="M4 7l9 6 9-6" stroke={PAPER} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h2 style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.025em", fontWeight: 400, margin: "0 0 12px", lineHeight: 1 }}>Confirm your email.</h2>
        <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.7)", margin: "0 0 32px", lineHeight: 1.55, maxWidth: 500 }}>We sent a confirmation link to {values.email}. Click it, then sign in to finish — we'll claim @{(values.username || "").trim().replace(/^@/, "").toLowerCase()} for you then, if it's still available.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <a href="Login.html" style={{ padding: "14px 24px", borderRadius: 8, background: INK, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, textDecoration: "none", display: "inline-block" }}>Go to sign in</a>
          <a href="Landing.html" style={{ padding: "14px 24px", borderRadius: 8, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", fontFamily: sans, fontSize: 14, textDecoration: "none", display: "inline-block" }}>Back to landing</a>
        </div>
      </div>
    );
  }

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
          <a href="Landing.html" style={{ padding: "14px 24px", borderRadius: 8, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", fontFamily: sans, fontSize: 14, textDecoration: "none", display: "inline-block" }}>Back to landing</a>
        </div>
      </div>
    );
  }

  async function submitApplication() {
    setError("");
    // ---- CLIENT path: create a REAL Supabase auth account (mirrors the mobile app) ----
    if (role !== "trainer" && role !== "nutritionist") {
      // Validate the collected fields.
      if (!values.firstName || !values.lastName) { setError("First and last name are required."); return; }
      if (!values.email || !values.email.trim()) { setError("Enter your email."); return; }
      if (!values.password || values.password.length < 8) { setError("Choose a password with at least 8 characters."); return; }
      // Normalize the username the same way it'll be submitted, THEN validate, so
      // a value like " Jane.Doe " / "@jane" can't fail the check on a stray char.
      const cleanUsername = String(values.username || "").trim().replace(/^@/, "").toLowerCase();
      if (!cleanUsername || !/^[a-z0-9][a-z0-9._]{2,19}$/.test(cleanUsername)) {
        setError("Pick a valid username — letters, numbers, . _ (3–20 chars).");
        return;
      }
      // ⚠ 18+ gate — the SHARED derivation, not a restatement. The instant
      // comparison this replaced read ADULT for DOB 2008-08-17 at
      // 2026-08-17T00:30:00Z, which is still Aug 16 in Los Angeles: a minor
      // admitted on their local birthday eve, the exact case the read-time gate
      // reads the calendar day at UTC−12 to prevent.
      const ageApi = window.ShapeAgeDerive;
      if (!ageApi || typeof ageApi.isMinorFromDob !== "function") {
        // Fail closed — cannot verify an age ⇒ refuse, never admit.
        setError("Could not verify your age. Reload the page and try again.");
        return;
      }
      const minor = ageApi.isMinorFromDob(values.dob);
      if (minor === null) { setError("Enter a valid date of birth — Shape is for adults 18 and over."); return; }
      if (minor === true) { setError("You must be 18 or older to use Shape."); return; }
      // Require Terms + Privacy acceptance before creating a real account (the
      // ClientPrefs step collects values.tos — gate on it like the coach path does).
      if (!values.tos) { setError("Please accept the Terms of Service and Privacy Policy to continue."); return; }
      // Captcha gate — Auth CAPTCHA is enabled, so a tokenless signUp is REJECTED by
      // the server. If the human-check can't load, BLOCK with a retry message rather
      // than falling open into a confusing server-side rejection.
      if (captchaOn && !captchaToken) {
        setError(captchaUnavailable
          ? "Couldn't load the human-check. Refresh the page or disable any blockers, then try again."
          : "Just a moment — confirming you're human…");
        return;
      }
      const sb = window.shapeDb && window.shapeDb.client;
      if (!sb) { setError("Auth is still loading. Try again."); return; }

      setSubmitting(true);
      try {
        const { data, error } = await sb.auth.signUp({
          email: values.email.trim(),
          password: values.password,
          options: {
            emailRedirectTo: window.location.origin + "/newdesign/Login.html",
            ...(captchaOn && captchaToken ? { captchaToken } : {}),
            data: {
              full_name: (values.firstName + " " + values.lastName).trim(),
              role: "client",
              roles: ["client"],
              username: cleanUsername,
              date_of_birth: values.dob,
            },
          },
        });
        if (error) {
          if (captchaOn) resetCaptcha();
          setError(error.message || "Could not create your account.");
          return;
        }
        // Email confirmation enabled → signUp returns a user but no session until
        // the emailed link is clicked → show "check your inbox". If a session IS
        // returned (auto-confirm), the account is already signed in → dashboard.
        if (data && data.user && !data.session) {
          setConfirmEmail(true);
        } else {
          // Auto-confirm (no email step): a session exists immediately and we go
          // straight to the dashboard, skipping the login path — so provision the
          // account HERE (create the profile, persist DOB → the over_18 trigger,
          // claim the username), mirroring the mobile signUp's post-session steps.
          // The profiles upsert can return { error } WITHOUT throwing, and the
          // dashboard NEEDS the row — so on failure send them to sign in (the
          // account exists; Login.html provisions the profile) rather than into a
          // broken dashboard. The username claim stays best-effort.
          const u = data && data.user;
          if (u && u.id) {
            let pErr = null;
            try {
              const res = await sb.from("profiles").upsert({
                id: u.id, email: u.email,
                full_name: (values.firstName + " " + values.lastName).trim(),
                role: "client", roles: ["client"],
                date_of_birth: values.dob, updated_at: new Date().toISOString(),
              }, { onConflict: "id" });
              pErr = res && res.error;
            } catch (e) { pErr = e; }
            if (pErr) { setError("Your account was created — please sign in to finish setting up your profile."); return; }
            try { await sb.rpc("set_my_username", { p_username: cleanUsername }); } catch (e) {}
          }
          window.location.href = "ClientDashboard.html";
        }
      } catch (err) {
        if (captchaOn) resetCaptcha();
        setError(err?.message || "Could not create your account.");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    // ---- COACH path (trainer / nutritionist) — UNCHANGED below ----
    if (!values.firstName || !values.lastName || !values.email) {
      setError("First name, last name, and email are required.");
      return;
    }
    const years = Number(String(values.years || "").match(/\d+/)?.[0] || 0);
    if (years < 7) {
      setError("Shape requires at least 5 years of professional experience.");
      return;
    }
    if (!values.tos || !values.conduct || !values.bgcheck) {
      setError("Terms, code of conduct, and background check consent are required.");
      return;
    }
    if (role === "nutritionist") {
      const att = values.attest || {};
      const required = ["independent_contractor", "maintains_licensure", "maintains_insurance", "scope_understood"];
      if (required.some((k) => att[k] !== true)) {
        setError("All nutrition compliance attestations are required.");
        return;
      }
    }

    // Within the nutritionist application you can declare you're a Registered
    // Dietitian (RD/RDN). The provider rails stay 'nutritionist' (same discipline +
    // write path); nutrition_role + credential ride in details so the reviewer sets
    // profiles.role='dietitian' + the RD credential at setup.
    const isDietitian = role === "nutritionist" && /dietitian/i.test(values.nutritionType || "");
    const form = new FormData();
    form.append("providerType", role);
    form.append("firstName", values.firstName || "");
    form.append("lastName", values.lastName || "");
    form.append("email", values.email || "");
    form.append("phone", values.phone || "");
    form.append("location", values.city || "");
    form.append("specialty", values.primary || "");
    form.append("yearsExperience", values.years || "");
    form.append("monthlyPrice", values.subPrice || "");
    form.append("details", JSON.stringify({
      username: values.username || "",
      timezone: values.tz || "",
      social: values.social || "",
      bio: values.bio || "",
      nutrition_role: role === "nutritionist" ? (isDietitian ? "dietitian" : "nutritionist") : undefined,
      credential: isDietitian ? (values.rdCredential === "rdn" ? "rdn" : "rd") : undefined,
      certification: values.cert || "",
      certification_expiration: values.certExp || "",
      education: values.edu || "",
      // NC1 — structured nutrition-compliance capture (the reviewer seeds
      // provider_credentials + provider_licenses from this).
      ...(role === "nutritionist" ? {
        cdr_id: values.cdrId || "",
        state_licenses: (values.licenses || [])
          .filter(l => l && /^[A-Za-z]{2}$/.test((l.state || "").trim()))
          .map(l => ({ state: (l.state || "").toUpperCase(), number: l.number || "", expires: l.expires || "" })),
        insurance_carrier: values.insCarrier || "",
        insurance_policy: values.insPolicy || "",
        insurance_expires: values.insExpires || "",
        compliance_attestations: values.attest || {},
      } : {}),
      insurance_status: values.insurance || "",
      previous_platforms: values.prev || "",
      response_time: values.response || "",
      single_session_price: values.sessionPrice || "",
      professional_minimum_years: 7,
      background_check_provider: "checkr",
      background_check_required: true,
      background_check_consent: true,
      background_check_status: "consent_received",
    }));
    if (values.resumeFile) form.append("resume", values.resumeFile);
    if (values.credentialFile) form.append("credential", values.credentialFile);
    if (values.insuranceFile) form.append("insurance", values.insuranceFile);

    setSubmitting(true);
    try {
      const res = await fetch("/api/apply", { method: "POST", body: form });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not submit application.");
      setDone(true);
    } catch (err) {
      setError(err?.message || "Could not submit application.");
    } finally {
      setSubmitting(false);
    }
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

      {error && <div style={{ marginTop: 18, color: "#ff7b6e", fontFamily: sans, fontSize: 13 }}>{error}</div>}

      {/* Turnstile bot challenge — client signup's final step only. If it can't
          load, submit is blocked with a retry notice (Auth CAPTCHA rejects a
          tokenless signUp, so falling open would only hit a server rejection). */}
      {captchaVisible ? (
        <div style={{ marginTop: 18 }}>
          <div ref={captchaRef} style={{ minHeight: captchaUnavailable ? 0 : 65, display: captchaUnavailable ? "none" : "block" }} />
          {captchaUnavailable ? (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.06em", color: "rgba(242,237,228,0.5)" }}>Couldn't load the human-check. Refresh the page or disable any blockers, then try again.</div>
          ) : null}
        </div>
      ) : null}

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
          onClick={() => isLast ? submitApplication() : setStep(step + 1)}
          disabled={submitting}
          style={{ padding: "14px 24px", borderRadius: 8, background: INK, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          {submitting ? "Submitting..." : isLast ? cfg.submitLabel : "Continue"}
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
      <header style={{ padding: "24px 72px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="Landing.html" aria-label="Shape" style={{ flex: "none", display: "inline-flex" }}><Logo variant="white" size={50} /></a>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <span style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.55)" }}>Already have an account?</span>
            <a href="Login.html" style={{ fontFamily: sans, fontSize: 13, color: INK, fontWeight: 500, borderBottom: `1.5px solid ${TEAL}`, paddingBottom: 3 }}>Log in</a>
          </div>
        </div>
      </header>

      <main style={{ padding: "60px 72px 80px" }}>
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
              <a href="Landing.html" style={{ color: "rgba(242,237,228,0.55)" }}>← Back to profile selection</a>
            </div>
          </aside>

          {/* Right — form */}
          <div><SignupForm role={role} /></div>
        </div>
      </main>

      <footer style={{ padding: "30px 72px", borderTop: "1px solid rgba(242,237,228,0.08)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <span>© 2026 Shape</span>
          <div style={{ display: "flex", gap: 24 }}>
            <a href="/privacy">Privacy</a><a href="/terms">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Determine role: prefer window.__SIGNUP_ROLE (set by HTML), then ?role=, then default client.
const role = window.__SIGNUP_ROLE || new URLSearchParams(window.location.search).get("role") || "client";
ReactDOM.createRoot(document.getElementById("root")).render(<SignupPage role={role} />);
