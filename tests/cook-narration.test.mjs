import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadBroadsheet } from './helpers/broadsheet-mount.mjs';
import { speechParts } from '../public/newdesign/noraVoiceLoop.mjs';
// The lifted speakVoice harnesses read the real split rule from here.
globalThis.__speechParts = speechParts;

const { useBSCookVoice, BSPrepCook, bsCkReading, bsCkTop, bsCkReadsProp } = await loadBroadsheet(['useBSCookVoice', 'BSPrepCook', 'bsCkReading', 'bsCkTop', 'bsCkReadsProp'], React);
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let voice;
function Probe({ text, allowed = true }) { voice = useBSCookVoice(text, allowed); return null; }

test('narration reads prep on opt-in, moves with steps, retries failure and cancels stale results', async () => {
  const calls = [];
  let pending;
  let failure = false;
  window.ShapeVoice = {
    speak: (text, tone, options) => { calls.push({ text, options }); return pending || Promise.resolve(failure ? { ok: false, reason: 'playback_blocked' } : { ok: true }); },
    stop() {}, retry: () => Promise.resolve({ ok: true }),
  };
  const root = createRoot(document.getElementById('root'));
  const render = text => React.act(async () => root.render(React.createElement(Probe, { text })));
  await render('Get it on the board. Two carrots.');
  assert.equal(calls.length, 0);
  await React.act(async () => voice.toggleReads());
  assert.equal(calls[0].text, 'Get it on the board. Two carrots.');
  assert.deepEqual(calls[0].options, { force: true });
  await render('Chop the carrots.');
  assert.equal(calls.at(-1).text, 'Chop the carrots.');
  const count = calls.length;
  await render('Chop the carrots.');
  assert.equal(calls.length, count, 'a timer heartbeat must not reread the step');
  failure = true;
  await render('Roast the carrots.');
  assert.equal(voice.voiceStatus, 'playback_blocked');
  await React.act(async () => voice.retryVoice());
  assert.equal(voice.voiceStatus, 'idle');
  assert.equal(calls.length, count + 1, 'retry must play the already downloaded clip');
  let finish;
  pending = new Promise(resolve => { finish = resolve; });
  await render('Plate the carrots.');
  await React.act(async () => voice.toggleReads());
  await React.act(async () => finish({ ok: false, reason: 'unavailable' }));
  assert.equal(voice.voiceStatus, 'idle', 'old failures must not surface after turning narration off');
  await React.act(async () => root.unmount());
});

test('persisted narration is silent when membership is unavailable', async () => {
  localStorage.setItem('shape.cookReads', '1');
  let calls = 0;
  window.ShapeVoice = { speak() { calls++; }, stop() {} };
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Probe, { text: 'Cook', allowed: false })));
  assert.equal(calls, 0);
  await React.act(async () => root.unmount());
  localStorage.clear();
});

test('the board waits to narrate until the scheduled step is due, and cancels while waiting for the next', async () => {
  const realNow = Date.now;
  const anchor = 1_000_000;
  let now = anchor;
  Date.now = () => now;
  localStorage.setItem('shape.cookReads', '1');
  const calls = [];
  let stops = 0;
  window.ShapeVoice = { speak: async text => { calls.push(text); return { ok: true }; }, stop() { stops++; } };
  const root = createRoot(document.getElementById('root'));
  const props = { items: [], anchor, serve: true, onClose() {}, onDone() {}, onRecipePrepped() {}, timeline: [
    { iid: 0, recipe: 'a', title: 'A', stepIndex: 0, text: 'Chop.', at: 10, min: 2, station: 'board', maxPause: 3 },
    { iid: 0, recipe: 'a', title: 'A', stepIndex: 1, text: 'Finish.', at: 15, min: 1, station: 'board' },
  ] };
  const render = () => React.act(async () => root.render(React.createElement(BSPrepCook, props)));
  try {
    await render();
    assert.equal(calls.length, 0, 'persisted reads-on must stay silent before the scheduled start');
    now = anchor + 10 * 60000;
    await render();
    assert.deepEqual(calls, ['A. Chop.']);
    now += 1000;
    await render();
    assert.equal(calls.length, 1, 'the heartbeat must not repeat narration');
    now = anchor + 12 * 60000;
    const next = [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Done · next'));
    const before = stops;
    await React.act(async () => next.click());
    assert.equal(calls.length, 1, 'the later continuation must not narrate immediately');
    assert.ok(stops > before, 'moving into a wait cancels the previous clip');
    now = anchor + 15 * 60000;
    await render();
    assert.deepEqual(calls, ['A. Chop.', 'A. Finish.']);
  } finally {
    await React.act(async () => root.unmount());
    Date.now = realNow;
    localStorage.clear();
  }
});

test('Start now allows narration early, but cannot bypass an occupied station', async () => {
  const realNow = Date.now;
  const anchor = 1_000_000;
  let now = anchor;
  Date.now = () => now;
  localStorage.setItem('shape.cookReads', '1');
  const calls = [];
  window.ShapeVoice = { speak: async text => { calls.push(text); return { ok: true }; }, stop() {} };
  const root = createRoot(document.getElementById('root'));
  const props = { items: [], anchor, serve: true, onClose() {}, onDone() {}, onRecipePrepped() {}, timeline: [
    { iid: 0, recipe: 'a', title: 'A', stepIndex: 0, text: 'Chop.', at: 10, min: 2, station: 'board' },
  ] };
  try {
    await React.act(async () => root.render(React.createElement(BSPrepCook, props)));
    const start = [...document.querySelectorAll('button')].find(b => b.textContent === 'Start now');
    await React.act(async () => start.click());
    assert.deepEqual(calls, ['A. Chop.']);
    calls.length = 0;
    const initial = { jumpedAt: 0, timers: [{ id: 1, iid: 1, title: 'B', station: 'board', endsAt: anchor + 12 * 60000 }] };
    await React.act(async () => root.render(React.createElement(BSPrepCook, { ...props, initial, key: 'blocked' })));
    assert.equal(calls.length, 0, 'an early-start override must still respect live holds');
    now = anchor + 12 * 60000;
    await React.act(async () => root.render(React.createElement(BSPrepCook, { ...props, initial, key: 'blocked' })));
    assert.deepEqual(calls, ['A. Chop.']);
  } finally {
    await React.act(async () => root.unmount());
    Date.now = realNow;
    localStorage.clear();
  }
});

test('a future pause warning becomes overdue on the board clock without another Next tap', async () => {
  const realNow = Date.now;
  let now = 60000;
  Date.now = () => now;
  const root = createRoot(document.getElementById('root'));
  const timeline = [{ iid: 0, recipe: 'a', title: 'A', stepIndex: 1, text: 'Finish.', at: 5, min: 1, station: 'board' }];
  const props = { items: [], anchor: 0, serve: true, timeline, onClose() {}, onDone() {}, onRecipePrepped() {},
    initial: { livePlan: { timeline, serveAt: 6 * 60000, spread: 0, pauseOverdue: [], pauseDeadlines: [{ title: 'A', at: 4 * 60000 }] } } };
  try {
    await React.act(async () => root.render(React.createElement(BSPrepCook, props)));
    assert.match(document.body.textContent, /needs attention by/);
    assert.doesNotMatch(document.body.textContent, /pause has been exceeded/);
    now = 5 * 60000;
    await React.act(async () => root.render(React.createElement(BSPrepCook, props)));
    assert.doesNotMatch(document.body.textContent, /needs attention by/);
    assert.match(document.body.textContent, /pause has been exceeded/);
  } finally {
    await React.act(async () => root.unmount());
    Date.now = realNow;
  }
});

const source = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
function lift(name) {
  const at = source.indexOf(`function ${name}(`);
  const begin = source.slice(at - 6, at) === 'async ' ? at - 6 : at;
  const open = source.indexOf('{', source.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(begin, i + 1);
  }
  throw Error(name);
}

test('browser-blocked server audio retries from the same clip and stop releases it', async () => {
  let fetches = 0, plays = 0;
  const revoked = [];
  class Audio {
    // The unlock is refused too (no tap): this is the case a phone hits when the tap's
    // gesture did not reach the player, and the clip is kept for a retry from a tap.
    play() { if (this.src === 'data:,') return Promise.reject({ name: 'NotAllowedError' }); plays++; return plays === 1 ? Promise.reject({ name: 'NotAllowedError' }) : Promise.resolve(); }
    pause() {}
  }
  const code = `let _voiceGen=0, _voiceAudio=null, _voiceUrl=null, _voiceAbort=null, _voiceEnded=null, _voiceEnd=null, _voicePlayer=null; const SILENT_CLIP='data:,', speechParts=globalThis.__speechParts;
    const apiBaseUrl='https://api.test', state={session:{access_token:'test'}}, supabase=null;
    const readVoicePrefs=()=>({enabled:false,tone:'supportive',voice:'auto'});
    ${lift('liveAccessToken')} ${lift('settleVoiceEnd')} ${lift('voicePlayer')} ${lift('primeVoice')} ${lift('stopVoice')} ${lift('speakVoice')} ${lift('retryVoice')}
    return {speak:speakVoice,retry:retryVoice,stop:stopVoice};`;
  const backend = new Function('fetch', 'Audio', 'URL', code)(
    async () => { fetches++; return { ok: true, blob: async () => new Blob(['voice']) }; },
    Audio, { createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url) });
  assert.deepEqual(await backend.speak('Prep the carrots', undefined, { force: true }), { ok: false, reason: 'playback_blocked' });
  assert.equal(revoked.length, 0);
  assert.equal((await backend.retry()).ok, true);
  assert.equal(fetches, 1);
  backend.stop();
  assert.ok(revoked.includes('blob:test'));
  assert.equal((await backend.retry()).ok, false);
});

// ── 2026-10-04: the owner saw "Nora is reading this step" and heard nothing. ──────────────
const trD = (key, opts = {}) => opts.defaultValue ?? key;
const lineOf = (status, readsOn = true) => {
  const el = bsCkReading({ tr: trD, readsOn, status, retry() {} });
  return el ? JSON.stringify(el.props.children) : null;
};

test('the reading line is drawn only while her audio loads or plays', () => {
  assert.equal(lineOf('idle'), null, 'idle is nothing sounding: no step to read, a clip that ended, or a stop');
  assert.match(lineOf('loading'), /Nora is reading this step/);
  assert.match(lineOf('playing'), /Nora is reading this step/);
  assert.equal(lineOf('playing', false), null);
  // A sign-in refusal says so and offers no retry: playing again cannot sign anyone in.
  const signIn = bsCkReading({ tr: trD, readsOn: true, status: 'signed_out', retry() {} });
  assert.match(JSON.stringify(signIn.props.children), /Sign in with an active membership/);
  assert.doesNotMatch(JSON.stringify(signIn.props.children), /Play voice/);
  assert.match(lineOf('playback_blocked'), /Play voice/);
});

test('the status follows real playback: playing until her clip ends, idle after', async () => {
  localStorage.setItem('shape.cookReads', '1');
  let end;
  const ended = new Promise((resolve) => { end = resolve; });
  window.ShapeVoice = { speak: async () => ({ ok: true, ended }), stop() {} };
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(Probe, { text: 'Chop the carrots.' })));
    assert.equal(voice.voiceStatus, 'playing', 'speak resolves as playback STARTS, so she is still reading');
    await React.act(async () => end());
    assert.equal(voice.voiceStatus, 'idle', 'the line outlived her clip');
  } finally {
    await React.act(async () => root.unmount());
    localStorage.clear();
  }
});

test('a stop or an outside supersession while her audio loads never leaves the line stuck', async () => {
  localStorage.setItem('shape.cookReads', '1');
  let finish;
  window.ShapeVoice = { speak: () => new Promise((resolve) => { finish = resolve; }), stop() {} };
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(Probe, { text: 'Chop.' })));
    assert.equal(voice.voiceStatus, 'loading');
    await React.act(async () => voice.stopSpeak());
    assert.equal(voice.voiceStatus, 'idle', 'the mic (stopSpeak) left "reading" up over silence');
    await React.act(async () => root.render(React.createElement(Probe, { text: 'Stir.' })));
    assert.equal(voice.voiceStatus, 'loading');
    // Something outside this hook (another speak, ShapeVoice.stop) superseded the clip.
    await React.act(async () => finish({ ok: false, superseded: true }));
    assert.equal(voice.voiceStatus, 'idle', 'a superseded clip left the line on with nothing sounding');
  } finally {
    await React.act(async () => root.unmount());
    localStorage.clear();
  }
});

test('the voice switch is ONE setting: flipping it on one screen flips every other', async () => {
  const seen = {};
  function Two({ id }) { seen[id] = useBSCookVoice('', true); return null; }
  window.ShapeVoice = { speak: async () => ({ ok: true }), stop() {} };
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await React.act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(Two, { id: 'a' }), React.createElement(Two, { id: 'b' }))));
    assert.equal(seen.a.readsOn, false);
    let next;
    await React.act(async () => { next = seen.a.toggleReads(); });
    assert.equal(next, true, 'toggleReads reports the new state for the confirmation');
    assert.equal(seen.b.readsOn, true, 'the other screen kept its own stale copy');
    assert.equal(localStorage.getItem('shape.cookReads'), '1');
  } finally {
    await React.act(async () => root.unmount());
    host.remove();
    localStorage.clear();
  }
});

test('the top bar draws Nora\'s voice as a named on/off switch', () => {
  const find = (el, pred) => {
    if (!el || typeof el !== 'object') return null;
    if (Array.isArray(el)) { for (const c of el) { const f = find(c, pred); if (f) return f; } return null; }
    if (el.props && pred(el)) return el;
    return el.props ? find(el.props.children, pred) : null;
  };
  for (const on of [true, false]) {
    const bar = bsCkTop({ tr: trD, c: true, left: null, title: 'Cook together', reads: { on, onClick() {} } });
    const spk = find(bar, (n) => n.type === 'button' && /\bspk\b/.test(n.props.className || ''));
    assert.ok(spk, 'no voice switch in the bar');
    assert.equal(spk.props.role, 'switch');
    assert.equal(spk.props['aria-checked'], on);
    assert.equal(spk.props['aria-label'], 'Nora’s voice');
    assert.match(JSON.stringify(spk.props.children), on ? /"On"/ : /"Off"/);
  }
});

test('flipping the switch says what changed; a visitor is told how to hear her', () => {
  const said = [];
  let state = false;
  const member = bsCkReadsProp({ tr: trD, voiceCanSpeak: true, voiceMember: true, readsOn: state, toggle: () => (state = !state), say: (t) => said.push(t) });
  member.onClick();
  member.onClick();
  assert.match(said[0], /voice is on/);
  assert.match(said[1], /voice is off/);
  const visitor = bsCkReadsProp({ tr: trD, voiceCanSpeak: true, voiceMember: false, readsOn: true, toggle: () => { throw new Error('a visitor flipped the switch'); }, say: (t) => said.push(t) });
  assert.equal(visitor.on, false, 'a visitor sees the switch on');
  visitor.onClick();
  assert.match(said[2], /Sign in with an active membership to hear Nora/);
  assert.equal(bsCkReadsProp({ tr: trD, voiceCanSpeak: false, voiceMember: true, readsOn: true, toggle() {}, say() {} }), null);
});

test('with Nora\'s voice off she does not speak her answers or a repeat either', () => {
  const client = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const talks = client.match(/= useBSCookTalk\(\{[^}]*\}\)/g) || [];
  assert.equal(talks.length, 2, 'expected the one-dish screen and the board');
  for (const call of talks) assert.match(call, /speak: readsOn \? speak : null/, `a talk hook speaks with the switch off: ${call}`);
  const repeats = client.match(/cmd === 'repeat'\)[^\n]*/g) || [];
  assert.equal(repeats.length, 2);
  for (const r of repeats) assert.match(r, /if \(readsOn\) speak\([^)]*\); else noraSays\([^)]*, false\)/, r);
});

test('speakVoice hands back when her clip ends, and a stop ends it too', async () => {
  let audio;
  const audios = [];
  class Audio { constructor() { audio = this; audios.push(this); } play() { return Promise.resolve(); } pause() {} }
  const code = `let _voiceGen=0, _voiceAudio=null, _voiceUrl=null, _voiceAbort=null, _voiceEnded=null, _voiceEnd=null, _voicePlayer=null; const SILENT_CLIP='data:,', speechParts=globalThis.__speechParts;
    const apiBaseUrl='https://api.test', state={session:{access_token:'test'}}, supabase=null;
    const readVoicePrefs=()=>({enabled:true,tone:'supportive',voice:'auto'});
    ${lift('liveAccessToken')} ${lift('settleVoiceEnd')} ${lift('voicePlayer')} ${lift('primeVoice')} ${lift('stopVoice')} ${lift('speakVoice')} ${lift('retryVoice')}
    return {speak:speakVoice,retry:retryVoice,stop:stopVoice};`;
  const backend = new Function('fetch', 'Audio', 'URL', code)(
    async () => ({ ok: true, blob: async () => new Blob(['voice']) }),
    Audio, { createObjectURL: () => 'blob:test', revokeObjectURL() {} });
  const settled = (p) => Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), 20))]);
  const first = await backend.speak('Chop', undefined, { force: true });
  assert.equal(first.ok, true);
  assert.equal(await settled(first.ended), false, 'ended settled while the clip was still playing');
  audio.onended();
  assert.equal(await settled(first.ended), true, 'ended never settled after the clip ended');
  const second = await backend.speak('Stir', undefined, { force: true });
  backend.stop();
  assert.equal(await settled(second.ended), true, 'a stopped clip never fires ended, so stop must settle it');
  const third = await backend.speak('Plate', undefined, { force: true });
  const fourth = await backend.speak('Serve', undefined, { force: true });
  assert.equal(await settled(third.ended), true, 'a newer speak must end the older clip');
  assert.equal(await settled(fourth.ended), false, 'the newer clip ended with the older one');
  // ⚠ ONE PLAYER FOR EVERY CLIP (2026-10-08). A phone's browser plays only an element a tap
  // started, and a reply arrives after a network wait, so a new Audio per clip was blocked and
  // Listen did nothing. Every clip reuses the element primeVoice() unlocked; setting a new
  // source drops the old clip's pending events, so an older clip's end cannot reach this one.
  assert.equal(audios.length, 1, 'a new Audio per clip is blocked on a phone after the network wait');
  assert.equal(audio.src, 'blob:test');
  audio.onerror();
  assert.equal(await settled(fourth.ended), true, 'the newer clip failing never settled it');
});

test('speak unlocks the player inside the tap, before it awaits anything, and only once', async () => {
  const played = [];
  class Audio { play() { played.push(this.src); return Promise.resolve(); } pause() {} }
  const code = `let _voiceGen=0, _voiceAudio=null, _voiceUrl=null, _voiceAbort=null, _voiceEnded=null, _voiceEnd=null, _voicePlayer=null; const SILENT_CLIP='data:,', speechParts=globalThis.__speechParts;
    const apiBaseUrl='https://api.test', state={session:{access_token:'test'}}, supabase=null;
    const readVoicePrefs=()=>({enabled:true,tone:'supportive',voice:'auto'});
    ${lift('liveAccessToken')} ${lift('settleVoiceEnd')} ${lift('voicePlayer')} ${lift('primeVoice')} ${lift('stopVoice')} ${lift('speakVoice')}
    return {speak:speakVoice, prime:primeVoice};`;
  const backend = new Function('fetch', 'Audio', 'URL', code)(
    async () => ({ ok: true, blob: async () => new Blob(['voice']) }),
    Audio, { createObjectURL: () => 'blob:test', revokeObjectURL() {} });
  const pending = backend.speak('Chop', undefined, { force: true });
  assert.deepEqual(played, ['data:,'], 'the silence must play synchronously, while the tap is still the gesture');
  assert.equal((await pending).ok, true);
  assert.deepEqual(played, ['data:,', 'blob:test'], 'the reply plays on the same, unlocked element');
  await backend.speak('Stir', undefined, { force: true });
  backend.prime();
  assert.deepEqual(played, ['data:,', 'blob:test', 'blob:test'], 'an unlocked player is not primed again');
  const be = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
  assert.match(be, /  prime: primeVoice,\n\};/, 'Talk and a Send tap reach it through window.ShapeVoice');
});

test('Nora asks with the token as of now, not the one cached when the page opened', async () => {
  // A website session refreshes about hourly; the cook page cached the token it booted with, so
  // a long cook sent an expired one and Nora answered "sign in" (review, 2026-10-04).
  const sent = [];
  class Audio { play() { return Promise.resolve(); } pause() {} }
  let stored = { access_token: 'fresh', user: { id: 'u1' } };
  const code = `let _voiceGen=0, _voiceAudio=null, _voiceUrl=null, _voiceAbort=null, _voiceEnded=null, _voiceEnd=null, _voicePlayer=null; const SILENT_CLIP='data:,', speechParts=globalThis.__speechParts;
    const apiBaseUrl='https://api.test', state={user:{id:'u1'}, session:{access_token:'stale', user:{id:'u1'}}}, _isNative=true;
    const readVoicePrefs=()=>({enabled:true,tone:'supportive',voice:'auto'});
    ${lift('liveAccessToken')} ${lift('settleVoiceEnd')} ${lift('voicePlayer')} ${lift('primeVoice')} ${lift('stopVoice')} ${lift('speakVoice')}
    return {speak:speakVoice, state};`;
  const supabase = { auth: { getSession: async () => ({ data: { session: stored } }) } };
  const backend = new Function('fetch', 'Audio', 'URL', 'supabase', code)(
    async (url, init) => { sent.push(init.headers.Authorization); return { ok: true, blob: async () => new Blob(['v']) }; },
    Audio, { createObjectURL: () => 'blob:t', revokeObjectURL() {} }, supabase);
  assert.equal((await backend.speak('Chop', undefined, { force: true })).ok, true);
  assert.deepEqual(sent, ['Bearer fresh'], 'the request rode the token cached at boot');
  assert.equal(backend.state.session.access_token, 'fresh', 'the cache was not brought up to date');
  // Another account in storage (signed in elsewhere) is not borrowed: the cached one stands.
  stored = { access_token: 'other', user: { id: 'u2' } };
  await backend.speak('Stir', undefined, { force: true });
  assert.equal(sent.at(-1), 'Bearer fresh');
  // No session anywhere, in the native app: signed out, and no request (it has no cookie).
  stored = null; backend.state.session = null;
  assert.deepEqual(await backend.speak('Plate', undefined, { force: true }), { ok: false, reason: 'signed_out' });
  assert.equal(sent.length, 2);
});

test('⚠ on the web, no token of its own still asks: the website session rides the same-origin request', async () => {
  // The app at /m/ opened from the website is signed in by the website's cookie. Speak refused
  // there without asking, so Nora answered in text and never spoke: production logged the
  // transcription and the answer, and no /api/ai/speak (2026-10-08).
  const sent = [];
  class Audio { play() { return Promise.resolve(); } pause() {} }
  const harness = (native, status) => {
    const code = `let _voiceGen=0, _voiceAudio=null, _voiceUrl=null, _voiceAbort=null, _voiceEnded=null, _voiceEnd=null, _voicePlayer=null; const SILENT_CLIP='data:,', speechParts=globalThis.__speechParts;
      const apiBaseUrl='https://site.test', state={user:null, session:null}, supabase=null, _isNative=${native};
      const readVoicePrefs=()=>({enabled:true,tone:'supportive',voice:'auto'});
      ${lift('liveAccessToken')} ${lift('settleVoiceEnd')} ${lift('voicePlayer')} ${lift('primeVoice')} ${lift('stopVoice')} ${lift('speakVoice')}
      return {speak:speakVoice};`;
    return new Function('fetch', 'Audio', 'URL', code)(
      async (url, init) => { sent.push({ url, auth: init.headers.Authorization, credentials: init.credentials }); return status === 200 ? { ok: true, status, blob: async () => new Blob(['v']) } : { ok: false, status }; },
      Audio, { createObjectURL: () => 'blob:t', revokeObjectURL() {} });
  };
  assert.equal((await harness(false, 200).speak('Hi', undefined, { force: true })).ok, true);
  assert.deepEqual(sent, [{ url: 'https://site.test/api/ai/speak', auth: undefined, credentials: 'same-origin' }], 'no Authorization header, and the cookie rides along');
  // Truly signed out on the web: the server says so, and the app says sign in.
  assert.deepEqual(await harness(false, 401).speak('Hi', undefined, { force: true }), { ok: false, reason: 'signed_out' });
  assert.equal(sent.length, 2);
  // The native app has no cookie: it still refuses without asking.
  assert.deepEqual(await harness(true, 200).speak('Hi', undefined, { force: true }), { ok: false, reason: 'signed_out' });
  assert.equal(sent.length, 2);
});

test('the cached token follows a refresh, here or in another client on the same key', () => {
  const backend = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
  assert.match(backend, /supabase\.auth\.onAuthStateChange\(\(event, session\) => \{\s*if \(event === 'TOKEN_REFRESHED' && session && state\.user && session\.user && session\.user\.id === state\.user\.id\) state\.session = session;/);
  for (const fn of ['askSupportBot', 'transcribeTo']) {
    const at = backend.indexOf(`function ${fn}(`);
    assert.match(backend.slice(at, at + 1200), /const token = await liveAccessToken\(\);/, `${fn} still reads the boot token`);
  }
});

// ⚠ HER VOICE STARTS ON THE FIRST SENTENCE (speed, 2026-10-08). The whole reply was made into
// speech before any of it played; now the opening plays while the rest is made, on the same
// player, and `ended` waits for the last part.
test('speakVoice plays the opening part as soon as it is ready, then the rest, and ends after the last', async () => {
  let audio;
  const plays = [];
  class Audio { constructor() { audio = this; } play() { plays.push(this.src); return Promise.resolve(); } pause() {} }
  const asked = [];
  const reply = 'Great question. Your plan this week has three strength days and two easy runs, with Sunday off. I would keep the long run easy, and add protein at breakfast so you recover well before Tuesday.';
  const REST = 'I would keep the long run easy, and add protein at breakfast so you recover well before Tuesday.';
  let releaseRest;
  const restReady = new Promise((r) => { releaseRest = r; });
  let urls = 0;
  const code = `let _voiceGen=0, _voiceAudio=null, _voiceUrl=null, _voiceAbort=null, _voiceEnded=null, _voiceEnd=null, _voicePlayer=null; const SILENT_CLIP='data:,', speechParts=globalThis.__speechParts;
    const apiBaseUrl='https://api.test', state={session:{access_token:'test'}}, supabase=null, _isNative=false;
    const readVoicePrefs=()=>({enabled:true,tone:'supportive',voice:'auto'});
    ${lift('liveAccessToken')} ${lift('settleVoiceEnd')} ${lift('voicePlayer')} ${lift('primeVoice')} ${lift('stopVoice')} ${lift('speakVoice')}
    return {speak:speakVoice,stop:stopVoice};`;
  const make = (restFails) => new Function('fetch', 'Audio', 'URL', code)(
    async (url, init) => {
      const text = JSON.parse(init.body).text;
      asked.push(text);
      if (text === REST) { await restReady; if (restFails) return { ok: false, status: 502 }; }
      return { ok: true, blob: async () => new Blob([text]) };
    },
    Audio, { createObjectURL: () => `blob:${++urls}`, revokeObjectURL() {} });
  const settled = (p) => Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), 20))]);

  const backend = make(false);
  const r = await backend.speak(reply, undefined, { force: true });
  assert.equal(r.ok, true);
  assert.deepEqual(asked, ['Great question. Your plan this week has three strength days and two easy runs, with Sunday off.', 'I would keep the long run easy, and add protein at breakfast so you recover well before Tuesday.'], 'both parts were asked for at once');
  assert.deepEqual(plays.slice(-1), ['blob:1'], 'the opening played before the rest was ready');
  audio.onended();
  assert.equal(await settled(r.ended), false, 'not ended: the rest is still to come');
  releaseRest();
  await new Promise((res) => setTimeout(res, 5));
  assert.deepEqual(plays.slice(-1), ['blob:2'], 'the rest followed on the same player');
  assert.equal(await settled(r.ended), false, 'not ended while the rest plays');
  audio.onended();
  assert.equal(await settled(r.ended), true, 'ended after the last part');

  // A stop after the opening: the rest never plays.
  asked.length = 0; plays.length = 0;
  const b2 = make(false);
  const r2 = await b2.speak(reply, undefined, { force: true });
  b2.stop();
  audio.onended && audio.onended();
  await new Promise((res) => setTimeout(res, 5));
  assert.equal(plays.filter((p) => p !== 'data:,').length, 1, 'only the opening played');
  assert.equal(await settled(r2.ended), true);

  // The rest could not be made: she ends after the opening, with no error.
  asked.length = 0; plays.length = 0;
  const b3 = make(true);
  const r3 = await b3.speak(reply, undefined, { force: true });
  audio.onended();
  await new Promise((res) => setTimeout(res, 5));
  assert.equal(await settled(r3.ended), true, 'ended where she was');

  // A short reply is one request, as before.
  asked.length = 0;
  await make(false).speak('Hi! Your message came through clearly.', undefined, { force: true });
  assert.deepEqual(asked, ['Hi! Your message came through clearly.']);
});
