# Nora Voice Overhaul (PR A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nora's server voice gets style steering (`instructions` on `gpt-4o-mini-tts`), the on-device robot fallback is deleted in favor of honest failure states, and the mobile Nora support chat gains a Voice-chat conversation mode (hold-to-talk mic → transcript sends → her reply auto-plays).

**Architecture:** Pure style logic lives in `src/lib/ai/tone.mjs` (`voiceStyleForTone`, unit-tested); `synthesizeSpeech` passes the instructions through to the OpenAI speech API; the `/api/ai/speak` route resolves `NORA_TTS_INSTRUCTIONS` (optional env override) else the tone default. On mobile, `speakVoice` returns honest `{ok:false, reason}` instead of falling back to `speechSynthesis`; explicit Listen taps toast, auto-speak stays silent. The support thread adds a `voiceChat` toggle; the composer's existing mic gains a hold-to-talk mode + an `onVoiceComplete` hand-off so a released recording sends as a message.

**Tech Stack:** Next.js API routes (nodejs runtime) · OpenAI `/v1/audio/speech` (`gpt-4o-mini-tts`) · plain-ESM tone module + `node --test` · React (mobile broadsheet, `iosAppBroadsheetClient.jsx`) · `MediaRecorder`/Web Speech API.

## Global Constraints

- **Verbatim contract is untouchable:** `/api/ai/speak` synthesizes the caller's text VERBATIM and echoes it in `X-Spoken-Text`. `instructions` steer *delivery*, never words. Do not modify the text path.
- **`NORA_TTS_INSTRUCTIONS` is the ONE new env var and it is strictly optional** — unset, `voiceStyleForTone` defaults apply. Nothing is required for deploy. No migration.
- **The robot dies completely:** after this PR, `speakOnDevice` and every `speechSynthesis` reference in the voice path are GONE from `mobile-app/src/services/shapeBackend.js`.
- **Honest toast copy (exact):** signed-out/non-member → `Nora's voice is a member feature`; member/other failure → `Voice is unavailable right now`. Explicit taps toast; auto-speak callers stay silent on failure.
- **Voice chat toggle is OFF by default**, per-session state (not persisted).
- The existing voice picker (6 voices) + tone setting + the `enabled` opt-out stay as-is.
- Repo rules: no new colored emoji; theme tokens only (`t.*`); LF endings (`sed -i 's/\r$//'` on touched files before commit; verify `tr -cd '\r' < f | wc -c` → 0); Edit tools on Windows emit CRLF, so always normalize.
- Verification per commit: JSX parse-check (`node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`) · root `npx tsc --noEmit` · `npm test` (root) · mobile build via PowerShell `$env:VITE_BASE='/m/'; npm run build` (exit 0; CI is the authoritative gate — local build may be blocked by App Control).

## File Structure

- `src/lib/ai/tone.mjs` — add `voiceStyleForTone(tone)` (pure, exported; sits beside `voiceForTone`).
- `tests/ai-tone.test.mjs` — new vectors for `voiceStyleForTone`.
- `src/lib/ai.ts` — `synthesizeSpeech` gains `instructions?: string`.
- `src/app/api/ai/speak/route.ts` — resolves instructions (env override else tone default), passes them through.
- `mobile-app/src/services/shapeBackend.js` — delete `speakOnDevice`; `speakVoice` returns `{ok:false, reason}`; `stopVoice` drops its `speechSynthesis` line.
- `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — honest-toast Listen handling (`speakReply`, Settings `Preview voice`), `voiceChat` state + header chip, auto-play replies, composer `holdToTalk`/`onVoiceComplete`.
- `docs/WORKLOG.md` — dated entry + Latest pointer (in-PR; Codex requires it).

---

### Task 1: `voiceStyleForTone` in tone.mjs (TDD)

**Files:**
- Modify: `src/lib/ai/tone.mjs` (insert directly under `voiceForTone`, line ~48)
- Test: `tests/ai-tone.test.mjs`

**Interfaces:**
- Produces: `voiceStyleForTone(tone: string) -> string` — non-empty delivery-style instruction; unknown/absent tone → the supportive default (same normalization as every tone fn).

- [ ] **Step 1: Write the failing test** — append to `tests/ai-tone.test.mjs`, and add `voiceStyleForTone` to the existing import list at the top of the file:

```js
test('voiceStyleForTone steers delivery per tone and defaults supportive', () => {
  const s = voiceStyleForTone('supportive');
  const d = voiceStyleForTone('direct');
  assert.ok(s.length > 20 && d.length > 20);
  assert.notEqual(s, d);
  assert.match(s, /warm/i);
  assert.match(d, /crisp|brisk/i);
  // both explicitly ban the announcer read; unknown tone falls to supportive
  assert.match(s, /never announcer/i);
  assert.match(d, /never announcer/i);
  assert.equal(voiceStyleForTone('bogus'), s);
  assert.equal(voiceStyleForTone(null), s);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/ai-tone.test.mjs`
Expected: FAIL — `voiceStyleForTone` is not exported (SyntaxError on the named import).

- [ ] **Step 3: Implement** — in `src/lib/ai/tone.mjs`, directly below the `voiceForTone` function:

```js
// Speech-delivery style per tone for the gpt-4o-mini-tts `instructions` field —
// steers HOW the words are read, never the words themselves (the verbatim
// contract). The NORA_TTS_INSTRUCTIONS env (optional) overrides both at the
// speak route, so the owner can pin a house style without a code change.
export function voiceStyleForTone(tone) {
  if (normalizeTone(tone) === 'direct') {
    return 'Crisp, confident, matter-of-fact fitness coach — brisk, energetic pace, no fluff, never announcer-like.';
  }
  return 'Warm, natural, encouraging fitness coach talking with a friend — relaxed conversational pace, gentle emphasis, never announcer-like.';
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/ai-tone.test.mjs` → PASS. Then the full suite: `npm test` → all green (540 + the new vector).

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' src/lib/ai/tone.mjs tests/ai-tone.test.mjs
git add src/lib/ai/tone.mjs tests/ai-tone.test.mjs
git commit -m "feat(nora): voiceStyleForTone — per-tone TTS delivery style (pure, tested)"
```

---

### Task 2: `instructions` through `synthesizeSpeech` + the speak route

**Files:**
- Modify: `src/lib/ai.ts:226-249` (`synthesizeSpeech` opts + request body)
- Modify: `src/app/api/ai/speak/route.ts:15,38-39`

**Interfaces:**
- Consumes: `voiceStyleForTone(tone)` from Task 1.
- Produces: `synthesizeSpeech(text, { promptId, voice?, format?, timeoutMs?, instructions? })` — when `instructions` is a non-empty string it rides in the OpenAI request body; absent/empty → body unchanged (today's behavior byte-identical).

- [ ] **Step 1: Widen `synthesizeSpeech`** — in `src/lib/ai.ts`, change the signature (line ~228):

```ts
export async function synthesizeSpeech(
  text: string,
  opts: { promptId: string; voice?: string; format?: SpeechFormat; timeoutMs?: number; instructions?: string },
): Promise<SynthesizeResult> {
```

and the request body (line ~244):

```ts
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL,
        voice: opts.voice || 'shimmer',
        input: text,
        response_format: format,
        // Delivery steering only (gpt-4o-mini-tts). The input text is verbatim.
        ...(opts.instructions ? { instructions: opts.instructions } : {}),
      }),
```

- [ ] **Step 2: Resolve instructions in the route** — in `src/app/api/ai/speak/route.ts`, extend the tone.mjs import (line 15):

```ts
import { resolveVoice, voiceStyleForTone, encodeSpokenText, SPOKEN_TEXT_HEADER } from '@/lib/ai/tone.mjs';
```

and replace lines 38-39:

```ts
  // The member's explicit voice choice, else the tone's default voice.
  const voice = resolveVoice(parsed.data.voice, parsed.data.tone);
  // Delivery steering only — the words are synthesized verbatim (the parity
  // header is untouched). The env override wins so the owner can pin a house
  // style; unset, the per-tone default applies.
  const instructions = (process.env.NORA_TTS_INSTRUCTIONS || '').trim() || voiceStyleForTone(parsed.data.tone);
  const res = await synthesizeSpeech(text, { voice, instructions, promptId: 'nora.speak' });
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → clean. `npm test` → green (no behavior change to tested modules).

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' src/lib/ai.ts src/app/api/ai/speak/route.ts
git add src/lib/ai.ts src/app/api/ai/speak/route.ts
git commit -m "feat(nora): style instructions on server TTS — NORA_TTS_INSTRUCTIONS env override, per-tone default"
```

---

### Task 3: the robot dies — honest `{ok:false, reason}` from `speakVoice`

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js:5333-5379` (`stopVoice`, DELETE `speakOnDevice`, rewrite `speakVoice`)

**Interfaces:**
- Produces: `window.ShapeVoice.speak(text, toneOverride, opts) -> Promise<{ok:true, source:'server'} | {ok:false, disabled?:true, reason?:'signed_out'|'members'|'unavailable'}>`. Callers (Task 4) branch on `reason`: `signed_out`/`members` → member-feature toast; `unavailable` → unavailable toast; `disabled` → silent (the opt-out, unchanged).

- [ ] **Step 1: Delete the fallback** — in `mobile-app/src/services/shapeBackend.js`, replace lines 5333-5379 (from `let _voiceAudio = null;` through the end of `speakVoice`) with:

```js
let _voiceAudio = null;
function stopVoice() {
  try { if (_voiceAudio) { _voiceAudio.pause(); _voiceAudio = null; } } catch (e) {}
}
// Server voice ONLY. The old on-device speechSynthesis fallback (the robot) is
// deliberately GONE — a failed/unavailable server voice returns an honest
// { ok:false, reason } and the caller decides what to say. Silence over
// brand-damaging robot audio.
async function speakVoice(text, toneOverride, opts = {}) {
  const clean = String(text || '').trim();
  if (!clean) return { ok: false, reason: 'unavailable' };
  const prefs = readVoicePrefs();
  // Honor the voice opt-out: when auto-speak is OFF, a stray speak() call must NOT
  // read coaching content aloud. An explicit "Listen" tap passes { force:true } —
  // that's a deliberate one-off the toggle shouldn't block.
  if (!opts.force && !prefs.enabled) return { ok: false, disabled: true };
  const tone = toneOverride || prefs.tone;
  stopVoice();
  if (!apiBaseUrl || !state.session?.access_token) return { ok: false, reason: 'signed_out' };
  try {
    const res = await fetch(`${apiBaseUrl}/api/ai/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
      body: JSON.stringify({ text: clean.slice(0, 2000), tone, voice: prefs.voice !== 'auto' ? prefs.voice : undefined }),
    });
    if (!res.ok) return { ok: false, reason: (res.status === 401 || res.status === 402) ? 'members' : 'unavailable' };
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    _voiceAudio = audio;
    audio.onended = audio.onerror = () => { try { URL.revokeObjectURL(url); } catch (e) {} };
    await audio.play();
    return { ok: true, source: 'server' };
  } catch (e) {
    return { ok: false, reason: 'unavailable' };
  }
}
```

Also update the section comment above (`lines 5308-5312`): change `speak() prefers the server route … and falls back to on-device speech (Web Speech API) when the route is unavailable.` to `speak() is server-only; a failure returns { ok:false, reason } and the caller shows an honest state (never robot audio).`

- [ ] **Step 2: Verify no `speechSynthesis` survives in the voice path**

Run: `grep -n "speechSynthesis\|speakOnDevice" mobile-app/src/services/shapeBackend.js`
Expected: no matches.

- [ ] **Step 3: Parse + build**

Run: `node --check mobile-app/src/services/shapeBackend.js` → clean. PowerShell: `cd mobile-app; $env:VITE_BASE='/m/'; npm run build` → exit 0 (or note CI as the gate).

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/shapeBackend.js
git add mobile-app/src/services/shapeBackend.js
git commit -m "feat(nora): delete the robot — speakVoice is server-only, returns honest {ok, reason}"
```

---

### Task 4: honest Listen toasts + Voice-chat conversation mode

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `speakReply` (~12792), `sendSupport` (~12795-12813), the Nora thread header (~13860-13872), the support composer mount (~14031), `BSMessageComposer` (~14202-14268), Settings `Preview voice` row (~22449).

**Interfaces:**
- Consumes: `window.ShapeVoice.speak(...) -> Promise<{ok, disabled?, reason?}>` (Task 3).
- Produces: `BSMessageComposer` gains optional props `holdToTalk: boolean` and `onVoiceComplete: (text) => void`; `sendSupport` is refactored to `sendSupportText(body)` so voice hand-off and the typed path share one sender.

- [ ] **Step 1: Honest Listen handling** — replace `speakReply` (line ~12792):

```js
  // Explicit Listen taps toast honestly on failure; auto-speak stays silent.
  const speakReply = (text, opts) => {
    try {
      const p = window.ShapeVoice && window.ShapeVoice.speak(text, undefined, opts);
      if (p && p.then) p.then((r) => {
        if (r && r.ok === false && !r.disabled && opts && opts.force) {
          window.__bsToast?.(r.reason === 'unavailable' ? 'Voice is unavailable right now' : "Nora's voice is a member feature", 'info');
        }
      });
    } catch (e) {}
  };
```

(The per-message `♪ Listen` button at ~13892 already calls `speakReply(m.t, { force: true })` — it inherits the toast with no change.)

- [ ] **Step 2: Settings Preview voice gets the same honesty** — replace the row action (line ~22449):

```js
        { l: 'Preview voice', r: 'Listen', action: () => { try { window.ShapeVoice?.speak?.("Hi, I'm Nora. This is how I'll sound.", undefined, { force: true }).then((r) => { if (r && r.ok === false && !r.disabled) window.__bsToast?.(r.reason === 'unavailable' ? 'Voice is unavailable right now' : "Nora's voice is a member feature", 'info'); }); } catch (e) {} } },
```

- [ ] **Step 3: Voice-chat state + shared sender** — next to `supportBusy` (~12787) add:

```js
  const [voiceChat, setVoiceChat] = useStateBSC(false); // conversation mode — off by default, per-session
```

Refactor `sendSupport` so the body is a parameter (the typed path passes the draft; the voice path passes the transcript directly — no setState race):

```js
  const sendSupportText = async (body) => {
    const clean = String(body || '').trim();
    if (!clean || supportBusy) return;
    setSupportDraft('');
    const next = [...supportMsgs, { who: 'You', t: clean, time: 'now', me: true }];
    setSupportMsgs(next);
    setSupportBusy(true);
    try {
      const hist = next.map(m => ({ role: m.me ? 'user' : 'assistant', content: m.t }));
      const res = await window.ShapeSupport?.ask?.(hist);
      const reply = (res && res.reply) || "Thanks — I've flagged this for the Shape team and they'll follow up here.";
      const acts = (res && Array.isArray(res.actions) && res.actions.length) ? res.actions : undefined;
      setSupportMsgs(m => [...m, { who: 'Nora', t: reply, time: 'now', me: false, bot: true, actions: acts }]);
      // Conversation mode reads every reply aloud; otherwise the global
      // auto-speak toggle decides (off by default). Auto-speak failures are silent.
      if (voiceChat) speakReply(reply, { force: true });
      else if (window.ShapeVoice && window.ShapeVoice.enabled()) speakReply(reply);
    } catch (e) {
      setSupportMsgs(m => [...m, { who: 'Nora', t: "I'm having trouble reaching support right now — I've flagged this for the Shape team to follow up.", time: 'now', me: false, bot: true }]);
    } finally { setSupportBusy(false); }
  };
  const sendSupport = () => sendSupportText(supportDraft);
```

- [ ] **Step 4: The header chip** — in the Nora thread header (after the `24/7` badge span at ~13868-13870, inside the same flex row), add a toggle chip:

```jsx
                  <button
                    onClick={(e) => { e.stopPropagation(); setVoiceChat(v => { const on = !v; if (!on) { try { window.ShapeVoice?.stop?.(); } catch (err) {} } return on; }); }}
                    aria-pressed={voiceChat}
                    style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, border: `1px solid ${voiceChat ? noraTint : hair}`, background: voiceChat ? `${noraTint}1f` : 'transparent', color: voiceChat ? noraTint : muted, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}
                  >
                    <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>♪</span> Voice chat {voiceChat ? 'on' : 'off'}
                  </button>
```

Note: the header is currently one `<button>` (line 13860) — a nested button is invalid HTML. Restructure: change the outer `<button onClick={() => setShowNora(true)} …>` to a `<div role="button" tabIndex={0} onClick={() => setShowNora(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowNora(true); } }} …same styles…>` so the chip can live inside it legally (the chip stopPropagation-s its own tap).

- [ ] **Step 5: Composer hold-to-talk + auto-send** — mount (line ~14031) becomes:

```jsx
        <BSMessageComposer value={supportDraft} onChange={setSupportDraft} onSend={sendSupport} pinned unlocked voice holdToTalk={voiceChat} onVoiceComplete={voiceChat ? sendSupportText : undefined} placeholder="Message the Shape team…" />
```

In `BSMessageComposer` (line ~14202) add the props:

```js
function BSMessageComposer({ value, onChange, onSend, onPhoto, photoBusy = false, onTag, onLog, tags = [], onRemoveTag, placeholder = 'Message...', pinned = false, unlocked = false, voice = false, holdToTalk = false, onVoiceComplete }) {
```

Deliver transcripts through one hand-off (both capture paths). In `startWebSpeech`, keep `onresult` writing interim text into the composer, and change `rec.onend`:

```js
      rec.onend = () => {
        setVoiceState((s) => (s === 'listening' ? 'idle' : s));
        const finalClean = finalText.replace(/\s+/g, ' ').trim();
        if (finalClean && onVoiceComplete) { onChange(''); onVoiceComplete(finalClean); }
      };
```

In `startServerVoice`'s `mr.onstop` success branch, replace `if (res.ok && data && data.transcript) { onChange(data.transcript); setVoiceErr(null); }` with:

```js
          if (res.ok && data && data.transcript) {
            setVoiceErr(null);
            if (onVoiceComplete) onVoiceComplete(String(data.transcript).trim());
            else onChange(data.transcript);
          }
```

Add hold-to-talk handlers next to `toggleVoice` (press = start, release = stop → transcribe → send; pointer-cancel/leave also stop so a dragged-off finger never leaves a hot mic):

```js
  const holdStart = (e) => { e.preventDefault(); if (voiceState !== 'idle') return; setVoiceErr(null); if (SpeechRec) startWebSpeech(); else startServerVoice(); };
  const holdEnd = () => { if (voiceState === 'listening') stopVoice(); };
```

On the existing mic button element, swap the handlers by mode: `holdToTalk ? { onPointerDown: holdStart, onPointerUp: holdEnd, onPointerCancel: holdEnd, onPointerLeave: holdEnd } : { onClick: toggleVoice }` (spread the object), and set its `title`/`aria-label` to `holdToTalk ? 'Hold to talk' : 'Voice input'`. The status line (~14415-14418) already covers listening/transcribing/error — change the listening copy when `holdToTalk` to `'● Listening… release to send'`. Any capture/transcribe failure already degrades to the text composer with the error line (no change).

- [ ] **Step 6: Verify**

Run: JSX parse-check on `iosAppBroadsheetClient.jsx` → clean. `node --check mobile-app/src/services/shapeBackend.js` → clean. PowerShell mobile build → exit 0. `npm test` → green.
Browser click-through (chrome-devtools MCP, `/m/` local or preview): signed-out demo → Nora tab → tap `♪ Listen` on her greeting → NO robot audio; toast reads `Nora's voice is a member feature`. Toggle `Voice chat on` → mic press-hold shows `release to send`.

- [ ] **Step 7: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(nora): voice-chat conversation mode + honest Listen toasts (no robot)"
```

---

### Task 5: WORKLOG entry

**Files:**
- Modify: `docs/WORKLOG.md` (Latest pointer + dated entry)

- [ ] **Step 1:** Update the `> **Latest (…)**` block to point at this PR (move the current Latest down to a `> **Prior (…)**` line, matching the file's existing pattern) and add a dated `### 2026-07-10 — Nora voice overhaul (PR A of the Nora wave)` entry covering: style instructions (`voiceStyleForTone` + `NORA_TTS_INSTRUCTIONS` optional override, verbatim contract intact), the robot deletion (honest `{ok,reason}` + exact toast copy), voice-chat mode (header chip, hold-to-talk, transcript auto-send, reply auto-plays), and the owner follow-up (audition voices at openai.fm → pin env).

- [ ] **Step 2: Commit**

```bash
sed -i 's/\r$//' docs/WORKLOG.md
git add docs/WORKLOG.md
git commit -m "docs: WORKLOG — Nora voice overhaul (PR A)"
```

---

## Self-Review (done at plan time)

1. **Spec coverage (§1 Voice overhaul):** style steering → Tasks 1-2; env override → Task 2; verbatim contract → Global Constraints + Task 2 comment; robot deletion + honest toasts (exact copy, auto-speak silent) → Tasks 3-4; hold-to-talk conversation mode w/ `speakVoice(reply, undefined, {force:true})` → Task 4 (`speakReply(reply, {force:true})` wraps exactly that call); off-by-default toggle → Task 4 Step 3; failure degrades to text composer → existing `voiceErr` line, noted in Task 4 Step 5; voice picker + tone stay as-is → untouched.
2. **Placeholders:** none — every step carries the code.
3. **Type consistency:** `speakVoice` return shape in Task 3 matches Task 4's `r.ok/r.disabled/r.reason` branches; `onVoiceComplete(text)` produced in Task 4 Step 5 matches the `sendSupportText(body)` consumer from Step 3; `holdToTalk` prop name consistent between the mount and the component.
