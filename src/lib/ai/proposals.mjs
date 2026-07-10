// Preview / confirm scaffold — the reusable lifecycle every AI write goes
// through: AI proposes -> we build the EXACT change as a preview/diff -> a human
// confirms -> we execute -> we write one ai_audit_log row -> we expose undo.
//
// Pure & dependency-injected (no Next/Supabase imports) so it runs in node:test
// AND is imported by the API routes (mirrors src/lib/access-guards.mjs). The
// server injects real implementations of `ctx.store` (data reads/writes) and the
// `audit` sink (the ai_audit_log RPCs); the tests inject in-memory ones.
//
// Statelessness: a proposal is NOT stored server-side. `proposeChange` returns
// an HMAC-signed `token` carrying the exact planned change; `confirmChange`
// requires that token, so a change can only execute via an explicit confirm of
// a preview it produced — nothing executes without a confirmed step, and the
// confirmed change is byte-for-byte what was previewed.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const PROPOSAL_TTL_MS = 10 * 60_000; // a preview is confirmable for 10 minutes
const ALL_MEMBER_ROLES = ['client', 'trainer', 'nutritionist', 'admin'];

/** @typedef {'nora'|'engine'|'notification'} AISource */

// ───────────────────────── token signing ──────────────────────────
// token = base64url(JSON plan) + '.' + base64url(HMAC-SHA256(body, secret))

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function signToken(plan, secret) {
  if (!secret) throw new Error('proposal secret is required');
  const body = b64url(JSON.stringify(plan));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string' || !token.includes('.')) return null;
  const dot = token.indexOf('.');
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;
  const expected = b64url(createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let plan;
  try {
    plan = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (plan && typeof plan.exp === 'number' && now > plan.exp) return null;
  return plan;
}

// ───────────────────────── action registry ────────────────────────
// An action defines how to (a) preview a change, (b) execute it, (c) undo it.
//   define(name, {
//     roles?: string[] | (role) => boolean,   // who may run it (default: any member)
//     source?: AISource,                       // audit source (default 'engine')
//     buildPreview(ctx, input) => {            // PURE: no side effects
//       summary, diff:[{label,field,before,after}], target:{userId,kind,id},
//       beforeState, afterState, confirmedPayload, reversal?
//     },
//     execute(ctx, plan) => any,               // performs the write
//     undo(ctx, plan) => any,                  // reverses it (from beforeState)
//   })

export function createRegistry() {
  const actions = new Map();
  return {
    define(name, def) {
      actions.set(name, { name, ...def });
      return this;
    },
    get(name) {
      return actions.get(name) || null;
    },
    has(name) {
      return actions.has(name);
    },
    list() {
      return [...actions.keys()];
    },
  };
}

export function roleAllowed(action, role) {
  const roles = action.roles || ALL_MEMBER_ROLES;
  if (typeof roles === 'function') return !!roles(role);
  return Array.isArray(roles) && roles.includes(role);
}

// ───────────────────────── lifecycle ──────────────────────────────

/**
 * AI proposes a change: validate the action + role, build the preview/diff, and
 * sign a confirm token. Does NOT execute or write anything.
 * @returns {{ok:true, proposalId, requiresConfirm:true, preview, token} | {ok:false, error}}
 */
export async function proposeChange({
  registry,
  action: actionName,
  input,
  actor,
  ctx,
  secret,
  now = Date.now(),
  ttlMs = PROPOSAL_TTL_MS,
}) {
  const action = registry.get(actionName);
  if (!action) return { ok: false, error: 'unknown_action' };
  if (!roleAllowed(action, actor.role)) return { ok: false, error: 'role_not_allowed' };

  // buildPreview is where permission / "unmatched reference" / validation errors
  // surface — return them as a clean message (so Nora can ask), never a 500.
  let preview;
  try {
    preview = await action.buildPreview(ctx, input || {});
  } catch (e) {
    return { ok: false, error: 'preview_failed', message: (e && e.message) || 'I could not prepare that change.' };
  }
  const target = preview.target || { userId: actor.id, kind: 'self', id: null };
  const nonce = randomBytes(9).toString('base64url');

  const plan = {
    action: actionName,
    source: action.source || 'engine',
    actor: { id: actor.id, role: actor.role },
    target,
    suggestion: input ?? null,
    confirmedPayload: preview.confirmedPayload ?? null,
    beforeState: preview.beforeState ?? null,
    afterState: preview.afterState ?? null,
    reversal: preview.reversal ?? null,
    nonce,
    iat: now,
    exp: now + ttlMs,
  };

  return {
    ok: true,
    proposalId: nonce,
    requiresConfirm: true,
    preview: {
      summary: preview.summary || '',
      diff: Array.isArray(preview.diff) ? preview.diff : [],
      action: actionName,
      source: plan.source,
      target,
    },
    token: signToken(plan, secret),
  };
}

/**
 * The human confirms: verify the token (REQUIRED — nothing executes without it),
 * execute the exact previewed change, write one audit row, return an undo handle.
 *
 * Single-use: when a `consume(nonce)` is supplied, the token's nonce is atomically
 * RESERVED before execute, so the same token can never be applied twice (a second
 * confirm — re-render, two devices, double-tap across a remount — is rejected with
 * `already_confirmed` and never re-executes). If execute fails, the reservation is
 * released (via `release`) so the human can retry the SAME draft.
 * @returns {{ok:true, auditId, result} | {ok:false, error}}
 */
export async function confirmChange({ registry, token, actor, ctx, secret, audit, consume, release, now = Date.now() }) {
  const plan = verifyToken(token, secret, now);
  if (!plan) return { ok: false, error: 'invalid_or_expired_token' };
  if (!actor || !plan.actor || plan.actor.id !== actor.id) return { ok: false, error: 'actor_mismatch' };

  const action = registry.get(plan.action);
  if (!action) return { ok: false, error: 'unknown_action' };
  if (!roleAllowed(action, actor.role)) return { ok: false, error: 'role_not_allowed' };

  // Single-use gate: reserve the nonce BEFORE executing. A duplicate reservation
  // means this token was already confirmed — reject without re-running the action.
  if (typeof consume === 'function') {
    let fresh;
    try {
      fresh = await consume(plan.nonce);
    } catch {
      return { ok: false, error: 'consume_failed', message: 'Could not verify this action — please try again.' };
    }
    if (!fresh) return { ok: false, error: 'already_confirmed', message: 'That change was already applied.' };
  }

  // Execute via the endpoint; a failure (endpoint 4xx/RLS) is reported, not 500.
  // Nothing is audited unless the change actually applied.
  let result;
  try {
    result = await action.execute(ctx, plan);
  } catch (e) {
    // Execute failed → release the reservation so a retry of the same draft works.
    if (typeof release === 'function') { try { await release(plan.nonce); } catch { /* best-effort */ } }
    return { ok: false, error: 'execute_failed', message: (e && e.message) || 'I could not apply that change.' };
  }

  // The change is already applied (and its nonce consumed, so it can't re-run).
  // If the audit write fails, DON'T throw — that would surface as a failure to a
  // user whose change actually succeeded, and would re-run nothing. Report success
  // with audited:false instead (no undo handle), and log loudly so the untracked
  // change is visible server-side.
  let auditId = null;
  try {
    auditId = await audit.log({
      actorUserId: actor.id,
      actorRole: actor.role,
      source: plan.source,
      action: plan.action,
      target: plan.target,
      suggestion: plan.suggestion,
      confirmedPayload: plan.confirmedPayload,
      beforeState: plan.beforeState,
      afterState: plan.afterState,
      reversal: plan.reversal,
    });
  } catch (e) {
    console.error('[shape-ai] audit.log failed after a successful execute — change applied but untracked:', {
      action: plan.action, target: plan.target, message: (e && e.message) || String(e),
    });
    return { ok: true, auditId: null, audited: false, result };
  }

  return { ok: true, auditId, audited: true, result };
}

/**
 * Undo a previously-executed change: load its audit entry, atomically CLAIM
 * the executed→undone transition, then reverse the data via the action's own
 * undo (from the stored before-state).
 *
 * Claim-first is the one-shot guard: two concurrent undo requests could both
 * pass a status read and both apply the reversal (log_water's inverse delta
 * would subtract twice). When the sink exposes claimUndo (the
 * claim_ai_action_undo RPC), exactly one caller wins the claim and applies
 * the reversal; the loser reads alreadyUndone. A claim whose reversal then
 * FAILS is handed back via releaseUndo so the ledger never records an undo
 * that didn't happen; a claim whose reversal SUCCEEDS is finalized
 * (finalizeUndo clears the in-flight marker) so a completed undo can never
 * be released and re-run. Sinks without claimUndo (or pre-migration, when
 * the RPC signals absence with null) keep the legacy read→reverse→mark order.
 * @returns {{ok:true, alreadyUndone?:boolean} | {ok:false, error}}
 */
export async function undoChange({ registry, auditId, actor, ctx, audit }) {
  const entry = await audit.get(auditId);
  if (!entry) return { ok: false, error: 'audit_not_found' };
  if (entry.status === 'undone') return { ok: true, alreadyUndone: true };

  const action = registry.get(entry.action);
  if (!action || typeof action.undo !== 'function') return { ok: false, error: 'not_undoable' };

  let claimed = false;
  if (typeof audit.claimUndo === 'function') {
    const won = await audit.claimUndo(auditId);
    if (won === false) return { ok: true, alreadyUndone: true };
    claimed = won === true; // null = guard unavailable (pre-migration) → legacy order
  }

  const plan = {
    action: entry.action,
    source: entry.source,
    actor: { id: entry.actorUserId, role: entry.actorRole },
    target: entry.target,
    confirmedPayload: entry.confirmedPayload,
    beforeState: entry.beforeState,
    afterState: entry.afterState,
    reversal: entry.reversal,
  };
  try {
    await action.undo(ctx, plan);
  } catch (e) {
    if (claimed && typeof audit.releaseUndo === 'function') {
      try {
        await audit.releaseUndo(auditId);
      } catch (releaseErr) {
        // The reversal failed AND the hand-back failed: the row reads undone
        // but the data wasn't reversed. Surface loudly; the original error
        // still propagates to the caller.
        console.error('[shape-ai] undo claim release failed after a failed reversal:', {
          auditId, message: (releaseErr && releaseErr.message) || String(releaseErr),
        });
      }
    }
    throw e;
  }
  if (claimed) {
    // Close the claim so it can never be released (re-opened) after a
    // completed reversal. Best-effort: the data is reversed and the row
    // already reads undone — a finalize failure only leaves the release
    // window open, so log loudly rather than failing the undo.
    if (typeof audit.finalizeUndo === 'function') {
      try {
        await audit.finalizeUndo(auditId);
      } catch (finalizeErr) {
        console.error('[shape-ai] undo claim finalize failed after a successful reversal:', {
          auditId, message: (finalizeErr && finalizeErr.message) || String(finalizeErr),
        });
      }
    }
  } else {
    await audit.markUndone(auditId);
  }
  return { ok: true, undoneBy: actor ? actor.id : null };
}

// ───────────────────── in-memory adapters + demo action ───────────────────
// Used by the tests (and reusable anywhere a non-DB store is wanted). The
// server injects Supabase-backed equivalents with the same shape.

export function inMemoryStore(initial = {}) {
  const data = { ...initial };
  return {
    async get(key) {
      return key in data ? data[key] : null;
    },
    async set(key, value) {
      data[key] = value;
      return value;
    },
    _data: data,
  };
}

export function inMemoryAudit() {
  const rows = [];
  let seq = 0;
  return {
    async log(entry) {
      const id = `aud_${++seq}`;
      rows.push({ id, status: 'executed', ...entry });
      return id;
    },
    async get(id) {
      return rows.find((r) => r.id === id) || null;
    },
    async markUndone(id) {
      const r = rows.find((x) => x.id === id);
      if (r) {
        r.status = 'undone';
        r.undoneAt = Date.now();
      }
      return true;
    },
    // One-shot guard (mirrors claim_ai_action_undo): true = this caller won
    // the executed→undone transition; false = missing or already undone.
    // undoClaimedAt is the in-flight marker — release only works while set.
    async claimUndo(id) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== 'executed') return false;
      r.status = 'undone';
      r.undoneAt = Date.now();
      r.undoClaimedAt = Date.now();
      return true;
    },
    // The reversal succeeded — close the claim (finalize_ai_action_undo).
    // Mirrors FOUND: true only when an in-flight claim was actually closed.
    async finalizeUndo(id) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== 'undone' || r.undoClaimedAt == null) return false;
      r.undoClaimedAt = null;
      return true;
    },
    // Hand a claim back after a failed reversal (release_ai_action_undo).
    // Mirrors FOUND: true only when a still-in-flight claim was flipped back;
    // a finalized (completed) undo can never be re-opened.
    async releaseUndo(id) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== 'undone' || r.undoClaimedAt == null) return false;
      r.status = 'executed';
      r.undoneAt = null;
      r.undoClaimedAt = null;
      return true;
    },
    _rows: rows,
  };
}

// Single-use nonce reservation (tests + any non-DB use). `consume` returns true
// the FIRST time a nonce is seen, false thereafter; `release` lets a failed
// execute free the nonce so the same draft can be retried.
export function inMemoryConsumer() {
  const used = new Set();
  return {
    async consume(nonce) {
      if (used.has(nonce)) return false;
      used.add(nonce);
      return true;
    },
    async release(nonce) {
      used.delete(nonce);
    },
    _used: used,
  };
}

// A harmless, fully reversible demo action that proves the whole flow end to
// end. It reads/writes a single `ai_demo` value on the injected store (the
// server backs that with the caller's own user_goals row), so propose shows a
// real diff, confirm writes it, and undo restores the prior value.
export const demoEchoAction = {
  name: '__demo.echo',
  roles: ALL_MEMBER_ROLES,
  source: 'engine',
  async buildPreview(ctx, input) {
    const before = await ctx.store.get('ai_demo');
    const after = { note: String((input && input.note) ?? '') };
    return {
      summary: `Set the demo note to "${after.note}"`,
      diff: [{ label: 'Demo note', field: 'note', before: (before && before.note) ?? null, after: after.note }],
      target: { userId: ctx.actor.id, kind: 'self', id: null },
      beforeState: before,
      afterState: after,
      confirmedPayload: after,
    };
  },
  async execute(ctx, plan) {
    return ctx.store.set('ai_demo', plan.afterState);
  },
  async undo(ctx, plan) {
    return ctx.store.set('ai_demo', plan.beforeState);
  },
};
