// Connect an app from the installed Shape app (src/lib/integration-handoff.ts). The app opens this
// page in its in-app browser with a link token from POST /api/integrations/handoff.
//
// ⚠ THE PAGE NAMES THE ACCOUNT BEFORE ANYTHING GOES TO THE PROVIDER. A link can be forwarded, so
// whoever completes it sees whose Shape account the app will be connected to, and has to press
// Continue themselves: a plain form POST to the authorize route, which refuses one from any other
// site. Not a server action (src/lib/integration-handoff.ts says why).

import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { HANDOFF_LABELS, isHandoffProvider, maskEmail, readHandoff } from '@/lib/integration-handoff';
import AppleMusicConnect from './AppleMusicConnect';

export const metadata = { title: 'Connect an app — Shape', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function firstNameAndInitial(fullName: unknown): string {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-1">Shape · Connect</div>
      <h1 className="text-2xl sm:text-3xl font-light tracking-tight">{title}</h1>
      <div className="mt-6 flex flex-col gap-5 text-sm text-neutral-300">{children}</div>
    </main>
  );
}

export default async function ConnectPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams?: Promise<{ handoff?: string | string[] }>;
}) {
  const { provider } = await params;
  if (!isHandoffProvider(provider)) notFound();
  const label = HANDOFF_LABELS[provider];
  const sp = await searchParams;
  const handoff = typeof sp?.handoff === 'string' ? sp.handoff : '';
  const uid = readHandoff(handoff, provider);
  if (!uid) {
    return (
      <Shell title={`Connect ${label}`}>
        <p role="alert">This link has run out. Go back to the Shape app and tap Connect again.</p>
      </Shell>
    );
  }

  // Whose account this is: the first name and a masked email, enough to recognise your own.
  const admin = createAdminClient();
  const [authUser, profile] = await Promise.all([
    admin.auth.admin.getUserById(uid),
    admin.from('profiles').select('full_name').eq('id', uid).maybeSingle(),
  ]);
  const email = maskEmail(authUser.data?.user?.email);
  if (authUser.error || !email) {
    return (
      <Shell title={`Connect ${label}`}>
        <p role="alert">We couldn&apos;t check this link. Go back to the Shape app and tap Connect again.</p>
      </Shell>
    );
  }
  const name = profile.error ? '' : firstNameAndInitial((profile.data as { full_name?: string } | null)?.full_name);
  const who = name ? `${name} (${email})` : email;

  return (
    <Shell title={`Connect ${label}`}>
      <p>
        This connects {label} to the Shape account of <strong className="text-neutral-100">{who}</strong>.
        If that isn&apos;t your account, close this page.
      </p>
      {provider === 'apple_music' ? (
        <AppleMusicConnect handoff={handoff} />
      ) : (
        <form method="post" action={`/api/integrations/${provider}/authorize`}>
          <input type="hidden" name="handoff" value={handoff} />
          <button type="submit" className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-5 py-2.5 text-sm">
            Continue to {label}
          </button>
        </form>
      )}
      <p className="text-xs text-neutral-500">
        When you&apos;re done, close this page to go back to the Shape app.
      </p>
    </Shell>
  );
}
