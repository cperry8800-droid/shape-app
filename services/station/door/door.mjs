// Shape Radio's door: drops the listeners Shape names (owner, 2026-11-10: Shape Radio only for the
// account listening, on its own paid membership). Every few seconds it asks Shape
// (/api/radio/kicks, signed in as the station) which of this start's connections to drop — an
// account's older device once a newer one connected, or an account whose membership ended or went
// past due — and drops each with Icecast's own admin command, inside this machine. Icecast then
// tells Shape the listener left (/api/radio/pass), which clears the record.
//
//   SHAPE_URL               Shape, e.g. https://www.theshapecommunity.com
//   NORA_ENGINE_TOKEN       the station's sign-in to Shape (the engine's token)
//   ICECAST_ADMIN_PASSWORD  Icecast's admin password
//   ICECAST_URL             optional, default http://icecast:8000 (never public: Caddy serves /live only)
//   STATION_BOOT_FILE       where Icecast's container wrote this start's name
//   DOOR_POLL_MS            optional, default 3000
//
// It knows connections by Icecast's numbers only, never an account.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const MOUNTS = ['/live', '/standby'];
const BOOT = /^\d{9,11}\.[0-9a-f]{16}$/;

const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;

/** This start of the station's name, or null when Icecast has not written it yet. */
export async function readBoot(file, read = readFile) {
  try {
    const boot = String(await read(file, 'utf8')).trim();
    return BOOT.test(boot) ? boot : null;
  } catch {
    return null;
  }
}

/**
 * One round: ask Shape, drop each connection it names (on /live, else /standby, where a listener
 * waits while the engine is off).
 * @returns {Promise<{ok: true, asked: number, dropped: number[]} | {ok: false, reason: string}>}
 */
export async function pollOnce({ env = process.env, fetchImpl = fetch, boot }) {
  if (!boot) return { ok: false, reason: 'no_boot' };
  const shape = String(env.SHAPE_URL || '').replace(/\/+$/, '');
  const icecast = String(env.ICECAST_URL || 'http://icecast:8000').replace(/\/+$/, '');
  let clients = [];
  try {
    const r = await fetchImpl(`${shape}/api/radio/kicks?boot=${encodeURIComponent(boot)}`, {
      headers: { authorization: basic('station', String(env.NORA_ENGINE_TOKEN || '')) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return { ok: false, reason: `shape_${r.status}` };
    const body = await r.json();
    clients = Array.isArray(body?.clients) ? body.clients : [];
  } catch {
    return { ok: false, reason: 'shape_unreachable' };
  }
  const admin = basic('admin', String(env.ICECAST_ADMIN_PASSWORD || ''));
  const dropped = [];
  for (const client of clients) {
    if (!Number.isSafeInteger(client) || client < 0) continue;
    for (const mount of MOUNTS) {
      try {
        const k = await fetchImpl(`${icecast}/admin/killclient?mount=${encodeURIComponent(mount)}&id=${client}`, {
          headers: { authorization: admin },
          signal: AbortSignal.timeout(5_000),
        });
        // Icecast answers <return>1</return> when it dropped the client, 0 when it is not on that mount.
        if (k.ok && /<return>\s*1\s*<\/return>/.test(await k.text())) { dropped.push(client); break; }
      } catch { /* the next mount, or the next round */ }
    }
  }
  return { ok: true, asked: clients.length, dropped };
}

async function main() {
  const file = process.env.STATION_BOOT_FILE || '/run/station/boot';
  const every = Math.max(1000, Number(process.env.DOOR_POLL_MS) || 3000);
  for (const need of ['SHAPE_URL', 'NORA_ENGINE_TOKEN', 'ICECAST_ADMIN_PASSWORD']) {
    if (!process.env[need]) { console.error(`door: ${need} is not set`); process.exit(2); }
  }
  for (;;) {
    const r = await pollOnce({ boot: await readBoot(file) });
    if (r.ok && r.dropped.length) console.log(`door: dropped ${r.dropped.length} of ${r.asked}`);
    else if (!r.ok && r.reason !== 'no_boot') console.error(`door: ${r.reason}`);
    await new Promise((res) => setTimeout(res, every));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
