'use client';

// The authenticator step of a staff sign-in (./page.tsx). 'enroll': set an authenticator app up
// (a QR code, or the key typed in by hand) and confirm it with its first code. 'verify': enter the
// current code. Either way Supabase Auth raises this session to 'aal2' and the page reloads into
// where the staff member was going.
//
// ⚠ EVERY STEP RUNS ON THE SERVER (/api/staff/two-factor). The session cookies are httpOnly, so a
// browser Supabase client here has no session: #2329 read the factors from the page, and every
// staff member saw "Your sign-in methods could not be read".

import { useEffect, useState } from 'react';
import { cleanCode } from '@/lib/staff-two-factor.mjs';
import SignOutButton from '@/components/SignOutButton';

type Mode = 'enroll' | 'verify';
type Step = { ok: boolean; body: Record<string, unknown> };

async function step(payload: Record<string, unknown>): Promise<Step> {
  try {
    const res = await fetch('/api/staff/two-factor', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, body: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
  } catch {
    return { ok: false, body: {} };
  }
}

const text = (v: unknown) => (typeof v === 'string' && v ? v : null);

export default function StaffTwoFactor({ mode, next }: { mode: Mode; next: string }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const { ok, body } = await step({ action: 'start' });
      if (!live) return;
      if (!ok) {
        setError(text(body.error) ?? 'Your sign-in methods could not be read. Reload the page to try again.');
        return;
      }
      if (body.mode === 'verified') {
        window.location.assign(next);
        return;
      }
      setFactorId(text(body.factorId));
      setQr(text(body.qr));
      setSecret(text(body.secret));
    })();
    return () => {
      live = false;
    };
  }, [mode, next]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const typed = cleanCode(code);
    if (!typed) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { ok, body } = await step({ action: 'verify', factorId, code: typed });
    if (!ok) {
      setBusy(false);
      setCode('');
      setError(text(body.error) ?? 'That code could not be checked just now. Try again.');
      return;
    }
    // A full load, so the server reads the upgraded session from the cookies.
    window.location.assign(next);
  }

  return (
    <div className="flex flex-col gap-6">
      {mode === 'enroll' ? (
        <div className="flex flex-col gap-3 text-sm text-neutral-300">
          <p>
            The admin console needs a second step at sign-in. Set it up once with an authenticator app (Google Authenticator,
            1Password, Authy, or your phone&apos;s built-in one):
          </p>
          <ol className="list-decimal pl-5 flex flex-col gap-1 text-neutral-400">
            <li>Open the app and scan this code from inside it, or type the key below into it.</li>
            <li>Enter the 6-digit code the app shows for Shape.</li>
          </ol>
          {/* The iPhone camera hands an authenticator QR code to Apple's Passwords app whatever
              app the staff member meant to use (owner, 2026-10-16), and a reload enrolls a new key. */}
          <p className="text-xs text-neutral-500">
            Scanning with the iPhone camera adds Shape to the Passwords app instead. That works too: open Passwords, go to Codes,
            and enter the code shown for Shape. This page makes a new key each time it loads, so after a reload, delete the old
            Shape entry and scan again.
          </p>
          {qr ? (
            <div className="flex flex-col items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URL from Supabase */}
              <img src={qr} alt="QR code to add Shape to your authenticator app" width={192} height={192} className="rounded-lg bg-white p-2" />
              {secret && (
                <div className="text-xs text-neutral-500">
                  Key: <span className="font-mono text-neutral-300 break-all select-all">{secret}</span>
                </div>
              )}
            </div>
          ) : (
            !error && <div className="text-neutral-500">Setting up…</div>
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-300">Enter the 6-digit code from your authenticator app to open the admin console.</p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">Code</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 -]*"
            maxLength={9}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={!factorId || busy}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-lg tracking-[0.3em] font-mono outline-none focus:border-teal-400"
          />
        </label>
        {error && (
          <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-200 text-sm px-4 py-3">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={!factorId || busy}
          className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-5 py-2 text-sm hover:bg-teal-300 disabled:opacity-50"
        >
          {busy ? 'Checking…' : mode === 'enroll' ? 'Turn on two-factor' : 'Continue'}
        </button>
      </form>

      <p className="text-xs text-neutral-500">
        Lost the app? An owner can reset your two-factor from the Staff page. Not you?{' '}
        <SignOutButton className="underline hover:text-neutral-300">Log out</SignOutButton>
      </p>
    </div>
  );
}
