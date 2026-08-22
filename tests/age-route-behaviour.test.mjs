// The two age routes, DRIVEN — not grepped.
//
// ⚠ WHY DRIVEN. Both routes exist to avoid a failure that is invisible to a
// source scan, and it is the same one /api/me/date-of-birth shipped and then
// fixed: PostgREST does NOT treat an UPDATE affecting zero rows as an error, so a
// write that changed nothing reports success. For an account with no profiles row
// the age toggle would then tell a member their age is public when it is not.
// That state cannot be produced by a real database here — scripting the reads is
// the only way to put the route in it at all.
//
// The batch read route is driven for a different reason: its dedupe, its refusal
// to truncate, and its "a read fault is not an empty roster" answer are all
// decisions a passing grep would say nothing about.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The REAL NextResponse, so the statuses and bodies read here are the ones the
// routes actually return.
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const ageDerive = await import(pathToFileURL(join(ROOT, 'src/lib/age-derive.mjs')).href);
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), {
  typescript: true,
  registry: new Map([['next/server', nextServer]]),
});

// `adminClient` defaults to the same scripted client. The ages route reaches the
// RPC through the ADMIN client (the SQL door is granted to service_role alone —
// no browser identity can call it), so the registry has to supply both.
function loadRoute(file, client, { adminClient, adminThrows } = {}) {
  return loadRealModule(join(ROOT, file), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/server', { createClient: async () => client }],
      ['@/lib/supabase/admin', {
        createAdminClient: () => {
          if (adminThrows) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
          return adminClient || client;
        },
      }],
      ['@/lib/age-derive.mjs', ageDerive],
      ['@/lib/request-utils', requestUtils],
    ]),
  });
}

const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

// ── a scripted Supabase client ───────────────────────────────────────────────
// `reads` is consumed in order — one entry per maybeSingle() the route makes.
// age-public reads once AFTER the write, which is what lets the read-back
// disagree with what was asked for.
function makeClient({ user = { id: UID }, reads = [], writeError = null, rpc = null } = {}) {
  const calls = { reads: 0, updates: [], rpcs: [] };
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (name, args) => {
      calls.rpcs.push({ name, args });
      return rpc || { data: [], error: null };
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  const i = Math.min(calls.reads, reads.length - 1);
                  calls.reads += 1;
                  return reads.length ? reads[i] : { data: null, error: null };
                },
              };
            },
          };
        },
        update(patch) {
          return {
            eq: (col, val) => {
              calls.updates.push({ patch, col, val });
              return Promise.resolve({ error: writeError });
            },
          };
        },
      };
    },
  };
  client._calls = calls;
  return client;
}

const flagRow = (v) => ({ data: { age_public: v }, error: null });
const noRow = { data: null, error: null };
const readFault = { data: null, error: { message: 'boom' } };

// ── /api/me/age-public ───────────────────────────────────────────────────────
const AGE_PUBLIC = 'src/app/api/me/age-public/route.ts';

// `value` is the agePublic VALUE; `raw` replaces the whole body. Keeping them
// separate matters: an earlier version sent a string `value` as the raw body, so
// 'on' went out as invalid JSON and was refused by the shared reader instead of
// by the route's own boolean check — the test passed on a 400 it had not caused.
async function put(client, value, raw) {
  const mod = await loadRoute(AGE_PUBLIC, client);
  const res = await mod.PUT(new Request('http://localhost/api/me/age-public', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify({ agePublic: value }),
  }));
  return { status: res.status, body: await res.json(), calls: client._calls, res };
}

// ⚠ THE CASE THAT MOTIVATED THIS FILE. The write is silent, the row still says
// false. Echoing back what was asked for would tell the member their age is
// public when it is not — a disclosure setting reported backwards.
test('a write that did not take is reported as a failure, not echoed back', async () => {
  const client = makeClient({ reads: [flagRow(false)] });
  const { status, body } = await put(client, true);

  assert.equal(status, 409, 'a change that did not land must not answer 200');
  assert.equal(body.code, 'not_saved');
  assert.equal(body.agePublic, false, 'and must report what is ACTUALLY stored');
});

test('no profiles row is said plainly, not treated as a successful save', async () => {
  // The exact reachable case: 2 of 4 live accounts had no profiles row.
  const client = makeClient({ reads: [noRow] });
  const { status, body } = await put(client, true);

  assert.equal(status, 404);
  assert.equal(body.code, 'no_profile');
  assert.notEqual(body.agePublic, true, 'it must never claim the flag is set');
});

test('the writer whose change actually landed gets a 200 carrying the stored value', async () => {
  const client = makeClient({ reads: [flagRow(true)] });
  const { status, body, calls } = await put(client, true);

  assert.equal(status, 200);
  assert.equal(body.agePublic, true);
  assert.equal(calls.updates.length, 1, 'exactly one write');
  assert.deepEqual(calls.updates[0].patch, { age_public: true });
  assert.equal(calls.updates[0].val, UID, 'scoped to the caller, never a supplied id');
});

test('turning it back OFF round-trips too, so the guard is not one-directional', async () => {
  // A guard that only ever proves the `true` case would pass with the flag
  // hard-coded. Both arms measured.
  const client = makeClient({ reads: [flagRow(false)] });
  const { status, body } = await put(client, false);
  assert.equal(status, 200);
  assert.equal(body.agePublic, false);
});

test('a disclosure flag takes a strict boolean and nothing merely truthy-shaped', async () => {
  for (const bad of ['true', 1, 0, 'on', null, {}, []]) {
    const client = makeClient({ reads: [flagRow(false)] });
    const { status, body, calls } = await put(client, bad);
    assert.equal(status, 400, `${JSON.stringify(bad)} must be refused`);
    assert.equal(body.code, 'bad_body');
    assert.equal(calls.updates.length, 0, 'and must never reach the database');
  }
});

test('a signed-out caller is refused before any read or write', async () => {
  const client = makeClient({ user: null });
  const { status, calls } = await put(client, true);
  assert.equal(status, 401);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.reads, 0);
});

test('GET answers 503 on a read fault rather than reporting "off"', async () => {
  // Answering false would render a member's own choice back to them as off, and
  // their next toggle would write that wrong value in.
  const client = makeClient({ reads: [readFault] });
  const mod = await loadRoute(AGE_PUBLIC, client);
  const res = await mod.GET();
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(body.code, 'unavailable');
  assert.notEqual(body.agePublic, false, 'a failed read must not masquerade as a choice');
});

test('every age-public answer forbids caching — it is per-account', async () => {
  const client = makeClient({ reads: [flagRow(true)] });
  const { res } = await put(client, true);
  assert.match(res.headers.get('cache-control') || '', /no-store/,
    'a per-account privacy answer must never be reused on a shared device');
});

// ── /api/members/ages ────────────────────────────────────────────────────────
const AGES = 'src/app/api/members/ages/route.ts';

async function ages(client, ids, raw, opts) {
  const mod = await loadRoute(AGES, client, opts);
  const res = await mod.POST(new Request('http://localhost/api/members/ages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify({ ids }),
  }));
  return { status: res.status, body: await res.json(), calls: client._calls, res };
}

test('dates are reduced to integers, and the shared derivation is what does it', async () => {
  const client = makeClient({ rpc: { data: [{ member_id: UID, dob: '1990-05-05' }], error: null } });
  const { status, body } = await ages(client, [UID]);

  assert.equal(status, 200);
  assert.equal(typeof body.ages[UID], 'number', 'an integer, never a date');
  assert.equal(body.ages[UID], ageDerive.ageFromDob('1990-05-05'),
    'the route must use the one shared derivation, not arithmetic of its own');
  assert.ok(!JSON.stringify(body).includes('1990-05-05'),
    'no birthdate may appear anywhere in the response');
});

test('a member the RPC omitted is simply absent — never null, 0, or "private"', async () => {
  const client = makeClient({ rpc: { data: [{ member_id: UID, dob: '1990-05-05' }], error: null } });
  const { body } = await ages(client, [UID, OTHER]);
  assert.ok(!(OTHER in body.ages),
    'not-entitled and no-date-on-file must be indistinguishable, and both absent');
});

test('a repeated id is asked about once', async () => {
  const client = makeClient({ rpc: { data: [], error: null } });
  const { calls } = await ages(client, [UID, UID, UID]);
  assert.deepEqual(calls.rpcs[0].args.targets, [UID], 'deduped before the database sees it');
});

test('too many ids is REFUSED, never silently truncated', async () => {
  // Answering the first 500 would render the rest as "no age on file" — a claim
  // the route would not have checked.
  const many = Array.from({ length: 501 }, (_, i) =>
    `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`);
  const client = makeClient({ rpc: { data: [], error: null } });
  const { status, body, calls } = await ages(client, many);

  assert.equal(status, 400);
  assert.equal(body.code, 'too_many');
  assert.equal(calls.rpcs.length, 0, 'and the database is never asked');
});

test('exactly 500 is allowed — the cap is not off by one', async () => {
  const many = Array.from({ length: 500 }, (_, i) =>
    `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`);
  const client = makeClient({ rpc: { data: [], error: null } });
  const { status, calls } = await ages(client, many);
  assert.equal(status, 200);
  assert.equal(calls.rpcs.length, 1);
});

test('a malformed id is refused rather than dropped', async () => {
  // A dropped id comes back as an absent age, which renders identically to "this
  // member is private" — so a typo upstream would look like a member's choice and
  // nothing would ever report the mistake.
  const client = makeClient({ rpc: { data: [], error: null } });
  const { status, body, calls } = await ages(client, [UID, 'not-a-uuid']);
  assert.equal(status, 400);
  assert.equal(body.code, 'invalid_id');
  assert.equal(calls.rpcs.length, 0);
});

test('a NON-STRING id is refused too, not silently filtered away', async () => {
  // The regression this pins: an earlier version dropped non-strings BEFORE
  // validating, so `['<uuid>', 42]` answered 200 for the good half and the bad
  // element vanished without a word.
  for (const bad of [42, null, {}, [], true]) {
    const client = makeClient({ rpc: { data: [], error: null } });
    const { status, body, calls } = await ages(client, [UID, bad]);
    assert.equal(status, 400, `${JSON.stringify(bad)} must be refused`);
    assert.equal(body.code, 'invalid_id');
    assert.equal(calls.rpcs.length, 0, 'and must never reach the database');
  }
});

// ⚠ THE ONE INVARIANT THE ADMIN CLIENT MAKES LOAD-BEARING. The RPC is granted to
// service_role alone, so this route holds power a browser does not. Everything
// rests on `viewer` being the verified session's id and never caller input.
test('the viewer is the SESSION user, never anything the caller supplied', async () => {
  const client = makeClient({ user: { id: UID }, rpc: { data: [], error: null } });
  const mod = await loadRoute(AGES, client);
  const res = await mod.POST(new Request('http://localhost/api/members/ages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Every plausible smuggling shape, all ignored.
    body: JSON.stringify({ ids: [OTHER], viewer: OTHER, userId: OTHER, user_id: OTHER }),
  }));
  await res.json();

  const { args } = client._calls.rpcs[0];
  assert.equal(args.viewer, UID, 'the viewer must be the authenticated session user');
  assert.notEqual(args.viewer, OTHER, 'a body-supplied viewer must never be honoured');
  assert.deepEqual(args.targets, [OTHER], 'targets still come from the caller — the RPC filters them');
});

test('a missing service key is 503, not "these members have no age"', async () => {
  const client = makeClient({ rpc: { data: [], error: null } });
  const { status, body } = await ages(client, [UID], undefined, { adminThrows: true });
  assert.equal(status, 503);
  assert.equal(body.code, 'unavailable');
  assert.ok(!body.ages, 'a broken deployment must not render as absence');
});

test('a read fault is 503, not an empty roster of ages', async () => {
  const client = makeClient({ rpc: { data: null, error: { message: 'boom' } } });
  const { status, body } = await ages(client, [UID]);
  assert.equal(status, 503);
  assert.equal(body.code, 'unavailable');
  assert.ok(!body.ages, 'it must not answer as though every member simply had no age');
});

test('an empty ask is answered without troubling the database', async () => {
  const client = makeClient({ rpc: { data: [], error: null } });
  const { status, body, calls } = await ages(client, []);
  assert.equal(status, 200);
  assert.deepEqual(body.ages, {});
  assert.equal(calls.rpcs.length, 0);
});

test('a signed-out caller gets nothing, and the RPC is never reached', async () => {
  const client = makeClient({ user: null, rpc: { data: [], error: null } });
  const { status, calls } = await ages(client, [UID]);
  assert.equal(status, 401);
  assert.equal(calls.rpcs.length, 0);
});

test('a non-array body is refused', async () => {
  const client = makeClient({ rpc: { data: [], error: null } });
  const { status, body, calls } = await ages(client, undefined, JSON.stringify({ ids: 'nope' }));
  assert.equal(status, 400);
  assert.equal(body.code, 'bad_body');
  assert.equal(calls.rpcs.length, 0);
});

test('every ages answer forbids caching — it is per-viewer AND per-account', async () => {
  const client = makeClient({ rpc: { data: [], error: null } });
  const { res } = await ages(client, [UID]);
  assert.match(res.headers.get('cache-control') || '', /no-store/);
});
