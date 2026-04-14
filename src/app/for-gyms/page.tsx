// Shape Pass landing page — the legacy for-gyms.html was actually the
// Shape Pass consumer pitch (walk into any partner gym with one pass).

import Link from 'next/link';
import PageHero from '@/components/PageHero';
import Section from '@/components/Section';

export const metadata = {
  title: 'Shape Pass — Shape',
  description: 'One pass, hundreds of gyms. Train at any Shape-partnered facility nationwide.',
};

export default function ShapePassPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-16">
      <PageHero
        tag="Shape Pass"
        title="One pass."
        gradientWord="Shape access."
        subtitle="The Shape Pass gives you access to hundreds of partner gyms and studios across the country. Walk into any Shape-partnered facility, check in with the app, and train."
      />

      <Section title="Three steps to train in the Shape network" subtitle="How it works">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Step
            n="1"
            title="Get the Shape Pass"
            body="One monthly fee unlocks the entire network. No per-gym memberships, no day passes."
          />
          <Step
            n="2"
            title="Find a gym near you"
            body="The marketplace filters by type, amenities, classes, and distance so you always land somewhere good."
          />
          <Step
            n="3"
            title="Check in and train"
            body="Show your app pass at the door. No contracts, no hassle, no extra fees."
          />
        </div>
      </Section>

      <Section title="Gyms, studios, and training spaces across the country" subtitle="Access everywhere">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            title="Traditional gyms"
            body="Full equipment — free weights, machines, cardio, and group classes."
          />
          <Card
            title="Boutique studios"
            body="Specialty studios that normally require their own separate membership."
          />
          <Card
            title="CrossFit boxes"
            body="Drop into local affiliates, join the WOD, and train with the community."
          />
        </div>
      </Section>

      <Section title="What members are saying">
        <blockquote className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8">
          <p className="text-lg text-neutral-100 leading-relaxed mb-4">
            &ldquo;I travel three weeks a month for work. With Shape Pass I just walk into any city&rsquo;s
            gym and train. It&rsquo;s honestly changed how I plan my trips.&rdquo;
          </p>
          <footer className="text-sm text-neutral-400">David Chen · San Francisco</footer>
        </blockquote>
      </Section>

      <div className="rounded-xl border border-teal-400/30 bg-teal-400/5 p-8 text-center">
        <h2 className="text-2xl font-light tracking-tight mb-2">
          Ready to train in the Shape network?
        </h2>
        <p className="text-sm text-neutral-400 mb-6">
          Get the Shape Pass and unlock hundreds of gyms and studios nationwide.
        </p>
        <Link
          href="/signup"
          className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors inline-block"
        >
          Get started
        </Link>
      </div>
    </main>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="text-xs text-teal-400 font-semibold mb-2">Step {n}</div>
      <h3 className="font-medium mb-2">{title}</h3>
      <p className="text-sm text-neutral-500 leading-relaxed">{body}</p>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <h3 className="font-medium mb-2">{title}</h3>
      <p className="text-sm text-neutral-500 leading-relaxed">{body}</p>
    </div>
  );
}
