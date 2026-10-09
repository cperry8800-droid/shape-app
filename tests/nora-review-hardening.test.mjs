// The Nora half of the 2026-10-08 security review's app code: M6 and M8. (H9, the undo's actor
// check and the affected-row checks, is in tests/ai-actions.test.mjs beside the actions it guards.)
//
//   M6  `remember` audited the member's note TEXT in confirmedPayload. The audit log has readers
//       of its own (its policy, GET /api/ai/audit), and a member's private memory does not belong
//       in a second place; the row records the note's id and stamps only, as `forget`'s does.
//   M8  ai/speak, ai/transcribe and ai/draft-program were member-gated with no daily budget, so
//       the proxy's 100-a-minute limit was the only bound on what one account could spend of the
//       server's key. Each now counts a per-account daily budget BEFORE the model is asked, through
//       the shared fixed-window limiter (the Nora question limits' own pattern), and answers 429
//       with a Retry-After once it is spent. ⚠ The review asked for generate-plan's COACH gate on
//       draft-program; that route is a member surface by design (the website's Train page and the
//       app's self-serve workout builder call it), so a gate would remove the feature. The budget
//       is what bounds it.
//
// The routes are the SHIPPING files, compiled by loadRealModule, with the REAL noraLimits module
// over a recording rate limiter, so the key, the limit and the window read here are the ones that
// reach the database.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const actions = await import(pathToFileURL(join(ROOT, 'src/lib/ai/actions.mjs')).href);

// ── M6 ────────────────────────────────────────────────────────────────────────────────────
function memoryCtx() {
  const logged = [];
  let doc = { rev: 0, notes: [] };
  return {
    logged,
    ctx: {
      isMember: true,
      actor: { id: 'member-1', role: 'client' },
      // casWriteUserGoals's contract (src/lib/ai/server.ts): a mutation that reports an error is
      // refused as that error; otherwise its `doc` is what the member's document becomes.
      casWrite: async (kind, fn) => { const out = fn(doc); if (out && out.error) return { ok: false, error: String(out.error) }; doc = out.doc; return { ok: true }; },
      audit: { log: async (entry) => { logged.push(entry); return `aud_${logged.length}`; } },
      supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [] }) }) }) }) }) }) },
    },
  };
}

test('M6: remember audits the note id and nothing of the note', async () => {
  const { ctx, logged } = memoryCtx();
  const r = await actions.rememberMemoryTool.run(ctx, { note: 'My left knee clicks on deep squats, physio says keep going' });
  assert.equal(r.done, true);
  assert.equal(r.audited, true);
  assert.equal(logged.length, 1);
  const entry = logged[0];
  assert.equal(entry.action, 'remember');
  assert.equal(entry.target.id, r.noteId);
  assert.deepEqual(entry.confirmedPayload, { noteId: r.noteId }, 'the id only: no text, no raw input');
  assert.doesNotMatch(JSON.stringify(entry), /knee|squats|physio/, 'the note\'s words appear nowhere in the audit row');
  // forget was already id-only; the two read the same.
  const f = await actions.forgetMemoryTool.run(ctx, { note_id: r.noteId });
  assert.equal(f.done, true);
  assert.deepEqual(logged[1].confirmedPayload, { noteId: r.noteId });
});

// ── M8 ────────────────────────────────────────────────────────────────────────────────────
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });

/** The real noraLimits over a rate limiter that records every check and answers as told. */
async function limits({ allowed = true, resetSeconds = 0 } = {}) {
  const checks = [];
  const mod = await loadRealModule(join(ROOT, 'src/lib/ai/noraLimits.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/rate-limit', { checkRateLimit: async (sb, key, max, windowSeconds) => { checks.push({ key, max, windowSeconds }); return { allowed, remaining: 0, resetSeconds, limit: max }; } }],
      ['@/lib/turnstile', { turnstileEnabled: () => false, verifyTurnstile: async () => true }],
    ]),
  });
  return { mod, checks };
}

const SB = { from: () => ({}) };

async function speak({ allowed = true } = {}) {
  const { mod, checks } = await limits({ allowed, resetSeconds: 5400 });
  const spoken = [];
  const tone = await import(pathToFileURL(join(ROOT, 'src/lib/ai/tone.mjs')).href);
  const route = await loadRealModule(join(ROOT, 'src/app/api/ai/speak/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/ai/server', { resolveActor: async () => ({ user: { id: 'member-1' }, role: 'client', roles: ['client'], supabase: SB }) }],
      ['@/lib/ai', { hasOpenAIKey: () => true, synthesizeSpeech: async (text) => { spoken.push(text); return { ok: true, audio: new Uint8Array([1]).buffer, contentType: 'audio/mpeg' }; } }],
      ['@/lib/ai/tone.mjs', tone],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/ai/noraLimits', mod],
    ]),
  });
  const res = await route.POST(new Request('https://x/api/ai/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Hello there' }) }));
  return { res, checks, spoken };
}

async function transcribe({ allowed = true } = {}) {
  const { mod, checks } = await limits({ allowed, resetSeconds: 3600 });
  const heard = [];
  const voiceLang = await import(pathToFileURL(join(ROOT, 'src/lib/ai/voiceLang.mjs')).href);
  const route = await loadRealModule(join(ROOT, 'src/app/api/ai/transcribe/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => ({ id: 'member-1' }), clientForRequest: async () => SB }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/ai/voiceLang.mjs', voiceLang],
      ['@/lib/ai', { hasOpenAIKey: () => true, transcribeAudio: async (file) => { heard.push(file.name); return { ok: true, text: 'hi', model: 'm', fellBack: false }; } }],
      ['@/lib/ai/noraLimits', mod],
    ]),
  });
  const fd = new FormData();
  fd.append('audio', new File([new Uint8Array([1, 2, 3])], 'nora.webm', { type: 'audio/webm' }));
  const res = await route.POST(new Request('https://x/api/ai/transcribe', { method: 'POST', body: fd }));
  return { res, checks, heard };
}

async function draft({ allowed = true } = {}) {
  const { mod, checks } = await limits({ allowed, resetSeconds: 7200 });
  const asked = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/ai/draft-program/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/request-auth', { currentUser: async () => ({ id: 'member-1' }), clientForRequest: async () => SB }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/ai', { hasOpenAIKey: () => true, callAI: async () => { asked.push(1); return { ok: false }; } }],
      ['@/lib/ai/noraLimits', mod],
    ]),
  });
  const res = await route.POST(new Request('https://x/api/ai/draft-program', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'strength', weeks: 4, daysPerWeek: 3 }) }));
  return { res, checks, asked };
}

test('M8: each AI route counts the account\'s daily budget, under its own key, before the model is asked', async () => {
  const s = await speak();
  assert.equal(s.res.status, 200);
  assert.deepEqual(s.checks, [{ key: 'nora:speak:member-1', max: 200, windowSeconds: 86400 }]);
  assert.equal(s.spoken.length, 1);
  const t = await transcribe();
  assert.equal(t.res.status, 200);
  assert.deepEqual(t.checks, [{ key: 'nora:transcribe:member-1', max: 300, windowSeconds: 86400 }]);
  assert.equal(t.heard.length, 1);
  const d = await draft();
  assert.equal(d.res.status, 200, 'a failed draft is an honest { program: null }, not a refusal');
  assert.deepEqual(d.checks, [{ key: 'nora:draft_program:member-1', max: 40, windowSeconds: 86400 }]);
  assert.equal(d.asked.length, 1);
});

test('M8: a spent budget is 429 with a Retry-After, and the model is never asked', async () => {
  const s = await speak({ allowed: false });
  assert.equal(s.res.status, 429);
  assert.equal(s.res.headers.get('retry-after'), '5400');
  assert.match((await s.res.json()).error, /Nora's voice.*2 hours/);
  assert.equal(s.spoken.length, 0);
  const t = await transcribe({ allowed: false });
  assert.equal(t.res.status, 429);
  assert.equal(t.heard.length, 0);
  assert.match((await t.res.json()).error, /voice input/);
  const d = await draft({ allowed: false });
  assert.equal(d.res.status, 429);
  assert.equal(d.asked.length, 0);
  assert.match((await d.res.json()).error, /AI drafting/);
});

test('M8: draft-program keeps its member access (the review\'s coach gate would have removed the self-serve builder)', async () => {
  const d = await draft();
  assert.equal(d.res.status, 200);
  const src = (await import('node:fs')).readFileSync(join(ROOT, 'src/app/api/ai/draft-program/route.ts'), 'utf8');
  assert.doesNotMatch(src, /Coach access required/, 'no coach gate');
  assert.match(src, /countBudget\(await clientForRequest\(request\), user\.id, 'draft_program'\)/);
});
