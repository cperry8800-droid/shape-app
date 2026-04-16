'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordReset } from '../login/actions';

type State = { error: string } | { ok: true; email: string } | null;

async function resetAction(_prev: State, formData: FormData): Promise<State> {
  const email = formData.get('email') as string;
  const result = await requestPasswordReset(formData);
  if ('error' in result) return result;
  return { ok: true, email };
}

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(resetAction, null);

  if (state && 'ok' in state) {
    return (
      <div className="text-sm text-teal-400 bg-teal-400/10 border border-teal-400/20 rounded-lg px-4 py-3 text-center">
        Check your email — we sent a reset link to {state.email}.
      </div>
    );
  }

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

      {state && 'error' in state && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors disabled:opacity-50"
      >
        {pending ? 'Sending...' : 'Send reset link'}
      </button>

      <p className="text-sm text-neutral-400 text-center">
        <Link href="/login" className="text-teal-400 hover:text-teal-300">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
