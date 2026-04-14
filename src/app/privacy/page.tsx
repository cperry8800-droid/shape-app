// Privacy policy — generic, plain-language rewrite of the legacy policy.
// Not legal advice; the user should have a lawyer review before launch.

import PageHero from '@/components/PageHero';
import LegalSection from '@/components/LegalSection';

export const metadata = {
  title: 'Privacy Policy — Shape',
  description: 'How Shape collects, uses, and protects your information.',
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <PageHero
        tag="Legal"
        title="Privacy"
        gradientWord="Policy"
        subtitle="How we collect, use, and protect your information."
      />
      <p className="text-xs text-neutral-500 mb-10">Last updated April 1, 2026.</p>

      <LegalSection n={1} title="Information we collect">
        <p>
          We collect information you provide directly — your name, email, password, profile
          details, and payment information — plus usage and device data generated as you interact
          with the platform.
        </p>
      </LegalSection>

      <LegalSection n={2} title="How we use your information">
        <p>
          We use your information to operate the platform, process payments, personalize your
          experience, compute your Shape Score, communicate with you, and keep the service secure.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Information sharing">
        <p>
          We do not sell your personal information. We share it only with the trainers and
          nutritionists you subscribe to, payment processors, essential service vendors, and
          authorities when legally required.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Data security">
        <p>
          Data is encrypted in transit and at rest. You&rsquo;re responsible for keeping your
          account credentials confidential.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Your rights">
        <p>
          You can access, correct, delete, export, or opt out of the processing of your personal
          information by contacting us.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Cookies & tracking">
        <p>
          We use essential cookies to keep you signed in plus analytics cookies to understand how
          the platform is used.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Data retention">
        <p>
          We retain your information while your account is active. If you delete your account, we
          remove your personal data within 30 days.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Children's privacy">
        <p>Shape is not intended for users under the age of 16.</p>
      </LegalSection>

      <LegalSection n={9} title="Changes to this policy">
        <p>
          We may update this policy from time to time. When we do, we&rsquo;ll revise the date at
          the top of the page.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Contact us">
        <p>
          Questions about this policy? Reach us at{' '}
          <a href="mailto:info@theshapecommunity.com" className="text-teal-400 hover:text-teal-300">
            info@theshapecommunity.com
          </a>
          .
        </p>
      </LegalSection>
    </main>
  );
}
