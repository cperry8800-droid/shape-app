// dashboard-v2 QA — interaction pass (real browser): message deep-links from
// pulse/roster/drawer/Team (to the signed-out composer-lock boundary — the
// draft CONTRACT is covered by the render harness since the locked composer
// replaces the textarea for non-members), keyboard access, builder autosave +
// preview parity, queue → builder navigation, score-ring link, tap targets.
// Run: node scripts/qa-interactions.mjs (needs next start -p 3100).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import { routeCDN } from "./qa-cdn.mjs";

const BASE = "http://localhost:3100/newdesign/";
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const browser = await chromium.launch({ headless: true, executablePath: EXEC });
const out = [];
const ok = (name, cond, detail = "") => { out.push({ name, pass: !!cond, detail }); console.log((cond ? "  ok  " : "  FAIL") + " · " + name + (cond || !detail ? "" : " → " + detail)); };

async function fresh(width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } });
  await routeCDN(ctx);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  return { ctx, page };
}
async function open(page, name) {
  await page.goto(BASE + name + ".html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => document.getElementById("root")?.children.length > 0, { timeout: 20000 });
  await page.waitForTimeout(1800);
}
// The chat panel signed out: thread list + the members-only composer lock.
const chatState = (page) => page.evaluate(() => {
  const roots = [document.getElementById("shape-rich-chat-root"), ...document.querySelectorAll("[data-chat-panel]")].filter(Boolean);
  const txt = roots.map((r) => r.textContent || "").join(" ");
  return {
    panel: roots.some((r) => (r.textContent || "").length > 50),
    lock: /member to send|Join Shape|Become a Shape member/i.test(txt || document.body.textContent || ""),
    marcus: /Marcus T\./.test(txt),
  };
});
const drawerCount = (page) => page.evaluate(() => [...document.querySelectorAll("div")].filter((d) => d.style.position === "fixed" && d.style.zIndex === "240").length);

// ── 1. Messaging: pulse Message → bubble deep-linked to the client ──────────
{
  const { ctx, page } = await fresh();
  await open(page, "TrainerDashboard");
  await page.locator("button", { hasText: /^Message$/ }).first().click();
  await page.waitForTimeout(9000); // lazy boot compiles the widget in-browser
  const s = await chatState(page);
  ok("pulse Message opens the bubble in place (no inbox page)", s.panel && page.url().includes("TrainerDashboard.html"));
  ok("…deep-linked to the flagged client's thread", s.marcus);
  ok("…signed-out composer is the members-only lock (draft is harness-pinned)", s.lock);
  await ctx.close();
}

// ── 2. Today pulse rows open the shared drawer (step-11 wiring restored) ────
{
  const { ctx, page } = await fresh();
  await open(page, "TrainerDashboard");
  await page.locator('[role="button"][aria-label*="drilldown"]').first().click();
  await page.waitForTimeout(700);
  ok("pulse row opens the client drilldown on Today", (await drawerCount(page)) === 1);
  await ctx.close();
}

// ── 3. Roster drawer: keyboard Enter/Escape + Message action ────────────────
{
  const { ctx, page } = await fresh();
  await open(page, "NutritionistClients");
  const row = page.locator('[role="button"][aria-label*="drilldown"]').first();
  await row.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  ok("keyboard: Enter on a roster row opens the drawer", (await drawerCount(page)) === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  ok("keyboard: Escape closes the drawer", (await drawerCount(page)) === 0);
  await page.locator('[role="button"][aria-label*="drilldown"]').first().click();
  await page.waitForTimeout(600);
  ok("drawer carries a Message action", await page.locator("button", { hasText: /^Message$/ }).last().isVisible());
  await ctx.close();
}

// ── 4. Cross-pro read-only data in BOTH drawers + the goal editor ───────────
{
  const { ctx, page } = await fresh();
  await open(page, "TrainerClients");
  await page.locator('[role="button"][aria-label*="drilldown"]').first().click();
  await page.waitForTimeout(600);
  ok("trainer drawer shows the nutritionist read-only section", await page.locator("text=From the nutritionist side").first().isVisible());
  ok("trainer drawer carries the pro goal editor", await page.locator("text=+ Add goal").first().isVisible());
  await ctx.close();
  const n = await fresh();
  await open(n.page, "NutritionistClients");
  await n.page.locator('[role="button"][aria-label*="drilldown"]').first().click();
  await n.page.waitForTimeout(600);
  ok("nutritionist drawer shows the trainer read-only section", await n.page.locator("text=From the trainer side").first().isVisible());
  await n.ctx.close();
}

// ── 5. Builders: open, autosave, preview parity ─────────────────────────────
{
  const { ctx, page } = await fresh();
  await open(page, "TrainerPrograms");
  await page.locator("button", { hasText: /^Edit$/ }).first().click();
  await page.waitForTimeout(800);
  ok("workout builder opens from the library", await page.locator("text=Client preview").first().isVisible());
  ok("builder preview is the literal client card (non-interactive)", (await page.locator("text=Client preview · their workout card").first().isVisible()) && (await page.locator("text=Start →").count()) === 0);
  const nameInput = page.locator("input[value]").first();
  await nameInput.fill("QA Block");
  await page.waitForTimeout(400);
  const dirty = await page.locator("text=/Unsaved edits|Saving…/").first().isVisible().catch(() => false);
  await page.waitForTimeout(1800);
  const saved = await page.locator("text=/Draft saved locally|Saved/").first().isVisible().catch(() => false);
  ok("builder autosave cycles dirty → saved (demo = local draft)", dirty && saved);
  await ctx.close();
}
{
  const { ctx, page } = await fresh();
  await open(page, "NutritionistPlans");
  await page.locator("button", { hasText: /^Edit$/ }).first().click();
  await page.waitForTimeout(900);
  ok("meal builder opens with targets-first + running total", (await page.locator("text=set these first").first().isVisible()) && (await page.locator("text=running total").first().isVisible()));
  ok("meal builder preview is the client meals card", await page.locator("text=Client preview · their meals card").first().isVisible());
  const before = await page.locator("text=/kcal left|Over by|Target hit/").first().textContent().catch(() => "");
  const log = page.locator("button", { hasText: /^Log meal$/ }).first();
  if (await log.isVisible().catch(() => false)) {
    await log.click();
    await page.waitForTimeout(400);
    const after = await page.locator("text=/kcal left|Over by|Target hit/").first().textContent().catch(() => "");
    ok("preview ledger ticks live like the client's", before !== after, before + " → " + after);
  } else ok("preview ledger ticks live like the client's", false, "no Log meal button visible");
  await ctx.close();
}

// ── 6. Navigation: queue → builder, Business card, score ring ───────────────
{
  const { ctx, page } = await fresh();
  await open(page, "TrainerDashboard");
  ok("programming queue Template action targets the Programs page", (await page.locator('a:has-text("Template")').first().getAttribute("href")) === "TrainerPrograms.html");
  ok("Business card links to the Business page", (await page.locator('a:has-text("Revenue · payouts · funnel · churn")').first().getAttribute("href")) === "TrainerAnalytics.html");
  await ctx.close();
}
{
  const { ctx, page } = await fresh();
  await open(page, "ClientDashboard");
  ok("client score ring links to the Score deep-dive", (await page.locator('a[aria-label="Open your Shape Score"]').first().getAttribute("href")) === "ClientScore.html");
  // Tap targets inside the DASHBOARD content (site header/footer chrome is
  // shared marketing UI, audited separately).
  const small = await page.evaluate(() => {
    const bad = [];
    const main = document.querySelector("main") || document.body;
    for (const el of main.querySelectorAll("button, a")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.height < 24 && r.width < 24) bad.push((el.textContent || el.getAttribute("aria-label") || "?").trim().slice(0, 24));
    }
    return bad.slice(0, 6);
  });
  ok("no sub-24px tap targets in the dashboard main content", small.length === 0, JSON.stringify(small));
  await ctx.close();
}

// ── 7. Team page Message → bubble in place ──────────────────────────────────
{
  const { ctx, page } = await fresh();
  await open(page, "ClientTeam");
  await page.locator("button", { hasText: /^Message$/ }).first().click();
  await page.waitForTimeout(2500);
  const s = await chatState(page);
  ok("Team page Message opens the bubble in place", s.panel && page.url().includes("ClientTeam.html"));
  await ctx.close();
}

await browser.close();
const fails = out.filter((r) => !r.pass).length;
console.log(`\n${out.length - fails}/${out.length} interaction checks passed`);
process.exit(fails ? 1 : 0);
