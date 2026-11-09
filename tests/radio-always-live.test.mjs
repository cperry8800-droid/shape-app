// tests/radio-always-live.test.mjs
//
// Shape Radio has no off (owner, 2026-10-18: "remove the radio toggle, just have
// shape radio live on app but doesnt play unless you click on volume or allow it
// to play sound"). The station is always on air in the app: now-playing is polled
// for everyone, and the one thing a member chooses is the sound — muted until the
// ask-prompt's yes or the speaker on the radio bar unmutes it, and kept on the
// device so the next launch starts the way they left it.
//
// The module is a browser JSX file with React imports, so it cannot be imported.
// As in the other radio guards, the shipped functions are cut out of the source
// and RUN against stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './helpers/strip-comments.mjs';

const RADIO = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx', import.meta.url), 'utf8');
const CLIENT = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
const code = stripComments(RADIO);

function braced(src, marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `marker not found in the shipped source: ${marker}`);
  assert.equal(src.indexOf(marker, at + 1), -1, `marker is ambiguous: ${marker}`);
  const open = src.indexOf('{', at + marker.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'i18n') walk(p, out); }
    else if (/\.(jsx?|mjs|tsx?)$/.test(name)) out.push(p);
  }
  return out;
}

test('there is no radio off, anywhere in the app', () => {
  const provider = stripComments(braced(RADIO, 'function BSRadioProvider({ children }) {'));
  assert.doesNotMatch(provider, /radioOn|setRadioOn|setRadioPreference/, 'the provider has an on/off again');
  for (const file of walk('mobile-app/src')) {
    const body = stripComments(readFileSync(file, 'utf8'));
    assert.doesNotMatch(body, /\.radioOn\b|setRadioPreference/, `${file} reads or sets a radio on/off`);
  }
});

// The provider's playback effect, lifted and RUN. Found from the line that closes
// it, the same way tests/radio-signal-field-layout.test.mjs finds it.
function playbackEffect() {
  const end = /\}, \[paused, authTick[^\]]*\]\);/.exec(RADIO);
  assert.ok(end, 'the playback effect is gone — this guard no longer names anything');
  const i = RADIO.lastIndexOf('useEffectBR(() => {', end.index);
  const body = RADIO.slice(RADIO.indexOf('{', i) + 1, RADIO.lastIndexOf('}', end.index));
  // eslint-disable-next-line no-new-func
  return new Function('paused', 'authTick', 'window', 'setNowPlaying', 'setPlayingSince', 'startPlay', 'cancelPlay', body);
}

function runEffect({ paused, signedIn }) {
  const log = [];
  const win = {
    ShapeAuth: { getCachedState: () => ({ user: signedIn ? { id: 'u1' } : null }) },
    ShapeRadioLive: {
      startPolling: () => log.push('poll'),
      stopPolling: () => log.push('stopPoll'),
      pause: () => log.push('pause'),
    },
  };
  const cleanup = playbackEffect()(paused, 0, win, () => {}, () => {}, () => log.push('play'), () => log.push('cancel'));
  return { log, cleanup };
}

test('the station is polled whether or not the member is listening, and plays only unmuted', () => {
  const muted = runEffect({ paused: true, signedIn: true });
  assert.ok(muted.log.includes('poll'), 'a muted radio stopped showing what is on air');
  assert.ok(!muted.log.includes('play'), 'a muted radio was asked to play');
  assert.ok(muted.log.includes('pause'), 'muting does not silence the stream');

  const listening = runEffect({ paused: false, signedIn: true });
  assert.ok(listening.log.includes('poll'), 'a playing radio stopped polling now-playing');
  assert.ok(listening.log.includes('play'), 'an unmuted radio was never asked to play');

  // Licensing, not product: a signed-out session sees the station and hears nothing.
  const signedOut = runEffect({ paused: false, signedIn: false });
  assert.ok(signedOut.log.includes('poll'), 'a signed-out session lost the station');
  assert.ok(!signedOut.log.includes('play'), 'a signed-out session was played at');

  listening.cleanup();
  assert.deepEqual(listening.log.slice(-2), ['cancel', 'stopPoll'], 'the cleanup no longer cancels the attempt and the poll');
});

test('muted is the resting state, and the member\'s choice is kept on the device', () => {
  const m = RADIO.match(/const \[paused, setPausedState\]\s*= useStateBR\(([^;]+)\);/);
  assert.ok(m, 'the sound switch is no longer seeded where this guard looks');
  // eslint-disable-next-line no-new-func
  const seed = (pref) => new Function('_radioPref', `return ${m[1]};`)(pref);
  assert.equal(seed(null), true, 'a member who never answered is played at');
  assert.equal(seed({ asked: true, on: false }), true, 'a member who muted is played at on the next launch');
  assert.equal(seed({ asked: true, on: true }), false, 'a member who unmuted starts silent');

  const setPaused = braced(RADIO, 'function setPaused(next) {');
  const calls = [];
  // eslint-disable-next-line no-new-func
  const run = new Function('setPausedState', 'persistRadioPref', `${setPaused}\nreturn setPaused;`)(
    (v) => calls.push(['state', v]),
    (asked, on) => calls.push(['persist', on]),
  );
  run(true);
  assert.deepEqual(calls, [['state', true], ['persist', false]], 'muting is not kept');
  calls.length = 0;
  run(false);
  assert.deepEqual(calls, [['state', false], ['persist', true]], 'unmuting is not kept');
});

test('the Home bar is muted only on the measured key, and its play control says what can be heard', () => {
  const bar = stripComments(braced(RADIO, 'function BSNowPlaying({ onOpen }) {'));
  assert.match(bar, /if \(key === 'resume'\) return <BSNowPlayingMuted onTurnOn=\{\(\) => r\.setPaused\(false\)\}/,
    'the muted bar no longer follows the deck\'s key, or its Tune in no longer unmutes');
  // No speaker (owner, 2026-11-04: "we dont need the volume button since the phone will control that"):
  // the round control plays and pauses, ❚❚ only while the measured key says sound is playing.
  assert.match(bar, /<BSPlayGlyph playing=\{key === 'pause'\} /, 'the live bar\'s play control no longer reads the measured key');
  assert.match(bar, /const playing = key === 'pause';/, 'the ON AIR ring and the level read something other than the measured key');
  assert.doesNotMatch(bar, /BSSpeakerGlyph/, 'the speaker is back');
  // Every control on the slim box is 44 wide and 44 tall to tap, the votes included (Codex on #2581).
  for (const m of bar.matchAll(/<button[\s\S]*?style=\{\{([\s\S]*?)\}\}/g)) {
    const style = m[1];
    if (/minWidth|width:/.test(style)) assert.match(style, /(?:minWidth|width): 44\b/, `a control under 44 wide: ${style.slice(0, 80)}`);
  }
  const muted = stripComments(braced(RADIO, 'function BSNowPlayingMuted({ onTurnOn, onOpen }) {'));
  assert.match(muted, /<BSPlayGlyph playing=\{false\}/, 'the muted bar\'s play control does not show ▶');
  assert.equal((muted.match(/onTurnOn && onTurnOn\(\)/g) || []).length, 2, 'the muted bar\'s ▶ and Tune in do not both turn the sound on');
  assert.doesNotMatch(muted, /BSSpeakerGlyph/, 'the speaker is back');
});

test('the Radio page and Settings offer no off', () => {
  const screen = stripComments(braced(RADIO, 'function BSRadioScreen({ onBack }) {'));
  assert.doesNotMatch(screen, /radio:screen\.stop|>■</, 'the Radio page has a Stop again');
  assert.doesNotMatch(code, /radio:prompt\.changeAnytime/, 'the prompt points at a Settings switch that does not exist');

  // The radio's row sits on Customize's Light effects plate since 2026-11-09 (the effects run while it
  // plays): its name and its reading, the reading worked out above the plate's markup.
  const at = CLIENT.indexOf("{tr('settings:radio.title'");
  assert.ok(at > 0, 'the Settings radio row moved — this guard no longer names it');
  const row = stripComments(CLIENT.slice(CLIENT.lastIndexOf('<div', at), CLIENT.indexOf('</div>', at)));
  assert.match(row, /data-settings-radio-state=\{radioOn \? 'playing' : 'paused'\}/, 'this is not the radio row');
  assert.doesNotMatch(row, /<Toggle|onClick/, 'Settings → Shape Radio has a switch again');
  const reading = CLIENT.slice(CLIENT.lastIndexOf('const radioOn = ', at), at);
  assert.match(reading, /^const radioOn = r\.playingSince != null;/, 'the row reports what was asked for instead of what is playing');
  assert.doesNotMatch(CLIENT, /settings:quick\.radio/, 'the Radio quick switch is back');
});
