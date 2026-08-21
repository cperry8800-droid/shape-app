// The date-of-birth completion route, DRIVEN — not grepped.
//
// Everything this route can get wrong is invisible to a source scan: the failure
// mode it was built to end is a write that matched nothing and was reported as
// success, and the shape of that bug is identical to the shape of the fix when
// read as text. So this compiles the REAL route (TypeScript, through the same
// in-memory loader the broadsheet mount tests use) and calls POST/GET with a
// scripted Supabase client.
//
// ⚠ WHAT THE SCRIPTED CLIENT IS FOR. PostgREST does not treat an UPDATE affecting
// zero rows as an error, and `set_over_18` silently REVERTS a write to an already
// populated date_of_birth. Neither behaviour can be produced by a real local
// database here, and both are the exact conditions under which this route used to
// lie. Scripting the reads is the only way to put the route in that state at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// `next/server` is a CJS subpath — Node's ESM loader cannot resolve it, so take
// it the way the app's own bundler does. This is the REAL NextResponse, so the
// statuses and bodies these tests read are the ones the route actually returns.
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const ageDerive = await import(pathToFileURL(join(ROOT, 'src/lib/age-derive.mjs')).href);

// The real shared reader, not a stand-in — its size cap and malformed-body
// answers are part of what these tests assert the route actually delegates to.
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), {
  typescript: true,
  registry: new Map([['next/server', nextServer]]),
});

const ROUTE = join(ROOT, 'src/app/api/me/date-of-birth/route.ts');

function loadRoute(client) {
  return loadRealModule(ROUTE, {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/server', { createClient: async () => client }],
      ['@/lib/age-derive.mjs', ageDerive],
      ['@/lib/request-utils', requestUtils],
    ]),
  });
}

const row = (dob, over18 = null) => ({ data: { date_of_birth: dob, over_18: over18 }, error: null });
const noRow = { data: null, error: null };
const readFault = { data: null, error: { message: 'boom' } };

// `reads` is consumed in order — one entry per readProfile() call the route makes.
// The route reads once before the write and once after, so a two-entry script is
// what lets the second read disagree with the first, which is the whole point.
function makeClient({ user = { id: 'u1' }, reads = [], writeError = null } = {}) {
  const calls = { reads: 0, updates: [] };
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  const i = Math.min(calls.reads, reads.length - 1);
                  calls.reads += 1;
                  return reads.length ? reads[i] : noRow;
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

function post(dob, extra = {}) {
  return new Request('http://localhost/api/me/date-of-birth', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(extra.headers || {}) },
    body: extra.body !== undefined ? extra.body : JSON.stringify({ date_of_birth: dob }),
  });
}

async function callPost(client, dob, extra) {
  const mod = await loadRoute(client);
  const res = await mod.POST(post(dob, extra));
  return { status: res.status, body: await res.json(), calls: client._calls };
}

// ⚠ THE CASE THAT MOTIVATED ALL OF THIS. Two requests both read a null date and
// both pass the already_set guard; the first write lands, the trigger reverts the
// second, and PostgREST reports no error. Before the read-back compared IDENTITY
// the second caller was handed `ok: true` for a date that is not theirs.
test('a concurrent second writer is refused, not congratulated', async () => {
  const client = makeClient({ reads: [row(null), row('1990-01-01', true)] });
  const { status, body } = await callPost(client, '1985-05-05');

  assert.equal(status, 409, 'the loser of the race must be told, not thanked');
  assert.equal(body.code, 'already_set');
  assert.notEqual(body.ok, true, 'it must never report success for someone else’s date');
  assert.ok(!('date_of_birth' in body) || body.date_of_birth !== '1985-05-05',
    'and must not echo a date that was never stored');
});

test('the writer whose date actually landed is the one that gets ok:true', async () => {
  const client = makeClient({ reads: [row(null), row('1985-05-05', true)] });
  const { status, body, calls } = await callPost(client, '1985-05-05');

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.date_of_birth, '1985-05-05');
  assert.equal(body.over_18, true);
  assert.equal(calls.updates.length, 1, 'exactly one write');
  assert.deepEqual(calls.updates[0].patch, { date_of_birth: '1985-05-05' },
    'over_18 must NOT be written — the trigger derives it, which is what makes it proof');
});

// ⚠ THE ORIGINAL P1, PINNED BEHAVIOURALLY. A profile-less account used to get
// ok:true here, because .update() matching zero rows is not an error.
test('a profile-less account is refused BEFORE any write is attempted', async () => {
  const client = makeClient({ reads: [noRow] });
  const { status, body, calls } = await callPost(client, '1985-05-05');

  assert.equal(status, 409);
  assert.equal(body.code, 'no_profile');
  assert.notEqual(body.ok, true);
  assert.equal(calls.updates.length, 0,
    'the route must not issue a write it knows can only match zero rows');
});

test('a second write to an existing date is refused before the write', async () => {
  const client = makeClient({ reads: [row('1990-01-01', true)] });
  const { status, body, calls } = await callPost(client, '1985-05-05');

  assert.equal(status, 409);
  assert.equal(body.code, 'already_set');
  assert.equal(calls.updates.length, 0);
});

test('a read-back that shows nothing stored is a failure, not a success', async () => {
  const client = makeClient({ reads: [row(null), row(null)] });
  const { status, body } = await callPost(client, '1985-05-05');

  assert.equal(status, 503);
  assert.equal(body.code, 'not_persisted');
  assert.notEqual(body.ok, true);
});

test('a failed write is surfaced rather than swallowed', async () => {
  const client = makeClient({ reads: [row(null)], writeError: { message: 'nope' } });
  const { status, body } = await callPost(client, '1985-05-05');

  assert.equal(status, 503);
  assert.equal(body.code, 'write_failed');
});

test('a read fault before the write is a 503, never a silent overwrite', async () => {
  const client = makeClient({ reads: [readFault] });
  const { status, calls } = await callPost(client, '1985-05-05');

  assert.equal(status, 503);
  assert.equal(calls.updates.length, 0);
});

test('a minor is refused', async () => {
  const soon = new Date();
  soon.setUTCFullYear(soon.getUTCFullYear() - 10);
  const client = makeClient({ reads: [row(null)] });
  const { status, body, calls } = await callPost(client, soon.toISOString().slice(0, 10));

  assert.equal(status, 403);
  assert.equal(body.code, 'under_18');
  assert.equal(calls.updates.length, 0, 'and nothing is written for them');
});

// Feb 30 is the case a hand-rolled parse gets wrong: Date.UTC rolls it forward to
// Mar 2 rather than rejecting it. The shared helper refuses it, and this proves
// the route is actually delegating there rather than describing that it does.
test('a calendar-impossible date is rejected rather than rolled forward', async () => {
  const client = makeClient({ reads: [row(null)] });
  const { status, body, calls } = await callPost(client, '2000-02-30');

  assert.equal(status, 400);
  assert.equal(body.code, 'invalid_date');
  assert.equal(calls.updates.length, 0);
});

// The shared reader is asserted by its BEHAVIOUR, not by grepping for its name —
// a route that re-implemented parsing locally would pass a name check and fail these.
test('an empty body is rejected by the shared reader', async () => {
  const client = makeClient({ reads: [row(null)] });
  const { status, calls } = await callPost(client, null, { body: '' });

  assert.equal(status, 400);
  assert.equal(calls.updates.length, 0);
});

test('an oversized body is rejected before it is read', async () => {
  const client = makeClient({ reads: [row(null)] });
  const { status, body, calls } = await callPost(client, '1985-05-05', {
    headers: { 'content-length': String(50_000_000) },
  });

  assert.equal(status, 413, 'the shared size cap must apply here like every other route');
  assert.match(body.error, /too large/i);
  assert.equal(calls.updates.length, 0);
});

test('an unauthenticated caller writes nothing', async () => {
  const client = makeClient({ user: null, reads: [row(null)] });
  const { status, calls } = await callPost(client, '1985-05-05');

  assert.equal(status, 401);
  assert.equal(calls.updates.length, 0);
});

// GET is the prompt's only input. Its three answers are what decide whether a
// member is asked, told their account is broken, or left alone.
test('GET reports the three states distinctly', async () => {
  const owes = await (await loadRoute(makeClient({ reads: [row(null)] }))).GET();
  assert.deepEqual(await owes.json(), { needed: true });

  const settled = await (await loadRoute(makeClient({ reads: [row('1990-01-01', true)] }))).GET();
  assert.deepEqual(await settled.json(), { needed: false });

  const broken = await (await loadRoute(makeClient({ reads: [noRow] }))).GET();
  assert.deepEqual(await broken.json(), { needed: true, blocked: 'no_profile' });
});

// ⚠ A READ FAULT MUST NOT TRAP ANYONE. This drives a blocking overlay; answering
// "needed" on an error we cannot interpret would hold every member behind a form
// over a question we never established needed asking.
test('GET fails as NOT-needed when it cannot read the row', async () => {
  const res = await (await loadRoute(makeClient({ reads: [readFault] }))).GET();
  assert.deepEqual(await res.json(), { needed: false, unknown: true });
});

test('GET refuses an unauthenticated caller', async () => {
  const res = await (await loadRoute(makeClient({ user: null }))).GET();
  assert.equal(res.status, 401);
});

// ⚠ THE IDENTITY COMPARISON MUST COMPARE THE VALUE POSTGRES ACTUALLY STORES.
// `isMinorFromDob` validates `dob.trim()`, so a body carrying surrounding
// whitespace passes validation — and the raw string was then both WRITTEN and
// COMPARED. Postgres parses ' 1985-05-05 ' into the date 1985-05-05 and hands
// back the canonical form, so the read-back could never equal what was sent, and
// the member was told their date was "already on file — contact support" on the
// first save that actually SUCCEEDED. That is the same lie one layer further in:
// a write that landed, reported as a refusal. Normalising once, before the write,
// makes the value validated, the value stored and the value compared one string.
test('surrounding whitespace does not turn a successful save into a refusal', async () => {
  const client = makeClient({ reads: [row(null), row('1985-05-05', true)] });
  const { status, body, calls } = await callPost(client, ' 1985-05-05\n');

  assert.deepEqual(calls.updates[0].patch, { date_of_birth: '1985-05-05' },
    'the trimmed date is what goes to the database');
  assert.equal(status, 200, 'a write that landed must not be reported as already_set');
  assert.equal(body.ok, true);
  assert.equal(body.date_of_birth, '1985-05-05');
});
