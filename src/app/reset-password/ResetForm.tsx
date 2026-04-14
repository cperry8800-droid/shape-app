'use client';

import { useActionState } from 'react';
import { updatePassword } from '../login/actions';

type State = { error: string } | null;

async function doUpdate(_prev: State, formData: FormData): Promise<State> {
  const result = await updatePassword(formData);
  return result ?? null;
}

export default function ResetForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(doUpdate, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wider text-neutral-400">New password</span>
        <input
          type="password"
          name="password"
          required
          minLength={6}
          className="px-4 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm outline-none focus:border-teal-400 transition-colors"
        />
        <span className="text-xs text-neutral-500">At least 6 characters.</span>
      </label>
      {state?.error && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {state.error}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors disabled:opacity-50"
      >
        {pending ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}
