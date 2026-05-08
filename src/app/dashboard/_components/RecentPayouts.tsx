type Subscriber = {
  id: string;
  status: string;
  price_cents: number | null;
  created_at: string;
};

type PayoutRow = {
  date: string;
  subscriberCount: number;
  amountCents: number;
};

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export default function RecentPayouts({ subscribers }: { subscribers: Subscriber[] }) {
  const rows = buildRecentPayoutRows(subscribers);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-medium">Recent payouts</h2>
        <span className="text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">
          Stripe Connect
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No paid subscription payouts to show yet. Active subscriptions will populate this
          section after clients subscribe.
        </p>
      ) : (
        <div className="divide-y divide-neutral-800/80">
          {rows.map((row) => (
            <div
              key={row.date}
              className="grid grid-cols-[1fr,auto,auto] items-center gap-4 py-4 text-sm"
            >
              <div className="font-medium">{row.date}</div>
              <div className="text-neutral-500">
                {row.subscriberCount} {row.subscriberCount === 1 ? 'subscriber' : 'subscribers'}
              </div>
              <div className="font-mono font-semibold text-neutral-100">
                {moneyFormatter.format(row.amountCents / 100)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function buildRecentPayoutRows(subscribers: Subscriber[]): PayoutRow[] {
  const paidSubscribers = subscribers.filter(
    (subscriber) => subscriber.status === 'active' && (subscriber.price_cents ?? 0) > 0
  );

  if (paidSubscribers.length === 0) return [];

  return getRecentTuesdayPayoutDates()
    .map((payoutDate) => {
      const payoutCutoff = endOfDay(payoutDate).getTime();
      const eligibleSubscribers = paidSubscribers.filter(
        (subscriber) => new Date(subscriber.created_at).getTime() <= payoutCutoff
      );
      const amountCents = eligibleSubscribers.reduce(
        (sum, subscriber) => sum + (subscriber.price_cents ?? 0),
        0
      );

      return {
        date: dateFormatter.format(payoutDate),
        subscriberCount: eligibleSubscribers.length,
        amountCents,
      };
    })
    .filter((row) => row.subscriberCount > 0);
}

function getRecentTuesdayPayoutDates() {
  const dates: Date[] = [];
  const date = new Date();
  date.setHours(12, 0, 0, 0);

  const tuesday = 2;
  const daysSinceTuesday = (date.getDay() - tuesday + 7) % 7;
  date.setDate(date.getDate() - daysSinceTuesday);

  for (let index = 0; index < 4; index += 1) {
    const payoutDate = new Date(date);
    payoutDate.setDate(date.getDate() - index * 7);
    dates.push(payoutDate);
  }

  return dates;
}

function endOfDay(date: Date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}
