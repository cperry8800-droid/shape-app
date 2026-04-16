'use client';

import { useActionState } from 'react';
import { updateProfile } from './actions';

type State = { error: string } | { ok: true } | null;

async function doUpdate(_prev: State, formData: FormData): Promise<State> {
  return (await updateProfile(formData)) ?? null;
}

export default function SettingsForm({
  initialFullName,
  initialRole,
  roles,
}: {
  initialFullName: string;
  initialRole: 'client' | 'trainer' | 'nutritionist';
  roles: string[];
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(doUpdate, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wider text-neutral-400">Display name</span>
        <input
          type="text"
          name="full_name"
          defaultValue={initialFullName}
          className="px-4 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm outline-none focus:border-teal-400 transition-colors"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs uppercase tracking-wider text-neutral-400 mb-2">
          Primary role
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: 'client', l: 'Client' },
            { v: 'trainer', l: 'Trainer' },
            { v: 'nutritionist', l: 'Nutritionist' },
          ].map((r) => (
            <label
              key={r.v}
              className="relative flex items-center justify-center px-2 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm cursor-pointer hover:border-neutral-700 has-[:checked]:border-teal-400 has-[:checked]:text-teal-400 has-[:checked]:bg-teal-400/10 transition-colors"
            >
              <input
                type="radio"
                name="role"
                value={r.v}
                defaultChecked={r.v === initialRole}
                className="sr-only"
              />
              {r.l}
            </label>
          ))}
        </div>
        <p className="text-xs text-neutral-500 mt-1">
          You currently hold: <span className="text-neutral-300">{roles.join(', ') || '—'}</span>.
          Switching primary role also adds it to your set; existing roles are preserved.
        </p>
      </fieldset>

      {state && 'error' in state && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {state.error}
        </div>
      )}
      {state && 'ok' in state && (
        <div className="text-sm text-teal-300 bg-teal-400/10 border border-teal-400/20 rounded-lg px-3 py-2">
          Saved.
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors disabled:opacity-50 self-start"
      >
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
