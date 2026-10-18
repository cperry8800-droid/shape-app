// /api/integrations/status reads the member's connections as the caller, Bearer or cookie. The
// installed app sends a Bearer token and no cookie, and the route read user_integrations with the
// cookie-only client, as anon: the table is readable `to authenticated` only, so every provider
// came back unconnected, and the check-in card never asked a watch for last night (review on the
// device-first check-in). Run as written: the real route on a stub client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

async function status({ user = { id: 'member-1' }, rows = [] } = {}) {
  const asked = [];
  const client = { from: (table) => ({ select: () => ({ eq: async (k, v) => { asked.push({ table, k, v }); return { data: rows, error: null }; } }) }) };
  const mod = await loadRealModule(join(ROOT, 'src/app/api/integrations/status/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      // Only the caller's own client is offered: a cookie-only client would fail to load.
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => user }],
      ['@/lib/integrations/providers', await loadRealModule(join(ROOT, 'src/lib/integrations/providers.ts'), { typescript: true })],
    ]),
  });
  const res = await mod.GET(new Request('https://x/api/integrations/status', { headers: { authorization: 'Bearer t' } }));
  return { status: res.status, body: await res.json(), asked };
}

test("the installed app's Bearer request sees the member's connections", async () => {
  const { status: code, body, asked } = await status({ rows: [{ provider: 'oura', connected_at: '2026-10-01' }, { provider: 'apple_health', connected_at: '2026-10-02' }] });
  assert.equal(code, 200);
  const on = body.providers.filter((p) => p.connected).map((p) => p.id).sort();
  assert.deepEqual(on, ['apple_health', 'oura']);
  assert.deepEqual(asked, [{ table: 'user_integrations', k: 'user_id', v: 'member-1' }]);
});

test('no signed-in caller is a 401', async () => {
  const { status: code } = await status({ user: null });
  assert.equal(code, 401);
});
