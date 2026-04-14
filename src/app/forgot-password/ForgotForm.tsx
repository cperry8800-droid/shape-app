'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordReset } from '../login/actions';

type State = { error: string } | { ok: true } | null;

async function resetAction(_prev: State, formData: FormData): Promise<State> {
  return (await requestPasswordReset(formData)) ?? null;
}

export default function ForgotForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(resetAction, null);

  if (state && 'ok' in state) {
    return (
      <div className="text-center py-4">
        <div className="text-4xl mb-4">📬</div>
        <h2 className="text-lg font-medium mb-2">Check your inbox</h2>
        <p className="text-sm text-neutral-400">
          If that email is registered, we&rsquo;ve sent a link to reset your password.
        </p>
      </div>
    );
  }

  const errorMsg = state && 'error' in state ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wider text-neutral-400">Email</span>
        <input
          type="email"
          name="email"
          required
          className="px-4 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm outline-none focus:border-teal-400 transition-colors"
        />
      </label>
      {errorMsg && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {errorMsg}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
      <p className="text-sm text-neutral-400 text-center">
        <Link href="/login" className="text-teal-400 hover:text-teal-300">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
