// Shared data and primitives for all three directions
const { useState, useEffect, useRef, useMemo } = React;

// ---- Data ----

const COACHES = [
  { name: "Maya Okafor", role: "Strength & Hypertrophy", city: "Brooklyn", rate: 120, rating: 4.97, sessions: 1284, tag: "Trainer", hue: 160 },
  { name: "Diego Alvarez", role: "Endurance · Marathon", city: "Austin", rate: 95, rating: 4.92, sessions: 912, tag: "Trainer", hue: 172 },
  { name: "Rae Lindqvist", role: "Sports Nutrition", city: "Stockholm", rate: 140, rating: 5.00, sessions: 640, tag: "Nutritionist", hue: 184 },
  { name: "Jordan Park", role: "Mobility · PT Recovery", city: "LA", rate: 110, rating: 4.89, sessions: 1510, tag: "Trainer", hue: 150 },
  { name: "Nadia Chen", role: "Plant-based Nutrition", city: "Toronto", rate: 125, rating: 4.95, sessions: 730, tag: "Nutritionist", hue: 196 },
  { name: "Tomás Reyes", role: "CrossFit · Olympic Lifts", city: "Miami", rate: 130, rating: 4.88, sessions: 2010, tag: "Trainer", hue: 140 },
];

const FAQ = [
  { q: "How does Shape match me with a coach?", a: "You answer six questions — goals, schedule, injuries, diet, budget, vibe. We return a shortlist of certified trainers and nutritionists ranked by fit. You book a free 15-minute intro before committing." },
  { q: "Are the trainers certified?", a: "Every coach is vetted: NASM, ACE, NSCA, ACSM, or equivalent for trainers; RD, RDN, or country-equivalent credentials for nutritionists. We verify licenses on application and re-check annually." },
  { q: "What does a Shape membership include?", a: "Unlimited marketplace access, Shape Radio (ad-free training music), in-app messaging with your coach, wearables sync, habit streaks, and Shape Score rewards. Sessions with coaches are billed separately at their listed rate." },
  { q: "Can I switch coaches?", a: "Yes — any time, no penalty. Your training history, nutrition logs, and Shape Score transfer with you. Most members try two before settling in." },
  { q: "How does Shape Score work?", a: "You earn points for consistency — workouts logged, meals tracked, sessions kept. Points convert to credits in the Shape Store or discounts on future sessions. It's our way of rewarding the boring parts that actually move the needle." },
];

const TESTIMONIALS = [
  { quote: "I went through three apps and two gyms before Shape. The marketplace made it obvious who I'd click with — Maya read my lifts in the intro and wrote a 12-week block by Tuesday.", name: "Priya S.", role: "Member · 14 months", metric: "+22 lb squat PR" },
  { quote: "As a trainer, the admin used to eat my Sundays. Shape handles billing, scheduling, programming export. I took on eleven new clients this quarter without hiring.", name: "Marcus T.", role: "Trainer · Chicago", metric: "11 new clients / Q" },
  { quote: "Having a real nutritionist in my pocket — not a chatbot — changed how I eat on the road. Rae reviews my logs weekly and it actually gets read.", name: "Elena R.", role: "Member · 8 months", metric: "−14% body fat" },
];

const STATS = [
  { k: "42,800", l: "Active members" },
  { k: "3,100", l: "Certified coaches" },
  { k: "1.2M", l: "Sessions booked" },
  { k: "98%", l: "Coach retention" },
];

// ---- Primitives ----

const cls = (...xs) => xs.filter(Boolean).join(" ");

// A striped placeholder with a mono caption
function Placeholder({ label, ratio = "16/9", tone = "dark", style = {}, children }) {
  const bg = tone === "dark" ? "#0f1513" : "#efece6";
  const fg = tone === "dark" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.45)";
  const stripe = tone === "dark"
    ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 10px)"
    : "repeating-linear-gradient(135deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 10px)";
  return (
    <div style={{
      aspectRatio: ratio, background: bg, backgroundImage: stripe,
      borderRadius: 4, position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em",
      color: fg, textTransform: "uppercase", ...style,
    }}>
      <span style={{ position: "absolute", top: 10, left: 12 }}>{label}</span>
      {children}
    </div>
  );
}

// Simple SVG wordmark — original, not brand-identical: a circle+S geometric mark
function ShapeMark({ size = 28, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="15" stroke={color} strokeWidth="1.5" />
      <path d="M10 20c2 1.5 4 2 6 2 3 0 5-1.5 5-4s-2-3.5-5-4.5-5-1.5-5-3.5 2-3 5-3c2 0 3 .5 4 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ShapeWord({ color, weight = 500, size = 18, letter = "0.01em", variant }) {
  // variant: "color" | "black" | "white" — if omitted, infer from `color`
  let v = variant;
  if (!v) {
    if (!color || color === "currentColor") v = "color";
    else {
      // strip whitespace and check for light colors
      const c = String(color).toLowerCase().replace(/\s/g, "");
      const isLight = c === "#fff" || c === "#ffffff" || c === "white" || c.startsWith("rgb(255,255,255") || c.includes("244,241,234") || c.includes("251,251,250");
      v = isLight ? "white" : "color";
    }
  }
  const src = v === "white"
    ? "/shape-logo-new-white.png?v=3"
    : v === "black"
    ? "/shape-logo-new-black.png?v=3"
    : "/shape-logo-new-white.png?v=3";
  const h = Math.round(size * 1.8);
  return (
    <img src={src} alt="Shape" style={{ height: h, width: "auto", display: "inline-block", verticalAlign: "middle" }} />
  );
}

// Mono eyebrow label
function Eyebrow({ children, color, n }) {
  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color, display: "flex", alignItems: "center", gap: 10 }}>
      {n && <span style={{ opacity: 0.5 }}>{n}</span>}
      <span>{children}</span>
    </div>
  );
}

// Expose globally
Object.assign(window, { COACHES, FAQ, TESTIMONIALS, STATS, cls, Placeholder, ShapeMark, ShapeWord, Eyebrow });
