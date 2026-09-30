// The coach dashboard's roster enrichment reads every client's overview in ONE
// POST /api/clients/shared-overview per 50 clients (2026-09-30). Until then it
// was a 4-wide pool of single GETs — 30 clients, 30 requests, 30 auth round
// trips. This file lifts the data layer's cache block out of dashData.jsx and
// drives the batch read with a scripted fetch, the way
// website-navigation-performance.test.mjs drives _dashJson.
//
// The property that keeps the rest of the page working is WHERE the results
// land: under each client's single-route cache key, so the drawer's per-client
// read, the refresh event's per-client invalidation and the lastProgressRead
// stamp never learned that anything changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(join(ROOT, 'public/newdesign/dashData.jsx'), 'utf8');
const ids = (n) => Array.from({ length: n }, (_, i) => `c${i + 1}`);

function harness(fetch) {
  const start = SRC.indexOf('const DASH_CACHE_TTL');
  const end = SRC.indexOf('// Map one roster row');
  assert.ok(start > 0 && end > start, 'the cache block anchors moved');
  const block = SRC.slice(start, end);
  return new Function('fetch', block + '\nreturn { overviews: _dashOverviews, cache: _dashCache, key: _dashOverviewKey, MAX: DASH_BATCH_MAX, TTL: DASH_CACHE_TTL };')(fetch);
}
// A fetch that answers the batch route: `results` for the ids it is asked for,
// minus `omit`; records every call.
function scripted({ omit = [], status = 200, gate = null } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, method: init.method, credentials: init.credentials, contentType: init.headers['content-type'], ids: body.ids });
    if (gate) await gate;
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    const results = {};
    for (const id of body.ids) if (!omit.includes(id)) results[id] = { client: { id }, stats: { n: 1 } };
    return { ok: true, status: 200, json: async () => ({ me: { trainerId: 7, nutritionistId: null }, results, failed: omit.filter((o) => body.ids.includes(o)) }) };
  };
  return { fetch, calls };
}

test('a roster of three is ONE POST, and every result lands under its client\'s single-route cache key', async () => {
  const { fetch, calls } = scripted();
  const h = harness(fetch);
  const out = await h.overviews(ids(3));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { url: '/api/clients/shared-overview', method: 'POST', credentials: 'same-origin', contentType: 'application/json', ids: ['c1', 'c2', 'c3'] });
  assert.deepEqual(out.map((o) => o && o.client.id), ['c1', 'c2', 'c3']);
  for (const id of ids(3)) {
    const entry = h.cache.get(h.key(id));
    assert.ok(entry && typeof entry.at === 'number' && entry.data.client.id === id, `${id} is not cached under ${h.key(id)}`);
  }
  assert.equal(h.key('a/b c'), '/api/clients/a%2Fb%20c/shared-overview', 'the key is the single route\'s own URL shape, encoded');
});

test('a client the batch could not build resolves null and is NOT cached; the others are', async () => {
  const { fetch } = scripted({ omit: ['c2'] });
  const h = harness(fetch);
  const out = await h.overviews(ids(3));
  assert.equal(out[1], null);
  assert.ok(out[0] && out[2]);
  assert.equal(h.cache.has(h.key('c2')), false, 'a failure must not stick for the TTL');
  assert.ok(h.cache.has(h.key('c1')) && h.cache.has(h.key('c3')));
});

test('fresh cache entries are served without a request; stale ones are re-requested', async () => {
  const { fetch, calls } = scripted();
  const h = harness(fetch);
  h.cache.set(h.key('c1'), { at: Date.now(), data: { client: { id: 'c1' }, fresh: true } });
  h.cache.set(h.key('c2'), { at: Date.now() - h.TTL - 1, data: { client: { id: 'c2' }, stale: true } });
  const out = await h.overviews(ids(3));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].ids, ['c2', 'c3'], 'only the stale and the missing client are requested');
  assert.equal(out[0].fresh, true, 'the fresh entry is served as-is');
  assert.equal(out[1].stale, undefined, 'the stale entry was replaced');
});

test('sixty clients are two requests, split at the route\'s cap, with the output in roster order', async () => {
  const { fetch, calls } = scripted();
  const h = harness(fetch);
  assert.equal(h.MAX, 50);
  const out = await h.overviews(ids(60));
  assert.deepEqual(calls.map((c) => c.ids.length), [50, 10]);
  assert.deepEqual(out.map((o) => o.client.id), ids(60));
});

test('two mounts asking for the same roster at once share ONE request', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { fetch, calls } = scripted({ gate });
  const h = harness(fetch);
  const p1 = h.overviews(ids(2));
  const p2 = h.overviews(ids(2));
  release();
  const [a, b] = await Promise.all([p1, p2]);
  assert.equal(calls.length, 1);
  assert.deepEqual(a.map((o) => o.client.id), ['c1', 'c2']);
  assert.deepEqual(b.map((o) => o.client.id), ['c1', 'c2']);
});

test('a non-OK response yields nulls, caches nothing, does not throw — and the next call retries', async () => {
  const s = scripted({ status: 500 });
  const h = harness(s.fetch);
  const out = await h.overviews(ids(2));
  assert.deepEqual(out, [null, null]);
  assert.equal(h.cache.size, 0);
  // The in-flight entry was cleared, so a later call issues a new request rather than
  // re-using the failed promise.
  await h.overviews(ids(2));
  assert.equal(s.calls.length, 2);
});

test('a row with no id is null and is never sent', async () => {
  const { fetch, calls } = scripted();
  const h = harness(fetch);
  const out = await h.overviews(['c1', undefined, null, 'c2']);
  assert.deepEqual(calls[0].ids, ['c1', 'c2']);
  assert.equal(out[1], null);
  assert.equal(out[2], null);
});

test('the roster pipeline calls the batch read and the per-client pool is gone', () => {
  const src = stripComments(SRC);
  assert.match(src, /_dashOverviews\(rows\.map\(\(row\) => row\.id\)\)/, 'useDashboard no longer enriches through _dashOverviews');
  assert.doesNotMatch(src, /_dashPool|DASH_POOL_SIZE/, 'the per-client pool is back');
  // The drawer's per-client invalidation and the read stamp key on the same URL shape.
  assert.match(src, /_dashCache\.delete\(_dashOverviewKey\(id\)\)/);
  assert.match(src, /_dashCache\.get\(_dashOverviewKey\(row\.id\)\)/);
});
