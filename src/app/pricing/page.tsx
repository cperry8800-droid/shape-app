// Pricing page — single $5/mo Shape Platform tier. Trainers and nutritionists
// set their own prices separately; this page is about the platform fee only.

import Link from 'next/link';
import PageHero from '@/components/PageHero';
import Section from '@/components/Section';

export const metadata = {
  title: 'Pricing — Shape',
  description: 'Shape is $5/mo and includes Shape Radio. Trainers and nutritionists set their own prices.',
};

const features = [
  'Browse all trainers & nutritionists',
  'Subscribe to any trainer or nutritionist',
  'Buy individual workout & meal plans',
  'Direct messaging with your pros',
  'Full progress tracking & analytics',
  'Nutrition schedule & macro tracking',
  'Community forum access',
  'Shape Radio — ad-free workout music',
];

export default function PricingPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-16">
      <PageHero
        tag="Pricing"
        title="Simple, transparent"
        gradientWord="pricing"
        subtitle="Shape is $5/mo and includes Shape Radio. Trainers and nutritionists set their own prices — you pay them directly."
      />

      <div className="max-w-md mx-auto mb-16">
        <div className="relative rounded-2xl border border-teal-400/40 bg-neutral-900/50 p-8">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[0.68rem] uppercase tracking-[0.12em] font-semibold text-teal-400 bg-teal-400/10 border border-teal-400/30 rounded-full px-3 py-1">
            Includes Shape Radio
          </div>
          <h2 className="text-xl font-medium mb-1">Shape Platform</h2>
          <div className="flex items-baseline gap-1 mb-6">
            <span className="text-5xl font-semibold tracking-tight">$5</span>
            <span className="text-sm text-neutral-400">/ month</span>
          </div>
          <ul className="flex flex-col gap-3 text-sm text-neutral-300 mb-8">
            {features.map((f) => (
              <li key={f} className="flex gap-3 items-start">
                <span className="text-teal-400 mt-0.5">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/signup"
            className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors block text-center"
          >
            Get started
          </Link>
          <p className="text-xs text-neutral-500 text-center mt-4">
            Each trainer and nutritionist sets their own subscription price. Buy individual plans or
            subscribe monthly. Cancel anytime.
          </p>
        </div>
      </div>

      <Section title="Real results from real people" subtitle="Testimonials">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Quote
            text="Down 30 lbs in 4 months working with Coach Marcus on training and Sarah on nutrition. The combo is unreal."
            author="Jake R."
          />
          <Quote
            text="Found my HIIT coach in the first week. No contracts, no gym BS. Just a good program and a coach who responds."
            author="Aisha L."
          />
          <Quote
            text="As a nutritionist, Shape lets me reach clients worldwide without building my own platform."
            author="Dr. Maria D."
          />
        </div>
      </Section>
    </main>
  );
}

function Quote({ text, author }: { text: string; author: string }) {
  return (
    <blockquote className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <p className="text-sm text-neutral-200 leading-relaxed mb-4">&ldquo;{text}&rdquo;</p>
      <footer className="text-xs text-neutral-500">— {author}</footer>
    </blockquote>
  );
}
