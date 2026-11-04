// Shape Radio's station server (services/station): the Icecast config entrypoint.sh writes from
// the environment, and what it refuses; the standby loop's checks; that only the stream is public;
// and the compose file that ties them to Nora's engine in station mode. Runs anywhere with sh, sed
// and grep (no Icecast needed); tests/radio-station-e2e.test.mjs runs the real server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const ENTRY = join(ROOT, 'services/station/icecast/entrypoint.sh');
// Stand-in passwords, plainly not real ones (the secret scan reads tests too).
const FAKE_SOURCE = 's'.repeat(24), FAKE_ADMIN = 'a'.repeat(24);
const FAKE_ENGINE = 'e'.repeat(40);
const GOOD = { ICECAST_SOURCE_PASSWORD: FAKE_SOURCE, ICECAST_ADMIN_PASSWORD: FAKE_ADMIN, STATION_HOST: 'radio.theshapecommunity.com', SHAPE_URL: 'https://www.theshapecommunity.com', NORA_ENGINE_TOKEN: FAKE_ENGINE };

function render(env) {
  const dir = mkdtempSync(join(tmpdir(), 'station-cfg-'));
  const out = join(dir, 'icecast.xml');
  const r = spawnSync('sh', [ENTRY], { env: { PATH: process.env.PATH, ICECAST_CHECK_ONLY: '1', ICECAST_CONFIG: out, ...env }, encoding: 'utf8' });
  let xml = null, mode = null;
  try { xml = readFileSync(out, 'utf8'); mode = statSync(out).mode & 0o777; } catch { /* not written */ }
  rmSync(dir, { recursive: true, force: true });
  return { status: r.status, err: r.stderr, xml, mode };
}

test('⚠ the server\'s config: the listeners\' mount falls back to the standby loop and comes back, with the passwords from the environment', () => {
  const r = render(GOOD);
  assert.equal(r.status, 0, r.err);
  assert.equal(r.mode, 0o600, 'readable by the server alone');
  const mount = (name) => r.xml.slice(r.xml.indexOf(`<mount-name>${name}</mount-name>`), r.xml.indexOf('</mount>', r.xml.indexOf(`<mount-name>${name}</mount-name>`)));
  assert.match(mount('/live'), /<fallback-mount>\/standby<\/fallback-mount>/);
  assert.match(mount('/live'), /<fallback-override>1<\/fallback-override>/);
  assert.match(mount('/standby'), /<hidden>1<\/hidden>/);
  // ⚠ The players load the stream with crossOrigin="anonymous": each mount answers with exactly one
  // Access-Control-Allow-Origin (Icecast 2.4.4 never applied a top-level block to a listener, and
  // one there could double the header, which browsers refuse as surely as a missing one).
  for (const m of ['/live', '/standby']) {
    assert.equal((mount(m).match(/<header name="Access-Control-Allow-Origin" value="\*" \/>/g) || []).length, 1, `${m} carries the header once`);
  }
  // ⚠ Members only, at the door: /live asks Shape about each listener's pass; /standby (not public:
  // Caddy passes /live alone) needs none, and a listener falling back to it was let in at /live.
  const door = mount('/live').replace(/<!--[\s\S]*?-->/g, '');
  // ⚠ And every session is kept (part 4): Shape hears each listener leave too, from the station
  // alone (it signs in with the engine's token), and each call names this start of the station.
  const auth = /<authentication type="url">\s*<option name="listener_add" value="https:\/\/www\.theshapecommunity\.com\/api\/radio\/pass\?boot=(\d{9,11}\.[0-9a-f]{16})" \/>\s*<option name="listener_remove" value="https:\/\/www\.theshapecommunity\.com\/api\/radio\/pass\?boot=(\d{9,11}\.[0-9a-f]{16})" \/>\s*<option name="username" value="station" \/>\s*<option name="password" value="([^"]+)" \/>\s*<option name="auth_header" value="icecast-auth-user: 1" \/>\s*<\/authentication>/.exec(door);
  assert.ok(auth, door);
  assert.equal(auth[1], auth[2], 'one start, named on both');
  assert.ok(Math.abs(Number(auth[1].split('.')[0]) - Date.now() / 1000) < 60, 'named by its own time');
  assert.equal(auth[3], FAKE_ENGINE, 'the engine\'s token');
  // ⚠ Each start its own name, in a later second than the one before (Codex, #2582): Shape closes a
  // start's open sessions at the next start, found by its second.
  const next = render(GOOD).xml.match(/boot=([0-9a-f.]+)/)[1];
  assert.notEqual(next, auth[1], 'each start its own name');
  assert.ok(Number(next.split('.')[0]) > Number(auth[1].split('.')[0]), `a restart is named in a later second: ${auth[1]} then ${next}`);
  assert.match(read('services/station/icecast/entrypoint.sh'), /\nsleep 1\nBOOT="\$\(date -u \+%s\)\./, 'a second before naming each start');
  assert.ok(!/<authentication/.test(mount('/standby')));
  const outside = r.xml.replace(/<mount[\s\S]*?<\/mount>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/<http-headers>/.test(outside), 'no top-level header block to double it');
  assert.match(r.xml, new RegExp(`<source-password>${GOOD.ICECAST_SOURCE_PASSWORD}</source-password>`));
  assert.match(r.xml, new RegExp(`<admin-password>${GOOD.ICECAST_ADMIN_PASSWORD}</admin-password>`));
  assert.match(r.xml, /<hostname>radio\.theshapecommunity\.com<\/hostname>/);
  assert.match(r.xml, /<port>8000<\/port>/);
  assert.match(r.xml, /<clients>2000<\/clients>/);
  assert.match(r.xml, /<source-timeout>10<\/source-timeout>/, 'a source gone quiet hands its listeners to the loop within seconds');
  assert.ok(!/\$\{/.test(r.xml), 'nothing left unfilled');
  const custom = render({ ...GOOD, ICECAST_PORT: '18000', ICECAST_MAX_LISTENERS: '50' }).xml;
  assert.match(custom, /<port>18000<\/port>/);
  assert.match(custom, /<clients>50<\/clients>/);
});

test('⚠ it refuses to start on a missing, short, unsafe or shared password, or a bad value', () => {
  const refused = (over, why) => { const r = render({ ...GOOD, ...over }); assert.equal(r.status, 2, `${why}: ${r.err}`); assert.equal(r.xml, null, `${why}: no config written`); };
  refused({ ICECAST_SOURCE_PASSWORD: '' }, 'no source password');
  refused({ ICECAST_ADMIN_PASSWORD: '' }, 'no admin password');
  refused({ ICECAST_SOURCE_PASSWORD: 'short1' }, 'a short password');
  refused({ ICECAST_SOURCE_PASSWORD: `${FAKE_SOURCE}@evil` }, 'a password that would break the engine\'s address');
  refused({ ICECAST_ADMIN_PASSWORD: `${FAKE_ADMIN}</admin-password>` }, 'a password that would break the XML');
  refused({ ICECAST_ADMIN_PASSWORD: GOOD.ICECAST_SOURCE_PASSWORD }, 'the same password twice');
  refused({ STATION_HOST: '' }, 'no host');
  refused({ STATION_HOST: 'radio.example.com|evil' }, 'a host with a sed delimiter');
  refused({ ICECAST_PORT: 'eighty' }, 'a port that is not a number');
  refused({ ICECAST_MAX_LISTENERS: '-1' }, 'a listener cap that is not a number');
  refused({ ICECAST_ADMIN_EMAIL: 'not an email' }, 'an admin address that is not one');
  refused({ SHAPE_URL: '' }, 'no Shape to check passes with');
  refused({ NORA_ENGINE_TOKEN: '' }, 'no token to sign in to Shape with');
  refused({ NORA_ENGINE_TOKEN: 'e'.repeat(20) }, 'a short token');
  refused({ NORA_ENGINE_TOKEN: `${'e'.repeat(40)}|x` }, 'a sed delimiter in the token');
  refused({ NORA_ENGINE_TOKEN: `${'e'.repeat(40)}"/>` }, 'markup in the token');
  refused({ SHAPE_URL: 'http://www.theshapecommunity.com' }, 'passes sent in clear text');
  refused({ SHAPE_URL: 'https://www.theshapecommunity.com/api' }, 'a path on Shape’s address');
  refused({ SHAPE_URL: 'https://evil.example|x' }, 'a sed delimiter');
  assert.equal(render({ ...GOOD, SHAPE_URL: 'http://127.0.0.1:3000' }).status, 0, 'a Shape on this machine, for a test');
});

test('the standby loop checks its password and bitrate before it connects, and loops a file the station owns', () => {
  const sh = join(ROOT, 'services/station/standby/standby.sh');
  const run = (env) => spawnSync('sh', [sh], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', timeout: 5000 });
  assert.equal(run({ ICECAST_SOURCE_PASSWORD: 'short' }).status, 2);
  assert.equal(run({ ICECAST_SOURCE_PASSWORD: GOOD.ICECAST_SOURCE_PASSWORD, NORA_BITRATE: '192kbps;rm' }).status, 2);
  const src = read('services/station/standby/standby.sh');
  assert.match(src, /-re -stream_loop -1 -i "\$file"/, 'played in real time, on a loop');
  assert.match(src, /icecast:\/\/source:\$\{ICECAST_SOURCE_PASSWORD\}@\$\{host\}\/standby/);
  assert.match(src, /-ac 2 -ar 44100/, 'the same format as the engine\'s, so a listener crosses without a hitch');
  // The built-in loop: tones that complete whole cycles in its 60 s, so the loop has no seam.
  const freqs = [...src.matchAll(/sin\(2\*PI\*([0-9./]+)\*t\)/g)].map((m) => Function(`return ${m[1]}`)());
  assert.ok(freqs.length >= 5 && freqs.every((f) => Math.abs(f * 60 - Math.round(f * 60)) < 1e-6), String(freqs));
  const swells = [...src.matchAll(/sin\(2\*PI\*t\/(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(swells.length >= 5 && swells.every((p) => 60 % p === 0), String(swells));
});

test('⚠ only the stream is public: Caddy passes /live alone; Icecast\'s admin stays on the private network', () => {
  const caddy = read('services/station/caddy/Caddyfile').replace(/#.*$/gm, '');
  const handles = [...caddy.matchAll(/handle(\s+\S+)?\s*\{/g)].map((m) => (m[1] || '').trim());
  assert.deepEqual(handles, ['/live', ''], 'one path through, and a 404 for the rest');
  assert.match(caddy, /handle \/live \{\s*reverse_proxy icecast:8000 \{\s*flush_interval -1/);
  assert.match(caddy, /handle \{\s*respond "Shape Radio" 404/);
  const compose = read('services/station/docker-compose.yml');
  assert.match(compose, /"127\.0\.0\.1:8000:8000"/, 'Icecast is reachable from the machine only');
  assert.ok(!/"8000:8000"/.test(compose));
  assert.match(compose, /NORA_MODE: station/);
  assert.match(compose, /NORA_STREAM_URL: icecast:\/\/source:\$\{ICECAST_SOURCE_PASSWORD:\?set it in \.env\}@icecast:8000\/live/);
  assert.match(compose, /image: caddy:\d+\.\d+\.\d+/, 'a pinned Caddy');
  for (const s of ['icecast', 'standby', 'engine', 'caddy']) assert.match(compose, new RegExp(`\\n  ${s}:[\\s\\S]*?restart: always`), `${s} restarts`);
  // The secrets live in .env, which is never committed; the example has none.
  assert.ok(!/=[A-Za-z0-9]{16,}/.test(read('services/station/.env.example')));
  assert.match(read('.gitignore'), /^\.env\*$/m);
});
