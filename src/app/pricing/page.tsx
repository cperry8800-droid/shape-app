import Link from 'next/link';
import CinematicPageShell from '@/components/CinematicPageShell';

export const metadata = { title: 'Pricing — Shape' };

export default function PricingPage() {
  return (
    <CinematicPageShell title="Simple pricing" subtitle="One plan. Everything included." backgroundImage="/intro/Backgounrd.jpeg">
      <div className="mx-auto max-w-lg">
        <div className="flex flex-col items-center rounded-xl border border-neutral-800 bg-neutral-900/30 p-10 text-center">
          <h2 className="text-xl font-medium mb-2">Shape Platform</h2>
          <p className="text-sm text-white/50 mb-6">
            Access to real coaches, real nutritionists, programs, meal plans, messaging, and community — all in one place.
          </p>
          <div className="flex items-baseline gap-1 mb-8">
            <span className="text-5xl font-light">$5</span>
            <span className="text-sm text-white/40">/ month</span>
          </div>
          <ul className="mb-10 space-y-3 text-left w-full">
            {[
              'Browse and subscribe to coaches & nutritionists',
              'Personalized workout programs',
              'Custom meal plans',
              'In-app messaging with your team',
              'Progress tracking & check-ins',
              'Community access',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                <span className="mt-0.5 text-teal-400">&#10003;</span>
                {f}
              </li>
            ))}
          </ul>
          <Link
            href="/signup"
            className="block w-full text-center text-sm font-medium bg-white text-neutral-950 rounded-full px-6 py-3 hover:bg-white/90 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </CinematicPageShell>
  );
}
