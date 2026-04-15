// Subscribe button — kicks off a Stripe Checkout session via a server action.
// Rendered inside a form so the action receives provider_id + provider_role.

import { startCheckout } from '@/app/subscribe/actions';

export default function SubscribeButton({
  providerId,
  providerRole,
  priceLabel,
  alreadySubscribed,
}: {
  providerId: number;
  providerRole: 'trainer' | 'nutritionist';
  priceLabel: string;
  alreadySubscribed?: boolean;
}) {
  if (alreadySubscribed) {
    return (
      <div className="text-xs text-teal-400 bg-teal-400/10 border border-teal-400/30 rounded-full px-4 py-2 inline-block">
        ✓ Subscribed
      </div>
    );
  }

  return (
    <form action={startCheckout}>
      <input type="hidden" name="provider_id" value={providerId} />
      <input type="hidden" name="provider_role" value={providerRole} />
      <button
        type="submit"
        className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-5 py-2.5 hover:bg-teal-300 transition-colors"
      >
        Subscribe {priceLabel}
      </button>
    </form>
  );
}
