// Marketing page for trainers — recruits new coaches to the platform.
// Ported from the legacy for-trainers.html with the same bullet copy.

import Link from 'next/link';
import PageHero from '@/components/PageHero';
import Section from '@/components/Section';

export const metadata = {
  title: 'For Trainers — Shape',
  description: 'Join Shape for free. Build your brand and reach thousands of clients actively looking for coaching.',
};

export default function ForTrainersPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-16">
      <PageHero
        tag="For Trainers"
        title="Build your brand."
        gradientWord="business"
        subtitle="Shape puts your training business in front of thousands of members actively looking for custom programs. Build your profile, sell your sessions, and let us handle the marketing. It costs nothing to join."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
        {[
          { n: '10k+', l: 'Active members browsing' },
          { n: '$0', l: 'Cost to join' },
          { n: '100%', l: 'Your brand, your way' },
          { n: '24/7', l: 'Marketing by Shape' },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-2xl font-semibold tracking-tight">{s.n}</div>
            <div className="text-xs text-neutral-400 mt-1">{s.l}</div>
          </div>
        ))}
      </div>

      <Section title="We bring the clients to you" subtitle="Exposure, built in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Feature
            n="1"
            title="Instant visibility"
            body="Your profile goes live in the Trainer Marketplace as soon as you're approved."
          />
          <Feature
            n="2"
            title="Shape promotes you"
            body="Platform marketing, social, and outreach campaigns bring the members to your door."
          />
          <Feature
            n="3"
            title="Trainer of the month"
            body="Get featured on the Shape homepage and watch your subscribers climb."
          />
        </div>
      </Section>

      <Section title="No cost to get started. Ever." subtitle="Free to join">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <ul className="flex flex-col gap-3 text-sm text-neutral-300">
            <Li>Free to join, no upfront costs</Li>
            <Li>No monthly fees or minimums</Li>
            <Li>Shape handles billing and payments</Li>
            <Li>All marketing and promotion included</Li>
            <Li>Monthly payouts via direct deposit</Li>
          </ul>
        </div>
      </Section>

      <Section title="What trainers are saying">
        <blockquote className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8">
          <p className="text-lg text-neutral-100 leading-relaxed mb-4">
            &ldquo;I used to spend half my time trying to find clients. Shape changed everything — I
            just upload my programs and the subscribers come to me. The exposure is unreal.&rdquo;
          </p>
          <footer className="text-sm text-neutral-400">
            Marcus Johnson · Strength &amp; Powerlifting · 1,240 subscribers
          </footer>
        </blockquote>
      </Section>

      <div className="rounded-xl border border-teal-400/30 bg-teal-400/5 p-8 text-center">
        <h2 className="text-2xl font-light tracking-tight mb-2">Ready to grow your business?</h2>
        <p className="text-sm text-neutral-400 mb-6">
          It&rsquo;s free to join and takes less than five minutes to set up your profile.
        </p>
        <Link
          href="/signup"
          className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors inline-block"
        >
          Apply as a trainer
        </Link>
      </div>
    </main>
  );
}

function Feature({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="text-xs text-teal-400 font-semibold mb-2">Step {n}</div>
      <h3 className="font-medium mb-2">{title}</h3>
      <p className="text-sm text-neutral-500 leading-relaxed">{body}</p>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="text-teal-400 mt-0.5">✓</span>
      <span>{children}</span>
    </li>
  );
}
