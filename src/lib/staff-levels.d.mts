export type StaffLevel = 'analyst' | 'support' | 'admin' | 'owner';
export type AssignableLevel = 'admin' | 'support' | 'analyst';
export type ConsoleLink = { href: string; label: string; min?: StaffLevel };

export const STAFF_LEVELS: ReadonlyArray<StaffLevel>;
export const ASSIGNABLE_LEVELS: ReadonlyArray<AssignableLevel>;
export const LEVEL_LABELS: Readonly<Record<StaffLevel, string>>;
export const LEVEL_SUMMARIES: Readonly<Record<StaffLevel, string>>;
export const CONSOLE_PAGES: ReadonlyArray<ConsoleLink & { min: StaffLevel }>;
export const ADMIN_TOOLS: ReadonlyArray<ConsoleLink>;

export function levelRank(level: unknown): number;
export function atLeast(level: StaffLevel | null | undefined, min: StaffLevel): boolean;
export function resolveStaffLevel(input: {
  email?: string | null;
  confirmed?: boolean;
  ownerEmails?: ReadonlyArray<string>;
  adminEmails?: ReadonlyArray<string>;
  tableLevel?: string | null;
}): StaffLevel | null;
export function pagesFor(level: StaffLevel | null | undefined): ConsoleLink[];
export function toolsFor(level: StaffLevel | null | undefined): ConsoleLink[];
export function canOpen(level: StaffLevel | null | undefined, href: string): boolean;
export function cleanStaffEmail(value: unknown): string;
export function parseAssignableLevel(value: unknown): AssignableLevel | '';
export function describeActivity(row: {
  action?: string | null;
  target_email?: string | null;
  target_user_id?: string | null;
  details?: Record<string, unknown> | null;
}): string;
