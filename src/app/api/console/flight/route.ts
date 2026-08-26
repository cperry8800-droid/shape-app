// Mission Control flight data — admin-gated, like /api/warroom.
//
// Open PRs + their three merge gates (CI on the head SHA · CodeRabbit verdict ·
// Codex presence) plus main's CI state for the alarm strip. GitHub REST with a
// 60s in-process cache so the console can poll without hammering the API.
//
// The gate DECISIONS are pure, tested logic in src/lib/console-flight.mjs
// (tests/console-flight.test.mjs) — this file is fetch plumbing only. Honesty
// contract (docs/superpowers/specs/2026-07-27-mission-control-console-design.md):
// no GITHUB_TOKEN → {ok:false, reason:'no_token'}; GitHub unreachable →
// {ok:false, reason:'github_error'}; a gate with no record reads 'none'.

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/admin-access';
import {
  gateFromRuns,
  coderabbitVerdict,
  codexVerdict,
  nextPageUrl,
  prAllGreen,
} from '@/lib/console-flight.mjs';
import type { Flight, FlightPr, Gate } from '@/app/console/flight-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPO = process.env.GITHUB_REPO || 'cperry8800-droid/shape-app';
const PR_CAP = 6;
const CACHE_MS = 60_000;

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

// One page, plus the `Link` header that says whether another exists. `gh` stays for
// single-object endpoints, which have no pagination to follow.
async function ghPage(url: string, token: string): Promise<{ items: unknown[]; next: string | null }> {
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'shape-mission-control',
    },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`github ${res.status} on ${url}`);
  const body = (await res.json()) as unknown;
  return { items: Array.isArray(body) ? body : [], next: nextPageUrl(res.headers.get('link')) };
}

// ⚠ RUNS TO EXHAUSTION, AND HITTING THE BOUND THROWS RATHER THAN RETURNING A SHORT LIST.
// These endpoints paginate OLDEST-FIRST and take no direction parameter, so the newest
// record — the one a latest-wins gate reads — is on the LAST page. An earlier version of
// this file capped at five pages and asserted in its own comment that missing records
// could only ever read 'stale'. ⚠ THAT WAS FALSE: reviews and comments are fetched
// separately, so a clean COMMENT inside the window can outlive a later findings REVIEW
// outside it, and the gate then reports a FALSE PASS. A truncated list must therefore
// never be returned — the throw degrades this PR's gates to 'none' in the caller, which
// is closed. The bound exists only so a malformed `Link` cycle cannot hang the board.
const GH_PAGE_LIMIT = 50;
async function ghAll(path: string, token: string): Promise<unknown[]> {
  const sep = path.includes('?') ? '&' : '?';
  let url: string | null = `https://api.github.com${path}${sep}per_page=100`;
  const out: unknown[] = [];
  for (let i = 0; i < GH_PAGE_LIMIT && url; i++) {
    const page = await ghPage(url, token);
    out.push(...page.items);
    url = page.next;
  }
  if (url) throw new Error(`github pagination exceeded ${GH_PAGE_LIMIT} pages on ${path}`);
  return out;
}

type CheckRun = { name?: string; status?: string; conclusion?: string | null };
// `body` and the timestamps are read by codexVerdict — it pins a verdict to a head from
// the `Reviewed commit:` field in the body, and orders same-head records by time.
type Review = {
  user?: { login?: string };
  state?: string;
  commit_id?: string;
  body?: string;
  submitted_at?: string;
};
type Comment = { user?: { login?: string }; body?: string; created_at?: string };
// Inline review comments — where CodeRabbit files its actual findings. Anchored on
// `original_commit_id`, NOT `commit_id`: GitHub re-anchors the latter forward onto the
// current head, so a finding already answered by a later push would look permanently open.
type ReviewComment = { user?: { login?: string }; original_commit_id?: string; created_at?: string };

async function checkRunsFor(sha: string, token: string): Promise<Gate> {
  const data = (await gh(`/repos/${REPO}/commits/${sha}/check-runs?per_page=100`, token)) as {
    check_runs?: CheckRun[];
  };
  return gateFromRuns(Array.isArray(data.check_runs) ? data.check_runs : []);
}

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
      const headSha = p.head?.sha || '';
      try {
        const [ciGate, reviews, comments, reviewComments] = await Promise.all([
          headSha ? checkRunsFor(headSha, token) : Promise.resolve<Gate>('none'),
          ghAll(`/repos/${REPO}/pulls/${p.number}/reviews`, token) as Promise<Review[]>,
          ghAll(`/repos/${REPO}/issues/${p.number}/comments`, token) as Promise<Comment[]>,
          ghAll(`/repos/${REPO}/pulls/${p.number}/comments`, token) as Promise<ReviewComment[]>,
        ]);
        ci = ciGate;
        coderabbit = coderabbitVerdict({ reviews, comments, reviewComments, headSha });
        codex = codexVerdict({ reviews, comments, headSha });
      } catch {
        // Per-PR degrade: gates stay 'none' (no record ≠ a verdict).
      }
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
        allGreen: prAllGreen({ ci, draft: !!p.draft }),
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
