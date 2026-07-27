export type ConsoleWho = 'you' | 'ext' | 'eng';
export type TriagedItem = {
  section: string;
  label: string;
  status: 'pending' | 'manual';
  who: ConsoleWho;
  short: string;
};
export type TriageCounts = {
  you: number;
  ext: number;
  eng: number;
  open: number;
  done: number;
  total: number;
};
export type Triage = { open: TriagedItem[]; counts: TriageCounts };

export function classifyWho(item: { label?: string; status?: string }): ConsoleWho | null;
export function shortLabel(label: string, max?: number): string;
export function triageChecklist(
  sections: Array<{ section?: string; items?: Array<{ label?: string; status?: string }> }>
): Triage;
