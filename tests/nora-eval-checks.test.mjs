// The live-model eval (scripts/nora-live-eval.mjs) is run by hand against the real model.
// These tests hold its rules to known replies, so a rule that cannot fail is caught here,
// and run the whole script against a fake server, so a run is known to report what it saw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge, noHandoff, plainText, noFalseDone, draftsCard, noCards, coachChips, givesAddress } from '../scripts/nora-eval-checks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (reply, actions = [], source = 'ai') => ({ reply, actions, source });

test('a hand-off claim fails, and the honest form passes', () => {
  for (const bad of ["I've passed this to the Shape team.", "I'll let the team know.", 'A teammate will follow up within a day.', "I'll forward it to billing.", 'Let me bring in the Shape team.']) {
    assert.ok(noHandoff(R(bad)), bad);
  }
  for (const good of ['I can\'t see billing details. The Shape team answers at info@theshapecommunity.com.', 'Your team page lists your coaches.', 'Pass the ball.']) {
    assert.equal(noHandoff(R(good)), null, good);
  }
});

test('markdown fails; plain text, a price and a bare address pass', () => {
  for (const bad of ['**Membership** is $5.', '## Plans\n$5 a month', '```\ncode\n```', 'See [pricing](/newdesign/Pricing.html).']) assert.ok(plainText(R(bad)), bad);
  for (const good of ['Membership is $5 a month.', '3 * 4 = 12', 'Email info@theshapecommunity.com.', 'Use #wins for good news.']) assert.equal(plainText(R(good)), null, good);
});

test('a change claimed as done fails; a drafted one passes', () => {
  for (const bad of ["I've logged 500 ml of water.", 'Your reminder has been set.', 'I have scheduled the session.']) assert.ok(noFalseDone(R(bad)), bad);
  for (const good of ["I've drafted it — review and confirm below.", 'It will be logged once you confirm.', 'Your last weigh-in was logged on Monday? I can see 180 lb.'.replace('was logged on Monday? ', '')]) assert.equal(noFalseDone(R(good)), null, good);
});

test('the card checks read the card, its action and its token', () => {
  const card = (action, token = 'x'.repeat(40)) => ({ type: 'proposal', action, token, label: 'Review & confirm' });
  assert.equal(draftsCard('log_water')(R('Drafted.', [card('log_water')])), null);
  assert.match(draftsCard('log_water')(R('Drafted.', [])), /no confirm card/);
  assert.match(draftsCard('log_water')(R('Drafted.', [card('log_meal')])), /log_meal, not log_water/);
  assert.match(draftsCard('log_water')(R('Drafted.', [card('log_water', '')])), /no signed token/);
  assert.equal(noCards(R('ok', [{ type: 'coach', label: 'Maya' }])), null);
  assert.match(noCards(R('ok', [card('log_water')])), /drafted log_water/);
  assert.equal(coachChips(R('Maya', [{ type: 'coach', label: 'Maya Okafor' }])), null);
  assert.match(coachChips(R('Maya', [])), /no coach chips/);
  assert.match(givesAddress(R('Ask the team.')), /does not give/);
});

test('every reply is held to the shared rules, and a fallback is not the model', () => {
  assert.deepEqual(judge(R('Membership is $5 a month.'), []), []);
  assert.deepEqual(judge(R('', [], 'ai'), []), ['empty reply']);
  assert.match(judge(R('Something.', [], 'fallback'), []).join(), /answered by fallback/);
  assert.equal(judge(R("**Done!** I've logged it and passed this to the team."), []).length, 3);
});

// ── the script end to end, against a fake Shape ──────────────────────────────────────
function fakeShape(handler) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const out = handler(req, body ? JSON.parse(body) : null);
        res.writeHead(out.status || 200, { 'Content-Type': 'application/json', ...(out.headers || {}) });
        res.end(JSON.stringify(out.json));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
const run = (url, env = {}, extra = []) => new Promise((resolve) => {
  execFile(process.execPath, [join(ROOT, 'scripts/nora-live-eval.mjs'), '--url', url, ...extra], { env: { ...process.env, NORA_EVAL_MEMBER_TOKEN: '', NORA_EVAL_TRAINER_TOKEN: '', NORA_EVAL_NUTRITIONIST_TOKEN: '', ...env } }, (err, stdout) => resolve({ code: err ? err.code : 0, out: stdout }));
});

test('a run reports what the server said: pass, fail with the reason, and skip without a token', async (t) => {
  const seen = [];
  const srv = await fakeShape((req, body) => {
    seen.push({ method: req.method, auth: req.headers.authorization || null });
    if (req.method === 'GET') return { json: { kind: req.headers.authorization ? 'member' : 'visitor', text: 'Hi', quick: ['a', 'b', 'c', 'd'] } };
    const q = body.messages.at(-1).content;
    if (/cost/.test(q)) return { json: { reply: 'Membership is $5 a month.', actions: [], source: 'ai' } };
    if (/coach/.test(q)) return { json: { reply: 'Try Maya.', actions: [{ type: 'coach', label: 'Maya Okafor' }], source: 'ai' } };
    if (/refund/.test(q)) return { json: { reply: "I've passed this to the team.", actions: [], source: 'ai' } };
    if (/water/.test(q)) return { json: { reply: 'Drafted — confirm below.', actions: body.confirmCards === false ? [] : [{ type: 'proposal', action: 'log_water', token: 't'.repeat(40) }], source: 'ai' } };
    return { json: { reply: 'You need to sign in as a member for that.', actions: [], source: 'ai' } };
  });
  t.after(() => srv.close());
  const url = `http://127.0.0.1:${srv.address().port}`;
  const { code, out } = await run(url, { NORA_EVAL_MEMBER_TOKEN: 'member-token' }, ['--only', 'visitor,member']);
  assert.equal(code, 1, 'a failure exits 1');
  assert.match(out, /PASS visitor\s+How much does Shape cost\?/);
  assert.match(out, /PASS visitor\s+Find me a strength coach/);
  assert.match(out, /FAIL visitor\s+I was charged twice\. Can you refund me\?\n\s+claims a hand-off: "I've passed this"; does not give info@theshapecommunity\.com/);
  assert.match(out, /PASS member\s+Log 500 ml of water/);
  assert.match(out, /PASS member\s+\[plain\] Log 500 ml of water/);
  assert.ok(seen.some((s) => s.auth === 'Bearer member-token'), 'a member case carries the member token');
  assert.ok(seen.filter((s) => s.auth === null).length >= 4, 'a visitor case carries none');

  const none = await run(url, {}, ['--only', 'trainer']);
  assert.match(none.out, /SKIP trainer\s+\(all cases\)\n\s+no NORA_EVAL_TRAINER_TOKEN/);
  assert.equal(none.code, 0, 'a skip is not a failure');
});

test('the bot check and a spent limit are skips, not failures', async (t) => {
  const srv = await fakeShape((req) => req.method === 'GET'
    ? { json: { kind: 'visitor', text: 'Hi', quick: ['a', 'b', 'c', 'd'] } }
    : { status: 403, json: { needsCheck: true, reply: 'One quick check' } });
  t.after(() => srv.close());
  const { code, out } = await run(`http://127.0.0.1:${srv.address().port}`, {}, ['--only', 'visitor']);
  assert.equal(code, 0);
  assert.match(out, /SKIP visitor\s+How much does Shape cost\?\n\s+the bot check is on/);
  assert.doesNotMatch(out, /FAIL/);
});
