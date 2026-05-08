'use client';

import { useMemo, useState } from 'react';

type ProviderRole = 'trainer' | 'nutritionist';
type SegmentKey = 'all' | 'week1' | 'prs' | 'review' | 'dual' | 'stale';
type BulkAction = 'checkin' | 'weights' | 'nutrition-review' | 'recovery-adjust';

type Subscriber = {
  id: string;
  client_id: string;
  status: string;
  price_cents: number | null;
  current_period_end: string | null;
  created_at: string;
};

type ClientCRMRecord = {
  id: string;
  label: string;
  program: string;
  programWeek: number;
  status: string;
  monthlyValue: number;
  lifetimeValue: number;
  retentionMonths: number;
  referrals: number;
  prCount: number;
  missedSessions: number;
  macroAdherence: number;
  noMessageDays: number;
  topExercise: string;
  dualCare: boolean;
  nutritionFlag: boolean;
  reviewFlag: boolean;
  timeline: TimelineEvent[];
};

type TimelineEvent = {
  id: string;
  day: string;
  type: 'workout' | 'meal' | 'sleep' | 'message' | 'photo' | 'weight';
  title: string;
  detail: string;
};

type Props = {
  role: ProviderRole;
  subscribers: Subscriber[];
};

const segments: Array<{ key: SegmentKey; label: string }> = [
  { key: 'all', label: 'All active' },
  { key: 'week1', label: 'Week 1' },
  { key: 'prs', label: 'PRs this week' },
  { key: 'review', label: 'Flagged review' },
  { key: 'dual', label: 'Trainer + nutrition' },
  { key: 'stale', label: 'No message 7d' },
];

export default function CoachClientCRM({ role, subscribers }: Props) {
  const [segment, setSegment] = useState<SegmentKey>('all');
  const [selectedId, setSelectedId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [handoffs, setHandoffs] = useState<Record<string, string>>({});
  const [selectedEventIds, setSelectedEventIds] = useState<Record<string, string>>({});
  const [activity, setActivity] = useState('');
  const [bulkAction, setBulkAction] = useState<BulkAction>('checkin');

  const clients = useMemo(() => buildClients(subscribers), [subscribers]);
  const filteredClients = useMemo(
    () => filterClients(clients, segment),
    [clients, segment]
  );
  const selectedClient =
    filteredClients.find((client) => client.id === selectedId) ??
    filteredClients[0] ??
    clients[0] ??
    null;
  const selectedEvent =
    selectedClient?.timeline.find((event) => event.id === selectedEventIds[selectedClient.id]) ??
    selectedClient?.timeline[0] ??
    null;

  const filteredRevenue = filteredClients.reduce((sum, client) => sum + client.monthlyValue, 0);

  if (clients.length === 0) {
    return (
      <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
          Client CRM
        </div>
        <h2 className="mt-2 text-2xl font-light text-neutral-50">Roster intelligence</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
          Active clients will become a filterable roster here, with handoffs, check-ins,
          timeline review, and per-client business metrics.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl shadow-black/20">
      <div className="border-b border-neutral-800 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
              Client CRM
            </div>
            <h2 className="mt-2 text-3xl font-light text-neutral-50">Roster command center</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              Segment clients, hand off context across disciplines, draft check-ins, and run bulk
              programming actions without digging through tabs.
            </p>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/70 text-center">
            <SummaryMetric label="Filtered" value={filteredClients.length.toString()} />
            <SummaryMetric label="MRR" value={`$${filteredRevenue.toLocaleString()}`} />
            <SummaryMetric
              label="Review"
              value={filteredClients.filter((client) => client.reviewFlag).length.toString()}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {segments.map((item) => {
            const count = filterClients(clients, item.key).length;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setSegment(item.key);
                  setActivity('');
                }}
                className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                  segment === item.key
                    ? 'border-teal-300 bg-teal-300 text-neutral-950'
                    : 'border-neutral-700 text-neutral-300 hover:border-teal-300 hover:text-teal-300'
                }`}
              >
                {item.label} <span className="opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid xl:grid-cols-[0.95fr_1.25fr]">
        <div className="border-b border-neutral-800 p-5 xl:border-b-0 xl:border-r">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-neutral-100">Client list</h3>
            <div className="text-xs text-neutral-500">{filteredClients.length} clients</div>
          </div>
          <div className="grid gap-2">
            {filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => {
                  setSelectedId(client.id);
                  setActivity('');
                }}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  selectedClient?.id === client.id
                    ? 'border-teal-300 bg-teal-300/10'
                    : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-neutral-50">{client.label}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {client.program} - week {client.programWeek}
                    </div>
                  </div>
                  <RiskPill client={client} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <Mini label="MRR" value={`$${client.monthlyValue.toLocaleString()}`} />
                  <Mini label="Revenue" value={`$${client.lifetimeValue.toLocaleString()}`} />
                  <Mini label="PRs" value={client.prCount.toString()} />
                  <Mini label="Missed" value={client.missedSessions.toString()} />
                  <Mini label="Macros" value={`${client.macroAdherence}%`} />
                  <Mini label="No msg" value={`${client.noMessageDays}d`} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {selectedClient && selectedEvent && (
          <div className="grid gap-0">
            <ClientDetail
              client={selectedClient}
              selectedEvent={selectedEvent}
              onSelectEvent={(eventId) =>
                setSelectedEventIds((current) => ({ ...current, [selectedClient.id]: eventId }))
              }
            />

            <div className="grid border-t border-neutral-800 lg:grid-cols-2">
              <HandoffPanel
                role={role}
                client={selectedClient}
                value={handoffs[selectedClient.id] ?? buildHandoffDraft(role, selectedClient, selectedEvent)}
                onChange={(value) =>
                  setHandoffs((current) => ({ ...current, [selectedClient.id]: value }))
                }
                onSubmit={() =>
                  setActivity(`Handoff queued with ${role === 'trainer' ? 'nutrition' : 'training'} context attached.`)
                }
              />
              <CheckInPanel
                client={selectedClient}
                value={drafts[selectedClient.id] ?? buildCheckInDraft(selectedClient)}
                onChange={(value) =>
                  setDrafts((current) => ({ ...current, [selectedClient.id]: value }))
                }
                onSubmit={() => setActivity(`Check-in prepared for ${selectedClient.label}.`)}
                onVoice={() => setActivity(`Voice reply ready for ${selectedClient.label}.`)}
                onVideo={() => setActivity(`Video reply started for ${selectedClient.label}.`)}
              />
            </div>

            <BulkActions
              role={role}
              count={filteredClients.length}
              action={bulkAction}
              onActionChange={setBulkAction}
              onApply={() => setActivity(`${bulkActionLabel(bulkAction)} applied to ${filteredClients.length} filtered clients.`)}
            />

            {activity && (
              <div className="border-t border-teal-300/20 bg-teal-300/10 px-6 py-3 text-sm text-teal-100">
                {activity}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ClientDetail({
  client,
  selectedEvent,
  onSelectEvent,
}: {
  client: ClientCRMRecord;
  selectedEvent: TimelineEvent;
  onSelectEvent: (eventId: string) => void;
}) {
  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
            Client detail
          </div>
          <h3 className="mt-1 text-2xl font-light text-neutral-50">{client.label}</h3>
          <p className="mt-1 text-sm text-neutral-400">
            {client.program} - week {client.programWeek} - {client.topExercise} focus
          </p>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/70 text-center">
          <SummaryMetric label="LTV" value={`$${client.lifetimeValue.toLocaleString()}`} />
          <SummaryMetric label="Retain" value={`${client.retentionMonths}mo`} />
          <SummaryMetric label="Refs" value={client.referrals.toString()} />
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
            Scrub timeline
          </div>
          <div className="text-xs text-neutral-500">workouts - meals - sleep - messages - photos</div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {client.timeline.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelectEvent(event.id)}
              className={`min-w-[132px] rounded-xl border p-3 text-left transition-colors ${
                selectedEvent.id === event.id
                  ? 'border-teal-300 bg-teal-300/10'
                  : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-600'
              }`}
            >
              <div className="text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">
                {event.day} - {event.type}
              </div>
              <div className="mt-1 text-sm font-medium text-neutral-100">{event.title}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-teal-300">
            {selectedEvent.type} detail
          </div>
          <h4 className="mt-1 text-lg font-medium text-neutral-50">{selectedEvent.title}</h4>
          <p className="mt-2 text-sm leading-6 text-neutral-400">{selectedEvent.detail}</p>
        </div>
      </div>
    </div>
  );
}

function HandoffPanel({
  role,
  client,
  value,
  onChange,
  onSubmit,
}: {
  role: ProviderRole;
  client: ClientCRMRecord;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const target = role === 'trainer' ? '@nutritionist' : '@trainer';
  return (
    <div className="border-b border-neutral-800 p-6 lg:border-b-0 lg:border-r">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
        Cross-coach handoff
      </div>
      <h3 className="mt-1 text-lg font-medium text-neutral-50">Attach the day, mention the partner</h3>
      <p className="mt-2 text-sm leading-6 text-neutral-500">
        Built for clients who have both a trainer and nutritionist.
      </p>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-4 min-h-[132px] w-full rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-100 outline-none transition-colors focus:border-teal-300"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-400">
          {target} - {client.macroAdherence}% macros - week {client.programWeek}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          className="rounded-full bg-teal-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-950 hover:bg-teal-200"
        >
          Create handoff
        </button>
      </div>
    </div>
  );
}

function CheckInPanel({
  client,
  value,
  onChange,
  onSubmit,
  onVoice,
  onVideo,
}: {
  client: ClientCRMRecord;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onVoice: () => void;
  onVideo: () => void;
}) {
  return (
    <div className="p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
        Automated check-in
      </div>
      <h3 className="mt-1 text-lg font-medium text-neutral-50">Personalized weekly draft</h3>
      <p className="mt-2 text-sm leading-6 text-neutral-500">
        Pulls PRs, missed sessions, top exercise, and macro adherence into one editable note.
      </p>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-4 min-h-[132px] w-full rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-100 outline-none transition-colors focus:border-teal-300"
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={onVoice}
          className="rounded-full border border-neutral-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-200 hover:border-teal-300 hover:text-teal-300"
        >
          Voice reply
        </button>
        <button
          type="button"
          onClick={onVideo}
          className="rounded-full border border-neutral-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-200 hover:border-teal-300 hover:text-teal-300"
        >
          Video reply
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="rounded-full bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-950 hover:bg-teal-300"
        >
          Send draft
        </button>
      </div>
      <div className="mt-3 text-xs text-neutral-500">
        {client.prCount} PRs - {client.missedSessions} missed - {client.macroAdherence}% macros
      </div>
    </div>
  );
}

function BulkActions({
  role,
  count,
  action,
  onActionChange,
  onApply,
}: {
  role: ProviderRole;
  count: number;
  action: BulkAction;
  onActionChange: (action: BulkAction) => void;
  onApply: () => void;
}) {
  return (
    <div className="border-t border-neutral-800 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
            Bulk actions
          </div>
          <h3 className="mt-1 text-lg font-medium text-neutral-50">
            Apply to the filtered segment
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Built for coaches managing 20-40 clients without manual repetition.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={action}
            onChange={(event) => onActionChange(event.target.value as BulkAction)}
            className="rounded-full border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-neutral-100 outline-none focus:border-teal-300"
          >
            <option value="checkin">Send weekly check-in</option>
            <option value="weights">Bump Week 4 weights +5lb</option>
            <option value="nutrition-review">Flag nutrition review</option>
            <option value="recovery-adjust">Adjust for low recovery</option>
          </select>
          <button
            type="button"
            onClick={onApply}
            className="rounded-full bg-teal-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-950 hover:bg-teal-200"
          >
            Apply to {count}
          </button>
        </div>
      </div>
      <div className="mt-3 text-xs text-neutral-500">
        {role === 'trainer'
          ? 'Trainer bulk actions can target program week, PR status, and missed sessions.'
          : 'Nutritionist bulk actions can target macro drift, review flags, and shared clients.'}
      </div>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-neutral-800 px-5 py-3 last:border-r-0">
      <div className="text-xl font-light text-neutral-50">{value}</div>
      <div className="mt-1 text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">{label}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2">
      <div className="text-[0.6rem] uppercase tracking-[0.12em] text-neutral-500">{label}</div>
      <div className="mt-1 font-medium text-neutral-100">{value}</div>
    </div>
  );
}

function RiskPill({ client }: { client: ClientCRMRecord }) {
  if (client.reviewFlag) {
    return (
      <span className="rounded-full border border-red-300/30 bg-red-400/10 px-2.5 py-1 text-xs text-red-200">
        Review
      </span>
    );
  }
  if (client.prCount > 0) {
    return (
      <span className="rounded-full border border-teal-300/30 bg-teal-300/10 px-2.5 py-1 text-xs text-teal-200">
        PR
      </span>
    );
  }
  return (
    <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400">
      Stable
    </span>
  );
}

function buildClients(subscribers: Subscriber[]) {
  return subscribers
    .filter((subscriber) => subscriber.status === 'active' || subscriber.status === 'trialing')
    .map((subscriber, index) => {
      const seed = hashString(subscriber.client_id);
      const monthlyValue = Math.max(49, Math.round((subscriber.price_cents ?? 9900) / 100));
      const retentionMonths = 1 + (seed % 18);
      const macroAdherence = 58 + (seed % 39);
      const missedSessions = seed % 4;
      const noMessageDays = seed % 12;
      const prCount = seed % 5;
      const dualCare = seed % 2 === 0;
      const nutritionFlag = macroAdherence < 74 || seed % 7 === 0;

      return {
        id: subscriber.client_id,
        label: `Client ${index + 1} - ${subscriber.client_id.slice(0, 8)}`,
        program: ['Hypertrophy 2', 'Tempo rebuild', 'Marathon block', 'Strength base'][seed % 4],
        programWeek: 1 + (seed % 6),
        status: subscriber.status,
        monthlyValue,
        lifetimeValue: monthlyValue * retentionMonths,
        retentionMonths,
        referrals: seed % 3,
        prCount,
        missedSessions,
        macroAdherence,
        noMessageDays,
        topExercise: ['Farmer carry', 'Bench press', 'Tempo run', 'Front squat'][seed % 4],
        dualCare,
        nutritionFlag,
        reviewFlag: missedSessions > 1 || macroAdherence < 72 || noMessageDays >= 7,
        timeline: buildTimeline(seed),
      };
    });
}

function filterClients(clients: ClientCRMRecord[], segment: SegmentKey) {
  if (segment === 'week1') return clients.filter((client) => client.programWeek === 1);
  if (segment === 'prs') return clients.filter((client) => client.prCount > 0);
  if (segment === 'review') return clients.filter((client) => client.reviewFlag || client.nutritionFlag);
  if (segment === 'dual') return clients.filter((client) => client.dualCare);
  if (segment === 'stale') return clients.filter((client) => client.noMessageDays >= 7);
  return clients;
}

function buildTimeline(seed: number): TimelineEvent[] {
  return [
    {
      id: 'workout',
      day: 'Today',
      type: 'workout',
      title: ['Upper pull complete', 'Tempo run logged', 'Lower strength done'][seed % 3],
      detail: 'Session saved with set timing, rest windows, reactions, and progression context.',
    },
    {
      id: 'meal',
      day: 'Today',
      type: 'meal',
      title: seed % 2 === 0 ? 'Protein target under' : 'Macros on plan',
      detail: seed % 2 === 0
        ? 'Calories are close, but protein is under target and rest-day carbs are trending high.'
        : 'Macro adherence is on plan with protein target hit before dinner.',
    },
    {
      id: 'sleep',
      day: 'Yesterday',
      type: 'sleep',
      title: `${6 + (seed % 3)}h sleep`,
      detail: 'Sleep and recovery are included in the coach review context for load decisions.',
    },
    {
      id: 'message',
      day: '2d ago',
      type: 'message',
      title: 'Client check-in',
      detail: 'Client reported energy, soreness, schedule friction, and next-session availability.',
    },
    {
      id: 'photo',
      day: '4d ago',
      type: 'photo',
      title: 'Progress photo',
      detail: 'Photo is attached to the timeline so the coach can review it beside training and nutrition.',
    },
    {
      id: 'weight',
      day: '7d ago',
      type: 'weight',
      title: `${162 + (seed % 18)} lb`,
      detail: 'Body weight trend is shown in the same scrub bar as workouts, meals, and messages.',
    },
  ];
}

function buildCheckInDraft(client: ClientCRMRecord) {
  return `Quick check-in for ${client.label}: you hit ${client.prCount} PRs this week, missed ${client.missedSessions} sessions, and your strongest movement was ${client.topExercise}. Macro adherence is at ${client.macroAdherence}%. My read: keep the main work steady, tighten the one habit slipping most, and send me one note after the next session.`;
}

function buildHandoffDraft(role: ProviderRole, client: ClientCRMRecord, event: TimelineEvent) {
  const target = role === 'trainer' ? '@nutritionist' : '@trainer';
  return `${target} flag for ${client.label}: ${event.title}. Context attached from ${event.day}: ${event.detail} Macro adherence ${client.macroAdherence}%, missed sessions ${client.missedSessions}, current program week ${client.programWeek}.`;
}

function bulkActionLabel(action: BulkAction) {
  if (action === 'weights') return 'Weight adjustment';
  if (action === 'nutrition-review') return 'Nutrition review flag';
  if (action === 'recovery-adjust') return 'Recovery adjustment';
  return 'Weekly check-in';
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
