// Marketing page for nutritionists. Same shape as for-trainers; emphasizes
// credential types and the full RD scope so clinical pros feel welcome.

import Link from 'next/link';
import PageHero from '@/components/PageHero';
import Section from '@/components/Section';

export const metadata = {
  title: 'For Nutritionists — Shape',
  description: 'Reach clients already tracking meals and macros. Free to join, no upfront costs.',
};

export default function ForNutritionistsPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-16">
      <PageHero
        tag="For Nutritionists"
        title="Shape how people"
        gradientWord="eat"
        subtitle="Members are already tracking meals, logging macros, and looking for guidance. Shape puts you where they are — ready to listen, ready to commit, and ready to let you shape their nutrition."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
        {[
          { n: '10k+', l: 'Members tracking meals' },
          { n: '$0', l: 'To get started' },
          { n: '85%', l: 'Client retention rate' },
          { n: '50+', l: 'Nutritionists on Shape' },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-2xl font-semibold tracking-tight">{s.n}</div>
            <div className="text-xs text-neutral-400 mt-1">{s.l}</div>
          </div>
        ))}
      </div>

      <Section title="Built for credentialed nutrition professionals" subtitle="Who can join">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Registered Dietitian', sub: 'RD / RDN' },
            { title: 'Certified Nutrition Specialist', sub: 'CNS' },
            { title: 'Certified Nutritionist', sub: 'CN' },
            { title: 'Health & Nutrition Coach', sub: 'Coach' },
          ].map((c) => (
            <div key={c.title} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
              <div className="text-xs text-teal-400 font-semibold mb-2">{c.sub}</div>
              <div className="text-sm text-neutral-100 font-medium">{c.title}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Clients already shaping their habits" subtitle="Built-in demand">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Feature
            title="Embedded in the workflow"
            body="Meal plans and consults live inside the client's dashboard — not in an external spreadsheet."
          />
          <Feature
            title="Warm leads, not cold outreach"
            body="Members on Shape are invested in changing their habits. You meet them ready to commit."
          />
          <Feature
            title="Paired with trainers"
            body="Trainers on Shape routinely refer clients to our nutritionists for the full picture."
          />
        </div>
      </Section>

      <Section title="Beyond meal plans — the full scope of an RD">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <ul className="flex flex-col gap-3 text-sm text-neutral-300">
            <Li>Medical nutrition therapy for chronic conditions — diabetes, kidney disease, GI disorders</Li>
            <Li>Eating disorder support and intuitive eating frameworks</Li>
            <Li>Sports nutrition and performance fueling</Li>
            <Li>Clinical nutrition assessments and nutrition diagnoses</Li>
            <Li>Evidence-based counseling for cancer, heart disease, and post-surgical recovery</Li>
            <Li>Prenatal, pediatric, and geriatric nutrition</Li>
          </ul>
        </div>
      </Section>

      <Section title="Shape your income. We only earn when you do." subtitle="Zero risk">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <ul className="flex flex-col gap-3 text-sm text-neutral-300">
            <Li>No upfront costs or commitments</Li>
            <Li>Billing, invoicing, and payments handled</Li>
            <Li>Client acquisition built into the platform</Li>
            <Li>Your own scheduling and availability controls</Li>
            <Li>Payouts deposited monthly</Li>
          </ul>
        </div>
      </Section>

      <Section title="What nutritionists are saying">
        <blockquote className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8">
          <p className="text-lg text-neutral-100 leading-relaxed mb-4">
            &ldquo;Shape gives me the infrastructure to run a real clinical practice online, with
            warm leads and payment handled. My time goes to clients, not admin.&rdquo;
          </p>
          <footer className="text-sm text-neutral-400">
            Dr. Sarah Mitchell · Sports Nutrition · 680 active clients
          </footer>
        </blockquote>
      </Section>

      <div className="rounded-xl border border-teal-400/30 bg-teal-400/5 p-8 text-center">
        <h2 className="text-2xl font-light tracking-tight mb-2">Ready to see your caseload grow?</h2>
        <p className="text-sm text-neutral-400 mb-6">
          Free to apply. Free to join. You only pay when Shape delivers paying clients.
        </p>
        <Link
          href="/signup"
          className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors inline-block"
        >
          Apply as a nutritionist
        </Link>
      </div>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
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
