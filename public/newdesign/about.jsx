// About page — "The Note" (owner pick, 2026-09-16, off
// docs/REVIEW-2026-09-15-about-and-kitchen.md and the concept board's A5 tab).
// A short note from the founder, then the door: an eyebrow, one headline that is
// the belief the company is built on, three sentences from the letter each on
// its own line, signed. Under it the four facts as one line and the two doors.
// The whole letter — verbatim, drop cap and pull-quotes intact — and the
// approved bio sit behind one closed line under the signature.
//
// ⚠ THERE IS NO PORTRAIT ON THIS PAGE, ON EITHER SURFACE. Owner, 2026-09-16:
// "remove my picture from the about pages on both website and app". That
// RETIRES the 2026-08-28 founder-card ruling (#1945), which had moved the
// portrait to the page bottom as the letter's sign-off; the signed name stays
// and carries the sign-off alone. `founder.webp` is deleted from both trees —
// tests/about-note.test.mjs fails if any surface reaches for it again.
//
// ⚠ EVERY SENTENCE ON SCREEN ONE IS ALREADY-APPROVED COPY. The headline is the
// belief from the founder bio; the three lines are the letter's own closing
// sentences and the idea section's closer, unchanged. Only the facts line is
// newly composed, and each of its four facts is checked below.

// ── Palette + type (page-local; the shell tokens stay the site's dark ones) ──
// ⚠ NOT pageShell's module-scope `serif`/`sans`/`mono`: the shared chrome reads
// those on ~70 pages, so re-pointing them from here would re-typeset the site.
// About.html keeps the chrome's three families in its font link and adds these.
const AN_PAPER = "#f4f1ea";
const AN_PAPER2 = "#ffffff";
const AN_INK = "#14171c";
const AN_INK2 = "rgba(20,23,28,0.72)";
const AN_INK3 = "rgba(20,23,28,0.5)";
const AN_LINE = "rgba(20,23,28,0.12)";
const AN_TEAL = "#0a8f87";
// Same stacks as recipesPage.jsx / coaches.jsx; the metrics-matched fallbacks
// are declared in About.html's <style>, so a blocked font host still lays out.
const anDisp = "'Anybody', 'Anybody Fallback', system-ui, sans-serif";
const anNum = "'Doto', 'Doto Fallback', ui-monospace, monospace";
const anSans = "'Schibsted Grotesk', 'Schibsted Fallback', 'Space Grotesk', system-ui, sans-serif";

// The letter, verbatim — the same seven paragraphs and two pull-quotes the app
// renders from `settings:aboutPage.letter.*`. It is the page's long form, one
// tap below the signature, so the note stays 80 words and nothing is lost.
const AN_LETTER_HEAD = ["Fitness", " is the entry point. Your ", "lifestyle", " is the goal."];
const AN_LETTER = [
  { kind: "p", drop: true, text: "Shape is about exactly what its name suggests — shaping your life into what you want it to be. Your routines, your sleep, what you cook, the music that moves you, how you talk to yourself on hard days, the people you spend Saturday with. We built Shape to be the place where you can work on all of it, on your own terms." },
  { kind: "p", text: "It starts with a coach. Having great ones shouldn't be a luxury. Most apps replace them with chatbots; most gyms gate the good ones behind packages. We thought there was a better way: open the door for trainers, nutritionists, and registered dietitians who actually care, and make that level of guidance affordable for the rest of us." },
  { kind: "p", text: "Shape builds the loop around all of it. Your trainer programs your week before you arrive — every set, every tempo, every cue loaded the night before so you're never standing at the rack wondering what's next. Your nutritionist builds a meal plan around your specific goals — whether that's hitting a macro target, managing a dietary restriction, building around a health condition, or just eating better — and that plan turns into a grocery list you can actually shop from." },
  { kind: "p", text: "As you show up — day after day, workout after workout, habit after habit — your Shape Score rises with you. It tracks your consistency, rewards your effort, and reflects the status you've actually earned." },
  { kind: "pull", text: "Not a vanity metric. ", accent: "A mirror." },
  { kind: "p", text: "There's also a place to write down what you're shaping toward — strength, sleep, calm, confidence, a marathon, a specific body composition goal, just feeling like yourself again. Structure when you need it. Discipline you build, not something handed down." },
  { kind: "p", text: "And then there's the part no app gets right: the community. You can keep your journey private — or share it. What you cooked, what your nutritionist recommended this week, what you lifted, what your coach said. Tips, recipes, nutrition advice, coaches and dietitians worth trying. A whole feed of people figuring out the same things you are." },
  { kind: "pull", text: "The community isn't a forum. It's the people in your loop." },
  { kind: "p", text: "Shape is the place where you find the coach, build the habits, earn your score, hear the music, and meet the people. The rest is just showing up." },
];

// ⚠ EVERY FACT IS CHECKED AGAINST WHAT THE PRODUCT ACTUALLY DOES, because a
// one-line strip of four claims is the easiest place on the site to state one
// nobody measured.
//   · $5/mo is the shipped platform fee (Pricing.html, the app's BSPricingPage).
//   · Free for coaches is the owner's 2026-09-14 ruling, and the Coaches page's
//     own "$0 to join".
//   · "Coach credentials checked", NOT "every coach verified": the marketplace's ✓ Verified badge
//     renders PER COACH (`c.verified &&`), so "every coach verified" would
//     contradict the surface it points at. Intake credential-checking is what
//     coaches.jsx claims for all of them — "Every coach credential-checked on
//     intake" — so that is the claim repeated here.
//   · 13 languages is the locale count in mobile-app/src/i18n/catalogs.
// ⚠ THE PAGE'S COPY LIVES IN ONE OBJECT SO IT CAN BE COMPARED, NOT SCRAPED.
// The app renders the same sentences from `settings:aboutPage.*`, and
// tests/about-note.test.mjs asserts every value here equals its `en` catalog
// value — so the two surfaces cannot drift into two different About pages, which
// is what happened to the letter and the bio before they were keyed.
const AN_NOTE = {
  eyebrow: "From the founder",
  head: "Great coaching shouldn\u2019t be a luxury.",
  lines: [
    "Shape is the place where you find the coach, build the habits, earn your score, hear the music, and meet the people.",
    "Coaches bring the people. The people build the place.",
    "The rest is just showing up.",
  ],
  sigName: "\u2014 Christopher Perry",
  sigRole: "Founder \u00b7 Shape",
  letterOpen: "The whole letter",
  letterMins: "4 min",
  bioLabel: "About the founder",
  bio: "Christopher spent a decade in finance \u2014 building relationships, helping grow businesses, and always knowing that one day he\u2019d build and run his own. A lifelong athlete with marathons and an Ironman behind him, he turned that drive toward his real passion: health and fitness. Shape is built on a simple belief \u2014 great coaching shouldn\u2019t be a luxury or unaffordable, and shouldn\u2019t mean doing it alone. It\u2019s the best platform he could make for personal coaching and sharing the journey: a true community, built to help you shape your life how you want it.",
};

// ⚠ EVERY FACT IS CHECKED AGAINST WHAT THE PRODUCT ACTUALLY DOES, AND TWO OF
// THESE FOUR WERE MEASURED WRONG THE FIRST TIME.
//
// The credentials fact is SCOPED TO THE BADGE, because the app's own Terms say
// the opposite of a blanket claim in as many words: "Unless a coach shows a
// Verified badge, the credentials on their profile are self-reported and not
// independently verified by Shape" (BSTermsPage clause 04,
// mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx). This read "Coach
// credentials checked", reasoned from the ✓ Verified badge in marketplace.jsx
// rendering PER COACH — which refutes the blanket claim rather than supporting
// it: a conditional badge IS the evidence that not every coach was checked.
// ⚠ REGISTERED, NOT FIXED: shared.jsx's FAQ still says "Every coach is vetted
// … We verify licenses on application and re-check annually", which contradicts
// those Terms. It pre-dates this page; the Terms are the operative document, so
// a NEW claim follows them rather than the FAQ.
//
// And the coach price says what is free. "Free for coaches" beside "$5 a month
// for members" reads as a price comparison and states the wrong half of it:
// coaches pay a 15% platform fee on what clients pay them (PLATFORM_FEE_RATE,
// src/lib/platform-fee.ts), which coaches.jsx states beside its own "$0 to join
// and list". "Join" is the qualifier the owner's 2026-09-14 ruling carried and
// this had dropped.
const AN_FACTS = ["$5 a month for members", "Coaches join free", "Verified coaches carry a badge", "13 languages"];

function AboutNote() {
  const [open, setOpen] = React.useState(false);
  const line = { fontFamily: anSans, fontSize: 20, lineHeight: 1.5, color: AN_INK2, margin: "22px auto 0", maxWidth: "36ch" };
  const para = { fontFamily: anSans, fontSize: 17, lineHeight: 1.7, color: AN_INK2, margin: "0 0 18px" };
  return (
    <section style={{ padding: "64px 0 0", textAlign: "center" }}>
      <div style={{ fontFamily: anNum, fontWeight: 700, fontVariationSettings: "'ROND' 30", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: AN_TEAL }}>{AN_NOTE.eyebrow}</div>
      <h1 style={{ fontFamily: anDisp, fontWeight: 500, fontVariationSettings: "'wdth' 100", fontSize: "clamp(30px, 4.6vw, 46px)", letterSpacing: "-0.015em", lineHeight: 1.04, margin: "12px auto 0", maxWidth: "16ch", color: AN_INK }}>
        {AN_NOTE.head}
      </h1>
      {AN_NOTE.lines.map((l, i) => (
        <p key={i} style={i === 0 ? line : { ...line, marginTop: 14 }}>{l}</p>
      ))}
      {/* ⚠ THE SIGNED NAME IS DELIBERATELY NOT TRANSLATED AND NOT KEYED on the
          app either: a real person's name, which no locale changes. The role
          line under it is `settings:aboutPage.founderRole` over there. */}
      <div style={{ marginTop: 22, fontFamily: anDisp, fontWeight: 500, fontVariationSettings: "'wdth' 96", fontSize: 17, color: AN_INK }}>{AN_NOTE.sigName}</div>
      <div style={{ marginTop: 6, fontFamily: anNum, fontWeight: 700, fontVariationSettings: "'ROND' 30", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: AN_TEAL }}>{AN_NOTE.sigRole}</div>

      {/* The long form, one closed line. The letter is the page's own history and
          is kept WHOLE and verbatim; the approved bio follows it under its own
          label, because a bio is not part of the letter. */}
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ display: "inline-flex", alignItems: "baseline", gap: 10, background: "transparent", border: 0, padding: "10px 12px", cursor: "pointer", fontFamily: anSans, fontSize: 14.5, fontWeight: 600, color: AN_TEAL }}
        >
          {AN_NOTE.letterOpen}
          <span style={{ fontFamily: anNum, fontWeight: 700, fontVariationSettings: "'ROND' 30", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: AN_INK3 }}>{AN_NOTE.letterMins} {open ? "▴" : "▾"}</span>
        </button>
        {open && (
          <div style={{ textAlign: "left", maxWidth: "62ch", margin: "22px auto 0" }}>
            <h2 style={{ fontFamily: anDisp, fontWeight: 500, fontVariationSettings: "'wdth' 100", fontSize: 26, letterSpacing: "-0.015em", lineHeight: 1.15, margin: "0 0 26px", color: AN_INK }}>
              <em style={{ fontStyle: "normal", color: AN_TEAL }}>{AN_LETTER_HEAD[0]}</em>{AN_LETTER_HEAD[1]}<em style={{ fontStyle: "normal", color: AN_TEAL }}>{AN_LETTER_HEAD[2]}</em>{AN_LETTER_HEAD[3]}
            </h2>
            {AN_LETTER.map((b, i) => b.kind === "pull" ? (
              <div key={i} style={{ borderLeft: `3px solid ${AN_TEAL}`, padding: "4px 0 4px 20px", margin: "26px 0", fontFamily: anDisp, fontWeight: 500, fontVariationSettings: "'wdth' 100", fontSize: 24, lineHeight: 1.25, letterSpacing: "-0.01em", color: AN_INK }}>
                {b.text}{b.accent && <em style={{ fontStyle: "normal", color: AN_TEAL }}>{b.accent}</em>}
              </div>
            ) : (
              <p key={i} style={para}>
                {/* Codepoint-safe drop cap: [...s][0] walks codepoints where
                    charAt(0) would split a surrogate pair in half. */}
                {b.drop
                  ? <><span style={{ float: "left", fontFamily: anDisp, fontWeight: 500, fontVariationSettings: "'wdth' 90", fontSize: 62, lineHeight: 0.82, color: AN_TEAL, padding: "6px 12px 0 0" }}>{[...b.text][0]}</span>{[...b.text].slice(1).join("")}</>
                  : b.text}
              </p>
            ))}
            <div style={{ marginTop: 30, paddingTop: 22, borderTop: `1px solid ${AN_LINE}` }}>
              <div style={{ fontFamily: anNum, fontWeight: 700, fontVariationSettings: "'ROND' 30", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: AN_TEAL, marginBottom: 12 }}>{AN_NOTE.bioLabel}</div>
              <p style={{ ...para, marginBottom: 0 }}>{AN_NOTE.bio}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AboutFacts() {
  return (
    // ⚠ FLEX-WRAP, NOT A TEXT LINE. JSX strips the newline between two adjacent
    // elements, so rendering the facts and their separators as inline spans left the
    // whole strip ONE unbreakable line: measured at 715px of content in a 280px box
    // at 320px wide, overflowing at every width under ~715. It read clean because
    // `document.documentElement.scrollWidth` does not report it — only the strip's own
    // scrollWidth and `document.body.scrollWidth` (735) did. Each fact is its own flex
    // item now, and NOTHING is `nowrap`: a locale whose fact is longer than the column
    // must wrap inside itself rather than push the page sideways.
    <div style={{ margin: "40px 0 0", padding: "16px 0", borderTop: `1px solid ${AN_LINE}`, borderBottom: `1px solid ${AN_LINE}`, display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline", columnGap: 10, rowGap: 2, fontFamily: anNum, fontWeight: 700, fontVariationSettings: "'ROND' 30", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: AN_INK2, lineHeight: 1.9 }}>
      {AN_FACTS.map((f, i) => (
        <React.Fragment key={f}>
          {i > 0 && <span aria-hidden style={{ color: AN_INK3 }}>·</span>}
          <span>{f}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// Two doors, one per audience — the page's close. Both are real destinations:
// GetApp.html is the member walkthrough, Coaches.html the coach-facing page.
function AboutDoors() {
  const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "13px 22px", borderRadius: 6, fontFamily: anSans, fontSize: 14, fontWeight: 600, textDecoration: "none", border: `1px solid ${AN_TEAL}`, whiteSpace: "nowrap" };
  return (
    <div className="about-doors" style={{ display: "flex", justifyContent: "center", gap: 12, padding: "26px 0 64px" }}>
      <a href="/newdesign/GetApp.html" style={{ ...base, background: AN_TEAL, color: AN_PAPER2 }}>Get the app →</a>
      <a href="/newdesign/Coaches.html" style={{ ...base, color: AN_TEAL }}>Become a coach →</a>
    </div>
  );
}

function AboutPage() {
  return (
    <div style={{ background: AN_PAPER, color: AN_INK, fontFamily: anSans, minHeight: "100vh" }}>
      <style>{`
        @media (max-width: 720px) {
          .about-wrap { padding: 0 20px !important; }
          .about-doors { display: grid !important; grid-template-columns: 1fr; }
        }
      `}</style>
      <Header active="About" />
      <div className="about-wrap" style={{ maxWidth: 720, margin: "0 auto", padding: "0 48px" }}>
        <AboutNote />
        <AboutFacts />
        <AboutDoors />
      </div>
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AboutPage />);
