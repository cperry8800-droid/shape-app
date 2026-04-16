'use client';

import { useState, useActionState } from 'react';
import Link from 'next/link';
import { signup } from '../login/actions';

type State = { error: string } | { ok: true; needsConfirm: boolean } | null;

async function signupAction(_prev: State, formData: FormData): Promise<State> {
  const result = await signup(formData);
  return result ?? null;
}

const roles = ['client', 'trainer', 'nutritionist'] as const;

export default function SignupForm({ defaultRole }: { defaultRole?: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(signupAction, null);
  const [role, setRole] = useState<string>(
    defaultRole && roles.includes(defaultRole as (typeof roles)[number]) ? defaultRole : 'client',
  );

  if (state && 'ok' in state && state.needsConfirm) {
    return (
      <div className="text-sm text-teal-400 bg-teal-400/10 border border-teal-400/20 rounded-lg px-4 py-3 text-center">
        Check your email — we sent a confirmation link.
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="role" value={role} />

      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wider text-neutral-400">Email</span>
        <input
          type="email"
          name="email"
          required
          className="px-4 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm outline-none focus:border-teal-400 transition-colors"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wider text-neutral-400">Password</span>
        <input
          type="password"
          name="password"
          required
          minLength={6}
          className="px-4 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm outline-none focus:border-teal-400 transition-colors"
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wider text-neutral-400">I am a</span>
        <div className="flex gap-2">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`flex-1 text-sm rounded-lg border px-3 py-2 transition-colors capitalize ${
                role === r
                  ? 'border-teal-400 text-teal-400 bg-teal-400/10'
                  : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </fieldset>

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
        {pending ? 'Creating...' : 'Create account'}
      </button>

      <p className="text-sm text-neutral-400 text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-teal-400 hover:text-teal-300">
          Sign in
        </Link>
      </p>
    </form>
  );
}
