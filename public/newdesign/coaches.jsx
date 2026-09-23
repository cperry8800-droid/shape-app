// ── The Coaches page ────────────────────────────────────────────────────────
// One page for trainers AND nutritionists, built from the approved preview
// (docs/BUILD-2026-09-14-website-nav-and-coaches-page.md §3). The nav's Coaches
// points here; `Coach.html` and `Nutritionist.html` stay live behind the footer.
//
// ⚠ ITS SUBJECT IS THE DASHBOARD, and that is the owner's ask in as many words:
// "i want a preview of that new page giving previews of the coaches dashboard
// they will have access to and use once an account is created". So the hero is a
// real capture rather than an illustration, and the tour below it is EVERY page
// of the coach dashboard but Settings, per role, in the sidebar's own order.
// Owner, 2026-09-14: "include previews of all of these, not just a few of the
// ones you have already" (the sidebar, in a screenshot) · "but not settings".
// `tests/coaches-page.test.mjs` derives that list from `coachNav.jsx`, so a tab
// added to the dashboard fails there until it has a frame here.
//
// ⚠ AND THE PREVIEW THEY CAME FROM IS THE ONE THE GATE CLOSED, so a re-capture
// cannot fulfil `/api/me` with `{user:null}` any more: that is a MEASURED
// signed-out visitor, and the shells send one to Login.html — the whole point.
// The recipe is one status code different: fulfil `/api/me` with
// `503 {user:null, unknown:true}`, the route's own indeterminate state, which the
// gate deliberately fails open on and every other caller draws the signed-out
// chrome for. Same demo practice, same sidebar, no redirect — the twelve frames
// added on 2026-09-14 were shot that way and are pixel-consistent with the ten
// shot before the gate existed. The next person to fulfil `{user:null}` will
// read the redirect as the harness being broken; it is the gate working.
//
// Captures refreshed 2026-09-23 from the current trainer and nutritionist apps,
// using their signed-out demo practice and default light appearance. A local
// static server leaves /api/me unavailable, so the existing preview fallback
// renders; no production session or client data is used. Capture at 1440x900,
// hide the site header, global chat button and fixed preview banner, and move
// main up by the header's 72px. Keep the sidebar and dashboard controls intact.
// Wait for the page and its widgets to paint before capturing. Browser captures
// are normalized to 1440x900 JPEGs; CoFrame retains its 40px bottom crop.
// Restore all temporary capture styles before committing. The in-frame example
// label below remains visible in the public tour.
//
// ⚠ EVERY FRAME IS LABELLED "EXAMPLE ACCOUNT", IN THE FRAME ITSELF. These are
// captures of the signed-out demo practice — real screens, invented numbers. An
// unlabelled picture of invented figures on a marketing page is the honest-data
// defect this repo post-mortems repeatedly, and a caption further down the page
// is not the same thing as a mark on the picture.
//
// ⚠ AND THERE ARE NO TIMING PROMISES ANYWHERE ON IT. Owner: "remove the from
// application to first client in under 2 weeks. dont want to guarantee anything
// like that yet." The same promise is removed from `coach.jsx` and
// `nutritionist.jsx` in this PR, or the site contradicts itself.
const { useState: useCoS } = React;

const CO_TEAL = "#34d6c5";
const CO_INK = "#eef3f0";
const CO_WARM = "#ffb454";
const coSans = "'Schibsted Grotesk', 'Schibsted Fallback', 'Space Grotesk', system-ui, sans-serif";
const coDisp = "'Anybody', 'Anybody Fallback', system-ui, sans-serif";
const coNum = "'Doto', 'Doto Fallback', ui-monospace, monospace";

// The dashboard's pages, per role, in the sidebar's own order (`coachNav.jsx`),
// Settings excluded by owner ruling. `file` differs where the role's own tab
// does: a trainer writes Programs, a nutritionist writes Plans.
const CO_TOUR = {
  trainer: {
    label: "Trainer",
    tabs: [
      { key: "today", file: "today", name: "Today",
        body: "The day at a glance: your balance and next payout, today's sessions, the programs that are due, roster compliance, and client attention that says who needs eyes first.",
        list: ["Sessions today, with the next one marked", "Programs due, and how many are ready", "Joint-attention flags shared with the client's other coach", "Message any client from the row"] },
      { key: "week", file: "week", name: "Week",
        body: "The end-of-week review. Every client, one row: their check-in ratings, the win and the struggle they wrote, what they asked you, adherence against the week before, food logs and the weigh-in. Tick each one as you go, or close the week in one go.",
        list: ["Ratings, win, struggle and the question they asked you", "Adherence, food logs and weigh-in against the week before", "Message or leave a note from the row", "Mark all reviewed in one tap"] },
      { key: "schedule", file: "schedule", name: "Schedule",
        body: "Your week and your month. Clients book inside Shape; the calendar syncs both ways with Google, Apple and Outlook, with reminders and reschedule rules handled for you.",
        list: ["Week and month views", "Two-way calendar sync", "Open hours you set once, in your own time zone", "No-show and reschedule handling"] },
      { key: "clients", file: "clients", name: "Clients",
        body: "One roster, one view: streaks, weekly score, adherence, last food log, last contact, revenue and tenure. Sort by whatever you care about today and open any client's full file.",
        list: ["Sort every column that has a value behind it", "Needs-eyes, new and on-track filters", "Each client's file one click away", "Export the roster as a spreadsheet"] },
      { key: "programs", file: "programs", name: "Programs",
        body: "Blocks, sessions, sets, reps, RPE and tempo, with autoregulation built in. Write a block once and clone it to a new client in one click.",
        list: ["Program templates by goal phase", "Who needs a program next", "Assign pre-fills the queue", "Publish a whole week at once"] },
      { key: "business", file: "business", name: "Business",
        body: "The money side, told straight: subscription revenue, payouts, the marketplace funnel and who left.",
        list: ["Active clients, joined vs left, revenue over time", "Monthly recurring, net after the platform fee", "Churn and median tenure", "A CSV for your accountant"] },
      { key: "playlists", file: "playlists", name: "Playlists",
        body: "Paste a Spotify or Apple Music link, attach it to a workout, and your client gets a play button on the session card. Optional, always skippable.",
        list: ["A library of your playlists, with BPM range and length", "Attach matrix: assign playlists to workouts in bulk", "Builder: deep-edit tracks and notes", "Listens per playlist, and what you've shared"] },
      { key: "goal", file: "goal", name: "Goal",
        body: "Your own targets for the quarter — clients, revenue, programs, adherence — each with a progress bar and the pace that gets it there. A revenue calculator turns your rate, hours and program sales into take-home.",
        list: ["Client, revenue, program and adherence goals", "Progress and pace against the date", "Session rate × sessions, plus subscriptions and one-time sales", "Weekly, monthly, quarterly and annual take-home, net of the platform fee"] },
      { key: "score", file: "score", name: "Score",
        body: "Your coach score, added up from active clients, adherence, session completion, client PRs, programs published and reviews. It drives marketplace ranking and the verified badge.",
        list: ["Five tiers, Certified to Icon", "A breakdown of what earns the points", "What your tier unlocks", "A leaderboard and how it works"] },
      { key: "profile", file: "profile", name: "Profile",
        body: "The profile clients see on the marketplace: your credentials, coaching philosophy, Shape score and streak, availability with a book-a-consult button, and your activity, reviews and music underneath.",
        list: ["Credentials, philosophy and where you coach", "Availability, and a button to book a consult", "Activity, about, coaching, reviews and music", "Followers, following and posts"] },
    ],
  },
  nutri: {
    label: "Nutritionist",
    tabs: [
      { key: "today", file: "today", name: "Today",
        body: "The day at a glance: your balance and next payout, today's consults, the plans that are due, food-log compliance across the roster, and client attention that says who needs eyes first.",
        list: ["Consults today, with the next one marked", "Plans due, and how many are ready", "Joint-attention flags shared with the client's trainer", "Message any client from the row"] },
      { key: "week", file: "week", name: "Week",
        body: "The end-of-week review. Every client, one row: their check-in ratings, the win and the struggle they wrote, what they asked you, adherence against the week before, food logs and the weigh-in. Tick each one as you go, or close the week in one go.",
        list: ["Ratings, win, struggle and the question they asked you", "Adherence, food logs and weigh-in against the week before", "Message or leave a note from the row", "Mark all reviewed in one tap"] },
      { key: "schedule", file: "schedule", name: "Schedule",
        body: "Your week and your month. Clients book 20-minute check-ins or 60-minute consults inside Shape; the calendar syncs both ways with Google, Apple and Outlook.",
        list: ["Week and month views", "Two-way calendar sync", "Open hours you set once, in your own time zone", "Intake forms before the first consult"] },
      { key: "clients", file: "clients", name: "Clients",
        body: "One roster, one view: adherence, last food log, last consult, weight trend, revenue and tenure. Filter by specialty or protocol and open any client's full file.",
        list: ["Sort every column that has a value behind it", "Needs-eyes, new and on-track filters", "Each client's file one click away", "Export the roster as a spreadsheet"] },
      { key: "programs", file: "plans", name: "Plans",
        body: "Macro targets, swap rules and grocery lists that generate themselves. Save any plan as a template and reuse it across clients; the lifecycle view says who needs a plan next.",
        list: ["Plan templates by goal phase", "Expiring this week, ready for a phase change", "Assign pre-fills the plan queue", "Intake pending, so nothing is written blind"] },
      { key: "business", file: "business", name: "Business",
        body: "The money side, told straight: subscription revenue, payouts, the marketplace funnel and who left.",
        list: ["Active clients, joined vs left, revenue over time", "Monthly recurring, net after the platform fee", "Churn and median tenure", "A CSV for your accountant"] },
      { key: "playlists", file: "playlists", name: "Playlists",
        body: "Paste a Spotify or Apple Music link, attach it to a meal, recipe or prep routine, and your client gets a play button in their kitchen. Optional, always skippable.",
        list: ["A library of your playlists, with BPM range and length", "Attach matrix: assign playlists to meals in bulk", "Builder: deep-edit tracks and notes", "Listens per playlist, and what you've shared"] },
      { key: "goal", file: "goal", name: "Goal",
        body: "Your own targets for the quarter — clients, revenue, plans, adherence — each with a progress bar and the pace that gets it there. A revenue calculator turns your consult rate, consults and meal-plan subscribers into take-home.",
        list: ["Client, revenue, plan and adherence goals", "Progress and pace against the date", "Consult rate × consults, plus meal-plan subscriptions", "Weekly, monthly, quarterly and annual take-home, net of the platform fee"] },
      { key: "score", file: "score", name: "Score",
        body: "Your coach score, added up from active clients, log adherence, client body-composition wins, plans published, reviews and the Radio rooms you host. It drives marketplace ranking and the verified badge.",
        list: ["Five tiers, Certified to Icon", "A breakdown of what earns the points", "What your tier unlocks", "A leaderboard and how it works"] },
      { key: "profile", file: "profile", name: "Profile",
        body: "The profile clients see on the marketplace: your credentials, practice philosophy, Shape score and streak, availability with a book-a-consult button, and your activity, reviews and music underneath.",
        list: ["Credentials, philosophy and where you practise", "Availability, and a button to book a consult", "Activity, about, coaching, reviews and music", "Followers, following and posts"] },
    ],
  },
};

// ⚠ THE FRAME CARRIES ITS OWN LABEL. Not a caption under the picture — a mark on
// it, so the claim travels with the image wherever it is seen.
function CoFrame({ role, tab, style = {} }) {
  const src = `/newdesign/coaches/coaches-dash-${role}-${tab.file}.jpg?v=20260923`;
  return (
    <div style={{ border: "1px solid rgba(238,243,240,0.10)", borderRadius: 10, background: "#0a0f17", boxShadow: "0 40px 90px rgba(0,0,0,0.55)", overflow: "hidden", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 34, padding: "0 12px", borderBottom: "1px solid rgba(238,243,240,0.055)", background: "rgba(255,255,255,0.02)" }}>
        <span aria-hidden style={{ display: "flex", gap: 5 }}>
          {[0, 1, 2].map((i) => <i key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: "rgba(238,243,240,0.14)", display: "block" }} />)}
        </span>
        <span style={{ fontFamily: coDisp, fontWeight: 500, fontVariationSettings: "'wdth' 130", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(238,243,240,0.55)", marginLeft: 6 }}>
          {tab.name} · {CO_TOUR[role].label}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: coNum, fontWeight: 700, fontVariationSettings: "'ROND' 30", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: CO_WARM }}>Example account</span>
      </div>
      <div style={{ position: "relative", aspectRatio: "1440 / 860", overflow: "hidden", background: "#1a1612" }}>
        <img src={src} width="1440" height="860" loading="lazy"
          alt={`The ${CO_TOUR[role].label.toLowerCase()} dashboard's ${tab.name} page, filled with an example practice`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top left", display: "block" }} />
      </div>
    </div>
  );
}

function CoHero({ role, setRole }) {
  const today = CO_TOUR[role].tabs[0];
  return (
    <header style={{ position: "relative", padding: "72px 0 40px", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", inset: "auto -10% -40% auto", width: "60vw", height: "60vw", maxWidth: 900, maxHeight: 900, borderRadius: "50%", filter: "blur(90px)", opacity: 0.22, background: `radial-gradient(circle, ${CO_TEAL}, transparent 68%)`, pointerEvents: "none" }} />
      <div className="co-wrap co-hgrid" style={{ position: "relative" }}>
        <div>
          <div style={{ fontFamily: coNum, fontWeight: 700, fontVariationSettings: "'ROND' 30", fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: CO_TEAL }}>For trainers and nutritionists</div>
          <h1 style={{ fontFamily: coDisp, fontWeight: 500, fontVariationSettings: "'wdth' 90", fontSize: "clamp(42px, 5vw, 74px)", lineHeight: 0.98, letterSpacing: "-0.01em", margin: "14px 0 0", textWrap: "balance" }}>
            Run your whole practice <em style={{ fontStyle: "normal", color: CO_TEAL }}>from one screen.</em>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: "rgba(238,243,240,0.72)", margin: "26px 0 0", maxWidth: "52ch" }}>
            Today's sessions, every client's week, the programs you write and the money you make. The dashboard is yours once your account is approved. No monthly dues; Shape takes a 15% platform fee only when you get paid.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 34, alignItems: "center" }}>
            <a className="co-btn co-btn-p" href="SignupTrainer.html">Apply as a trainer</a>
            <a className="co-btn co-btn-g" href="SignupNutritionist.html">Apply as a nutritionist</a>
            <a href="Marketplace.html" style={{ color: CO_TEAL, fontWeight: 600, fontSize: 14, marginLeft: 6 }}>See coaches on Shape →</a>
          </div>
        </div>
        <CoFrame role={role} tab={today} />
      </div>
    </header>
  );
}

function CoFacts() {
  // ⚠ ALL FOUR FIGURES ARE SET IN THE DISPLAY FACE, NOT THE DOT-MATRIX ONE.
  // Owner, 2026-09-14, on a screenshot of this strip: "have the font here match
  // weekly and verified headings". $0 and 15% took the Doto branch — the face
  // this site reserves for a MEASURED reading — while "Weekly" and "Verified"
  // beside them took Anybody, so one four-up row carried two typefaces at two
  // sizes. They are not readings: they are our own stated terms, the same kind
  // of fact as the two words next to them. One style for the row, so the `isNum`
  // branch is gone rather than left with no `true` to take it.
  const facts = [
    ["$0", "To join.", " No monthly dues, no setup fees, no per-booking cuts."],
    ["15%", "Only when you're paid.", " One platform fee on what clients pay you; card processing is separate."],
    ["Weekly", "Payouts direct to your bank.", " Or instant, any day."],
    ["Verified", "Every coach credential-checked on intake.", " CPT, CSCS, RD, RDN, CNS and state licences."],
  ];
  return (
    <section style={{ borderTop: "1px solid rgba(238,243,240,0.055)", borderBottom: "1px solid rgba(238,243,240,0.055)", marginTop: 56 }}>
      <div className="co-wrap co-facts">
        {facts.map(([big, lead, rest]) => (
          <div key={lead} className="co-fact">
            <div style={{ fontFamily: coDisp, fontWeight: 500, fontVariationSettings: "'wdth' 95", fontSize: 34, lineHeight: 1, letterSpacing: "-0.01em", color: CO_INK, paddingTop: 3 }}>{big}</div>
            <div style={{ marginTop: 10, fontSize: 13, color: "rgba(238,243,240,0.72)" }}>
              <b style={{ color: CO_INK, fontWeight: 600 }}>{lead}</b>{rest}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CoTour({ role, setRole }) {
  const [tabKey, setTabKey] = useCoS("today");
  const tabs = CO_TOUR[role].tabs;
  const tab = tabs.find((t) => t.key === tabKey) || tabs[0];
  return (
    <section className="co-s" id="dashboard">
      <div className="co-wrap">
        <div className="co-shead">
          <div>
            <span className="co-eyebrow">The dashboard</span>
            <h2 className="co-h2">What's waiting once your <em>account is created.</em></h2>
            <p style={{ maxWidth: "62ch", color: "rgba(238,243,240,0.72)", fontSize: 15, lineHeight: 1.6 }}>Choose your widgets, drag them into place, and change their widths. Save multiple dashboards with all tabs together, then switch to the view you need.</p>
          </div>
          <div className="co-roles" role="group" aria-label="Show the dashboard for">
            {["trainer", "nutri"].map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r}
                className={role === r ? "co-role on" : "co-role"}>
                {CO_TOUR[r].label}
              </button>
            ))}
          </div>
        </div>
        <div className="co-tabs" role="tablist" aria-label="Dashboard pages">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={t.key === tab.key}
              onClick={() => setTabKey(t.key)} className={t.key === tab.key ? "co-tab on" : "co-tab"}>{t.name}</button>
          ))}
        </div>
        <div className="co-tour">
          <CoFrame role={role} tab={tab} />
          <aside>
            <h3 className="co-h3">{tab.name}</h3>
            <p style={{ fontSize: 15, color: "rgba(238,243,240,0.72)", margin: "10px 0 0" }}>{tab.body}</p>
            <ul className="co-list">{tab.list.map((l) => <li key={l}>{l}</li>)}</ul>
            <div style={{ marginTop: 26, paddingTop: 16, borderTop: "1px solid rgba(238,243,240,0.055)", fontSize: 12.5, color: "rgba(238,243,240,0.55)" }}>
              <b style={{ color: CO_WARM, fontWeight: 600 }}>Example account.</b> These frames show the dashboard filled with an example practice. Yours fills with your own clients.
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

// ⚠ NO TIMINGS. The steps say what happens, not how fast — see the header.
function CoSteps() {
  const steps = [
    ["1", "Apply", "Tell us about your credentials, specialty and how you coach. We verify CPT, CSCS, RD, RDN, CNS or equivalent."],
    ["2", "We review", "Our team reads every application, and licensed dietitians review the nutrition ones. We reach out to learn more, or with an approval."],
    ["3", "Set up your storefront", "Upload your programs or plan templates, set session pricing, connect your calendar, write your bio. We help with the copy."],
    ["4", "Get matched", "Your profile goes live in the marketplace, and new client inquiries land in your inbox."],
  ];
  return (
    <section className="co-s" style={{ paddingTop: 0 }}>
      <div className="co-wrap">
        <div className="co-shead"><div>
          <span className="co-eyebrow">How it works</span>
          <h2 className="co-h2">From application to <em>your first client.</em></h2>
        </div></div>
        <div className="co-steps">
          {steps.map(([n, t, b]) => (
            <div key={n} className="co-step">
              <div style={{ fontFamily: coNum, fontWeight: 900, fontVariationSettings: "'ROND' 100", fontSize: 30, lineHeight: 1, color: CO_TEAL }}>{n}</div>
              <h3 className="co-h3" style={{ margin: "16px 0 8px" }}>{t}</h3>
              <p style={{ fontSize: 14, color: "rgba(238,243,240,0.72)", margin: 0 }}>{b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CoCost() {
  const nums = [["$0", false, "to join and list"], ["15%", true, "platform fee, only on what you're paid"], ["0", false, "exclusivity — coach here, on your own site, anywhere"]];
  return (
    <section className="co-s" style={{ paddingTop: 0 }}>
      <div className="co-wrap">
        <div className="co-cost">
          <div>
            <span className="co-eyebrow">What it costs</span>
            <h2 className="co-h2" style={{ marginTop: 14 }}>You keep what you earn.</h2>
            <p style={{ marginTop: 18, fontSize: 15, color: "rgba(238,243,240,0.72)" }}>
              No monthly dues, no listing fees. Shape takes a 15% platform fee on everything clients pay you, so you only pay when you earn. Standard card processing is separate. Set your own session price, sell programs and plans as one-time purchases or subscriptions, and leave any time with your clients.
            </p>
          </div>
          <div className="co-nums">
            {nums.map(([v, teal, l]) => (
              <div key={l}>
                <div style={{ fontFamily: coNum, fontWeight: 900, fontVariationSettings: "'ROND' 100", fontSize: 56, lineHeight: 1, color: teal ? CO_TEAL : CO_INK }}>{v}</div>
                <div style={{ marginTop: 8, fontSize: 13, color: "rgba(238,243,240,0.55)" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CoFAQ() {
  const qs = [
    ["What credentials do I need?", "Trainers: an accredited personal training certification (NASM, ACE, NSCA, ACSM, NCSF or similar) plus current CPR/AED. Nutritionists: RD, RDN, CNS, CSSD or a state licence. We verify every one on intake."],
    ["What does Shape cost me?", "You keep the vast majority of everything your clients pay you. No monthly dues, no listing fees — Shape takes a 15% platform fee when you get paid. Standard card processing is separate."],
    ["Can I bring my existing clients?", "Yes. Most coaches migrate their book early on, and we help with invitations, transfer flows and pricing continuity."],
    ["Am I locked in?", "No exclusivity. Coach on Shape, on your own site, wherever — it's your business. Leave any time and take your clients with you."],
    ["How do payouts work?", "Direct to your bank on a weekly schedule, or instantly on any day."],
    ["Can I sell programs without sessions?", "Yes. Publish programs or meal plans as one-time purchases or subscriptions. Many coaches earn a large share of their revenue from programs alone."],
  ];
  return (
    <section className="co-s" style={{ paddingTop: 0 }}>
      <div className="co-wrap">
        <div className="co-shead"><div>
          <span className="co-eyebrow">Questions</span>
          <h2 className="co-h2">Everything coaches ask.</h2>
        </div></div>
        <div className="co-faq">
          {qs.map(([q, a], i) => (
            <details key={q} open={i === 0}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CoCTA() {
  return (
    <section className="co-cta">
      <div className="co-wrap">
        <span className="co-eyebrow">Apply now — it's free</span>
        <h2 className="co-h2" style={{ marginTop: 14, fontSize: "clamp(34px, 4.4vw, 62px)" }}>Your practice, with a <em>front office.</em></h2>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12, marginTop: 32 }}>
          <a className="co-btn co-btn-p" href="SignupTrainer.html">Apply as a trainer</a>
          <a className="co-btn co-btn-g" href="SignupNutritionist.html">Apply as a nutritionist</a>
        </div>
        <p style={{ marginTop: 16, fontSize: 14, color: "rgba(238,243,240,0.55)" }}>Your dashboard is waiting once your account is approved.</p>
      </div>
    </section>
  );
}

function CoachesPage() {
  // One role selector drives the hero AND the tour, so the page never shows two
  // practices at once.
  const [role, setRole] = useCoS("trainer");
  return (
    <div style={{ background: "#06090f", color: CO_INK, fontFamily: coSans, minHeight: "100vh" }}>
      <Header active="Coaches" />
      <CoHero role={role} setRole={setRole} />
      <CoFacts />
      <CoTour role={role} setRole={setRole} />
      <CoSteps />
      <CoCost />
      <CoFAQ />
      <CoCTA />
      <Footer />
      <style>{`
        .co-wrap{max-width:1440px;margin:0 auto;padding:0 32px}
        .co-s{padding:96px 0}
        .co-hgrid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1.25fr);gap:56px;align-items:center}
        .co-facts{display:grid;grid-template-columns:repeat(4,1fr)}
        .co-fact{padding:26px 24px 26px 0;border-right:1px solid rgba(238,243,240,0.055)}
        .co-fact:last-child{border-right:0}
        .co-fact + .co-fact{padding-left:24px}
        .co-eyebrow{font-family:${coNum};font-weight:700;font-variation-settings:'ROND' 30;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${CO_TEAL};display:block}
        .co-h2{font-family:${coDisp};font-weight:500;font-variation-settings:'wdth' 90;font-size:clamp(30px,3.4vw,48px);line-height:1.04;letter-spacing:-.01em;margin:6px 0 0;text-wrap:balance}
        .co-h2 em{font-style:normal;color:${CO_TEAL}}
        .co-h3{font-family:${coDisp};font-weight:500;font-variation-settings:'wdth' 100;font-size:18px;margin:0}
        .co-shead{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:16px 40px;margin-bottom:34px}
        .co-btn{display:inline-flex;align-items:center;gap:8px;font-family:${coSans};font-weight:700;font-size:14px;padding:13px 20px;border-radius:6px;border:1px solid transparent;white-space:nowrap;transition:transform .16s,background .16s,border-color .16s}
        .co-btn-p{background:${CO_TEAL};color:#04110f}
        .co-btn-p:hover{transform:translateY(-1px);background:#4ce4d4}
        .co-btn-g{border-color:rgba(238,243,240,0.10);color:${CO_INK};background:rgba(255,255,255,.02)}
        .co-btn-g:hover{border-color:rgba(52,214,197,.5);transform:translateY(-1px)}
        .co-roles{display:inline-flex;border:1px solid rgba(238,243,240,0.10);border-radius:10px;padding:3px;gap:3px;background:rgba(255,255,255,.04)}
        .co-role{font-family:${coSans};font-size:13.5px;font-weight:600;color:rgba(238,243,240,0.72);background:transparent;border:0;border-radius:7px;padding:8px 18px;cursor:pointer;display:inline-flex;align-items:center;transition:background .15s ease,color .15s ease}
        .co-role:hover{color:${CO_INK}}
        .co-role.on{background:rgba(238,243,240,.10);color:${CO_INK}}
        .co-tabs{display:flex;gap:4px;border-bottom:1px solid rgba(238,243,240,0.10);margin-bottom:22px;overflow-x:auto}
        .co-tab{font-family:${coSans};font-size:14px;font-weight:600;color:rgba(238,243,240,0.55);background:transparent;border:0;border-bottom:2px solid transparent;padding:12px 16px 14px;margin-bottom:-1px;cursor:pointer;white-space:nowrap}
        .co-tab:hover{color:${CO_INK}}
        .co-tab.on{color:${CO_INK};border-bottom-color:${CO_TEAL}}
        .co-tour{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:32px;align-items:start}
        .co-list{margin:22px 0 0;padding:0;list-style:none;display:grid;gap:10px}
        .co-list li{display:flex;gap:10px;font-size:14px;color:rgba(238,243,240,0.72)}
        .co-list li::before{content:"";width:6px;height:6px;border-radius:50%;background:${CO_TEAL};flex:0 0 auto;margin-top:8px}
        .co-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(238,243,240,0.055);border:1px solid rgba(238,243,240,0.055);border-radius:8px;overflow:hidden}
        .co-step{background:#06090f;padding:26px 24px 30px}
        .co-cost{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:center;border:1px solid rgba(238,243,240,0.10);border-radius:10px;padding:44px 48px;background:linear-gradient(135deg,rgba(52,214,197,.06),transparent 60%)}
        .co-nums{display:grid;grid-template-columns:1fr 1fr;gap:22px}
        .co-faq{display:grid;grid-template-columns:1fr 1fr;gap:0 48px;border-top:1px solid rgba(238,243,240,0.055)}
        .co-faq details{border-bottom:1px solid rgba(238,243,240,0.055);padding:4px 0}
        .co-faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 0;font-family:${coSans};font-size:16px;font-weight:600;color:${CO_INK}}
        .co-faq summary::-webkit-details-marker{display:none}
        .co-faq summary::after{content:"+";font-family:${coNum};font-weight:700;color:${CO_TEAL};font-size:18px}
        .co-faq details[open] summary::after{content:"−"}
        .co-faq details p{padding:0 0 20px;font-size:14.5px;max-width:60ch;color:rgba(238,243,240,0.72);margin:0}
        .co-cta{text-align:center;padding:96px 0 110px}
        @media (max-width:1100px){
          .co-hgrid{grid-template-columns:1fr;gap:36px}
          .co-tour{grid-template-columns:1fr}
          .co-steps{grid-template-columns:1fr 1fr}
          .co-facts{grid-template-columns:1fr 1fr}
          .co-fact{border-right:0;padding-left:0 !important}
          .co-cost{grid-template-columns:1fr;gap:28px}
        }
        @media (max-width:760px){
          .co-wrap{padding:0 20px}
          .co-s{padding:64px 0}
          .co-steps{grid-template-columns:1fr}
          .co-faq{grid-template-columns:1fr}
          .co-cost{padding:28px 22px}
          .co-nums div div:first-child{font-size:44px}
        }
        @media (prefers-reduced-motion:reduce){ .co-btn{transition:none} }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<CoachesPage />);
