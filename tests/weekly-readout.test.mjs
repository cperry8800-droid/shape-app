// The weekly readout's week key, its response stamping, and the wiring that
// bounds it to one model call per member per week.
//
// The pure halves are driven directly. The route and the migration are asserted
// as SOURCE, because neither can be executed here — the route needs a Postgres
// session and the RPCs need the migration applied — and the invariants that
// matter (which caller may generate, what may be stored, who may claim) are
// decisions the source states plainly. Comments are stripped first: every one
// of these rules is explained in a comment that quotes the thing it bans, and a
// guard satisfied by its own rationale is not a guard.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';
import { weeklyReadoutWeekStart, buildReadoutResponse } from '../src/lib/weekly-readout.mjs';

const ROUTE = stripComments(
  readFileSync(new URL('../src/app/api/ai/weekly-readout/route.ts', import.meta.url), 'utf8'),
);
const MIGRATION = readFileSync(
  new URL('../supabase-migrations/2026-08-29-ai-weekly-readouts.sql', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------- week key

test('the week key is the Monday of the containing week, in UTC', () => {
  // Mon 2026-08-24 through Sun 2026-08-30 are one week; Mon the 31st is the next.
  assert.equal(weeklyReadoutWeekStart(Date.UTC(2026, 7, 24, 0, 0)), '2026-08-24');
  assert.equal(weeklyReadoutWeekStart(Date.UTC(2026, 7, 27, 13, 5)), '2026-08-24');
  assert.equal(weeklyReadoutWeekStart(Date.UTC(2026, 7, 30, 23, 59)), '2026-08-24');
  assert.equal(weeklyReadoutWeekStart(Date.UTC(2026, 7, 31, 0, 0)), '2026-08-31');
});

test('a week spanning a year boundary keeps one key', () => {
  // 2025-12-29 is a Monday; the week runs into 2026. A 'YYYY-Www' key would
  // have to decide which week-NUMBERING year those days belong to — the exact
  // arithmetic a Monday date does not need.
  for (const [y, m, d] of [
    [2025, 11, 29],
    [2025, 11, 31],
    [2026, 0, 1],
    [2026, 0, 4],
  ]) {
    assert.equal(weeklyReadoutWeekStart(Date.UTC(y, m, d, 12)), '2025-12-29');
  }
  assert.equal(weeklyReadoutWeekStart(Date.UTC(2026, 0, 5, 12)), '2026-01-05');
});

test('an unusable instant yields no week rather than a wrong one', () => {
  for (const bad of [NaN, Infinity, -Infinity, null, undefined, 'nope', {}]) {
    assert.equal(weeklyReadoutWeekStart(bad), null, `expected null for ${String(bad)}`);
  }
});

// -------------------------------------------------------- response stamping

const LIVE = {
  readout: { summary: 'live', insights: [{ correlation_key: 'a->b@lag0' }] },
  correlations: [{ x: 'a', y: 'b' }],
  source: 'fallback',
  window_days: 28,
  sample_size: 12,
  generated_at: '2026-08-29T00:00:00.000Z',
};

const STORED = {
  readout: { summary: 'stored', insights: [{ correlation_key: 'c->d@lag1' }] },
  correlations: [{ x: 'c', y: 'd' }],
  source: 'openai',
  window_days: 14,
  sample_size: 9,
  generated_at: '2026-08-25T00:00:00.000Z',
};

test('a cache hit reports the window and sample the readout was computed from', () => {
  const res = buildReadoutResponse({
    subjectId: 'u1',
    weekStart: '2026-08-24',
    stored: STORED,
    live: LIVE,
  });
  assert.equal(res.cached, true);
  // The REQUEST asked for 28 days; the stored readout saw 14. Reporting 28
  // would be a claim about days it never read.
  assert.equal(res.window_days, 14);
  assert.equal(res.sample_size, 9);
  assert.equal(res.source, 'openai');
  assert.equal(res.generated_at, '2026-08-25T00:00:00.000Z');
  assert.equal(res.readout.summary, 'stored');
});

test('a cache hit serves the correlations the readout cites, not fresh ones', () => {
  const res = buildReadoutResponse({
    subjectId: 'u1',
    weekStart: '2026-08-24',
    stored: STORED,
    live: LIVE,
  });
  // Every insight names a correlation_key the UI plots. Fresh correlations
  // beside a stored readout would leave it citing evidence that has moved.
  assert.deepEqual(res.correlations, STORED.correlations);
  assert.equal(res.readout.insights[0].correlation_key, 'c->d@lag1');
  assert.ok(
    res.correlations.every((c) => c.x !== 'a'),
    'live correlations leaked into a cached response',
  );
});

test('a miss reports the live figures and is not marked cached', () => {
  const res = buildReadoutResponse({
    subjectId: 'u1',
    weekStart: '2026-08-24',
    stored: null,
    live: LIVE,
  });
  assert.equal(res.cached, false);
  assert.equal(res.window_days, 28);
  assert.equal(res.sample_size, 12);
  assert.equal(res.readout.summary, 'live');
  assert.deepEqual(res.correlations, LIVE.correlations);
});

test('a stored row with no readout is not a cache hit', () => {
  // finalize only ever writes readout and correlations together, so this cannot
  // arise through the app. Treating it as a hit would serve `readout: null`
  // under `cached: true` — the shape a consumer is least equipped to notice.
  for (const empty of [null, undefined]) {
    const res = buildReadoutResponse({
      subjectId: 'u1',
      weekStart: '2026-08-24',
      stored: { ...STORED, readout: empty },
      live: LIVE,
    });
    assert.equal(res.cached, false);
    assert.equal(res.readout.summary, 'live');
    assert.equal(res.window_days, 28, 'stamped a stored window over a live readout');
  }
});

test('the subject and week travel onto the response', () => {
  const res = buildReadoutResponse({
    subjectId: 'member-7',
    weekStart: '2026-08-24',
    stored: null,
    live: LIVE,
  });
  assert.equal(res.user_id, 'member-7');
  assert.equal(res.week_start, '2026-08-24');
});

// ------------------------------------------------------------- route wiring

test('the model is only called by the caller holding the claim', () => {
  // `generating` means another request is mid-flight. Generating anyway would
  // spend a second call on the same member and week, which is the whole bound.
  assert.match(ROUTE, /const mayGenerate\s*=\s*!claim \|\| claim\.outcome === 'claimed'/);
  assert.match(ROUTE, /mayGenerate\s*\n?\s*\?\s*await generateReadout\(/);
  assert.ok(
    !/^\s*(const|let)\s+generated\s*=\s*await generateReadout\(/m.test(ROUTE),
    'generateReadout is reachable without holding the claim',
  );
});

test('only a generated readout is stored; anything else releases the claim', () => {
  assert.match(
    ROUTE,
    /const rpc = generated \? 'finalize_weekly_readout' : 'release_weekly_readout'/,
  );
  // The fallback must never be finalized: it is free to recompute, and storing
  // it would spend the member's whole week on one transient outage.
  assert.ok(
    !/p_source:\s*'fallback'/.test(ROUTE),
    'a fallback source is written into the store',
  );
});

test('a permission refusal answers 403 instead of serving the readout anyway', () => {
  const idx = ROUTE.indexOf('claim_weekly_readout');
  assert.ok(idx > 0, 'the claim RPC call vanished');
  const after = ROUTE.slice(idx, idx + 1600);
  assert.match(after, /not permitted/i);
  assert.match(after, /status:\s*403/);
});

test('the caller-supplied id is handed to the RPC that gates it', () => {
  // The route does not gate the id itself; it passes it to a SECURITY DEFINER
  // function whose self-or-coach check raises. What must hold here is that the
  // id it passes is the SAME id it then reads and stores under — a subject that
  // diverged between the gate and the read would gate one member and answer
  // about another.
  assert.match(ROUTE, /p_user_id:\s*subjectId/);
  assert.match(ROUTE, /\.eq\('user_id',\s*subjectId\)/);
  assert.ok(
    !/body\.user_id \|\| user\.id/.test(ROUTE),
    'the unchecked body.user_id fallback is back',
  );
});

test('a served cache hit does not read the snapshot table', () => {
  // The claim exists to make a repeat request cheap. Reading 28 days of rows to
  // then discard them would keep the cost the bound was added to remove.
  const ready = ROUTE.indexOf("claim?.outcome === 'ready'");
  const snapshot = ROUTE.indexOf("from('daily_health_snapshot')");
  assert.ok(ready > 0 && snapshot > 0, 'the ready branch or the snapshot read vanished');
  assert.ok(ready < snapshot, 'the cache hit is decided after the snapshot read');
  assert.match(ROUTE.slice(ready, snapshot), /return NextResponse\.json\(/);
});

test('an absent RPC degrades to generating, it does not fail the request', () => {
  assert.match(ROUTE, /function isMissingRpc/);
  assert.match(ROUTE, /PGRST202/);
  // claim stays null when the RPC is missing, and a null claim may generate.
  assert.match(ROUTE, /!claim \|\| claim\.outcome === 'claimed'/);
});

// ---------------------------------------------------------- migration rules

test('the store admits no write policy — every write goes through the RPCs', () => {
  assert.match(MIGRATION, /for select using \(auth\.uid\(\) = user_id\)/);
  assert.match(MIGRATION, /for select using \(public\.is_coach_on_client\(user_id\)\)/);
  const policies = MIGRATION.match(/create policy[\s\S]*?;/g) ?? [];
  assert.ok(policies.length >= 2, 'the read policies vanished');
  for (const p of policies) {
    assert.match(p, /for select/, `a non-SELECT policy exists: ${p.slice(0, 60)}`);
  }
});

test('the claim is atomic and the reclaim is a guarded update on the lease', () => {
  assert.match(MIGRATION, /on conflict \(user_id, week_start\) do nothing/);
  // The lease predicate is what makes the reclaim exclusive: the first
  // reclaimer moves claimed_at, so a second one's predicate no longer holds.
  assert.match(MIGRATION, /claimed_at < now\(\) - v_lease/);
  assert.match(MIGRATION, /set claimed_at = now\(\), claim_token = gen_random_uuid\(\)/);
});

test('finalize and release are guarded on the claim token', () => {
  for (const fn of ['finalize_weekly_readout', 'release_weekly_readout']) {
    const i = MIGRATION.indexOf(`function public.${fn}`);
    assert.ok(i > 0, `${fn} vanished`);
    const body = MIGRATION.slice(i, MIGRATION.indexOf('$$;', i));
    assert.match(body, /claim_token = p_claim_token/, `${fn} is not token-guarded`);
    assert.match(body, /status = 'generating'/, `${fn} can overwrite a ready row`);
    assert.match(body, /return found;/, `${fn} does not report whether it won`);
  }
});

test('anon is revoked by name on every RPC', () => {
  // `revoke ... from public` does NOT remove Supabase's explicit anon grant —
  // the bug class 2026-06-30-rpc-authz-hardening.sql exists for.
  for (const fn of ['claim_weekly_readout', 'finalize_weekly_readout', 'release_weekly_readout']) {
    const revoke = new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon`);
    assert.match(MIGRATION, revoke, `${fn} is not revoked from anon`);
    assert.match(
      MIGRATION,
      new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`),
      `${fn} is not granted to authenticated`,
    );
  }
});

test('every RPC pins its search_path and checks the caller', () => {
  for (const fn of ['claim_weekly_readout', 'finalize_weekly_readout', 'release_weekly_readout']) {
    const i = MIGRATION.indexOf(`function public.${fn}`);
    const body = MIGRATION.slice(i, MIGRATION.indexOf('$$;', i));
    assert.match(body, /security definer/, `${fn} is not SECURITY DEFINER`);
    // pg_temp unlisted is searched FIRST, ahead of pg_catalog.
    assert.match(body, /set search_path = public, pg_temp/, `${fn} leaves search_path open`);
    assert.match(body, /auth\.uid\(\)/, `${fn} does not bind the caller`);
    assert.match(body, /is_coach_on_client/, `${fn} does not gate a non-self subject`);
  }
});
