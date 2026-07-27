// Mission Control flight data — admin-gated, like /api/warroom.
//
// Open PRs + their three merge gates (CI on the head SHA · CodeRabbit verdict ·
// Codex presence) plus main's CI state for the alarm strip. GitHub REST with a
// 60s in-process cache so the console can poll without hammering the API.
//
// Honesty contract (see docs/superpowers/specs/2026-07-27-mission-control-console-design.md):
// no GITHUB_TOKEN → {ok:false, reason:'no_token'} and the panel says exactly
// what to set; GitHub unreachable → {ok:false, reason:'github_error'}; a gate
// with no record reads 'none' — never green, never red.

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/admin-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPO = process.env.GITHUB_REPO || 'cperry8800-droid/shape-app';
// The three required checks on main (branch protection). Names drift rarely;
// when none match we fall back to judging ALL runs rather than claiming green.
const REQUIRED_CHECKS = [
  'Web (typecheck + build)',
  'Mobile (build + public/m sync)',
  'Secret scan (gitleaks)',
];
const PR_CAP = 6;
const CACHE_MS = 60_000;

export type Gate = 'green' | 'red' | 'running' | 'none';
export type FlightPr = {
  number: number;
  title: string;
  url: string;
  branch: string;
  createdAt: string;
  draft: boolean;
  ci: Gate;
  coderabbit: 'approved' | 'changes' | 'commented' | 'none';
  codex: 'present' | 'none';
  allGreen: boolean;
};
export type Flight = {
  ok: boolean;
  reason?: 'no_token' | 'github_error';
  generatedAt: string;
  ciMain: Gate;
  prs: FlightPr[];
};

let cache: { at: number; data: Flight } | null = null;

async function gh(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'shape-mission-control',
    },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`github ${res.status} on ${path}`);
  return res.json();
}

type CheckRun = { name?: string; status?: string; conclusion?: string | null };

function gateFromRuns(runs: CheckRun[]): Gate {
  const required = runs.filter((r) => REQUIRED_CHECKS.includes(String(r.name)));
  const judged = required.length ? required : runs;
  if (!judged.length) return 'none';
  if (judged.some((r) => r.status !== 'completed')) return 'running';
  const bad = ['failure', 'cancelled', 'timed_out', 'action_required'];
  if (judged.some((r) => bad.includes(String(r.conclusion)))) return 'red';
  return 'green';
}

async function checkRunsFor(sha: string, token: string): Promise<Gate> {
  const data = (await gh(`/repos/${REPO}/commits/${sha}/check-runs?per_page=100`, token)) as {
    check_runs?: CheckRun[];
  };
  return gateFromRuns(Array.isArray(data.check_runs) ? data.check_runs : []);
}

type Review = { user?: { login?: string }; state?: string };
type Comment = { user?: { login?: string }; body?: string };

async function buildFlight(token: string): Promise<Flight> {
  const generatedAt = new Date().toISOString();
  const [pullsRaw, ciMain] = await Promise.all([
    gh(`/repos/${REPO}/pulls?state=open&per_page=${PR_CAP}`, token) as Promise<
      Array<{
        number: number;
        title?: string;
        html_url?: string;
        draft?: boolean;
        created_at?: string;
        head?: { ref?: string; sha?: string };
      }>
    >,
    checkRunsFor('main', token).catch((): Gate => 'none'),
  ]);

  const prs = await Promise.all(
    (Array.isArray(pullsRaw) ? pullsRaw : []).slice(0, PR_CAP).map(async (p): Promise<FlightPr> => {
      let ci: Gate = 'none';
      let coderabbit: FlightPr['coderabbit'] = 'none';
      let codex: FlightPr['codex'] = 'none';
      try {
        const [ciGate, reviews, comments] = await Promise.all([
          p.head?.sha ? checkRunsFor(p.head.sha, token) : Promise.resolve<Gate>('none'),
          gh(`/repos/${REPO}/pulls/${p.number}/reviews?per_page=100`, token) as Promise<Review[]>,
          gh(`/repos/${REPO}/issues/${p.number}/comments?per_page=100`, token) as Promise<Comment[]>,
        ]);
        ci = ciGate;
        const revs = Array.isArray(reviews) ? reviews : [];
        const cmts = Array.isArray(comments) ? comments : [];
        const isCr = (login?: string) => String(login || '').toLowerCase().includes('coderabbit');
        const crReviews = revs.filter((r) => isCr(r.user?.login));
        const lastCr = crReviews.length ? crReviews[crReviews.length - 1] : null;
        if (lastCr?.state === 'APPROVED') coderabbit = 'approved';
        else if (lastCr?.state === 'CHANGES_REQUESTED') coderabbit = 'changes';
        else if (crReviews.length || cmts.some((c) => isCr(c.user?.login))) coderabbit = 'commented';
        const isCodex = (s?: string) => /codex/i.test(String(s || ''));
        if (revs.some((r) => isCodex(r.user?.login)) || cmts.some((c) => isCodex(c.user?.login))) {
          codex = 'present';
        }
      } catch {
        // Per-PR degrade: gates stay 'none' (no record ≠ a verdict).
      }
      const allGreen = ci === 'green' && coderabbit === 'approved' && codex === 'present' && !p.draft;
      return {
        number: p.number,
        title: String(p.title || ''),
        url: String(p.html_url || ''),
        branch: String(p.head?.ref || ''),
        createdAt: String(p.created_at || ''),
        draft: !!p.draft,
        ci,
        coderabbit,
        codex,
        allGreen,
      };
    })
  );

  return { ok: true, generatedAt, ciMain, prs };
}

export async function GET() {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const noStore = { headers: { 'cache-control': 'no-store, max-age=0' } };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!token) {
    const data: Flight = {
      ok: false,
      reason: 'no_token',
      generatedAt: new Date().toISOString(),
      ciMain: 'none',
      prs: [],
    };
    return NextResponse.json(data, noStore);
  }

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.data, noStore);
  }

  try {
    const data = await buildFlight(token);
    cache = { at: Date.now(), data };
    return NextResponse.json(data, noStore);
  } catch (err) {
    console.error('[console/flight] github fetch failed:', err);
    const data: Flight = {
      ok: false,
      reason: 'github_error',
      generatedAt: new Date().toISOString(),
      ciMain: 'none',
      prs: [],
    };
    return NextResponse.json(data, noStore);
  }
}
