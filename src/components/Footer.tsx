// Shared footer. Keep it simple — links point to not-yet-ported routes
// that will 404 for now; that's fine, they'll fill in over Phase 3.

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-neutral-900 bg-neutral-950 py-12 mt-24">
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="font-semibold mb-3">Shape</div>
          <p className="text-neutral-500 text-xs">Join the community.</p>
        </div>
        <FooterCol title="Marketplace">
          <Link href="/trainers">Trainers</Link>
          <Link href="/nutritionists">Nutritionists</Link>
          <Link href="/gyms">Gyms</Link>
        </FooterCol>
        <FooterCol title="Get started">
          <Link href="/signup">Sign up</Link>
          <Link href="/login">Log in</Link>
        </FooterCol>
        <FooterCol title="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </FooterCol>
      </div>
      <div className="max-w-6xl mx-auto px-6 mt-10 pt-6 border-t border-neutral-900 text-xs text-neutral-600">
        © 2026 Shape. All rights reserved.
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-semibold mb-3 text-neutral-300">{title}</div>
      <div className="flex flex-col gap-2 text-neutral-500 [&_a:hover]:text-neutral-200">
        {children}
      </div>
    </div>
  );
}
