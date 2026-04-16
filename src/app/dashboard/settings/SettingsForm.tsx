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
        <span className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25">Display name</span>
        <input
          type="text"
          name="full_name"
          defaultValue={initialFullName}
          className="bg-black border border-white/[0.07] text-white text-sm px-4 py-2.5 rounded-sm focus:border-white/30 outline-none transition-colors"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-2">
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
              className="relative flex items-center justify-center px-2 py-2.5 rounded-sm bg-black border text-sm cursor-pointer transition-colors border-white/[0.07] text-white/40 hover:border-white/20 has-[:checked]:border-white has-[:checked]:text-white has-[:checked]:bg-white/5"
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
        <p className="text-xs text-white/30 mt-1">
          You currently hold: <span className="text-white/50">{roles.join(', ') || '—'}</span>.
          Switching primary role also adds it to your set; existing roles are preserved.
        </p>
      </fieldset>

      {state && 'error' in state && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-sm px-3 py-2">
          {state.error}
        </div>
      )}
      {state && 'ok' in state && (
        <div className="text-sm text-white/60 border border-white/[0.07] rounded-sm px-3 py-2">
          Saved.
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-white text-black rounded-sm px-6 py-2.5 text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50 self-start"
      >
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
