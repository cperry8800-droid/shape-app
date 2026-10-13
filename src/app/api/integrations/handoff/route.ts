// A link the installed app opens to connect an integration (src/lib/integration-handoff.ts).
//
// POST { provider } -> { url, expiresAt }
//   provider: whoop | strava | spotify | garmin | oura | apple_music
//   url: /connect/{provider}?handoff=<token> on this site, good for ten minutes. That page names
//   the Shape account it connects to before anything goes to the provider.
// Auth: cookie session OR Bearer token (the app sends Bearer). CORS for the app's origins is the
// proxy's (src/lib/native-cors.ts).

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { getProvider, getClientCredentials } from '@/lib/integrations/providers';
import { HANDOFF_LABELS, issueHandoff, isHandoffProvider } from '@/lib/integration-handoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in before connecting an app.' }, { status: 401, headers: NO_STORE });

  const parsed = await readJson<{ provider?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const provider = parsed.data.provider;
  if (!isHandoffProvider(provider)) {
    return NextResponse.json({ error: 'Unknown app.' }, { status: 400, headers: NO_STORE });
  }

  // An OAuth provider with no client credentials would open the browser on a server error; say so
  // here instead. Apple Music's own route reports its missing key on the page.
  if (provider !== 'apple_music') {
    const cfg = getProvider(provider);
    if (!cfg || !getClientCredentials(cfg)) {
      return NextResponse.json({ error: `${HANDOFF_LABELS[provider]} isn't available yet.` }, { status: 503, headers: NO_STORE });
    }
  }

  const issued = issueHandoff(user.id, provider);
  if (!issued) return NextResponse.json({ error: 'Connecting from the app is not available right now.' }, { status: 503, headers: NO_STORE });

  const url = new URL(`/connect/${provider}`, new URL(request.url).origin);
  url.searchParams.set('handoff', issued.token);
  return NextResponse.json({ url: url.toString(), expiresAt: issued.expiresAt }, { headers: NO_STORE });
}
