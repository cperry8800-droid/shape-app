import Link from 'next/link';
import type { ReactNode } from 'react';
import { getMyProviderRows, getMyWorkoutReviewSessions } from '@/lib/queries';
import type { WorkoutReviewSession } from '@/lib/types';
import { addWorkoutReviewNote } from './actions';

export const metadata = { title: 'Workout reviews - Shape' };

type SearchParams = Promise<{ role?: string }>;

export default async function WorkoutReviewsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedRole =
    params.role === 'trainer' || params.role === 'nutritionist' ? params.role : undefined;

  const [providerRows, sessions] = await Promise.all([
    getMyProviderRows(),
    getMyWorkoutReviewSessions(requestedRole),
  ]);

  const visibleSessions = sessions.filter((session) => {
    if (!requestedRole) return true;
    return session.provider_role === requestedRole;
  });
  const pendingCount = visibleSessions.filter((session) => {
    const notes = session.coach_workout_review_notes ?? [];
    return notes.length === 0;
  }).length;

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">
              Coach review desk
            </div>
            <h2 className="text-2xl font-light tracking-tight">Workout session reviews</h2>
            <p className="text-sm text-neutral-400 mt-2 max-w-2xl">
              Review completed client workout sessions, set duration, rest windows, sensor
              samples, and send notes back to the client.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <RoleFilter href="/dashboard/workout-reviews" active={!requestedRole}>
              All
            </RoleFilter>
            <RoleFilter
              href="/dashboard/workout-reviews?role=trainer"
              active={requestedRole === 'trainer'}
            >
              Trainer
            </RoleFilter>
            <RoleFilter
              href="/dashboard/workout-reviews?role=nutritionist"
              active={requestedRole === 'nutritionist'}
            >
              Nutritionist
            </RoleFilter>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <Stat label="Sessions" value={visibleSessions.length.toString()} />
          <Stat label="Needs review" value={pendingCount.toString()} />
          <Stat label="Trainer profile" value={providerRows.trainer ? `#${providerRows.trainer.id}` : 'None'} />
          <Stat
            label="Nutrition profile"
            value={providerRows.nutritionist ? `#${providerRows.nutritionist.id}` : 'None'}
          />
        </div>
      </section>

      {visibleSessions.length === 0 ? (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <h3 className="text-lg font-medium mb-2">No workout logs yet</h3>
          <p className="text-sm text-neutral-500">
            Logs appear here after a client completes an assigned workout session with a linked
            provider id. The mobile app is already writing the session, set, sensor, and review
            note tables.
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          {visibleSessions.map((session) => (
            <WorkoutReviewCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkoutReviewCard({ session }: { session: WorkoutReviewSession }) {
  const setLogs = session.workout_set_logs ?? [];
  const sensorSamples = session.workout_sensor_samples ?? [];
  const notes = session.coach_workout_review_notes ?? [];
  const completedSets =
    session.summary?.completedSets ?? setLogs.filter((entry) => entry.completed !== false).length;
  const avgSet =
    session.summary?.avgSetSeconds ??
    averageSeconds(setLogs.map((entry) => entry.set_duration_seconds));
  const avgRest =
    session.summary?.avgRestSeconds ??
    averageSeconds(setLogs.map((entry) => entry.rest_before_seconds));

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
      <div className="p-6 border-b border-neutral-800">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">
              {session.provider_role ?? 'provider'} review
            </div>
            <h3 className="text-xl font-medium">
              {session.workout_name || session.title || 'Workout session'}
            </h3>
            <p className="text-xs text-neutral-500 mt-1">
              {session.started_at ? new Date(session.started_at).toLocaleString() : 'No start time'}{' '}
              - {session.status}
            </p>
          </div>
          <span className="text-[0.65rem] uppercase tracking-wider border border-neutral-700 rounded-full px-3 py-1 text-neutral-300">
            {notes.length ? 'Reviewed' : 'Needs review'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <Stat label="Completed sets" value={String(completedSets)} />
          <Stat label="Avg set" value={formatSeconds(avgSet)} />
          <Stat label="Avg rest" value={formatSeconds(avgRest)} />
          <Stat label="Elapsed" value={formatSeconds(session.duration_seconds)} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.85fr] gap-0">
        <div className="p-6 border-b xl:border-b-0 xl:border-r border-neutral-800">
          <div className="flex items-baseline justify-between mb-4">
            <h4 className="text-sm font-medium">Set log</h4>
            <span className="text-xs text-neutral-500">{setLogs.length} rows</span>
          </div>
          {setLogs.length === 0 ? (
            <p className="text-sm text-neutral-500">No set-level data on this session.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-neutral-500">
                  <tr className="border-b border-neutral-800">
                    <th className="text-left font-medium py-2 pr-3">Move</th>
                    <th className="text-left font-medium py-2 px-3">Target</th>
                    <th className="text-left font-medium py-2 px-3">Set</th>
                    <th className="text-left font-medium py-2 pl-3">Rest before</th>
                  </tr>
                </thead>
                <tbody>
                  {setLogs.map((entry) => (
                    <tr key={entry.id} className="border-b border-neutral-900">
                      <td className="py-3 pr-3">
                        <div className="font-medium">{entry.movement_name || 'Movement'}</div>
                        <div className="text-xs text-neutral-500">Set {entry.set_number ?? '-'}</div>
                      </td>
                      <td className="py-3 px-3 text-neutral-300">
                        {[entry.target_reps, entry.target_load].filter(Boolean).join(' / ') || '-'}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-neutral-300">
                        {formatSeconds(entry.set_duration_seconds)}
                      </td>
                      <td className="py-3 pl-3 font-mono text-xs text-neutral-300">
                        {formatSeconds(entry.rest_before_seconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h4 className="text-sm font-medium">Sensor samples</h4>
            <span className="text-xs text-neutral-500">{sensorSamples.length} samples</span>
          </div>
          {sensorSamples.length === 0 ? (
            <p className="text-sm text-neutral-500 mb-6">Watch data pending for this session.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {sensorSamples.slice(0, 6).map((sample) => (
                <div key={sample.id} className="rounded-lg border border-neutral-800 p-3">
                  <div className="text-[0.65rem] uppercase tracking-wider text-neutral-500">
                    {(sample.metric || 'metric').replace(/_/g, ' ')}
                  </div>
                  <div className="text-xl font-light mt-1">
                    {sample.value ?? '-'}{' '}
                    <span className="text-xs text-neutral-500">{sample.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-neutral-800 pt-5">
            <h4 className="text-sm font-medium mb-3">Coach notes</h4>
            {notes.length === 0 ? (
              <p className="text-sm text-neutral-500 mb-4">No notes yet.</p>
            ) : (
              <div className="flex flex-col gap-3 mb-4">
                {notes.map((note) => (
                  <div key={note.id} className="border-l-2 border-teal-400 pl-3 text-sm text-neutral-300">
                    {note.body}
                    <div className="text-[0.65rem] uppercase tracking-wider text-neutral-600 mt-1">
                      {new Date(note.created_at).toLocaleString()} - {note.visibility}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {session.provider_role ? (
              <form action={addWorkoutReviewNote} className="flex flex-col gap-3">
                <input type="hidden" name="session_id" value={session.id} />
                <input type="hidden" name="provider_role" value={session.provider_role} />
                <textarea
                  name="body"
                  required
                  rows={4}
                  placeholder="Write feedback for the client..."
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-teal-400/70"
                />
                <button
                  type="submit"
                  className="text-xs font-medium uppercase tracking-[0.08em] bg-teal-400 text-neutral-950 rounded-full px-4 py-2 hover:bg-teal-300 transition-colors"
                >
                  Save review note
                </button>
              </form>
            ) : (
              <p className="text-xs text-amber-300">
                This session is missing a provider role, so notes cannot be attached yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function RoleFilter({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`text-xs font-medium uppercase tracking-[0.08em] rounded-full px-4 py-2 border transition-colors ${
        active
          ? 'bg-teal-400 text-neutral-950 border-teal-400'
          : 'text-neutral-300 border-neutral-700 hover:bg-neutral-900'
      }`}
    >
      {children}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="text-2xl font-light tracking-tight">{value}</div>
      <div className="text-xs uppercase tracking-wider text-neutral-500 mt-1">{label}</div>
    </div>
  );
}

function averageSeconds(values: Array<number | null>): number {
  const clean = values.filter((value): value is number => Number.isFinite(Number(value)));
  if (!clean.length) return 0;
  return Math.round(clean.reduce((sum, value) => sum + Number(value), 0) / clean.length);
}

function formatSeconds(value: number | null | undefined): string {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${remainder}s`;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
