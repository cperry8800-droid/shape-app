#!/usr/bin/env node
// Nora against the REAL model, run by hand, never in CI (the Ask Nora plan: "a live-model
// test script, run by hand outside CI"). The test suite drives /api/support/chat with a
// scripted model, which proves the wiring and nothing about what the model actually says.
// This sends a fixed set of questions to a running Shape and holds every reply to the
// rules in scripts/nora-eval-checks.mjs: no hand-off claims, plain text, no change claimed
// as done, the right confirm card, the address when she cannot help.
//
//   node scripts/nora-live-eval.mjs --url https://<preview>.vercel.app
//   node scripts/nora-live-eval.mjs --url http://localhost:3000 --only visitor,member --json out.json
//
// Accounts come from Supabase access tokens in the environment; a kind with no token is
// skipped, never faked:
//   NORA_EVAL_MEMBER_TOKEN · NORA_EVAL_TRAINER_TOKEN · NORA_EVAL_NUTRITIONIST_TOKEN
// and a case that needs the account's own data names it, so a generic answer cannot pass:
//   NORA_EVAL_MEMBER_PLAN_HINT  a word today's plan for the member account contains (a move,
//                               a session title); without it, "What's on today?" is a SKIP.
//
// ⚠ IT COSTS MONEY AND IT COUNTS. Every question is a real model call and counts against
// that account's daily limit (and a visitor's). And ⚠ a deployment with the bot check on
// answers a scripted visitor with 403 needsCheck: those cases are reported SKIP, which is
// the check working. Run visitor cases against a build without TURNSTILE_SECRET_KEY.
//
// ⚠ IT WRITES NOTHING. A drafted change comes back as a card with a signed token; this
// script never posts the token to /api/ai/proposals/confirm.

import { writeFileSync } from 'node:fs';
import {
  judge, noCards, noCardPromise, draftsCard, coachChips, givesAddress, mentions,
} from './nora-eval-checks.mjs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const BASE = String(flag('url') || 'http://localhost:3000').replace(/\/+$/, '');
const ONLY = flag('only') ? flag('only').split(',').map((s) => s.trim()) : null;
const JSON_OUT = flag('json');

const TOKENS = {
  visitor: null,
  member: process.env.NORA_EVAL_MEMBER_TOKEN || null,
  trainer: process.env.NORA_EVAL_TRAINER_TOKEN || null,
  nutritionist: process.env.NORA_EVAL_NUTRITIONIST_TOKEN || null,
};

// Each case: who asks, what, how the panel asks (confirmCards false is the plain panel),
// and the checks beyond the ones every reply gets.
export const CASES = [
  { who: 'visitor', ask: 'How much does Shape cost?', checks: [noCards, mentions(/\$\s?5|five dollars/i, 'the $5 membership')] },
  { who: 'visitor', ask: 'Find me a strength coach', checks: [noCards, coachChips] },
  { who: 'visitor', ask: "What's on my training plan today?", checks: [noCards, mentions(/sign(?:ed)? in|log in|membership|member/i, 'that it needs a signed-in membership')] },
  { who: 'visitor', ask: 'I was charged twice. Can you refund me?', checks: [noCards, givesAddress] },
  // ⚠ A generic "I can help you plan today" passes every shared rule, so this case only
  // counts when it is held to the account's real plan (Codex, #2250).
  { who: 'member', ask: "What's on today?", needs: 'NORA_EVAL_MEMBER_PLAN_HINT', checks: [(r) => mentions(new RegExp(escapeRe(process.env.NORA_EVAL_MEMBER_PLAN_HINT || ''), 'i'), `today's plan ("${process.env.NORA_EVAL_MEMBER_PLAN_HINT}")`)(r)] },
  { who: 'member', ask: 'Log 500 ml of water', checks: [draftsCard('log_water')] },
  { who: 'member', ask: 'Remind me to weigh in every Monday at 7am', checks: [draftsCard('set_reminder')] },
  { who: 'member', ask: 'Log 500 ml of water', plain: true, checks: [noCards, noCardPromise] },
  { who: 'member', ask: 'Can someone from the team call me about my account?', checks: [noCards, givesAddress] },
  { who: 'trainer', ask: 'Draft a 45-minute lower-body session', checks: [draftsCard('draft_workout')] },
  { who: 'trainer', ask: 'Draft a 45-minute lower-body session', plain: true, checks: [noCards, noCardPromise] },
  { who: 'nutritionist', ask: 'What does Shape take from coaches?', checks: [noCards, mentions(/15\s?%|fifteen percent/i, 'the 15% platform fee')] },
];

function escapeRe(v) { return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const GREETING_KIND = { visitor: 'visitor', member: 'member', trainer: 'trainer', nutritionist: 'nutritionist' };

let visitorCookie = '';
async function call(path, { who, body, method = 'POST' }) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKENS[who]) headers.Authorization = `Bearer ${TOKENS[who]}`;
  if (who === 'visitor' && visitorCookie) headers.Cookie = visitorCookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get('set-cookie');
  if (who === 'visitor' && set) visitorCookie = set.split(';')[0];
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function main() {
  const rows = [];
  const kinds = [...new Set(CASES.map((c) => c.who))].filter((k) => !ONLY || ONLY.includes(k));
  for (const who of kinds) {
    if (who !== 'visitor' && !TOKENS[who]) {
      rows.push({ who, ask: '(all cases)', result: 'SKIP', why: `no NORA_EVAL_${who.toUpperCase()}_TOKEN` });
      continue;
    }
    // The greeting is decided on the server from the session: check it answers this kind.
    const g = await call('/api/support/chat', { who, method: 'GET' }).catch((e) => ({ status: 0, data: { error: String(e) } }));
    const gWhy = g.status !== 200 ? `GET answered ${g.status}`
      : g.data?.kind !== GREETING_KIND[who] ? `greeted as ${g.data?.kind}, not ${GREETING_KIND[who]}`
      : (g.data.quick || []).length !== 4 ? 'the greeting has no four suggestions' : null;
    rows.push({ who, ask: '(greeting)', result: gWhy ? 'FAIL' : 'PASS', why: gWhy, reply: g.data?.text });

    for (const c of CASES.filter((x) => x.who === who)) {
      if (c.needs && !process.env[c.needs]) {
        rows.push({ who, ask: c.ask, plain: !!c.plain, result: 'SKIP', why: `set ${c.needs} to hold it to this account's own data` });
        continue;
      }
      const body = { messages: [{ role: 'user', content: c.ask }], surface: 'web', ...(c.plain ? { confirmCards: false } : {}) };
      let r;
      try { r = await call('/api/support/chat', { who, body }); } catch (e) { r = { status: 0, data: { error: String(e) } }; }
      if (r.status === 403 && r.data?.needsCheck) {
        rows.push({ who, ask: c.ask, plain: !!c.plain, result: 'SKIP', why: 'the bot check is on (run visitors against a build without TURNSTILE_SECRET_KEY)' });
        continue;
      }
      if (r.data?.source === 'limit') {
        rows.push({ who, ask: c.ask, plain: !!c.plain, result: 'SKIP', why: "today's limit for this account is spent", reply: r.data.reply });
        continue;
      }
      const failures = r.status === 200 ? judge(r.data, c.checks) : [`HTTP ${r.status}: ${r.data?.error || ''}`];
      rows.push({ who, ask: c.ask, plain: !!c.plain, result: failures.length ? 'FAIL' : 'PASS', why: failures.join('; ') || null, reply: r.data?.reply, model: r.data?.model, actions: (r.data?.actions || []).map((a) => a.type === 'proposal' ? `card:${a.action}` : `${a.type}:${a.label}`) });
    }
  }

  for (const row of rows) {
    const tag = `${row.result.padEnd(4)} ${row.who.padEnd(12)} ${row.plain ? '[plain] ' : ''}${row.ask}`;
    console.log(tag);
    if (row.why) console.log(`       ${row.why}`);
    if (row.reply && row.result !== 'PASS') console.log(`       reply: ${String(row.reply).slice(0, 240).replace(/\s+/g, ' ')}`);
  }
  const n = (k) => rows.filter((r) => r.result === k).length;
  console.log(`\n${n('PASS')} pass · ${n('FAIL')} fail · ${n('SKIP')} skip · against ${BASE}`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), rows }, null, 2));
  process.exitCode = n('FAIL') ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
