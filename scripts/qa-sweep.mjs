// dashboard-v2 QA sweep — real-browser pass over every dashboard page at
// 375/768/1280: page errors, console errors/warnings (expected demo-mode API
// 401s tracked separately), horizontal overflow, and screenshots to /tmp/qa.
// Run: node scripts/qa-sweep.mjs   (needs `next start -p 3100` running)
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

import { routeCDN } from "./qa-cdn.mjs";

const BASE = "http://localhost:3100/newdesign/";
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const WIDTHS = [375, 768, 1280];
const PAGES = [
  "ClientDashboard", "TrainerDashboard", "NutritionistDashboard",
  "TrainerClients", "NutritionistClients",
  "TrainerPrograms", "NutritionistPlans",
  "ClientNutri", "ClientGoal", "ClientTeam", "ClientProgress",
  "TrainerAnalytics", "NutritionistAnalytics",
  "ClientHabits", "ClientScore", "ClientCommunity", "ClientMe",
  "ClientTrain",
];

mkdirSync("/tmp/qa", { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: EXEC });
const results = [];

for (const name of PAGES) {
  const row = { name, errors: [], warnings: [], demo401s: 0, overflow: {}, blank: {} };
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    await routeCDN(ctx);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => row.errors.push(`[${w}] pageerror: ${String(e).split("\n")[0]}`));
    page.on("console", (m) => {
      const t = m.type(), text = m.text();
      if (/Failed to load resource.*(401|402)/.test(text) || /the server responded with a status of (401|402)/.test(text)) { row.demo401s += 1; return; }
      if (/net::ERR|Failed to fetch|ERR_CONNECTION|TypeError: Failed to fetch|fonts\.gstatic/.test(text)) { row.demo401s += 1; return; } // blocked-egress noise (supabase etc.)
      if (/Download the React DevTools/.test(text)) return;
      if (/babel|in-browser Babel transformer/i.test(text)) return; // babel-standalone perf notice
      if (t === "error") row.errors.push(`[${w}] console: ${text.slice(0, 200)}`);
      else if (t === "warning" && /Warning:/.test(text)) row.warnings.push(`[${w}] ${text.slice(0, 160)}`);
    });
    try {
      await page.goto(BASE + name + ".html", { waitUntil: "domcontentloaded", timeout: 30000 });
      // babel-standalone compiles in-browser — wait for the app to mount.
      await page.waitForFunction(() => {
        const r = document.getElementById("root");
        return r && r.children.length > 0;
      }, { timeout: 20000 }).catch(() => { row.blank[w] = true; });
      await page.waitForTimeout(2500); // effects + demo fallbacks settle
      const over = await page.evaluate(() => {
        const d = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
        return d > 1 ? d : 0;
      });
      if (over) row.overflow[w] = over;
      await page.screenshot({ path: `/tmp/qa/${name}-${w}.png`, fullPage: w === 1280 });
    } catch (e) {
      row.errors.push(`[${w}] LOAD FAILED: ${String(e).split("\n")[0]}`);
    }
    await ctx.close();
  }
  const flag = row.errors.length ? "FAIL" : Object.keys(row.overflow).length || row.warnings.length || Object.keys(row.blank).length ? "WARN" : "ok";
  results.push(row);
  console.log(
    `${flag.padEnd(4)} ${name.padEnd(24)} errors:${row.errors.length} warn:${row.warnings.length}` +
    ` overflow:${JSON.stringify(row.overflow)} blank:${Object.keys(row.blank).join(",") || "-"} 401s:${row.demo401s}`
  );
  for (const e of row.errors.slice(0, 4)) console.log("       " + e);
  for (const e of row.warnings.slice(0, 3)) console.log("       " + e);
}

await browser.close();
const fails = results.filter((r) => r.errors.length).length;
console.log(`\n${results.length - fails}/${results.length} pages clean of errors`);
process.exit(0);
