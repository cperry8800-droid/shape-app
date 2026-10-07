// The exercise library (2026-10-07, owner-approved coach-tools plan, "Build faster").
//
// GET /api/exercises?q=&muscle=&equipment=&category=&limit=
//   -> { exercises: [{ id, name, muscle, equipment, category, demoUrl, aliases }],
//        source: 'library' | 'builtin' }
//
// Public, like the list it replaces: the builder shipped these 75 moves in a static file, and
// the table's read policy is open to anon. The proxy's per-caller rate limit covers it.
//
// ⚠ THE RANKING IS NOT WRITTEN HERE. It is DashBuilder.searchLibrary
// (public/newdesign/dashBuilderCore.js) — the function the builder's type-ahead will run over
// the list it fetched — so "rdl", "db bench" or "quads" cannot rank one way on the server and
// another in the picker. The whole table (a few hundred rows) is read and ranked in memory:
// alias substrings and word starts are not something PostgREST can filter for, and a second
// ranking in SQL is the drift this exists to avoid.
//
// ⚠ BEFORE THE MIGRATION RUNS, THE ROUTE STILL ANSWERS: it serves the 75 built-in moves
// (DashBuilder.libraryFallback) with `source: 'builtin'`, so a deploy that lands first breaks
// nothing. Any other failed read does the same, logged — a picker with the built-in moves is
// a working picker, and `source` says which list it is.

import { NextResponse } from 'next/server';
import { clientForRequest } from '@/lib/request-auth';
// The builder core is a pure UMD module (module.exports = api); imported for its library
// helpers, the same way src/lib/ai/directive.ts imports dashSignals.js.
import DashBuilderCore from '../../../../public/newdesign/dashBuilderCore.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LibraryItem = {
  id: string; name: string; muscle: string; equipment: string; category: string;
  demoUrl: string | null; aliases: string[];
};
type LibraryRow = {
  id: string; name: string; muscle: string | null; equipment: string | null; category: string | null;
  demo_url: string | null; aliases: string[] | null;
};

const core = DashBuilderCore as unknown as {
  libraryFallback: () => LibraryItem[];
  searchLibrary: (list: LibraryItem[], q: string, opts: { muscle?: string; equipment?: string; category?: string; limit?: number }) => LibraryItem[];
};

// The whole library is a few hundred rows; this is a ceiling on a table that grows by hand,
// not a page. No order: the ranking re-sorts every row it keeps.
const ROW_CAP = 2000;

function param(url: URL, key: string, max: number): string {
  return String(url.searchParams.get(key) ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function missingTable(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message ?? '');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = param(url, 'q', 80);
  const limitRaw = Number(url.searchParams.get('limit'));
  const opts = {
    muscle: param(url, 'muscle', 40) || undefined,
    equipment: param(url, 'equipment', 40) || undefined,
    category: param(url, 'category', 20) || undefined,
    // searchLibrary owns the clamp (default 30, at most 100).
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
  };

  let list: LibraryItem[] | null = null;
  try {
    const supabase = await clientForRequest(request);
    const { data, error } = await supabase
      .from('exercise_catalog')
      .select('id, name, muscle, equipment, category, demo_url, aliases')
      .limit(ROW_CAP);
    if (error) {
      if (!missingTable(error)) console.warn('[shape-api] exercises: library read failed, serving the built-in moves:', error.message);
    } else {
      list = ((data ?? []) as LibraryRow[]).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ''),
        muscle: String(r.muscle ?? ''),
        equipment: String(r.equipment ?? ''),
        category: String(r.category ?? ''),
        demoUrl: typeof r.demo_url === 'string' && /^https:\/\//i.test(r.demo_url) ? r.demo_url : null,
        aliases: Array.isArray(r.aliases) ? r.aliases.map(String) : [],
      }));
      // ⚠ AN EMPTY TABLE IS A MIGRATION HALF-RUN, NOT AN EMPTY LIBRARY. The seed is in the
      // same file as the table, so zero rows means it did not land; the built-in moves are
      // the honest answer then, exactly as before the table existed.
      if (!list.length) list = null;
    }
  } catch (e) {
    console.warn('[shape-api] exercises: library read threw, serving the built-in moves:', e instanceof Error ? e.message : e);
  }

  const source = list ? 'library' : 'builtin';
  const exercises = core.searchLibrary(list ?? core.libraryFallback(), q, opts);
  return NextResponse.json(
    { exercises, source },
    // ⚠ PRIVATE, THOUGH THE ANSWER IS THE SAME FOR EVERYONE: the proxy refreshes a signed-in
    // caller's session cookies on this very response, and a shared cache that kept a
    // Set-Cookie would hand one coach's session to the next. The browser may keep it.
    { headers: { 'Cache-Control': 'private, max-age=300' } }
  );
}
