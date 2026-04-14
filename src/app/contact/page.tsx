import PageHero from '@/components/PageHero';

export const metadata = {
  title: 'Contact — Shape',
  description: 'Get in touch with the Shape team.',
};

export default function ContactPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <PageHero
        tag="Contact"
        title="Get in"
        gradientWord="touch"
        subtitle="Questions, feedback, or partnership inquiries — we'd love to hear from you."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="font-medium mb-2">General</h2>
          <p className="text-sm text-neutral-400 mb-3">
            Support, account questions, anything else.
          </p>
          <a
            href="mailto:info@theshapecommunity.com"
            className="text-sm text-teal-400 hover:text-teal-300"
          >
            info@theshapecommunity.com
          </a>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="font-medium mb-2">Partnerships</h2>
          <p className="text-sm text-neutral-400 mb-3">
            Gym partnerships, media, and press inquiries.
          </p>
          <a
            href="mailto:partners@theshapecommunity.com"
            className="text-sm text-teal-400 hover:text-teal-300"
          >
            partners@theshapecommunity.com
          </a>
        </div>
      </div>
    </main>
  );
}
