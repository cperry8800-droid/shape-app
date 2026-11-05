// What a coach sees, said as it is (owner, 2026-11-05: "just remove it, coaches should automatically be
// able to see activity data if client is paying for one"). The policy said members choose what each
// coach sees, and the website kept a `shareDataWithCoaches` setting nothing read. A coach the member
// pays sees the activity data the shared overview reads; goals and the cycle are the only switches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const PAGES = ['public/privacy.html', 'public/data-compliance.html', 'public/health-data-privacy.html'];
const CLAIMS = [/adjust what each coach can see/i, /you choose what your coach sees/i, /share-gated/i, /data you choose to share with them/i, /choose what gets shared with coaches/i];

test('no page or app string promises a per-coach control that does nothing', () => {
  for (const p of PAGES) for (const re of CLAIMS) assert.doesNotMatch(read(p), re, `${p}: ${re}`);
  const catalogs = join(ROOT, 'mobile-app/src/i18n/catalogs/en');
  for (const f of readdirSync(catalogs)) for (const re of CLAIMS) assert.doesNotMatch(readFileSync(join(catalogs, f), 'utf8'), re, `${f}: ${re}`);
  assert.doesNotMatch(read('mobile-app/src/broadsheet/BSIntegrationsPage.jsx'), /choose what gets shared with coaches/);
  // The setting nothing read is gone from the website's defaults (there was never a control for it).
  assert.doesNotMatch(read('public/newdesign/clientMeSettings.jsx'), /shareDataWithCoaches/);
});

test('the policy lists what a paid coach sees, and each item is a leg the shared overview reads', () => {
  const html = read('public/privacy.html');
  const who = /<p><strong>Who can see it\.<\/strong>([\s\S]*?)<\/p>/.exec(html)[1];
  const overview = read('src/lib/shared-overview.ts');
  for (const [said, leg] of [
    ['weekly check-ins', "rpc('get_client_checkins'"],
    ['body measurements and progress photos', "rpc('get_client_progress_photos'"],
    ['sleep and recovery data from connected wearables', "from('daily_health_snapshot')"],
    ['your Shape Score and workout streak', "rpc('get_client_score_history'"],
    ['your meal-prep log', "rpc('get_client_meal_prep'"],
    ['the intake answers you gave when you hired them', "rpc('get_client_intake'"],
    ['lifts and personal records', "rpc('get_client_lifts'"],
    ['safety screening', "rpc('get_client_health_profile'"],
  ]) {
    assert.ok(who.includes(said), `the policy does not say "${said}"`);
    assert.ok(overview.includes(leg), `${leg} is not read, so "${said}" would over-claim`);
  }
  assert.match(who, /If you pay both a trainer and a nutritionist, both see this same data/);
  assert.match(who, /private notes about you stay private to that coach/);
  // The two switches that exist, and only those.
  assert.match(who, /Your goals and your cycle tracking are shared with your coach\(es\) only while you have sharing turned on for them\./);
  assert.ok(overview.includes("rpc('get_client_goals'") && overview.includes("rpc('get_client_cycle'"));
  assert.match(html, /turn sharing of your goals and your cycle tracking with your coach\(es\) on or off/);
  assert.match(html, /Last updated — November 5, 2026/);
});
