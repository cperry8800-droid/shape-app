export declare const HABIT_WATCH_HOUR: number;

export type HabitWatchNotice = {
  habitId: string;
  ownerId: string;
  watcherId: string;
  day: string;
  name: string;
  type: 'do' | 'avoid';
};

export declare function habitWatchDue(args: {
  habits: Array<{ id: string; user_id: string; name: string; type?: string | null; cadence?: string | null; archived_at?: string | null }>;
  watchers: Array<{ habit_id: string; owner_id: string; watcher_id: string }>;
  doneOn: Set<string>;
  zoneOf: (userId: string) => string | null | undefined;
  hourOf: (tz: string) => number;
  dayOf: (tz: string) => string;
  connected: (a: string, b: string) => boolean;
  hour?: number;
}): HabitWatchNotice[];

export declare function habitWatchText(args: { ownerName?: string | null; habitName?: string | null; type?: string | null }): { title: string; body: string };

export declare function habitWatchDedupe(habitId: string, day: string): string;
