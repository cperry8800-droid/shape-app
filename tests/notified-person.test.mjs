// tests/notified-person.test.mjs
//
// A FRIEND'S HABIT NOTICE OPENS THE FRIEND (Codex on #2413). The 8 pm notice rode a follow's
// `profile` route, and every shell opens that one on the reader's OWN profile (where follow
// requests are answered), so the notice never reached the person it was about. It now carries
// `person:<user>`, and each shell opens BSNotifiedPerson over the page underneath: the person's
// profile, read by id (get_public_profile), with Back closing it.
//
// Mounted with a react impl whose effects run, so the read → render path is production's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive, textOf, SHIM } from './helpers/broadsheet-mount.mjs';

// The overlay portals into #bs-phone-surface, else document.body; the harness hands it back in place.
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null, body: {} };

const RUN_EFFECTS = { ...SHIM, useEffect(fn) { fn(); } };
const { BSNotifiedPerson } = await loadBroadsheet(['BSNotifiedPerson'], RUN_EFFECTS);

const settle = () => new Promise((r) => setTimeout(r, 0));
const profileOf = (d) => d.nodes().find((n) => typeof n.type === 'function' && n.type.name === 'BSPublicProfile');

async function open(userId, { me = 'zoe', profile } = {}) {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id: me } }) };
  const asked = [];
  globalThis.window.ShapeProfiles = { getPublicProfile: async (id) => { asked.push(id); return typeof profile === 'function' ? profile(id) : profile; } };
  const onClose = () => {};
  const d = drive(BSNotifiedPerson, { userId, onClose });
  const before = profileOf(d);
  const backBefore = d.nodes().find((n) => n.type === 'button' && n.props['data-person-back']);
  await settle();
  d.render();
  return { d, before, backBefore, asked, onClose };
}

test('it opens the named person\'s profile, read by their id', async () => {
  const { d, before, backBefore, asked, onClose } = await open('ann', { profile: { userId: 'ann', name: 'Ann Lee', role: 'client', avatar: 'ann.png', points: 800 } });
  assert.equal(before, undefined, 'no profile is drawn until the read answers');
  // Codex on #2413: while the read is out the page is a Back, never a blank screen with no way out.
  assert.ok(backBefore, 'a Back is there from the first frame');
  assert.equal(backBefore.props.onClick, onClose, 'and it closes the page');
  assert.match(textOf(backBefore), /Back/);
  assert.equal(d.nodes().find((n) => n.type === 'button' && n.props['data-person-back']), undefined, 'the profile\'s own Back takes over once it is drawn');
  assert.ok(asked.length >= 1 && asked.every((id) => id === 'ann'), 'the read asks for that person, and only them');
  const p = profileOf(d);
  assert.ok(p, 'the profile opens');
  assert.equal(p.props.person.userId, 'ann');
  assert.equal(p.props.person.who, 'Ann Lee');
  assert.equal(p.props.person.kind, 'CLIENT');
  assert.equal(p.props.person.photo, 'ann.png');
  assert.equal(p.props.person.public, true);
  assert.equal(p.props.onBack, onClose, 'Back closes it');
  assert.equal(typeof p.props.onMessage, 'function', 'the reader can message them from it');
});

test('a coach opens on their coach profile', async () => {
  const { d } = await open('jo', { profile: { userId: 'jo', name: 'Jo Park', role: 'trainer', points: 0 } });
  assert.equal(profileOf(d).props.person.kind, 'TRAINER');
  const nutri = await open('may', { profile: { userId: 'may', name: 'May Ito', role: 'nutritionist', points: 0 } });
  assert.equal(profileOf(nutri.d).props.person.kind, 'NUTRI');
});

test('an unreadable profile still opens on the id, for the profile\'s own read to fill', async () => {
  const { d } = await open('ann', { profile: null });
  const p = profileOf(d);
  assert.ok(p);
  assert.equal(p.props.person.userId, 'ann');
  assert.equal(p.props.person.who, '');
  const thrown = await open('ann', { profile: () => { throw new Error('offline'); } });
  assert.equal(profileOf(thrown.d).props.person.userId, 'ann', 'a read that throws opens it too');
});

test('there is no message button on one\'s own profile', async () => {
  const { d } = await open('zoe', { me: 'zoe', profile: { userId: 'zoe', name: 'Zoe Ray', role: 'client' } });
  assert.equal(profileOf(d).props.onMessage, null);
});
