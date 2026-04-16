import Link from 'next/link';
import CinematicPageShell from '@/components/CinematicPageShell';

export const metadata = { title: 'Pricing — Shape' };

const tiers = [
  {
    name: 'Client',
    role: 'client',
    price: 'Free',
    description: 'Find and subscribe to coaches and nutritionists.',
    features: [
      'Browse all coaches and nutritionists',
      'Subscribe to any provider',
      'Track workouts and meals',
      'Message your team',
      'Community access',
    ],
  },
  {
    name: 'Trainer',
    role: 'trainer',
    price: '$29',
    period: '/ month',
    description: 'Build your coaching business on Shape.',
    features: [
      'Custom profile and listing',
      'Publish workout programs',
      'Client management dashboard',
      'In-app messaging',
      'Subscriber analytics',
      'Payment processing via Stripe',
    ],
  },
  {
    name: 'Nutritionist',
    role: 'nutritionist',
    price: '$29',
    period: '/ month',
    description: 'Grow your nutrition practice on Shape.',
    features: [
      'Custom profile and listing',
      'Publish meal plans',
      'Client management dashboard',
      'In-app messaging',
      'Subscriber analytics',
      'Payment processing via Stripe',
    ],
  },
];

export default function PricingPage() {
  return (
    <CinematicPageShell title="Simple pricing" subtitle="Everything you need to train, eat, and grow — on one platform.">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <div
            key={tier.role}
            className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-900/30 p-8"
          >
            <div className="mb-6">
              <h2 className="text-lg font-medium mb-1">{tier.name}</h2>
              <p className="text-sm text-white/50 mb-4">{tier.description}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-light">{tier.price}</span>
                {tier.period && <span className="text-sm text-white/40">{tier.period}</span>}
              </div>
            </div>
            <ul className="flex-1 space-y-3 mb-8">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                  <span className="mt-0.5 text-teal-400">&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={`/signup?role=${tier.role}`}
              className="block text-center text-sm font-medium bg-white text-neutral-950 rounded-full px-6 py-3 hover:bg-white/90 transition-colors"
            >
              Get started as {tier.name.toLowerCase()}
            </Link>
          </div>
        ))}
      </div>
    </CinematicPageShell>
  );
}
