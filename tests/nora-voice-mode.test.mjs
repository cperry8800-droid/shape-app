// Talk to Nora and the Listen fix, on both surfaces (owner, 2026-10-08: "a button in chat
// where you can initiate talking and her face appears / For both app and website / Also
// the listen button under the message isn't working").
//
// Listen did nothing on a phone because each reply played on a new Audio() after the
// network wait, which Safari blocks: only an element a tap started may play. Both surfaces
// now keep one player and unlock it inside the tap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { ROOT, loadBroadsheet, drive, SHIM, THEME, flatten, textOf } from './helpers/broadsheet-mount.mjs';
import { SILENT_CLIP } from '../public/newdesign/noraVoiceLoop.mjs';

const require_ = createRequire(import.meta.url);
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');

const WEB = readFileSync(join(ROOT, 'public/newdesign/chatWidget.jsx'), 'utf8');
const APP = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const between = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

test('the website unlocks with the same silence the engine exports, and it is a real WAV', () => {
  const m = WEB.match(/const CW_NORA_SILENCE = "([^"]+)";/);
  assert.ok(m, 'the website keeps its own copy: a classic script cannot import the module synchronously');
  assert.equal(m[1], SILENT_CLIP);
  const wav = Buffer.from(SILENT_CLIP.split(',')[1], 'base64');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
});

// ── The website ─────────────────────────────────────────────────────────────────
function webTalk() {
  const start = WEB.indexOf('const CW_NORA_SILENCE =');
  const end = WEB.indexOf('function ChatWidget(props)');
  assert.ok(start > 0 && end > start, 'the Talk view must stay where this harness reads it');
  const { code } = babel.transformSync(`${WEB.slice(start, end)}\nthis.CwNoraTalk = CwNoraTalk; this.cwTalkStatus = cwTalkStatus;`, { presets: [presetReact], babelrc: false, configFile: false });
  const ctx = { React: SHIM, TEAL: 'teal', TEAL_BRIGHT: 'teal', PAPER: 'paper', INK: 'ink', sans: 'sans' };
  vm.runInNewContext(code, ctx);
  return ctx;
}

test('website Talk view: her face is the button, one line says what she is doing, End ends it', () => {
  const { CwNoraTalk } = webTalk();
  let taps = 0, ends = 0;
  const view = (state, info = {}, extra = {}) => drive(CwNoraTalk, { view: { state, info, heard: '', reply: '', ...extra }, ringRef: { current: null }, onTap: () => taps++, onEnd: () => ends++ });
  const listening = view('listening');
  const face = listening.nodes().find((n) => n.type === 'button' && n.props['aria-label'] === 'Done talking');
  assert.ok(face, 'while she listens, her face is "done talking"');
  assert.ok(flatten(face).some((n) => n.type === 'img' && n.props.src === '/nora-avatar.png'), 'her face');
  assert.match(listening.text, /Listening…/);
  face.props.onClick();
  assert.equal(taps, 1);
  listening.click('End');
  assert.equal(ends, 1);

  const speaking = view('speaking', {}, { heard: "what's on today", reply: 'Leg day.' });
  assert.ok(speaking.nodes().some((n) => n.props['aria-label'] === 'Interrupt Nora'));
  assert.match(speaking.text, /Speaking\. Tap me to interrupt\./);
  assert.match(speaking.text, /“what's on today”/);
  assert.match(speaking.text, /Leg day\./);
  assert.match(view('listening', { manual: true }).text, /Tap me when you're done/, 'no level meter: a tap ends the turn');
  assert.match(view('error', { reason: 'mic' }).text, /Allow the microphone/);
  assert.match(view('paused', { reason: 'playback_blocked' }).text, /My answer is in the chat/);
});

test('website: Talk replaced the Voice chat chip and hold-to-talk, and starts inside the tap', () => {
  assert.doesNotMatch(WEB, /Voice chat \{voiceChat/);
  assert.doesNotMatch(WEB, /holdStart|holdEnd|holdSupported/);
  assert.match(WEB, /<button type="button" data-nora-talk-button onClick=\{startTalk\} disabled=\{!talkMod\}/);
  const start = between(WEB, 'const startTalk = () => {', '};');
  assert.match(start, /loop\.start\(\);/, 'start() is called in the click itself, not after an await');
  assert.doesNotMatch(start, /await|then\(/);
  // The view covers the chat pane only on Nora's tab, and leaving the tab or closing the panel ends it.
  assert.match(WEB, /\{isSupport && talkView\.state !== "idle" && \(\s*<CwNoraTalk /);
  assert.match(WEB, /React\.useEffect\(\(\) => \{ if \(!isSupport \|\| !isOpen\) endTalk\(\); \}, \[isSupport, isOpen\]\);/);
  // What she hears goes through the same send() as typing, marked spoken; her reply is read by Talk, not twice.
  assert.match(WEB, /ask: \(text\) => Promise\.resolve\(talkSendRef\.current\(text, \{ voice: true, silent: true \}\)\)/);
  assert.match(WEB, /if \(!opts\.silent && canVoiceRef\.current && noraVoice\.enabled\) speakNora\(finalReply\);\s*return finalReply;/);
});

test('website Listen: one player, unlocked before the fetch; Loading, then Stop; an honest note when blocked', () => {
  const speak = between(WEB, 'const speakNora = async (text, opts) => {', '\n  };\n');
  const prime = speak.indexOf('primeNoraAudio();');
  assert.ok(prime > 0 && prime < speak.indexOf('await '), 'the unlock runs before anything awaits');
  assert.doesNotMatch(speak, /new Audio\(/, 'a new element per reply is what Safari blocked');
  assert.match(speak, /a\.src = url;/);
  assert.match(speak, /return \{ ok: true, ended \};/, 'Talk waits for her to finish before it listens again');
  assert.match(speak, /"Tap Listen again to hear Nora\."/);
  assert.match(speak, /res\.status === 401 \? "signed_out" : \(res\.status === 402 \|\| res\.status === 403\) \? "members"/);
  assert.match(WEB, /\{mine \? \(noraPlaying\.playing \? "■ Stop" : "Loading…"\) : "🔊 Listen"\}/);
  assert.match(WEB, /onClick=\{\(\) => \(mine \? stopNora\(\) : speakNora\(m\.t, \{ explicit: true, key: lkey \}\)\)\}/);
  // A Send tap primes too, so an auto-read reply can play after the model answers.
  assert.match(WEB, /if \(!opts\.silent && canVoiceRef\.current && noraVoice\.enabled\) primeNoraAudio\(\);/);
});

// ── The app ─────────────────────────────────────────────────────────────────────
test('app Talk view: her face, the status in the member\'s language, End', async () => {
  const { BSNoraTalk, bsNoraVoiceFail } = await loadBroadsheet(['BSNoraTalk', 'bsNoraVoiceFail']);
  const tr = (k, o) => o.defaultValue;
  let taps = 0, ends = 0;
  const talk = (state, info = {}) => ({ state, info, heard: '', reply: '', ringRef: { current: null }, tap: () => taps++, end: () => ends++ });
  assert.equal(drive(BSNoraTalk, { talk: talk('idle'), t: THEME, tint: '#0ac5a8', avatar: '/nora.png' }).nodes().length, 0, 'nothing while idle');
  const d = drive(BSNoraTalk, { talk: talk('listening'), t: THEME, tint: '#0ac5a8', avatar: '/nora.png' });
  const face = d.nodes().find((n) => n.type === 'button' && n.props['aria-label'] === 'Done talking');
  assert.ok(face && flatten(face).some((n) => n.type === 'img' && n.props.src === '/nora.png'));
  face.props.onClick();
  d.click('End');
  assert.deepEqual([taps, ends], [1, 1]);
  const says = (state, info) => drive(BSNoraTalk, { talk: talk(state, info), t: THEME, tint: '#0ac5a8', avatar: '/nora.png' }).text;
  assert.match(says('thinking'), /Thinking…/);
  assert.match(says('error', { reason: 'members' }), /Talking to Nora is a member feature\./);
  assert.match(says('paused', { reason: 'quiet' }), /Paused\. Tap me to talk\./);
  // A reply that could not be spoken says why: signed out is not a membership question.
  assert.match(says('paused', { reason: 'signed_out' }), /Sign in to hear Nora's voice\./);
  assert.match(says('paused', { reason: 'members' }), /Nora's voice is a member feature\./);
  // Listen's failure note names the real reason; a signed-out member was told it was a member feature.
  assert.equal(bsNoraVoiceFail(tr, 'signed_out'), "Sign in to hear Nora's voice.");
  assert.equal(bsNoraVoiceFail(tr, 'playback_blocked'), 'Tap Listen again to hear Nora.');
  assert.equal(bsNoraVoiceFail(tr, 'members'), "Nora's voice is a member feature.");
  assert.equal(bsNoraVoiceFail(tr, 'unavailable'), 'Voice is unavailable right now.');
});

test('app sheet: Talk starts in the tap; Listen shows Loading and Stop and speaks inside the tap', () => {
  const sheet = between(APP, 'function BSNoraSheet(', '// Chat tab for ALL roles');
  assert.match(sheet, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); talk\.start\(\); \}\}/);
  assert.doesNotMatch(sheet, /voiceChat|holdToTalk|onVoiceComplete/, 'the Voice chat chip and hold-to-talk are gone');
  assert.match(sheet, /<BSNoraTalk talk=\{talk\} t=\{t\} tint=\{noraTint\} avatar=\{BS_NORA_AVATAR\} \/>/);
  const listen = between(sheet, 'const listenTo = (i, text) => {', '\n  };\n');
  assert.ok(listen.indexOf('window.ShapeVoice.speak(text') < listen.indexOf('.then('), 'speak() is called in the tap, not after an await');
  assert.match(listen, /window\.__bsToast\?\.\(bsNoraVoiceFail\(tr, r && r\.reason\), 'info'\)/);
  assert.match(sheet, /\{mine \? \(listening\.playing \? tr\('feed:support\.stop'/);
  // A typed send that will be read aloud primes the player in the tap; Talk's own sends do not read twice.
  assert.match(sheet, /if \(!opts\.silent\) \{ try \{ if \(window\.ShapeVoice\?\.enabled\?\.\(\)\) window\.ShapeVoice\.prime\?\.\(\); \} catch \(e\) \{\} \}/);
  assert.match(sheet, /if \(!opts\.silent && window\.ShapeVoice && window\.ShapeVoice\.enabled\(\)\) speakReply\(reply\);/);
});

test('app: Talk takes the mic from a dictation in progress, which is dropped, not transcribed (Codex, #2252)', () => {
  const talk = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSNoraTalk.jsx'), 'utf8');
  const start = between(talk, 'const start = () => {', '};');
  assert.ok(start.indexOf("dispatchEvent(new CustomEvent('shape:stopDictation'))") >= 0 && start.indexOf("dispatchEvent(new CustomEvent('shape:stopDictation'))") < start.indexOf('loop.start()'), 'the composer lets go before Talk opens the mic');
  const composer = between(APP, 'function BSMessageComposer(', '// When pinned, render through a portal');
  assert.match(composer, /window\.addEventListener\('shape:stopDictation', drop\);/);
  assert.match(composer, /if \(mr && mr\.state === 'recording'\) \{ mr\._bsCancel = true; try \{ mr\.stop\(\); \} catch \(e\) \{\} \}/, 'cancelled, so nothing is transcribed into the hidden draft');
  // The website's Talk stops its own dictation the same way, in the tap.
  assert.match(between(WEB, 'const startTalk = () => {', '};'), /stopVoice\(\);[^\n]*\n\s*loop\.start\(\);/);
});
