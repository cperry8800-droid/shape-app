'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signup } from '../login/actions';

type State = { error: string } | { ok: true; needsConfirm: boolean } | null;

async function signupAction(_prev: State, formData: FormData): Promise<State> {
  const result = await signup(formData);
  return result ?? null;
}

export default function SignupForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(signupAction, null);

  if (state && 'ok' in state && state.needsConfirm) {
    return (
      <div className="text-center py-4">
        <div className="text-4xl mb-4">📬</div>
        <h2 className="text-lg font-medium mb-2">Check your inbox</h2>
        <p className="text-sm text-neutral-400">
          We sent you a confirmation link. Click it to activate your Shape account.
        </p>
      </div>
    );
  }

  const errorMsg = state && 'error' in state ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs uppercase tracking-wider text-neutral-400 mb-2">
          I&rsquo;m joining as
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: 'client', l: 'Client' },
            { v: 'trainer', l: 'Trainer' },
            { v: 'nutritionist', l: 'Nutritionist' },
          ].map((r, i) => (
            <label
              key={r.v}
              className="relative flex items-center justify-center px-2 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm cursor-pointer hover:border-neutral-700 has-[:checked]:border-teal-400 has-[:checked]:text-teal-400 has-[:checked]:bg-teal-400/10 transition-colors"
            >
              <input
                type="radio"
                name="role"
                value={r.v}
                defaultChecked={i === 0}
                className="sr-only"
              />
              {r.l}
            </label>
          ))}
        </div>
      </fieldset>
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
        <span className="text-xs text-neutral-500">At least 6 characters.</span>
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
        {pending ? 'Creating account…' : 'Create account'}
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
