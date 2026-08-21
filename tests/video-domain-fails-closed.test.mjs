// VIDEO CALLING MUST FAIL CLOSED, NOT FALL BACK TO A PUBLIC HOST.
//
// `jitsiDomain()` used to return `process.env.JITSI_DOMAIN || 'meet.jit.si'`. With
// nothing configured — which is the state this deployment is actually in — every
// coaching call was silently routed through a third party Shape has no
// data-processing agreement with, and which appears in none of the documents in
// docs/legal/. Nothing errored and nothing warned; the failure was invisible
// precisely because the calls worked.
//
// Two properties are pinned here, and both are about the ABSENCE of a value:
//   1. no configured domain  -> no room URL at all (never a public fallback)
//   2. a malformed domain    -> no room URL at all (never a guessed one)
//
// ⚠ THE PATTERN IS READ OUT OF THE SOURCE, NOT COPIED. A copy would keep passing
// after someone loosened the real one, which is the only way this defect returns.
// The module is .ts and the suite is plain node, so the shipped regex literal is
// extracted and exercised directly rather than reimplemented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/lib/video.ts', 'utf8');

test('no public-host fallback survives anywhere in the module', () => {
  // Comments explain the removed fallback on purpose; code must not contain it.
  const code = SRC.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(
    code,
    /\|\|\s*['"`]meet\.jit\.si/,
    'the public meet.jit.si fallback is back — every unconfigured deployment routes coaching calls through an uncontracted third party'
  );
});

test('an unset or blank domain yields no room', () => {
  const code = SRC.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.match(code, /return null/, 'videoRoomUrl must be able to decline');
  assert.match(
    code,
    /videoRoomUrl[\s\S]*?if \(!domain\) return null/,
    'videoRoomUrl must return null when no domain is configured, before building any URL'
  );
});

function shippedHostnamePattern() {
  const m = SRC.match(/const HOSTNAME = (\/.*\/i);/);
  assert.ok(m, 'HOSTNAME literal not found in src/lib/video.ts — the guard was restructured; re-read it');
  return new RegExp(m[1].slice(1, m[1].lastIndexOf('/')), 'i');
}

test('the domain guard rejects anything that could redirect the room', () => {
  const re = shippedHostnamePattern();
  // ⚠ Each of these interpolates into `https://${domain}/shape-<id>` and would
  // send a member somewhere other than the intended host. `evil@real` resolves to
  // evil while READING as real, which is the one a human reviewer waves through.
  for (const hostile of [
    'evil.test/x',
    'evil.test@real.test',
    'https://evil.test',
    'evil.test#',
    'evil.test?a=1',
    'evil test',
    '',
    '..',
  ]) {
    assert.equal(re.test(hostile), false, `must reject: ${JSON.stringify(hostile)}`);
  }
});

test('the domain guard still accepts a real host', () => {
  const re = shippedHostnamePattern();
  // Both arms, or the rejection test above proves only that the regex is strict.
  for (const ok of ['jitsi.shape.example', 'meet.example.co.uk', 'host.example:8443']) {
    assert.equal(re.test(ok), true, `must accept: ${ok}`);
  }
});

test('the confirm path tolerates having no room', () => {
  const route = readFileSync('src/app/api/sessions/manage/route.ts', 'utf8');
  // Writing the null straight onto the patch would clear an existing URL and make
  // the confirm depend on video config it should not depend on.
  assert.match(
    route,
    /const room = videoRoomUrl\([\s\S]{0,40}?\);\s*\n\s*if \(room\) patch\.meeting_url = room;/,
    'confirm must set meeting_url only when a room exists, so a session still confirms without video'
  );
});
