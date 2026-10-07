// Two Ask Nora review fixes (2026-10-07). The app's Help page named a path that does
// not exist (Chat → Team → Support) and had no way to reach Nora; the website showed
// a mic and read-aloud to everyone, though speech and transcription sit behind the
// membership gate and could only fail for a visitor or a non-member.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const WEB = readFileSync(join(ROOT, 'public/newdesign/chatWidget.jsx'), 'utf8');

test('app Help: the path that exists, and a button that opens Nora', () => {
  assert.doesNotMatch(APP, /Chat → Team → Support/);
  assert.match(APP, /ask <b>Nora<\/b> in Chat → Support/);
  const page = APP.slice(APP.indexOf('function BSHelpPage('), APP.indexOf('Object.assign(window, { BSCookMode'));
  assert.match(page, /function BSHelpPage\(\{ onBack, onContact, onAskNora \}\)/);
  assert.ok(/\{onAskNora && \(\s*<button onClick=\{onAskNora\}/.test(page) && page.includes('>✦ Ask Nora</button>'), 'the button');
  assert.ok(APP.includes('onAskNora={() => { setShowHelp(false); bsOpenNora(); }} />'), 'Settings closes Help, then opens Nora');
});

test('app Help: bsOpenNora sends the same request as search\'s Nora hit', () => {
  const src = APP.slice(APP.indexOf('function bsOpenNora()'), APP.indexOf('function BSHelpPage('));
  const sent = [];
  const win = { dispatchEvent: (e) => sent.push(e) };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  new Function('window', 'CustomEvent', `${src}; bsOpenNora();`)(win, CustomEvent);
  assert.deepEqual(sent.map((e) => [e.type, e.detail]), [['shape:openConversation', { support: true, name: 'Nora' }]]);
  assert.match(APP, /new CustomEvent\('shape:openConversation', \{ detail: \{ support: true, name: 'Nora' \} \}\)\); \} catch \(e\) \{\} \}\} style=/, 'the search hit it mirrors');
});

test('website: voice controls show only to someone the gate lets through', () => {
  assert.match(WEB, /const canVoice = member === true;/);
  const guarded = [
    '{!m.me && isSupport && canVoice && (\n                    <button onClick={() => speakNora(m.t, { explicit: true })}',
    '{canVoice && <button onClick={() => setNoraEnabled(!noraVoice.enabled)}',
    '{canVoice && holdSupported && (',
    '{canVoice && <select value={noraVoice.voice}',
    '{isSupport && canVoice && voiceChat && holdSupported ? (',
    ') : isSupport && canVoice && voiceSupported && (',
  ];
  for (const g of guarded) assert.ok(WEB.includes(g), `guarded: ${g.split('\n')[0]}`);
  assert.match(WEB, /if \(canVoiceRef\.current && \(noraVoice\.enabled \|\| voiceChatRef\.current\)\) speakNora\(finalReply\);/, 'no auto-read for a non-member');
  // every speak / mic entry point in the Support composer is one of the guarded ones
  assert.equal((WEB.match(/onClick=\{toggleVoice\}/g) || []).length, 1);
  assert.equal((WEB.match(/onClick=\{\(\) => speakNora\(/g) || []).length, 1);
});
