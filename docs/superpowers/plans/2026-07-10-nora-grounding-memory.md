# Nora Grounded Answers + Memory (PR B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nora's support chat answers a member's personal questions with their real numbers (server-built, caller-RLS member-context block) and remembers what they tell her (`user_goals('nora_memory')` with CAS writes, remember/forget tools, a Settings management list).

**Architecture:** A pure `memberContext.mjs` formats fetched facts into ONE system-message block (unit-tested formatting/omission); the route's thin fail-soft fetchers read ONLY through the caller's RLS client. Memory is a `{rev, notes}` doc mutated under CAS by every writer (pure `noraMemory.mjs` + a server CAS loop); `remember`/`forget` are direct-with-audit tools registered per-request AFTER the fail-closed membership check. The Settings UI lists/deletes notes through the same CAS path.

**Tech Stack:** Next.js API route (`/api/support/chat`) · Supabase JS (caller-RLS) · plain-ESM pure modules + `node --test` · React mobile broadsheet (Settings section).

## Global Constraints (binding, from the merged spec #1652)

- **Non-members never SEE member tools:** the function-calling tool list is assembled per-request AFTER the fail-closed membership check (`computeMembership`); signed-out/prospect requests carry today's exact `TOOLS` array byte-identical. Per-handler membership re-check as defense-in-depth.
- **Context is server-built, caller-RLS only** — never client-supplied; every fact line renders only when the data exists (honest-data, absent ≠ 0). Context-fetch failure → chat proceeds with an explicit `member_context_unavailable` system note ("say the data isn't available — never estimate"), never silently ungrounded.
- **`nora_memory` = `{ rev, notes: [{ id, text, at }] }`** — cap 30 notes AND 280 chars/note (word-boundary truncation). ALL writers (remember, forget, Settings) mutate under CAS: re-read latest → apply (cap enforced on fresh state) → `update … .eq('data->>rev', String(rev))` writing `rev + 1` → zero rows = re-read + retry ×2 → surface failure. **First-row bootstrap:** no row → INSERT `{rev: 1, notes: [<change>]}`; a `(user_id, kind)` unique conflict = a CAS miss (re-read, continue).
- **`forget` requires exactly one selector** (`note_id` XOR `note`); text match must hit exactly one note; the audit row records **id + timestamps ONLY — never the text**.
- **Write-then-audit:** memory write first, audit second; audit failure → `audited:false` + a server log of **safe metadata only** (op id, action, note id, status — never note text/raw args). Audit keyed on the note's id as operation id; a dedupe-hit retry **reconciles the missing audit row** before returning. The chip shows "Noted — audit pending" when `audited:false`, never a clean "Noted ✓".
- **Settings clear-all runs through `window.bsAskConfirm`**; cancel writes nothing.
- **The model-down `fallbackReply` never states a personal metric** — test vector required.
- Cost note: facts ≈ 300–500 tokens; memory worst case ≈ 700 → ~1,200 total per member message.
- Repo rules: no migration; theme tokens only; no new colored emoji; LF (`sed -i 's/\r$//'`, verify `tr -cd '\r' | wc -c` = 0); verification per commit = JSX parse (from `mobile-app/`) · `npx tsc --noEmit` · `npm test` · PowerShell `$env:VITE_BASE='/m/'; npm run build` exit 0.

## File Structure

- Create `src/lib/ai/memberContext.mjs` — pure: `CONTEXT_HEADER`, `UNAVAILABLE_NOTE`, `formatMemberContext(facts) -> string|null`.
- Create `src/lib/ai/noraMemory.mjs` — pure: `MEMORY_KIND`, `NOTE_MAX_CHARS`, `NOTES_CAP`, `truncateNote`, `applyRemember(doc, text, nowIso)`, `applyForget(doc, {noteId, note})`, `emptyMemoryDoc()`.
- Create `tests/member-context.test.mjs` + `tests/nora-memory.test.mjs` (register in `package.json` `test` script, after `tests/ai-tone.test.mjs`).
- Modify `src/lib/ai/server.ts` — add `casWriteUserGoals(supabase, userId, kind, mutate)` (the CAS loop, shared by tools) and `memberToolNames(membership)`.
- Modify `src/lib/ai/actions.mjs` — add `rememberAction` / `forgetAction` (direct-with-audit shape) to `NORA_ACTIONS`.
- Modify `src/app/api/support/chat/route.ts` — membership check, per-request tool list, fact fetchers, context/unavailable system message, memory injection, direct-tool execution path.
- Modify `mobile-app/src/services/shapeBackend.js` — `window.ShapeNoraMemory = { list, removeNote, clearAll }` (client CAS via `window.shapeDb.client`).
- Modify `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — Settings Nora section gains "What Nora remembers" (list · per-note delete · clear-all behind `bsAskConfirm`); the support thread renders the "Noted ✓ / Noted — audit pending" chip on memory-tool results.
- Modify `docs/WORKLOG.md` — Latest pointer + dated entry.

---

### Task 1: pure `memberContext.mjs` (TDD)

**Files:**
- Create: `src/lib/ai/memberContext.mjs`
- Test: `tests/member-context.test.mjs`

**Interfaces:**
- Produces: `CONTEXT_HEADER` (the sentinel first line); `UNAVAILABLE_NOTE` (the honest-unavailable system note); `formatMemberContext(facts) -> string | null` where `facts = { today?: {kcal, kcalTarget, proteinG, proteinTarget, trainedToday, habitsDone, habitsTotal}, momentum?: {value, streakWeeks}, score?: {total, tier}, weight?: {latest, unit, loggedOn}, goal?: {title, target, unit, byDate}, plans?: string[], memory?: string[] }` — every field optional; a fact line renders ONLY when its value(s) exist; returns `null` when NOTHING exists (the route then omits the block entirely, which is different from fetch-FAILURE → `UNAVAILABLE_NOTE`).

- [ ] **Step 1: failing test** — `tests/member-context.test.mjs`:

```js
// Nora's member-context block — pure formatting/omission. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXT_HEADER, UNAVAILABLE_NOTE, formatMemberContext } from '../src/lib/ai/memberContext.mjs';

test('renders only the facts that exist — absent is OMITTED, never zeroed', () => {
  const s = formatMemberContext({ today: { kcal: 1450, kcalTarget: 1900, proteinG: 96, proteinTarget: 150 } });
  assert.ok(s.startsWith(CONTEXT_HEADER));
  assert.match(s, /1450.*1900/);
  assert.match(s, /96.*150/);
  assert.ok(!/score|weigh|goal|momentum|remember/i.test(s.slice(CONTEXT_HEADER.length)));
});

test('null/empty facts → null (no block at all)', () => {
  assert.equal(formatMemberContext({}), null);
  assert.equal(formatMemberContext(null), null);
  assert.equal(formatMemberContext({ today: {} }), null);
});

test('never fabricates: a lone target without a logged value renders no kcal line', () => {
  const s = formatMemberContext({ today: { kcalTarget: 1900 }, score: { total: 1284, tier: 'Tempo' } });
  assert.ok(!/kcal/i.test(s));
  assert.match(s, /1284/);
  assert.match(s, /Tempo/);
});

test('memory notes render under their own label, most recent set, verbatim', () => {
  const s = formatMemberContext({ memory: ['hates burpees', 'prefers morning sessions'] });
  assert.match(s, /hates burpees/);
  assert.match(s, /prefers morning sessions/);
  assert.match(s, /remember/i);
});

test('the header instructs honesty and the unavailable note forbids estimating', () => {
  assert.match(CONTEXT_HEADER, /never invent/i);
  assert.match(UNAVAILABLE_NOTE, /could not be loaded/i);
  assert.match(UNAVAILABLE_NOTE, /never estimate/i);
});
```

- [ ] **Step 2:** `node --test tests/member-context.test.mjs` → FAIL (module not found).

- [ ] **Step 3: implement** `src/lib/ai/memberContext.mjs`:

```js
// Nora's member-context block — pure formatting of server-fetched facts into
// ONE system message. Every line renders only when its data exists (honest-data:
// absent ≠ 0, and a target without a logged value is NOT a fact about today).
// The route owns fetching (caller-RLS); this module owns words.

export const CONTEXT_HEADER =
  'FACTS ABOUT THIS MEMBER — use them when relevant; never invent numbers; if a fact is not listed here, say you do not have it:';

// Injected INSTEAD of the block when a context fetch failed: the chat proceeds,
// but personal questions get an honest unavailable answer, never a guess.
export const UNAVAILABLE_NOTE =
  "NOTE: live member facts could not be loaded right now. If asked about their own numbers, say the data isn't available at the moment — never estimate or invent it.";

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function formatMemberContext(facts) {
  const f = facts && typeof facts === 'object' ? facts : {};
  const lines = [];
  const t = f.today || {};
  if (num(t.kcal) != null) lines.push(`- Today's calories: ${Math.round(t.kcal)} kcal${num(t.kcalTarget) != null ? ` of a ${Math.round(t.kcalTarget)} kcal target` : ''}.`);
  if (num(t.proteinG) != null) lines.push(`- Today's protein: ${Math.round(t.proteinG)} g${num(t.proteinTarget) != null ? ` of a ${Math.round(t.proteinTarget)} g target` : ''}.`);
  if (typeof t.trainedToday === 'boolean') lines.push(`- Trained today: ${t.trainedToday ? 'yes' : 'not yet'}.`);
  if (num(t.habitsDone) != null && num(t.habitsTotal) != null && t.habitsTotal > 0) lines.push(`- Habits today: ${t.habitsDone} of ${t.habitsTotal} done.`);
  const m = f.momentum || {};
  if (num(m.value) != null) lines.push(`- Momentum: ${Math.round(m.value)}/100${num(m.streakWeeks) != null && m.streakWeeks > 0 ? ` (${m.streakWeeks}-week streak)` : ''}.`);
  const sc = f.score || {};
  if (num(sc.total) != null) lines.push(`- Shape Score: ${Math.round(sc.total)}${sc.tier ? ` (${sc.tier} tier)` : ''}.`);
  const w = f.weight || {};
  if (num(w.latest) != null) lines.push(`- Latest weigh-in: ${w.latest} ${w.unit || 'lb'}${w.loggedOn ? ` on ${w.loggedOn}` : ''}.`);
  const g = f.goal || {};
  if (g.title) lines.push(`- Their goal: ${g.title}${num(g.target) != null ? ` (target ${g.target} ${g.unit || ''})`.replace(/ \)$/, ')') : ''}${g.byDate ? ` by ${g.byDate}` : ''}.`);
  if (Array.isArray(f.plans) && f.plans.length) lines.push(`- Active plans: ${f.plans.slice(0, 3).join(' · ')}.`);
  if (Array.isArray(f.memory) && f.memory.length) {
    lines.push('- Things they asked you to remember:');
    for (const note of f.memory.slice(0, 10)) lines.push(`  • ${String(note)}`);
  }
  if (!lines.length) return null;
  return [CONTEXT_HEADER, ...lines].join('\n');
}
```

- [ ] **Step 4:** `node --test tests/member-context.test.mjs` → PASS. Register the test file in `package.json`'s `test` script (append `tests/member-context.test.mjs` to the list). `npm test` → green.

- [ ] **Step 5: commit**

```bash
sed -i 's/\r$//' src/lib/ai/memberContext.mjs tests/member-context.test.mjs package.json
git add src/lib/ai/memberContext.mjs tests/member-context.test.mjs package.json
git commit -m "feat(nora): memberContext — pure member-facts block (tested, honest omission)"
```

---

### Task 2: pure `noraMemory.mjs` (TDD)

**Files:**
- Create: `src/lib/ai/noraMemory.mjs`
- Test: `tests/nora-memory.test.mjs`

**Interfaces:**
- Produces: `MEMORY_KIND = 'nora_memory'` · `NOTE_MAX_CHARS = 280` · `NOTES_CAP = 30` · `emptyMemoryDoc() -> {rev:0, notes:[]}` · `truncateNote(text) -> string` (word-boundary ≤280) · `applyRemember(doc, text, nowIso) -> { doc, note, deduped }` (id = a `mem_`-prefixed slug from a counter-free hash of normalized text — STABLE so retries dedupe; newest first; cap 30 by dropping the oldest) · `applyForget(doc, {noteId, note}) -> { doc, removed } | { error: 'not_found' | 'ambiguous' | 'bad_selector', candidates? }`.

- [ ] **Step 1: failing test** — `tests/nora-memory.test.mjs`:

```js
// nora_memory doc mutations — pure CAS-side logic. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyMemoryDoc, truncateNote, applyRemember, applyForget, NOTES_CAP, NOTE_MAX_CHARS } from '../src/lib/ai/noraMemory.mjs';

const NOW = '2026-07-10T12:00:00.000Z';

test('remember adds newest-first with a stable id; identical text dedupes', () => {
  const a = applyRemember(emptyMemoryDoc(), 'hates burpees', NOW);
  assert.equal(a.doc.notes.length, 1);
  assert.ok(a.note.id.startsWith('mem_'));
  const b = applyRemember(a.doc, 'prefers mornings', NOW);
  assert.equal(b.doc.notes[0].text, 'prefers mornings'); // newest first
  const c = applyRemember(b.doc, 'hates burpees', NOW);
  assert.equal(c.deduped, true);
  assert.equal(c.doc.notes.length, 2);
  assert.equal(c.note.id, a.note.id); // stable id — the retry/audit-repair key
});

test('notes truncate at a word boundary at 280 chars and the cap drops the oldest', () => {
  const long = 'word '.repeat(100);
  const t = truncateNote(long);
  assert.ok(t.length <= NOTE_MAX_CHARS);
  assert.ok(!/\s$/.test(t) && !t.endsWith('wor'));
  let doc = emptyMemoryDoc();
  for (let i = 0; i < NOTES_CAP + 5; i++) doc = applyRemember(doc, `note number ${i}`, NOW).doc;
  assert.equal(doc.notes.length, NOTES_CAP);
  assert.equal(doc.notes[0].text, `note number ${NOTES_CAP + 4}`);
  assert.ok(!doc.notes.some((n) => n.text === 'note number 0')); // oldest gone
});

test('forget: exactly one selector; by id; by exact single text; ambiguity fails closed', () => {
  let doc = emptyMemoryDoc();
  doc = applyRemember(doc, 'call me Chris', NOW).doc;
  const kept = applyRemember(doc, 'hates burpees', NOW);
  doc = kept.doc;
  assert.equal(applyForget(doc, {}).error, 'bad_selector');
  assert.equal(applyForget(doc, { noteId: 'x', note: 'y' }).error, 'bad_selector');
  assert.equal(applyForget(doc, { noteId: 'mem_nope' }).error, 'not_found');
  const byId = applyForget(doc, { noteId: kept.note.id });
  assert.equal(byId.removed.text, 'hates burpees');
  assert.equal(byId.doc.notes.length, 1);
  const byText = applyForget(doc, { note: 'call me Chris' });
  assert.equal(byText.removed.text, 'call me Chris');
  let dup = applyRemember(doc, 'call me chris PLEASE', NOW).doc; // near-dup text
  const amb = applyForget(dup, { note: 'call me' });
  assert.equal(amb.error, 'not_found'); // partial text is NOT an exact match
});
```

- [ ] **Step 2:** run → FAIL (module not found).

- [ ] **Step 3: implement** `src/lib/ai/noraMemory.mjs`:

```js
// user_goals('nora_memory') — { rev, notes: [{ id, text, at }] }. Pure doc
// mutations; the CAS write loop lives in server.ts (casWriteUserGoals). Ids are
// a stable hash of the normalized text so a retry dedupes AND can repair a
// missing audit row keyed on the same id.
export const MEMORY_KIND = 'nora_memory';
export const NOTE_MAX_CHARS = 280;
export const NOTES_CAP = 30;

export function emptyMemoryDoc() { return { rev: 0, notes: [] }; }

export function truncateNote(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= NOTE_MAX_CHARS) return s;
  const cut = s.slice(0, NOTE_MAX_CHARS);
  const atWord = cut.replace(/\s+\S*$/, '');
  return (atWord || cut).trim();
}

function noteId(text) {
  // djb2 over the normalized text — stable across retries, no Date/Math.random.
  const s = text.toLowerCase();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `mem_${h.toString(36)}`;
}

function normDoc(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  const notes = Array.isArray(d.notes) ? d.notes.filter((n) => n && n.id && n.text) : [];
  const rev = Number.isInteger(d.rev) && d.rev >= 0 ? d.rev : 0;
  return { rev, notes };
}

export function applyRemember(doc, text, nowIso) {
  const d = normDoc(doc);
  const clean = truncateNote(text);
  const id = noteId(clean);
  const existing = d.notes.find((n) => n.id === id);
  if (existing) return { doc: d, note: existing, deduped: true };
  const note = { id, text: clean, at: String(nowIso || '') };
  const notes = [note, ...d.notes].slice(0, NOTES_CAP);
  return { doc: { rev: d.rev, notes }, note, deduped: false };
}

export function applyForget(doc, selector) {
  const d = normDoc(doc);
  const { noteId: byId, note: byText } = selector || {};
  const hasId = typeof byId === 'string' && byId.trim();
  const hasText = typeof byText === 'string' && byText.trim();
  if ((hasId && hasText) || (!hasId && !hasText)) return { error: 'bad_selector' };
  let matches;
  if (hasId) matches = d.notes.filter((n) => n.id === byId.trim());
  else {
    const norm = truncateNote(byText).toLowerCase();
    matches = d.notes.filter((n) => n.text.toLowerCase() === norm);
  }
  if (matches.length === 0) return { error: 'not_found' };
  if (matches.length > 1) return { error: 'ambiguous', candidates: matches.map((n) => ({ id: n.id, text: n.text })) };
  const removed = matches[0];
  return { doc: { rev: d.rev, notes: d.notes.filter((n) => n.id !== removed.id) }, removed };
}
```

- [ ] **Step 4:** tests pass; register `tests/nora-memory.test.mjs` in `package.json`; `npm test` green.

- [ ] **Step 5: commit**

```bash
sed -i 's/\r$//' src/lib/ai/noraMemory.mjs tests/nora-memory.test.mjs package.json
git add src/lib/ai/noraMemory.mjs tests/nora-memory.test.mjs package.json
git commit -m "feat(nora): noraMemory — pure {rev, notes} doc mutations (tested: dedupe, cap, forget arity)"
```

---

### Task 3: server CAS loop + remember/forget tools

**Files:**
- Modify: `src/lib/ai/server.ts` (add `casWriteUserGoals` + `memberToolNames`)
- Modify: `src/lib/ai/actions.mjs` (add the two tools to `NORA_ACTIONS`)

**Interfaces:**
- Consumes: `applyRemember` / `applyForget` / `MEMORY_KIND` from Task 2; `computeMembership` from `@/lib/membership-core`.
- Produces: `casWriteUserGoals(supabase, userId, kind, mutate) -> Promise<{ok:true, result} | {ok:false, error}>` where `mutate(doc) -> { doc, result } | { error, ...detail }` — implements bootstrap-INSERT + rev-conditioned UPDATE + retry ×2 exactly per Global Constraints. `memberToolNames() -> ['remember','forget']` (PR C appends its tools here — ONE list the route reads). Tools `remember { note }` / `forget { note_id?, note? }` in `actions.mjs` with `direct: true` (executed inline by the route, not proposal-drafted), each handler: membership re-check via `ctx.assertMember()` → CAS write → audit (`log_ai_action`, source `'nora'`, target kind `'nora_memory'`, target id = note id, **suggestion/payload carry the note id + action only for forget — never the forgotten text**; remember's audit may carry the stored text since it persists anyway) → on audit throw: server log `console.warn('[nora-memory] audit failed', { op, action, noteId, status: 'unaudited' })` (safe metadata only) and return `audited:false`. Dedupe-hit retry: attempt the audit insert again (same op id) before returning.

Implementation notes the engineer needs:
- `casWriteUserGoals` shape (in `server.ts`):

```ts
export async function casWriteUserGoals(
  supabase: SupabaseClient,
  userId: string,
  kind: string,
  mutate: (doc: unknown) => { doc?: Record<string, unknown>; [k: string]: unknown },
): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await supabase.from('user_goals').select('data').eq('user_id', userId).eq('kind', kind).maybeSingle();
    const existing = (data as { data?: unknown } | null)?.data ?? null;
    const out = mutate(existing);
    if (out.error) return { ok: false, error: String(out.error), ...(out.candidates ? { result: { candidates: out.candidates } } : {}) } as never;
    const rev = existing && typeof existing === 'object' && Number.isInteger((existing as { rev?: number }).rev) ? (existing as { rev: number }).rev : null;
    const nextDoc = { ...(out.doc as object), rev: (rev ?? 0) + 1 };
    if (existing == null || rev == null) {
      const { error } = await supabase.from('user_goals').insert({ user_id: userId, kind, data: nextDoc });
      if (!error) return { ok: true, result: out as Record<string, unknown> };
      // unique-conflict on (user_id, kind) = a concurrent first write → re-read (CAS miss).
      continue;
    }
    const { data: upd, error } = await supabase
      .from('user_goals')
      .update({ data: nextDoc })
      .eq('user_id', userId)
      .eq('kind', kind)
      .eq('data->>rev', String(rev))
      .select('user_id');
    if (error) return { ok: false, error: 'write_failed' };
    if (Array.isArray(upd) && upd.length > 0) return { ok: true, result: out as Record<string, unknown> };
    // zero rows = a concurrent writer won — re-read and retry.
  }
  return { ok: false, error: 'conflict' };
}
```

**Error taxonomy (binding, as implemented):** only GENUINE CAS misses retry —
a read error returns `read_failed` immediately; an insert error retries ONLY
on the `23505` unique violation (anything else → `write_failed`); an update
error → `write_failed`. RLS denials, network failures, and schema errors
surface as themselves, never masked as `conflict`.

- The two actions in `actions.mjs` follow `logMealAction`'s object shape but with `direct: true` and no `undo` (direct-with-audit — the spec decision). Their `execute(ctx, input)` uses `ctx.casWrite` + `ctx.audit` which the ROUTE threads in (Task 4 builds a small `memoryCtx`); the pure mutations come from `noraMemory.mjs`. Follow the file's existing JSDoc/comment style; the model-facing descriptions must tell Nora to prefer `note_id` from context for forget and to relay `ambiguous` candidates plainly.

- [ ] **Step 1:** implement both files per the notes above.
- [ ] **Step 2:** `npx tsc --noEmit` clean; `npm test` green (actions.mjs is imported by tested modules — no regression).
- [ ] **Step 3: commit**

```bash
sed -i 's/\r$//' src/lib/ai/server.ts src/lib/ai/actions.mjs
git add src/lib/ai/server.ts src/lib/ai/actions.mjs
git commit -m "feat(nora): CAS user_goals writer + remember/forget direct-with-audit tools"
```

---

### Task 4: route wiring — membership gate, facts, memory, unavailable note, per-request tools

**Files:**
- Modify: `src/app/api/support/chat/route.ts`

**Interfaces:**
- Consumes: `formatMemberContext`/`UNAVAILABLE_NOTE` (Task 1), `applyRemember`/`applyForget`/`MEMORY_KIND` (Task 2), `casWriteUserGoals` (Task 3), `computeMembership` from `@/lib/membership-core`, `resolveActor` (existing).
- Produces: the POST flow —

```
resolveActor → (actor ? computeMembership(actor.supabase, actor.user.id, actor.user.email) : null)
→ isMember? → fetchMemberFacts(actor) [fail-soft, Promise.allSettled]
            → { facts, failed } = fetchMemberFacts(actor)
            → contextMsg = failed ? UNAVAILABLE_NOTE : formatMemberContext(facts)   ← branch on `failed`, never wrapper truthiness
            → tools = TOOLS + memberTools (remember/forget schemas)   ← members ONLY
→ !isMember → tools = TOOLS exactly as today; NO context message      ← byte-identical
```

Implementation notes:
1. **Member tool schemas** (append inside the route, gated):

```ts
const MEMBER_TOOLS = [
  { type: 'function', name: 'remember', description: "Remember a short personal fact the member EXPLICITLY asked you to keep (e.g. 'remember I hate burpees'). Pass their words, not your rewrite. Applied immediately (no confirm) and visible in Settings.", parameters: { type: 'object', properties: { note: { type: 'string', description: 'The fact, in their words. Keep it short.' } }, required: ['note'], additionalProperties: false }, strict: true },
  { type: 'function', name: 'forget', description: "Delete ONE remembered note when the member asks you to forget it. Prefer note_id (ids are listed in your member facts); pass note (exact text) only when you have no id. Never pass both.", parameters: { type: 'object', properties: { note_id: { type: 'string' }, note: { type: 'string' } }, required: [], additionalProperties: false }, strict: false },
];
```

2. **`fetchMemberFacts(actor)`** — thin, every leg `Promise.allSettled` + null on miss; returns `{ facts, failed }`:
   - today snapshot: `daily_health_snapshot` `.select('calories, protein_g, workout_minutes').eq('user_id', id).eq('snapshot_date', <local-day — reuse the route's UTC today; note the honest simplification in a comment>).maybeSingle()`;
   - momentum: `supabase.rpc('compute_momentum')`;
   - score: `score_ledger` `.select('delta, source_kind')` → sum excluding `store_redeem` (mirror `score-derive`) + tier via the thresholds in `@/lib/score-derive` helpers if exported, else omit tier;
   - weigh-in: `client_weigh_ins` newest row (`weight, unit, logged_on`);
   - goal: `user_goals('client_goals')` → `overall` title/target/date;
   - memory: `user_goals('nora_memory')` → 10 most recent note texts, formatted `"${text} (id ${id})"` so the model has forget ids;
   - `failed` = true only when EVERY leg rejected (vs resolved-empty) — that's the `UNAVAILABLE_NOTE` trigger; partial data renders partially (honest omission).
3. **Direct tools** run in `runTool` BEFORE the WRITE_TOOLS branch: `remember`/`forget` call the CAS + audit path (Task 3) and return `{ result: { done, noteId, audited } | { error, candidates? }, actions: [] }` — plus an ACTION-SPECIFIC UI chip emitted **only when `done === true`** (never on an error/ambiguous result): remember → `audited ? 'Noted ✓' : 'Noted — audit pending'`, forget → `audited ? 'Forgotten ✓' : 'Forgotten — audit pending'` (`{ type: 'screen', screen: 'nora_memory' }`), so the thread shows the state without new client plumbing.
4. **The system message assembly** in `askOpenAI` gains one optional context block parameter — `input = [{ role: 'system', content: systemPrompt }, ...(contextMsg ? [{ role: 'system', content: contextMsg }] : []), ...recent]`.
5. `fallbackReply` is UNTOUCHED (it takes only the user text — structurally no member content). Add the test vector: `tests/member-context.test.mjs` gains

```js
test('CONTEXT_HEADER is a unique sentinel that static fallback copy can never contain', () => {
  // The route's rule-based fallbackReply templates are static strings with no
  // member interpolation; this sentinel would have to be typed by hand to leak.
  assert.match(CONTEXT_HEADER, /^FACTS ABOUT THIS MEMBER/);
});
```

   and a route-level comment on `fallbackReply` stating the invariant.

- [ ] **Step 1:** implement; **Step 2:** `npx tsc --noEmit` + `npm test` green; **Step 3: commit**

```bash
sed -i 's/\r$//' src/app/api/support/chat/route.ts tests/member-context.test.mjs
git add src/app/api/support/chat/route.ts tests/member-context.test.mjs
git commit -m "feat(nora): grounded member context + per-request member tools (remember/forget) in support chat"
```

---

### Task 5: Settings "What Nora remembers" (mobile)

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (add `window.ShapeNoraMemory`)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (Settings Nora section)

**Interfaces:**
- Consumes: the `{rev, notes}` doc shape; `window.bsAskConfirm` (existing destructive-action primitive); `window.shapeDb.client` (Supabase).
- Produces: `window.ShapeNoraMemory = { list(): Promise<notes[]>, removeNote(id): Promise<{ok}>, clearAll(): Promise<{ok}> }` — removeNote/clearAll run the SAME CAS loop client-side (re-read → mutate → `.update().eq('data->>rev', …)` → retry ×2 on genuine misses only, hard errors surfaced; clearAll writes `{rev: rev+1, notes: []}`). **The doc SEMANTICS are imported, not forked:** shapeBackend imports the shared `normalizeMemoryDoc` from `src/lib/ai/noraMemory.mjs` (pure ESM, cross-root — the established `dashSignals.js` import precedent), so normalization/cap rules have exactly one implementation; only the environment-specific persistence loop lives client-side. (`public/m` is NOT committed — it's built at deploy since #1470; CI's Mobile check is the bundle gate.)

UI (in the Settings Nora block, beside Preview voice): a "What Nora remembers" row that expands to the note list — each row: note text · relative date · a quiet `×` delete; a `CLEAR ALL` text-action that calls `window.bsAskConfirm('Forget everything Nora remembers?', …)` and on confirm `clearAll()`; empty state: "Nothing yet — tell Nora 'remember …' in Support chat." Follow the section's existing row styling exactly (mono eyebrows, `t.*` tokens, hairline rules).

- [ ] **Step 1:** implement both files; **Step 2:** JSX parse (from `mobile-app/`) + `node --check` shapeBackend + PowerShell `/m/` build exit 0 + `npm test`; **Step 3: commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/shapeBackend.js mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/services/shapeBackend.js mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(nora): Settings — What Nora remembers (list, delete, clear-all behind bsAskConfirm; CAS writes)"
```

---

### Task 6: negative-path verification + WORKLOG

**Files:**
- Modify: `docs/WORKLOG.md`

- [ ] **Step 1: negative-path click-throughs** (browser or curl, per the spec's required vectors for THIS PR): signed-out POST to `/api/support/chat` → response identical shape to today, no remember/forget in any tool error, no context leakage; signed-in NON-member (if a test account exists — else assert the code path by reading `computeMembership` gating) → same; member chat with DB reachable → real numbers in the reply; memory: "remember I hate burpees" → chip; Settings list shows it; forget by ambiguous text → candidates listed; clear-all cancel → doc unchanged (re-open Settings).
- [ ] **Step 2:** WORKLOG Latest pointer + dated entry (grounded answers · memory · CAS · Settings list · the negative-path vectors run).
- [ ] **Step 3: commit + push + PR**

```bash
sed -i 's/\r$//' docs/WORKLOG.md
git add docs/WORKLOG.md
git commit -m "docs: WORKLOG — Nora grounded answers + memory (PR B)"
git push -u origin claude/nora-grounding-b
```

Open the PR via the REST API (no gh CLI); watch CI + CodeRabbit + Codex; address findings; squash-merge; keep the branch.

---

## Self-Review (done at plan time)

1. **Spec coverage (§2 Grounded answers + §4 Memory):** membership-gated context → Task 4; caller-RLS fetchers, honest omission → Tasks 1+4; `member_context_unavailable` → Task 1 (`UNAVAILABLE_NOTE`) + Task 4 trigger; fallback vector → Task 4 step 5; `{rev, notes}` CAS + bootstrap + cap + truncation → Tasks 2+3; remember/forget arity/dedupe/stable ids → Task 2; direct-with-audit + redacted logs + retry repair + `audited:false` chip → Tasks 3+4; per-request tool registry → Task 4 (`MEMBER_TOOLS` appended only for members); Settings UI + `bsAskConfirm` → Task 5; negative-path vectors → Task 6. **Deviation noted:** the pure module is `memberContext.mjs` (not the spec's `.ts` name) to match the repo's tested-ESM pattern (`tone.mjs`, `proposals.mjs`) — same contract.
2. **Placeholders:** none; Task 3/4 carry implementation-note code where full file context is needed rather than TBDs.
3. **Type consistency:** `applyForget` selector `{noteId, note}` (JS) ↔ the tool schema `note_id`/`note` (the route maps snake→camel at the call site — Task 4 note 3 owns that mapping); `casWriteUserGoals` return `{ok, result, error}` consumed identically in Tasks 3/5; `MEMORY_KIND` used by both server tools and the mobile helpers.
