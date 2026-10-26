// GET /api/app/version?platform=ios|android&version=1.0.0 — whether this installed app has to
// update before it can be used. Public: the app asks before anyone signs in.
//
// The rule is src/lib/app-version.mjs; this route only answers it, so a minimum raised there
// reaches every installed app on the next deploy. `update` is 'required', 'recommended' or
// 'none', and the app blocks only on an explicit 'required' (BSUpdateGate.jsx).

import { NextResponse } from 'next/server';
import { appUpdateFor, appStoreUrlFrom, APP_BUNDLE_ID, APP_RECOMMENDED_VERSION, PLAY_STORE_URL } from '@/lib/app-version.mjs';

export const runtime = 'nodejs';
// ⚠ NO `dynamic = 'force-dynamic'` (Codex on #2472): it is `fetchCache = 'force-no-store'`, which would
// ask Apple on every check instead of once an hour. A route handler is not cached anyway, and this one
// reads its request, so it answers each app on its own.

// Apple's public lookup gives the App Store page (its numeric id lives nowhere in this repo).
// Asked only when an iPhone has to update, and cached for an hour.
async function appStoreUrl(): Promise<string | null> {
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${APP_BUNDLE_ID}&country=us`, {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 3600 },
    });
    return res.ok ? appStoreUrlFrom(await res.json()) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const platform = params.get('platform') || '';
  const update = appUpdateFor(platform, params.get('version') || '');
  const storeUrl = update === 'none' ? null : platform === 'ios' ? await appStoreUrl() : PLAY_STORE_URL;
  const recommendedVersion = update === 'recommended'
    ? APP_RECOMMENDED_VERSION[platform as keyof typeof APP_RECOMMENDED_VERSION]
    : null;
  return NextResponse.json({ update, storeUrl, recommendedVersion }, { headers: { 'Cache-Control': 'no-store' } });
}
