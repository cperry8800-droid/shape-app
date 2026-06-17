// AI check-in / message drafting for a coach → client touch.
//
// Builds a deterministic EVIDENCE PACK of the client's real, current signals
// across BOTH disciplines (training + nutrition, from the shared record), hands
// it to the model for a warm, SPECIFIC draft (instructed to cite only those
// signals — never invent), and falls back to the deterministic grounded draft
// from the shared engine when the model is unset/down. HONEST: a signal that
// isn't in the pack can't be cited; a hallucinated citation is dropped.
//
// The result is a DRAFT only — the coach edits it and sends via the existing
// message endpoint. Nothing is sent here.

import { callAI, parseModelJson } from '@/lib/ai';
import DashSignals from '../../../public/newdesign/dashSignals.js';

type Signal = { domain: string; key: string; label: string; value: string; detail: string | null };
type EvidencePack = { signals: Signal[]; hasTraining: boolean; hasNutrition: boolean };

const engine = DashSignals as unknown as {
  buildEvidencePack: (record: unknown, role?: string, now?: Date) => EvidencePack;
  buildCheckinDraft: (record: unknown, role?: string, now?: Date) => { text: string; cited: Array<{ label: string; value: string }>; evidence: EvidencePack };
};

export type CheckinDraft = {
  draft: string;
  cited: Array<{ label: string; value: string }>;
  source: 'ai' | 'template';
  evidence: EvidencePack;
};

const draftSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'cited'],
  properties: {
    message: { type: 'string' },
    cited: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'value'],
        properties: { label: { type: 'string' }, value: { type: 'string' } },
      },
    },
  },
};

function systemPrompt(role: string): string {
  const who = role === 'nutritionist' ? 'a nutrition coach' : 'a strength & conditioning coach';
  return [
    `You are ${who} writing a brief, warm, SPECIFIC weekly check-in message to one of your clients.`,
    'Use ONLY the signals provided in the data — never invent, estimate, or change a number, and never reference a metric that is not in the list.',
    'When BOTH a training and a nutrition signal are present, reference BOTH — the cross-discipline view (e.g. "training is on, but logging slipped") is exactly what makes this personal and not a templated mass-message.',
    'Keep it to 2-4 conversational sentences, no emojis, and end with ONE open question. Address the client by first name.',
  ].join(' ');
}

function extractOutputText(payload: unknown): string {
  const p = payload as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (typeof p?.output_text === 'string' && p.output_text.trim()) return p.output_text;
  for (const item of p?.output ?? []) {
    const t = item?.content?.find((c) => c?.type === 'output_text')?.text;
    if (typeof t === 'string') return t;
  }
  return '';
}

function firstName(record: Record<string, unknown>): string {
  const profile = record.profile as { name?: string } | undefined;
  return profile?.name ? String(profile.name).split(' ')[0] : 'there';
}

/** Draft a grounded check-in for a client. Read/compute — sends nothing. */
export async function draftCheckin(
  record: Record<string, unknown>,
  role: string,
  opts?: { kind?: string },
): Promise<CheckinDraft> {
  const pack = engine.buildEvidencePack(record, role);
  const fallback = engine.buildCheckinDraft(record, role);

  // No real signal → the honest generic; don't ask the model to manufacture one.
  if (!pack.signals.length) {
    return { draft: fallback.text, cited: [], source: 'template', evidence: pack };
  }

  const result = await callAI(
    {
      input: [
        { role: 'system', content: systemPrompt(role) },
        {
          role: 'user',
          content: JSON.stringify({
            client: firstName(record),
            role,
            kind: opts?.kind || 'weekly check-in',
            signals: pack.signals,
          }),
        },
      ],
      text: { format: { type: 'json_schema', name: 'shape_checkin_draft', strict: true, schema: draftSchema } },
    },
    { promptId: 'ai.draft-message' },
  );

  if (!result.ok) return { draft: fallback.text, cited: fallback.cited, source: 'template', evidence: pack };

  const parsed = parseModelJson<{ message?: string; cited?: Array<{ label?: string; value?: string }> }>(extractOutputText(result.data));
  if (!parsed || !parsed.message || !String(parsed.message).trim()) {
    return { draft: fallback.text, cited: fallback.cited, source: 'template', evidence: pack };
  }

  // HONEST: keep only citations that correspond to a real pack signal.
  const packLabels = new Set(pack.signals.map((s) => s.label));
  const cited = Array.isArray(parsed.cited)
    ? parsed.cited
        .filter((c) => c && typeof c.label === 'string' && packLabels.has(c.label))
        .map((c) => ({ label: String(c.label), value: String(c.value ?? '') }))
    : [];

  return { draft: String(parsed.message).trim(), cited: cited.length ? cited : fallback.cited, source: 'ai', evidence: pack };
}
