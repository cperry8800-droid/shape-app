// A migration is REPLAYABLE. Every one in this repo is written to be safe to
// re-run — so an OLDER file that still seeds a since-deleted store item, or
// still offers it as a tier-reward choice, silently resurrects it the moment
// anyone replays it.
//
// This repo has paid for exactly this class once already: three migrations
// `create or replace`d set_over_18(), so replaying an older one reverted the
// column freezes (2026-08-16 round 14). The remedy there was BOTH halves —
// correct the older files AND scan the whole directory, because "a rule written
// down in a comment is not a rule anything checks".
//
// PROVEN, not assumed. Replaying 2026-07-20-tier-rewards.sql's function body
// against production (in a rolled-back transaction, 2026-08-31) restored
// `tempo_drinkware` — whose BOTH options were deleted — and put the tee and
// crewneck back in `legend_merch`: 4 dead choices. claim_tier_reward()
// double-gates a pick on store_catalogue, so a member would choose a tee, enter
// a shipping address, and only then get `bad_choice`. The 08-31 removal's own
// comment names that state: "a dead choice, which is worse than a missing one."
//
// The allowed set is DERIVED from src/lib/store-catalogue.ts (the authority for
// what exists), never hand-listed — so the next removal is covered with nobody
// remembering this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase-migrations');
const read = (p) => readFileSync(p, 'utf8');

// Comments quote removed ids on purpose (that IS the record of the removal), so
// they must not read as declarations. Line comments only — the migrations use
// `--` throughout, and a spanning /* */ strip would eat dollar-quoted bodies.
const bare = (s) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

// ── the authority: what still exists ────────────────────────────────────────
const ts = read(join(ROOT, 'src/lib/store-catalogue.ts'));
const LIVE = new Set();
for (const line of ts.split('\n')) {
  const m = /\{\s*id: '([a-z0-9_]+)'.*?retail: (\d+)/.exec(line);
  if (m) LIVE.add(m[1]);
}

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

/** ids seeded by every `insert into public.store_catalogue … ;` statement. */
function seededIds(sql) {
  const out = [];
  const re = /insert\s+into\s+public\.store_catalogue\b/gi;
  for (const m of sql.matchAll(re)) {
    const end = sql.indexOf(';', m.index);
    const stmt = sql.slice(m.index, end === -1 ? sql.length : end);
    // Each value row leads with the id: ('merch_cap_black', 5250, …)
    for (const row of stmt.matchAll(/\(\s*'([a-z0-9_]+)'\s*,/g)) out.push(row[1]);
  }
  return out;
}

/** ids offered as a choice by every tier_reward_defs() definition. */
function offeredIds(sql) {
  const out = [];
  const re = /function\s+public\.tier_reward_defs\b/gi;
  for (const m of sql.matchAll(re)) {
    // The body is dollar-quoted; find the tag opened after `as`, then its close.
    const tagM = /as\s+(\$[a-z_]*\$)/i.exec(sql.slice(m.index));
    if (!tagM) continue;
    const bodyStart = m.index + tagM.index + tagM[0].length;
    const close = sql.indexOf(tagM[1], bodyStart);
    const body = sql.slice(bodyStart, close === -1 ? sql.length : close);
    for (const a of body.matchAll(/array\s*\[([^\]]*)\]/gi)) {
      for (const id of a[1].matchAll(/'([a-z0-9_]+)'/g)) out.push(id[1]);
    }
  }
  return out;
}

test('the guard can actually see the migrations it exists to check', () => {
  // Without this, a broken matcher passes by finding nothing at all.
  assert.ok(LIVE.size >= 14, `parsed only ${LIVE.size} live ids from the authority`);
  const seeders = files.filter((f) => seededIds(bare(read(join(MIGRATIONS, f)))).length);
  const definers = files.filter((f) => offeredIds(bare(read(join(MIGRATIONS, f)))).length);
  assert.ok(seeders.length >= 2, `found ${seeders.length} store_catalogue seeders`);
  assert.ok(definers.length >= 2, `found ${definers.length} tier_reward_defs definitions`);
});

test('a commented-out seed row is not read as a live one', () => {
  // Reachability for `bare()`. Deleting a row and commenting it out look the
  // same to a reader but not to Postgres — a commented row never executes, so
  // flagging it is a false alarm, and false alarms are how a guard gets muted.
  // No migration currently carries this shape, so without this vector the strip
  // would sit unexercised and read as dead on the next tidy-up.
  const sql = `
    insert into public.store_catalogue (id, cost_points) values
   -- ('merch_ghost', 999),
      ('merch_cap_black', 5250);
  `;
  assert.deepEqual(seededIds(bare(sql)), ['merch_cap_black']);
  assert.ok(seededIds(sql).includes('merch_ghost'), 'the strip is what excludes it');
});

test('no migration seeds a store item the catalogue has removed', () => {
  for (const f of files) {
    const ghosts = [...new Set(seededIds(bare(read(join(MIGRATIONS, f)))))].filter((id) => !LIVE.has(id));
    assert.deepEqual(
      ghosts, [],
      `${f} seeds ${ghosts.join(', ')} — replaying it resurrects removed item(s) into the CHARGING authority`,
    );
  }
});

test('no migration offers a tier-reward choice the store cannot fulfil', () => {
  for (const f of files) {
    const dead = [...new Set(offeredIds(bare(read(join(MIGRATIONS, f)))))].filter((id) => !LIVE.has(id));
    assert.deepEqual(
      dead, [],
      `${f} offers ${dead.join(', ')} as a tier-reward pick — replaying it makes claim_tier_reward reject after the member picks and enters an address`,
    );
  }
});
