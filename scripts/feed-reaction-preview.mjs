// Generates a faithful static preview of the feed ActivityCard with the NEW
// reaction-verb system, using the REAL mapping from reactionVerbs.mjs (no drift).
// Renders: strength PR (+ coach co-sign), run, swim, rest day, cycle — to confirm
// each shows the right verb, ONE unified count, and the unchanged card look.
import { writeFileSync } from "node:fs";
import { bsReactionType, bsReactionVerb, bsReactionPalette } from "../mobile-app/src/services/reactionVerbs.mjs";

// Dark feed palette (the app's default feed look).
const T = {
  bg: "#0f0d0a", card: "#1a1613", ink: "#f2ede4",
  muted: "rgba(242,237,228,0.62)", hair: "rgba(242,237,228,0.12)",
  tealb: "#34d6c5",
  serif: "'Georgia','Times New Roman',serif",
  mono: "'SFMono-Regular',ui-monospace,Menlo,monospace",
  body: "'Helvetica Neue',Arial,sans-serif",
};
const TIER = { PEAK: "#a78bfa", LEGEND: "#fb7185", FORM: "#34d6c5", TEMPO: "#d8a23a", BASE: "#8a93a0" };
const ROLEC = { trainer: "#c0533b", nutritionist: "#a07a2e" };
const initials = (n) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// The same demo cards the app feed now carries.
const CARDS = [
  { kind: "pr", who: "Priya Shah", role: "Client", city: "Gold St. Barbell · NYC", tier: "PEAK", ago: "6m",
    body: "Block 3 paying off. Felt like there was a 4th in the tank.", typeLabel: "Strength",
    title: "Deadlift — new PR", hero: ["245 lb", "Load"], delta: "+10 lb on May best",
    sec: [["Top set", "1×3"], ["Est. 1RM", "268 lb"]], kudos: 41, replies: 6,
    cosign: { name: "Dana Lewis", role: "trainer" }, paletteOpen: true, picked: "Fire" },
  { kind: "run", who: "Drew Oyelaran", role: "Client", city: "East River Loop · NYC", tier: "LEGEND", ago: "34m",
    body: "Last long run before taper. Negative split the back 6.", typeLabel: "Run", activityType: "run",
    title: "Long run", hero: ["18.2 mi", "Distance"], route: true,
    sec: [["Pace", "8:42/mi"], ["Time", "2:38"]], kudos: 28, replies: 4 },
  { kind: "workout", who: "Lena Fischer", role: "Client", city: "Metropolitan Pool · NYC", tier: "FORM", ago: "52m",
    body: "Long-course meters. Stroke felt smooth the whole set.", typeLabel: "Swim", activityType: "swim",
    title: "Masters swim · 2 km", hero: ["2,000 m", "Distance"],
    sec: [["Pace", "1:42/100m"], ["Time", "34:10"]], kudos: 19, replies: 2 },
  { kind: "workout", who: "Theo Nakamura", role: "Client", city: "Recovery day · home", tier: "TEMPO", ago: "1h",
    body: "Full rest. Legs needed it after the week of volume.", typeLabel: "Rest", activityType: "recovery",
    title: "Rest & recover", hero: ["8h 10m", "Sleep"],
    sec: [["HRV", "74 ms"], ["Readiness", "91%"]], kudos: 12, replies: 1 },
  { kind: "workout", who: "Marcus Bell", role: "Client", city: "River Rd · NJ", tier: "PEAK", ago: "1h",
    body: "Threshold intervals on the climb. Held the watts on every rep.", typeLabel: "Ride", activityType: "cycle",
    title: "Tempo ride · 40 km", hero: ["40.2 km", "Distance"],
    sec: [["Avg power", "241 W"], ["Time", "1:18"]], kudos: 23, replies: 3 },
];

const card = (a) => {
  const tc = TIER[a.tier] || "#8a93a0";
  // The REAL verb resolution — exactly what the app computes.
  const rawType = a.activityType || (a.kind === "run" ? "run" : a.kind === "workout" ? "strength" : a.kind);
  const actType = bsReactionType(rawType, { isPR: a.kind === "pr" });
  const verb = bsReactionVerb(actType);
  const count = a.kudos; // unified count (the verb never forks it)
  const csC = a.cosign ? ROLEC[a.cosign.role] || "#c0533b" : null;
  return `
  <div style="border-radius:15px;border:1px solid ${T.hair};background:${T.card};overflow:hidden">
    <div style="height:2px;background:${tc}"></div>
    <div style="padding:10px 13px 12px">
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:9px">
        <div style="width:36px;height:36px;border-radius:50%;background:${tc};color:#0c0a08;font-family:${T.mono};font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center">${initials(a.who)}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-family:${T.serif};font-weight:800;font-size:13.5px;color:${T.ink}">${a.who}</span>
            <span style="font-family:${T.mono};font-size:7px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${tc};border:1px solid ${tc}80;padding:1px 4px;border-radius:3px">${a.tier}</span>
            <span style="font-family:${T.mono};font-size:7px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${T.muted};border:1px solid ${T.hair};padding:1px 4px;border-radius:3px">${a.role}</span>
          </div>
          <div style="font-family:${T.mono};font-size:8px;color:${T.muted};margin-top:2px;letter-spacing:.04em">${a.ago} ago · ${a.city}</div>
        </div>
        <span style="font-family:${T.mono};font-size:7.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#fff;background:${tc};padding:3px 6px;border-radius:4px">${a.typeLabel}</span>
      </div>
      <div style="font-family:${T.serif};font-size:16px;font-weight:800;color:${T.ink};letter-spacing:-.015em;line-height:1.1">${a.title}</div>
      <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:0 9px;margin-top:7px">
        <span style="font-family:${T.serif};font-size:30px;font-weight:700;color:${T.ink};letter-spacing:-.03em;line-height:1">${a.hero[0]}</span>
        ${a.delta ? `<span style="font-family:${T.mono};font-size:8.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${tc};background:${tc}1f;border:1px solid ${tc}80;padding:3px 7px;border-radius:999px">↑ ${a.delta}</span>` : ""}
        <span style="width:100%;font-family:${T.mono};font-size:7.5px;letter-spacing:.16em;text-transform:uppercase;color:${T.muted};margin-top:3px">${a.hero[1]}</span>
      </div>
      <p style="font-family:${T.body};font-size:12.5px;line-height:1.35;color:${T.muted};margin:7px 0 0">${a.body}</p>
      ${a.cosign ? `<div style="display:inline-flex;align-items:center;gap:6px;margin-top:11px;background:${csC};color:#fff;border-radius:999px;padding:4px 11px">
        <span style="font-family:${T.mono};font-size:9.5px;font-weight:900;line-height:1">✓</span>
        <span style="font-family:${T.serif};font-size:11.5px;font-weight:800">${a.cosign.name}</span>
        <span style="font-family:${T.mono};font-size:7.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.85">co-signed · ${a.cosign.role === "nutritionist" ? "Nutritionist" : "Coach"}</span>
      </div>` : ""}
      ${a.route ? `<div style="position:relative;margin-top:9px;height:80px;border-radius:11px;overflow:hidden;border:1px solid ${tc}33;background:radial-gradient(circle at 30% 30%, ${tc}cc 0 1.3px, transparent 1.7px) 0 0/9px 9px, linear-gradient(135deg, ${tc}3a, ${tc}12)">
        <span style="position:absolute;left:9px;bottom:7px;font-family:${T.mono};font-size:7px;letter-spacing:.18em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.45);padding:2px 5px;border-radius:3px">GPS route</span></div>` : ""}
      <div style="margin-top:11px;font-family:${T.mono};font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${T.muted}">▸ Session details <span style="opacity:.5">(${a.sec.map((s) => s[0]).join(" · ")})</span></div>
      ${a.paletteOpen ? `<div style="display:flex;align-items:center;gap:6px;margin-top:11px;overflow-x:auto">
        ${bsReactionPalette(verb).map((w) => { const on = w === a.picked; return `<span style="flex-shrink:0;height:28px;padding:0 12px;display:inline-flex;align-items:center;border-radius:999px;background:${on ? tc : tc + "12"};color:${on ? "#fff" : tc};border:1px solid ${on ? tc : tc + "66"};font-family:${T.mono};font-size:8.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase">↑ ${w}</span>`; }).join("")}
        <span style="flex-shrink:0;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;border:1px solid ${T.hair};color:${T.muted};font-family:${T.mono};font-size:11px;font-weight:800">×</span>
      </div>` : ""}
      <div style="display:flex;align-items:center;gap:7px;margin-top:12px">
        <span style="display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 14px;border-radius:999px;background:${a.picked ? tc : tc + "14"};color:${a.picked ? "#fff" : tc};border:1px solid ${tc};font-family:${T.mono};font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase">↑ ${a.picked || verb} · ${count + (a.picked ? 1 : 0)}</span>
        <span style="display:inline-flex;align-items:center;justify-content:center;height:27px;padding:0 11px;border-radius:999px;background:transparent;color:${T.muted};border:1px solid ${T.hair};font-family:${T.mono};font-size:8.5px;font-weight:800;text-transform:uppercase">↳ ${a.replies}</span>
        <span style="display:inline-flex;align-items:center;justify-content:center;height:27px;padding:0 11px;border-radius:999px;background:transparent;color:${T.muted};border:1px solid ${T.hair};font-family:${T.mono};font-size:8.5px;font-weight:800;text-transform:uppercase">↗ Share</span>
        <span style="margin-left:auto"></span>
        <span style="display:inline-flex;align-items:center;justify-content:center;width:27px;height:27px;border-radius:999px;border:1px solid ${T.hair};color:${T.muted}">✉</span>
        <span style="display:inline-flex;align-items:center;justify-content:center;width:27px;height:27px;border-radius:999px;border:1px solid ${T.hair};color:${T.muted}">⇄</span>
      </div>
    </div>
  </div>`;
};

const verbRow = (a) => {
  const rawType = a.activityType || (a.kind === "run" ? "run" : a.kind === "workout" ? "strength" : a.kind);
  const t = bsReactionType(rawType, { isPR: a.kind === "pr" });
  return `${a.typeLabel.padEnd(9)} → ${bsReactionVerb(t).padEnd(10)} (count ${a.kudos}${a.cosign ? `, co-sign by ${a.cosign.name}` : ""})`;
};

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;background:${T.bg};padding:22px;font-family:${T.body}}
.grid{display:grid;grid-template-columns:repeat(2,360px);gap:18px;max-width:760px;margin:0 auto}
h1{color:${T.ink};font-family:${T.serif};font-weight:800;letter-spacing:-.02em;font-size:22px;margin:0 0 4px}
.sub{color:${T.muted};font-family:${T.mono};font-size:10px;letter-spacing:.1em;text-transform:uppercase;margin:0 0 18px}
.legend{color:${T.muted};font-family:${T.mono};font-size:11px;white-space:pre;line-height:1.7;margin:20px auto 0;max-width:760px;border-top:1px solid ${T.hair};padding-top:14px}</style></head>
<body>
<div style="max-width:760px;margin:0 auto"><h1>Feed reactions · activity-mapped verb, one unified count</h1>
<p class="sub">strength PR · run · swim · rest day · cycle — same card look, verb is display-only · the PR card shows the held-open palette</p></div>
<div class="grid">${CARDS.map(card).join("")}</div>
<div class="legend">${CARDS.map(verbRow).join("\n")}\n\nUnified count: the verb word changes by activity; the number is ONE tally (powers profile totals + weekly most-reacted).\nCoach co-sign: a solid role-colored badge (heavier than peer reactions); eligible to notify the athlete.\nPhase 2 (PR card, palette open): press-and-hold the reaction → pick a word [contextual verb · ${bsReactionPalette('').join(' · ')}]. Picking re-labels YOUR reaction (here: Fire) but stays the SAME one like (41 → 42). All text, no emoji.</div>
</body></html>`;

writeFileSync("shape-feed-reactions-preview.html", html);
console.log("wrote shape-feed-reactions-preview.html");
console.log(CARDS.map(verbRow).join("\n"));
