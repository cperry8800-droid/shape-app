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
import * as readoutModule from '../src/lib/weekly-readout.mjs';
const {
  weeklyReadoutWeekStart,
  buildReadoutResponse,
  isCachedReadout,
  CLAIM_LEASE_SECONDS,
  GENERATE_TIMEOUT_MS,
  weeklyReadoutBoundHolds,
} = readoutModule;

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

test('a stored readout with no correlations to cite is not a cache hit', () => {
  // The quieter of the two half-row failures, and the reason the hit condition
  // is one test rather than a null-check on the readout alone: a null readout
  // under `cached: true` is conspicuous, while a readout served beside an empty
  // correlation list renders fine and is a lie — every insight names a
  // correlation_key the UI plots and none of them would resolve.
  for (const empty of [null, undefined, []]) {
    const res = buildReadoutResponse({
      subjectId: 'u1',
      weekStart: '2026-08-24',
      stored: { ...STORED, correlations: empty },
      live: LIVE,
    });
    assert.equal(res.cached, false, `treated ${JSON.stringify(empty)} correlations as a hit`);
    assert.equal(res.readout.summary, 'live');
    assert.deepEqual(res.correlations, LIVE.correlations);
  }
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

test('anon is revoked by name, and the writes revoke authenticated too', () => {
  // `revoke ... from public` does NOT remove Supabase's explicit per-role grant
  // — the bug class 2026-06-30-rpc-authz-hardening.sql exists for. And because
  // create-or-replace PRESERVES grants a previous version of this file made, a
  // database that already ran the first cut keeps handing members the write RPCs
  // unless `authenticated` is named here.
  assert.match(
    MIGRATION,
    /revoke all on function public\.claim_weekly_readout\([^)]*\) from public, anon;/,
  );
  assert.match(
    MIGRATION,
    /grant execute on function public\.claim_weekly_readout\([^)]*\) to authenticated, service_role/,
  );
  for (const fn of ['finalize_weekly_readout', 'release_weekly_readout']) {
    assert.match(
      MIGRATION,
      new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`),
      `${fn} does not revoke authenticated by name`,
    );
    assert.match(
      MIGRATION,
      new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`),
      `${fn} is not granted to service_role alone`,
    );
  }
});

test('every RPC pins its search_path; the claim binds the caller, the writes bind the token', () => {
  for (const fn of ['claim_weekly_readout', 'finalize_weekly_readout', 'release_weekly_readout']) {
    const i = MIGRATION.indexOf(`function public.${fn}`);
    const body = MIGRATION.slice(i, MIGRATION.indexOf('$$;', i));
    assert.match(body, /security definer/, `${fn} is not SECURITY DEFINER`);
    // pg_temp unlisted is searched FIRST, ahead of pg_catalog.
    assert.match(body, /set search_path = public, pg_temp/, `${fn} leaves search_path open`);
  }

  // The claim is the gate: it runs as the caller and decides self-or-coach in
  // the database rather than in a TypeScript re-implementation of that rule.
  const claim = MIGRATION.slice(
    MIGRATION.indexOf('function public.claim_weekly_readout'),
    MIGRATION.indexOf('$$;', MIGRATION.indexOf('function public.claim_weekly_readout')),
  );
  assert.match(claim, /auth\.uid\(\)/);
  assert.match(claim, /is_coach_on_client/);

  // ⚠ THE WRITES DELIBERATELY DO NOT READ auth.uid(). They are service_role
  // only, where there IS no caller identity — a check would always see null and
  // refuse every legitimate call. The claim token is the capability, and the
  // claim is where its holder was authorized.
  for (const fn of ['finalize_weekly_readout', 'release_weekly_readout']) {
    const i = MIGRATION.indexOf(`function public.${fn}`);
    const body = MIGRATION.slice(i, MIGRATION.indexOf('$$;', i));
    assert.ok(
      !/auth\.uid\(\)/.test(body),
      `${fn} reads auth.uid(), which is null under the service role`,
    );
    assert.match(body, /claim_token = p_claim_token/, `${fn} is not token-guarded`);
  }
});

test('the route and the assembler read ONE cache-hit predicate', () => {
  // Written as two conditions they briefly disagreed, and the half-row that
  // passed the route's looser one skipped the snapshot read and then rendered
  // the assembler's placeholder: an empty readout over a sample of zero. Same
  // class as #1950's split reportability predicate, in the same feature.
  assert.equal(typeof isCachedReadout, 'function');
  assert.match(ROUTE, /isCachedReadout\(storedReadout\)/);
  assert.ok(
    !/claim\?\.outcome === 'ready' && claim\.readout\)/.test(ROUTE),
    'the route decides the cache hit with its own condition again',
  );
  // And the assembler must not re-derive it either.
  const MODULE = stripComments(
    readFileSync(new URL('../src/lib/weekly-readout.mjs', import.meta.url), 'utf8'),
  );
  assert.match(MODULE, /const hit = isCachedReadout\(stored\);/);
});

test('isCachedReadout requires both halves', () => {
  assert.equal(isCachedReadout(STORED), true);
  assert.equal(isCachedReadout(null), false);
  assert.equal(isCachedReadout({ ...STORED, readout: null }), false);
  assert.equal(isCachedReadout({ ...STORED, correlations: [] }), false);
  assert.equal(isCachedReadout({ ...STORED, correlations: null }), false);
  // Not an array — jsonb can hold an object, and `.length` on one is undefined,
  // which a truthiness check would read as "no correlations" only by accident.
  assert.equal(isCachedReadout({ ...STORED, correlations: { a: 1 } }), false);
});

test('the .d.ts declares exactly what the module exports', () => {
  // A .d.ts is NOT checked against its .mjs by the compiler, so a hand-typed
  // drift surfaces as a wrong `any` at a call site rather than as an error.
  const DTS = readFileSync(new URL('../src/lib/weekly-readout.d.ts', import.meta.url), 'utf8');
  const declared = new Set(
    [...DTS.matchAll(/export (?:function|const) (\w+)/g)].map((m) => m[1]),
  );
  const actual = new Set(Object.keys(readoutModule));
  for (const name of actual) {
    assert.ok(declared.has(name), `${name} is exported but not declared in the .d.ts`);
  }
  for (const name of declared) {
    assert.ok(actual.has(name), `${name} is declared in the .d.ts but not exported`);
  }
});

test('the lease outlasts the longest possible generation', () => {
  // ⚠ THIS IS WHAT MAKES THE ONE-CALL BOUND A BOUND. A reviewer read the lease
  // as permitting two paid model calls: A claims, A's call runs past the lease,
  // B reclaims and calls again. That needs a generation still in flight after
  // CLAIM_LEASE_SECONDS — which cannot happen while the attempt aborts at
  // GENERATE_TIMEOUT_MS and the route finalizes or releases immediately after.
  // The safety was resting on two numbers agreeing by accident; this is the
  // relationship, stated.
  assert.equal(weeklyReadoutBoundHolds(), true);
  assert.ok(CLAIM_LEASE_SECONDS * 1000 >= GENERATE_TIMEOUT_MS * 2);
  // And it fails when the relationship is broken either way round.
  assert.equal(weeklyReadoutBoundHolds(60, 60_000), false, 'a lease equal to the timeout passed');
  assert.equal(weeklyReadoutBoundHolds(300, 600_000), false, 'a timeout past the lease passed');
});

test('the route bounds the model call with that timeout, not the shared default', () => {
  assert.match(ROUTE, /timeoutMs: GENERATE_TIMEOUT_MS/);
  assert.match(ROUTE, /p_lease_seconds: CLAIM_LEASE_SECONDS/);
});

test('the write RPCs are service-role only, in the migration and in the route', () => {
  // A client that can finalize can store anything it likes as an 'openai'
  // readout — for itself, or for a member it coaches. The claim stays caller-
  // gated because the self-or-coach decision belongs in the database under the
  // caller's own identity.
  for (const fn of ['finalize_weekly_readout', 'release_weekly_readout']) {
    assert.match(
      MIGRATION,
      new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`),
      `${fn} is still reachable by a client role`,
    );
    assert.ok(
      !new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to [^;]*authenticated`).test(MIGRATION),
      `${fn} is granted to authenticated`,
    );
  }
  // The claim is the one a client may call.
  assert.match(
    MIGRATION,
    /grant execute on function public\.claim_weekly_readout\([^)]*\) to authenticated, service_role/,
  );
  // And the route takes the writes as the server, the claim as the caller.
  assert.match(ROUTE, /const writer = readoutWriter\(\);/);
  assert.match(ROUTE, /writer\.rpc\('release_weekly_readout'/);
  assert.match(ROUTE, /await writer\.rpc\(rpc, args\)/);
  assert.match(ROUTE, /supabase\.rpc\('claim_weekly_readout'/);
  assert.ok(
    !/supabase\.rpc\('(finalize|release)_weekly_readout'/.test(ROUTE),
    'a write RPC is still called on the caller client',
  );
});

test("the migration's own guard refuses a client-reachable write RPC", () => {
  assert.match(MIGRATION, /a client role can still execute finalize_weekly_readout/);
  assert.match(MIGRATION, /a client role can still execute release_weekly_readout/);
});

test('a missing service key degrades rather than failing the request', () => {
  assert.match(ROUTE, /function readoutWriter\(\)/);
  assert.match(ROUTE, /return null;/);
  // The store is optional; the readout is not. With no service key the route
  // must still answer, so the write is skipped rather than attempted.
  assert.match(ROUTE, /const writer = readoutWriter\(\);/);
  assert.match(ROUTE, /\{ error: null \}/);
  assert.match(ROUTE, /await writer\.rpc\(rpc, args\)/);
});
