// Server-side directive engine — the "one lead per page" composer.
//
// REUSES the same pure engine the website + mobile app use
// (public/newdesign/dashSignals.js → buildDirective) so the directive reads
// identically everywhere — no fork. On top of it this adds the three things that
// must live server-side: the coach-override merge (the override WINS), a
// per-client/day cache (recomputed when a meaningful signal changes), and the
// audit-logged override write into client_programs.detail.directive.
//
// HONEST DATA: buildDirective is deterministic and grounded in real record
// signals (returns "—" when there's nothing) — there is NO model call here, so a
// directive can never be fabricated.

import type { SupabaseClient } from '@supabase/supabase-js';
// The engine is a pure UMD module (module.exports = api); imported for its
// buildDirective. No window in Node — we use the exported object directly.
import DashSignals from '../../../public/newdesign/dashSignals.js';

export type Directive = {
  source: string;
  lever: string | null;
  severity: string;
  verdict: string;
  reason: string;
  action: { label: string; kind: string } | null;
  read: { summary30d: string; oneThingNow: string };
  cited: string[];
};

const engine = DashSignals as unknown as {
  buildDirective: (record: unknown, now?: Date, role?: string) => Directive;
};

/** The directive a record yields with NO override — the suggestion a coach overrides. */
export function engineDirective(record: unknown, now = new Date()): Directive {
  return engine.buildDirective(record, now, 'client');
}

// ── per-client/day cache, keyed by a hash of the signals the directive reads ──
type CacheEntry = { day: string; sig: string; directive: Directive };
const cache = new Map<string, CacheEntry>();

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// A tiny stable hash of the directive-relevant signals, so a cached directive is
// reused within the day UNTIL one of those signals meaningfully changes.
function signalHash(record: Record<string, unknown>, override: unknown): string {
  const pick = {
    o: override ?? null,
    ta: record.trainingAdherence ?? null,
    fl: record.foodLogs ?? null,
    nu: record.nutrition ?? null,
    st: record.streaks ?? null,
    ci: record.checkIn ?? null,
    rc: record.recovery ?? null,
    go: record.goals ?? null,
    sh: record.shapeScoreHistory ?? null,
  };
  const s = JSON.stringify(pick);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** Read a stored coach override from client_programs.detail.directive (RLS-scoped). */
export async function readOverride(supabase: SupabaseClient, clientId: string): Promise<unknown> {
  const { data } = await supabase
    .from('client_programs')
    .select('detail')
    .eq('user_id', clientId)
    .maybeSingle();
  const detail = (data as { detail?: { directive?: unknown } } | null)?.detail;
  return detail && typeof detail === 'object' ? (detail as { directive?: unknown }).directive ?? null : null;
}

/**
 * Compute the directive for a record + target client: merge any stored coach
 * override (it wins), then run the shared engine, cached per target/day.
 */
export async function computeDirective(
  supabase: SupabaseClient,
  record: Record<string, unknown>,
  targetId: string,
  now = new Date(),
): Promise<{ directive: Directive; cached: boolean }> {
  const override = await readOverride(supabase, targetId);
  const merged = override ? { ...record, coachDirective: override } : record;
  const sig = signalHash(record, override);
  const day = dayKey(now);
  const hit = cache.get(targetId);
  if (hit && hit.day === day && hit.sig === sig) return { directive: hit.directive, cached: true };
  const directive = engine.buildDirective(merged, now, 'client');
  cache.set(targetId, { day, sig, directive });
  return { directive, cached: false };
}

export function invalidateDirectiveCache(targetId: string): void {
  cache.delete(targetId);
}

/**
 * Write (or clear, when override is null) a coach override into
 * client_programs.detail.directive, MERGING so it never clobbers the trainer /
 * nutritionist program sections. Returns the before/after for the audit row.
 */
export async function writeOverride(
  supabase: SupabaseClient,
  clientId: string,
  coachId: string,
  override: Record<string, unknown> | null,
): Promise<{ before: unknown; after: unknown }> {
  // Read the current directive only to capture the before-value for the audit row.
  const { data } = await supabase
    .from('client_programs')
    .select('detail')
    .eq('user_id', clientId)
    .maybeSingle();
  const detail = ((data as { detail?: Record<string, unknown> } | null)?.detail) || {};
  const before = (detail as { directive?: unknown }).directive ?? null;
  // Atomic merge — write ONLY detail.directive (ON CONFLICT DO UPDATE reads the row
  // under its lock), so a concurrent program write can't clobber it via a stale
  // read-modify-write.
  const { error } = await supabase.rpc('merge_program_detail', { p_client_id: clientId, p_patch: { directive: override } });
  if (error) throw new Error(`directive override write failed: ${error.message}`);
  return { before, after: override };
}

const LEVERS = new Set(['sleep', 'nutrition', 'training', 'checkin', 'goal', 'score', 'contact', 'none']);

/** Clamp/shape a coach-supplied override so only known, bounded fields persist. */
export function sanitizeOverride(
  raw: unknown,
  coachId: string,
  now = new Date(),
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
  const lever = typeof r.lever === 'string' && LEVERS.has(r.lever) ? r.lever : undefined;
  const out: Record<string, unknown> = { setBy: coachId, at: now.toISOString() };
  if (lever) out.lever = lever;
  const verdict = str(r.verdict, 60);
  if (verdict) out.verdict = verdict;
  const reason = str(r.reason, 280);
  if (reason) out.reason = reason;
  const severity = typeof r.severity === 'string' && ['red', 'amber', 'green'].includes(r.severity) ? r.severity : undefined;
  if (severity) out.severity = severity;
  if (r.action && typeof r.action === 'object') {
    const a = r.action as Record<string, unknown>;
    const label = str(a.label, 80);
    const kind = str(a.kind, 40);
    if (label) out.action = { label, kind: kind || 'message' };
  }
  // Require at least one substantive field beyond the stamps.
  return out.lever || out.verdict || out.reason || out.action ? out : null;
}
