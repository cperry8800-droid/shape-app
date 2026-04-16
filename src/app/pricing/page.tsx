import Link from 'next/link';
import CinematicPageShell from '@/components/CinematicPageShell';

export const metadata = { title: 'Pricing — Shape' };

export default function PricingPage() {
  return (
    <CinematicPageShell title="Simple pricing" subtitle="Shape is $5/mo for clients and includes Shape Radio. Trainers and nutritionists set their own prices — you pay them directly." backgroundImage="/intro/Pricing.png">
      <div className="mx-auto max-w-lg">
        <div className="flex flex-col items-center rounded-xl border border-neutral-800 bg-neutral-900/30 p-10 text-center">
          <h2 className="text-xl font-medium mb-2">Shape Platform</h2>
          <p className="text-sm text-white/50 mb-6">
            $5/mo for clients. Includes Shape Radio. Trainers and nutritionists set their own prices — you pay them directly.
          </p>
          <div className="flex items-baseline gap-1 mb-8">
            <span className="text-5xl font-light">$5</span>
            <span className="text-sm text-white/40">/ month</span>
          </div>
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
