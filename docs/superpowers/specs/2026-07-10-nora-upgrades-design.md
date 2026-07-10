# Nora upgrades — voice · grounded answers · member actions · memory

**Date:** 2026-07-10 · **Status:** DRAFT — awaiting owner go
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
  A **`NORA_TTS_INSTRUCTIONS` env** overrides both (the owner is auditioning
  voices/styles — openai.fm demos every voice with instructions; whatever
  lands is a one-line env change, no deploy edit). The route's **verbatim
  contract is unchanged**: instructions steer *delivery*, never words —
  `X-Spoken-Text` parity holds.
- **The robot dies.** `speakOnDevice` + the fallback branch are DELETED.
  A failed/unavailable server voice returns `{ ok: false, reason }`:
  an explicit "Listen" tap shows an honest toast — signed-out: "Nora's voice
  is a member feature", member/error: "Voice is unavailable right now" —
  and auto-speak callers stay silent. Silence over brand-damaging robot audio.
- **Hold-to-talk conversation mode** (mobile Nora support chat): a mic button
  in her composer — hold → record (the meal-logger MediaRecorder pattern) →
  release → `/api/ai/transcribe` → the text sends as a normal chat message →
  her reply auto-plays via `speakVoice(reply, { force: true })` while the
  mode's on. A "Voice chat" toggle chip in the thread header, **off by
  default**; any capture/transcribe failure degrades to the text composer with
  the error line (the logger's exact pattern). Website parity is a follow-up.
- The existing voice picker (6 voices) and tone setting stay as-is.

### 2. Grounded answers (PR B)

- `/api/support/chat`: when `resolveActor` returns an authenticated member,
  the route builds a **server-side member-context block** — never
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
  stay thin in the route. Context-fetch failure → chat proceeds ungrounded
  (grounding must never break support). Signed-out/prospect chat is
  byte-identical to today. Cost: ~300–500 extra prompt tokens per member
  message.

### 3. Member actions (PR C)

New Tier-1 tools in `actions.mjs`, exact `logMealAction` shape (self-scoped
`ctx.actor.id`, preview → confirm → `ai_audit_log` → undo), registered in
`serverRegistry` + support-chat function calling:

- **`log_weigh_in { weight, unit? }`** → today's `client_weigh_ins` upsert
  (the ShapeWeighIns path; fires the goal-milestone check). Undo restores the
  prior row (or deletes today's).
- **`log_water { amount, unit: 'ml'|'oz' }`** → the `/api/client/hydration`
  delta (undo: restore the prior snapshot value, as `log_meal` does).
- **`check_habit { habit }`** → fuzzy-match one of the member's own active
  habits by name; preview names the matched habit + points; execute = the
  existing habits-toggle path; undo untoggles. No match → the error lists
  their actual habit names (never guess-toggles).
- **`set_reminder { kind, time, days?, label? }`** → `user_scheduled_reminders`
  insert with the reminders route's validation. Undo deletes the row.
- **`find_food { query }`** — a LOOKUP, not a proposal: the provider fan-out in
  `/api/nutrition/food-search` is extracted to a shared server helper
  (`searchFoodsServer(q)`) used by both the route and this tool, so Nora can
  fetch REAL macros (hybrid FDC+OFF, #1648) and then propose a `log_meal`
  filled with them — "log the Chipotle bowl" stops being a guess.

### 4. Memory (PR B, alongside grounding)

- **`user_goals('nora_memory')`** — `{ notes: [{ id, text, at }] }`, cap 30,
  **no migration**. Injected into the member-context block (10 most recent).
- Two tools: **`remember { note }`** / **`forget { note }`**. **Decision for
  review:** these run **direct-with-audit** (no confirm card — "remember I
  hate burpees" shouldn't need a modal; every write still lands in
  `ai_audit_log` and shows an inline "Noted ✓" chip), unlike the data tools
  which keep the confirm gate. Say the word if you want the confirm card on
  memory too.
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
memory survives a reload and deletes from Settings. Voice quality is signed
off **by ear by the owner** (pick voice + instructions, then we pin the env).

## Owner actions

None required. Optional: audition voices/styles at openai.fm and hand me the
winning voice + instruction line → `NORA_TTS_INSTRUCTIONS` (+ default voice)
in Vercel env.
