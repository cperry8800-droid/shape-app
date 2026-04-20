// Community page — editorial feed of events, stories, challenges
const { useState: useSC } = React;

const EVENTS = [
  { when: "Apr 22", city: "Brooklyn", title: "Saturday long run", host: "Diego Alvarez", rsvp: 42, cap: 60, tag: "Endurance" },
  { when: "Apr 24", city: "London", title: "Strength cinema — deadlift night", host: "Leo Martins", rsvp: 28, cap: 40, tag: "Strength" },
  { when: "Apr 27", city: "LA", title: "Mobility + mat pilates", host: "Jordan Park", rsvp: 51, cap: 55, tag: "Mobility" },
  { when: "May 02", city: "Austin", title: "Sunrise tempo run · 6k", host: "Diego Alvarez", rsvp: 36, cap: 80, tag: "Endurance" },
  { when: "May 04", city: "Stockholm", title: "Nutrition Q&A · sports fueling", host: "Rae Lindqvist", rsvp: 94, cap: 120, tag: "Nutrition" },
  { when: "May 08", city: "Miami", title: "Open-gym benchmark Saturday", host: "Tomás Reyes", rsvp: 67, cap: 90, tag: "Strength" },
];

const CHALLENGES = [
  { title: "21 Days of Protein", people: 12800, days: "Apr 15 → May 5", tag: "Nutrition", color: TEAL },
  { title: "Marathon Block — Spring", people: 3400, days: "Apr 01 → Jun 10", tag: "Endurance", color: TEAL },
  { title: "Mobility Minutes", people: 9200, days: "Rolling · weekly", tag: "Recovery", color: TEAL },
  { title: "PR or ER · Strength Month", people: 5600, days: "May 01 → May 31", tag: "Strength", color: TEAL_BRIGHT },
];

const STORIES = [
  { who: "Priya S.", line: "Maya read my lifts in the intro. Had a 12-week block by Tuesday.", metric: "+22 lb squat PR", city: "Brooklyn" },
  { who: "Elena R.", line: "Having a real nutritionist in my pocket changed how I eat on the road.", metric: "−14% body fat", city: "London" },
  { who: "Marcus T.", line: "Picked up eleven new clients last quarter — Shape handled billing and scheduling.", metric: "11 new clients / Q", city: "Chicago" },
  { who: "Yuki A.", line: "The community runs kept me honest for six months straight.", metric: "First marathon · 3:54", city: "Austin" },
];

function HeroC() {
  return (
    <section style={{ padding: "120px 40px 80px", position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 28 }}>The community</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 80, alignItems: "end" }}>
          <h1 style={{ fontFamily: serif, fontSize: 128, lineHeight: 0.88, letterSpacing: "-0.035em", fontWeight: 400, margin: 0 }}>
            Train <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>together</em>.<br/>Show up alone.
          </h1>
          <p style={{ fontFamily: sans, fontSize: 18, lineHeight: 1.5, color: "rgba(242,237,228,0.65)", margin: 0, maxWidth: 440 }}>
            Member events, challenges, and stories — the social layer that makes the hard stuff repeatable. Run with people in your city; stay accountable to the ones you don't see.
          </p>
        </div>
      </div>
    </section>
  );
}

function Events() {
  const [city, setCity] = useSC("All cities");
  const cities = ["All cities", ...new Set(EVENTS.map(e => e.city))];
  const list = city === "All cities" ? EVENTS : EVENTS.filter(e => e.city === city);
  return (
    <section id="events" style={{ padding: "80px 40px", borderTop: "1px solid rgba(242,237,228,0.12)", scrollMarginTop: 100 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 40 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>Events · this month</div>
            <h2 style={{ fontFamily: serif, fontSize: 64, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 0.95 }}>
              Find your <em style={{ fontStyle: "italic", color: TEAL }}>people</em>.
            </h2>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 500 }}>
            {cities.map(c => (
              <button key={c} onClick={() => setCity(c)} style={{ padding: "6px 14px", borderRadius: 999, border: city === c ? `1px solid ${INK}` : "1px solid rgba(242,237,228,0.18)", background: city === c ? INK : "transparent", color: city === c ? PAPER : INK, fontFamily: sans, fontSize: 12.5, cursor: "pointer" }}>{c}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {list.map((e, i) => (
            <article key={i} style={{ padding: 28, background: "rgba(242,237,228,0.04)", borderRadius: 10, border: "1px solid rgba(242,237,228,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
                <div style={{ fontFamily: serif, fontSize: 42, letterSpacing: "-0.02em", color: INK, lineHeight: 1 }}>{e.when}</div>
                <span style={{ fontFamily: sans, fontSize: 11, padding: "4px 10px", borderRadius: 999, background: "rgba(30,192,168,0.1)", color: TEAL, letterSpacing: "0.06em" }}>{e.tag}</span>
              </div>
              <h3 style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", fontWeight: 400, color: INK, margin: "0 0 8px", lineHeight: 1.15 }}>{e.title}</h3>
              <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginBottom: 18 }}>{e.city} · hosted by {e.host}</div>
              <div style={{ height: 6, background: "rgba(242,237,228,0.08)", borderRadius: 999, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ width: `${(e.rsvp/e.cap)*100}%`, height: "100%", background: TEAL }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>
                <span>{e.rsvp} / {e.cap} spots</span>
                <a style={{ color: INK, borderBottom: `1px solid ${TEAL}` }}>RSVP →</a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Challenges() {
  return (
    <section style={{ padding: "100px 40px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Challenges · live</div>
          <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 0.95 }}>
            Do it with <em style={{ fontStyle: "italic", color: TEAL }}>everyone</em>.
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          {CHALLENGES.map((c, i) => (
            <article key={i} style={{ padding: 36, background: "rgba(26,22,18,0.04)", borderRadius: 12, border: "1px solid rgba(26,22,18,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20 }}>
                <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: c.color }}>{c.tag}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(26,22,18,0.55)" }}>{c.days}</div>
              </div>
              <h3 style={{ fontFamily: serif, fontSize: 38, letterSpacing: "-0.02em", fontWeight: 400, margin: "0 0 16px", lineHeight: 1 }}>{c.title}</h3>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(26,22,18,0.12)" }}>
                <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(26,22,18,0.75)" }}><b style={{ color: PAPER, fontWeight: 500 }}>{c.people.toLocaleString()}</b> members in</div>
                <button style={{ background: c.color, color: PAPER, border: 0, padding: "10px 18px", borderRadius: 6, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Join →</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stories() {
  return (
    <section style={{ padding: "100px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Stories</div>
        <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 56px", lineHeight: 0.95 }}>
          From the <em style={{ fontStyle: "italic", color: TEAL }}>field</em>.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
          {STORIES.map((s, i) => (
            <article key={i} style={{ padding: 40, background: "rgba(242,237,228,0.04)", borderRadius: 10, borderTop: `3px solid ${TEAL}` }}>
              <p style={{ fontFamily: serif, fontSize: 26, lineHeight: 1.35, fontStyle: "italic", color: INK, margin: 0 }}>"{s.line}"</p>
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(242,237,228,0.1)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                  <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 500, color: INK }}>{s.who}</div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.55)" }}>{s.city}</div>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: TEAL, letterSpacing: "0.04em" }}>{s.metric}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section style={{ padding: "120px 40px", background: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontFamily: serif, fontSize: 120, letterSpacing: "-0.04em", fontWeight: 400, lineHeight: 0.9, margin: "0 0 40px" }}>
          Join the <em style={{ fontStyle: "italic", color: TEAL }}>community</em>.
        </h2>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <a href="Marketplace.html" style={{ background: INK, color: PAPER, border: 0, padding: "16px 28px", borderRadius: 6, fontFamily: sans, fontWeight: 500, fontSize: 15, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>Find your coach →</a>
          <a href="#events" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "16px 28px", borderRadius: 6, fontFamily: sans, fontWeight: 500, fontSize: 15, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>Browse events</a>
        </div>
      </div>
    </section>
  );
}

function Chat() {
  const [tab, setTab] = useSC("community");
  const ROOMS = {
    trainer: {
      label: "Trainer chat",
      sub: "Your trainer · direct",
      header: "Maya Okafor · Strength & Hypertrophy",
      context: "DM · just the two of you · active 2m ago",
      channels: [
        { name: "Maya Okafor", sub: "Coach · 2m", active: true, dm: true },
        { name: "Back-up coverage", sub: "When Maya's out", dm: true },
        { name: "#strength-club", members: 1280 },
        { name: "#form-check", members: 620 },
      ],
      right: "YOUR COACH",
      roster: [["Maya Okafor", "Coach · online", true], ["You", "Member", false]],
      messages: [
        { who: "Maya O.", role: "Coach", init: "MO", time: "8:45", msg: "Video from yesterday's bench looked clean. Elbows tucked, bar path straight up the sternum.", pin: true },
        { who: "You", role: "Member", init: "YO", time: "8:58", msg: "Felt heavier than the number said. Set 3 was a grind." },
        { who: "Maya O.", role: "Coach", init: "MO", time: "9:02", msg: "Expected — this is the overreach week. Push 185 today, deload next week. Ice shoulder tonight.", highlight: true },
        { who: "You", role: "Member", init: "YO", time: "9:04", msg: "Got it. Anything on diet? Been low on sleep." },
        { who: "Maya O.", role: "Coach", init: "MO", time: "9:08", msg: "Looping Rae in on the sleep piece — she'll message you today. Stick to macros, hit bed by 10:30." },
      ],
      placeholder: "Message Maya",
    },
    nutritionist: {
      label: "Nutritionist chat",
      sub: "Your nutritionist · direct",
      header: "Rae Lindqvist · Sports Nutrition",
      context: "DM · weekly review Sunday · active 14m ago",
      channels: [
        { name: "Rae Lindqvist", sub: "Coach · 14m", active: true, dm: true },
        { name: "#plant-based", members: 860 },
        { name: "#gut-health", members: 310 },
        { name: "#race-fueling", members: 540 },
      ],
      right: "YOUR NUTRITIONIST",
      roster: [["Rae Lindqvist", "Coach · online", true], ["You", "Member", false]],
      messages: [
        { who: "Rae L.", role: "Coach", init: "RL", time: "Mon", msg: "Logged week looks solid. Protein average 168g · carbs came in short on long-run day.", pin: true },
        { who: "You", role: "Member", init: "YO", time: "Tue", msg: "Thanks — I keep forgetting to refuel right after the run. What should I reach for?" },
        { who: "Rae L.", role: "Coach", init: "RL", time: "Tue", msg: "30g whey + 60g carbs within 45 min. If no appetite: chocolate milk + banana works. I added a post-run template in your plan.", highlight: true },
        { who: "You", role: "Member", init: "YO", time: "Wed", msg: "Maya mentioned sleep is low — she looped you in." },
        { who: "Rae L.", role: "Coach", init: "RL", time: "9:16", msg: "Saw it. Let's add magnesium glycinate 300mg at night and cut caffeine after 1pm for 2 weeks. Logging a note on your plan." },
      ],
      placeholder: "Message Rae",
    },
    client: {
      label: "Client chat",
      sub: "Your practice · members",
      header: "Clients — 34 active",
      context: "Coach view · all your members · 6 new today",
      channels: [
        { name: "Priya S.", sub: "Member · 2m · on track", active: true, dm: true },
        { name: "Jonah W.", sub: "Member · 1h · needs check-in", dm: true, warn: true },
        { name: "Ana P.", sub: "Member · 3h", dm: true },
        { name: "Marcus L.", sub: "Member · 5h", dm: true },
        { name: "Jen K.", sub: "New intake · today", dm: true, warn: true },
      ],
      right: "CONTEXT",
      roster: [["Priya S.", "Hypertrophy · wk 6/12", false], ["Streak", "14 days", false], ["Last session", "Mon · bench 4×6 @ 185", false], ["Next", "Today 17:30", false]],
      messages: [
        { who: "Priya S.", role: "Member", init: "PS", time: "8:58", msg: "Felt heavier than the number said. Set 3 was a grind." },
        { who: "You", role: "Coach", init: "MO", time: "9:02", msg: "Expected — this is the overreach week. Push 185 today, deload next week. Ice shoulder tonight.", highlight: true },
        { who: "Priya S.", role: "Member", init: "PS", time: "9:04", msg: "Got it. Anything on diet? Been low on sleep." },
        { who: "You", role: "Coach", init: "MO", time: "9:08", msg: "Looping Rae in on the sleep piece — she'll message you today.", pin: true },
        { who: "Rae L.", role: "Coach", init: "RL", time: "9:10", msg: "On it. Sending protocol this afternoon." },
      ],
      placeholder: "Message Priya",
    },
    community: {
      label: "Community chat",
      sub: "#brooklyn-runs",
      header: "#brooklyn-runs",
      context: "420 members · 3 coaches online · pinned: Saturday long run",
      channels: [
        { name: "#brooklyn-runs", members: 420, active: true },
        { name: "#strength-club", members: 1280 },
        { name: "#plant-based", members: 860 },
        { name: "#marathon-block", members: 540 },
        { name: "#mobility-minutes", members: 720 },
      ],
      right: "IN THIS ROOM",
      roster: [["Diego Alvarez", "Coach · online", true], ["Maya Okafor", "Coach · online", true], ["Priya S.", "Member", false], ["Yuki A.", "Member", false], ["Marcus L.", "Member · typing…", false], ["+ 415 more", "", false]],
      messages: [
        { who: "Diego A.", role: "Coach", init: "DA", time: "9:02", msg: "Saturday long run moved to 7:30 start — cooler temps. Meet at the Prospect entrance.", pin: true },
        { who: "Priya S.", role: "Member", init: "PS", time: "9:14", msg: "Gonna try the 10k loop this week — first time past 8. Anyone pacing ~9:30?" },
        { who: "Yuki A.", role: "Member", init: "YA", time: "9:16", msg: "I'm at 9:20 flat — happy to drop back. See you there." },
        { who: "Maya O.", role: "Coach", init: "MO", time: "9:21", msg: "Priya — if it feels fine, do the last 2k at marathon pace. If not, ride it in easy. Either answer is the right answer.", highlight: true },
        { who: "Diego A.", role: "Coach", init: "DA", time: "9:24", msg: "Weather says 52° and overcast — race-day conditions. Good day to test the kit." },
      ],
      placeholder: "Message #brooklyn-runs",
    },
  };
  const r = ROOMS[tab];
  return (
    <section style={{ padding: "100px 40px", background: PAPER, color: INK }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Rooms · live</div>
          <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 0.95 }}>
            Talk to your <em style={{ fontStyle: "italic", color: TEAL }}>coach</em>.<br/>Talk to your <em style={{ fontStyle: "italic", color: TEAL }}>people</em>.
          </h2>
          <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(242,237,228,0.65)", maxWidth: 560, marginTop: 24 }}>
            Members and coaches, one thread. Direct lines to your trainer and nutritionist, plus rooms by city, specialty, and challenge. No algorithm, no ads.
          </p>
        </div>

        {/* tab switcher */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {[["trainer", "Trainer"], ["nutritionist", "Nutritionist"], ["client", "Client (coach view)"], ["community", "Community"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: "10px 18px", borderRadius: 999, border: tab === k ? `1px solid ${INK}` : "1px solid rgba(242,237,228,0.2)", background: tab === k ? INK : "transparent", color: tab === k ? PAPER : INK, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>{label}</button>
          ))}
        </div>

        <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, display: "grid", gridTemplateColumns: "260px 1fr 260px", minHeight: 540, overflow: "hidden" }}>
          <aside style={{ borderRight: "1px solid rgba(242,237,228,0.08)", padding: "24px 0", background: "rgba(242,237,228,0.02)" }}>
            <div style={{ padding: "0 20px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>{r.sub.toUpperCase()}</div>
            {r.channels.map((c, i) => (
              <div key={i} style={{ padding: "10px 20px", background: c.active ? "rgba(30,192,168,0.08)" : "transparent", borderLeft: c.active ? `2px solid ${TEAL}` : "2px solid transparent", display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                {c.dm && <div style={{ width: 26, height: 26, borderRadius: 999, background: c.warn ? "rgba(237,106,94,0.25)" : "rgba(242,237,228,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: INK, flexShrink: 0 }}>{c.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: sans, fontSize: 13, color: INK, fontWeight: c.active ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  {(c.sub || c.members) && <div style={{ fontFamily: sans, fontSize: 10.5, color: c.warn ? "#b54d40" : "rgba(242,237,228,0.5)", marginTop: 2 }}>{c.sub || `${c.members} members`}</div>}
                </div>
              </div>
            ))}
          </aside>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
              <div style={{ fontFamily: sans, fontSize: 15, fontWeight: 500, color: INK }}>{r.header}</div>
              <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{r.context}</div>
            </div>
            <div style={{ padding: 24, flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              {r.messages.map((m, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: 12, alignItems: "start", padding: m.highlight ? "12px 14px" : 0, background: m.highlight ? "rgba(30,192,168,0.07)" : "transparent", borderRadius: 10, border: m.highlight ? `1px solid rgba(30,192,168,0.25)` : "none" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 999, background: m.role === "Coach" ? TEAL : "rgba(242,237,228,0.12)", color: m.role === "Coach" ? PAPER : INK, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, fontSize: 12, fontWeight: 600 }}>{m.init}</div>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 500, color: INK }}>{m.who}</span>
                      {m.role === "Coach" && <span style={{ fontFamily: sans, fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(30,192,168,0.12)", color: TEAL, letterSpacing: "0.06em" }}>COACH</span>}
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(242,237,228,0.45)" }}>{m.time}</span>
                      {m.pin && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TEAL }}>📌 PINNED</span>}
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.5, color: "rgba(242,237,228,0.85)", marginTop: 4 }}>{m.msg}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 18, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", gap: 10, alignItems: "center", background: "rgba(242,237,228,0.02)" }}>
              <input placeholder={r.placeholder} style={{ flex: 1, background: PAPER, border: "1px solid rgba(242,237,228,0.12)", padding: "12px 16px", borderRadius: 8, color: INK, fontFamily: sans, fontSize: 13.5, outline: "none" }} />
              <button style={{ background: INK, color: PAPER, border: 0, padding: "12px 20px", borderRadius: 8, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Send</button>
            </div>
          </div>

          <aside style={{ borderLeft: "1px solid rgba(242,237,228,0.08)", padding: 24, background: "rgba(242,237,228,0.02)" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>{r.right}</div>
            {r.roster.map(([n, s, coach], i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", alignItems: "center" }}>
                <div style={{ width: 26, height: 26, borderRadius: 999, background: coach ? TEAL : "rgba(242,237,228,0.12)", fontFamily: sans, fontSize: 10, fontWeight: 600, color: coach ? PAPER : INK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n.split(" ").map(x=>x[0]).slice(0,2).join("")}</div>
                <div>
                  <div style={{ fontFamily: sans, fontSize: 12.5, color: INK }}>{n}</div>
                  {s && <div style={{ fontFamily: sans, fontSize: 10.5, color: "rgba(242,237,228,0.5)" }}>{s}</div>}
                </div>
              </div>
            ))}
          </aside>
        </div>
      </div>
    </section>
  );
}

function Community() {
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/intro/community%203.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: "rgba(26,22,18,0.6)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Community" />
        <HeroC />
        <Events />
        <Chat />
        <Challenges />
        <CTA />
        <Footer />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Community />);
