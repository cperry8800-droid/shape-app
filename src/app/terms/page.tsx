// Terms of service — generic rewrite of the legacy terms.html. Not legal
// advice; have this reviewed before launch.

import PageHero from '@/components/PageHero';
import LegalSection from '@/components/LegalSection';

export const metadata = {
  title: 'Terms of Service — Shape',
  description: 'The rules and guidelines for using the Shape platform.',
};

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <PageHero
        tag="Legal"
        title="Terms of"
        gradientWord="Service"
        subtitle="The rules and guidelines for using the Shape platform."
      />
      <p className="text-xs text-neutral-500 mb-10">Last updated April 1, 2026.</p>

      <LegalSection n={1} title="Acceptance of terms">
        <p>
          By using Shape, you agree to these terms. They apply to all user types — clients,
          trainers, nutritionists, and gym partners.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Accounts">
        <p>
          You must be at least 16 years old and provide accurate information. Keep your credentials
          secure, and maintain only one account per person.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Subscriptions & payments">
        <p>
          Paid plans auto-renew monthly. You can cancel anytime. Refunds are handled on a
          case-by-case basis.
        </p>
      </LegalSection>

      <LegalSection n={4} title="For trainers & nutritionists">
        <p>
          Providers must maintain accurate credentials, deliver their services professionally, pay
          the platform commission, and comply with applicable laws.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Content & conduct">
        <p>
          No harassment, infringement, scraping, or other abuse. Shape may remove content and
          terminate accounts that violate community standards.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Shape Score & rewards">
        <p>
          Shape Score points have no cash value. We may modify the program at any time.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Intellectual property">
        <p>
          Shape owns the platform and brand. Providers retain ownership of their own content and
          grant Shape a license to distribute it on the platform.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Disclaimers">
        <p>
          Shape is not medical advice and is not a substitute for care from a qualified
          professional. We are not responsible for the individual programs designed by providers.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Limitation of liability">
        <p>
          To the fullest extent allowed by law, Shape&rsquo;s liability is capped at the fees you
          paid in the 12 months preceding a claim.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Termination">
        <p>
          Either you or Shape may terminate your account at any time. Some provisions survive
          termination.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Changes to these terms">
        <p>
          We may update these terms from time to time. When we do, we&rsquo;ll revise the date at
          the top of the page.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Contact">
        <p>
          Questions? Reach us at{' '}
          <a href="mailto:info@theshapecommunity.com" className="text-teal-400 hover:text-teal-300">
            info@theshapecommunity.com
          </a>
          .
        </p>
      </LegalSection>
    </main>
  );
}
