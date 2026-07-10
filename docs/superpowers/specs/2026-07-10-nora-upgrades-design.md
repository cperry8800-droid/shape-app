# Nora upgrades — voice · grounded answers · member actions · memory

**Date:** 2026-07-10 · **Status:** APPROVED — owner go 2026-07-10
**Owner scope decisions taken:** the four picked items — **voice overhaul**,
**grounded answers**, **member actions**, **memory**. The proactive Home
byline, rich answer cards, and the Radio-DJ resume stay follow-ups.

## The problem

Nora talks like a stranger and, in the demo, sounds like a robot:

1. **The robot IS the fallback.** `speakVoice` (shapeBackend) falls back to the
   device's built-in `speechSynthesis` whenever the server voice can't run —
   which includes **every signed-out preview** (no Bearer → the real voice is
   never even attempted) and every non-member (the `/api/ai` gate 402s). The
   real voice (`gpt-4o-mini-tts`) is fine — but it's also sent **bare**, with
   no style steering, so even the good path reads flat.
2. **She doesn't know the member.** Support chat answers from a generic prompt
   — "how am I doing this week?" gets a brochure, not an answer.
3. **Members can't do anything through her.** The action rails (preview →
   confirm → audit → undo) exist but carry only `log_meal` + six coach tools.
4. **She forgets everything** between sessions.

## What ships (4 pieces, 3 build PRs)

### 1. Voice overhaul (PR A)

- **Style steering.** `synthesizeSpeech` (src/lib/ai.ts) gains an
  `instructions` param passed to the OpenAI speech API. New pure
  `voiceStyleForTone(tone)` in `tone.mjs`:
  - supportive → "Warm, natural, encouraging fitness coach talking with a
    friend — relaxed pace, conversational, never announcer-like."
  - direct → "Crisp, confident, matter-of-fact coach — brisk, energetic, no
    fluff."
  A **`NORA_TTS_INSTRUCTIONS` env** overrides both. This IS one new env var —
  but strictly **optional**: unset, the code-side `voiceStyleForTone` defaults
  apply and nothing breaks (the owner is auditioning voices/styles —
  openai.fm demos every voice with instructions; whatever lands is a one-line
  env change, no code edit). No other env is added; nothing is *required* for
  deploy. The route's **verbatim contract is unchanged**: instructions steer
  *delivery*, never words — `X-Spoken-Text` parity holds.
- **The robot dies.** `speakOnDevice` + the fallback branch are DELETED.
  A failed/unavailable server voice returns `{ ok: false, reason }`:
  an explicit "Listen" tap shows an honest toast — signed-out: "Nora's voice
  is a member feature", member/error: "Voice is unavailable right now" —
  and auto-speak callers stay silent. Silence over brand-damaging robot audio.
- **Hold-to-talk conversation mode** (mobile Nora support chat): a mic button
  in her composer — hold → record (the meal-logger MediaRecorder pattern) →
  release → `/api/ai/transcribe` → the text sends as a normal chat message →
  her reply auto-plays via `speakVoice(reply, undefined, { force: true })`
  while the mode's on (the live signature is `speakVoice(text, toneOverride,
  opts)` — force rides the third slot, so replies play even with the normal
  voice toggle off). A "Voice chat" toggle chip in the thread header, **off by
  default**; any capture/transcribe failure degrades to the text composer with
  the error line (the logger's exact pattern). Website parity is a follow-up.
- The existing voice picker (6 voices) and tone setting stay as-is.

### 2. Grounded answers (PR B)

- `/api/support/chat`: when the caller is an authenticated **member** — an
  explicit membership check, not just `resolveActor` (which only proves a
  signed-in profile; support chat sits outside the membership-gated prefixes,
  so a signed-in prospect would otherwise slip into the member path) — the
  route builds a **server-side member-context block** — never
  client-supplied — and injects it as a system message: *"Facts about THIS
  member — use them when relevant; never invent numbers; if a fact isn't
  here, say you don't have it."*
- Contents (each line only when the data exists — honest-data, absent ≠ 0):
  today's kcal/protein vs target + workout scheduled/done + habits done/total
  (`daily_health_snapshot`, plan, habits); streak + momentum
  (`compute_momentum` — already auth.uid()-scoped, callable AS the member);
  Shape Score + tier (ledger sum); latest weigh-in + the Overall goal
  (`client_weigh_ins`, `user_goals('client_goals')`); active plan titles.
  All reads run on the **caller's RLS client** — the block can only ever
  contain the caller's own rows.
- New **pure module `src/lib/ai/memberContext.ts`**: `formatMemberContext(
  facts) -> string` (unit-tested formatting/omission vectors); the fetchers
  stay thin in the route. **Context-fetch failure → honest-unavailable, not
  silent:** the chat still proceeds (grounding must never break support), but
  the system message is replaced with an explicit
  `member_context_unavailable` note — *"live member facts could not be loaded
  right now; if asked about their own numbers, say the data isn't available —
  never estimate or invent it"* — so personal questions get an honest
  unavailable answer instead of a fabricated one. **The model-down fallback
  stays honest too:** when `askOpenAI` fails, the route's rule-based
  `fallbackReply` takes over — it is generic support copy that by construction
  never states a personal metric, so a member whose context also failed can
  never receive fabricated numbers through that path; PR B adds a test vector
  asserting the fallback contains no member-context content. Signed-out and
  signed-in non-member chat is byte-identical to today. Cost: ~300–500 extra
  prompt tokens per member message for the facts block; injected memory adds
  up to ~700 more at the worst case (10 notes × 280 chars ≈ 2,800 chars), so
  the measured worst-case overhead is **~1,200 prompt tokens** per member
  message — still trivial at support-chat volumes.

### 3. Member actions (PR C)

New Tier-1 tools in `actions.mjs`, exact `logMealAction` shape (self-scoped
`ctx.actor.id`, preview → confirm → `ai_audit_log` → undo), registered in
`serverRegistry` + support-chat function calling. **Non-members never even SEE
the tools:** the support-chat function-calling tool list is assembled
per-request AFTER the fail-closed membership check — a signed-out or
signed-in-prospect request carries today's exact tool set (byte-identical, no
discoverability). **And every member tool gates on membership at execution
time as defense-in-depth** — each handler runs the explicit membership check
itself before building a preview AND before executing (support chat sits
outside the membership-gated `/api` prefixes, so neither the route nor the
model prompt is trusted to enforce it):

- **`log_weigh_in { weight, unit? }`** → today's `client_weigh_ins` upsert
  (the ShapeWeighIns path; fires the goal-milestone check). Undo restores the
  prior row (or deletes today's).
- **`log_water { amount, unit: 'ml'|'oz' }`** → the `/api/client/hydration`
  delta (undo: restore the prior snapshot value, as `log_meal` does).
- **`check_habit { habit }`** → fuzzy-match against the member's own active
  habits by name, and proceed only on **exactly one** match; preview names the
  matched habit + points; execute = the existing habits-toggle path; undo
  untoggles. No match → the error lists their actual habit names; **multiple
  matches → fail closed**: no preview/toggle, return the candidate names and
  ask the member to pick one (never guess-toggles).
- **`set_reminder { kind, time, days?, label? }`** → `user_scheduled_reminders`
  insert with the reminders route's validation. Undo deletes the row.
- **`find_food { query }`** — a LOOKUP, not a proposal: the provider fan-out in
  `/api/nutrition/food-search` is extracted to a shared server helper
  (`searchFoodsServer(q)`) used by both the route and this tool, so Nora can
  fetch REAL macros (hybrid FDC+OFF, #1648) and then propose a `log_meal`
  filled with them — "log the Chipotle bowl" stops being a guess.

**Undo carries a stale-write guard — enforced IN the statement.** Every
proposal's `beforeState` records the touched row's version marker
(`updated_at`, else a full value snapshot); the undo's UPDATE/DELETE carries
that predicate **in the atomic statement itself** (`…eq('updated_at',
afterState.updatedAt)` — never a separate read-then-check, which would just
move the race). Zero affected rows IS the conflict — surfaced honestly as
"changed since — nothing undone", never a blind overwrite. Applies uniformly
to every undo path; the existing `log_meal` undo has the same
blind-overwrite gap today, and PR C applies the identical in-statement guard
to it while in the file.

### 4. Memory (PR B, alongside grounding)

- **`user_goals('nora_memory')`** — `{ rev, notes: [{ id, text, at }] }`, cap
  30 notes AND **cap 280 chars per note** (longer `remember` payloads are
  truncated at a word boundary before persistence — bounds the prompt-size
  contribution, not just the count), **no migration**. Injected into the
  member-context block (10 most recent). **All writers mutate the doc under a
  CAS revision:** `remember`, `forget`, and the Settings UI each re-read the
  latest doc, apply their change against it (the 30-note cap enforced on that
  fresh state), and write conditioned on the stored `rev`
  (`…eq('data->>rev', rev)`, writing `rev + 1`; zero affected rows → re-read
  and retry, twice, then surface the failure) — so concurrent edits can never
  silently clobber each other or overshoot the cap.
- Two tools: **`remember { note }`** / **`forget { note_id?, note? }`**.
  `remember`'s result surfaces each note's stable `id`; **`forget` deletes by
  `note_id`** (the model gets ids in context). Text-only `forget` is accepted
  only when it matches **exactly one** note — duplicates/ambiguity fail
  closed, listing the candidates with ids. **The `forget` audit row records
  the deleted note's id + timestamps ONLY — never the text** (a forget must
  actually forget; parking the forgotten content in `ai_audit_log` would
  defeat the deletion). **Write-then-audit failure behavior** (there is no
  single transaction across `user_goals` + `ai_audit_log` without a bespoke
  RPC — deliberately not added for v1): the memory write lands first, the
  audit row second, and an audit failure after a successful write surfaces
  `audited:false` in the tool result + a server log instead of throwing — the
  exact established `proposals.mjs` pattern. **That server log carries safe
  metadata ONLY** — operation id, action name, note id, status — never the
  note text and never raw tool arguments (memory content must not leak into
  logs). **Retries repair the audit:**
  both tools key their audit row on a stable operation id (the note's own id),
  so a retry that dedupes an already-written note reconciles the missing audit
  row (insert-if-absent) before returning — a mutation can't stay permanently
  unaudited. The inline chip reflects `audited:false` honestly ("Noted — audit
  pending"), never a clean "Noted ✓". Both tools are idempotent (`remember`
  dedupes an identical note; `forget` by id), so a retry after a partial
  failure never double-applies. These tools also gate on the same
  execution-time membership check as the data tools. **Decision for review:**
  these run **direct-with-audit**
  (no confirm card — "remember I hate burpees" shouldn't need a modal; every
  write still lands in `ai_audit_log` and shows an inline "Noted ✓" chip),
  unlike the data tools which keep the confirm gate. Say the word if you want
  the confirm card on memory too.
- **Management UI:** the Settings Nora section gains "What Nora remembers" —
  the list, per-note delete, clear all. Self-only by RLS (`user_goals`).

## Out of scope (noted follow-ups)

Proactive Nora byline on Home · rich answer cards · website hold-to-talk ·
the Radio-DJ resume (paused branch) · long-term semantic memory.

## Phasing + verification

Three PRs: **A voice** → **B grounding + memory** → **C member tools**. Per
commit: parse/tsc · `/m/` build · `npm test` (new vectors: `voiceStyleForTone`,
`formatMemberContext`, tool previews where pure) · LF. Click-throughs: demo
Listen shows the honest toast (no robot); member chat answers "how am I doing
this week" with real numbers; each tool round-trips propose → confirm → undo;
memory survives a reload and deletes from Settings. **Negative-path vectors
(required before each PR ships):** signed-out AND signed-in-prospect chat
exposes no member tool (the tool list is byte-identical to today's);
membership revoked between preview and confirm → execute fails closed; every
tool touches only the caller's own rows (self-scoped `ctx.actor.id` + RLS,
asserted); undo against a row edited after execute returns the conflict and
changes nothing; an audit-write failure followed by a retry reconciles the
missing audit row; the model-down `fallbackReply` contains no member-context
content; Settings "clear all" requires the confirm primitive
(`window.bsAskConfirm`) and per-note delete removes exactly the one id. Voice
quality is signed off **by ear by the owner** (pick voice + instructions,
then we pin the env).

## Owner actions

Nothing is required for the build to ship — every default lives in code (the
one new env var, `NORA_TTS_INSTRUCTIONS`, is an optional override). Optional:
audition voices/styles at openai.fm and hand me the winning voice +
instruction line → set `NORA_TTS_INSTRUCTIONS` (+ default voice) in Vercel
env.
