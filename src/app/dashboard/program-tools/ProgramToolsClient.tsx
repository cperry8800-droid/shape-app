'use client';

import type { DragEvent } from 'react';
import { useMemo, useState } from 'react';

type GenerateKind = 'workout' | 'program' | 'meal_plan';

type DraftBlock = {
  label: string;
  title: string;
  detail: string;
  note: string;
};

type GeneratedDraft = {
  title: string;
  summary: string;
  tag: string;
  duration: string;
  blocks: DraftBlock[];
  coachNotes: string[];
  shoppingList?: { section: string; items: string[] }[];
};

type ProgramToolsClientProps = {
  trainerId: number | null;
  nutritionistId: number | null;
  bulkClients: BulkClient[];
};

type BulkClient = {
  id: string;
  label: string;
  status: string;
};

type WeekDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type PlannerCard = {
  id: string;
  kind: 'section' | 'exercise';
  title: string;
  detail: string;
  badge: string;
};

type WeekBoard = Record<WeekDayKey, PlannerCard[]>;

type ProgressionRule = {
  id: string;
  week: number;
  prescription: string;
  condition: string;
  adjustment: string;
};

type NutritionTarget = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
};

type ClientOverride = {
  selected: boolean;
  weightOverride: string;
};

type MarketplaceSettings = {
  list: boolean;
  priceDollars: string;
};

const weekColumns: Array<{ key: WeekDayKey; label: string }> = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const starterWeekBoard: WeekBoard = {
  mon: [
    { id: 'mon-primary', kind: 'section', title: 'Lower strength', detail: 'Squat pattern, hinge, carry', badge: 'SECTION' },
    { id: 'mon-carry', kind: 'exercise', title: 'Farmer carry', detail: '4 x 40 m - 80 lb', badge: 'DEMO' },
  ],
  tue: [{ id: 'tue-zone2', kind: 'section', title: 'Zone 2 run', detail: '35 min easy aerobic', badge: 'RUN' }],
  wed: [{ id: 'wed-upper', kind: 'section', title: 'Upper pull', detail: 'Rows, pull-ups, rear delt', badge: 'SECTION' }],
  thu: [{ id: 'thu-recovery', kind: 'section', title: 'Mobility', detail: 'Hips, t-spine, ankles', badge: 'RECOVERY' }],
  fri: [{ id: 'fri-tempo', kind: 'section', title: 'Tempo session', detail: '3 x 8 min at threshold', badge: 'RUN' }],
  sat: [{ id: 'sat-full', kind: 'section', title: 'Full body', detail: 'Moderate volume, clean reps', badge: 'SECTION' }],
  sun: [{ id: 'sun-off', kind: 'section', title: 'Off / walk', detail: 'Steps, tissue quality, sleep', badge: 'OFF' }],
};

const exerciseLibrary = [
  {
    name: 'Farmer carry',
    category: 'Strength',
    equipment: 'Dumbbells / trap bar',
    cues: ['Tall posture', 'Ribs stacked', 'Quiet steps'],
    sensor: 'tempo + set duration',
  },
  {
    name: 'Barbell row',
    category: 'Pull',
    equipment: 'Barbell',
    cues: ['Brace first', 'Pull elbows back', 'Pause at top'],
    sensor: 'rep count + tempo',
  },
  {
    name: 'Tempo run',
    category: 'Endurance',
    equipment: 'GPS / watch',
    cues: ['Even split', 'Relax shoulders', 'Hold cadence'],
    sensor: 'pace + HR zone',
  },
];

const autoAdjustRules = [
  'If RPE is 9+ on two working sets, reduce next session load by 5%.',
  'If all sets finish under target RPE and tempo holds, add 2.5-5 lb next week.',
  'If recovery or sleep score is low, cut accessory volume by one set.',
  'If detected ROM drops below 80%, flag the set for coach review.',
];

const starterProgressionRules: ProgressionRule[] = [
  {
    id: 'week-1-base',
    week: 1,
    prescription: '4 x 8 @ 65%',
    condition: 'Baseline week',
    adjustment: 'Hold form standard before loading',
  },
  {
    id: 'week-4-rpe',
    week: 4,
    prescription: 'Top sets from client log',
    condition: 'If average RPE <= 8 and all reps completed',
    adjustment: '+10 lb next exposure',
  },
];

const starterNutritionTargets: Record<WeekDayKey, NutritionTarget> = {
  mon: { kcal: 2800, protein: 250, carbs: 310, fat: 70, source: 'Nutritionist high-output day' },
  tue: { kcal: 2550, protein: 230, carbs: 285, fat: 65, source: 'Run support day' },
  wed: { kcal: 2700, protein: 240, carbs: 295, fat: 68, source: 'Strength day' },
  thu: { kcal: 2300, protein: 220, carbs: 220, fat: 60, source: 'Recovery day' },
  fri: { kcal: 2850, protein: 250, carbs: 330, fat: 70, source: 'Tempo day' },
  sat: { kcal: 2700, protein: 240, carbs: 290, fat: 68, source: 'Full-body day' },
  sun: { kcal: 2200, protein: 210, carbs: 200, fat: 62, source: 'Off day' },
};

export default function ProgramToolsClient({ trainerId, nutritionistId, bulkClients }: ProgramToolsClientProps) {
  const [kind, setKind] = useState<GenerateKind>('workout');
  const [programPrompt, setProgramPrompt] = useState(
    'Build a 4-week hybrid program for an intermediate client: 3 lifting days, 2 running days, protect the right knee, include watch-assisted logging and exercise demo cues.'
  );
  const [goal, setGoal] = useState('hybrid strength with running support');
  const [client, setClient] = useState('Shape client');
  const [level, setLevel] = useState('intermediate');
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [equipment, setEquipment] = useState('full gym, dumbbells, treadmill');
  const [preferences, setPreferences] = useState('include video demo cues and watch-assisted logging');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<GeneratedDraft | null>(null);
  const [source, setSource] = useState<string>('');
  const [error, setError] = useState('');
  const [weekBoard, setWeekBoard] = useState<WeekBoard>(starterWeekBoard);
  const [saveStatus, setSaveStatus] = useState('');
  const [progressionRules, setProgressionRules] = useState<ProgressionRule[]>(starterProgressionRules);
  const [nutritionTargets, setNutritionTargets] = useState<Record<WeekDayKey, NutritionTarget>>(starterNutritionTargets);
  const [clientOverrides, setClientOverrides] = useState<Record<string, ClientOverride>>(() =>
    Object.fromEntries(bulkClients.map((clientRow) => [clientRow.id, { selected: false, weightOverride: '' }]))
  );
  const [marketplace, setMarketplace] = useState<MarketplaceSettings>({ list: false, priceDollars: '49' });

  const providerLabel = useMemo(() => {
    if (kind === 'meal_plan') return nutritionistId ? `Nutritionist #${nutritionistId}` : 'Nutritionist profile needed';
    return trainerId ? `Trainer #${trainerId}` : 'Trainer profile needed';
  }, [kind, nutritionistId, trainerId]);

  const saveProvider = useMemo(() => {
    if (kind === 'meal_plan') {
      return nutritionistId ? { role: 'nutritionist' as const, id: nutritionistId } : null;
    }
    return trainerId ? { role: 'trainer' as const, id: trainerId } : null;
  }, [kind, nutritionistId, trainerId]);

  const selectedClientAssignments = useMemo(
    () =>
      bulkClients
        .filter((clientRow) => clientOverrides[clientRow.id]?.selected)
        .map((clientRow) => ({
          clientId: clientRow.id,
          weightOverride: clientOverrides[clientRow.id]?.weightOverride || '',
        })),
    [bulkClients, clientOverrides]
  );

  async function generateDraft(promptOverride?: string, forceKind?: GenerateKind) {
    const nextKind = forceKind ?? kind;
    const plainPrompt = String(promptOverride || '').trim();
    if (forceKind === 'program' && !plainPrompt) {
      setError('Describe the program first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/ai/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: nextKind,
          goal: plainPrompt || goal,
          client,
          level,
          daysPerWeek,
          equipment,
          preferences: plainPrompt ? `${preferences}\n\nPlain-English coach prompt: ${plainPrompt}` : preferences,
          duration: nextKind === 'workout' ? '60 minutes' : '4 weeks',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not generate draft.');
      setDraft(payload.draft);
      setSource(payload.source || 'template');
      if (nextKind === 'program') seedWeekBoardFromDraft(payload.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate draft.');
    } finally {
      setLoading(false);
    }
  }

  function seedWeekBoardFromDraft(nextDraft: GeneratedDraft) {
    const activeDayCount = Math.max(1, Math.min(7, daysPerWeek));
    const activeDays = weekColumns.slice(0, activeDayCount);
    const nextBoard = emptyWeekBoard();

    nextDraft.blocks.forEach((block, index) => {
      const day = activeDays[index % activeDays.length]?.key ?? 'mon';
      nextBoard[day].push({
        id: `draft-${Date.now()}-${index}`,
        kind: 'section',
        title: block.title,
        detail: block.detail,
        badge: block.label || 'AI',
      });
    });

    setWeekBoard(nextBoard);
  }

  function movePlannerCard(cardId: string, fromDay: WeekDayKey, toDay: WeekDayKey) {
    if (fromDay === toDay) return;
    setWeekBoard((current) => {
      const moving = current[fromDay].find((card) => card.id === cardId);
      if (!moving) return current;
      return {
        ...current,
        [fromDay]: current[fromDay].filter((card) => card.id !== cardId),
        [toDay]: [...current[toDay], moving],
      };
    });
  }

  function addExercise(day: WeekDayKey) {
    const exercise = exerciseLibrary[weekBoard[day].length % exerciseLibrary.length];
    setWeekBoard((current) => ({
      ...current,
      [day]: [
        ...current[day],
        {
          id: `${day}-${Date.now()}`,
          kind: 'exercise',
          title: exercise.name,
          detail: exercise.cues.join(', '),
          badge: 'DEMO',
        },
      ],
    }));
  }

  function updateProgressionRule(id: string, patch: Partial<ProgressionRule>) {
    setProgressionRules((current) =>
      current.map((rule) =>
        rule.id === id
          ? {
              ...rule,
              ...patch,
              week: patch.week ? Math.max(1, Math.min(52, patch.week)) : rule.week,
            }
          : rule
      )
    );
  }

  function addProgressionRule() {
    setProgressionRules((current) => [
      ...current,
      {
        id: `rule-${Date.now()}`,
        week: Math.min(52, current.length + 1),
        prescription: '3 x 8 @ last clean load',
        condition: 'If RPE <= 8',
        adjustment: '+5 lb next week',
      },
    ]);
  }

  function updateNutritionTarget(day: WeekDayKey, patch: Partial<NutritionTarget>) {
    setNutritionTargets((current) => ({ ...current, [day]: { ...current[day], ...patch } }));
  }

  function toggleClientAssignment(clientId: string) {
    setClientOverrides((current) => ({
      ...current,
      [clientId]: {
        selected: !current[clientId]?.selected,
        weightOverride: current[clientId]?.weightOverride || '',
      },
    }));
  }

  function updateClientOverride(clientId: string, weightOverride: string) {
    setClientOverrides((current) => ({
      ...current,
      [clientId]: {
        selected: current[clientId]?.selected ?? true,
        weightOverride,
      },
    }));
  }

  async function saveProgramTemplate() {
    setSaveStatus('Saving...');
    setError('');
    if (!saveProvider) {
      setSaveStatus('');
      setError('Link a trainer or nutritionist profile before saving.');
      return;
    }

    try {
      const response = await fetch('/api/program-tools/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerRole: saveProvider.role,
          providerId: saveProvider.id,
          title: draft?.title || goal,
          goal,
          level,
          durationWeeks: 4,
          daysPerWeek,
          source: source === 'openai' ? 'ai_generated' : 'manual',
          prompt: programPrompt,
          draft,
          weekBoard,
          autoAdjustRules,
          progressionRules,
          nutritionTargets,
          marketplace,
          clientAssignments: selectedClientAssignments,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save program draft.');
      setSaveStatus(`Saved draft ${payload.id.slice(0, 8)}.`);
    } catch (err) {
      setSaveStatus('');
      setError(err instanceof Error ? err.message : 'Could not save program draft.');
    }
  }

  function updateBlock(index: number, key: keyof DraftBlock, value: string) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        blocks: current.blocks.map((block, i) => (i === index ? { ...block, [key]: value } : block)),
      };
    });
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">
              AI workout generation / auto-adjust
            </div>
            <h3 className="text-xl font-medium">Draft generator</h3>
            <p className="text-sm text-neutral-500 mt-1">
              Generates coach-editable plans. If OpenAI is not configured, the existing template fallback is used.
            </p>
          </div>
          <span className="text-[0.65rem] uppercase tracking-wider border border-neutral-700 rounded-full px-3 py-1 text-neutral-300">
            {providerLabel}
          </span>
        </div>

        <div className="rounded-xl border border-teal-400/20 bg-teal-400/[0.04] p-4 mb-5">
          <label className="flex flex-col gap-2">
            <span className="text-[0.65rem] uppercase tracking-[0.14em] text-teal-300">
              Describe the program in plain English
            </span>
            <textarea
              value={programPrompt}
              onChange={(event) => setProgramPrompt(event.target.value)}
              rows={4}
              className="rounded-lg border border-teal-400/20 bg-neutral-950/70 px-3 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-teal-400/70"
              placeholder="Example: 6-week marathon strength block, 2 lift days, 3 run days, knee-friendly, include mobility and watch-assisted logging."
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setKind('program');
              void generateDraft(programPrompt, 'program');
            }}
            disabled={loading}
            className="mt-3 w-full rounded-full bg-teal-400 text-neutral-950 px-5 py-3 text-xs font-semibold uppercase tracking-[0.1em] hover:bg-teal-300 disabled:opacity-50"
          >
            {loading ? 'Drafting program...' : 'Draft first version'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {(['workout', 'program', 'meal_plan'] as GenerateKind[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setKind(item)}
              className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.08em] transition-colors ${
                kind === item
                  ? 'bg-teal-400 text-neutral-950 border-teal-400'
                  : 'border-neutral-700 text-neutral-300 hover:bg-neutral-900'
              }`}
            >
              {item.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Goal" value={goal} onChange={setGoal} />
          <Field label="Client" value={client} onChange={setClient} />
          <Field label="Level" value={level} onChange={setLevel} />
          <Field
            label="Days / week"
            value={String(daysPerWeek)}
            onChange={(value) => setDaysPerWeek(Math.max(1, Math.min(7, Number(value) || 1)))}
            type="number"
          />
          <div className="md:col-span-2">
            <Field label="Equipment" value={equipment} onChange={setEquipment} />
          </div>
          <div className="md:col-span-2">
            <label className="flex flex-col gap-2">
              <span className="text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">Preferences</span>
              <textarea
                value={preferences}
                onChange={(event) => setPreferences(event.target.value)}
                rows={3}
                className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-teal-400/70"
              />
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void generateDraft()}
          disabled={loading}
          className="mt-5 w-full rounded-full bg-teal-400 text-neutral-950 px-5 py-3 text-xs font-semibold uppercase tracking-[0.1em] hover:bg-teal-300 disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate coach draft'}
        </button>
        {error && <p className="text-sm text-red-300 mt-3">{error}</p>}
      </section>

      <section className="xl:col-span-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">
              Drag-and-drop week view
            </div>
            <h3 className="text-xl font-medium">Mon-Sun program canvas</h3>
            <p className="text-sm text-neutral-500 mt-1">
              Drag whole sections or exercise cards between days. Coaches keep final control after Shape drafts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWeekBoard(starterWeekBoard)}
            className="rounded-full border border-neutral-700 px-4 py-2 text-xs uppercase tracking-[0.08em] text-neutral-300 hover:bg-neutral-900"
          >
            Reset week
          </button>
          <button
            type="button"
            onClick={() => void saveProgramTemplate()}
            className="rounded-full bg-teal-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-950 hover:bg-teal-300"
          >
            Save draft
          </button>
        </div>
        {saveStatus && <p className="text-sm text-teal-300 mb-4">{saveStatus}</p>}
        <WeekCanvas
          board={weekBoard}
          nutritionTargets={nutritionTargets}
          onMove={movePlannerCard}
          onAddExercise={addExercise}
        />
      </section>

      <section className="xl:col-span-2 grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">
                Progression logic
              </div>
              <h3 className="text-xl font-medium">Rules that apply from logged data</h3>
              <p className="text-sm text-neutral-500 mt-1">
                Set the prescription, condition, and automatic adjustment. Shape stores this with the template so weekly loads can advance from client set logs.
              </p>
            </div>
            <button
              type="button"
              onClick={addProgressionRule}
              className="rounded-full border border-neutral-700 px-4 py-2 text-xs uppercase tracking-[0.08em] text-neutral-300 hover:bg-neutral-900"
            >
              Add rule
            </button>
          </div>
          <div className="grid gap-3">
            {progressionRules.map((rule) => (
              <div key={rule.id} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="grid grid-cols-1 md:grid-cols-[90px_1fr_1fr_1fr] gap-3">
                  <Field
                    label="Week"
                    type="number"
                    value={String(rule.week)}
                    onChange={(value) => updateProgressionRule(rule.id, { week: Number(value) || 1 })}
                  />
                  <Field
                    label="Prescription"
                    value={rule.prescription}
                    onChange={(value) => updateProgressionRule(rule.id, { prescription: value })}
                  />
                  <Field
                    label="Condition"
                    value={rule.condition}
                    onChange={(value) => updateProgressionRule(rule.id, { condition: value })}
                  />
                  <Field
                    label="Adjustment"
                    value={rule.adjustment}
                    onChange={(value) => updateProgressionRule(rule.id, { adjustment: value })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">
            Apply to clients
          </div>
          <h3 className="text-xl font-medium">Bulk assignment with overrides</h3>
          <p className="text-sm text-neutral-500 mt-1 mb-4">
            Assign once to similar clients. Add per-client load notes like +10 lb, -5%, or bodyweight only.
          </p>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 mb-4">
            <div className="text-3xl font-light">{selectedClientAssignments.length}</div>
            <div className="text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">clients selected</div>
          </div>
          <div className="grid gap-2 max-h-[290px] overflow-auto pr-1">
            {bulkClients.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
                Active subscribers will appear here once the provider has clients.
              </div>
            ) : (
              bulkClients.map((clientRow) => {
                const override = clientOverrides[clientRow.id] ?? { selected: false, weightOverride: '' };
                return (
                  <div key={clientRow.id} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={override.selected}
                        onChange={() => toggleClientAssignment(clientRow.id)}
                        className="h-4 w-4 accent-teal-400"
                      />
                      <span className="flex-1 text-sm">{clientRow.label}</span>
                      <span className="text-[0.6rem] uppercase tracking-wider text-neutral-500">{clientRow.status}</span>
                    </label>
                    <input
                      value={override.weightOverride}
                      onChange={(event) => updateClientOverride(clientRow.id, event.target.value)}
                      placeholder="Weight override, e.g. +10 lb"
                      className="mt-3 w-full rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-teal-400/70"
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="xl:col-span-2 grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">
            Nutrition sync
          </div>
          <h3 className="text-xl font-medium">Macros inside the training day</h3>
          <p className="text-sm text-neutral-500 mt-1 mb-4">
            Each day cell carries the nutritionist target so the workout is built against the actual fuel plan.
          </p>
          <div className="grid gap-3">
            {weekColumns.map((day) => {
              const target = nutritionTargets[day.key];
              return (
                <div key={day.key} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="font-medium">{day.label}</div>
                    <div className="text-xs text-teal-300">{target.protein}g protein</div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <NumberField label="Kcal" value={target.kcal} onChange={(value) => updateNutritionTarget(day.key, { kcal: value })} />
                    <NumberField label="Protein" value={target.protein} onChange={(value) => updateNutritionTarget(day.key, { protein: value })} />
                    <NumberField label="Carbs" value={target.carbs} onChange={(value) => updateNutritionTarget(day.key, { carbs: value })} />
                    <NumberField label="Fat" value={target.fat} onChange={(value) => updateNutritionTarget(day.key, { fat: value })} />
                  </div>
                  <div className="mt-3">
                    <Field
                      label="Source"
                      value={target.source}
                      onChange={(value) => updateNutritionTarget(day.key, { source: value })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">
            Template and marketplace
          </div>
          <h3 className="text-xl font-medium">Save once, sell if it fits</h3>
          <p className="text-sm text-neutral-500 mt-1 mb-5">
            Finished programs can stay private as templates or be listed in the Programs Marketplace.
          </p>
          <label className="flex items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <span>
              <span className="block text-sm font-medium">List on Programs Marketplace</span>
              <span className="block text-xs text-neutral-500 mt-1">Creates marketplace metadata on save.</span>
            </span>
            <input
              type="checkbox"
              checked={marketplace.list}
              onChange={(event) => setMarketplace((current) => ({ ...current, list: event.target.checked }))}
              className="h-5 w-5 accent-teal-400"
            />
          </label>
          <div className="mt-4">
            <Field
              label="Marketplace price"
              value={marketplace.priceDollars}
              onChange={(value) => setMarketplace((current) => ({ ...current, priceDollars: value }))}
            />
          </div>
          <div className="mt-5 rounded-lg border border-teal-400/20 bg-teal-400/[0.05] p-4 text-sm text-neutral-300">
            Save draft stores template payload, progression rules, nutrition day targets, selected client assignments, and marketplace intent together.
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <div>
            <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">Coach edit layer</div>
            <h3 className="text-xl font-medium">Editable output</h3>
          </div>
          <span className="text-xs text-neutral-500">{source ? `Source: ${source}` : 'No draft yet'}</span>
        </div>

        {!draft ? (
          <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950/40 p-6 text-sm text-neutral-500">
            Generate a draft to edit blocks, cues, and auto-adjust notes before assigning it to a client.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label="Title" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} />
            <label className="flex flex-col gap-2">
              <span className="text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">Summary</span>
              <textarea
                value={draft.summary}
                onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                rows={3}
                className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-3 text-sm text-neutral-100 outline-none focus:border-teal-400/70"
              />
            </label>
            <div className="grid gap-3">
              {draft.blocks.map((block, index) => (
                <div key={`${block.label}-${index}`} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="grid grid-cols-[56px_1fr] gap-3">
                    <Field label="Label" value={block.label} onChange={(value) => updateBlock(index, 'label', value)} />
                    <Field label="Block title" value={block.title} onChange={(value) => updateBlock(index, 'title', value)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <Field label="Target" value={block.detail} onChange={(value) => updateBlock(index, 'detail', value)} />
                    <Field label="Coach cue" value={block.note} onChange={(value) => updateBlock(index, 'note', value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">
          Exercise library & video demos
        </div>
        <h3 className="text-xl font-medium mb-4">Demo-ready movement library</h3>
        <div className="grid gap-3">
          {exerciseLibrary.map((exercise) => (
            <div key={exercise.name} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{exercise.name}</div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {exercise.category} - {exercise.equipment}
                  </div>
                </div>
                <span className="text-[0.65rem] uppercase tracking-wider border border-teal-400/30 text-teal-300 rounded-full px-3 py-1">
                  {exercise.sensor}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {exercise.cues.map((cue) => (
                  <span key={cue} className="rounded-full bg-neutral-800/70 px-3 py-1 text-xs text-neutral-300">
                    {cue}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">
          In-workout form / pacing feedback
        </div>
        <h3 className="text-xl font-medium mb-4">Sensor-based detection model</h3>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Stat label="Rep count" value="Manual + detected" />
          <Stat label="Tempo" value="Set-level" />
          <Stat label="ROM" value="0-100 score" />
          <Stat label="Confidence" value="0-1" />
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.12em] text-neutral-500 mb-3">Auto-adjust rules</div>
          <ul className="space-y-3 text-sm text-neutral-300">
            {autoAdjustRules.map((rule) => (
              <li key={rule} className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-teal-400 shrink-0" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function WeekCanvas({
  board,
  nutritionTargets,
  onMove,
  onAddExercise,
}: {
  board: WeekBoard;
  nutritionTargets: Record<WeekDayKey, NutritionTarget>;
  onMove: (cardId: string, fromDay: WeekDayKey, toDay: WeekDayKey) => void;
  onAddExercise: (day: WeekDayKey) => void;
}) {
  function handleDrop(event: DragEvent<HTMLDivElement>, toDay: WeekDayKey) {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { cardId?: string; fromDay?: WeekDayKey };
      if (payload.cardId && payload.fromDay) onMove(payload.cardId, payload.fromDay, toDay);
    } catch {
      // Ignore malformed drag payloads.
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
      {weekColumns.map((day) => (
        <div
          key={day.key}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleDrop(event, day.key)}
          className="min-h-[260px] rounded-xl border border-neutral-800 bg-neutral-950/40 p-3"
        >
          <div className="rounded-lg border border-teal-400/20 bg-teal-400/[0.05] p-3 mb-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.6rem] uppercase tracking-[0.12em] text-teal-300">Nutrition</span>
              <span className="text-xs text-neutral-300">{nutritionTargets[day.key].kcal} kcal</span>
            </div>
            <div className="text-[0.68rem] text-neutral-500 mt-1">
              P {nutritionTargets[day.key].protein}g - C {nutritionTargets[day.key].carbs}g - F{' '}
              {nutritionTargets[day.key].fat}g
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-neutral-800 pb-3 mb-3">
            <div>
              <div className="text-sm font-medium">{day.label}</div>
              <div className="text-[0.65rem] uppercase tracking-wider text-neutral-600">
                {board[day.key].length} cards
              </div>
            </div>
            <button
              type="button"
              onClick={() => onAddExercise(day.key)}
              className="h-7 w-7 rounded-full border border-neutral-700 text-neutral-300 hover:border-teal-400 hover:text-teal-300"
              aria-label={`Add exercise to ${day.label}`}
            >
              +
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {board[day.key].map((card) => (
              <PlannerCardView key={card.id} card={card} day={day.key} />
            ))}
            {board[day.key].length === 0 && (
              <div className="rounded-lg border border-dashed border-neutral-800 p-4 text-xs text-neutral-600">
                Drop section here
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlannerCardView({ card, day }: { card: PlannerCard; day: WeekDayKey }) {
  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData('application/json', JSON.stringify({ cardId: card.id, fromDay: day }));
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={`cursor-grab rounded-lg border p-3 active:cursor-grabbing ${
        card.kind === 'section'
          ? 'border-teal-400/25 bg-teal-400/[0.06]'
          : 'border-neutral-800 bg-neutral-900/70'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[0.6rem] uppercase tracking-[0.12em] text-teal-300">{card.badge}</span>
        <span className="text-neutral-600">::</span>
      </div>
      <div className="text-sm font-medium leading-snug">{card.title}</div>
      <div className="text-xs text-neutral-500 mt-1 leading-relaxed">{card.detail}</div>
    </div>
  );
}

function emptyWeekBoard(): WeekBoard {
  return {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  };
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-teal-400/70"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[0.6rem] uppercase tracking-[0.12em] text-neutral-500">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-950/70 px-2 py-2 text-xs text-neutral-100 outline-none focus:border-teal-400/70"
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="text-sm font-medium">{value}</div>
      <div className="text-[0.65rem] uppercase tracking-wider text-neutral-500 mt-1">{label}</div>
    </div>
  );
}
