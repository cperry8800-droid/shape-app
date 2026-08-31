// The store catalogue lives in FOUR places and they must never disagree:
//
//   1. src/lib/store-catalogue.ts          — the TS authority (route pricing)
//   2. supabase-migrations/…reprice-150.sql — the CHARGING authority (the DB
//      table redeem_store_item reads; the client's cost arg is ignored)
//   3. mobile BS_STORE_PRODUCTS            — what a member SEES in the app
//   4. public/newdesign/store.jsx          — what a member SEES on the website
//
// A drift here is a silent money bug: a member is shown one price and charged
// another (review: Codex P1 on #1778 — the TS/UI reprice alone would have left
// production charging the old 20x costs). Each surface keeps its own display
// list for good reasons (bundling, no shared runtime), so this test is the
// contract between them: same ids, same computed cost, same credit rule.
//
// Everything is parsed from SOURCE TEXT rather than imported, because the
// authority is TypeScript, the migration is SQL, and the two display lists are
// JSX — no single runtime can require all four.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ── 1. the TS authority ──────────────────────────────────────────────────────
const ts = read('src/lib/store-catalogue.ts');
const RATE = Number(/export const SHAPE_PTS_PER_USD = (\d+)/.exec(ts)[1]);
const RATE_CREDIT = Number(/export const SHAPE_PTS_PER_USD_CREDIT = (\d+)/.exec(ts)[1]);

const authority = new Map();
for (const line of ts.split('\n')) {
  const m = /\{\s*id: '([a-z0-9_]+)'.*?retail: (\d+)/.exec(line);
  if (!m) continue;
  const kind = (/kind: '([a-z_]+)'/.exec(line) || [, 'merch'])[1];
  const retail = Number(m[2]);
  authority.set(m[1], {
    retail,
    kind,
    locked: /locked: true/.test(line),
    cost: Math.round(retail * (kind === 'credit' ? RATE_CREDIT : RATE)),
  });
}

test('the TS authority parses and prices credits at 2x base', () => {
  assert.ok(authority.size >= 14, `expected the full catalogue, parsed ${authority.size}`);
  assert.equal(RATE_CREDIT, RATE * 2);
  // A spot check that would catch a rate typo the ratio assertion can't.
  assert.equal(authority.get('merch_cap_black').cost, 35 * RATE);
  assert.equal(authority.get('train_credit_25').cost, 25 * RATE * 2);
});

// ── 2. the migration (the DB actually charges these) ─────────────────────────
test('the reprice migration matches the TS authority row for row', () => {
  const sql = read('supabase-migrations/2026-07-20-store-reprice-150.sql');
  const rows = new Map();
  for (const m of sql.matchAll(/\('([a-z0-9_]+)',\s*(\d+),\s*(\d+),\s*(null|'[a-z]+'),\s*'([a-z_]+)',\s*(true|false)\)/g)) {
    rows.set(m[1], { cost: Number(m[2]), kind: m[5], locked: m[6] === 'true' });
  }
  const deleted = new Set([...sql.matchAll(/delete from public\.store_catalogue where id = '([a-z0-9_]+)'/g)].map((m) => m[1]));

  for (const [id, want] of authority) {
    const got = rows.get(id);
    assert.ok(got, `migration is missing ${id} — the DB would charge its OLD price`);
    assert.equal(got.cost, want.cost, `${id}: migration charges ${got.cost}, catalogue shows ${want.cost}`);
    assert.equal(got.kind, want.kind, `${id}: kind drift`);
    assert.equal(got.locked, want.locked, `${id}: locked drift`);
  }
  // A row the migration writes but the catalogue dropped would stay redeemable.
  for (const id of rows.keys()) {
    assert.ok(authority.has(id), `migration seeds ${id}, which is not in the catalogue`);
  }
  for (const id of deleted) {
    assert.ok(!authority.has(id), `migration deletes ${id}, which is still in the catalogue`);
  }
});

// ── 3. mobile display list ───────────────────────────────────────────────────
test('the mobile store list matches the authority', () => {
  const jsx = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const block = /const BS_STORE_PRODUCTS = \[([\s\S]*?)\n  \];/.exec(jsx)[1];
  const rate = Number(/const BS_SHAPE_PTS_PER_USD = (\d+)/.exec(jsx)[1]);
  assert.equal(rate, RATE, 'mobile rate drifted from the authority');

  const creditIds = new Set(
    (/const BS_STORE_CREDIT_IDS = new Set\(\[([^\]]*)\]/.exec(jsx)[1].match(/'([a-z0-9_]+)'/g) || [])
      .map((s) => s.replace(/'/g, '')),
  );

  const seen = new Set();
  for (const line of block.split('\n')) {
    const m = /\{ id: '([a-z0-9_]+)'.*?retail: (\d+)/.exec(line);
    if (!m) continue;
    const [, id, retail] = m;
    seen.add(id);
    const want = authority.get(id);
    assert.ok(want, `mobile shows ${id}, which is not in the authority`);
    assert.equal(Number(retail), want.retail, `${id}: mobile retail drift`);
    // The 2x rule must be applied to exactly the catalogue's credit items —
    // this is what keeps a renamed/added credit from silently pricing at 1x.
    assert.equal(creditIds.has(id), want.kind === 'credit', `${id}: mobile credit-rule drift`);
  }
  for (const id of authority.keys()) {
    assert.ok(seen.has(id), `mobile is missing ${id}`);
  }
});

// ── 4. website display list ──────────────────────────────────────────────────
test('the website store list matches the authority', () => {
  const jsx = read('public/newdesign/store.jsx');
  const rate = Number(/const SHAPE_PTS_PER_USD = (\d+)/.exec(jsx)[1]);
  assert.equal(rate, RATE, 'website rate drifted from the authority');

  const idsByName = new Map();
  for (const m of /const STORE_ITEM_IDS = \{([\s\S]*?)\n\};/.exec(jsx)[1].matchAll(/"([^"]+)":\s*"([a-z0-9_]+)"/g)) {
    idsByName.set(m[1], m[2]);
  }

  const seen = new Set();
  for (const line of jsx.split('\n')) {
    const m = /\{ id: \d+, cat: "[^"]+", name: "([^"]+)".*?retail: (\d+)/.exec(line);
    if (!m) continue;
    const [, name, retail] = m;
    const id = idsByName.get(name);
    assert.ok(id, `website shows "${name}" with no id in STORE_ITEM_IDS — it cannot be redeemed`);
    seen.add(id);
    const want = authority.get(id);
    assert.ok(want, `website shows ${id}, which is not in the authority`);
    assert.equal(Number(retail), want.retail, `${id}: website retail drift`);
    // The website marks credits with an explicit kind (never inferred from the
    // name), so this pins the same rule the mobile assertion above pins.
    assert.equal(/kind: "credit"/.test(line), want.kind === 'credit', `${id}: website credit-rule drift`);
  }
  for (const id of authority.keys()) {
    assert.ok(seen.has(id), `website is missing ${id}`);
  }
});
