// Small time helpers shared by the dashboard / clients / train API routes,
// which each previously carried an identical copy.

export const DAY_MS = 86_400_000;

/** Midnight (local) of the Monday that starts the week containing `d`, in ms. */
export function startOfWeek(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const mondayOffset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - mondayOffset);
  return x.getTime();
}
